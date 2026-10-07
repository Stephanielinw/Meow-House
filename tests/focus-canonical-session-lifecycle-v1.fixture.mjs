import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(/function normalizeFocusSession\(/.test(html), 'Focus must have a recoverable canonical lifecycle');
const section = (start, end) => {
    const a = html.indexOf(start), b = html.indexOf(end, a);
    assert.ok(a >= 0 && b > a, `real production boundary: ${start}`);
    return html.slice(a, b);
};
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function world(saved = null, reactiveSession = false) {
    let now = Date.parse('2026-10-06T13:28:00-07:00'), fail = false, saveHook = null;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const ref = value => ({ value });
    const cats = saved?.cats || ['a', 'b', 'c'].map(id => ({ id, name: id, hallId: 'greek', currentForm: 'CAT', affinity: 10,
        status: '坐着休息', innerVoice: '我先歇歇。', statusActivity: { posture: 'sitting' }, todayInteractions: [], diary: [] }));
    const rawUser = saved?.user || { nickname: 'USER', coins: 100, missionReports: [], focusSession: null };
    // Vue returns a stable proxy after publication, not the original session draft.
    const sessionViews = new WeakMap();
    const user = reactiveSession ? new Proxy(rawUser, { get(target, key) {
        const value = Reflect.get(target, key);
        if (key !== 'focusSession' || !value) return value;
        if (!sessionViews.has(value)) sessionViews.set(value, new Proxy(value, {}));
        return sessionViews.get(value);
    } }) : rawUser;
    const requests = [], writes = [], terminated = [], timers = new Map(), hallCalls = [];
    let timerId = 0;
    const env = {
        Date: Clock, Map, Set, Math, JSON, Promise, console, user, cats: ref(cats), statusRefreshDisposed: false,
        halls: ref([{ id: 'greek', name: '伊萨卡' }, { id: 'gotham', name: '哥谭' }]),
        activeHallId: ref('greek'), currentHall: ref({ id: 'greek', name: '伊萨卡' }), roomCats: ref(cats),
        focusSetupData: { action: '阅读', minutes: 25, selectedCatIds: ['a', 'b'] }, canStartFocus: ref(true),
        isFocusing: ref(false), focusCats: ref([]), focusSessionForms: {}, focusSessionGeneration: ref(0),
        focusAction: ref(''), focusTime: ref(0), focusTotalTime: ref(0), focusTimer: ref(null), nextRandomEventTime: ref(0),
        currentFocusLog: ref([]), focusMomentSequence: ref(0), focusVisibleUserActionEvidence: ref([]),
        focusVoiceEntries: ref([]), focusVoiceIndex: ref(0), currentFocusVoiceEntry: ref(null),
        isProcessingFocusTick: ref(false), isFinishingFocus: ref(false), focusWakeLockMessage: ref(''),
        showFocusSetupModal: ref(true), focusSettlementLoading: {}, affinityChangeValue: ref(0),
        currentSettlement: {}, tempUserStatus: ref(''), showMissionSettlementModal: ref(false),
        focusMusic: {}, audioPlayer: ref(null), currentNoise: ref('none'),
        settings: { apiKey: '' }, exploreState: { active: false }, spatialPrototypeEnabled: false,
        getClaimedSocialParticipantIds: () => [], getActiveSocialPresenceParticipantIds: () => [],
        getValidHallSceneFocusIds: () => [], getResidentPhysicalHallId: cat => cat.hallId,
        isInteracting: ref(false), selectedCat: ref(null),
        getResidentForm: cat => cat.currentForm, getResidentPublicName: cat => cat.name,
        isResidentInHall: cat => !cat.isOut && !cat.curator, isResidentAway: cat => !!cat.isOut,
        isResidentInCuratorRoom: cat => !!cat.curator, getActiveAwayEpisode: () => null,
        cleanText: value => String(value || '').trim(),
        normalizeFormValue: value => ['CAT', 'HUMAN'].includes(value) ? value : '',
        buildSaveData: () => ({ user, cats, halls: env.halls.value }),
        appendInteractionEvent(cat, type, content, extra) {
            const event = { id: 'history-' + type + '-' + cat.id + '-' + Clock.now(), at: new Clock().toISOString(), type, content, ...extra };
            cat.todayInteractions.push(event); return event;
        },
        terminateActiveSocialPresenceForResident: id => terminated.push(id), sendFriendRequest: async () => {},
        requestFocusWakeLock: async () => {}, releaseFocusWakeLock: async () => {},
        showToast: () => {}, addLog: () => {},
        nextTick: fn => Promise.resolve(fn?.()), playNoise: () => {}, getCurrentTimeStr: () => '13:28',
        setInterval: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
        buildSharedFocusSessionEvidence: entries => entries.join('\n'), buildPublicSharedPeerRelationshipLines: () => new Map(),
        buildLeanAmbientContext: cat => 'PUBLIC ' + cat.id, buildResidentPublicNameContract: () => '',
        buildAuthoritativeUserIdentityContext: () => 'USER', getInteractionHolidayContext: () => '',
        getFocusSharedMomentAuthorizedParticipants: members => members, getFocusVisibleUserActionEvidence: () => [],
        validateFocusSharedMoment: value => value, logPromptBudget: () => {},
        CORE_ROLEPLAY_PROMPT: '', ThinkingLevel: { LOW: 0 }, parseAIJSON: JSON.parse,
        statusPosture: { validateStatusPosture: () => ({ valid: true }) },
        setCatStatus: (cat, status, { posture, innerVoice }) => { cat.status = status; cat.statusActivity = { posture }; cat.innerVoice = innerVoice; },
        getCatAvatarSource: () => '', playLogSound: () => {},
        callAI: (prompt, system, tokens, thinking, options) => {
            const pending = deferred(); requests.push({ ...pending, prompt, options }); return pending.promise;
        },
        reconcileResidentEpisodeCopy: () => {},
        captureFocusHallDependencies: () => [], stageFocusHallReceipt: () => null, publishFocusHallHandoff: () => false,
        reconcileAffectedHallResidents: () => { hallCalls.push('partial'); throw new Error('C3b is forbidden'); },
        activateHallEpisodeWindow: () => { hallCalls.push('entry'); throw new Error('Hall activation is forbidden'); },
        requestSharedHallContent: () => { hallCalls.push('transport'); throw new Error('Hall transport is forbidden'); },
        window: { Meeow: { storage: { persistSnapshot: snapshot => {
            if (saveHook) { const hook = saveHook; saveHook = null; hook(snapshot); }
            if (fail) { fail = false; return false; }
            writes.push(plain(snapshot)); return true;
        } } } }
    };
    const ctx = vm.createContext(env);
    vm.runInContext(section('const setUserCurrentStatus =', 'const getSharedUserCurrentStatus =') + '\n' +
        section('// Canonical Focus session authority.', '// End canonical Focus session authority.') + '\n' +
        section('const focusTickBehavior = async', 'const confirmSettlement =') +
        '\nglobalThis.api = { start:startFocus, finish:finishFocus, recover:recoverFocusSession, tick:focusTickBehavior,\n' +
        'normalize:normalizeFocusSession, active:getActiveFocusSession, claim:claimFocusReportGeneration,\n' +
        'worker:runFocusReportGeneration, resume:continueFocusReport, canResume:canContinueFocusReport };', ctx);
    vm.runInContext(section('const hasHigherHallPresentationOwner =', 'let spatialAmbientController') +
        '\nglobalThis.api.higher = hasHigherHallPresentationOwner;', ctx);
    return { env, api: ctx.api, cats, user, requests, writes, terminated, timers, hallCalls,
        failNext: () => { fail = true; }, hook: fn => { saveHook = fn; },
        advance: seconds => { now += seconds * 1000; }, saved: () => writes.at(-1),
        events: type => cats.flatMap(cat => cat.todayInteractions.filter(event => event.type === type)),
        async flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); } };
}

