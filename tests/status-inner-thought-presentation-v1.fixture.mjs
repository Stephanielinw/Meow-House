import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html'), plain = value => JSON.parse(JSON.stringify(value));
assert.match(html, /const getResidentPresentationContent =/, 'T8 must expose one read-only presentation projection');
const section = (start, end) => {
    const a = html.indexOf(start), b = html.indexOf(end, a);
    assert.ok(a >= 0 && b > a, start);
    return html.slice(a, b);
};
const authority = section('const hallEpisodeAuthority =', 'const saveHallEpisodeWindow =');
const episode = section('const getResidentEpisodeContent =', 'const collectHallEpisodeResidents =');
const live = section('const getResidentLiveStatus =', 'const setCatStatus =');
const projection = section('// T8 read-only presentation projection.', '// End T8 presentation projection.');
const placement = section('const normalRoomContextKey =', 'const roomSpatialReady =');
const observer = section('const getResidentObserverReaction =', '// End T7 observer reaction authority.');

function fixture() {
    let now = new Date('2026-10-05T09:21:00-07:00').getTime(), monotonic = 1000;
    class Clock extends Date { static now() { return now; } }
    const counters = { ai: 0, save: 0, select: 0, copy: 0 };
    const context = vm.createContext({ console, Date: Clock, performance: { now: () => monotonic } }); context.window = context;
    vm.runInContext(read('js/meeow-hall-activities.js'), context);
    const cat = { id: 'a', hallId: 'hall', mapRoom: 'living', mapPoint: 'corner', form: 'CAT',
        posture: 'sitting', lastStatusUpdateTime: now - 10000, lastInteractionTimestamp: 0,
        status: '已接受的互动状态。', innerVoice: '【已接受的私有心声。】' };
    const hall = { id: 'hall' }, runtime = { id: 'a', placementKey: 'hall|living|corner|10%|20%|corner',
        state: 'activity', behaviorId: 'observe', behaviorLifecycleState: 'ACTIVE', episodeBeatId: 'first',
        foot: { x: 200, y: 300 }, transitionGeneration: 4, activityExpectedEndAt: monotonic + 240000 };
    const marker = { cat, room: 'living', spot: 'corner', position: { left: '10%', top: '20%' } };
    const ref = value => ({ value });
    const env = { hallActivities: context.Meeow.hallActivities, hallEpisodeObjects: new WeakMap(),
        cats: ref([cat]), halls: ref([hall]), spatialAmbientSnapshot: ref({ residents: [runtime] }),
        mapCatMarkers: ref([marker]), activeHallId: ref('hall'), activeMapRoom: ref('living'), spatialPrototypeEnabled: false,
        roomSpatialReady: ref(true), roomSpatialContextKey: 'hall|living',
        roomSpatialDomain: ref({ source: { roomId: 'living' }, legalPoint: p => Number.isFinite(p?.x) && p.x >= 0 && p.x <= 1024 && Number.isFinite(p.y) && p.y >= 0 && p.y <= 1024 }),
        getCatHallId: c => c.hallId, getResidentPhysicalHallId: c => c.hallId,
        getResidentForm: c => c.form, getStructuredStatusPose: c => c.posture,
        hasHigherHallPresentationOwner: () => Boolean(cat.higher),
        isResidentInCuratorRoom: c => Boolean(c.curator),
        isResidentPresentationFormCompatible: c => Boolean(c && c.form === 'CAT'),
        mapCatVisualRevision: ref(0), cleanText: text => String(text || '').trim(),
        getNeutralDiegeticStatus: () => '正在馆内安静活动。',
        isControlPlaneStatusText: value => /scheduler/.test(value),
        getResidentCopyContext: () => ({ id: 'a' }),
        callAI: () => { counters.ai++; throw new Error('reader must not call AI'); },
        saveData: () => { counters.save++; throw new Error('reader must not save'); },
        observerBatchCurrent: (h, b, at) => h.currentObserverReactionBatch === b && b.expiresAt > at,
        currentObserverReaction: (b, r) => !cat.left && r.authority === cat.form
    };
    context.Meeow.residentCopy = { readPair: () => { counters.copy++; return { status: '旧 routine copy', innerThought: '旧 routine thought' }; } };
    Object.assign(context, env);
    vm.runInContext(authority + placement + episode + live + projection + observer +
        ';this.api={authority:hallEpisodeAuthority,owned:isHallEpisodeOwned,episode:getResidentEpisodeContent,presentation:getResidentPresentationContent,reaction:getResidentObserverReaction};', context);
    const window = context.Meeow.hallActivities.episodeWindow(now);
    const row = { residentId: 'a', roomId: 'living', state: 'valid', authority: context.api.authority(cat),
        lastFoot: { x: 200, y: 300 }, beats: [
            { id: 'first', state: 'active', behaviorId: 'observe', posture: 'sitting', roomId: 'living',
                startAt: now, endAt: now + 240000, foot: { x: 200, y: 300 }, fallback: { status: '冻结 fallback', innerThought: '冻结心声' } },
            { id: 'second', state: 'pending', behaviorId: 'rest', posture: 'lying', roomId: 'living',
                startAt: now + 240000, endAt: window.end, foot: { x: 200, y: 300 } }
        ] };
    hall.currentEpisodeWindow = { version: 1, hallId: 'hall', windowKey: window.key, windowStart: window.start,
        windowEnd: window.end, planStart: now, residents: [row], content: { state: 'accepted', entries: [
            { residentId: 'a', beatId: 'first', status: 'A 当前观察', innerThought: 'B 当前心声' },
            { residentId: 'a', beatId: 'second', status: 'C 当前休息', innerThought: 'D 下一心声' }
        ] } };
    return { context, cat, hall, runtime, row, counters, api: context.api, now: () => now,
        monotonic: () => monotonic, advance: ms => { now += ms; monotonic += ms; }, env, marker };
}

