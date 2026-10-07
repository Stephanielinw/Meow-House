import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('index.html');
assert.match(html, /const commitExploreExternalTransition =/, 'Explore needs a durable external segment boundary');
const plain = value => JSON.parse(JSON.stringify(value));
const section = (a,b) => html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const flush = async () => { for (let n=0;n<250;n++) await Promise.resolve(); };
// Execute the accepted contact/storage/runtime harness and real T6/C1 reconciler.
const c1 = read('tests/hall-away-presence-rejoin-v1.fixture.mjs');
const factory = new Function('vm','read','html','assert',c1.slice(c1.indexOf('const plain ='),c1.indexOf('const untouched ='))+'\nreturn world;')(vm,read,html,assert);
const seed = {publicHook:'公开调查钩子',coreQuestion:'问题',hiddenTruth:'PRIVATE_TRUTH',
    nodes:[{name:'外部起点',visibleDescription:'外部场景',exitIndexes:[1]},{name:'外部终点',visibleDescription:'终点',exitIndexes:[0]}],
    clues:[0,1,2].map(i=>({revealText:'线索'+i,nodeIndexes:[0],discoveryModes:['observe']})),
    revelations:[{text:'公开结论',minEvidence:2,evidencePaths:[[0,1]]}],solution:{requiredRevelationIndexes:[0]}};
