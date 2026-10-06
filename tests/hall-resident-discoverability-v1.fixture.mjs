import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { DEFAULT_CONFIG, createCatRenderer, createStandingPose, loadCatAssets } from '../js/meeow-cat-renderer.mjs';
// Self-contained PNG I/O; no auxiliary Hall harness imports.
function png(bytes) {
    let offset = 8, width, height, channels;
    const chunks = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            assert.equal(data[8], 8); assert.equal(data[12], 0);
            channels = ({ 0: 1, 2: 3, 6: 4 })[data[9]];
            assert.ok(channels);
        }
        if (type === 'IDAT') chunks.push(data);
        offset += length + 12;
        if (type === 'IEND') break;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
    const pixels = new Uint8Array(stride * height), rgba = new Uint8ClampedArray(width * height * 4);
    let cursor = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = raw[cursor++];
        for (let x = 0; x < stride; x += 1) {
            const i = y * stride + x, left = x >= channels ? pixels[i - channels] : 0;
            const up = y ? pixels[i - stride] : 0, corner = y && x >= channels ? pixels[i - stride - channels] : 0;
            const p = left + up - corner, distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
            const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : corner;
            const prediction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
            assert.notEqual(prediction, undefined);
            pixels[i] = raw[cursor++] + prediction;
        }
    }
    for (let i = 0; i < width * height; i += 1) {
        rgba.set(channels === 1 ? [pixels[i], pixels[i], pixels[i], 255] :
            [pixels[i * channels], pixels[i * channels + 1], pixels[i * channels + 2], channels === 4 ? pixels[i * channels + 3] : 255], i * 4);
    }
    return { width, height, data: rgba };
}

const root = new URL('../', import.meta.url), read = path => readFileSync(new URL(path, root));
const html = read('index.html').toString();
const ctx = vm.createContext({ console, Uint8Array, WeakMap, Map, Math,
    fetch: async path => ({ ok: true, json: async () => JSON.parse(read(path)) }),
    Image: class { set src(path) { const image = png(read(path)); Object.assign(this,
        { data: image.data, naturalWidth: image.width, naturalHeight: image.height }); this.onload(); } },
    document: { createElement: () => { let image; return { getContext: () => ({
        drawImage: value => { image = value; }, getImageData: () => ({ data: image.data }) }) }; } }
});
ctx.window = ctx;
ctx.discoveryScans = 0;
for (const file of ['meeow-hall-navigation', 'meeow-hall-spatial', 'meeow-resident-visual', 'meeow-presence']) {
    const source = read('js/' + file + '.js').toString();
    vm.runInContext(source.replace('for (const [dx, dy] of pixels)', 'globalThis.discoveryScans++; for (const [dx, dy] of pixels)'), ctx);
}
const nav = ctx.Meeow.hallNavigation;
const load = async path => { const base = new URL(path, root); return loadCatAssets(
    JSON.parse(readFileSync(new URL('manifest.json', base))), base, async url => png(readFileSync(url)).data); };
const bank = await load('assets/meeow-cat/v1/'), template = await load('assets/meeow-cat/poses/standing-standard-v1/');
const renderer = createCatRenderer(bank, { poses: { standing: createStandingPose(bank, template) } });
const standing = renderer(DEFAULT_CONFIG, { pose: 'standing' }), sitting = renderer(DEFAULT_CONFIG, { pose: 'sitting' });
const dorm = await nav.loadRoomDomain('dorm');
const buried = { x: 378, y: 970 };
assert.equal(dorm.legalPoint(buried), true);
assert.equal(dorm.presentationFits(standing, buried, 80 / standing.width), true, 'original physical clearance accepts the reported defect');
const discoverable = (domain, frame, foot, facing = false, identity = 'fixture') => domain.groundPlacementDiscoverable
    ? domain.groundPlacementDiscoverable(frame, foot, 140 / frame.width, facing, identity)
    : domain.presentationFits(frame, foot, 80 / frame.width, null, facing);