const f = fixture(), expected = { status: 'A 当前观察', innerThought: 'B 当前心声' };
assert.deepEqual(plain(f.api.presentation(f.cat)), expected);
const snapshot = JSON.stringify({ cat: f.cat, hall: f.hall, runtime: f.runtime });
for (let i = 0; i < 10000; i++) assert.deepEqual(plain(f.api.presentation(f.cat)), expected);
assert.equal(JSON.stringify({ cat: f.cat, hall: f.hall, runtime: f.runtime }), snapshot);
assert.deepEqual(f.counters, { ai: 0, save: 0, select: 0, copy: 0 });

// Same runtime/beat, paused by opening the profile or Text mode: read only.
f.runtime.state = 'paused'; f.runtime.behaviorLifecycleState = 'PAUSED';
assert.equal(f.api.episode(f.cat), null, 'default T6 getter contract remains ACTIVE-only');
assert.deepEqual(plain(f.api.presentation(f.cat)), expected);
for (const corrupt of [r => r.placementKey = 'old-placement', r => delete r.placementKey, r => r.foot.x = -1,
    r => r.transitionGeneration = NaN, r => r.behaviorId = 'roam',
    r => r.furniture = { phase: 'entering' }, r => r.activityExpectedEndAt = f.monotonic()]) {
    const g = fixture(); g.runtime.state = 'paused'; g.runtime.behaviorLifecycleState = 'PAUSED'; corrupt(g.runtime);
    assert.deepEqual(plain(g.api.presentation(g.cat)), { status: '正在馆内安静活动。', innerThought: '' });
    assert.equal(g.counters.copy, 0, 'unreadable owned beat cannot use old routine copy');
}
f.runtime.state = 'moving';
assert.equal(f.api.presentation(f.cat).status, '正在馆内安静活动。');

// Reload has no invented execution; hydrate through the existing runtime then reuse persisted content.
const reload = fixture(), saved = plain(reload.hall.currentEpisodeWindow);
reload.hall.currentEpisodeWindow = saved; reload.env.spatialAmbientSnapshot.value.residents = [];
assert.equal(reload.api.presentation(reload.cat).status, '正在馆内安静活动。');
reload.env.spatialAmbientSnapshot.value.residents = [reload.runtime];
assert.deepEqual(plain(reload.api.presentation(reload.cat)), expected);
assert.equal(reload.counters.ai, 0);

const next = fixture(); next.advance(240000);
next.row.beats[0].state = 'completed'; next.row.beats[1].state = 'active';
next.runtime.episodeBeatId = 'second'; next.runtime.behaviorId = 'rest';
next.runtime.activityExpectedEndAt = next.monotonic() + next.row.beats[1].endAt - next.now();
assert.deepEqual(plain(next.api.presentation(next.cat)), { status: 'C 当前休息', innerThought: 'D 下一心声' });
next.row.beats[1].requiresBeatId = 'first'; next.row.beats[0].state = 'skipped';
assert.equal(next.api.presentation(next.cat).status, '正在馆内安静活动。');

