import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../index.html');
const context = vm.createContext({ window: { crypto: webcrypto }, console });
vm.runInContext(read('../js/meeow-semantics.js'), context);
vm.runInContext(read('../js/meeow-inventory.js'), context);
vm.runInContext(read('../js/meeow-shop-catalog.js'), context);
vm.runInContext(read('../js/meeow-resident-items.js'), context);
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
    'builtin-food:grilled-fish-plate', 'builtin-food:rich-meat-broth', 'builtin-food:steamed-egg-custard',
    'builtin-food:steamed-egg-meat-roll', 'builtin-food:bitter-vegetable-puree', 'builtin-food:cool-fish-vegetable-plate',
    'builtin-food:chilled-fish-jelly', 'builtin-food:spiced-meat-jerky', 'builtin-food:salted-grain-crisps',
    'builtin-food:spiced-crisp-vegetables', 'builtin-food:sweet-sour-fruit-cup', 'builtin-food:dairy-grain-pudding',
    'builtin-food:chilled-fermented-cheese', 'builtin-food:lactose-free-warm-milk', 'builtin-food:fruit-pulp-drink',
    'builtin-food:warm-grain-porridge'
]);
for (const legacyId of [1, 7]) {
    assert.equal(semantics.validateSemanticTags(food.find(item => item.id === legacyId)).classificationState, 'unclassified');
}

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
        const [namespace, value] = tag.split(':');
        coverage[namespace][value] += 1;
    }
}
for (const [namespace, values] of Object.entries(coverage)) {
    for (const [value, count] of Object.entries(values)) assert.ok(count > 0, `missing ${namespace}:${value}`);
}
const byId = suffix => classified.find(item => item.id === `builtin-food:${suffix}`);
const approvedMenu = [
    ['grilled-fish-plate', '香煎三文鱼排', '外皮煎得微微焦香，里面的三文鱼依然鲜嫩多汁，撒上一点海盐就很好吃。', 'temp:hot taste:salty taste:umami smell:fragrant texture:soft texture:juicy family:fish form:meal'],
    ['rich-meat-broth', '南瓜鸡肉炖锅', '南瓜炖得软糯香甜，鸡肉吸满温热汤汁，是一小锅暖呼呼的家常味。', 'temp:warm taste:umami smell:fragrant texture:soft texture:juicy family:meat family:vegetable form:meal'],
    ['steamed-egg-custard', '金枪鱼蒸蛋', '细嫩的蒸蛋里藏着金枪鱼碎，软软滑滑，带着温和的鲜味。', 'temp:warm taste:umami smell:mild texture:soft texture:creamy family:fish family:egg form:meal'],
    ['steamed-egg-meat-roll', '鸡汤燕麦烩饭', '鸡汤慢慢收进燕麦里，煮成浓稠柔软的一小碗，暖胃又有满足感。', 'temp:hot taste:umami smell:fragrant texture:soft texture:creamy family:meat family:grain form:meal'],
    ['bitter-vegetable-puree', '香烤时蔬拼盘', '时蔬烤到边缘微微焦香，保留一点清苦和脆嫩，是清爽又有香气的一盘。', 'temp:hot taste:bitter taste:umami smell:fragrant texture:crisp texture:juicy family:vegetable form:meal'],
    ['cool-fish-vegetable-plate', '酸香凉拌鱼蔬丝', '凉凉的鱼肉和蔬菜丝拌上酸香汁，清爽多汁，很适合慢慢吃。', 'temp:cool taste:sour taste:umami smell:fragrant texture:chewy texture:juicy family:fish family:vegetable form:meal'],
    ['chilled-fish-jelly', '海苔小鱼脆', '小鱼和海苔烤成薄薄的脆片，咸鲜酥脆，一口下去就是咔嚓一声。', 'temp:room taste:salty taste:umami smell:fragrant texture:crisp texture:dry family:fish family:grain form:snack'],
    ['spiced-meat-jerky', '炭烤鸡肉条', '鸡肉慢慢烤成有嚼劲的小条，带着淡淡炭烤香气，咸香耐吃。', 'temp:room taste:salty smell:fragrant texture:chewy texture:dry family:meat form:snack'],
    ['salted-grain-crisps', '芝士谷物脆饼', '谷物脆饼里带着淡淡芝士香，薄薄酥酥的，吃起来不会太腻。', 'temp:room taste:salty smell:fragrant texture:crisp texture:dry family:dairy family:grain form:snack'],
    ['spiced-crisp-vegetables', '辣味蔬菜脆片', '蔬菜切成薄片烤得脆脆的，带一点醒神的辣味和浓郁辛香。', 'temp:room taste:spicy smell:pungent texture:crisp texture:dry family:vegetable form:snack'],
    ['sweet-sour-fruit-cup', '草莓奶冻', '草莓和牛奶做成冰凉软嫩的奶冻，轻轻一挖就晃起来，甜香柔和。', 'temp:cold taste:sweet smell:fragrant texture:soft texture:creamy family:dairy family:fruit form:dessert'],
    ['dairy-grain-pudding', '南瓜布丁', '南瓜打成细腻柔软的布丁，甜味温和，口感绵密顺滑。', 'temp:cool taste:sweet smell:mild texture:soft texture:creamy family:dairy family:vegetable form:dessert'],
    ['chilled-fermented-cheese', '酸奶莓果杯', '微酸的酸奶配上甜甜莓果，清爽多汁，还留着一点柔和的发酵香气。', 'temp:cold taste:sweet taste:sour smell:fermented texture:creamy texture:juicy family:dairy family:fruit form:dessert'],
    ['lactose-free-warm-milk', '暖暖牛奶', '一小杯温温的牛奶，味道清淡柔和，喝起来简单又舒服。', 'temp:warm taste:bland smell:mild texture:creamy family:dairy form:beverage'],
    ['fruit-pulp-drink', '冰镇果肉饮', '冰凉的果汁里留着细细的果肉，甜甜多汁，喝起来很清爽。', 'temp:cold taste:sweet smell:fragrant texture:juicy family:fruit form:beverage'],
    ['warm-grain-porridge', '苹果燕麦奶', '苹果和燕麦打成顺滑的奶饮，带着自然的清甜，口感柔和绵顺。', 'temp:cool taste:sweet smell:mild texture:creamy family:fruit family:grain form:beverage']
];
assert.deepEqual(plain(classified.map(item => [item.id, item.name, item.desc, item.tags])),
    approvedMenu.map(([suffix, name, desc, tags]) => [`builtin-food:${suffix}`, name, desc, tags.split(' ')]));

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
assert.equal(withReserved.refreshedCount, 1);
assert.equal(withReserved.items.find(item => item.id === reservedCollision.id).name, byId('chilled-fish-jelly').name);
assert.equal(withReserved.items.find(item => item.id === reservedCollision.id).price, byId('chilled-fish-jelly').price);
assert.equal(withReserved.items.filter(item => item.id === reservedCollision.id).length, 1);
assert.equal(reservedCollision.name, '同号自建商品', 'reconciliation must not mutate its input');
assert.equal(warnings.length, 1);
assert.match(warnings[0], /Reserved built-in Food ID collision/);

const buyStart = app.indexOf('                const buyItem = (item) => {');
const buyEnd = app.indexOf('                const filteredShopItems =', buyStart);
assert.ok(buyStart >= 0 && buyEnd > buyStart);
let nextUniqueId = 1000;
const purchaseState = { user: { coins: 500, inventory: [] }, Date: { now: () => ++nextUniqueId },
    window: context.window, persistNow: () => true, showToast: () => {} };
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
