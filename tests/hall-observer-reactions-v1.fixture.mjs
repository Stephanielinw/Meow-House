import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html'), plain = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({ console }); context.window = context;
vm.runInContext(read('js/meeow-hall-activities.js'), context);
const policy = context.Meeow.hallActivities;
assert.equal(typeof policy.decideObserverReactions, 'function', 'T7 stable program decision must exist');
assert.deepEqual(plain(policy.observerPolicy), { range: 240, lifetime: 15000, cap: 2, textLimit: 180 });
for (const [roll, expected] of [[0, 'NOT_NOTICE'], [.599999, 'NOT_NOTICE'], [.6, 'NOTICE_CONTINUE'],
    [.899999, 'NOTICE_CONTINUE'], [.9, 'MICRO_REACTION'], [.99999, 'MICRO_REACTION']])
    assert.equal(policy.observerCategory(roll), expected);
for (const social of [-2, 0, 2]) for (const expression of [-2, 0, 2]) {
    const p = policy.observerProbabilities({ socialEngagement: social, emotionalExpression: expression });
    assert.ok(Math.abs(p.notice - .4) <= .0500001);
    assert.ok(Math.abs(p.microGivenNotice - .25) <= .0500001);
}
assert.deepEqual(plain(policy.observerProbabilities({ socialEngagement: 99, emotionalExpression: NaN })),
    { notice: .4, microGivenNotice: .25 });
const decide = (source, candidates) => policy.decideObserverReactions({ sourceInteractionId: source,
    targetId: 'target', startedAt: 100000, candidates });
const sourceFor = category => {
    for (let n = 0; n < 10000; n++) {
        const source = 'source-' + n, reactions = decide(source, [{ id: 'observer', salience: 0 }]);
        if ((reactions[0]?.category || 'NOT_NOTICE') === category) return source;
    }
    throw new Error('No deterministic source for ' + category);
};
const microSource = sourceFor('MICRO_REACTION'), noticeSource = sourceFor('NOTICE_CONTINUE'), emptySource = sourceFor('NOT_NOTICE');
const sample = decide(microSource, [{ id: 'observer', salience: 2 }, { id: 'target', salience: 100 }]);
assert.equal(sample.length, 1); assert.equal(sample[0].expiresAt - sample[0].startedAt, 15000);
assert.deepEqual(plain(sample), plain(decide(microSource, [{ id: 'observer', salience: 2 }])));
const crowded = Array.from({ length: 30 }, (_, i) => ({ id: 'observer-' + i, salience: i }));
const capped = decide(microSource, crowded);
assert.equal(capped.length, 2); assert.ok(Number(capped[0].observerId.split('-').at(-1)) > Number(capped[1].observerId.split('-').at(-1)));
const valid = { entries: sample.map(row => ({ observerId: row.observerId, reactionId: row.reactionId, reactionText: '也朝那边看了一眼。' })) };
assert.equal(policy.validateObserverContent(valid, sample), true);
for (const mutate of [row => ({ ...row, observerId: 'unknown' }), row => ({ ...row, category: 'APPROACH_JOIN' }),
    row => ({ ...row, coordinates: [1, 2] }), row => ({ ...row, memories: ['secret'] }), row => ({ ...row, reactionText: '' })])
    assert.notEqual(policy.validateObserverContent({ entries: valid.entries.map(mutate) }, sample), true);
assert.notEqual(policy.validateObserverContent({ entries: [...valid.entries, ...valid.entries] }, sample), true);
assert.notEqual(policy.validateObserverContent({ entries: [] }, sample), true);
assert.notEqual(policy.validateObserverContent(valid, decide(noticeSource, [{ id: 'observer' }])), true);

