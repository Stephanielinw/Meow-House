import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const memorySource = fs.readFileSync(new URL('../js/meeow-memory.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(memorySource, sandbox, { filename: 'js/meeow-memory.js' });
const memory = sandbox.window.Meeow.memory;

const owner = {
    id: 'telemachus', name: 'Telemachus', humanName: 'Telemachus', hallId: 'ithaca', affinity: 44,
    prompt: 'UNIQUE-HOMEPAGE-CANON-SENTINEL', personality: 'careful and earnest', breed: 'cat', eyeColor: 'brown',
    status: 'reading by the window', innerVoice: 'PRIVATE ACTIVE THOUGHT', episodicMemories: [], todayInteractions: [], diary: [], logs: [], travelogues: []
};
const mentor = { id: 'mentor', name: 'Mentor', humanName: 'Mentor', hallId: 'ithaca' };
const cats = [owner, mentor];
memory.configure({
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    getCats: () => cats,
    getHalls: () => [{ id: 'ithaca', name: 'Ithaca Hall' }],
    getCurrentHall: () => ({ id: 'ithaca', name: 'Ithaca Hall' }),
    getUser: () => ({ missionReports: [] }),
    getDateContext: () => 'today', getOperationalDayKey: () => '2026-08-31',
    getPreviousOperationalDayKey: () => '2026-08-30', buildOwnerDailyContext: () => '',
    getResidentPublicName: cat => cat.humanName || cat.name,
    getResidentForm: () => 'HUMAN', describeResidentForm: () => 'HUMAN'
});

const foreground = memory.buildForegroundLeanResidentContextParts(owner, {
    hallName: 'Ithaca Hall', presence: 'HALL', form: 'HUMAN',
    userRelationship: 'USER is the accepted caretaker. Current affinity: 44/100.'
});
assert.equal(foreground.text, memory.buildForegroundLeanResidentContext(owner, {
    hallName: 'Ithaca Hall', presence: 'HALL', form: 'HUMAN',
    userRelationship: 'USER is the accepted caretaker. Current affinity: 44/100.'
}));
const expectedForeground = [
    memory.buildCatIdentityBlock(owner),
    '[CURRENT SINGLE-RESIDENT STATE]',
    '- Physical presence: HALL',
    '- Hall: Ithaca Hall',
    '- Authoritative form: HUMAN',
    '- Current status: reading by the window',
    '- Current inner voice: PRIVATE ACTIVE THOUGHT',
    '- USER relationship baseline: USER is the accepted caretaker. Current affinity: 44/100.'
].join('\n');
assert.equal(foreground.text, expectedForeground);
const promptShape = `[DIRECT]\n${foreground.canon}\n${foreground.currentState}\n${foreground.relationship}`;
assert.equal(promptShape.split('UNIQUE-HOMEPAGE-CANON-SENTINEL').length - 1, 1);

const record = ({ id, summary, tags, eventAt = '2026-08-20T00:00:00.000Z' }) => ({
    id, ownerId: 'telemachus', sourceType: 'homepage', sourceKey: `homepage:${id}`,
    eventAt, createdAt: eventAt, summary, participantIds: ['telemachus', 'USER'], tags,
    importance: 3, emotionalWeight: 2, unresolved: false, knowledgeMode: 'direct-conversation'
});
owner.episodicMemories = [
    record({ id: 'user-led', summary: 'The USER and Telemachus discussed the harbor map.', tags: ['harbor', 'map'] }),
    record({ id: 'assistant-only', summary: 'Telemachus once mentioned an obsidian astrolabe.', tags: ['astrolabe'] }),
    { ...record({ id: 'private-away', summary: 'Telemachus privately followed a hidden trail.', tags: ['hidden'] }), sourceType: 'away' }
];
memory.normalizeEpisodicMemories(owner);
const userLed = memory.retrieveRelevantMemories(owner, {
    userInput: 'Can we look at the harbor map again?', hallId: 'ithaca', locationKey: 'ithaca', feature: 'homepage-direct',
    userSharedOnly: true, retrievalV2: true, maxEntries: 3, maxChars: 1200
});
assert.equal(userLed.selected[0]?.memory.id, 'user-led');
const assistantOnlyTopic = memory.retrieveRelevantMemories(owner, {
    userInput: 'How are you today?', feature: 'homepage-direct',
    userSharedOnly: true, retrievalV2: true, maxEntries: 3, maxChars: 1200
});
assert.equal(assistantOnlyTopic.selected.some(entry => entry.memory.id === 'assistant-only'), false);
assert.equal(assistantOnlyTopic.selected.some(entry => entry.memory.id === 'private-away'), false);

owner.todayInteractions = Array.from({ length: 8 }, (_, index) => ({ time: `${index}:00`, type: 'chat', content: `interaction ${index} `.repeat(32) }));
owner.diary = Array.from({ length: 8 }, (_, index) => ({ time: `${index}:00`, content: `monitor ${index} `.repeat(32) }));
owner.logs = Array.from({ length: 3 }, (_, index) => ({ date: '2026-08-31', content: `diary ${index} `.repeat(45) }));
owner.travelogues = Array.from({ length: 2 }, (_, index) => ({ date: '2026-08-30', location: 'Ithaca', content: `travel ${index} `.repeat(45) }));
const beforeBroadMemoryChars = memory.buildCatMemoryContext(owner, { profile: 'homepage' }).length;
const beforeRecentChatChars = Array.from({ length: 10 }, (_, index) => `user: long previous message ${index} `.repeat(24)).join('\n').length;
const afterHistoricalContextChars = foreground.currentState.length + foreground.relationship.length +
    memory.buildEpisodicMemoryContext(owner, {
        userInput: 'harbor map', hallId: 'ithaca', locationKey: 'ithaca', feature: 'homepage-direct',
        userSharedOnly: true, retrievalV2: true, maxEntries: 3, maxChars: 1200,
        header: '[RELEVANT SHARED / EPISODIC MEMORY]'
    }).text.length;

const directStart = appSource.indexOf('const HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT');
const directEnd = appSource.indexOf('const submitShopItem', directStart);
assert.ok(directStart >= 0 && directEnd > directStart);
const directSlice = appSource.slice(directStart, directEnd);
assert.match(directSlice, /buildHomepageDirectRecentConversation/);
assert.match(directSlice, /HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT = 6/);
assert.match(directSlice, /HOMEPAGE_DIRECT_RECENT_MESSAGE_MAX_CHARS = 2200/);
assert.match(directSlice, /HOMEPAGE_DIRECT_EPISODIC_MAX_MEMORIES = 3/);
assert.match(directSlice, /HOMEPAGE_DIRECT_EPISODIC_MAX_CHARS = 1200/);
assert.match(directSlice, /buildUserSharedEpisodicMemoryContext/);
assert.match(directSlice, /userAuthoredText/);
assert.doesNotMatch(directSlice, /buildCatMemoryContext\(sendingCat, \{ profile: 'homepage' \}\)/);
assert.doesNotMatch(directSlice, /buildOwnerScopedEpisodicMemoryContext/);
assert.doesNotMatch(directSlice, /applyMergedHomepageHallUpdates/);
assert.doesNotMatch(directSlice, /hallUpdates/);
assert.doesNotMatch(directSlice, /awayPlans/);
assert.doesNotMatch(directSlice, /fridgeNoteReactions/);
assert.match(directSlice, /reconcileAwayEpisodes\(frozenNow\)/);
assert.match(directSlice, /queueHomepageHallAmbientRefresh\(sendingCat, sendingCat\.lastInteractionTimestamp\)/);
assert.match(directSlice, /reconcileHomepageHallAmbientRefreshes\(new Date\(sendingCat\.lastInteractionTimestamp\)\)/);
assert.doesNotMatch(directSlice, /refreshAllStatus\(/);
assert.match(directSlice, /label: `HOMEPAGE DIRECT/);
assert.match(directSlice, /buildHomepageDirectPresenceContext/);

assert.match(appSource, /const activeResponse = payload\.activeCat/);
assert.equal((appSource.match(/applyMergedHomepageHallUpdates/g) || []).length, 0);

console.log(JSON.stringify({
    fixture: 'homepage-direct-prompt', status: 'PASS',
    measurements: {
        canonChars: foreground.canon.length,
        currentStateChars: foreground.currentState.length,
        relationshipChars: foreground.relationship.length,
        promptSentinelOccurrences: 1,
        representative: { beforeBroadMemoryChars, beforeRecentChatChars, afterHistoricalContextChars }
    }
}));
