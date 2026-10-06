import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Local deterministic test clock; the checkpoint needs no auxiliary test I/O.
function clock() {
    let time = 0, serial = 0;
    const tasks = new Map();
    const set = (fn, delay) => { const id = ++serial; tasks.set(id, { at: time + delay, fn }); return id; };
    const advance = async duration => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
        const end = time + duration;
        for (let count = 0; count < 20000; count++) {
            const due = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            time = due[1].at; tasks.delete(due[0]); due[1].fn();
            for (let i = 0; i < 10; i++) await Promise.resolve();
        }
        time = end;
    };
    return { now: () => time, set, clear: id => tasks.delete(id), advance };
}

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html'), plain = value => JSON.parse(JSON.stringify(value));
const section = (a, b) => {
    const start = html.indexOf(a), end = html.indexOf(b, start);
    assert.ok(start >= 0 && end > start, a);
    return html.slice(start, end);
};
const timer = clock(), ctx = vm.createContext({ console, Date, Math, Map, Set, WeakMap,
    Uint8Array, performance: { now: timer.now }, setTimeout: timer.set, clearTimeout: timer.clear,
    requestAnimationFrame: fn => timer.set(() => fn(timer.now()), 16), cancelAnimationFrame: timer.clear });
ctx.window = ctx;
for (const file of ['meeow-hall-navigation', 'meeow-hall-spatial', 'meeow-hall-activities'])
    vm.runInContext(read('js/' + file + '.js'), ctx);
const { hallActivities: activities, hallSpatial: spatial, hallNavigation: nav } = ctx.Meeow;
assert.equal(typeof activities.episodeWindow, 'function', 'T6 must use a production window helper');
const at = new Date('2026-10-05T09:33:00-07:00').getTime();
const window = activities.episodeWindow(at);
assert.equal(new Date(window.start).getMinutes(), 20);
assert.equal(new Date(window.end).getMinutes(), 40);
assert.equal(window.end - window.start, 20 * 60_000);
assert.notEqual(activities.episodeWindow(new Date('2026-11-01T01:33:00-07:00').getTime()).key,
    activities.episodeWindow(new Date('2026-11-01T01:33:00-08:00').getTime()).key);

const floor = new Uint8Array(1024 * 1024).fill(1);
const domain = nav.createRasterDomain({ width: 1024, height: 1024, floor, rug: new Uint8Array(floor.length), floorId: 'ground', rugId: 'ground' });
domain.capabilityFor = () => ['ordinary-stationary', 'roam-origin', 'roam-destination'];
domain.groundPresentationPoint = () => true;
const residents = ['a', 'b'].map((id, i) => ({ id, roomId: 'living', foot: { x: 200 + i * 300, y: 500 },
    posture: 'sitting', currentBehavior: 'sit-idle', authority: 'resident:' + id,
    axes: { structurePreference: 2 }, domain, canMove: true }));
const makePlan = () => activities.buildEpisodeWindow({ hallId: 'hall', now: at, residents });
const plan = makePlan();
assert.equal(plan.planStart, at); assert.equal(plan.windowEnd, window.end);
assert.deepEqual(plain(makePlan()), plain(plan));
for (const resident of plan.residents) {
    assert.ok(resident.beats.length <= 3 && resident.beats.length > 0);
    assert.equal(resident.beats.at(-1).endAt, window.end);
    assert.equal(activities.definitions[resident.beats.at(-1).behaviorId].stationary, true);
}
const before = JSON.stringify(plan), result = plan.residents.flatMap(row => row.beats.map(beat => ({
    residentId: row.residentId, beatId: beat.id, status: '坐着看一会儿。', innerThought: '先留在这里。' })));
