import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('index.html');
assert.match(html, /const stageFocusHallReceipt =/, 'Focus needs downstream Hall lifecycle receipts');
const plain = value => JSON.parse(JSON.stringify(value));
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
const timeAt = clock => new Date(`2026-10-06T${clock}:00-07:00`).getTime();
const packetRows = call => call.prompt.split('\n').filter(line=>line.startsWith('{"residentId":')).map(line=>JSON.parse(line));
const requestedBeat = (call, entry) => packetRows(call).some(row=>row.residentId===entry.residentId&&row.beats.some(beat=>beat.beatId===entry.beatId));
// Reuse the accepted C1 clock/contact/storage harness, not a second rejoin model.
const c1 = read('tests/hall-away-presence-rejoin-v1.fixture.mjs');
const factory = new Function('vm', 'read', 'html', 'assert', c1.slice(c1.indexOf('const plain ='), c1.indexOf('const untouched =')) + '\nreturn world;')(vm, read, html, assert);
function world(options = {}) {
    const w = factory(options), e = w.env, ref = value => ({ value }), reportCalls = [], timers = new Map();
    e.user = options.saved?.user || { nickname:'USER', coins:100, missionReports:[], focusSession:null };
    Object.assign(e, { isFocusing:ref(false), focusCats:ref([]), focusSessionForms:{}, focusSessionGeneration:ref(0),
        focusSetupData:{ action:'PRIVATE_FOCUS_TASK', minutes:25, selectedCatIds:['a'] }, canStartFocus:ref(true),
        roomCats:ref(w.cats), focusAction:ref(''), focusTime:ref(0), focusTotalTime:ref(0), focusTimer:ref(null),
        nextRandomEventTime:ref(0), currentFocusLog:ref([]), focusMomentSequence:ref(0),
        focusVisibleUserActionEvidence:ref([]), focusVoiceEntries:ref([]), focusVoiceIndex:ref(0),
        isProcessingFocusTick:ref(false), isFinishingFocus:ref(false), focusWakeLockMessage:ref(''),
        showFocusSetupModal:ref(true), focusSettlementLoading:{}, affinityChangeValue:ref(0), currentSettlement:{},
        tempUserStatus:ref(''), showMissionSettlementModal:ref(false), focusMusic:{}, audioPlayer:ref(null), currentNoise:ref('none'),
        exploreState:{ active:false }, appendInteractionEvent:(cat,type,content,extra) => {
            (cat.todayInteractions ||= []).push({ type, content, at:new e.Date().toISOString(), ...extra });
        }, sendFriendRequest:async () => {}, requestFocusWakeLock:async () => {}, releaseFocusWakeLock:async () => {},
        terminateActiveSocialPresenceForResident:() => {}, showToast:() => {}, getCurrentTimeStr:() => '13:27',
        nextTick:fn => Promise.resolve(fn?.()), playNoise:() => {},
        setInterval:fn => { const id=timers.size+1; timers.set(id,fn); return id; }, clearInterval:id => timers.delete(id),
        callAI:(prompt) => new Promise((resolve,reject) => reportCalls.push({prompt,resolve,reject})),
        ThinkingLevel:{LOW:0}, buildSharedFocusSessionEvidence:entries => entries.join('\n'),
        getInteractionHolidayContext:() => '', logPromptBudget:() => {},
        isResidentInCuratorRoom:cat => !!cat.curator, getActiveAwayEpisode:cat => cat.isOut ? {id:'away-owner'} : null,
        getResidentPublicName:cat => cat.name, reconcileResidentEpisodeCopy:() => {}, mapCatVisualRevision:ref(0)
    });
    w.cats.forEach(cat => { cat.affinity=10; });
    vm.runInContext(section('const setUserCurrentStatus =', 'const getSharedUserCurrentStatus =') + '\n' +
        section('// Canonical Focus session authority.', '// End canonical Focus session authority.') + '\n' +
        section('const focusTickBehavior = async', 'const confirmSettlement =') +
        section('const reconcileSharedSocialClaims =', '// Existing static presentation needs no new art.') +
        '\nglobalThis.focus = {start:startFocus, finish:finishFocus, recover:recoverFocusSession, resume:continueFocusReport, active:getActiveFocusSession, releaseClaims:reconcileSharedSocialClaims};', w.ctx);
    e.hasHigherHallPresentationOwner = id => {
        const cat=w.cats.find(cat=>cat.id===id);
        return !!cat && (cat.isOut || cat.blocked || cat.currentForm!=='CAT' || w.ctx.focus.active()?.participantIds.includes(id) ||
            [...e.socialOpportunityClaims.values()].some(claim => claim.participantIds.includes(id)));
    };
    e.normalRoomCanOwn = id => !e.hasHigherHallPresentationOwner(id);
    const sync=e.syncSpatialAmbient;
    e.syncSpatialAmbient = () => { w.ctx.focus.releaseClaims(); sync(); e.spatialAmbientSnapshot.value.residents=e.spatialAmbientSnapshot.value.residents.filter(row=>!e.hasHigherHallPresentationOwner(row.id)); };
    w.start = (ids=['a']) => { e.focusSetupData.selectedCatIds=ids; const key=e.settings.apiKey; e.settings.apiKey=''; const result=w.ctx.focus.start(); e.settings.apiKey=key; return result; };
    w.end = async () => { const key=e.settings.apiKey; e.settings.apiKey=''; const result=await w.ctx.focus.finish(25,false); e.settings.apiKey=key; await flush(); return result; };
    w.receipt = phase => w.plan()?.partialReconciliations?.find(row=>row.focusSource?.phase===phase);
    w.reportCalls=reportCalls;
    w.settle = call => {
        const packet=packetRows(call);
        call.resolve(JSON.stringify({entries:packet.flatMap(row=>row.beats.map(beat=>({residentId:row.residentId,
            beatId:beat.beatId,status:'已保存的活动 '+row.residentId,innerThought:'已保存的心声 '+row.residentId})))}));
    };
    w.reconcile = async () => { await w.ctx.api.reconcile(new e.Date()); await flush(); };
    w.ensure = async () => { await w.ctx.api.ensure(new e.Date()); await flush(); };
    w.contact = (id, x=w.cats.find(cat=>cat.id===id).x) => {
        e.spatialAmbientSnapshot.value.residents=e.spatialAmbientSnapshot.value.residents.filter(row=>row.id!==id);
        e.spatialAmbientSnapshot.value.residents.push({id,placementKey:'place:'+id,foot:{x,y:500},state:'paused',transitionGeneration:1});
    };
    return w;
}
const untouched = (w, ids=['a']) => w.plan().residents.filter(row=>!ids.includes(row.residentId)).map(row=>({row,beats:row.beats,entries:w.plan().content.entries.filter(e=>e.residentId===row.residentId)}));
const preserved = (w, before) => { for (const p of before) { assert.equal(w.row(p.row.residentId),p.row); assert.equal(w.row(p.row.residentId).beats,p.beats); for (const entry of p.entries) assert.ok(w.plan().content.entries.includes(entry)); } };
{
    const w=await world().ready(), before=w.plan(); w.failNext();
    assert.equal(w.start(),false); await flush();
    assert.equal(w.env.user.focusSession,null); assert.equal(w.plan(),before); assert.equal(w.cancels.length,0); assert.equal(w.partialCalls().length,0);
    assert.equal(w.start(),true); await flush();
    assert.equal(w.receipt('start').sourceId,'focus:'+w.env.user.focusSession.id+':start');
    assert.equal(w.row('a').state,'invalidated'); assert.equal(w.ctx.api.owned(w.cats[0]),false);
    assert.equal(w.partialCalls().length,0); assert.equal(w.cats[0].isOut,undefined);
}
// Current owned shared continuity, never history/proximity, can be interrupted.
for (const phase of ['shared-active','completed']) {
    const w=await world().ready(), before=untouched(w,['a','b']), b=w.row('b');
    const claim={hallId:'greek',participantIds:['a','b'],shared:{phase,settle:()=>{}},
        isCurrent:()=>!w.env.isFocusing.value,cancel:()=>{}};
    w.env.socialOpportunityClaims.set('greek',claim);
    assert.equal(w.start(),true); await flush();
    assert.deepEqual(plain(w.receipt('start').affectedIds),phase==='shared-active'?['a','b']:['a']);
    assert.equal(w.selections(),0); preserved(w,before);
    if (phase==='shared-active') {
        assert.notEqual(w.row('b'),b); assert.equal(w.partialCalls().length,1);
        assert.equal(w.env.socialOpportunityClaims.size,0);
        assert.equal(w.row('a').state,'invalidated');
        assert.doesNotMatch(w.partialCalls()[0].prompt,/PRIVATE_|focus-report|affinityDelta/);
    } else { assert.equal(w.row('b'),b); assert.equal(w.partialCalls().length,0); }
}
// Existing row: preserve completed history and unrelated identities, then rejoin NOW.
{
    const w=await world().ready(), before=untouched(w), key=w.plan().windowKey;
    const past=w.row('a').beats[0], end=past.endAt;
    past.state='completed';past.endAt=timeAt('13:28');
    w.row('a').beats.push({...past,id:past.id+':future',state:'pending',startAt:past.endAt,endAt:end});
    assert.equal(w.ctx.api.valid(w.plan()),true);w.setTime('13:29');
    w.start();await flush();w.setTime('13:34');assert.equal(await w.end(),true);
    assert.equal(w.env.user.focusSession.state,'ended');assert.equal(w.plan().windowKey,key);
    assert.equal(w.row('a').beats[0],past);assert.equal(w.row('a').continuation.startedAt,timeAt('13:34'));
    assert.equal(w.row('a').continuation.sourceId,'focus:'+w.env.user.focusSession.id+':end');
    assert.ok(w.row('a').beats.slice(1).every(beat=>beat.startAt>=timeAt('13:34')&&beat.endAt<=w.plan().windowEnd));
    preserved(w,before);assert.equal(w.partialCalls().length,1);assert.equal(w.ctx.api.valid(w.plan()),true);
    assert.doesNotMatch(w.partialCalls()[0].prompt,/PRIVATE_|missionName|affinityDelta/);
    const row=w.row('a'), count=w.calls.length, history=plain(w.cats[0].todayInteractions);
    w.settle(w.partialCalls()[0]);await flush();await w.ensure();await w.ctx.focus.recover();await flush();
    assert.equal(w.row('a'),row);assert.equal(w.calls.length,count);assert.deepEqual(plain(w.cats[0].todayInteractions),history);
    assert.equal(w.plan().partialReconciliations.filter(r=>r.focusSource).length,2);
    const reload=world({saved:plain(w.saved())});reload.setTime('13:34');await reload.ctx.focus.recover();await reload.ensure();
    assert.equal(reload.calls.length,0);assert.equal(reload.reportCalls.length,0);
    assert.equal(reload.plan().residents.filter(row=>row.residentId==='a').length,1);
    assert.deepEqual(plain(reload.cats[0].todayInteractions),history);
}
// Focus can own a resident before the whole-Hall window is constructed.
{
    const w=world();w.start();await w.ready();assert.equal(w.row('a'),undefined);
    const before=untouched(w), key=w.plan().windowKey;w.setTime('13:34');await w.end();
    assert.equal(w.plan().windowKey,key);assert.equal(w.row('a').continuation.pastCount,0);
    assert.equal(w.row('a').continuation.startedAt,timeAt('13:34'));
    assert.ok(w.row('a').beats.every(beat=>beat.startAt>=timeAt('13:34')));
    assert.ok(w.row('a').beats.length<=3);assert.equal(w.ctx.api.valid(w.plan()),true);
    preserved(w,before);assert.equal(w.partialCalls().length,1);
}
// Mixed participants: one missing contact never gates another valid continuation.
{
    const w=world();w.start(['a','b']);await w.ready();const before=untouched(w,['a','b']);
    w.contacts(false);w.setTime('13:34');await w.end();
    assert.equal(w.row('a'),undefined);assert.equal(w.row('b'),undefined);assert.equal(w.partialCalls().length,0);
    w.contact('a',220);await w.reconcile();
    assert.ok(w.row('a'));assert.equal(w.row('b'),undefined);
    assert.deepEqual(plain(w.receipt('end').waitingIds),['b']);
    assert.equal(w.row('a').beats[0].foot.x,220);assert.equal(w.partialCalls().length,1);preserved(w,before);
    const a=w.row('a');w.contact('b',320);await w.reconcile();
    assert.equal(w.row('a'),a);assert.ok(w.row('b'));assert.equal(w.partialCalls().length,1);
    assert.deepEqual(plain(w.receipt('end').waitingIds),[]);preserved(w,before);
}
// A fresh higher owner of B cannot gate A; B's old source cannot revive later.
for (const higher of ['focus','away']) {
    const w=world();w.start(['a','b']);await w.ready();w.contacts(false);w.setTime('13:34');await w.end();
    const endId=w.receipt('end').sourceId;w.contact('a',220);
    if(higher==='focus') {w.start(['b']);await flush();} else w.cats[1].isOut=true;
    await w.reconcile();assert.ok(w.row('a'));assert.equal(w.row('b'),undefined);assert.equal(w.partialCalls().length,1);
    assert.equal(w.row('a').continuation.sourceId,endId);
    if(higher==='focus') {w.contacts(true);w.setTime('13:35');await w.end();}
    else {w.cats[1].isOut=false;w.cats[1].lastStatusUpdateTime++;w.contacts(true);w.env.syncSpatialAmbient();await w.reconcile();}
    assert.notEqual(w.row('b')?.continuation?.sourceId,endId);
}
// Focus finish failure preserves upstream active authority; no downstream handoff.
{
    const w=await world().ready();w.start();await flush();w.setTime('13:34');const plan=w.plan(), session=w.env.user.focusSession;
    w.failNext();assert.equal(await w.end(),false);
    assert.equal(w.env.user.focusSession,session);assert.equal(session.state,'active');assert.equal(w.plan(),plan);
    assert.equal(w.receipt('end'),undefined);assert.equal(w.partialCalls().length,0);
    assert.equal(await w.end(),true);assert.equal(w.env.user.focusSession.id,session.id);
    assert.equal(w.partialCalls().length,1);assert.equal(w.cats[0].todayInteractions.filter(e=>e.type==='focus-end').length,1);
}
// An unsaved continuation is an attempt, not truth; retry freezes current time/contact.
for(const moved of [false,true]) {
    const w=world();w.start();await w.ready();w.contacts(false);w.setTime('13:34');await w.end();
    const source=w.receipt('end').sourceId, before=untouched(w), history=plain(w.cats[0].todayInteractions);
    w.contact('a',200);w.failNext();await w.reconcile();
    assert.equal(w.row('a'),undefined);assert.equal(w.partialCalls().length,0);
    w.setTime('13:35');w.contact('a',moved?220:200);await w.reconcile();
    assert.equal(w.row('a').continuation.startedAt,timeAt('13:35'));
    assert.equal(w.row('a').beats[0].foot.x,moved?220:200);
    assert.equal(w.row('a').continuation.sourceId,source);assert.equal(w.partialCalls().length,1);
    assert.deepEqual(plain(w.cats[0].todayInteractions),history);preserved(w,before);
    assert.equal(w.plan().partialReconciliations.filter(r=>r.sourceId===source).length,1);
}
{
    const w=world();w.start();await w.ready();w.contacts(false);w.setTime('13:34');await w.end();
    w.contact('a');w.failNext();await w.reconcile();w.env.spatialAmbientSnapshot.value.residents=[];
    w.setTime('13:35');await w.reconcile();assert.equal(w.row('a'),undefined);
    assert.deepEqual(plain(w.receipt('end').waitingIds),['a']);assert.equal(w.partialCalls().length,0);
    assert.equal(w.ctx.api.policy.get({id:'a'}).hold,true);assert.equal(w.env.user.focusSession.state,'ended');
}
// Saved row + failed narrative claim: retry exactly the saved row, without placement/build.
{
    const w=world();w.start();await w.ready();w.contacts(false);w.setTime('13:34');await w.end();w.contact('a');
    w.failNext(2);await w.reconcile();assert.ok(w.row('a'));assert.equal(w.partialCalls().length,0);
    const row=w.row('a'), beats=row.beats, ids=plain(beats.map(b=>b.id)), continuation=row.continuation;
    const builds=w.builds.length, reads=w.placementReads();w.setTime('13:35');w.contact('a',220);await w.reconcile();
    assert.equal(w.row('a'),row);assert.equal(w.row('a').beats,beats);assert.equal(w.row('a').continuation,continuation);
    assert.deepEqual(plain(w.row('a').beats.map(b=>b.id)),ids);
    assert.equal(w.builds.length,builds);assert.equal(w.placementReads(),reads);assert.equal(w.partialCalls().length,1);
}
// Publication guards run after persistence too, independently for each participant.
for(const higher of ['focus','away']) {
    const w=world();w.start(['a','b']);await w.ready();w.contacts(false);w.setTime('13:34');await w.end();
    w.contact('a');w.contact('b');
    w.hookSave(()=>{if(higher==='away')w.cats[0].isOut=true;else w.start(['a']);});
    await w.reconcile();assert.equal(w.row('a'),undefined);assert.ok(w.row('b'));assert.equal(w.partialCalls().length,1);
    assert.doesNotMatch(w.partialCalls()[0].prompt,/"residentId":"a"/);
}
// Whole-Hall and partial results cannot take over a canonical higher owner.
{
    const w=await world().ready({deferWhole:true}), whole=w.calls[0];w.start();await flush();
    w.settle(whole);await flush();assert.equal(w.row('a').state,'invalidated');
    assert.equal(w.plan().content.entries.some(e=>e.residentId==='a'&&e.status==='已保存的活动 a'),false);
    await w.ensure();assert.equal(w.ctx.api.owned(w.cats[0]),false);assert.equal(w.partialCalls().length,0);
}
for(const higher of ['focus','away','hall','window']) {
    const w=await world().ready();w.start();await flush();w.setTime('13:34');await w.end();const call=w.partialCalls()[0];
    if(higher==='focus')w.start();
    if(higher==='away')w.depart();
    if(higher==='hall')w.cats[0].hallId='gotham';
    if(higher==='window'){w.setTime('13:42');await w.ensure();}
    await flush();w.settle(call);await flush();
    assert.equal(w.plan().content.entries.some(e=>e.residentId==='a'&&e.status==='已保存的活动 a'&&requestedBeat(call,e)),false);
}
// A participant becoming unavailable during a content save does not block peers.
{
    const w=world();w.start(['a','b']);await w.ready();w.setTime('13:34');await w.end();
    const call=w.partialCalls()[0];assert.ok(call);
    w.hookSave(()=>{w.cats[0].isOut=true;});w.settle(call);await flush();
    assert.equal(w.plan().content.entries.some(e=>e.residentId==='a'&&e.status==='已保存的活动 a'),false);
    assert.equal(w.plan().content.entries.some(e=>e.residentId==='b'&&e.status==='已保存的活动 b'),true);
}
// New window and hidden Hall: Phase A owns activation; no historical resume.
{
    const w=await world().ready();const old=w.plan();w.start();await flush();w.setTime('13:42');await w.ensure();
    assert.equal(w.row('a'),undefined);assert.notEqual(w.plan().windowKey,old.windowKey);
    await w.end();assert.equal(w.plan().windowStart,timeAt('13:40'));
    assert.ok(w.row('a').beats.every(b=>b.startAt>=timeAt('13:42')));assert.equal(w.partialCalls().length,1);
}
{
    const w=await world().ready();w.start();await flush();const count=w.calls.length;
    w.env.activeHallId.value='gotham';w.env.spatialAmbientSnapshot.value.residents=[];w.contacts(false);
    w.setTime('13:34');await w.end();assert.equal(w.env.user.focusSession.state,'ended');
    assert.equal(w.calls.length,count);assert.equal(w.env.spatialAmbientSnapshot.value.residents.length,0);
    w.env.activeHallId.value='greek';w.contacts(true);await w.ensure();assert.ok(w.row('a').continuation);assert.equal(w.partialCalls().length,1);
}
// A compatible row created after canonical end is reused; no forced partial request.
{
    const w=world();w.start();w.env.activeHallId.value='gotham';w.setTime('13:34');await w.end();
    w.env.activeHallId.value='greek';await w.ready();const row=w.row('a');await w.ensure();
    assert.equal(w.row('a'),row);assert.equal(row.continuation,undefined);assert.equal(w.partialCalls().length,0);
}
// Report generation is independent: rejoin does not await it, and retry/read never bridge.
{
    const w=await world().ready();w.start();await flush();w.setTime('13:34');
    const finish=w.ctx.focus.finish(25,false);await flush();assert.equal(w.reportCalls.length,1);
    assert.equal(w.env.user.focusSession.state,'ended');assert.ok(w.row('a').continuation);assert.equal(w.partialCalls().length,1);
    const row=w.row('a'), receipt=w.receipt('end'), count=w.calls.length;
    w.failNext();w.reportCalls[0].resolve('PRIVATE_FOCUS_REPORT');assert.equal(await finish,true);await flush();
    assert.equal(w.row('a'),row);assert.equal(w.receipt('end'),receipt);assert.equal(w.calls.length,count);
    assert.equal(await w.ctx.focus.resume(w.env.user.focusSession.reportId),true);
    assert.equal(w.row('a'),row);assert.equal(w.receipt('end'),receipt);assert.equal(w.calls.length,count);
    assert.equal(await w.ctx.focus.resume(w.env.user.focusSession.reportId),false);
    plain(w.env.user.missionReports[0]);assert.equal(w.calls.length,count);assert.equal(w.reportCalls.length,1);
}
console.log('Hall Focus lifecycle bridge PASS: start/no-op=0; dependency=1; end/missing-row=1; pending/hidden=0; duplicate/report=0 additional');
