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
  getPhoneReplySourceMessages: op => op.sourceMessageIds.map(id => ({ id, role: 'user' })),
  markPhoneReplyIntegrityMismatch: op => { op.status = 'integrity-mismatch'; },
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
  isEligiblePhoneReplySource: message => message?.role === 'user' && !message.recalled && Boolean(message.id),
  getPhoneMessageTimestamp: message => new Date(message.at).getTime(),
  cats: { value: [{ id: 'resident-a', hallId: 'hall-a' }] },
  halls: { value: [{ id: 'hall-a', name: 'A馆' }] },
  sameCatId: (left, right) => String(left) === String(right),
  buildFocusedResidentStateContext: () => 'FROZEN RESIDENT',
  getPhoneContactDisplayName: () => 'A',
  buildAuthoritativeUserIdentityContext: () => 'FROZEN USER'
};
vm.createContext(threadSandbox);
vm.runInContext(`${section('const getPhoneReplySourceMessages', 'const hasUnresolvedPhoneReply')}
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
  getPhoneReplySourceMessages: op => op.sourceMessageIds.map(id => ({ id, role: 'user' })),
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
assert.match(directSource, /validateResponse: content => \{[\s\S]*?return validateMergedHomepageChatResponse/);
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
    getPhoneReplySourceMessages: () => [{ id: 'source', role: 'user' }],
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
assert.equal((source.match(/callAI\(/g) || []).length, 36);

// M1: exercise the real merged storage reader, normalization, claim, commit,
// delivery and user-send persistence boundary. No provider or disk writes.
const makeM1 = () => {
  const user = { currentStatus: 'PRIVATE OWNER SENTINEL', phoneData: {
    friends: ['a', 'b'], chats: [{ contactId: 'a', history: [] }, { contactId: 'b', history: [] }],
    chatArchives: {}, replyOpportunities: []
  } };
  const saves = [], toasts = [];
  let saveSteps = [];
  const sandbox = {
    user, Date, Math, Map, Set,
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    getCanonicalCatId: String, sameCatId: (a, b) => String(a) === String(b),
    cats: { value: [{ id: 'a', hallId: 'hall', name: 'A', innerVoice: 'A PRIVATE' },
      { id: 'b', hallId: 'hall', name: 'B', innerVoice: 'B PRIVATE SENTINEL' }] },
    halls: { value: [{ id: 'hall', name: 'Hall' }] },
    buildFocusedResidentStateContext: cat => `OWN PROFILE ${cat.id}`,
    getPhoneContactDisplayName: cat => cat.name,
    buildAuthoritativeUserIdentityContext: () => 'PUBLIC IDENTITY',
    isValidPhoneReplyTime: value => Boolean(value) && Number.isFinite(new Date(value).getTime()),
    getPhoneChatHistory: id => user.phoneData.chats.find(chat => chat.contactId === id)?.history || [],
    ensurePhoneChatHistory: id => user.phoneData.chats.find(chat => chat.contactId === id).history,
    getOperationalDayKey: date => date.toISOString().slice(0, 10),
    appendPhoneChatMemory: () => {}, announceIncomingPhoneMessage: () => {},
    showToast: text => toasts.push(text), addLog: () => {},
    scrollPhoneChatToBottom: () => {}, isPhoneChatNearBottom: () => false,
    schedulePhoneReplyReconciliation: () => {}, knowledgeLedger: { value: [] },
    freezePhoneReplyUserDisclosureScope: () => {}, applyFrozenPhoneUserDisclosureKnowledge: () => {},
    freezePhoneReplyKnowledgeScope: () => {}, freezePhoneReplyEpisodicMemoryScope: () => {},
    normalizePhoneReplyKnowledgeSnapshots: rows => rows || [], normalizePhoneReplyEpisodicMemorySnapshots: rows => rows || [],
    normalizePhoneReplyDisclosureFactIdsByBubble: rows => rows || [], makePhoneReplyKnowledgeFactRefs: () => [],
    getLifeThreadFactLocation: () => null, validatePhoneChatReplyPayload: () => true,
    parsePhoneChatReplyEnvelope: payload => payload, validatePhoneReplyKnowledgeDisclosures: () => [],
    normalizePhoneReplyTimingHint: () => 'normal', computePhoneReplyDeliverAt: (_op, _token, _hint, now) => now.toISOString(),
    PHONE_REPLY_STATUSES: new Set(['scheduled', 'retryable', 'in-flight', 'generated', 'delivering', 'completed', 'failed', 'integrity-mismatch']),
    PHONE_REPLY_UNRESOLVED_STATUSES: new Set(['scheduled', 'retryable', 'in-flight', 'generated', 'delivering', 'failed', 'integrity-mismatch']),
    PHONE_REPLY_RETRY_DELAYS_MS: [60_000, 180_000, 480_000], PHONE_REPLY_BUBBLE_DELAY_MS: 750,
    phoneReplyGenerationInFlight: new Map(), phoneReplyGenerationSequence: 0,
    persistNow: () => {
      const ok = saveSteps.length ? saveSteps.shift() : true;
      if (ok) saves.push(JSON.parse(JSON.stringify(user)));
      return ok;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(`
    ${section('const getStoredPhoneArchiveMessages', 'const phoneMessageVisibleInContainer')}
    ${section('const getPhoneMessageTimestamp', 'const getLatestPhoneMessageTimestamp')}
    ${section('const getPhoneReplyOpportunities', 'const normalizePhoneReplyKnowledgeSnapshots')}
    ${section('const normalizePhoneReplyThreadMessages', 'const makePhoneReplyKnowledgeFactRefs')}
    ${section('const normalizePhoneReplyOpportunities', 'const hasUnresolvedPhoneReply')}
    ${section('const queuePhoneReplyOpportunity', 'const removePhoneReplySource')}
    ${section('const getPhoneReplyBubbleId', 'const releasePhoneReplyGeneration')}
    ${section('const commitPhoneReplyGeneration', 'const markPhoneReplyFailure')}
    ${section('const appendPhoneMessage', 'const getPhoneArchiveForContact')}
    globalThis.m1 = { getAllStoredPhoneMessages, queuePhoneReplyOpportunity, getPhoneReplySourceMessages,
      freezePhoneReplyThreadContext, normalizePhoneReplyOpportunities, claimPhoneReplyGeneration,
      getPhoneReplyLaneHeadForContact, commitPhoneReplyGeneration, promoteGeneratedPhoneReplyDeliveries,
      flushPhoneReplyDeliveries, appendPhoneMessage };
  `, sandbox);
  return { ...sandbox.m1, user, saves, toasts, sandbox, setSaveSteps: steps => { saveSteps = [...steps]; } };
};
const row = (id, role, content, at, extra = {}) => ({ id, role, type: 'text', content, at, ...extra });
const live = (h, id = 'a') => h.user.phoneData.chats.find(chat => chat.contactId === id).history;
const archive = (h, id, messages) => { h.user.phoneData.chatArchives[id] = { '2026-10-04': { messages } }; };
const ids = rows => Array.from(rows, message => message.id);
const time = new Date('2026-10-05T10:00:00Z');
const aTurn = row('resident-before', 'assistant', 'How was your day?', '2026-10-04T23:00:00Z');
const u1 = row('u1', 'user', 'Terrible.', '2026-10-05T09:00:00Z');
const u2 = row('u2', 'user', 'Also tired.', '2026-10-05T09:00:01Z');
const u3 = row('u3', 'user', 'I stayed home.', '2026-10-05T09:00:02Z');

// A same-day; B cross-day; C canonical duplicate; D wrong-contact archive.
const sameDay = makeM1(); live(sameDay).push(u1, aTurn);
const sameOp = sameDay.queuePhoneReplyOpportunity('a', u1, time);
sameDay.freezePhoneReplyThreadContext(sameOp);
assert.deepEqual(ids(sameOp.threadContextMessages), ['resident-before', 'u1']);
const h = makeM1(); live(h).push(u3, u1, u2);
archive(h, 'a', [aTurn, { ...u1 }, row('wrong-tag', 'assistant', 'B PRIVATE CHAT SENTINEL', aTurn.at, { contactId: 'b' })]);
archive(h, 'b', [row('b-private', 'assistant', 'B PRIVATE CHAT SENTINEL', aTurn.at)]);
assert.deepEqual(ids(h.getAllStoredPhoneMessages('a')), ['resident-before', 'u1', 'u2', 'u3']);
assert.equal(h.getAllStoredPhoneMessages('a').filter(message => message.id === 'u1').length, 1);
const tie = makeM1(); live(tie).push({ ...u1, id: 'z' }, { ...u1, id: 'a' });
assert.deepEqual(ids(tie.getAllStoredPhoneMessages('a')), ['a', 'z']);

// E three sends merge and IDs reorder by canonical chronology, not arrival array.
const batchA = h.queuePhoneReplyOpportunity('a', u3, time);
h.queuePhoneReplyOpportunity('a', u1, time); h.queuePhoneReplyOpportunity('a', u2, time);
assert.equal(h.user.phoneData.replyOpportunities.length, 1);
assert.deepEqual(Array.from(batchA.sourceMessageIds), ['u1', 'u2', 'u3']);
assert.equal(batchA.generationDueAt, '');
const claim = h.claimPhoneReplyGeneration(batchA, 'phone-dedicated', time);
assert.ok(claim);
assert.deepEqual(ids(batchA.threadContextMessages), ['resident-before', 'u1', 'u2', 'u3']);
const packet = JSON.stringify(batchA);
assert.ok(!packet.includes('B PRIVATE')); assert.ok(!packet.includes('PRIVATE OWNER'));

// F claimed sources/context remain frozen; G real commit/delivery settles own batch only.
const u4 = row('u4', 'user', 'One more thing.', '2026-10-05T10:01:00Z'); live(h).push(u4);
const batchB = h.queuePhoneReplyOpportunity('a', u4, time);
assert.notEqual(batchB.id, batchA.id);
assert.equal(JSON.stringify(batchA), packet);
assert.equal(h.commitPhoneReplyGeneration(claim, { messages: ['Tell me more.'] }, time).committed, true);
h.promoteGeneratedPhoneReplyDeliveries(time); h.flushPhoneReplyDeliveries(time);
assert.equal(batchA.status, 'completed'); assert.equal(batchB.status, 'scheduled');
assert.deepEqual(Array.from(batchB.sourceMessageIds), ['u4']);
assert.equal(h.getPhoneReplyLaneHeadForContact('a').id, batchB.id);
h.flushPhoneReplyDeliveries(time);
assert.equal(h.getAllStoredPhoneMessages('a').filter(message => message.phoneReplyOpportunityId === batchA.id).length, 1);

// H missing/wrong-contact/assistant/oversize IDs fail explicitly, no false settlement.
for (const [sourceId, expected] of [['missing', 'source-message-missing'], ['b-private', 'source-message-missing'], ['resident-before', 'source-message-invalid']]) {
  assert.throws(() => h.getPhoneReplySourceMessages({ contactId: 'a', sourceMessageIds: [sourceId] }), new RegExp(expected));
}
const tooLong = row('large', 'user', 'x'.repeat(361), u4.at); live(h).push(tooLong);
assert.throws(() => h.freezePhoneReplyThreadContext({ contactId: 'a', sourceMessageIds: ['large'] }), /source-context-too-large/);
const duplicates = { contactId: 'a', sourceMessageIds: ['u2', 'u1', 'u1'] };
assert.deepEqual(ids(h.getPhoneReplySourceMessages(duplicates)), ['u1', 'u2']);

// I loading/recovery retains broken IDs and quarantines instead of silently dropping.
const damaged = makeM1(); live(damaged).push(u1, u2);
const broken = damaged.queuePhoneReplyOpportunity('a', u1, time);
broken.sourceMessageIds = ['missing'];
const next = damaged.queuePhoneReplyOpportunity('a', u2, time);
assert.equal(broken.status, 'integrity-mismatch');
assert.deepEqual(Array.from(broken.sourceMessageIds), ['missing']);
assert.equal(damaged.getPhoneReplyLaneHeadForContact('a').id, next.id);
assert.ok(damaged.claimPhoneReplyGeneration(next, 'phone-dedicated', time));
const reload = makeM1(); live(reload).push(u1);
reload.user.phoneData.replyOpportunities = [{ ...broken }];
reload.normalizePhoneReplyOpportunities();
assert.equal(reload.user.phoneData.replyOpportunities[0].status, 'integrity-mismatch');
assert.deepEqual(Array.from(reload.user.phoneData.replyOpportunities[0].sourceMessageIds), ['missing']);
const failed = makeM1(); live(failed).push(u1, u2);
const exhausted = failed.queuePhoneReplyOpportunity('a', u1, time); exhausted.status = 'failed';
const validLater = failed.queuePhoneReplyOpportunity('a', u2, time);
assert.equal(failed.getPhoneReplyLaneHeadForContact('a').id, validLater.id);
assert.equal(exhausted.status, 'failed'); assert.deepEqual(Array.from(exhausted.sourceMessageIds), ['u1']);

// Claimed source loss rejects acceptance; a surviving frozen turn reloads unchanged.
const lost = makeM1(); live(lost).push(u1);
const lostOp = lost.queuePhoneReplyOpportunity('a', u1, time);
const lostClaim = lost.claimPhoneReplyGeneration(lostOp, 'phone-dedicated', time);
live(lost).splice(0);
assert.equal(lost.commitPhoneReplyGeneration(lostClaim, { messages: ['wrong'] }, time).committed, false);
assert.equal(lostOp.status, 'integrity-mismatch'); assert.equal(lostOp.completedAt, '');
assert.equal(lost.sandbox.phoneReplyGenerationInFlight.size, 0);
const recovered = makeM1(); live(recovered).push(u1);
const recOp = recovered.queuePhoneReplyOpportunity('a', u1, time);
recovered.claimPhoneReplyGeneration(recOp, 'phone-dedicated', time);
const recPacket = JSON.stringify(recOp.threadContextMessages);
recovered.normalizePhoneReplyOpportunities({ recoverInFlight: true, now: time });
assert.equal(recovered.user.phoneData.replyOpportunities[0].status, 'retryable');
assert.equal(JSON.stringify(recovered.user.phoneData.replyOpportunities[0].threadContextMessages), recPacket);

// A stored foreign row cannot become authorized by being inside a frozen packet.
const foreignPacket = makeM1(); live(foreignPacket).push(u1);
archive(foreignPacket, 'b', [row('b-secret', 'assistant', 'B PRIVATE', aTurn.at)]);
const ownOp = foreignPacket.queuePhoneReplyOpportunity('a', u1, time);
foreignPacket.claimPhoneReplyGeneration(ownOp, 'phone-dedicated', time);
ownOp.threadContextMessages.push(row('b-secret', 'assistant', 'B PRIVATE', aTurn.at));
assert.throws(() => foreignPacket.getPhoneReplySourceMessages(ownOp), /frozen-thread-contact-mismatch/);

// Existing claimed recall preserves the authorized original source, not a new turn.
const recall = makeM1(); const recalledRow = { ...u1 }; live(recall).push(recalledRow);
const recalledOp = recall.queuePhoneReplyOpportunity('a', recalledRow, time);
recall.claimPhoneReplyGeneration(recalledOp, 'phone-dedicated', time);
recalledRow.originalPhoneReplySource = { type: 'text', content: u1.content, desc: '' };
recalledRow.type = 'system'; recalledRow.content = '你撤回了一条消息'; recalledRow.recalled = true;
assert.equal(recall.getPhoneReplySourceMessages(recalledOp)[0].content, u1.content);
recall.normalizePhoneReplyOpportunities({ recoverInFlight: true, now: time });
assert.equal(recall.user.phoneData.replyOpportunities[0].status, 'retryable');

// Sending order: durable canonical row before source IDs; both failure stages safe.
const send = makeM1(); const sent = send.appendPhoneMessage('a', 'user', 'text', 'hello');
assert.ok(sent); assert.equal(send.saves.length, 2);
assert.equal(send.saves[0].phoneData.chats[0].history[0].id, sent.id);
assert.equal(send.saves[0].phoneData.replyOpportunities.length, 0);
assert.deepEqual(send.saves[1].phoneData.replyOpportunities[0].sourceMessageIds, [sent.id]);
const failMessage = makeM1(); failMessage.setSaveSteps([false]);
assert.equal(failMessage.appendPhoneMessage('a', 'user', 'text', 'unsaved'), null);
assert.equal(live(failMessage).length, 0); assert.equal(failMessage.user.phoneData.replyOpportunities.length, 0);
const failPending = makeM1(); failPending.setSaveSteps([true, false]);
assert.ok(failPending.appendPhoneMessage('a', 'user', 'text', 'durable'));
assert.equal(live(failPending).length, 1); assert.equal(failPending.user.phoneData.replyOpportunities.length, 0);
assert.equal(failPending.saves.length, 1); assert.ok(failPending.toasts.length);

console.log(JSON.stringify({
  fixture: 'phone-reply-generation-delivery-v2',
  status: 'PASS',
  checks: [
    'pending-generation', 'no-timer-generation', 'preclaim-batching', 'postclaim-lane',
    'thread-freeze', 'single-winner-claim', 'claim-persistence', 'same-resident-only',
    'logical-channel-isolation', 'soft-sidecar', 'token-guard', 'program-delivery-timing',
    'generated-before-delivery', 'rollback-quarantine', 'local-exact-once-delivery',
    'phone-presence-exclusion', 'manual-ui', 'callAI-budget',
    'M1-canonical-order', 'M1-cross-day', 'M1-live-archive-dedupe', 'M1-contact-privacy',
    'M1-source-integrity', 'M1-batching-freeze', 'M1-completion-isolation', 'M1-terminal-head', 'M1-send-persistence'
  ]
}));
