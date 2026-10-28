import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const sliceBetween = (startNeedle, endNeedle) => {
    const start = source.indexOf(startNeedle);
    const end = source.indexOf(endNeedle, start);
    assert.ok(start >= 0 && end > start, `Missing source slice: ${startNeedle}`);
    return source.slice(start, end);
};

// A reload starts at Curator Room with a fresh, in-memory-only location record.
assert.match(source, /const currentTab = ref\('lounge'\);\s*const loungeView = ref\('curator'\);/);
assert.match(source, /const lastMeeowLocation = ref\(\{ type: 'curator', hallId: null \}\);/);
assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)\([^\n]*lastMeeowLocation/);
const saveConfiguration = sliceBetween('window.Meeow.storage.configure({', 'const buildSaveData =');
assert.doesNotMatch(saveConfiguration, /lastMeeowLocation/);

// Only the top-level module label changes. Actual Curator Room destinations and
// room titles keep their location name.
const navbar = sliceBetween('<div v-if="!isFocusing && currentTab !== \'detail\'"', '<!-- iOS Style Home Indicator Bar -->');
assert.match(navbar, /@click="restoreLastMeeowLocation" aria-label="喵喵馆"/);
assert.match(navbar, /<span>喵喵馆<\/span>/);
assert.doesNotMatch(navbar, /@click="openCuratorRoom"/);
assert.match(source, /class="hall-room-title"[^>]*>[\s\S]*? 馆长室<\/div>/);
assert.match(source, /@click="openCuratorRoom"[^>]*>[\s\S]*?馆长室<\/button>/);

