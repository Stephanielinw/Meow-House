import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../index.html');
const context = vm.createContext({ window: {}, console });
vm.runInContext(read('../js/meeow-semantics.js'), context);
vm.runInContext(read('../js/meeow-inventory.js'), context);
const { semantics, inventory } = context.window.Meeow;
const sourceStart = app.indexOf('                let initialShopItems = [');
const sourceEnd = app.indexOf('                let initialSettings =', sourceStart);
assert.ok(sourceStart >= 0 && sourceEnd > sourceStart, 'built-in catalog and reconciliation remain accessible');
vm.runInContext(`${app.slice(sourceStart, sourceEnd)}\nglobalThis.catalog = initialShopItems;\nglobalThis.reconcile = reconcileBuiltInSemanticFoods;`, context);
const catalog = context.catalog;
const classified = catalog.filter(item => item.category === 'food' && item.semanticType === 'food');
const food = catalog.filter(item => item.category === 'food');
const plain = value => JSON.parse(JSON.stringify(value));

assert.equal(catalog.length, 22, 'six existing items plus 16 new Foods');
assert.equal(food.length, 18);
assert.equal(classified.length, 16);
assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length, 'no duplicate built-in IDs');
assert.equal(new Set(classified.map(item => item.id)).size, 16);
assert.ok(classified.every(item => typeof item.id === 'string' && item.id.startsWith('builtin-food:')));
assert.deepEqual(plain(classified.map(item => item.id)), [
    'builtin-food:chilled-fish-jelly', 'builtin-food:grilled-fish-plate', 'builtin-food:spiced-meat-jerky',
    'builtin-food:steamed-egg-custard', 'builtin-food:lactose-free-warm-milk', 'builtin-food:chilled-fermented-cheese',
    'builtin-food:sweet-sour-fruit-cup', 'builtin-food:fruit-pulp-drink', 'builtin-food:salted-grain-crisps',
    'builtin-food:warm-grain-porridge', 'builtin-food:bitter-vegetable-puree', 'builtin-food:spiced-crisp-vegetables',
    'builtin-food:rich-meat-broth', 'builtin-food:cool-fish-vegetable-plate', 'builtin-food:steamed-egg-meat-roll',
    'builtin-food:dairy-grain-pudding'
]);
for (const legacyId of [1, 7]) {
    assert.equal(semantics.validateSemanticTags(food.find(item => item.id === legacyId)).classificationState, 'unclassified');
}

const proseEvidence = {
    'temp:cold': /冰凉/, 'temp:cool': /微凉/, 'temp:room': /常温/, 'temp:warm': /温热/, 'temp:hot': /热腾腾/,
    'taste:sweet': /甜/, 'taste:sour': /酸/, 'taste:bitter': /苦/, 'taste:salty': /咸/,
    'taste:spicy': /辛/, 'taste:umami': /鲜味|鲜香/, 'taste:bland': /味道.{0,3}清淡/,
    'smell:mild': /气味清淡/, 'smell:fragrant': /香/, 'smell:pungent': /辛香/, 'smell:fermented': /发酵/,
    'texture:soft': /柔软/, 'texture:crisp': /脆/, 'texture:chewy': /耐嚼/,
    'texture:creamy': /绵密/, 'texture:dry': /干爽/, 'texture:juicy': /多汁/,
    'family:fish': /鱼/, 'family:meat': /肉/, 'family:dairy': /奶|乳酪/, 'family:egg': /蛋/,
    'family:fruit': /果/, 'family:vegetable': /菜|蔬/, 'family:grain': /谷物/,
    'form:meal': /小碟|蛋羹|谷物糊|菜泥|肉汤|拼盘|蒸卷/,
    'form:snack': /小点心|肉干|脆片|蔬角/,
    'form:dessert': /乳酪杯|甜点|布丁/,
    'form:beverage': /奶饮|果肉饮/
};
const coverage = Object.fromEntries(Object.entries(semantics.SEMANTIC_TAG_REGISTRY.food.namespaces)
    .map(([namespace, rule]) => [namespace, Object.fromEntries(rule.values.map(value => [value, 0]))]));
