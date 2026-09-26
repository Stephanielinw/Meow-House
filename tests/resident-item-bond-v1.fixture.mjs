import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
const bonds = require('../js/meeow-resident-items.js');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const moduleSource = readFileSync(new URL('../js/meeow-resident-items.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const residents = [{ id: 'bruce' }, { id: 'peter' }];
const at = '2026-09-01T12:00:00.000Z';
const item = (id = 'item-instance:one', extra = {}) => ({ uniqueId: id, type: 'collectible',
    sourceCatalogId: 'shop-catalog:one', visual: { version: 1, spriteId: 'orb' },
    semanticType: 'collectible', tags: ['role:keepsake'], ...extra });
const pass = (name, fn) => { fn(); process.stdout.write(`PASS ${name}\n`); };
const gift = (user, id, recipientId = 'bruce', persist = () => true) =>
    bonds.transferUserToResident({ user, residents, uniqueId: id, recipientId, persist,
        now: () => at, makeTransferId: () => 'gift-transfer:00000000-0000-4000-8000-000000000001' });

pass('exact resident and physical instance keys; gift is neutral and atomic', () => {
    const physical = item();
    const frozen = clone(physical);
    const user = { inventory: [physical], residentItems: {}, residentItemBonds: {} };
    assert.equal(gift(user, physical.uniqueId).ok, true);
    assert.deepEqual(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId), {
        version: 1, familiarity: 0, fondness: 0, useCount: 0, firstOwnedAt: at, lastUsedAt: null });
    assert.equal(bonds.getResidentItemBond(user, 'peter', physical.uniqueId), null);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', 'item-instance:other'), null);
    assert.strictEqual(user.residentItems.bruce[0], physical);
    assert.equal(user.inventory.length, 0);
    assert.equal(physical.uniqueId, frozen.uniqueId);
    assert.equal(physical.sourceCatalogId, frozen.sourceCatalogId);
    assert.deepEqual(physical.visual, frozen.visual);
    assert.equal(physical.semanticType, frozen.semanticType);
    assert.deepEqual(physical.tags, frozen.tags);
    assert.deepEqual(physical.provenance.originOwner, { kind: 'unknown' });
    assert.equal(physical.provenance.giftHistory.length, 1);
    assert.equal(physical.provenance.giftHistory[0].at, at);
    assert.equal(Object.hasOwn(physical, 'bond'), false);
    assert.equal(Object.hasOwn(physical, 'familiarity'), false);
    assert.equal(Object.hasOwn(user.residentItemBonds.bruce['string:item-instance:one'], 'cherished'), false);
});

pass('failed gift and missing exact target leave no orphan bond', () => {
    const physical = item();
    const user = { inventory: [physical], residentItems: {}, residentItemBonds: {} };
    assert.equal(gift(user, physical.uniqueId, 'bruce', () => false).reason, 'persistence-failed');
    assert.deepEqual(user.residentItemBonds, {});
    assert.deepEqual(user.residentItems, {});
    assert.strictEqual(user.inventory[0], physical);
    assert.equal(Object.hasOwn(physical, 'provenance'), false);
    assert.equal(gift(user, 'item-instance:missing').reason, 'target-missing-or-ambiguous');
    assert.deepEqual(user.residentItemBonds, {});
});

pass('reacquiring the same physical item reuses the historical bond', () => {
    const physical = item();
    const original = { ...bonds.makeNeutralBond('2026-08-01T00:00:00.000Z'),
        familiarity: 4, fondness: 2, useCount: 7, lastUsedAt: '2026-08-30T00:00:00.000Z' };
    const user = { inventory: [physical], residentItems: {}, residentItemBonds: { bruce: {
        'string:item-instance:one': clone(original) } } };
    assert.equal(gift(user, physical.uniqueId).ok, true);
    assert.deepEqual(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId), original);
    assert.equal(physical.provenance.giftHistory[0].at, at);
});

pass('normalization uses earliest matching transfer or null and is idempotent', () => {
    const gifted = item('item-instance:gifted');
    gifted.provenance = bonds.makeProvenance();
    gifted.provenance.giftHistory = [
        { transferId: 'gift-transfer:00000000-0000-4000-8000-000000000002', uniqueId: gifted.uniqueId,
            from: { kind: 'user' }, to: { kind: 'resident', residentId: 'bruce' }, at: '2026-09-03T00:00:00.000Z' },
        { transferId: 'gift-transfer:00000000-0000-4000-8000-000000000003', uniqueId: gifted.uniqueId,
            from: { kind: 'user' }, to: { kind: 'resident', residentId: 'bruce' }, at }
    ];
    const user = { inventory: [], residentItems: { bruce: [gifted, item('item-instance:old')] } };
    assert.equal(bonds.normalizeResidentItemBonds(user, residents).changed, true);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', gifted.uniqueId).firstOwnedAt, at);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', 'item-instance:old').firstOwnedAt, null);
    const before = clone(user.residentItemBonds);
    assert.equal(bonds.normalizeResidentItemBonds(user, residents).changed, false);
    assert.deepEqual(user.residentItemBonds, before);
    assert.equal(bonds.validateResidentItemBonds(user, residents).valid, true);
});