const start = html.indexOf('// T7 observer reaction authority.'), end = html.indexOf('// End T7 observer reaction authority.', start);
assert.ok(start > 0 && end > start, 'T7 must live in the existing Hall/direct orchestration scope');
const block = html.slice(start, end);
function harness({ source = microSource, enabled = true, extra = [], delayed = false, fail = false, invalid = false } = {}) {
    let time = Date.parse('2026-10-06T12:00:00Z'), monotonicTime = 1000,
        saves = 0, requests = 0, resolves = [], packets = [];
    class MockDate extends Date { constructor(value = time) { super(value); } static now() { return time; } }
    const cat = (id, x) => ({ id, mapRoom: 'living', mapPoint: id, form: 'CAT', authority: id + ':current',
        todayInteractions: [], x, lastInteractionTimestamp: 0, chatHistory: ['PRIVATE_CHAT_SENTINEL'],
        innerVoice: 'PRIVATE_VOICE_SENTINEL', privateRelationship: 'PRIVATE_RELATIONSHIP_SENTINEL',
        affinity: 'PRIVATE_AFFINITY_SENTINEL', prompt: 'PUBLIC CANON PROFILE' });
    const target = cat('target', 100), observer = cat('observer', 120), cats = { value: [target, observer, ...extra.map((id, i) => cat(id, 130 + i))] };
    const hall = { id: 'hall', name: 'Hall', currentEpisodeWindow: { completedHistory: ['unchanged'], residents: [] } };
    const halls = { value: [hall] };
    const rows = cats.value.map(c => ({ id: c.id, placementKey: 'place:' + c.id, foot: { x: c.x, y: 100 },
        behaviorId: 'observe', state: 'activity', behaviorLifecycleState: 'ACTIVE', behaviorInstanceId: 'instance:' + c.id,
        episodeBeatId: 'beat:' + c.id, transitionGeneration: 1, activityExpectedEndAt: monotonicTime + 120000 }));
    const record = { id: source, type: 'chat-reply', source: 'detail-chat', interactionEpisodeId: 'direct:' + source,
        at: new MockDate().toISOString(), content: 'PRIVATE_REPLY_SENTINEL' };
    target.todayInteractions.push(record);
    const state = { failSaveAt: 0, saved: null, source, saves, requests };
    const ref = value => ({ value });
    const domain = { source: { roomId: 'living' }, geometryVersion: 1, legalPoint: p => !!p && p.x >= 0 && p.x <= 1024 && p.y >= 0 && p.y <= 1024 };
    const markers = cats.value.map(c => ({ cat: c, room: 'living', spot: c.id }));
    const env = { console, Date: MockDate, performance: { now: () => monotonicTime }, Math, JSON, Map, Set, WeakMap, Promise,
        hallActivities: policy, cats, halls, activeHallId: ref('hall'), activeMapRoom: ref('living'),
        currentTab: ref('detail'), loungeView: ref('room'), detailReturnOrigin: ref(''), hallSceneActive: ref(true),
        selectedCat: ref(target), document: { visibilityState: 'visible' }, settings: { apiKey: enabled ? 'mock' : '' },
        statusRefreshDisposed: false, thinkingStates: {}, roomSpatialDomain: ref(domain), roomSpatialReady: ref(true),
        roomSpatialContextKey: 'hall|living', normalRoomContextKey: () => 'hall|living',
        spatialAmbientSnapshot: ref({ residents: rows }), mapCatMarkers: ref(markers),
        normalRoomPlacementKey: m => 'place:' + m.cat.id,
        normalRoomCanOwn: id => !cats.value.find(c => c.id === id)?.blocked,
        hasHigherHallPresentationOwner: id => !!cats.value.find(c => c.id === id)?.blocked,
        getResidentPhysicalHallId: c => c.hall || 'hall', getResidentForm: c => c.form,
        isResidentInHall: c => !c.away, isResidentAway: c => !!c.away, isResidentInCuratorRoom: c => !!c.curator,
        hallEpisodeAuthority: c => c.authority,
        getHallEpisodeRow: c => ({ row: { state: 'valid', beats: [{ id: 'beat:' + c.id, state: 'active', startAt: time - 120000, endAt: time + 120000 }] } }),
        getResidentPublicName: c => c.id, hallNavigation: { distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) },
        isContextuallyViewingHallPresentation: id => env.activeHallId.value === id &&
            (env.currentTab.value === 'lounge' && env.loungeView.value === 'room' ||
             env.currentTab.value === 'detail' && env.detailReturnOrigin.value === '' && env.hallSceneActive.value),
        personalityRuntime: { getResidentRuntimePersonality: () => ({ state: 'profiled', axes: {} }) },
        getCanonicalRelationshipBaseline: c => ({ label: c.publicLabel || '' }),
        stableAttentionHash: value => { let h = 2166136261; for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; },
        buildSaveData: () => ({ halls: plain(halls.value), cats: plain(cats.value) }),
        buildCatIdentityBlock: c => 'PUBLIC IDENTITY ' + c.id,
        buildLeanAmbientContext: (c, options) => { assert.equal(options.status, ''); return 'VALIDATED PERSONALITY ' + c.id; },
        buildPublicSharedPeerRelationshipLines: participants => new Map(participants.map(c => [c.id, ['PUBLIC CANONICAL']])),
        buildAuthoritativeUserIdentityContext: () => 'PUBLIC USER IDENTITY', cleanText: s => String(s || '').trim(),
        parseAIJSON: JSON.parse,
        requestSharedHallContent: (prompt, options) => {
            requests++; packets.push({ prompt, options });
            assert.equal(options.maxAttempts, 1);
            const frozen = hall.currentObserverReactionBatch.reactions.filter(r => r.category === 'MICRO_REACTION');
            const text = JSON.stringify({ entries: frozen.map(r => ({ observerId: invalid ? 'unknown' : r.observerId,
                reactionId: r.reactionId, reactionText: '也朝那边看了一眼。' })) });
            const complete = () => fail ? Promise.reject(new Error('mock failure')) : Promise.resolve(text);
            if (!delayed) return complete();
            return new Promise((resolve, reject) => resolves.push(() => complete().then(resolve, reject)));
        }
    };
    env.window = { Meeow: { storage: { persistSnapshot: snapshot => {
        saves++; if (state.failSaveAt === saves) return false; state.saved = plain(snapshot); return true;
    } } } };
    const memoryContext = vm.createContext({ console }); memoryContext.window = memoryContext;
    vm.runInContext(read('js/meeow-memory.js'), memoryContext);
    const memory = memoryContext.Meeow.memory;
    memory.configure({ cleanText: env.cleanText, getHalls: () => halls.value, getCurrentHall: () => hall,
        getResidentPublicName: env.getResidentPublicName, getResidentForm: env.getResidentForm });
    env.buildCatIdentityBlock = memory.buildCatIdentityBlock;
    env.buildLeanAmbientContext = (cat, options) => memory.buildAmbientResidentContext(cat, options) + '\nVALIDATED PERSONALITY';
    const ctx = vm.createContext(env);
    vm.runInContext(block + '\nthis.t7 = { captureObserverInteractionSource, queueObserverReactions, reconcileObserverReactions, getResidentObserverReaction, observerSalience };', ctx);
    const t7 = ctx.t7;
    const capture = () => t7.captureObserverInteractionSource(target);
    let sourceContext = capture();
    const queue = () => t7.queueObserverReactions({ activeResident: target, sourceRecord: record,
        sourceContext, interactionEpisodeId: record.interactionEpisodeId, now: new MockDate() });
    return { env, t7, state, hall, cats, target, observer, rows, record, domain, capture, queue,
        advance: ms => { time += ms; monotonicTime += ms; }, requests: () => requests, saves: () => saves, packets,
        flush: async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); },
        resolve: () => resolves.splice(0).forEach(fn => fn())
    };
}

