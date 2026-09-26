import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../js/meeow-semantics.js');
require('../js/meeow-resident-items.js');
const usage = require('../js/meeow-resident-item-usage.js');
const bonds = globalThis.Meeow.residentItems;
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../js/meeow-resident-item-usage.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const residents = [{ id: 'bruce' }, { id: 'peter' }];
const now = new Date('2026-09-26T12:00:00.000Z');
const eventId = 'resident-item-use:00000000-0000-4000-8000-000000000111';
const toyTags = ['role:play', 'interaction:chase', 'stimulus:rolling', 'stimulus:glowing'];
const physical = (id, extra = {}) => ({ uniqueId: id, name: id, type: 'collectible',
    sourceCatalogId: 'shop-catalog:one', semanticType: 'toy', tags: [...toyTags],
    visual: { version: 1, spriteId: 'orb' }, provenance: bonds.makeProvenance(), ...extra });
const makeUser = (items = []) => {
    const user = { inventory: [], residentItems: { bruce: items, peter: [] } };
    bonds.normalizeResidentItemBonds(user, residents);
    return user;
};
const roll = (user, residentId = 'bruce', random = () => 0) => usage.freezeItemUseDecision({
    user, residents, residentId, now, random, makeEventId: () => eventId
});
const pass = (name, fn) => { fn(); process.stdout.write(`PASS ${name}\n`); };

pass('eligibility requires current exact ownership and classified usable object semantics', () => {
    assert.equal(roll(makeUser()), null);
    const food = physical('food', { category: 'food' });
    const letter = physical('letter', { type: 'letter' });
    const unclassified = physical('unclassified', { semanticType: undefined, tags: [] });
    assert.deepEqual(usage.getEligibleOwnedItems(makeUser([food, letter, unclassified]), 'bruce'), []);
    const toy = physical('toy');
    const collectible = physical('collectible', { semanticType: 'collectible',
        tags: ['role:keepsake', 'interaction:observe'] });
    const user = makeUser([toy, collectible]);
    assert.deepEqual(usage.getEligibleOwnedItems(user, 'bruce'), [toy, collectible]);
    assert.deepEqual(usage.getEligibleOwnedItems(user, 'peter'), []);
    user.residentItems.bruce = [];
    assert.deepEqual(usage.getEligibleOwnedItems(user, 'bruce'), []);
    assert.equal(roll(user), null);
    assert.ok(bonds.getResidentItemBond(user, 'bruce', toy.uniqueId), 'historical bond retained');
});

pass('12% roll and 24h cooldown derive from current and historical bonds', () => {
    assert.equal(usage.BASE_ITEM_USAGE_CHANCE, 0.12);
    assert.equal(usage.RESIDENT_ITEM_USAGE_COOLDOWN_MS, 24 * 60 * 60 * 1000);
    const toy = physical('toy');
    const user = makeUser([toy]);
    let calls = 0;
    assert.equal(roll(user, 'bruce', () => { calls++; return 0.12; }), null);
    assert.equal(calls, 1, 'failed chance roll does not roll selection');
    assert.equal(roll(user, 'bruce', () => { calls++; return 0; }).event.itemUniqueId, 'toy');
    assert.equal(calls, 3, 'successful chance uses one separate weighted roll');
    user.residentItemBonds.bruce['string:historical'] = { ...bonds.makeNeutralBond(),
        useCount: 1, familiarity: 1, lastUsedAt: '2026-09-25T12:00:00.001Z' };
    calls = 0;
    assert.equal(roll(user, 'bruce', () => { calls++; return 0; }), null);
    assert.equal(calls, 0, 'cooldown avoids even the chance roll');
    assert.equal(usage.isUsageCooldownActive(user, 'bruce', new Date('2026-09-26T12:00:00.001Z')), false);
    assert.equal(usage.getResidentLastItemUseAt(user, 'bruce').at, '2026-09-25T12:00:00.001Z');
    user.residentItemBonds.bruce['string:historical'].lastUsedAt = 'malformed';
    assert.equal(usage.isUsageCooldownActive(user, 'bruce', now), true);
});