pass('historical bond survives ownership loss and separate resident bond differs', () => {
    const physical = item();
    const user = { inventory: [], residentItems: { bruce: [physical], peter: [] } };
    bonds.normalizeResidentItemBonds(user, residents);
    user.residentItemBonds.bruce['string:item-instance:one'].fondness = 2;
    user.residentItems.bruce.pop();
    user.residentItems.peter.push(physical);
    bonds.normalizeResidentItemBonds(user, residents);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId).fondness, 2);
    assert.equal(bonds.getResidentItemBond(user, 'peter', physical.uniqueId).fondness, 0);
    assert.equal(bonds.recordResidentItemUse({ user, residents, residentId: 'bruce', uniqueId: physical.uniqueId }).ok, false);
    assert.equal(bonds.adjustResidentItemFondness({ user, residents, residentId: 'bruce', uniqueId: physical.uniqueId,
        delta: 1, reason: 'authorized-interaction' }).ok, false);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId).fondness, 2);
    assert.equal(bonds.getResidentOwnedItemBonds(user, 'peter').length, 1);
    assert.equal(bonds.getResidentOwnedItemBonds(user, 'bruce').length, 0);
});

pass('authorized use follows exact deterministic thresholds and leaves fondness alone', () => {
    const physical = item();
    const user = { inventory: [], residentItems: { bruce: [physical] } };
    bonds.normalizeResidentItemBonds(user, residents);
    for (let count = 1; count <= 14; count += 1) {
        const result = bonds.recordResidentItemUse({ user, residents, residentId: 'bruce', uniqueId: physical.uniqueId,
            now: () => at });
        assert.equal(result.ok, true);
        assert.equal(result.bond.useCount, count);
        assert.equal(result.bond.familiarity, count >= 12 ? 5 : count >= 7 ? 4 : count >= 4 ? 3 : count >= 2 ? 2 : 1);
        assert.equal(result.bond.fondness, 0);
        assert.equal(result.bond.lastUsedAt, at);
    }
    assert.equal(bonds.recordResidentItemUse({ user, residents, residentId: 'peter', uniqueId: physical.uniqueId }).ok, false);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId).useCount, 14);
    assert.equal(bonds.recordResidentItemUse({ user, residents, residentId: 'bruce', uniqueId: physical.uniqueId,
        requireUsableSemantics: true }).reason, 'unclassified-item');
    const before = clone(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId));
    assert.equal(bonds.recordResidentItemUse({ user, residents, residentId: 'bruce', uniqueId: physical.uniqueId,
        persist: () => false }).reason, 'persistence-failed');
    assert.deepEqual(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId), before);
});

pass('fondness requires explicit closed reason, current ownership, and clamps', () => {
    const physical = item();
    const user = { inventory: [], residentItems: { bruce: [physical] } };
    bonds.normalizeResidentItemBonds(user, residents);
    const adjust = (delta, reason = 'authorized-interaction') => bonds.adjustResidentItemFondness({ user, residents,
        residentId: 'bruce', uniqueId: physical.uniqueId, delta, reason });
    assert.equal(adjust(2).bond.fondness, 2);
    assert.equal(adjust(2).bond.fondness, 3);
    assert.equal(adjust(-2).bond.fondness, 1);
    assert.equal(adjust(-2).bond.fondness, -1);
    assert.equal(adjust(-2).bond.fondness, -2);
    assert.equal(adjust(5).ok, false);
    assert.equal(adjust(1, 'AI says so').ok, false);
    assert.equal(bonds.adjustResidentItemFondness({ user, residents, residentId: 'peter',
        uniqueId: physical.uniqueId, delta: 1, reason: 'authorized-interaction' }).ok, false);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId).fondness, -2);
    assert.equal(adjust(1, 'authorized-interaction').bond.fondness, -1);
    assert.equal(bonds.adjustResidentItemFondness({ user, residents, residentId: 'bruce',
        uniqueId: physical.uniqueId, delta: 1, reason: 'authorized-interaction', persist: () => false }).reason,
    'persistence-failed');
    assert.equal(bonds.getResidentItemBond(user, 'bruce', physical.uniqueId).fondness, -1);
});