assert.equal(discoverable(dorm, standing, buried), false, '95% flower-cushion burial must be rejected at placement acceptance');
assert.equal(discoverable(dorm, sitting, { x: 390, y: 970 }), false);
assert.equal(nav.GROUND_OCCLUSION_LIMIT, 0.90);
for (const [room, foot] of [['dining', { x: 110, y: 625 }], ['living', { x: 842, y: 638 }], ['dorm', { x: 500, y: 800 }]]) {
    const domain = await nav.loadRoomDomain(room);
    assert.equal(discoverable(domain, sitting, foot), true, room + ': existing partial occlusion remains valid');
    if(room!=='living') assert.equal(domain.presentationFits(sitting,foot,80/sitting.width,null,false,null,true),true,
        room+': semantic placement must preserve existing legal partial depth');
}
console.log('Real flower-cushion rejection and existing partial occlusion controls PASS');

// Ground-solid props cannot borrow the raised-furniture front-edge allowance.
// Keep using the existing 80-unit physical silhouette, independently of the
// 140-unit visual safety net. The opt-in applies only at placement acceptance.
const dining=await nav.loadRoomDomain('dining');
const living=await nav.loadRoomDomain('living');
// Test oracle from the audited prop classes. Enumerate canonical runtime layers,
// so a different room, suffix or color/style variant cannot evade coverage.
const groundPropClass=/(?:scratching-(?:board|post)|cat-climber|(?:water|food)-bowl|cushion|cat-(?:toys|house))/;
const closedBaseExtras={dining:['fridge.png'],living:['sofa.png','shelf.png'],dorm:[]};
for(const domain of [dining,living,dorm]) {
    const room=domain.source.roomId,classified=new Set(domain.source.presentationClearance.groundSolidLayers || []);
    const expected=domain.source.layerOrder.filter(layer=>groundPropClass.test(layer) || closedBaseExtras[room].includes(layer));
    assert.ok(expected.length,room+': audited production prop instances found');
    for(const layer of expected) {
        assert.equal(classified.has(layer),true,room+'/'+layer+': every audited ground-solid variant must be classified');
        assert.ok(domain.source.presentationClearance.solidMasks[layer],layer+': semantic owner resolves to loaded canonical clearance mask');
    }
    assert.equal(classified.has('table.png'),false,'raised table must not be classified by sprite overlap');
    assert.equal(classified.has('foodshelf.png'),false,'existing raised-cabinet contract stays intact');
    assert.equal(classified.has('carpet.png'),false,'authored floor covering remains floor');
}
const overlaps=(frame,foot,mask)=>{
    const scale=80/frame.width;
    for(let i=0;i<frame.width*frame.height;i++) if(frame.data[i*4+3]) {
        const x=foot.x+(i%frame.width-frame.groundAnchor[0])*scale;
        const y=foot.y+(Math.floor(i/frame.width)-frame.groundAnchor[1])*scale;
        for(let py=Math.floor(y);py<Math.ceil(y+scale);py++) for(let px=Math.floor(x);px<Math.ceil(x+scale);px++)
            if(px>=0&&py>=0&&px<1024&&py<1024&&mask[(py*1024+px)*4])return true;
    }
    return false;
};
for(const owner of ['scratching-board-a','scratching-board-b']) {
    const mask=png(read('assets/meeow-map/living/spatial/'+owner+'-solid.png')).data;
    const depth=living.source.layerDepth[owner+'.png'];
    let reproduction;
    for(const dy of [0,8,-8,16,-16,24,-24]) for(let x=2;x<1024&&!reproduction;x+=4) {
        const foot={x,y:depth+dy};
        if(living.legalPoint(foot) && overlaps(standing,foot,mask) &&
            living.presentationFits(standing,foot,80/standing.width))reproduction=foot;
    }
    assert.ok(reproduction,owner+': real authored floor/80-unit clearance reproduces base underlap');
    assert.equal(living.presentationFits(standing,reproduction,80/standing.width,null,false,null,true),false,
        owner+': generic floor underlap is rejected by semantic metadata');
}
for(const domain of [dining,living,dorm])for(const slot of domain.getInteractions()) {
    if(!domain.source.presentationClearance.groundSolidLayers.includes(slot.presentation.aboveLayer))continue;
    const context={slotId:slot.slotId,stage:'using',pose:'sitting'};
    assert.equal(domain.presentationFits(sitting,slot.slotPoint,80/sitting.width,context,false,null,true),
        domain.presentationFits(sitting,slot.slotPoint,80/sitting.width,context),
        slot.slotId+': ground-solid classification must not change explicit slot clearance');
}
assert.equal(living.getInteraction('living-scratching-board-a-surface-1-slot').presentation.traversalDisabled,true,
    'existing unsafe scratching traversal stays disabled');
