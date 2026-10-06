import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('index.html');
assert.match(html, /const reconcileAffectedHallResidents =/, 'accepted direct events need canonical resident-level reconciliation');
assert.match(html, /queueAffectedHallReconciliation\(sendingCat, acceptedMomentReply, hallContinuitySource\)/,
    'the real accepted direct completion must call Phase B');
assert.ok(html.indexOf('const hallContinuitySource =', html.indexOf('const sendMessage =')) <
    html.indexOf('const formRequest = !isReRoll', html.indexOf('const sendMessage =')),
    'capture live shared authority before the direct form command invalidates it');
const plain = value => JSON.parse(JSON.stringify(value));
const section = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
const modules = vm.createContext({ console, Map, Set, WeakMap }); modules.window = modules;
for (const name of ['hall-navigation', 'hall-spatial', 'hall-activities', 'social-activity'])
    vm.runInContext(read('js/meeow-' + name + '.js'), modules);
const { hallActivities: activities, hallNavigation: nav, hallSpatial: spatial, socialActivity } = modules.Meeow;
const timeAt = clock => new Date(`2026-10-06T${clock}:00-07:00`).getTime();
const flush = async () => { for (let n = 0; n < 160; n++) await Promise.resolve(); };
function world({ saved = null, enabled = true } = {}) {
    let time = timeAt('13:27'), monotonic = 1000, saves = 0, failAt = 0, selectionCount = 0;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
    const ref = value => ({ value }), calls = [], logs = [], stored = [];
    const makeCat = (id, room = 'living', x = 200) => ({ id, name: id, hallId: 'greek', mapRoom: room,
        mapPoint: 'floor', currentForm: 'CAT', statusActivity: { posture: 'sitting' }, x,
        lastStatusUpdateTime: 1, lastInteractionTimestamp: 0, todayInteractions: [],
        chatHistory: ['PRIVATE_CHAT_SENTINEL'], innerVoice: 'PRIVATE_THOUGHT_SENTINEL' });
    const cats = saved?.cats || [makeCat('a'), makeCat('b', 'living', 300), makeCat('c', 'dining', 500), makeCat('d', 'dorm', 700)];
    const halls = saved?.halls || [{ id: 'greek', name: '伊萨卡' }];
    const domains = Object.fromEntries(['living', 'dining', 'dorm'].map(room => {
        const floor = new Uint8Array(1024 * 1024).fill(1);
        const domain = nav.createRasterDomain({ width: 1024, height: 1024, floor, rug: new Uint8Array(floor.length), floorId: room, rugId: room });
        domain.source = { roomId: room }; domain.geometryVersion = 1;
        domain.capabilityFor = () => ['ordinary-stationary']; domain.groundPresentationPoint = () => true;
        return [room, domain];
    }));
    const env = { console, Date: Clock, performance: { now: () => monotonic }, Math, JSON, Map, Set, WeakMap, Promise,
        hallActivities: { ...activities, decideObserverReactions: options => { selectionCount++; return activities.decideObserverReactions(options); } },
        hallSpatial: spatial, hallNavigation: { ...nav, loadRoomDomain: async room => domains[room] }, socialActivity,
        halls: ref(halls), cats: ref(cats), activeHallId: ref('greek'), activeMapRoom: ref('living'),
        currentTab: ref('lounge'), loungeView: ref('room'), hallDisplayMode: ref('text'), document: { visibilityState: 'visible' },
        settings: { apiKey: enabled ? 'mock' : '' }, statusRefreshDisposed: false,
        thinkingStates: {}, socialOpportunityClaims: new Map(),
        getCatHallId: cat => cat.hallId, getResidentPhysicalHallId: cat => cat.isOut ? '' : cat.hallId,
        isResidentInHall: cat => !cat.isOut && !cat.curator, isResidentAway: cat => !!cat.isOut, isResidentInCuratorRoom: cat => !!cat.curator,
        getResidentForm: cat => cat.currentForm, getStructuredStatusPose: cat => cat.statusActivity.posture,
        hasHigherHallPresentationOwner: id => { const cat = cats.find(cat => cat.id === id); return cat?.blocked || cat?.currentForm !== 'CAT'; },
        isContextuallyViewingHallPresentation: id => env.activeHallId.value === id && env.document.visibilityState !== 'hidden' &&
            (env.currentTab.value === 'detail' || env.currentTab.value === 'lounge' && env.loungeView.value === 'room'),
        mapCatMarkers: { get value() { return cats.filter(cat => cat.hallId === env.activeHallId.value && !cat.isOut && !cat.curator)
            .map(cat => ({ cat, room: cat.mapRoom, spot: 'floor', position: { left: cat.x / 1024 * 100 + '%', top: '48.828125%' } })); } },
        spatialAmbientSnapshot: ref({ residents: [] }), roomSpatialReady: ref(true), roomSpatialDomain: ref(domains.living),
        roomSpatialContextKey: 'greek|living', normalRoomContextKey: () => 'greek|living',
        normalRoomPlacementKey: marker => 'place:' + marker.cat.id, normalRoomCanOwn: id => !cats.find(cat => cat.id === id)?.blocked,
        personalityRuntime: { getResidentRuntimePersonality: () => ({ state: 'profiled', axes: {} }) },
        getCanonicalRelationshipBaseline: () => ({ label: 'neutral' }),
        stableAttentionHash: value => { let hash = 2166136261; for (const ch of value) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619); return hash >>> 0; },
        buildSaveData: () => ({ halls, cats }), addLog: message => logs.push(message),
        buildCatIdentityBlock: cat => 'PRIVATE_USER_AFFINITY_SENTINEL ' + cat.id, buildLeanAmbientContext: cat => 'PUBLIC PERSONALITY ' + cat.id,
        buildPublicSharedPeerRelationshipLines: () => new Map(), buildAuthoritativeUserIdentityContext: () => 'PUBLIC USER',
        buildStatusSyncUserContext: () => 'PUBLIC PRESENCE', getResidentPublicName: cat => cat.id,
        cleanText: value => String(value || '').trim(), parseAIJSON: JSON.parse,
        requestSharedHallContent: (prompt, options) => new Promise((resolve, reject) => {
            assert.equal(options.maxAttempts, 1); calls.push({ prompt, options, resolve, reject });
        }),
        syncSpatialAmbient: () => {},
        window: { Meeow: { storage: { persistSnapshot: snapshot => {
            saves++; if (saves === failAt) return false; stored.push(plain(snapshot)); return true;
        } }, residentCopy: { factFor: (cat, posture, form) => ({ id: cat.id, posture, form }),
            deriveContext: (fact, event) => ({ ...fact, ...event }), selectPair: () => ({ status: '坐着歇一会儿。', innerThought: '先待在这里。' }) } } }
    };
    const ctx = vm.createContext(env);
    vm.runInContext(section('// T6 current-Hall episode authority.', '// End T6 current-Hall episode authority.') + '\n' +
        section('// T7 observer reaction authority.', '// End T7 observer reaction authority.') +
        '\nglobalThis.api = { policy:hallEpisodeExecutionPolicy, ensure:reconcileCurrentHallEpisodeWindow, progress:recordHallEpisodeProgress, capture:captureHallContinuitySource,' +
        'queue:queueAffectedHallReconciliation, reconcile:reconcileAffectedHallResidents, captureObserver:captureObserverInteractionSource,' +
        'observe:queueObserverReactions, observerReconcile:reconcileObserverReactions, owned:isHallEpisodeOwned };', ctx);
    const world = { env, ctx, cats, halls, calls, logs, domains, saves: () => saves, selections: () => selectionCount,
        failNext: (offset = 1) => { failAt = saves + offset; }, setTime: clock => { time = timeAt(clock); },
        saved: () => stored.at(-1), plan: () => halls[0].currentEpisodeWindow,
        partialCalls: () => calls.filter(call => call.options.originSurface === 'hall-affected'),
        settle(call, plan = world.plan()) { call.resolve(JSON.stringify({ entries: plan.residents.flatMap(row =>
            row.beats.filter(beat => call.prompt.includes(beat.id)).map(beat => ({ residentId: row.residentId, beatId: beat.id,
                status: '已保存的活动 ' + row.residentId, innerThought: '已保存的心声 ' + row.residentId }))) })); },
        accept(id = 'event-a', source = world.ctx.api.capture(cats[0])) {
            const record = { id, type: 'chat-reply', source: 'detail-chat', interactionEpisodeId: 'direct:' + id,
                at: new Clock().toISOString(), content: 'PRIVATE_REPLY_SENTINEL', attentionEligible: true };
            cats[0].todayInteractions.push(record); cats[0].lastInteractionTimestamp = time;
            return { record, source };
        },
        seedRuntime() {
            env.spatialAmbientSnapshot.value.residents = world.plan().residents.filter(row => row.roomId === 'living').map(row => ({
                id: row.residentId, placementKey: 'place:' + row.residentId, foot: { ...row.lastFoot },
                behaviorId: row.beats[0].behaviorId, state: 'activity', behaviorLifecycleState: 'ACTIVE',
                behaviorInstanceId: 'instance:' + row.residentId, episodeBeatId: row.beats[0].id,
                transitionGeneration: 1, activityExpectedEndAt: monotonic + 120000
            }));
        },
        async ready({ deferWhole = false } = {}) { await ctx.api.ensure(new Clock()); if (calls[0] && !deferWhole) world.settle(calls[0]); await flush();
            for (const row of world.plan().residents) ctx.api.progress(row.residentId, row.beats[0].id, 'active', row.lastFoot);
            world.seedRuntime(); return world; }
    };
    return world;
}

