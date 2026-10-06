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
assert.match(source, /opportunity\.generationDueAt = computePhoneReplyGenerationDueAt\(opportunity\)/);
assert.match(source, /generationDueAt[\s\S]*raw\.dueAt/);
assert.match(source, /deliverAt, nextDeliveryIndex, nextDeliveryAt/);
assert.doesNotMatch(source, /phoneReplyDueTime/);
const reconcileSource = section('const reconcilePhoneReplyOpportunities = async', 'const claimPhoneReplyForHomepageDirect');
assert.match(reconcileSource, /promoteGeneratedPhoneReplyDeliveries\(now\)/);
assert.match(reconcileSource, /flushPhoneReplyDeliveries\(now\)/);
assert.doesNotMatch(reconcileSource, /callAI\(/);
assert.match(reconcileSource, /claimPhoneReplyGeneration\(opportunity, 'phone-dedicated'/);
assert.match(reconcileSource, /runPhoneReplyOpportunity\(claim, \{ automatic: true \}\)/);

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
  computePhoneReplyGenerationDueAt: op => new Date(new Date(op.createdAt).getTime() + 60_000).toISOString(),
  schedulePhoneReplyReconciliation: () => {}
};
vm.createContext(queueSandbox);
vm.runInContext(`${section('const queuePhoneReplyOpportunity', 'const removePhoneReplySource')}
globalThis.queueReply = queuePhoneReplyOpportunity;`, queueSandbox);
const first = queueSandbox.queueReply('resident-a', { id: 'u1', role: 'user' }, new Date('2026-09-20T10:00:00Z'));
const merged = queueSandbox.queueReply('resident-a', { id: 'u2', role: 'user' }, new Date('2026-09-20T10:00:01Z'));
assert.equal(first.id, merged.id);
assert.deepEqual([...first.sourceMessageIds], ['u1', 'u2']);
assert.equal(first.generationDueAt, '2026-09-20T10:01:00.000Z', 'merged work retains the first due time');
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
  assert.equal(firstTime, generatedAt.getTime(), 'generation success does not get another long delay');
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
assert.equal((source.match(/claimPhoneReplyGeneration\(opportunity,/g) || []).length, 3, 'auto and manual Phone plus same-resident Direct share the same claim');
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
assert.doesNotMatch(section('<!-- Reply preview bar -->', '<!-- Tool bar:'), /获取回复|requestPhoneReplyGeneration/);
assert.match(source, /等待回复…/);
assert.match(source, /正在回复…/);
assert.match(source, /重新尝试回复/);
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
    isResidentAway: cat => Boolean(cat.isOut), getResidentCopyContext: () => null,
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
    normalizePhoneReplyTimingHint: () => 'normal',
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
    ${section('const PHONE_REPLY_GENERATION_DELAY_RANGES_MS', 'const PHONE_REPLY_RETRY_DELAYS_MS')}
    ${section('const stablePhoneReplyNumber', 'const commitPhoneReplyGeneration')}
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
      flushPhoneReplyDeliveries, appendPhoneMessage, computePhoneReplyGenerationDueAt };
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
assert.ok(new Date(batchA.generationDueAt).getTime() > time.getTime());
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

// M2: fake active-session clock/timers, actual production reconciliation,
// claim, generator, prompt packet, commit, delivery and waiting-state helpers.
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const makeM2 = () => {
  const h = makeM1();
  let clock = Date.parse('2026-10-05T10:00:00Z'), timerId = 0;
  const timers = new Map(), requests = [];
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  Object.assign(h.sandbox, {
    Date: ClockDate, document: { visibilityState: 'visible' }, statusRefreshDisposed: false,
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay, at: clock + delay }); return id; },
    clearTimeout: id => timers.delete(id), phoneReplyReconciliationTimer: null,
    phoneIdentities: { value: { a: { name: 'A' }, b: { name: 'B' } } },
    phoneState: { isTyping: false }, isExactPhoneConversationOpen: () => true,
    getInteractionHolidayContext: () => '', buildResidentConversationKnowledgeContext: () => ({ prompt: '' }),
    CORE_ROLEPLAY_PROMPT: 'TEST SYSTEM', ThinkingLevel: { LOW: 'low' },
    AIRequestCancelledError: class extends Error {}, validatePhoneChatReply: () => true,
    callAI: (prompt, _system, _tokens, _thinking, options) => {
      assert.equal(options.maxAttempts, 1); assert.equal(options.uiMode, 'background');
      return new Promise((resolve, reject) => requests.push({ prompt, options, resolve, reject }));
    }
  });
  vm.runInContext(`
    ${section('const schedulePhoneReplyReconciliation', 'const queuePhoneReplyOpportunity')}
    ${section('const phoneReplyNeedsManualRetry', 'const insertEmoji')}
    ${section('const formatFrozenPhoneReplyThread', 'const stablePhoneReplyNumber')}
    ${section('const markPhoneReplyFailure', 'const sendPhoneMessage')}
    globalThis.m2 = { reconcilePhoneReplyOpportunities, claimPhoneReplyForHomepageDirect,
      getPhoneReplyControlState, retryPhoneReplyOpportunity, runPhoneReplyOpportunity, schedulePhoneReplyReconciliation };
  `, h.sandbox);
  const result = { ...h, ...h.sandbox.m2, requests, timers,
    now: () => new ClockDate(), setClock: value => { clock = typeof value === 'number' ? value : new Date(value).getTime(); },
    current: () => h.user.phoneData.replyOpportunities[0],
    send: content => h.appendPhoneMessage('a', 'user', 'text', content),
    tick: () => h.sandbox.m2.reconcilePhoneReplyOpportunities(new ClockDate()),
    succeed: async (index = requests.length - 1, messages = ['我在呢，接着告诉我吧。']) => {
      requests[index].resolve({ messages, timingHint: 'slow' }); await settle();
    }
  };
  return result;
};