const restoreSource = sliceBetween('const restoreLastMeeowLocation = () => {', 'const navigateToTab = (tab) => {');
assert.doesNotMatch(restoreSource, /\benterHall\s*\(/);
assert.doesNotMatch(restoreSource, /\bopenCuratorRoom\s*\(/);
assert.doesNotMatch(restoreSource, /terminateActiveSocialPresence|reconcileAwayEpisodes|refreshAllStatus|maybeRefreshCuratorRoomStatus/);

const makeRestoreHarness = () => {
    const counters = { phoneReset: 0, scrollRemembered: 0, phoneScrollRemembered: 0, worldMutations: 0 };
    const sandbox = {
        showCatVisualEditor: { value: false },
        requestCatVisualEditorClose: () => { throw new Error('editor guard should not run'); },
        rememberHallScrollPosition: () => { counters.scrollRemembered += 1; },
        rememberPhoneChatScrollPosition: () => { counters.phoneScrollRemembered += 1; },
        resetPhoneTransientUI: () => { counters.phoneReset += 1; },
        currentTab: { value: 'mission' },
        loungeView: { value: 'selector' },
        phoneReturnRoute: { value: null },
        lastMeeowLocation: { value: { type: 'curator', hallId: null } },
        halls: { value: [{ id: 'greek', name: '伊萨卡馆' }, { id: 'gotham', name: '哥谭馆' }] },
        activeHallId: { value: 'gotham' },
        selectedCat: { value: null },
        detailReturnOrigin: { value: '' },
        hallSceneActive: { value: false },
        mapPreviewCat: { value: null },
        curatorRoomMapPreviewCat: { value: null },
        hallScrollPositions: { greek: 77 },
        setContentScrollTop: value => { sandbox.scrollTop = value; },
        addLog: () => {},
        scrollTop: -1,
        counters
    };
    vm.runInNewContext(`${restoreSource}\nglobalThis.restoreForFixture = restoreLastMeeowLocation;`, sandbox, { filename: 'index.html:restoreLastMeeowLocation' });
    return sandbox;
};

// Curator -> Hall -> Phone -> Meeow House restores the existing Hall
// presentation without replaying entry/world authority.
const hallRestore = makeRestoreHarness();
hallRestore.lastMeeowLocation.value = { type: 'hall', hallId: 'greek' };
hallRestore.currentTab.value = 'phone';
hallRestore.phoneReturnRoute.value = { tab: 'lounge', loungeView: 'curator' };
hallRestore.selectedCat.value = { id: 'greek-telemachus', hallId: 'greek' };
hallRestore.detailReturnOrigin.value = '';
hallRestore.restoreForFixture();
assert.equal(hallRestore.currentTab.value, 'lounge');
assert.equal(hallRestore.loungeView.value, 'room');
assert.equal(hallRestore.activeHallId.value, 'greek');
assert.equal(hallRestore.selectedCat.value, null, 'resident detail is not a remembered Meeow location');
assert.equal(hallRestore.hallSceneActive.value, true);
assert.equal(hallRestore.phoneReturnRoute.value, null);
assert.equal(hallRestore.scrollTop, 77);
assert.equal(hallRestore.counters.worldMutations, 0);

// A remembered Curator location restores presentation directly, without
// manufacturing a new Curator entry.
const curatorRestore = makeRestoreHarness();
curatorRestore.lastMeeowLocation.value = { type: 'curator', hallId: null };
curatorRestore.restoreForFixture();
assert.equal(curatorRestore.currentTab.value, 'lounge');
assert.equal(curatorRestore.loungeView.value, 'curator');
assert.equal(curatorRestore.hallSceneActive.value, false);

// Invalid raw Hall IDs never use currentHall's silent first-Hall fallback.
const invalidRestore = makeRestoreHarness();
invalidRestore.lastMeeowLocation.value = { type: 'hall', hallId: 'removed-hall' };
invalidRestore.restoreForFixture();
assert.equal(invalidRestore.loungeView.value, 'curator');
assert.equal(invalidRestore.lastMeeowLocation.value.type, 'curator');
assert.equal(invalidRestore.lastMeeowLocation.value.hallId, null);
assert.equal(invalidRestore.activeHallId.value, 'gotham', 'invalid Hall must not silently select another Hall');

// Every new Phone entry replaces any stale route snapshot.
const captureSource = sliceBetween('const capturePhoneReturnRoute = () => {', 'const leavePhone = () => {');
const captureSandbox = {
    currentTab: { value: 'lounge' },
    loungeView: { value: 'curator' },
    activeHallId: { value: 'gotham' },
    phoneReturnRoute: { value: null }
};
vm.runInNewContext(`${captureSource}\nglobalThis.captureForFixture = capturePhoneReturnRoute;`, captureSandbox, { filename: 'index.html:capturePhoneReturnRoute' });
captureSandbox.captureForFixture();
assert.equal(captureSandbox.phoneReturnRoute.value.loungeView, 'curator');
captureSandbox.currentTab.value = 'mission'; // left Phone through another top-level tab
captureSandbox.currentTab.value = 'lounge';
captureSandbox.loungeView.value = 'room';
captureSandbox.activeHallId.value = 'greek';
captureSandbox.captureForFixture();
assert.equal(captureSandbox.phoneReturnRoute.value.loungeView, 'room');
assert.equal(captureSandbox.phoneReturnRoute.value.hallId, 'greek');

// Explicit physical navigation retains its existing authority behavior and now
// updates the small session-memory record.
const curatorEntry = sliceBetween('const openCuratorRoom = () => {', 'const openCurrentHall = () => {');
assert.match(curatorEntry, /terminateActiveSocialPresencesForNavigation/);
assert.match(curatorEntry, /clearHallSceneFocus\(\)/);
assert.match(curatorEntry, /maybeRefreshCuratorRoomStatus\(\)/);
assert.match(curatorEntry, /lastMeeowLocation\.value = \{ type: 'curator', hallId: null \}/);

const hallEntry = sliceBetween('const enterHall = (hall) => {', 'const openCatVisit = (cat) => {');
assert.match(hallEntry, /terminateActiveSocialPresencesForNavigation/);
assert.match(hallEntry, /reconcileAwayEpisodes\(new Date\(\)\)/);
assert.match(hallEntry, /user\.currentStatus = arrivalStatus/);
assert.match(hallEntry, /startHallArrivalRefresh\(hall\)/);
assert.equal((hallEntry.match(/lastMeeowLocation\.value = \{ type: 'hall', hallId: hall\.id \}/g) || []).length, 2,
    'both cached and fresh Hall-entry branches must remember the Hall');

console.log(JSON.stringify({ fixture: 'meeow-navigation-memory', status: 'PASS' }));