// Use the real executor's default performance clock to produce the contact;
// persisted episode/reaction times remain epoch timestamps across reload.
for (const paused of [false, true]) {
    const h = harness(), runtime = vm.createContext({ console, performance: h.env.performance });
    runtime.window = runtime;
    vm.runInContext(read('js/meeow-hall-spatial.js'), runtime);
    const beat = { id: 'beat:observer', behaviorId: 'observe', posture: 'sitting',
        foot: { x: 120, y: 100 }, endAt: h.env.Date.now() + 120000 };
    const controller = runtime.Meeow.hallSpatial.createAmbientSimulation({
        navigation: { legalPoint: () => true, choose: () => null, plan: () => null },
        activityPolicy: { postures: () => ['sitting'], prepareVisual: () => true, visualReady: () => true },
        episodePolicy: { now: h.env.Date.now, get: () => ({ beat }), progress: () => true },
        getAuthoritativePose: () => 'sitting', setTimer: () => 1, clearTimer: () => {}
    });
    controller.reconcile([{ id: 'observer', key: 'place:observer', foot: beat.foot }], true);
    await h.flush();
    if (paused) controller.pause('detail');
    Object.assign(h.rows[1], plain(controller.snapshot().residents[0]));
    assert.equal(h.rows[1].activityExpectedEndAt, 121000, 'executor contact deadline is monotonic');
    assert.ok(h.env.Date.now() > h.rows[1].activityExpectedEndAt, 'epoch and session clocks must differ realistically');
    h.queue(); await h.flush();
    assert.equal(h.requests(), 1, `${paused ? 'PAUSED' : 'ACTIVE'} static contact is current`);
    const reaction = h.t7.getResidentObserverReaction('observer');
    assert.equal(reaction.startedAt, h.env.Date.now());
    assert.equal(reaction.expiresAt - reaction.startedAt, 15000);
    h.advance(14999); assert.ok(h.t7.getResidentObserverReaction('observer'));
    h.advance(1); assert.equal(h.t7.getResidentObserverReaction('observer'), null);
    assert.equal(h.requests(), 1, 'reaction expiry cannot request content');
    controller.stop();
}
const expiredContact = harness();
expiredContact.rows[1].activityExpectedEndAt = expiredContact.env.performance.now();
expiredContact.queue(); await expiredContact.flush();
assert.equal(expiredContact.requests(), 0, 'expired monotonic contact is rejected even inside a valid epoch beat');

