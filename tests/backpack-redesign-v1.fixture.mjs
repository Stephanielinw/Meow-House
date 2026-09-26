import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../js/meeow-semantics.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../js/meeow-inventory.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../js/meeow-resident-items.js', import.meta.url), 'utf8'), context);
const inventory = context.window.Meeow.inventory;
const plain = value => JSON.parse(JSON.stringify(value));
const food = {
    id: 'builtin-food:spiced-meat-jerky', name: '辛香肉干', icon: 'fa-solid fa-bowl-food',
    desc: '常温肉干', price: 60, effect: 2, type: 'consumable', category: 'food', semanticType: 'food',
    tags: ['temp:room', 'taste:salty', 'taste:spicy', 'smell:pungent', 'texture:chewy', 'texture:dry', 'family:meat', 'form:snack'],
    metadata: { origin: 'shop', presentation: { color: 'red', size: 2 } }
};
const otherFood = { ...food, id: 'builtin-food:other', tags: [...food.tags] };
const custom = { id: 1720000000000, name: '自制玩具', icon: '🧶', desc: '手工小球',
    price: 80, effect: 1, type: 'consumable', category: 'toy' };
const catalog = [food, otherFood, custom];
const copies = [1, 2, 3].map(uniqueId => ({ ...food, tags: [...food.tags], metadata: plain(food.metadata), uniqueId }));
const reordered = { ...food, uniqueId: 4, metadata: { presentation: { size: 2, color: 'red' }, origin: 'shop' },
    tags: [...food.tags].reverse() };
const input = [...copies, { ...otherFood, uniqueId: 5 }, reordered];
const before = JSON.stringify(input);
const groups = inventory.deriveInventoryDisplayGroups(input, catalog);
assert.equal(groups.length, 2);
assert.equal(groups[0].quantity, 4);
assert.equal(groups[1].quantity, 1);
assert.equal(groups[0].representativeItem, copies[0]);
assert.equal(groups[0].instances[3], reordered);
assert.equal(JSON.stringify(input), before, 'grouping must not mutate saved instances');
assert.deepEqual(plain(inventory.deriveInventoryDisplayGroups(input, catalog).map(group => group.stackKey)),
    plain(groups.map(group => group.stackKey)), 'same input must keep group order and keys');
assert.notEqual(groups[0].stackKey, groups[1].stackKey, 'same name cannot merge different catalog IDs');
assert.equal(inventory.deriveInventoryDisplayGroups([{ ...custom, uniqueId: 7 }, { ...custom, uniqueId: 8 }], catalog)[0].quantity, 2);
assert.equal(inventory.deriveInventoryDisplayGroups([{ ...food, uniqueId: 1 }, { ...food, effect: 3, uniqueId: 2 }], catalog).length, 2);
assert.equal(inventory.deriveInventoryDisplayGroups([{ ...food, uniqueId: 1 }, { ...food, metadata: { origin: 'different' }, uniqueId: 2 }], catalog).length, 2);
assert.equal(inventory.deriveInventoryDisplayGroups([{ ...food, uniqueId: 1 }, { ...food, tags: ['bad:tag'], uniqueId: 2 }], catalog).length, 2);
assert.equal(inventory.deriveInventoryDisplayGroups([{ ...food, id: 1720000000123, uniqueId: 1 }, { ...food, id: 1720000000124, uniqueId: 2 }], catalog).length, 2,
    'Phone deliveries with timestamp IDs lack catalog identity');
