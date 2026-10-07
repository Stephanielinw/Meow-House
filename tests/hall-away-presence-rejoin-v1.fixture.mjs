import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('index.html');
assert.match(html, /const commitAwayDeparture =/, 'Away departure needs a durable save/publish boundary');
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
    let time = timeAt('13:27'), monotonic = 1000, saves = 0, failAt = 0, selectionCount = 0, placementReads = 0;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
    const ref = value => ({ value }), calls = [], logs = [], stored = [], cancels = [], builds = [];
    let beforeSave = null, contacts = true;
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
        hallActivities: { ...activities, buildEpisodeContinuation: options => { builds.push(options); return activities.buildEpisodeContinuation(options); }, decideObserverReactions: options => { selectionCount++; return activities.decideObserverReactions(options); } },
        hallSpatial: spatial, hallNavigation: { ...nav, loadRoomDomain: async room => { placementReads++; return domains[room]; } }, socialActivity,
        halls: ref(halls), cats: ref(cats), awayEpisodes: ref(saved?.awayEpisodes || []), lifeThreads: ref([]), user: {}, activeHallId: ref('greek'), activeMapRoom: ref('living'),
        currentTab: ref('lounge'), loungeView: ref('room'), hallDisplayMode: ref('text'), document: { visibilityState: 'visible' },
        settings: { apiKey: enabled ? 'mock' : '' }, statusRefreshDisposed: false,
        thinkingStates: {}, socialOpportunityClaims: new Map(),
        getCatHallId: cat => cat.hallId, getResidentPhysicalHallId: cat => cat.isOut ? '' : cat.hallId,
        isResidentInHall: cat => !cat.isOut && !cat.curator, isResidentAway: cat => !!cat.isOut, isResidentInCuratorRoom: cat => !!cat.curator,
        getResidentForm: cat => cat.currentForm, getStructuredStatusPose: cat => cat.statusActivity.posture,
        hasHigherHallPresentationOwner: id => { const cat = cats.find(cat => cat.id === id); return cat?.isOut || cat?.blocked || cat?.currentForm !== 'CAT'; },
        isContextuallyViewingHallPresentation: id => env.activeHallId.value === id && env.document.visibilityState !== 'hidden' &&
            (env.currentTab.value === 'detail' || env.currentTab.value === 'lounge' && env.loungeView.value === 'room'),
        mapCatMarkers: { get value() { return cats.filter(cat => cat.hallId === env.activeHallId.value && !cat.isOut && !cat.curator)
            .map(cat => ({ cat, room: cat.mapRoom, spot: 'floor', position: { left: cat.x / 1024 * 100 + '%', top: '48.828125%' } })); } },
        spatialAmbientSnapshot: ref({ residents: [] }), roomSpatialReady: ref(true), roomSpatialDomain: ref(domains.living),
        roomSpatialContextKey: 'greek|living', normalRoomContextKey: () => 'greek|living',
        normalRoomPlacementKey: marker => 'place:' + marker.cat.id, normalRoomCanOwn: id => { const cat = cats.find(cat => cat.id === id); return !cat?.blocked && !cat?.isOut; },
        personalityRuntime: { getResidentRuntimePersonality: () => ({ state: 'profiled', axes: {} }) },
        getCanonicalRelationshipBaseline: () => ({ label: 'neutral' }),
        stableAttentionHash: value => { let hash = 2166136261; for (const ch of value) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619); return hash >>> 0; },
        buildSaveData: () => ({ halls, cats, awayEpisodes: env.awayEpisodes.value, lifeThreads: env.lifeThreads.value, user: env.user }), addLog: message => logs.push(message),
        buildCatIdentityBlock: cat => 'PRIVATE_USER_AFFINITY_SENTINEL ' + cat.id, buildLeanAmbientContext: cat => 'PUBLIC PERSONALITY ' + cat.id,
        buildPublicSharedPeerRelationshipLines: () => new Map(), buildAuthoritativeUserIdentityContext: () => 'PUBLIC USER',
        buildStatusSyncUserContext: () => 'PUBLIC PRESENCE', getResidentPublicName: cat => cat.id,
        cleanText: value => String(value || '').trim(), parseAIJSON: JSON.parse,
        requestSharedHallContent: (prompt, options) => new Promise((resolve, reject) => {
            assert.equal(options.maxAttempts, 1); calls.push({ prompt, options, resolve, reject });
        }),
        spatialAmbientController: { cancel: id => { cancels.push(id); env.spatialAmbientSnapshot.value.residents =
            env.spatialAmbientSnapshot.value.residents.filter(row => row.id !== id); } },
        syncSpatialAmbient: () => {
            env.spatialAmbientSnapshot.value.residents = env.spatialAmbientSnapshot.value.residents.filter(row => !cats.find(cat => cat.id === row.id)?.isOut);
            if (contacts) for (const cat of cats.filter(cat => !cat.isOut && cat.mapRoom === env.activeMapRoom.value && !cat.blocked)) {
                if (!env.spatialAmbientSnapshot.value.residents.some(row => row.id === cat.id))
                    env.spatialAmbientSnapshot.value.residents.push({ id:cat.id, placementKey:'place:'+cat.id,
                        foot:{x:cat.x,y:500}, state:'paused', transitionGeneration:1 });
            }
        },
        getLifeThreadExcursionIntent: thread => thread.intent,
        scheduleIndependentAwayDepartureGate: hall => { hall.nextIndependentDepartureAt = new Clock(time + 1200000).toISOString(); },
        appendMonitorEvent: (cat, text, source, extra, at) => { cat.todayInteractions.push({ id:extra.episodeId, source, at:at.toISOString() }); },
        appendAwayTransitionTravelogue: (cat, out, at, extra) => { (cat.travelogues ||= []).push({ episodeId:extra.episodeId, out, at:at.toISOString() }); },
        getEpisodeDepartureDayKey: episode => episode.departedAt.slice(0,10),
        isLifeThreadAwayEpisode: episode => episode.provenance?.origin === 'life-thread',
        getMapRoomForCat: cat => cat.mapRoom, getMapSpotForCat: cat => cat.mapPoint,
        setCatStatus: (cat, text, options) => { cat.status=text; cat.statusActivity={posture:options.posture}; cat.lastStatusUpdateTime=options.eventAt.getTime(); },
        formatLogicalDisplayDate: date => date.toISOString(), getOperationalDayKey: date => date.toISOString().slice(0,10),
        deliverPlannedAwayMail: () => true, markAwayEpisodeDiaryReady: () => {},
        reconcileOrdinaryAwayAutonomy: () => {}, reconcileLifeThreadContinuations: () => {}, reconcileActiveSocialPresences: () => {},
        window: { Meeow: { storage: { persistSnapshot: snapshot => {
            saves++; if (beforeSave) { const hook=beforeSave; beforeSave=null; hook(snapshot); } if (saves === failAt) return false; stored.push(plain(snapshot)); return true;
        } }, itemVisuals: { assignAutoVisualIdentity: item => item }, statusPosture: { normalizePosture: value => value, getLegacyStatusPose: () => 'standing' }, residentCopy: { factFor: (cat, posture, form) => ({ id: cat.id, posture, form }),
            deriveContext: (fact, event) => ({ ...fact, ...event }), selectPair: () => ({ status: '坐着歇一会儿。', innerThought: '先待在这里。' }) } } }
    };
    const ctx = vm.createContext(env);
    vm.runInContext(read('js/meeow-away.js'),ctx);
    env.awayLifecycle = env.window.Meeow.away;
    env.awayLifecycle.configure({cleanText:env.cleanText, parseLogicalDate:value => {const date=new Clock(value);return Number.isFinite(date.getTime())?date:null;},
        getCatHallId:env.getCatHallId,isPermanentOut:()=>false,isResidentInHall:env.isResidentInHall,addLog:env.addLog});
    env.getActiveAwayEpisode = (cat,now=new Clock()) => env.awayLifecycle.getActiveEpisode(env.awayEpisodes.value,cat,now);
    env.normalizeAwayEpisodes = env.awayLifecycle.normalizeEpisodes;
    vm.runInContext(section('// T6 current-Hall episode authority.', '// End T6 current-Hall episode authority.') + '\n' +
        section('// T7 observer reaction authority.', '// End T7 observer reaction authority.') + '\n' +
        section('// C1 uses', '// T5 product policy') + '\n' +
        section('const reconcileAwayEpisodes =', 'hallSceneRecords.value = normalizeHallSceneRecords') +
        '\nglobalThis.api = { policy:hallEpisodeExecutionPolicy, ensure:reconcileCurrentHallEpisodeWindow, progress:recordHallEpisodeProgress, capture:captureHallContinuitySource,' +
        'queue:queueAffectedHallReconciliation, reconcile:reconcileAffectedHallResidents, captureObserver:captureObserverInteractionSource,' +
        'observe:queueObserverReactions, observerReconcile:reconcileObserverReactions, owned:isHallEpisodeOwned, depart:createAwayEpisode, departureCommit:commitAwayDeparture, return:reconcileAwayEpisodes, sourceCurrent:awayHallSourceCurrent, valid:usableHallEpisodeWindow };', ctx);
    const world = { env, ctx, cats, halls, calls, logs, domains, saves: () => saves, builds, placementReads: () => placementReads, advance: ms => { time += ms; }, selections: () => selectionCount,
        hookSave: hook => { beforeSave=hook; }, contacts: value => { contacts=value; }, cancels,
        failNext: (offset = 1) => { failAt = saves + offset; }, setTime: clock => { time = timeAt(clock); },
        saved: () => stored.at(-1), plan: () => halls[0].currentEpisodeWindow,
        episode: () => env.awayEpisodes.value[0], row: id => world.plan().residents.find(row => row.residentId === id), receipt: phase => world.plan().partialReconciliations?.find(row => row.awaySource?.phase === phase),
        depart: (minutes=35) => ctx.api.depart(cats[0], {mode:'departure',plannedDurationMinutes:minutes,destination:'PRIVATE_DESTINATION_SENTINEL', plannedArchiveNarrative:'PRIVATE_ARCHIVE_SENTINEL', plannedReturnStatus:'已回到馆内',plannedReturnPosture:'standing',plannedActivities:[],mailPlan:[]},new Clock(),{roll:100,shouldWrite:false}),
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



const untouched = w => w.plan().residents.filter(row => row.residentId !== 'a').map(row => ({row, beats:row.beats, content:w.plan().content.entries.filter(entry=>entry.residentId===row.residentId)}));
const assertUntouched = (w,prior) => { for (const {row,beats,content} of prior) { assert.equal(w.row(row.residentId),row); assert.equal(w.row(row.residentId).beats,beats); for(const entry of content) assert.ok(w.plan().content.entries.includes(entry)); } };
// Short persisted legacy episodes are accepted by the existing lifecycle normalizer;
// C1 does not change the modern Away plan validator's duration policy.
const returnAt = async (w,clock='13:34') => {w.setTime(clock); w.ctx.api.return(new w.env.Date()); await flush();};
{
    const w=await world().ready(), prior=untouched(w), plan=w.plan(), history=plain(w.cats[0].todayInteractions);
    w.failNext(); assert.equal(w.depart(7),null); await flush();
    assert.equal(!!w.cats[0].isOut,false); assert.equal(w.plan(),plan); assert.equal(w.env.awayEpisodes.value.length,0);
    assert.deepEqual(plain(w.cats[0].todayInteractions),history); assert.equal(w.cancels.length,0); assert.equal(w.partialCalls().length,0);
    const episode=w.depart(7); assert.ok(episode); await flush();
    assert.equal(w.episode().id,episode.id); assert.equal(w.cats[0].isOut,true); assert.equal(w.ctx.api.owned(w.cats[0]),false);
    assert.equal(w.row('a').state,'invalidated'); assert.equal(w.cancels.filter(id=>id==='a').length,1);
    assert.equal(w.partialCalls().length,0); assertUntouched(w,prior);
    assert.equal(w.saved().awayEpisodes[0].id,episode.id); assert.equal(w.saved().cats[0].isOut,true);
    assert.equal(w.cats[0].travelogues.length,1); assert.equal(w.ctx.api.valid(w.plan()),true);
    const receipt=w.receipt('departure'); assert.deepEqual(plain(receipt.affectedIds),['a']);
    assert.equal(w.ctx.api.departureCommit(w.cats[0],episode),true); assert.equal(w.env.awayEpisodes.value.length,1);
    await w.ctx.api.ensure(new w.env.Date()); assert.equal(w.partialCalls().length,0); assert.equal(w.ctx.api.owned(w.cats[0]),false);
    w.failNext(); await returnAt(w); assert.equal(w.cats[0].isOut,true); assert.equal(w.episode().status,'active'); assert.equal(w.cats[0].travelogues.length,1);
    await returnAt(w); assert.equal(w.cats[0].isOut,false); assert.equal(w.episode().status,'completed');
    assert.equal(w.plan().windowKey,plan.windowKey); assert.equal(w.row('a').continuation.sourceId,`away:${episode.id}:return`);
    assert.ok(w.row('a').beats.every(beat=>beat.startAt>=timeAt('13:34')&&beat.endAt<=plan.windowEnd));
    assert.ok(w.row('a').beats.length<=3); assert.equal(activities.definitions[w.row('a').beats.at(-1).behaviorId].stationary,true);
    assertUntouched(w,prior); assert.equal(w.partialCalls().length,1); assert.equal(w.cats[0].travelogues.length,2);
    for(const call of w.partialCalls()) assert.doesNotMatch(call.prompt,/PRIVATE_/);
    const row=w.row('a'), historyCount=w.cats[0].travelogues.length, requestCount=w.calls.length;
    w.settle(w.partialCalls()[0]); await flush(); await returnAt(w); await w.ctx.api.ensure(new w.env.Date());
    assert.equal(w.row('a'),row); assert.equal(w.calls.length,requestCount); assert.equal(w.cats[0].travelogues.length,historyCount);
    const reload=world({saved:plain(w.saved())}); reload.setTime('13:34'); await reload.ctx.api.ensure(new reload.env.Date()); await flush();
    assert.equal(reload.calls.length,0); assert.equal(reload.plan().residents.filter(row=>row.residentId==='a').length,1);
    assert.equal(reload.cats[0].travelogues.length,historyCount);
}
{
    const w=world(); w.depart(7); await flush(); await w.ready();
    assert.equal(w.row('a'),undefined); const prior=untouched(w), key=w.plan().windowKey;
    w.contacts(false); await returnAt(w); assert.equal(w.episode().status,'completed'); assert.equal(w.row('a'),undefined);
    assert.deepEqual(plain(w.receipt('return').waitingIds),['a']); assert.equal(w.partialCalls().length,0);
    assert.equal(w.ctx.api.policy.get({id:'a'}).hold,true); assertUntouched(w,prior);
    w.contacts(true); w.env.syncSpatialAmbient(); await w.ctx.api.reconcile(new w.env.Date()); await flush();
    assert.equal(w.plan().windowKey,key); assert.ok(w.row('a')); assert.equal(w.row('a').continuation.startedAt,timeAt('13:34'));
    assert.ok(w.row('a').beats.every(beat=>beat.startAt>=timeAt('13:34'))); assertUntouched(w,prior);
    assert.equal(w.partialCalls().length,1); assert.equal(w.ctx.api.valid(w.plan()),true);
}
{
    const w=await world().ready(), row=w.row('a');
    row.beats[0].state='completed'; row.beats[0].endAt=timeAt('13:26'); const past=row.beats[0];
    w.depart(7); await flush(); await returnAt(w);
    assert.equal(w.row('a').beats[0],past); assert.ok(w.row('a').beats.length<=3); assert.equal(activities.definitions[w.row('a').beats.at(-1).behaviorId].stationary,true);
}
// Only an owned, unfinished shared activity is a dependency. No T7 selection.
for(const phase of ['shared-active','completed']) {
    const w=await world().ready(), c=w.row('c'), d=w.row('d'), b=w.row('b');
    const claim={hallId:'greek',participantIds:['a','b'],shared:{phase,settle:()=>{}},isCurrent:()=>!w.cats[0].isOut,cancel:()=>{}};
    w.env.socialOpportunityClaims.set('greek',claim); w.depart(7); await flush();
    assert.deepEqual(plain(w.receipt('departure').affectedIds),phase==='shared-active'?['a','b']:['a']);
    assert.equal(w.selections(),0); assert.equal(w.row('c'),c); assert.equal(w.row('d'),d);
    if(phase==='shared-active') {assert.notEqual(w.row('b'),b);assert.equal(w.partialCalls().length,1);}
    else {assert.equal(w.row('b'),b);assert.equal(w.partialCalls().length,0);}
}
{
    const w=await world().ready(), old=w.plan(); w.depart(35); await flush(); await returnAt(w,'14:02');
    assert.notEqual(w.plan().windowKey,old.windowKey); assert.equal(w.plan().windowStart,timeAt('14:00'));
    assert.ok(w.row('a').beats.every(beat=>beat.startAt>=timeAt('14:02'))); assert.equal(w.partialCalls().length,0);
    assert.equal(w.calls.length,2); // one canonical whole request in each activated window
}
{
    const w=await world().ready(); w.depart(7); await flush(); const requests=w.calls.length;
    w.env.activeHallId.value='gotham'; w.env.spatialAmbientSnapshot.value.residents=[]; w.contacts(false);
    await returnAt(w); assert.equal(w.episode().status,'completed'); assert.equal(w.cats[0].isOut,false);
    assert.equal(w.calls.length,requests); assert.equal(w.env.spatialAmbientSnapshot.value.residents.length,0);
    w.env.activeHallId.value='greek';w.contacts(true);await w.ctx.api.ensure(new w.env.Date());await flush();
    assert.ok(w.row('a').continuation);assert.equal(w.partialCalls().length,1);
}
// Pending fallback is guarded before save and again before publish.
for(const higher of ['away','blocked']) {
    const w=await world().ready(); w.depart(7);await flush();w.contacts(false);await returnAt(w);w.contacts(true);w.env.syncSpatialAmbient();
    const prior=w.row('a');w.hookSave(()=>{if(higher==='away') w.cats[0].isOut=true;else w.cats[0].blocked=true;});
    await w.ctx.api.reconcile(new w.env.Date());await flush();assert.equal(w.row('a'),prior);assert.equal(w.partialCalls().length,0);
}
{
    const w=await world().ready();w.depart(7);await flush();await returnAt(w);const call=w.partialCalls()[0];assert.ok(call);
    const row=w.row('a'); const second=w.depart(35);assert.ok(second);await flush();
    w.settle(call);await flush();assert.equal(w.cats[0].isOut,true);assert.equal(w.row('a').state,'invalidated');
    assert.equal(w.row('a').continuation.sourceId,row.continuation.sourceId);assert.equal(w.plan().content.entries.some(entry=>entry.status==='已保存的活动 a'&&call.prompt.includes(entry.beatId)),false);
}
{
    const w=await world().ready({deferWhole:true});const whole=w.calls[0];w.depart(7);await flush();await returnAt(w);
    const row=w.row('a');w.settle(whole);await flush();assert.equal(w.row('a'),row);assert.equal(w.row('a').continuation.sourceId,`away:${w.episode().id}:return`);
}
// Return source identity survives a failed projection; unsaved timing/contact do not.
for (const nextContact of [220, 200, null]) {
    const w = await world().ready(); w.depart(7); await flush(); w.contacts(false); await returnAt(w);
    const prior = untouched(w), oldRow = w.row('a'), sourceId = w.receipt('return').sourceId;
    const episodeId = w.episode().id, history = plain(w.cats[0].travelogues);
    w.contacts(true); w.env.syncSpatialAmbient();
    let failedRow;
    w.hookSave(snapshot => { failedRow = snapshot.halls[0].currentEpisodeWindow.residents.find(row => row.residentId === 'a'); });
    w.failNext(); await w.ctx.api.reconcile(new w.env.Date()); await flush();
    assert.equal(w.row('a'), oldRow); assert.equal(w.partialCalls().length, 0);
    assert.equal(failedRow.continuation.startedAt, timeAt('13:34'));
    const failedIds = failedRow.beats.slice(failedRow.continuation.pastCount).map(beat => beat.id);
    w.setTime('13:35');
    if (nextContact === null) {
        w.contacts(false); w.env.spatialAmbientSnapshot.value.residents = w.env.spatialAmbientSnapshot.value.residents.filter(row => row.id !== 'a');
    } else w.env.spatialAmbientSnapshot.value.residents.find(row => row.id === 'a').foot.x = nextContact;
    await w.ctx.api.reconcile(new w.env.Date()); await flush();
    assert.equal(w.episode().id, episodeId); assert.equal(w.receipt('return').sourceId, sourceId);
    assert.equal(w.plan().partialReconciliations.filter(row => row.sourceId === sourceId).length, 1);
    assert.deepEqual(plain(w.cats[0].travelogues), history); assertUntouched(w, prior);
    if (nextContact === null) {
        assert.equal(w.row('a'), oldRow); assert.deepEqual(plain(w.receipt('return').waitingIds), ['a']);
        assert.equal(w.partialCalls().length, 0); assert.equal(w.ctx.api.policy.get({id:'a'}).hold, true);
    } else {
        const row = w.row('a');
        assert.equal(row.continuation.startedAt, timeAt('13:35'), 'failed plan must not backdate a retry');
        assert.deepEqual(plain(row.lastFoot), {x:nextContact,y:500}, 'retry must use current contact');
        assert.ok(row.beats.slice(row.continuation.pastCount).every(beat => beat.startAt >= timeAt('13:35')));
        assert.ok(row.beats.slice(row.continuation.pastCount).every(beat => !failedIds.includes(beat.id)));
        if (nextContact !== 200) assert.ok(row.beats.slice(row.continuation.pastCount).every(beat => beat.foot.x !== 200 && beat.target?.x !== 200));
        assert.equal(w.partialCalls().length, 1);
        const stale = {entries:failedIds.map(beatId => ({residentId:'a',beatId,status:'旧 attempt',innerThought:'旧 attempt'}))};
        assert.notEqual(w.partialCalls()[0].options.validateResponse(JSON.stringify(stale)), true);
        w.partialCalls()[0].resolve(JSON.stringify(stale)); await flush();
        assert.equal(w.row('a'), row); assert.equal(w.plan().content.entries.some(entry => entry.status === '旧 attempt'), false);
    }
}
// Saved plan and unsaved content claim are different failure boundaries.
{
    const w = await world().ready(); w.depart(7); await flush(); w.contacts(false); await returnAt(w);
    w.contacts(true); w.env.syncSpatialAmbient(); const builderCount = w.builds.length;
    w.failNext(2); await w.ctx.api.reconcile(new w.env.Date()); await flush();
    const row = w.row('a'), beats = row.beats, continuation = row.continuation, ids = beats.map(beat => beat.id);
    assert.ok(continuation); assert.equal(w.builds.length, builderCount + 1); assert.equal(w.partialCalls().length, 0);
    assert.equal(w.receipt('return').state, 'pending');
    const placementReads = w.placementReads(); w.setTime('13:35');
    await w.ctx.api.reconcile(new w.env.Date()); await flush();
    assert.equal(w.row('a'), row); assert.equal(w.row('a').beats, beats); assert.equal(w.row('a').continuation, continuation);
    assert.deepEqual(w.row('a').beats.map(beat => beat.id), ids);
    assert.equal(w.builds.length, builderCount + 1); assert.equal(w.placementReads(), placementReads);
    assert.equal(w.partialCalls().length, 1); w.settle(w.partialCalls()[0]); await flush();
}
// A single frozen attempt tolerates wall-clock progress inside persistence.
{
    const w = await world().ready(); w.depart(7); await flush(); w.contacts(false); await returnAt(w);
    w.contacts(true); w.env.syncSpatialAmbient(); w.hookSave(() => w.advance(30));
    await w.ctx.api.reconcile(new w.env.Date()); await flush();
    assert.equal(w.row('a').continuation.startedAt, timeAt('13:34')); assert.equal(w.partialCalls().length, 1);
}
// Contact is copied into the attempt, not retained as a live mutable runtime object.
{
    const w = await world().ready(); w.depart(7); await flush(); w.contacts(false); await returnAt(w);
    w.contacts(true); w.env.syncSpatialAmbient(); const oldRow = w.row('a');
    const live = w.env.spatialAmbientSnapshot.value.residents.find(row => row.id === 'a');
    w.hookSave(() => { live.foot.x = 220; });
    await w.ctx.api.reconcile(new w.env.Date()); await flush();
    assert.equal(w.row('a'), oldRow, 'mutated contact must not publish the frozen plan'); assert.equal(w.partialCalls().length, 0);
}
// Floats remain placement data; they are not new event/attempt ID authority.
{
    const run = async x => {
        const w = await world().ready(); w.depart(7); await flush(); w.contacts(false); await returnAt(w);
        w.contacts(true); w.env.syncSpatialAmbient(); w.env.spatialAmbientSnapshot.value.residents.find(row => row.id === 'a').foot.x = x;
        await w.ctx.api.reconcile(new w.env.Date()); await flush();
        assert.equal(w.builds.at(-1).seedSuffix.includes(String(x)), false);
        return w.builds.at(-1).seedSuffix.replace(w.episode().id, 'same-episode');
    };
    assert.equal(await run(220.00001), await run(220.00002));
}
// Lifecycle wiring is confined to departure/return; accepted Mail delivery and
// Phone worker/attachment functions remain byte-identical to the accepted base.
assert.doesNotMatch(section('const recordDeliveredMail =','const generateMail ='),/commitAway(?:Departure|Return)|stageAwayHallReceipt/);
assert.doesNotMatch(section('const runPhoneReplyOpportunity =','const reconcilePhoneReplyOpportunities ='),/commitAway(?:Departure|Return)|stageAwayHallReceipt/);
console.log('C1 Away durable save/failure, departure 0 AI, shared dependency, existing/missing row rejoin, hidden/new window, reload, races, privacy PASS');