assert.equal(activities.validateEpisodeContent({ entries: result }, plan), true);
assert.notEqual(activities.validateEpisodeContent({ entries: [...result, result[0]] }, plan), true);
assert.notEqual(activities.validateEpisodeContent({ entries: result.map((row, i) => i ? row : { ...row, x: 40 }) }, plan), true);
assert.notEqual(activities.validateEpisodeContent({ entries: result.map((row, i) => i ? row : { ...row, residentId: 'unknown' }) }, plan), true);
assert.equal(JSON.stringify(plan), before, 'content validation cannot mutate the skeleton');
console.log('T6 window/skeleton/content trust boundary PASS');

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const authorityBlock = section('// T6 current-Hall episode authority.', '// End T6 current-Hall episode authority.');
// Mirrors Vue's stable deep-proxy identity without loading a remote runtime.
function reactive(value) {
    const proxies = new WeakMap();
    const wrap = object => {
        if (!object || typeof object !== 'object') return object;
        if (!proxies.has(object)) proxies.set(object, new Proxy(object, { get: (target, key) => wrap(Reflect.get(target, key)) }));
        return proxies.get(object);
    };
    return wrap(value);
}
function world({ enabled = true, hidden = false, saved = null, ids = ['a', 'b'], reactiveHall = false, loadRoom = async () => domain } = {}) {
    let time = at, saving = true, failAt = 0, writes = 0, durable = null, copySelections = 0;
    const requests = [];
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
    const residents = saved?.cats || ids.map((id, i) => ({ id, name: id, hallId: 'hall', currentForm: 'CAT',
        mapRoom: 'living', mapPoint: 'floor', statusActivity: { posture: 'sitting' }, lastStatusUpdateTime: 1,
        chatHistory: ['PRIVATE_CHAT'], innerVoice: 'PRIVATE_VOICE', privateRelationship: 'PRIVATE_RELATIONSHIP', x: 200 + i * 300 }));
    const rawHall = saved?.halls?.[0] || { id: 'hall', name: 'Hall' };
    const hall = reactiveHall ? reactive(rawHall) : rawHall, other = { id: 'other', name: 'Other' };
    const context = vm.createContext({ Date: Clock, WeakMap, Set, Map, Math, console,
        hallActivities: activities, hallNavigation: { ...nav, loadRoomDomain: loadRoom }, hallSpatial: spatial,
        cats: { value: residents }, halls: { value: [hall, other] }, activeHallId: { value: 'hall' },
        currentTab: { value: 'lounge' }, loungeView: { value: 'room' }, hallDisplayMode: { value: 'map' },
        activeMapRoom: { value: 'living' }, document: { visibilityState: hidden ? 'hidden' : 'visible' },
        settings: { apiKey: enabled ? 'mock' : '' }, user: { currentStatus: 'PRIVATE_OWNER' },
        spatialAmbientSnapshot: { value: { residents: [] } }, spatialPrototypeEnabled: false,
        roomSpatialDomain: { value: domain }, spatialStage: { value: {} }, spatialStageBounds: { value: { width: 1024 } },
        mapCatMarkers: { get value() { return residents.map(cat => ({ cat, room: cat.mapRoom, spot: 'floor', position: { left: cat.x / 1024 * 100 + '%', top: '48.828125%' } })); } },
        getCatHallId: cat => cat.hallId, getResidentPhysicalHallId: cat => cat.hallId,
        isResidentInHall: cat => !cat.isOut && !cat.curatorRoomPresence,
        getResidentForm: cat => cat.currentForm, getStructuredStatusPose: cat => cat.statusActivity.posture,
        getResidentPublicName: cat => cat.name, hasHigherHallPresentationOwner: id => residents.find(cat => cat.id === id)?.blocked || false,
        buildCatIdentityBlock: cat => 'public identity ' + cat.name,
        buildLeanAmbientContext: (cat, options) => 'public personality ' + cat.name + ' ' + options.status,
        buildPublicSharedPeerRelationshipLines: () => new Map(), buildAuthoritativeUserIdentityContext: () => 'public USER',
        buildStatusSyncUserContext: () => 'safe public user projection', CORE_ROLEPLAY_PROMPT: '', ThinkingLevel: { LOW: 'low' },
        parseAIJSON: JSON.parse, buildSaveData: () => ({ cats: residents, halls: [hall, other] }), addLog() {},
        requestSharedHallContent: (prompt, options) => new Promise((resolve, reject) => requests.push({ prompt, options, resolve, reject })),
        syncSpatialAmbient() {},
        window: { Meeow: { storage: { persistSnapshot: state => {
            writes++; if (!saving || writes === failAt) return false; durable = plain(state); return true;
        } }, residentCopy: { factFor: (cat, posture, form) => ({ id: cat.id, posture, form }),
            deriveContext: (fact, event) => ({ ...fact, ...event }),
            selectPair: () => { copySelections++; return { status: '坐着歇一会儿。', innerThought: '先留在这里。' }; } } } }
    });
    vm.runInContext(authorityBlock + '\nglobalThis.api = { reconcile: reconcileCurrentHallEpisodeWindow, owned: isHallEpisodeOwned, content: getResidentEpisodeContent, policy: hallEpisodeExecutionPolicy, progress: recordHallEpisodeProgress };', context);
    return { ctx: context, hall, residents, requests, writes: () => writes, saved: () => durable,
        copySelections: () => copySelections, failNthSave: n => { failAt = n; },
        failSave: () => { saving = false; }, allowSave: () => { saving = true; },
        advance: ms => { time += ms; }, reconcile: () => context.api.reconcile(new Clock()) };
}
let w = world();
await w.reconcile();
assert.equal(w.requests.length, 1); assert.equal(w.writes(), 2, 'plan + content claim durable before dispatch');
assert.equal(w.saved().halls[0].currentEpisodeWindow.content.state, 'claimed');
assert.equal(w.ctx.api.owned(w.residents[0]), true);
assert.doesNotMatch(w.requests[0].prompt, /PRIVATE_CHAT|PRIVATE_VOICE|PRIVATE_OWNER|PRIVATE_RELATIONSHIP/);
const frozen = plain(w.hall.currentEpisodeWindow);
for (let i = 0; i < 10000; i++) { w.ctx.api.owned(w.residents[0]); w.ctx.api.content(w.residents[0]); }
assert.equal(w.requests.length, 1); assert.equal(w.writes(), 2);
await w.reconcile(); assert.equal(w.requests.length, 1);
const interrupted = world({ saved: w.saved() }); await interrupted.reconcile();
assert.equal(interrupted.requests.length, 0, 'reload of claimed work does not retry');
w.requests[0].resolve(JSON.stringify({ entries: frozen.residents.flatMap(row => row.beats.map(beat => ({
    residentId: row.residentId, beatId: beat.id, status: '坐着看一会儿。', innerThought: '今天想慢一点。' }))) }));