for (const source of [noticeSource, emptySource]) {
    const h = harness({ source }); h.queue(); await h.flush();
    assert.equal(h.requests(), 0); assert.equal(h.hall.currentObserverReactionBatch.content.state, 'fallback');
    assert.equal(h.record.observerReactionEvaluated, true);
    const frozen = JSON.stringify(h.hall.currentObserverReactionBatch), count = h.saves();
    h.queue(); h.t7.reconcileObserverReactions(); await h.flush();
    assert.equal(JSON.stringify(h.hall.currentObserverReactionBatch), frozen); assert.equal(h.saves(), count);
}
for (const change of [h => h.observer.mapRoom = 'dorm', h => h.observer.hall = 'other', h => h.observer.away = true,
    h => h.observer.curator = true, h => h.observer.blocked = true, h => h.rows[1].foot.x = 500,
    h => h.rows[1].foot.x = -1, h => h.rows[1].behaviorId = 'sleep', h => h.rows[1].state = 'moving',
    h => h.rows[1].placementKey = 'wrong', h => h.rows[1].behaviorLifecycleState = 'CANCELLED',
    h => h.env.thinkingStates.observer = { id: 'private-direct-request' },
    h => h.rows.splice(1, 1)]) {
    const h = harness(); change(h); h.queue(); await h.flush();
    assert.equal(h.requests(), 0); assert.equal(h.hall.currentObserverReactionBatch.reactions.length, 0);
}
for (const change of [h => h.env.document.visibilityState = 'hidden', h => h.env.detailReturnOrigin.value = 'curator',
    h => h.env.currentTab.value = 'phone', h => h.env.hallSceneActive.value = false,
    h => h.target.mapPoint = 'replaced', h => h.domain.geometryVersion++, h => h.target.blocked = true,
    h => h.domain.source.roomId = 'dorm']) {
    const h = harness(); change(h); h.queue(); await h.flush(); assert.equal(h.requests(), 0);
}
const micro = harness(); const routine = JSON.stringify(micro.hall.currentEpisodeWindow), position = JSON.stringify(micro.rows);
micro.queue(); await micro.flush();
assert.equal(micro.requests(), 1); assert.equal(micro.hall.currentObserverReactionBatch.content.state, 'accepted');
assert.ok(micro.t7.getResidentObserverReaction('observer').reactionText);
assert.equal(micro.t7.getResidentObserverReaction('target'), null);
assert.equal(JSON.stringify(micro.rows), position); assert.equal(JSON.stringify(micro.hall.currentEpisodeWindow), routine);
for (const packet of micro.packets) for (const sentinel of ['PRIVATE_CHAT_SENTINEL', 'PRIVATE_VOICE_SENTINEL', 'PRIVATE_RELATIONSHIP_SENTINEL', 'PRIVATE_REPLY_SENTINEL', 'PRIVATE_AFFINITY_SENTINEL'])
    assert.ok(!packet.prompt.includes(sentinel));
