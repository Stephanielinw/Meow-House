import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const spatialSource = read('js/meeow-hall-spatial.js'), html = read('index.html');
const context = vm.createContext({ window: {}, console });
vm.runInContext(spatialSource, context);
const spatial = context.window.Meeow.hallSpatial;
assert.equal(typeof spatial.resolveResidentPixelHit, 'function');
let samples = 0;
const frame = (opaque) => {
    const data = new Uint8ClampedArray(10 * 10 * 4);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++)
        data[(y * 10 + x) * 4 + 3] = opaque(x, y) ? 255 : 0;
    return { width: 10, height: 10, data: new Proxy(data, {
        get(target, key) { if (/^\d+$/.test(String(key))) samples++; return Reflect.get(target, key, target); }
    }) };
};
const body = frame((x, y) => (y < 4 ? x >= 3 && x <= 6 : x >= 2 && x <= 7));
const resident = (id, x, y, depth, visual = body) => ({ id, kind: 'resident', x, y,
    width: 140, height: 140, footX: x + 70, depthY: depth, facing: 'left',
    marker: { cat: { id }, catVisual: { key: id + ':standing', clearanceFrame: visual } } });
const hit = (scene, x, y) => spatial.resolveResidentPixelHit(scene, { x, y })?.id || null;

const separate = spatial.orderSceneEntities([resident('a', 0, 0, 140), resident('b', 200, 0, 140)]);
assert.equal(hit(separate, 70, 35), 'a');
assert.equal(hit(separate, 270, 35), 'b');
assert.equal(hit(separate, 0, 0), null, 'transparent rectangle is not intentional click padding');

// Close cats: the front transparent rectangle covers the exposed rear head/body.
const scene = spatial.orderSceneEntities([resident('rear', 0, 0, 140), resident('front', 42, 14, 154)]);
const frozen = JSON.stringify(scene);
assert.equal(hit(scene, 45, 35), 'rear', 'exposed rear head');
assert.equal(hit(scene, 45, 85), 'rear', 'exposed rear body');
assert.equal(hit(scene, 100, 90), 'front', 'both opaque: existing painter order wins');
assert.equal(hit(scene, 175, 30), null, 'transparent front padding cannot claim a click');
assert.equal(hit(scene, NaN, 0), null);

const asym = frame(x => x < 2);
const mirror = spatial.orderSceneEntities([{ ...resident('mirror', 10, 10, 100, asym), facing: 'right', footX: 100 }]);
assert.equal(hit(mirror, 180, 50), 'mirror', 'SVG mirrors around footX, not rectangular midpoint');
assert.equal(hit(mirror, 20, 50), null);
const reversedDepth = spatial.orderSceneEntities([resident('rear', 0, 0, 200), resident('front', 42, 14, 154)]);
assert.equal(hit(reversedDepth, 100, 90), 'rear');
assert.equal(JSON.stringify(scene), frozen, 'hit tests do not mutate placement/order/frame identity');

// Exercise actual production pointer adapter and existing tap/detail handlers.
const routing = html.slice(html.indexOf('                const openMapCatDetail ='), html.indexOf('                const triggerEasterEgg ='));
let timer = null, nextTimer = 0, opened = [], measurements = 0;
const fireTimer = () => { const fn = timer; timer = null; fn(); };
const preview = { value: null };
const routingContext = vm.createContext({ hallSpatial: spatial, roomSceneEntities: { value: scene },
    roomSpatialReady: { value: true }, spatialStage: { value: { querySelector() { return {
        getBoundingClientRect() { measurements++; return { left: 100, top: 200, width: 512, height: 512 }; }
    }; } } }, mapPreviewCat: preview, mapTapTimer: null, mapTapCatId: null,
    handleCatClick: cat => opened.push(cat.id), window: {
        setTimeout(fn) { timer = fn; return ++nextTimer; }, clearTimeout() { timer = null; }
    } });
vm.runInContext(routing + '\nglobalThis.pointer = handleMapResidentPointer;', routingContext);
const pointer = (x, y, cat = scene[1].marker.cat, detail = false) => routingContext.pointer(
    { clientX: 100 + x / 2, clientY: 200 + y / 2, detail: detail ? 2 : 1 }, cat, detail);
pointer(45, 35); fireTimer(); assert.equal(preview.value.id, 'rear');
pointer(100, 90); fireTimer(); assert.equal(preview.value.id, 'front');
pointer(45, 85, null, true); assert.deepEqual(opened, ['rear']);
pointer(175, 30); assert.equal(timer, null, 'no rectangle-only fallback for prepared sprites');
routingContext.pointer({ detail: 0 }, scene[1].marker.cat); fireTimer(); assert.equal(preview.value.id, 'front', 'keyboard retains focused resident');
pointer(45, 35); pointer(45, 35); assert.deepEqual(opened, ['rear', 'rear'], 'existing double-tap flow');
routingContext.pointer({ detail: 2, clientX: 122.5, clientY: 217.5, target: { closest: () => ({}) } }, null, true);
assert.deepEqual(opened, ['rear', 'rear'], 'fridge/moment controls must not become resident double-clicks');
const before = samples, measured = measurements;
for (let i = 0; i < 10000; i++) {
    scene.map(entity => [entity.id, entity.x, entity.y, entity.zIndex, entity.marker.catVisual.key]); // unchanged projection never reads alpha
}
assert.equal(samples, before); assert.equal(measurements, measured);
assert.equal(JSON.stringify(scene), frozen);
const avatar = { id: 'avatar' };
routingContext.roomSceneEntities.value = [{ id: avatar.id, kind: 'resident', marker: { cat: avatar } }];
pointer(20, 20, avatar); fireTimer(); assert.equal(preview.value.id, avatar.id, 'existing non-sprite avatar hit remains');

const stage = html.slice(html.indexOf('<div ref="spatialStage"'), html.indexOf('<img v-if="!roomSpatialReady"'));
assert.match(stage, /@click="handleMapResidentPointer\(\$event\)"/);
assert.match(stage, /@dblclick\.prevent="handleMapResidentPointer\(\$event, null, true\)"/);
assert.match(stage, /@click\.stop="handleMapResidentPointer\(\$event, entity\.marker\.cat\)"/);
assert.match(stage, /@dblclick\.stop\.prevent="handleMapResidentPointer\(\$event, entity\.marker\.cat, true\)"/);
assert.match(stage, /zIndex: entity.zIndex \+ 0.1/);
assert.match(stage, /translate\('\s*\+\s*\(2 \* entity\.footX\)/);
assert.match(html.slice(html.lastIndexOf('hallDisplayMode, setHallDisplayMode')), /handleMapResidentPointer/);
const helper = spatialSource.slice(spatialSource.indexOf('const resolveResidentPixelHit'), spatialSource.indexOf('// All authority here'));
assert.doesNotMatch(helper, /Image\(|createElement|drawImage|getImageData|\.sort\(|\.set\(/);
assert.doesNotMatch(routing, /save|callAI\(|reconcile|groundEntry|invalidate|position\s*=/);
assert.equal((html.match(/hallSpatial\.resolveResidentPixelHit\(/g) || []).length, 1, 'only the actual pointer adapter reads alpha');
console.log('PASS overlapping resident click: exposed alpha, canonical opaque overlap, mirror/scale, keyboard/avatar, existing preview/detail, unchanged placement, zero render/reconcile pixel work.');
