import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import vm from 'node:vm';
import { png, clock } from './room-spatial-test-io.mjs';
import { DEFAULT_CONFIG, createCatRenderer, createStandingPose, createRestingPose, loadCatAssets } from '../js/meeow-cat-renderer.mjs';

const root = new URL('../', import.meta.url), read = path => readFileSync(new URL(path, root));
const html = read('index.html').toString(), plain = value => JSON.parse(JSON.stringify(value));
const section = (a, b) => { const start = html.indexOf(a), end = html.indexOf(b, start); assert.ok(start >= 0 && end > start); return html.slice(start, end); };
const timer = clock();
const ctx = vm.createContext({ console, URL, Uint8Array, Uint8ClampedArray, performance: { now: timer.now },
    fetch: async path => ({ ok: true, json: async () => JSON.parse(read(path)) }),
    Image: class { set src(path) { const image = png(read(path)); Object.assign(this, { data: image.data, naturalWidth: image.width, naturalHeight: image.height }); this.onload(); } },
    document: { visibilityState: 'visible', createElement: () => { let image; return { getContext: () => ({ drawImage: im => { image = im; }, getImageData: () => ({ data: image.data }) }) }; } },
    setTimeout: timer.set, clearTimeout: timer.clear,
    requestAnimationFrame: fn => timer.set(() => fn(timer.now()), 16), cancelAnimationFrame: timer.clear });
ctx.window = ctx;
for (const file of ['meeow-hall-navigation', 'meeow-hall-spatial', 'meeow-hall-activities', 'meeow-resident-visual']) vm.runInContext(read(`js/${file}.js`).toString(), ctx);
const { hallNavigation: nav, hallSpatial: spatial, hallActivities: activity, residentVisual } = ctx.Meeow;
const manifestURL = new URL('assets/meeow-cat/v1/manifest.json', root);
const decode = async url => png(readFileSync(url)).data;
const bank = await loadCatAssets(JSON.parse(readFileSync(manifestURL)), new URL('.', manifestURL), decode), poses = {};
for (const pose of ['standing', 'crouching', 'lying']) {
    const base = new URL(`assets/meeow-cat/poses/${pose}-standard-v1/`, root);
    const template = await loadCatAssets(JSON.parse(readFileSync(new URL('manifest.json', base))), base, decode);
    poses[pose] = pose === 'standing' ? createStandingPose(bank, template) : createRestingPose(bank, template, pose);
}
const renderer = createCatRenderer(bank, { poses });
const frameUrl = frame => {
    // Native PNG I/O only; business code is always executed from the page/modules.
    const crc = bytes => { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = c >>> 1 ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const t = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); t.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([t, data])), out.length - 4); return out; };
    const head = Buffer.alloc(13); head.writeUInt32BE(frame.width); head.writeUInt32BE(frame.height, 4); head[8] = 8; head[9] = 6;
    const rows = Buffer.alloc(frame.height * (frame.width * 4 + 1));
    for (let y = 0; y < frame.height; y++) Buffer.from(frame.data).copy(rows, y * (frame.width * 4 + 1) + 1, y * frame.width * 4, (y + 1) * frame.width * 4);
    return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
};
Object.assign(ctx, { hallNavigation: nav, hallSpatial: spatial, hallActivities: activity, residentVisual,
    ref: value => ({ value }), shallowRef: value => ({ value }), computed: fn => ({ get value() { return fn(); } }),
    activeHallId: { value: 'production-hall' }, activeMapRoom: { value: 'dining' }, activeMapCatMarkers: { value: [] }, cats: { value: [] },
    activeMapRoomDefinition: { value: { groundLayers: [] } }, currentTab: { value: 'lounge' }, loungeView: { value: 'room' }, hallDisplayMode: { value: 'map' },
    spatialStage: { value: {} }, spatialStageBounds: { value: { width: 1024, height: 1024 } }, spatialPrototypeEnabled: false, spatialAmbientEnabled: true, spatialDebugEnabled: true,
    spatialAmbientController: { stop() {} }, spatialAmbientSnapshot: { value: { residents: [] } },
    getResidentForm: cat => cat?.currentForm, isResidentInHall: cat => cat?.presence === 'hall', getResidentPhysicalHallId: cat => cat?.hallId,
    getCatHallId: cat => cat?.hallId, statusRefreshInFlight: new Map(), mapCatVisualRevision: { value: 0 },
    getActiveSocialPresenceParticipantIds: () => [], getClaimedSocialParticipantIds: () => [],
    getValidHallSceneFocusIds: () => [], user: {}, isInteracting: { value: false }, selectedCat: { value: null },
    isFocusing: { value: false }, focusCats: { value: [] }, exploreState: { active: false }, spatialRoom: { hallId: 'gotham' },
    getStructuredStatusPose: cat => cat?.statusActivity?.posture || '',
    ensureCatVisualRenderer: async () => renderer, catVisualFrameDataUrl: frameUrl,
    loadImageSource: async path => png(read(path)), testPresentationEnabled: false });
