import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('index.html');
assert.match(html, /const queueFoodHallReconciliation =/, 'Food needs a committed-event bridge, not a UI intent trigger');
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
        window: { Meeow: { storage: { persistSnapshot: snapshot => {
            saves++; if (beforeSave) { const hook=beforeSave; beforeSave=null; hook(snapshot); } if (saves === failAt) return false; stored.push(plain(snapshot)); return true;
        } }, itemVisuals: { assignAutoVisualIdentity: item => item }, statusPosture: { normalizePosture: value => value, getLegacyStatusPose: () => 'standing' }, residentCopy: { factFor: (cat, posture, form) => ({ id: cat.id, posture, form }),
            deriveContext: (fact, event) => ({ ...fact, ...event }), selectPair: () => ({ status: '坐着歇一会儿。', innerThought: '先待在这里。' }) } } }
    };
    const ctx = vm.createContext(env);
    for (const name of ['semantics','inventory']) vm.runInContext(read('js/meeow-' + name + '.js'),ctx);
    vm.runInContext(section('// T6 current-Hall episode authority.', '// End T6 current-Hall episode authority.') +
        '\nglobalThis.api = { ensure:reconcileCurrentHallEpisodeWindow, progress:recordHallEpisodeProgress, reconcile:reconcileAffectedHallResidents,' +
        'owned:isHallEpisodeOwned, valid:usableHallEpisodeWindow, foodCapture:captureFoodHallContinuitySource, foodQueue:queueFoodHallReconciliation };', ctx);
    env.user.inventory = saved?.user?.inventory || [];
    const world = { env, ctx, cats, halls, calls, logs, domains, saves: () => saves, builds, placementReads: () => placementReads, advance: ms => { time += ms; }, selections: () => selectionCount,
        hookSave: hook => { beforeSave=hook; }, contacts: value => { contacts=value; }, cancels,
        failNext: (offset = 1) => { failAt = saves + offset; }, setTime: clock => { time = timeAt(clock); },
        saved: () => stored.at(-1), plan: () => halls[0].currentEpisodeWindow,
        row: id => world.plan().residents.find(row => row.residentId === id),
        partialCalls: () => calls.filter(call => call.options.originSurface === 'hall-affected'),
        settle(call, plan = world.plan()) { call.resolve(JSON.stringify({ entries: plan.residents.flatMap(row =>
            row.beats.filter(beat => call.prompt.includes(beat.id)).map(beat => ({ residentId: row.residentId, beatId: beat.id,
                status: '已保存的活动 ' + row.residentId, innerThought: '已保存的心声 ' + row.residentId }))) })); },
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
function food(w, {id='food-interaction:one', posture=w.cats[0].statusActivity.posture, fail=false, source=w.ctx.api.foodCapture(w.cats[0]), queue=true}={}) {
    const cat=w.cats[0], inventory=w.env.window.Meeow.inventory;
    const item={id:'food-test',uniqueId:'physical:'+id,name:'测试食物',semanticType:'food',type:'consumable',category:'food',tags:['temp:room','taste:bland','smell:mild','texture:soft','family:grain','form:snack']};
    w.env.user.inventory.push(item);
    const decision=inventory.resolveResidentFoodReaction({item,profile:null,residentId:cat.id}); assert.equal(decision.valid,true);
    const committed=inventory.commitFoodInteraction({user:w.env.user,resident:cat,item,decision,eventId:id,
        presentation:{reaction:'PRIVATE_FOOD_PROSE',status:'已有物理活动',posture,innerVoice:'PRIVATE_FOOD_THOUGHT'},
        setStatus:(cat,text,options)=>{cat.status=text;cat.statusActivity={posture:options.posture};cat.innerVoice=options.innerVoice;cat.lastStatusUpdateTime=w.env.Date.now();},
        appendEvent:(cat,type,content,extra)=>{const event={id:'history:'+id,type,content,...extra,interactionEpisodeId:id,at:new w.env.Date().toISOString()};cat.todayInteractions.push(event);return event;},
        persist:()=>fail?false:w.env.window.Meeow.storage.persistSnapshot(w.env.buildSaveData()),normalizeVisual:()=>null,timeLabel:()=>''});
    if(committed.ok && queue) w.ctx.api.foodQueue(cat,committed.event,source);
    return {committed,source,id};
}
const receipt=w=>w.plan().partialReconciliations?.find(r=>r.foodSource);
// UI intent, negative systems and failed canonical Food save have no bridge.
{
 const w=await world().ready(),plan=w.plan(),rows=[...plan.residents]; w.setTime('13:32');
 w.ctx.api.foodCapture(w.cats[0]); await flush(); assert.equal(w.plan(),plan); assert.equal(w.partialCalls().length,0);
 for(const record of [{id:'phone',type:'chat-reply',source:'phone'},{id:'mail',type:'mail'}, {id:'buy',type:'item',source:'shop'}, {id:'preview',type:'item',source:'item-interaction'}]) {
  assert.equal(w.ctx.api.foodQueue(w.cats[0],record,w.ctx.api.foodCapture(w.cats[0])),false);
 }
 const result=food(w,{fail:true});await flush(); assert.equal(result.committed.ok,false);
 assert.equal(w.cats[0].todayInteractions.length,0);assert.equal(w.plan(),plan);assert.equal(w.partialCalls().length,0);
 rows.forEach((row,n)=>assert.equal(w.plan().residents[n],row));
}
// A freshness-only Food presentation is not a new world activity. Preserve identities, including reload ownership.
{
 const w=await world().ready(),row=w.row('a'),beats=row.beats,prior=untouched(w),contents=[...w.plan().content.entries];w.setTime('13:32');
 const result=food(w);await flush();assert.equal(result.committed.ok,true);assert.equal(w.row('a'),row);assert.equal(w.row('a').beats,beats);
 assert.equal(w.ctx.api.owned(w.cats[0]),true);assert.equal(w.partialCalls().length,0);assertUntouched(w,prior);
 contents.forEach(entry=>assert.ok(w.plan().content.entries.includes(entry)));assert.deepEqual(plain(receipt(w).affectedIds),['a']);
 assert.equal(w.cats[0].todayInteractions.length,1);const saved=plain(w.saved());
 const reload=world({saved});assert.equal(reload.ctx.api.owned(reload.cats[0]),true);await reload.ctx.api.reconcile();assert.equal(reload.partialCalls().length,0);
 assert.equal(w.ctx.api.foodQueue(w.cats[0],result.committed.event,result.source),true);await flush();assert.equal(w.partialCalls().length,0);
 assert.equal(w.plan().partialReconciliations.length,1);
}
// Compatible receipt save failure must not turn an ordinary T6 ensure into forced replan.
{
 const w=await world().ready(),row=w.row('a'),beats=row.beats,prior=untouched(w);w.setTime('13:32');
 const result=food(w,{queue:false});w.failNext();w.ctx.api.foodQueue(w.cats[0],result.committed.event,result.source);await flush();
 assert.equal(w.row('a'),row);assert.equal(w.ctx.api.owned(w.cats[0]),false);assert.equal(w.partialCalls().length,0);
 w.failNext();await w.ctx.api.ensure(new w.env.Date());assert.equal(w.row('a'),row);assert.equal(w.ctx.api.owned(w.cats[0]),false);assert.equal(w.partialCalls().length,0);
 await w.ctx.api.ensure(new w.env.Date());assert.equal(w.row('a'),row);assert.equal(w.row('a').beats,beats);
 assert.equal(w.partialCalls().length,0);assert.equal(w.ctx.api.owned(w.cats[0]),true);assertUntouched(w,prior);
}
// A real accepted posture change invalidates A; contact remains authoritative, no food-location teleport.
{
 const w=await world().ready(),prior=untouched(w),old=w.row('a');w.setTime('13:32');
 const runtime=w.env.spatialAmbientSnapshot.value.residents.find(row=>row.id==='a');runtime.foot={x:220,y:500};runtime.state='paused';delete runtime.localActivityPose;
 const result=food(w,{posture:'standing'});await flush();assert.equal(result.committed.ok,true);
 assert.notEqual(w.row('a'),old);assert.deepEqual(plain(receipt(w).affectedIds),['a']);assertUntouched(w,prior);
 const row=w.row('a');assert.equal(row.continuation.startedAt,timeAt('13:32'));assert.deepEqual(plain(row.beats[row.continuation.pastCount].foot),{x:220,y:500});
 assert.equal(w.partialCalls().length,1);const call=w.partialCalls()[0];
 for(const privateText of ['PRIVATE_FOOD_PROSE','PRIVATE_FOOD_THOUGHT','matchedPreferences','affinityDelta','itemUniqueId','reactionClass','provenance'])assert.ok(!call.prompt.includes(privateText));
 assert.ok(call.prompt.includes('测试食物'));w.settle(call);await flush();assert.equal(w.cats[0].todayInteractions.length,1);
 assert.equal(w.ctx.api.foodQueue(w.cats[0],result.committed.event,result.source),true);await flush();assert.equal(w.partialCalls().length,1);
 const reload=world({saved:plain(w.saved())});await reload.ctx.api.reconcile();assert.equal(reload.partialCalls().length,0);
}
// Unfinished, truly interrupted shared continuity only; not historical/compatible partners or proximity/T7.
for(const state of ['interrupted','completed','compatible']) {
 const w=await world().ready();w.setTime('13:32');const originalB=w.row('b'),originalC=w.row('c');
 const claim=socialActivity.claimOpportunity({hall:w.halls[0],hallId:'greek',token:'food-shared',claims:w.env.socialOpportunityClaims,nowMs:w.env.Date.now(),participants:['a','b'],roomId:'living',sceneId:'scene',isCurrent:()=>w.cats[0].statusActivity.posture==='sitting'});
 socialActivity.acknowledgeReadiness(claim,w.env.socialOpportunityClaims,'a');socialActivity.acknowledgeReadiness(claim,w.env.socialOpportunityClaims,'b');
 if(state==='completed')socialActivity.commitOpportunity(claim,w.env.socialOpportunityClaims,w.halls[0]);
 food(w,{posture:state==='compatible'?'sitting':'standing'});await flush();
 assert.deepEqual(plain(receipt(w).affectedIds),state==='interrupted'?['a','b']:['a']);assert.equal(w.row('c'),originalC);assert.equal(w.selections(),0);
 if(state==='interrupted')assert.notEqual(w.row('b'),originalB);else assert.equal(w.row('b'),originalB);
 assert.equal(w.partialCalls().length,state==='compatible'?0:1);assert.equal(w.cats[0].todayInteractions.length,1);
}
// Failed Hall plan save does not undo food; retry freezes current time/contact, no unsaved-row reuse.
{
 const w=await world().ready(),old=w.row('a'),prior=untouched(w);w.setTime('13:32');
 const result=food(w,{posture:'standing',queue:false});w.failNext();w.ctx.api.foodQueue(w.cats[0],result.committed.event,result.source);await flush();
 assert.equal(w.row('a'),old);assert.equal(w.partialCalls().length,0);assert.equal(w.cats[0].todayInteractions.length,1);assert.equal(w.env.user.inventory.length,0);
 w.setTime('13:33');const runtime=w.env.spatialAmbientSnapshot.value.residents.find(row=>row.id==='a');runtime.foot={x:240,y:500};runtime.state='paused';
 await w.ctx.api.reconcile(new w.env.Date());assert.equal(w.row('a').continuation.startedAt,timeAt('13:33'));
 assert.deepEqual(plain(w.row('a').beats[w.row('a').continuation.pastCount].foot),{x:240,y:500});assert.equal(w.partialCalls().length,1);assertUntouched(w,prior);
 assert.equal(w.cats[0].todayInteractions.length,1);assert.equal(receipt(w).sourceId,result.id);
}
// A disappearing current contact stays pending, not old lastFoot; no content request.
{
 const w=await world().ready(),old=w.row('a');w.setTime('13:32');const result=food(w,{posture:'standing',queue:false});
 w.failNext();w.ctx.api.foodQueue(w.cats[0],result.committed.event,result.source);await flush();
 w.setTime('13:33');w.contacts(false);w.env.spatialAmbientSnapshot.value.residents=[];await w.ctx.api.reconcile();
 assert.equal(w.row('a'),old);assert.equal(w.partialCalls().length,0);assert.deepEqual(plain(receipt(w).waitingIds),['a']);
}
// A saved continuation survives claim-save failure, keeping exact row/beats; retry dispatches once.
{
 const w=await world().ready();w.setTime('13:32');const result=food(w,{posture:'standing',queue:false});w.failNext(2);
 w.ctx.api.foodQueue(w.cats[0],result.committed.event,result.source);await flush();const row=w.row('a'),beats=row.beats,builds=w.builds.length,reads=w.placementReads();assert.equal(w.partialCalls().length,0);
 w.setTime('13:33');await w.ctx.api.reconcile();assert.equal(w.row('a'),row);assert.equal(w.row('a').beats,beats);assert.equal(w.builds.length,builds);assert.equal(w.placementReads(),reads);assert.equal(w.partialCalls().length,1);
}
// Away/higher authority, Hall switch and new window beat both program and async publication.
for(const race of ['away-save','higher-save','window-save','hall-save','away-result','window-result','hall-result']) {
 const w=await world().ready(),old=w.row('a');w.setTime('13:32');const result=food(w,{posture:'standing',queue:false});
 const change=()=>{if(race.startsWith('away'))w.cats[0].isOut=true;else if(race.startsWith('higher'))w.cats[0].blocked=true;else if(race.startsWith('hall')){w.cats[0].hallId='gotham';w.env.activeHallId.value='gotham';}else w.setTime('13:42');};
 if(race.endsWith('save'))w.hookSave(change);
 w.ctx.api.foodQueue(w.cats[0],result.committed.event,result.source);await flush();
 if(race.endsWith('save')){assert.equal(w.row('a'),old);assert.equal(w.partialCalls().length,0);}else {
  const row=w.row('a'),entries=w.plan().content.entries,call=w.partialCalls()[0];assert.ok(call);change();w.settle(call);await flush();assert.equal(w.row('a'),row);assert.equal(w.plan().content.entries,entries);
 }
 assert.equal(w.cats[0].todayInteractions.length,1);
}
// Provider disabled/failure leaves committed food and durable fallback, no whole-Hall reroll.
for(const enabled of [false,true]) {
 const w=await world({enabled}).ready();w.setTime('13:32');food(w,{posture:'standing'});await flush();
 if(enabled){w.partialCalls()[0].reject(new Error('mock failure'));await flush();}
 assert.equal(w.row('a').state,'valid');assert.equal(w.cats[0].todayInteractions.length,1);assert.equal(w.env.user.inventory.length,0);
 assert.equal(receipt(w).state,'fallback');assert.equal(w.partialCalls().length,enabled?1:0);
}
// Completed pre-food beats stay history under the same canonical budget/window.
{
 const w=await world({enabled:false}).ready(),row=w.row('a'),first=row.beats[0];
 first.endAt=timeAt('13:30');first.state='completed';row.beats=[first,{...first,id:first.id+':next',startAt:first.endAt,endAt:timeAt('13:40'),state:'active'}];
 w.setTime('13:32');food(w,{posture:'standing'});await flush();assert.equal(w.row('a').beats[0],first);assert.ok(w.row('a').beats.length<=activities.episodeBeatLimit);assert.equal(w.row('a').beats.at(-1).endAt,w.plan().windowEnd);
}
// A physically absent resident produces only Food history, never Hall presence/activation.
{
 const w=await world().ready();w.cats[0].isOut=true;const plan=w.plan();food(w);await flush();assert.equal(w.plan(),plan);assert.equal(w.partialCalls().length,0);assert.equal(w.cats[0].todayInteractions.length,1);
}
// Execute the real UI handler and real status setter: no bridge on intent, failed save or non-Food inspection.
for(const mode of ['compatible','failed','stale']) {
 const fails=mode==='failed',w=await world().ready(),cat=w.cats[0],inventory=w.env.window.Meeow.inventory,old=w.row('a');w.setTime('13:32');
 if(mode==='stale')w.ctx.api.progress('a',old.beats[0].id,'invalidated',old.lastFoot,'already-stale');
 vm.runInContext(read('js/meeow-status-posture.js'),w.ctx);
 vm.runInContext('cats.value[0].statusActivity = { posture: cats.value[0].statusActivity.posture };',w.ctx);
 const item={id:'ui-food',uniqueId:'physical:ui',name:'测试食物',semanticType:'food',category:'food',type:'consumable',tags:['temp:room','taste:bland','smell:mild','texture:soft','family:grain','form:snack']};
 w.env.user.inventory=[item];
 Object.assign(w.env,{selectedCat:{value:cat},builtInFoodDefinitions:[],itemInteractionInFlight:{value:false},showBag:{value:true},
  getResidentFoodPreferenceProfile:()=>({profile:null}),buildUserSharedEpisodicMemoryContext:()=>({text:''}),buildResidentPublicNameContract:()=>'',
  getInteractionHolidayContext:()=>'',buildFocusedResidentStateContext:()=>'',claimCharacterInvitation:()=>null,completeCharacterInvitation:()=>{},
  reconcileResidentEpisodeCopy:()=>{},showToast:()=>{},alert:()=>{},ThinkingLevel:{LOW:'LOW'},
  statusPosture:w.env.window.Meeow.statusPosture,normalizeFormValue:value=>value,
  appendMonitorEvent:(cat,text,source)=>{(cat.diary||=[]).push({content:text,source});},
  appendInteractionEvent:(cat,type,content,extra)=>{const event={id:'ui-history',at:new w.env.Date().toISOString(),type,content,...extra};cat.todayInteractions.push(event);return event;},
  persistNow:()=>fails?false:w.env.window.Meeow.storage.persistSnapshot(w.env.buildSaveData()),getCurrentTimeStr:()=>'',
  callAI:()=>{throw new Error('UI offline path may not call provider');}});
 for(const name of ['getInventoryItemKey','canConsumeInventoryItem','resolveInventoryInstanceByUniqueId','resolveResidentFoodReaction','resolveFoodReactionAuthority','buildFoodReactionPromptContract','isFoodReactionPresentationSupported','getFoodReactionFallback','validateItemInteractionResponse','commitFoodInteraction'])w.env[name]=inventory[name];
 w.env.window.crypto={randomUUID:()=> 'ui-food'};w.env.settings.apiKey='';w.env.window.Meeow.itemVisuals.normalizeItemVisual=()=>null;
 w.env.window.Meeow.residentCopy.factFor=(cat,posture,form)=>({id:cat.id,posture,form,status:'正坐着休息。',innerVoice:cat.innerVoice});
 vm.runInContext(section('const setCatStatus =','const applyStatusSyncPresentation =')+section('const useItem = async','const readItem =')+'\nglobalThis.foodUI=useItem;',w.ctx);
 await w.ctx.foodUI({type:'collectible',name:'仅查看',desc:''});assert.equal(w.plan().partialReconciliations,undefined);
 await w.ctx.foodUI(item);await flush();if(mode==='stale')assert.notEqual(w.row('a'),old);else assert.equal(w.row('a'),old);assert.equal(w.partialCalls().length,0);
 assert.equal(cat.todayInteractions.length,fails?0:1);assert.equal(w.env.user.inventory.length,fails?1:0);
 if(!fails){assert.equal(receipt(w).sourceId,'food-interaction:ui-food');assert.equal(w.ctx.api.owned(cat),true);}else assert.equal(w.plan().partialReconciliations,undefined);
}
const use=section('const useItem = async','const readItem =');
assert.ok(use.indexOf('foodHallContinuitySource')<use.indexOf('callAI('));
assert.ok(use.indexOf('queueFoodHallReconciliation')>use.indexOf('if (!committed.ok)'));
assert.ok(use.indexOf('queueFoodHallReconciliation')>use.indexOf('itemInteractionInFlight.value = false'));
console.log('Hall Food committed interaction PASS: real useItem/commit, compatible identity, direct/shared only, frozen retry, privacy and authority races; requests 0/0/0/1/1/0 additional.');
