// Real private refresh path, mock provider/clock/storage; no browser or live AI.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { harness, makeCat, rows, section, clone } from './status-response-harness.mjs';

const minute = 60_000;
const localTime = (hour, min = 0) => new Date(2026, 9, 5, hour, min).getTime();
function lifecycle({ time = localTime(10), age = 31 * minute, saved = null } = {}) {
    let now = time, saveWorks = true, archivePending = false, durable = null;
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const cat = saved ? clone(saved) : { ...makeCat('curator'),
        curatorRoomPresence: { anchor: 'desk', enteredAt: new Clock(now - 2 * 86_400_000).toISOString(),
            lastStatusSyncAt: new Clock(now - age).toISOString() } };
    const other = { ...makeCat('other'), innerVoice: 'OTHER_PRIVATE_VOICE', chatHistory: ['OTHER_PRIVATE_CHAT'] };
    const h = harness([cat, other]), c = h.ctx, calls = [];
    Object.assign(c, { Date: Clock, document: { visibilityState: 'visible' },
        OPERATIONAL_DAY_START_HOUR: 3, OPERATIONAL_DAY_KEY: 'operational',
        currentTab: { value: 'lounge' }, loungeView: { value: 'curator' },
        curatorRoomResident: { value: cat }, activeCuratorRoomVisitId: 1,
        dailyInitializationPromise: null, getDailyArchivePending: () => archivePending ? {} : null,
        isInteracting: { value: false }, selectedCat: { value: cat }, isFocusing: { value: false },
        focusCats: { value: [] }, exploreState: { active: false }, getValidHallSceneFocusIds: () => [],
        buildSaveData: () => ({ user: c.user, cats: c.cats.value, halls: c.halls.value }) });
    c.user.currentStatus = 'PRIVATE_OWNER_STATUS';
    c.user.phoneData = { messages: [] };
    c.window.Meeow.storage = { persistSnapshot(snapshot) {
        assert.notEqual(cat.curatorRoomPresence.lastStatusSyncAt,
            snapshot.cats.find(entry => entry.id === cat.id).curatorRoomPresence.lastStatusSyncAt,
            'freshness is persisted before publication');
        if (!saveWorks) return false;
        durable = clone(snapshot); return true;
    } };
    c.callAI = (prompt, _role, _budget, _thinking, options) => new Promise((resolve, reject) => {
        calls.push({ prompt, options, resolve, reject });
    });
    vm.runInContext([
        section('const CURATOR_ROOM_ANCHORS =', 'const sanitizeCuratorRoomPresence ='),
        section('const getLocalDateKey =', 'const getPreviousOperationalDate ='),
        section('const curatorCanOwnResident =', 'const requestCuratorFurnitureInteraction ='),
        section('// Legacy entry hooks', 'const openCuratorRoom ='),
        'globalThis.curator = { refresh: reconcileVisibleCuratorRoomStatus, fresh: isCuratorRoomStatusFresh, day: getOperationalDayKey };'
    ].join('\n'), c);
    const readyDay = () => h.markers.set('operational', c.curator.day());
    readyDay();
    const respond = (index = calls.length - 1, update = null) => {
        const call = calls[index];
        const payload = JSON.stringify({ updates: [update || { ...rows([cat])[0],
            curatorRoomAnchor: cat.curatorRoomPresence?.anchor || 'desk' }], awayPlans: [], scene: null });
        const valid = call.options.validateResponse(payload);
        if (valid !== true) call.reject(new Error(valid)); else call.resolve(payload);
    };
    return { ...h, c, cat, other, calls, respond, readyDay, refresh: () => c.curator.refresh(),
        advance: ms => { now += ms; }, time: () => now, saved: () => durable,
        saveFailure: () => { saveWorks = false; }, archive: value => { archivePending = value; } };
}

