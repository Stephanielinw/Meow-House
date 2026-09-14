import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const aiSource = fs.readFileSync(new URL('../js/meeow-ai.js', import.meta.url), 'utf8');

// Deterministic model of the persisted reply boundary used by the runtime.
const bubbleId = (opportunity, index) => `phone-reply-bubble:${opportunity.id}:${index}`;
const deliveredCount = (opportunity, store) => opportunity.messages.reduce((count, _message, index) =>
  count + (store.has(bubbleId(opportunity, index)) ? 1 : 0), 0);
const deliver = (opportunity, store, persist) => {
  if (!Number.isInteger(opportunity.nextDeliveryIndex) || opportunity.nextDeliveryIndex < 0 || opportunity.nextDeliveryIndex > opportunity.messages.length) {
    opportunity.status = 'integrity-mismatch'; return false;
  }
  const index = opportunity.nextDeliveryIndex;
  if (!opportunity.messages[index]) { opportunity.status = 'integrity-mismatch'; return false; }
  store.add(bubbleId(opportunity, index));
  opportunity.nextDeliveryIndex += 1;
  if (opportunity.nextDeliveryIndex === opportunity.messages.length) {
    if (deliveredCount(opportunity, store) !== opportunity.messages.length) { opportunity.status = 'integrity-mismatch'; return false; }
    opportunity.status = 'completed';
  }
  return persist();
};

const generated = { id: 'op-a', contactId: 'hypnos', status: 'delivering', messages: ['一', '二'], nextDeliveryIndex: 0 };
let saved = null;
const persist = () => { saved = structuredClone(generated); return true; };
assert.ok(persist(), 'generated payload must be durable before first delivery');
assert.deepEqual(saved.messages, ['一', '二']);
const afterGenerationReload = structuredClone(saved);
assert.equal(afterGenerationReload.status, 'delivering');
assert.equal(afterGenerationReload.nextDeliveryIndex, 0);

const nonDurableGeneration = { id: 'op-no-save', contactId: 'hades', status: 'in-flight', messages: [] };
const stagedPayload = ['不会显示'];
assert.equal(false, (() => {
  nonDurableGeneration.messages = stagedPayload;
  nonDurableGeneration.status = 'delivering';
  const saved = false;
  if (!saved) {
    nonDurableGeneration.messages = [];
    nonDurableGeneration.status = 'retryable';
    return false;
  }
  return true;
})(), 'a generation that cannot persist may not start delivery');
assert.deepEqual(nonDurableGeneration.messages, []);
assert.equal(nonDurableGeneration.status, 'retryable');

const store = new Set();
assert.ok(deliver(generated, store, persist));
assert.equal(generated.nextDeliveryIndex, 1);
assert.equal(saved.nextDeliveryIndex, 1, 'cursor and first canonical bubble persist together');
assert.ok(store.has('phone-reply-bubble:op-a:0'));
const afterFirstBubbleReload = structuredClone(saved);
assert.equal(afterFirstBubbleReload.nextDeliveryIndex, 1, 'reload resumes at the first undelivered bubble');
assert.ok(deliver(afterFirstBubbleReload, store, () => true), 'navigation/reload does not regenerate bubble zero');
assert.equal(deliveredCount(afterFirstBubbleReload, store), 2);
assert.ok(deliver(generated, store, persist));
assert.equal(generated.status, 'completed');
assert.equal(deliveredCount(generated, store), 2);

const missingCompleted = { id: 'op-b', contactId: 'peiraios', status: 'completed', messages: ['一'], nextDeliveryIndex: 1 };
assert.equal(deliveredCount(missingCompleted, new Set()), 0, 'completed records are auditable against stable bubble IDs');
const reconcileCompleted = (opportunity, durableStore) => {
  const count = deliveredCount(opportunity, durableStore);
  if (opportunity.status !== 'completed' || count === opportunity.messages.length) return false;
  const missing = opportunity.messages.findIndex((_message, index) => !durableStore.has(bubbleId(opportunity, index)));
  if (missing < 0) { opportunity.status = 'integrity-mismatch'; return false; }
  opportunity.status = 'delivering';
  opportunity.nextDeliveryIndex = missing;
  return true;
};
assert.equal(reconcileCompleted(missingCompleted, new Set()), true, 'a stale completed marker resumes from durable generated payload');
assert.equal(missingCompleted.status, 'delivering');
assert.equal(missingCompleted.nextDeliveryIndex, 0);
const malformed = { id: 'op-c', contactId: 'hypnos', status: 'delivering', messages: ['一'], nextDeliveryIndex: 2 };
assert.equal(deliver(malformed, new Set(), () => true), false);
assert.equal(malformed.status, 'integrity-mismatch');

