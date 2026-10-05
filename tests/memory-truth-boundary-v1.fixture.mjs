import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

// In-memory records only: no storage, browser, provider, or real user data.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../js/meeow-memory.js', import.meta.url), 'utf8'), sandbox);
vm.runInContext(readFileSync(new URL('../js/meeow-core.js', import.meta.url), 'utf8'), sandbox);
vm.runInContext(readFileSync(new URL('../js/meeow-status-posture.js', import.meta.url), 'utf8'), sandbox);
const memory = sandbox.window.Meeow.memory;
const cleanText = value => String(value || '').trim();
const owner = { id: 'resident-a', name: 'A', hallId: 'test-hall', episodicMemories: [], todayInteractions: [] };
const other = { id: 'resident-b', name: 'B' };
const day = '2026-10-04';
const at = '2026-10-04T10:00:00.000Z';
memory.configure({ cleanText, getCats: () => [owner, other], getResidentPublicName: cat => cat.name,
    getOperationalDayKey: date => date.toISOString().slice(0, 10) });
const slice = (start, end) => {
    const from = html.indexOf(start), to = html.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `Missing production boundary: ${start}`);
    return html.slice(from, to);
};
Object.assign(sandbox, { cleanText, cats: { value: [owner, other] }, getResidentPublicName: cat => cat.name,
    getHomepageGroundedResidentIds: () => [], appendEpisodicMemory: memory.appendEpisodicMemory,
    stableEpisodicSourceHash: () => 'fixture-only', addLog: () => {}, parseAIJSON: sandbox.window.Meeow.core.parseAIJSON,
    statusPosture: sandbox.window.Meeow.statusPosture, hasMechanicalAppearanceRepetition: () => false });
vm.runInContext(`${slice('const getHomepageMemorySource =', 'const normalizeSharedSceneMemoryMeta =')}
    ${slice('const validateMergedHomepageChatResponse =', 'const HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT =')}
    ${slice('const HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT =', 'const getHomepageDirectUserLedResidentIds =')}
    globalThis.boundary = { storeHomepageEpisodicMemory, validateMergedHomepageChatResponse, buildHomepageDirectRecentConversation };`, sandbox);
const { storeHomepageEpisodicMemory, validateMergedHomepageChatResponse, buildHomepageDirectRecentConversation } = sandbox.boundary;
const bundle = (query, options = {}) => memory.buildHistoricalEvidenceBundle(owner,
    { query, dayKey: day, previousDayKey: '2026-10-03', ...options });
const response = (mode = 'not_historical', evidenceIds = []) => ({ id: owner.id,
    reply: '那天你在窗边送给我围巾，我从那一刻开始喜欢你。', status: '站在原处', posture: 'standing',
    innerVoice: '【回忆那个没有发生过的场景。】', userStatus: '交流', memoryCandidate: { summary: 'bad' },
    historyGrounding: { mode, evidenceIds } });
const acceptSource = slice('const { historyGrounding: ignoredHistoryGrounding', 'const reply = cleanText(activeResponse.reply);');
const accept = (active, records = null) => {
    sandbox.replyInput = active;
    sandbox.replyHistory = records;
    vm.runInContext(`{ const payload = { activeCat: replyInput }; const historyBundle = replyHistory;
        ${acceptSource} globalThis.accepted = activeResponse; }`, sandbox);
    return sandbox.accepted;
};
const validate = (active, records, acceptedPosture) => validateMergedHomepageChatResponse(JSON.stringify({ activeCat: active }), owner.id, '', [], records, acceptedPosture);
const ground = (mode, evidenceIds = []) => ({ mode, evidenceIds });

// A/G: a generated claim can survive as interpretation, never as event proof.
const userRecord = { id: 'question', at, type: 'chat-user', source: 'detail-chat', content: '你是什么时候开始喜欢我的？', dateKey: day };
const invented = storeHomepageEpisodicMemory({ owner, userText: userRecord.content, reply: response().reply,
    chatAt: at, interactionRecord: userRecord, candidate: { summary: '那天你在窗边送给我围巾，我从那一刻开始对你产生了好感。',
        relatedResidentIds: [], tags: ['围巾'], importance: 3, emotionalWeight: 2,
        authority: 'HISTORICAL_FACT', sourceRecordId: 'invented-source' } });
assert.equal(invented.authority, 'INTERPRETATION');
assert.equal(invented.sourceRecordId, userRecord.id);
assert.equal(bundle('什么时候开始喜欢我？').entries.length, 0);
const continuity = memory.buildEpisodicMemoryContext(owner, { userInput: '围巾', userSharedOnly: true,
    retrievalV2: true, authorityBoundary: true, maxEntries: 3, maxChars: 1200 });
assert.match(continuity.text, /INTERPRETATION \/ UNVERIFIED/);
assert.equal(continuity.snapshots[0].authority, 'INTERPRETATION');
assert.equal(JSON.parse(JSON.stringify(owner)).episodicMemories[0].authority, 'INTERPRETATION');

