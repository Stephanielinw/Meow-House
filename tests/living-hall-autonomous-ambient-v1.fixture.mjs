import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('js/meeow-hall-spatial.js', root), 'utf8');
const postureSource = fs.readFileSync(new URL('js/meeow-status-posture.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const sandbox = vm.createContext({ window: {}, Math, Set, Map, Object, String });
vm.runInContext(source, sandbox);
vm.runInContext(postureSource, sandbox);
const spatial = sandbox.window.Meeow.hallSpatial;
const statusPosture = sandbox.window.Meeow.statusPosture;
const room = spatial.getRoom('gotham', 'living');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
const clock = () => {
    let time = 0, serial = 0;
    const timers = new Map(), frames = new Map();
    return {
        now: () => time,
        setTimer(callback, delay) { const id = ++serial; timers.set(id, { callback, at: time + delay }); return id; },
        clearTimer(id) { timers.delete(id); },
        requestFrame(callback) { const id = ++serial; frames.set(id, callback); return id; },
        cancelFrame(id) { frames.delete(id); },
        timerCount: () => timers.size,
        timerCallbacks: () => [...timers.values()].map(item => item.callback),
        frameCallbacks: () => [...frames.values()],
        nextTimer() {
            const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0] || [];
            assert.ok(timer, 'expected timer');
            timers.delete(id); time = Math.max(time, timer.at); timer.callback();
        },
        nextFrame(ms = 5000) {
            const [id, callback] = frames.entries().next().value || [];
            assert.ok(callback, 'expected frame');
            frames.delete(id); time += ms; callback();
        },
        advance(ms) { time += ms; }
    };
};
const start = (testRoom = room) => {
    const timer = clock(), changes = [], poses = new Map(), owners = new Set();
    let prepare = () => true, visualReady = () => true;
    const simulation = spatial.createAmbientSimulation({ room: testRoom,
        getAuthoritativePose: id => poses.get(id) || '',
        canOwnResident: id => !owners.has(id),
        prepareStandingVisual: id => prepare(id), isStandingVisualReady: id => visualReady(id),
        now: timer.now, setTimer: timer.setTimer, clearTimer: timer.clearTimer,
        requestFrame: timer.requestFrame, cancelFrame: timer.cancelFrame,
        onChange: snapshot => changes.push(plain(snapshot)) });
    const reconcile = entries => {
        for (const entry of entries) poses.set(entry.id, entry.authoritativePose ?? 'standing');
        simulation.reconcile(entries.map(entry => ({ ...entry,
            authoritativePose: entry.authoritativePose ?? 'standing' })));
    };
    return { timer, simulation, changes, poses, owners, reconcile,
        setPrepare: fn => { prepare = fn; }, setVisualReady: fn => { visualReady = fn; } };
};
const entry = (id, slot = 'rug-a', pose = 'standing', key = 'placement') =>
    ({ id, slot, authoritativePose: pose, key });
const row = (simulation, id) => plain(simulation.snapshot()).residents.find(item => item.id === id);
const tick = async timer => { timer.nextTimer(); await flush(); };
const cycle = async (timer, simulation, id) => {
    const before = row(simulation, id).cycles;
    for (let i = 0; i < 16 && row(simulation, id).cycles === before; i += 1) {
        if (timer.frameCallbacks().length) timer.nextFrame();
        else timer.nextTimer();
        await flush();
    }
    assert.equal(row(simulation, id).cycles, before + 1);
};
const settled = async (timer, simulation, id) => {
    assert.equal(row(simulation, id).state, 'settling');
    await tick(timer);
    assert.equal(row(simulation, id).ambientMotionPose, null);
    assert.equal(row(simulation, id).state, 'idle');
};

assert.equal(spatial.validateAmbientGraph(room), true);
for (const [id, slot] of Object.entries(room.ambientSlots)) {
    assert.equal(spatial.pointIsWalkable(room, slot), true, id);
    for (const neighbor of slot.neighbors) {
        const next = room.ambientSlots[neighbor];
        assert.equal(next.component, slot.component, 'rug and sofa stay disconnected');
        assert.ok(next.neighbors.includes(id));
        assert.equal(spatial.segmentIsWalkable(room, slot, next), true);
    }
}
assert.equal(room.ambientSlots['rug-a'].neighbors.includes('sofa-center'), false);
assert.equal(spatial.ambientEntrySlot(room, 'living-rug', { x: 443, y: 716 }), 'rug-a');
assert.equal(spatial.ambientEntrySlot(room, 'sofa-seat', { x: 578, y: 394 }), 'sofa-center');
assert.deepEqual(plain(spatial.placementFootFromStyle({ left: `${443 / 1024 * 100}%`, top: `${716 / 1024 * 100}%` })), { x: 443, y: 716 });

// A resting structured pose can stand, move, settle, and repeat with no Status refresh.
for (const pose of ['sitting', 'crouching', 'lying']) {
    const { timer, simulation, changes, reconcile, poses } = start();
    reconcile([entry('resting', 'rug-a', pose)]);
    const identity = 'resting';
    const initialFoot = row(simulation, identity).foot;
    await tick(timer); // idle decision and sprite preparation
    assert.equal(row(simulation, identity).state, 'transitioning');
    assert.equal(row(simulation, identity).transitionPhase, 'stand-up');
    assert.equal(row(simulation, identity).ambientMotionPose, 'standing');
    assert.deepEqual(row(simulation, identity).foot, initialFoot, 'foot fixed through pose switch');
    assert.ok(row(simulation, identity).target);
    await tick(timer); // 350 ms standing hold
    assert.equal(row(simulation, identity).state, 'moving');
    await cycle(timer, simulation, identity);
    assert.equal(row(simulation, identity).state, 'settling');
    assert.equal(row(simulation, identity).ambientMotionPose, 'standing');
    const arrivalFoot = row(simulation, identity).foot;
    await settled(timer, simulation, identity);
    assert.deepEqual(row(simulation, identity).foot, arrivalFoot, 'foot fixed through rest restoration');
    assert.equal(poses.get(identity), pose, 'structured Status remains unchanged');
    await cycle(timer, simulation, identity);
    await settled(timer, simulation, identity);
    assert.equal(row(simulation, identity).cycles, 2);
    assert.equal(poses.get(identity), pose);
    assert.ok(changes.some(change => change.residents.some(item => item.id === identity && item.transitionPhase === 'stand-up')));
}

// Stored Standing follows the direct route; no stand-up override or delay.
{
    const { timer, simulation, reconcile, changes } = start();
    reconcile([entry('standing')]);
    await tick(timer);
    assert.equal(row(simulation, 'standing').state, 'moving');
    assert.equal(row(simulation, 'standing').ambientMotionPose, null);
    assert.equal(changes.some(change => change.residents.some(item => item.transitionPhase === 'stand-up')), false);
    await cycle(timer, simulation, 'standing');
    await settled(timer, simulation, 'standing');
    await cycle(timer, simulation, 'standing');
}

// Legacy prose can make a visual Standing, but missing or invalid structured
// posture still cannot reserve, transition, or move.
assert.equal(statusPosture.resolveMapPose({ status: 'standing by the rug' }), 'standing');
for (const value of ['', 'invalid']) {
    const { timer, simulation, reconcile } = start();
    const pose = statusPosture.normalizeStatusActivity({ posture: value })?.posture || '';
    reconcile([entry('legacy', 'rug-a', pose)]);
    assert.equal(row(simulation, 'legacy').state, 'stationary');
    assert.equal(row(simulation, 'legacy').reason, 'missing-authoritative-pose');
    assert.equal(simulation.snapshot().occupied['rug-a'], 'legacy');
    assert.deepEqual(plain(simulation.snapshot().reserved), {});
    assert.equal(timer.timerCount(), 0);
}

// A stationary resident owns its slot. Other residents retry when no target is free.
{
    const twoSlots = { ...room, ambientSlots: {
        a: { ...room.ambientSlots['rug-a'], neighbors: ['b'] },
        b: { ...room.ambientSlots['rug-left'], neighbors: ['a'] }
    } };
    const { timer, simulation, reconcile } = start(twoSlots);
    reconcile([entry('resting', 'a', 'sitting'), entry('other', 'b'), entry('conflict', 'a')]);
    assert.equal(simulation.snapshot().occupied.a, 'resting');
    assert.equal(row(simulation, 'conflict').reason, 'entry-slot-conflict');
    await tick(timer);
    assert.equal(row(simulation, 'other').reason, 'no-free-target');
    assert.deepEqual(plain(simulation.snapshot().reserved), {});
}

// Visual preparation failure and delayed readiness release the target and retry.
{
    const { timer, simulation, reconcile, setPrepare, setVisualReady } = start();
    setPrepare(() => false);
    reconcile([entry('cat', 'rug-a', 'sitting')]);
    await tick(timer);
    assert.equal(row(simulation, 'cat').state, 'idle');
    assert.equal(row(simulation, 'cat').target, null);
    assert.deepEqual(plain(simulation.snapshot().reserved), {});
    setPrepare(() => true); setVisualReady(() => false);
    await tick(timer); // next decision
    await tick(timer); // standing hold
    assert.equal(row(simulation, 'cat').transitionPhase, 'standing-visual-pending');
    for (let i = 0; i < 110 && row(simulation, 'cat').transitionPhase === 'standing-visual-pending'; i += 1) await tick(timer);
    assert.equal(row(simulation, 'cat').state, 'idle');
    assert.equal(row(simulation, 'cat').target, null);
    assert.deepEqual(plain(simulation.snapshot().reserved), {});
}

// Accepted changes preempt every transient phase. Newly accepted posture wins.
for (const phase of ['preparing-standing', 'stand-up', 'moving', 'standing-settle']) {
    const { timer, simulation, reconcile, setPrepare } = start();
    let resolvePreparation;
    if (phase === 'preparing-standing') setPrepare(() => new Promise(resolve => { resolvePreparation = resolve; }));
    reconcile([entry('cat', 'rug-a', 'sitting')]);
    await tick(timer);
    if (phase === 'stand-up') assert.equal(row(simulation, 'cat').transitionPhase, phase);
    if (phase === 'moving' || phase === 'standing-settle') await tick(timer);
    if (phase === 'standing-settle') { await cycle(timer, simulation, 'cat'); }
    assert.equal(phase === 'moving' ? row(simulation, 'cat').state : row(simulation, 'cat').transitionPhase, phase);
    const staleFrame = timer.frameCallbacks()[0];
    const staleCallbacks = timer.timerCallbacks();
    reconcile([entry('cat', 'rug-a', 'lying')]);
    assert.equal(row(simulation, 'cat').authoritativePose, 'lying');
    assert.equal(row(simulation, 'cat').ambientMotionPose, null);
    assert.equal(row(simulation, 'cat').target, null);
    assert.deepEqual(plain(simulation.snapshot().reserved), {});
    const after = plain(simulation.snapshot());
    if (resolvePreparation) { resolvePreparation(true); await flush(); }
    if (staleFrame) { timer.advance(5000); staleFrame(); }
    for (const callback of staleCallbacks) callback();
    assert.deepEqual(plain(simulation.snapshot()), after, `stale callback in ${phase}`);
}

// Independent residents use separate transition generations and reservations.
{
    const { timer, simulation, reconcile } = start();
    reconcile([entry('rug', 'rug-a', 'sitting'), entry('sofa', 'sofa-left', 'lying')]);
    await tick(timer);
    const second = row(simulation, 'sofa');
    assert.ok(row(simulation, 'rug') && second);
    assert.ok(Object.keys(simulation.snapshot().reserved).length >= 1);
    simulation.cancel('rug', 'accepted-hall-scene', 0);
    assert.equal(row(simulation, 'rug').ambientMotionPose, null);
    assert.equal(row(simulation, 'sofa').transitionGeneration, second.transitionGeneration);
    await cycle(timer, simulation, 'sofa');
    assert.equal(row(simulation, 'sofa').cycles, 1);
    assert.equal(new Set(Object.values(simulation.snapshot().occupied)).size,
        Object.values(simulation.snapshot().occupied).length);
}

// Decision-time authority loss, unrelated updates, same-pose rerender and owner gates.
{
    const { timer, simulation, poses, owners, reconcile } = start();
    const a = entry('a', 'rug-a', 'sitting'), b = entry('b', 'sofa-left', 'lying');
    reconcile([a, b]);
    const before = row(simulation, 'a');
    reconcile([b, a]);
    assert.deepEqual(row(simulation, 'a'), before);
    reconcile([a, { ...b, authoritativePose: 'crouching' }]);
    assert.deepEqual(row(simulation, 'a'), before);
    poses.set('a', '');
    await tick(timer);
    assert.equal(row(simulation, 'a').state, 'stationary');
    assert.equal(row(simulation, 'a').target, null);
    assert.deepEqual(plain(simulation.snapshot().reserved), {});
    owners.add('b');
    reconcile([a, { ...b, authoritativePose: 'crouching' }]);
    assert.equal(row(simulation, 'b'), undefined);
    owners.delete('b');
    reconcile([a, { ...b, authoritativePose: 'crouching' }]);
    assert.equal(row(simulation, 'b').state, 'idle');
}

assert.match(html, /getHallMapCatVisualPresentation\(marker\.cat, motionPose\)/);
assert.match(html, /getSpatialAmbientEntries = \(\) => mapCatMarkers\.value/);
assert.match(html, /getStructuredStatusPose = cat => statusPosture\.normalizeStatusActivity\(cat\?\.statusActivity\)/);
assert.match(html, /canOwnResident: id => !hasHigherHallPresentationOwner\(id\)/);
assert.match(html, /getHallMapCatVisualPresentation\(cat, ambientMotionPose = null\)/);
assert.match(html, /getMapCatPose = cat => statusPosture\.resolveMapPose\(cat\)/);
assert.match(html, /makeGroundAnchorPlacement\(frame, 72\)/);
assert.match(html, /residentVisual\.resolveResidentVisual\(cat, \{ allowDerived: true \}\)/);
assert.doesNotMatch(html.slice(html.indexOf('function getHallMapCatVisualPresentation'),
    html.indexOf('const invalidateMapCatVisual')), /statusActivity\s*=|scheduleSave|callAI\(/);
assert.doesNotMatch(source, /callAI\(|localStorage|scheduleSave|persistNow/);
assert.equal((html.match(/\bcallAI\(/g) || []).length, 38);
console.log('Living Hall Ambient Posture / Motion Transition Foundation V1: PASS');