assert.equal(living.getInteractions().some(slot=>slot.furnitureId==='scratching-board-b'),false,'no scratching slot invented');
assert.equal(living.presentationFits(sitting,{x:842,y:638},80/sitting.width,null,false,null,true),false,
    '81.73% visible-occlusion control is not a license to occupy the scratching base');
console.log('All 12 audited ground-solid instances/variants and both scratching-base reproductions PASS; explicit slots unchanged');
const bowlFeet=new Map();
for(const owner of ['water-bowl','food-bowl']) {
    const mask=png(read('assets/meeow-map/dining/spatial/'+owner+'-solid.png')).data;
    let left=1024,right=0,bottom=0;
    for(let i=0;i<1024*1024;i++) if(mask[i*4]) {
        left=Math.min(left,i%1024);right=Math.max(right,i%1024);bottom=Math.max(bottom,Math.floor(i/1024));
    }
    const foot={x:Math.round((left+right)/2),y:Math.max(bottom,dining.source.layerDepth[owner+'.png'])+8};
    bowlFeet.set(owner,foot);
    assert.equal(dining.legalPoint(foot),true,owner+': original floor mask permits overlap');
    assert.equal(dining.presentationFits(standing,foot,80/standing.width),true,owner+': old physical query grants front-edge allowance');
    assert.equal(discoverable(dining,standing,foot),true,owner+': visual burial alone does not reject');
    assert.equal(overlaps(standing,foot,mask),true,owner+': physical silhouette overlaps canonical solid footprint');
    assert.equal(dining.presentationFits(standing,foot,80/standing.width,null,false,null,true),false,
        owner+': generic placement must reject ground-solid overlap even below 90%');
}
const cushionUnderlap={x:357,y:964};
assert.equal(dorm.presentationFits(standing,cushionUnderlap,80/standing.width,null,true),true);
assert.equal(discoverable(dorm,standing,cushionUnderlap,true),true,'cushion can be visible enough but still physically occupied');
assert.equal(dorm.presentationFits(standing,cushionUnderlap,80/standing.width,null,true,null,true),false,
    'explicit rest slot does not authorize generic cushion underlap');
for(const owner of ['table','foodshelf']) {
    const mask=png(read('assets/meeow-map/dining/spatial/'+owner+'-solid.png')).data;
    let left=1024,right=0;
    for(let i=0;i<1024*1024;i++)if(mask[i*4]){left=Math.min(left,i%1024);right=Math.max(right,i%1024);}
    const x=Math.round((left+right)/2),depth=dining.source.layerDepth[owner+'.png'];
    let permitted;
    for(const dy of [8,16,24,32,40])for(const dx of [0,-24,24,-48,48]){
        const foot={x:x+dx,y:depth+dy};
        if(!permitted && dining.legalPoint(foot) && overlaps(standing,foot,mask) &&
            dining.presentationFits(standing,foot,80/standing.width,null,false,null,true) && discoverable(dining,standing,foot))permitted=foot;
    }
    assert.ok(permitted,owner+': existing legal floor beneath/behind raised furniture stays permitted');
}
assert.deepEqual(Array.from(dining.source.presentationClearance.groundSolidLayers),['water-bowl.png','food-bowl.png','fridge.png']);
assert.deepEqual(Array.from(dorm.source.presentationClearance.groundSolidLayers),['cushion-a.png','cushion-b.png','cat-climber.png','cat-house.png']);
console.log('Semantic 80-unit ground occupancy: bowls/cushions reject; table/raised shelf underpass and partial depth remain legal PASS');