// Fresh re-entry, exact 30 minute boundary and one real queued request.
let h = lifecycle({ age: 5 * minute });
assert.equal(await h.refresh(), false);
assert.equal(h.calls.length, 0);
h.advance(25 * minute);
const first = h.refresh(), concurrent = h.refresh();
assert.equal(h.calls.length, 1);
assert.equal(h.calls[0].options.maxAttempts, 1);
assert.equal(h.calls[0].options.isCurrentGeneration(), true);
assert.match(h.calls[0].prompt, /CURATOR ROOM CONTEXT/);
assert.doesNotMatch(h.calls[0].prompt, /OTHER_PRIVATE_VOICE|OTHER_PRIVATE_CHAT|PRIVATE_OWNER_STATUS/);
const untouched = clone({ other: h.other, user: h.c.user, halls: h.c.halls.value });
h.advance(minute); // acceptance, rather than dispatch, owns the clock
h.respond();
assert.deepEqual(await Promise.all([first, concurrent]), [true, true]);
assert.equal(Date.parse(h.cat.curatorRoomPresence.lastStatusSyncAt), h.time());
assert.equal(h.cat.curatorRoomPresence.anchor, 'desk');
assert.equal(h.cat.mapPoint, 'prior');
assert.deepEqual(clone({ other: h.other, user: h.c.user, halls: h.c.halls.value }), untouched);
assert.equal(h.saved().cats[0].curatorRoomPresence.lastStatusSyncAt, h.cat.curatorRoomPresence.lastStatusSyncAt);
assert.equal(await h.refresh(), false);

// Reconstructed state retains the accepted clock before/after expiry.
const persisted = h.saved().cats[0], acceptedAt = h.time();
h = lifecycle({ saved: persisted, time: acceptedAt + 5 * minute });
assert.equal(await h.refresh(), false);
h = lifecycle({ saved: persisted, time: acceptedAt + 31 * minute });
const overdue = h.refresh(); h.respond(); assert.equal(await overdue, true);

// A valid unchanged activity is accepted; refresh does not force novelty.
h = lifecycle();
const unchanged = h.refresh();
h.respond(0, { ...rows([h.cat])[0], status: h.cat.status, innerVoice: h.cat.innerVoice, curatorRoomAnchor: 'desk' });
assert.equal(await unchanged, true);

// HUMAN lifecycle eligibility shares protection, while CAT-only movement stays locked.
h = lifecycle(); h.cat.currentForm = 'HUMAN';
assert.equal(vm.runInContext('curatorCanOwnAmbient("curator")', h.c), false);
const human = h.refresh();
h.respond(0, { ...rows([h.cat])[0], formDecision: 'HUMAN', isHuman: true, curatorRoomAnchor: 'desk' });
assert.equal(await human, true);
assert.equal(h.cat.currentForm, 'HUMAN');

// Existing local 03:00 day authority and archive gate, even with <30m elapsed.
h = lifecycle({ time: localTime(2, 50), age: 0 });
h.advance(15 * minute);
assert.equal(await h.refresh(), false, 'new day waits for existing archive authority');
h.readyDay(); h.archive(true);
assert.equal(await h.refresh(), false);
h.archive(false);
const rollover = h.refresh(); h.respond(); assert.equal(await rollover, true);
assert.equal(h.c.curator.day(h.cat.curatorRoomPresence.lastStatusSyncAt), h.c.curator.day());

// Recent direct state wins even just across 03:00; old occupancy interaction does not.
h = lifecycle({ time: localTime(3, 5) }); h.cat.lastInteractionTimestamp = localTime(2, 59);
assert.equal(await h.refresh(), false);
h.advance(25 * minute);
const directExpired = h.refresh(); h.respond(); assert.equal(await directExpired, true);
h = lifecycle(); h.cat.curatorRoomPresence.enteredAt = new Date(h.time() - minute).toISOString();
h.cat.lastInteractionTimestamp = h.time() - 2 * minute;
const olderOccupancy = h.refresh(); h.respond(); assert.equal(await olderOccupancy, true);