// B/C: raw records prove the exchange, never the moon claim contained in it.
owner.todayInteractions = [
    { id: 'moon-statement', at, dateKey: day, source: 'detail-chat', type: 'chat-user', content: '我们昨天去了月球。' },
    { id: 'assistant-fiction', at, dateKey: day, source: 'detail-chat', type: 'chat-reply', content: response().reply },
    { id: 'pending-item', at, dateKey: day, source: 'detail-chat', type: 'item', itemId: 'toy' },
    { id: 'accepted-item', at, dateKey: day, source: 'item-interaction', type: 'item', itemId: 'toy', itemName: '玩具',
        reactionAuthority: 'program-semantic', affinityDelta: 2, content: '一段生成的过去故事' },
    { id: 'food', at, dateKey: day, source: 'food-interaction', type: 'item', itemId: 'food' },
    { id: 'other-owner', at, source: 'detail-chat', type: 'chat-user', residentId: other.id, content: 'other' },
    { id: 'no-date', source: 'detail-chat', type: 'chat-user', content: 'missing' }
];
const chats = bundle('你记得我说过什么吗？');
assert.ok(chats.entries.some(entry => entry.id === 'interaction:moon-statement' && entry.at === at && entry.type === 'chat-user'));
assert.match(chats.text, /USER_STATEMENT/);
assert.doesNotMatch(chats.text, /窗边|围巾|生成的过去故事|pending-item|other-owner|no-date/);
const statementAnswer = { ...response('supported', ['interaction:moon-statement']),
    reply: '记得，你说过我们昨天去了月球。不过这只是你告诉我的事，我没有能确认这趟旅行的记录。',
    innerVoice: '【我要分清他说过的话和实际记录。】' };
assert.equal(validate(statementAnswer, chats), true);
const stated = accept(statementAnswer, chats);
assert.equal(stated.reply, statementAnswer.reply);
assert.equal(stated.innerVoice, statementAnswer.innerVoice);
assert.equal('historyGrounding' in stated, false);
assert.match(stated.reply, /你说过.*月球/);
assert.match(stated.reply, /只是你告诉我的事/);
assert.equal(stated.memoryCandidate, null);
assert.doesNotMatch(stated.innerVoice, /窗边|围巾/);
assert.equal(stated.status, '站在原处');

// D: legacy fields (even a claimed authority) are not self-certifying evidence.
const legacy = { id: 'legacy', ownerId: owner.id, sourceKey: 'scene:legacy', sourceType: 'shared-scene',
    eventAt: at, createdAt: at, summary: '在窗边一起旅行回来，某个生成摘要描述了过去没有发生的事情。',
    participantIds: [owner.id, 'USER'], tags: ['窗边'], importance: 3, emotionalWeight: 2, knowledgeMode: 'witnessed' };
owner.episodicMemories.push(legacy, { ...legacy, id: 'claimed', sourceKey: 'claimed', authority: 'HISTORICAL_FACT', sourceRecordId: 'real-looking' });
const before = JSON.stringify(owner.episodicMemories);
const legacyContext = memory.buildEpisodicMemoryContext(owner, { userInput: '窗边', userSharedOnly: true,
    authorityBoundary: true, maxEntries: 12, maxChars: 3600 });
assert.equal(JSON.stringify(owner.episodicMemories), before);
assert.ok(legacyContext.snapshots.every(entry => entry.authority === 'INTERPRETATION' && entry.verification === 'UNVERIFIED'));
assert.equal(bundle('记得旅行吗？').entries.some(entry => entry.recordId === 'legacy'), false);

// E/F: all cited IDs must match this request, owner, event type and day.
const first = bundle('When did you first start liking me?');
assert.equal(first.intent.historical, true);
assert.equal(first.intent.unsupported, true);
assert.notEqual(validate(response('not_historical'), first), true);
assert.notEqual(validate(response('supported', ['interaction:moon-statement']), first), true);
const uncertainAnswer = { ...response('insufficient_evidence'),
    reply: '……我还真说不出是哪一个瞬间。好像等我意识到的时候，已经变成这样了。',
    innerVoice: '【我说不清起点，但现在愿意认真听。】' };
assert.equal(validate(uncertainAnswer, first), true);
const uncertain = accept(uncertainAnswer, first);
assert.equal(uncertain.reply, uncertainAnswer.reply);
assert.equal(uncertain.innerVoice, uncertainAnswer.innerVoice);
assert.notEqual(validate(response('insufficient_evidence'), first), true);
assert.notEqual(validate({ ...uncertainAnswer, reply: '我说不清，但就是那次你在窗边陪我的时候。' }, first), true);
assert.notEqual(validate({ ...uncertainAnswer, reply: '我说不清，但有一次你在窗边陪我。' }, first), true);
assert.notEqual(validate({ ...uncertainAnswer, innerVoice: '【我记得你那次在窗边陪我。】' }, first), true);
assert.doesNotMatch(uncertain.reply + uncertain.innerVoice, /窗边|围巾/);
assert.equal(uncertain.memoryCandidate, null);
assert.doesNotMatch(memory.makeHistoricalFallback({ form: 'CAT', status: '站在原处', posture: 'standing' }).reply, /我|“/);
assert.equal(bundle('Remember when we went to the moon yesterday?').intent.kind, null);
for (const ids of [['fiction-id'], ['interaction:other-owner'], ['interaction:accepted-item'],
    ['interaction:moon-statement', 'interaction:moon-statement']]) assert.notEqual(validate(response('supported', ids), chats), true);
