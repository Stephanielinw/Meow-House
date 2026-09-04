import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const slice = (startNeedle, endNeedle) => {
    const start = source.indexOf(startNeedle);
    const end = source.indexOf(endNeedle, start);
    assert.ok(start >= 0 && end > start, `missing source range: ${startNeedle}`);
    return source.slice(start, end);
};
const install = (code, exports = {}) => {
    const sandbox = { touchExploreCase() {}, ...exports };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox);
    return sandbox;
};

const exploreCore = slice('const EXPLORE_CASE_VERSION', 'const legacyGenerateExploreGoals');
const archiveUi = slice('<!-- Cat Archive -->', '<!-- Diary/Logs Modal -->');
const statusCore = slice('const _refreshAllStatus', 'const settleHallStatusRefresh');

assert.match(archiveUi, /selectCatArchiveTab\('away'\)[\s\S]{0,500}>离馆<\/button>/);
assert.match(archiveUi, /selectCatArchiveTab\('explore'\)[\s\S]{0,500}>外出<\/button>/);
assert.match(archiveUi, /历史离馆记录/);
assert.match(archiveUi, /离馆时间线/);
assert.match(archiveUi, /外出游记/);
assert.match(source, /const source = tab === 'explore' \? 'explore'/, 'internal archive source remains explore');
assert.match(source, /查看离馆记录/);
assert.match(source, /aria-label="`\$\{awayRecordCat\.name\} 的离馆记录`"/);

