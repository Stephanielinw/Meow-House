import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing production section: ${startMarker}`);
  return source.slice(start, end);
};

// The persisted lifecycle separates generation from local delivery.
assert.match(source, /PHONE_REPLY_STATUSES = new Set\(\['scheduled', 'retryable', 'in-flight', 'generated', 'delivering', 'completed', 'failed', 'integrity-mismatch'\]\)/);
assert.match(source, /createdAt: now\.toISOString\(\), generationDueAt: '', status: 'scheduled'/);
assert.match(source, /generationDueAt[\s\S]*raw\.dueAt/);
assert.match(source, /deliverAt, nextDeliveryIndex, nextDeliveryAt/);
assert.doesNotMatch(source, /phoneReplyDueTime/);
const reconcileSource = section('const reconcilePhoneReplyOpportunities = async', 'const claimPhoneReplyForHomepageDirect');
assert.match(reconcileSource, /promoteGeneratedPhoneReplyDeliveries\(now\)/);
assert.match(reconcileSource, /flushPhoneReplyDeliveries\(now\)/);
assert.doesNotMatch(reconcileSource, /callAI\(|runPhoneReplyOpportunity\(|claimPhoneReplyGeneration\(/);

// Queueing preserves pre-claim batching and creates a later lane item after claim.
const queued = [];
const queueSandbox = {
  Date,
  getPhoneReplyOpportunities: () => queued,
  isEligiblePhoneReplySource: message => message?.role === 'user' && Boolean(message.id),
  isAcceptedPhoneContact: () => true,
  getCanonicalCatId: value => String(value),
  sameCatId: (left, right) => String(left) === String(right),
  schedulePhoneReplyReconciliation: () => {}
};
vm.createContext(queueSandbox);
vm.runInContext(`${section('const queuePhoneReplyOpportunity', 'const removePhoneReplySource')}
globalThis.queueReply = queuePhoneReplyOpportunity;`, queueSandbox);
const first = queueSandbox.queueReply('resident-a', { id: 'u1', role: 'user' }, new Date('2026-09-20T10:00:00Z'));
const merged = queueSandbox.queueReply('resident-a', { id: 'u2', role: 'user' }, new Date('2026-09-20T10:00:01Z'));
assert.equal(first.id, merged.id);
assert.deepEqual([...first.sourceMessageIds], ['u1', 'u2']);
assert.equal(first.generationDueAt, '', 'new V2 work has no timer-owned generation deadline');
first.claimedAt = '2026-09-20T10:00:02Z';
first.status = 'in-flight';
const second = queueSandbox.queueReply('resident-a', { id: 'u3', role: 'user' }, new Date('2026-09-20T10:00:03Z'));
assert.notEqual(second.id, first.id);
assert.deepEqual([...first.sourceMessageIds], ['u1', 'u2']);
assert.deepEqual([...second.sourceMessageIds], ['u3']);

// Claim-time thread freezing uses the exact resident thread, preserves all
// sources and quotes, and compacts non-text payloads.
const threadMessages = [
  { id: 'old-user', role: 'user', type: 'text', content: '更早的一句', at: '2026-09-20T09:58:00Z' },
  { id: 'resident-before', role: 'assistant', type: 'text', content: '外面下雨了。', at: '2026-09-20T09:59:00Z' },
  { id: 'u1', role: 'user', type: 'text', content: '你淋湿了吗？', at: '2026-09-20T10:00:00Z', quotedMsg: { sender: 'A', content: '外面下雨了。' } },
  { id: 'u2', role: 'user', type: 'image', content: 'data:image/png;base64,SECRET', desc: '一把雨伞', at: '2026-09-20T10:00:01Z' }
];
const threadSandbox = {
  cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
  isValidPhoneReplyTime: value => Number.isFinite(new Date(value || '').getTime()),
  getAllStoredPhoneMessages: () => threadMessages,
  cats: { value: [{ id: 'resident-a', hallId: 'hall-a' }] },
  halls: { value: [{ id: 'hall-a', name: 'A馆' }] },
  sameCatId: (left, right) => String(left) === String(right),
  buildFocusedResidentStateContext: () => 'FROZEN RESIDENT',
  buildAuthoritativeUserIdentityContext: () => 'FROZEN USER'
};
vm.createContext(threadSandbox);
vm.runInContext(`${section('const compactPhoneReplyThreadContent', 'const hasUnresolvedPhoneReply')}
globalThis.freezeThread = freezePhoneReplyThreadContext;`, threadSandbox);
const threadOpportunity = { contactId: 'resident-a', sourceMessageIds: ['u1', 'u2'], threadContextFrozen: false };
threadSandbox.freezeThread(threadOpportunity);
assert.deepEqual(threadOpportunity.threadContextMessages.map(row => row.id), ['old-user', 'resident-before', 'u1', 'u2']);
assert.equal(threadOpportunity.threadContextMessages.at(-1).content, '照片：一把雨伞');
assert.ok(!threadOpportunity.threadContextMessages.at(-1).content.includes('base64'));
assert.equal(threadOpportunity.threadContextMessages[2].quotedMsg.content, '外面下雨了。');
const frozenSnapshot = JSON.stringify(threadOpportunity.threadContextMessages);
threadMessages.push({ id: 'u3', role: 'user', type: 'text', content: '记得擦干。' });
threadSandbox.freezeThread(threadOpportunity);
assert.equal(JSON.stringify(threadOpportunity.threadContextMessages), frozenSnapshot, 'post-claim messages cannot mutate the frozen request');

// The durable claim is a single-winner CAS for both approved channels.
const claimOpportunity = {
  id: 'op-claim', contactId: 'resident-a', sourceMessageIds: ['u1'], createdAt: '2026-09-20T10:00:00Z',
  status: 'scheduled', attemptCount: 0, retryAt: '', claimedAt: '', generationToken: ''
};
const claimItems = [claimOpportunity];
let claimPersist = true;
const claimSandbox = {
  Date, Map, Set,
  PHONE_REPLY_UNRESOLVED_STATUSES: new Set(['scheduled', 'retryable', 'in-flight', 'generated', 'delivering', 'failed', 'integrity-mismatch']),
  phoneReplyGenerationInFlight: new Map(), phoneReplyGenerationSequence: 0,
  getPhoneReplyOpportunities: () => claimItems,
  getCanonicalCatId: value => String(value), sameCatId: (left, right) => String(left) === String(right),
  isAcceptedPhoneContact: () => true,
  clonePhoneReplyValue: value => structuredClone(value),
  restorePhoneReplyObject: (target, snapshot) => { Object.keys(target).forEach(key => delete target[key]); Object.assign(target, structuredClone(snapshot)); },
  knowledgeLedger: { value: [] },
  freezePhoneReplyThreadContext: opportunity => { opportunity.threadContextFrozen = true; opportunity.threadContextMessages = [{ id: 'u1' }]; },
  freezePhoneReplyUserDisclosureScope: opportunity => { opportunity.userDisclosureScopeFrozen = true; },
  applyFrozenPhoneUserDisclosureKnowledge: () => {},
  freezePhoneReplyKnowledgeScope: opportunity => { opportunity.knowledgeScopeFrozen = true; },
  freezePhoneReplyEpisodicMemoryScope: opportunity => { opportunity.episodicMemoryScopeFrozen = true; },
  persistNow: () => claimPersist,
  addLog: () => {}, cleanText: value => String(value ?? '')
};
vm.createContext(claimSandbox);
vm.runInContext(`${section('const hasActivePhoneReplyLane', 'const releasePhoneReplyGeneration')}
globalThis.claimGeneration = claimPhoneReplyGeneration;`, claimSandbox);
const won = claimSandbox.claimGeneration(claimOpportunity, 'phone-dedicated', new Date('2026-09-20T10:00:05Z'), { countAttempt: true });
assert.ok(won?.token);
assert.equal(claimOpportunity.status, 'in-flight');
assert.equal(claimOpportunity.attemptCount, 1);
assert.equal(claimSandbox.claimGeneration(claimOpportunity, 'homepage-direct-piggyback', new Date('2026-09-20T10:00:05Z')), null);
assert.equal(claimOpportunity.generationToken, won.token);

const failedClaim = { id: 'op-no-save', contactId: 'resident-b', sourceMessageIds: ['u9'], createdAt: '2026-09-20T10:00:00Z', status: 'scheduled', attemptCount: 0, retryAt: '', claimedAt: '' };
claimItems.push(failedClaim);
claimPersist = false;
assert.equal(claimSandbox.claimGeneration(failedClaim, 'phone-dedicated', new Date('2026-09-20T10:00:06Z'), { countAttempt: true }), null);
assert.equal(failedClaim.status, 'scheduled');
assert.equal(failedClaim.generationToken ?? '', '');

// Program-owned timing is deterministic, bounded, and capped by total age.
const timingSandbox = {
  PHONE_REPLY_DELIVERY_DELAY_RANGES_MS: { quick: [15_000, 60_000], normal: [60_000, 300_000], slow: [300_000, 720_000] },
  PHONE_REPLY_TOTAL_LIFETIME_MS: 720_000,
  Date, Math
};
vm.createContext(timingSandbox);
vm.runInContext(`${section('const stablePhoneReplyNumber', 'const commitPhoneReplyGeneration')}
globalThis.computeDeliverAt = computePhoneReplyDeliverAt;
globalThis.normalizeHint = normalizePhoneReplyTimingHint;`, timingSandbox);
const generatedAt = new Date('2026-09-20T10:00:00Z');
for (const [hint, [minimum, maximum]] of Object.entries(timingSandbox.PHONE_REPLY_DELIVERY_DELAY_RANGES_MS)) {
  const opportunity = { id: `op-${hint}`, createdAt: generatedAt.toISOString() };
  const firstTime = new Date(timingSandbox.computeDeliverAt(opportunity, 'token', hint, generatedAt)).getTime();
  const secondTime = new Date(timingSandbox.computeDeliverAt(opportunity, 'token', hint, generatedAt)).getTime();
  assert.equal(firstTime, secondTime);
  assert.ok(firstTime - generatedAt.getTime() >= minimum && firstTime - generatedAt.getTime() <= maximum);
}
assert.equal(timingSandbox.normalizeHint('invalid'), 'normal');
const expired = { id: 'expired', createdAt: '2026-09-20T09:00:00Z' };
assert.equal(timingSandbox.computeDeliverAt(expired, 'token', 'slow', generatedAt), generatedAt.toISOString());

// Production wiring: exact same-resident Homepage Direct only, soft sidecar,
// one locally bound identity/token, and no generic piggyback registration.
const directSource = section('const sendMessageInternal = async', 'const submitShopItem = async');
assert.match(directSource, /if \(!isReRoll && !isItemUse\) \{\s*phoneReplyPiggybackClaim = claimPhoneReplyForHomepageDirect\(sendingCat\.id\)/);
assert.match(source, /sameCatId\(opportunity\.contactId, canonicalResidentId\)/);
assert.match(source, /claimPhoneReplyGeneration\(opportunity, 'homepage-direct-piggyback'/);
assert.match(source, /claimPhoneReplyGeneration\(opportunity, 'phone-dedicated'/);
assert.equal((source.match(/claimPhoneReplyGeneration\(opportunity,/g) || []).length, 2, 'only dedicated Phone and same-resident Direct may claim generation');
assert.match(directSource, /validateResponse: content => validateMergedHomepageChatResponse/);
assert.match(directSource, /settleHomepageDirectPhoneSidecar\(phoneReplyPiggybackClaim, payload\.phoneReply\)/);
assert.match(source, /PHONE REPLY PIGGYBACK SOFT MISS/);
assert.match(source, /Do not use the current Homepage Direct USER action/);
assert.match(source, /This task must not influence activeCat/);
assert.match(directSource, /activeCat must use only the Direct sections/);
assert.match(source, /rawSidecar && typeof rawSidecar === 'object' && !Array\.isArray\(rawSidecar\)/);
assert.match(source, /String\(opportunity\.generationToken \|\| ''\) !== String\(claim\?\.token \|\| ''\)/);

// Missing/malformed sidecars release only Phone work; delivery never invokes AI.
const settleSource = section('const settleHomepageDirectPhoneSidecar', 'const sendPhoneMessage');
assert.match(settleSource, /releasePhoneReplyGeneration\(claim, \{ status: 'scheduled' \}\)/);
assert.doesNotMatch(settleSource, /throw new Error/);
const deliverySource = section('const promoteGeneratedPhoneReplyDeliveries', 'const markPhoneReplyFailure');
assert.doesNotMatch(deliverySource, /callAI\(|requestStructuredEngine\(/);
assert.match(deliverySource, /status = 'delivering'/);
assert.match(deliverySource, /getPhoneReplyBubbleId/);

// Persistence rollback clears every generated field before any delivery can see it.
const commitSource = section('const commitPhoneReplyGeneration', 'const markPhoneReplyIntegrityMismatch');
for (const field of ['messages = []', 'generatedBubbleIds = []', "generatedAt = ''", "timingHint = ''", "deliverAt = ''", "nextDeliveryAt = ''"]) {
  assert.ok(commitSource.includes(field), `rollback clears ${field}`);
}
assert.match(commitSource, /generation-persist-rollback-failed/);
assert.match(commitSource, /status = 'generated'/);
assert.match(commitSource, /if \(!persistNow\(\)\) throw new Error/);
const runCommitCase = persistSteps => {
  const opportunity = {
    id: 'op-commit', contactId: 'resident-a', createdAt: '2026-09-20T10:00:00Z', status: 'in-flight',
    generationToken: 'token-commit', generationChannel: 'phone-dedicated', generationClaimedAt: '2026-09-20T10:00:01Z',
    attemptCount: 1, messages: [], generatedBubbleIds: [], knowledgeDisclosureFactIdsByBubble: [], responseBatchId: '',
    generatedAt: '', timingHint: '', deliverAt: '', nextDeliveryIndex: 0, nextDeliveryAt: '', lastError: '', integrityState: ''
  };
  let step = 0;
  const sandbox = {
    Date,
    getPhoneReplyOpportunities: () => [opportunity],
    validatePhoneChatReplyPayload: () => true,
    parsePhoneChatReplyEnvelope: payload => payload,
    clonePhoneReplyValue: value => structuredClone(value),
    restorePhoneReplyObject: (target, snapshot) => { Object.keys(target).forEach(key => delete target[key]); Object.assign(target, structuredClone(snapshot)); },
    normalizePhoneReplyTimingHint: value => ['quick', 'normal', 'slow'].includes(value) ? value : 'normal',
    validatePhoneReplyKnowledgeDisclosures: () => [],
    computePhoneReplyDeliverAt: () => '2026-09-20T10:01:00.000Z',
    persistNow: () => {
      const result = persistSteps[Math.min(step, persistSteps.length - 1)];
      step += 1;
      if (result instanceof Error) throw result;
      return result;
    },
    phoneReplyGenerationInFlight: new Map([['op-commit', 'token-commit']]),
    PHONE_REPLY_RETRY_DELAYS_MS: [60_000, 180_000, 480_000],
    addLog: () => {}, schedulePhoneReplyReconciliation: () => {}, cleanText: value => String(value ?? '')
  };
  vm.createContext(sandbox);
  vm.runInContext(`${commitSource}\nglobalThis.commitGeneration = commitPhoneReplyGeneration;`, sandbox);
  const result = sandbox.commitGeneration(
    { opportunityId: 'op-commit', contactId: 'resident-a', token: 'token-commit', channel: 'phone-dedicated' },
    { messages: ['已经生成的回复'], timingHint: 'quick', knowledgeDisclosures: [] },
    new Date('2026-09-20T10:00:05Z')
  );
  return { opportunity, result, steps: step };
};
const durableCommit = runCommitCase([true]);
assert.equal(durableCommit.result.committed, true);
assert.equal(durableCommit.opportunity.status, 'generated');
assert.deepEqual([...durableCommit.opportunity.messages], ['已经生成的回复']);
const rolledBackCommit = runCommitCase([false, true]);
assert.equal(rolledBackCommit.result.committed, false);
assert.equal(rolledBackCommit.opportunity.status, 'retryable');
assert.deepEqual([...rolledBackCommit.opportunity.messages], []);
assert.equal(rolledBackCommit.opportunity.deliverAt, '');
assert.equal(rolledBackCommit.steps, 2, 'a partial main-save failure gets one narrow rollback persistence');
const thrownCommit = runCommitCase([new Error('storage throw'), true]);
assert.equal(thrownCommit.opportunity.status, 'retryable');
assert.deepEqual([...thrownCommit.opportunity.messages], []);
const quarantinedCommit = runCommitCase([false, false]);
assert.equal(quarantinedCommit.opportunity.status, 'integrity-mismatch');
assert.equal(quarantinedCommit.opportunity.integrityState, 'generation-persist-rollback-failed');
assert.deepEqual([...quarantinedCommit.opportunity.messages], []);

// Phone Presence applies the correctness filter before either preferred or fallback selection.
const presenceCandidates = section('const getPhonePresenceCandidates', 'const choosePhonePresenceCandidate');
assert.match(presenceCandidates, /\.filter\(cat => !hasUnresolvedPhoneReply\(cat\.id\)\)/);
assert.match(presenceCandidates, /return preferred\.length \? preferred : contacts/);
for (const status of ['scheduled', 'retryable', 'in-flight', 'generated', 'delivering', 'failed', 'integrity-mismatch']) {
  assert.ok(source.includes(`'${status}'`), `unresolved lifecycle includes ${status}`);
}

// UI states and call-site budget.
assert.match(source, /state === 'ready'/);
assert.match(source, /获取回复/);
assert.match(source, /等回复/);
assert.match(source, /\['retryable', 'in-flight', 'generated', 'delivering'\]/);
assert.equal((source.match(/callAI\(/g) || []).length, 40);

console.log(JSON.stringify({
  fixture: 'phone-reply-generation-delivery-v2',
  status: 'PASS',
  checks: [
    'pending-generation', 'no-timer-generation', 'preclaim-batching', 'postclaim-lane',
    'thread-freeze', 'single-winner-claim', 'claim-persistence', 'same-resident-only',
    'logical-channel-isolation', 'soft-sidecar', 'token-guard', 'program-delivery-timing',
    'generated-before-delivery', 'rollback-quarantine', 'local-exact-once-delivery',
    'phone-presence-exclusion', 'manual-ui', 'callAI-budget'
  ]
}));
