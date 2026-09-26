import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
const catalog = require('../js/meeow-shop-catalog.js');
require('../js/meeow-shop-cart.js');
const cart = globalThis.Meeow.shopCart;
const resident = require('../js/meeow-resident-items.js');
require('../js/meeow-inventory.js');
const inventory = globalThis.Meeow.inventory;
const app = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const assertPass = (name, fn) => { fn(); process.stdout.write(`PASS ${name}\n`); };
const residents = [{ id: 'dick', name: 'Dick' }, { id: 'bruce', name: 'Bruce' }, { id: 'peter', name: 'Peter' }];
const sourceCatalogId = catalog.createSourceCatalogId(webcrypto);
const definition = { id: sourceCatalogId, sourceCatalogId, name: '绒球', desc: '柔软的小玩具',
    category: 'toy', type: 'consumable', effect: 1, price: 20,
    visual: { version: 1, mode: 'builtin-sprite', spriteId: 'baseitem:star-sand-orb' } };
const purchased = () => catalog.createPurchaseInstance(definition, catalog.createInstanceUniqueId(webcrypto));

assertPass('canonical eligibility, independent of Backpack tab', () => {
    assert.equal(resident.isGiftableToResident({ category: 'toy', type: 'consumable' }), true);
    assert.equal(resident.isGiftableToResident({ type: 'collectible' }), true);
    assert.equal(resident.isGiftableToResident({ type: 'souvenir' }), true);
    assert.equal(resident.isGiftableToResident({ category: 'food', type: 'consumable' }), false);
    assert.equal(resident.isGiftableToResident({ category: 'food', type: 'collectible' }), false);
    assert.equal(resident.isGiftableToResident({ type: 'letter' }), false);
    assert.match(app, /i\.type === 'collectible' \|\| i\.type === 'letter'/);
    assert.deepEqual(resident.getResidentOwnedItems({}, 'dick'), []);
});
assertPass('new Shop physical instance starts with user originOwner', () => {
    const item = purchased();
    assert.deepEqual(item.provenance.originOwner, { kind: 'user' });
    assert.equal(item.provenance.origin.kind, 'shop');
    assert.equal(item.sourceCatalogId, sourceCatalogId);
    assert.match(item.uniqueId, /^item-instance:[0-9a-f-]{36}$/);
});
assertPass('Explore and gameplay reward ownership can be recorded without changing identity', () => {
    const explore = resident.withOrigin({ uniqueId: 'item-instance:one', type: 'collectible' },
        { kind: 'user' }, { kind: 'explore', eventId: 'case-1' });
    const reward = resident.withOrigin({ uniqueId: 'item-instance:two', type: 'collectible' },
        { kind: 'user' }, { kind: 'game-reward' });
    assert.equal(explore.provenance.originOwner.kind, 'user');
    assert.equal(reward.provenance.originOwner.kind, 'user');
    assert.match(app, /kind: 'explore', eventId: String\(caseRecord\.id\)/);
});
assertPass('structured resident mail/Away sender is original owner, no name parsing', () => {
    const mailItem = { id: 42, name: '小贝壳', type: 'collectible', uniqueId: 'historical-1' };
    const mailbox = [{ claimed: true, catId: 'dick', plannedMailId: 'mail-7', item: { id: 42, name: '小贝壳' } }];
    const inferred = resident.inferClaimedMailOrigin(mailItem, mailbox);
    assert.deepEqual(inferred.originOwner, { kind: 'resident', residentId: 'dick' });
    assert.equal(inferred.origin.eventId, 'mail-7');
    assert.equal(resident.inferClaimedMailOrigin({ ...mailItem, id: 43 }, mailbox), null);
    assert.equal(resident.inferClaimedMailOrigin(mailItem, [...mailbox, { ...mailbox[0] }]), null);
    const legacyUser = { inventory: [{ id: 42, name: '小贝壳', type: 'collectible' }],
        residentItems: {}, mailbox };
    resident.normalizeOwnedState(legacyUser);
    assert.deepEqual(legacyUser.inventory[0].provenance.originOwner,
        { kind: 'resident', residentId: 'dick' });
    assert.match(app, /kind: plannedMailId \? 'away-souvenir' : 'resident-mail'/);
});
assertPass('normalization assigns missing giftable IDs once and preserves ambiguous corruption', () => {
    const legacy = { id: 7, name: '纪念石', type: 'collectible' };
    const user = { inventory: [legacy], residentItems: {}, mailbox: [] };
    const first = resident.normalizeOwnedState(user);
    const id = legacy.uniqueId;
    assert.equal(first.assigned, 1);
    assert.match(id, /^item-instance:[0-9a-f-]{36}$/);
    assert.equal(resident.normalizeOwnedState(user).assigned, 0);
    assert.equal(legacy.uniqueId, id);
    const duplicate = { inventory: [{ type: 'collectible', uniqueId: 'same' }],
        residentItems: { dick: [{ type: 'collectible', uniqueId: 'same' }] } };
    const checked = resident.normalizeOwnedState(duplicate);
    assert.equal(checked.ownership.duplicateIds.length, 1);
    assert.equal(duplicate.inventory.length, 1);
    assert.equal(duplicate.residentItems.dick.length, 1);
});
assertPass('exact physical object moves and originOwner never changes', () => {
    const item = resident.withOrigin(purchased(), { kind: 'resident', residentId: 'dick' },
        { kind: 'resident-mail', residentId: 'dick' });
    // A real resident-origin item has its own authoritative source; replace only fixture setup.
    item.provenance = resident.makeProvenance({ kind: 'resident', residentId: 'dick' },
        { kind: 'resident-mail', residentId: 'dick' });
    const before = { uniqueId: item.uniqueId, sourceCatalogId: item.sourceCatalogId,
        visual: plain(item.visual), originOwner: plain(item.provenance.originOwner) };
    const user = { inventory: [item], residentItems: {} };
    const result = resident.transferUserToResident({ user, residents, uniqueId: item.uniqueId,
        recipientId: 'bruce', persist: () => true });
    assert.equal(result.ok, true);
    assert.equal(user.inventory.length, 0);
    assert.strictEqual(user.residentItems.bruce[0], item);
    assert.equal(item.uniqueId, before.uniqueId);
    assert.equal(item.sourceCatalogId, before.sourceCatalogId);
    assert.deepEqual(plain(item.visual), before.visual);
    assert.deepEqual(plain(item.provenance.originOwner), before.originOwner);
    assert.equal(item.provenance.giftHistory.length, 1);
    assert.equal(item.provenance.giftHistory[0].uniqueId, before.uniqueId);
    assert.match(item.provenance.giftHistory[0].transferId, /^gift-transfer:[0-9a-f-]{36}$/);
    assert.deepEqual(resident.firstGiver(item), { kind: 'user' });
    const future = resident.appendGiftEvent(item.provenance, {
        transferId: catalog.createInstanceUniqueId(webcrypto).replace(/^item-instance:/, 'gift-transfer:'),
        uniqueId: item.uniqueId, from: { kind: 'resident', residentId: 'bruce' },
        to: { kind: 'resident', residentId: 'peter' }, at: new Date().toISOString()
    });
    assert.equal(future.giftHistory.length, 2);
    assert.deepEqual(future.giftHistory[0], item.provenance.giftHistory[0]);
    assert.deepEqual(resident.firstGiver({ provenance: future }), { kind: 'user' });
    assert.equal(resident.scanOwnership(user.inventory, user.residentItems).duplicateIds.length, 0);
});
assertPass('one selected instance moves from a displayed stack of five', () => {
    const copies = Array.from({ length: 5 }, purchased);
    const user = { inventory: [...copies], residentItems: {} };
    const before = inventory.deriveInventoryDisplayGroups(user.inventory, [definition]);
    assert.equal(before.length, 1);
    assert.equal(before[0].quantity, 5);
    const chosen = copies[3];
    const result = resident.transferUserToResident({ user, residents, uniqueId: chosen.uniqueId,
        recipientId: 'dick', persist: () => true });
    assert.equal(result.ok, true);
    assert.strictEqual(user.residentItems.dick[0], chosen);
    assert.equal(inventory.deriveInventoryDisplayGroups(user.inventory, [definition])[0].quantity, 4);
    for (const item of copies.filter(entry => entry !== chosen)) assert.ok(user.inventory.includes(item));
});
assertPass('removed exact target cannot substitute another equivalent instance', () => {
    const a = purchased(), b = purchased();
    const user = { inventory: [b], residentItems: {} };
    const result = resident.transferUserToResident({ user, residents, uniqueId: a.uniqueId,
        recipientId: 'dick', persist: () => true });
    assert.equal(result.reason, 'target-missing-or-ambiguous');
    assert.deepEqual(user.inventory, [b]);
    assert.deepEqual(user.residentItems, {});
    assert.equal(resident.transferUserToResident({ user, residents, uniqueId: b.uniqueId,
        recipientId: 'missing-cat', persist: () => true }).reason, 'invalid-recipient');
    const food = { ...b, uniqueId: 'food-instance', category: 'food' };
    user.inventory.push(food);
    assert.equal(resident.transferUserToResident({ user, residents, uniqueId: food.uniqueId,
        recipientId: 'dick', persist: () => true }).reason, 'ineligible-item');
});
assertPass('persistence failure restores both exact containers and provenance', () => {
    const item = purchased(), oldProvenance = item.provenance;
    const user = { inventory: [item], residentItems: { dick: [] } };
    const result = resident.transferUserToResident({ user, residents, uniqueId: item.uniqueId,
        recipientId: 'dick', persist: () => false });
    assert.equal(result.reason, 'persistence-failed');
    assert.strictEqual(user.inventory[0], item);
    assert.equal(user.residentItems.dick.length, 0);
    assert.strictEqual(item.provenance, oldProvenance);
    assert.equal(item.provenance.giftHistory.length, 0);
    const clean = { inventory: [item], residentItems: {} };
    const thrown = resident.transferUserToResident({ user: clean, residents, uniqueId: item.uniqueId,
        recipientId: 'bruce', persist: () => { throw new Error('disk full'); } });
    assert.equal(thrown.reason, 'persistence-failed');
    assert.strictEqual(clean.inventory[0], item);
    assert.equal(Object.hasOwn(clean.residentItems, 'bruce'), false);
    const noId = resident.transferUserToResident({ user: clean, residents, uniqueId: item.uniqueId,
        recipientId: 'bruce', persist: () => true, makeTransferId: () => { throw new Error('no crypto'); } });
    assert.equal(noId.reason, 'identity-unavailable');
    assert.strictEqual(clean.inventory[0], item);
});
assertPass('reentrant or repeated gift confirmation cannot transfer twice', () => {
    const item = purchased();
    const user = { inventory: [item], residentItems: {} };
    let nested;
    const first = resident.transferUserToResident({ user, residents, uniqueId: item.uniqueId,
        recipientId: 'dick', persist: () => {
            nested = resident.transferUserToResident({ user, residents, uniqueId: item.uniqueId,
                recipientId: 'bruce', persist: () => true });
            return true;
        } });
    assert.equal(first.ok, true);
    assert.equal(nested.reason, 'transfer-pending');
    const repeated = resident.transferUserToResident({ user, residents, uniqueId: item.uniqueId,
        recipientId: 'bruce', persist: () => true });
    assert.equal(repeated.reason, 'target-missing-or-ambiguous');
    assert.equal(user.residentItems.dick.length, 1);
    assert.equal(user.residentItems.bruce, undefined);
    assert.equal(item.provenance.giftHistory.length, 1);
});
assertPass('duplicate ownership is reported and transfer blocked, never silently resolved', () => {
    const item = purchased();
    const user = { inventory: [item], residentItems: { dick: [{ ...item }] } };
    assert.equal(resident.scanOwnership(user.inventory, user.residentItems).duplicateIds.length, 1);
    const result = resident.transferUserToResident({ user, residents, uniqueId: item.uniqueId,
        recipientId: 'bruce', persist: () => true });
    assert.equal(result.reason, 'duplicate-ownership');
    assert.equal(user.inventory.length, 1);
    assert.equal(user.residentItems.dick.length, 1);
    const residentDuplicate = { dick: [{ uniqueId: 'duplicate-2' }], bruce: [{ uniqueId: 'duplicate-2' }] };
    assert.equal(resident.scanOwnership([], residentDuplicate).duplicateIds.length, 1);
});
assertPass('new purchases reject collisions with resident-owned physical IDs', () => {
    const collision = catalog.createInstanceUniqueId(webcrypto);
    const buyer = { coins: 100, inventory: [], residentItems: { dick: [{ uniqueId: collision }] } };
    assert.equal(catalog.commitCatalogPurchase(buyer, definition, collision, () => true).reason,
        'duplicate-or-invalid-instance-id');
    const session = cart.createSession();
    assert.equal(cart.add(session, [definition], definition), true);
    const fresh = catalog.createInstanceUniqueId(webcrypto);
    const ids = [collision, fresh];
    const result = cart.checkout(session, [definition], buyer, () => true, () => ids.shift());
    assert.equal(result.ok, true);
    assert.equal(buyer.inventory[0].uniqueId, fresh);
    assert.equal(buyer.inventory[0].provenance.originOwner.kind, 'user');
    assert.equal(resident.scanOwnership(buyer.inventory, buyer.residentItems).duplicateIds.length, 0);
});
assertPass('reload/export/import preserves single ownership and frozen physical data', () => {
    const item = purchased();
    item.visual = { version: 1, mode: 'custom-pixel', customPixel: { data: 'AAA=' } };
    item.semanticType = 'food'; item.tags = ['family:grain'];
    const user = { inventory: [item], residentItems: {} };
    assert.equal(resident.transferUserToResident({ user, residents, uniqueId: item.uniqueId,
        recipientId: 'peter', persist: () => true }).ok, true);
    const restored = plain(user);
    assert.equal(restored.inventory.length, 0);
    assert.equal(restored.residentItems.peter[0].uniqueId, item.uniqueId);
    assert.equal(restored.residentItems.peter[0].sourceCatalogId, item.sourceCatalogId);
    assert.deepEqual(restored.residentItems.peter[0].visual, item.visual);
    assert.deepEqual(restored.residentItems.peter[0].tags, item.tags);
    assert.deepEqual(restored.residentItems.peter[0].provenance, item.provenance);
    assert.equal(resident.scanOwnership(restored.inventory, restored.residentItems).duplicateIds.length, 0);
    assert.match(app, /user, cats: cats\.value, halls: halls\.value, shopItems: shopItems\.value/);
    assert.match(app, /if \(!Object\.hasOwn\(data\.user, 'residentItems'\)\) user\.residentItems = \{\}/);
});
assertPass('resident UI is read-only and uses shared visual presentation', () => {
    assert.match(app, /aria-label="居民物品栏"/);
    assert.match(app, /还没有收藏的小物件/);
    assert.match(app, /aria-label="居民物品详情"/);
    assert.match(app, /<meeow-item-detail-presentation :item="selectedResidentOwnedItem"/);
    assert.match(app, /<meeow-item-visual :item="item" size="small"/);
    assert.match(app, /最初持有：/);
    assert.match(app, /最初赠予：/);
    assert.match(app, /流转记录/);
    assert.match(app, /selectedGiftUniqueId\.value = null; \/\/ Even a stacked row requires/);
    assert.match(app, /v-if="showGiftChooser" class="fixed inset-0 z-\[700\]/);
    assert.match(app, /const result = residentItemAuthority\.transferUserToResident/);
    const giftSlice = app.slice(app.indexOf('                const confirmGiftToResident ='),
        app.indexOf('                const itemPixelEditorEligibility ='));
    assert.doesNotMatch(giftSlice, /callAI\(|\.affinity\s*=|setCatStatus\(|chatHistory\.push\(/);
});
assertPass('scope remains deterministic and production AI call count stays 40', () => {
    const module = readFileSync(new URL('../js/meeow-resident-items.js', import.meta.url), 'utf8');
    assert.doesNotMatch(module, /callAI\(/);
    assert.equal((app.match(/callAI\(/g) || []).length, 40);
});

process.stdout.write('Resident item ownership/provenance V1 fixture PASS\n');