const missing = fixture(); missing.hall.currentEpisodeWindow.content.entries = [];
assert.equal(missing.api.presentation(missing.cat).status, '冻结 fallback');
delete missing.row.beats[0].fallback;
assert.equal(missing.api.presentation(missing.cat).status, '正在馆内安静活动。');
assert.equal(missing.counters.copy, 0);
for (const invalidate of [g => g.row.state = 'invalidated', g => g.cat.lastInteractionTimestamp = g.now(),
    g => g.cat.lastFormChangeAt = 'replacement', g => g.cat.form = 'HUMAN',
    g => g.cat.hallId = 'other', g => g.advance(20 * 60000)]) {
    const g = fixture(); invalidate(g);
    const value = g.api.presentation(g.cat);
    assert.notEqual(value.status, expected.status); assert.notEqual(value.innerThought, expected.innerThought);
    assert.equal(g.counters.ai, 0);
}

// Current accepted interaction or stronger authority follows the existing accepted live path.
const direct = fixture(); direct.cat.lastInteractionTimestamp = direct.now(); direct.cat.higher = true;
direct.context.getResidentCopyContext = () => null;
assert.deepEqual(plain(direct.api.presentation(direct.cat)), { status: direct.cat.status, innerThought: direct.cat.innerVoice });
assert.equal(direct.counters.copy, 0);
const curator = fixture(); curator.cat.curator = true;
curator.context.getResidentCopyContext = () => null;
assert.deepEqual(plain(curator.api.presentation(curator.cat)), { status: curator.cat.status, innerThought: curator.cat.innerVoice });
assert.equal(curator.counters.copy, 0, 'Curator does not read ordinary Hall content');

// T7 wording is not a status/inner-thought field and has no compatible old slot.
for (const category of ['NOTICE_CONTINUE', 'MICRO_REACTION']) {
    const g = fixture(), at = g.now();
    g.hall.currentObserverReactionBatch = { sourceInteractionId: 'source', expiresAt: at + 15000,
        reactions: [{ observerId: 'a', reactionId: 'reaction', category, authority: 'CAT', startedAt: at, expiresAt: at + 15000 }],
        content: { state: 'accepted', entries: [{ observerId: 'a', reactionId: 'reaction', reactionText: '不是状态或心声' }] } };
    assert.equal(g.api.reaction('a', at).category, category);
    assert.deepEqual(plain(g.api.presentation(g.cat)), expected);
    const planBefore = JSON.stringify(g.hall.currentEpisodeWindow); g.advance(15001);
    assert.equal(g.api.reaction('a', g.now()), null);
    assert.deepEqual(plain(g.api.presentation(g.cat)), expected);
    assert.equal(JSON.stringify(g.hall.currentEpisodeWindow), planBefore);
    assert.equal(g.counters.ai + g.counters.save + g.counters.select + g.counters.copy, 0);
}
const stale = fixture(); stale.hall.currentObserverReactionBatch = { sourceInteractionId: 'old', expiresAt: stale.now() + 15000,
    reactions: [{ observerId: 'a', authority: 'CAT' }], content: { state: 'accepted', entries: [] } };
stale.cat.left = true; assert.equal(stale.api.reaction('a', stale.now()), null);
stale.cat.left = false; stale.cat.form = 'HUMAN'; assert.equal(stale.api.reaction('a', stale.now()), null);

// Exact restored structure, replacing only historical value bindings.
const markup = html.slice(0, html.indexOf('<script type="module">'));
assert.match(markup, /class="cat-status-preview text-\[11px\] text-gray-400 text-center w-full leading-relaxed mt-0\.5 px-1 custom-scrollbar"/);
assert.match(markup, /动态: \{\{ getResidentPresentationContent\(selectedCat\)\.status \}\}/);
assert.match(markup, /class="mt-3 bg-black\/40 border-l-2 border-yellow-500 rounded-r-xl p-2\.5 text-\[11px\] text-gray-300 italic font-serif leading-relaxed" v-if="getResidentPresentationContent\(selectedCat\)\.innerThought"/);
assert.match(markup, /<p>\{\{ getResidentPresentationContent\(mapPreviewCat\)\.status \}\}<\/p>/);
assert.equal((markup.match(/动态: \{\{ getResidentPresentationContent/g) || []).length, 1);
assert.doesNotMatch(projection, /callAI\(|save|\.project\(|Math\.random|reconcile|setCatStatus\(|getResidentObserverReaction/);
assert.doesNotMatch(live, /getResidentEpisodeContent|currentEpisodeWindow/);
assert.match(html, /settings, cleanText, getResidentPresentationContent,/);
console.log('T8 restored presentation: canonical ACTIVE/PAUSED, fallback isolation, direct/Curator, reload, expiry, 10,000 reads PASS');
