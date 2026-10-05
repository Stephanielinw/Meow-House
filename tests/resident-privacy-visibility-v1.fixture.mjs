import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute production boundaries with synthetic data only; no storage or provider.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const slice = (start, end) => {
    const from = html.indexOf(start), to = html.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `Missing production boundary: ${start}`);
    return html.slice(from, to);
};
const cleanText = value => String(value || '').trim();
const day = '2026-10-05';
const hall = { id: 'greek', name: 'Test Hall' };
const user = { nickname: 'PUBLIC USER', job: 'PUBLIC ROLE', currentStatus: 'LEGACY PRIVATE STATUS',
    todos: [], schedule: [], deadlines: [], missionReports: [], mailbox: [] };
const makeResident = (id, name) => ({ id, name, hallId: hall.id, prompt: `${name} OWN PROFILE`,
    todayInteractions: [], chatHistory: [], logs: [], diary: [], episodicMemories: [], travelogues: [] });
const owner = makeResident('greek-telemachus', 'Telemachus');
const other = makeResident('greek-zagreus', 'Zagreus');
const privateText = { status: '私聊状态甲', chat: 'PRIVATE CHAT SENTINEL', voice: 'PRIVATE INNER VOICE', relationship: 'PRIVATE RELATIONSHIP DETAIL' };
let providerCalls = 0;
const sandbox = { window: {}, console, user, cleanText, tempUserStatus: { value: user.currentStatus },
    truncateMemoryText: (value, length) => String(value || '').slice(0, length),
    getOperationalDate: date => date, getLocalDateKey: () => day, getOperationalDayKey: () => day,
    getDateContext: () => 'PUBLIC DATE', buildAuthoritativeUserIdentityContext: () => 'PUBLIC USER IDENTITY',
    addLog: () => {}, showToast: () => {}, parseLogicalDate: value => new Date(value), attachCharacterUserRecord: () => {},
    getCurrentTimeStr: () => '10:00', getResidentForm: () => 'CAT', getResidentPhysicalHallId: () => '',
    userChatAt: `${day}T10:00:00.000Z`, directEpisode: { id: 'private-homepage-episode' }, isReRoll: false, isItemUse: false,
    sendingCat: owner, cats: { value: [owner, other] }, halls: { value: [hall] }, currentHall: { value: hall },
    phoneIdentities: { value: { [other.id]: { name: other.name } } }, exploreState: { active: false },
    isFocusing: { value: false }, focusCats: { value: [] }, isInteracting: { value: false }, selectedCat: { value: null },
    sameCatId: (a, b) => String(a) === String(b), getPhoneChatHistory: () => [], projectPhonePresenceDirectInteractions: () => [],
    buildStructuredPersonalityContext: cat => `${cat.name} OWN PERSONALITY`, isResidentAway: () => false,
    callAI: () => { providerCalls++; throw new Error('No provider calls allowed'); } };
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../js/meeow-memory.js', import.meta.url), 'utf8'), sandbox);
vm.runInContext(`
    ${slice('const setUserCurrentStatus =', 'const applyHomepageHumanFormRequest =')}
    ${slice('const applySuccessfulInteractionUserStatus =', 'const setContentScrollTop =')}
    ${slice('const updateUserStatus =', 'const submitSharedScene =')}
    ${slice('const makeTimedRecord =', 'const appendMonitorEvent =')}
    ${slice('const buildOwnerDailyContext =', 'const recordMatchesOperationalDay =')}
    ${slice('const buildStatusSyncUserContext =', 'const getStatusSyncDeltaTier =')}
    ${slice('const getUserRealLifeContext =', '// Mail is a whole-house system:')}
    ${slice('const compactPhonePresenceText =', 'const getPhonePresenceCandidates =')}
    ${slice('const buildPhonePresenceSafeContext =', 'const parsePhonePresenceResponse =')}
    globalThis.boundary = { setUserCurrentStatus, getSharedUserCurrentStatus, buildHomepagePrivateUserStatusContext,
        applySuccessfulInteractionUserStatus, updateUserStatus, buildOwnerDailyContext, buildStatusSyncUserContext,
        getUserRealLifeContext, buildPhonePresenceSafeContext };`, sandbox);