// Timing policy uses only reliable current facts, once per original batch.
for (const kind of ['normal', 'quick', 'away', 'sleep', 'baseline-sleep']) {
  const m = makeM2();
  if (kind === 'quick') live(m).push(row('recent-a', 'assistant', 'hello', m.now().toISOString()));
  if (kind === 'away') m.sandbox.cats.value[0].isOut = true;
  if (kind === 'sleep' || kind === 'baseline-sleep') m.sandbox.getResidentCopyContext = () => ({ family: 'sleep', episodeId: kind === 'sleep' ? 'accepted-sleep' : 'baseline:hall' });
  m.send('hello');
  const delay = new Date(m.current().generationDueAt).getTime() - m.now().getTime();
  const [min, max] = kind === 'quick' ? [15_000, 60_000] : ['away', 'sleep'].includes(kind) ? [300_000, 720_000] : [60_000, 300_000];
  assert.ok(delay >= min && delay <= max, `${kind}: ${delay}`);
  assert.equal(m.requests.length, 0);
}

// A/B/C/D/G/K/M: send is durable/zero-AI, merge retains due, one due claim,
// same canonical packet, no duplicate reconciliation or second long delay.
const auto = makeM2();
archive(auto, 'a', [aTurn]); archive(auto, 'b', [row('secret-b', 'assistant', 'B PRIVATE CHAT', aTurn.at)]);
const sent1 = auto.send('first user turn');
const due = auto.current().generationDueAt;
assert.equal(auto.requests.length, 0); assert.ok(new Date(due).getTime() > auto.now().getTime());
assert.equal(auto.saves.at(-1).phoneData.replyOpportunities[0].generationDueAt, due);
auto.setClock(auto.now().getTime() + 1000); const sent2 = auto.send('second user turn');
auto.setClock(auto.now().getTime() + 1000); const sent3 = auto.send('third user turn');
assert.equal(auto.current().generationDueAt, due);
assert.equal(auto.getPhoneReplyControlState('a').state, 'pending');
auto.setClock(new Date(due).getTime() - 1); await auto.tick(); assert.equal(auto.requests.length, 0);
auto.setClock(due); await auto.tick();
assert.equal(auto.requests.length, 1); assert.equal(auto.current().status, 'in-flight');
assert.equal(auto.getPhoneReplyControlState('a').state, 'generating');
assert.deepEqual(Array.from(auto.current().sourceMessageIds), [sent1.id, sent2.id, sent3.id]);
assert.deepEqual(ids(auto.current().threadContextMessages), ['resident-before', sent1.id, sent2.id, sent3.id]);
assert.ok(auto.requests[0].prompt.includes('first user turn')); assert.ok(auto.requests[0].prompt.includes('third user turn'));
assert.ok(!auto.requests[0].prompt.includes('B PRIVATE')); assert.ok(!auto.requests[0].prompt.includes('PRIVATE OWNER'));
for (let i = 0; i < 20; i++) await auto.tick();
assert.equal(auto.requests.length, 1);
await auto.succeed();
assert.equal(auto.current().status, 'generated'); assert.equal(auto.current().deliverAt, auto.now().toISOString());
await auto.tick(); assert.equal(auto.current().status, 'completed');
assert.equal(auto.getPhoneReplyControlState('a').state, 'hidden');
for (let i = 0; i < 10; i++) await auto.tick(); assert.equal(auto.requests.length, 1);