const score = micro.t7.observerSalience(micro.observer, micro.target, microSource);
Object.assign(micro.observer, { affinity: 100, lastInteractionTimestamp: 999999, personality: 'bold', status: 'PRIVATE_STATUS_SENTINEL' });
assert.equal(micro.t7.observerSalience(micro.observer, micro.target, microSource), score);
const before = { saves: micro.saves(), requests: micro.requests(), batch: JSON.stringify(micro.hall.currentObserverReactionBatch) };
for (let n = 0; n < 10000; n++) micro.t7.getResidentObserverReaction('observer');
assert.equal(micro.saves(), before.saves); assert.equal(micro.requests(), before.requests);
micro.advance(15001); micro.t7.reconcileObserverReactions(); await micro.flush();
assert.equal(micro.t7.getResidentObserverReaction('observer'), null);
assert.equal(micro.requests(), 1); assert.equal(JSON.stringify(micro.hall.currentEpisodeWindow), routine);

for (const options of [{ enabled: false }, { fail: true }, { invalid: true }]) {
    const h = harness(options); h.queue(); await h.flush();
    assert.equal(h.hall.currentObserverReactionBatch.content.state, 'fallback');
    const calls = h.requests(); h.queue(); for (let n = 0; n < 5; n++) h.t7.reconcileObserverReactions(); await h.flush();
    assert.equal(h.requests(), calls);
}
for (const saveAt of [1, 2]) {
    const h = harness(); h.state.failSaveAt = saveAt; h.queue(); await h.flush(); assert.equal(h.requests(), 0);
    h.state.failSaveAt = 0; h.t7.reconcileObserverReactions(); await h.flush(); assert.equal(h.requests(), 1);
}
for (const change of [h => h.observer.away = true, h => h.observer.authority = 'new',
    h => h.rows[1].transitionGeneration++, h => h.advance(15001), h => h.env.activeHallId.value = 'other']) {
    const h = harness({ delayed: true }); h.queue(); await h.flush(); assert.equal(h.requests(), 1);
    change(h); h.resolve(); await h.flush(); assert.equal(h.t7.getResidentObserverReaction('observer'), null);
    assert.notEqual(h.hall.currentObserverReactionBatch?.content.state, 'accepted');
}
const paused = harness(); paused.rows[1].state = 'paused'; paused.rows[1].behaviorLifecycleState = 'PAUSED';
paused.queue(); await paused.flush(); assert.equal(paused.requests(), 1);
const expiredBeat = harness(); expiredBeat.rows[1].state = 'paused'; expiredBeat.rows[1].behaviorLifecycleState = 'PAUSED';
expiredBeat.env.getHallEpisodeRow = () => ({ row: { state: 'valid', beats: [{ id: 'beat:observer', state: 'active', startAt: 0, endAt: 1 }] } });
expiredBeat.queue(); await expiredBeat.flush(); assert.equal(expiredBeat.requests(), 0);

let pairSource;
for (let n = 0; n < 10000; n++) {
    const s = 'pair-' + n, rows = decide(s, [{ id: 'observer', salience: 0 }, { id: 'second', salience: 0 }]);
    if (rows.length === 2 && rows.every(r => r.category === 'MICRO_REACTION')) { pairSource = s; break; }
}
assert.ok(pairSource);
const pair = harness({ source: pairSource, extra: ['second'] }); pair.queue(); await pair.flush();
assert.equal(pair.requests(), 1); assert.equal(pair.hall.currentObserverReactionBatch.content.entries.length, 2);
assert.equal(pair.packets[0].options.validateResponse(JSON.stringify({ entries: pair.hall.currentObserverReactionBatch.content.entries })), false || 'Stale observer content.');

const supersede = harness({ delayed: true }); supersede.queue(); await supersede.flush();
const oldRecord = JSON.stringify(supersede.record), oldRoutine = JSON.stringify(supersede.hall.currentEpisodeWindow);
supersede.advance(1);
const newRecord = { ...supersede.record, id: pairSource, observerReactionEvaluated: false,
    interactionEpisodeId: 'direct:new', at: new supersede.env.Date().toISOString() };