assert.notEqual(validate(response('supported', ['interaction:moon-statement']), bundle('你昨天说过什么？')), true);
assert.notEqual(validate(response('supported', ['interaction:moon-statement']), bundle('我们什么时候聊过围巾？')), true);
assert.notEqual(validate(response('supported', ['interaction:moon-statement']), bundle('上周聊过什么？')), true);
assert.equal(validate(response('supported', ['interaction:moon-statement']), bundle('你记得我说过月球吗？')), true);
assert.equal(bundle('Why were you upset with me before?').intent.historical, true);
assert.notEqual(validate(response('supported', ['interaction:moon-statement']), bundle('记得聊过什么吗？', { interactions: [] })), true);
assert.notEqual(validate({ ...response(), historyGrounding: undefined }, chats), true);
assert.notEqual(validate(response('unknown'), chats), true);
assert.notEqual(validate(response('insufficient_evidence', ['interaction:moon-statement']), first), true);
assert.notEqual(validate(response('supported', ['interaction:moon-statement']), { ...chats, ownerId: other.id }), true);

// Structured focus/moment facts survive; summaries, participants' text and
// display consequences do not become factual prose.
const structured = bundle('昨天发生了什么？', {
    focusReports: [{ id: 'focus-a', archivedAt: '2026-10-03T10:00:00Z', participants: [{ id: owner.id }],
        duration: 600, status: 'COMPLETED', affinityDelta: 10, summary: '虚构过去', logs: ['虚构日志'] },
        { id: 'focus-other', archivedAt: at, participants: [{ id: other.id }], duration: 600, status: 'COMPLETED' }],
    momentRecords: [{ recordId: 'moment-a', at: '2026-10-03T11:00:00Z', dayKey: '2026-10-03',
        participantIds: [owner.id], type: 'thought', narrative: '虚构内心', consequences: ['虚构后果'] }]
});
assert.doesNotMatch(structured.text, /虚构/);
const grounded = { ...response('supported', ['focus:focus-a', 'moment:moment-a']),
    reply: '昨天我们完成了十分钟的专注，后来还留下一段心事记录。我记得的是这些实实在在留下来的片段。',
    innerVoice: '【那十分钟值得好好记着。】' };
assert.equal(validate(grounded, structured), true);
assert.equal(accept(grounded, structured).reply, grounded.reply);
assert.equal(accept(grounded, structured).innerVoice, grounded.innerVoice);
assert.equal(accept(grounded, structured).memoryCandidate, null);

// Bounds, conflicting IDs, current-turn exclusion and unchanged raw data.
const large = bundle('记得聊过什么吗？', { interactions: Array.from({ length: 40 }, (_, i) => ({
    id: `large-${i}`, at, source: 'detail-chat', type: 'chat-user', content: '长'.repeat(800) })) });
assert.ok(large.entries.length <= 12 && large.text.length <= 3600);
assert.ok(Object.isFrozen(large) && Object.isFrozen(large.entries) && large.entries.every(Object.isFrozen));
assert.equal(bundle('记得聊过什么吗？', { excludeRecordId: 'moon-statement' }).entries.some(e => e.recordId === 'moon-statement'), false);
assert.equal(bundle('记得聊过什么吗？', { interactions: [owner.todayInteractions[0],
    { ...owner.todayInteractions[0], content: 'conflicting' }] }).entries.length, 0);
assert.notEqual(chats.fingerprint, first.fingerprint);
const normal = response();
assert.equal(validate(normal, null), true);
assert.equal(accept(normal).reply, normal.reply);
owner.chatHistory = [{ role: 'user', content: '我们昨天去了月球。', at }, { role: 'assistant', content: '虚构过去', at }];
owner.lastInteractionTimestamp = Date.parse(at);
const recent = buildHomepageDirectRecentConversation(owner, '', Date.parse(at) + 100);
assert.match(recent.text, /USER_STATEMENT/);
assert.match(recent.text, /GENERATED EXPRESSION; NOT HISTORICAL EVIDENCE/);

// A/B: normal routing and schema are independent of any model metadata.
const routeSource = slice('const historyIntent = window.Meeow.memory.classifyHistoricalIntent', 'const requestHallId = sendingCat.hallId');
const shapeSource = slice('const historyContract = historyBundle ?', 'const outputContract =');
let bundleCalls = 0;
const realBuildBundle = memory.buildHistoricalEvidenceBundle;
memory.buildHistoricalEvidenceBundle = (...args) => { bundleCalls++; return realBuildBundle(...args); };
Object.assign(sandbox, { sendingCat: owner, userInteractionRecord: null, user: { missionReports: [] },
    currentMomentHistory: () => [], archivedMomentHistory: () => [], getOperationalDayKey: () => day,
    getPreviousOperationalDayKey: () => '2026-10-03', phoneReplyTask: '', directFacts: { posture: 'standing' } });
