import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const postureSource = fs.readFileSync(new URL('../js/meeow-status-posture.js', import.meta.url), 'utf8');
const visualSource = fs.readFileSync(new URL('../js/meeow-resident-visual.js', import.meta.url), 'utf8');
const awaySource = fs.readFileSync(new URL('../js/meeow-away.js', import.meta.url), 'utf8');
const inventorySource = fs.readFileSync(new URL('../js/meeow-inventory.js', import.meta.url), 'utf8');

const sandbox = vm.createContext({ window: {}, console, Date, Math, Uint8ClampedArray });
vm.runInContext(postureSource, sandbox, { filename: 'meeow-status-posture.js' });
const posture = sandbox.window.Meeow.statusPosture;

// Model normalization is strict, non-destructive to unrelated fields, and legacy-safe.
assert.deepEqual(Array.from(posture.VALID_POSTURES), ['standing', 'sitting', 'lying', 'crouching']);
const realmActivity = vm.runInContext('({ posture: "lying" })', sandbox);
assert.deepEqual({ ...posture.normalizeStatusActivity(realmActivity) }, { posture: 'lying' });
for (const invalid of [null, [], 'standing', { posture: 'sleeping' }, { posture: '' }]) {
    assert.equal(posture.normalizeStatusActivity(invalid), null);
}
const malformedResident = { id: 'legacy', status: '看着窗外', statusActivity: { posture: 'sleeping' }, visual: { keep: true }, extra: 7 };
posture.normalizeResidentStatusActivity(malformedResident);
assert.equal(Object.hasOwn(malformedResident, 'statusActivity'), false);
assert.deepEqual(malformedResident.visual, { keep: true });
assert.equal(malformedResident.extra, 7);

// The transition helper stages coherent fields without mutating before commit.
const atomicResident = { id: 'atomic', status: '正站着看窗外', statusActivity: { posture: 'standing' }, visual: { identityConfig: { body: 'chubby' } } };
const atomicBefore = JSON.stringify(atomicResident);
const staged = posture.prepareStatusTransition(atomicResident, '正趴着睡觉', 'lying');
assert.equal(staged.valid, true);
assert.equal(JSON.stringify(atomicResident), atomicBefore);
assert.deepEqual({ ...staged.fields.statusActivity }, { posture: 'lying' });
const rejected = posture.prepareStatusTransition(atomicResident, '正站着看窗外', 'lying');
assert.equal(rejected.valid, false);
assert.equal(rejected.fields, null);
assert.equal(JSON.stringify(atomicResident), atomicBefore);

// Only clear contradictions reject; generic activity and furniture never invent posture.
assert.equal(posture.validateStatusPosture('正站着看窗外', 'lying').valid, false);
assert.equal(posture.validateStatusPosture('正躺在软垫上睡觉', 'standing').valid, false);
assert.equal(posture.validateStatusPosture('看着窗外', 'sitting').valid, true);
assert.equal(posture.validateStatusPosture('站在软垫上看窗外', 'standing').valid, true);
assert.equal(posture.validateStatusPosture('坐在柜顶观察门口', 'sitting').valid, true);

// Legacy presentation recognizes only explicit posture and never persists authority.
const legacyCases = [
    ['站在柜子上看窗外', 'standing'],
    ['坐在门边等待', 'sitting'],
    ['趴着睡觉', 'lying'],
    ['伏低身体观察', 'crouching'],
    ['看着窗外', 'standing']
];
for (const [status, expected] of legacyCases) {
    const resident = { status, mapFurniture: 'soft-bed', mapPoint: 'cabinet-top' };
    const before = JSON.stringify(resident);
    assert.equal(posture.resolveMapPose(resident), expected);
    assert.equal(JSON.stringify(resident), before);
    assert.equal(Object.hasOwn(resident, 'statusActivity'), false);
}
const authoritativeResident = vm.runInContext('({ status: "站在柜顶", statusActivity: { posture: "sitting" }, mapFurniture: "cabinet" })', sandbox);
assert.equal(posture.resolveMapPose(authoritativeResident), 'sitting');

