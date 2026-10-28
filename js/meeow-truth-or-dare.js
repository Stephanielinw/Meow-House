(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const USER = 'user';
    const MAX_RESIDENTS = 5;
    const PHASES = new Set(['rolling', 'resolve-ties', 'truth-dare-choice', 'winner-prompt', 'await-user-input', 'resolving', 'continue', 'completed']);
    const copy = value => JSON.parse(JSON.stringify(value));
    const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const d100 = random => {
        const sample = random();
        if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Invalid RNG sample');
        return Math.floor(sample * 100) + 1;
    };
    const eligible = resident => Boolean(resident && resident.id !== USER && resident.accepted && !resident.away);
    // Explicit projection: private prompts, Phone messages, Knowledge and innerVoice never enter this module's context.
    const publicResident = resident => ({
        id: String(resident.id), name: text(resident.name, 60), avatar: text(resident.avatar, 1000),
        personality: text(resident.personality, 200), sourceWork: text(resident.sourceWork, 100),
        sourceRole: text(resident.sourceRole, 150), form: resident.form === 'HUMAN' ? 'HUMAN' : 'CAT',
        closeness: Number(resident.affinity) >= 80 ? '亲近' : Number(resident.affinity) >= 50 ? '熟悉' : '保持礼貌边界'
    });
    const validSession = session => Boolean(session && typeof session.sessionId === 'string' && Array.isArray(session.participants) &&
        session.participants.length >= 2 && session.participants.length <= MAX_RESIDENTS + 1 &&
        session.participants.every(p => p && typeof p.id === 'string' && typeof p.name === 'string') &&
        session.participants.filter(p => p.id === USER).length === 1 && new Set(session.participants.map(p => p.id)).size === session.participants.length &&
        Array.isArray(session.participantIds) && session.participantIds.length === session.participants.length &&
        session.participants.every(p => session.participantIds.includes(p.id)) &&
        Array.isArray(session.events) && session.events.every(e => e && typeof e.id === 'string' && typeof e.content === 'string' &&
            ['system', 'roll', 'participant-choice', 'resident', 'user', 'narration'].includes(e.type)) &&
        Array.isArray(session.rounds) && session.round && PHASES.has(session.round.phase) &&
        typeof session.round.roundId === 'string' && Array.isArray(session.round.rollSets) && Array.isArray(session.round.tieHistory) &&
        session.round.rollSets.every(set => set && typeof set.id === 'string' && Array.isArray(set.rolls) &&
            set.rolls.every(r => r && session.participantIds.includes(r.actorId) && Number.isInteger(r.value) && r.value >= 1 && r.value <= 100)) &&
        Array.isArray(session.round.maxPool) && Array.isArray(session.round.minPool));
    const normalize = raw => ({ version: 1, activeSession: validSession(raw?.activeSession) ? copy(raw.activeSession) : null,
        recentSessions: (Array.isArray(raw?.recentSessions) ? raw.recentSessions : []).filter(validSession).slice(0, 3).map(copy) });
    const event = (session, id, type, actorId, content, extra = {}, at) => {
        if (session.events.some(e => e.id === id)) return;
        session.events.push({ id, at, roundId: session.round.roundId, type, actorId, content, ...extra });
    };
    const round = (sessionId, number) => ({ roundId: `${sessionId}:round:${number}`, number, phase: 'rolling', rolls: [], rollSets: [], tieHistory: [],
        maxPool: [], minPool: [], allTie: false, winnerId: '', loserId: '', choice: '', promptOrChallenge: '', userInput: '', pendingAiOperation: null, generatedResolution: null });
    const extrema = rolls => {
        const max = Math.max(...rolls.map(r => r.value)), min = Math.min(...rolls.map(r => r.value));
        return { maxPool: rolls.filter(r => r.value === max).map(r => r.actorId), minPool: rolls.filter(r => r.value === min).map(r => r.actorId), allTie: max === min };
    };
    const applyRollSet = (session, random, at) => {
        const r = session.round;
        if (!['rolling', 'resolve-ties'].includes(r.phase)) throw new Error('不是掷骰阶段');
        const kind = !r.rollSets.length ? 'initial' : r.allTie ? 'all-tie' : !r.winnerId ? 'max-tie' : 'min-tie';
        const ids = ['initial', 'all-tie'].includes(kind) ? session.participants.map(p => p.id) : kind === 'max-tie' ? r.maxPool : r.minPool;
        const set = { id: `${r.roundId}:roll:${r.rollSets.length}`, kind, at, rolls: ids.map(actorId => ({ actorId, value: d100(random) })) };
        r.rollSets.push(set);
        if (kind === 'initial') r.rolls = copy(set.rolls); else r.tieHistory.push(copy(set));
        const bounds = extrema(set.rolls);
        if (kind === 'initial' || kind === 'all-tie') {
            Object.assign(r, bounds);
            r.winnerId = bounds.maxPool.length === 1 ? bounds.maxPool[0] : '';
            r.loserId = bounds.minPool.length === 1 ? bounds.minPool[0] : '';
        } else if (kind === 'max-tie') {
            r.maxPool = bounds.maxPool;
            if (r.maxPool.length === 1) r.winnerId = r.maxPool[0];
        } else {
            r.minPool = bounds.minPool;
            if (r.minPool.length === 1) r.loserId = r.minPool[0];
        }
        for (const roll of set.rolls) event(session, `${set.id}:${roll.actorId}`, 'roll', roll.actorId, `${session.participants.find(p => p.id === roll.actorId).name} 掷出了 ${roll.value}${kind === 'initial' ? '' : '（平局重掷）'}`, { roll: roll.value }, at);
        if (!r.winnerId || !r.loserId) { r.phase = 'resolve-ties'; return set; }
        if (r.winnerId === r.loserId) throw new Error('Winner and loser must differ');
        event(session, `${r.roundId}:result`, 'system', '', `本轮胜者：${session.participants.find(p => p.id === r.winnerId).name}；本轮败者：${session.participants.find(p => p.id === r.loserId).name}`, {}, at);
        if (r.loserId === USER) r.phase = 'truth-dare-choice';
        else choose(session, random() < 0.5 ? 'truth' : 'dare', at);
        return set;
    };
    const choose = (session, choice, at) => {
        if (!['truth', 'dare'].includes(choice)) throw new Error('Invalid choice');
        const r = session.round;
        r.choice = choice;
        event(session, `${r.roundId}:choice`, 'participant-choice', r.loserId, `${session.participants.find(p => p.id === r.loserId).name} 选择了${choice === 'truth' ? '真心话' : '大冒险'}。`, {}, at);
        r.phase = r.loserId === USER ? 'winner-prompt' : r.winnerId === USER ? 'await-user-input' : 'resolving';
    };
    const taskKind = r => r.phase === 'winner-prompt' ? 'prompt' : r.phase === 'resolving' ? (r.loserId === USER ? 'reactions' : 'resolution') : '';
    const buildPrompt = (session, kind) => {
        const r = session.round;
        const roster = session.participants.filter(p => p.id !== USER).map(({ avatar, ...p }) => p);
        return `[MEEOW TRUTH OR DARE — ONLINE PHONE ROOM]
Selected roster: ${JSON.stringify(roster)}
USER display name: ${session.participants.find(p => p.id === USER).name}
Frozen round: ${JSON.stringify({ roundId: r.roundId, winnerId: r.winnerId, loserId: r.loserId, choice: r.choice, promptOrChallenge: r.promptOrChallenge, userInput: r.userInput })}
Shared room only, last 8 events: ${JSON.stringify(session.events.slice(-8).map(e => ({ actorId: e.actorId, type: e.type, content: text(e.content, 320) })))}
Write Simplified Chinese in each named character's distinct canon voice. Only selected participants can act or react. Their private histories, innerVoice, Knowledge and secrets are unavailable. A Truth permits established public canon and harmless subjective preferences, never invented major biography or secret disclosure. You may decline a private question in character. Never supply or modify rolls, choice, winner/loser, affinity, relationships, Knowledge, Status, form, inventory, location or Life Threads. This output is game-session presentation, never world canon.
This is remote Phone text across separate Halls. Text messaging is allowed in either CAT or HUMAN form. Dares cannot teleport, enter another Hall, touch a remote person, cause injury or inventory/permanent effects. Convert impossible physical tasks into a playful remote equivalent. Any physical performance must be attributed to a selected resident. CAT physical/camera performance: feline sounds and actions only, NO spoken human language. HUMAN may speak. Never authorize a form reveal. Do not include unattributed narration or non-selected characters.
Task=${kind}. ${kind === 'prompt' ? 'Winner asks exactly one short question/challenge. No answers or reactions yet.' : kind === 'reactions' ? 'USER has answered/completed. Return a single batch of 1–5 brief selected-resident text reactions; do not invent USER actions.' : 'If winner is a resident, supply their question/challenge too. Resolve the loser answer/performance and optional short reactions in one batch. Truth answer 60–180 Chinese characters; Dare performance about 200–300 Chinese characters (120–360 acceptable), physical remote narration attributed only to the loser; others react by text.'}
Return strict JSON with ONLY these fields:
${kind === 'prompt' ? '{"prompt":"question/challenge"}' : kind === 'reactions' ? '{"reactions":[{"residentId":"selected-id","text":"text message"}]}' : '{"prompt":"winner question (omit for USER winner)","answer":{"residentId":"loser-id","mode":"text or physical","text":"answer/performance"},"reactions":[{"residentId":"selected-id","text":"text message"}]}'}
No sidecars, actions, metadata, private thoughts or world mutations. All chat messages are text communication; physical mode is camera-style narration, not spoken CAT text.`;
    };
    const validateOutput = (raw, session, kind) => {
        const data = typeof raw === 'string' ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) : raw;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('回复格式无效');
        const allowed = kind === 'prompt' ? ['prompt'] : kind === 'reactions' ? ['reactions'] : ['prompt', 'answer', 'reactions'];
        if (Object.keys(data).some(k => !allowed.includes(k))) throw new Error('回复含未授权字段');
        const r = session.round, residents = session.participants.filter(p => p.id !== USER);
        const string = (v, min, max) => { if (typeof v !== 'string' || v.trim().length < min || v.length > max || !/\p{Script=Han}/u.test(v)) throw new Error('回复须为有效长度的中文内容'); return v.trim(); };
        const result = {};
        if (kind === 'prompt' || (kind === 'resolution' && r.winnerId !== USER)) result.prompt = string(data.prompt, 2, 300);
        if (kind === 'resolution') {
            const answer = data.answer, loser = residents.find(p => p.id === r.loserId);
            if (!loser || answer?.residentId !== loser.id || !['text', 'physical'].includes(answer.mode) || Object.keys(answer).some(k => !['residentId', 'mode', 'text'].includes(k))) throw new Error('败者或表现类型无效');
            const value = string(answer.text, r.choice === 'dare' ? 120 : 2, r.choice === 'dare' ? 400 : 500);
            if (answer.mode === 'physical' && loser.form === 'CAT' && (/[“"「『][^”"」』]*[\p{L}][^”"」』]*[”"」』]/u.test(value.replace(/[喵呜咪呼噜嘶]+/g, '')) || /(?:说|喊|答|低语|开口|念)[道着了]?\s*[:：]/.test(value))) throw new Error('猫形态镜头表现不能说人话');
            result.answer = { residentId: loser.id, mode: answer.mode, text: value };
        }
        if (kind !== 'prompt') {
            if (!Array.isArray(data.reactions) || data.reactions.length > MAX_RESIDENTS || (kind === 'reactions' && !data.reactions.length)) throw new Error('回应列表无效');
            const ids = new Set();
            result.reactions = data.reactions.map(item => {
                if (!residents.some(p => p.id === item?.residentId) || ids.has(item.residentId) || Object.keys(item).some(k => !['residentId', 'text'].includes(k))) throw new Error('回应者不在房间或重复');
                ids.add(item.residentId); return { residentId: item.residentId, text: string(item.text, 1, 240) };
            });
        }
        return result;
    };
    const createController = ({ getData, setData, persist, request, random = Math.random, now = () => new Date().toISOString(), makeId = () => `party:${Date.now()}:${Math.random().toString(36).slice(2)}` }) => {
        const inFlight = new Map(), unsavedResults = new Map();
        const transaction = mutate => {
            const before = getData();
            const draft = normalize(before);
            const result = mutate(draft);
            setData(draft);
            let saved = false;
            try { saved = persist() === true; } catch (_) { /* failure rolls back only this store */ }
            if (!saved) { setData(before); throw new Error('保存失败，请释放本地存储空间后重试。'); }
            return result;
        };
        const current = () => getData()?.activeSession;
        const ensure = () => { if (!validSession(current())) throw new Error('没有可恢复的游戏'); return current(); };
        const start = (ids, roster, userName) => transaction(data => {
            if (data.activeSession) throw new Error('请先继续或结束当前房间');
            const unique = [...new Set(ids.map(String))];
            if (!unique.length || unique.length > MAX_RESIDENTS || unique.some(id => !roster.some(p => String(p.id) === id && eligible(p)))) throw new Error('请选择 1–5 位非离馆的喵信好友');
            const sessionId = makeId();
            data.activeSession = { sessionId, participantIds: [USER, ...unique], participants: [{ id: USER, name: text(userName, 60) || '馆长', avatar: '' }, ...unique.map(id => publicResident(roster.find(p => String(p.id) === id)))],
                startedAt: now(), endedAt: '', roundNumber: 1, round: round(sessionId, 1), rounds: [], events: [], continuationState: '' };
            event(data.activeSession, `${sessionId}:opening`, 'system', '', '线上派对开始。跨馆连线，游戏内容仅保存在本房间，不改变馆舍世界。', {}, now());
        });
        const roll = () => transaction(data => { ensure(); return applyRollSet(data.activeSession, random, now()); });
        const chooseUser = choice => transaction(data => { const s = data.activeSession; if (s?.round.phase !== 'truth-dare-choice' || s.round.loserId !== USER) throw new Error('当前不能选择'); choose(s, choice, now()); });
        const submit = input => transaction(data => {
            const s = data.activeSession, r = s?.round;
            if (r?.phase !== 'await-user-input' || !text(input, 800)) throw new Error('请先填写本轮内容');
            r.userInput = text(input, 800);
            if (r.winnerId === USER) r.promptOrChallenge = r.userInput;
            event(s, `${r.roundId}:user-input`, 'user', USER, r.userInput, {}, now()); r.phase = 'resolving';
        });
        const presentResult = () => transaction(data => {
            const s = data.activeSession, r = s?.round, op = r?.pendingAiOperation;
            if (!op?.result || op.status === 'complete') return;
            const output = validateOutput(op.result, s, op.kind);
            if (output.prompt) { r.promptOrChallenge = output.prompt; event(s, `${op.id}:prompt`, 'resident', r.winnerId, output.prompt, {}, now()); }
            if (output.answer) event(s, `${op.id}:answer`, output.answer.mode === 'physical' ? 'narration' : 'resident', output.answer.residentId, output.answer.text, {}, now());
            (output.reactions || []).forEach(item => event(s, `${op.id}:reaction:${item.residentId}`, 'resident', item.residentId, item.text, {}, now()));
            op.status = 'complete'; op.presentedAt = now(); r.generatedResolution = output;
            r.phase = op.kind === 'prompt' ? 'await-user-input' : 'continue';
        });
        const runAI = ({ retry = false } = {}) => {
            const s = ensure(), r = s.round, kind = taskKind(r);
            if (!kind) return Promise.resolve(false);
            const key = `${r.roundId}:ai:${kind}`;
            if (inFlight.has(key)) return inFlight.get(key);
            const task = Promise.resolve().then(async () => {
                let active = ensure();
                if (active.round.roundId !== r.roundId) return false;
                let op = active.round.pendingAiOperation;
                if (op?.id === key && op.result) { presentResult(); return true; }
                if (op?.id === key && op.retryAt && Date.parse(op.retryAt) > Date.parse(now()) && !retry) return false;
                if (op?.id !== key) transaction(data => { data.activeSession.round.pendingAiOperation = { id: key, kind, prompt: buildPrompt(data.activeSession, kind), status: 'pending', attempts: 0, result: null, retryAt: '', error: '' }; });
                transaction(data => { const o = data.activeSession.round.pendingAiOperation; o.attempts += 1; o.status = 'pending'; o.error = ''; });
                active = copy(ensure()); op = active.round.pendingAiOperation;
                try {
                    const output = unsavedResults.has(key) ? unsavedResults.get(key) : validateOutput(await request(op.prompt, { kind, operationId: key }), active, kind);
                    // Retain provider success in RAM on disk failure: explicit save retry must not spend another request.
                    unsavedResults.set(key, output);
                    if (current()?.round.roundId !== r.roundId || current()?.sessionId !== s.sessionId) { unsavedResults.delete(key); return false; }
                    transaction(data => { const o = data.activeSession.round.pendingAiOperation; o.result = output; o.status = 'ready'; o.generatedAt = now(); o.error = ''; o.retryAt = ''; });
                    unsavedResults.delete(key);
                    presentResult(); return true;
                } catch (error) {
                    if (current()?.round.roundId === r.roundId) transaction(data => { const o = data.activeSession.round.pendingAiOperation; o.status = o.result ? 'ready' : 'retryable'; o.error = '本轮内容尚未完成，可重试；骰子结果不会改变。'; o.retryAt = new Date(Date.parse(now()) + 60000).toISOString(); });
                    throw error;
                }
            }).finally(() => inFlight.delete(key));
            inFlight.set(key, task); return task;
        };
        const resume = () => {
            const op = current()?.round.pendingAiOperation;
            // Opening/reloading never starts a new provider request. The local button deliberately resumes pending work.
            if (op?.result && op.status !== 'complete') presentResult();
        };
        const next = roster => transaction(data => {
            const s = data.activeSession;
            if (s?.round.phase !== 'continue') throw new Error('本轮尚未结束');
            if (s.participantIds.filter(id => id !== USER).some(id => !roster.some(p => String(p.id) === id && eligible(p)))) throw new Error('有成员当前无法参加新一轮，请结束房间后重新选人。');
            if (s.roundNumber >= 50) throw new Error('本次派对已满 50 轮，请结束后开启新房间。');
            s.rounds.push(copy(s.round)); s.roundNumber += 1; s.round = round(s.sessionId, s.roundNumber);
            s.participants = s.participants.map(p => p.id === USER ? p : publicResident(roster.find(item => String(item.id) === p.id)));
            s.continuationState = 'continue';
        });
        const end = () => transaction(data => {
            const s = data.activeSession;
            if (!s) return;
            if ([...inFlight.keys()].some(key => key.startsWith(`${s.round.roundId}:`))) throw new Error('本轮回复仍在接收，请稍候再结束。');
            s.endedAt = now(); s.continuationState = 'ended'; s.round.phase = 'completed';
            data.recentSessions.unshift(s); data.recentSessions = data.recentSessions.slice(0, 3); data.activeSession = null;
        });
        return { start, roll, chooseUser, submit, runAI, resume, next, end, inFlight };
    };
    Meeow.truthOrDare = { USER, MAX_RESIDENTS, normalize, eligible, publicResident, d100, extrema, applyRollSet, buildPrompt, validateOutput, createController };
})(window);
