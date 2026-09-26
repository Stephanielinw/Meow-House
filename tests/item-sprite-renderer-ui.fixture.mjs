import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const visuals = require('../js/meeow-item-visuals.js');
const inventoryContext = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../js/meeow-inventory.js', import.meta.url), 'utf8'), inventoryContext);
const inventory = inventoryContext.window.Meeow.inventory;
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const detailPresentation = readFileSync(new URL('../js/meeow-item-detail-presentation.js', import.meta.url), 'utf8');
const hint = { object: 'trinket', material: 'unknown', form: 'keepsake', context: 'travel' };
const frozen = (spriteId, mode = 'auto-sprite') => ({ icon: '🎁', visual: {
    version: 1, mode, spriteId, visualHint: mode === 'auto-sprite' ? hint : null
} });

for (const entry of visuals.registry) {
    const descriptor = visuals.getItemVisualDescriptor(frozen(entry.id, 'builtin-sprite'));
    assert.equal(descriptor.spriteId, entry.id);
    assert.equal(descriptor.file, entry.file);
    assert.deepEqual([descriptor.nativeWidth, descriptor.nativeHeight], [64, 64]);
}
assert.deepEqual(visuals.getItemVisualDescriptor({ icon: '🐚' }), { kind: 'legacy-icon', icon: '🐚' });
const fallback = { icon: '🐚', visual: { version: 1, mode: 'legacy-icon', spriteId: null,
    visualHint: { object: 'shell', material: 'organic', form: 'keepsake', context: 'travel' } } };
assert.deepEqual(visuals.getItemVisualDescriptor(fallback), { kind: 'legacy-icon', icon: '🐚' });

const historical = frozen('idylwild:inventory:stick');
const stored = JSON.stringify(historical);
assert.deepEqual(visuals.getItemVisualDescriptor(historical), { kind: 'legacy-icon', icon: '🎁' });
assert.equal(JSON.stringify(historical), stored, 'removed third-party ID remains stored byte-for-byte');
const originalResolver = visuals.resolveItemSpriteCandidate;
visuals.resolveItemSpriteCandidate = () => { throw new Error('render must not resolve'); };
assert.deepEqual(visuals.getItemVisualDescriptor(historical), { kind: 'legacy-icon', icon: '🎁' });
visuals.resolveItemSpriteCandidate = originalResolver;

const houseFood = visuals.getItemVisualDescriptor(frozen('housefood:salmon-steak', 'builtin-sprite'));
assert.equal(houseFood.sheetRect, null);
assert.deepEqual([visuals.getItemSpriteLayout(houseFood, 'small').width, visuals.getItemSpriteLayout(houseFood, 'large').width], [32, 64]);
const customBytes = new Uint8Array(64 * 64 * 4); customBytes.set([12, 34, 56, 255], 0);
const customItem = { icon: '🎁', visual: { version: 1, mode: 'custom-pixel', spriteId: null, visualHint: null,
    customPixel: { version: 1, width: 64, height: 64, encoding: 'rgba-base64', data: visuals.bytesToBase64(customBytes) } } };
const customDescriptor = visuals.getItemVisualDescriptor(customItem);
assert.equal(customDescriptor.kind, 'custom-pixel');
assert.deepEqual([visuals.getItemSpriteLayout(customDescriptor, 'small').width, visuals.getItemSpriteLayout(customDescriptor, 'large').width], [32, 64]);
assert.match(visuals.component.template, /@error="failed = true"/);
assert.match(visuals.component.template, /meeow-item-visual__sheet/);
assert.match(visuals.component.template, /meeow-item-visual__custom/);
const priorVue = globalThis.Vue;
const priorImageData = globalThis.ImageData;
const mounted = [];
globalThis.ImageData = class ImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
globalThis.Vue = { ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }), watch: () => {},
    nextTick: callback => callback(), onMounted: callback => mounted.push(callback) };
const brokenImage = visuals.component.setup({ item: frozen('housefood:salmon-steak', 'builtin-sprite'), size: 'small', legacyIcon: '' });
brokenImage.failed.value = true;
assert.equal(brokenImage.legacyDisplayIcon.value, '🎁', 'image failure retains the item legacy icon');
const oldMail = visuals.component.setup({ item: { icon: '🐚' }, size: 'small', legacyIcon: '🎁' });
assert.equal(oldMail.legacyDisplayIcon.value, '🎁', 'historical mail keeps its gift glyph');
const customRender = visuals.component.setup({ item: customItem, size: 'small', legacyIcon: '' });
let renderedPixels = null;
customRender.customCanvas.value = { getContext: () => ({ imageSmoothingEnabled: true, putImageData: value => { renderedPixels = value; } }) };
mounted.forEach(callback => callback());
assert.equal(renderedPixels?.width, 64);
assert.deepEqual(Array.from(renderedPixels?.data.slice(0, 4) || []), [12, 34, 56, 255]);
if (priorVue === undefined) delete globalThis.Vue; else globalThis.Vue = priorVue;
if (priorImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = priorImageData;

assert.match(page, /image-rendering: pixelated/);
assert.match(page, /'meeow-item-visual': window\.Meeow\.itemVisuals\.component/);
assert.match(page, /<meeow-item-visual :item="group\.representativeItem" size="small"/);
assert.match(page, /<meeow-item-detail-presentation :item="selectedBagItem"/);
assert.match(detailPresentation, /<meeow-item-visual :item="item" size="large"/);
assert.match(page, /<meeow-item-visual :item="mail\.item" size="small" legacy-icon="🎁"/);
assert.match(page, /<meeow-item-visual :item="exploreState\.settlement\.loot" size="medium"/);
assert.equal((page.match(/<meeow-item-visual :item="item"/g) || []).length, 4,
    'Shop, gift chooser, and resident inventory use the shared renderer');

const catalogItem = { id: 'custom:toy', name: '旅途玩具', icon: '🎲', type: 'consumable', category: 'toy', effect: 1 };
const copies = [
    { ...catalogItem, uniqueId: 1, visual: frozen('nikoichu:maynia:29-against-all-odds').visual },
    { ...catalogItem, uniqueId: 2, visual: frozen('nikoichu:maynia:8-by-itself').visual }
];
const originalCopies = JSON.stringify(copies);
const groups = inventory.deriveInventoryDisplayGroups(copies, [catalogItem]);
assert.equal(groups.length, 1, 'cosmetic identity does not split compatible ordinary items');
assert.equal(groups[0].quantity, 2);
assert.equal(groups[0].representativeItem.visual.spriteId, 'nikoichu:maynia:29-against-all-odds');
assert.deepEqual(visuals.getItemVisualDescriptor(groups[0].representativeItem), { kind: 'legacy-icon', icon: '🎲' });
assert.equal(JSON.stringify(copies), originalCopies, 'grouping preserves both historical sprite IDs');
assert.equal(visuals.registry.length, 62);

console.log('Item sprite renderer UI fixture: PASS');