// Recent committed and currently-running direct interactions protect freshness.
h = lifecycle(); h.cat.lastInteractionTimestamp = h.time() - minute;
assert.equal(await h.refresh(), false);
h.advance(30 * minute); h.c.isInteracting.value = true;
assert.equal(await h.refresh(), false);
h.c.isInteracting.value = false;
const interrupted = h.refresh(); h.cat.lastInteractionTimestamp = h.time(); h.cat.innerVoice = 'new accepted private turn';
assert.equal(h.calls[0].options.isCurrentGeneration(), false);
h.respond(); assert.equal(await interrupted, false);
assert.equal(h.cat.innerVoice, 'new accepted private turn');
assert.equal(h.saved(), null);

// Each legitimate authority replacement independently rejects the old result.
for (const [label, replace] of [
    ['selected resident', h => { h.c.curatorRoomResident.value = h.other; }],
    ['assignment', h => { delete h.cat.curatorRoomPresence; h.other.curatorRoomPresence = { anchor: 'floor', enteredAt: new Date(h.time()).toISOString() }; h.c.curatorRoomResident.value = h.other; }],
    ['re-entry', h => { h.cat.curatorRoomPresence.enteredAt = new Date(h.time()).toISOString(); }],
    ['state', h => { h.cat.lastStatusUpdateTime = h.time(); h.cat.status = 'new accepted state'; }],
    ['anchor', h => { h.cat.curatorRoomPresence.anchor = 'window'; }],
    ['form', h => { h.cat.currentForm = 'HUMAN'; }],
    ['resident object', h => { h.c.cats.value[0] = clone(h.cat); }],
    ['visit', h => { h.c.activeCuratorRoomVisitId++; }],
    ['hidden', h => { h.c.document.visibilityState = 'hidden'; }],
    ['new operational day', h => { h.advance(86_400_000); h.readyDay(); }]
]) {
    h = lifecycle(); const task = h.refresh(); replace(h); const prior = clone(h.cat);
    h.respond(); assert.equal(await task, false, label);
    assert.deepEqual(clone(h.cat), prior, label + ' must not overwrite');
    assert.equal(h.saved(), null, label + ' must not persist');
}

// Provider/validation/persistence failures preserve state and use one cooldown.
for (const kind of ['provider', 'validation', 'save']) {
    h = lifecycle(); const prior = clone(h.cat), task = h.refresh();
    if (kind === 'provider') h.calls[0].reject(new Error('mock failure'));
    else if (kind === 'validation') h.respond(0, { ...rows([h.cat])[0], curatorRoomAnchor: 'wrong' });
    else { h.saveFailure(); h.respond(); }
    assert.equal(await task, false, kind);
    assert.deepEqual(clone(h.cat), prior, kind);
    for (let n = 0; n < 10; n++) assert.equal(await h.refresh(), false);
    assert.equal(h.calls.length, 1, kind + ' no request storm');
    h.advance(5 * minute);
    const retry = h.refresh(); assert.equal(h.calls.length, 2);
    h.calls[1].reject(new Error('mock bounded later opportunity')); await retry;
}

// Hidden/focus/provider-disabled checks and conservative legacy metadata.
h = lifecycle(); h.c.document.visibilityState = 'hidden'; assert.equal(await h.refresh(), false);
h.c.document.visibilityState = 'visible'; h.c.isFocusing.value = true; h.c.focusCats.value = [h.cat];
assert.equal(await h.refresh(), false);
h.c.isFocusing.value = false; h.c.settings.apiKey = ''; assert.equal(await h.refresh(), false);
assert.equal(h.calls.length, 0);
for (const timestamp of [undefined, 'not-a-date', new Date(localTime(11)).toISOString()]) {
    h = lifecycle(); h.cat.curatorRoomPresence.lastStatusSyncAt = timestamp;
    const legacy = h.refresh(); assert.equal(h.calls.length, 1); h.respond(); assert.equal(await legacy, true);
}
console.log('Curator lifecycle: elapsed/day freshness, direct/currentness guards, durable acceptance, failure cooldown, private scope PASS');
