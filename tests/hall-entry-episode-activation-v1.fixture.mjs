import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html'), plain = value => JSON.parse(JSON.stringify(value));
const section = (start, end) => {
    const a = html.indexOf(start), b = html.indexOf(end, a);
    assert.ok(a >= 0 && b > a, start);
    return html.slice(a, b);
};
const moduleContext = vm.createContext({ console }); moduleContext.window = moduleContext;
for (const name of ['navigation', 'spatial', 'activities'])
    vm.runInContext(read(`js/meeow-hall-${name}.js`), moduleContext);
const { hallNavigation: nav, hallSpatial: spatial, hallActivities: activities } = moduleContext.Meeow;
const domains = Object.fromEntries(['living', 'dining', 'dorm'].map(room => {
    const floor = new Uint8Array(1024 * 1024).fill(1);
    const domain = nav.createRasterDomain({ width: 1024, height: 1024, floor,
        rug: new Uint8Array(floor.length), floorId: 'ground', rugId: 'ground' });
    domain.source = { roomId: room };
    domain.capabilityFor = () => ['ordinary-stationary', 'roam-origin', 'roam-destination'];
    domain.groundPresentationPoint = () => true;
    return [room, domain];
}));
const at = clock => new Date(`2026-10-06T${clock}:00-07:00`).getTime();
const flush = async () => { for (let n = 0; n < 100; n++) await Promise.resolve(); };
const authority = section('// T6 current-Hall episode authority.', '// End T6 current-Hall episode authority.');
const entry = section('const HALL_ENTRY_REFRESH_COOLDOWN_MS', 'const openCatVisit =');
const roomNavigation = section('const setActiveMapRoom =', 'const setHallDisplayMode =');
const restore = section('const restoreLastMeeowLocation =', 'const navigateToTab =');
const phoneReturn = section('const leavePhone =', 'const restoreLastMeeowLocation =');
const detailReturn = section('const returnToHallRoom =', '// Hall-presentation Status');