pass('cherished is derived and display uses labels', () => {
    const base = bonds.makeNeutralBond();
    for (const [familiarity, fondness, expected] of [[4, 2, true], [5, 3, true], [3, 3, false], [5, 1, false]])
        assert.equal(bonds.isResidentItemCherished({ ...base, familiarity, fondness }), expected);
    assert.deepEqual(bonds.getResidentItemBondDisplayState(base), {
        familiarity: '刚收到', fondness: '还在了解', cherished: false });
    assert.equal(bonds.getResidentItemBondDisplayState({ ...base, familiarity: 5, fondness: 3 }).fondness, '特别喜欢');
    assert.equal(Object.hasOwn(base, 'cherished'), false);
    assert.match(html, /aria-label="和这件物品"/);
    assert.match(html, /selectedResidentItemBondDisplay\.familiarity/);
    assert.match(html, /selectedResidentItemBondDisplay\.fondness/);
    assert.match(html, /珍爱之物/);
    const residentCard = html.slice(html.indexOf('aria-label="居民物品栏"'), html.indexOf('aria-label="居民物品详情"'));
    assert.doesNotMatch(residentCard, /familiarity|fondness|熟悉度|好感度/);
    const backpack = html.slice(html.indexOf('aria-label="背包"'), html.indexOf('aria-label="居民物品栏"'));
    assert.doesNotMatch(backpack, /selectedResidentItemBondDisplay/);
});

pass('eligibility, validation, and round trip persistence', () => {
    for (const candidate of [item(), { category: 'toy', uniqueId: 'toy' }, { type: 'souvenir', uniqueId: 'souvenir' },
        { type: 'collectible', uniqueId: 'unclassified' }]) assert.equal(bonds.isResidentItemBondEligible(candidate), true);
    for (const candidate of [{ category: 'food', type: 'collectible' }, { type: 'letter' }, {}])
        assert.equal(bonds.isResidentItemBondEligible(candidate), false);
    const user = { inventory: [], residentItems: { bruce: [item()] } };
    bonds.normalizeResidentItemBonds(user, residents);
    const snapshot = clone(user);
    assert.deepEqual(clone(snapshot.residentItemBonds), clone(user.residentItemBonds));
    assert.equal(bonds.normalizeResidentItemBonds(snapshot, residents).changed, false);
    snapshot.residentItemBonds.bruce['string:item-instance:one'].familiarity = 9;
    assert.equal(bonds.validateResidentItemBonds(snapshot, residents).valid, false);
    assert.equal(bonds.normalizeResidentItemBonds(snapshot, residents).changed, false);
    assert.equal(snapshot.residentItemBonds.bruce['string:item-instance:one'].familiarity, 9);
    snapshot.residentItemBonds.bruce['string:item-instance:one'].familiarity = 0;
    snapshot.residentItemBonds.bruce['string:item-instance:one'].lastUsedAt = 'yesterday';
    assert.equal(bonds.validateResidentItemBonds(snapshot, residents).valid, false);
    snapshot.residentItemBonds.bruce['string:item-instance:one'].lastUsedAt = null;
    snapshot.residentItemBonds.unknown = { 'string:item-instance:one': bonds.makeNeutralBond() };
    assert.equal(bonds.validateResidentItemBonds(snapshot, residents).valid, false);
    const malformed = { inventory: [], residentItems: { bruce: [item()] }, residentItemBonds: { bruce: null } };
    assert.equal(bonds.normalizeResidentItemBonds(malformed, residents).changed, false);
    assert.equal(malformed.residentItemBonds.bruce, null);
    assert.match(html, /user, cats: cats\.value, halls: halls\.value, shopItems: shopItems\.value/);
    assert.match(html, /if \(!Object\.hasOwn\(data\.user, 'residentItemBonds'\)\) user\.residentItemBonds = \{\}/);
});

pass('no autonomous usage, affinity mutation, or new AI authority', () => {
    assert.doesNotMatch(moduleSource, /callAI\(|\.affinity\s*=|receivedFrom/);
    assert.equal((html.match(/callAI\(/g) || []).length, 40);
    assert.equal((html.match(/recordResidentItemUse\(/g) || []).length, 0);
    assert.equal((html.match(/adjustResidentItemFondness\(/g) || []).length, 0);
});

process.stdout.write('Resident item bond V1 fixture PASS\n');
