import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = appSource.indexOf('// --- Social Attention / Attention Bids ---');
const end = appSource.indexOf('const awayLifecycle = window.Meeow.away;', start);
assert.ok(start >= 0 && end > start, 'Attention helpers must be present.');
const attentionSource = appSource.slice(start, end);

const now = new Date('2026-09-01T12:00:00.000Z');
const active = { id: 'a', name: 'Telemachus', humanName: 'Telemachus', hallId: 'h', affinity: 62, currentForm: 'HUMAN', status: 'reading', personality: 'earnest', prompt: 'ACTIVE PRIVATE CANON', todayInteractions: [] };
const candidate = { id: 'b', name: 'Antinous', humanName: 'Antinous', hallId: 'h', affinity: 48, currentForm: 'CAT', status: 'watching', personality: 'bold and competitive', prompt: 'CANDIDATE-CANON', todayInteractions: [] };
const visitor = { id: 'v', name: 'Visitor', humanName: 'Visitor', hallId: 'h', isVisiting: true, affinity: 40, currentForm: 'HUMAN', status: 'visiting', personality: 'warm', prompt: 'VISITOR-CANON', todayInteractions: [] };
const away = { id: 'away', name: 'Away', humanName: 'Away', hallId: 'h', isOut: true, affinity: 40, currentForm: 'CAT' };
const otherHall = { id: 'other', name: 'Other', humanName: 'Other', hallId: 'other', affinity: 40, currentForm: 'CAT' };
const cats = [active, candidate, visitor, away, otherHall];
const scenes = [];
const user = { attentionBidOpportunities: [] };
const sandbox = {
    Date, Map, Set, Math, JSON, console,
    user, cats: { value: cats }, halls: { value: [{ id: 'h', name: 'Hall H' }] }, hallSceneRecords: { value: scenes },
    activeHallId: { value: 'h' }, isFocusing: { value: false }, focusCats: { value: [] }, exploreState: { active: false, companion: null },
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    normalizeFormValue: value => String(value || '').toUpperCase() === 'HUMAN' ? 'HUMAN' : String(value || '').toUpperCase() === 'CAT' ? 'CAT' : '',
    getResidentForm: cat => cat.currentForm || 'CAT',
    getResidentPublicName: cat => cat.humanName || cat.name,
    isResidentAway: cat => Boolean(cat?.isOut), isResidentInCuratorRoom: cat => Boolean(cat?.curator), isResidentInHall: cat => !cat?.isOut && !cat?.curator,
    getResidentPhysicalHallId: cat => cat?.isOut || cat?.curator ? '' : String(cat?.hallId || ''),
    getCanonicalRelationshipBaseline: () => ({ label: 'competitive' }),
    buildCatIdentityBlock: cat => `[CANON] ${cat.prompt}`,
    buildForegroundUserRelationshipBaseline: cat => `affinity ${cat.affinity}`,
    getResidentLiveStatus: cat => cat.status || '',
    parseAIJSON: raw => JSON.parse(raw),
    getOperationalDayKey: () => '2026-09-01',
    normalizeHallSceneRecords: records => records,
    appendHallSceneRecord: data => { scenes.push(data); return data; },
    getHallSceneFeedNearBottom: () => true,
    isHallSceneFeedNearBottom: () => true, scrollHallSceneFeedToBottom: () => {},
    requestStructuredEngine: async () => '{"content":"ignored"}', persistNow: () => true, addLog: () => {},
    ThinkingLevel: { LOW: 'LOW' }
};
vm.runInNewContext(`${attentionSource}
globalThis.attention = { extractExplicitPublicAttentionEvent, isAttentionBidCandidateEligible, selectAttentionBidType, buildAttentionBidPrompt, validateAttentionBidResponse, normalizeAttentionBidOpportunities, queueAttentionBidOpportunity, getRecentAmbientEngagementCount, ATTENTION_BID_TYPES };`, sandbox, { filename: 'index.html:social-attention' });
const attention = sandbox.attention;

assert.equal(attention.isAttentionBidCandidateEligible(candidate, 'h'), true);
assert.equal(attention.isAttentionBidCandidateEligible(visitor, 'h'), true, 'physical visitors may observe');
assert.equal(attention.isAttentionBidCandidateEligible(away, 'h'), false);
assert.equal(attention.isAttentionBidCandidateEligible(otherHall, 'h'), false);