ctx.mapCatMarkers = ctx.activeMapCatMarkers; // The fixture's markers already contain production placement data.
// PNG metadata uses width/height, whereas the page checks natural dimensions.
ctx.loadImageSource = async path => { const image = png(read(path)); return { naturalWidth: image.width, naturalHeight: image.height }; };
vm.runInContext(section('const MAP_CAT_DISPLAY_WIDTH =', 'const hallAmbientStandingVisuals ='), ctx);
vm.runInContext(section('const hallAmbientStandingVisuals =', 'const isHallAmbientStandingVisualReady ='), ctx);
vm.runInContext(section('const hasHigherHallPresentationOwner =', 'let spatialAmbientController ='), ctx);
vm.runInContext(section('const roomSpatialDomain =', 'const spatialDebugVisible =')
    .replace('void syncNormalRoomFurniturePresentation(snapshot, spatialAmbientController, context);', 'if (testPresentationEnabled) void syncNormalRoomFurniturePresentation(snapshot, spatialAmbientController, context);') +
    '\nglobalThis.ensureWorld = ensureNormalRoomSpatial; globalThis.worldAdapter = syncNormalRoomFurniturePresentation; globalThis.entries = normalRoomEntries; globalThis.worldOwns = normalRoomCanOwn; globalThis.worldReady = roomSpatialReady; globalThis.worldDomain = roomSpatialDomain;', ctx);
vm.runInContext(section('const syncSpatialAmbient =', 'const spatialEligibilityRows ='), ctx);
vm.runInContext(section('const getStatusItemPropPresentation =', 'const spatialAmbientDiagnostics =') + '\nglobalThis.scene = roomSceneEntities;', ctx);
const row = id => ctx.spatialAmbientController.snapshot().residents.find(r => r.id === id);
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

