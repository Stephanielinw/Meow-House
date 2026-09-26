import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const visuals = require('../js/meeow-item-visuals.js');
const pixel = require('../js/meeow-item-pixel-editor.js');
const at = (pixels, x, y) => Array.from(pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
const red = [255, 0, 0, 255], blue = [0, 0, 255, 255], clear = [0, 0, 0, 0];

const drawing = pixel.emptyPixels();
assert.equal(pixel.setPixel(drawing, 1, 2, red), true);
assert.deepEqual(at(drawing, 1, 2), red);
assert.equal(pixel.setPixel(drawing, 1.5, 2, red), false, 'fractional writes are rejected');
pixel.drawLine(drawing, { x: 2, y: 2 }, { x: 6, y: 4 }, blue);
for (const point of [[2,2],[3,3],[4,3],[5,4],[6,4]]) assert.deepEqual(at(drawing, ...point), blue);
assert.equal(pixel.setPixel(drawing, 1, 2, clear), true);
assert.deepEqual(at(drawing, 1, 2), clear);

const fill = pixel.emptyPixels();
for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) pixel.setPixel(fill, x, y, red);
pixel.setPixel(fill, 2, 2, clear);
assert.equal(pixel.floodFill(fill, 2, 2, blue), true);
assert.deepEqual(at(fill, 2, 2), blue);
assert.deepEqual(at(fill, 1, 1), red);
assert.deepEqual(pixel.hexToRgba('#12abef'), [18, 171, 239, 255]);
assert.equal(pixel.rgbaToHex([18, 171, 239, 255]), '#12abef');

const rect = pixel.createRectMask({ x: 2, y: 3 }, { x: 5, y: 6 });
assert.deepEqual(pixel.getMaskBounds(rect), { x: 2, y: 3, width: 4, height: 4 });
const lasso = pixel.createLassoMask([{ x: 10, y: 10 }, { x: 16, y: 10 }, { x: 10, y: 16 }]);
assert.equal(lasso[11 * 64 + 11], 1);
assert.equal(lasso[16 * 64 + 16], 0);
const masked = pixel.emptyPixels();
assert.equal(pixel.setPixel(masked, 3, 4, red, rect), true);
assert.equal(pixel.setPixel(masked, 20, 20, red, rect), false);

const selected = pixel.captureSelection(masked, rect);
assert.deepEqual([selected.x, selected.y, selected.width, selected.height], [2, 3, 4, 4]);
const up = pixel.scaleSelection(selected, 8, 6);
const down = pixel.scaleSelection(up, 3, 2);
assert.deepEqual([up.width, up.height, down.width, down.height], [8, 6, 3, 2]);
const sourceColors = new Set(Array.from({ length: selected.pixels.length / 4 }, (_, i) => selected.pixels.slice(i * 4, i * 4 + 4).join(',')));
for (let i = 0; i < up.pixels.length; i += 4) assert.ok(sourceColors.has(up.pixels.slice(i, i + 4).join(',')), 'nearest-neighbor adds no colors');
assert.equal(pixel.countPartialAlpha(up.pixels), 0);
assert.deepEqual([pixel.flipSelection(selected, true).width, pixel.flipSelection(selected, false).height], [4, 4]);
assert.deepEqual([pixel.rotateSelection(selected, 90).width, pixel.rotateSelection(selected, 90).height], [4, 4]);
assert.deepEqual([pixel.rotateSelection({ ...selected, width: 4, height: 2, pixels: selected.pixels.slice(0, 32), mask: selected.mask.slice(0, 8) }, 90).width,
    pixel.rotateSelection({ ...selected, width: 4, height: 2, pixels: selected.pixels.slice(0, 32), mask: selected.mask.slice(0, 8) }, 90).height], [2, 4]);
const clipped = pixel.compositeSelection(pixel.emptyPixels(), { ...selected, x: -3, y: -3 });
assert.ok(clipped.clippedOpaque >= 0);

const payloadPixels = pixel.emptyPixels(); pixel.setPixel(payloadPixels, 0, 0, red);
const custom = pixel.buildCustomPixelVisual(payloadPixels);
assert.equal(custom.mode, 'custom-pixel');
assert.deepEqual(pixel.pixelsFromVisual(custom), payloadPixels);
assert.equal(pixel.buildCustomPixelVisual(pixel.emptyPixels()), null);
const partial = pixel.emptyPixels(); partial.set([1, 2, 3, 128], 0);
assert.equal(pixel.buildCustomPixelVisual(partial), null);
assert.deepEqual(JSON.parse(JSON.stringify(custom)), custom, 'custom visual round-trips through save JSON');

