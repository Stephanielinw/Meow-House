import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const normalizerStart = appSource.indexOf('const normalizeHallStatusSyncTimestamp');
const normalizerEnd = appSource.indexOf('const mergeBuiltInCats', normalizerStart);
assert.ok(normalizerStart >= 0 && normalizerEnd > normalizerStart, 'Hall timestamp normalizer must exist.');
const normalizerSandbox = { Date };
vm.runInNewContext(`${appSource.slice(normalizerStart, normalizerEnd)}\nglobalThis.normalize = normalizeHallStatusSyncTimestamp;`, normalizerSandbox, { filename: 'index.html:hall-status-normalizer' });
assert.equal(normalizerSandbox.normalize('not-a-date'), '');
assert.equal(normalizerSandbox.normalize(null), '');
assert.equal(normalizerSandbox.normalize('2026-09-01T12:00:00.000Z'), '2026-09-01T12:00:00.000Z');
const schedulerStart = appSource.indexOf('const HALL_AMBIENT_REFRESH_STALE_MS');
const schedulerEnd = appSource.indexOf('const handleIcsImport', schedulerStart);
assert.ok(schedulerStart >= 0 && schedulerEnd > schedulerStart, 'Homepage ambient scheduler helpers must exist.');
const schedulerSource = appSource.slice(schedulerStart, schedulerEnd);
const hallContextStart = appSource.indexOf('const isContextuallyViewingHallPresentation');
const hallContextEnd = appSource.indexOf('const HALL_ENTRY_REFRESH_COOLDOWN_MS', hallContextStart);
assert.ok(hallContextStart >= 0 && hallContextEnd > hallContextStart, 'Hall presentation context helper must exist.');
const hallContextSource = appSource.slice(hallContextStart, hallContextEnd);
const statusSettlementStart = appSource.indexOf('const isQualifyingHallWidePresentationStatusRequest');
const statusSettlementEnd = appSource.indexOf('const refreshAllStatus', statusSettlementStart);
assert.ok(statusSettlementStart >= 0 && statusSettlementEnd > statusSettlementStart, 'Hall-wide ambient supersession helpers must exist.');
const statusSettlementSource = appSource.slice(statusSettlementStart, statusSettlementEnd);

const now = Date.now();
const makeHall = (id, lastSuccessfulStatusSyncAt = '') => ({ id, name: `Hall ${id}`, lastSuccessfulStatusSyncAt });
const makeResident = (id, hallId, overrides = {}) => ({ id, hallId, physicalHallId: hallId, ...overrides });
const calls = [];
let nextResult = true;
const sandbox = {
    Date,
    Map,
    Set,
    console,
    HOMEPAGE_DIRECT_FRESHNESS_MS: 20 * 60 * 1000,
    homepageHallAmbientRefreshPending: new Map(),
    hallStatusRefreshPending: new Map(),
    statusRefreshInFlight: new Map(),
    activeHallId: { value: 'a' },
    currentTab: { value: 'lounge' },
    loungeView: { value: 'room' },
    selectedCat: { value: null },
    detailReturnOrigin: { value: '' },
    hallSceneActive: { value: true },
    halls: { value: [makeHall('a'), makeHall('b')] },
    cats: { value: [] },
    isResidentAway: cat => Boolean(cat?.away),
    isResidentInCuratorRoom: cat => Boolean(cat?.curator),
    getResidentPhysicalHallId: cat => String(cat?.physicalHallId || ''),
    addLog: () => {},
    showToast: () => {},
    refreshAllStatus: (...args) => {
        calls.push(args);
        return Promise.resolve(nextResult);
    }
};
vm.runInNewContext(`${statusSettlementSource}
globalThis.statusSettlement = {
  isQualifyingHallWidePresentationStatusRequest,
  consumeSupersededHomepageHallAmbientRefresh,
  settleHallStatusRefresh
};`, sandbox, { filename: 'index.html:hall-status-settlement' });
vm.runInNewContext(`${hallContextSource}
${schedulerSource}
globalThis.scheduler = {
  isContextuallyViewingHallPresentation,
  getHallLastSuccessfulStatusSyncMs,
  isHallAmbientRefreshFresh,
  queueHomepageHallAmbientRefresh,
  getHomepageAmbientProtectedResidentIds,
  reconcileHomepageHallAmbientRefreshes,
  pending: homepageHallAmbientRefreshPending
};`, sandbox, { filename: 'index.html:homepage-ambient-refresh' });
const scheduler = sandbox.scheduler;
const statusSettlement = sandbox.statusSettlement;
const flush = () => new Promise(resolve => setImmediate(resolve));
const hall = id => sandbox.halls.value.find(entry => entry.id === id);
const reset = () => {
    calls.length = 0;
    nextResult = true;
    scheduler.pending.clear();
    sandbox.hallStatusRefreshPending.clear();
    sandbox.statusRefreshInFlight.clear();
    sandbox.activeHallId.value = 'a';
    sandbox.currentTab.value = 'lounge';
    sandbox.loungeView.value = 'room';
    sandbox.selectedCat.value = null;
    sandbox.detailReturnOrigin.value = '';
    sandbox.hallSceneActive.value = true;
    sandbox.halls.value = [makeHall('a'), makeHall('b')];
    sandbox.cats.value = [];
};