pass('weights follow bond formula and weighted randomness can choose lower weight', () => {
    const base = bonds.makeNeutralBond();
    assert.equal(usage.getItemUseWeight(base), 6);
    assert.equal(usage.getItemUseWeight({ ...base, familiarity: 4 }), 10);
    assert.equal(usage.getItemUseWeight({ ...base, familiarity: 4, fondness: 2 }), 18);
    assert.equal(usage.getItemUseWeight({ ...base, familiarity: 3, fondness: -2 }), 5);
    assert.match(source, /Math\.max\(1, 6 \+ bond\.familiarity \+ 2 \* bond\.fondness/);
    const first = physical('first'), second = physical('second');
    const user = makeUser([first, second]);
    user.residentItemBonds.bruce['string:first'].familiarity = 5;
    user.residentItemBonds.bruce['string:first'].fondness = 3;
    assert.strictEqual(usage.selectWeightedOwnedItem(user, 'bruce', [first, second], () => 0.99), second);
    assert.strictEqual(usage.selectWeightedOwnedItem(user, 'bruce', [first, second], () => 0), first);
    assert.doesNotMatch(source, /personality|preferredInteraction|boredom|recencyPenalty/);
});

pass('frozen event carries exact physical identity, semantics and qualitative bond state', () => {
    const toy = physical('item-instance:one', { name: '星砂发光球' });
    const user = makeUser([toy]);
    const decision = roll(user);
    assert.equal(decision.itemRef, toy);
    assert.deepEqual(clone(decision.event), {
        version: 1, eventId, residentId: 'bruce', itemUniqueId: toy.uniqueId,
        sourceCatalogId: toy.sourceCatalogId, itemName: toy.name, semanticType: 'toy', role: 'play',
        interaction: 'chase', stimulus: ['rolling', 'glowing'],
        bondDisplay: { familiarity: '刚收到', fondness: '还在了解', cherished: false }
    });
    assert.equal(Object.isFrozen(decision), true);
    assert.equal(Object.isFrozen(decision.event), true);
    assert.equal(Object.hasOwn(decision.event, 'spriteId'), false);
    assert.equal(Object.hasOwn(decision.event, 'fondness'), false);
    const prompt = usage.buildStatusItemUseContext(decision);
    for (const value of ['星砂发光球', 'chase', 'play', 'rolling', 'glowing', '刚收到', '还在了解'])
        assert.ok(prompt.includes(value), value);
    assert.match(prompt, /Do not replace it, invent ownership or another action family/);
    assert.doesNotMatch(prompt, /originOwner|giftHistory|sourceCatalogId|spriteId/);
});

pass('commit revalidates exact item reference and never substitutes an equivalent replacement', () => {
    const toy = physical('item-instance:one');
    const user = makeUser([toy]);
    const decision = roll(user);
    const before = clone(toy);
    user.residentItems.bruce = [physical('item-instance:other')];
    assert.equal(usage.commitItemUse({ user, residents, decision, at: now.toISOString() }).ok, false);
    user.residentItems.bruce = [physical(toy.uniqueId)];
    assert.equal(usage.commitItemUse({ user, residents, decision, at: now.toISOString() }).ok, false);
    assert.equal(bonds.getResidentItemBond(user, 'bruce', toy.uniqueId).useCount, 0);
    user.residentItems.bruce = [toy];
    assert.equal(usage.commitItemUse({ user, residents, decision, at: now.toISOString() }).ok, true);
    const bond = bonds.getResidentItemBond(user, 'bruce', toy.uniqueId);
    assert.equal(bond.useCount, 1);
    assert.equal(bond.familiarity, 1);
    assert.equal(bond.lastUsedAt, now.toISOString());
    assert.equal(bond.fondness, 0);
    assert.equal(usage.commitItemUse({ user, residents, decision, at: now.toISOString() }).reason, 'already-committed');
    assert.equal(bonds.getResidentItemBond(user, 'bruce', toy.uniqueId).useCount, 1);
    assert.equal(roll(user), null, 'committed use activates the derived resident cooldown');
    assert.deepEqual(toy, before, 'use does not move, clone, consume, or mutate item data');
    assert.strictEqual(user.residentItems.bruce[0], toy);
});

pass('six deterministic local presentations need no AI', () => {
    const toy = physical('toy', { name: '小球' });
    const user = makeUser([toy]);
    const decision = roll(user);
    const expected = {
        chase: '布鲁斯正在追着小球跑。', bat: '布鲁斯正用爪子拨弄小球。',
        carry: '布鲁斯正带着小球到处走。', cuddle: '布鲁斯正抱着小球休息。',
        sniff: '布鲁斯正在仔细闻小球。', observe: '布鲁斯正在安静地看着小球。'
    };
    for (const [interaction, fallback] of Object.entries(expected))
        assert.equal(usage.getItemUseFallback({ event: { ...decision.event, interaction } }, '布鲁斯'), fallback);
    assert.doesNotMatch(source, /callAI\(/);
});

pass('Status Sync is the only roll and commit boundary; retry and stale guards are present', () => {
    assert.match(html, /const _refreshAllStatus = async/);
    assert.match(html, /const frozenItemUseById = new Map\(\)/);
    assert.match(html, /const committedItemUseIds = new Set\(\)/);
    assert.equal((html.match(/freezeItemUseDecision\(/g) || []).length, 1);
    assert.equal((html.match(/residentItemUsage\.commitItemUse\(/g) || []).length, 2); // Accepted row and AI failure fallback.
    assert.match(html, /isCurrentStatusRequest: \(\) => statusRefreshInFlight\.get\(requestHallId\)\?\.statusCompletion === statusCompletion/);
    assert.match(html, /if \(typeof requestOptions\.isCurrentStatusRequest === 'function' && !requestOptions\.isCurrentStatusRequest\(\)\)/);
    assert.match(html, /committedItemUseIds\.has\(id\)/);
    assert.match(html, /if \(presenceDirectives\[String\(cat\.id\)\] !== 'HOME'\) return/);
    assert.match(html, /const sharedHolidayContext = getInteractionHolidayContext\(\)/);
    assert.match(html, /buildStatusItemUseContext\(decision\)/);
    assert.match(html, /validateStatusSyncEnvelope\(content, requestedIds/);
    assert.match(html, /Status Sync authorized item activity missing exact item name/);
    assert.match(html, /if \(options\.itemUse\) staged\.currentItemUse = options\.itemUse/);
    assert.match(html, /status: getNeutralDiegeticStatus\(cat\), posture: 'standing'/);
    assert.equal((html.match(/callAI\(/g) || []).length, 40);
    assert.doesNotMatch(html, /adjustResidentItemFondness\(/);
});

process.stdout.write('Resident item usage/status V1 fixture PASS\n');