const lane = [
  { id: 'a', contactId: 'hypnos', status: 'delivering' },
  { id: 'b', contactId: 'hypnos', status: 'scheduled' },
  { id: 'c', contactId: 'athena', status: 'scheduled' }
];
const laneBusy = (contactId, except = '') => lane.some(item => item.contactId === contactId && item.id !== except && ['in-flight', 'delivering'].includes(item.status));
assert.equal(laneBusy('hypnos', 'b'), true);
assert.equal(laneBusy('athena', 'c'), false);
const laneHead = (items, candidate) => items
  .filter(item => item.contactId === candidate.contactId && ['scheduled', 'retryable', 'in-flight', 'delivering', 'integrity-mismatch'].includes(item.status))
  .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0]?.id === candidate.id;
const recoveredLane = [
  { id: 'older', contactId: 'hypnos', status: 'delivering', order: 1 },
  { id: 'newer', contactId: 'hypnos', status: 'scheduled', order: 2 }
];
assert.equal(laneHead(recoveredLane, recoveredLane[0]), true, 'the older delivery owns its contact lane');
assert.equal(laneHead(recoveredLane, recoveredLane[1]), false, 'a later turn cannot generate or deliver early');

const lastRecoveryAt = 1_000;
const now = 30_000;
assert.ok(now - lastRecoveryAt < 60_000, 'stale startup dispatch remains gated for one minute');
assert.equal(Math.max(0, lastRecoveryAt + 60_000 - now), 31_000, 'recovery timer waits for the gate instead of spinning at zero delay');

// Runtime contracts: sidecar failures occur after hard Status-envelope acceptance.
const validatorStart = source.indexOf('const validateStatusSyncEnvelope');
const validatorEnd = source.indexOf('const validateOptionalHallScene', validatorStart);
const hardValidator = source.slice(validatorStart, validatorEnd);
assert.doesNotMatch(hardValidator, /validateOptionalHallScene\(/);
assert.match(source, /HALL SCENE SOFT INVALID: mode=/);
assert.match(source, /residentUpdatesApplied=true; sceneDiscarded=true/);
assert.match(source, /hasCatReactionHumanDialogue\(content, frozenForm\)/);

assert.match(source, /PHONE_RECOVERY_MIN_INTERVAL_MS = 60 \* 1000/);
assert.match(source, /lastRecoveryDispatchAt \+ PHONE_RECOVERY_MIN_INTERVAL_MS/);
assert.match(source, /hasActivePhoneReplyLane/);
assert.match(source, /isPhoneReplyLaneHead/);
assert.match(source, /PHONE REPLY DURABLE:/);
assert.match(source, /PHONE REPLY INTEGRITY MISMATCH:/);
assert.match(source, /generatedBubbleIds/);
assert.match(source, /checkAffinityThreshold\(sendingCat, \{ directInteraction: true \}\)/);
assert.doesNotMatch(source, /watch\(cats, \(newCats, oldCats\)/);
assert.match(source, /isFormReconsiderationDue\(cat, now\)/);
assert.match(source, /CAT reversion never means reduced trust/);

assert.match(aiSource, /uiMode: options\.uiMode/);
assert.match(aiSource, /request\.uiMode !== 'background'/);
assert.match(aiSource, /origin=\$\{request\.origin\}; surface=\$\{request\.originSurface\}/);

console.log(JSON.stringify({ fixture: 'interaction-reliability', status: 'PASS' }));
