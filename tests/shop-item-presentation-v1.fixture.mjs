import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const context = vm.createContext({ window: { Vue: { computed: getter => ({ get value() { return getter(); } }) } }, console, Buffer, Uint8Array, Uint8ClampedArray });
for (const file of ['meeow-semantics.js', 'meeow-item-visuals.js', 'meeow-shop-catalog.js', 'meeow-shop-cart.js', 'meeow-inventory.js', 'meeow-item-detail-presentation.js'])
    vm.runInContext(read(`../js/${file}`), context);
const { semantics, shopCatalog: shop, itemVisuals: visuals, inventory, shopCart: cart, itemDetailPresentation } = context.window.Meeow;
const plain = value => JSON.parse(JSON.stringify(value));

const rawTags = ['temp:warm', 'taste:sweet', 'taste:sweet', 'smell:fragrant', 'texture:soft', 'family:grain', 'form:dessert', 'unknown:tag', 'taste:toxic', '<script>'];
const checked = semantics.normalizeOptionalFoodTags(rawTags);
assert.deepEqual(plain(checked.tags), ['temp:warm', 'taste:sweet', 'smell:fragrant', 'texture:soft', 'family:grain', 'form:dessert']);
assert.equal(checked.complete, true);
assert.deepEqual(plain(checked.rejected), ['taste:sweet', 'unknown:tag', 'taste:toxic', '<script>']);
assert.deepEqual(plain(semantics.normalizeOptionalFoodTags(['taste:sour', 'family:fruit']).tags), ['taste:sour', 'family:fruit']);
assert.equal(semantics.normalizeOptionalFoodTags(['taste:sour', 'family:fruit']).complete, false);
assert.deepEqual(plain(semantics.normalizeOptionalFoodTags('not-an-array').tags), []);
assert.equal(semantics.normalizeOptionalFoodTags(['taste:bland', 'taste:sweet']).tags.length, 1);

const visual = shop.legacyVisual();
const draft = { name: '  燕麦莓果杯 ', desc: '  香甜的点心。  ', category: 'food', icon: '🍓', visualMode: 'ai-match', visual };
const capture = shop.captureAuthoringSnapshot(draft, visuals.normalizeItemVisual);
assert.equal(capture.valid, true);
draft.name = '被后来改动的草稿';
const rawAI = { approved: true, price: 23, effect: 2, reason: '可售', semanticTags: rawTags,
    id: 'evil', sourceCatalogId: 'evil', spriteId: 'third-party:fake', visual: { mode: 'builtin-sprite' }, path: '/bad.png', url: 'https://bad' };
const appraisal = shop.normalizeAppraisal(rawAI, capture.snapshot.category);
assert.deepEqual(plain(appraisal.semanticTags), plain(checked.tags));
assert.equal(appraisal.id, undefined);
assert.equal(appraisal.spriteId, undefined);
const sourceId = 'shop-catalog:00000000-0000-4000-8000-000000000123';
const definition = shop.createCatalogDefinition(capture.snapshot, appraisal, sourceId);
assert.equal(definition.id, sourceId);
assert.equal(definition.sourceCatalogId, sourceId);
assert.equal(definition.name, '燕麦莓果杯', 'immutable submitted draft wins');
assert.equal(definition.semanticType, 'food');
assert.deepEqual(plain(definition.tags), plain(checked.tags));
assert.equal(definition.semanticTags, undefined);
assert.equal(definition.visual.mode, 'legacy-icon');
assert.equal(shop.validateCatalogDefinition(definition).valid, true);
assert.equal(inventory.getItemDisplayAttributes(definition).length, 6);
assert.equal(shop.isActiveAppraisalRequest('shop-appraisal:new', 'shop-appraisal:old'), false);

const partial = shop.normalizeAppraisal({ approved: true, price: 8, effect: 1, semanticTags: ['taste:sour', 'family:fruit', 'bad:tag'] }, 'food');
const partialDefinition = shop.createCatalogDefinition(capture.snapshot, partial, 'shop-catalog:00000000-0000-4000-8000-000000000124');
assert.equal(partialDefinition.semanticType, undefined, 'partial tags do not pretend to satisfy complete gameplay classification');
assert.deepEqual(plain(partialDefinition.semanticTags), ['taste:sour', 'family:fruit']);
assert.deepEqual(plain(inventory.getItemDisplayAttributes(partialDefinition)), ['酸', '水果']);
assert.equal(shop.validateCatalogDefinition(partialDefinition).valid, true);
assert.equal(shop.createCatalogDefinition(capture.snapshot,
    shop.normalizeAppraisal({ approved: true, price: 8, effect: 1, semanticTags: 'bad' }, 'food'),
    'shop-catalog:00000000-0000-4000-8000-000000000125').semanticType, undefined);