assert.match(exploreCore, /new Set\(\['opening', 'user-action', 'narration', 'dice', 'clue-reveal', 'revelation'\]\)/);
assert.match(exploreCore, /entry\?\.public !== true/);
assert.match(exploreCore, /return persistNow\(\) === true/);
assert.match(exploreCore, /程序会独立呈现规范线索文本/);
assert.match(exploreCore, /程序会在内容之外公开展示对应的规范线索文本/);
assert.doesNotMatch(exploreCore, /只有完整原文出现在正文时才可标记发现/);
assert.doesNotMatch(exploreCore, /narration\.content\.includes\(clue\.revealText\)/);
assert.match(exploreCore, /skipHallFreshnessCommit: true/);
assert.match(statusCore, /shouldCommitHallStatusFreshness/);
assert.match(source, /void reconcileIncompleteExploreSettlements\(now\)/);
assert.match(exploreCore, /legacyComplete: true/);
assert.match(exploreCore, /coalesceExploreOperation\(exploreSettlementFlavorInFlight/);
assert.match(exploreCore, /coalesceExploreOperation\(exploreTravelogueInFlight/);
assert.match(source, /const hasOpeningNarration/);

const publicFirstCode = slice('const getExplorePublicEventById', 'const commitExploreSolvedState');
const publicFirst = install(`${publicFirstCode}\nglobalThis.runPublicFirst = runExplorePublicFirstCommit;`);
const runPublicFirst = publicFirst.runPublicFirst;
const makeCase = () => ({ id: 'case-1', publicTranscript: [], state: { history: [], discoveredClueIds: [], revealedRevelationIds: [] } });
const appendPublic = (caseRecord, event) => {
    if (!caseRecord.state.history.some(entry => entry.id === event.id)) caseRecord.state.history.push({ ...event });
    if (!caseRecord.publicTranscript.some(entry => entry.id === event.id)) caseRecord.publicTranscript.push({ ...event });
};
const queuedPersist = outcomes => () => outcomes.length ? outcomes.shift() : true;

{
    const caseRecord = makeCase();
    const ok = runPublicFirst({
        caseRecord, event: { id: 'explore-clue-reveal:case-1:c1', public: true, type: 'clue-reveal', content: '规范线索' },
        authorityIds: caseRecord.state.discoveredClueIds, authorityId: 'c1', appendPublicEvent: appendPublic, persist: queuedPersist([false])
    });
    assert.equal(ok, false);
    assert.equal(caseRecord.publicTranscript.length, 0);
    assert.equal(caseRecord.state.history.length, 0);
    assert.equal(caseRecord.state.discoveredClueIds.length, 0);
}

{
    const caseRecord = makeCase();
    const event = { id: 'explore-clue-reveal:case-1:c1', public: true, type: 'clue-reveal', content: '规范线索' };
    assert.equal(runPublicFirst({ caseRecord, event, authorityIds: caseRecord.state.discoveredClueIds, authorityId: 'c1', appendPublicEvent: appendPublic, persist: queuedPersist([true, false]) }), false);
    assert.equal(caseRecord.publicTranscript.length, 1);
    assert.equal(caseRecord.state.discoveredClueIds.length, 0);
    assert.equal(runPublicFirst({ caseRecord, event, authorityIds: caseRecord.state.discoveredClueIds, authorityId: 'c1', appendPublicEvent: appendPublic, persist: queuedPersist([true]) }), true);
    assert.equal(caseRecord.publicTranscript.length, 1);
    assert.equal(caseRecord.state.discoveredClueIds.join(','), 'c1');
}

{
    const caseRecord = makeCase();
    const event = { id: 'explore-revelation:case-1:r1', public: true, type: 'revelation', content: '公开结论' };
    assert.equal(runPublicFirst({ caseRecord, event, authorityIds: caseRecord.state.revealedRevelationIds, authorityId: 'r1', appendPublicEvent: appendPublic, persist: queuedPersist([true, false]) }), false);
    assert.equal(caseRecord.publicTranscript.length, 1);
    assert.equal(caseRecord.state.revealedRevelationIds.length, 0);
    assert.equal(['r1'].every(id => caseRecord.state.revealedRevelationIds.includes(id)), false);
    assert.equal(runPublicFirst({ caseRecord, event, authorityIds: caseRecord.state.revealedRevelationIds, authorityId: 'r1', appendPublicEvent: appendPublic, persist: queuedPersist([true]) }), true);
    assert.equal(caseRecord.publicTranscript.length, 1);
    assert.equal(['r1'].every(id => caseRecord.state.revealedRevelationIds.includes(id)), true);
}

{
    const caseRecord = makeCase();
    const event = { id: 'explore-revelation:case-1:r1', public: true, type: 'revelation', content: '公开结论' };
    assert.equal(runPublicFirst({ caseRecord, event, authorityIds: caseRecord.state.revealedRevelationIds, authorityId: 'r1', appendPublicEvent: appendPublic, persist: queuedPersist([false]) }), false);
    assert.equal(caseRecord.publicTranscript.length, 0);
    assert.equal(caseRecord.state.revealedRevelationIds.length, 0);
}

{
    const caseRecord = makeCase();
    let openingNarrationStarted = false;
    const ready = runPublicFirst({
        caseRecord, event: { id: 'explore-opening:case-1', public: true, type: 'opening', content: '外出调查开始：公开钩子' },
        appendPublicEvent: appendPublic, persist: queuedPersist([true])
    });
    if (ready) openingNarrationStarted = true;
    assert.equal(openingNarrationStarted, true);
    assert.equal(caseRecord.publicTranscript[0].type, 'opening');
    const failedCase = makeCase();
    assert.equal(runPublicFirst({ caseRecord: failedCase, event: { id: 'explore-opening:case-1', public: true, type: 'opening', content: '公开钩子' }, appendPublicEvent: appendPublic, persist: queuedPersist([false]) }), false);
    assert.equal(failedCase.publicTranscript.length, 0);
}

const coalescerCode = slice('const coalesceExploreOperation', 'const ensureExploreSettlementOperation');
const coalescer = install(`${coalescerCode}\nglobalThis.coalesce = coalesceExploreOperation;`).coalesce;
{
    let dispatches = 0;
    let resolve;
    const deferred = new Promise(done => { resolve = done; });
    const inFlight = new Map();
    const first = coalescer(inFlight, 'explore-settlement:case-1', () => { dispatches += 1; return deferred; });
    const second = coalescer(inFlight, 'explore-settlement:case-1', () => { dispatches += 1; return deferred; });
    assert.strictEqual(first, second);
    resolve('ready');
    assert.equal(await first, 'ready');
    assert.equal(dispatches, 1);
    assert.equal(inFlight.size, 0);
}

{
    let dispatches = 0;
    let resolve;
    const deferred = new Promise(done => { resolve = done; });
    const inFlight = new Map();
    const travelogues = [];
    const logs = [];
    const createTravelogue = () => coalescer(inFlight, 'explore-settlement:case-1', async () => {
        dispatches += 1;
        await deferred;
        travelogues.push({ sourceId: 'explore-settlement:case-1:travelogue' });
        logs.push({ sourceId: 'explore-settlement:case-1:travelogue' });
        return '游记已冻结';
    });
    const first = createTravelogue();
    const second = createTravelogue();
    resolve();
    assert.equal(await first, '游记已冻结');
    assert.equal(await second, '游记已冻结');
    assert.equal(dispatches, 1);
    assert.equal(travelogues.length, 1);
    assert.equal(logs.length, 1);
}

const retryCode = slice('const getExploreTravelogueRetryMs', 'const generateExploreTravelogue');
const retryHelpers = install(`${retryCode}\nglobalThis.canRun = canRunExploreTravelogueAttempt;`);
assert.equal(retryHelpers.canRun({ travelogue: { status: 'retryable', retryAt: '2030-01-01T00:00:00.000Z' } }, Date.parse('2029-12-31T23:59:59.000Z')), false);
assert.equal(retryHelpers.canRun({ travelogue: { status: 'retryable', retryAt: '2030-01-01T00:00:00.000Z' } }, Date.parse('2030-01-01T00:00:00.000Z')), true);

const freshnessCode = slice('const shouldCommitHallStatusFreshness', '// Status Sync is a shared model request');
const freshness = install(`${freshnessCode}\nglobalThis.shouldCommit = shouldCommitHallStatusFreshness;`).shouldCommit;
assert.equal(freshness({ skipHallFreshnessCommit: true }), false);
assert.equal(freshness({ curatorRoomStatusSync: { residentId: 'c1' } }), false);
assert.equal(freshness({}), true);

assert.equal((source.match(/callAI\s*\(/g) || []).length, 40, 'Explore durability work adds no callAI site');

console.log(JSON.stringify({
    fixture: 'explore-lifecycle-integrity',
    status: 'PASS',
    checks: ['archive-semantics', 'public-transcript', 'public-first-clue-revelation', 'opening-hook', 'settlement-coalescing', 'retry-gate', 'return-freshness-isolation', 'temporal-authority', 'callAI-budget']
}));
