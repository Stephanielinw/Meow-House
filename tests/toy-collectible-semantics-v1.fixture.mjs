import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const context = vm.createContext({ window: { Vue: { computed: getter => ({ get value() { return getter(); } }) } },
    console, Buffer, Uint8Array, Uint8ClampedArray });
for (const file of ['meeow-semantics.js', 'meeow-item-visuals.js', 'meeow-shop-catalog.js',
    'meeow-inventory.js', 'meeow-resident-items.js', 'meeow-item-detail-presentation.js'])
    vm.runInContext(read(`../js/${file}`), context, { filename: file });
const { semantics, shopCatalog: shop, inventory, residentItems, itemDetailPresentation } = context.window.Meeow;
const plain = value => JSON.parse(JSON.stringify(value));
const payload = (semanticType, tags, extra = {}) => ({ semanticType, tags, ...extra });
const toy = ['role:play', 'interaction:chase', 'stimulus:rolling', 'stimulus:glowing'];

assert.deepEqual(plain(semantics.OBJECT_VALUES), {
    role: ['play', 'comfort', 'keepsake', 'display'],
    interaction: ['chase', 'bat', 'carry', 'cuddle', 'sniff', 'observe'],
    stimulus: ['rolling', 'swinging', 'fluttering', 'glowing', 'scented']
});
assert.deepEqual(Object.keys(semantics.SEMANTIC_TAG_REGISTRY.toy.namespaces), ['role', 'interaction', 'stimulus']);
assert.deepEqual(Object.keys(semantics.SEMANTIC_TAG_REGISTRY.collectible.namespaces), ['role', 'interaction', 'stimulus']);
assert.equal(semantics.validateSemanticRegistry(semantics.SEMANTIC_TAG_REGISTRY).valid, true);
assert.deepEqual(plain(semantics.normalizeSemanticTags(payload('toy', [...toy].reverse(), { category: 'toy' })).normalized.tags), toy);
for (const tags of [
    ['role:play', 'interaction:chase', 'other:unknown'],
    ['role:play', 'interaction:puzzle'],
    ['role:play', 'interaction:chase', 'stimulus:rolling', 'stimulus:glowing', 'stimulus:scented'],
    ['interaction:chase'], ['role:play'],
    ['role:play', 'interaction:chase', 'stimulus:rolling', 'stimulus:rolling'],
    ['role:keepsake', 'interaction:chase'], ['role:play', 'interaction:observe'],
    ['role:play', 'interaction:chase', 'stimulus:paragraph about a toy']
]) assert.equal(semantics.normalizeSemanticTags(payload('toy', tags)).classificationKnown, false, tags.join(','));
assert.equal(semantics.normalizeSemanticTags(payload('collectible', ['role:keepsake', 'interaction:observe'],
    { type: 'souvenir' })).classificationKnown, true);
assert.equal(semantics.normalizeSemanticTags(payload('collectible', ['role:keepsake', 'interaction:observe'],
    { type: 'letter' })).classificationKnown, false);
assert.equal(semantics.normalizeSemanticTags(payload('toy', toy, { category: 'food' })).classificationKnown, false);
assert.equal(semantics.normalizeObjectSemanticProposal({ role: 'play', interaction: 'puzzle', stimulus: [] }, 'toy'), null);

const fixed = [
    [2, ['role:play', 'interaction:chase', 'stimulus:rolling', 'stimulus:glowing']],
    [3, ['role:play', 'interaction:bat', 'stimulus:swinging']],
    [4, ['role:play', 'interaction:sniff', 'stimulus:scented']],
    [5, ['role:play', 'interaction:bat', 'stimulus:rolling']]
];
for (const [id, tags] of fixed) {
    assert.deepEqual(plain(semantics.getStaticToySemantics(id)), { semanticType: 'toy', tags });
    assert.equal(semantics.getStaticToySemantics(String(id)), null, 'typed catalog ID is authoritative');
}
assert.equal(semantics.getStaticToySemantics(99), null);
for (const [concept, tags] of [
    ['shell', ['role:keepsake', 'interaction:observe']],
    ['portable-branch', ['role:keepsake', 'interaction:carry']],
    ['decorative-badge', ['role:display', 'interaction:observe']],
    ['decorative-jewelry', ['role:display', 'interaction:observe']]
]) assert.deepEqual(plain(semantics.getStaticCollectibleSemantics(concept).tags), tags);
assert.equal(semantics.getStaticCollectibleSemantics('model-boat'), null);
assert.equal(semantics.getStaticCollectibleSemantics('letter'), null);
assert.equal(semantics.getStaticCollectibleSemantics('generic-equipment'), null);

const accepted = shop.normalizeAppraisal({ approved: true, price: 24, effect: 1,
    objectSemantics: { role: 'play', interaction: 'bat', stimulus: ['rolling'],
        semanticType: 'collectible', sourceCatalogId: 'evil', provenance: { kind: 'evil' } } }, 'toy');
assert.deepEqual(plain(accepted.objectSemantics), {
    semanticType: 'toy', tags: ['role:play', 'interaction:bat', 'stimulus:rolling']
});
const draft = { name: '纸球', desc: '能滚动的玩具', category: 'toy', icon: 'fa-solid fa-circle',
    visualMode: 'ai-match', visual: shop.legacyVisual() };