function world({ saved = null, enabled = true, loadRoom = async room => domains[room] } = {}) {
    let time = at('13:27'), saves = 0, failAt = 0, savedState = null, copySelections = 0;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
    const resident = (id, hallId, mapRoom, x = 200) => ({ id, name: id, hallId, mapRoom,
        mapPoint: 'floor', currentForm: 'CAT', statusActivity: { posture: 'sitting' }, x,
        lastStatusUpdateTime: 1, chatHistory: ['PRIVATE_CHAT'], innerVoice: 'PRIVATE_THOUGHT' });
    const cats = saved?.cats || [resident('ithaca-living', 'greek', 'living'),
        resident('ithaca-dining', 'greek', 'dining'), resident('ithaca-dorm', 'greek', 'dorm'),
        resident('gotham-living', 'gotham', 'living'),
        { ...resident('away', 'greek', 'living', 400), isOut: true },
        { ...resident('curator', 'greek', 'living', 500), curatorRoomPresence: {} },
        { ...resident('higher-owner', 'greek', 'living', 600), blocked: true }];
    const halls = saved?.halls || [{ id: 'greek', name: '伊萨卡馆', guardian: 'Homer' },
        { id: 'gotham', name: '哥谭馆', guardian: 'Alfred' }];
    const requests = [], arrivals = [], activations = [], loads = [];
    const ref = value => ({ value });
    const env = { console, Date: Clock, Math, Map, Set, WeakMap,
        hallActivities: activities, hallSpatial: spatial,
        hallNavigation: { ...nav, loadRoomDomain: room => { loads.push(room); return loadRoom(room); } },
        halls: ref(halls), cats: ref(cats), activeHallId: ref('gotham'), activeMapRoom: ref('living'),
        currentTab: ref('lounge'), loungeView: ref('selector'), hallDisplayMode: ref('map'),
        document: { visibilityState: 'visible' }, settings: { apiKey: enabled ? 'mock' : '' },
        spatialAmbientSnapshot: ref({ residents: [] }),
        getCatHallId: cat => cat.hallId, getResidentPhysicalHallId: cat => cat.hallId,
        isResidentInHall: cat => !cat.isOut && !cat.curatorRoomPresence,
        getResidentForm: cat => cat.currentForm, getStructuredStatusPose: cat => cat.statusActivity.posture,
        hasHigherHallPresentationOwner: id => cats.find(cat => cat.id === id)?.blocked || false,
        mapCatMarkers: { get value() { return cats.filter(cat => cat.hallId === env.activeHallId.value &&
            !cat.isOut && !cat.curatorRoomPresence).map(cat => ({ cat, room: cat.mapRoom, spot: 'floor',
                position: { left: cat.x / 1024 * 100 + '%', top: '48.828125%' } })); } },
        buildSaveData: () => ({ halls, cats }), syncSpatialAmbient: () => {},
        buildCatIdentityBlock: cat => 'PUBLIC ' + cat.id,
        buildLeanAmbientContext: cat => 'PUBLIC PERSONALITY ' + cat.id,
        buildPublicSharedPeerRelationshipLines: () => new Map(),
        buildAuthoritativeUserIdentityContext: () => 'PUBLIC USER', buildStatusSyncUserContext: () => 'PUBLIC PRESENCE',
        parseAIJSON: JSON.parse,
        requestSharedHallContent: (prompt, options) => new Promise((resolve, reject) => {
            assert.equal(options.maxAttempts, 1);
            requests.push({ hallId: env.activeHallId.value, prompt, options, resolve, reject });
        }),
        showCatVisualEditor: ref(false), requestCatVisualEditorClose: () => { throw new Error('unexpected editor'); },
        terminateActiveSocialPresencesForNavigation: () => {}, reconcileAwayEpisodes: () => {},
        curatorRoomMapPreviewCat: ref(null), detailReturnOrigin: ref(''), selectedCat: ref(null),
        clearHallSceneFocus: () => {}, hallSceneActive: ref(false), lastMeeowLocation: ref({ type: 'curator', hallId: null }),
        hallScrollPositions: {}, setContentScrollTop: () => {}, alfredMessage: ref(''), tempUserStatus: ref(''),
        setUserCurrentStatus: (text, source, visibility) => arrivals.push({ text, source, visibility }),
        addLog: () => {}, reconcileActiveSocialPresences: () => {}, hallStatusRefreshPending: new Set(),
        reconcileResidentEpisodeCopy: () => {}, MAP_ROOM_DEFINITIONS: ['living', 'dining', 'dorm'].map(id => ({ id })),
        mapPreviewCat: ref(null), localStorage: { setItem: () => {} },
        rememberHallScrollPosition: () => {}, rememberPhoneChatScrollPosition: () => {}, resetPhoneTransientUI: () => {},
        phoneReturnRoute: ref(null), showEasterEggBtn: ref(false),
        openCuratorRoom: () => { env.currentTab.value = 'lounge'; env.loungeView.value = 'curator'; },
        activationCalls: activations,
        window: { Meeow: { storage: { persistSnapshot: snapshot => {
            saves++; if (saves === failAt) return false; savedState = plain(snapshot); return true;
        } }, residentCopy: { factFor: (cat, posture, form) => ({ id: cat.id, posture, form }),
            deriveContext: (fact, event) => ({ ...fact, ...event }),
            selectPair: () => { copySelections++; return { status: '坐着歇一会儿。', innerThought: '先留在这里。' }; } } } }
    };
    const ctx = vm.createContext(env);
    // Trace the real activation body without adding production instrumentation.
    const tracedAuthority = authority.replace('const activateHallEpisodeWindow = (hall, now = new Date()) => {',
        'const activateHallEpisodeWindow = (hall, now = new Date()) => { activationCalls.push(String(hall?.id));');
    vm.runInContext([tracedAuthority, entry, roomNavigation, restore, phoneReturn, detailReturn,
        'globalThis.api = { enterHall, setActiveMapRoom, restoreLastMeeowLocation, leavePhone, returnToHallRoom, reconcile: reconcileCurrentHallEpisodeWindow, progress: recordHallEpisodeProgress };'].join('\n'), ctx);
    return { ctx, halls, cats, requests, arrivals, activations, loads,
        enter: id => ctx.api.enterHall(halls.find(hall => hall.id === id)),
        reconcile: () => ctx.api.reconcile(new Clock()),
        setTime: value => { time = at(value); }, failSave: n => { failAt = n; },
        saved: () => savedState, saves: () => saves, copySelections: () => copySelections,
        plan: id => halls.find(hall => hall.id === id).currentEpisodeWindow };
}