const routed = message => {
    sandbox.msg = message;
    vm.runInContext(`{ ${routeSource} ${shapeSource}
        globalThis.routeResult = { historyIntent, historyBundle, historyContract, outputShape }; }`, sandbox);
    return sandbox.routeResult;
};
const normalQueries = [
    '“Telemachus?” 思索了一下，在他面前蹲下。“你能...变回人形和我说说话吗？”',
    '你能变回人形和我说说话吗？', '我现在有点难过，你能陪我聊聊吗？', '你记得我吗？',
    '昨天很累，今天陪我聊聊吧。', '你能像以前那样陪我说说话吗？', '第一次用这个玩具，陪我玩吧。',
    'Do you remember me?', 'I was tired yesterday. Can you talk with me now?'
];
const normalAnswer = { ...response(), reply: '它抬眼认真望向你，耳尖随你的声音轻轻一动，接住了你想交谈的请求。',
    innerVoice: '【我听见你的请求了。】', memoryCandidate: null };
for (const query of normalQueries) {
    const beforeCalls = bundleCalls;
    const request = routed(query);
    assert.equal(request.historyIntent.historical, false, query);
    assert.equal(request.historyBundle, null);
    assert.equal(request.historyContract, '');
    assert.equal(bundleCalls, beforeCalls, 'Normal request must not build evidence');
    assert.equal('historyGrounding' in JSON.parse(request.outputShape).activeCat, false);
    for (const extra of [undefined, null, 'malformed', 42, [], {},
        { mode: 'supported', evidenceIds: ['invented-id'] }, { mode: 'unknown', evidenceIds: 'wrong' }]) {
        const active = { ...normalAnswer, historyGrounding: extra };
        assert.equal(validate(active, null), true);
        assert.equal(accept(active).reply, active.reply);
        assert.equal(accept(active).innerVoice, active.innerVoice);
        assert.equal('historyGrounding' in accept(active), false);
    }
}
// A hostile extra field must not even invoke the historical validator.
const realHistoryValidator = memory.validateHistoricalResponse;
memory.validateHistoricalResponse = () => { throw new Error('History validator reached from normal chat'); };
assert.equal(validate({ ...normalAnswer, historyGrounding: { mode: 'supported', evidenceIds: ['fake'] } }, null), true);
memory.validateHistoricalResponse = realHistoryValidator;
for (const query of ['你第一次什么时候开始喜欢我的？', '昨天发生了什么？', '你记得我们第一次聊围巾吗？', '之前为什么生我的气？']) {
    const beforeCalls = bundleCalls;
    const request = routed(query);
    assert.equal(request.historyIntent.historical, true, query);
    assert.equal(bundleCalls, beforeCalls + 1);
    assert.ok(request.historyBundle);
    assert.match(request.historyContract, /established voice/);
    assert.equal('historyGrounding' in JSON.parse(request.outputShape).activeCat, true);
}
memory.buildHistoricalEvidenceBundle = realBuildBundle;

// Execute the actual request validator and failure branch, not a replacement.
const direct = slice('const historyIntent = window.Meeow.memory.classifyHistoricalIntent', 'if (shouldSendFriendRequest)');
assert.match(direct, /historyEvidence: historyBundle\?\.fingerprint \|\| null/);
assert.match(direct, /maxAttempts: 1/);
assert.match(direct, /if \(!isCurrentDirect\(\)\) return;/);
assert.doesNotMatch(direct, /projectHistoricalResponse|它留意着你的举动，安静地陪在原处/);
assert.match(direct, /candidate: activeResponse\.memoryCandidate/);
assert.match(direct, /const activeResponse = historyBundle \?/);
assert.equal((direct.match(/validateMergedHomepageChatResponse\([^\n]*historyBundle, directFacts\.posture\)/g) || []).length, 2);
Object.assign(sandbox, { frozenActiveForm: 'HUMAN', historyBundle: first,
    directFacts: { posture: 'standing', innerVoice: '【可能含有旧生成叙述。】' },
    recentUserAppearanceContext: [], msg: '什么时候第一次喜欢我？', isCurrentDirect: () => true });
