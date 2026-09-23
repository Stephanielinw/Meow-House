import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const visuals = require('../js/meeow-item-visuals.js');
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const awaySource = readFileSync(new URL('../js/meeow-away.js', import.meta.url), 'utf8');
const slice = (start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a, `missing production slice: ${start}`);
    return source.slice(a, b);
};
const contract = visuals.formatVisualHintContract();
assert.match(contract, /visualHint exactly as/);
assert.match(contract, /Closed values: object=/);
assert.match(contract, /Do not return sprite IDs, filenames, file paths, URLs, or freeform search queries/);
assert.match(source, /<script src="\.\/js\/meeow-item-visuals\.js"><\/script>[\s\S]*?<script src="\.\/js\/meeow-away\.js"><\/script>/);
for (const producer of [
    slice('                const buildOrdinaryAwayPlanPrompt =', '                const settleOrdinaryAwayOperationFailure ='),
    slice('                const formatAwayMailAuthority =', '                const buildAwayPromptContract ='),
    slice('                const generateMail =', '                const handleCatClick ='),
    slice('                const ensureExploreSettlementOperation =', '                const isValidExploreTravelogue =')
]) assert.match(producer, /formatVisualHintContract\(\)/, 'each live AI item prompt must include closed visual vocabulary');
assert.match(awaySource, /validateAuthoredItemVisualHint\(attachment\)/);
assert.match(source, /validateAuthoredItemVisualHint\(data\.item\)/);
assert.match(source, /throw new Error\('Explore loot visualHint invalid'\)/);
assert.match(source, /attachment: data\.item \? \{[^\n]*visualHint \} : null/);
assert.match(source, /if \(!user\.inventory\.some\([^\n]*user\.inventory\.push\(\{ \.\.\.settlement\.loot/);
const legacyMailSlice = slice('                const generateMail =', '                const handleCatClick =');
const testLegacyMail = async item => {
    const delivered = [], logs = [];
    const cat = { id: 'traveler', humanName: '旅人', name: '旅人', hallId: 'hall', isOut: true, status: '外出中' };
    const user = { lastMailDate: '', dailyMailCount: 0, lastMailAt: 0, lastMailSenderId: null, nickname: '馆长', job: '' };
    const legacy = new Function('ctx', `const { window, Date, Math, user, cats, halls, currentHall, getOperationalDayKey,
        hasPhysicalAwayMailDeliveryCapacity, hasMailSpacingAt, getActiveAwayEpisode,
        buildAuthoritativeUserIdentityContext, buildCatMemoryContext, callAI, parseAIJSON,
        cleanText, recordDeliveredMail, addLog, getReadableAPIError, ThinkingLevel } = ctx;
        ${legacyMailSlice}
        return generateMail;`)({
        window: { Meeow: { itemVisuals: visuals } }, Date,
        Math: { random: () => 0.1, floor: Math.floor }, user, cats: { value: [cat] }, halls: { value: [{ id: 'hall', name: '馆舍' }] }, currentHall: { value: { id: 'hall', name: '馆舍' } },
        getOperationalDayKey: () => '2026-09-23', hasPhysicalAwayMailDeliveryCapacity: () => true,
        hasMailSpacingAt: () => true, getActiveAwayEpisode: () => null,
        buildAuthoritativeUserIdentityContext: () => '', buildCatMemoryContext: () => '',
        callAI: async () => JSON.stringify({ content: '旅途中给你的信。', item }), parseAIJSON: JSON.parse,
        cleanText: value => String(value ?? '').trim(),
        recordDeliveredMail: payload => { delivered.push(payload); return true; },
        addLog: message => logs.push(message), getReadableAPIError: error => error.message,
        ThinkingLevel: { LOW: 'low' }
    });
    return { accepted: await legacy(), delivered, logs };
};
const mailed = await testLegacyMail({ name: '贝壳', icon: '🐚', desc: '小贝壳', visualHint: { object: 'shell', material: 'organic', form: 'keepsake', context: 'travel' } });
assert.equal(mailed.accepted, true);
assert.deepEqual(mailed.delivered[0].attachment.visualHint, { object: 'shell', material: 'organic', form: 'keepsake', context: 'travel' });
assert.equal((await testLegacyMail({ name: '贝壳', icon: '🐚', desc: '小贝壳' })).accepted, false);
assert.equal((await testLegacyMail({ name: '贝壳', icon: '🐚', desc: '小贝壳', visualHint: { object: 'sprite.png', material: 'organic', form: 'keepsake', context: 'travel' } })).accepted, false);
assert.equal((await testLegacyMail({ name: '贝壳', icon: '🐚', desc: '小贝壳', visualHint: { object: 'shell', material: 'organic', form: 'keepsake', context: 'travel' }, spriteId: 'yapi:assorted:seashell' })).accepted, false);

// Exercise the production Explore authoring, normalization, and inventory insertion slices.
const hint = { object: 'shell', material: 'organic', form: 'keepsake', context: 'travel' };
const flavorSlice = slice('                const normalizeExploreSettlementFlavor =', '                const exploreSettlementFlavorInFlight =');
const ensureSlice = slice('                const ensureExploreSettlementOperation =', '                const isValidExploreTravelogue =');
const normalizerSlice = slice('                const normalizeExploreSettlementOperation =', '                const normalizeExploreCases =');
const inventorySlice = slice('                    if (settlement.loot && !receipt(\'loot\')) {', '                    if (settlement.lore && !receipt(\'lore\'))');
const compactExploreText = (value, n) => String(value ?? '').trim().slice(0, n);
const runExplore = async loot => {
    const logs = [], persisted = [];
    const context = vm.createContext({
        window: { Meeow: { itemVisuals: visuals } },
        compactExploreText, validExploreDate: () => true,
        getExploreSettlementReceiptId: (caseRecord, name) => `explore-settlement:${caseRecord.id}:${name}`,
        getResidentPublicName: cat => cat.name,
        getProgramExploreRewards: () => ({ coins: 10, affinityChange: 1 }),
        persistExploreCase: caseRecord => { persisted.push(JSON.parse(JSON.stringify(caseRecord))); return true; },
        getExploreTemporalSnapshot: () => ({}), getExploreCaseVisibleDigest: () => 'visible clues',
        formatExploreTemporalContext: () => 'time', requestStructuredEngine: async () => JSON.stringify({ summary: '已完成调查', loot, lore: null }),
        parseAIJSON: JSON.parse, ThinkingLevel: { LOW: 'low' },
        coalesceExploreOperation: (_map, _key, work) => work(), exploreSettlementFlavorInFlight: new Map(),
        addLog: message => logs.push(message), getReadableAPIError: error => error.message,
        touchExploreCase: () => {}
    });
    vm.runInContext(`${flavorSlice}\n${ensureSlice}\n${normalizerSlice}\nglobalThis.ensure = ensureExploreSettlementOperation; globalThis.normalize = normalizeExploreSettlementOperation;`, context);
    const caseRecord = { id: 'case-1', status: 'solved', settlementOperation: null };
    const result = await context.ensure(caseRecord, { name: '同行者' });
    return { context, caseRecord, result, persisted, logs };
};
const valid = await runExplore({ name: '湖边贝壳', icon: '🐚', desc: '光滑的小贝壳', visualHint: hint });
assert.deepEqual(JSON.parse(JSON.stringify(valid.result.settlement.loot.visualHint)), hint);
assert.deepEqual(JSON.parse(JSON.stringify(valid.persisted.at(-1).settlementOperation.settlement.loot.visualHint)), hint);
const normalized = valid.context.normalize(JSON.parse(JSON.stringify(valid.result)), 'case-1', 'pending');
assert.deepEqual(JSON.parse(JSON.stringify(normalized.settlement.loot.visualHint)), hint);
const user = { inventory: [] }, operation = { receipts: {} }, caseRecord = { id: 'case-1' };
const insertLoot = new Function('ctx', `const { user, operation, caseRecord, settlement } = ctx;
    const receipt = name => Boolean(operation.receipts[name]);
    const writeExploreSettlementReceipt = (_caseRecord, op, name) => { op.receipts[name] = true; return true; };
    ${inventorySlice}
    return user.inventory;`);
insertLoot({ user, operation, caseRecord, settlement: normalized.settlement });
insertLoot({ user, operation, caseRecord, settlement: normalized.settlement });
assert.equal(user.inventory.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(user.inventory[0].visualHint)), hint);
const invalid = await runExplore({ name: '湖边贝壳', icon: '🐚', desc: '光滑的小贝壳', visualHint: { ...hint, object: 'freeform shell' } });
assert.equal(invalid.result.settlement.loot, null);
assert.ok(invalid.logs.some(line => line.includes('Explore loot visualHint invalid')));
const legacy = valid.context.normalize({ id: 'explore-settlement:old', status: 'pending', settlement: {
    summary: '旧存档', loot: { id: 'old-loot', name: '旧物', icon: '🎁', desc: '旧描述' }, lore: null
} }, 'old', 'pending');
assert.equal(legacy.settlement.loot.name, '旧物');
assert.equal('visualHint' in legacy.settlement.loot, false);
console.log('AI item visual hints fixture: PASS');