// Exact threshold using the same production mask and validator.
const cushion = png(read('assets/meeow-map/dorm/spatial/cushion-a-solid.png')).data;
let edge;
for (let y = 850; y < 970 && !edge; y++) for (let x = 15; x < 650; x++)
    if (cushion[(y * 1024 + x) * 4] === 255 && cushion[(y * 1024 + x + 1) * 4] === 0 &&
        Array.from({length: 9}, (_, n) => cushion[(y * 1024 + x - n) * 4]).every(v => v === 255)) { edge = {x, y}; break; }
assert.ok(edge);
const ten = {width: 10, height: 1, groundAnchor: [0, 0], data: new Uint8Array(40).fill(255)};
assert.equal(dorm.groundPlacementDiscoverable(ten, {x: edge.x - 8, y: edge.y}, 1), false, 'exactly 90% is rejected');
assert.equal(dorm.groundPlacementDiscoverable(ten, {x: edge.x - 7, y: edge.y}, 1), true, '80% partial occlusion is allowed');
const cachedBefore = ctx.discoveryScans;
for (let n = 0; n < 10000; n++) assert.equal(discoverable(dorm, standing, buried), false);
assert.equal(ctx.discoveryScans, cachedBefore, 'stable acceptance result does not rescan pixels');
discoverable(dorm, standing, buried, false, 'new-placement-generation');
assert.equal(ctx.discoveryScans, cachedBefore + 1, 'new placement authority invalidates result');
discoverable(dorm, standing, buried, true, 'new-placement-generation');
assert.equal(ctx.discoveryScans, cachedBefore + 2, 'facing invalidates result');
const beforeGeometry=ctx.discoveryScans, originalGeometry=dorm.geometryVersion;
dorm.geometryVersion++;
discoverable(dorm,standing,buried);
assert.equal(ctx.discoveryScans,beforeGeometry+1,'geometry authority invalidates result');
dorm.geometryVersion=originalGeometry;
dorm.groundPlacementDiscoverable(standing,buried,139/standing.width);
assert.equal(ctx.discoveryScans,beforeGeometry+2,'actual display scale invalidates result');
discoverable(dorm,{...standing},buried);
assert.equal(ctx.discoveryScans,beforeGeometry+3,'replacement asset/frame invalidates result');

const section = (a, b) => { const start = html.indexOf(a), end = html.indexOf(b, start);
    assert.ok(start >= 0 && end > start, a); return html.slice(start, end); };
const domain = dorm, plain = value => JSON.parse(JSON.stringify(value));
const cats = Array.from({length: 6}, (_, n) => ({id: 'resident-' + n, hallId: 'hall', currentForm: 'CAT',
    mapRoom: 'dorm', mapPoint: 'floor', statusActivity: {posture: 'standing'}}));
cats.push({id:'away',hallId:'hall',isOut:true}, {id:'curator',hallId:'hall',curatorRoomPresence:{enteredAt:1}},
    {id:'other',hallId:'other',currentForm:'CAT'});