const w = world();
w.enter('greek'); await flush();
assert.equal(w.ctx.activeHallId.value, 'greek');
assert.ok(w.plan('greek'), 'true Hall entry must ensure the window without a watcher or periodic tick');
assert.equal(w.activations.length, 1);
assert.equal(w.requests.length, 1);
assert.equal(w.plan('greek').windowStart, at('13:20'));
assert.equal(w.plan('greek').windowEnd, at('13:40'));
assert.equal(w.plan('greek').planStart, at('13:27'));
assert.deepEqual(plain(w.plan('greek').residents.map(row => row.roomId).sort()), ['dining', 'dorm', 'living']);
assert.deepEqual(plain(w.plan('greek').residents.map(row => row.residentId).sort()), ['ithaca-dining', 'ithaca-dorm', 'ithaca-living']);
for (const id of ['ithaca-living', 'ithaca-dining', 'ithaca-dorm']) assert.ok(w.requests[0].prompt.includes(id));
for (const excluded of ['gotham-living', 'away', 'curator', 'higher-owner', 'PRIVATE_CHAT', 'PRIVATE_THOUGHT'])
    assert.ok(!w.requests[0].prompt.includes(excluded));
assert.ok(w.plan('greek').residents.filter(row => row.roomId !== 'living')
    .every(row => row.beats.length === 1 && activities.definitions[row.beats[0].behaviorId].stationary));
assert.ok(w.arrivals.every(row => row.source === 'hall-arrival' && row.visibility === 'public'));
const living = w.plan('greek').residents.find(row => row.roomId === 'living');
w.ctx.api.progress(living.residentId, living.beats[0].id, 'active', living.lastFoot);
const unchanged = JSON.stringify(w.plan('greek')), calls = w.activations.length, arrivalCount = w.arrivals.length,
    savedCount = w.saves(), selections = w.copySelections();
for (const room of ['dining', 'dorm', 'living']) {
    w.ctx.api.setActiveMapRoom(room); await w.reconcile(); // existing post-watch safety net
    assert.equal(w.ctx.activeHallId.value, 'greek');
    assert.equal(w.ctx.activeMapRoom.value, room);
    assert.equal(JSON.stringify(w.plan('greek')), unchanged, 'room display cannot shrink Hall ownership or reset progress');
    assert.equal(w.activations.length, calls, 'room navigation must not invoke Hall activation');
    assert.equal(w.arrivals.length, arrivalCount, 'room navigation cannot publish Hall arrival');
    assert.equal(w.requests.length, 1);
    assert.equal(w.saves(), savedCount); assert.equal(w.copySelections(), selections);
}
console.log('Hall topology / all-room roster / zero room-change activation-arrival-request PASS');

w.ctx.currentTab.value = 'mission'; w.setTime('13:34'); w.enter('greek');
await Promise.all([w.reconcile(), w.reconcile()]); await flush();
assert.equal(JSON.stringify(w.plan('greek')), unchanged); assert.equal(w.requests.length, 1);
const reloaded = world({ saved: w.saved() }); reloaded.setTime('13:34'); reloaded.enter('greek'); await flush();
assert.equal(JSON.stringify(reloaded.plan('greek')), unchanged); assert.equal(reloaded.requests.length, 0);
w.enter('gotham'); await flush();
assert.equal(w.ctx.activeHallId.value, 'gotham'); assert.equal(w.requests.length, 2);
assert.equal(w.requests[1].hallId, 'gotham'); assert.equal(JSON.stringify(w.plan('greek')), unchanged);
w.enter('greek'); await flush(); assert.equal(w.requests.length, 2); assert.equal(JSON.stringify(w.plan('greek')), unchanged);
const arrivalsBeforeBoundary = w.arrivals.length;
w.setTime('13:42'); w.enter('greek'); await flush();
assert.equal(w.plan('greek').windowStart, at('13:40')); assert.equal(w.plan('greek').planStart, at('13:42'));
assert.equal(w.requests.length, 3, 'arrival cache cannot block a newly current window');
assert.equal(w.arrivals.length, arrivalsBeforeBoundary, 'cached returns preserve arrival-copy dedupe');
w.setTime('14:00'); await w.reconcile(); assert.equal(w.plan('greek').windowStart, at('14:00')); assert.equal(w.requests.length, 4);
console.log('Hall entry / same-window reload-switch-return / new boundary / watcher dedupe PASS');