// Affected membership is pure, stable, reason-specific and never raw proximity.
const input = { targetId: 'a', residentIds: ['d','c','b','a'], observerIds: ['b','b'],
    dependencies: [{ participantIds: ['a','b'], interrupted: true }, { participantIds: ['a','c'], interrupted: true },
        { participantIds: ['a','d'], interrupted: false }] };
assert.deepEqual(plain(activities.buildAffectedResidentIds(input)), ['a','b','c']);
assert.deepEqual(plain(activities.affectedResidentReasons('b', input)), ['shared_dependency','observer']);
assert.deepEqual(plain(activities.buildAffectedResidentIds({ ...input, observerIds: [], dependencies: [] })), ['a']);

// Direct-only: preserve actual untouched row/beat/content identities, no second whole-Hall request.
{
    const w = await world().ready(), before = w.plan(), untouched = before.residents.slice(1), contents = before.content.entries.slice(1);
    w.setTime('13:32'); const event = w.accept();
    w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    const after = w.plan(); assert.equal(after.windowKey, before.windowKey); assert.equal(after.planStart, before.planStart);
    for (const row of untouched) assert.equal(after.residents.find(other => other.residentId === row.residentId), row);
    for (const entry of contents) assert.equal(after.content.entries.find(other => other.residentId === entry.residentId && other.beatId === entry.beatId), entry);
    assert.equal(w.partialCalls().length, 1); assert.equal(w.calls.filter(call => call.options.originSurface === 'hall-episode').length, 1);
    assert.deepEqual(plain(after.partialReconciliations[0].affectedIds), ['a']);
    const replacement = after.residents[0]; assert.equal(replacement.beats[0].startAt, timeAt('13:32'));
    assert.ok(replacement.beats.length <= 3); assert.equal(activities.definitions[replacement.beats.at(-1).behaviorId].stationary, true);
    assert.ok(!w.partialCalls()[0].prompt.includes('PRIVATE_'));
    const count = w.saves(); w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    assert.equal(w.saves(), count); assert.equal(w.partialCalls().length, 1);
    w.settle(w.partialCalls()[0]); await flush();
    assert.equal(w.plan().residents[1], untouched[0]);
    assert.equal(w.cats[0].todayInteractions.length, 1);
    const reload = world({ saved: w.saved() }); await reload.ctx.api.reconcile(); await flush();
    assert.equal(reload.calls.length, 0); assert.equal(reload.cats[0].todayInteractions.length, 1);
}