function world(options={}) {
    const w=factory(options),e=w.env;
    e.user=options.saved?.user || {exploreCases:[],activeExploreCaseId:'',coins:100};
    Object.assign(e,{crypto:{randomUUID},EXPLORE_LOCATIONS:[{id:'outside',hallId:'gotham',name:'馆外'}],
        exploreState:{active:false,caseId:'',companion:null},exploreInput:{value:''},exploreChatRef:{value:null},
        showExploreSettlement:{value:false},mapCatVisualRevision:{value:0},currentHall:{value:w.halls[0]},isFocusing:{value:false},
        getActiveFocusSession:()=>null,getReadableAPIError:error=>error.message,showToast:()=>{},confirm:()=>true,
        persistNow:()=>e.window.Meeow.storage.persistSnapshot(e.buildSaveData()),
        terminateActiveSocialPresenceForResident:()=>{w.socialStops++;},nextTick:fn=>Promise.resolve(fn?.()),
        appendInteractionEvent:(cat,type,content,extra)=>{(cat.todayInteractions ||= []).push({type,content,at:new e.Date().toISOString(),...extra});},
        appendMonitorEvent:(cat,content,source,extra)=>{(cat.diary ||= []).push({content,source,...extra});},
        refreshAllStatus:async()=>true,requestStructuredEngine:async()=>{w.externalCalls++;return JSON.stringify({summary:'公开总结',loot:null,lore:null});},
        ThinkingLevel:{LOW:0},buildResidentPublicNameContract:()=>'',CORE_ROLEPLAY_PROMPT:'PUBLIC',
        unlockCodexEntry:()=>{},getSkillValue:()=>40});
    e.window.Meeow.gameplayRewards={normalizeRewardObjectProposal:()=>({})};
    Object.assign(e.window.Meeow.itemVisuals,{validateVisualHint:()=>false,validateAuthoredItemVisualHint:()=>true,formatVisualHintContract:()=>''});
    w.socialStops=0;w.externalCalls=0;
    vm.runInContext(section('function getActiveExploreExternalSegment(', 'let focusStartDraft =')+section('const EXPLORE_CASE_VERSION','// Transport-only structured request helper.')+section('const requestExploreNarration =','const legacyGenerateExploreGoals')+'\n'+
        section('const presentExploreEvidenceNow =','// Normalize persisted optional Case state')+section('const commitExploreOpening =','let explorePreparedCase =')+section('const startExploration =','const getExploreDiscoveredClues')+'\n'+
        section('const closeExplore =','// Program-only first-reveal')+section('const reconcileSharedSocialClaims =','// Existing static presentation needs no new art.')+'\n'+
        'globalThis.getActiveExploreExternalSegment=getActiveExploreExternalSegment;globalThis.explore={commit:commitExploreExternalTransition,recover:recoverExploreExternalActivity,normalize:normalizeExploreCases,'+
        'opening:commitExploreOpening,resume:resumeExploreCase,pause:pauseExploreCase,abandon:abandonExploreCase,leave:leaveSolvedExploreCase,settle:settleSolvedExploreCase,'+
        'narrate:applyExploreNarration,freeze:freezeExploreNarrationAuthority,blueprint:normalizeExploreCaseBlueprint,state:normalizeExploreCaseState};',w.ctx);
    e.hasHigherHallPresentationOwner=id=>{const cat=w.cats.find(cat=>cat.id===id);return !!cat&&(cat.isOut||cat.blocked||cat.focus||cat.currentForm!=='CAT'||w.ctx.getActiveExploreExternalSegment(id));};
    e.normalRoomCanOwn=id=>!e.hasHigherHallPresentationOwner(id);
    const sync=e.syncSpatialAmbient;
    e.syncSpatialAmbient=()=>{sync();e.spatialAmbientSnapshot.value.residents=e.spatialAmbientSnapshot.value.residents.filter(row=>!e.hasHigherHallPresentationOwner(row.id));};
    w.makeCase=(id='case-one')=>{const at=new e.Date().toISOString(),blueprint=w.ctx.explore.blueprint(seed,id,e.EXPLORE_LOCATIONS[0]);
        return {id,status:'paused',createdAt:at,startedAt:at,updatedAt:at,locationId:'outside',destinationHallId:'gotham',
            source:{kind:'fresh',sourceEvidence:[]},blueprint,state:w.ctx.explore.state({companionId:'a'},blueprint,'a',at),publicTranscript:[],settlementState:'none'};};
    w.case=()=>e.user.exploreCases[0];
    w.start=(record=w.case()||w.makeCase())=>w.ctx.explore.commit(record,'start');
    w.end=reason=>w.ctx.explore.commit(w.case(),'return',reason||'paused');
    w.contact=(x=220)=>{e.spatialAmbientSnapshot.value.residents=e.spatialAmbientSnapshot.value.residents.filter(r=>r.id!=='a');
        e.spatialAmbientSnapshot.value.residents.push({id:'a',placementKey:'place:a',foot:{x,y:500},state:'paused',transitionGeneration:1});};
    w.receipt=phase=>w.plan()?.partialReconciliations?.find(r=>r.externalSource?.segmentId===w.case()?.externalSegment?.id&&r.externalSource.phase===phase);
    w.reconcile=async()=>{await w.ctx.api.reconcile(new e.Date());await flush();};
    w.ensure=async()=>{await w.ctx.api.ensure(new e.Date());await flush();};
    w.settleContent=call=>{const packets=call.prompt.split('\n').filter(l=>l.startsWith('{"residentId":')).map(JSON.parse);
        call.resolve(JSON.stringify({entries:packets.flatMap(row=>row.beats.map(beat=>({residentId:row.residentId,beatId:beat.beatId,status:'合法续接',innerThought:'先待一会儿'})))}));};
    return w;
}
const untouched=w=>w.plan().residents.filter(row=>row.residentId!=='a').map(row=>({row,beats:row.beats,entries:w.plan().content.entries.filter(e=>e.residentId===row.residentId)}));
const preserved=(w,before)=>{for(const p of before){assert.equal(w.row(p.row.residentId),p.row);assert.equal(w.row(p.row.residentId).beats,p.beats);for(const entry of p.entries)assert.ok(w.plan().content.entries.includes(entry));}};

