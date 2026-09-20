import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const helperSource = fs.readFileSync(new URL('../js/meeow-resident-visual.js', import.meta.url), 'utf8');
const dataSource = fs.readFileSync(new URL('../js/meeow-data.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(helperSource, sandbox, { filename: 'meeow-resident-visual.js' });
const visual = sandbox.Meeow.residentVisual;

const baseResident = {
    id: 'ithaca-telemachus', name: 'Telemachus', breed: 'ordinary prose about a black mood, not appearance', eyeColor: '海一样的目光',
    affinity: 67, hallId: 'greek', status: 'reading', phoneData: { accepted: true }, isOut: false,
    knowledge: { private: true }, lifeThreads: [{ id: 'thread-1' }], currentForm: 'CAT', hasRevealedHumanForm: true
};

// Conservative first draft: only explicit, exact allowlisted values seed authority.
const ambiguous = visual.seedIdentity(baseResident);
assert.equal(ambiguous.coat, visual.DEFAULT_CONFIG.coat);
assert.equal(ambiguous.eyeLeft, visual.DEFAULT_CONFIG.eyeLeft);
const seeded = visual.seedIdentity({ ...baseResident, appearance: { bodyType: '蓬松体型', coatColor: '黑色', coatPattern: '经典虎斑', leftEyeColor: '绿色' }, rightEyeColor: '金色' });
assert.equal(seeded.body, 'fluffy');
assert.equal(seeded.coat, 'black');
assert.equal(seeded.torso, 'classic_tabby');
assert.equal(seeded.eyeLeft, 'green');
assert.equal(seeded.eyeRight, 'gold');
assert.equal(visual.seedIdentity({ ...baseResident, breed: '纯黑长毛缅因猫' }).coat, visual.DEFAULT_CONFIG.coat, 'non-allowlisted prose must not use substring inference');

// Every built-in resident receives one authored canonical first draft while
// arbitrary residents retain the conservative structured-field seed path.
const dataSandbox = {};
dataSandbox.window = dataSandbox;
vm.runInNewContext(dataSource, dataSandbox, { filename: 'meeow-data.js' });
const builtinResidents = dataSandbox.Meeow.data.ALL_BUILTIN_CATS;
const builtinIds = Array.from(builtinResidents, resident => resident.id).sort();
const presetIds = Object.keys(visual.BUILTIN_VISUAL_PRESETS).sort();
assert.equal(builtinResidents.length, 55);
assert.equal(new Set(builtinIds).size, 55);
assert.deepEqual(presetIds, builtinIds, 'built-in visual presets must exactly cover the canonical resident roster');
assert.ok(Object.isFrozen(visual.BUILTIN_VISUAL_PRESETS));
for (const resident of builtinResidents) {
    const before = JSON.stringify(resident);
    const preset = visual.getBuiltinVisualPreset(resident.id);
    assert.ok(preset, `missing built-in visual preset: ${resident.id}`);
    assert.deepEqual(visual.seedIdentity(resident), preset, `first draft must use the built-in preset: ${resident.id}`);
    assert.equal(Object.keys(preset).length, Object.keys(visual.DEFAULT_CONFIG).length, `preset must canonicalize completely: ${resident.id}`);
    assert.equal(JSON.stringify(resident), before, `preset resolution must not mutate resident data: ${resident.id}`);
    assert.equal(resident.visual, undefined, `preset resolution must not persist resident.visual: ${resident.id}`);
}
const canonicalPresetSnapshot = JSON.stringify(Object.fromEntries(
    presetIds.map(residentId => [residentId, visual.getBuiltinVisualPreset(residentId)])
));
assert.equal(
    crypto.createHash('sha256').update(canonicalPresetSnapshot).digest('hex'),
    '697c78677f2d5b9b55945b8fea027c6183d24f338bd3946da68f59a2f655f8a4',
    'the approved 55-resident visual preset spec must not drift silently'
);
assert.deepEqual(
    { eyeLeft: visual.seedIdentity({ id: 'marvel-wade' }).eyeLeft, eyeRight: visual.seedIdentity({ id: 'marvel-wade' }).eyeRight },
    { eyeLeft: '#5798d0', eyeRight: '#7b4c2b' },
    'Wade uses the approved provisional left-blue/right-brown assignment'
);
assert.deepEqual(
    { eyeLeft: visual.seedIdentity({ id: 'greek-zagreus' }).eyeLeft, eyeRight: visual.seedIdentity({ id: 'greek-zagreus' }).eyeRight },
    { eyeLeft: '#48a267', eyeRight: '#c84747' },
    'Zagreus preserves canonical left-green/right-red laterality'
);
assert.equal(visual.getBuiltinVisualPreset('not-a-builtin'), null);
assert.equal(visual.seedIdentity({ id: 'not-a-builtin', appearance: { coatColor: '黑色' } }).coat, 'black');

const savedBuiltin = {
    id: 'gotham-bruce',
    visual: {
        renderer: 'meeow-cat', rendererVersion: 1, configVersion: 1, assetPackVersion: 'v1', enabled: true, revision: 7,
        identityConfig: { ...visual.DEFAULT_CONFIG, body: 'slim', coat: 'ginger', eyeLeft: 'gold', eyeRight: 'green' }
    }
};
const savedBuiltinResolution = visual.resolveResidentVisual(savedBuiltin, { allowDerived: true });
assert.equal(savedBuiltinResolution.source, 'saved');
assert.equal(savedBuiltinResolution.revision, 7);
assert.equal(savedBuiltinResolution.config.body, 'slim');
assert.equal(savedBuiltinResolution.config.coat, 'ginger');
const unsavedBuiltinResolution = visual.resolveResidentVisual({ id: 'gotham-bruce' }, { allowDerived: true });
assert.equal(unsavedBuiltinResolution.source, 'derived');
assert.deepEqual(unsavedBuiltinResolution.config, visual.getBuiltinVisualPreset('gotham-bruce'));

// Opening/editing uses detached JSON state.
const opening = visual.seedIdentity(baseResident);
const draft = visual.clone(opening);
draft.coat = 'ginger';
assert.equal(opening.coat, 'neutral');
assert.equal(baseResident.visual, undefined);

// Pose is presentation-only and rejected by persisted identity validation.
assert.throws(() => visual.canonicalizeIdentity({ ...opening, pose: 'standing' }), /Unknown cat identity field/);
const fallbackInput = { ...opening, body: 'fluffy' };
const fallbackBefore = JSON.stringify(fallbackInput);
const poses = [];
const fallback = visual.renderStandingWithFallback((config, { pose }) => {
    poses.push(pose);
    if (pose === 'standing') {
        const error = new RangeError('unsupported');
        error.code = 'CAT_POSE_UNAVAILABLE';
        throw error;
    }
    return { width: 1, height: 1, data: new Uint8ClampedArray(4), config };
}, fallbackInput);
assert.deepEqual(poses, ['standing', 'sitting']);
assert.equal(fallback.requestedPose, 'standing');
assert.equal(fallback.renderedPose, 'sitting');
assert.equal(fallback.fallback, true);
assert.equal(fallback.fallbackReason, 'CAT_POSE_UNAVAILABLE');
assert.equal(JSON.stringify(fallbackInput), fallbackBefore);

// Unexpected renderer/data/programming errors retain their real failure and never masquerade as a pose fallback.
for (const unexpected of [new TypeError('missing mask'), new RangeError('bad internal offset'), new Error('renderer bug')]) {
    const attempted = [];
    assert.throws(() => visual.renderStandingWithFallback((_config, { pose }) => {
        attempted.push(pose);
        throw unexpected;
    }, fallbackInput), error => error === unexpected);
    assert.deepEqual(attempted, ['standing']);
}

// Eyes accept named production presets or strict hex only, independently.
const customEyes = visual.canonicalizeIdentity({ ...opening, eyeLeft: '#12AbEf', eyeRight: '#fedcba' });
assert.equal(customEyes.eyeLeft, '#12abef');
assert.equal(customEyes.eyeRight, '#fedcba');
for (const malformed of ['#12345', '#1234567', 'red', 'rgb(1,2,3)', 'var(--eye)', '']) {
    assert.throws(() => visual.canonicalizeIdentity({ ...opening, eyeLeft: malformed }), /Invalid eyeLeft/);
}

// The same pure request-token contract is checked after async rendering and again after Vue nextTick.
assert.equal(visual.isCurrentPreviewRequest(7, 7, true), true);
assert.equal(visual.isCurrentPreviewRequest(7, 8, true), false);
assert.equal(visual.isCurrentPreviewRequest(7, 7, false), false);

// Successful save changes only visual; identical saves do not bump revision.
const resident = visual.clone(baseResident);
const beforeNonVisual = visual.clone(resident);
let persisted = 0;
let result = visual.saveVisual({ resident, identityConfig: seeded, persistNow: () => { persisted += 1; return true; } });
assert.equal(result.ok, true);
assert.equal(resident.visual.revision, 1);
const savedVisual = visual.clone(resident.visual);
delete resident.visual;
assert.deepEqual(resident, beforeNonVisual);
resident.visual = savedVisual;
result = visual.saveVisual({ resident, identityConfig: seeded, persistNow: () => { persisted += 1; return true; } });
assert.equal(result.unchanged, true);
assert.equal(resident.visual.revision, 1);
assert.equal(persisted, 1, 'identical save must not write again');
const changed = { ...seeded, tail: 'long' };
result = visual.saveVisual({ resident, identityConfig: changed, persistNow: () => true });
assert.equal(result.ok, true);
assert.equal(resident.visual.revision, 2);

// False/throw after a partial main-key write restores memory and persists rollback once.
const original = visual.clone(resident.visual);
let stored = visual.clone(resident);
let attempts = 0;
result = visual.saveVisual({
    resident,
    identityConfig: { ...changed, coat: 'blue' },
    persistNow: () => {
        attempts += 1;
        stored = visual.clone(resident);
        if (attempts === 1) return false; // candidate reached main key; later model-key write failed
        return false; // rollback main-key write succeeded; model-key still failed
    },
    verifyStored: () => JSON.stringify(stored.visual) === JSON.stringify(original)
});
assert.equal(result.ok, false);
assert.equal(attempts, 2);
assert.equal(result.rollbackVerified, true);
assert.deepEqual(resident.visual, original);
assert.deepEqual(stored.visual, original);

const throwing = visual.clone(baseResident);
result = visual.saveVisual({ resident: throwing, identityConfig: seeded, persistNow: () => { throw new Error('quota'); }, verifyStored: () => !Object.hasOwn(throwing, 'visual') });
assert.equal(result.ok, false);
assert.equal(result.rollbackVerified, true);
assert.equal(Object.hasOwn(throwing, 'visual'), false);

// Map cosmetic resolution: saved wins, derived is deterministic, and neither path mutates the resident.
const unsavedMapResident = visual.clone(baseResident);
const unsavedBefore = JSON.stringify(unsavedMapResident);
const derivedOne = visual.resolveResidentVisual(unsavedMapResident, { allowDerived: true });
const derivedTwo = visual.resolveResidentVisual(unsavedMapResident, { allowDerived: true });
assert.equal(derivedOne.source, 'derived');
assert.equal(derivedOne.identityHash, derivedTwo.identityHash);
assert.equal(JSON.stringify(unsavedMapResident), unsavedBefore);
const savedMapResident = visual.clone(resident);
const savedResolution = visual.resolveResidentVisual(savedMapResident, { allowDerived: true });
assert.equal(savedResolution.source, 'saved');
assert.deepEqual(savedResolution.config, visual.canonicalizeIdentity(savedMapResident.visual.identityConfig));

// Movement coordinates are deliberately absent from the cosmetic cache identity.
const mapKeyA = visual.makeSpriteCacheKey({ residentId: savedMapResident.id, effectiveForm: 'CAT', visual: savedResolution, pose: 'standing', size: 72, x: 10, y: 20 });
const mapKeyB = visual.makeSpriteCacheKey({ residentId: savedMapResident.id, effectiveForm: 'CAT', visual: savedResolution, pose: 'standing', size: 72, x: 900, y: 700 });
assert.equal(mapKeyA, mapKeyB);
const changedResolution = { ...savedResolution, revision: savedResolution.revision + 1 };
assert.notEqual(mapKeyA, visual.makeSpriteCacheKey({ residentId: savedMapResident.id, effectiveForm: 'CAT', visual: changedResolution, pose: 'standing', size: 72 }));

// Ground-anchor placement reports positive geometry; CSS applies its negative translation.
const placement = visual.makeGroundAnchorPlacement({ width: 112, height: 104, groundAnchor: [37, 89] }, 72);
assert.equal(placement.width, 72);
assert.equal(placement.height, 72 * 104 / 112);
assert.equal(placement.anchorXPercent, 37 / 112 * 100);
assert.equal(placement.anchorYPercent, 89 / 104 * 100);

// The request coordinator coalesces renders, rejects stale results, and invalidates one resident only.
const updates = [];
const coordinator = visual.createSpriteRequestCoordinator(() => updates.push('updated'));
let releaseFirst;
let renderCount = 0;
const firstRequest = coordinator.request({ residentId: 'cat-a', key: 'cat-a|rev-1', load: () => { renderCount += 1; return new Promise(resolve => { releaseFirst = resolve; }); } });
const joinedRequest = coordinator.request({ residentId: 'cat-a', key: 'cat-a|rev-1', load: () => { renderCount += 1; return { src: 'duplicate' }; } });
assert.equal(firstRequest, joinedRequest);
assert.equal(renderCount, 0, 'renderer starts in the scheduled promise turn');
await Promise.resolve();
assert.equal(renderCount, 1);
coordinator.invalidate('cat-a');
releaseFirst({ src: 'stale' });
assert.equal(await firstRequest, null);
assert.equal(coordinator.peek('cat-a', 'cat-a|rev-1'), null);
await coordinator.request({ residentId: 'cat-a', key: 'cat-a|rev-2', load: () => ({ src: 'fresh-a' }) });
await coordinator.request({ residentId: 'cat-b', key: 'cat-b|rev-1', load: () => ({ src: 'fresh-b' }) });
assert.equal(coordinator.peek('cat-a', 'cat-a|rev-2').src, 'fresh-a');
assert.equal(coordinator.peek('cat-b', 'cat-b|rev-1').src, 'fresh-b');
coordinator.invalidate('cat-a');
assert.equal(coordinator.peek('cat-a', 'cat-a|rev-2'), null);
assert.equal(coordinator.peek('cat-b', 'cat-b|rev-1').src, 'fresh-b');
await coordinator.request({ residentId: 'cat-c', key: 'cat-c|failure', load: () => null });
assert.equal(coordinator.cache.has('cat-c|failure'), false, 'renderer fallback/null must not poison the sprite cache');

// Map render failures are temporary presentation state, not permanent poisoned keys.
let retryNow = 1000;
const failures = visual.createSpriteFailureBackoff({ now: () => retryNow, delays: [1500, 5000, 15000, 30000] });
let failure = failures.recordFailure({ key: 'fixture-cat-a|standing|rev-0', residentId: 'fixture-cat-a', errorCategory: 'RangeError' });
assert.deepEqual({ attempts: failure.attempts, retryAfterMs: failure.retryAfterMs, nextRetryAt: failure.nextRetryAt }, { attempts: 1, retryAfterMs: 1500, nextRetryAt: 2500 });
assert.equal(failures.canAttempt('fixture-cat-a|standing|rev-0'), false);
retryNow = 2499;
assert.equal(failures.canAttempt('fixture-cat-a|standing|rev-0'), false, 'reactive reevaluation before retryAt must stay on legacy fallback');
retryNow = 2500;
assert.equal(failures.canAttempt('fixture-cat-a|standing|rev-0'), true, 'same key must become retryable without a save or reload');
failure = failures.recordFailure({ key: 'fixture-cat-a|standing|rev-0', residentId: 'fixture-cat-a', errorCategory: 'Error' });
assert.equal(failure.retryAfterMs, 5000);
retryNow = failure.nextRetryAt;
failure = failures.recordFailure({ key: 'fixture-cat-a|standing|rev-0', residentId: 'fixture-cat-a', errorCategory: 'Error' });
assert.equal(failure.retryAfterMs, 15000);
retryNow = failure.nextRetryAt;
failure = failures.recordFailure({ key: 'fixture-cat-a|standing|rev-0', residentId: 'fixture-cat-a', errorCategory: 'Error' });
assert.equal(failure.retryAfterMs, 30000);
retryNow = failure.nextRetryAt;
failure = failures.recordFailure({ key: 'fixture-cat-a|standing|rev-0', residentId: 'fixture-cat-a', errorCategory: 'Error' });
assert.equal(failure.retryAfterMs, 30000, 'persistent errors must use capped backoff');
const recoveredFailure = failures.clearSuccess('fixture-cat-a|standing|rev-0');
assert.equal(recoveredFailure.attempts, 5);
assert.equal(failures.get('fixture-cat-a|standing|rev-0'), null, 'success must completely clear failure state');

// A temporary pose-bank failure recovers on the normal next evaluation and then stays cached.
retryNow = 10_000;
const recoveryFailures = visual.createSpriteFailureBackoff({ now: () => retryNow, delays: [1500, 5000, 15000, 30000] });
const recoveryCoordinator = visual.createSpriteRequestCoordinator();
const recoveryResident = { id: 'fixture-cat-a', breed: 'unsupported coat description', eyeColor: 'unsupported eye description' };
const recoveryResidentBefore = JSON.stringify(recoveryResident);
const recoveryResidentVisual = visual.resolveResidentVisual(recoveryResident, { allowDerived: true });
assert.equal(recoveryResidentVisual.source, 'derived');
assert.equal(JSON.stringify(recoveryResident), recoveryResidentBefore, 'Synthetic resident derived resolution must not mutate resident data');
const recoveryResidentKey = visual.makeSpriteCacheKey({ residentId: recoveryResident.id, effectiveForm: 'CAT', visual: recoveryResidentVisual, pose: 'standing', size: 72 });
let poseBankReady = false;
let recoveryRenderCount = 0;
const evaluateRecoveryResident = async () => {
    const cached = recoveryCoordinator.peek(recoveryResident.id, recoveryResidentKey);
    if (cached) return cached;
    if (!recoveryFailures.canAttempt(recoveryResidentKey)) return null;
    try {
        const result = await recoveryCoordinator.request({
            residentId: recoveryResident.id,
            key: recoveryResidentKey,
            load: async () => {
                recoveryRenderCount += 1;
                if (!poseBankReady) throw new Error('temporary pose bank failure');
                return { src: 'durable-map-sprite', pose: 'standing' };
            }
        });
        if (result) recoveryFailures.clearSuccess(recoveryResidentKey);
        return result;
    } catch (error) {
        recoveryFailures.recordFailure({ key: recoveryResidentKey, residentId: recoveryResident.id, errorCategory: error.name });
        return null;
    }
};
assert.equal(await evaluateRecoveryResident(), null, 'first render failure must use legacy fallback');
assert.equal(recoveryRenderCount, 1);
for (let index = 0; index < 8; index += 1) assert.equal(await evaluateRecoveryResident(), null);
assert.equal(recoveryRenderCount, 1, 'reactive reevaluations before retryAt must not create a retry loop');
poseBankReady = true;
retryNow += 1500;
assert.equal((await evaluateRecoveryResident()).src, 'durable-map-sprite');
assert.equal(recoveryRenderCount, 2);
assert.equal(recoveryFailures.get(recoveryResidentKey), null);
assert.equal((await evaluateRecoveryResident()).src, 'durable-map-sprite');
assert.equal(recoveryRenderCount, 2, 'successful recovery must use the normal sprite cache');

// Key changes abandon obsolete posture/revision failures; resident cleanup is isolated.
recoveryFailures.recordFailure({ key: 'fixture-cat-a|standing|rev-1', residentId: 'fixture-cat-a', errorCategory: 'Error' });
recoveryFailures.recordFailure({ key: 'fixture-cat-a|lying|rev-2', residentId: 'fixture-cat-a', errorCategory: 'Error' });
recoveryFailures.recordFailure({ key: 'fixture-cat-b|standing|rev-1', residentId: 'fixture-cat-b', errorCategory: 'Error' });
assert.equal(recoveryFailures.retainResidentKey('fixture-cat-a', 'fixture-cat-a|lying|rev-2'), 1);
assert.equal(recoveryFailures.get('fixture-cat-a|standing|rev-1'), null);
assert.ok(recoveryFailures.get('fixture-cat-a|lying|rev-2'));
assert.ok(recoveryFailures.get('fixture-cat-b|standing|rev-1'));
assert.equal(recoveryFailures.invalidateResident('fixture-cat-a'), 1);
assert.equal(recoveryFailures.size(), 1, 'resident invalidation must not disturb or accumulate other residents\' records');

// Shared deadline wakeup: deterministic timers expose preemption and stale callbacks.
const fakeClock = () => {
    let at = 0, serial = 0, maximum = 0;
    const timers = new Map(), callbacks = new Map();
    return {
        now: () => at,
        setTime: value => { at = value; },
        setTimer: (fn, delay) => {
            const id = ++serial;
            timers.set(id, { fn, at: at + delay }); callbacks.set(id, fn);
            maximum = Math.max(maximum, timers.size);
            assert.ok(timers.size <= 1, 'only one retry timer may exist');
            return id;
        },
        clearTimer: id => timers.delete(id),
        fire: id => { const task = timers.get(id); assert.ok(task); timers.delete(id); task.fn(); },
        stale: id => callbacks.get(id)(),
        pending: () => Array.from(timers, ([id, task]) => ({ id, at: task.at })),
        maximum: () => maximum
    };
};
const clock = fakeClock();
const wakeFailures = visual.createSpriteFailureBackoff({ now: clock.now });
const wakeTimes = [];
const wakeController = visual.createSpriteRetryWakeup({ failures: wakeFailures, ...clock, wake: () => {
    assert.equal(clock.pending().length, 0, 'fired handle must clear before revision notification');
    wakeTimes.push(clock.now());
    // Synchronous cleanup reenters scheduling; the just-fired B must already be consumed.
    if (clock.now() === 3500) {
        wakeFailures.recordFailure({ key: 'temporary', residentId: 'temporary', at: clock.now() });
        wakeFailures.clearSuccess('temporary');
        assert.equal(clock.pending()[0].at, 5000);
    }
} });
wakeFailures.recordFailure({ key: 'A', residentId: 'A' });
wakeFailures.recordFailure({ key: 'A', residentId: 'A' }); // second failure: +5s
const oldATimer = clock.pending()[0].id;
assert.equal(clock.pending()[0].at, 5000);
const snapshot = wakeFailures.deadlines();
assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot[0]));
wakeFailures.clearSuccess('absent'); wakeFailures.retainResidentKey('A', 'A');
assert.equal(clock.pending()[0].id, oldATimer, 'no-op cleanup must not reschedule');
clock.setTime(2000);
wakeFailures.recordFailure({ key: 'B', residentId: 'B' });
assert.equal(clock.pending()[0].at, 3500, 'B preempts A');
clock.stale(oldATimer);
assert.deepEqual(wakeTimes, [], 'canceled timer must not wake');
clock.setTime(3500); clock.fire(clock.pending()[0].id);
assert.deepEqual(wakeTimes, [3500]);
assert.equal(clock.pending()[0].at, 5000, 'A remains pending after B wakes');
clock.setTime(5000); clock.fire(clock.pending()[0].id);
assert.deepEqual(wakeTimes, [3500, 5000]);
assert.equal(clock.pending().length, 0, 'consumed hidden/in-flight failures cannot spin');
assert.equal(wakeFailures.get('A').attempts, 2);
assert.equal(wakeFailures.get('B').attempts, 1, 'waking must not increment attempts');
wakeFailures.recordFailure({ key: 'B', residentId: 'B' });
assert.equal(clock.pending()[0].at, 10000, 'new occurrence schedules advanced backoff');
wakeFailures.invalidateResident('B');
assert.equal(clock.pending().length, 0);
assert.ok(wakeFailures.get('A'), 'B cleanup leaves A authority intact');
wakeFailures.clearSuccess('A');
clock.setTime(20000);
wakeFailures.recordFailure({ key: 'expired', residentId: 'expired', at: 0 });
assert.equal(clock.pending()[0].at, 20000);
clock.fire(clock.pending()[0].id);
assert.equal(clock.pending().length, 0);
wakeFailures.clearSuccess('expired');
wakeFailures.recordFailure({ key: 'drift', residentId: 'drift' });
clock.setTime(19000); clock.fire(clock.pending()[0].id);
assert.equal(wakeTimes.length, 3, 'backward clock shift cannot wake early');
assert.equal(clock.pending()[0].at, 21500);
clock.setTime(21500); clock.fire(clock.pending()[0].id);
assert.equal(wakeTimes.length, 4);
wakeFailures.clearSuccess('drift');
wakeController.dispose();
wakeFailures.recordFailure({ key: 'disposed', residentId: 'disposed' });
assert.equal(clock.pending().length, 0, 'dispose removes subscription');
assert.equal(clock.maximum(), 1);

