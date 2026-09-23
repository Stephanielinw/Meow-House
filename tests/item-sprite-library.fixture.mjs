import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const visuals = require('../js/meeow-item-visuals.js');
const fileExists = file => existsSync(new URL(`../${file}`, import.meta.url));
assert.equal(visuals.validateSpriteRegistry(visuals.registry, fileExists).valid, true);
assert.equal(visuals.registry.length, 106);
const counts = Object.groupBy(visuals.registry, entry => entry.sourcePack);
assert.equal(counts['idylwild-inventory'].length, 50);
assert.equal(counts['yapi-assorted'].length, 53);
assert.equal(counts['shade-rpg'].length, 3);
for (const entry of visuals.registry) {
    const bytes = readFileSync(new URL(`../${entry.file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (entry.sheetRect) {
        assert.ok(entry.sheetRect.x + entry.sheetRect.width <= width);
        assert.ok(entry.sheetRect.y + entry.sheetRect.height <= height);
    } else {
        assert.deepEqual([width, height], [entry.nativeSize.width, entry.nativeSize.height]);
    }
}
const hint = { object: 'branch', material: 'wood', form: 'keepsake', context: 'nature' };
assert.deepEqual(visuals.validateVisualHint({ object: ' branch ', material: 'wood', form: 'keepsake', context: 'nature' }), hint);
for (const bad of [null, [], { ...hint, object: 'tree branch' }, { ...hint, object: ['branch'] }, { ...hint, material: '' }, { ...hint, file: 'x.png' }, { ...hint, context: 'https://x.test' }]) assert.equal(visuals.validateVisualHint(bad), null);
const branch = visuals.resolveItemSpriteCandidate(hint);
assert.equal(branch.spriteId, 'idylwild:inventory:stick');
assert.equal(branch.score, 19);
assert.deepEqual(branch.matchedTags, ['object', 'material', 'form', 'context']);
assert.equal(visuals.resolveItemSpriteCandidate(hint).spriteId, branch.spriteId);
const mk = (id, objectTags, tier = 'fallback', materialTags = ['unknown'], formTags = ['unknown'], contextTags = ['unknown'], aliases = []) => ({ id, objectTags, materialTags, formTags, contextTags, qualityTier: tier, aliases });
const a = mk('test:a', ['branch'], 'fallback', ['wood'], ['keepsake'], ['nature']);
const b = mk('test:b', ['stick', 'branch'], 'primary', ['wood'], ['keepsake'], ['nature']);
assert.equal(visuals.resolveItemSpriteCandidate(hint, [a, b]).spriteId, 'test:b', 'multi-tag exact match and primary tie break');
assert.equal(visuals.resolveItemSpriteCandidate(hint, [a, mk('test:c', ['stone'], 'primary', ['wood'], ['keepsake'], ['nature'])]).spriteId, 'test:a', 'material cannot overpower wrong object');
assert.equal(visuals.resolveItemSpriteCandidate(hint, [mk('test:x', ['branch'], 'fallback', ['wood'], ['unknown'], ['unknown']), a]).spriteId, 'test:a', 'form and context refine score');
assert.equal(visuals.resolveItemSpriteCandidate(hint, [mk('test:z', ['branch']), mk('test:a', ['branch'])]).spriteId, 'test:a', 'lexical tie break');
assert.equal(visuals.resolveItemSpriteCandidate(hint, [mk('test:z', ['stone'], 'primary', ['wood'], ['keepsake'], ['nature'], ['branch'])]), null, 'aliases are not runtime authority');
assert.equal(visuals.resolveItemSpriteCandidate({ ...hint, object: 'unknown' }), null);
assert.equal(visuals.resolveItemSpriteCandidate({ object: 'necklace', material: 'metal', form: 'jewelry', context: 'gift' }), null);
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const foods = source.split('\n').filter(line => line.includes("id: 'builtin-food:") && line.includes('tags:'));
assert.equal(foods.length, 16);
for (const line of foods) {
    const semanticTags = [...line.matchAll(/'(family:[^']+|form:[^']+)'/g)].map(match => match[1]);
    const family = semanticTags.find(tag => tag.startsWith('family:')).split(':')[1];
    const form = semanticTags.find(tag => tag.startsWith('form:')).split(':')[1];
    const provisionalHint = {
        object: family === 'dairy' ? (form === 'beverage' ? 'drink' : 'dessert') : family,
        material: 'food', form: form === 'beverage' ? 'beverage' : form === 'dessert' ? 'dessert' : form === 'snack' ? 'snack' : 'meal', context: 'food'
    };
    assert.ok(visuals.validateVisualHint(provisionalHint));
    assert.ok(visuals.resolveItemSpriteCandidate(provisionalHint), `missing provisional art for ${line.match(/name: '([^']+)'/)[1]}`);
}
for (const [hint, expectedId] of [
    [{ object: 'branch', material: 'wood', form: 'keepsake', context: 'nature' }, 'idylwild:inventory:stick'],
    [{ object: 'shell', material: 'organic', form: 'keepsake', context: 'travel' }, 'yapi:assorted:seashell'],
    [{ object: 'stone', material: 'stone', form: 'keepsake', context: 'travel' }, 'yapi:assorted:rock'],
    [{ object: 'flower', material: 'organic', form: 'keepsake', context: 'nature' }, 'yapi:assorted:flower'],
    [{ object: 'paper', material: 'paper', form: 'document', context: 'travel' }, 'idylwild:inventory:parchment'],
    [{ object: 'key', material: 'metal', form: 'keepsake', context: 'travel' }, 'idylwild:inventory:gold-key']
]) assert.equal(visuals.resolveItemSpriteCandidate(hint).spriteId, expectedId);
assert.equal(visuals.validateSpriteRegistry([{ ...visuals.registry[0], objectTags: ['not-closed'] }]).valid, false);
assert.equal(visuals.validateSpriteRegistry([visuals.registry[0], visuals.registry[0]]).valid, false);
console.log('Item sprite library fixture: PASS');
