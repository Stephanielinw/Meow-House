// One ordinary production walk; no browser/provider, no changed movement policy.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
process.env.MEEOW_TRIAGE_IO_ONLY = '1';
// The older I/O harness predates the diagnostic module dependency. Supply the
// actual module and lifecycle no-ops before evaluating its current page slice.
const run = vm.runInContext;
vm.runInContext = (code, sandbox, ...args) => {
    if (code.includes('const MAP_CAT_DISPLAY_WIDTH =')) {
        run(readFileSync(new URL('../js/meeow-hall-hitch-diagnostic.js', import.meta.url), 'utf8'), sandbox);
        sandbox.onUpdated = sandbox.onUnmounted = sandbox.onMounted = sandbox.watch = () => {};
    }
    return run(code, sandbox, ...args);
};
let io;
try { io = await import('./normal-room-furniture-v1.fixture.mjs'); }
finally { vm.runInContext = run; }
const { ctx, nav, renderer, timer, html } = io;
const { DEFAULT_CONFIG } = await import('../js/meeow-cat-renderer.mjs');
const spatial = ctx.Meeow.hallSpatial;
const baselineHtml = execFileSync('git', ['show', '9ed3aa8805ffdf17e1213afaee9fb3bf57ee4645:index.html'], { maxBuffer: 8e6 }).toString();
const section = text => text.slice(text.indexOf('const roomGroundFootMemo ='), text.indexOf('const normalRoomPresentationState = computed'));
vm.runInContext(section(baselineHtml).replaceAll('roomGroundFootMemo', 'beforeGroundFootMemo')
    .replace('const roomSceneEntities =', 'const beforeSceneEntities =') + '\nglobalThis.beforeScene = beforeSceneEntities;', ctx);
vm.runInContext('globalThis.afterMemo = roomGroundFootMemo; globalThis.beforeMemo = beforeGroundFootMemo;', ctx);
vm.runInContext(readFileSync(new URL('../js/meeow-hall-hitch-diagnostic.js', import.meta.url), 'utf8'), ctx);
const diagnostic = ctx.Meeow.hallHitchDiagnostic.create({ now: () => performance.now(), observe: false,
    requestFrame: () => 1, cancelFrame: () => {} });
ctx.hitchDiagnostics = diagnostic;
ctx.hitchOrderScene = entities => spatial.orderSceneEntities(entities);
ctx.spatialContextVisible = () => true;
const domain = await nav.loadRoomDomain('living');
ctx.worldDomain.value = domain;
ctx.activeMapRoom.value = 'living';
vm.runInContext('roomSpatialContextKey = normalRoomContextKey()', ctx);
const frame = renderer(DEFAULT_CONFIG, { pose: 'standing' });
const fits = point => domain.legalPoint(point) && [false, true].every(mirror =>
    domain.presentationFits(frame, point, 80 / frame.width, null, mirror));