// The existing single timeout itself drives generation; no manual tick needed.
const timerDriven = makeM2(); timerDriven.send('timer-driven reply');
const timerDue = timerDriven.current().generationDueAt;
for (let i = 0; i < 6 && timerDriven.requests.length === 0; i++) {
  assert.equal(timerDriven.timers.size, 1);
  const [id, timer] = [...timerDriven.timers.entries()][0];
  timerDriven.timers.delete(id); timerDriven.setClock(timer.at); timer.fn(); await settle();
}
assert.equal(timerDriven.requests.length, 1);
assert.equal(timerDriven.now().toISOString(), timerDue);

// E/F: pending survives reload; overdue work and legacy empty due don't reset wait.
const saved = makeM2(); saved.send('durable pending');
const savedState = JSON.parse(JSON.stringify(saved.saves.at(-1).phoneData));
const restored = makeM2(); restored.user.phoneData = JSON.parse(JSON.stringify(savedState));
restored.setClock(new Date(savedState.replyOpportunities[0].generationDueAt).getTime() - 1);
await restored.tick(); assert.equal(restored.requests.length, 0);
restored.setClock(savedState.replyOpportunities[0].generationDueAt); await restored.tick();
assert.equal(restored.requests.length, 1);
const overdue = makeM2(); overdue.user.phoneData = JSON.parse(JSON.stringify(savedState));
overdue.setClock('2026-10-06T12:00:00Z'); await overdue.tick();
assert.equal(overdue.requests.length, 1); assert.equal(overdue.current().generationDueAt, savedState.replyOpportunities[0].generationDueAt);
const legacy = makeM2(); legacy.user.phoneData = JSON.parse(JSON.stringify(savedState));
legacy.current().generationDueAt = ''; legacy.setClock('2026-10-06T12:00:00Z'); await legacy.tick();
assert.equal(legacy.requests.length, 1);
assert.ok(new Date(legacy.current().generationDueAt).getTime() <= new Date(legacy.current().createdAt).getTime() + 300_000);
const hidden = makeM2(); hidden.user.phoneData = JSON.parse(JSON.stringify(savedState));
hidden.setClock('2026-10-06T12:00:00Z'); hidden.sandbox.document.visibilityState = 'hidden'; await hidden.tick();
assert.equal(hidden.requests.length, 0); hidden.sandbox.document.visibilityState = 'visible'; await hidden.tick();
assert.equal(hidden.requests.length, 1);

const legacyMissingCreation = makeM2(); legacyMissingCreation.user.phoneData = JSON.parse(JSON.stringify(savedState));
legacyMissingCreation.current().createdAt = ''; legacyMissingCreation.current().generationDueAt = '';
legacyMissingCreation.setClock('2026-10-06T12:00:00Z'); await legacyMissingCreation.tick();
assert.equal(legacyMissingCreation.requests.length, 1, 'canonical first-send time prevents a fresh wait for old data');

