import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const memorySource = fs.readFileSync(new URL('../js/meeow-memory.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(memorySource, sandbox, { filename: 'js/meeow-memory.js' });
const memory = sandbox.window.Meeow.memory;
const aiSource = fs.readFileSync(new URL('../js/meeow-ai.js', import.meta.url), 'utf8');
const aiSandbox = { window: {}, console };
vm.runInNewContext(aiSource, aiSandbox, { filename: 'js/meeow-ai.js' });
aiSandbox.window.Meeow.ai.configure({ getCanonFidelityGuardrail: () => 'GUARD' });
const measuredBudget = aiSandbox.window.Meeow.ai.estimatePromptBudget('USER', 'SYSTEM', { section: 'ABC' });
assert.deepEqual(JSON.parse(JSON.stringify(measuredBudget.componentChars)), { section: 3 });
assert.equal(measuredBudget.callerSystemChars, 6);
assert.equal(measuredBudget.canonGuardrailChars, 5);
assert.equal(measuredBudget.totalPromptChars, 16); // USER + SYSTEM + newline + GUARD

const owner = {
    id: 'owner', name: 'Owner', humanName: 'Owner', hallId: 'gotham', affinity: 25,
    prompt: 'Canon identity.', personality: 'careful', breed: 'cat', eyeColor: 'blue', status: 'resting',
    innerVoice: '…', episodicMemories: [], todayInteractions: [], diary: [], logs: [], travelogues: []
};
const bruce = { id: 'bruce', name: 'Bruce', humanName: 'Bruce Wayne', aliases: ['B. Wayne'], hallId: 'gotham' };
const jason = { id: 'jason', name: 'Jason', humanName: 'Jason Todd', hallId: 'gotham' };
const cats = [owner, bruce, jason];
memory.configure({
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    getCats: () => cats,
    getHalls: () => [{ id: 'gotham', name: 'Gotham' }],
    getCurrentHall: () => ({ id: 'gotham', name: 'Gotham' }),
    getUser: () => ({ missionReports: [] }),
    getDateContext: () => 'today', getOperationalDayKey: () => '2026-08-31',
    getPreviousOperationalDayKey: () => '2026-08-30', buildOwnerDailyContext: () => '',
    getResidentPublicName: cat => cat.humanName || cat.name,
    getResidentForm: () => 'HUMAN', describeResidentForm: () => 'HUMAN',
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim()
});

const record = ({ id, sourceType = 'homepage', participantIds = ['owner', 'USER'], summary, tags = [], eventAt = '2025-01-01T00:00:00.000Z' }) => ({
    id, ownerId: 'owner', sourceType, sourceKey: `${sourceType}:${id}`,
    eventAt, createdAt: eventAt, summary, participantIds, tags,
    importance: 3, emotionalWeight: 2, unresolved: false, knowledgeMode: 'direct-conversation'
});

owner.episodicMemories = [
    record({ id: 'old-relevant', participantIds: ['owner', 'USER', 'bruce'], summary: 'Bruce and the USER discussed the harbor warehouse.', tags: ['harbor', 'warehouse'], eventAt: '2024-01-01T00:00:00.000Z' }),
    record({ id: 'new-irrelevant', summary: 'The USER and Owner shared tea.', tags: ['tea'], eventAt: '2026-08-30T00:00:00.000Z' }),
    record({ id: 'private-away', sourceType: 'away', participantIds: ['owner', 'USER', 'bruce'], summary: 'Bruce secretly investigated the harbor warehouse.', tags: ['harbor'], eventAt: '2026-08-31T00:00:00.000Z' }),
    record({ id: 'resident-only-scene', sourceType: 'shared-scene', participantIds: ['owner', 'bruce'], summary: 'Bruce privately discussed the harbor warehouse.', tags: ['harbor'] }),
    record({ id: 'long', participantIds: ['owner', 'USER', 'bruce'], summary: 'L'.repeat(280), tags: ['oversized'] })
];
memory.normalizeEpisodicMemories(owner);

// Legacy normalization preserves its persisted shape; lazy retrieval metadata is not written back.
assert.equal(Object.hasOwn(owner.episodicMemories[0], 'retrieval'), false);
const relevant = memory.retrieveRelevantMemories(owner, {
    userInput: 'Can you ask Bruce about the harbor warehouse?', userSharedOnly: true,
    retrievalV2: true, maxEntries: 4, now: new Date('2026-08-31T00:00:00.000Z')
});
assert.equal(relevant.selected[0]?.memory.id, 'old-relevant');
assert.equal(relevant.selected.some(entry => entry.memory.id === 'private-away'), false);
assert.equal(relevant.selected.some(entry => entry.memory.id === 'resident-only-scene'), false);
assert.equal(relevant.selected.some(entry => entry.memory.id === 'new-irrelevant'), false);

// Explicit public/human aliases match; generic relationship words never become identities.
const aliasResult = memory.retrieveRelevantMemories(owner, { userInput: 'What did B. Wayne say?', userSharedOnly: true, retrievalV2: true, maxEntries: 4 });
assert.equal(aliasResult.selected[0]?.memory.id, 'old-relevant');
const genericResult = memory.retrieveRelevantMemories(owner, { userInput: 'father', userSharedOnly: true, retrievalV2: true, maxEntries: 4 });
assert.equal(genericResult.selected.length, 0);

// Hall is a real deterministic signal; recency alone is not.
const hallResult = memory.retrieveRelevantMemories(owner, { locationKeys: ['gotham'], userSharedOnly: true, retrievalV2: true, maxEntries: 4 });
assert.equal(hallResult.selected.some(entry => entry.memory.id === 'old-relevant'), true);
assert.equal(memory.retrieveRelevantMemories(owner, { userInput: 'unrelated phrase', userSharedOnly: true, retrievalV2: true, maxEntries: 4 }).selected.length, 0);

// Complete entries either fit or are skipped—never partially sliced.
const shortBudget = memory.buildEpisodicMemoryContext(owner, {
    userInput: 'oversized Bruce', userSharedOnly: true, retrievalV2: true, maxEntries: 2, maxChars: 100,
    header: '[RELEVANT SHARED / EPISODIC MEMORY]'
});
assert.equal(shortBudget.text, '');
const phoneBudget = memory.buildEpisodicMemoryContext(owner, {
    userInput: 'Bruce harbor warehouse', userSharedOnly: true, retrievalV2: true, maxEntries: 2, maxChars: 700,
    header: '[RELEVANT SHARED / EPISODIC MEMORY]'
});
assert.ok(phoneBudget.text.length <= 700);
assert.ok(phoneBudget.snapshots.length <= 2);

// New entries persist bounded, normalized metadata without changing their stored summary/ID.
const added = memory.appendEpisodicMemory(owner, record({
    id: 'new-meta', sourceType: 'homepage', participantIds: ['owner', 'USER', 'jason'],
    summary: `Full-width Ｗａｒｅｈｏｕｓｅ ${'topic '.repeat(80)}`, tags: Array.from({ length: 30 }, (_, index) => `Tag ${index}`)
}));
assert.equal(added.stored, true);
assert.equal(added.memory.id, 'new-meta');
assert.equal(added.memory.summary.includes('Ｗａｒｅｈｏｕｓｅ'), true);
assert.ok(added.memory.retrieval.keywords.length <= 14);
assert.ok(added.memory.retrieval.entityIds.length <= 10);
assert.ok(added.memory.retrieval.locationKeys.length <= 6);
assert.ok(added.memory.retrieval.topicKeys.length <= 10);
assert.ok(added.memory.retrieval.keywords.every(term => term.length <= 32));

// Representative context comparison: broad legacy continuity versus bounded shared retrieval.
owner.todayInteractions = Array.from({ length: 8 }, (_, index) => ({ time: `0${index}:00`, type: 'chat', content: `interaction ${index} `.repeat(30) }));
owner.diary = Array.from({ length: 8 }, (_, index) => ({ time: `0${index}:00`, content: `monitor ${index} `.repeat(30) }));
owner.logs = Array.from({ length: 3 }, (_, index) => ({ date: '2026-08-30', content: `diary ${index} `.repeat(45) }));
owner.travelogues = Array.from({ length: 2 }, (_, index) => ({ date: '2026-08-29', location: 'Gotham', content: `travel ${index} `.repeat(45) }));
const before = memory.buildCatMemoryContext(owner);
const afterPhone = phoneBudget.text;
const afterItem = memory.buildEpisodicMemoryContext(owner, {
    userInput: 'Bruce harbor warehouse', userSharedOnly: true, retrievalV2: true, maxEntries: 3, maxChars: 1200,
    header: '[RELEVANT SHARED / EPISODIC MEMORY]'
}).text;
assert.ok(afterItem.length <= 1200);

// Run the actual persisted Phone normalizer slice without network/Vue. Claimed
// legacy records become empty frozen scopes; a saved block remains byte-stable.
const phoneStart = appSource.indexOf('const PHONE_REPLY_MIN_DELAY_MS');
const phoneEnd = appSource.indexOf('const getPhoneReplySourceMessages', phoneStart);
assert.ok(phoneStart >= 0 && phoneEnd > phoneStart);
const phoneSandbox = {
    user: { phoneData: { chats: [], replyOpportunities: [] } }, Date, Set, Array,
    cleanText: value => String(value ?? '').trim(),
    getCanonicalCatId: value => String(value || ''),
    getAllStoredPhoneMessages: () => [{ id: 'm1', role: 'user' }],
    getLifeThreadFactLocation: () => null
};
vm.runInNewContext(`${appSource.slice(phoneStart, phoneEnd)}\nglobalThis.__normalizePhone = normalizePhoneReplyOpportunities;`, phoneSandbox, { filename: 'index.html:phone-normalizer' });
phoneSandbox.user.phoneData.replyOpportunities = [{
    id: 'legacy-claimed', contactId: 'bruce', sourceMessageIds: ['m1'], status: 'retryable',
    createdAt: '2026-08-31T00:00:00.000Z', dueAt: '2026-08-31T00:00:00.000Z', retryAt: '',
    claimedAt: '2026-08-31T00:01:00.000Z', episodicMemoryScopeFrozen: false
}, {
    id: 'frozen-claimed', contactId: 'bruce', sourceMessageIds: ['m1'], status: 'retryable',
    createdAt: '2026-08-31T00:00:00.000Z', dueAt: '2026-08-31T00:00:00.000Z', retryAt: '',
    claimedAt: '2026-08-31T00:01:00.000Z', episodicMemoryScopeFrozen: true,
    episodicMemoryContextText: '[RELEVANT SHARED / EPISODIC MEMORY]\n- stable text',
    episodicMemorySnapshots: [{ id: 'm-old', sourceKey: 'homepage:m-old', eventAt: '2026-08-01T00:00:00.000Z', summary: 'stable text', tags: ['shared'] }]
}];
const normalizedPhone = phoneSandbox.__normalizePhone({ now: new Date('2026-08-31T00:02:00.000Z') });
assert.equal(normalizedPhone[0].episodicMemoryScopeFrozen, true);
assert.equal(normalizedPhone[0].episodicMemoryContextText, '');
assert.equal(normalizedPhone[1].episodicMemoryContextText, '[RELEVANT SHARED / EPISODIC MEMORY]\n- stable text');
assert.equal(normalizedPhone[1].episodicMemorySnapshots[0].summary, 'stable text');

// Static integration assertions cover claim persistence and the two permitted consumers.
assert.match(appSource, /episodicMemoryScopeFrozen/);
assert.match(appSource, /episodicMemoryContextText/);
assert.match(appSource, /freezePhoneReplyEpisodicMemoryScope\(due\)/);
assert.match(appSource, /episodicMemoryScopeFrozen\s*=\s*raw\.episodicMemoryScopeFrozen === true \|\| Boolean\(claimedAt\)/);
assert.match(appSource, /userSharedOnly:\s*true/);
assert.match(appSource, /estimatePromptBudget\(statusRequestPrompt, CORE_ROLEPLAY_PROMPT/);
const itemSlice = appSource.slice(appSource.indexOf('const useItem = async'), appSource.indexOf('const readItem ='));
assert.match(itemSlice, /buildUserSharedEpisodicMemoryContext/);
assert.doesNotMatch(itemSlice, /buildCatMemoryContext\(targetCat\)/);
const phoneSlice = appSource.slice(appSource.indexOf('const runPhoneReplyOpportunity'), appSource.indexOf('const reconcilePhoneReplyOpportunities'));
assert.match(phoneSlice, /episodicMemoryContextText/);
assert.doesNotMatch(phoneSlice, /buildCatMemoryContext\(cat\)/);

console.log(JSON.stringify({
    fixture: 'prompt-retrieval-v2', status: 'PASS',
    phone: { beforeHistoricalContextChars: before.length, afterSharedMemoryChars: afterPhone.length },
    item: { beforeHistoricalContextChars: before.length, afterSharedMemoryChars: afterItem.length }
}));