// A late original whole-Hall response and progress updates cannot overwrite the local continuation.
{
    const w = await world().ready({ deferWhole: true }), original = plain(w.plan());
    w.setTime('13:32'); const event = w.accept();
    w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    const continuation = w.plan().residents[0], untouched = w.plan().residents[1];
    w.settle(w.partialCalls()[0]); await flush();
    const content = w.plan().content.entries.find(entry => entry.beatId === continuation.beats[0].id);
    assert.ok(content);
    w.ctx.api.progress('b', untouched.beats[0].id, 'completed', untouched.lastFoot);
    assert.equal(w.plan().residents[0], continuation);
    w.settle(w.calls[0], original); await flush();
    assert.equal(w.plan().residents[0], continuation);
    assert.equal(w.plan().content.entries.find(entry => entry.beatId === continuation.beats[0].id), content);
    assert.ok(!w.plan().content.entries.some(entry => entry.residentId === 'a' && entry.beatId === original.residents[0].beats[0].id));
}
// A newer accepted source supersedes the old target authority without an old response rollback.
{
    const w = await world().ready(); w.setTime('13:32'); const first = w.accept('first');
    w.ctx.api.queue(w.cats[0], first.record, first.source); await flush();
    w.setTime('13:33'); const second = w.accept('second');
    w.ctx.api.queue(w.cats[0], second.record, second.source); await flush();
    assert.equal(w.partialCalls().length, 2);
    w.settle(w.partialCalls()[1]); await flush(); const accepted = plain(w.plan());
    w.settle(w.partialCalls()[0]); await flush(); assert.deepEqual(plain(w.plan()), accepted);
    assert.equal(w.cats[0].todayInteractions.length, 2);
}