await flush(); assert.equal(w.hall.currentEpisodeWindow.content.state, 'accepted');
w.ctx.spatialAmbientSnapshot.value.residents = [{ id: 'a', episodeBeatId: frozen.residents[0].beats[0].id, behaviorLifecycleState: 'ACTIVE', state: 'activity' }];
w.ctx.api.progress('a', frozen.residents[0].beats[0].id, 'active', { x: 200, y: 500 });
assert.equal(w.ctx.api.content(w.residents[0]).innerThought, '今天想慢一点。');
w.residents[0].lastInteractionTimestamp = at;
await w.reconcile();
assert.equal(w.hall.currentEpisodeWindow.residents[0].state, 'invalidated');
assert.equal(w.hall.currentEpisodeWindow.residents[1].state, 'valid');
assert.equal(w.requests.length, 1); assert.equal(w.ctx.api.content(w.residents[0]), null);
await world({ hidden: true }).reconcile();
w = world(); w.failSave(); await w.reconcile();
assert.equal(w.requests.length, 0); assert.equal(w.hall.currentEpisodeWindow, undefined);
w.allowSave(); await w.reconcile(); assert.equal(w.requests.length, 1);
w.requests[0].reject(new Error('mock provider failure')); await flush();
assert.equal(w.hall.currentEpisodeWindow.content.state, 'fallback');
await w.reconcile(); assert.equal(w.requests.length, 1);
w = world({ enabled: false }); await w.reconcile();
assert.equal(w.requests.length, 0); assert.equal(w.ctx.api.owned(w.residents[0]), true);
w.advance(7 * 60_000); await w.reconcile();
assert.notEqual(w.hall.currentEpisodeWindow.windowKey, frozen.windowKey);
// T8 and group-chat boundaries: execute the original send semantics separately;
// the visible readers must not be redirected to the T6 content getter.
const visibleReaders = section('const getResidentLiveStatus =', 'const setCatStatus =');
assert.doesNotMatch(visibleReaders, /getResidentEpisodeContent|currentEpisodeWindow/);
console.log('T6 persistence/cache/currentness/fallback/privacy/T8 boundary PASS');

