(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const snapshot = value => freeze(JSON.parse(JSON.stringify(value)));
    const axis = (axes, key) => Number.isInteger(axes?.[key]) && Math.abs(axes[key]) <= 2 ? axes[key] : 0;
    const thoughtChance = entry => Math.max(.2, Math.min(.4, .3 + axis(entry.axes, 'emotionalExpression') * .025 +
        (entry.family === 'observe' || entry.family.startsWith('item-') ? axis(entry.axes, 'inquiryDrive') * .025 : 0) +
        (entry.plannedDuration >= 120000 ? .05 : 0)));
    const userChance = entry => .12 + axis(entry.axes, 'socialEngagement') * .02 + axis(entry.axes, 'initiative') * .02;
    const priority = { socialMoment: 0, userInteractionMoment: 1, thoughtMoment: 2 };
    const stationary = new Set(['observe', 'rest', 'sleep', 'sit-idle', 'groom']);
    const evaluated = new Map(), social = new Map(), current = new Map(), cooldown = new Map(), cache = new Map();
    let deps = {}, timer = null, published = [], lastInput = '', evaluations = 0, requests = 0;
    const now = () => deps.now ? deps.now() : Date.now();
    const boundedSet = (map, key, value) => {
        map.set(key, value); while (map.size > 128) map.delete(map.keys().next().value); return value;
    };
    const notify = () => deps.onChange?.(published.slice());
    const keyFor = entry => `${entry.residentId}|${entry.episodeId}`;
    const consumed = moment => deps.hasHistoryRecord?.(moment.id) === true;
    const live = moment => !consumed(moment) && (moment.kind === 'socialMoment'
        ? social.get(moment.id) === moment && moment.expiresAt > now() && deps.isSocialCurrent?.(moment) === true
        : current.get(moment.residentIds[0]) === moment.episodeId && deps.isIndividualCurrent?.(moment) === true);
    const reselect = () => {
        if (timer !== null) { global.clearTimeout(timer); timer = null; }
        for (const [id, moment] of social) if (!live(moment)) social.delete(id);
        const candidates = [...social.values(), ...[...evaluated.values()].filter(Boolean)].filter(live)
            .sort((a, b) => priority[a.kind] - priority[b.kind] || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        const occupied = new Set(), next = [];
        for (const moment of candidates) {
            if (next.length === 3) break;
            if (moment.residentIds.some(id => occupied.has(id))) continue;
            if (moment.kind !== 'socialMoment' && !moment.publishedAt &&
                now() < (cooldown.get(moment.residentIds[0] + ':' + moment.kind) || 0)) continue;
            if (!moment.publishedAt) {
                moment.publishedAt = now() || 1;
                if (moment.kind !== 'socialMoment') boundedSet(cooldown, moment.residentIds[0] + ':' + moment.kind,
                    now() + (moment.kind === 'thoughtMoment' ? 120000 : 300000));
            }
            next.push(moment); moment.residentIds.forEach(id => occupied.add(id));
        }
        const changed = published.map(m => m.id).join('|') !== next.map(m => m.id).join('|');
        published = next;
        if (social.size) timer = global.setTimeout(() => { timer = null; reselect(); },
            Math.max(1, Math.min(...[...social.values()].map(m => m.expiresAt)) - now()));
        if (changed) notify();
    };
    const reconcile = entries => {
        const eligible = entries.filter(e => e.eligible && e.episodeId && !e.episodeId.startsWith('baseline:') &&
            (stationary.has(e.family) || e.family.startsWith('item-') || e.furniture));
        const signature = eligible.map(e => keyFor(e)).sort().join('|');
        if (signature === lastInput) {
            if (published.some(moment => !live(moment)) || [...social.values()].some(moment => !live(moment))) reselect();
            return;
        }
        lastInput = signature; current.clear(); eligible.forEach(e => current.set(e.residentId, e.episodeId));
        for (const entry of eligible) {
            const key = keyFor(entry);
            if (evaluated.has(key)) continue;
            evaluations++;
            const user = entry.userEligible && hash(key + ':user') / 4294967296 < userChance(entry);
            const thought = hash(key + ':thought') / 4294967296 < thoughtChance(entry);
            const kind = user ? 'userInteractionMoment' : thought ? 'thoughtMoment' : null;
            boundedSet(evaluated, key, kind ? { id: `moment:${kind}:${key}`, kind, residentIds: [entry.residentId],
                episodeId: entry.episodeId, hallId: entry.hallId, roomId: entry.roomId,
                createdAt: now(), publishedAt: 0, facts: snapshot(entry.facts), fallback: snapshot(entry.fallback) } : null);
        }
        reselect();
    };
    const acceptSocial = event => {
        if (!event?.committed || !event.sceneId || !event.scene || event.residentIds?.length !== 2 ||
            new Set(event.residentIds).size !== 2) return false;
        const id = `moment:social:${event.hallId}:${event.sceneId}`;
        if (deps.hasHistoryRecord?.(id) || evaluated.has(id) || social.has(id) || cache.has(id)) return false;
        boundedSet(evaluated, id, null);
        for (const [oldId, old] of social) if (old.residentIds.some(member => event.residentIds.includes(member))) social.delete(oldId);
        boundedSet(social, id, { id, kind: 'socialMoment', residentIds: [...event.residentIds], sceneId: event.sceneId,
            hallId: event.hallId, roomId: event.roomId, createdAt: now(), expiresAt: now() + 60000, publishedAt: 0,
            facts: snapshot(event.facts), fallback: snapshot(event.fallback) });
        lastInput = ''; reselect(); return true;
    };
    const read = () => published.filter(live);
    const currentMoment = id => published.find(moment => moment.id === id && live(moment));
    // Read already-resolved canonical presentation only. This never positions a resident.
    const anchorsFor = (moment, entities, spacingInCatWidths) => {
        const members = moment.residentIds.map(id => entities.find(entity => entity.kind === 'resident' && entity.id === id));
        if (members.some(entity => !entity || !(entity.width > 0) || ![entity.footX, entity.footY ?? entity.depthY, entity.width].every(Number.isFinite))) return [];
        const proximityWidths = members.map(entity => entity.socialProximityWidth ?? entity.width);
        if (moment.kind === 'socialMoment' && (members.length !== 2 || !(spacingInCatWidths > 0) ||
            proximityWidths.some(width => !(width > 0) || !Number.isFinite(width)) ||
            Math.hypot(members[0].footX - members[1].footX, (members[0].footY ?? members[0].depthY) - (members[1].footY ?? members[1].depthY)) >
                Math.max(...proximityWidths) * spacingInCatWidths + 1e-6)) return [];
        return members.map((entity, index) => ({moment, residentId: moment.residentIds[index], entity}));
    };
    const consume = (id, record) => {
        if (!record || record.momentId !== id || deps.hasHistoryRecord?.(id) !== true) return false;
        reselect(); return true;
    };
    const isCurrent = moment => live(moment);
    const parse = content => typeof content === 'string' ? Meeow.core.parseAIJSON(content) : content;
    const validate = (moment, content) => {
        let value;
        try { value = parse(content); } catch (_) { return 'Moment response must be JSON.'; }
        if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Moment response must be an object.';
        const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
        let fields;
        if (moment.kind === 'thoughtMoment') {
            if (Object.keys(value).some(k => !['innerThought', 'description'].includes(k)) || !text(value.innerThought, 360) ||
                (value.description !== undefined && value.description !== '' && !text(value.description, 180))) return 'Invalid thought fields.';
            fields = [value.innerThought, value.description || ''];
        } else {
            if (Object.keys(value).some(k => !['summary', 'residents', 'dialogue'].includes(k)) || !text(value.summary, 240) ||
                !Array.isArray(value.residents) || value.residents.length !== 2 ||
                new Set(value.residents.map(r => r?.residentId)).size !== 2 ||
                value.residents.some(r => Object.keys(r || {}).some(k => !['residentId', 'innerThought'].includes(k)) ||
                    !moment.residentIds.includes(r?.residentId) || !text(r.innerThought, 360))) return 'Invalid exact-pair narrative.';
            if (value.dialogue !== undefined && (!Array.isArray(value.dialogue) || value.dialogue.length > 6 ||
                value.dialogue.some(r => Object.keys(r || {}).some(k => !['residentId', 'text'].includes(k)) ||
                    !moment.residentIds.includes(r?.residentId) || !text(r.text, 100)))) return 'Invalid dialogue speaker.';
            fields = [value.summary, ...value.residents.map(r => r.innerThought), ...(value.dialogue || []).map(r => r.text)];
        }
        // Reject obvious new-world assertions; semantic grounding remains a writing boundary, not world authority.
        if (fields.some(s => /(?:刚才|之前|昨天).{0,16}(?:藏|偷|打|送|答应)|(?:滚到|撞到|弹到)|(?:关系|信任|亲密度).{0,8}[+-]\d|(?:acquireClaim|mapPoint|relationshipDeltas|执行指令)/i.test(s)))
            return 'Narrative asserts an unsupported event or world command.';
        return true;
    };
    const system = `你是 Meeow House 的原创角色叙事作者。世界事实先于叙事：仅依据冻结的已接受事件写简体中文。角色声音来自项目资料和已验证人格，不模仿任何游戏、漫画、影视对白、作者风格或口头禅。不解释人格轴、系统、权限或调度，不写自我管理建议。不新增动作、声音、光照、触感、梦境、物品运动结果、过去事件、伙伴反应或关系变化，不披露未提供的私密记忆。社交可写短猫猫对话作为玩家可读的叙事意译，不是实际人类语言或声音事实；安静陪伴可以没有对话。输出仅含指定 JSON 字段，不含世界命令。`;
    const open = id => {
        const moment = currentMoment(id);
        if (!moment) return Promise.resolve(null);
        if (moment.kind === 'userInteractionMoment') return Promise.resolve(snapshot(moment.fallback));
        if (cache.has(id)) return cache.get(id);
        const isCurrent = () => live(moment);
        const promise = Promise.resolve().then(async () => {
            try {
                if (!isCurrent()) return null;
                const context = deps.buildContext(moment);
                const shape = moment.kind === 'thoughtMoment' ? '{"innerThought":"…","description":"可选"}' :
                    '{"summary":"…","residents":[{"residentId":"exact ID","innerThought":"…"}],"dialogue":[{"residentId":"exact ID","text":"可选短对话"}]}';
                const world = moment.facts.world;
                const narrativeFacts = {activity: world.activity, room: world.room, posture: world.posture,
                    furnitureUse: Boolean(world.furniture), item: world.item, participantIds: moment.residentIds,
                    summary: world.summary || moment.fallback.description,
                    relationships: world.relationships,
                    consequences: world.consequences?.map(result => ({fromId: result.fromId, toId: result.toId, changes: result.changes}))};
                const prompt = `${context}\n[已接受事件 · 唯一事实依据]\n${JSON.stringify(narrativeFacts)}\n[输出]\n${shape}\n必须使用这些居民 ID：${moment.residentIds.join(', ')}。不添加事实；对话只作意译，不能写成实际发言记录。`;
                requests++;
                const content = await deps.generate(prompt, system, 1600, null, { generationEpisode: id,
                    generationSignature: id, isCurrentGeneration: isCurrent, validateResponse: c => validate(moment, c),
                    priority: 'foreground', uiMode: 'background', origin: 'user-action', originSurface: 'character-moment', maxAttempts: 1,
                    label: 'CHARACTER MOMENT', cancelBatchOnAbort: false });
                if (!isCurrent()) return null;
                if (validate(moment, content) !== true) throw new Error('Invalid narrative.');
                return snapshot({ ...parse(content), source: 'narrative' });
            } catch (_) {
                return isCurrent() && validate(moment, moment.fallback) === true
                    ? snapshot({ ...moment.fallback, source: 'local' }) : null;
            }
        });
        return boundedSet(cache, id, promise);
    };
    const clear = () => {
        if (timer !== null) global.clearTimeout(timer);
        timer = null; evaluated.clear(); social.clear(); current.clear(); cooldown.clear(); cache.clear();
        published = []; lastInput = ''; notify();
    };
    Meeow.characterMoments = Object.freeze({ configure: options => { clear(); deps = options || {}; },
        reconcile, acceptSocial, read, open, clear, anchorsFor, consume, isCurrent, thoughtChance, userChance, validate,
        diagnostics: () => ({ evaluations, requests, published: published.length, cache: cache.size,
            evaluated: evaluated.size, expiryTimers: Number(timer !== null) }) });
}(window));