// Real T7 selection freezes once even after a failed save and changed observer position.
{
    const w = await world().ready(); w.setTime('13:32');
    // Keep the T6 beat legal/current at the event time (stationary plans end at :40).
    w.seedRuntime(); const observerSource = w.ctx.api.captureObserver(w.cats[0]);
    let id;
    for (let n = 0; n < 10000; n++) if (activities.decideObserverReactions({ sourceInteractionId: 'notice-' + n,
        targetId: 'a', startedAt: timeAt('13:32'), candidates: [{ id: 'b', salience: 0 }] }).some(row => row.category === 'NOTICE_CONTINUE')) { id = 'notice-' + n; break; }
    const event = w.accept(id), rowB = w.plan().residents[1], rowC = w.plan().residents[2];
    w.failNext(); assert.equal(w.ctx.api.observe({ activeResident: w.cats[0], sourceRecord: event.record,
        sourceContext: observerSource, interactionEpisodeId: event.record.interactionEpisodeId }), false);
    assert.equal(w.selections(), 1);
    w.env.spatialAmbientSnapshot.value.residents.find(row => row.id === 'b').foot.x += 300;
    w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    assert.deepEqual(plain(w.plan().partialReconciliations[0].affectedIds), ['a','b']);
    assert.equal(w.plan().residents[1], rowB); assert.equal(w.plan().residents[2], rowC);
    assert.equal(w.halls[0].currentObserverReactionBatch.reactions[0].observerId, 'b');
    assert.equal(event.record.observerReactionEvaluated, true); assert.equal(w.partialCalls().length, 1);
    w.ctx.api.observerReconcile(); await flush(); assert.equal(w.selections(), 1);
    assert.ok(w.partialCalls()[0].prompt.includes('完成了与 USER 的互动'));
    assert.ok(!w.partialCalls()[0].prompt.includes('PRIVATE_'));
}

// Completed history survives, and the continuation consumes only the original remaining budget.
{
    const w = await world({ enabled: false }).ready();
    const row = w.plan().residents[0], first = row.beats[0];
    first.endAt = timeAt('13:30'); first.state = 'completed';
    const second = { ...first, id: first.id + ':next', startAt: first.endAt, endAt: timeAt('13:40'), state: 'active' };
    row.beats = [first, second];
    w.setTime('13:32'); const event = w.accept(); w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    assert.equal(w.plan().residents[0].beats[0], first);
    assert.ok(w.plan().residents[0].beats.length <= 3); assert.equal(w.partialCalls().length, 0);
}

// Save/claim failures never dispatch; retries use the frozen continuation.
for (const failedStage of [1, 2]) {
    const w = await world().ready(); w.setTime('13:32'); const event = w.accept();
    w.failNext(failedStage); w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    assert.equal(w.partialCalls().length, 0);
    w.setTime('13:33'); await w.ctx.api.reconcile(); await flush();
    assert.equal(w.partialCalls().length, 1);
    const row = w.plan().residents[0]; assert.equal(row.beats[0].startAt, timeAt('13:32'));
}

// Stale generation/window/Hall and invalid payloads cannot publish over canonical state.
for (const stale of ['window', 'authority', 'generation', 'hall', 'invalid', 'provider-failure']) {
    const w = await world().ready(); w.setTime('13:32'); const event = w.accept();
    w.ctx.api.queue(w.cats[0], event.record, event.source); await flush(); const request = w.partialCalls()[0];
    if (stale === 'window') { w.setTime('13:42'); await w.ctx.api.ensure(new Date(timeAt('13:42'))); }
    if (stale === 'authority') w.cats[0].blocked = true;
    if (stale === 'generation') w.cats[0].lastFormChangeAt = 'new-generation';
    if (stale === 'hall') w.env.activeHallId.value = 'gotham';
    if (stale === 'invalid') request.resolve('{"entries":[{"residentId":"unknown","beatId":"bad","status":"坏","innerThought":"坏"}]}');
    else if (stale === 'provider-failure') request.reject(new Error('mock provider failure'));
    else w.settle(request);
    await flush();
    assert.ok(!w.plan().content.entries.some(entry => entry.status === '已保存的活动 a' && entry.beatId.includes('event-a')));
    assert.equal(w.partialCalls().length, 1);
}