const inventoryContext = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../js/meeow-semantics.js', import.meta.url), 'utf8'), inventoryContext);
vm.runInContext(readFileSync(new URL('../js/meeow-inventory.js', import.meta.url), 'utf8'), inventoryContext);
const inventory = inventoryContext.window.Meeow.inventory;
const first = { id: 'same', uniqueId: 101, visual: custom }, second = { id: 'same', uniqueId: 102 }, third = { id: 'same', uniqueId: 103 };
const items = [first, second, third];
assert.equal(inventory.resolveInventoryInstanceByUniqueId(items, 102), second);
items.reverse();
assert.equal(inventory.resolveInventoryInstanceByUniqueId(items, 102), second, 'stack reorder preserves exact physical target');
items.splice(items.indexOf(second), 1);
assert.equal(inventory.resolveInventoryInstanceByUniqueId(items, 102), null, 'removed target never falls back');
assert.equal(inventory.resolveInventoryInstanceByUniqueId([{ uniqueId: 4 }, { uniqueId: 4 }], 4), null, 'duplicate uniqueId is ambiguous');
assert.equal(inventory.resolveInventoryInstanceByUniqueId([{ uniqueId: '4' }], 4), null, 'uniqueId comparison is strict');
const commitItems = [{ id: 'same', uniqueId: 1 }, { id: 'same', uniqueId: 2 }];
commitItems.reverse();
assert.equal(inventory.commitInventoryInstanceVisual(commitItems, 1, custom, () => true).ok, true);
assert.equal(commitItems.find(item => item.uniqueId === 1).visual.mode, 'custom-pixel');
assert.equal(commitItems.find(item => item.uniqueId === 2).visual, undefined, 'only captured physical instance changes');
const previous = commitItems[0].visual;
assert.equal(inventory.commitInventoryInstanceVisual(commitItems, 2, custom, () => false).reason, 'persistence-failed');
assert.equal(commitItems.find(item => item.uniqueId === 2).visual, undefined, 'failed persistence rolls back');
assert.equal(commitItems[0].visual, previous);
assert.equal(inventory.commitInventoryInstanceVisual(commitItems, 999, custom, () => true).reason, 'target-missing-or-ambiguous');
const signatureA = inventory.getInventoryDefinitionSignature({ id: 'same', name: 'x', type: 'collectible', visual: custom });
const signatureB = inventory.getInventoryDefinitionSignature({ id: 'same', name: 'x', type: 'collectible' });
assert.equal(signatureA, signatureB, 'cosmetic custom pixels do not alter stack identity');

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /resolveInventoryInstanceByUniqueId\(user\.inventory, item\.uniqueId\)/);
assert.match(page, /commitInventoryInstanceVisual\(user\.inventory, uniqueId, normalized, persistNow\)/);
assert.doesNotMatch(page.slice(page.indexOf('const saveItemPixelVisual'), page.indexOf('const useItem = async', page.indexOf('const saveItemPixelVisual'))), /group\.instances\[0\]/);
assert.match(page, /Object\.hasOwn\(builtInFoodSpriteIds, item\.id\)/);
const editorSource = readFileSync(new URL('../js/meeow-item-pixel-editor.js', import.meta.url), 'utf8');
assert.match(editorSource, /<meeow-item-visual :item="previewItem" size="small"/);
assert.doesNotMatch(editorSource, /game[^\n]{0,80}32×32/i, 'game preview does not define a separate authoritative size');

const manifest = JSON.parse(readFileSync(new URL('../assets/meeow-item-source/house-style-food-v1/manifest.json', import.meta.url), 'utf8'));
for (const sprite of manifest.sprites) {
    const sha = path => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
    assert.equal(sha(sprite.file), sprite.sha256, `locked House Food runtime unchanged: ${sprite.id}`);
    assert.equal(sha(sprite.sourceFile), sprite.sha256, `locked House Food source unchanged: ${sprite.id}`);
}
assert.equal((page.match(/callAI\(/g) || []).length, 40);
console.log('Custom Item Pixel Editor V1 fixture: PASS');