sandbox.window.Meeow.residentCopy = { statusFor: () => '站在原处' };
const callbackStart = direct.indexOf('validateResponse: content => {');
const callbackEnd = direct.indexOf('\n                            }', callbackStart);
vm.runInContext(`globalThis.requestValidator = ${direct.slice(callbackStart + 'validateResponse: '.length, callbackEnd)}\n};`, sandbox);
const catchStart = direct.indexOf('if (!isCurrentDirect() || error?.code');
const catchEnd = direct.indexOf('\n                        }\n                        if (!isCurrentDirect())', catchStart);
assert.ok(catchStart >= 0 && catchEnd > catchStart);
vm.runInContext(`globalThis.failRequest = error => { let responseRaw; ${direct.slice(catchStart, catchEnd)} return responseRaw; };`, sandbox);
const fallbackRaw = sandbox.failRequest(new Error('Invalid historyGrounding contract.'));
const fallback = JSON.parse(fallbackRaw).activeCat;
assert.equal(validate(fallback, first), true);
assert.match(fallback.reply, /没法.*确认/);
assert.doesNotMatch(fallback.innerVoice, /旧生成叙述/);
assert.equal(sandbox.requestValidator(fallbackRaw), true);
sandbox.historyBundle = null;
assert.throws(() => sandbox.failRequest(new Error('Provider unavailable')), /Provider unavailable/);
assert.equal(sandbox.requestValidator(JSON.stringify({ activeCat: normalAnswer })), true);
sandbox.isCurrentDirect = () => false;
assert.notEqual(sandbox.requestValidator(JSON.stringify({ activeCat: normalAnswer })), true);
const cancelled = Object.assign(new Error('cancelled'), { code: 'AI_REQUEST_CANCELLED' });
assert.throws(() => sandbox.failRequest(cancelled), /cancelled/);
assert.match(slice('const sendMessageInternal =', 'const hasShopAuthoringDraft ='), /content: "\(信号中断，详情请查看任务日志\)"/);
// Reply contract rescue A-F: compare the actual GitHub validator and parser.
const githubRef = 'de7532b721254d481fa22be627ed8fd10053ddbd';
const repo = new URL('../', import.meta.url);
const github = execFileSync('git', ['show', `${githubRef}:index.html`], { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const githubSlice = (start, end) => github.slice(github.indexOf(start), github.indexOf(end, github.indexOf(start)));
const reference = { parseAIJSON: sandbox.window.Meeow.core.parseAIJSON, cleanText,
    statusPosture: sandbox.window.Meeow.statusPosture, hasMechanicalAppearanceRepetition: () => false };
vm.createContext(reference);
vm.runInContext(`${githubSlice('const validateMergedHomepageChatResponse =', 'const HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT =')}
    globalThis.validate = validateMergedHomepageChatResponse;`, reference);
assert.equal(execFileSync('git', ['show', `${githubRef}:js/meeow-core.js`], { cwd: repo, encoding: 'utf8' }),
    readFileSync(new URL('../js/meeow-core.js', import.meta.url), 'utf8'), 'Parser did not become stricter');
const ordinary = { ...normalAnswer };
delete ordinary.historyGrounding;
const raw = active => JSON.stringify({ activeCat: active });
assert.equal(reference.validate(raw(ordinary), owner.id, ''), true);
assert.equal(validate(ordinary, null, 'standing'), true);
// Missing, empty or non-string reply is a real schema failure in BOTH versions.
// No original human provider body was retained: do not guess an alternate shape.
for (const reply of [undefined, '', '   ', null, { text: 'response' }, ['response']]) {
    const active = { ...ordinary, reply };
    const error = 'Homepage Chat activeCat 缺少有效 reply。';
    assert.equal(reference.validate(raw(active), owner.id, ''), error);
    assert.equal(validate(active, null, 'standing'), error);
}
const actionProse = { ...ordinary, status: '坐在面前认真听着',
    reply: '它站起身，望了你一眼，又蹲下来，挪近一些坐下，认真接住你想交谈的请求。' };
assert.notEqual(reference.validate(raw(actionProse), owner.id, ''), true);
assert.equal(validate(actionProse, null, 'standing'), true, 'Narration is not a world-state command');
assert.equal(validate({ ...actionProse, posture: 'sitting' }, null, 'standing'),
    'Generated response conflicts with accepted posture.');
assert.notEqual(validate({ ...ordinary, posture: 'invented-pose' }, null, 'standing'), true);
sandbox.isCurrentDirect = () => true;
sandbox.historyBundle = null;
sandbox.msg = '你能变回人形和我说说话吗？';
assert.equal(routed(sandbox.msg).historyIntent.historical, false);
assert.equal(JSON.parse(routed(sandbox.msg).outputShape).activeCat.posture, 'standing');
assert.equal(sandbox.requestValidator(raw(actionProse)), true);
assert.equal(sandbox.requestValidator(raw({ ...actionProse, posture: 'sitting' })),
    'Generated response conflicts with accepted posture.');
assert.equal(sandbox.requestValidator(raw({ ...ordinary, reply: '' })), 'Homepage Chat activeCat 缺少有效 reply。');
assert.equal(accept(actionProse).reply, actionProse.reply);
// Execute the actual success publication through the reply event boundary. AI
// status/posture/form cannot mutate the resident even when extra fields appear.
owner.currentForm = 'CAT'; owner.status = '正在站着'; owner.statusActivity = { posture: 'standing' };
owner.mapRoom = 'living'; owner.mapPoint = { x: 123, y: 456 };
const worldBefore = JSON.stringify([owner.currentForm, owner.status, owner.statusActivity, owner.mapRoom, owner.mapPoint]);
Object.assign(sandbox, { responseRaw: raw({ ...actionProse, form: 'HUMAN', isHuman: true }),
    applySuccessfulInteractionUserStatus: () => {}, getCurrentTimeStr: () => '10:00',
    getResidentForm: cat => cat.currentForm, getResidentPhysicalHallId: () => 'test-hall',
    appendInteractionEvent: () => ({ id: 'reply-event' }), userChatAt: at,
    directEpisode: { id: 'test-episode' }, isReRoll: false, isItemUse: false,
    setCatStatus: () => { throw new Error('AI must not write posture'); },
    setResidentForm: () => { throw new Error('AI must not authorize form'); } });
vm.runInContext(`{ ${slice('const payload = parseAIJSON(responseRaw);\n                        // Extra model metadata', 'completeCharacterInvitation(sendingCat, acceptedMomentReply, directEpisode);')} }`, sandbox);
assert.equal(owner.chatHistory.at(-1).content, actionProse.reply);
assert.equal(JSON.stringify([owner.currentForm, owner.status, owner.statusActivity, owner.mapRoom, owner.mapPoint]), worldBefore);
assert.equal(slice('const setResidentForm =', 'const parseCanonicalFormDecision ='),
    githubSlice('const setResidentForm =', 'const parseCanonicalFormDecision ='), 'Existing form transition unchanged');
const output = slice('const outputContract = `[OUTPUT CONTRACT]', 'const prompt = `${interactionContract}');
assert.match(output, /reply is required and must be a non-empty string/);
assert.match(output, /80–140 Chinese characters/);
assert.match(output, /echo exactly/);
assert.match(output, /CAT form/);
// Form-intent rescue A-F: run the actual Homepage function with one mock provider.
const forms = { window: { Meeow: { memory } }, console, Date,
    FORM_RECONSIDER_MIN_MS: 3 * 3600000, FORM_RECONSIDER_MAX_MS: 12 * 3600000,
    FORM_RECONSIDER_KEEP_MIN_MS: 3600000, FORM_RECONSIDER_KEEP_MAX_MS: 3 * 3600000,
    FORM_VALUES: new Set(['CAT', 'HUMAN']), firstHumanRevealInFlight: new Set(),
    terminateActiveSocialPresenceForResident: () => {}, cleanText,
    parseAIJSON: sandbox.window.Meeow.core.parseAIJSON, statusPosture: sandbox.window.Meeow.statusPosture,
    isResidentInHall: cat => cat.presence === 'HOME', isResidentAway: cat => cat.presence === 'AWAY',
    isResidentInCuratorRoom: cat => cat.presence === 'CURATOR_ROOM',
    hasMechanicalAppearanceRepetition: () => false, MECHANICAL_APPEARANCE_REPLY_ERROR: 'appearance',
    selectedCat: { value: null }, cats: { value: [] }, chatInput: { value: '' }, thinkingStates: {}, statusRefreshDisposed: false,
    halls: { value: [{ id: 'test-hall', name: 'Test' }] }, currentHall: { value: {} }, user: { missionReports: [] },
    getResidentPublicName: cat => cat.name, getCanonicalCatId: id => id,
    getCurrentTimeStr: () => '10:00', getHomepageInteractionRecord: () => null,
    claimPhoneReplyForHomepageDirect: () => null, getClaimedPhoneReplyOpportunity: () => null,
    claimCharacterInvitation: () => null, completeCharacterInvitation: () => {},
    getLeanResidentPresence: cat => cat.presence,
    buildHomepageDirectRecentConversation: () => ({ text: '', userAuthoredText: '', entries: [] }),
    getHomepageDirectUserLedResidentIds: () => [], buildUserSharedEpisodicMemoryContext: () => ({ text: '' }),
    reconcileAwayEpisodes: () => {}, buildHomepageDirectPresenceContext: () => '',
    buildAuthoritativeUserIdentityContext: () => 'USER', getInteractionHolidayContext: () => '',
    buildLeanForegroundContextParts: (cat, options) => ({ canon: 'Character canon', currentState: `Form: ${options.form}`,
        personality: 'Established personality', relationship: 'Established relationship' }),
    CORE_ROLEPLAY_PROMPT: 'Roleplay', ThinkingLevel: { LOW: 'low' },
    HOMEPAGE_DIRECT_EPISODIC_MAX_MEMORIES: 3, HOMEPAGE_DIRECT_EPISODIC_MAX_CHARS: 1200,
    applySuccessfulInteractionUserStatus: () => {}, storeHomepageEpisodicMemory: () => {},
    getResidentPhysicalHallId: () => 'test-hall', advanceActiveSocialPresenceAfterDirect: () => {},
    maybeQueueAttentionBidAfterHomepageDirect: () => {}, queueHomepageHallAmbientRefresh: () => false,
    sendFriendRequest: () => {}, triggerHumanFormEvent: () => { throw new Error('Unexpected second AI/reveal scene'); } };
const factFor = (cat, posture, form) => ({ id: cat.id, posture, form, room: cat.mapRoom, foot: cat.mapPoint });
forms.window.Meeow.residentCopy = { factFor };
let formChanges = 0, writes = 0, providerCalls = 0, storageOk = true, logs = [], budgets = [], prompts = [];
forms.persistNow = () => { writes++; return storageOk; };
forms.addLog = (message, level) => logs.push({ message, level });
forms.logPromptBudget = (label, prompt, system, parts) => budgets.push(parts);
forms.appendInteractionEvent = (cat, type, content, extra) => {
    const record = { id: `mock-event-${cat.todayInteractions.length}`, type, content, ...extra };
    cat.todayInteractions.push(record); return record;
};
forms.callAI = async (prompt, system, tokens, level, options) => {
    providerCalls++; prompts.push(prompt);
    const cat = forms.selectedCat.value;
    assert.equal(options.isCurrentGeneration(), true, 'Snapshot must reflect the accepted form');
    const activeCat = { id: cat.id, reply: cat.currentForm === 'HUMAN'
        ? '他站起身，又坐到你面前，低声说：“我在听。你想说什么？”'
        : '它站起身，又蹲下来，抬头认真望向你，轻轻叫了一声，等你接着说。',
        status: '坐在面前听着', posture: 'standing', innerVoice: '【我在认真听。】', userStatus: '交谈', memoryCandidate: null,
        formDecision: 'CAT', isHuman: false };
    const content = JSON.stringify({ activeCat });
    assert.equal(options.validateResponse(content), true, 'Narrative posture is still allowed');
    return content;
};
vm.createContext(forms);
vm.runInContext(`${slice('const parseFormTimestamp =', '// Development-only spatial proof.')}
    ${slice('const isResidentHuman =', 'const parseCanonicalFormDecision =')}
    ${slice('const authorizeFirstHumanReveal =', 'const triggerHumanFormEvent =')}
    ${slice('const validateMergedHomepageChatResponse =', 'const HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT =')}
    ${slice('const getHomepageHumanFormIntent =', 'const hasShopAuthoringDraft =')}
    globalThis.formBoundary = { getHomepageHumanFormIntent, applyHomepageHumanFormRequest,
        sendMessageInternal, getResidentForm, isResidentHuman, checkAffinityThreshold, normalizeResidentFormState, setResidentForm };`, forms);
// Wrap only to count calls; the actual setter remains the mutation implementation.
forms.recordFormChange = () => { formChanges++; };
vm.runInContext('terminateActiveSocialPresenceForResident = recordFormChange;', forms);
const formCat = overrides => ({ id: 'resident-a', name: 'Telemachus', affinity: 60, presence: 'HOME', hallId: 'test-hall',
    currentForm: 'CAT', isHuman: false, hasRevealedHumanForm: true, humanReveal: { firstRevealEventId: 'existing' },
    statusActivity: { posture: 'standing' }, mapRoom: 'living', mapPoint: { x: 123, y: 456 },
    todayInteractions: [{ id: 'previous-turn' }], chatHistory: [], ...overrides });
const fullRequest = '“Telemachus?” 思索了一下，在他面前蹲下。“你能...变回人形和我说说话吗？”';
const formInput = '你能变回人形和我说说话吗？';
for (const text of [fullRequest, formInput, '变回人形', '请变成人形和我聊聊吧', '可以用人形和我说话吗？']) {
    assert.equal(forms.formBoundary.getHomepageHumanFormIntent(text), true, text);
}
for (const text of ['你的人形是什么样的？', '以前变成人过吗？', '你上次什么时候变成人形的？',
    '如果我说“你能变回人形吗”，你会怎么回答？', '你不要变回人形', '你好，今天怎么样？']) {
    assert.equal(forms.formBoundary.getHomepageHumanFormIntent(text), false, text);
}
assert.equal(memory.classifyHistoricalIntent(fullRequest).historical, false);
assert.equal(memory.classifyHistoricalIntent('你上次什么时候变成人形的？').historical, true);
const runTurn = async (cat, message, reroll = false) => {
    forms.selectedCat.value = cat; forms.cats.value = [cat]; logs = []; budgets = []; prompts = [];
    const world = JSON.stringify([cat.mapRoom, cat.mapPoint, cat.statusActivity]);
    const beforeCalls = providerCalls;
    await forms.formBoundary.sendMessageInternal(message, false, reroll, reroll ? { at } : null);
    assert.equal(logs.some(log => log.level === 'error'), false, JSON.stringify(logs));
    assert.equal(providerCalls - beforeCalls, 1);
    assert.equal(forms.thinkingStates[cat.id], false);
    assert.equal(JSON.stringify([cat.mapRoom, cat.mapPoint, cat.statusActivity]), world);
    assert.equal(budgets[0].historyContract, '');
    assert.equal(budgets[0].historicalEvidence, '');
    assert.match(cat.chatHistory.at(-1).content, /认真|我在听/);
};
const eligible = formCat(); let beforeChanges = formChanges, beforeWrites = writes;
await runTurn(eligible, fullRequest);
assert.equal(eligible.currentForm, 'HUMAN'); assert.equal(eligible.isHuman, true);
assert.equal(formChanges - beforeChanges, 1); assert.equal(writes - beforeWrites, 1);
assert.match(prompts[0], /acceptedForm":"HUMAN"/); assert.match(prompts[0], /Form: HUMAN/);
assert.match(eligible.chatHistory.at(-1).content, /我在听/);
await runTurn(eligible, formInput);
assert.equal(formChanges - beforeChanges, 1); assert.equal(writes - beforeWrites, 1, 'Repeat is idempotent');
for (const cat of [formCat({ affinity: 49 }), formCat({ hasRevealedHumanForm: false, presence: 'CURATOR_ROOM' }),
    formCat({ hasRevealedHumanForm: false, isVisiting: true })]) {
    await runTurn(cat, formInput);
    assert.equal(cat.currentForm, 'CAT'); assert.match(prompts[0], /"outcome":"denied"/);
    assert.match(prompts[0], /otherwise do not narrate a transformation/);
}
// First reveal uses the same receipt, threshold, persistence and setter as before.
const firstReveal = formCat({ hasRevealedHumanForm: false, humanReveal: null });
beforeChanges = formChanges; beforeWrites = writes;
await runTurn(firstReveal, formInput);
assert.equal(firstReveal.currentForm, 'HUMAN'); assert.equal(firstReveal.hasRevealedHumanForm, true);
assert.match(firstReveal.humanReveal.firstRevealEventId, /^human-reveal:resident-a:/);
assert.ok(firstReveal.humanReveal.authorizedAt && firstReveal.humanReveal.revealedAt);
assert.equal(formChanges - beforeChanges, 1); assert.equal(writes - beforeWrites, 1);
// Vague/historical discussion and ordinary chat never call the form command.
for (const text of ['你的人形是什么样的？', '你好，今天怎么样？']) {
    const cat = formCat(); beforeWrites = writes;
    await runTurn(cat, text);
    assert.equal(cat.currentForm, 'CAT'); assert.equal(writes, beforeWrites);
    assert.doesNotMatch(prompts[0], /PROGRAM FORM REQUEST RESULT/);
}
const historicalCat = formCat(); beforeWrites = writes;
assert.equal(forms.formBoundary.applyHomepageHumanFormRequest(historicalCat, '你上次什么时候变成人形的？'), null);
assert.equal(writes, beforeWrites); assert.equal(historicalCat.currentForm, 'CAT');
// Storage failure restores form; never tell the request that a failed write succeeded.
storageOk = false;
for (const cat of [formCat(), formCat({ hasRevealedHumanForm: false, humanReveal: null })]) {
    const result = forms.formBoundary.applyHomepageHumanFormRequest(cat, formInput);
    assert.equal(result.acceptedForm, 'CAT'); assert.equal(result.transitioned, false);
    assert.equal(cat.currentForm, 'CAT');
}
storageOk = true;
const rerollCat = formCat(); beforeWrites = writes;
await runTurn(rerollCat, formInput, true);
assert.equal(rerollCat.currentForm, 'CAT'); assert.equal(writes, beforeWrites);
assert.doesNotMatch(prompts[0], /PROGRAM FORM REQUEST RESULT/);
// Accepted canonical form survives the next ordinary message and reload normalization.
const continuedCat = formCat();
await runTurn(continuedCat, formInput);
const callsAfterReveal = providerCalls, savesAfterReveal = writes, changesAfterReveal = formChanges;
await runTurn(continuedCat, '干嘛不说话……');
assert.equal(continuedCat.currentForm, 'HUMAN');
assert.equal(forms.formBoundary.isResidentHuman(continuedCat), true);
assert.match(prompts[0], /Form: HUMAN/);
assert.match(continuedCat.chatHistory.at(-1).content, /我在听/);
assert.equal(providerCalls, callsAfterReveal + 1);
assert.equal(writes, savesAfterReveal); assert.equal(formChanges, changesAfterReveal);
const reloadedCat = JSON.parse(JSON.stringify(continuedCat));
forms.formBoundary.normalizeResidentFormState(reloadedCat);
assert.equal(forms.formBoundary.getResidentForm(reloadedCat), 'HUMAN');
assert.equal(reloadedCat.isHuman, true);
assert.match(html, /isResidentHuman\(selectedCat\) \? '变回原形' : '拟人模式'/);
forms.formBoundary.setResidentForm(reloadedCat, 'CAT');
assert.equal(forms.formBoundary.isResidentHuman(reloadedCat), false);
assert.equal(forms.formBoundary.getResidentForm(reloadedCat), 'CAT');
// Preserve the existing Vue watcher and single update tick without form observation.
let uiTicks = 0, uiRenders = 0, formWatchCallback;
forms.watch = (_source, callback) => { formWatchCallback = callback; };
forms.nextTick = callback => { uiTicks++; return Promise.resolve().then(callback); };
forms.renderPortfolioCatVisual = () => { uiRenders++; return false; };
vm.runInContext(slice('watch(() => [currentTab.value, selectedCat.value?.id', 'const handleCatVisualEscape ='), forms);
formWatchCallback(); await Promise.resolve();
assert.equal(uiTicks, 1); assert.equal(uiRenders, 1);
// A save exception keeps its identity; the existing away early return performs no request.
const normalSave = forms.persistNow, saveError = new Error('mock save exception');
forms.persistNow = () => { throw saveError; };
assert.throws(() => forms.formBoundary.applyHomepageHumanFormRequest(formCat(), formInput), error => error === saveError);
const failedSaveCat = formCat(); forms.selectedCat.value = failedSaveCat; forms.cats.value = [failedSaveCat];
await assert.rejects(forms.formBoundary.sendMessageInternal(formInput), error => error === saveError);
forms.persistNow = normalSave;
const awayCat = formCat({ presence: 'AWAY', autoReply: '[existing mock auto reply]' });
forms.selectedCat.value = awayCat; forms.cats.value = [awayCat];
vm.runInContext('Math.random = () => 1;', forms);
const callsBeforeAway = providerCalls;
await forms.formBoundary.sendMessageInternal('ordinary mock input');
assert.equal(providerCalls, callsBeforeAway);
console.log('PASS — Memory Truth, ordinary reply, posture, explicit form authority, canonical button/speech synchronization, next HUMAN message, reload, rollback and Vue update. Mocked only.');
