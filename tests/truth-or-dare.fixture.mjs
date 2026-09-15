import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const sandbox = { Math, Date, JSON, Promise, Set, Map, console, setTimeout, matchMedia: () => ({ matches: false }) };
sandbox.window = sandbox;
vm.runInNewContext(read('js/meeow-truth-or-dare.js'), sandbox);
vm.runInNewContext(read('js/meeow-dice.js'), sandbox);
const party = sandbox.Meeow.truthOrDare;
const dice = sandbox.Meeow.dice;
const clone = value => JSON.parse(JSON.stringify(value));
const residents = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
    id, name: `角色${id}`, accepted: true, away: false, form: index ? 'HUMAN' : 'CAT',
    hallId: index ? 'greek' : 'ithaca', affinity: 60, personality: '谨慎，偶尔幽默',
    sourceWork: '原作', sourceRole: '公开身份',
    prompt: 'PRIVATE PROMPT', innerVoice: 'SECRET VOICE', phoneHistory: 'PRIVATE PHONE', knowledgeLedger: 'HIDDEN FACT', lifeThreads: 'PRIVATE THREAD'
}));
let checks = 0;
const test = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const harness = ({ data, request, randoms = [], persist = () => true } = {}) => {
    let memory = data ? clone(data) : party.normalize(null), durable = clone(memory), requests = 0, at = '2026-09-14T20:00:00.000Z';
    const saves = [];
    const create = () => party.createController({
        getData: () => memory, setData: value => { memory = value; },
        persist: () => { saves.push(clone(memory)); if (!persist(memory)) return false; durable = clone(memory); return true; },
        random: () => { assert.ok(randoms.length, 'unexpected random draw'); return (randoms.shift() - 1) / 100; },
        now: () => at, makeId: () => 'session:test',
        request: async (prompt, options) => { requests++; return request ? request(prompt, options) : (() => { throw new Error('Unexpected AI'); })(); }
    });
    let controller = create();
    return { get c() { return controller; }, get s() { return memory.activeSession; }, get data() { return memory; }, get durable() { return durable; },
        get requests() { return requests; }, saves, setTime: value => { at = value; }, reload: () => { memory = clone(durable); controller = create(); },
        start: (ids = ['a', 'b']) => controller.start(ids, residents, '馆长'), randoms };
};
const answer = (loser, { prompt = false, physical = false } = {}) => ({
    ...(prompt ? { prompt: '说一件让你开心的小事？' } : {}),
    answer: { residentId: loser, mode: physical ? 'physical' : 'text', text: '我觉得和大家安静聊会儿天就很好。' }, reactions: [{ residentId: 'b', text: '这倒是个好答案。' }]
});