// Execute the real setCatStatus implementation with isolated dependencies.
const setterStart = indexSource.indexOf('                const setCatStatus =');
const setterEnd = indexSource.indexOf('                const appendAwayTransitionTravelogue =', setterStart);
assert.ok(setterStart >= 0 && setterEnd > setterStart);
const setterLogs = [];
const setterSandbox = {
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    statusPosture: posture,
    addLog: (...args) => setterLogs.push(args),
    normalizeFormValue: value => value === 'HUMAN' || value === 'CAT' ? value : '',
    getResidentForm: cat => cat.currentForm === 'HUMAN' ? 'HUMAN' : 'CAT',
    isResidentInCuratorRoom: () => true,
    findMapPoint: () => null,
    MAP_ROOM_DEFINITIONS: [],
    inferMapRoomFromStatus: () => 'living',
    appendMonitorEvent: () => {},
    Date
};
vm.runInNewContext(`${indexSource.slice(setterStart, setterEnd)}\nglobalThis.runtimeSetCatStatus = setCatStatus;`, setterSandbox, { filename: 'index.html:setCatStatus' });
const runtimeCat = { id: 'runtime', status: '正站着等待', statusActivity: { posture: 'standing' }, innerVoice: 'old', currentForm: 'CAT', visual: { keep: true } };
assert.equal(setterSandbox.runtimeSetCatStatus(runtimeCat, '正趴着睡觉', { posture: 'lying', innerVoice: 'rest', source: 'fixture' }), true);
assert.equal(runtimeCat.status, '正趴着睡觉');
assert.deepEqual({ ...runtimeCat.statusActivity }, { posture: 'lying' });
assert.equal(runtimeCat.innerVoice, 'rest');
assert.deepEqual(runtimeCat.visual, { keep: true });
const rejectedBefore = JSON.stringify(runtimeCat);
assert.equal(setterSandbox.runtimeSetCatStatus(runtimeCat, '正站着等待', { posture: 'lying', innerVoice: 'bad', source: 'fixture' }), false);
assert.equal(JSON.stringify(runtimeCat), rejectedBefore, 'failed transition must change neither prose nor posture');

// Execute the real Status Sync hard validator.
const validatorStart = indexSource.indexOf('                const validateStatusSyncUpdates =');
const validatorEnd = indexSource.indexOf('                const validateLocalPresenceDirectives =', validatorStart);
const validatorSandbox = { statusPosture: posture, cleanText: value => String(value || '').trim(), isControlPlaneStatusText: value => /状态同步/.test(String(value || '')) };
vm.runInNewContext(`${indexSource.slice(validatorStart, validatorEnd)}\nglobalThis.validateStatusSyncUpdates = validateStatusSyncUpdates;`, validatorSandbox, { filename: 'index.html:status-validator' });
const validUpdate = { id: 'r1', status: '看着窗外', posture: 'sitting', innerVoice: '...', isOut: false };
assert.equal(validatorSandbox.validateStatusSyncUpdates([validUpdate], ['r1']), true);
assert.match(validatorSandbox.validateStatusSyncUpdates([{ ...validUpdate, posture: undefined }], ['r1']), /invalid posture/);
assert.match(validatorSandbox.validateStatusSyncUpdates([{ ...validUpdate, status: '正站着看窗外', posture: 'lying' }], ['r1']), /explicitly indicates standing/);

// Every production setCatStatus call supplies posture; restoration is the only direct resident status assignment.
const findCalls = (source, token) => {
    const calls = [];
    let cursor = 0;
    while ((cursor = source.indexOf(token, cursor)) >= 0) {
        let depth = 0;
        let quote = '';
        let escaped = false;
        let end = cursor;
        for (; end < source.length; end += 1) {
            const char = source[end];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === quote) quote = '';
                continue;
            }
            if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
            if (char === '(') depth += 1;
            else if (char === ')') {
                depth -= 1;
                if (depth === 0) { end += 1; break; }
            }
        }
        calls.push(source.slice(cursor, end));
        cursor = end;
    }
    return calls;
};
const statusCalls = findCalls(indexSource, 'setCatStatus(');
assert.equal(statusCalls.length, 13, 'Focus failure and Focus-local light interaction do not write resident status');
assert.doesNotMatch(indexSource, /source: 'focus-fallback'/);
for (const call of statusCalls) assert.match(call, /\bposture\b\s*(?::|[,}])/, `missing posture in ${call.slice(0, 120)}`);
assert.deepEqual(indexSource.match(/cat\.status\s*=/g), ['cat.status ='], 'only daily snapshot restoration may directly restore status');
for (const producerMarker of [
    'Homepage Chat posture 无效', 'residentUpdates":[{"id"', 'Light interaction posture invalid',
    'entry ${index} has invalid posture', 'plannedReturnPosture', 'Character Generator posture invalid',
    'social-presence-entry'
]) assert.ok(indexSource.includes(producerMarker), `missing producer posture contract: ${producerMarker}`);
assert.ok(inventorySource.includes('validateStatusPosture(status, posture)'));