// A successful full-Hall refresh supersedes only an older pending ambient
// opportunity for that same Hall. Offscreen retention itself does not clear it,
// and a later stale Hall cannot resurrect the consumed record.
reset();
scheduler.pending.set('a', { hallId: 'a', queuedAt: now - 60_000, lastQueuedAt: now - 60_000 });
assert.equal(statusSettlement.isQualifyingHallWidePresentationStatusRequest({ requestOptions: {}, activeCatIds: [] }), true);
statusSettlement.settleHallStatusRefresh({
    requestHallId: 'a', didRefresh: true, qualifyingHallWideRefresh: true, successfulAt: now,
    trackBackgroundPending: false
});
assert.equal(scheduler.pending.has('a'), false, 'a later successful full-Hall refresh must consume the older ambient opportunity');
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
sandbox.cats.value = [makeResident('a1', 'a'), makeResident('a2', 'a')];
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now + 21 * 60 * 1000));
assert.equal(calls.length, 0, 'a superseded opportunity must not resurrect once Hall freshness becomes stale again');

// Failures and narrow resident-only Status paths cannot satisfy the Hall-wide
// presentation opportunity; neither can a successful refresh in another Hall.
reset();
const setPendingA = () => scheduler.pending.set('a', { hallId: 'a', queuedAt: now - 60_000, lastQueuedAt: now - 60_000 });
setPendingA();
statusSettlement.settleHallStatusRefresh({ requestHallId: 'a', didRefresh: false, qualifyingHallWideRefresh: true, trackBackgroundPending: false });
assert.equal(scheduler.pending.has('a'), true, 'failed Hall refresh must not consume pending ambient work');
assert.equal(statusSettlement.isQualifyingHallWidePresentationStatusRequest({ requestOptions: { skipHallFreshnessCommit: true }, activeCatIds: [], isExploreEnd: true }), false);
statusSettlement.settleHallStatusRefresh({ requestHallId: 'a', didRefresh: true, qualifyingHallWideRefresh: false, successfulAt: now, trackBackgroundPending: false });
assert.equal(scheduler.pending.has('a'), true, 'Explore-return narrow Status must not supersede Hall ambient work');
assert.equal(statusSettlement.isQualifyingHallWidePresentationStatusRequest({ requestOptions: { curatorRoomStatusSync: { residentId: 'a1' }, frozenCatsToUpdate: [{}] }, activeCatIds: [] }), false);
statusSettlement.settleHallStatusRefresh({ requestHallId: 'a', didRefresh: true, qualifyingHallWideRefresh: false, successfulAt: now, trackBackgroundPending: false });
assert.equal(scheduler.pending.has('a'), true, 'Curator isolated Status must not supersede Hall ambient work');
statusSettlement.settleHallStatusRefresh({ requestHallId: 'b', didRefresh: true, qualifyingHallWideRefresh: true, successfulAt: now, trackBackgroundPending: false });
assert.equal(scheduler.pending.has('a'), true, 'Hall B success must not consume Hall A pending work');
assert.equal(statusSettlement.isQualifyingHallWidePresentationStatusRequest({ requestOptions: { frozenCatsToUpdate: [{}] }, activeCatIds: [] }), false);
assert.equal(statusSettlement.isQualifyingHallWidePresentationStatusRequest({ requestOptions: {}, activeCatIds: ['a1'] }), false);