for (const method of ['restoreLastMeeowLocation', 'returnToHallRoom', 'leavePhone']) {
    const h = world(); h.ctx.currentTab.value = method === 'leavePhone' ? 'phone' : 'detail';
    h.ctx.lastMeeowLocation.value = { type: 'hall', hallId: 'greek' };
    h.ctx.selectedCat.value = h.cats[0];
    h.ctx.phoneReturnRoute.value = { tab: 'lounge', loungeView: 'room', hallId: 'greek' };
    h.ctx.api[method](); await flush();
    assert.equal(h.ctx.activeHallId.value, 'greek'); assert.ok(h.plan('greek'), method);
    assert.equal(h.requests.length, 1); assert.equal(h.arrivals.length, 0);
}
const curator = world(); curator.ctx.api.restoreLastMeeowLocation(); await flush();
assert.equal(curator.requests.length, 0); assert.equal(curator.activations.length, 0);
const cachedMissing = world(); cachedMissing.halls[0].lastEnteredAt = at('13:26');
cachedMissing.enter('greek'); await flush();
assert.ok(cachedMissing.plan('greek')); assert.equal(cachedMissing.requests.length, 1);
assert.equal(cachedMissing.arrivals.length, 0, 'cached arrival presentation cannot block the first plan');
const duplicate = world(); duplicate.enter('greek');
await Promise.all([duplicate.reconcile(), duplicate.reconcile()]); await flush();
assert.equal(duplicate.requests.length, 1); assert.equal(duplicate.saves(), 2, 'entry + watchers own one plan and claim');
const hidden = world(); hidden.ctx.document.visibilityState = 'hidden'; hidden.enter('greek'); await flush();
assert.equal(hidden.requests.length, 0); assert.equal(hidden.plan('greek'), undefined);
const disabled = world({ enabled: false }); disabled.enter('greek'); await flush();
assert.equal(disabled.requests.length, 0); assert.equal(disabled.plan('greek').content.state, 'fallback');
for (const failAt of [1, 2]) {
    const h = world(); h.failSave(failAt); h.enter('greek'); await flush();
    assert.equal(h.requests.length, 0);
    const count = h.copySelections(); h.failSave(0);
    await Promise.all([h.reconcile(), h.reconcile()]); await flush();
    assert.equal(h.requests.length, 1); assert.equal(h.copySelections(), count, 'save retry must reuse the frozen draft');
}
const pending = [];
const race = world({ loadRoom: room => new Promise(resolve => pending.push(() => resolve(domains[room]))) });
race.enter('greek'); race.enter('gotham');
for (let n = 0; n < 8; n++) { pending.splice(0).forEach(resolve => resolve()); await flush(); }
assert.equal(race.plan('greek'), undefined, 'abandoned Hall load cannot publish or execute a hidden plan');
assert.equal(race.requests.length, 1); assert.equal(race.requests[0].hallId, 'gotham');
console.log('Explicit return routes / hidden-disabled / atomic saves / navigation race PASS');

assert.doesNotMatch(roomNavigation, /activateHallEpisodeWindow|enterHall\(|setUserCurrentStatus|hall-arrival/);
assert.match(html, /void reconcileCurrentHallEpisodeWindow\(now\)/, 'periodic/visibility recovery remains');
assert.match(html, /void reconcileCurrentHallEpisodeWindow\(\);[\s\S]*?flush: 'post'/, 'post watcher remains');
console.log('Hall entry episode activation focused fixture PASS');