// Execute the frozen beats through the real ambient controller. Default policy
// remains available for standalone legacy/Curator callers.
const execTimer = clock();
w = world({ enabled: false }); await w.reconcile();
w.ctx.Date.now = () => at + execTimer.now();
let selections = 0;
const controller = spatial.createAmbientSimulation({
    episodePolicy: w.ctx.api.policy,
    navigation: { legalPoint: domain.legalPoint, separation: nav.DESTINATION_SEPARATION,
        choose: () => { throw new Error('planned resident must not randomly select a target'); },
        plan: (from, to) => nav.planRoute(domain, from, to) },
    activityPolicy: { initial: activities.initialBehavior, postures: id => activities.definitions[id].postures,
        candidates: () => [], chooseBehavior: () => { selections++; return 'rest'; },
        choosePosture: () => { selections++; return 'lying'; }, duration: () => { selections++; return 100; },
        prepareVisual: () => true, visualReady: () => true, onStableSettle: () => true },
    getAuthoritativePose: () => 'sitting', canOwnResident: () => true,
    prepareStandingVisual: () => true, isStandingVisualReady: () => true,
    now: execTimer.now, setTimer: execTimer.set, clearTimer: execTimer.clear,
    requestFrame: fn => execTimer.set(() => fn(execTimer.now()), 16), cancelFrame: execTimer.clear,
    onChange: snapshot => { w.ctx.spatialAmbientSnapshot.value = snapshot; }
});
const entries = w.residents.map(cat => ({ id: cat.id, key: cat.id, foot: { x: cat.x, y: 500 }, authoritativePose: 'sitting' }));
controller.reconcile(entries, true); await flush();
assert.equal(selections, 0);
assert.ok(controller.snapshot().residents.every(row => row.episodeBeatId && row.behaviorLifecycleState === 'ACTIVE'));
const originalId = controller.snapshot().residents[0].behaviorInstanceId;
for (let i = 0; i < 1000; i++) controller.reconcile(entries, true);
assert.equal(controller.snapshot().residents[0].behaviorInstanceId, originalId, 'read/reconcile cannot restart same beat');
const beforePause = plain(controller.snapshot().residents.map(row => row.foot));
controller.pause('hidden'); await execTimer.advance(7 * 60_000); controller.resume(); await flush();
assert.deepEqual(plain(controller.snapshot().residents.map(row => row.foot)), beforePause, 'hidden time cannot teleport/replay');
assert.equal(selections, 0);
assert.equal(w.requests.length, 0);
controller.stop();
assert.deepEqual(plain(controller.snapshot().reserved), {}, 'teardown releases existing destination claims');

// Candidate and pre-claim gates must both apply; an existing legitimate higher
// authority remains eligible through the unmodified shared-scene eligibility.
const candidateBlock = section('const getAutomaticHallSocialCandidates =', 'const getClaimedSocialParticipantIds =');
const candidateContext = vm.createContext({ cats: { value: [{ id: 'owned' }, { id: 'free' }] },
    getActiveSocialPresenceParticipantIds: () => [], getClaimedSocialParticipantIds: () => [],
    isSharedSceneResidentEligible: () => true, isHallEpisodeOwned: cat => cat.id === 'owned' });
