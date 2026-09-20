import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = appSource.indexOf('// --- Social Attention / Attention Bids ---');
const end = appSource.indexOf('const awayLifecycle = window.Meeow.away;', start);
assert.ok(start >= 0 && end > start, 'Active Social Presence helpers must be inside the Social Attention block.');
const lifecycleSource = appSource.slice(start, end);

let nowMs = Date.parse('2026-09-20T12:00:00.000Z');
const NativeDate = Date;
class FakeDate extends NativeDate {
    constructor(value) { super(arguments.length ? value : nowMs); }
    static now() { return nowMs; }
}

const points = [
    { id: 'neutral-a', name: '安静地面', roomId: 'living', furnitureId: 'floor', anchors: [{ x: 10, y: 10 }] },
    { id: 'user-near', name: '馆长脚边', roomId: 'living', furnitureId: 'floor', anchors: [{ x: 20, y: 20 }] },
    { id: 'neutral-b', name: '前方地毯', roomId: 'living', furnitureId: 'carpet', region: { x: 0, y: 0, width: 10, height: 10 } },
    { id: 'unsafe-seat', name: '窗台软垫', roomId: 'living', furnitureId: 'cushion', anchors: [{ x: 30, y: 30 }] }
];
const mapRooms = [{ id: 'living', name: 'Living', zones: points }];

const events = [];
const logs = [];
const scenes = [];
const requestCalls = [];
const requestResults = [];
const persistBehaviors = [];
const persistedSnapshots = [];
let notificationFailure = null;
const user = { attentionBidOpportunities: [], activeSocialPresences: [] };
const catsRef = { value: [] };
const hallsRef = { value: [{ id: 'h', name: 'Hall H' }] };
const hallScenesRef = { value: scenes };
const refs = {
    activeHallId: { value: 'h' }, currentTab: { value: 'detail' }, detailReturnOrigin: { value: '' },
    hallSceneActive: { value: true }, selectedCat: { value: null }, isFocusing: { value: false }, focusCats: { value: [] }
};
const exploreState = { active: false, companion: null };
const settings = { apiKey: 'test-key' };

const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const currentSnapshot = () => ({
    cats: clone(catsRef.value), scenes: clone(hallScenesRef.value),
    operations: clone(user.attentionBidOpportunities), presences: clone(user.activeSocialPresences)
});
const findPoint = (id, roomId = '') => points.find(point => point.id === id && (!roomId || point.roomId === roomId)) || null;
const validPostures = new Set(['standing', 'sitting', 'lying', 'crouching']);