// Boundary completion never patches the expired window; Phase A owns the next activation.
{
    const w = await world().ready(), source = w.ctx.api.capture(w.cats[0]); w.setTime('13:40');
    const event = w.accept('boundary', source); w.ctx.api.queue(w.cats[0], event.record, source); await flush();
    assert.equal(w.partialCalls().length, 0);
    await w.ctx.api.ensure(new Date(timeAt('13:40'))); assert.equal(w.plan().windowStart, timeAt('13:40'));
}
// Use real T7 selection for a crowded, legal scene: no unselected near resident is added.
{
    const w = world(); w.cats[0].x = 500; w.cats[1].x = 280;
    for (const [id, x] of [['e',380],['f',620],['g',720]]) w.cats.push({ ...w.cats[1], id, x, todayInteractions: [] });
    await w.ready(); w.setTime('13:32'); w.seedRuntime();
    const observerSource = w.ctx.api.captureObserver(w.cats[0]);
    let sourceId;
    for (let n = 0; n < 10000; n++) if (activities.decideObserverReactions({ sourceInteractionId: 'many-' + n,
        targetId: 'a', startedAt: timeAt('13:32'), candidates: ['b','e','f','g'].map(id => ({ id, salience: 0 })) }).length === 2) { sourceId = 'many-' + n; break; }
    const event = w.accept(sourceId);
    w.ctx.api.observe({ activeResident: w.cats[0], sourceRecord: event.record, sourceContext: observerSource,
        interactionEpisodeId: event.record.interactionEpisodeId });
    const selected = w.halls[0].currentObserverReactionBatch.reactions.map(row => row.observerId);
    assert.equal(selected.length, 2);
    w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    assert.deepEqual(plain(w.plan().partialReconciliations[0].affectedIds), ['a', ...selected].sort());
    assert.equal(w.selections(), 1); assert.equal(w.partialCalls().length, 1);
}

// Dependency adapter reads the real claim identity/lifecycle, not historical participants.
for (const state of ['interrupted', 'watcher-released', 'completed', 'still-legal']) {
    const w = await world().ready(); w.setTime('13:32');
    const claim = socialActivity.claimOpportunity({ hall: w.halls[0], hallId: 'greek', token: 'shared-token',
        claims: w.env.socialOpportunityClaims, nowMs: timeAt('13:32'), participants: ['a','c'], roomId: 'living',
        sceneId: 'existing-shared-scene', isCurrent: () => w.cats[0].currentForm === 'CAT' });
    assert.ok(claim, 'the fixture must acquire the real canonical shared claim');
    socialActivity.acknowledgeReadiness(claim, w.env.socialOpportunityClaims, 'a');
    socialActivity.acknowledgeReadiness(claim, w.env.socialOpportunityClaims, 'c');
    if (state === 'completed') socialActivity.commitOpportunity(claim, w.env.socialOpportunityClaims, w.halls[0]);
    const source = w.ctx.api.capture(w.cats[0]), event = w.accept('dependency-' + state, source);
    if (['interrupted', 'watcher-released'].includes(state)) {
        // A legitimate accepted form authority change makes this unfinished shared action impossible.
        w.cats[0].currentForm = 'HUMAN'; w.cats[2].blocked = true;
        // The real flush:sync watcher releases the now-invalid exact claim before the reply resolves.
        if (state === 'watcher-released') socialActivity.releaseOpportunity(claim, w.env.socialOpportunityClaims);
        w.ctx.api.progress('c', w.plan().residents[2].beats[0].id, 'invalidated', w.plan().residents[2].lastFoot, 'shared-authority');
    }
    const originalC = w.plan().residents[2];
    w.ctx.api.queue(w.cats[0], event.record, source); await flush();
    assert.deepEqual(plain(w.plan().partialReconciliations[0].affectedIds), ['interrupted', 'watcher-released'].includes(state) ? ['a','c'] : ['a']);
    if (!['interrupted', 'watcher-released'].includes(state)) assert.equal(w.plan().residents[2], originalC);
    else {
        assert.deepEqual(plain(w.plan().partialReconciliations[0].reasons.c), ['shared_dependency']);
        assert.equal(w.partialCalls().length, 0, 'higher authority is not preempted');
        socialActivity.releaseOpportunity(claim, w.env.socialOpportunityClaims); w.cats[2].blocked = false;
        await w.ctx.api.reconcile(); await flush();
        assert.equal(w.partialCalls().length, 1); assert.ok(w.partialCalls()[0].prompt.includes('residentId":"c"'));
        assert.ok(!w.partialCalls()[0].prompt.includes('PRIVATE_'));
    }
}