const entries = [], cats = [], markers = [];
for (let n = 0; n < 12; n++) {
    const foot = domain.groundEntry({ x: 100 + n % 6 * 150, y: 760 + Math.floor(n / 6) * 150 }, entries.map(e => e.foot), fits, 144);
    assert.ok(foot, 'real room contains legal separated standing contacts');
    const cat = { id: `t3-resident-${n}`, hallId: 'production-hall', presence: 'hall', currentForm: 'CAT',
        statusActivity: { posture: 'standing' }, visual: ctx.Meeow.residentVisual.makeVisual(null, DEFAULT_CONFIG).visual };
    const marker = { cat, room: 'living', spot: 'floor', position: { left: `${foot.x / 1024 * 100}%`, top: `${foot.y / 1024 * 100}%` } };
    cats.push(cat); markers.push(marker);
    entries.push({ id: cat.id, foot, key: `production-hall|living|floor|${marker.position.left}|${marker.position.top}|` });
}
ctx.cats.value = cats; ctx.activeMapCatMarkers.value = markers;
for (const cat of cats) {
    assert.equal(await vm.runInContext(`prepareHallAmbientStandingVisual('${cat.id}', 'standing')`, ctx), true);
    const visual = vm.runInContext(`hallAmbientStandingVisuals.get('${cat.id}:standing')`, ctx);
    markers.find(m => m.cat === cat).catVisual = visual;
}
const realFits = domain.presentationFits;
let checks = 0;
domain.presentationFits = (...args) => { checks++; return realFits(...args); };
const stats = { before: { recomputations: 0, checks: 0, ms: [] }, after: { recomputations: 0, checks: 0, ms: [] } };
const project = name => {
    const before = checks, started = performance.now();
    const scene = (name === 'before' ? ctx.beforeScene : ctx.scene).value;
    const stat = stats[name]; stat.ms.push(performance.now() - started); stat.recomputations++; stat.checks += checks - before;
    return scene.filter(e => e.kind === 'resident').map(e => ({ id: e.id, x: e.footX, y: e.depthY,
        facing: e.facing, rank: e.zIndex, width: e.width, foreground: e.foreground }));
};
// Select one deterministic, fully visible reference route using the shipped
// destination/route policies. Only that route is executed/profiled.
let seed;
for (let n = 0; n < 16 && !seed; n++) {
    const candidateSeed = `t3-one-walk:${n}`;
    const candidate = nav.sampleDestination(domain, { from: entries[0].foot, claims: entries.slice(1).map(e => e.foot),
        seed: candidateSeed, acceptsPresentation: domain.groundPresentationPoint });
    const planned = candidate && nav.planRoute(domain, entries[0].foot, candidate);
    if (!planned?.valid) continue;
    const clear = planned.points.slice(1).every((to, index) => {
        const from = planned.points[index], steps = Math.ceil(nav.distance(from, to));
        return Array.from({ length: steps + 1 }, (_, k) => fits({ x: from.x + (to.x - from.x) * k / steps,
            y: from.y + (to.y - from.y) * k / steps })).every(Boolean);
    });
    if (clear) seed = candidateSeed;
}
assert.ok(seed, 'bounded reference selection finds one legal production route');
let route = null, target = null, snapshots = 0, finished = false, positions = [];
const simulation = spatial.createAmbientSimulation({
    navigation: { legalPoint: domain.legalPoint, lastAuthoredOnSegment: domain.lastAuthoredOnSegment,
        separation: nav.DESTINATION_SEPARATION,
        choose: (from, claims, recent) => {
            if (from.x !== entries[0].foot.x || from.y !== entries[0].foot.y || target) return null;
            target = nav.sampleDestination(domain, { from, claims, recent, seed, acceptsPresentation: domain.groundPresentationPoint });
            return target;
        },
        plan: (from, to) => (route = nav.planRoute(domain, from, to)) },
    getAuthoritativePose: () => 'standing', canOwnResident: () => true,
    now: timer.now, setTimer: timer.set, clearTimer: timer.clear,
    requestFrame: fn => timer.set(fn, 16), cancelFrame: timer.clear,
    onChange: snapshot => {
        snapshots++;
        ctx.spatialAmbientSnapshot.value = { ...snapshot, residents: snapshot.residents.map(r => ({ ...r, presentationFacing: 'left' })) };
        const before = project('before'), after = project('after');
        assert.deepEqual(JSON.parse(JSON.stringify(after)), JSON.parse(JSON.stringify(before)), 'same contacts, facing, 140 scale and foot-Y ordering on every publication');
        assert.ok(snapshot.residents.slice(1).every(row => after.some(e => e.id === row.id)), 'moving publication does not lose another resident');
        const moving = snapshot.residents[0];
        if (moving?.state === 'moving') positions.push({ ...moving.foot });
        if (moving?.cycles === 1) finished = true;
    }
});
ctx.spatialAmbientController = simulation;
simulation.reconcile(entries);
for (let n = 0; n < 2000 && !finished; n++) await timer.advance(16);
assert.ok(finished && route?.valid && target, 'production simulation accepts and completes its production-selected route');
assert.ok(positions.length > 5 && new Set(positions.map(p => `${p.x}:${p.y}`)).size > 5, 'dynamic foot continues to progress');
assert.deepEqual(JSON.parse(JSON.stringify(simulation.snapshot().residents[0].foot)), JSON.parse(JSON.stringify(target)));
assert.ok(positions.every(p => domain.transitPoint(p)), 'movement retains authored legal transit');
assert.ok(positions.slice(1).every((p, n) => nav.distance(p, positions[n]) <= spatial.PROTOTYPE_SPEED * .016 + 1e-6), 'speed and per-frame position publication remain intact');
assert.ok(ctx.scene.value.some(e => e.id === entries[0].id && e.footX === target.x && e.depthY === target.y), 'same legal destination is visibly published');
const walkBeforeChecks = stats.before.checks, walkAfterChecks = stats.after.checks, walkPublications = snapshots;
simulation.stop('t3-fixture-complete');
assert.ok(stats.after.checks < stats.before.checks / 2, 'unchanged residents materially reduce broad clearance work');

// Invalidation tests use the actual page projection and memo, without copied cache logic.
ctx.spatialAmbientSnapshot.value = { residents: entries.map(e => ({ ...e, state: 'activity', behaviorInstanceId: `${e.id}:settled`,
    transitionGeneration: 1, localActivityPose: 'standing', presentationFacing: 'left' })) };