const sandbox = {
    Date: FakeDate, Map, Set, Math, JSON, console,
    user, cats: catsRef, halls: hallsRef, hallSceneRecords: hallScenesRef,
    activeHallId: refs.activeHallId, currentTab: refs.currentTab, detailReturnOrigin: refs.detailReturnOrigin,
    hallSceneActive: refs.hallSceneActive, selectedCat: refs.selectedCat,
    isFocusing: refs.isFocusing, focusCats: refs.focusCats, exploreState, settings,
    MAP_ROOM_DEFINITIONS: mapRooms,
    buildAllMapPoints: rooms => rooms.flatMap(room => room.zones.map(point => ({ ...point, roomId: room.id, roomName: room.name }))),
    findMapPoint: findPoint,
    getMapRoomForCat: cat => String(cat?.mapRoom || ''),
    cleanText,
    normalizeFormValue: value => ['CAT', 'HUMAN'].includes(String(value || '').toUpperCase()) ? String(value).toUpperCase() : '',
    getResidentForm: cat => cat?.currentForm || 'CAT',
    getResidentPublicName: cat => cat?.name || String(cat?.id || ''),
    isResidentAway: cat => Boolean(cat?.isOut),
    isResidentInCuratorRoom: cat => Boolean(cat?.curatorRoomPresence),
    isResidentInHall: cat => Boolean(cat) && !cat.isOut && !cat.curatorRoomPresence,
    getResidentPhysicalHallId: cat => cat?.isOut || cat?.curatorRoomPresence ? '' : String(cat?.hallId || ''),
    getCanonicalRelationshipBaseline: () => ({ label: 'public-friends' }),
    buildCatIdentityBlock: cat => `[CANON] ${cat?.prompt || ''}`,
    buildForegroundUserRelationshipBaseline: cat => `public affinity ${Number(cat?.affinity) || 0}`,
    getResidentLiveStatus: cat => cleanText(cat?.status || '正在馆内。'),
    parseAIJSON: raw => JSON.parse(raw),
    statusPosture: {
        validateStatusPosture: (status, posture) => ({
            valid: Boolean(cleanText(status)) && validPostures.has(posture),
            error: 'invalid posture'
        })
    },
    getOperationalDayKey: (value = new FakeDate()) => new FakeDate(value).toISOString().slice(0, 10),
    normalizeHallSceneRecords: records => records,
    appendHallSceneRecord: data => {
        if (hallScenesRef.value.some(record => record.id === data.id)) return hallScenesRef.value.find(record => record.id === data.id);
        hallScenesRef.value.push(data);
        events.push('scene');
        return data;
    },
    setCatStatus: (cat, status, options = {}) => {
        const priorStatus = cat.status;
        const priorPosture = cat.statusActivity?.posture;
        cat.status = cleanText(status);
        cat.statusActivity = { posture: options.posture };
        cat.statusPresentationForm = options.presentationForm === false ? cat.statusPresentationForm : (options.presentationForm || cat.currentForm);
        cat.lastStatusUpdateTime = FakeDate.now();
        if (options.preserveHallMap !== true && options.mapPoint) {
            const point = findPoint(options.mapPoint, options.mapRoom || '');
            if (point) {
                cat.mapRoom = point.roomId;
                cat.mapPoint = point.id;
                cat.mapSpot = point.id;
                cat.mapFurniture = cleanText(options.mapFurniture || point.furnitureId || '');
                cat.mapPositionLabel = cleanText(options.mapPositionLabel || point.name || '');
            }
        }
        return priorStatus !== cat.status || priorPosture !== options.posture;
    },
    persistNow: () => {
        events.push('persist');
        persistedSnapshots.push(currentSnapshot());
        const behavior = persistBehaviors.length ? persistBehaviors.shift() : true;
        if (behavior instanceof Error) throw behavior;
        return behavior;
    },
    scheduleSave: () => events.push('schedule-save'),
    showNotification: (...args) => {
        const presence = user.activeSocialPresences[0];
        events.push(`notify:${presence?.presentedAt ? 'already-presented' : 'blank-presentedAt'}`);
        if (notificationFailure) throw notificationFailure;
        events.push(['notification', ...args]);
    },
    addLog: (message, type) => logs.push({ message, type }),
    isHallSceneFeedNearBottom: () => true,
    scrollHallSceneFeedToBottom: () => events.push('scroll'),
    requestStructuredEngine: async (prompt, options) => {
        requestCalls.push({ prompt, options });
        const result = requestResults.shift();
        if (result instanceof Error) throw result;
        if (typeof result === 'function') return result(prompt, options);
        return typeof result === 'string' ? result : JSON.stringify(result);
    },
    CORE_ROLEPLAY_PROMPT: 'system',
    ThinkingLevel: { LOW: 'LOW' }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(`let terminateActiveSocialPresenceForResident = () => {};
${lifecycleSource}
globalThis.lifecycle = {
  isPresenceEstablishingAttentionBid,
  validateAttentionBidResponse,
  resolveSocialPresenceMapPoint,
  resolveSocialPresenceExitPoint,
  getSocialPresenceOwnedPresentation,
  getSocialPresencePresentationFingerprint,
  socialPresenceOwnsPresentation,
  normalizeActiveSocialPresences,
  commitPhysicalAttentionPresence,
  terminateActiveSocialPresence,
  reconcileActiveSocialPresences,
  advanceActiveSocialPresenceAfterDirect,
  terminateActiveSocialPresencesForNavigation,
  runActiveSocialPresenceProgression,
  runAttentionBidOpportunity,
  getActiveSocialPresenceParticipantIds,
  ACTIVE_SOCIAL_PRESENCE_TURN_THRESHOLD,
  ACTIVE_SOCIAL_PRESENCE_PROGRESSION_DELAY_MS,
  ACTIVE_SOCIAL_PRESENCE_MAX_LIFETIME_MS
};`, sandbox, { filename: 'index.html:active-social-presence' });
const lifecycle = sandbox.lifecycle;
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

const makeResident = (id, form, pointId, overrides = {}) => ({
    id, name: id.toUpperCase(), hallId: 'h', currentForm: form, affinity: 50,
    prompt: id === 'a' ? 'A_PRIVATE_CANON_SENTINEL' : 'B_PUBLIC_CANON',
    status: id === 'a' ? '正在窗边阅读。' : '正在地面观察。',
    statusActivity: { posture: 'standing' }, statusPresentationForm: form,
    mapRoom: 'living', mapPoint: pointId, mapSpot: pointId,
    mapFurniture: findPoint(pointId)?.furnitureId || '', mapPositionLabel: findPoint(pointId)?.name || '',
    innerVoice: `${id}-PRIVATE-INNER-VOICE`, lastStatusUpdateTime: 1,
    ...overrides
});
const makeOperation = (id = 'op-1', bidType = 'approach') => ({
    id, sourceEventId: `event-${id}`, source: 'ambient-engagement', hallId: 'h',
    activeResidentId: 'a', candidateId: 'b', bidType, authorizedObject: null,
    observableEvent: { kind: 'ambient-engagement', publicText: '', activeResidentPublicName: 'A', targetResidentId: '' },
    candidateForm: 'CAT', promptText: 'frozen prompt', createdAt: new FakeDate().toISOString(), claimedAt: new FakeDate().toISOString(),
    status: 'generating', generation: { token: `token-${id}`, attemptCount: 1, retryAt: '', lastError: '' },
    deliveredSceneId: '', deliveredAt: ''
});
const physicalPayload = () => ({
    content: 'B 走到你和 A 身边，尾巴轻轻扫过你的裤脚。',
    entryStatus: '正站在你和 A 身边。', entryPosture: 'standing'
});
const reset = () => {
    nowMs = NativeDate.parse('2026-09-20T12:00:00.000Z');
    events.length = 0; logs.length = 0; requestCalls.length = 0; requestResults.length = 0;
    persistBehaviors.length = 0; persistedSnapshots.length = 0;
    notificationFailure = null;
    hallScenesRef.value = [];
    user.attentionBidOpportunities = [];
    user.activeSocialPresences = [];
    const anchor = makeResident('a', 'HUMAN', 'neutral-a');
    const participant = makeResident('b', 'CAT', 'neutral-b');
    catsRef.value = [anchor, participant];
    refs.activeHallId.value = 'h'; refs.currentTab.value = 'detail'; refs.detailReturnOrigin.value = '';
    refs.hallSceneActive.value = true; refs.selectedCat.value = anchor;
    refs.isFocusing.value = false; refs.focusCats.value = [];
    exploreState.active = false; exploreState.companion = null; settings.apiKey = 'test-key';
    points.forEach(point => {
        if (point.id === 'neutral-b') point.region = { x: 0, y: 0, width: 10, height: 10 };
        if (point.id !== 'neutral-b' && !point.anchors) point.anchors = [{ x: 1, y: 1 }];
    });
    return { anchor, participant };
};
const stagePhysicalOperation = (id = 'op-1') => {
    const operation = makeOperation(id);
    user.attentionBidOpportunities.push(operation);
    return operation;
};
const commitPresence = (id = 'op-1') => lifecycle.commitPhysicalAttentionPresence(stagePhysicalOperation(id), physicalPayload());

// Narrow bid classification and generic topology are program-owned.
for (const type of ['approach', 'physical-bid', 'playful-bid', 'jealous-bid', 'protective-bid', 'observe', 'vocal-bid', 'withdraw', 'offer']) {
    assert.equal(lifecycle.isPresenceEstablishingAttentionBid(type), ['approach', 'physical-bid'].includes(type), type);
}
assert.equal(lifecycle.resolveSocialPresenceMapPoint('living', 'entry').id, 'user-near');
assert.equal(lifecycle.resolveSocialPresenceMapPoint('living', 'exit').id, 'neutral-a');
assert.equal(lifecycle.resolveSocialPresenceMapPoint('unknown', 'entry'), null);
assert.equal(lifecycle.resolveSocialPresenceExitPoint({ priorMapSnapshot: {
    mapRoom: 'living', mapPoint: 'neutral-b', mapSpot: 'neutral-b', mapFurniture: 'carpet', mapPositionLabel: '前方地毯'
} }, makeResident('x', 'CAT', 'user-near')).point.id, 'neutral-b', 'a still-valid prior point is the preferred exit');
assert.equal(lifecycle.resolveSocialPresenceExitPoint({ priorMapSnapshot: {
    mapRoom: 'living', mapPoint: 'removed-point', mapSpot: 'removed-point'
} }, makeResident('x', 'CAT', 'user-near')).point.id, 'neutral-a', 'invalid prior topology falls back to a current neutral point');
assert.match(lifecycleSource, /buildAllMapPoints\(MAP_ROOM_DEFINITIONS\)/);
assert.doesNotMatch(lifecycleSource, /living\s*(?:=>|:).*owner-feet|dorm\s*(?:=>|:).*dorm-carpet|dining\s*(?:=>|:).*kitchen-island-front/);

// A physical delivery commits scene, B presentation, presence and operation in
// one persistence boundary; notification and presentedAt follow that boundary.
{
    const { participant } = reset();
    const operation = stagePhysicalOperation();
    assert.equal(lifecycle.commitPhysicalAttentionPresence(operation, physicalPayload()), true);
    assert.equal(participant.mapPoint, 'user-near');
    assert.equal(participant.status, physicalPayload().entryStatus);
    assert.equal(user.activeSocialPresences.length, 1);
    assert.equal(hallScenesRef.value.length, 1);
    assert.equal(operation.status, 'delivered');
    assert.ok(user.activeSocialPresences[0].committedAt);
    assert.ok(user.activeSocialPresences[0].presentedAt);
    assert.ok(events.indexOf('persist') < events.findIndex(value => String(value).startsWith('notify:')));
    assert.ok(events.includes('notify:blank-presentedAt'), 'presentedAt must be blank when showNotification is invoked');
    assert.deepEqual(user.activeSocialPresences[0].priorMapSnapshot.mapPoint, 'neutral-b');
}

// Notification rendering is not world authority: an invocation failure after
// durable commit leaves the physical transaction intact and presentedAt blank.
{
    reset();
    const operation = stagePhysicalOperation('op-notification-failure');
    notificationFailure = new Error('UI unavailable');
    assert.equal(lifecycle.commitPhysicalAttentionPresence(operation, physicalPayload()), true);
    assert.equal(operation.status, 'delivered');
    assert.equal(user.activeSocialPresences.length, 1);
    assert.equal(user.activeSocialPresences[0].presentedAt, '');
    assert.equal(hallScenesRef.value.length, 1);
}

// Delivery-time authority rejection is all-or-nothing.
{
    const { participant } = reset();
    const before = clone(participant);
    const operation = stagePhysicalOperation();
    refs.currentTab.value = 'phone';
    assert.equal(lifecycle.commitPhysicalAttentionPresence(operation, physicalPayload()), false);
    assert.deepEqual(participant, before);
    assert.equal(hallScenesRef.value.length, 0);
    assert.equal(user.activeSocialPresences.length, 0);
    assert.equal(operation.status, 'failed');
    assert.equal(events.some(value => Array.isArray(value) && value[0] === 'notification'), false);
}

// Missing topology suppresses the physical event rather than inventing a point.
{
    const { participant } = reset();
    const before = clone(participant);
    points.forEach(point => { delete point.anchors; delete point.region; });
    const operation = stagePhysicalOperation('op-no-topology');
    assert.equal(lifecycle.commitPhysicalAttentionPresence(operation, physicalPayload()), false);
    assert.deepEqual(participant, before);
    assert.equal(hallScenesRef.value.length, 0);
    assert.equal(user.activeSocialPresences.length, 0);
}

// A false persistence result may follow a partial main-save write. Memory is
// restored and exactly one narrow rollback persistence writes the restored state.
{
    const { participant } = reset();
    const before = clone(participant);
    const operation = stagePhysicalOperation('op-false');
    persistBehaviors.push(false, true);
    assert.throws(() => lifecycle.commitPhysicalAttentionPresence(operation, physicalPayload()), /persistence failed/);
    assert.deepEqual(participant, before);
    assert.equal(hallScenesRef.value.length, 0);
    assert.equal(user.activeSocialPresences.length, 0);
    assert.equal(user.attentionBidOpportunities[0].status, 'failed');
    assert.equal(persistedSnapshots.length, 2);
    assert.equal(persistedSnapshots[0].presences.length, 1, 'the proven partial-main-save case saw staged feature state');
    assert.equal(persistedSnapshots[1].presences.length, 0, 'rollback persistence contains restored state');
    assert.equal(events.some(value => Array.isArray(value) && value[0] === 'notification'), false);
}

// A thrown persistence error follows the same narrow rollback path.
{
    const { participant } = reset();
    const before = clone(participant);
    const operation = stagePhysicalOperation('op-throw');
    persistBehaviors.push(new Error('storage write failed'), true);
    assert.throws(() => lifecycle.commitPhysicalAttentionPresence(operation, physicalPayload()), /storage write failed/);
    assert.deepEqual(participant, before);
    assert.equal(user.activeSocialPresences.length, 0);
    assert.equal(persistedSnapshots.length, 2);
}

// Reload normalization never replays arrival notification, even when a durable
// presence has a blank best-effort presentedAt marker.
{
    reset();
    commitPresence('op-reload');
    user.activeSocialPresences[0].presentedAt = '';
    events.length = 0;
    lifecycle.normalizeActiveSocialPresences();
    lifecycle.reconcileActiveSocialPresences(new FakeDate(), { recovering: true });
    assert.equal(events.some(value => Array.isArray(value) && value[0] === 'notification'), false);
}

// Ownership is compare-and-set over only lifecycle-owned presentation fields.
{
    const { participant } = reset();
    commitPresence('op-ownership');
    const record = user.activeSocialPresences[0];
    const ownedKeys = Object.keys(lifecycle.getSocialPresenceOwnedPresentation(participant)).sort();
    assert.deepEqual(ownedKeys, ['mapFurniture', 'mapPoint', 'mapPositionLabel', 'mapRoom', 'mapSpot', 'posture', 'status', 'statusPresentationForm'].sort());
    participant.innerVoice = 'unrelated valid update';
    participant.lastStatusUpdateTime += 123;
    assert.equal(lifecycle.socialPresenceOwnsPresentation(record, participant), true);
    participant.status = '更强的外部状态权威。';
    participant.mapPoint = 'neutral-a';
    participant.mapSpot = 'neutral-a';
    lifecycle.reconcileActiveSocialPresences(new FakeDate());
    assert.equal(user.activeSocialPresences.length, 0);
    assert.equal(participant.status, '更强的外部状态权威。', 'cleanup must not overwrite stronger presentation authority');
    assert.equal(participant.mapPoint, 'neutral-a', 'cleanup must not overwrite stronger map authority');
}

// Two successful plain A turns claim exactly one B-only progression request.
{
    const { anchor, participant } = reset();
    commitPresence('op-stay');
    requestResults.push({ decision: 'stay', content: 'B 又停留片刻，尾巴安静地垂在身后。', status: '正坐在你和 A 身边。', posture: 'sitting' });
    requestCalls.length = 0; events.length = 0;
    assert.equal(lifecycle.advanceActiveSocialPresenceAfterDirect(anchor, new FakeDate()), true);
    assert.equal(requestCalls.length, 0);
    assert.equal(lifecycle.advanceActiveSocialPresenceAfterDirect(anchor, new FakeDate()), true);
    await flush();
    assert.equal(requestCalls.length, 1);
    assert.equal(user.activeSocialPresences[0].progressionState, 'complete');
    assert.equal(participant.statusActivity.posture, 'sitting');
    assert.doesNotMatch(requestCalls[0].prompt, /A_PRIVATE_CANON_SENTINEL|PRIVATE-INNER-VOICE/);
    lifecycle.reconcileActiveSocialPresences(new FakeDate());
    await flush();
    assert.equal(requestCalls.length, 1, 'complete presence cannot issue a second progression request');
}

// Three-minute eligibility works without an A turn; hidden/Phone state does not
// dispatch and does not terminate the presence.
{
    reset();
    commitPresence('op-time');
    requestCalls.length = 0;
    nowMs += lifecycle.ACTIVE_SOCIAL_PRESENCE_PROGRESSION_DELAY_MS;
    refs.currentTab.value = 'phone';
    lifecycle.reconcileActiveSocialPresences(new FakeDate());
    await flush();
    assert.equal(requestCalls.length, 0);
    assert.equal(user.activeSocialPresences.length, 1);
    refs.currentTab.value = 'detail';
    requestResults.push({ decision: 'leave', content: 'B 转身离开了这段互动。', status: '正站回馆内安静的地面。', posture: 'standing' });
    lifecycle.reconcileActiveSocialPresences(new FakeDate());
    await flush();
    assert.equal(requestCalls.length, 1);
    assert.equal(user.activeSocialPresences.length, 0);
}

// A stale progression response cannot overwrite a superseding presentation token.
{
    const { participant } = reset();
    commitPresence('op-progression-token');
    const before = clone(participant);
    const record = user.activeSocialPresences[0];
    requestResults.push(() => {
        record.presentationToken = 'superseding-token';
        return JSON.stringify({ decision: 'stay', content: 'B 又停留片刻。', status: '正坐在身边。', posture: 'sitting' });
    });
    assert.equal(await lifecycle.runActiveSocialPresenceProgression(record), false);
    assert.deepEqual(participant, before);
}

// Request failure and orphaned generating state both deterministically exit;
// maximum lifetime also exits locally without an AI request.
{
    reset();
    commitPresence('op-failure');
    requestCalls.length = 0;
    requestResults.push(new Error('provider unavailable'));
    nowMs += lifecycle.ACTIVE_SOCIAL_PRESENCE_PROGRESSION_DELAY_MS;
    lifecycle.reconcileActiveSocialPresences(new FakeDate());
    await flush();
    assert.equal(requestCalls.length, 1);
    assert.equal(user.activeSocialPresences.length, 0);

    reset();
    commitPresence('op-orphan');
    user.activeSocialPresences[0].progressionState = 'generating';
    user.activeSocialPresences[0].progressionClaimedAt = new FakeDate().toISOString();
    requestCalls.length = 0;
    lifecycle.reconcileActiveSocialPresences(new FakeDate(), { recovering: true });
    assert.equal(user.activeSocialPresences.length, 0);
    assert.equal(requestCalls.length, 0);

    reset();
    commitPresence('op-expiry');
    requestCalls.length = 0;
    nowMs += lifecycle.ACTIVE_SOCIAL_PRESENCE_MAX_LIFETIME_MS;
    lifecycle.reconcileActiveSocialPresences(new FakeDate());
    assert.equal(user.activeSocialPresences.length, 0);
    assert.equal(requestCalls.length, 0);
}

// Away, Curator, form, Hall, Focus, Explore, day and navigation authority remove
// the lifecycle without leaking into another world system.
for (const [label, mutate] of [
    ['away', ({ participant }) => { participant.isOut = true; }],
    ['curator', ({ participant }) => { participant.curatorRoomPresence = { anchor: 'floor' }; }],
    ['form', ({ participant }) => { participant.currentForm = 'HUMAN'; }],
    ['hall', ({ participant }) => { participant.hallId = 'other'; }],
    ['focus', ({ participant }) => { refs.isFocusing.value = true; refs.focusCats.value = [participant]; }],
    ['explore', ({ participant }) => { exploreState.active = true; exploreState.companion = participant; }],
    ['day', () => { nowMs += 24 * 60 * 60 * 1000; }]
]) {
    const state = reset();
    commitPresence(`op-${label}`);
    mutate(state);
    lifecycle.reconcileActiveSocialPresences(new FakeDate());
    assert.equal(user.activeSocialPresences.length, 0, `${label} must invalidate presence`);
}
{
    reset();
    commitPresence('op-navigation');
    lifecycle.terminateActiveSocialPresencesForNavigation({ nextResidentId: 'other', nextHallId: 'h', reason: 'navigation' });
    assert.equal(user.activeSocialPresences.length, 0);
}

// Presentation-only Attention keeps the historical Hall-record behavior and
// does not create physical state or notify.
{
    const { participant } = reset();
    const before = clone(participant);
    const operation = makeOperation('op-observe', 'observe');
    operation.status = 'pending';
    user.attentionBidOpportunities.push(operation);
    requestResults.push({ content: 'B 从远处安静看了你和 A 一眼。' });
    await lifecycle.runAttentionBidOpportunity(operation);
    assert.equal(hallScenesRef.value.length, 1);
    assert.equal(user.activeSocialPresences.length, 0);
    assert.deepEqual(participant, before);
    assert.equal(events.some(value => Array.isArray(value) && value[0] === 'notification'), false);
}

// A superseded generation token cannot commit an older physical response.
{
    const { participant } = reset();
    const before = clone(participant);
    const operation = makeOperation('op-stale-token', 'approach');
    operation.status = 'pending';
    user.attentionBidOpportunities.push(operation);
    requestResults.push(() => {
        operation.generation.token = 'replacement-token';
        operation.status = 'failed';
        return JSON.stringify(physicalPayload());
    });
    await lifecycle.runAttentionBidOpportunity(operation);
    assert.equal(hallScenesRef.value.length, 0);
    assert.equal(user.activeSocialPresences.length, 0);
    assert.deepEqual(participant, before);
}

// Static integration guards cover save/import recovery and transition hooks.
assert.match(appSource, /activeSocialPresences:\s*\[\]/);
assert.match(appSource, /migrateResidentIdField\(record, 'anchorResidentId'/);
assert.match(appSource, /migrateResidentIdField\(record, 'participantResidentId'/);
assert.match(appSource, /normalizeActiveSocialPresences\(\);[\s\S]{0,160}reconcileActiveSocialPresences\(new Date\(\), \{ recovering: true, allowProgression: false \}\)/);
assert.match(appSource, /setInterval\([^\n]*reconcileActiveSocialPresences\(now\)/);
assert.match(appSource, /visibilitychange[^\n]*reconcileActiveSocialPresences\(now\)/);
assert.match(appSource, /terminateActiveSocialPresenceForResident\(cat\.id, 'stronger-authority'\)/);
assert.match(appSource, /terminateActiveSocialPresenceForResident\(caseRecord\.state\?\.companionId, 'stronger-authority'\)/);
assert.match(appSource, /terminateActiveSocialPresenceForResident\(cat\.id, 'stronger-authority'\);[\s\S]{0,160}visitStartedAt/);
assert.match(appSource, /focusCats\.value\.forEach\(cat => terminateActiveSocialPresenceForResident/);
assert.match(appSource, /terminateActiveSocialPresencesForNavigation\(\{ nextHallId: String\(hall\.id\)/);
assert.match(appSource, /AUTOMATIC USER-CONTACT AUTHORITY/);
assert.match(appSource, /getActiveSocialPresenceParticipantIds\(record\?\.hallId\)/);
assert.doesNotMatch(lifecycleSource, /buildCatMemoryContext\(|knowledgeLedger|lifeThreads|innerVoice:/);

console.log(JSON.stringify({
    fixture: 'active-social-presence', status: 'PASS',
    checks: [
        'narrow-bid-classification', 'physical-contract', 'generic-topology', 'atomic-entry', 'rollback',
        'post-commit-notification', 'no-notification-replay', 'owned-field-cas', 'ambient-protection',
        'two-turn-progression', 'three-minute-progression', 'one-request-maximum', 'deterministic-exit',
        'expiry', 'authority-invalidation', 'presentation-only-attention', 'privacy'
    ]
}));