const toySnapshot = shop.captureAuthoringSnapshot({ ...draft, name: '玩具', desc: '玩具说明', category: 'toy' }, visuals.normalizeItemVisual).snapshot;
const toyAI = shop.normalizeAppraisal({ approved: true, price: 9, effect: 1, semanticTags: rawTags, semanticType: 'food' }, 'toy');
const toyDefinition = shop.createCatalogDefinition(toySnapshot, toyAI, 'shop-catalog:00000000-0000-4000-8000-000000000126');
assert.equal(toyDefinition.semanticType, undefined);
assert.equal(toyDefinition.semanticTags, undefined);
assert.deepEqual(plain(inventory.getItemDisplayAttributes(toyDefinition)), []);
assert.deepEqual(Object.keys(semantics.SEMANTIC_TAG_REGISTRY.toy.namespaces), ['role', 'interaction', 'stimulus']);

const uniqueId = 'item-instance:00000000-0000-4000-8000-000000000321';
const owned = shop.createPurchaseInstance(definition, uniqueId);
assert.equal(owned.semanticType, 'food');
assert.deepEqual(plain(owned.tags), plain(definition.tags));
assert.equal(owned.sourceCatalogId, sourceId);
assert.equal(inventory.getItemDisplayAttributes(owned).length, 6);
const secondOwned = shop.createPurchaseInstance(definition, 'item-instance:00000000-0000-4000-8000-000000000322');
assert.equal(inventory.deriveInventoryDisplayGroups([owned, secondOwned], [definition])[0].quantity, 2,
    'validated Food semantics do not prevent otherwise compatible purchases from stacking');
const optionalOwned = { ...owned, semanticTags: ['taste:sour'] };
assert.equal(inventory.deriveInventoryDisplayGroups([owned, optionalOwned], [definition])[0].quantity, 2,
    'optional descriptive tags do not become stacking authority');
const roundTrip = plain({ shopItems: [definition, partialDefinition], user: { inventory: [owned] } });
assert.deepEqual(roundTrip.shopItems[0].tags, plain(definition.tags), 'reload/export/import preserves canonical tags');
assert.deepEqual(roundTrip.user.inventory[0].tags, plain(definition.tags));
assert.equal(shop.normalizeShopCatalog(roundTrip.shopItems).changed, false);
const session = cart.createSession();
assert.equal(cart.add(session, roundTrip.shopItems, definition), true);
assert.equal(cart.summarize(session, roundTrip.shopItems).lines[0].item.semanticType, 'food');

const component = itemDetailPresentation;
assert.match(component.template, /<meeow-item-visual :item="item" size="large">/);
assert.match(component.template, /v-for="label in attributes"/);
assert.ok(!/使用|丢弃|编辑 64×64/.test(component.template), 'shared presentation contains no inventory actions');
const componentData = component.setup({ item: definition });
assert.equal(componentData.attributes.value.length, 6);
assert.equal(component.setup({ item: toyDefinition }).attributes.value.length, 0);

const html = read('../index.html');
assert.equal((html.match(/@click="openShopItemDetail\(item\)"/g) || []).length, 2);
assert.equal((html.match(/@click\.stop="addShopCartItem\(item\)"/g) || []).length, 2);
assert.equal((html.match(/@click\.stop="buyItem\(item\)"/g) || []).length, 1);
assert.equal((html.match(/@click\.stop="buyPhoneShopItem\(item\)"/g) || []).length, 1);
assert.match(html, /selectedShopItem = computed\(\(\) => window\.Meeow\.shopCart\.resolveDefinition\(shopItems\.value, selectedShopCatalogKey\.value\)\)/);
const detail = html.match(/<!-- Read-only catalog detail[\s\S]*?<!-- One session cart/)?.[0] || '';
assert.match(detail, /<meeow-item-detail-presentation :item="selectedShopItem"/);
assert.match(detail, /@click="addShopCartItem\(selectedShopItem\)"/);
assert.match(detail, /@click="closeShopItemDetail"/);
assert.ok(!/useSelectedBagItem|discardSelectedBagItem|openItemPixelEditor/.test(detail));
assert.match(html, /<meeow-item-detail-presentation :item="selectedBagItem">/);
assert.match(html, /#app \.meeow-item-surface \{[\s\S]*?var\(--ui-surface-strong\)[\s\S]*?var\(--accent-dim\)[\s\S]*?var\(--ui-border-strong\)/);
assert.ok((html.match(/meeow-item-surface/g) || []).length >= 9);
assert.ok(!html.includes('class="w-12 h-12 shrink-0 flex items-center justify-center rounded-lg bg-zinc-950"'));
assert.equal((html.match(/callAI\(/g) || []).length, 40);

// Every protected House Food and Base Library source/runtime copy still agrees
// with its own first-party authority manifest.
for (const manifestPath of ['../assets/meeow-item-source/house-style-food-v1/manifest.json', '../assets/meeow-item-source/house-base-library-v1/manifest.json']) {
    const manifest = JSON.parse(read(manifestPath));
    for (const entry of manifest.sprites) {
        const source = readFileSync(new URL(`../${entry.sourceFile}`, import.meta.url));
        const runtime = readFileSync(new URL(`../${entry.file}`, import.meta.url));
        const hash = bytes => createHash('sha256').update(bytes).digest('hex');
        assert.equal(hash(source), hash(runtime));
        assert.equal(hash(source), entry.sha256);
    }
}
console.log('shop-item-presentation-v1: PASS');