// Hall freshness is independent. A successful Status Sync in Hall B cannot
// postpone stale pending work in Hall A, and vice versa.
reset();
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
hall('b').lastSuccessfulStatusSyncAt = new Date(now).toISOString();
const a1 = makeResident('a1', 'a');
const a2 = makeResident('a2', 'a');
sandbox.cats.value = [a1, a2, makeResident('b1', 'b')];
assert.equal(scheduler.queueHomepageHallAmbientRefresh(a1, now - 60_000), true);
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 1);
assert.equal(calls[0][6].requestHallId, 'a');
await flush();

reset();
hall('a').lastSuccessfulStatusSyncAt = new Date(now).toISOString();
hall('b').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
sandbox.activeHallId.value = 'b';
const b1 = makeResident('b1', 'b');
const b2 = makeResident('b2', 'b');
sandbox.cats.value = [makeResident('a1', 'a'), b1, b2];
assert.equal(scheduler.queueHomepageHallAmbientRefresh(b1, now - 60_000), true);
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 1);
assert.equal(calls[0][6].requestHallId, 'b');
await flush();

// A fresh Hall coalesces multiple direct replies without dispatching. When its
// own Hall timestamp becomes stale, protected residents are derived per ID.
reset();
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 2 * 60 * 1000).toISOString();
const protectedA = makeResident('a', 'a');
const protectedB = makeResident('b', 'a');
const bystander = makeResident('c', 'a');
sandbox.cats.value = [protectedA, protectedB, bystander];
assert.equal(scheduler.queueHomepageHallAmbientRefresh(protectedA, now - 20 * 60 * 1000), true);
assert.equal(scheduler.queueHomepageHallAmbientRefresh(protectedB, now - 12 * 60 * 1000), true);
assert.equal(scheduler.pending.size, 1);
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 0, 'fresh Hall must not issue Status early');
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 1);
assert.deepEqual([...calls[0][2]], ['b'], 'A has expired while B remains protected by its newer direct reply');
assert.equal(calls[0][6].activeIdsAreExclusionsOnly, true);
assert.equal(calls[0][1], '');
await flush();

// No request is made when every physical resident is still protected.
reset();
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
const onlyA = makeResident('only-a', 'a');
sandbox.cats.value = [onlyA];
scheduler.queueHomepageHallAmbientRefresh(onlyA, now - 60_000);
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 0);

// Curator/Away/cross-Hall residents never create a normal Hall opportunity;
// a visitor physically in the current Hall remains eligible.
reset();
sandbox.cats.value = [];
assert.equal(scheduler.queueHomepageHallAmbientRefresh(makeResident('away', 'a', { away: true }), now), false);
assert.equal(scheduler.queueHomepageHallAmbientRefresh(makeResident('curator', 'a', { curator: true }), now), false);
assert.equal(scheduler.queueHomepageHallAmbientRefresh(makeResident('other', 'b'), now), false);
assert.equal(scheduler.queueHomepageHallAmbientRefresh(makeResident('visitor', 'a', { visiting: true }), now), true);

