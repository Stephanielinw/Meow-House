import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const coreSource = fs.readFileSync(new URL('../js/meeow-core.js', import.meta.url), 'utf8');
const postureSource = fs.readFileSync(new URL('../js/meeow-status-posture.js', import.meta.url), 'utf8');
const storageSource = fs.readFileSync(new URL('../js/meeow-storage.js', import.meta.url), 'utf8');
const slice = (start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `production slice ${start}`);
    return source.slice(from, to);
};

const cat = { id: 'focus-a', name: 'Resident A', hallId: 'hall', currentForm: 'CAT',
    status: '正坐着看书', statusActivity: { posture: 'sitting' }, innerVoice: '我想继续看书。', diary: [] };
const logs = [];
const rawParseLogs = [];
const focusLog = { value: [] };
const voiceEntries = { value: [] };
const voiceIndex = { value: 0 };
const sandbox = vm.createContext({
    window: {}, Date, Map, Set, Math, console: { error: (...args) => rawParseLogs.push(args) },
    cat, logs, addLog: (...args) => logs.push(args),
    normalizeFormValue: value => ['CAT', 'HUMAN'].includes(value) ? value : '',
    getResidentForm: resident => resident.currentForm,
    isResidentInCuratorRoom: () => false, isResidentInHall: () => true,
    isResidentAway: () => false, getActiveAwayEpisode: () => null,
    findMapPoint: () => null, MAP_ROOM_DEFINITIONS: [], inferMapRoomFromStatus: () => 'hall-room',
    truncateMemoryText: value => String(value || ''),
    appendMonitorEvent: (resident, content, sourceName) => resident.diary.push({ content, source: sourceName }),
    focusCats: { value: [cat] }, isFocusing: { value: true }, focusSessionGeneration: { value: 1 },
    activeHallId: { value: 'hall' }, currentHall: { value: { name: 'Hall' } },
    focusAction: { value: 'reading' }, user: { nickname: 'USER' }, focusSessionForms: {},
    exploreState: { active: false }, cats: { value: [cat] },
    currentFocusLog: focusLog, focusVoiceEntries: voiceEntries, focusVoiceIndex: voiceIndex,
    currentFocusVoiceEntry: { get value() { return voiceEntries.value[voiceIndex.value] || null; } },
    getFocusSharedMomentAuthorizedParticipants: residents => residents,
    getFocusVisibleUserActionEvidence: () => [],
    buildSharedFocusSessionEvidence: () => '', buildPublicSharedPeerRelationshipLines: () => new Map(),
    buildLeanAmbientContext: () => 'resident context',
    buildResidentPublicNameContract: () => '', buildAuthoritativeUserIdentityContext: () => '',
    getInteractionHolidayContext: () => '',
    getResidentPublicName: resident => resident.name,
    validateFocusSharedMoment: moment => moment?.content ? moment : null,
    logPromptBudget: () => {}, CORE_ROLEPLAY_PROMPT: '', ThinkingLevel: { LOW: 'low' },
    getCurrentTimeStr: () => '12:00', getCatAvatarSource: () => 'avatar', playLogSound: () => {},
    responseFactory: null,
    callAI: () => sandbox.responseFactory()
});
vm.runInContext(coreSource, sandbox);
vm.runInContext(postureSource, sandbox);
sandbox.cleanText = sandbox.window.Meeow.core.cleanText;
sandbox.parseAIJSON = sandbox.window.Meeow.core.parseAIJSON;
sandbox.statusPosture = sandbox.window.Meeow.statusPosture;
vm.runInContext(`${slice('const isResidentPresentationFormCompatible', 'const appendAwayTransitionTravelogue')}
globalThis.productionPresentation = { setCatStatus, applyStatusSyncPresentation, getResidentLiveInnerVoice, isControlPlaneStatusText };`, sandbox);
sandbox.setCatStatus = sandbox.productionPresentation.setCatStatus;
vm.runInContext(`${slice('const focusTickBehavior = async', 'const startFocus')}
globalThis.productionFocusTick = focusTickBehavior;`, sandbox);

const update = (status = '正站着整理桌面', innerVoice = '我先把桌面整理好。') =>
    ({ id: cat.id, status, posture: 'standing', innerVoice });
const response = (entry, sharedMoment = null) => JSON.stringify({ residentUpdates: [entry], sharedMoment });
const presentation = () => JSON.stringify({ status: cat.status, posture: cat.statusActivity, voice: cat.innerVoice });
const snapshot = () => JSON.stringify({ presentation: presentation(), log: focusLog.value, voices: voiceEntries.value });
const run = async raw => {
    sandbox.responseFactory = () => Promise.resolve(raw);
    return sandbox.productionFocusTick();
};

