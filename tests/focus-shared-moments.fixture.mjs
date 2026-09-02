import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helperStart = appSource.indexOf('const buildSharedFocusSessionEvidence');
const helperEnd = appSource.indexOf('const logPromptBudget', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Focus shared-moment helpers must be present.');

const residents = [
    { id: 'a', name: 'Telemachus', humanName: 'Telemachus', currentForm: 'CAT' },
    { id: 'b', name: 'Telegonus', humanName: 'Telegonus', currentForm: 'CAT' },
    { id: 'c', name: 'Odysseus', humanName: 'Odysseus', currentForm: 'HUMAN' },
    { id: 'd', name: 'Penelope', humanName: 'Penelope', currentForm: 'HUMAN' }
];
const sandbox = {
    Date, Map, Set, RegExp, String, Array, Math, console,
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    normalizeFormValue: value => ['CAT', 'HUMAN'].includes(String(value || '').toUpperCase()) ? String(value).toUpperCase() : '',
    getResidentForm: cat => cat?.currentForm || 'CAT',
    getResidentPublicName: cat => cat?.humanName || cat?.name || '',
    stableMapIndex: (seed, length) => Array.from(String(seed)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % Math.max(1, length),
    activeHallId: { value: 'ithaca' }, focusAction: { value: 'reading' },
    focusMomentSequence: { value: 0 }, focusVisibleUserActionEvidence: { value: [] },
    isFocusing: { value: true }, user: { nickname: 'USER' }
};
vm.runInNewContext(`${appSource.slice(helperStart, helperEnd)}
globalThis.focusShared = {
  getFocusSharedMomentAuthorizedParticipants,
  buildSharedFocusSessionEvidence,
  validateFocusSharedMoment,
  recordFocusVisibleUserAction,
  getFocusVisibleUserActionEvidence
};`, sandbox, { filename: 'index.html:focus-shared-moments' });
const focusShared = sandbox.focusShared;

const options = (authorized = residents.slice(0, 3), evidence = []) => ({
    authorizedParticipants: authorized,
    allParticipants: residents,
    frozenForms: { a: 'CAT', b: 'CAT', c: 'HUMAN', d: 'HUMAN' },
    userActionEvidence: evidence
});
const moment = value => focusShared.validateFocusSharedMoment(value, options());
const assertMoment = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

const catMoment = {
    participantIds: ['a', 'b'], speakerIds: [], userActionEvidenceIds: [],
    content: 'Telemachus凑到Telegonus身边，尾巴擦过桌沿；Telegonus耳朵抖了抖，轻轻喵了一声，又在USER手边趴好。'
};
assertMoment(moment(catMoment), catMoment, 'two CAT residents may produce a physical shared beat without speech');

const oneResidentMoment = {
    participantIds: ['a'], speakerIds: [], userActionEvidenceIds: [],
    content: 'Telemachus在桌边趴了一阵，前爪慢慢往前伸，最后把下巴搁在离USER手腕很近的位置。'
};
assertMoment(moment(oneResidentMoment), oneResidentMoment, 'single-resident Focus remains a narrative moment');

const threeParticipantMoment = {
    participantIds: ['a', 'b', 'c'], speakerIds: ['c'], userActionEvidenceIds: [],
    content: 'Odysseus低声道“别踩键盘。”Telemachus和Telegonus同时停住，两个猫耳朵都朝他转了过去。'
};
assertMoment(moment(threeParticipantMoment), threeParticipantMoment, 'a three-resident mixed-form beat is valid');
assert.equal(moment({ ...threeParticipantMoment, participantIds: ['a', 'b', 'c', 'd'] }), null, 'the sidecar rejects an unauthorized fourth resident');
assert.equal(moment({ ...catMoment, participantIds: ['a', 'b', 'c'] }), null, 'participantIds are actual actors and each must be visibly named');
assert.equal(moment({ ...catMoment, content: `${catMoment.content} Penelope从门口走进来。` }), null, 'unlisted residents cannot enter the Focus scene');

assert.equal(moment({ ...catMoment, speakerIds: ['a'] }), null, 'CAT participants can never be declared human speakers');
assert.equal(moment({ ...catMoment, content: 'Telemachus说“别踩键盘。”Telegonus甩了甩尾巴，又在USER手边趴好。' }), null, 'CAT-only dialogue invalidates only the sidecar');
assertMoment(moment({
    participantIds: ['a', 'c'], speakerIds: ['c'], userActionEvidenceIds: [],
    content: 'Odysseus低声道“别踩键盘。”Telemachus的尾巴僵了一下，随后从桌角跳回USER脚边。'
}), {
    participantIds: ['a', 'c'], speakerIds: ['c'], userActionEvidenceIds: [],
    content: 'Odysseus低声道“别踩键盘。”Telemachus的尾巴僵了一下，随后从桌角跳回USER脚边。'
}, 'mixed CAT/HUMAN moments retain form-specific expression');
assert.equal(focusShared.validateFocusSharedMoment({
    participantIds: ['a', 'c'], speakerIds: ['a'], userActionEvidenceIds: [],
    content: 'Telemachus低声道“别踩键盘。”Odysseus只是看着他，尾巴轻轻垂在身侧。'
}, options([{ ...residents[0], currentForm: 'HUMAN' }, residents[2]], [])), null, 'a frozen CAT form overrides a current HUMAN form for speaker validation');

assert.equal(moment({ ...catMoment, content: 'USER伸手摸了Telemachus一下，Telegonus凑过来蹭着桌沿，耳朵轻轻抖了抖。' }), null, 'invented USER touch rejects the optional sidecar');
assert.equal(moment({ ...catMoment, content: 'Telemachus轻轻喵了一声，内心独白却藏在尾巴下面；Telegonus靠在USER手边。' }), null, 'private material is never a visible shared moment');

const evidence = { id: 'focus-user-action:1:a', publicText: 'USER刚才轻轻逗了Telemachus一下' };
const evidenceMoment = {
    participantIds: ['a'], speakerIds: [], userActionEvidenceIds: [evidence.id],
    content: 'USER刚才轻轻逗了Telemachus一下，Telemachus耳朵往后一压，又不甘心地把前爪搭回桌边。'
};
assertMoment(focusShared.validateFocusSharedMoment(evidenceMoment, options(undefined, [evidence])), evidenceMoment, 'the exact frozen harass evidence may be shown');
assert.equal(focusShared.validateFocusSharedMoment({ ...evidenceMoment, userActionEvidenceIds: [] }, options(undefined, [evidence])), null, 'a visible USER action requires its exact evidence ID');
assert.equal(focusShared.validateFocusSharedMoment({ ...evidenceMoment, userActionEvidenceIds: ['unknown'] }, options(undefined, [evidence])), null, 'unknown USER-action evidence is rejected');

const originalParticipants = JSON.stringify(residents);
const originalEvidence = JSON.stringify([evidence]);
moment(catMoment);
assert.equal(JSON.stringify(residents), originalParticipants, 'narrative validation does not mutate residents');
assert.equal(JSON.stringify([evidence]), originalEvidence, 'narrative validation does not mutate authoritative evidence');

const firstAuthorized = focusShared.getFocusSharedMomentAuthorizedParticipants(residents);
const secondAuthorized = focusShared.getFocusSharedMomentAuthorizedParticipants(residents);
const thirdAuthorized = focusShared.getFocusSharedMomentAuthorizedParticipants(residents);
assert.ok(firstAuthorized.length <= 2 && secondAuthorized.length <= 2 && thirdAuthorized.length <= 3);
assert.ok([firstAuthorized, secondAuthorized, thirdAuthorized].flat().every(cat => residents.some(allowed => allowed.id === cat.id)), 'authorization stays bounded to supplied participants');
assert.equal(focusShared.getFocusVisibleUserActionEvidence().length, 0);
focusShared.recordFocusVisibleUserAction(residents[0]);
assert.match(focusShared.getFocusVisibleUserActionEvidence()[0].publicText, /^USER刚才轻轻逗了Telemachus一下$/);

const visibleContinuity = focusShared.buildSharedFocusSessionEvidence([
    `10:00｜${catMoment.content}`,
    '10:01｜内心独白：这不该写入公共记录。',
    '10:02｜[PRIVATE] hidden Knowledge fact'
], 3, 420);
assert.match(visibleContinuity, /Telemachus凑到Telegonus/);
assert.doesNotMatch(visibleContinuity, /内心独白|PRIVATE|Knowledge/);

const focusTickStart = appSource.indexOf('const focusTickBehavior = async');
const focusTickEnd = appSource.indexOf('const startFocus', focusTickStart);
const focusTickSource = appSource.slice(focusTickStart, focusTickEnd);
assert.match(focusTickSource, /sharedMoment\.speakerIds is REQUIRED/);
assert.match(focusTickSource, /validateFocusSharedMoment/);
assert.match(focusTickSource, /if \(sharedMoment\) currentFocusLog\.value\.unshift/);
assert.match(focusTickSource, /buildSharedFocusSessionEvidence\(currentFocusLog\.value, 3, 420\)/);
assert.doesNotMatch(focusTickSource, /buildCatMemoryContext\(/);
assert.ok(focusTickSource.indexOf('const sharedMoment') < focusTickSource.indexOf('participants.forEach(cat =>'), 'an invalid optional sidecar is evaluated before, but cannot block, resident updates');
assert.doesNotMatch(focusTickSource, /sharedMoment\.(?:status|innerVoice|affinity|form|hallId|isOut)/, 'shared prose cannot supply authoritative resident fields');
assert.equal((appSource.match(/callAI\s*\(/g) || []).length, 40, 'Focus Shared Moments must add no callAI site');

console.log(JSON.stringify({
    fixture: 'focus-shared-moments',
    status: 'PASS',
    checks: ['participant-authorization', 'speaker-form-safety', 'user-passivity', 'harass-evidence', 'visible-continuity', 'no-world-mutation', 'prompt-isolation']
}));