{
    const w=await world().ready(),before=untouched(w),plan=w.plan(),record=w.makeCase();
    // Selection/UI state is not external authority.
    w.env.exploreState.companion=w.cats[0];w.env.exploreState.active=true;
    assert.equal(w.ctx.api.owned(w.cats[0]),true);assert.equal(w.partialCalls().length,0);
    w.failNext();assert.equal(w.start(record),false);await flush();
    assert.equal(w.env.user.exploreCases.length,0);assert.equal(w.plan(),plan);assert.equal(w.cancels.length,0);assert.equal(w.socialStops,0);
    assert.equal(w.start(record),true);await flush();
    const id=w.case().externalSegment.id;assert.equal(w.case().externalSegment.state,'active');assert.equal(w.ctx.api.owned(w.cats[0]),false);
    assert.equal(w.row('a').state,'invalidated');assert.equal(w.cats[0].isOut,undefined);assert.equal(w.partialCalls().length,0);preserved(w,before);
    assert.equal(w.start(),true);await flush();assert.equal(w.case().externalSegment.id,id);assert.equal(w.cancels.filter(id=>id==='a').length,1);
    assert.equal(w.plan().partialReconciliations.filter(r=>r.externalSource?.phase==='start').length,1);
    assert.equal(w.selections(),0);
    w.failNext();assert.equal(w.end(),false);assert.equal(w.case().externalSegment.state,'active');assert.equal(w.ctx.api.owned(w.cats[0]),false);
    w.setTime('13:34');w.contact();assert.equal(w.end(),true);await flush();
    const row=w.row('a');assert.equal(row.continuation.startedAt,new w.env.Date().getTime());assert.equal(row.beats[row.continuation.pastCount].foot.x,220);
    assert.equal(w.case().externalSegment.id,id);assert.equal(w.case().externalSegment.state,'returned');assert.equal(w.partialCalls().length,1);preserved(w,before);
    const count=w.calls.length;assert.equal(w.end(),true);await w.ensure();assert.equal(w.row('a'),row);assert.equal(w.calls.length,count);
    assert.doesNotMatch(w.partialCalls()[0].prompt,/PRIVATE_TRUTH|PRIVATE_CHAT|PRIVATE_THOUGHT|external reward/);
    w.settleContent(w.partialCalls()[0]);await flush();assert.equal(w.receipt('return').state,'accepted');
}
// The real opening producer commits exactly one public fact and reuses its failed-save segment draft.
{
    const w=await world().ready(),record=w.makeCase('opening-retry');let firstId;
    w.hookSave(snapshot=>{firstId=snapshot.user.exploreCases[0].externalSegment.id;w.failNext(0);});
    assert.equal(w.ctx.explore.opening(record),false);assert.equal(record.publicTranscript.length,0);assert.equal(w.env.user.exploreCases.length,0);
    assert.equal(w.ctx.explore.opening(record),true);await flush();assert.equal(record.externalSegment.id,firstId);
    assert.equal(record.publicTranscript.length,1);assert.equal(record.state.history.length,1);assert.equal(w.partialCalls().length,0);
    assert.equal(w.ctx.explore.opening(record),true);assert.equal(record.publicTranscript.length,1);
}
// Only genuinely unfinished shared continuity is interrupted; no observer expansion.
for(const phase of ['shared-active','completed']) {
    const w=await world().ready(),c=w.row('c'),b=w.row('b');
    const claim={hallId:'greek',participantIds:['a','b'],shared:{phase,settle:()=>{}},isCurrent:()=>!w.ctx.getActiveExploreExternalSegment('a'),cancel:()=>{}};
    w.env.socialOpportunityClaims.set('greek',claim);assert.equal(w.start(),true);await flush();
    assert.equal(w.env.socialOpportunityClaims.size,0,'real shared-claim release follows durable external ownership');await w.reconcile();
    assert.deepEqual(plain(w.receipt('start').affectedIds),phase==='shared-active'?['a','b']:['a']);
    assert.equal(w.row('c'),c);if(phase==='completed')assert.equal(w.row('b'),b);
    assert.equal(w.partialCalls().length,phase==='shared-active'?1:0);assert.equal(w.selections(),0);
}
// Existing completed history stays history; missing-row return only constructs time ahead.
for(const missing of [false,true]) {
    const w=world();if(missing)assert.equal(w.start(),true);await w.ready();
    if(missing)assert.equal(w.row('a'),undefined);else{const old=w.row('a'),first=old.beats[0];first.endAt=new w.env.Date('2026-10-06T13:28:00-07:00').getTime();first.state='completed';old.beats.push({...first,id:first.id+':future',startAt:first.endAt,endAt:w.plan().windowEnd,state:'pending'});assert.equal(w.start(),true);}
    await flush();const before=untouched(w),key=w.plan().windowKey;w.setTime('13:34');w.contact(230);assert.equal(w.end(),true);await flush();
    const row=w.row('a');assert.equal(w.plan().windowKey,key);assert.equal(row.continuation.startedAt,new w.env.Date().getTime());
    assert.equal(row.beats[row.continuation.pastCount].foot.x,230);assert.ok(row.beats.length<=3);assert.equal(row.beats.at(-1).endAt,w.plan().windowEnd);
    assert.equal(row.continuation.pastCount,missing?0:1);preserved(w,before);assert.equal(w.partialCalls().length,1);
}
{
    const w=await world().ready();w.start();await flush();w.contacts(false);w.setTime('13:34');assert.equal(w.end(),true);await flush();
    assert.equal(w.case().externalSegment.state,'returned');assert.equal(w.row('a').state,'invalidated');assert.deepEqual(plain(w.receipt('return').waitingIds),['a']);
    assert.equal(w.partialCalls().length,0);w.contact();await w.reconcile();assert.equal(w.partialCalls().length,1);
}
{
    const w=await world().ready();w.start();await flush();const old=w.plan();w.setTime('13:42');await w.ensure();assert.equal(w.row('a'),undefined);
    w.contact();w.end();await flush();assert.notEqual(w.plan().windowKey,old.windowKey);assert.equal(w.row('a').continuation.startedAt,new w.env.Date().getTime());
    assert.equal(w.row('a').beats.at(-1).endAt,w.plan().windowEnd);
}
{
    const w=await world().ready();w.start();await flush();w.env.activeHallId.value='gotham';w.end();await flush();
    assert.equal(w.case().externalSegment.state,'returned');assert.equal(w.partialCalls().length,0);
    w.env.activeHallId.value='greek';w.contact();await w.ensure();assert.ok(w.row('a').continuation);assert.equal(w.partialCalls().length,1);
}
// Stable legacy identity is recovered from durable Case provenance, never the reload clock.
{
    const first=await world().ready(),record=first.makeCase('legacy-open');record.status='open';
    first.env.user.exploreCases=[record];first.env.user.activeExploreCaseId=record.id;
    first.ctx.explore.normalize();assert.equal(first.ctx.explore.recover(),true);await flush();
    const id=first.case().externalSegment.id;assert.equal(id,'explore-segment:legacy-open:legacy');assert.equal(first.partialCalls().length,0);
    const saved=plain(first.saved());
    for(let n=0;n<2;n++){const w=world({saved:plain(saved)});w.setTime('13:30');w.ctx.explore.normalize();w.ctx.explore.recover();await w.ensure();
        assert.equal(w.case().externalSegment.id,id);assert.equal(w.plan().partialReconciliations.filter(r=>r.externalSource?.phase==='start').length,1);
        assert.equal(w.partialCalls().length,0);assert.deepEqual(plain(w.cats[0].todayInteractions),saved.cats[0].todayInteractions);}
    // Even a reload before the optional record was saved derives the same legacy ID.
    delete saved.user.exploreCases[0].externalSegment;const retry=world({saved});retry.setTime('13:31');retry.ctx.explore.normalize();retry.ctx.explore.recover();await flush();
    assert.equal(retry.case().externalSegment.id,id);
}
// Multiple segments of the same Case cannot reuse old sources or late narrative.
{
    const w=await world().ready(),first=w.makeCase('legacy-selected'),second=w.makeCase('legacy-history');
    first.status=second.status='open';second.state.companionId='b';
    w.env.user.exploreCases=[first,second];w.env.user.activeExploreCaseId=first.id;
    w.ctx.explore.normalize();w.ctx.explore.recover();await flush();
    assert.equal(w.ctx.getActiveExploreExternalSegment('a').id,'explore-segment:legacy-selected:legacy');
    assert.equal(w.ctx.getActiveExploreExternalSegment('b'),null);
    assert.equal(w.env.user.exploreCases[1].status,'paused');assert.equal(w.partialCalls().length,0);
}
{
    const w=await world().ready();w.start();await flush();const first=w.case().externalSegment.id;
    w.setTime('13:32');w.contact();w.end();await flush();const late=w.partialCalls()[0];
    w.ctx.explore.resume(w.case().id);await flush();const second=w.case().externalSegment.id;assert.notEqual(second,first);
    const state=w.row('a');w.settleContent(late);await flush();assert.equal(w.row('a'),state);assert.equal(w.row('a').state,'invalidated');
    w.setTime('13:34');w.contact(250);w.ctx.explore.pause();await flush();assert.equal(w.row('a').beats[w.row('a').continuation.pastCount].foot.x,250);
    assert.equal(w.plan().partialReconciliations.filter(r=>r.externalSource?.caseId===w.case().id).length,4);
}
// Plan-save failure rebuilds from NOW; claim-save failure reuses the saved row.
for(const kind of ['plan','claim','contact-gone','same-contact']) {
    const w=await world().ready();w.start();await flush();w.setTime('13:34');w.contacts(false);w.end();await flush();w.contact(200);
    w.failNext(kind==='claim'?2:1);await w.reconcile();assert.equal(w.partialCalls().length,0);
    const row=w.row('a'),beats=row.beats,ids=beats.map(b=>b.id),builds=w.builds.length,reads=w.placementReads();
    w.setTime('13:35');if(kind==='contact-gone')w.env.spatialAmbientSnapshot.value.residents=[];else w.contact(kind==='same-contact'?200:220);
    await w.reconcile();
    if(kind==='claim'){assert.equal(w.row('a'),row);assert.equal(row.beats,beats);assert.deepEqual(row.beats.map(b=>b.id),ids);assert.equal(w.builds.length,builds);assert.equal(w.placementReads(),reads);}
    else if(kind==='contact-gone'){assert.equal(w.row('a'),row);assert.equal(w.partialCalls().length,0);assert.deepEqual(plain(w.receipt('return').waitingIds),['a']);continue;}
    else {assert.equal(w.row('a').continuation.startedAt,new w.env.Date().getTime());assert.equal(w.row('a').beats[w.row('a').continuation.pastCount].foot.x,kind==='same-contact'?200:220);}
    assert.equal(w.partialCalls().length,1);
}
// Both fallback and content lose to a newer owner, window, or true Hall.
for(const owner of ['away','focus','external','hall','window']) {
    const w=await world().ready();w.start();await flush();w.setTime('13:34');w.contacts(false);w.end();await flush();w.contact();
    w.hookSave(()=>{if(owner==='away')w.cats[0].isOut=true;else if(owner==='focus')w.cats[0].focus=true;
        else if(owner==='external')w.start();else if(owner==='hall')w.cats[0].hallId='gotham';else w.setTime('13:42');});
    await w.reconcile();assert.equal(w.row('a').state,'invalidated');assert.equal(w.partialCalls().length,0);
}
{
    const w=await world().ready({deferWhole:true}),late=w.calls[0];w.start();await flush();w.settle(late);await flush();
    assert.ok(!w.plan().content.entries.some(entry=>entry.residentId==='a'));assert.equal(w.ctx.api.owned(w.cats[0]),false);
}
// Physical return remains committed while the original settlement operation retries.
{
    const w=await world().ready();w.start();await flush();w.case().status='solved';w.setTime('13:34');w.contact();
    // Freeze the original settlement flavor so this test isolates persistence, not its provider.
    w.case().settlementOperation={id:'explore-settlement:'+w.case().id,status:'pending',rewards:{coins:60,affinityChange:2},
        settlement:{summary:'公开结果',loot:null,lore:null},receipts:{},travelogue:{status:'complete',content:'已保存游记'}};
    let failed=false;w.hookSave(function failSettlement(snapshot){if(snapshot.user.exploreCases[0].settlementOperation?.receipts.coins){failed=true;w.failNext(0);}else w.hookSave(failSettlement);});
    assert.equal(await w.ctx.explore.leave(),false);await flush();assert.equal(failed,true);assert.equal(w.case().externalSegment.state,'returned');
    assert.ok(w.row('a').continuation);assert.equal(w.partialCalls().length,1);const row=w.row('a'),requests=w.calls.length;
    await w.ctx.explore.settle(w.case());await w.ctx.explore.settle(w.case());await flush();
    assert.equal(w.case().externalSegment.state,'returned');assert.equal(w.case().settlementState,'complete');assert.equal(w.env.user.coins,160);
    assert.equal(w.cats[0].affinity,2);assert.equal(w.cats[0].todayInteractions.filter(r=>r.type==='explore-end').length,1);
    assert.equal(w.row('a'),row);assert.equal(w.calls.length,requests);assert.equal(w.externalCalls,0);
}
// All canonical reasons share the same source/mechanism; already-paused legacy abandonment is history-only.
for(const reason of ['paused','abandoned','completed']) {
    const w=await world().ready();w.start();await flush();w.setTime('13:34');w.contact();w.end(reason);await flush();
    assert.equal(w.case().externalSegment.reason,reason);assert.equal(w.partialCalls().length,1);
    assert.equal(w.receipt('return').sourceId,'explore:'+w.case().externalSegment.id+':return');
}
{
    const w=await world().ready(),record=w.makeCase('legacy-paused');w.env.user.exploreCases=[record];w.env.exploreState.caseId=record.id;
    const row=w.row('a');w.ctx.explore.abandon();await flush();assert.equal(record.status,'abandoned');assert.equal(record.externalSegment,null);
    assert.equal(w.row('a'),row);assert.equal(w.partialCalls().length,0);
}
// A late partial payload never reacquires a newer owner's resident.
for(const owner of ['away','focus','external','hall','window']) {
    const w=await world().ready();w.start();await flush();w.setTime('13:34');w.contact();w.end();await flush();const late=w.partialCalls()[0];
    if(owner==='away')w.cats[0].isOut=true;else if(owner==='focus')w.cats[0].focus=true;else if(owner==='external')w.start();
    else if(owner==='hall')w.cats[0].hallId='gotham';else {w.setTime('13:42');await w.ensure();}
    const entries=[...w.plan().content.entries];w.settleContent(late);await flush();assert.equal(w.plan().content.entries.length,entries.length);entries.forEach((entry,index)=>assert.equal(w.plan().content.entries[index],entry));
}
{
    const w=await world().ready();w.start();await flush();const authority=w.ctx.explore.freeze(w.case());w.setTime('13:32');w.contact();w.end();await flush();
    w.ctx.explore.resume(w.case().id);await flush();const before=JSON.stringify(w.case().state);
    assert.equal(w.ctx.explore.narrate(w.case(),{content:'旧段迟到内容'},{authority}).applied,false);assert.equal(JSON.stringify(w.case().state),before);
}
{
    const w=await world({enabled:false}).ready();w.start();await flush();w.setTime('13:34');w.contact();w.end();await flush();
    assert.equal(w.case().externalSegment.state,'returned');assert.ok(w.row('a').continuation);assert.equal(w.partialCalls().length,0);
}
assert.doesNotMatch(section('// Normalize persisted optional Case state','const buildExploreNewsFollowupSource'),/recoverExploreExternalActivity\(/,'pre-render normalization must not enter uninitialized Hall/social runtime');
assert.match(section('onMounted(() => {','syncAppViewport();'),/recoverExploreExternalActivity\(/);
assert.match(html,/kind="coc-d100"/);assert.match(html,/const legacyStartExploration/);
assert.equal(html.match(/callAI\(/g).length,36);
console.log(JSON.stringify({fixture:'hall-external-activity-bridge-v1',status:'PASS',authority:'one Explore Case / one companion / segmented lifecycle',
    requests:{startFailure:0,startNoDependency:0,sharedDependency:1,return:1,missingRow:1,noContact:0,hiddenHall:0,duplicates:0,resultReward:0}}));