// Live executor: an unrelated in-flight route/reservation/instance is literally preserved.
{
    const w = world({ enabled: false });
    w.cats.forEach((cat, n) => { cat.mapRoom = 'living'; cat.x = 200 + n * 200; }); await w.ready();
    const d = w.plan().residents[3], staticBeat = d.beats[0];
    const move = { ...staticBeat, id: staticBeat.id + ':walk', behaviorId: 'roam', posture: 'standing',
        state: 'pending', target: { x: 800, y: 700 }, endAt: timeAt('13:36') };
    d.beats = [move, { ...staticBeat, id: staticBeat.id + ':rest', startAt: move.endAt,
        foot: { ...move.target }, requiresBeatId: move.id, state: 'pending' }];
    let tick = 1000, serial = 0; const tasks = new Map();
    const set = (fn, ms) => { const id = ++serial; tasks.set(id, { fn, at: tick + ms }); return id; };
    const advance = async ms => { const end = tick + ms;
        for (let n = 0; n < 1000; n++) { const next = [...tasks].filter(([, task]) => task.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
            if (!next) break; tick = next[1].at; tasks.delete(next[0]); next[1].fn(); await flush(); }
        tick = end; };
    const controller = spatial.createAmbientSimulation({ episodePolicy: w.ctx.api.policy,
        navigation: { legalPoint: w.domains.living.legalPoint, separation: nav.DESTINATION_SEPARATION,
            choose: () => { throw Error('independent destination'); }, plan: (from,to) => nav.planRoute(w.domains.living,from,to) },
        activityPolicy: { initial: activities.initialBehavior, postures: id => activities.definitions[id].postures,
            candidates: () => [], chooseBehavior: () => { throw Error('independent routine'); },
            choosePosture: () => { throw Error('independent posture'); }, duration: () => { throw Error('independent duration'); },
            prepareVisual: () => true, visualReady: () => true, onStableSettle: () => true },
        getAuthoritativePose: () => 'sitting', canOwnResident: id => !w.env.hasHigherHallPresentationOwner(id),
        prepareStandingVisual: () => true, isStandingVisualReady: () => true, now: () => tick,
        setTimer: set, clearTimer: id => tasks.delete(id), requestFrame: fn => set(() => fn(tick),16), cancelFrame: id => tasks.delete(id),
        onChange: snapshot => { w.env.spatialAmbientSnapshot.value = snapshot; } });
    const entries = () => w.plan().residents.map(row => ({ id: row.residentId, key: 'place:' + row.residentId,
        foot: row.lastFoot, authoritativePose: 'sitting' }));
    w.env.syncSpatialAmbient = () => controller.reconcile(entries());
    w.env.syncSpatialAmbient(); await flush(); await advance(400);
    const before = controller.snapshot(), moving = before.residents.find(row => row.id === 'd');
    assert.ok(moving.route?.length); assert.ok(moving.claim); const canonicalD = w.plan().residents[3];
    w.setTime('13:32'); const event = w.accept(); w.ctx.api.queue(w.cats[0], event.record, event.source); await flush();
    const after = controller.snapshot(), same = after.residents.find(row => row.id === 'd');
    assert.equal(same.route, moving.route); assert.deepEqual(plain(same), plain(moving));
    assert.deepEqual(plain(after.reserved), plain(before.reserved)); assert.equal(w.plan().residents[3], canonicalD);
    assert.equal(after.residents.find(row => row.id === 'a').episodeBeatId, w.plan().residents[0].beats[0].id);
    controller.stop();
}

console.log('Phase B focused fixture PASS — affected identity, frozen observers, partial claims, privacy, history, race isolation');
