import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const visuals = require('../js/meeow-item-visuals.js');
const fileExists = file => existsSync(new URL(`../${file}`, import.meta.url));
const manifests = new Map([
    ['house-style-food-v1', JSON.parse(readFileSync(new URL('../assets/meeow-item-source/house-style-food-v1/manifest.json', import.meta.url), 'utf8'))],
    ['house-base-library-v1', JSON.parse(readFileSync(new URL('../assets/meeow-item-source/house-base-library-v1/manifest.json', import.meta.url), 'utf8'))]
]);

assert.equal(visuals.validateSpriteRegistry(visuals.registry, fileExists).valid, true);
assert.equal(visuals.registry.length, 62);
assert.equal(new Set(visuals.registry.map(entry => entry.id)).size, 62);
assert.deepEqual([...new Set(visuals.registry.map(entry => entry.sourcePack))], ['house-style-food-v1', 'house-base-library-v1']);
assert.equal(visuals.registry.filter(entry => entry.sourceType !== 'first-party' || entry.provenance !== 'house-art').length, 0);
assert.equal(visuals.registry.filter(entry => entry.id.startsWith('housefood:') && entry.resolverEligible).length, 0);
assert.equal(visuals.registry.filter(entry => !entry.id.startsWith('housefood:') && !entry.resolverEligible).length, 0);