supersede.target.todayInteractions.push(newRecord);
supersede.t7.queueObserverReactions({ activeResident: supersede.target, sourceRecord: newRecord,
    sourceContext: supersede.capture(), interactionEpisodeId: newRecord.interactionEpisodeId, now: new supersede.env.Date() });
await supersede.flush(); supersede.resolve(); await supersede.flush();
assert.equal(supersede.hall.currentObserverReactionBatch.sourceInteractionId, pairSource);
assert.equal(JSON.stringify(supersede.record), oldRecord, 'supersession cannot rewrite the old source event');
assert.equal(JSON.stringify(supersede.hall.currentEpisodeWindow), oldRoutine);
for (const entry of supersede.hall.currentObserverReactionBatch.content.entries) assert.ok(entry.reactionId.includes(pairSource));

const acceptSaveFailure = harness(); acceptSaveFailure.state.failSaveAt = 3;
acceptSaveFailure.queue(); await acceptSaveFailure.flush();
assert.equal(acceptSaveFailure.hall.currentObserverReactionBatch.content.state, 'claimed');
assert.equal(acceptSaveFailure.t7.getResidentObserverReaction('observer').reactionText, undefined);
acceptSaveFailure.t7.reconcileObserverReactions(); await acceptSaveFailure.flush();
assert.equal(acceptSaveFailure.hall.currentObserverReactionBatch.content.state, 'fallback');
assert.equal(acceptSaveFailure.requests(), 1);

const packetFailure = harness(); packetFailure.env.buildLeanAmbientContext = () => { throw new Error('mock public builder failure'); };
packetFailure.queue(); await packetFailure.flush();
assert.equal(packetFailure.hall.currentObserverReactionBatch.content.state, 'fallback');
assert.equal(packetFailure.requests(), 0);
packetFailure.t7.reconcileObserverReactions(); await packetFailure.flush(); assert.equal(packetFailure.requests(), 0);
const reload = harness({ delayed: true }); reload.queue(); await reload.flush();
// A fresh VM has no session in-flight guard and must not re-dispatch a saved claim.
const fresh = vm.createContext({ ...reload.env });
vm.runInContext(block + '\nthis.reconcile = reconcileObserverReactions; this.get = getResidentObserverReaction;', fresh);
fresh.reconcile(); await reload.flush(); assert.equal(reload.requests(), 1);
assert.equal(reload.hall.currentObserverReactionBatch.content.state, 'fallback');
reload.resolve(); await reload.flush(); assert.equal(reload.hall.currentObserverReactionBatch.content.state, 'fallback');

assert.ok(!block.includes('appendEpisodicMemory') && !block.includes('queueAttentionBidOpportunity('));
assert.ok(!block.includes('recordHallEpisodeProgress(') && !block.includes('refreshAllStatus('));
assert.ok(!block.includes('setTimeout(') && !block.includes('setInterval('));
const directStart = html.indexOf('const sendMessageInternal ='), directEnd = html.indexOf('const hasShopAuthoringDraft', directStart);
const direct = html.slice(directStart, directEnd);
assert.ok(direct.includes('activeResident: sendingCat, capture: true'));
assert.ok(direct.includes('sourceRecord: acceptedMomentReply'));
const hook = html.slice(html.indexOf('const maybeQueueAttentionBidAfterHomepageDirect ='), html.indexOf('const awayLifecycle ='));
assert.ok(hook.includes('queueObserverReactions(') && !hook.includes('queueAttentionBidOpportunity('));
assert.ok(!direct.includes('await queueObserverReactions'));
// Exercise the real direct function and validator, rather than inferring
// target independence solely from a source-text non-await assertion.
const validator = html.slice(html.indexOf('const validateMergedHomepageChatResponse ='),
    html.indexOf('const HOMEPAGE_DIRECT_RECENT_MESSAGE_LIMIT ='));
