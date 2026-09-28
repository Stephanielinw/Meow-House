import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const moduleSource = readFileSync(new URL('../js/meeow-curator-placement.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(moduleSource, context, { filename: 'meeow-curator-placement.js' });
const placement = context.window.Meeow.curatorPlacement;

assert.equal(placement.CANONICAL_SIZE, 1024);
assert.deepEqual(Object.keys(placement.COMPATIBILITY_FEET).sort(),
    ['bed', 'desk', 'floor', 'nightstand', 'wardrobe', 'window']);
assert.equal(placement.getCompatibilityFoot('window').x, 570);
assert.equal(placement.getCompatibilityFoot('window').y, 400);
assert.equal(placement.getCompatibilityFoot('window').surface, 'curator-floor');
assert.equal(placement.getCompatibilityFoot('unknown'), placement.COMPATIBILITY_FEET.floor);
assert.equal(Object.isFrozen(placement.COMPATIBILITY_FEET), true);
assert.doesNotMatch(moduleSource, /Odysseus|statusActivity|cat\.status|callAI\(|scheduleSave|route|navmesh/);

for (const [id, foot] of Object.entries(placement.COMPATIBILITY_FEET)) {
    const style = placement.getMarkerStyle(id);
    for (const stageSize of [1024, 768, 320]) {
        const projectedX = Number.parseFloat(style.left) * stageSize / 100;
        const projectedY = Number.parseFloat(style.top) * stageSize / 100;
        assert.ok(Math.abs(projectedX - foot.x * stageSize / 1024) < 1e-9);
        assert.ok(Math.abs(projectedY - foot.y * stageSize / 1024) < 1e-9);
    }
}

const start = html.indexOf('const CURATOR_ROOM_ANCHORS =');
const end = html.indexOf('const getCuratorRoomPresence =', start);
assert.ok(start >= 0 && end > start);
vm.runInContext(`${html.slice(start, end)}\nglobalThis.anchors = CURATOR_ROOM_ANCHORS;`, context);
assert.equal(context.anchors.window.label, '窗边');
assert.equal(context.anchors.window.x, undefined, 'legacy placeholder XY must not remain semantic authority');

const placementStart = html.indexOf('const getCuratorRoomAnchor =');
const placementEnd = html.indexOf('const showMapPointLabels =', placementStart);
assert.ok(placementStart >= 0 && placementEnd > placementStart);
const resident = { id: 'generic', curatorRoomPresence: { anchor: 'window' }, statusActivity: { posture: 'sitting' } };
const harness = { window: context.window, CURATOR_ROOM_ANCHORS: context.anchors,
    getCuratorRoomPresence: cat => cat.curatorRoomPresence };
vm.runInNewContext(`${html.slice(placementStart, placementEnd)}\nglobalThis.marker = getCuratorRoomMarkerStyle; globalThis.label = getCuratorRoomAnchorLabel;`, harness);
assert.equal(harness.label(resident), '窗边');
const sitting = harness.marker(resident);
resident.statusActivity.posture = 'standing';
assert.equal(harness.marker(resident).left, sitting.left);
assert.equal(harness.marker(resident).top, sitting.top);
assert.deepEqual(resident.curatorRoomPresence, { anchor: 'window' });
for (const id of Object.keys(placement.COMPATIBILITY_FEET)) {
    const generic = { id: 'generic', curatorRoomPresence: { anchor: id }, statusActivity: { posture: 'sitting' } };
    const expected = placement.getMarkerStyle(id);
    for (const pose of ['standing', 'sitting', 'crouching', 'lying']) {
        generic.statusActivity.posture = pose;
        assert.equal(harness.marker(generic).left, expected.left);
        assert.equal(harness.marker(generic).top, expected.top);
        assert.equal(harness.label(generic), context.anchors[id].label);
    }
    assert.deepEqual(generic.curatorRoomPresence, { anchor: id });
}

assert.match(html, /<script src="\.\/js\/meeow-curator-placement\.js"><\/script>/);
assert.match(html, /getMapCatVisualPresentation\(curatorRoomResident\.value\)/);
assert.match(html, /:style="\[getCuratorRoomMarkerStyle\(curatorRoomResident\), curatorRoomCatVisual\?\.style \|\| \{\}\]"/);
console.log('Curator Room legacy placement reconciliation V1: PASS');