Object.assign(ctx, {cats:{value:cats}, activeHallId:{value:'hall'}, activeMapRoom:{value:'dorm'},
    spatialPrototypeEnabled:false, MAP_CAT_DISPLAY_WIDTH:140, MAP_CAT_INTERACTION_WIDTH:80,
    ref: value => ({value}), shallowRef: value => ({value}), computed: fn => ({get value(){return fn();}}),
    isResidentInCuratorRoom: cat => Boolean(cat.curatorRoomPresence),
    isResidentInHall: ctx.Meeow.presence.isResidentInHall,
    hasHigherHallPresentationOwner: id => {const cat=cats.find(cat=>cat.id===id);return cat.isOut || cat.curatorRoomPresence || cat.hallId!=='hall';},
    getCatHallId: cat => cat.hallId, getStructuredStatusPose: cat => cat.statusActivity?.posture || 'standing',
    getHallAmbientStandingKey: (cat, pose) => cat.id + ':' + pose,
    isHallEpisodeOwned: () => false, getHallEpisodeRow: () => null, recordHallEpisodeProgress: () => {throw Error('no episode to invalidate');},
    hallNavigation:nav, hallSpatial:ctx.Meeow.hallSpatial, residentVisual:ctx.Meeow.residentVisual,
    spatialAmbientSnapshot:{value:{residents:[]}}, hallAmbientStandingVisuals:new Map(),
    prepareHallAmbientStandingVisual: () => {throw Error('fixture visuals already prepared');}, syncSpatialAmbient:()=>{},
    mapCatVisualRevision:{value:0}, spatialStageBounds:{value:{width:1024,height:1024}},
    spatialAmbientController:{}, statusRefreshInFlight:new Map(), spatialContextVisible:()=>true,
    getStatusItemPropPresentation:()=>null, performance:{now:()=>0},
    hitchDiagnostics:{measure:(_name, fn)=>fn()}, hitchOrderScene:ctx.Meeow.hallSpatial.orderSceneEntities,
    normalRoomPresentationPending:{value:false}
});
vm.runInContext(section('const roomCats = computed(', 'const storedHallDisplayMode =') + '\nglobalThis.roster = roomCats;',ctx);
assert.equal(ctx.roster.value.length, 7, 'Curator and other Hall excluded by real roster projection; Away retained for absence reporting');
ctx.mapCatMarkers = {value:ctx.roster.value.filter(ctx.isResidentInHall).map(cat => ({cat,room:'dorm',spot:'floor',
    position:{left:(buried.x/1024*100)+'%',top:(buried.y/1024*100)+'%'}}))};
for(const cat of cats.filter(cat=>cat.currentForm==='CAT')) {
    const placement=ctx.Meeow.residentVisual.makeGroundAnchorPlacement(standing,140);
    ctx.hallAmbientStandingVisuals.set(cat.id+':standing',{key:cat.id+':standing',pose:'standing',nativeWidth:standing.width,
        clearanceFrame:standing,src:'mock:sprite',style:{'--meeow-map-cat-height':placement.height+'px',
            '--meeow-map-anchor-x':-placement.anchorXPercent+'%','--meeow-map-anchor-y':-placement.anchorYPercent+'%'}});
}
vm.runInContext(section('const roomSpatialDomain = shallowRef(null);', 'const normalRoomPoseReady =') +
    '\nroomSpatialDomain.value = globalThis.testDomain; roomSpatialContextKey = normalRoomContextKey(); globalThis.entries = normalRoomEntries; globalThis.owns = normalRoomCanOwn; globalThis.entryKey = normalRoomPlacementKey;',Object.assign(ctx,{testDomain:domain}));
const entries = ctx.entries();
assert.equal(entries.length,6,'all six eligible deterministic residents have legal discoverable entries');
for(const row of entries) {
    assert.equal(domain.legalPoint(row.foot),true);
    assert.equal(discoverable(domain,standing,row.foot,nav.hash(row.id)%2===1),true);
    assert.notDeepEqual(plain(row.foot),buried);
}
ctx.spatialAmbientSnapshot.value.residents = entries.map(row=>({...row,placementKey:row.key,localActivityPose:'standing',
    presentationFacing:nav.hash(row.id)%2?'right':'left', behaviorInstanceId:row.id+':instance', transitionGeneration:1,
    state:'activity',behaviorLifecycleState:'ACTIVE'}));
ctx.activeMapCatMarkers = {value:ctx.mapCatMarkers.value.map(marker=>({...marker,catVisual:ctx.hallAmbientStandingVisuals.get(marker.cat.id+':standing')}))};
vm.runInContext(section('const roomGroundFootMemo =', '// This is a read-only presentation readiness projection.') +
    '\nglobalThis.scene = roomSceneEntities;',ctx);
