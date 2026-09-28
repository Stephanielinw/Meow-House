import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('js/meeow-hall-spatial.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const mapSource = fs.readFileSync(new URL('js/meeow-map.js', root), 'utf8');
const sandbox = vm.createContext({ window: {}, console, Math, Set });
vm.runInContext(source, sandbox, { filename: 'meeow-hall-spatial.js' });
vm.runInContext(mapSource, sandbox, { filename: 'meeow-map.js' });
const spatial = sandbox.window.Meeow.hallSpatial;
const room = spatial.getRoom('gotham', 'living');
let checks = 0;
const check = (name, run) => { run(); checks += 1; };

check('stable Gotham/living room authority and authored 1024 canvas', () => {
    assert.equal(room.version, 1);
    assert.equal(room.hallId, 'gotham');
    assert.equal(room.roomId, 'living');
    assert.equal(room.width, 1024);
    assert.equal(room.height, 1024);
    assert.equal(spatial.getRoom('marvel', 'living'), null);
    assert.equal(spatial.getRoom('gotham', 'dorm'), null);
    assert.match(mapSource, /id: 'living'/);
    assert.match(mapSource, /makeMapPoint\('living-rug'/);
});
check('floor and furniture foot obstacles are valid independent geometry', () => {
    assert.ok(room.walkableFloor.length > 0);
    assert.ok(room.obstacles.length > 0);
    for (const rect of [...room.walkableFloor, ...room.obstacles]) {
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0);
        assert.ok(rect.x + rect.width <= 1024 && rect.y + rect.height <= 1024);
    }
    assert.ok(room.obstacles.some(rect => spatial.pointInObstacle(room, { x: rect.x + 1, y: rect.y + 1 })));
    assert.equal(spatial.pointIsWalkable(room, { x: 0, y: 0 }), false);
    assert.doesNotMatch(source, /getImageData|alpha|sprite.width|sprite.height/);
});
check('exact A/B slots and entire direct foot route are legal', () => {
    assert.deepEqual({ ...room.destinations.a }, { id: 'rug-a', x: 443, y: 716 });
    assert.deepEqual({ ...room.destinations.b }, { id: 'rug-b', x: 560, y: 690 });
    for (const point of Object.values(room.destinations)) {
        assert.equal(spatial.pointIsWalkable(room, point), true);
        assert.equal(spatial.pointInObstacle(room, point), false);
    }
    assert.equal(spatial.segmentIsWalkable(room, room.destinations.a, room.destinations.b), true);
    assert.equal(spatial.segmentIsWalkable(room, room.destinations.a, { x: 900, y: 800 }), false);
    const blocked = { ...room, walkableFloor: [{ x: 0, y: 0, width: 1024, height: 1024 }],
        obstacles: [{ x: 490, y: 680, width: 20, height: 35 }] };
    assert.equal(spatial.segmentIsWalkable(blocked, room.destinations.a, room.destinations.b), false);
});
check('projection uses measured stage content, not viewport or world mutation', () => {
    const stage = { clientWidth: 600, clientHeight: 600, clientLeft: 1, clientTop: 1,
        getBoundingClientRect: () => ({ left: 55, top: 90, width: 602, height: 602 }) };
    const bounds = spatial.measureStageContent(stage);
    assert.deepEqual({ ...bounds }, { left: 56, top: 91, width: 600, height: 600 });
    const before = JSON.stringify(room.destinations.a);
    const desktop = spatial.projectFoot(room, room.destinations.a, bounds);
    const narrow = spatial.projectFoot(room, room.destinations.a, { left: 10, top: 30, width: 320, height: 320 });
    assert.equal(desktop.x, 443 * 600 / 1024);
    assert.equal(desktop.y, 716 * 600 / 1024);
    assert.equal(narrow.x, 443 * 320 / 1024);
    assert.equal(narrow.y, 716 * 320 / 1024);
    assert.equal(JSON.stringify(room.destinations.a), before);
    assert.equal(spatial.projectFoot(room, room.destinations.a, { width: 0, height: 0 }), null);
});
check('one-shot waits until both route endpoints enter the viewport', () => {
    const match = html.match(/const spatialRouteInView = \(\) => \{[\s\S]*?\n                \};/);
    assert.ok(match);
    const stage = { clientWidth: 758, clientHeight: 758, clientLeft: 1, clientTop: 1,
        top: 487, getBoundingClientRect() { return { left: 260, top: this.top, width: 760, height: 760 }; } };
    const context = vm.createContext({ hallSpatial: spatial, spatialStage: { value: stage },
        spatialRoom: room, window: { innerWidth: 1280, innerHeight: 720 }, Object, Math });
    vm.runInContext(`${match[0]}\nthis.routeInView = spatialRouteInView;`, context);
    assert.equal(context.routeInView(), false); // The rug is below the initial fold.
    stage.top = -153;
    assert.equal(context.routeInView(), true);
    stage.clientWidth = 390; stage.clientHeight = 390; stage.top = 300;
    stage.getBoundingClientRect = () => ({ left: 14, top: stage.top, width: 392, height: 392 });
    context.window.innerWidth = 420; context.window.innerHeight = 800;
    assert.equal(context.routeInView(), true);
});
check('one shared wrapper carries cat, badge and label at the measured projection', () => {
    assert.match(html, /<div v-if="spatialPrototypeMarker && spatialPrototypeStyle" class="meeow-map-spatial-resident" :data-spatial-id="spatialDebugEnabled \? spatialPrototypeMarker\.cat\.id : null" :style="spatialPrototypeStyle">/);
    const wrapper = html.slice(html.indexOf('class="meeow-map-spatial-resident"'), html.indexOf('</svg>', html.indexOf('class="meeow-map-spatial-resident"')));
    assert.match(wrapper, /class="meeow-map-cat-badge"/);
    assert.match(wrapper, /class="meeow-map-cat-label"/);
    assert.match(wrapper, /class="meeow-map-cat-sprite"/);
    assert.doesNotMatch(wrapper, /class="meeow-map-cat-badge" :style|class="meeow-map-cat-label" :style/);
    assert.match(html, /hallSpatial\.projectFoot\(spatialRoom, spatialFoot\.value, spatialStageBounds\.value\)/);
    assert.match(html, /makeGroundAnchorPlacement\(frame, 72\)/);
    assert.match(html, /\.meeow-map-spatial-resident \.meeow-map-cat-badge,/);
    assert.match(html, /\.meeow-map-spatial-resident \.meeow-map-cat-label/);
    assert.match(html, /@click\.stop="handleMapCatTap\(spatialPrototypeMarker\.cat\)"/);
    assert.match(html, /class="meeow-map-spatial-debug"[^>]*viewBox="0 0 1024 1024"/);
    assert.doesNotMatch(html, /:viewBox=/);
});
check('time-based travel reaches B exactly once without random selection', () => {
    let time = 0, nextId = 0, timerId = null, frameId = null;
    const timers = new Map(), frames = new Map(), positions = [], arrivals = [];
    const controller = spatial.createOneShotMovement({ from: room.destinations.a, to: room.destinations.b,
        idleMs: 900, speed: 80, now: () => time,
        setTimer: (callback, delay) => { assert.equal(delay, 900); timerId = ++nextId; timers.set(timerId, callback); return timerId; },
        clearTimer: id => timers.delete(id),
        requestFrame: callback => { frameId = ++nextId; frames.set(frameId, callback); return frameId; },
        cancelFrame: id => frames.delete(id),
        onPosition: point => positions.push({ ...point }), onArrival: point => arrivals.push({ ...point }) });
    assert.equal(controller.start(), true);
    assert.equal(controller.start(), false);
    assert.deepEqual(positions[0], { x: 443, y: 716 });
    timers.get(timerId)();
    time = 500;
    const firstFrame = frameId; frames.get(firstFrame)();
    assert.ok(positions.at(-1).x > 443 && positions.at(-1).x < 560);
    assert.equal(spatial.pointIsWalkable(room, positions.at(-1)), true);
    const desktopAtMidway = spatial.projectFoot(room, positions.at(-1), { width: 600, height: 600 });
    const narrowAtMidway = spatial.projectFoot(room, positions.at(-1), { width: 320, height: 320 });
    assert.ok(Math.abs(desktopAtMidway.x / narrowAtMidway.x - 600 / 320) < 1e-12);
    time = 5000;
    frames.get(frameId)();
    assert.deepEqual(positions.at(-1), { x: 560, y: 690 });
    assert.deepEqual(arrivals, [{ x: 560, y: 690 }]);
    assert.equal(controller.getState(), 'arrived');
    assert.equal(frames.has(frameId), true); // The just-invoked fake frame is inert; no new frame was requested.
});
check('cancellation prevents stale timer and frame completion', () => {
    let callback, timerCallback, arrived = 0, current = 0;
    const positions = [];
    const controller = spatial.createOneShotMovement({ from: room.destinations.a, to: room.destinations.b,
        now: () => current, setTimer: cb => { timerCallback = cb; return 1; }, clearTimer: () => {},
        requestFrame: cb => { callback = cb; return 2; }, cancelFrame: () => {},
        onPosition: point => positions.push({ ...point }), onArrival: () => { arrived += 1; } });
    controller.start();
    timerCallback();
    current = 100;
    callback();
    const priorCount = positions.length;
    controller.cancel();
    current = 9000;
    callback();
    assert.equal(positions.length, priorCount);
    assert.equal(arrived, 0);
    assert.equal(controller.getState(), 'cancelled');
    const waiting = spatial.createOneShotMovement({ from: room.destinations.a, to: room.destinations.b,
        setTimer: cb => { timerCallback = cb; return 3; }, clearTimer: () => {}, onPosition: () => { arrived += 10; } });
    waiting.start(); waiting.cancel(); timerCallback();
    assert.equal(arrived, 10);
});
check('only accepted resident status and accepted participant scenes preempt', () => {
    const resident = { id: 'resident:a', status: 'refreshed text', lastStatusUpdateTime: 100 };
    assert.equal(spatial.statusAcceptanceAdvanced(resident, 100), false);
    resident.lastStatusUpdateTime = 101;
    assert.equal(spatial.statusAcceptanceAdvanced(resident, 100), true);
    const seen = new Set(['scene:old']);
    const scenes = [{ id: 'scene:old', hallId: 'gotham', participantIds: ['resident:a'] },
        { id: 'scene:other', hallId: 'gotham', participantIds: ['resident:b'] },
        { id: 'scene:elsewhere', hallId: 'marvel', participantIds: ['resident:a'] }];
    assert.equal(spatial.newlyAcceptedResidentScene(scenes, seen, 'gotham', 'resident:a'), null);
    scenes.push({ id: 'scene:new', hallId: 'gotham', participantIds: ['resident:a'] });
    assert.equal(spatial.newlyAcceptedResidentScene(scenes, seen, 'gotham', 'resident:a').id, 'scene:new');
    assert.match(html, /watch\(\(\) => hallSceneRecords\.value\.map\(record => String\(record\.id\)\)/);
    assert.match(html, /lastStatusUpdateTime/);
    assert.match(html, /if \(!spatialContextVisible\(\)\) cancelSpatialPrototype\('hall-room-or-view-changed'\)/);
    assert.match(html, /if \(document\.visibilityState === 'hidden'\) cancelSpatialPrototype\('page-hidden'\)/);
    assert.match(html, /onUnmounted\(\(\) => \{\s*cancelSpatialPrototype\('unmounted'\)/);
});
check('resident selection is stable and incidental text/render updates do not preempt', () => {
    const start = html.indexOf('const candidates = activeMapCatMarkers.value.filter(marker =>');
    const end = html.indexOf('spatialStartedThisPage = true;', start);
    const selection = html.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(selection, /String\(left\.cat\.id\)\.localeCompare\(String\(right\.cat\.id\)\)/);
    assert.ok(selection.indexOf('const selected = candidates[0]') < selection.indexOf('if (!selected?.catVisual)'));
    assert.doesNotMatch(selection.slice(0, selection.indexOf('const selected = candidates[0]')), /marker\.catVisual/);
    const available = html.slice(html.indexOf('watch(() => {\n                    const cat = cats.value.find(entry => String(entry.id) === spatialSelectedResidentId.value);\n                    return cat && isResidentInHall'),
        html.indexOf('const onSpatialVisibilityChange'));
    assert.doesNotMatch(available, /getMapRoomForCat|getMapSpotForCat|getResidentLiveStatus/);
});
check('prototype is opt-in, session-only and cannot invoke AI or persistence', () => {
    const start = html.indexOf('const hallSpatial = window.Meeow.hallSpatial;');
    const end = html.indexOf('const isResidentHuman =', start);
    const block = html.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /get\('livingHallSpatial'\) === '1'/);
    assert.match(block, /get\('livingHallSpatialDebug'\) === '1'/);
    assert.match(block, /spatialStartedThisPage/);
    assert.doesNotMatch(block, /callAI\(|localStorage|persistNow|scheduleSave|Math\.random/);
    assert.doesNotMatch(source, /callAI\(|localStorage|Math\.random/);
    assert.match(html, /v-if="spatialDebugVisible && spatialStageBounds"/);
    assert.match(html, /\bspatialStageObserver\?\.disconnect\(\)/);
    assert.match(html, /const spatialPrototypeStyle = computed/);
    assert.match(html, /spatialRejectionReason\.value = 'route-offscreen'/);
    assert.match(html, /spatialEligibilityRows = computed/);
    assert.match(html, /spatialDebugEnabled \? marker\.cat\.id : null/);
    assert.equal((html.match(/\bcallAI\(/g) || []).length, 38);
});

console.log(`Living Hall Spatial Foundation V1: PASS (${checks} groups)`);
