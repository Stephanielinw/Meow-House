import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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

// Required user-directed scenes are part of the hard provider envelope;
// optional ambient scenes remain soft sidecars.
const validatorStart = source.indexOf('const validateStatusSyncEnvelope');
const validatorEnd = source.indexOf('const validateOptionalHallScene', validatorStart);
const hardValidator = source.slice(validatorStart, validatorEnd);
assert.match(hardValidator, /sceneOptions\?\.sceneMode === 'user-directed'/);
assert.match(hardValidator, /sceneOptions\.sceneRequired === true/);
assert.match(hardValidator, /validateOptionalHallScene\(/);
assert.match(hardValidator, /Required Hall scene invalid:/);
assert.match(source, /HALL SCENE SOFT INVALID: mode=/);
assert.match(source, /residentUpdatesApplied=true; sceneDiscarded=true/);
assert.match(source, /hasCatReactionHumanDialogue\(content, frozenForm\)/);

// Hall scene mode is program authority. Exercise the production validator,
// rather than a fixture-local reimplementation, with only its runtime helpers
// stubbed at the boundary.
const hallSceneValidatorStart = source.indexOf('const validateOptionalHallScene');
const hallSceneValidatorEnd = source.indexOf('\n\n                const formatAwayDecisionSummary', hallSceneValidatorStart);
assert.ok(hallSceneValidatorStart >= 0 && hallSceneValidatorEnd > hallSceneValidatorStart, 'Hall scene validator must remain extractable');
const hallSceneValidatorSource = source.slice(hallSceneValidatorStart, hallSceneValidatorEnd);
for (const forbiddenEffect of ['addLog(', 'sceneOutcome', 'appendHallSceneRecord(', 'persistNow(', 'storeSharedSceneEpisodicMemories(', 'applyResidentRelationshipDeltas(', 'applySuccessfulInteractionUserStatus(', 'setHallSceneFocus(']) {
  assert.ok(!hallSceneValidatorSource.includes(forbiddenEffect), `Hall scene validation stays pure: no ${forbiddenEffect}`);
}
const hallSceneSandbox = {
  cleanText: value => typeof value === 'string' ? value.trim() : '',
  normalizeSharedSceneMemoryMeta: value => value && typeof value === 'object' ? value : null,
  normalizeResidentRelationshipDeltas: value => Array.isArray(value) ? value : [],
  cats: { value: [
    { id: 'resident-a', hallId: 'greek', currentForm: 'HUMAN' },
    { id: 'resident-b', hallId: 'greek', currentForm: 'HUMAN' }
  ] },
  getCatHallId: cat => cat?.hallId || '',
  isResidentInHall: () => true,
  isResidentInCuratorRoom: () => false,
  findMapPoint: pointId => ({ roomId: pointId === 'other-room-point' ? 'other-room' : 'shared-room' }),
  normalizeFormValue: value => ['CAT', 'HUMAN'].includes(value) ? value : '',
  getResidentForm: cat => cat?.currentForm || 'CAT',
  hasCatReactionHumanDialogue: (text, form) => form === 'CAT' && /[“”"]/.test(String(text || ''))
};
vm.createContext(hallSceneSandbox);
vm.runInContext(`${hallSceneValidatorSource}\nglobalThis.validateOptionalHallSceneForFixture = validateOptionalHallScene;`, hallSceneSandbox);
const validateHallScene = hallSceneSandbox.validateOptionalHallSceneForFixture;
const hallUpdates = [
  { id: 'resident-a', isOut: false, mapPoint: 'shared-point-a' },
  { id: 'resident-b', isOut: false, mapPoint: 'shared-point-b' }
];
const userSceneContext = {
  candidateIds: ['resident-a', 'resident-b'],
  requiredParticipantIds: ['resident-a', 'resident-b'],
  participantForms: { 'resident-a': 'HUMAN', 'resident-b': 'HUMAN' }
};
const validUserScene = {
  participantIds: ['resident-a', 'resident-b'],
  content: '窗边的晨光里，用户伸手示意，居民随即靠近并认真回应这一刻。',
  userStatus: '正与居民分享片刻',
  reactions: [
    '他认真地点头回应。',
    '他也靠近窗边安静回应。'
  ]
};
const validateUserScene = scene => validateHallScene({
  scene,
  sceneMode: 'user-directed',
  sceneContext: userSceneContext,
  updates: hallUpdates,
  requestHallId: 'greek',
  sceneRequired: true
});
const snapshot = value => JSON.stringify(value);
const purityScene = structuredClone(validUserScene);
const purityContext = structuredClone(userSceneContext);
const purityUpdates = structuredClone(hallUpdates);
const purityResidentsBefore = snapshot(hallSceneSandbox.cats.value);
const purityInputsBefore = snapshot({ purityScene, purityContext, purityUpdates });
assert.equal(validateHallScene({
  scene: purityScene,
  sceneMode: 'user-directed',
  sceneContext: purityContext,
  updates: purityUpdates,
  requestHallId: 'greek',
  sceneRequired: true
}).valid, true);
assert.equal(snapshot({ purityScene, purityContext, purityUpdates }), purityInputsBefore, 'successful scene validation is observationally pure');
assert.equal(snapshot(hallSceneSandbox.cats.value), purityResidentsBefore, 'successful scene validation does not mutate resident authority');
const invalidPurityScene = { ...structuredClone(validUserScene), reactions: ['只有一个反应。'] };
const invalidPurityBefore = snapshot(invalidPurityScene);
assert.equal(validateUserScene(invalidPurityScene).valid, false);
assert.equal(snapshot(invalidPurityScene), invalidPurityBefore, 'failed scene validation does not mutate the raw response');
assert.equal(snapshot(hallSceneSandbox.cats.value), purityResidentsBefore, 'failed scene validation does not mutate resident authority');
for (const suppliedType of [undefined, 'ambient', 'arbitrary-model-value']) {
  const scene = { ...validUserScene };
  if (suppliedType !== undefined) scene.type = suppliedType;
  const result = validateUserScene(scene);
  assert.equal(result.valid, true, `AI scene.type=${String(suppliedType)} must not control a user-directed scene`);
  assert.equal(result.scene.type, 'user-directed');
}
for (const suppliedParticipants of [undefined, [], ['resident-c'], ['resident-b', 'resident-a'], ['resident-a']]) {
  const scene = { ...validUserScene };
  if (suppliedParticipants === undefined) delete scene.participantIds;
  else scene.participantIds = suppliedParticipants;
  const result = validateUserScene(scene);
  assert.equal(result.valid, true, `AI participantIds=${JSON.stringify(suppliedParticipants)} must not control a user-directed scene`);
  assert.deepEqual([...result.scene.participantIds], ['resident-a', 'resident-b'], 'frozen participant order is authoritative');
}
const ineligibleFrozenParticipant = validateHallScene({
  scene: validUserScene,
  sceneMode: 'user-directed',
  sceneContext: { ...userSceneContext, candidateIds: ['resident-a'] },
  updates: hallUpdates,
  requestHallId: 'greek',
  sceneRequired: true
});
assert.equal(ineligibleFrozenParticipant.valid, false);
assert.equal(ineligibleFrozenParticipant.error, 'user-directed frozen participant selection includes an ineligible resident.');
const emptyFrozenSelection = validateHallScene({
  scene: validUserScene,
  sceneMode: 'user-directed',
  sceneContext: { ...userSceneContext, requiredParticipantIds: [] },
  updates: hallUpdates,
  requestHallId: 'greek',
  sceneRequired: true
});
assert.equal(emptyFrozenSelection.valid, false);
assert.equal(emptyFrozenSelection.error, 'user-directed scene requires a non-empty frozen participant selection.');

const normalizedUserReactions = validateUserScene(validUserScene);
assert.deepEqual(JSON.parse(JSON.stringify(normalizedUserReactions.scene.reactions)), [
  { id: 'resident-a', content: '他认真地点头回应。' },
  { id: 'resident-b', content: '他也靠近窗边安静回应。' }
], 'reaction contents bind to frozen participant IDs in frozen order');
const wrongReactionCount = validateUserScene({ ...validUserScene, reactions: ['只有一个反应。'] });
assert.equal(wrongReactionCount.valid, false);
assert.equal(wrongReactionCount.error, 'user-directed scene reaction count mismatch: expected=2; received=1.');
const emptyUserReaction = validateUserScene({ ...validUserScene, reactions: ['', validUserScene.reactions[1]] });
assert.equal(emptyUserReaction.valid, false);
assert.equal(emptyUserReaction.error, 'user-directed scene reaction at index=0 is empty.');
const nonChineseUserReaction = validateUserScene({ ...validUserScene, reactions: ['nods quietly', validUserScene.reactions[1]] });
assert.equal(nonChineseUserReaction.valid, false);
assert.equal(nonChineseUserReaction.error, 'user-directed scene reaction at index=0 must contain Simplified Chinese.');
const frozenCatDialogue = validateHallScene({
  scene: { ...validUserScene, reactions: ['他说“你好”。', validUserScene.reactions[1]] },
  sceneMode: 'user-directed',
  sceneContext: { ...userSceneContext, participantForms: { 'resident-a': 'CAT', 'resident-b': 'HUMAN' } },
  updates: hallUpdates,
  requestHallId: 'greek',
  sceneRequired: true
});
assert.equal(frozenCatDialogue.valid, false, 'dialogue that violates frozen CAT anatomy remains invalid');
assert.equal(frozenCatDialogue.error, 'CAT-form participant resident-a has quoted human dialogue.');

const ambientSceneContext = {
  physicalParticipantIds: ['resident-a', 'resident-b'],
  participantForms: { 'resident-a': 'HUMAN', 'resident-b': 'HUMAN' }
};
const validAmbientScene = {
  participantIds: ['resident-a', 'resident-b'],
  content: '两位居民在同一扇窗前停下脚步，彼此交换目光后安静地并肩观察庭院。',
  reactions: [
    { id: 'resident-a', content: '他侧过脸安静回应。' },
    { id: 'resident-b', content: '他轻轻点头留在窗边。' }
  ]
};
for (const suppliedType of [undefined, 'user-directed', 'arbitrary-model-value']) {
  const scene = { ...validAmbientScene };
  if (suppliedType !== undefined) scene.type = suppliedType;
  const result = validateHallScene({
    scene,
    sceneMode: 'ambient',
    sceneContext: ambientSceneContext,
    updates: hallUpdates,
    requestHallId: 'greek'
  });
  assert.equal(result.valid, true, `AI scene.type=${String(suppliedType)} must not control an ambient scene`);
  assert.equal(result.scene.type, 'ambient');
}
assert.equal(validateHallScene({
  scene: { ...validAmbientScene, participantIds: ['resident-a'], reactions: validAmbientScene.reactions.slice(0, 1) },
  sceneMode: 'ambient',
  sceneContext: ambientSceneContext,
  updates: hallUpdates,
  requestHallId: 'greek'
}).valid, false, 'ambient scenes still require at least two participants');
assert.equal(validateHallScene({
  scene: { ...validAmbientScene, participantIds: undefined },
  sceneMode: 'ambient',
  sceneContext: ambientSceneContext,
  updates: hallUpdates,
  requestHallId: 'greek'
}).valid, false, 'ambient scenes still require AI-proposed participant IDs');
const ambientBlankReactionId = validateHallScene({
  scene: { ...validAmbientScene, reactions: [{ id: '', content: '他安静回应。' }, validAmbientScene.reactions[1]] },
  sceneMode: 'ambient', sceneContext: ambientSceneContext, updates: hallUpdates, requestHallId: 'greek'
});
assert.equal(ambientBlankReactionId.error, 'ambient scene reaction at index=0 has a missing or blank ID.');
const ambientDuplicateReactionId = validateHallScene({
  scene: { ...validAmbientScene, reactions: [validAmbientScene.reactions[0], { id: 'resident-a', content: '他再次回应。' }] },
  sceneMode: 'ambient', sceneContext: ambientSceneContext, updates: hallUpdates, requestHallId: 'greek'
});
assert.equal(ambientDuplicateReactionId.error, 'ambient scene reaction has duplicate participant ID=resident-a.');
const ambientEmptyReaction = validateHallScene({
  scene: { ...validAmbientScene, reactions: [{ id: 'resident-a', content: '' }, validAmbientScene.reactions[1]] },
  sceneMode: 'ambient', sceneContext: ambientSceneContext, updates: hallUpdates, requestHallId: 'greek'
});
assert.equal(ambientEmptyReaction.error, 'ambient scene reaction for participant ID=resident-a is empty.');
const ambientNonChineseReaction = validateHallScene({
  scene: { ...validAmbientScene, reactions: [{ id: 'resident-a', content: 'nods' }, validAmbientScene.reactions[1]] },
  sceneMode: 'ambient', sceneContext: ambientSceneContext, updates: hallUpdates, requestHallId: 'greek'
});
assert.equal(ambientNonChineseReaction.error, 'ambient scene reaction for participant ID=resident-a must contain Simplified Chinese.');
const ambientMissingCoverage = validateHallScene({
  scene: { ...validAmbientScene, reactions: [validAmbientScene.reactions[0]] },
  sceneMode: 'ambient', sceneContext: ambientSceneContext, updates: hallUpdates, requestHallId: 'greek'
});
assert.equal(ambientMissingCoverage.error, 'ambient scene reactions are missing participant IDs=[resident-b].');
const ambientUnexpectedCoverage = validateHallScene({
  scene: { ...validAmbientScene, reactions: [...validAmbientScene.reactions, { id: 'resident-c', content: '他从远处回应。' }] },
  sceneMode: 'ambient', sceneContext: ambientSceneContext, updates: hallUpdates, requestHallId: 'greek'
});
assert.equal(ambientUnexpectedCoverage.error, 'ambient scene reactions include unexpected participant IDs=[resident-c].');
assert.equal(validateUserScene({ ...validUserScene, reactions: [] }).valid, false, 'required reactions remain enforced');
assert.equal(validateUserScene({ ...validUserScene, userStatus: '' }).valid, false, 'required USER status remains enforced');
assert.equal(validateHallScene({
  scene: validUserScene,
  sceneMode: 'user-directed',
  sceneContext: userSceneContext,
  updates: [hallUpdates[0], { ...hallUpdates[1], mapPoint: 'other-room-point' }],
  requestHallId: 'greek',
  sceneRequired: true
}).valid, false, 'frozen user-directed participants must still share one room');
assert.equal(validateHallScene({
  scene: validAmbientScene,
  sceneMode: 'ambient',
  sceneContext: ambientSceneContext,
  updates: [hallUpdates[0], { ...hallUpdates[1], mapPoint: 'other-room-point' }],
  requestHallId: 'greek'
}).valid, false, 'same-room validation remains enforced');

const hardEnvelopeSandbox = {
  parseAIJSON: JSON.parse,
  validateStatusSyncUpdates: () => true,
  validateLocalPresenceDirectives: () => true,
  validateOptionalHallScene: validateHallScene
};
vm.createContext(hardEnvelopeSandbox);
vm.runInContext(`${hardValidator}\nglobalThis.validateStatusSyncEnvelopeForFixture = validateStatusSyncEnvelope;`, hardEnvelopeSandbox);
const validateHardEnvelope = hardEnvelopeSandbox.validateStatusSyncEnvelopeForFixture;
const requiredSceneOptions = {
  sceneMode: 'user-directed',
  sceneRequired: true,
  sceneContext: userSceneContext,
  requestHallId: 'greek'
};
assert.equal(validateHardEnvelope(JSON.stringify({ updates: hallUpdates, awayPlans: [], scene: validUserScene }), ['resident-a', 'resident-b'], {}, {}, requiredSceneOptions), true);
const hardFailure = validateHardEnvelope(JSON.stringify({ updates: hallUpdates, awayPlans: [], scene: { ...validUserScene, reactions: ['只有一个反应。'] } }), ['resident-a', 'resident-b'], {}, {}, requiredSceneOptions);
assert.equal(hardFailure, 'Required Hall scene invalid: user-directed scene reaction count mismatch: expected=2; received=1.');
let responseDerivedMutations = 0;
const acceptEnvelopeThenMutate = content => {
  const validation = validateHardEnvelope(content, ['resident-a', 'resident-b'], {}, {}, requiredSceneOptions);
  if (validation !== true) return validation;
  responseDerivedMutations += 1;
  return true;
};
assert.equal(acceptEnvelopeThenMutate(JSON.stringify({ updates: hallUpdates, awayPlans: [], scene: { ...validUserScene, reactions: ['只有一个反应。'] } })), hardFailure);
assert.equal(responseDerivedMutations, 0, 'a rejected required scene cannot enter the response-derived mutation phase');
assert.equal(acceptEnvelopeThenMutate(JSON.stringify({ updates: hallUpdates, awayPlans: [], scene: validUserScene })), true);
assert.equal(responseDerivedMutations, 1, 'an accepted required scene may enter the response-derived mutation phase once');
assert.equal(validateHardEnvelope(JSON.stringify({ updates: hallUpdates, awayPlans: [], scene: { ...validAmbientScene, reactions: [] } }), ['resident-a', 'resident-b'], {}, {}, {
  sceneMode: 'ambient', sceneRequired: false, sceneContext: ambientSceneContext, requestHallId: 'greek'
}), true, 'malformed ambient sidecars do not hard-fail the Status envelope');
assert.match(aiSource, /if \(typeof validation === 'string'\) throw new Error\(validation\)/, 'validation error strings enter the existing provider retry path');
assert.doesNotMatch(source, /scene type must be user-directed/);
assert.doesNotMatch(source, /scene requires 1\+ unique participant IDs/);

const submitSharedSceneStart = source.indexOf('const submitSharedScene = async');
const submitSharedSceneEnd = source.indexOf('// --- EXPLORE SYSTEM METHODS ---', submitSharedSceneStart);
const submitSharedSceneSource = source.slice(submitSharedSceneStart, submitSharedSceneEnd);
assert.match(submitSharedSceneSource, /sceneMode: 'user-directed'/);
assert.match(submitSharedSceneSource, /sceneRequired: true/);
assert.ok(submitSharedSceneSource.includes('label: `USER-DIRECTED HALL SCENE · ${requestHall.name}`'));
assert.ok(submitSharedSceneSource.includes('HALL SCENE REQUEST: hall=${requestHallId}; mode=user-directed; participants=[${selectedIds.join(\', \')}]'));

const hallSceneApplyStart = source.indexOf('let appliedSceneRecord = null;');
const hallSceneApplyEnd = source.indexOf('commitFridgeNoteReactionOpportunities', hallSceneApplyStart);
const hallSceneApplySource = source.slice(hallSceneApplyStart, hallSceneApplyEnd);
assert.match(hallSceneApplySource, /sceneMode === 'ambient' && hasUnsafeFormSlice/);
assert.doesNotMatch(hallSceneApplySource, /validateOptionalHallScene\(/, 'late persistence consumes the prevalidated normalized scene');
assert.match(hallSceneApplySource, /type: sceneToApply\.scene\.type/);
assert.match(hallSceneApplySource, /userText: sceneMode === 'user-directed' \? String\(sceneContext\?\.rawUserText \|\| ''\) : null/);
assert.match(hallSceneApplySource, /storeSharedSceneEpisodicMemories\(record, sceneToApply\.scene\.memoryMeta\)/);
assert.match(hallSceneApplySource, /applyResidentRelationshipDeltas\(record, sceneToApply\.scene\.relationshipDeltas\)/);
assert.match(hallSceneApplySource, /setHallSceneFocus\(record\)/);
assert.match(hallSceneApplySource, /applySuccessfulInteractionUserStatus\(sceneToApply\.scene\.userStatus\)/);
assert.match(hallSceneApplySource, /HALL SCENE WRITTEN:/);
assert.doesNotMatch(hallSceneApplySource, /receivedType=/, 'soft-invalid diagnostics no longer imply AI scene.type authority');

const refreshImplementationStart = source.indexOf('const _refreshAllStatus = async');
const localReconciliationIndex = source.indexOf('reconcileAwayEpisodes(now)', refreshImplementationStart);
const providerRequestIndex = source.indexOf('const res = await callAI(', refreshImplementationStart);
const defensiveSceneValidationIndex = source.indexOf('sceneValidation = validateOptionalHallScene({', providerRequestIndex);
const firstResponseMutationIndex = source.indexOf('const formCompatibility = classifyFormDirectiveCompatibility', defensiveSceneValidationIndex);
assert.ok(localReconciliationIndex > refreshImplementationStart && localReconciliationIndex < providerRequestIndex, 'independent local Away reconciliation stays before the provider request');
assert.ok(providerRequestIndex < defensiveSceneValidationIndex, 'accepted response is defensively normalized immediately after parsing');
assert.ok(defensiveSceneValidationIndex < firstResponseMutationIndex, 'required-scene validation precedes form and resident response mutation');
assert.match(source.slice(defensiveSceneValidationIndex, firstResponseMutationIndex), /HALL SCENE REQUIRED VALIDATION FAILED:[\s\S]*return false;/);

const aiValidationIndex = aiSource.indexOf("if (typeof request.validateResponse === 'function')");
const aiSuccessLogIndex = aiSource.indexOf('SUCCESS (round', aiValidationIndex);
assert.ok(aiValidationIndex >= 0 && aiSuccessLogIndex > aiValidationIndex, 'API success is logged only after hard response validation');
assert.ok(source.includes('scene.reactions must be a content-only string array in frozen participant order'));
assert.ok(source.includes('Do not return resident IDs or reaction objects; program code binds each string to its frozen participant ID.'));

assert.match(source, /if \(!isBackgroundStatusSync && requestOptions\.sceneMode !== 'user-directed'\)/);
const shouldShowGenericStatusToast = (isBackground, sceneMode) => !isBackground && sceneMode !== 'user-directed';
assert.equal(shouldShowGenericStatusToast(false, 'user-directed'), false, 'composer feedback owns its loading toast');
assert.equal(shouldShowGenericStatusToast(false, undefined), true, 'ordinary foreground Status Sync retains its loading toast');
assert.equal(shouldShowGenericStatusToast(false, 'ambient'), true, 'foreground ambient Status Sync retains its loading toast');

const queueHelperStart = source.indexOf('const queueUserDirectedHallSceneRefresh');
const queueHelperEnd = source.indexOf('\n\n                const refreshAllStatus', queueHelperStart);
assert.ok(queueHelperStart >= 0 && queueHelperEnd > queueHelperStart, 'composer queue helper must remain extractable');
const queueSandbox = {};
vm.createContext(queueSandbox);
vm.runInContext(`${source.slice(queueHelperStart, queueHelperEnd)}\nglobalThis.queueForFixture = queueUserDirectedHallSceneRefresh;`, queueSandbox);
const queueComposerAfter = queueSandbox.queueForFixture;
const deferred = () => {
  let resolve;
  let reject;
  const task = new Promise((resolveTask, rejectTask) => { resolve = resolveTask; reject = rejectTask; });
  return { task, resolve, reject };
};
const unrelatedRefresh = deferred();
let composerStarts = 0;
const queuedComposer = queueComposerAfter(unrelatedRefresh.task, () => {
  composerStarts += 1;
  return 'composer-result';
});
assert.equal(composerStarts, 0, 'an unrelated in-flight refresh cannot satisfy or start the composer early');
unrelatedRefresh.resolve('unrelated-status-result');
assert.equal(await queuedComposer, 'composer-result');
assert.equal(composerStarts, 1, 'the composer starts exactly once after the prior task settles');

const laneStarts = [];
const laneDeferred = new Map();
let activeLaneEntry = null;
const runLaneRequest = (name, composer = false) => {
  if (activeLaneEntry) {
    if (composer) return queueComposerAfter(activeLaneEntry.task, () => runLaneRequest(name, true));
    return activeLaneEntry.task;
  }
  const pending = deferred();
  const entry = { name, task: pending.task };
  activeLaneEntry = entry;
  laneDeferred.set(name, pending);
  laneStarts.push(name);
  pending.task.then(
    () => { if (activeLaneEntry === entry) activeLaneEntry = null; },
    () => { if (activeLaneEntry === entry) activeLaneEntry = null; }
  );
  return pending.task;
};
const unrelatedLaneTask = runLaneRequest('ordinary-status');
const firstComposerTask = runLaneRequest('composer-one', true);
const secondComposerTask = runLaneRequest('composer-two', true);
laneDeferred.get('ordinary-status').resolve('ordinary-complete');
await unrelatedLaneTask;
for (let index = 0; index < 5; index += 1) await Promise.resolve();
assert.deepEqual(laneStarts, ['ordinary-status', 'composer-one'], 'only the first queued composer may start after the unrelated refresh');
laneDeferred.get('composer-one').resolve('first-scene-complete');
assert.equal(await firstComposerTask, 'first-scene-complete');
for (let index = 0; index < 5; index += 1) await Promise.resolve();
assert.deepEqual(laneStarts, ['ordinary-status', 'composer-one', 'composer-two'], 'a second composer serializes behind the first');
laneDeferred.get('composer-two').resolve('second-scene-complete');
assert.equal(await secondComposerTask, 'second-scene-complete');

const refreshWrapperStart = source.indexOf('const refreshAllStatus = (...args) =>');
const refreshWrapperEnd = source.indexOf('// Homepage Direct is intentionally foreground-only.', refreshWrapperStart);
const refreshWrapperSource = source.slice(refreshWrapperStart, refreshWrapperEnd);
assert.match(refreshWrapperSource, /requestOptions\.sceneMode === 'user-directed' && !replacesBackground/);
assert.match(refreshWrapperSource, /HALL SCENE QUEUED: hall=/);
assert.match(refreshWrapperSource, /queueUserDirectedHallSceneRefresh\(existing\.task, \(\) => refreshAllStatus\(\.\.\.queuedArgs\)\)/);
assert.match(refreshWrapperSource, /STATUS SYNC JOINED: Reusing the active status refresh/);
assert.match(refreshWrapperSource, /STATUS SYNC FOREGROUND REPLACING BACKGROUND/);
for (const frozenField of ['frozenNow', 'protectedSceneParticipantIds', 'explicitMentionIds', 'previousFocusIds', 'candidateIds', 'requiredParticipantIds', 'participantForms']) {
  assert.ok(refreshWrapperSource.includes(frozenField), `queued composer preserves ${frozenField}`);
}

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