vm.runInContext(candidateBlock + '\nglobalThis.candidates = getAutomaticHallSocialCandidates;', candidateContext);
assert.deepEqual(plain(candidateContext.candidates('hall').map(cat => cat.id)), ['free']);
assert.match(section('sharedSocialClaim = pair.some', 'statusCompletion.socialOpportunityClaim ='), /isHallEpisodeOwned[\s\S]*\? null : socialActivity.claimOpportunity/);
assert.match(section('requestedCats.forEach(cat => {\n                                if (presenceDirectives', '// An empty opportunity check'), /isHallEpisodeOwned\(cat\)\) return;[\s\S]*freezeItemUseDecision/);
assert.doesNotMatch(section('const isSharedSceneResidentEligible =', 'const getAutomaticHallSocialCandidates ='), /isHallEpisodeOwned/);
// Only the primitive is shared: same group call argument contract and no T6
// history/persistence/validator semantics may enter sendGroupMessage.
const transportBlock = section('const requestSharedHallContent =', 'const sendGroupMessage =');
const calls = [];
const transportContext = vm.createContext({ callAI: (...args) => { calls.push(args); return 'group-result'; },
    CORE_ROLEPLAY_PROMPT: 'original system', ThinkingLevel: { LOW: 'low' } });
vm.runInContext(transportBlock + '\nglobalThis.transport = requestSharedHallContent;', transportContext);
assert.equal(transportContext.transport('group prompt'), 'group-result');
assert.deepEqual(plain(calls[0]), ['group prompt', 'original system', 1200, 'low', {}]);
assert.doesNotMatch(section('const sendGroupMessage =', 'const HERO_GLITCH_STATUSES ='), /currentEpisodeWindow|HALL EPISODE|hallEpisode/);
console.log('T6 real executor / hidden conservative resume / claim gates / group transport PASS');
w = world({ reactiveHall: true }); await w.reconcile();
const proxyEntries = w.hall.currentEpisodeWindow.residents.flatMap(row => row.beats.map(beat => ({
    residentId: row.residentId, beatId: beat.id, status: '坐着歇一会儿。', innerThought: '先留在这里。' })));