const explicit = attention.extractExplicitPublicAttentionEvent({
    text: '我当着 Antinous 的面说：你真的很烦。然后我悄悄对 Telemachus 说别告诉他。', activeResident: active, hallId: 'h'
});
assert.equal(explicit?.candidate.id, 'b');
assert.equal(explicit?.publicText, '我当着 Antinous 的面说：你真的很烦。');
assert.equal(attention.extractExplicitPublicAttentionEvent({ text: 'Antinous真的很烦。', activeResident: active, hallId: 'h' }), null);
assert.equal(attention.extractExplicitPublicAttentionEvent({ text: '我当着 Antinous 的面悄悄说：秘密。', activeResident: active, hallId: 'h' }), null);

for (let index = 0; index < 3; index += 1) active.todayInteractions.push({
    type: 'chat-reply', source: 'detail-chat', attentionEligible: true, physicalHallId: 'h',
    at: new Date(now.getTime() - index * 60_000).toISOString()
});
assert.equal(attention.getRecentAmbientEngagementCount(active, 'h', now.getTime()), 3);
assert.notEqual(attention.selectAttentionBidType({ candidate, sourceEventId: 'x', source: 'ambient-engagement', authorizedObject: null }), 'offer');
const offerOperation = {
    id: 'offer-test', source: 'ambient-engagement', hallId: 'h', activeResidentId: 'a', candidateId: 'b', bidType: 'offer',
    authorizedObject: { id: 'item-1', name: '绒球', source: 'hall-visible-item' },
    observableEvent: { kind: 'ambient-engagement', publicText: '', activeResidentPublicName: 'Telemachus', targetResidentId: '' }, candidateForm: 'CAT'
};
const offerPrompt = attention.buildAttentionBidPrompt(offerOperation);
assert.match(offerPrompt, /id=item-1; name=绒球/);
assert.match(offerPrompt, /never create, consume, transfer/);
assert.doesNotMatch(offerPrompt, /ACTIVE PRIVATE CANON/);
assert.equal(attention.validateAttentionBidResponse('{"content":"Antinous 递给你一件玩具。"}', { ...offerOperation, bidType: 'approach', authorizedObject: null }), 'Attention Bid 未授权物品呈现。');
assert.equal(attention.validateAttentionBidResponse('{"content":"Antinous 把绒球推到你脚边。"}', offerOperation), true);

const queued = attention.queueAttentionBidOpportunity({
    source: 'explicit-public', sourceEventId: 'homepage-direct:a:source-1', activeResident: active, hallId: 'h', publicEvent: explicit, now
});
assert.ok(queued);
assert.notEqual(queued.bidType, 'offer', 'no authorized object means offer cannot be selected');
assert.equal(user.attentionBidOpportunities.length, 1);
assert.equal(user.attentionBidOpportunities[0].observableEvent.publicText, explicit.publicText);
user.attentionBidOpportunities = [{
    ...queued, status: 'generating', claimedAt: now.toISOString(), promptText: 'FROZEN-ATTENTION-PROMPT',
    generation: { ...queued.generation, retryAt: '' }
}];
attention.normalizeAttentionBidOpportunities({ recoverGenerating: true, now });
assert.equal(user.attentionBidOpportunities[0].status, 'pending');
assert.equal(user.attentionBidOpportunities[0].promptText, 'FROZEN-ATTENTION-PROMPT');
assert.ok(user.attentionBidOpportunities[0].generation.retryAt, 'orphan recovery must schedule the same operation');
assert.match(appSource, /type === 'attention-bid'/);
assert.match(appSource, /AUTHORITATIVE_HALL_SCENE_TYPES = new Set\(\['ambient', 'user-directed'\]\)/);
assert.match(appSource, /isAuthoritativeHallSceneRecord\(record\)/);
assert.match(appSource, /hallSceneRecords: hallSceneRecords\.value/);
assert.match(appSource, /if \(!Array\.isArray\(user\.attentionBidOpportunities\)\) user\.attentionBidOpportunities = \[\]/);
assert.match(appSource, /reconcileAttentionBidOpportunities\(now\)/);
assert.doesNotMatch(attentionSource, /knowledgeLedger|lifeThreads|buildCatMemoryContext\(/);

console.log(JSON.stringify({
    fixture: 'social-attention', status: 'PASS',
    checks: ['public-span-isolation', 'physical-eligibility', 'ambient-threshold', 'offer-authority', 'prompt-isolation', 'display-only-scene', 'persistence-shape']
}));
