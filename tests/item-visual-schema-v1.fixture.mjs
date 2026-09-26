import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const visuals = require('../js/meeow-item-visuals.js');
const hint = Object.freeze({ object: 'shell', material: 'organic', form: 'keepsake', context: 'travel' });
const original = Object.freeze({ name: '湖边贝壳', icon: '🐚', desc: '光滑的小贝壳', visualHint: hint });
const shell = { ...visuals.registry[0], id: 'historical:pack:seashell', qualityTier: 'fallback',
    resolverEligible: true,
    objectTags: ['shell'], materialTags: ['organic'], formTags: ['keepsake'], contextTags: ['travel'] };
const newShell = { ...shell, id: 'test:primary:new-shell', qualityTier: 'primary' };
let scans = 0;
const countedRegistry = {
    [Symbol.iterator]: function* () { scans++; yield shell; }
};
const created = visuals.assignAutoVisualIdentity(original, countedRegistry);
assert.equal(scans, 1, 'creation resolves exactly once');
assert.equal(created.visual.mode, 'auto-sprite');
assert.equal(created.visual.spriteId, shell.id);
assert.deepEqual(created.visual.visualHint, hint);
assert.notStrictEqual(created.visualHint, hint);
assert.notStrictEqual(created.visual.visualHint, hint);
assert.equal(original.visual, undefined);
assert.equal(visuals.normalizeItemVisual(created.visual).spriteId, shell.id);
assert.equal(scans, 1, 'normalization never resolves');

const saved = JSON.parse(JSON.stringify(created));
const reloaded = JSON.parse(JSON.stringify(saved));
assert.equal(visuals.getItemVisualDescriptor(reloaded, [shell, newShell]).spriteId, shell.id,
    'a better registry candidate does not change saved identity');
assert.equal(scans, 1, 'reload and descriptor never resolve');
assert.equal(visuals.assignAutoVisualIdentity(original, [shell, newShell]).visual.spriteId, newShell.id,
    'a future new item may select the new candidate');
assert.deepEqual(visuals.getItemVisualDescriptor(reloaded, [newShell]), { kind: 'legacy-icon', icon: '🐚' });
assert.equal(reloaded.visual.spriteId, shell.id, 'missing asset does not rewrite stored identity');

const noMatch = visuals.assignAutoVisualIdentity(original, []);
assert.deepEqual(noMatch.visual, { version: 1, mode: 'legacy-icon', spriteId: null, visualHint: hint });
assert.deepEqual(visuals.getItemVisualDescriptor(JSON.parse(JSON.stringify(noMatch)), [shell]), { kind: 'legacy-icon', icon: '🐚' },
    'later registry expansion does not upgrade a no-match item');
assert.deepEqual(visuals.getItemVisualDescriptor({ icon: '🎁' }), { kind: 'legacy-icon', icon: '🎁' });
assert.equal(visuals.normalizeItemVisual(undefined), null);
const customBytes = new Uint8Array(64 * 64 * 4);
customBytes.set([255, 0, 0, 255], 0);
const customVisual = { version: 1, mode: 'custom-pixel', spriteId: null, visualHint: null,
    customPixel: { version: 1, width: 64, height: 64, encoding: 'rgba-base64', data: visuals.bytesToBase64(customBytes) } };
assert.deepEqual(visuals.normalizeItemVisual(customVisual), customVisual);
assert.equal(visuals.getItemVisualDescriptor(customVisual.mode ? { icon: '🎁', visual: customVisual } : null).kind, 'custom-pixel');
const partialBytes = new Uint8Array(customBytes); partialBytes[3] = 128;
assert.equal(visuals.normalizeItemVisual({ ...customVisual, customPixel: { ...customVisual.customPixel, data: visuals.bytesToBase64(partialBytes) } }), null);
assert.equal(visuals.normalizeItemVisual({ ...customVisual, customPixel: { ...customVisual.customPixel, data: visuals.bytesToBase64(new Uint8Array(64 * 64 * 4)) } }), null);
assert.equal(visuals.normalizeItemVisual({ ...created.visual, spriteId: 'unapproved' }), null);
assert.equal(visuals.normalizeItemVisual({ ...created.visual, visualHint: null }), null);
assert.equal(visuals.normalizeItemVisual({ ...noMatch.visual, spriteId: shell.id }), null);
assert.equal(visuals.createBuiltinItemVisual('missing:id', [shell]), null);
assert.deepEqual(visuals.createBuiltinItemVisual(shell.id, [shell]), {
    version: 1, mode: 'builtin-sprite', spriteId: shell.id, visualHint: null
});
assert.equal(visuals.validateAuthoredItemVisualHint({ ...original, visual: created.visual }), null,
    'AI cannot provide persistent visual identity');
assert.equal(visuals.validateAuthoredItemVisualHint({ ...original, mode: 'auto-sprite' }), null);
const gameplayItem = { ...original, type: 'consumable', semanticType: 'food', tags: ['family:fish', 'form:meal'], effect: { affinity: 2 } };
const gameplayCopy = JSON.parse(JSON.stringify(gameplayItem));
const cosmeticCopy = visuals.assignAutoVisualIdentity(gameplayItem, [shell]);
for (const key of ['type', 'semanticType', 'tags', 'effect']) assert.deepEqual(cosmeticCopy[key], gameplayCopy[key]);
assert.deepEqual(gameplayItem, gameplayCopy, 'visual assignment leaves source gameplay state untouched');

const awaySource = readFileSync(new URL('../js/meeow-away.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(awaySource, /const createEpisode = [\s\S]*?attachment: mail\.attachment \? itemVisuals\.assignAutoVisualIdentity\(mail\.attachment\) : null/);
assert.match(awaySource, /const normalizeEpisodes = [\s\S]*?attachment: mail\.attachment && typeof mail\.attachment === 'object' \? \{ \.\.\.mail\.attachment \} : null/);
assert.match(page, /attachment: data\.item \? window\.Meeow\.itemVisuals\.assignAutoVisualIdentity\(/);
assert.match(page, /const normalizeExploreSettlementFlavor = [\s\S]*?window\.Meeow\.itemVisuals\.assignAutoVisualIdentity\(/);
assert.match(page, /const normalizeExploreSettlementOperation = [\s\S]*?normalizeItemVisual\(raw\.settlement\.loot\.visual\)/);
assert.match(page, /const recordDeliveredMail = [\s\S]*?const item = attachment \? \{[\s\S]*?\.\.\.attachment, id: Date\.now\(\), type: 'collectible',[\s\S]*?provenance: window\.Meeow\.residentItems\.makeProvenance/);
assert.match(page, /user\.inventory\.push\(\{ \.\.\.settlement\.loot/);
assert.match(page, /const claimMailItem = [\s\S]*?const item = \{ \.\.\.mail\.item, uniqueId,[\s\S]*?user\.inventory\.push\(item\)/);
assert.equal(visuals.registry.length, 62);
console.log('Item visual schema V1 fixture: PASS');
