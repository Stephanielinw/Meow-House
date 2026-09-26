import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
let sequence = 0;
const crypto = { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` };
const context = vm.createContext({ window: { crypto }, console, Buffer, Uint8Array, Uint8ClampedArray });
for (const file of ['meeow-semantics.js', 'meeow-item-visuals.js', 'meeow-shop-catalog.js', 'meeow-shop-cart.js', 'meeow-inventory.js', 'meeow-phone-items.js'])
    vm.runInContext(read(`../js/${file}`), context);
const { phoneItems: phone, shopCatalog: shop, itemVisuals: visuals, inventory } = context.window.Meeow;
const catalogId = shop.createSourceCatalogId(crypto);
const visualHint = { object: 'fish', material: 'food', form: 'meal', context: 'food' };
const definition = { id: catalogId, sourceCatalogId: catalogId, name: '香暖鱼饭', desc: '同一目录商品。',
    category: 'food', type: 'consumable', price: 25, effect: 2, icon: '🐟',
    semanticType: 'food', tags: ['temp:warm', 'taste:umami', 'smell:fragrant', 'texture:soft', 'family:fish', 'form:meal'],
    visual: { version: 1, mode: 'auto-sprite', spriteId: 'basefood:fish-meal', visualHint }, visualHint };
const original = plain(definition);
const fullShopCopy = shop.createPurchaseInstance(definition, shop.createInstanceUniqueId(crypto));
const user = { coins: 100, inventory: [fullShopCopy] };
const session = phone.createSession();
const result = phone.purchase(session, [definition], user, { ...definition, price: 1, visual: shop.legacyVisual() }, () => true);
assert.equal(result.ok, true);
assert.equal(user.coins, 75, 'Phone uses current authoritative price, not a passed display copy');
const physical = result.item;
assert.equal(physical.id, definition.id);
assert.equal(physical.sourceCatalogId, definition.sourceCatalogId);
assert.match(physical.uniqueId, /^item-instance:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.notEqual(physical.uniqueId, physical.id);
assert.notEqual(physical.uniqueId, physical.sourceCatalogId);
assert.notEqual(physical.uniqueId, fullShopCopy.uniqueId);
const withoutUniqueId = item => { const copy = plain(item); delete copy.uniqueId; return copy; };
assert.deepEqual(withoutUniqueId(physical), withoutUniqueId(fullShopCopy), 'Full Shop and Phone differ only in physical identity');
assert.deepEqual(plain(physical.visual), plain(definition.visual));
assert.equal(physical.semanticType, 'food');
assert.deepEqual(plain(physical.tags), plain(definition.tags));
assert.deepEqual(plain(definition), original, 'Phone never mutates the catalog');
assert.equal(inventory.deriveInventoryDisplayGroups(user.inventory, [definition])[0].quantity, 2);
const otherId = shop.createSourceCatalogId(crypto);
const other = { ...definition, id: otherId, sourceCatalogId: otherId };
const otherPhysical = phone.prepareInstance(user.inventory, other, { origin: 'shop', catalog: [definition, other] }).item;
assert.equal(inventory.deriveInventoryDisplayGroups([physical, otherPhysical], [definition, other]).length, 2);

const bytes = Buffer.alloc(16384); bytes[3] = 255;
const customVisual = { version: 1, mode: 'custom-pixel', spriteId: null, visualHint: null,
    customPixel: { version: 1, width: 64, height: 64, encoding: 'rgba-base64', data: bytes.toString('base64') } };
for (const visual of [definition.visual, customVisual,
    visuals.createBuiltinItemVisual('housefood:salmon-steak'), shop.legacyVisual()]) {
    const catalog = { ...definition, visual };
    const prepared = phone.prepareInstance([], catalog, { origin: 'shop', catalog: [catalog] });
    assert.equal(prepared.ok, true);
    assert.deepEqual(plain(prepared.item.visual), plain(visual));
    assert.notEqual(prepared.item.visual, catalog.visual, 'frozen payload is copied');
}
const oldResolver = visuals.resolveItemSpriteCandidate;
const oldAssignment = visuals.assignAutoVisualIdentity;
visuals.resolveItemSpriteCandidate = () => { throw new Error('Phone must not resolve'); };
visuals.assignAutoVisualIdentity = () => { throw new Error('Phone must not regenerate visuals'); };
const frozen = phone.prepareInstance([], definition, { origin: 'shop', catalog: [definition] });
assert.equal(frozen.ok, true);
const futureRegistry = [{ ...visuals.registry.find(entry => entry.id === 'basefood:fish-meal'), id: 'basefood:future-fish' }, ...visuals.registry];
assert.equal(visuals.getItemVisualDescriptor(frozen.item, futureRegistry).spriteId, 'basefood:fish-meal');
visuals.resolveItemSpriteCandidate = oldResolver;
visuals.assignAutoVisualIdentity = oldAssignment;

const native = { id: 1, name: definition.name, price: 45, desc: definition.desc, icon: 'fa-solid fa-pizza-slice' };
const nativeCopy = phone.prepareInstance([], native, { origin: 'native', catalog: [{ ...definition, id: 1 }] });
assert.equal(nativeCopy.ok, true);
assert.equal(nativeCopy.item.id, 1, 'native identity is preserved, not replaced by delivery time');
assert.equal(nativeCopy.item.sourceCatalogId, undefined, 'overlapping ID/name cannot invent Shop provenance');
assert.equal(nativeCopy.item.semanticType, undefined);
assert.equal(nativeCopy.item.visual, undefined, 'native compatibility does not regenerate artwork');
assert.equal(phone.prepareInstance([], { ...native, sourceCatalogId: catalogId }, { origin: 'native' }).ok, false);
assert.equal(phone.resolveShopDefinition([definition], { name: definition.name }), null);
assert.equal(phone.resolveShopDefinition([definition], { visual: definition.visual }), null);
assert.equal(phone.resolveShopDefinition([definition, { ...definition }], definition), null, 'ambiguous source is rejected');
assert.equal(phone.resolveShopDefinition([definition], { ...definition, sourceCatalogId: 'invalid' }), null);
const legacy = { id: 123, name: '旧商城玩具', category: 'toy', type: 'consumable', icon: '🧶', price: 8, effect: 1, visual: shop.legacyVisual() };
const migratedCatalog = shop.normalizeShopCatalog([legacy]).items;
const legacyCopy = { ...legacy, uniqueId: 'historical-phone' };
assert.equal(shop.migrateOwnedCatalogSources([legacyCopy], migratedCatalog).items[0].sourceCatalogId, 'legacy-shop:number:123');
assert.equal(shop.migrateOwnedCatalogSources([{ ...legacyCopy, id: 999 }], migratedCatalog).changed, false);
assert.equal(phone.resolveShopDefinition(migratedCatalog, legacy), migratedCatalog[0]);
assert.equal(phone.resolveShopDefinition([legacy, { ...legacy }], legacy), null);
const toyCopy = phone.prepareInstance([], migratedCatalog[0], { origin: 'shop', catalog: migratedCatalog }).item;
assert.equal(toyCopy.semanticType, undefined);
assert.equal(toyCopy.tags, undefined);

const collision = physical.uniqueId;
const fresh = shop.createInstanceUniqueId(crypto);
let attempts = 0;
const retried = phone.prepareInstance(user.inventory, definition, { origin: 'shop', catalog: [definition],
    makeUniqueId: () => { attempts++; return attempts < 3 ? collision : fresh; } });
assert.equal(retried.item.uniqueId, fresh);
assert.equal(attempts, 3);
assert.equal(phone.prepareInstance(user.inventory, definition, { origin: 'shop', catalog: [definition], makeUniqueId: () => collision }).ok, false);
assert.equal(phone.prepareInstance([], definition, { origin: 'shop', catalog: [definition], makeUniqueId: () => 'item-instance:not-a-uuid' }).ok, false);
const failedBuyer = { coins: 100, inventory: [fullShopCopy] };
const priorArray = failedBuyer.inventory;
assert.equal(phone.purchase(phone.createSession(), [definition], failedBuyer, definition, () => false).reason, 'persistence-failed');
assert.equal(failedBuyer.coins, 100);
assert.equal(failedBuyer.inventory, priorArray);
assert.equal(failedBuyer.inventory[0], fullShopCopy);
assert.equal(failedBuyer.inventory.length, 1);
let reentry;
const guarded = phone.createSession();
assert.equal(phone.purchase(guarded, [definition], { coins: 100, inventory: [] }, definition, () => {
    reentry = phone.purchase(guarded, [definition], user, definition, () => true);
    return true;
}).ok, true);
assert.equal(reentry.reason, 'purchase-pending');
assert.equal(guarded.pending, false);
// A completed user purchase is not a retried event: repeated purchases are
// intentionally allowed. No sourceCatalogId-based receipt deduplication exists.
const roundTrip = plain({ shopItems: [definition], user });
assert.deepEqual(roundTrip.user.inventory.map(item => item.uniqueId), user.inventory.map(item => item.uniqueId));
assert.deepEqual(roundTrip.user.inventory[1], plain(physical));
assert.equal(shop.normalizeShopCatalog(roundTrip.shopItems).changed, false);
assert.equal(shop.migrateOwnedCatalogSources(roundTrip.user.inventory, roundTrip.shopItems).changed, false);

const html = read('../index.html');
assert.match(html, /src="\.\/js\/meeow-phone-items\.js"/);
assert.match(html, /@click\.stop="buyPhoneShopItem\(item\)"/);
assert.match(html, /phoneItems\.purchase\(phoneItemPurchaseSession,\s*shopItems\.value, user, item/);
assert.equal((html.match(/orderDelivery/g) || []).length, 1, 'legacy adapter remains dormant; UI is not re-enabled');
const start = html.indexOf('                const orderDelivery = async');
const end = html.indexOf('                // --- CATVEGAS', start);
const adapter = html.slice(start, end);
assert.ok(!/id: Date\.now\(\).*inventory|inventory\.push\(\{.*Date\.now|uniqueId: Date\.now/.test(adapter));
assert.ok(!/callAI\(|assignAutoVisualIdentity|resolveItemSpriteCandidate/.test(adapter));
const runAdapter = (persist, random = 0.8) => {
    const state = { user: { coins: 100, inventory: [], phoneData: { delivery: [], walletTransactions: [] } },
        phoneState: { isOrdering: false }, shopItems: { value: [definition] },
        cats: { value: [{ status: '在家', affinity: 40, innerVoice: '原状态' }] },
        window: context.window, persistNow: persist, showToast: () => {}, addLog: () => {},
        getCurrentTimeStr: () => '12:00', Math: { random: () => random } };
    state.addWalletTransaction = (type, amount) => {
        state.user.coins -= amount;
        state.user.phoneData.walletTransactions.push({ type, amount });
    };
    const fn = new Function('state', `const { user, phoneState, shopItems, cats, window, persistNow,
        showToast, addLog, getCurrentTimeStr, addWalletTransaction, Math } = state;
        ${adapter} return orderDelivery;`)(state);
    return { state, fn };
};
const delivery = runAdapter(() => true);
await delivery.fn(definition, 'shop');
assert.equal(delivery.state.user.inventory[0].id, definition.id);
assert.equal(delivery.state.user.inventory[0].sourceCatalogId, catalogId);
assert.equal(delivery.state.user.phoneData.delivery[0].itemUniqueId, delivery.state.user.inventory[0].uniqueId);
const nativeDelivery = runAdapter(() => true);
await nativeDelivery.fn(native);
assert.equal(nativeDelivery.state.user.inventory[0].sourceCatalogId, undefined);
const failedDelivery = runAdapter(() => false, 0.1);
await failedDelivery.fn(native);
assert.equal(failedDelivery.state.user.coins, 100);
assert.equal(failedDelivery.state.user.inventory.length, 0);
assert.equal(failedDelivery.state.user.phoneData.delivery.length, 0);
assert.equal(failedDelivery.state.user.phoneData.walletTransactions.length, 0);
assert.equal(failedDelivery.state.cats.value[0].affinity, 40);
assert.equal(failedDelivery.state.cats.value[0].innerVoice, '原状态');
assert.equal(failedDelivery.state.phoneState.isOrdering, false);
assert.equal((html.match(/callAI\(/g) || []).length, 40);
console.log('Phone item identity V1 fixture: PASS');