// Cleanup preserves other residents' deadlines; a delayed callback coalesces
// all due occurrences into one wakeup, even across a forward clock jump.
const cleanupClock = fakeClock();
const cleanupFailures = visual.createSpriteFailureBackoff({ now: cleanupClock.now });
let cleanupWakes = 0;
const cleanupController = visual.createSpriteRetryWakeup({ failures: cleanupFailures, ...cleanupClock, wake: () => { cleanupWakes += 1; } });
cleanupFailures.recordFailure({ key: 'early', residentId: 'early' });
cleanupFailures.recordFailure({ key: 'late', residentId: 'late', at: 1000 });
cleanupFailures.clearSuccess('early');
assert.equal(cleanupClock.pending()[0].at, 2500, 'success reschedules remaining resident');
cleanupFailures.recordFailure({ key: 'obsolete', residentId: 'changing' });
cleanupFailures.retainResidentKey('changing', 'new-pose');
assert.equal(cleanupClock.pending()[0].at, 2500, 'obsolete-key removal preserves other deadlines');
cleanupFailures.recordFailure({ key: 'also-late', residentId: 'other', at: 1000 });
cleanupClock.setTime(9000);
cleanupClock.fire(cleanupClock.pending()[0].id);
assert.equal(cleanupWakes, 1, 'all due occurrences share one revision wakeup');
assert.equal(cleanupClock.pending().length, 0, 'hidden/in-flight work has no repeated overdue timer');
cleanupFailures.recordFailure({ key: 'late', residentId: 'late' });
assert.equal(cleanupClock.pending()[0].at, 14000);
const canceledCleanupTimer = cleanupClock.pending()[0].id;
cleanupFailures.clearSuccess('late');
assert.equal(cleanupClock.pending().length, 0, 'last unconsumed occurrence success cancels timer');
cleanupClock.stale(canceledCleanupTimer);
assert.equal(cleanupWakes, 1);
cleanupFailures.clearSuccess('also-late');
cleanupController.dispose();