// Hall presentation is navigation-owned. Pending work remains intact while
// the USER is in a non-Hall surface, then dispatches once after a real return.
for (const surface of [
    () => { sandbox.currentTab.value = 'lounge'; sandbox.loungeView.value = 'curator'; },
    () => { sandbox.currentTab.value = 'phone'; },
    () => { sandbox.currentTab.value = 'lounge'; sandbox.loungeView.value = 'selector'; },
    () => { sandbox.currentTab.value = 'explore'; }
]) {
    reset();
    hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
    sandbox.cats.value = [makeResident('a1', 'a'), makeResident('a2', 'a')];
    scheduler.queueHomepageHallAmbientRefresh(sandbox.cats.value[0], now - 60_000);
    surface();
    assert.equal(scheduler.isContextuallyViewingHallPresentation('a'), false);
    scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
    assert.equal(calls.length, 0);
    assert.equal(scheduler.pending.size, 1, 'offscreen pending work must remain queued');
    sandbox.currentTab.value = 'lounge';
    sandbox.loungeView.value = 'room';
    scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
    assert.equal(calls.length, 1, 'returning to the Hall may dispatch the retained opportunity');
    await flush();
}

// A Hall-origin resident detail remains Hall observation, but stale/mismatched
// details and every Curator-origin detail are excluded.
reset();
sandbox.currentTab.value = 'detail';
sandbox.selectedCat.value = makeResident('a1', 'a');
assert.equal(scheduler.isContextuallyViewingHallPresentation('a'), true);
assert.equal(scheduler.isContextuallyViewingHallPresentation('b'), false);
sandbox.detailReturnOrigin.value = 'curator';
assert.equal(scheduler.isContextuallyViewingHallPresentation('a'), false);
sandbox.detailReturnOrigin.value = '';
sandbox.selectedCat.value = makeResident('b1', 'b');
assert.equal(scheduler.isContextuallyViewingHallPresentation('a'), false);
sandbox.selectedCat.value = makeResident('a1', 'a', { curator: true });
assert.equal(scheduler.isContextuallyViewingHallPresentation('a'), false);

// A pending Hall must not dispatch while another Hall is being observed.
reset();
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
sandbox.cats.value = [makeResident('a1', 'a'), makeResident('a2', 'a')];
scheduler.queueHomepageHallAmbientRefresh(sandbox.cats.value[0], now - 60_000);
sandbox.activeHallId.value = 'b';
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 0);
assert.equal(scheduler.pending.size, 1);
sandbox.activeHallId.value = 'a';
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 1);
await flush();

// An in-flight Status request is never joined with a newly computed exclusion
// set, and a failed dispatch is delayed rather than retried on every world tick.
reset();
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
sandbox.cats.value = [makeResident('active', 'a'), makeResident('other', 'a')];
scheduler.queueHomepageHallAmbientRefresh(sandbox.cats.value[0], now - 60_000);
sandbox.statusRefreshInFlight.set('a', {});
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 0);
sandbox.statusRefreshInFlight.clear();
nextResult = false;
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 1);
await flush();
const failedRecord = scheduler.pending.get('a');
assert.ok(failedRecord?.retryAt > Date.now());
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now + 30_000));
assert.equal(calls.length, 1, 'failure must not retry on the next world tick');
failedRecord.retryAt = 0;
nextResult = true;
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now + 21 * 60 * 1000));
assert.equal(calls.length, 2, 'a later normal retry remains eligible');
await flush();

// A foreground Hall-entry request blocks an ambient launch. Once that entry
// completes and makes the Hall fresh, the retained ambient record cannot fire
// immediately as a redundant second request.
reset();
hall('a').lastSuccessfulStatusSyncAt = new Date(now - 21 * 60 * 1000).toISOString();
sandbox.cats.value = [makeResident('active', 'a'), makeResident('other', 'a')];
scheduler.queueHomepageHallAmbientRefresh(sandbox.cats.value[0], now - 60_000);
sandbox.statusRefreshInFlight.set('a', { priority: 'foreground' });
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 0);
sandbox.statusRefreshInFlight.clear();
hall('a').lastSuccessfulStatusSyncAt = new Date(now).toISOString();
scheduler.reconcileHomepageHallAmbientRefreshes(new Date(now));
assert.equal(calls.length, 0);
assert.equal(scheduler.pending.size, 1);