for (const item of classified) {
    assert.ok(item.name.trim() && item.desc.trim() && item.icon.startsWith('fa-solid fa-'));
    assert.ok(Number.isInteger(item.price) && item.price >= 40 && item.price <= 85);
    assert.ok(Number.isInteger(item.effect) && item.effect >= 1 && item.effect <= 3);
    assert.equal(item.type, 'consumable');
    assert.equal(item.semanticType, 'food');
    assert.equal(new Set(item.tags).size, item.tags.length, `${item.id}: duplicate tag`);
    const result = semantics.validateSemanticTags(item);
    assert.equal(result.valid, true, `${item.id}: ${result.error}`);
    assert.equal(result.classificationState, 'classified');
    assert.deepEqual(plain(result.normalized.tags), plain(item.tags), `${item.id}: non-canonical tag order`);
    for (const tag of item.tags) {
        assert.ok(proseEvidence[tag]?.test(`${item.name} ${item.desc}`), `${item.id}: prose does not support ${tag}`);
        const [namespace, value] = tag.split(':');
        coverage[namespace][value] += 1;
    }
}
for (const [namespace, values] of Object.entries(coverage)) {
    for (const [value, count] of Object.entries(values)) assert.ok(count > 0, `missing ${namespace}:${value}`);
}
const byId = suffix => classified.find(item => item.id === `builtin-food:${suffix}`);
assert.ok(byId('chilled-fish-jelly').tags.includes('temp:cold'));
assert.ok(byId('grilled-fish-plate').tags.includes('temp:hot'));
assert.ok(byId('sweet-sour-fruit-cup').tags.includes('taste:sweet'));
assert.ok(byId('bitter-vegetable-puree').tags.includes('taste:bitter'));
assert.ok(byId('steamed-egg-custard').tags.includes('smell:mild'));
assert.ok(byId('spiced-meat-jerky').tags.includes('smell:pungent'));
assert.ok(byId('warm-grain-porridge').tags.includes('texture:soft'));
assert.ok(byId('salted-grain-crisps').tags.includes('texture:crisp'));
assert.ok(byId('grilled-fish-plate').tags.includes('family:fish'));
assert.ok(byId('bitter-vegetable-puree').tags.includes('family:vegetable'));
assert.ok(byId('spiced-meat-jerky').tags.includes('form:snack'));
assert.ok(byId('rich-meat-broth').tags.includes('form:meal'));

const fresh = context.reconcile(catalog, catalog);
assert.equal(fresh.addedCount, 0);
assert.equal(fresh.items, catalog, 'fresh catalog does not get rebuilt');
const numericCollision = { id: 8, name: byId('chilled-fish-jelly').name, price: 12, desc: '自建商品', effect: 1, type: 'consumable', category: 'food' };
const custom = { id: 987654321, name: '用户自建点心', desc: '保留原样', price: 33, effect: 2, type: 'consumable', category: 'food', extra: { note: '原始数据' } };
const oldSaved = [...catalog.filter(item => typeof item.id === 'number'), numericCollision, custom];
const numericBefore = JSON.stringify(numericCollision), customBefore = JSON.stringify(custom);
const migrated = context.reconcile(oldSaved, catalog);
assert.equal(migrated.addedCount, 16);
assert.equal(migrated.items.length, oldSaved.length + 16);
assert.equal(migrated.items.find(item => item.id === 8), numericCollision);
assert.equal(migrated.items.find(item => item.id === custom.id), custom);
assert.equal(JSON.stringify(numericCollision), numericBefore);
assert.equal(JSON.stringify(custom), customBefore);
const repeated = context.reconcile(migrated.items, catalog);
assert.equal(repeated.addedCount, 0);
assert.equal(repeated.items, migrated.items);
assert.deepEqual(plain(JSON.parse(JSON.stringify(migrated.items))), plain(migrated.items), 'save/load preserves IDs and semantic tags');

const reservedCollision = { id: byId('chilled-fish-jelly').id, name: '同号自建商品', price: 9, type: 'consumable', category: 'food' };
const warnings = [];
const withReserved = context.reconcile([...oldSaved, reservedCollision], catalog, message => warnings.push(message));
assert.equal(withReserved.addedCount, 15);
assert.equal(withReserved.items.find(item => item.id === reservedCollision.id), reservedCollision);
assert.equal(warnings.length, 1);
assert.match(warnings[0], /Reserved built-in Food ID collision/);

const buyStart = app.indexOf('                const buyItem = (item) => {');
const buyEnd = app.indexOf('                const filteredShopItems =', buyStart);
assert.ok(buyStart >= 0 && buyEnd > buyStart);
let nextUniqueId = 1000;
const purchaseState = { user: { coins: 500, inventory: [] }, Date: { now: () => ++nextUniqueId }, showToast: () => {} };
vm.runInNewContext(`${app.slice(buyStart, buyEnd)}\nglobalThis.buyItem = buyItem;`, purchaseState);
purchaseState.buyItem(numericCollision);
purchaseState.buyItem(byId('chilled-fish-jelly'));
assert.deepEqual(purchaseState.user.inventory.map(item => item.id), [8, 'builtin-food:chilled-fish-jelly']);
assert.deepEqual(plain(purchaseState.user.inventory[1].tags), plain(byId('chilled-fish-jelly').tags));
assert.equal(inventory.findInventoryItemIndex(purchaseState.user.inventory, purchaseState.user.inventory[0],
    inventory.getInventoryItemKey(purchaseState.user.inventory[0])), 0);
assert.equal(inventory.findInventoryItemIndex(purchaseState.user.inventory, purchaseState.user.inventory[1],
    inventory.getInventoryItemKey(purchaseState.user.inventory[1])), 1);
const reloadedInventory = JSON.parse(JSON.stringify(purchaseState.user.inventory));
assert.equal(inventory.findInventoryItemIndex(reloadedInventory, reloadedInventory[0], inventory.getInventoryItemKey(reloadedInventory[0])), 0);
assert.equal(inventory.findInventoryItemIndex(reloadedInventory, reloadedInventory[1], inventory.getInventoryItemKey(reloadedInventory[1])), 1);

console.log(`Food semantic catalog: ${classified.length} classified, ${food.length} total Foods`);
for (const [namespace, values] of Object.entries(coverage)) {
    console.log(`${namespace}: ${Object.entries(values).map(([value, count]) => `${value} ${count}`).join(', ')}`);
}
console.log('Food semantic catalog fixture passed.');