await test('eligible accepted friends, USER inclusion, Away rejection, cross-Hall roster, privacy projection', () => {
    const h = harness();
    assert.throws(() => h.start([]));
    assert.throws(() => h.start(['unknown']));
    assert.throws(() => h.c.start(['a'], [{ ...residents[0], away: true }], '我'));
    assert.throws(() => h.c.start(['a'], [{ ...residents[0], accepted: false }], '我'));
    h.start();
    assert.deepEqual(clone(h.s.participantIds), ['user', 'a', 'b']);
    assert.equal(h.s.participants.length, 3);
    assert.doesNotMatch(JSON.stringify(h.s), /PRIVATE|SECRET|HIDDEN|knowledgeLedger|innerVoice/);
    assert.equal(h.requests, 0);
});
await test('range and original unique maximum/minimum are program-owned and durable', () => {
    assert.equal(party.d100(() => 0), 1); assert.equal(party.d100(() => .99999), 100);
    assert.throws(() => party.d100(() => 1));
    const h = harness({ randoms: [40, 100, 1, 1] }); h.start();
    const set = h.c.roll();
    assert.equal(h.durable.activeSession.round.rollSets[0].rolls[1].value, 100);
    assert.equal(h.s.round.winnerId, 'a'); assert.equal(h.s.round.loserId, 'b');
    assert.equal(h.s.round.phase, 'resolving'); assert.equal(h.requests, 0);
    h.reload(); assert.deepEqual(clone(h.s.round.rollSets[0]), clone(set));
});
await test('independent max and min pools: only tied participants reroll; unaffected original rolls persist', () => {
    const h = harness({ randoms: [80, 80, 10, 10, 50, 90, 90, 3, 8, 70, 20, 1] }); h.start(['a', 'b', 'c', 'd']);
    h.c.roll(); const initial = clone(h.s.round.rolls);
    let set = h.c.roll(); assert.deepEqual(clone(set.rolls.map(r => r.actorId)), ['user', 'a']);
    h.reload(); assert.equal(h.s.round.tieHistory.length, 1);
    set = h.c.roll(); assert.deepEqual(clone(set.rolls.map(r => r.actorId)), ['user', 'a']);
    assert.equal(h.s.round.winnerId, 'a');
    set = h.c.roll(); assert.deepEqual(clone(set.rolls.map(r => r.actorId)), ['b', 'c']);
    assert.equal(h.s.round.loserId, 'c'); assert.notEqual(h.s.round.winnerId, h.s.round.loserId);
    assert.deepEqual(clone(h.s.round.rolls), initial); assert.equal(h.requests, 0);
});
await test('two-player all tie rerolls both repeatedly until actual ordering differs', () => {
    const h = harness({ randoms: [42, 42, 5, 5, 9, 3, 1] }); h.start(['a']);
    h.c.roll(); h.reload();
    let set = h.c.roll(); assert.deepEqual(clone(set.rolls.map(r => r.actorId)), ['user', 'a']);
    assert.equal(h.s.round.winnerId, ''); h.reload();
    set = h.c.roll(); assert.deepEqual(clone(set.rolls.map(r => r.actorId)), ['user', 'a']);
    assert.equal(h.s.round.winnerId, 'user'); assert.equal(h.s.round.loserId, 'a');
});
await test('general all tie rerolls entire group, then reduces only the remaining extreme tie', () => {
    const h = harness({ randoms: [7, 7, 7, 20, 90, 90, 30, 40] }); h.start();
    h.c.roll(); const set = h.c.roll(); assert.equal(set.rolls.length, 3);
    assert.equal(h.s.round.loserId, 'user'); h.reload();
    assert.deepEqual(clone(h.c.roll().rolls.map(r => r.actorId)), ['a', 'b']);
    assert.equal(h.s.round.winnerId, 'b'); assert.equal(h.s.round.phase, 'truth-dare-choice');
});
await test('roll persistence failure prevents presentation-ready return or authority advance', () => {
    let saving = true; const h = harness({ randoms: [1, 50], persist: () => saving }); h.start(['a']);
    saving = false; assert.throws(() => h.c.roll(), /保存失败/);
    assert.equal(h.s.round.rollSets.length, 0); assert.equal(h.durable.activeSession.round.phase, 'rolling');
});
await test('AI-vs-AI one request; duplicate callers coalesce; stable events exactly once', async () => {
    let release; const pending = new Promise(resolve => { release = resolve; });
    const h = harness({ randoms: [50, 90, 10, 1], request: () => pending }); h.start(); h.c.roll();
    const first = h.c.runAI(), second = h.c.runAI(); assert.equal(first, second);
    await Promise.resolve(); await Promise.resolve(); assert.equal(h.requests, 1);
    release(answer('b', { prompt: true })); await first;
    assert.equal(h.s.round.phase, 'continue');
    const before = h.s.events.length; h.reload(); h.c.resume(); await h.c.runAI();
    assert.equal(h.s.events.length, before); assert.equal(h.requests, 1);
    assert.equal(new Set(h.s.events.map(e => e.id)).size, h.s.events.length);
});
await test('USER loser: zero-choice request, one winner prompt, one reactions batch, frozen input across reload', async () => {
    const h = harness({ randoms: [1, 80, 20], request: (_p, o) => o.kind === 'prompt' ? { prompt: '你最喜欢怎样度过周末？' } : { reactions: [{ residentId: 'a', text: '听起来不错。' }, { residentId: 'b', text: '我也想试试。' }] } });
    h.start(); h.c.roll(); h.reload(); assert.equal(h.s.round.phase, 'truth-dare-choice');
    h.c.chooseUser('truth'); assert.equal(h.requests, 0); await h.c.runAI(); assert.equal(h.requests, 1);
    h.reload(); h.c.resume(); assert.equal(h.s.round.phase, 'await-user-input'); assert.equal(h.requests, 1);
    h.c.submit('安静看书'); h.reload(); assert.equal(h.s.round.userInput, '安静看书');
    await h.c.runAI(); assert.equal(h.requests, 2); assert.equal(h.s.round.phase, 'continue');
});
await test('USER winner one batch; continuation preserves prior events; end archives and clears active session', async () => {
    const h = harness({ randoms: [100, 1, 50, 1], request: () => answer('a') }); h.start(); h.c.roll();
    assert.equal(h.s.round.phase, 'await-user-input'); h.c.submit('喜欢什么音乐？'); await h.c.runAI(); assert.equal(h.requests, 1);
    const old = clone(h.s.events); h.c.next(residents); assert.equal(h.s.round.number, 2); assert.deepEqual(clone(h.s.events), old);
    assert.equal(h.s.rounds.length, 1); h.c.end(); assert.equal(h.s, null); assert.equal(h.data.recentSessions.length, 1); h.reload(); assert.equal(h.s, null);
});
await test('AI success saves structured output before events; reload resumes presentation without regeneration', async () => {
    let failPresentation = true;
    const h = harness({ randoms: [50, 90, 1, 1], request: () => answer('b', { prompt: true }),
        persist: data => !(failPresentation && data.activeSession?.round.phase === 'continue') });
    h.start(); h.c.roll(); await assert.rejects(h.c.runAI());
    assert.ok(h.durable.activeSession.round.pendingAiOperation.result);
    assert.equal(h.durable.activeSession.events.some(e => e.type === 'resident'), false);
    h.reload(); failPresentation = false; h.c.resume();
    assert.equal(h.s.round.phase, 'continue'); assert.equal(h.requests, 1);
    assert.ok(h.s.events.some(e => e.id.endsWith(':answer')));
});
await test('USER-winner Dare and AI-vs-AI Dare each use one batch, with frozen remote performance', async () => {
    for (const userWinner of [true, false]) {
        const h = harness({ randoms: userWinner ? [100, 1, 50, 100] : [50, 100, 1, 100],
            request: (_prompt, options) => { assert.equal(options.kind, 'resolution'); return {
                ...(userWinner ? {} : { prompt: '请对着镜头表演一个夸张的姿势。' }),
                answer: { residentId: userWinner ? 'a' : 'b', mode: 'physical', text: '镜头亮起来时，它轻轻歪头，先抬起前爪又放下，认真地对准镜头摆了一个姿势。'.repeat(5) },
                reactions: [{ residentId: 'a', text: '这一局很有意思。' }, { residentId: 'b', text: '下次换个挑战吧。' }]
            }; } });
        h.start(); h.c.roll(); assert.equal(h.s.round.choice, 'dare');
        if (userWinner) h.c.submit('对镜头表演一个姿势');
        await h.c.runAI(); assert.equal(h.requests, 1); assert.equal(h.s.round.phase, 'continue');
        const persisted = clone(h.durable.activeSession); h.reload(); h.c.resume();
        assert.deepEqual(clone(h.s), persisted); assert.equal(h.requests, 1);
    }
});
await test('invalid AI envelope stays retryable without changing rolls, participants, or winner', async () => {
    const h = harness({ randoms: [10, 100, 1, 1], request: () => ({ prompt: '问题', winnerId: 'user', affinity: 100 }) });
    h.start(); h.c.roll(); const facts = clone({ rolls: h.s.round.rollSets, winner: h.s.round.winnerId, loser: h.s.round.loserId, ids: h.s.participantIds });
    await assert.rejects(h.c.runAI()); h.reload(); h.c.resume();
    assert.deepEqual(clone({ rolls: h.s.round.rollSets, winner: h.s.round.winnerId, loser: h.s.round.loserId, ids: h.s.participantIds }), facts);
    assert.equal(h.s.round.pendingAiOperation.status, 'retryable'); assert.equal(h.s.events.some(e => e.type === 'resident'), false);
});
await test('failed generated-output save does not partially display; retry reuses RAM result without second AI', async () => {
    let failResult = true;
    const h = harness({ randoms: [50, 90, 1, 1], request: () => answer('b', { prompt: true }),
        persist: data => !(failResult && data.activeSession?.round.pendingAiOperation?.result) });
    h.start(); h.c.roll(); await assert.rejects(h.c.runAI());
    assert.equal(h.s.events.some(e => e.type === 'resident'), false); assert.equal(h.requests, 1);
    failResult = false; await h.c.runAI({ retry: true }); assert.equal(h.requests, 1); assert.equal(h.s.round.phase, 'continue');
});
await test('retry time and reload never auto-drain requests; frozen prompt retained', async () => {
    const prompts = [];
    const h = harness({ randoms: [50, 90, 1, 1], request: prompt => { prompts.push(prompt); if (prompts.length === 1) throw new Error('offline'); return answer('b', { prompt: true }); } });
    h.start(); h.c.roll(); await assert.rejects(h.c.runAI()); h.reload(); h.c.resume(); await h.c.runAI();
    assert.equal(h.requests, 1);
    h.setTime('2026-09-14T20:02:00.000Z'); await h.c.runAI(); assert.equal(h.requests, 2); assert.equal(prompts[0], prompts[1]);
});
await test('prompt is bounded, public-only; schema rejects world mutation/nonparticipant and CAT camera speech', () => {
    const h = harness({ randoms: [100, 1, 30, 100] }); h.start(); h.c.roll(); h.c.submit('表演一个远程动作');
    const prompt = party.buildPrompt(h.s, 'resolution');
    assert.doesNotMatch(prompt, /PRIVATE PROMPT|SECRET VOICE|PRIVATE PHONE|HIDDEN FACT|PRIVATE THREAD/);
    assert.ok(prompt.length < 8000);
    assert.match(prompt, /never world canon/); assert.match(prompt, /Convert impossible physical tasks/);
    assert.throws(() => party.validateOutput({ ...answer('a'), affinity: 4 }, h.s, 'resolution'));
    assert.throws(() => party.validateOutput({ ...answer('a'), reactions: [{ residentId: 'outsider', text: 'test' }] }, h.s, 'resolution'));
    const physical = { answer: { residentId: 'a', mode: 'physical', text: '它说：“这是人类的语言。”' + '它在镜头前轻轻晃动尾巴。'.repeat(15) }, reactions: [] };
    assert.throws(() => party.validateOutput(physical, h.s, 'resolution'), /猫形态/);
    physical.answer.text = '它在镜头前歪头，抬起一只前爪，又轻轻放下。'.repeat(10);
    assert.doesNotThrow(() => party.validateOutput(physical, h.s, 'resolution'));
    const human = clone(h.s); human.participants.find(p => p.id === 'a').form = 'HUMAN';
    physical.answer.text = '他说：“这一轮交给我。”' + '他朝镜头摆了一个夸张的姿势。'.repeat(12);
    assert.doesNotThrow(() => party.validateOutput(physical, human, 'resolution'));
    assert.deepEqual(residents[0].knowledgeLedger, 'HIDDEN FACT'); // no recipient world objects are handed to mutations
});
await test('dice renderer has no RNG; d100 100 and reduced-motion render unchanged authority', async () => {
    const node = () => ({ children: [], attrs: {}, style: { setProperty() {} }, appendChild(item) { this.children.push(item); }, replaceChildren() { this.children = []; }, setAttribute(k, v) { this.attrs[k] = v; } });
    sandbox.document = { createElement: node };
    for (const result of [1, 10, 73, 100]) {
        const element = node(); const face = await dice.present({ element, result, kind: 'coc-d100', reducedMotion: true });
        assert.equal(face.result, result); assert.ok(Object.isFrozen(face));
        assert.equal(element.children.at(-1).textContent, `d100 · ${result}`);
        assert.equal(element.children[0].children[0].textContent, result === 100 ? '00' : String(Math.floor(result / 10) * 10).padStart(2, '0'));
    }
    assert.doesNotMatch(read('js/meeow-dice.js'), /Math\.random|crypto\./);
});
await test('legacy saves normalize without party deletion by games; Explore numeric and lifecycle body is byte-identical', () => {
    assert.equal(party.normalize({ activeSession: { round: 1 }, recentSessions: 'wrong' }).activeSession, null);
    const source = read('index.html');
    const previous = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const rollBody = s => s.slice(s.indexOf('const submitDiceRoll ='), s.indexOf('const createExploreFallbackSettlement', s.indexOf('const submitDiceRoll =')));
    assert.equal(rollBody(source), rollBody(previous));
    const processBody = s => s.slice(s.indexOf('const processDiceResult ='), s.indexOf('const legacyGenerateExploreGoals', s.indexOf('const processDiceResult =')));
    assert.equal(processBody(source), processBody(previous));
    assert.equal((source.match(/callAI\(/g) || []).length, 40);
    assert.match(source, /phoneData\.truthOrDare = window\.Meeow\.truthOrDare\.normalize/);
    assert.match(source, /kind="coc-d100"/);
    assert.match(source, /currentApp === 'truth-or-dare'/);
    assert.match(source, /const set = truthController\.roll\(\);[\s\S]*truthDice\.value =/);
});
console.log(`Truth or Dare: ${checks} executed fixture groups passed.`);