// Execute the legacy auto-sync control flow with the real context helper. A
// skipped offscreen Hall cannot fall through into the successful-sync follow-up.
const autoStart = appSource.indexOf('const autoUpdateLogic');
const autoEnd = appSource.indexOf('const checkMailboxLogic', autoStart);
assert.ok(autoStart >= 0 && autoEnd > autoStart, 'Legacy auto-sync helper must exist.');
const autoSource = appSource.slice(autoStart, autoEnd);
const makeAutoSandbox = ({ tab = 'lounge', view = 'room' } = {}) => {
    let statusCalls = 0;
    let mailboxCalls = 0;
    const autoSandbox = {
        Date,
        settings: { autoUpdate: true },
        activeHallId: { value: 'a' },
        currentTab: { value: tab },
        loungeView: { value: view },
        selectedCat: { value: null },
        detailReturnOrigin: { value: '' },
        hallSceneActive: { value: true },
        isResidentAway: cat => Boolean(cat?.away),
        isResidentInCuratorRoom: cat => Boolean(cat?.curator),
        getResidentPhysicalHallId: cat => String(cat?.physicalHallId || ''),
        localStorage: { getItem: () => '0' },
        addLog: () => {},
        refreshAllStatus: async () => { statusCalls += 1; return true; },
        checkMailboxLogic: async () => { mailboxCalls += 1; }
    };
    autoSandbox.globalThis = autoSandbox;
    vm.runInNewContext(`${hallContextSource}\n${autoSource}\nglobalThis.autoUpdate = autoUpdateLogic;`, autoSandbox, { filename: 'index.html:auto-update' });
    return { run: autoSandbox.autoUpdate, get statusCalls() { return statusCalls; }, get mailboxCalls() { return mailboxCalls; } };
};
const autoInHall = makeAutoSandbox();
await autoInHall.run();
assert.equal(autoInHall.statusCalls, 1);
assert.equal(autoInHall.mailboxCalls, 1);
const autoOnPhone = makeAutoSandbox({ tab: 'phone' });
await autoOnPhone.run();
assert.equal(autoOnPhone.statusCalls, 0);
assert.equal(autoOnPhone.mailboxCalls, 0);

// Integration guards: Hall-owned timestamp writes only after a non-Curator
// complete Status success, while the exclusion-only path never emits the old
// shared ACTIVE INTERACTION addendum.
assert.match(appSource, /lastSuccessfulStatusSyncAt/);
assert.match(appSource, /lastSuccessfulStatusSyncAt: normalizeHallStatusSyncTimestamp\(savedHall\.lastSuccessfulStatusSyncAt\)/);
assert.match(appSource, /const persistedHall = halls\.value\.find/);
assert.match(appSource, /if \(!curatorRoomStatusSync\) \{\s*const completedStatusSyncAt/s);
assert.match(appSource, /activeIdsAreExclusionsOnly = requestOptions\.activeIdsAreExclusionsOnly === true/);
assert.match(appSource, /activeCatNames\.length > 0 && !activeIdsAreExclusionsOnly/);
assert.match(appSource, /frozenCatsToUpdate: \[cat\],[\s\S]{0,1000}curatorRoomStatusSync:/);
assert.match(appSource, /setInterval\(\(\) => \{ const now = new Date\(\); reconcileAwayEpisodes\(now\)/);
assert.doesNotMatch(hallContextSource, /reconcileAwayEpisodes|reconcilePhoneReplyOpportunities|reconcileLifeThreadContinuations/);
assert.doesNotMatch(schedulerSource, /recentConversation|episodicMemory|knowledgeLedger|memoryCandidate/);

console.log(JSON.stringify({
    fixture: 'homepage-ambient-refresh',
    status: 'PASS',
    checks: ['per-hall-freshness', 'coalescing', 'per-resident-protection', 'failure-delay', 'hall-presentation-isolation', 'entry-no-duplicate', 'legacy-auto-gate', 'prompt-isolation']
}));