w.requests[0].resolve(JSON.stringify({ entries: proxyEntries })); await flush();
assert.equal(w.hall.currentEpisodeWindow.content.entries.length, proxyEntries.length, 'accepted text survives Vue-style proxy identity');
const oldCat = w.residents[0]; w.residents[0] = { ...oldCat };
assert.equal(w.ctx.api.owned(w.residents[0]), false, 'same-fields object replacement is stale');
// Removed/moved residents must be invalidatable through the saved row, rather
// than requiring the very live resident that has disappeared.
w = world({ enabled: false }); await w.reconcile();
const removedBeat = w.hall.currentEpisodeWindow.residents[0].beats[0].id;
w.residents.shift(); await w.reconcile();
assert.equal(w.hall.currentEpisodeWindow.residents[0].state, 'invalidated');
assert.equal(w.hall.currentEpisodeWindow.residents[1].state, 'valid');
let movingId;
for (let n = 0; n < 60 && !movingId; n++) {
    const id = 'moving-' + n;
    const candidate = activities.buildEpisodeWindow({ hallId: 'hall', now: at, residents: [{
        ...residents[0], id, authority: 'test', foot: { x: 200, y: 500 }, posture: 'sitting', currentBehavior: 'sit-idle', canMove: true }] });
    if (candidate.residents[0]?.beats.some(beat => beat.behaviorId === 'roam')) movingId = id;
}
assert.ok(movingId, 'production selection produces a legal frozen move');
function executor(world, timer, legalPoint = domain.legalPoint) {
    world.ctx.Date.now = () => at + timer.now();
    return spatial.createAmbientSimulation({ episodePolicy: world.ctx.api.policy,
        navigation: { legalPoint, separation: nav.DESTINATION_SEPARATION,
            choose: () => { throw Error('random target'); }, plan: (from, to) => nav.planRoute(domain, from, to) },
        activityPolicy: { initial: activities.initialBehavior, postures: id => activities.definitions[id].postures,
            candidates: () => [], chooseBehavior: () => { throw Error('random behavior'); },
            choosePosture: () => { throw Error('random pose'); }, duration: () => { throw Error('random duration'); },
            prepareVisual: () => true, visualReady: () => true, onStableSettle: () => true },
        getAuthoritativePose: () => 'sitting', canOwnResident: () => true,
        prepareStandingVisual: () => true, isStandingVisualReady: () => true,
        now: timer.now, setTimer: timer.set, clearTimer: timer.clear,
        requestFrame: fn => timer.set(() => fn(timer.now()), 16), cancelFrame: timer.clear,
        onChange: snapshot => { world.ctx.spatialAmbientSnapshot.value = snapshot; }
    });
}
const entryFor = world => world.residents.map(cat => ({ id: cat.id, key: cat.id, foot: { x: cat.x, y: 500 }, authoritativePose: 'sitting' }));
w = world({ enabled: false, ids: [movingId] }); await w.reconcile();
let movingTimer = clock(), movingController = executor(w, movingTimer);
let move = w.hall.currentEpisodeWindow.residents[0].beats.find(beat => beat.target);
movingController.reconcile(entryFor(w)); await flush();
assert.deepEqual(plain(movingController.snapshot().reserved), {}, 'future move reserves nothing');
await movingTimer.advance(move.startAt - at + 1000);
assert.equal(movingController.snapshot().residents[0].state, 'moving');
await movingTimer.advance(move.endAt - at - movingTimer.now() + 1000);
assert.deepEqual(plain(movingController.snapshot().residents[0].foot), plain(move.target));
assert.equal(w.hall.currentEpisodeWindow.residents[0].beats.find(beat => beat.id === move.id).state, 'completed');
assert.deepEqual(plain(movingController.snapshot().reserved), {});
movingController.stop();
// Hide during a planned move; return within this SAME window after its deadline.
w = world({ enabled: false, ids: [movingId] }); await w.reconcile();
movingTimer = clock(); movingController = executor(w, movingTimer);
move = w.hall.currentEpisodeWindow.residents[0].beats.find(beat => beat.target);
movingController.reconcile(entryFor(w)); await movingTimer.advance(move.startAt - at + 1000);
const contactBeforeHide = plain(movingController.snapshot().residents[0].foot);
movingController.pause(); await movingTimer.advance(move.endAt - at - movingTimer.now() + 1000);
movingController.resume(); await flush();
assert.deepEqual(plain(movingController.snapshot().residents[0].foot), contactBeforeHide);
assert.equal(w.hall.currentEpisodeWindow.residents[0].state, 'invalidated');
assert.deepEqual(plain(movingController.snapshot().reserved), {});
movingController.stop();
// Occupancy/geometry changes at execution time beat the frozen plan.
w = world({ enabled: false, ids: [movingId] }); await w.reconcile();
move = w.hall.currentEpisodeWindow.residents[0].beats.find(beat => beat.target);
movingTimer = clock(); movingController = executor(w, movingTimer,
    point => domain.legalPoint(point) && nav.distance(point, move.target) > 1);
movingController.reconcile(entryFor(w)); await movingTimer.advance(move.startAt - at + 1000);
assert.equal(w.hall.currentEpisodeWindow.residents[0].state, 'invalidated');
assert.deepEqual(plain(movingController.snapshot().reserved), {});
movingController.stop();
console.log('T6 actual planned walk / stable save / same-window interrupted dependency / illegal target PASS');
// Plan/claim/result persistence failures and roster races are independent.
w = world(); w.failNthSave(2); await w.reconcile();
assert.equal(w.requests.length, 0); assert.equal(w.hall.currentEpisodeWindow.content.state, 'unclaimed');
const beforeClaim = plain(w.hall.currentEpisodeWindow); const copyCount = w.copySelections();
await w.reconcile(); assert.equal(w.requests.length, 1); assert.equal(w.copySelections(), copyCount);
assert.deepEqual(plain(w.hall.currentEpisodeWindow.residents), beforeClaim.residents);
w.failNthSave(w.writes() + 1);
w.requests[0].resolve(JSON.stringify({ entries: w.hall.currentEpisodeWindow.residents.flatMap(row => row.beats.map(beat => ({
    residentId: row.residentId, beatId: beat.id, status: '坐着。', innerThought: '暂时这样。' }))) })); await flush();
