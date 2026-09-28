import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const spatial = JSON.parse(readFileSync(new URL('assets/meeow-map/curator/spatial/curator-room-spatial-source.json', root)));
const configStart = html.indexOf('const CURATOR_ROOM_VISUAL_SOURCE =');
const configEnd = html.indexOf('const CURATOR_ROOM_ANCHORS =', configStart);
assert.ok(configStart >= 0 && configEnd > configStart);
const sandbox = vm.createContext({});
vm.runInContext(`${html.slice(configStart, configEnd)}\nglobalThis.visual = CURATOR_ROOM_VISUAL_SOURCE;`, sandbox);
const visual = sandbox.visual;

assert.equal(visual.roomId, 'curator-room');
assert.equal(visual.spatialSource, 'assets/meeow-map/curator/spatial/curator-room-spatial-source.json');
assert.equal(spatial.roomId, visual.roomId);
assert.equal(spatial.canonicalSize.width, 1024);
assert.equal(spatial.canonicalSize.height, 1024);
assert.deepEqual(Array.from(visual.layerOrder), spatial.layerOrder);
for (const filename of visual.layerOrder) {
    const file = new URL(visual.layerRoot + filename, root);
    assert.ok(existsSync(file), `missing Curator layer: ${filename}`);
    const png = readFileSync(file);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
}

const curatorStart = html.indexOf('<!-- CURATOR ROOM -->');
const curatorEnd = html.indexOf('<!-- MEEOW HOUSE DIRECTORY -->', curatorStart);
assert.ok(curatorStart >= 0 && curatorEnd > curatorStart);
const view = html.slice(curatorStart, curatorEnd);
assert.match(view, /currentTab === 'lounge' && loungeView === 'curator'/);
assert.match(view, /curatorRoomDisplayMode === 'text'/);
assert.match(view, /setCuratorRoomDisplayMode\('map'\)/);
assert.match(view, /class="curator-room-map-stage"/);
assert.equal((view.match(/class="curator-room-map-layer"/g) || []).length, 1);
assert.match(view, /v-for="layer in CURATOR_ROOM_VISUAL_SOURCE\.layerOrder"/);
assert.doesNotMatch(view, /class="curator-room-map-anchor"/);
assert.match(view, /:style="\[getCuratorRoomMarkerStyle\(curatorRoomResident\), curatorRoomCatVisual\?\.style \|\| \{\}\]"/);
assert.match(view, /@click\.stop="handleCuratorRoomResidentTap\(curatorRoomResident\)"/);
assert.match(view, /v-if="curatorRoomResident" class="sully-card/);

const toggleStart = html.indexOf('const setCuratorRoomDisplayMode =');
const toggleEnd = html.indexOf('const openFridgeNotes =', toggleStart);
assert.ok(toggleStart >= 0 && toggleEnd > toggleStart);
const toggleState = {
    curatorRoomDisplayMode: { value: 'text' },
    curatorRoomMapPreviewCat: { value: { id: 'resident' } },
    settings: { curatorRoomDisplayMode: 'text' }
};
vm.runInNewContext(`${html.slice(toggleStart, toggleEnd)}\nglobalThis.toggle = setCuratorRoomDisplayMode;`, toggleState);
toggleState.toggle('map');
assert.equal(toggleState.curatorRoomDisplayMode.value, 'map');
assert.equal(toggleState.settings.curatorRoomDisplayMode, 'map');
assert.equal(toggleState.curatorRoomMapPreviewCat.value, null);
toggleState.toggle('text');
assert.equal(toggleState.curatorRoomDisplayMode.value, 'text');
assert.equal(toggleState.settings.curatorRoomDisplayMode, 'text');

const cssStart = html.indexOf('#app .curator-room-map-stage {');
const cssEnd = html.indexOf('#app .curator-room-map-resident {', cssStart);
const css = html.slice(cssStart, cssEnd);
assert.match(css, /width: 100%;\s*aspect-ratio: 1;\s*min-height: 0;/);
assert.match(css, /\.curator-room-map-layer \{[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: contain;/);
assert.doesNotMatch(css, /linear-gradient|repeating-linear-gradient|curator-room-map-anchor/);

const anchorsStart = html.indexOf('const CURATOR_ROOM_ANCHORS =');
const anchorsEnd = html.indexOf('const getCuratorRoomPresence =', anchorsStart);
assert.ok(anchorsStart >= 0 && anchorsEnd > anchorsStart);
vm.runInContext(`${html.slice(anchorsStart, anchorsEnd)}\nglobalThis.anchors = CURATOR_ROOM_ANCHORS;`, sandbox);
assert.deepEqual(Object.keys(sandbox.anchors).sort(), ['bed', 'desk', 'floor', 'nightstand', 'wardrobe', 'window']);
const placement = html.slice(html.indexOf('const getCuratorRoomAnchor ='), html.indexOf('const showMapPointLabels ='));
assert.match(placement, /getCuratorRoomPresence\(cat\)\?\.anchor \|\| 'floor'/);
assert.match(placement, /window\.Meeow\.curatorPlacement\.getMarkerStyle\(getCuratorRoomAnchor\(cat\)\)/);
assert.doesNotMatch(placement, /spatialSource|floorWalkable|interactiveWalkableSurface/);

console.log('Curator Room runtime visual integration V1: PASS');