// Away plans preserve a frozen return posture and recovery delivers it without inference when present.
const awayContext = vm.createContext({ window: {}, console, Date, Math });
vm.runInContext(postureSource, awayContext);
vm.runInContext(awaySource, awayContext);
awayContext.window.Meeow.away.configure({
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    parseLogicalDate: value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; },
    getCatHallId: cat => cat.hallId,
    isPermanentOut: () => false,
    isResidentInHall: cat => !cat.isOut,
    addLog: () => {}
});
const away = awayContext.window.Meeow.away;
const returnPlan = {
    residentId: 'away-cat', mode: 'departure', plannedDurationMinutes: 90, destination: 'shore',
    plannedActivities: [
        { afterMinutes: 25, plannedResidentActivity: 'walk', publicTrace: 'trace one' },
        { afterMinutes: 60, plannedResidentActivity: 'observe', publicTrace: 'trace two' }
    ],
    plannedArchiveNarrative: '这是一段足够长的中文外出记录，居民沿着海岸完成自己的事务，并在回程前整理好一路上的见闻与心情。这里继续补足长度以满足归档要求，也记录海风、脚印、潮声和返程时逐渐安静下来的天空。',
    plannedReturnStatus: '回馆后正坐在门边整理前爪', plannedReturnPosture: 'sitting', mailPlan: []
};
assert.ok(away.validatePlan(returnPlan, 'away-cat', 'departure'));
assert.equal(away.validatePlan({ ...returnPlan, plannedReturnPosture: 'lying' }, 'away-cat', 'departure'), null);
const awayCat = { id: 'away-cat', hallId: 'hall', isOut: true };
const episode = away.createEpisode(awayCat, away.validatePlan(returnPlan, 'away-cat', 'departure'), new Date('2026-09-19T10:00:00Z'));
let settled = null;
away.reconcileEpisodes({ episodes: [episode], cats: [awayCat], reconciliationTime: new Date('2026-09-19T12:00:00Z'), onSettleReturn: payload => { settled = payload; return true; } });
assert.equal(settled.returnPosture, 'sitting');

// Map consumes the resolved posture in both Hall and Curator projections; placement is separate.
assert.match(indexSource, /const getMapCatPose = cat => statusPosture\.resolveMapPose\(cat\)/);
assert.match(indexSource, /return \{ cat, room, spot, pose: getMapCatPose\(cat\) \}/);
assert.match(indexSource, /const curatorRoomCatVisual = computed\(\(\) => curatorRoomResident\.value \? getMapCatVisualPresentation/);
assert.match(indexSource, /const pose = getMapCatPose\(cat\)/);
assert.match(indexSource, /ensureCatVisualRenderer\(resolved\.pose\)/);
assert.match(indexSource, /renderer\(resolved\.visual\.config, \{ pose: resolved\.pose \}\)/);
assert.doesNotMatch(postureSource, /mapFurniture|mapSpot|mapPoint|cushion|cabinet|bed/);

// Pose is cosmetic cache identity; movement coordinates are not.
const visualSandbox = vm.createContext({ console });
vm.runInContext(visualSource, visualSandbox);
const visual = visualSandbox.Meeow.residentVisual;
const cosmetic = { source: 'saved', revision: 3, rendererVersion: 1, configVersion: 1, assetPackVersion: 'v1', identityHash: 'abc' };
const standingKey = visual.makeSpriteCacheKey({ residentId: 'r1', effectiveForm: 'CAT', visual: cosmetic, pose: 'standing', size: 72, x: 1, y: 2 });
const movedKey = visual.makeSpriteCacheKey({ residentId: 'r1', effectiveForm: 'CAT', visual: cosmetic, pose: 'standing', size: 72, x: 900, y: 700 });
const lyingKey = visual.makeSpriteCacheKey({ residentId: 'r1', effectiveForm: 'CAT', visual: cosmetic, pose: 'lying', size: 72 });
assert.equal(standingKey, movedKey);
assert.notEqual(standingKey, lyingKey);

// Completed lazy banks remain on-demand and HUMAN remains on the legacy branch.
assert.match(indexSource, /CAT_VISUAL_POSE_SCRIPTS = Object\.freeze\(\{[\s\S]*standing:[\s\S]*crouching:[\s\S]*lying:/);
assert.match(indexSource, /if \(requestedPose === 'sitting'\) return renderer/);
assert.match(indexSource, /if \(!catVisualPosePromises\.has\(requestedPose\)\)/);
assert.match(indexSource, /if \(!cat \|\| getResidentForm\(cat\) !== 'CAT'\) return null/);

// Snapshot persistence carries valid structured authority without deriving it for legacy residents.
assert.match(indexSource, /statusActivity: statusPosture\.normalizeStatusActivity\(cat\.statusActivity\)/);
assert.match(indexSource, /const restoredStatusActivity = statusPosture\.normalizeStatusActivity\(savedCat\.statusActivity\)/);
assert.ok(indexSource.includes("<script src=\"./js/meeow-status-posture.js\"></script>"));
assert.equal((indexSource.match(/callAI\(/g) || []).length, 40);

console.log('Status posture authority fixture passed.');
