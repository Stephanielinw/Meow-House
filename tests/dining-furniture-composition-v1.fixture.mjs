import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = JSON.parse(read('assets/meeow-map/dining/spatial/room-spatial.json'));
const html = read('index.html'), ctx = vm.createContext({ window: {}, console });
vm.runInContext(read('js/meeow-hall-spatial.js'), ctx);
ctx.source = source;
// Actual production furniture projection, not a separately implemented sorter.
const start = html.indexOf('const layers = source.layerOrder.map(');
const end = html.indexOf('const width = MAP_CAT_DISPLAY_WIDTH;', start);
vm.runInContext(html.slice(start, end) + '\nglobalThis.layers = layers;', ctx);
const spatial = ctx.window.Meeow.hallSpatial;
const ordered = spatial.orderSceneEntities(ctx.layers);
const rank = name => ordered.findIndex(entity => entity.layer === name);
for (const chair of ['chair-a.png', 'chair-b.png']) {
    assert.ok(source.layerOrder.indexOf(chair) < source.layerOrder.indexOf('table.png'), 'canonical exported composition');
    assert.ok(rank(chair) < rank('table.png'), chair + ' must not paint over the table contrary to canonical composition');
    assert.ok(source.foregroundRelations.some(relation => relation.ownerLayer === 'table.png' &&
        relation.relatedSurfaceIds.includes('dining-' + chair.replace('.png', '') + '-surface-1')));
}
// All geometry, footprints, slots and deliberate disabled slots are unchanged.
const keys = ['floorWalkable','furnitureSurface','interactiveWalkableSurfaces','furnitureInteractions',
    'foregroundRelations','disabledInteractions','supportOffsets','groundEntry','presentationClearance','maskCounts'];
const geometry = JSON.stringify(Object.fromEntries(keys.map(key => [key, source[key]])));
assert.equal(createHash('sha256').update(geometry).digest('hex'), '57b8cd997f7f27609b7758d405960010e3e8bd583f80df68e9140886e492f6b7');
assert.equal(source.presentationClearance.groundSolidLayers.includes('table.png'), false, 'underpass not reclassified');
assert.equal(source.furnitureInteractions.find(slot => slot.furnitureId === 'table').presentation.aboveLayer, 'table.png');
const residents = [700, 799, 829, 830, 832, 900].map((footY, index) => ({ id: 'cat-' + index,
    kind: 'resident', depthY: footY, footX: 180, x: 110, y: footY - 140, width: 140, height: 140 }));
const baseline = { ...source.layerDepth, 'chair-b.png': 832 };
const old = spatial.orderSceneEntities([...ctx.layers.map(entity => ({ ...entity, depthY: baseline[entity.layer] })), ...residents]);
const current = spatial.orderSceneEntities([...ctx.layers, ...residents]);
const catData = scene => Array.from(scene).filter(entity => entity.kind === 'resident').map(({ id, depthY, footX, x, y, width, height }) =>
    [id, depthY, footX, x, y, width, height]);
assert.deepEqual(catData(current), catData(old), 'resident order, foot-Y, scale and placement unchanged');
assert.equal(current.find(entity => entity.layer === 'table.png').depthY, baseline['table.png']);
console.log('PASS actual dining table above BOTH chair layers per canonical composition; geometry/slots/underpass and resident foot-Y/order/placement unchanged.');