const boundary = sandbox.boundary;
const memory = sandbox.window.Meeow.memory;
memory.configure({ cleanText, getCats: () => [owner, other], getHalls: () => [hall], getCurrentHall: () => hall,
    getUser: () => user, getDateContext: () => 'PUBLIC DATE', getOperationalDayKey: () => day,
    getPreviousOperationalDayKey: () => '2026-10-04', getResidentPublicName: cat => cat.name,
    getResidentForm: () => 'CAT', describeResidentForm: () => 'CAT', buildOwnerDailyContext: boundary.buildOwnerDailyContext });
const sharedContexts = () => [boundary.buildOwnerDailyContext(), boundary.buildOwnerDailyContext('compact'),
    boundary.buildOwnerDailyContext('reader'), memory.buildCatMemoryContext(other, { compact: true }),
    boundary.buildStatusSyncUserContext(), boundary.getUserRealLifeContext(), boundary.getUserRealLifeContext({ profile: 'homepage' }),
    boundary.buildPhonePresenceSafeContext(other)];
const assertAbsent = text => sharedContexts().forEach(context => assert.equal(context.includes(text), false, context));
const json = value => JSON.stringify(value);

// D: an unchanged old value is UI-compatible, never implicitly public.
assert.equal(boundary.getSharedUserCurrentStatus(), '');
assertAbsent(user.currentStatus);
assert.equal(user.currentStatus, 'LEGACY PRIVATE STATUS');

// C: the actual manual UI setter still publishes explicit public status.
sandbox.tempUserStatus.value = 'PUBLIC MANUAL STATUS';
await boundary.updateUserStatus();
assert.equal(boundary.getSharedUserCurrentStatus(), 'PUBLIC MANUAL STATUS');
assert.equal(user.currentStatusProvenance.source, 'manual');
assert.equal(user.currentStatusProvenance.value, user.currentStatus);
sharedContexts().forEach(context => assert.ok(context.includes(user.currentStatus), context));

// A/B/E: execute the real accepted homepage publication, preserving local continuity.
const priorGlobal = json(user);
sandbox.payload = { activeCat: { reply: 'OWN ACCEPTED REPLY', innerVoice: privateText.voice, userStatus: privateText.status } };
owner.chatHistory.push({ role: 'user', content: privateText.chat, at: sandbox.userChatAt });
owner.privateRelationshipDetail = privateText.relationship;
vm.runInContext(`{ const historyBundle = null;
    ${slice('const { historyGrounding: ignoredHistoryGrounding', 'completeCharacterInvitation(sendingCat, acceptedMomentReply, directEpisode);')}
}`, sandbox);
assert.equal(json(user), priorGlobal, 'Private homepage must not mutate public owner state');
assert.equal(sandbox.tempUserStatus.value, user.currentStatus);
assert.equal(owner.innerVoice, privateText.voice);
assert.equal(owner.chatHistory.at(-1).content, 'OWN ACCEPTED REPLY');
const replyRecord = owner.todayInteractions.at(-1);
assert.equal(replyRecord.privateUserStatus.value, privateText.status);
assert.equal(replyRecord.privateUserStatus.residentId, owner.id);
assert.equal(replyRecord.privateUserStatus.visibility, 'private');
assert.equal(replyRecord.privateUserStatus.authority, 'INTERPRETATION');
assert.equal(replyRecord.content.includes(privateText.status), false);
const ownContinuity = boundary.buildHomepagePrivateUserStatusContext(owner);
assert.ok(ownContinuity.includes(privateText.status));
assert.match(ownContinuity, /INTERPRETATION \/ UNVERIFIED/);
assert.match(ownContinuity, /not current public state or historical evidence/);
assert.equal(boundary.buildHomepagePrivateUserStatusContext(other), '');
Object.values(privateText).forEach(assertAbsent);
assert.ok(memory.buildCatMemoryContext(other, { compact: true }).includes('Zagreus OWN PROFILE'));
assert.ok(boundary.buildOwnerDailyContext().includes('PUBLIC USER'));