assert.equal(await run(response(update(), { content: 'Resident A站在桌边，把散开的纸页整理好。' })), true);
assert.equal(cat.status, '正站着整理桌面');
assert.equal(cat.statusActivity.posture, 'standing');
assert.equal(cat.innerVoice, '我先把桌面整理好。');
assert.equal(voiceEntries.value[0].voice, cat.innerVoice);
assert.equal(focusLog.value.length, 1);

const coherent = snapshot();
for (const failing of [
    () => Promise.reject(new Error('provider failed')),
    () => Promise.resolve('{invalid json'),
    () => Promise.resolve(response(update('', 'thought'))),
    () => Promise.resolve(response(update('   ', 'thought'))),
    () => Promise.resolve(response(update('正站着整理桌面', ''))),
    () => Promise.resolve(response(update('正站着整理桌面', '   '))),
    () => Promise.resolve(response(update('正站着整理桌面', '[VOICE]'))),
    () => Promise.resolve(response(update('[STATUS]', 'thought'))),
    () => Promise.resolve(response({ ...update(), innerVoice: undefined }))
]) {
    sandbox.responseFactory = failing;
    assert.equal(await sandbox.productionFocusTick(), false);
    assert.equal(snapshot(), coherent, 'failed ticks are non-events, including repeated failures');
}
assert.ok(logs.some(([line]) => /reason=provider-error/.test(line)));
assert.ok(logs.some(([line]) => /reason=parse-error/.test(line)));
assert.ok(logs.some(([line]) => /reason=validation-error/.test(line)));
assert.equal(rawParseLogs.length, 0, 'Focus parse failure does not log raw model output');
assert.equal(source.includes('仍站在专注现场，以自己的方式陪伴馆长。'), false);
assert.equal(source.includes('仍留在专注现场，以自己的方式陪伴馆长。'), false);

assert.equal(await run(response(update('正站着望向窗外', '我听见窗外的风。'))), true,
    'optional sharedMoment may be absent');
assert.equal(focusLog.value.length, 1, 'no fabricated shared-moment log');
assert.equal(cat.innerVoice, '我听见窗外的风。');

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const beforeStale = snapshot();
let pending = deferred();
sandbox.responseFactory = () => pending.promise;
let tick = sandbox.productionFocusTick();
sandbox.isFocusing.value = false;
sandbox.focusSessionGeneration.value += 1;
pending.resolve(response(update('正站着写字', '我正在写字。')));
assert.equal(await tick, false);
assert.equal(snapshot(), beforeStale, 'ended Focus rejects late response');

sandbox.isFocusing.value = true;
sandbox.focusSessionGeneration.value += 1;
pending = deferred();
sandbox.responseFactory = () => pending.promise;
tick = sandbox.productionFocusTick();
sandbox.focusSessionGeneration.value += 1; // a replacement Focus started
pending.resolve(response(update('正站着写字', '我正在写字。')));
assert.equal(await tick, false);
assert.equal(snapshot(), beforeStale, 'superseded Focus rejects old response');

pending = deferred();
sandbox.responseFactory = () => pending.promise;
tick = sandbox.productionFocusTick();
sandbox.focusCats.value = [];
pending.resolve(response(update('正站着写字', '我正在写字。')));
assert.equal(await tick, false);
assert.equal(snapshot(), beforeStale, 'removed Focus participant rejects late response');
sandbox.focusCats.value = [cat];