for (const entry of visuals.registry) {
    const bytes = readFileSync(new URL(`../${entry.file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [64, 64]);
    assert.equal(entry.license, 'In-house original');
    assert.equal(entry.category, entry.id.startsWith('baseitem:') ? 'item' : 'food');
    assert.equal(entry.semanticType, entry.id.startsWith('baseitem:') ?
        (['coin','necklace','watch','hairclip','wallet','bank-card','ring','crown','glasses','star-sand-orb','teaser-wand','catnip-pouch','riddle-paper-ball','letter'].some(name => entry.id === `baseitem:${name}`) ? 'trinket' : 'souvenir') : 'food');
    assert.deepEqual([entry.nativeSize.width, entry.nativeSize.height], [64, 64]);
    const authority = manifests.get(entry.sourcePack)?.sprites.find(sprite => sprite.id === entry.id);
    assert.ok(authority, `manifest authority exists: ${entry.id}`);
    for (const key of ['file', 'sourcePack', 'sourceType', 'license', 'nativeSize', 'qualityTier', 'category', 'semanticType',
        'resolverEligible', 'objectTags', 'materialTags', 'formTags', 'contextTags', 'aliases']) {
        assert.deepEqual(entry[key], authority[key], `registry/manifest ${key} parity: ${entry.id}`);
    }
    const sha = path => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
    assert.equal(sha(authority.approvedRepairFile || authority.approvedCandidateFile), authority.sha256);
    assert.equal(sha(authority.sourceFile), authority.sha256);
    assert.equal(sha(authority.file), authority.sha256);
}

const hint = { object: 'fish', material: 'food', form: 'meal', context: 'food' };
assert.deepEqual(visuals.validateVisualHint({ object: ' fish ', material: 'food', form: 'meal', context: 'food' }), hint);
for (const bad of [null, [], { ...hint, object: 'fish plate' }, { ...hint, object: ['fish'] }, { ...hint, file: 'x.png' }]) {
    assert.equal(visuals.validateVisualHint(bad), null);
}
const match = visuals.resolveItemSpriteCandidate(hint);
assert.equal(match.spriteId, 'basefood:fish-meal');
assert.equal(match.score, 19);
assert.deepEqual(match.matchedTags, ['object', 'material', 'form', 'context']);
assert.equal(visuals.resolveItemSpriteCandidate(hint, visuals.registry.filter(entry => entry.id.startsWith('housefood:'))), null,
    'canonical House Food is excluded from generic resolution');
assert.equal(visuals.createBuiltinItemVisual('housefood:salmon-steak').spriteId, 'housefood:salmon-steak',
    'canonical House Food remains available to explicit built-in mappings');
assert.equal(visuals.resolveItemSpriteCandidate({ object: 'mug', material: 'ceramic', form: 'beverage', context: 'food' }).spriteId, 'basefood:hot-mug');
assert.equal(visuals.resolveItemSpriteCandidate({ object: 'fruit', material: 'liquid', form: 'beverage', context: 'food' }).spriteId, 'basefood:fruit-drink');
for (const id of ['basefood:fish-meal', 'basefood:meat-meal', 'basefood:egg-meal', 'basefood:grain-bowl', 'basefood:vegetable-meal', 'basefood:bread-meal']) {
    assert.ok(visuals.registry.some(entry => entry.id === id), `Sheet A registry entry exists: ${id}`);
}
for (const id of ['basefood:dried-fish-snack', 'basefood:meat-jerky', 'basefood:vegetable-snack', 'basefood:fruit-snack', 'basefood:bread-loaf', 'basefood:dessert-cake', 'basefood:grain-snack', 'basefood:dessert-snack', 'basefood:fruit-dessert']) {
    assert.ok(visuals.registry.some(entry => entry.id === id), `Sheet B registry entry exists: ${id}`);
}
for (const id of ['basefood:generic-drink', 'basefood:hot-mug', 'basefood:fruit-drink', 'basefood:egg-ingredient', 'basefood:fruit-ingredient', 'basefood:raw-fish', 'basefood:raw-meat', 'basefood:vegetable-ingredient', 'basefood:grain-ingredient']) {
    assert.ok(visuals.registry.some(entry => entry.id === id), `Sheet C registry entry exists: ${id}`);
}
for (const id of ['baseitem:branch', 'baseitem:herb', 'baseitem:stone', 'baseitem:crystal', 'baseitem:shell', 'baseitem:feather', 'baseitem:leaf', 'baseitem:flower']) {
    assert.ok(visuals.registry.some(entry => entry.id === id), `Sheet D registry entry exists: ${id}`);
}
for (const id of ['baseitem:coin', 'baseitem:necklace', 'baseitem:watch', 'baseitem:hairclip', 'baseitem:wallet', 'baseitem:bank-card', 'baseitem:ring', 'baseitem:crown', 'baseitem:glasses']) {
    assert.ok(visuals.registry.some(entry => entry.id === id), `Sheet E registry entry exists: ${id}`);
}
for (const id of ['baseitem:star-sand-orb', 'baseitem:teaser-wand', 'baseitem:catnip-pouch', 'baseitem:riddle-paper-ball', 'baseitem:letter']) {
    const entry = visuals.registry.find(candidate => candidate.id === id);
    assert.ok(entry?.resolverEligible, `new cat item is an active first-party sprite: ${id}`);
    assert.equal(visuals.getItemVisualDescriptor({ visual: visuals.createBuiltinItemVisual(id) }).spriteId, id);
}

const mk = (id, objectTags, tier = 'fallback', materialTags = ['unknown'], formTags = ['unknown'], contextTags = ['unknown'], aliases = []) => ({ id, objectTags, materialTags, formTags, contextTags, qualityTier: tier, aliases });
const a = mk('test:a', ['branch'], 'fallback', ['wood'], ['keepsake'], ['nature']);
const b = mk('test:b', ['stick', 'branch'], 'primary', ['wood'], ['keepsake'], ['nature']);
const branchHint = { object: 'branch', material: 'wood', form: 'keepsake', context: 'nature' };
assert.equal(visuals.resolveItemSpriteCandidate(branchHint, [a, b]).spriteId, 'test:b');
assert.equal(visuals.resolveItemSpriteCandidate(branchHint).spriteId, 'baseitem:branch', 'first-party Sheet D covers branch');
assert.equal(visuals.resolveItemSpriteCandidate({ ...branchHint, object: 'unknown' }), null);
assert.equal(visuals.validateSpriteRegistry([{ ...visuals.registry[0], objectTags: ['not-closed'] }]).valid, false);
assert.equal(visuals.validateSpriteRegistry([visuals.registry[0], visuals.registry[0]]).valid, false);
assert.equal(visuals.validateSpriteRegistry([{ ...visuals.registry[0], sourcePack: 'retired-pack', sourceType: 'third-party', license: 'CC0' }]).valid, false);

console.log('Item sprite library fixture: PASS');