// A copied/mentioned record cannot authorize the private status for a different owner.
other.todayInteractions.push(replyRecord);
assert.equal(boundary.buildHomepagePrivateUserStatusContext(other), '');
other.todayInteractions.length = 0;

// Guardrail: storage inside a real record proves the exchange, not the generated status.
const evidence = memory.buildHistoricalEvidenceBundle(owner, { query: '你记得我说过什么吗？', dayKey: day });
assert.ok(evidence.entries.some(entry => entry.recordId === replyRecord.id && entry.kind === 'chat'));
assert.equal(evidence.entries.find(entry => entry.recordId === replyRecord.id).authority, 'HISTORICAL_FACT');
assert.equal(json(evidence).includes(privateText.status), false);
assert.equal(json(evidence).includes('privateUserStatus'), false);
const restoredOwner = JSON.parse(json(owner));
assert.equal(restoredOwner.todayInteractions[0].privateUserStatus.authority, 'INTERPRETATION');
assert.ok(boundary.buildHomepagePrivateUserStatusContext(restoredOwner).includes(privateText.status));
assert.equal(json(memory.buildHistoricalEvidenceBundle(restoredOwner, { query: '以前互动过吗？', dayKey: day })).includes(privateText.status), false);

// Every current direct writer routes through one setter. Execute each production call.
const writerCalls = [...html.matchAll(/^\s*setUserCurrentStatus\([^\n]+\);/gm)].map(match => match[0].trim());
assert.equal(writerCalls.length, 5, 'New writers must be explicitly covered here');
assert.equal((html.match(/user\.currentStatus\s*=(?!=)/g) || []).length, 1, 'No unscoped direct assignment outside the setter');
Object.assign(sandbox, { userStatus: 'SHARED AI STATUS', arrivalStatus: 'PUBLIC ARRIVAL STATUS',
    cat: { name: 'TEST VISITOR' }, targetHall: hall, endedFocusStatus: 'PRIVATE FOCUS TASK' });
const expectedWriters = [ ['shared-scene', 'private'], ['hall-arrival', 'public'], ['resident-visit', 'public'],
    ['manual', 'public'], ['focus-completion', 'private'] ];
writerCalls.forEach((call, index) => {
    boundary.setUserCurrentStatus('PRIOR PUBLIC STATUS', 'manual', 'public');
    sandbox.tempUserStatus.value = 'PUBLIC UPDATED STATUS';
    vm.runInContext(call, sandbox);
    const [source, visibility] = expectedWriters[index];
    assert.equal(user.currentStatusProvenance.source, source);
    assert.equal(user.currentStatusProvenance.visibility, visibility);
    assert.equal(user.currentStatusProvenance.value, user.currentStatus);
    assert.equal(boundary.getSharedUserCurrentStatus(), visibility === 'public' ? user.currentStatus : '');
    assert.notEqual(user.currentStatus, 'PRIOR PUBLIC STATUS');
    if (visibility === 'private') assertAbsent(user.currentStatus);
});
// Same-text writes also downgrade old PUBLIC metadata; truncation is not anonymization.
boundary.setUserCurrentStatus('PRIVATE SHORT', 'manual', 'public');
assert.equal(boundary.applySuccessfulInteractionUserStatus('PRIVATE SHORT'), true);
assert.equal(user.currentStatus, 'PRIVATE SHORT');
assert.equal(boundary.getSharedUserCurrentStatus(), '');
assertAbsent('PRIVATE SHORT');
assert.equal(boundary.applySuccessfulInteractionUserStatus(''), false);
assert.equal(boundary.getSharedUserCurrentStatus(), '');

