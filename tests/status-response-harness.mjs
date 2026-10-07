import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (from, to) => {
    const start = html.indexOf(from), end = html.indexOf(to, start);
    assert.ok(start >= 0 && end > start);
    return html.slice(start, end);
};
const clone = value => JSON.parse(JSON.stringify(value));
const makeCat = id => ({ id, name: id, hallId: 'hall', isOut: false,
    currentForm: 'CAT', hasRevealedHumanForm: true, lastFormChangeAt: 'initial',
    status: '正在站着等待。', innerVoice: 'prior', statusActivity: { posture: 'standing' },
    mapRoom: 'living', mapPoint: 'prior', logs: [] });
const rows = residents => residents.map(cat => ({ id: cat.id, status: '正在站着看窗外。',
    innerVoice: 'new voice', posture: 'standing', formDecision: 'CAT', isOut: false }));
function harness(residents, item = false) {
    let resolve, reject, requested = false, itemCommits = 0;
    const response = new Promise((yes, no) => { resolve = yes; reject = no; });
    let durable;
    const logs = [], markers = new Map(), hall = { id: 'hall', name: 'Hall' };
    const ctx = { window: {}, Date, Map, Set, console: { error() {} },
        mapCatVisualRevision: { value: 0 }, cats: { value: residents }, halls: { value: [hall] }, currentHall: { value: hall }, activeHallId: { value: 'hall' },
        settings: { apiKey: 'fixture', autoUpdate: true }, user: {}, isUpdatingStatus: { value: false },
        alfredMessage: {}, todayEvent: {}, CORE_ROLEPLAY_PROMPT: '', ThinkingLevel: { LOW: 0 },
        FORM_VALUES: new Set(['CAT', 'HUMAN']), STATUS_DAY_REFRESH_PENDING_KEY: 'refresh',
        localStorage: { getItem: key => markers.get(key), setItem: (key, value) => markers.set(key, value), removeItem: key => markers.delete(key) },
        addLog: (...args) => logs.push(args), showToast() {}, getReadableAPIError: error => error.message,
        cleanText: value => String(value ?? '').trim(), truncateMemoryText: value => value,
        getOperationalDayKey: () => '2026-09-30', getCurrentTimeStr: () => '12:00',
        getCatHallId: cat => cat.hallId, isResidentAway: cat => cat.isOut,
        getActiveAwayEpisode: cat => cat.awayEpisode,
        getCuratorRoomPresence: cat => cat?.curatorRoomPresence,
        getCuratorRoomAnchor: cat => cat?.curatorRoomPresence?.anchor || 'floor',
        isResidentInCuratorRoom: cat => Boolean(cat?.curatorRoomPresence),
        reconcileAwayEpisodes: () => ({ returnedResidentIds: [] }),
        getResidentPublicName: cat => cat.name, getResidentBreedDisplay: () => '',
        getResidentLiveStatus: cat => cat.status, getRecentAwayReturn: () => null,
        getRelationshipBaseline: () => null, isResidentInHall: cat => !cat.isOut && !cat.curatorRoomPresence,
        buildStatusSyncUserContext: () => '', buildFridgeNoteReactionCandidates: () => [],
        buildFridgeNoteReactionPromptContract: () => '', buildAwayPromptContract: () => ({ mode: 'none', instructions: '' }),
        AWAY_PROMPT_MODES: { NO_AWAY_WORK: 'none' },
        getAwayHomeReserve: () => ({ currentHomeCount: 10, minimumHome: 1 }),
        formatAwayLocalScheduleLog: () => '', prepareStatusSyncAwayMailDecisions: () => ({}),
        claimFrozenOrdinaryAwayDeparture() {}, releaseFrozenOrdinaryAwayDeparture() {},
        buildStructuredPersonalityContext: () => '', getActiveSocialPresenceParticipantIds: () => [],
        buildResidentPublicNameContract: () => '', getInteractionHolidayContext: () => '',
        getCompactMapPointPromptGuide: () => '',
        estimatePromptBudget: () => ({ totalPromptChars: 0, componentChars: {} }),
        parseAIJSON: JSON.parse, indexAwayPlans: () => new Map(),
        isControlPlaneStatusText: () => false, isPermanentOutBuiltin: () => false,
        findMapPoint: () => null, MAP_ROOM_DEFINITIONS: [], inferMapRoomFromStatus: () => 'living',
        appendMonitorEvent() {}, normalizeResidentFormState() {}, scheduleNextFormReconsideration() {},
        terminateActiveSocialPresenceForResident() {},
        formatAwayDecisionSummary: () => '', commitFridgeNoteReactionOpportunities() {},
        shouldCommitHallStatusFreshness: () => false, reconcileActiveSocialPresences() {}, reconcileResidentEpisodeCopy() {},
        callAI: () => { requested = true; return response; }
    };
    vm.createContext(ctx);
    vm.runInContext(readFileSync(new URL('../js/meeow-semantics.js', import.meta.url), 'utf8'), ctx);
    vm.runInContext(readFileSync(new URL('../js/meeow-resident-copy-library.js', import.meta.url), 'utf8'), ctx);
    vm.runInContext(readFileSync(new URL('../js/meeow-resident-copy.js', import.meta.url), 'utf8'), ctx);
    vm.runInContext(readFileSync(new URL('../js/meeow-status-posture.js', import.meta.url), 'utf8'), ctx);
    ctx.statusPosture = ctx.window.Meeow.statusPosture;
    ctx.window.Meeow.residentGeneration = {
        validateArrivalPresentation: () => true, getResidentArrivalStatusContext: () => ''
    };
    ctx.window.Meeow.residentItemUsage = {
        freezeItemUseDecision: ({ residentId }) => item ? { event: { residentId, itemName: '球', eventId: residentId } } : null,
        buildStatusItemUseContext: () => '', getItemUseFallback: () => '正在站着看球。',
        commitItemUse() { itemCommits++; assert.fail('stale ownership must not commit item use'); }
    };
    if (item === 'real') {
        for (const name of ['semantics', 'resident-items', 'resident-item-usage'])
            vm.runInContext(readFileSync(new URL(`../js/meeow-${name}.js`, import.meta.url), 'utf8'), ctx);
        const usage = ctx.window.Meeow.residentItemUsage;
        ctx.user.inventory = [];
        ctx.user.residentItems = { one: [{ uniqueId: 'toy', name: '球', type: 'collectible',
            semanticType: 'toy', sourceCatalogId: 'catalog',
            tags: ['role:play', 'interaction:chase', 'stimulus:rolling'],
            provenance: ctx.window.Meeow.residentItems.makeProvenance() }] };
        ctx.window.Meeow.residentItems.normalizeResidentItemBonds(ctx.user, residents);
        const freeze = usage.freezeItemUseDecision;
        usage.freezeItemUseDecision = args => freeze({ ...args, random: () => 0,
            makeEventId: () => 'resident-item-use:00000000-0000-4000-8000-000000000111' });
        ctx.buildSaveData = () => ({ user: ctx.user, cats: residents });
        ctx.window.Meeow.storage = { persistSnapshot(snapshot) {
            assert.equal(residents[0].innerVoice, 'prior', 'item presentation persists before publication');
            durable = clone(snapshot); return true;
        } };
    }
    vm.runInContext([
        section('const normalizeFormValue =', '// Development-only spatial proof.'),
        section('const getLeanResidentPresence =', 'const buildForegroundUserRelationshipBaseline ='),
        section('const getCuratorRoomSyncKey =', '// Legacy entry hooks'),
        section('const setResidentForm =', 'const unlockResidentHumanForm ='),
        section('const parseCanonicalFormDecision =', 'const buildFormDirectives ='),
        section('const classifyFormDirectiveCompatibility =', 'cats.value.forEach(cat => {'),
        section('const getRelationshipNumber =', 'const isValidCanonicalRelationshipDimension ='),
        section('const getArchiveRelationshipLink =', 'const getResidentHomeHallId ='),
        section('const getEffectiveRelationshipProjection =', 'const getRelationshipEventTime ='),
        section('const getResidentCopyRelationship =', 'const getResidentCopyContext ='),
        section('const setCatStatus =', 'const appendAwayTransitionTravelogue ='),
        section('const STATUS_SYNC_RESIDENT_ROW_TARGET_CHARS', 'const _refreshAllStatus = async'),
        section('const validateStatusSyncUpdates =', 'const validateOptionalHallScene ='),
        section('const _refreshAllStatus = async', '// A full Hall-wide Status success'),
        'globalThis.refresh = _refreshAllStatus;'
    ].join('\n'), ctx);
    const start = (options = {}) => {
        const statusCompletion = {};
        const directives = Object.fromEntries(residents.map(cat => [cat.id, {
            currentForm: cat.currentForm, targetForm: cat.currentForm, transitioned: false, automatic: false
        }]));
        const task = ctx.refresh(true, '', [], '', false, false, {
            statusCompletion, lifeThreadCaptureEnabled: false, formDirectives: directives,
            isCurrentStatusRequest: () => true, ...options
        });
        assert.equal(requested, true, `test must reach the actual async production boundary: ${JSON.stringify(logs)}`);
        return { task, statusCompletion };
    };
    return { ctx, hall, markers, logs, start, resolve: updates => resolve(JSON.stringify({ updates, awayPlans: [] })),
        reject, itemCommits: () => itemCommits, durable: () => durable };
}

export { harness, makeCat, rows, section, clone };