const souvenirs = [
    { id: 100, uniqueId: 101, name: '松枝', icon: '🌲', desc: '旅途所得', type: 'collectible' },
    { id: 200, uniqueId: 201, name: '松枝', icon: '🌲', desc: '旅途所得', type: 'collectible' }
];
assert.equal(inventory.deriveInventoryDisplayGroups(souvenirs, catalog).length, 2);
assert.equal(inventory.deriveInventoryDisplayGroups([{ name: '旧物', icon: '🎁', desc: '旧描述', type: 'collectible' }], catalog).length, 1);
assert.deepEqual(plain(inventory.getItemDisplayAttributes(souvenirs[0])), []);
assert.deepEqual(plain(inventory.getItemDisplayAttributes({ name: '旧物', type: 'consumable' })), []);
assert.match(inventory.getItemDisplaySummary(food), /辣/);
assert.equal(inventory.getItemDisplayCategory(souvenirs[0]), '收藏品');
assert.equal(inventory.getItemDisplayCategory(custom), '玩具 · 消耗品');
const registry = context.window.Meeow.semantics.SEMANTIC_TAG_REGISTRY.food.namespaces;
for (const [namespace, definition] of Object.entries(registry)) for (const value of definition.values) {
    assert.ok(inventory.FOOD_ATTRIBUTE_LABELS[`${namespace}:${value}`], `missing display label ${namespace}:${value}`);
}
assert.equal(inventory.getItemDisplayAttributes(food).length, food.tags.length);
assert.equal(inventory.getItemDisplayAttributes(food)[0], '常温');
const collision = [{ ...food, uniqueId: 10 }, { ...otherFood, uniqueId: 10 }];
assert.equal(inventory.findInventoryItemIndex(collision, collision[1], 10), 1, 'exact reference wins over a colliding uniqueId');
assert.equal(inventory.getInventoryInstanceSelector(collision[1], collision).key, 'id');
assert.equal(inventory.resolveInventoryInstance(collision, inventory.getInventoryInstanceSelector(collision[1], collision)), collision[1]);
assert.equal(inventory.getInventoryInstanceSelector(souvenirs[0], souvenirs).key, 'uniqueId');
const duplicateIdentities = [{ id: 1, uniqueId: 2 }, { id: 1, uniqueId: 2 }];
assert.equal(inventory.getInventoryInstanceSelector(duplicateIdentities[1], duplicateIdentities).key, 'reference');
assert.equal(inventory.resolveInventoryInstance(duplicateIdentities, inventory.getInventoryInstanceSelector(duplicateIdentities[1], duplicateIdentities)), duplicateIdentities[1]);

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf('                const currentBagItems = computed(');
const end = source.indexOf('                const useItem = async (item) => {', start);
assert.ok(start >= 0 && end > start);
const uiSlice = source.slice(start, end);
const uiItems = [1, 2, 3].map(uniqueId => ({ ...food, uniqueId }));
const watchers = [];
const ui = vm.createContext({
    window: context.window, user: { inventory: uiItems, residentItems: {} }, shopItems: { value: catalog },
    currentBagTab: { value: 'consumable' }, selectedBagSelection: { value: null },
    itemInteractionInFlight: { value: false }, showBag: { value: true },
    showGiftChooser: { value: false }, selectedGiftUniqueId: { value: null }, giftRecipientId: { value: '' },
    giftError: { value: '' }, giftInFlight: { value: false }, selectedResidentItemUniqueId: { value: null },
    selectedCat: { value: null }, cats: { value: [] }, getResidentPublicName: () => 'Resident', persistNow: () => true,
    computed: fn => ({ get value() { return fn(); } }), watch: (source, callback) => { watchers.push({ source, callback }); },
    confirm: () => true, showToast: () => {},
    useItem: async item => {
        ui.lastUsed = item;
        ui.user.inventory.splice(ui.user.inventory.findIndex(entry => entry === item), 1);
        ui.showBag.value = false;
    }
});
vm.runInContext(`${uiSlice}\nObject.assign(globalThis, {
    groups: currentBagGroups, selected: selectedBagGroup, open: openBagItemDetail,
    close: closeBagItemDetail, use: useSelectedBagItem, discard: discardSelectedBagItem
});`, ui);
assert.equal(ui.groups.value[0].quantity, 3);
ui.open(ui.groups.value[0]);
assert.equal(ui.selected.value.quantity, 3);
ui.discard();
assert.equal(ui.selected.value.quantity, 2);
ui.discard();
assert.equal(ui.selected.value.quantity, 1);
ui.discard();
assert.equal(ui.groups.value.length, 0);
assert.equal(ui.selected.value, null);
assert.equal(ui.user.inventory.length, 0);
ui.user.inventory.push(...copies);
ui.open(ui.groups.value[0]);
await ui.use();
assert.equal(ui.lastUsed, copies[0], 'Use passes the first current instance to the existing path');
assert.equal(ui.showBag.value, false, 'Use retains the existing Backpack-close navigation');
assert.equal(ui.groups.value[0].quantity, 2, 'the existing use path consumes one instance');
watchers.find(entry => entry.source === ui.showBag).callback(false);
assert.equal(ui.selected.value, null, 'closing Backpack clears its detail selection');
ui.user.inventory.splice(0, ui.user.inventory.length, ...souvenirs);
ui.currentBagTab.value = 'collectible';
ui.open(ui.groups.value[1]);
ui.currentBagTab.value = 'consumable';
watchers.find(entry => entry.source === ui.currentBagTab).callback();
assert.equal(ui.selected.value, null, 'switching tabs closes the detail sheet');
ui.currentBagTab.value = 'collectible';
ui.open(ui.groups.value[1]);
ui.discard();
assert.equal(ui.user.inventory.length, 1);
assert.equal(ui.user.inventory[0], souvenirs[0], 'unique discard removes exactly the selected souvenir');
assert.equal(ui.selected.value, null);
assert.match(source, /v-for="group in currentBagGroups"/);
assert.match(source, /v-if="selectedBagItem\.type === 'consumable'"/);
assert.match(source, /showBag\.value = false;/);
assert.equal((source.match(/callAI\(/g) || []).length, 40);

console.log('Backpack Redesign V1 fixture: PASS');