assert.equal(ctx.scene.value.filter(entity=>entity.kind==='resident').length,6,'real scene publisher reconciles deterministic Hall roster');
ctx.entries(); ctx.scene.value;
const settled = JSON.stringify(ctx.spatialAmbientSnapshot.value), scanCount=ctx.discoveryScans;
for(let n=0;n<10000;n++) {ctx.entries(); ctx.scene.value;}
assert.equal(ctx.discoveryScans,scanCount,'unchanged reconciliation and rendering add zero pixel scans');
assert.equal(JSON.stringify(ctx.spatialAmbientSnapshot.value),settled,'reads never reposition residents');
console.log('Fixture roster: 9 associated, 6 expected/rendered/discoverable, 3 legitimately absent PASS');

// The actual program entry boundary (not a render reader) must route bowl
// conflicts through the existing legal candidate/fallback path.
const savedMarkers=ctx.mapCatMarkers.value,savedRuntime=ctx.spatialAmbientSnapshot.value;
ctx.activeMapRoom.value='dining';
ctx.mapCatMarkers.value=savedMarkers.map(marker=>({...marker,room:'dining',position:{
    left:bowlFeet.get('water-bowl').x/1024*100+'%',top:bowlFeet.get('water-bowl').y/1024*100+'%'}}));
ctx.spatialAmbientSnapshot.value={residents:[]};
ctx.testDomain=dining;
vm.runInContext('roomSpatialDomain.value=testDomain;roomSpatialContextKey=normalRoomContextKey();',ctx);
const bowlRecovery=ctx.entries();
assert.equal(bowlRecovery.length,6);
for(const row of bowlRecovery)assert.equal(dining.presentationFits(standing,row.foot,80/standing.width,null,
    nav.hash(row.id)%2===1,null,true),true,'real generic entry accepted no ground-solid overlap');
ctx.activeMapRoom.value='dorm';ctx.mapCatMarkers.value=savedMarkers;ctx.spatialAmbientSnapshot.value=savedRuntime;
ctx.testDomain=dorm;
vm.runInContext('roomSpatialDomain.value=testDomain;roomSpatialContextKey=normalRoomContextKey();',ctx);

// Existing residents with old buried static contacts are replaced at program entry acceptance,
// not from the scene reader; currentness keys force the existing controller to release them.
const old=ctx.spatialAmbientSnapshot.value.residents[0];
old.foot={...buried}; old.presentationFacing='left';
const priorKey=old.placementKey;
const recovered=ctx.entries().find(row=>row.id===old.id);
assert.ok(recovered);
assert.notDeepEqual(plain(recovered.foot),buried);
assert.notEqual(recovered.key,priorKey);
assert.equal(ctx.owns(old.id,priorKey),false,'old runtime loses placement authority through the existing key contract');
old.placementKey=recovered.key;
const recoveredAgain=ctx.entries().find(row=>row.id===old.id);
assert.deepEqual(plain(recoveredAgain.foot),plain(recovered.foot),'same legal fallback may be selected again');
assert.notEqual(recoveredAgain.key,recovered.key,'a second recovery cannot retain the buried runtime through equal coordinates');
assert.equal(ctx.owns(old.id,recovered.key),false);

// The publisher carries facing across a placement-key change. Validate its actual
// left-facing silhouette even when the resident hash would choose right.
const asymmetric={x:357,y:964};
assert.equal(discoverable(domain,standing,asymmetric,false),false);
assert.equal(discoverable(domain,standing,asymmetric,true),true);
const hashRight=ctx.spatialAmbientSnapshot.value.residents.find(row=>nav.hash(row.id)%2===1);
hashRight.presentationFacing='left';
const changedMarker=ctx.mapCatMarkers.value.find(marker=>marker.cat.id===hashRight.id);
changedMarker.position={left:asymmetric.x/1024*100+'%',top:asymmetric.y/1024*100+'%'};
const facingRecovery=ctx.entries().find(row=>row.id===hashRight.id);
assert.ok(facingRecovery);
assert.equal(discoverable(domain,standing,facingRecovery.foot,false),true,'acceptance uses the facing that publication carries');