const captured = shop.captureAuthoringSnapshot(draft, context.window.Meeow.itemVisuals.normalizeItemVisual);
assert.equal(captured.valid, true);
draft.name = '后来改的名字';
const sourceCatalogId = 'shop-catalog:00000000-0000-4000-8000-000000000123';
const definition = shop.createCatalogDefinition(captured.snapshot, accepted, sourceCatalogId);
assert.equal(definition.name, '纸球');
assert.equal(definition.semanticType, 'toy');
assert.deepEqual(plain(definition.tags), ['role:play', 'interaction:bat', 'stimulus:rolling']);
assert.equal(shop.validateCatalogDefinition(definition).valid, true);
assert.equal(shop.isActiveAppraisalRequest('shop-appraisal:new', 'shop-appraisal:old'), false);
assert.equal(shop.normalizeAppraisal({ approved: true, price: 24, effect: 1,
    objectSemantics: { role: 'play', interaction: 'puzzle' } }, 'toy').objectSemantics, null);
const unclassified = shop.createCatalogDefinition(captured.snapshot,
    { approved: true, price: 24, effect: 1, objectSemantics: { role: 'play', interaction: 'puzzle' } },
    'shop-catalog:00000000-0000-4000-8000-000000000124');
assert.equal(unclassified.semanticType, undefined);
assert.equal(shop.validateCatalogDefinition(unclassified).valid, true);
assert.equal(shop.normalizeAppraisal({ approved: true, price: 24, effect: 1, objectSemantics: {
    role: 'play', interaction: 'bat', stimulus: [] } }, 'food').objectSemantics, undefined);

const owned = shop.createPurchaseInstance(definition, 'item-instance:00000000-0000-4000-8000-000000000321');
const another = shop.createPurchaseInstance(definition, 'item-instance:00000000-0000-4000-8000-000000000322');
assert.deepEqual(plain(owned.tags), plain(definition.tags));
assert.equal(inventory.deriveInventoryDisplayGroups([owned, another], [definition])[0].quantity, 2);
const legacySameProduct = { ...another }; delete legacySameProduct.tags; delete legacySameProduct.semanticType;
assert.equal(inventory.deriveInventoryDisplayGroups([owned, legacySameProduct], [definition])[0].quantity, 2,
    'new object semantics do not split an otherwise compatible catalog stack');
const saved = plain({ shopItems: [definition], user: { inventory: [owned], residentItems: {} } });
assert.equal(shop.normalizeShopCatalog(saved.shopItems).changed, false);
assert.deepEqual(saved.shopItems[0].tags, plain(definition.tags));
assert.deepEqual(saved.user.inventory[0].tags, plain(definition.tags));
const originalProvenance = plain(owned.provenance);
const owner = { inventory: [owned], residentItems: {} };
const moved = residentItems.transferUserToResident({ user: owner, residents: [{ id: 'dick' }],
    uniqueId: owned.uniqueId, recipientId: 'dick', persist: () => true,
    makeTransferId: () => 'gift-transfer:00000000-0000-4000-8000-000000000333',
    now: () => '2026-09-26T00:00:00.000Z' });
assert.equal(moved.ok, true);
assert.equal(owner.inventory.length, 0);
assert.equal(owner.residentItems.dick[0], owned, 'exact physical instance moved');
assert.deepEqual(plain(owned.tags), plain(definition.tags));
assert.equal(owned.uniqueId, 'item-instance:00000000-0000-4000-8000-000000000321');
assert.deepEqual(plain(owned.provenance.originOwner), originalProvenance.originOwner);
assert.deepEqual(plain(owned.provenance.origin), originalProvenance.origin);
assert.equal(residentItems.scanOwnership(owner.inventory, owner.residentItems).duplicateIds.length, 0);
assert.equal(semantics.getPrimaryItemInteraction(owned), 'bat');
assert.equal(semantics.isSemanticallyUsableItem(owned), true);
assert.equal(semantics.isSemanticallyUsableItem(unclassified), false);
assert.deepEqual(plain(inventory.getItemDisplayAttributes(owned)), ['玩耍', '拍打', '滚动']);
assert.deepEqual(plain(inventory.getItemDisplayAttributes({ type: 'collectible',
    ...semantics.getStaticCollectibleSemantics('shell') })), ['纪念', '观赏']);
assert.deepEqual(plain(inventory.getItemDisplayAttributes(unclassified)), []);
assert.match(itemDetailPresentation.template, /v-for="label in attributes"/);
assert.equal(itemDetailPresentation.setup({ item: owned }).attributes.value.length, 3);

assert.match(html, /initialShopItems = initialShopItems\.map\(item => \{[\s\S]*getStaticToySemantics\(item\.id\)/);
assert.match(html, /shopItems\.value = shopItems\.value\.map\(promoteFixedShopToySemantics\)/);
assert.match(html, /objectSemantics may propose/);
assert.match(html, /<meeow-item-detail-presentation :item="selectedBagItem"/);
assert.match(html, /<meeow-item-detail-presentation :item="selectedResidentOwnedItem"/);
assert.match(html, /<meeow-item-detail-presentation :item="selectedShopItem"/);
assert.equal((html.match(/callAI\(/g) || []).length, 40);
console.log('toy-collectible-semantics-v1: PASS');
