import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../index.html');
const context = vm.createContext({ window: {}, console });
for (const path of ['../js/meeow-semantics.js', '../js/meeow-resident-semantics.js', '../js/meeow-inventory.js']) {
    vm.runInContext(read(path), context, { filename: path });
}
const start = app.indexOf('                let initialShopItems = [');
const end = app.indexOf('                let initialSettings =', start);
assert.ok(start >= 0 && end > start);
vm.runInContext(`${app.slice(start, end)}
globalThis.catalog = initialShopItems;
globalThis.reconcile = reconcileBuiltInSemanticFoods;
globalThis.refreshOwned = refreshOwnedBuiltInFoods;`, context);

const plain = value => JSON.parse(JSON.stringify(value));
const catalog = context.catalog;
const canonicalFoods = catalog.filter(item => item.semanticType === 'food');
const byId = id => canonicalFoods.find(item => item.id === id);
const expectedSprites = {
    'builtin-food:grilled-fish-plate': 'housefood:salmon-steak',
    'builtin-food:rich-meat-broth': 'housefood:pumpkin-chicken-stew',
    'builtin-food:steamed-egg-custard': 'housefood:tuna-egg-custard',
    'builtin-food:steamed-egg-meat-roll': 'housefood:chicken-oat-risotto',
    'builtin-food:bitter-vegetable-puree': 'housefood:roasted-vegetable-platter',
    'builtin-food:cool-fish-vegetable-plate': 'housefood:sour-fish-vegetable-salad',
    'builtin-food:chilled-fish-jelly': 'housefood:seaweed-fish-crisps',
    'builtin-food:spiced-meat-jerky': 'housefood:charred-chicken-strips',
    'builtin-food:salted-grain-crisps': 'housefood:cheese-grain-crackers',
    'builtin-food:spiced-crisp-vegetables': 'housefood:spicy-veggie-chips',
    'builtin-food:sweet-sour-fruit-cup': 'housefood:strawberry-panna-cotta',
    'builtin-food:dairy-grain-pudding': 'housefood:pumpkin-pudding',
    'builtin-food:chilled-fermented-cheese': 'housefood:berry-yogurt-cup',
    'builtin-food:lactose-free-warm-milk': 'housefood:warm-milk',
    'builtin-food:fruit-pulp-drink': 'housefood:fruit-pulp-drink',
    'builtin-food:warm-grain-porridge': 'housefood:apple-oat-milk'
};
assert.equal(canonicalFoods.length, 16);
for (const [id, spriteId] of Object.entries(expectedSprites)) {
    assert.deepEqual(plain(byId(id).visual), { version: 1, mode: 'builtin-sprite', spriteId, visualHint: null });
}
const grilledId = 'builtin-food:grilled-fish-plate';
const snackId = 'builtin-food:chilled-fish-jelly';
const oldGrilled = {
    id: grilledId, name: '炙烤鱼肉小碟', desc: '旧鱼肉小碟', price: 12,
    icon: 'fa-solid fa-bowl-food', effect: 1, type: 'consumable', category: 'food',
    visual: { version: 1, mode: 'builtin-sprite', spriteId: 'approved:fish', visualHint: null },
    userAnnotation: '保留的附加资料',
    semanticType: 'food', tags: ['temp:hot', 'taste:salty', 'taste:umami', 'smell:fragrant',
        'texture:chewy', 'texture:juicy', 'family:fish', 'form:meal']
};
const oldSnack = {
    id: snackId, name: '冰镇鱼肉凝冻', desc: '旧鱼肉凝冻', price: 8,
    icon: 'fa-solid fa-bowl-food', effect: 1, type: 'consumable', category: 'food',
    semanticType: 'food', tags: ['temp:cold', 'taste:umami', 'smell:mild', 'texture:soft', 'family:fish', 'form:snack']
};
const custom = { id: 424242, name: '用户手作点心', desc: '保留', price: 23, type: 'consumable', category: 'food' };
const legacy = catalog.find(item => item.id === 1);
const oldShop = [legacy, oldSnack, custom, oldGrilled, { ...oldGrilled, desc: '重复旧条目' }];
const oldShopBefore = JSON.stringify(oldShop);
const migratedShop = context.reconcile(oldShop);
assert.equal(migratedShop.changed, true);
assert.equal(migratedShop.addedCount, 14);
assert.equal(migratedShop.refreshedCount, 2);
assert.equal(migratedShop.duplicateCount, 1);
assert.equal(migratedShop.items.filter(item => item.id === grilledId).length, 1);
assert.equal(migratedShop.items.filter(item => item.id === snackId).length, 1);
assert.deepEqual(plain(migratedShop.items.filter(item => item.semanticType === 'food').map(item => item.id)),
    plain(canonicalFoods.map(item => item.id)), 'saved Shop menu follows canonical order');
assert.deepEqual(plain(migratedShop.items.filter(item => !String(item.id).startsWith('builtin-food:'))),
    plain([legacy, custom]), 'unrelated Shop order and contents remain unchanged');