// Recover an inherited T6 contact through its existing durable local invalidation,
// without changing the window or another resident's completed progress.
const managed=old.id, now=Date.now();
let plan={windowKey:'unchanged-window',residents:[
    {residentId:managed,state:'active',roomId:'dorm',lastFoot:{...buried},beats:[
        {id:'static-beat',state:'active',posture:'standing',startAt:now-1000,endAt:now+60000}]},
    {residentId:'unaffected',state:'completed',beats:[{id:'done',state:'completed'}]}]};
const untouched=JSON.stringify(plan.residents[1]);
let saves=0;
ctx.isHallEpisodeOwned=cat=>cat.id===managed && plan.residents[0].state!=='invalidated';
ctx.getHallEpisodeRow=cat=>cat?.id===managed ? {hall:{},plan,row:plan.residents[0]} : null;
ctx.saveHallEpisodeWindow=(_hall,next)=>{saves++;plan=next;return true;};
vm.runInContext(section('const recordHallEpisodeProgress =','const hallEpisodeExecutionPolicy ='),ctx);
old.placementKey=recoveredAgain.key;
old.foot={...buried};
assert.ok(ctx.entries().find(row=>row.id===managed));
assert.equal(plan.residents[0].state,'invalidated');
assert.equal(plan.residents[0].reason,'ground-placement-occluded');
assert.equal(plan.windowKey,'unchanged-window');
assert.equal(JSON.stringify(plan.residents[1]),untouched);
assert.equal(saves,1,'only existing local progress persistence is invoked');

const slot=domain.getInteraction('dorm-cushion-a-surface-1-slot');
assert.ok(slot); assert.equal(domain.legalPoint(slot.slotPoint),false,'seat never becomes generic floor');
assert.equal(domain.presentationFits(sitting,slot.slotPoint,80/sitting.width,{slotId:slot.slotId,stage:'using',pose:'sitting'}),true,'explicit owner allowance remains valid');
assert.equal(domain.presentationFits(sitting,slot.slotPoint,80/sitting.width,
    {slotId:slot.slotId,stage:'using',pose:'sitting'},false,null,true),true,'slot authorization remains distinct from generic ground placement');
const depth=ctx.Meeow.hallSpatial.orderSceneEntities([
    {id:'rear',kind:'resident',depthY:slot.slotPoint.y},
    {id:'cushion',layer:'cushion-a.png',kind:'furniture',depthY:domain.source.layerDepth['cushion-a.png']},
    {id:'front',kind:'resident',depthY:1000}]);
assert.deepEqual(Array.from(depth,row=>row.id),['rear','cushion','front']);
const sceneSource=section('const roomGroundFootMemo =','const normalRoomPresentationState =');
assert.doesNotMatch(sceneSource,/groundPlacementDiscoverable/,'no discoverability calls from scene rendering');
const getterSource=html.slice(html.indexOf('const getResidentPresentationContent ='), html.indexOf('const getResidentPresentationContent =')+1100);
assert.doesNotMatch(getterSource,/groundPlacementDiscoverable/);
assert.match(html,/moment.kind === 'socialMoment' &&/);
assert.match(html,/getResidentPresentationContent\(mapPreviewCat\).status/);
assert.match(html,/getResidentPresentationContent\(selectedCat\).innerThought/);
assert.match(html,/class="cat-status-preview/);
const controllerSource=read('js/meeow-hall-spatial.js').toString();
assert.match(controllerSource,/const runEpisodeBeat = runtime =>/);
assert.match(controllerSource,/route = navigation.plan\(runtime.foot, beat.target\)/);
assert.doesNotMatch(controllerSource,/groundPlacementDiscoverable/,'movement executor unchanged');
console.log('Slots, depth, placement currentness, pure reads, map-only gate and movement boundary PASS');