project('after');
const query = () => { const before = checks; project('after'); return checks - before; };
assert.equal(query(), 0, 'identical successful ground queries do not repeat clearance');
const change = (label, mutate) => { mutate(); assert.ok(query() > 0, `${label} invalidates`); assert.equal(query(), 0, `${label} becomes reusable after full validation`); };
change('geometry version', () => { domain.geometryVersion++; });
const replacement = { ...domain };
change('domain replacement even with same geometry version', () => { ctx.worldDomain.value = replacement; });
change('viewport width', () => { ctx.spatialStageBounds.value = { width: 768, height: 768 }; });
change('viewport height', () => { ctx.spatialStageBounds.value = { width: 768, height: 760 }; });
change('episode', () => { ctx.spatialAmbientSnapshot.value.residents[0].behaviorInstanceId = 'replacement'; });
change('generation', () => { ctx.spatialAmbientSnapshot.value.residents[0].transitionGeneration++; });
change('placement identity', () => { markers[0].cat.mapPoint = 'new-placement'; ctx.spatialAmbientSnapshot.value.residents[0].key += 'new-placement';
    ctx.spatialAmbientSnapshot.value.residents[0].placementKey = ctx.spatialAmbientSnapshot.value.residents[0].key; });
// Snapshot rows from this direct authority fixture require the current production placement key.
for (const row of ctx.spatialAmbientSnapshot.value.residents) row.placementKey = row.key;
const visual = markers[0].catVisual;
change('clearance frame identity', () => { visual.clearanceFrame = { ...visual.clearanceFrame }; });
change('scale', () => { visual.nativeWidth += 1; });
change('orientation', () => { ctx.spatialAmbientSnapshot.value.residents[0].presentationFacing = 'right';
    // Reset the existing direction sample so this is an accepted new orientation.
    ctx.afterMemo.get(entries[0].id).facingSample = null;
});
// A genuine topology replacement must recheck, reject a newly blocked contact, and not publish old cached clearance.
const rejectDomain = { ...replacement, presentationFits: () => { checks++; return false; }, groundEntry: () => null,
    geometryVersion: replacement.geometryVersion + 1 };
ctx.worldDomain.value = rejectDomain;
const blocked = ctx.scene.value.filter(e => e.kind === 'resident');
assert.equal(blocked.length, 0, 'changed blocked geometry cannot inherit valid feet');
const blockedChecks = checks;
ctx.scene.value; assert.ok(checks > blockedChecks, 'failed/retained candidates never receive the success fast path');
// Room replacement uses the existing loader/domain/context path, not an invented topology registry.
const dining = await nav.loadRoomDomain('dining');
ctx.worldDomain.value = dining; ctx.activeMapRoom.value = 'dining';
vm.runInContext('roomSpatialContextKey = normalRoomContextKey()', ctx);
const diningFoot = dining.groundEntry(dining.source.groundEntry, [], p => dining.presentationFits(
    visual.clearanceFrame, p, 80 / visual.nativeWidth, null, false), 144);
assert.ok(diningFoot);
markers[0].room = 'dining'; markers[0].cat.mapPoint = '';
ctx.activeMapCatMarkers.value = [markers[0]];
ctx.spatialAmbientSnapshot.value = { residents: [{ id: entries[0].id, foot: diningFoot,
    behaviorInstanceId: 'dining-current', transitionGeneration: 1, localActivityPose: 'standing', presentationFacing: 'left' }] };
const diningFits = dining.presentationFits;
dining.presentationFits = (...args) => { checks++; return diningFits(...args); };
assert.ok(query() > 0, 'actual room/domain replacement recomputes clearance');
assert.equal(ctx.scene.value.filter(e => e.kind === 'resident').length, 1);
assert.equal(query(), 0, 'new legitimate room validation can then be reused');
// Preserve existing disabled traversal and footprint semantics.
assert.equal(domain.getInteraction('living-scratching-board-a-surface-1-slot').presentation.traversalDisabled, true);
const curator = await nav.loadCuratorDomain();
assert.equal(curator.getInteraction('curator-chair-sit').presentation.traversalDisabled, true);
assert.match(html, /const MAP_CAT_DISPLAY_WIDTH = 140;/);
assert.match(html, /const MAP_CAT_INTERACTION_WIDTH = 80;/);
assert.doesNotMatch(nav.presentationFits?.toString?.() || realFits.toString(), /occupied|reserved|claims/,
    'this clearance authority does not read resident occupancy');
const summary = Object.fromEntries(Object.entries(stats).map(([name, s]) => {
    // Restrict the profile to the identical walk, not later invalidation probes.
    const samples = s.ms.slice(0, walkPublications).sort((a, b) => a - b);
    return [name, { wholeRoomRecomputations: walkPublications, clearanceChecks: name === 'before' ? walkBeforeChecks : walkAfterChecks,
        projectionP95Ms: +samples[Math.ceil(samples.length * .95) - 1].toFixed(3), projectionWorstMs: +samples.at(-1).toFixed(3) }];
}));
diagnostic.dispose();
console.log('T3 focused walk and invalidation regressions PASS');
console.log(JSON.stringify({ scenario: '12 legal production-room residents; one production-selected walk; 16ms mock frames',
    scope: 'projection operation timings, not browser frame/paint timings', frames: positions.length, destination: target, ...summary }, null, 2));