assert.equal(w.hall.currentEpisodeWindow.content.state, 'claimed', 'unsaved result cannot publish');
await w.reconcile(); assert.equal(w.requests.length, 1, 'interrupted result save cannot retry provider');
// Empty/hidden/non-Hall surfaces and unowned new arrivals receive no extra request.
w = world({ ids: [] }); await w.reconcile(); assert.equal(w.requests.length, 0);
for (const surface of ['homepage', 'curator', 'hidden']) {
    w = world();
    if (surface === 'homepage') w.ctx.currentTab.value = 'detail';
    if (surface === 'curator') w.ctx.loungeView.value = 'curator';
    if (surface === 'hidden') w.ctx.document.visibilityState = 'hidden';
    await w.reconcile(); assert.equal(w.requests.length, 0); assert.equal(w.writes(), 0);
}
w = world(); await w.reconcile();
w.residents.push({ ...w.residents[1], id: 'new', x: 800 }); await w.reconcile();
assert.equal(w.requests.length, 1); assert.equal(w.ctx.api.owned(w.residents[2]), false);
assert.equal(w.ctx.api.content(w.residents[2]), null);
// Switch away after dispatch: saved text may cache for the original window,
// never overwrite the active Hall or mutate the world.
w.ctx.activeHallId.value = 'other';
w.requests[0].resolve(JSON.stringify({ entries: w.hall.currentEpisodeWindow.residents.flatMap(row => row.beats.map(beat => ({
    residentId: row.residentId, beatId: beat.id, status: '坐着。', innerThought: '安静一会儿。' }))) })); await flush();
assert.equal(w.hall.currentEpisodeWindow.content.entries.length, 6);
w.ctx.activeHallId.value = 'hall'; await w.reconcile(); assert.equal(w.requests.length, 1);
// Missing resident while async domain collection is in progress: remaining
// residents retain a legal plan, with no undefined identity/context input.
let releaseDomain, loads = 0;
w = world({ loadRoom: () => ++loads === 2 ? new Promise(resolve => { releaseDomain = () => resolve(domain); }) : Promise.resolve(domain) });
const preparing = w.reconcile(); await flush(); assert.ok(releaseDomain);
w.residents.shift(); releaseDomain(); await preparing;
assert.equal(w.hall.currentEpisodeWindow.residents[0].state, 'invalidated');
assert.equal(w.hall.currentEpisodeWindow.residents[1].state, 'valid');
assert.equal(w.requests.length, 1); assert.doesNotMatch(w.requests[0].prompt, /public identity a/);
// Old-window response cannot replace the new window or attach to new beats.
w = world(); await w.reconcile(); const oldRequest = w.requests[0], oldPlan = plain(w.hall.currentEpisodeWindow);
w.advance(7 * 60_000); await w.reconcile(); const newKey = w.hall.currentEpisodeWindow.windowKey;
oldRequest.resolve(JSON.stringify({ entries: oldPlan.residents.flatMap(row => row.beats.map(beat => ({
    residentId: row.residentId, beatId: beat.id, status: '坐着。', innerThought: '旧文案。' }))) })); await flush();
assert.equal(w.hall.currentEpisodeWindow.windowKey, newKey); assert.equal(w.hall.currentEpisodeWindow.content.state, 'claimed');
console.log('T6 atomic persistence / async roster / empty-hidden surfaces / new resident fallback / stale result PASS');
// The next window freezes a fresh roster/object authority, including arrivals.
w = world({ enabled: false }); await w.reconcile();
w.residents.push({ ...w.residents[1], id: 'next-window-arrival', x: 800 });
assert.equal(w.ctx.api.owned(w.residents[2]), false);
w.advance(7 * 60_000); await w.reconcile();
assert.equal(w.ctx.api.owned(w.residents[2]), true, 'next window admits fresh roster identity');
w = world(); await w.reconcile();
assert.equal(w.requests[0].options.maxAttempts, 1); assert.equal(w.requests[0].options.originSurface, 'hall-episode');
w.residents[0].blocked = true; await w.reconcile();
assert.equal(w.hall.currentEpisodeWindow.residents[0].state, 'invalidated');
assert.equal(w.hall.currentEpisodeWindow.residents[1].state, 'valid');
assert.equal(w.requests.length, 1, 'higher authority affects one resident without whole-Hall regeneration');
console.log('T6 focused fixture PASS — 10,000 reads, one shared claim, higher authority and next-window roster');
