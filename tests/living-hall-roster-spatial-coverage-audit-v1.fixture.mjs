import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCatRenderer, loadCatAssets } from '../js/meeow-cat-renderer.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = new URL('../', import.meta.url);
const context = vm.createContext({ window: {} });
for (const name of ['meeow-data', 'meeow-resident-visual', 'meeow-map', 'meeow-hall-spatial']) {
    vm.runInContext(fs.readFileSync(new URL(`js/${name}.js`, root), 'utf8'), context, { filename: name });
}
const { data, residentVisual: visual, map, hallSpatial } = context.window.Meeow;
const roster = data.ALL_BUILTIN_CATS;
const poses = ['standing', 'sitting', 'crouching', 'lying'];
const bodies = ['standard', 'chubby', 'slim', 'fluffy'];

const load = async relative => {
    const url = new URL(relative, root);
    const manifest = JSON.parse(fs.readFileSync(url, 'utf8'));
    const template = await loadCatAssets(manifest, new URL('.', url), async assetUrl =>
        sharp(fileURLToPath(assetUrl)).ensureAlpha().raw().toBuffer());
    return { manifest, template };
};
const sitting = await load('assets/meeow-cat/v1/manifest.json');
const renderer = createCatRenderer(sitting.template);
const definitions = [];
for (const pose of ['standing', 'crouching']) {
    for (const body of bodies) definitions.push(await load(`assets/meeow-cat/poses/${pose}-${body}-v1/manifest.json`));
}
definitions.push(await load('assets/meeow-cat/poses/lying-standard-v1/manifest.json'));
renderer.registerPoseTemplates(definitions);

assert.equal(roster.length, 55);
assert.equal(new Set(roster.map(cat => String(cat.id))).size, 55);
assert.equal(map.MAP_ROOM_DEFINITIONS.reduce((count, room) => count + room.zones.length, 0), 35);
assert.equal(Object.keys(hallSpatial.ROOMS).length, 1);
assert.equal(hallSpatial.validateAmbientGraph(hallSpatial.getRoom('gotham', 'living')), true);
const bodyCount = Object.fromEntries(bodies.map(body => [body, 0]));
let rendered = 0;
for (const cat of roster) {
    const resolved = visual.resolveResidentVisual(cat, { allowDerived: true });
    assert.ok(resolved, `${cat.id}: visual unavailable`);
    assert.ok(bodies.includes(resolved.config.body), `${cat.id}: invalid body`);
    bodyCount[resolved.config.body] += 1;
    for (const pose of poses) {
        assert.equal(renderer.hasPose(pose, resolved.config.body), true, `${cat.id}: ${pose} unavailable`);
        const frame = renderer(resolved.config, { pose });
        assert.equal(frame.pose, pose, `${cat.id}: wrong rendered pose`);
        assert.equal(frame.config.body, resolved.config.body, `${cat.id}: body changed`);
        assert.ok(frame.data.some((_, index) => index % 4 === 3 && frame.data[index] > 0), `${cat.id}: empty ${pose}`);
        const anchor = visual.makeGroundAnchorPlacement(frame, 72);
        assert.ok(Number.isFinite(anchor.anchorXPercent) && Number.isFinite(anchor.anchorYPercent),
            `${cat.id}: invalid ${pose} ground anchor`);
        rendered += 1;
    }
}

// Generated residents use saved visual authority and are not members of the built-in roster.
const generated = { id: 'resident:audit-generated', hallId: 'gotham',
    visual: visual.makeVisual(null, visual.DEFAULT_CONFIG).visual,
    statusActivity: { posture: 'standing' } };
assert.equal(roster.some(cat => cat.id === generated.id), false);
const generatedVisual = visual.resolveResidentVisual(generated, { allowDerived: true });
assert.equal(generatedVisual.source, 'saved');
for (const pose of poses) {
    const frame = renderer(generatedVisual.config, { pose });
    assert.equal(frame.pose, pose);
}
const rug = hallSpatial.getRoom('gotham', 'living');
assert.equal(hallSpatial.ambientEntrySlot(rug, 'living-rug', { x: 443, y: 716 }), 'rug-a');
assert.equal(hallSpatial.ambientEntrySlot(rug, 'sofa-seat', { x: 578, y: 394 }), 'sofa-center');
assert.equal(hallSpatial.ambientEntrySlot(rug, 'bookshelf-top', { x: 190, y: 120 }), null);
assert.equal(hallSpatial.getRoom('gotham', 'dorm'), null);
assert.equal(hallSpatial.getRoom('gotham', 'dining'), null);
// Admission is keyed by the supplied resident ID and a legal spatial entry,
// without consulting ALL_BUILTIN_CATS. Exercise every built-in and a generated ID.
let nextTimer = 0;
const simulation = hallSpatial.createAmbientSimulation({ room: rug,
    getAuthoritativePose: () => 'standing', canOwnResident: () => true,
    prepareStandingVisual: () => true, isStandingVisualReady: () => true,
    now: () => 0, setTimer: () => ++nextTimer, clearTimer: () => {}, onChange: () => {} });
for (const cat of [...roster, generated]) {
    simulation.reconcile([{ id: cat.id, slot: 'rug-a', key: cat.id, authoritativePose: 'standing' }], true);
    assert.equal(simulation.snapshot().residents[0]?.id, cat.id);
    assert.equal(simulation.snapshot().occupied['rug-a'], cat.id);
}
simulation.stop();
console.log(JSON.stringify({ residents: roster.length, rendered, generatedRendered: poses.length,
    ambientAdmissions: roster.length + 1, bodyCount, mapPoints: 35,
    spatialRooms: Object.keys(hallSpatial.ROOMS) }, null, 2));