// H/lane order: second batch becomes overdue but cannot overtake active A.
const lanes = makeM2(); lanes.send('batch A'); lanes.setClock(lanes.current().generationDueAt); await lanes.tick();
const aSources = JSON.stringify(lanes.current().sourceMessageIds), frozenA = JSON.stringify(lanes.current().threadContextMessages);
lanes.send('batch B'); const batchBDue = lanes.user.phoneData.replyOpportunities[1].generationDueAt;
assert.equal(JSON.stringify(lanes.current().sourceMessageIds), aSources); assert.equal(JSON.stringify(lanes.current().threadContextMessages), frozenA);
lanes.setClock(batchBDue); await lanes.tick(); assert.equal(lanes.requests.length, 1);
assert.ok([...lanes.timers.values()].every(timer => timer.delay > 0), 'blocked overdue B never starts a zero-delay timer loop');
await lanes.succeed(0, ['第一条回复到了。', '接着是第二条回复。']); await lanes.tick();
assert.equal(lanes.requests.length, 1); assert.equal(lanes.current().status, 'delivering');
assert.equal(new Date(lanes.current().nextDeliveryAt).getTime() - lanes.now().getTime(), 750);
lanes.setClock(lanes.now().getTime() + 750); await lanes.tick();
assert.equal(lanes.current().status, 'completed'); assert.equal(lanes.requests.length, 2);
assert.equal(lanes.user.phoneData.replyOpportunities[1].status, 'in-flight');

// I/J: both orderings of exact-resident, exact-opportunity atomic claim.
const sidecar = makeM2(); sidecar.send('early sidecar');
assert.equal(sidecar.claimPhoneReplyForHomepageDirect('b'), null);
const sideClaim = sidecar.claimPhoneReplyForHomepageDirect('a'); assert.ok(sideClaim);
assert.equal(sidecar.current().id, sideClaim.opportunityId);
sidecar.setClock(sidecar.current().generationDueAt); await sidecar.tick(); assert.equal(sidecar.requests.length, 0);
assert.equal(sidecar.commitPhoneReplyGeneration(sideClaim, { messages: ['同一条待回复消息已回应。'] }, sidecar.now()).committed, true);
await sidecar.tick(); assert.equal(sidecar.current().status, 'completed'); assert.equal(sidecar.requests.length, 0);
const earlySidecar = makeM2(); earlySidecar.send('sidecar completes early');
const earlyClaim = earlySidecar.claimPhoneReplyForHomepageDirect('a');
assert.ok(earlySidecar.now().getTime() < new Date(earlySidecar.current().generationDueAt).getTime());
assert.equal(earlySidecar.commitPhoneReplyGeneration(earlyClaim, { messages: ['提前搭便车完成。'] }, earlySidecar.now()).committed, true);
assert.equal(earlySidecar.current().deliverAt, earlySidecar.now().toISOString());
await earlySidecar.tick(); assert.equal(earlySidecar.current().status, 'completed');
earlySidecar.setClock(earlySidecar.current().generationDueAt); await earlySidecar.tick(); assert.equal(earlySidecar.requests.length, 0);

const dueWins = makeM2(); dueWins.send('due wins'); dueWins.setClock(dueWins.current().generationDueAt); await dueWins.tick();
assert.equal(dueWins.requests.length, 1); assert.equal(dueWins.claimPhoneReplyForHomepageDirect('a'), null);

// L: use the actual existing AI queue/transport with a fake failing fetch.
// This counts provider attempts, not merely calls to a stubbed generator.
const retry = makeM2();
let providerAttempts = 0;
const aiSandbox = {
  window: { setTimeout, clearTimeout }, URL, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout, Date: retry.sandbox.Date,
  console: { warn: () => {} }, fetch: async () => { providerAttempts++; throw new Error('Synthetic provider failure'); }
};
vm.createContext(aiSandbox);
vm.runInContext(fs.readFileSync(new URL('../js/meeow-ai.js', import.meta.url), 'utf8'), aiSandbox);
const ai = aiSandbox.window.Meeow.ai;
ai.configure({ getSettings: () => ({ apiKey: 'fixture-only', baseUrl: 'https://mock.invalid', model: 'mock' }),
  ThinkingLevel: { LOW: 'low' }, activeAIRequestId: { value: null }, apiRetryModal: {}, addLog: () => {}, showToast: () => {} });