// Save-before-publish: one draft, no world effects on failure; retry commits one start.
{
    const w = world(); w.failNext();
    assert.equal(w.api.start(), false);
    assert.equal(w.api.active(), null); assert.equal(w.env.isFocusing.value, false);
    assert.equal(w.api.higher('a'), false);
    assert.equal(w.terminated.length, 0); assert.equal(w.events('focus-start').length, 0); assert.equal(w.requests.length, 0);
    assert.equal(w.api.start(), true);
    const session = plain(w.user.focusSession);
    assert.deepEqual(session.participantIds, ['a', 'b']); assert.deepEqual(session.participantForms, { a:'CAT', b:'CAT' });
    assert.equal(session.state, 'active'); assert.equal(w.events('focus-start').length, 2);
    assert.equal(w.api.higher('a'), true); assert.equal(w.api.higher('c'), false);
    assert.ok(w.events('focus-start').every(event => event.focusSessionId === session.id));
    assert.ok(w.saved().user.focusSession.id === session.id);
    w.api.start(); assert.equal(w.events('focus-start').length, 2); assert.equal(w.terminated.length, 2);
    w.env.focusSetupData.selectedCatIds = ['c']; w.cats[0].currentForm = 'HUMAN';
    assert.deepEqual(plain(w.user.focusSession.participantIds), ['a','b']);
    assert.equal(w.env.focusSessionForms.a, 'CAT'); assert.equal(w.hallCalls.length, 0);
}
// Start draft identity persists across a failed save, but a canceled/new setup is a new intent.
{
    const w = world(); let failedId;
    w.hook(snapshot => { failedId = snapshot.user.focusSession.id; }); w.failNext(); w.api.start(); w.advance(60);
    assert.equal(w.api.start(), true); assert.equal(w.user.focusSession.id, failedId);
    assert.equal(w.env.focusTime.value, 25 * 60, 'failed intent time is not executable Focus time');
}
// Reload binds the same owner, wall-clock timing, frozen forms; no AI merely on recovery.
{
    const w = world(); w.api.start(); const saved = w.saved(), r = world(saved);
    r.env.settings.apiKey = 'mock'; r.advance(120);
    await r.api.recover();
    assert.equal(r.user.focusSession.id, w.user.focusSession.id); assert.equal(r.env.isFocusing.value, true);
    assert.equal(r.env.focusTime.value, 23 * 60); assert.equal(r.events('focus-start').length, 2);
    assert.equal(r.requests.length, 0); assert.equal(r.hallCalls.length, 0);
    await r.api.recover(); assert.equal(r.timers.size, 1); assert.equal(r.events('focus-start').length, 2);
}
// Canonical finish: one atomic end/report/history/reward, failure keeps the owner active.
{
    const w = world(); w.api.start(); const id = w.user.focusSession.id; w.advance(240);
    const oldUserStatus = plain({ status:w.user.currentStatus || '', provenance:w.user.currentStatusProvenance || null });
    w.failNext(); assert.equal(await w.api.finish(25, false), false);
    assert.equal(w.user.focusSession.state, 'active'); assert.equal(w.env.isFocusing.value, true);
    assert.equal(w.events('focus-end').length, 0); assert.equal(w.user.missionReports.length, 0); assert.equal(w.requests.length, 0);
    assert.deepEqual(plain({ status:w.user.currentStatus || '', provenance:w.user.currentStatusProvenance || null }), oldUserStatus);
    assert.equal(await w.api.finish(25, false), true);
    assert.equal(w.user.focusSession.id, id); assert.equal(w.user.focusSession.state, 'ended');
    assert.equal(w.env.isFocusing.value, false); assert.ok(w.user.focusSession.endedAt);
    const report = w.user.missionReports[0], after = plain({ coins:w.user.coins, affinities:w.cats.map(c => c.affinity) });
    assert.equal(report.focusSessionId, id); assert.equal(w.user.focusSession.reportId, report.id);
    assert.equal(w.events('focus-end').length, 2); assert.ok(w.events('focus-end').every(e => e.focusSessionId === id));
    await w.api.finish(25, false); await w.api.recover();
    assert.equal(w.user.missionReports.length, 1); assert.equal(w.events('focus-end').length, 2);
    assert.deepEqual(plain({ coins:w.user.coins, affinities:w.cats.map(c => c.affinity) }), after);
    assert.equal(w.hallCalls.length, 0);
}
// Expired reload uses the same finish save gate, not a release/settlement shortcut.
{
    const w = world(); w.api.start(); const r = world(w.saved()); r.advance(26*60); r.env.settings.apiKey = 'mock';
    r.failNext(); await r.api.recover(); assert.equal(r.user.focusSession.state, 'active'); assert.equal(r.env.isFocusing.value, true);
    assert.equal(r.events('focus-end').length, 0); assert.equal(r.user.missionReports.length, 0);
    await r.api.recover(); assert.equal(r.user.focusSession.state, 'ended'); assert.equal(r.env.isFocusing.value, false);
    assert.equal(r.user.missionReports.length, 1); assert.equal(r.events('focus-end').length, 2);
    assert.equal(r.user.coins, 350); assert.equal(r.cats[0].affinity, 12); assert.equal(r.requests.length, 0);
    assert.equal(r.api.canResume(r.user.missionReports[0]), false, 'recovery settlement does not invent report eligibility');
}
// Normal finish releases only after atomic fallback settlement, then claims one report request.
{
    const w = world(); w.api.start(); const c = w.cats[2], untouched = plain(c), hall = plain(w.env.halls.value);
    w.env.settings.apiKey = 'mock';
    const end = w.api.finish(25, true), duplicate = w.api.finish(25, true); await w.flush();
    assert.equal(w.requests.length, 1); assert.equal(w.user.focusSession.state, 'ended'); assert.equal(w.env.isFocusing.value, false);
    assert.equal(w.api.higher('a'), false); assert.equal(w.user.missionReports.length, 1);
    assert.equal(w.saved().user.missionReports[0].generation.state, 'in-flight');
    assert.equal(w.cats[2], c); assert.deepEqual(plain(c), untouched); assert.deepEqual(plain(w.env.halls.value), hall);
    w.requests[0].resolve('正常结算报告'); assert.equal(await end, true); assert.equal(await duplicate, false);
    assert.equal(w.user.missionReports[0].summary, '正常结算报告');
    assert.equal(w.events('focus-end').length, 2); assert.equal(w.hallCalls.length, 0);
}
// Durable eligibility is not dispatch. Failed claims and a crash before dispatch remain recoverable.
async function pendingReport() {
    const w = world(); w.api.start(); w.env.settings.apiKey = 'mock';
    // Fail the report claim, after the atomic ended commit.
    w.hook(() => w.failNext());
    // The hook above fails the end; retry with failure injected only for report ownership.
    await w.api.finish(25, true); assert.equal(w.user.focusSession.state, 'active');
    w.hook(snapshot => { if (snapshot.user.focusSession.state === 'ended') w.hook(() => w.failNext()); });
    await w.api.finish(25, true);
    assert.equal(w.user.focusSession.state, 'ended'); assert.equal(w.requests.length, 0);
    return w;
}
{
    const w = await pendingReport(), report = w.user.missionReports[0];
    assert.equal(report.generation.state, 'pending'); assert.equal(w.api.canResume(report), true);
    const claimed = w.api.claim(report.id); assert.ok(claimed); assert.equal(w.requests.length, 0);
    assert.equal(w.api.claim(report.id), null);
    const r = world(w.saved()); r.env.settings.apiKey = 'mock'; await r.api.recover();
    assert.equal(r.requests.length, 0); assert.equal(r.user.missionReports[0].generation.state, 'pending');
    const first = r.api.resume(report.id), second = r.api.resume(report.id); await r.flush();
    assert.equal(r.requests.length, 1); r.requests[0].resolve('同一报告的正文');
    await first; await second; assert.equal(r.user.missionReports.length, 1); assert.equal(r.user.missionReports[0].summary, '同一报告的正文');
    assert.equal(r.user.missionReports[0].generation.state, 'complete'); assert.equal(r.api.canResume(r.user.missionReports[0]), false);
    await r.api.resume(report.id); assert.equal(r.requests.length, 1); assert.equal(r.events('focus-end').length, 2);
    assert.equal(await r.api.worker(claimed), false, 'old claim cannot overwrite a newly claimed report');
}
// A report with committed eligibility but no claim also survives reload without auto-generation.
{
    const w = await pendingReport(), r = world(w.saved()); r.env.settings.apiKey = 'mock';
    await r.api.recover(); assert.equal(r.requests.length, 0); assert.equal(r.api.canResume(r.user.missionReports[0]), true);
    const work = r.api.resume(r.user.missionReports[0].id); await r.flush(); r.requests[0].reject(new Error('provider unavailable'));
    await work; assert.equal(r.user.missionReports[0].generation.state, 'failed');
    assert.ok(r.user.missionReports[0].summary); assert.equal(r.user.coins, w.user.coins); assert.equal(r.user.focusSession.state, 'ended');
}
// A generated body whose save failed is retried as persistence, never as another provider request.
{
    const w = await pendingReport(), id = w.user.missionReports[0].id;
    const work = w.api.resume(id); await w.flush(); w.failNext(); w.requests[0].resolve('保留这份已取得正文'); await work;
    assert.notEqual(w.user.missionReports[0].summary, '保留这份已取得正文');
    await w.api.resume(id); assert.equal(w.requests.length, 1); assert.equal(w.user.missionReports[0].summary, '保留这份已取得正文');
}
// Real Focus tick: canonical identity and runtime generation reject ended/replacement sessions.
{
    const w = world(); w.api.start(); w.env.settings.apiKey = 'mock';
    const response = JSON.stringify({ residentUpdates: ['a','b'].map(id => ({ id, status:'站着整理桌面', posture:'standing', innerVoice:'我整理一下。' })), sharedMoment:null });
    const tick = w.api.tick(); w.requests[0].resolve(response); assert.equal(await tick, true);
    assert.equal(w.cats[0].statusActivity.posture, 'standing'); assert.equal(w.cats[0].innerVoice, '我整理一下。');
    const before = plain(w.cats); const late = w.api.tick(); w.env.settings.apiKey = ''; await w.api.finish(25, false);
    w.requests[1].resolve(response); assert.equal(await late, false);
    assert.deepEqual(w.cats.map(c => [c.status,c.statusActivity.posture,c.innerVoice]), before.map(c => [c.status,c.statusActivity.posture,c.innerVoice]));
    w.api.start(); w.env.settings.apiKey = 'mock'; const older = w.api.tick();
    w.user.focusSession = { ...w.user.focusSession, id:'different-canonical-session' };
    w.requests[2].resolve(response); assert.equal(await older, false);
}
// No canonical owner means no tick even when orphaned UI state claims Focus is active.
{
    const w = world(null, true); w.api.start(); w.env.settings.apiKey = 'mock';
    const tick = w.api.tick();
    assert.equal(w.requests.length, 1, 'runtime must bind the published reactive canonical session');
    w.requests[0].resolve(JSON.stringify({ residentUpdates: ['a','b'].map(id => ({ id,
        status:'站着整理桌面', posture:'standing', innerVoice:'我整理一下。' })), sharedMoment:null }));
    assert.equal(await tick, true);
    w.env.settings.apiKey = ''; await w.api.finish(25, false);
    assert.equal(w.user.focusSession.state, 'ended');
}
{
    const w = world(); w.env.isFocusing.value = true; w.env.focusCats.value = w.cats;
    assert.equal(await w.api.tick(), false); assert.equal(w.requests.length, 0);
    assert.equal(w.api.normalize(undefined), null); assert.equal(w.api.normalize({ state:'active', id:'bad' }), null);
}
// Same identity restored into new resident objects rebinds runtime; an older tick remains stale.
{
    const w = world(); w.api.start(); w.env.settings.apiKey = 'mock'; const oldTick = w.api.tick();
    w.user.focusSession = plain(w.user.focusSession);
    w.env.cats.value = plain(w.cats); await w.api.recover();
    assert.equal(w.env.focusCats.value[0], w.env.cats.value[0]); assert.equal(w.timers.size, 1);
    w.requests[0].resolve(JSON.stringify({ residentUpdates:[], sharedMoment:null }));
    assert.equal(await oldTick, false);
    w.env.statusRefreshDisposed = true; assert.equal(await w.api.tick(), false); assert.equal(w.requests.length, 1);
}
// A live but stale report token cannot replace fallback or act as a second finish.
{
    const w = await pendingReport(), id = w.user.missionReports[0].id, fallback = w.user.missionReports[0].summary;
    const work = w.api.resume(id); await w.flush();
    w.user.missionReports[0].generation.token = 'newer-authority';
    w.requests[0].resolve('不应发布的旧结果'); await work;
    assert.equal(w.user.missionReports[0].summary, fallback); assert.equal(w.user.missionReports.length, 1);
    assert.equal(w.events('focus-end').length, 2);
}
// Presentation helpers are pure reads even when provider and persistence are forbidden.
{
    const w = await pendingReport(), count = w.writes.length;
    w.env.callAI = () => { throw new Error('presentation read called provider'); };
    w.env.window.Meeow.storage.persistSnapshot = () => { throw new Error('presentation read persisted'); };
    assert.equal(w.api.canResume(w.user.missionReports[0]), true); w.api.normalize(w.user.focusSession); w.api.active();
    assert.equal(w.writes.length, count); assert.equal(w.requests.length, 0);
}
const owner = section('const hasHigherHallPresentationOwner =', 'let spatialAmbientController');
assert.match(owner, /getActiveFocusSession\(/, 'T6 higher-owner reads canonical Focus');
const lifecycle = section('// Canonical Focus session authority.', 'const confirmSettlement =');
assert.doesNotMatch(lifecycle, /\b(?:reconcileAffectedHallResidents|activateHallEpisodeWindow|buildEpisodeContinuation|requestSharedHallContent)\s*\(/);
const reportUI = section('<div v-if="showReportModal"', '<!-- Bag Modal');
assert.match(reportUI, /canContinueFocusReport\(report\)/); assert.match(reportUI, /continueFocusReport\(report\.id\)/);
console.log('Canonical Focus lifecycle PASS: atomic start/end, reload, frozen participants/forms, same history, report claims/recovery, stale tick, zero Hall bridge');
