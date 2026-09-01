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
    statusRefreshInFlight: new Map(),
    activeHallId: { value: 'a' },
    halls: { value: [makeHall('a'), makeHall('b')] },
    cats: { value: [] },
    isResidentAway: cat => Boolean(cat?.away),
    isResidentInCuratorRoom: cat => Boolean(cat?.curator),
    getResidentPhysicalHallId: cat => String(cat?.physicalHallId || ''),
    addLog: () => {},
    refreshAllStatus: (...args) => {
        calls.push(args);
        return Promise.resolve(nextResult);
    }
};
vm.runInNewContext(`${schedulerSource}
globalThis.scheduler = {
  getHallLastSuccessfulStatusSyncMs,
  isHallAmbientRefreshFresh,
  queueHomepageHallAmbientRefresh,
  getHomepageAmbientProtectedResidentIds,
  reconcileHomepageHallAmbientRefreshes,
  pending: homepageHallAmbientRefreshPending
};`, sandbox, { filename: 'index.html:homepage-ambient-refresh' });
const scheduler = sandbox.scheduler;
const flush = () => new Promise(resolve => setImmediate(resolve));
const hall = id => sandbox.halls.value.find(entry => entry.id === id);
const reset = () => {
    calls.length = 0;
    nextResult = true;
    scheduler.pending.clear();
    sandbox.statusRefreshInFlight.clear();
    sandbox.activeHallId.value = 'a';
    sandbox.halls.value = [makeHall('a'), makeHall('b')];
    sandbox.cats.value = [];
};

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

// Integration guards: Hall-owned timestamp writes only after a non-Curator
// complete Status success, while the exclusion-only path never emits the old
// shared ACTIVE INTERACTION addendum.
assert.match(appSource, /lastSuccessfulStatusSyncAt/);
assert.match(appSource, /lastSuccessfulStatusSyncAt: normalizeHallStatusSyncTimestamp\(savedHall\.lastSuccessfulStatusSyncAt\)/);
assert.match(appSource, /const persistedHall = halls\.value\.find/);
assert.match(appSource, /if \(!curatorRoomStatusSync\) \{\s*const completedStatusSyncAt/s);
assert.match(appSource, /activeIdsAreExclusionsOnly = requestOptions\.activeIdsAreExclusionsOnly === true/);
assert.match(appSource, /activeCatNames\.length > 0 && !activeIdsAreExclusionsOnly/);
assert.doesNotMatch(schedulerSource, /recentConversation|episodicMemory|knowledgeLedger|memoryCandidate/);

console.log(JSON.stringify({
    fixture: 'homepage-ambient-refresh',
    status: 'PASS',
    checks: ['per-hall-freshness', 'coalescing', 'per-resident-protection', 'failure-delay', 'prompt-isolation']
}));