retry.sandbox.callAI = ai.callAI; retry.sandbox.AIRequestCancelledError = ai.AIRequestCancelledError;
retry.send('retry lifecycle'); retry.setClock(retry.current().generationDueAt);
for (const [index, delay] of [60_000, 180_000, 480_000].entries()) {
  const attemptAt = retry.now().getTime(); await retry.tick(); await settle();
  assert.equal(providerAttempts, index + 1, retry.current().lastError); assert.equal(retry.current().attemptCount, index + 1);
  assert.equal(retry.current().status, 'retryable'); assert.equal(retry.getPhoneReplyControlState('a').state, 'retry');
  assert.equal(new Date(retry.current().retryAt).getTime() - attemptAt, delay);
  for (let i = 0; i < 10; i++) await retry.tick(); assert.equal(providerAttempts, index + 1);
  retry.setClock(new Date(retry.current().retryAt).getTime() - 1); await retry.tick(); assert.equal(providerAttempts, index + 1);
  retry.setClock(retry.current().retryAt);
}
await retry.tick(); await settle();
assert.equal(providerAttempts, 4); assert.equal(retry.current().attemptCount, 4); assert.equal(retry.current().status, 'failed');
assert.equal(retry.getPhoneReplyControlState('a').state, 'failed');
for (let i = 0; i < 20; i++) { retry.setClock(retry.now().getTime() + 60_000); await retry.tick(); }
assert.equal(providerAttempts, 4, 'terminal failure is never automatically requested again');
assert.equal(aiSandbox.window.Meeow.ai !== undefined, true);
retry.send('later valid work'); retry.setClock(retry.user.phoneData.replyOpportunities[1].generationDueAt);
retry.sandbox.callAI = () => Promise.resolve({ messages: ['后续批次仍然可以回复。'] });
await retry.tick(); await settle(); await retry.tick();
assert.equal(retry.user.phoneData.replyOpportunities[1].status, 'completed'); assert.equal(retry.current().status, 'failed');

// Persistence failure and disposal cannot dispatch or create a tight timer loop.
const claimSaveFail = makeM2(); claimSaveFail.send('claim save fails'); claimSaveFail.setClock(claimSaveFail.current().generationDueAt);
claimSaveFail.setSaveSteps([false]); await claimSaveFail.tick();
assert.equal(claimSaveFail.requests.length, 0); assert.equal(claimSaveFail.current().status, 'scheduled');
assert.ok([...claimSaveFail.timers.values()].every(timer => timer.delay >= 30_000));
const disposed = makeM2(); disposed.send('disposed'); disposed.setClock(disposed.current().generationDueAt);
disposed.sandbox.statusRefreshDisposed = true; await disposed.tick(); assert.equal(disposed.requests.length, 0);