const light = slice('const harassCat = async', 'const validateStatusSyncUpdates');
assert.match(light, /if \(!focusLightInteraction\) setCatStatus\(/,
    'Focus light interaction must remain a local log, not a persistent status write');
assert.match(light, /focusSessionGeneration\.value !== lightInteractionGeneration/);
assert.match(slice('const startFocus =', 'const archiveFocusReport'), /focusSessionGeneration\.value \+= 1/);
assert.match(slice('const finishFocus = async', 'const confirmSettlement'), /focusSessionGeneration\.value \+= 1/);
Object.assign(sandbox, {
    settings: { apiKey: 'fixture-key' }, selectedCat: { value: cat },
    describeResidentForm: () => 'CAT', buildCatMemoryContext: () => '',
    appendInteractionEvent: () => {}, recordFocusVisibleUserAction: () => {},
    focusMessage: { value: '' }, setTimeout: () => 0, alert: () => {}, refreshAllStatus: () => {}
});
vm.runInContext(`${light}\nglobalThis.productionFocusLightInteraction = harassCat;`, sandbox);
const beforeLightPresentation = presentation();
const beforeLightLogCount = focusLog.value.length;
sandbox.responseFactory = () => Promise.resolve(JSON.stringify({ action: '抬眼看向馆长', posture: 'sitting' }));
await sandbox.productionFocusLightInteraction();
assert.equal(presentation(), beforeLightPresentation,
    'Focus-local light interaction does not attach an old thought to new persistent status');
assert.equal(focusLog.value.length, beforeLightLogCount + 1);

vm.runInContext(`${slice('const validateStatusSyncUpdates =', 'const validateLocalPresenceDirectives =')}
globalThis.productionStatusValidator = validateStatusSyncUpdates;`, sandbox);
const sync = sandbox.productionStatusValidator;
const row = { id: cat.id, status: '正站着整理桌面', posture: 'standing', innerVoice: '我先整理好。', isOut: false };
assert.equal(sync([row], [cat.id]), true);
assert.match(sync([{ ...row, innerVoice: '' }], [cat.id]), /invalid innerVoice/);
assert.match(sync([{ ...row, innerVoice: '   ' }], [cat.id]), /invalid innerVoice/);
assert.match(sync([{ ...row, innerVoice: '[VOICE]' }], [cat.id]), /invalid innerVoice/);
assert.match(sync([{ ...row, status: '' }], [cat.id]), /invalid status/);
assert.match(sync([{ ...row, status: '   ' }], [cat.id]), /invalid status/);
assert.match(sync([{ ...row, status: '[STATUS]' }], [cat.id]), /invalid status/);
assert.equal(sync([{ ...row, status: '状态同步中', innerVoice: '' }], [cat.id]), true,
    'explicit control-plane row may carry no presentation');
const syncApplication = slice('responseEntries.forEach(update => {', 'const matched = matchedIds.size');
assert.match(syncApplication, /applyStatusSyncPresentation\(cat, update\)/);
assert.doesNotMatch(syncApplication, /cat\.innerVoice\s*=/,
    'control-plane row cannot write only a new thought');
assert.doesNotMatch(syncApplication, /cat\.lastStatusUpdateTime\s*=/,
    'control-plane row is not presentation freshness');
const beforeControl = JSON.stringify(cat);
assert.equal(sandbox.productionPresentation.applyStatusSyncPresentation(cat,
    { ...row, status: '状态同步中', innerVoice: '' }), false);
assert.equal(JSON.stringify(cat), beforeControl, 'control row cannot alter resident presentation');
assert.equal(sandbox.productionPresentation.applyStatusSyncPresentation(cat,
    { ...row, status: '正站着打扫桌面', innerVoice: '我先收好纸页。' }), true);
assert.equal(cat.status, '正站着打扫桌面');
assert.equal(cat.statusActivity.posture, 'standing');
assert.equal(cat.innerVoice, '我先收好纸页。');

vm.runInContext(`${slice('const validateMergedHomepageChatResponse =', 'const HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT')}
globalThis.productionDirectValidator = validateMergedHomepageChatResponse;`, Object.assign(sandbox, {
    hasMechanicalAppearanceRepetition: () => false,
    MECHANICAL_APPEARANCE_REPLY_ERROR: 'mechanical appearance'
}));
const direct = { activeCat: { id: cat.id, reply: '好，我来看看。', status: '正站着整理桌面', posture: 'standing',
    innerVoice: '我先把桌面整理好。', userStatus: '正在阅读' } };
assert.equal(sandbox.productionDirectValidator(JSON.stringify(direct), cat.id, '你好'), true);
assert.match(sandbox.productionDirectValidator(JSON.stringify({ activeCat: { ...direct.activeCat, innerVoice: '' } }), cat.id, '你好'), /innerVoice/);
assert.match(sandbox.productionDirectValidator(JSON.stringify({ activeCat: { ...direct.activeCat, innerVoice: '[VOICE]' } }), cat.id, '你好'), /innerVoice/);
assert.match(slice('const sendMessageInternal = async', 'const submitShopItem = async'),
    /setCatStatus\(sendingCat, status, \{ posture: activeResponse\.posture, innerVoice: voice/);

const homepageThought = slice('<!-- Inner Voice Monologue -->', '<!-- Special Invite Banner -->');
assert.match(homepageThought, /getResidentLiveInnerVoice\(selectedCat\)/);
assert.doesNotMatch(homepageThought, /selectedCat\.innerVoice/);
cat.statusPresentationForm = 'HUMAN';
assert.equal(sandbox.productionPresentation.getResidentLiveInnerVoice(cat), '',
    'incompatible stored thought is not current');
cat.statusPresentationForm = 'CAT';
assert.equal(sandbox.productionPresentation.getResidentLiveInnerVoice(cat), cat.innerVoice);

const stored = new Map();
sandbox.localStorage = { setItem: (key, value) => stored.set(key, value), getItem: key => stored.get(key) || null };
vm.runInContext(storageSource, sandbox);
sandbox.window.Meeow.storage.configure({ getState: () => ({ cats: [cat], settings: {} }), storageKey: 'fixture',
    modelStorageKey: 'model', addLog: () => {}, showToast: () => {} });
assert.equal(sandbox.window.Meeow.storage.persistNow(), true);
const restored = JSON.parse(stored.get('fixture')).cats[0];
assert.equal(restored.status, cat.status);
assert.equal(restored.statusActivity.posture, cat.statusActivity.posture);
assert.equal(restored.innerVoice, cat.innerVoice);

console.log('resident-presentation-coherence fixture passed');