assert.equal(migratedShop.items.find(item => item.id === grilledId).price, byId(grilledId).price);
assert.equal(migratedShop.items.find(item => item.id === grilledId).effect, byId(grilledId).effect);
assert.equal(migratedShop.items.find(item => item.id === grilledId).name, '香煎三文鱼排');
assert.deepEqual(plain(migratedShop.items.find(item => item.id === grilledId).visual), plain(byId(grilledId).visual));
assert.equal(migratedShop.items.find(item => item.id === grilledId).userAnnotation, oldGrilled.userAnnotation);
assert.equal(JSON.stringify(oldShop), oldShopBefore, 'reconciliation does not mutate saved input');
const repeatedShop = context.reconcile(migratedShop.items);
assert.equal(repeatedShop.changed, false);
assert.equal(repeatedShop.items, migratedShop.items);

const frozenVisual = { version: 1, mode: 'auto-sprite', spriteId: 'old:approved:sprite', visualHint: null };
const owned = { ...oldGrilled, price: 12, uniqueId: 1701, acquiredAt: 'earlier', visual: frozenVisual,
    visualHint: { object: 'fish', material: 'food', form: 'meal', context: 'food' } };
const away = { id: 'away:unique', name: '炙烤鱼肉小碟', type: 'collectible', desc: '旅途纪念物', uniqueId: 1702 };
const phone = { ...oldGrilled, id: 1703, uniqueId: 1703, name: '炙烤鱼肉小碟' };
const oldInventory = [owned, custom, away, phone, legacy];
const oldInventoryBefore = JSON.stringify(oldInventory);
const migratedInventory = context.refreshOwned(oldInventory);
assert.equal(migratedInventory.updatedCount, 1);
assert.equal(migratedInventory.items.length, oldInventory.length);
const refreshed = migratedInventory.items[0];
for (const field of ['name', 'desc', 'effect', 'icon', 'type', 'category', 'semanticType', 'tags', 'visual']) {
    assert.deepEqual(plain(refreshed[field]), plain(byId(grilledId)[field]), `inventory ${field} refreshed`);
}
assert.equal(refreshed.id, grilledId);
assert.equal(refreshed.uniqueId, 1701);
assert.equal(refreshed.price, 12, 'owned price is acquisition data');
assert.equal(refreshed.acquiredAt, 'earlier');
assert.deepEqual(plain(refreshed.visual), plain(byId(grilledId).visual), 'stable built-in copy receives the approved program-owned visual');
assert.equal(refreshed.visualHint, owned.visualHint);
assert.deepEqual(migratedInventory.items.slice(1), oldInventory.slice(1), 'custom, Away, Phone and historical items untouched');
assert.equal(JSON.stringify(oldInventory), oldInventoryBefore, 'inventory refresh does not mutate saved input');
const repeatedInventory = context.refreshOwned(migratedInventory.items);
assert.equal(repeatedInventory.updatedCount, 0);
assert.equal(repeatedInventory.items, migratedInventory.items);

const reloadedInventory = plain(migratedInventory.items);
assert.equal(context.refreshOwned(reloadedInventory).updatedCount, 0, 'reload does not drift');
const purchased = { ...byId(grilledId), uniqueId: 1801 };
const stackableOwned = { ...refreshed };
delete stackableOwned.acquiredAt;
delete stackableOwned.userAnnotation;
const groups = context.window.Meeow.inventory.deriveInventoryDisplayGroups([stackableOwned, purchased], migratedShop.items);
assert.equal(groups.length, 1, 'old owned Food stacks with newly purchased canonical Food');
assert.equal(groups[0].quantity, 2);
const ordinaryOldCopy = { ...oldSnack, uniqueId: 1901 };
const ordinaryRefreshed = context.refreshOwned([ordinaryOldCopy]).items[0];
const ordinaryPurchased = { ...byId(snackId), uniqueId: 1902 };
const ordinaryGroups = context.window.Meeow.inventory.deriveInventoryDisplayGroups(
    [ordinaryRefreshed, ordinaryPurchased], migratedShop.items);
assert.equal(ordinaryGroups.length, 1, 'ordinary pre-redesign owned copy stacks without test-only field removal');
assert.equal(ordinaryGroups[0].quantity, 2);
const profile = context.window.Meeow.residentSemantics.getBuiltinResidentSemanticProfile('gotham-bruce');
const score = context.window.Meeow.semantics.scoreResidentPreference(profile, refreshed);
assert.equal(score.classificationKnown, true);
assert.equal(score.reactionClass, 'like');
assert.deepEqual(plain(refreshed.tags), plain(byId(grilledId).tags), 'item use receives redesigned semantic tags');

assert.match(app, /const reconciledFoodCatalog = reconcileBuiltInSemanticFoods\(shopItems\.value, initialShopItems\)/);
assert.match(app, /const refreshedOwnedFoods = refreshOwnedBuiltInFoods\(user\.inventory\)/);
assert.match(app, /const refreshedImportedFoods = refreshOwnedBuiltInFoods\(user\.inventory\)/);
assert.match(app, /shopItems\.value = reconcileBuiltInSemanticFoods\(data\.shopItems\)\.items/);
console.log('Built-in Food catalog redesign V1 fixture passed.');
