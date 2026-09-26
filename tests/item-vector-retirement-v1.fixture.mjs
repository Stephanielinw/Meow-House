import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const context = vm.createContext({ window: {}, console, Buffer, Uint8Array, Uint8ClampedArray });
vm.runInContext(read('../js/meeow-item-visuals.js'), context);
vm.runInContext(read('../js/meeow-semantics.js'), context);
vm.runInContext(read('../js/meeow-shop-catalog.js'), context);
const { itemVisuals, shopCatalog } = context.window.Meeow;

const catalogStart = html.indexOf('let initialShopItems = [');
const catalogEnd = html.indexOf('const builtInFoodDefinitions', catalogStart);
assert.ok(catalogStart > 0 && catalogEnd > catalogStart);
const { items, fixedIds } = new Function('window', `${html.slice(catalogStart, catalogEnd)};
    return { items: initialShopItems, fixedIds: fixedShopBaseSpriteIds };`)(context.window);
assert.equal(items.length, 22);
assert.equal(items.filter(item => item.id.startsWith?.('builtin-food:')).length, 16);
assert.equal(items.filter(item => item.visual?.spriteId?.startsWith('housefood:')).length, 16);
assert.equal(fixedIds[1], 'basefood:grain-bowl');
assert.equal(fixedIds[7], 'baseitem:herb');
assert.equal(items.filter(item => typeof item.id === 'number' && item.icon.startsWith('fa-') && !item.visual).length, 0);
assert.equal(fixedIds[2], 'baseitem:star-sand-orb');
assert.equal(fixedIds[3], 'baseitem:teaser-wand');
assert.equal(fixedIds[4], 'baseitem:catnip-pouch');
assert.equal(fixedIds[5], 'baseitem:riddle-paper-ball');
for (const id of [1, 2, 3, 4, 5, 7]) {
    const item = items.find(entry => entry.id === id);
    assert.equal(item.visual.mode, 'builtin-sprite');
    assert.equal(itemVisuals.getItemVisualDescriptor(item).spriteId, fixedIds[id]);
}

const promoteStart = html.indexOf('const promoteFixedShopBaseVisual = item =>');
const promoteEnd = html.indexOf('shopItems.value = shopItems.value.map(promoteFixedShopBaseVisual)', promoteStart);
assert.ok(promoteStart > 0 && promoteEnd > promoteStart);
const makePromoter = new Function('initialShopItems', 'fixedShopBaseSpriteIds', 'window', `
    let rosterMigrationPendingSave = false;
    ${html.slice(promoteStart, promoteEnd)}
    return { promoteFixedShopBaseVisual, dirty: () => rosterMigrationPendingSave };
`);
const { promoteFixedShopBaseVisual: promote, dirty } = makePromoter(items, fixedIds, context.window);
const legacy = { ...items.find(item => item.id === 1), visual: shopCatalog.legacyVisual() };
const upgraded = promote(legacy);
assert.equal(upgraded.visual.spriteId, 'basefood:grain-bowl');
assert.equal(dirty(), true);
assert.equal(promote(upgraded), upgraded, 'migration is idempotent');
const explicit = { ...legacy, visual: itemVisuals.createBuiltinItemVisual('basefood:fish-meal') };
assert.equal(promote(explicit), explicit, 'existing explicit visual remains authoritative');
assert.equal(promote({ ...legacy, name: 'Other item' }).visual.mode, 'legacy-icon', 'name alone cannot reassign art');
assert.equal(promote({ ...legacy, sourceCatalogId: 'shop-catalog:00000000-0000-4000-8000-000000000001' }).visual.mode,
    'legacy-icon', 'different catalog provenance cannot receive fixed Shop art');

const physical = shopCatalog.createPurchaseInstance(items.find(item => item.id === 7),
    'item-instance:00000000-0000-4000-8000-000000000002');
assert.equal(itemVisuals.getItemVisualDescriptor(physical).spriteId, 'baseitem:herb');
assert.equal(physical.visual.spriteId, 'baseitem:herb');
assert.match(html, /visual: window\.Meeow\.itemVisuals\.createBuiltinItemVisual\('baseitem:letter'\)/,
    'new conditional inventory letter has an explicit item sprite');
const letterStart = html.indexOf('// This is an inventory letter item, separate from Mail UI chrome.');
const letterEnd = html.indexOf('const reconciledFoodCatalog', letterStart);
assert.ok(letterStart > 0 && letterEnd > letterStart);
const migrateLetters = new Function('user', 'window', `
    let rosterMigrationPendingSave = false;
    ${html.slice(letterStart, letterEnd)}
    return { inventory: user.inventory, dirty: rosterMigrationPendingSave };
`);
const oldLetter = { id: 901, name: '来自阿猫的信', type: 'letter', icon: 'fa-solid fa-envelope',
    fullContent: '你好', desc: '你好...' };
const unrelatedEnvelope = { id: 902, name: '信封装饰', type: 'decoration', icon: 'fa-solid fa-envelope', fullContent: 'x' };
const migrated = migrateLetters({ inventory: [oldLetter, unrelatedEnvelope] }, context.window);
assert.equal(migrated.inventory[0].visual.spriteId, 'baseitem:letter');
assert.equal(migrated.inventory[0].id, oldLetter.id, 'saved letter identity is preserved');
assert.equal(migrated.inventory[1], unrelatedEnvelope, 'Mail/UI or unrelated envelope stays untouched');
assert.equal(migrated.dirty, true);
assert.equal(migrateLetters({ inventory: migrated.inventory }, context.window).dirty, false, 'letter migration is idempotent');

assert.match(html, /<meeow-item-visual :item="\{ icon: msg\.itemIcon \|\| '🎁', visual: msg\.itemVisual \}" size="small"/);
assert.match(html, /itemVisual: window\.Meeow\.itemVisuals\.normalizeItemVisual\(targetItem\.visual\)/);
for (const surface of [
    ':item="item" size="small"', ':item="item" size="medium"',
    ':item="group.representativeItem" size="small"',
    ':item="mail.item" size="small"', ':item="exploreState.settlement.loot" size="medium"'
]) assert.ok(html.includes(`<meeow-item-visual ${surface}`), `${surface} uses shared renderer`);
assert.ok(html.includes('<meeow-item-detail-presentation :item="selectedBagItem"'),
    'Backpack detail uses shared item presentation');
assert.ok(read('../js/meeow-item-detail-presentation.js')
    .includes('<meeow-item-visual :item="item" size="large"'),
    'shared detail presentation uses shared visual renderer');

const known = itemVisuals.assignAutoVisualIdentity({ name: '橄榄枝', icon: '🌿', desc: '旅行纪念',
    visualHint: { object: 'branch', material: 'wood', form: 'natural-object', context: 'nature' } });
assert.equal(known.visual.spriteId, 'baseitem:branch');
const unknown = itemVisuals.assignAutoVisualIdentity({ name: '旧书', icon: '📖', desc: '旧物',
    visualHint: { object: 'book', material: 'paper', form: 'document', context: 'writing' } });
assert.equal(unknown.visual.mode, 'legacy-icon', 'no poor first-party substitute is forced');

console.log('Item vector retirement V1 fixture: PASS');