{
// M3 checks what the model receives, not subjective prose quality.
// Use the real shared prompt builder and the unchanged production validator.
const qualitySandbox = {
  cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
  getCanonicalCatId: String, getInteractionHolidayContext: () => '',
  buildResidentConversationKnowledgeContext: (id, options) => {
    assert.equal(id, 'a'); assert.equal(options.channel, 'phone-reply');
    assert.equal(options.intentionalConversation, true); assert.equal(options.hasOtherResidentOutput, false);
    assert.deepEqual(Array.from(options.frozenSnapshots, item => item.text), ['AUTHORIZED KNOWLEDGE']);
    return { prompt: 'AUTHORIZED KNOWLEDGE' };
  },
  user: { currentStatus: 'UNSAFE GLOBAL STATUS', chat: 'OTHER PRIVATE CHAT' },
  cats: { value: [{ id: 'b', innerVoice: 'OTHER PRIVATE INNER VOICE', relationship: 'OTHER PRIVATE RELATIONSHIP' }] },
  callAI: () => { throw new Error('Prompt projection must not call a provider'); }
};
vm.createContext(qualitySandbox);
vm.runInContext(`
  ${section('const parsePhoneChatReplyEnvelope', 'const validatePhoneReplyKnowledgeDisclosures')}
  ${section('const formatFrozenPhoneReplyThread', 'const stablePhoneReplyNumber')}
  globalThis.quality = { formatFrozenPhoneReplyThread, buildPhoneReplyGenerationTask,
    parsePhoneChatReplyEnvelope, validatePhoneChatReplyPayload };
`, qualitySandbox);
const q = qualitySandbox.quality;
const qualityOpportunity = {
  contactId: 'a', sourceMessageIds: ['q-user-2', 'q-user-1'],
  phoneResidentContextText: 'AUTHORIZED OWN PROFILE', episodicMemoryContextText: 'AUTHORIZED LONG-TERM MEMORY',
  phoneUserContextText: 'PUBLIC IDENTITY', phoneHallName: 'Hall', knowledgeScopeFrozen: true,
  knowledgeFactSnapshots: [{ text: 'AUTHORIZED KNOWLEDGE' }],
  threadContextMessages: [
    row('q-old-user', 'user', '上周的剪辑话题。', time.toISOString()),
    row('q-old-resident', 'assistant', '我记得你说过片头。', time.toISOString()),
    row('q-old-user-2', 'user', '今天先不谈片头。', time.toISOString()),
    row('q-before-1', 'assistant', '我这边忙完了。', time.toISOString()),
    row('q-before-2', 'assistant', '你今天怎么样？', time.toISOString()),
    row('q-user-1', 'user', '糟透了，剪辑软件还崩了两次。', time.toISOString()),
    row('q-user-2', 'user', '你觉得我该先停一下吗？', time.toISOString(), { quotedMsg: { sender: 'A', content: '引用信息仍然保留' } })
  ]
};
const qualityBefore = JSON.stringify(qualityOpportunity);
// Frozen packets are read-only; no reordering, refreezing, widening or persistence.
const freezeQualityInput = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeQualityInput); Object.freeze(value); }
  return value;
};
freezeQualityInput(qualityOpportunity);
const packet = q.formatFrozenPhoneReplyThread(qualityOpportunity, 'A');
const prompt = q.buildPhoneReplyGenerationTask(qualityOpportunity, 'A');
const awaiting = packet.slice(packet.indexOf('[USER MESSAGES AWAITING REPLY'), packet.indexOf('[PREVIOUS RESIDENT TURN]'));
const previous = packet.slice(packet.indexOf('[PREVIOUS RESIDENT TURN]'), packet.indexOf('[RECENT THREAD CONTEXT'));
const background = packet.slice(packet.indexOf('[RECENT THREAD CONTEXT'));
assert.ok(awaiting.includes('糟透了，剪辑软件还崩了两次。'));
assert.ok(awaiting.indexOf('糟透了') < awaiting.indexOf('你觉得我该先停一下吗？'), 'canonical packet order beats source ID array order');
assert.ok(awaiting.includes('（回复 A：引用信息仍然保留）'));
assert.ok(previous.includes('我这边忙完了。')); assert.ok(previous.includes('你今天怎么样？'));
assert.ok(previous.indexOf('我这边忙完了。') < previous.indexOf('你今天怎么样？'));
assert.ok(!previous.includes('糟透了')); assert.ok(!awaiting.includes('你今天怎么样？'));
assert.ok(background.includes('上周的剪辑话题。')); assert.ok(background.includes('我记得你说过片头。'));
assert.ok(!background.includes('你今天怎么样？')); assert.ok(!background.includes('糟透了'));
for (const message of qualityOpportunity.threadContextMessages) {
  assert.equal(packet.split(message.content).length - 1, 1, 'each frozen message body appears once');
}
assert.equal(JSON.stringify(qualityOpportunity), qualityBefore);
const noPrevious = q.formatFrozenPhoneReplyThread({ sourceMessageIds: ['only-user'], threadContextMessages: [
  row('only-user', 'user', '只有这一条。', time.toISOString())
] }, 'A');
assert.ok(noPrevious.includes('(no previous resident turn in frozen packet)'));
assert.ok(!noPrevious.includes('A:'));
const noSource = q.formatFrozenPhoneReplyThread({ sourceMessageIds: [], threadContextMessages: [
  row('unclaimed', 'user', '不是待回复消息。', time.toISOString())
] }, 'A');
assert.ok(noSource.includes('(no awaiting message in frozen packet)'));
assert.ok(noSource.indexOf('不是待回复消息。') > noSource.indexOf('[RECENT THREAD CONTEXT'));
assert.ok(prompt.indexOf('[IMMEDIATE PHONE THREAD]') < prompt.indexOf('AUTHORIZED LONG-TERM MEMORY'));
assert.ok(prompt.includes(packet));
for (const contract of [
  'REPLY turn continuing an existing private conversation',
  'primary authority for what to answer', 'Respond specifically to the current user turn first',
  'address direct questions and requests', 'one conversational beat forward',
  'Treat consecutive awaiting messages as one conversational turn',
  'Avoid a generic acknowledgement-only or paraphrase-only default',
  'Allow natural topic endings', 'Use the existing personality and relationship context for HOW',
  'do not require every reply to end with a question', 'One concise bubble is valid',
  'Do not force extra bubbles or length'
]) assert.ok(prompt.includes(contract), contract);
assert.doesNotMatch(prompt, /12[–-]180|at least \d|minimum (?:bubble|length)|must (?:end|finish).*question/i);
for (const authorized of ['AUTHORIZED OWN PROFILE', 'AUTHORIZED LONG-TERM MEMORY', 'AUTHORIZED KNOWLEDGE', 'PUBLIC IDENTITY']) {
  assert.ok(prompt.includes(authorized));
}
for (const privateText of ['UNSAFE GLOBAL STATUS', 'OTHER PRIVATE CHAT', 'OTHER PRIVATE INNER VOICE', 'OTHER PRIVATE RELATIONSHIP']) {
  assert.ok(!prompt.includes(privateText));
}
assert.ok(prompt.includes('Do not use the current Homepage Direct USER action'));
assert.ok(prompt.includes('This task must not influence activeCat'));
assert.match(directSource, /buildPhoneReplyGenerationTask\(claimedPhoneOpportunity,/);
assert.match(section('const runPhoneReplyOpportunity', 'const reconcilePhoneReplyOpportunities'), /buildPhoneReplyGenerationTask\(opportunity,/);
assert.match(section('const runPhoneReplyOpportunity', 'const reconcilePhoneReplyOpportunities'), /callAI\(prompt, CORE_ROLEPLAY_PROMPT, 500,/);

// Mock outputs prove schema compatibility only: no new minimum, lexical
// quality rejection, forced question, or forced extra bubble.
assert.equal(q.validatePhoneChatReplyPayload(JSON.stringify({ messages: ['嗯。'], timingHint: 'normal' })), true);
const multiBubble = { messages: ['两次？那今天确实够折腾。', '要是存档还在，我会先停一下。', '先别跟它较劲。'], timingHint: 'quick' };
assert.equal(q.validatePhoneChatReplyPayload(JSON.stringify(multiBubble)), true);
assert.deepEqual(Array.from(q.parsePhoneChatReplyEnvelope(JSON.stringify(multiBubble)).messages), multiBubble.messages);
assert.equal(q.validatePhoneChatReplyPayload({ messages: ['一', '二', '三', '四'] }), true);
assert.notEqual(q.validatePhoneChatReplyPayload({ messages: [] }), true);
assert.notEqual(q.validatePhoneChatReplyPayload({ messages: ['一', '二', '三', '四', '五'] }), true);
assert.notEqual(q.validatePhoneChatReplyPayload({ messages: ['长'.repeat(111)] }), true);
assert.notEqual(q.validatePhoneChatReplyPayload({ messages: ['长'.repeat(110), '长'.repeat(110), '长'] }), true);
assert.notEqual(q.validatePhoneChatReplyPayload({ messages: ['【转身看向你】'] }), true);

}

console.log(JSON.stringify({
  fixture: 'phone-reply-generation-delivery-v2',
  status: 'PASS',
  checks: [
    'pending-generation', 'due-time-generation', 'preclaim-batching', 'postclaim-lane',
    'thread-freeze', 'single-winner-claim', 'claim-persistence', 'same-resident-only',
    'logical-channel-isolation', 'soft-sidecar', 'token-guard', 'program-delivery-timing',
    'generated-before-delivery', 'rollback-quarantine', 'local-exact-once-delivery',
    'phone-presence-exclusion', 'manual-ui', 'callAI-budget',
    'M1-canonical-order', 'M1-cross-day', 'M1-live-archive-dedupe', 'M1-contact-privacy',
    'M1-source-integrity', 'M1-batching-freeze', 'M1-completion-isolation', 'M1-terminal-head', 'M1-send-persistence',
    'M2-stable-timing', 'M2-zero-send-AI', 'M2-due-CAS', 'M2-reload-overdue', 'M2-sidecar-race',
    'M2-lane-order', 'M2-no-double-delay', 'M2-waiting-states', 'M2-provider-attempts-exactly-four', 'M2-privacy',
    'M3-labeled-current-turn', 'M3-previous-resident-turn', 'M3-batched-order', 'M3-thread-priority',
    'M3-specific-one-beat-contract', 'M3-no-forced-question-length', 'M3-short-multi-schema', 'M3-frozen-privacy'
  ]
}));