if (!process.env.MEEOW_TRIAGE_IO_ONLY) for (const room of ['dining', 'living', 'dorm']) {
    const domain = await nav.loadRoomDomain(room), source = domain.source;
    assert.ok(source.furnitureInteractions.length && Object.isFrozen(domain.getInteractions()));
    const entry = domain.groundEntry(source.groundEntry);
    if (room === 'living') {
        assert.equal(source.foregroundRelations.length,3,'one explicitly scoped relation per annotated tree/toy surface');
        for (const relation of source.foregroundRelations) {
            assert.equal(relation.relatedSurfaceIds.length,1);
            const target=domain.getInteractions().find(r=>r.surfaceId===relation.activation.surfaceId);
            if (!target) {
                assert.equal(relation.runtimeClippingEnabled,false);
                assert.equal(relation.activation.reason,'presentation-incompatible');
                assert.ok(source.disabledInteractions.some(r=>r.surfaceId===relation.activation.surfaceId &&
                    r.reason==='presentation-solid-geometry-clearance-does-not-fit'));
                continue;
            }
            assert.deepEqual(plain(relation.activation.contact),plain(target.slotPoint));
            const full=png(read(`${source.assetBase}/${relation.sourceMask}`)).data;
            const subset=png(read(`${source.assetBase}/${relation.mask}`)).data;
            for(let i=0;i<subset.length;i+=4) if(subset[i]) assert.equal(full[i],255,'subset never invents foreground pixels');
            if(target.surfaceId==='living-scratching-board-a-surface-2') {
                assert.equal(relation.runtimeClippingEnabled,false,'front base contact is not behind the post');
                assert.equal(target.presentation.foregroundMask,undefined);
                assert.equal(full[(500*1024+900)*4],255,'approved post pixels remain preserved');
            }
            if(target.furnitureId==='cat-toys') {
                assert.equal(full[(780*1024+900)*4],255,'real cabinet is approved purple coverage');
                assert.equal(subset[(780*1024+900)*4],0,'front toy contact does not activate cabinet foreground');
                assert.ok(relation.activation.regions.some(r=>r.activeAtSlot),'lower approved foreground remains active');
            }
        }
        console.log('Living foreground relation audit: three surface links, preserved source pixels, front/rear subsets and no ground activation PASS');
    }
    if (source.furnitureSurface?.pixelCount) {
        assert.equal(source.darkGround, undefined);
        const seats = source.interactiveWalkableSurfaces.filter(s => ['chair-a.png', 'chair-b.png'].includes(s.ownerLayer));
        assert.equal(seats.length, 2);
        for (const seat of seats) {
            const mask = png(read(`${source.assetBase}/${seat.mask}`));
            for (let i = 0; i < 1024 * 1024; i++) if (mask.data[i * 4] === 255) {
                const point = { x: i % 1024, y: Math.floor(i / 1024) };
                assert.equal(domain.legalPoint(point), false, 'chair seat is never ordinary floor');
            }
            assert.ok(source.disabledInteractions.some(s => s.surfaceId === seat.surfaceId &&
                s.reason === 'canonical-support-contact-does-not-fit'));
            assert.ok(!domain.getInteractions().some(s => s.surfaceId === seat.surfaceId));
            const relation = source.foregroundRelations.find(r => r.relatedSurfaceIds.includes(seat.surfaceId));
            assert.equal(relation.ownerLayer, 'table.png');
            assert.equal(relation.runtimeClippingEnabled, false);
        }
    }
    for (const interaction of domain.getInteractions()) {
        const surface = source.interactiveWalkableSurfaces.find(s => s.surfaceId === interaction.surfaceId);
        const mask = png(read(`${source.assetBase}/${surface.mask}`));
        assert.equal(domain.legalPoint(interaction.slotPoint), false);
        assert.ok(domain.legalPoint(interaction.approachPoint) && domain.legalPoint(interaction.exitPoint));
        if (room !== 'living') for (const pose of ['standing', 'sitting']) {
            const frame = renderer(DEFAULT_CONFIG, { pose });
            assert.equal(domain.presentationFits(frame, interaction.approachPoint,
                80 * 1024 / (frame.width * 758)), true,
            `${interaction.slotId}: real ${pose} sprite clears the authored base approach`);
        }
        if (interaction.slotId === 'dorm-cat-climber-surface-2-slot') {
            assert.ok(interaction.approachPoint.y >= 720, 'P2 approaches the lower cat-climber base');
            assert.ok(Math.abs(interaction.approachPoint.x - interaction.slotPoint.x) <= 48,
                'P2 approaches below its platform, then explicitly enters');
            assert.deepEqual(interaction.exitPoint, interaction.approachPoint);
        }
        assert.ok(nav.planRoute(domain, entry, interaction.approachPoint).valid, interaction.slotId);
        if (room === 'living' && interaction.furnitureId === 'scratching-board-a') {
            const art = png(read(`${source.assetBase}/scratching-board-a.png`));
            let bottom = 0;
            for (let i=0;i<1024*1024;i++) if (art.data[i*4+3]) bottom = Math.max(bottom, Math.floor(i/1024)+1);
            assert.ok(interaction.approachPoint.y >= bottom+4, 'both tree platforms enter from below the real base');
            assert.deepEqual(interaction.exitPoint, interaction.approachPoint);
        }
        for (const pose of interaction.postures) for (const [dx, dy] of source.supportOffsets[pose]) {
            const { x, y } = interaction.slotPoint;
            assert.equal(mask.data[((y + dy) * 1024 + x + dx) * 4], 255, `${interaction.slotId}:${pose}`);
        }
        const candidates = activity.buildCandidates({ surfaceId: domain.surfaceAt(entry), capabilities: domain.capabilityFor(domain.surfaceAt(entry)), interactions: domain.getInteractions() });
        for (const behavior of interaction.behaviors) assert.ok(candidates.find(r => r.behaviorId === behavior).furnitureTargets.includes(interaction.slotId));
    }
    const cat = { id: 'a', hallId: 'production-hall', presence: 'hall', currentForm: 'CAT', statusActivity: { posture: 'sitting' }, visual: residentVisual.makeVisual(null, DEFAULT_CONFIG).visual };
    ctx.cats.value = [cat]; ctx.activeMapRoom.value = room;
    ctx.activeMapRoomDefinition.value = { groundLayers: room === 'living' ? ['carpet'] : room === 'dorm' ? ['carpet', 'cushion-a', 'cushion-b'] : [] };
    ctx.activeMapCatMarkers.value = [{ cat, room, spot: 'floor', position: { left: `${entry.x / 1024 * 100}%`, top: `${entry.y / 1024 * 100}%` } }];
    await vm.runInContext("Promise.all(['standing','sitting','lying'].map(pose => prepareHallAmbientStandingVisual('a', pose)))",ctx);
    await ctx.ensureWorld(); await flush();
    const placement = ctx.mapCatMarkers.value[0], placementKey = ctx.entries()[0].key;
    ctx.activeMapCatMarkers = { value: [{ ...placement, position: { left: '-50%', top: '-50%' } }] };
    assert.equal(ctx.worldOwns('a', placementKey), true, 'stale visual placement is not position authority');
    assert.ok(ctx.entries().every(e => domain.legalPoint(e.foot) && domain.surfaceAt(e.foot) === source.floorWalkable.surfaceId));
    const position = placement.position;
    placement.position = { ...position, left: `${Number.parseFloat(position.left) + 1}%` };
    assert.equal(ctx.worldOwns('a', placementKey), false, 'current position change invalidates the old placement key');
    placement.position = position; ctx.activeMapCatMarkers = ctx.mapCatMarkers;
    const sim = ctx.spatialAmbientController;
    assert.equal(row('a').behaviorId, 'sit-idle');
    if (!row('a').claim) {
        for(const interaction of domain.getInteractions()){
            const solution=domain.resolveFurniturePresentation({interaction,standing:renderer(DEFAULT_CONFIG,{pose:'standing'}),
                resting:renderer(DEFAULT_CONFIG,{pose:interaction.posture}),pose:interaction.posture,width:1024});
            if(!solution.available)assert.equal(sim.requestFurnitureInteraction('a',interaction.slotId),null,'unsafe manual entry cannot acquire claim');
        }
        assert.equal(row('a').claim,null);sim.stop('test-complete');
        console.log(room,'no supported sit-idle target; normal ground activity and explicit manual rejection PASS');continue;
    }
    assert.equal(row('a').claim.kind, 'furniture-slot');
    const instance = row('a').behaviorInstanceId;
    await timer.advance(60000);
    assert.equal(row('a').furniture.phase, 'awaiting-enter-confirmation');
    await timer.advance(10000);
    assert.equal(row('a').furniture.phase, 'awaiting-enter-confirmation');
    const selected = domain.getInteraction(row('a').furniture.slotId);
    // Add a genuine competing resident through the actual page entries path.
    const other = { ...cat, id: 'b' }; ctx.cats.value.push(other);
    const second = domain.groundEntry(entry, [entry]);
    ctx.activeMapCatMarkers.value.push({ cat: other, room, spot: 'floor', position: { left: `${second.x / 1024 * 100}%`, top: `${second.y / 1024 * 100}%` } });
    vm.runInContext('syncSpatialAmbient()', ctx); await flush();
    assert.equal(sim.requestFurnitureInteraction('b', selected.slotId, 'sit-idle'), null);
    assert.equal(row('a').behaviorInstanceId, instance);
    const token = plain(row('a').furniture.token);
    await ctx.worldAdapter({ residents: [row('a')] }, sim, `production-hall|${room}`); await timer.advance(16000); await flush();
    assert.equal(row('a').furniture.phase, 'using');
    const usedClaim = plain(row('a').claim);
    assert.ok(row('a').activityStartedAt != null);
    assert.ok(ctx.scene.value.find(e => e.id === 'a').marker.catVisual);
    await timer.advance(row('a').activityExpectedEndAt - timer.now() + 1);
    assert.equal(row('a').furniture.phase, 'awaiting-exit-confirmation');
    assert.deepEqual(plain(row('a').claim), usedClaim);
    await timer.advance(10000);
    assert.equal(row('a').furniture.phase, 'awaiting-exit-confirmation');
    await ctx.worldAdapter({ residents: [row('a')] }, sim, `production-hall|${room}`); await timer.advance(16000); await flush();
    assert.equal(row('a').furniture, null); assert.equal(row('a').claim, null);
    assert.equal(await sim.confirmFurnitureTransition('a', token, 'exit'), false);
    const cycle = row('a').behaviorInstanceId, foot = plain(row('a').foot);
    sim.pause(); sim.resume(); await flush();
    assert.equal(row('a').furniture, null); assert.equal(row('a').behaviorInstanceId, cycle); assert.deepEqual(plain(row('a').foot), foot);
    // The next normal cycle can make another furniture decision.
    await timer.advance(row('a').activityExpectedEndAt - timer.now() + 1);
    assert.notEqual(row('a').behaviorInstanceId, cycle);
    if (!row('a').furniture) sim.requestFurnitureInteraction('a', selected.slotId, 'sit-idle');
    const current = row('a').furniture;
    assert.ok(current);
    {
        const stale = plain(current.token), before = plain(cat);
        cat.presence = 'curator';
        assert.equal(await sim.confirmFurnitureTransition('a', stale, 'enter'), false);
        assert.equal(ctx.worldOwns('a', row('a')?.placementKey), false);
        assert.equal(cat.statusActivity.posture, before.statusActivity.posture);
        vm.runInContext('syncSpatialAmbient()', ctx); assert.equal(row('a'), undefined);
    }
    // A presentation failure is recoverable when the same owner can prepare
    // its existing ground pose. No copied fallback algorithm is involved.
    const fallbackCat = { ...cat, id: `fallback-${room}`, presence: 'hall' };
    ctx.cats.value = []; ctx.activeMapCatMarkers.value = [];
    vm.runInContext('syncSpatialAmbient()', ctx);
    ctx.cats.value = [fallbackCat];
    ctx.activeMapCatMarkers.value = [{ cat: fallbackCat, room, spot: 'floor', position: { left: `${entry.x / 1024 * 100}%`, top: `${entry.y / 1024 * 100}%` } }];
    vm.runInContext('syncSpatialAmbient()', ctx); await flush();
    await vm.runInContext(`Promise.all(['standing','sitting','lying'].map(pose => prepareHallAmbientStandingVisual('${fallbackCat.id}', pose)))`,ctx);
    const failedToken=sim.requestFurnitureInteraction(fallbackCat.id,selected.slotId,'sit-idle');
    assert.ok(failedToken,'prepared legal manual entry owns the existing claim');
    await timer.advance(60000);
    assert.equal(row(fallbackCat.id).furniture.phase,'awaiting-enter-confirmation');
    assert.equal(sim.rejectFurnitureTransition(fallbackCat.id,failedToken,'enter'),true);
    await flush();
    assert.equal(row(fallbackCat.id).furniture,null);assert.equal(row(fallbackCat.id).claim,null);
    assert.equal(row(fallbackCat.id).localActivityPose,'sitting');
    sim.pause();sim.resume();await flush();assert.equal(row(fallbackCat.id).furniture,null);
    sim.stop('test-complete');
    console.log(room, 'production loader/geometry, actual page target/adapter, exclusive claim, explicit confirmation, cycle resume PASS');
}
assert.deepEqual(Object.values(activity.definitions).map(r => r.weight), [2,3,3,3,2,4]);
console.log('Three-room source-driven world rollout contracts PASS');
export { ctx, nav, renderer, frameUrl, timer, flush, html, read };