// Invalid/unknown/mismatched metadata cannot white-list a stored private string.
for (const provenance of [undefined, null, {}, { source: 'unknown', visibility: 'public', value: 'PRIVATE VALUE' },
    { source: 'manual', visibility: 'private', value: 'PRIVATE VALUE' },
    { source: 'manual', visibility: 'public', value: 'DIFFERENT VALUE' },
    { source: 'manual', visibility: 'PUBLIC', value: 'PRIVATE VALUE' }]) {
    user.currentStatus = 'PRIVATE VALUE';
    user.currentStatusProvenance = provenance;
    assert.equal(boundary.getSharedUserCurrentStatus(), '');
    assertAbsent('PRIVATE VALUE');
    assert.equal(user.currentStatus, 'PRIVATE VALUE');
}

// The real load/import paths must not inherit this session's PUBLIC marker.
for (const name of ['parsed', 'data']) {
    const restore = html.match(new RegExp(`Object\\.assign\\(user, ${name}\\.user\\);\\s*if \\(!Object\\.hasOwn\\(${name}\\.user, 'currentStatusProvenance'\\)\\) delete user\\.currentStatusProvenance;`));
    assert.ok(restore, `Missing provenance reset on ${name} restore`);
    for (const incoming of [{ currentStatus: 'PRIOR PUBLIC STATUS' }, { currentStatus: 'IMPORTED PRIVATE' },
        { currentStatus: 'PRIVATE IMPORT', currentStatusProvenance: { source: 'manual', visibility: 'private', value: 'PRIVATE IMPORT' } },
        { currentStatus: 'PUBLIC IMPORT', currentStatusProvenance: { source: 'manual', visibility: 'public', value: 'PUBLIC IMPORT' } }]) {
        boundary.setUserCurrentStatus('PRIOR PUBLIC STATUS', 'manual', 'public');
        sandbox[name] = { user: JSON.parse(json(incoming)) };
        vm.runInContext(restore[0], sandbox);
        assert.equal(user.currentStatus, incoming.currentStatus);
        assert.equal(boundary.getSharedUserCurrentStatus(), incoming.currentStatus === 'PUBLIC IMPORT' ? 'PUBLIC IMPORT' : '');
    }
}
// Archive rollback merges only mail counters, never a status or provenance.
const mailState = slice('mailState: {', '}, witnessedSharedScenes);');
assert.doesNotMatch(mailState, /currentStatus/);
const sharedBeforeReload = boundary.getSharedUserCurrentStatus();
sandbox.user = JSON.parse(json(user));
assert.equal(boundary.getSharedUserCurrentStatus(), sharedBeforeReload);
sandbox.user = user;

// Guard all current raw AI readers, leaving raw UI/compatibility reads intact.
for (const [start, end] of [['const getUserRealLifeContext =', '// Mail is a whole-house system:'],
    ['const buildPhonePresenceSafeContext =', 'const parsePhonePresenceResponse ='],
    ['const buildStatusSyncUserContext =', 'const getStatusSyncDeltaTier ='],
    ['const buildOwnerDailyContext =', 'const recordMatchesOperationalDay ='],
    ['const directUserContext =', 'const interactionHolidayContext =']]) {
    assert.doesNotMatch(slice(start, end), /user\.currentStatus\b/, `Raw status in ${start}`);
    assert.match(slice(start, end), /getSharedUserCurrentStatus\(/);
}
assert.match(html, /privateUserContinuity = recentConversation\.text \? buildHomepagePrivateUserStatusContext\(sendingCat\) : ''/);
assert.match(html, /\$\{directUserContext\}\s*\$\{privateUserContinuity\}/);
assert.equal((html.match(/callAI\(/g) || []).length, 36);
assert.equal(providerCalls, 0);
console.log(JSON.stringify({ fixture: 'resident-privacy-visibility-v1', status: 'PASS',
    privateStatusBlocked: true, ownContinuityPreserved: true, publicStatusPreserved: true,
    writerSites: writerCalls.length, restoreSites: 2, interpretationExcludedFromHistoricalEvidence: true, providerCalls }));