// Execute the actual application setup/resolver with a tiny reactive-consumer
// harness. Only a revision notification schedules a new read of the cached view.
// Time advance never manually invokes the resolver or mutates resident state.
const staticClock = fakeClock();
let activeEffect = null, renderCalls = 0, wakeRevisions = 0, shown = null;
let inTimer = false;
const reactiveRef = initial => {
    let value = initial;
    const subscribers = new Set();
    return { get value() { if (activeEffect) subscribers.add(activeEffect); return value; }, set value(next) {
        value = next;
        if (inTimer) wakeRevisions += 1;
        for (const effect of subscribers) queueMicrotask(effect);
    } };
};
const app = { console, queueMicrotask, ref: reactiveRef, Date: { now: staticClock.now },
    setTimeout: staticClock.setTimer, clearTimeout: staticClock.clearTimer,
    getResidentForm: cat => cat.currentForm,
    getMapCatPose: cat => cat.statusActivity.posture,
    ensureCatVisualRenderer: async () => config => {
        assert.equal(inTimer, false, 'timer must never render directly');
        renderCalls += 1;
        if (renderCalls === 1) throw new Error('injected temporary failure');
        return { width: 1, height: 1, data: [0, 0, 0, 0], groundAnchor: [0, 1], config };
    },
    document: { createElement: () => ({ getContext: () => ({ putImageData() {} }), toDataURL: () => 'recovered-sprite' }) },
    ImageData: class { constructor(data) { this.data = data; } },
    catVisualErrorCategory: error => error.name,
    addLog() {}
};
vm.createContext(app);
vm.runInContext(helperSource, app);
app.residentVisual = app.Meeow.residentVisual;
const mapSetup = indexSource.slice(indexSource.indexOf('                const mapCatVisualRevision ='), indexSource.indexOf('                const drawCatVisualFrame ='));
assert.equal((mapSetup.match(/createSpriteRetryWakeup\(/g) || []).length, 1);
assert.doesNotMatch(mapSetup.slice(mapSetup.indexOf('function getMapCatVisualPresentation')), /createSpriteRetryWakeup|\.subscribe\(/);
assert.doesNotMatch(mapSetup, /greek-|querySelectorAll|TEMPORARY|console\.(?:info|log)/, 'Map recovery must remain generic and free of temporary tracing');
assert.match(mapSetup, /MAP CAT SPRITE FAILED: resident=/);
assert.match(mapSetup, /MAP CAT SPRITE RECOVERED: resident=/);
vm.runInContext(mapSetup, app);
app.testCat = vm.runInContext(`(${JSON.stringify({ ...recoveryResident, currentForm: 'CAT', statusActivity: { posture: 'standing' } })})`, app);
const staticResidentBefore = JSON.stringify(app.testCat);
const evaluateStaticMap = () => {
    activeEffect = evaluateStaticMap;
    try { shown = app.getMapCatVisualPresentation(app.testCat); }
    finally { activeEffect = null; }
};
const settleMicrotasks = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
evaluateStaticMap();
await settleMicrotasks();
assert.equal(shown, null);
assert.equal(renderCalls, 1);
assert.equal(staticClock.pending()[0].at, 1500);
staticClock.setTime(1499); await settleMicrotasks();
assert.equal(renderCalls, 1);
staticClock.setTime(1500);
inTimer = true;
staticClock.fire(staticClock.pending()[0].id);
inTimer = false;
assert.equal(wakeRevisions, 1, 'one deadline callback causes exactly one revision bump');
assert.equal(renderCalls, 1, 'retry waits for normal reactive consumption');
await settleMicrotasks();
assert.equal(renderCalls, 2);
assert.equal(shown.src, 'recovered-sprite', 'static Map recovers solely through deadline wakeup');
assert.equal(staticClock.pending().length, 0);
assert.equal(vm.runInContext('mapCatVisualFailures.size()', app), 0);
assert.equal(JSON.stringify(app.testCat), staticResidentBefore);
assert.equal(staticClock.maximum(), 1);
// UI contracts: one close guard, exact choices, existing form authority, and management-only editing entry.
assert.match(indexSource, /const requestCatVisualEditorClose =/);
for (const label of ['不保存', '继续编辑', '保存']) assert.ok(indexSource.includes(`>${label}<`));
assert.match(indexSource, /window\.addEventListener\('beforeunload'/);
assert.match(indexSource, /getResidentForm\(cat\) === 'CAT' && residentVisual\.normalizeVisual\(cat\.visual\)/);
assert.match(indexSource, /setCatVisualColor\('eyeLeft', \$event\.target\.value\)/);
assert.match(indexSource, /setCatVisualColor\('eyeRight', \$event\.target\.value\)/);
assert.match(indexSource, /class="cat-visual-paw-grid"/);
assert.match(indexSource, /class="cat-visual-paw-card"/);
assert.doesNotMatch(indexSource, /class="cat-visual-leg-row"/);
for (const key of ['frontLeft', 'frontRight', 'rearLeft', 'rearRight']) assert.match(indexSource, new RegExp(`\\{ key: '${key}'`));
assert.match(indexSource, /@media\(max-width:520px\)[^}]*cat-visual-controls\{grid-template-columns:1fr\}/);
assert.ok(indexSource.includes('#app .cat-visual-paw-grid{grid-template-columns:1fr;gap:8px}'));
assert.match(indexSource, /openManagedCatVisualEditor\(selectedCat\.id\)/);
assert.match(indexSource, /const openManagedCatVisualEditor = residentId =>/);
assert.match(indexSource, /cats\.value\.find\(cat => String\(cat\.id\) === String\(residentId\)\)/);
const managementMarkup = indexSource.slice(indexSource.indexOf('<!-- Edit Cat Modal'), indexSource.indexOf('<!-- Existing-resident cosmetic CAT appearance editor.'));
assert.ok(managementMarkup.includes('编辑猫咪形象'));
assert.ok(!managementMarkup.includes('共用白猫底图'));
const portfolioMarkup = indexSource.slice(indexSource.indexOf('<!-- Inner Voice Monologue -->'), indexSource.indexOf('<!-- Special Invite Banner -->'));
assert.ok(!portfolioMarkup.includes('编辑猫咪形象'));
assert.ok(indexSource.includes('handleSharedCatTemplateUpload'), 'legacy stored paint/template support remains available and is not destructively migrated');
assert.match(indexSource, /await nextTick\(\);\s*if \(!residentVisual\.isCurrentPreviewRequest\(token, catVisualPreviewToken, showCatVisualEditor\.value\)\) return false;\s*return drawCatVisualFrame\(catVisualPreviewCanvas\.value, rendered\.frame\)/);
assert.ok(indexSource.includes('CAT VISUAL POSE FALLBACK:'));
assert.ok(indexSource.includes('CAT VISUAL STANDING ERROR:'));
assert.ok(!/const getCatAvatarSource[\s\S]{0,300}residentVisual/.test(indexSource), 'shared avatar resolver must remain unchanged');
assert.ok(!fs.readFileSync(new URL('../js/meeow-truth-or-dare.js', import.meta.url), 'utf8').includes('residentVisual'));
assert.ok(!fs.readFileSync(new URL('../js/meeow-memory.js', import.meta.url), 'utf8').includes('identityConfig'));

// Map uses the narrow CAT-only visual branch while retaining the legacy avatar fallback.
assert.match(indexSource, /catVisual: getMapCatVisualPresentation\(marker\.cat\)/);
assert.match(indexSource, /v-if="marker\.catVisual" class="meeow-map-cat-sprite"/);
assert.match(indexSource, /v-else class="meeow-map-cat-avatar"/);
assert.match(indexSource, /if \(!cat \|\| getResidentForm\(cat\) !== 'CAT'\) return null/);
assert.match(indexSource, /resolveResidentVisual\(cat, \{ allowDerived: true \}\)/);
assert.match(indexSource, /const pose = getMapCatPose\(cat\)/);
assert.match(indexSource, /renderer\(resolved\.visual\.config, \{ pose: resolved\.pose \}\)/);
assert.doesNotMatch(indexSource, /mapCatVisualFailedKeys/);
assert.ok(indexSource.includes('const MAP_CAT_VISUAL_RETRY_DELAYS_MS = Object.freeze([1500, 5000, 15000, 30000])'));
assert.match(indexSource, /mapCatVisualFailures\.canAttempt\(resolved\.key\)/);
assert.match(indexSource, /mapCatVisualFailures\.clearSuccess\(resolved\.key\)/);
assert.match(indexSource, /mapCatVisualFailures\.retainResidentKey\(residentId, resolved\.key\)/);
assert.ok(indexSource.includes('MAP CAT SPRITE FAILED:'));
assert.ok(indexSource.includes('MAP CAT SPRITE RECOVERED:'));
assert.match(indexSource, /curatorRoomCatVisual = computed\(\(\) => curatorRoomResident\.value \? getMapCatVisualPresentation\(curatorRoomResident\.value\) : null\)/);
assert.match(indexSource, /'--meeow-map-anchor-x': `\$\{-placement\.anchorXPercent\}%`/);
assert.match(indexSource, /'--meeow-map-anchor-y': `\$\{-placement\.anchorYPercent\}%`/);
assert.match(indexSource, /if \(!result\.unchanged\) invalidateMapCatVisual\(resident\.id\)/);
assert.ok(indexSource.indexOf('if (!result.unchanged) invalidateMapCatVisual(resident.id)') > indexSource.indexOf('if (!result.ok)'), 'failed saves must return before sprite invalidation');

// Runtime keeps one shared renderer and lazily registers each non-base pose bank once.
assert.ok(!indexSource.includes('<script src="./js/meeow-cat-runtime.js"'));
assert.match(indexSource, /loadCatVisualScript\('\.\/js\/meeow-cat-runtime\.js'\)/);
assert.match(indexSource, /if \(!catVisualRendererPromise\) \{/);
assert.match(indexSource, /const catVisualPosePromises = new Map\(\)/);
assert.match(indexSource, /catVisualPosePromises\.set\(requestedPose, task\)/);
assert.match(indexSource, /registerFilePoseBank\(renderer, packedBank\)/);
const sittingBank = fs.readFileSync(new URL('../js/meeow-cat-bank-sitting.js', import.meta.url), 'utf8');
const standingBank = fs.readFileSync(new URL('../js/meeow-cat-bank-standing.js', import.meta.url), 'utf8');
const crouchingBank = fs.readFileSync(new URL('../js/meeow-cat-bank-crouching.js', import.meta.url), 'utf8');
const lyingBank = fs.readFileSync(new URL('../js/meeow-cat-bank-lying.js', import.meta.url), 'utf8');
assert.ok(!standingBank.includes('"pose":"crouching"'));
assert.ok(!standingBank.includes('"pose":"lying"'));
assert.ok(crouchingBank.includes('"pose":"crouching"'));
assert.ok(!crouchingBank.includes('"pose":"lying"'));
assert.ok(lyingBank.includes('"pose":"lying"'));
assert.ok(!lyingBank.includes('"pose":"crouching"'));
assert.ok(Buffer.byteLength(sittingBank) < 600_000);
assert.ok(Buffer.byteLength(standingBank) < 500_000);
assert.ok(Buffer.byteLength(crouchingBank) < 500_000);
assert.ok(Buffer.byteLength(lyingBank) < 150_000);
execFileSync(process.execPath, ['tools/build-resident-cat-runtime.mjs', '--check'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });

assert.equal((indexSource.match(/callAI\(/g) || []).length, 40);
console.log('Resident Homepage CAT visual fixture passed.');