for (const observerFails of [false, true]) {
    const h = harness({ delayed: true, fail: observerFails });
    h.target.todayInteractions = []; h.target.chatHistory = []; h.target.statusActivity = { posture: 'sitting' };
    let directRequests = 0;
    const noop = () => {}, logs = [];
    const env = { ...h.env, chatInput: { value: 'PRIVATE_USER_TEXT_SENTINEL' }, thinkingStates: {},
        user: { job: 'caretaker' }, currentHall: { value: h.hall }, CORE_ROLEPLAY_PROMPT: 'mock system', ThinkingLevel: { LOW: 'low' },
        HOMEPAGE_DIRECT_EPISODIC_MAX_MEMORIES: 3, HOMEPAGE_DIRECT_EPISODIC_MAX_CHARS: 1200,
        getCurrentTimeStr: () => '12:00', applyHomepageHumanFormRequest: () => null, claimCharacterInvitation: () => null,
        claimPhoneReplyForHomepageDirect: () => null, completeCharacterInvitation: noop,
        statusPosture: { normalizeStatusActivity: value => value, normalizePosture: value => value === 'sitting' },
        buildHomepageDirectRecentConversation: () => ({ text: 'PRIVATE_RECENT_CHAT_SENTINEL', userAuthoredText: '' }),
        buildUserSharedEpisodicMemoryContext: () => ({ text: 'PRIVATE_TARGET_MEMORY_SENTINEL' }),
        getHomepageDirectUserLedResidentIds: () => [], reconcileAwayEpisodes: noop, getLeanResidentPresence: () => 'HALL',
        buildLeanForegroundContextParts: () => ({ canon: 'public profile', currentState: 'sitting', relationship: 'PRIVATE_TARGET_RELATIONSHIP_SENTINEL' }),
        buildHomepageDirectPresenceContext: () => 'living', getSharedUserCurrentStatus: () => '',
        buildHomepagePrivateUserStatusContext: () => 'PRIVATE_TARGET_CONTINUITY_SENTINEL', getInteractionHolidayContext: () => '',
        getClaimedPhoneReplyOpportunity: () => null, logPromptBudget: noop, hasMechanicalAppearanceRepetition: () => false,
        sendFriendRequest: noop, storeHomepageEpisodicMemory: noop, checkAffinityThreshold: noop,
        advanceActiveSocialPresenceAfterDirect: noop, queueHomepageHallAmbientRefresh: () => false,
        addLog: text => logs.push(text),
        appendInteractionEvent: (cat, type, content, extra) => {
            const event = { id: type === 'chat-reply' ? microSource : 'user-source', type, content,
                at: new h.env.Date().toISOString(), ...extra };
            cat.todayInteractions.push(event); return event;
        },
        callAI: async (prompt, system, tokens, level, options) => {
            directRequests++; assert.ok(prompt.includes('PRIVATE_USER_TEXT_SENTINEL'));
            const result = JSON.stringify({ activeCat: { id: 'target', reply: '接受的目标回复。', status: '坐着听',
                innerVoice: '【我在听。】', userStatus: '交谈', posture: 'sitting', memoryCandidate: null } });
            assert.equal(options.validateResponse(result), true); return result;
        }
    };
    env.window.Meeow.memory = { classifyHistoricalIntent: () => ({ historical: false }) };
    env.window.Meeow.residentCopy = { factFor: (cat, posture, form) => ({ residentId: cat.id, posture, form }) };
    const directContext = vm.createContext(env);
    vm.runInContext(block + hook + validator + direct + '\nthis.send = sendMessageInternal;', directContext);
    await directContext.send(); await h.flush();
    assert.equal(directRequests, 1); assert.equal(h.requests(), 1);
    assert.equal(h.target.chatHistory.at(-1).content, '接受的目标回复。', 'target completes while observer request is still unresolved');
    assert.equal(logs.length, 0); assert.equal(env.thinkingStates.target, false);
    for (const packet of h.packets) assert.ok(!/PRIVATE_(?:USER_TEXT|RECENT_CHAT|TARGET_MEMORY|TARGET_RELATIONSHIP|TARGET_CONTINUITY)_SENTINEL/.test(packet.prompt));
    h.resolve(); await h.flush();
    assert.equal(h.hall.currentObserverReactionBatch.content.state, observerFails ? 'fallback' : 'accepted');
    assert.equal(h.target.chatHistory.at(-1).content, '接受的目标回复。');
    assert.equal(directRequests, 1); assert.equal(h.requests(), 1);
}
console.log('T7 focused fixture PASS — policy, persistence, privacy, currentness, expiry, T6/T8 boundary');
