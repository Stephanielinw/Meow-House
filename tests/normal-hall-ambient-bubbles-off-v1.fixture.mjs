import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('index.html');
const stage = html.slice(html.indexOf('<div ref="spatialStage"'), html.indexOf('<aside v-if="mapPreviewCat"'));
assert.match(stage, /class="meeow-moment-overlay"/);
assert.match(stage, /v-for="entry in characterMomentMapRows"/);
assert.match(stage, /:key="entry.moment.id \+ ':' \+ entry.residentId"/);
assert.match(stage, /@click.stop="openMapSocialMoment\(entry.moment\)"/);
assert.doesNotMatch(stage, /openCharacterMoment\(/, 'map must not use generative/consuming open');
assert.doesNotMatch(stage, /getResident(?:LiveStatus|LiveInnerVoice|PresentationContent|ObserverReaction)|attentionBid|inner-voice-bubble/, 'no independent routine/Attention/T7 content bubble');
assert.match(stage, /handleMapResidentPointer\(\$event, entity.marker.cat\)/);
assert.match(stage, /openFridgeNotes/, 'explicit map navigation retained');
assert.match(html, /getResidentPresentationContent\(selectedCat\).innerThought/);
assert.match(html, /getResidentPresentationContent\(selectedCat\).status/);
assert.match(html, /getResidentPresentationContent\(cat\).status/);
assert.match(html, /getResidentPresentationContent\(mapPreviewCat\).status/);
assert.match(html, /openCharacterMoment\(momentForResident\(mapPreviewCat\)\)/, 'non-floating click-card access retained');
assert.match(html, /@click.stop="openCharacterMoment\(momentForResident\(cat\)\)"/, 'text-card access retained');
assert.match(html, /id="moment-icon-userInteractionMoment"[\s\S]*?class="meeow-moment-motif"/);
assert.match(html, /const publishCharacterSocialMoment =/);
assert.match(html, /const reconcileCharacterMoments =/);

// Real Character Moment authority remains capable of publishing every kind.
const ctx = vm.createContext({ window: { setTimeout: () => 1, clearTimeout() {} }, console });
vm.runInContext(read('js/meeow-character-moments.js'), ctx);
const moments = ctx.window.Meeow.characterMoments;
let ai = 0;
const configure = () => moments.configure({ now: () => 1000, generate() { ai++; throw Error('No provider expected'); },
    hasHistoryRecord: () => false, isIndividualCurrent: () => true, isSocialCurrent: () => true });
for (const kind of ['thoughtMoment', 'userInteractionMoment']) {
    let found;
    for (let seed = 0; seed < 1000 && !found; seed++) {
        configure();
        moments.reconcile([{ residentId: 'a', episodeId: 'static:' + seed, family: 'observe', axes: {},
            hallId: 'hall', roomId: 'dining', eligible: true, userEligible: kind === 'userInteractionMoment',
            plannedDuration: 120000, facts: { world: { activity: 'observe' } },
            fallback: { innerThought: 'preserved thought', description: 'preserved status' } }]);
        found = moments.read().find(moment => moment.kind === kind);
    }
    assert.ok(found, kind + ' underlying authority retained');
    const before = JSON.stringify(moments.read());
    for (let i = 0; i < 10000; i++) moments.read();
    assert.equal(JSON.stringify(moments.read()), before);
    assert.equal(ai, 0);
}
configure();
assert.equal(moments.acceptSocial({ committed: true, sceneId: 'accepted-social', scene: { content: 'together' },
    residentIds: ['a', 'b'], hallId: 'hall', roomId: 'dining',
    facts: { world: { relationships: [{ warmth: 4 }], consequences: [{ changes: { familiarity: 1 } }] } },
    fallback: { summary: 'preserved social', residents: [{ residentId: 'a', innerThought: 'a' }, { residentId: 'b', innerThought: 'b' }] } }), true);
const social = JSON.stringify(moments.read());
const attention = { id: 'accepted-attention', status: 'delivered', observableEvent: { public: true } };
const state = JSON.stringify(attention);
for (let i = 0; i < 10000; i++) moments.read();
assert.equal(JSON.stringify(moments.read()), social);
assert.equal(JSON.stringify(attention), state);
assert.equal(ai, 0);

// Execute the production projection, canonical receipt transaction and normalizer.
const section = (start, end) => {
    const a = html.indexOf(start), b = html.indexOf(end, a);
    assert.ok(a >= 0 && b > a, start);
    return html.slice(a, b);
};
const plain = value => JSON.parse(JSON.stringify(value));
let clock = 1000, current = true, stored = null, failed = false, disk, holdPaint = false;
let cacheRows = false, cachedRows;
const paints = [], counters = { ai: 0, create: 0, save: 0, consume: 0, reroll: 0 };
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
const event = { committed: true, sceneId: 'map-social', scene: { content: '一起观察。' },
    residentIds: ['a', 'b'], hallId: 'hall', roomId: 'dining',
    facts: { world: { activity: 'social-observe', consequences: [] } },
    fallback: { summary: '一起观察。', residents: [
        { residentId: 'a', innerThought: '继续看看。' }, { residentId: 'b', innerThought: '这里不错。' } ], dialogue: [] } };
const entities = ['a', 'b'].map((id, i) => ({ kind: 'resident', id, x: 60 + i * 90, y: 120,
    width: 80, height: 80, footX: 100 + i * 90, footY: 200, facing: 'left', posture: 'sitting' }));
const cats = [{ id: 'a', todayInteractions: [] }, { id: 'b', todayInteractions: [] }];
const episode = { windowKey: 'unchanged', residents: [{ residentId: 'a', beat: 'unchanged' }] };
const forbidden = key => () => { counters[key]++; throw Error('Forbidden map operation: ' + key); };
Object.assign(ctx, {
    Date: Clock, cleanText: text => String(text || '').trim(), normalizeFormValue: value => value,
    getOperationalDayKey: () => '1970-01-01',
    computed: get => ({ get value() { return cacheRows ? cachedRows : get(); } }),
    characterMoments: { ...moments, open: forbidden('ai'), acceptSocial: forbidden('create'),
        consume: (id, record) => { counters.consume++; assert.ok(disk.hallSceneRecords.some(r => r.socialMomentRead?.momentId === id)); return moments.consume(id, record); } },
    characterMomentRows: { value: [] }, roomSpatialReady: { value: true },
    spatialStageBounds: { value: { width: 1024, height: 1024 } },
    roomSceneEntities: { value: entities }, activeHallId: { value: 'hall' }, activeMapRoom: { value: 'dining' },
    socialActivity: { staticObservePresentation: { spacingInCatWidths: 1.25 } },
    characterMomentPopup: { value: null }, characterMomentReturnFocus: null,
    hallSceneRecords: { value: [] },
    document: { activeElement: {}, querySelector: () => ({ focus() {} }) },
    nextTick: fn => holdPaint ? new Promise(resolve => paints.push(() => { fn?.(); resolve(); })) : Promise.resolve().then(() => fn?.()),
    findCharacterMomentRecord: () => stored, showToast() {},
    buildSaveData: () => ({ hallSceneRecords: ctx.hallSceneRecords.value, cats, episode }),
    saveOpenedCharacterMoment: forbidden('save'), saveData: forbidden('save'), callAI: forbidden('ai'),
    reconcileCharacterMoments: forbidden('reroll'), currentEpisodeWindow: episode
});
ctx.window.Meeow.storage = { persistSnapshot(snapshot) { counters.save++; if (failed) return false; disk = plain(snapshot); return true; } };
vm.runInContext(section('const normalizeHallSceneConsequenceReceipt =', 'const socialActivity =') +
    section('const hasReadSocialMoment =', 'const saveOpenedCharacterMoment =') +
    section('const socialMomentAnchors =', 'let characterMomentReturnFocus =') +
    section('const momentDisplayNarrative =', 'const momentDisplayConsequences =') +
    section('const findMapSocialMomentRecord =', 'const openCharacterMoment =') +
    '\nglobalThis.api={rows:characterMomentMapRows,open:openMapSocialMoment,mark:markMapSocialMomentRead,hasRead:hasReadSocialMoment,normalize:normalizeHallSceneRecords};', ctx);
const rows = () => ctx.api.rows.value;
const start = (sceneId = 'map-social', fallback = event.fallback) => {
    clock = 1000; current = true; failed = false; stored = null; cacheRows = false; holdPaint = false;
    ctx.characterMomentPopup.value = null;
    const record = { id: sceneId, hallId: 'hall', dateKey: '1970-01-01', at: new Clock(900).toISOString(),
        type: 'ambient', participantIds: ['a', 'b'], content: event.scene.content,
        reactions: event.fallback.residents.map(r => ({ id: r.residentId, content: r.innerThought })) };
    ctx.hallSceneRecords.value = ctx.api.normalize([record]);
    disk = plain(ctx.buildSaveData()); // The world event was committed BEFORE notice publication.
    moments.configure({ now: () => clock, isSocialCurrent: () => current, hasHistoryRecord: id => ctx.api.hasRead(id),
        onChange: value => { ctx.characterMomentRows.value = value; }, generate: forbidden('ai') });
    assert.equal(moments.acceptSocial({ ...event, sceneId, fallback }), true);
    return moments.read()[0];
};
let moment = start();
assert.deepEqual(plain(rows().map(row => row.residentId)), ['a', 'b']);
for (const kind of ['thoughtMoment', 'userInteractionMoment', 'futureMoment']) {
    ctx.characterMomentRows.value = [{ ...moment, kind }];
    assert.equal(rows().length, 0, kind + ' has no map permission');
    await ctx.api.open(ctx.characterMomentRows.value[0]);
    assert.equal(ctx.characterMomentPopup.value, null);
}
ctx.characterMomentRows.value = [moment];
current = false; assert.equal(rows().length, 0); current = true;
clock = moment.expiresAt; assert.equal(rows().length, 0); clock = 1000;
ctx.characterMomentRows.value = [{ ...moment }]; assert.equal(rows().length, 0, 'unaccepted lookalike');
ctx.characterMomentRows.value = [moment];
ctx.roomSceneEntities.value = [entities[0]]; assert.equal(rows().length, 0, 'both anchors required');
for (const broken of [{ ...entities[1], footX: NaN }, { ...entities[1], width: 0 },
    { ...entities[1], x: NaN }, { ...entities[1], height: 0 }]) {
    ctx.roomSceneEntities.value = [entities[0], broken];
    assert.equal(rows().length, 0);
    await ctx.api.open(moment); assert.equal(ctx.characterMomentPopup.value, null);
}
ctx.roomSceneEntities.value = entities;
ctx.activeMapRoom.value = 'living'; assert.equal(rows().length, 0); ctx.activeMapRoom.value = 'dining';
ctx.activeHallId.value = 'other'; assert.equal(rows().length, 0); ctx.activeHallId.value = 'hall';
ctx.roomSpatialReady.value = false; assert.equal(rows().length, 0); ctx.roomSpatialReady.value = true;
const world = JSON.stringify({ entities, episode, cats });
for (let i = 0; i < 10000; i++) assert.equal(rows().length, 2);
assert.equal(counters.save, 0); assert.equal(counters.consume, 0);
cachedRows = rows(); cacheRows = true; clock = moment.expiresAt;
await ctx.api.open(moment); assert.equal(ctx.characterMomentPopup.value, null, 'cached rows cannot authorize expired open');
cacheRows = false; clock = 1000;
for (const invalid of [[], [{ ...ctx.hallSceneRecords.value[0], hallId: 'other' }],
    [{ ...ctx.hallSceneRecords.value[0], participantIds: ['a', 'wrong'] }],
    [ctx.hallSceneRecords.value[0], ctx.hallSceneRecords.value[0]]]) {
    const original = ctx.hallSceneRecords.value; ctx.hallSceneRecords.value = invalid;
    await ctx.api.open(moment); assert.equal(ctx.characterMomentPopup.value, null, 'missing/ambiguous/mismatched canonical event');
    ctx.hallSceneRecords.value = original;
}
// Concurrent opens publish once, and never add a second event or per-cat history copy.
const original = plain(ctx.hallSceneRecords.value[0]);
await Promise.all([ctx.api.open(moment), ctx.api.open(moment)]);
assert.deepEqual(plain(ctx.characterMomentPopup.value.result), { ...event.fallback, source: 'local' });
assert.equal(counters.save, 1); assert.equal(counters.consume, 1);
assert.equal(ctx.hallSceneRecords.value.length, 1); assert.equal(rows().length, 0);
const saved = plain(ctx.hallSceneRecords.value[0]), receipt = saved.socialMomentRead;
delete saved.socialMomentRead; assert.deepEqual(saved, original, 'canonical event facts preserved exactly');
assert.equal(receipt.momentId, moment.id); assert.equal(receipt.readAt, new Clock().toISOString());
for (let i = 0; i < 10000; i++) await ctx.api.open(moment);
assert.equal(counters.save, 1); assert.equal(ctx.hallSceneRecords.value.length, 1);
assert.ok(ctx.api.mark(moment), 'confirmation reuses existing receipt'); assert.equal(counters.save, 1);
ctx.hallSceneRecords.value = ctx.api.normalize(disk.hallSceneRecords);
assert.deepEqual(plain(ctx.hallSceneRecords.value[0].socialMomentRead), receipt);
moments.configure({ now: () => clock, isSocialCurrent: () => true, hasHistoryRecord: id => ctx.api.hasRead(id),
    onChange: value => { ctx.characterMomentRows.value = value; }, generate: forbidden('ai') });
assert.equal(moments.acceptSocial(event), false, 'reload cannot recreate a read notice');
assert.equal(ctx.hallSceneRecords.value.length, 1);
// Forged or malformed receipts do not survive normalizing persisted records.
for (const bad of [{ ...receipt, momentId: 'wrong' }, { ...receipt, readAt: 'invalid' }])
    assert.equal(ctx.api.normalize([{ ...original, socialMomentRead: bad }])[0].socialMomentRead, undefined);
assert.equal(ctx.api.normalize([{ ...original, type: 'attention-bid', socialMomentRead: receipt }])[0].socialMomentRead, undefined);
// Failed persistence retains unread authority; retry creates only the receipt, not an event.
moment = start('save-failure'); failed = true;
let writes = counters.save, consumes = counters.consume;
await ctx.api.open(moment);
assert.equal(ctx.characterMomentPopup.value.loading, false); assert.equal(rows().length, 2);
assert.equal(ctx.hallSceneRecords.value[0].socialMomentRead, undefined); assert.equal(counters.consume, consumes);
failed = false; await ctx.api.open(moment);
assert.equal(counters.save, writes + 2); assert.equal(ctx.hallSceneRecords.value.length, 1); assert.equal(rows().length, 0);
// Closed/replaced/expired/invalidated-before-paint cards must not mark the event read.
for (const invalidate of [() => { ctx.characterMomentPopup.value = null; },
    () => { ctx.characterMomentPopup.value = { other: true }; }, () => { clock = moment.expiresAt; },
    () => { current = false; }, () => { ctx.hallSceneRecords.value = []; }]) {
    moment = start('before-paint'); holdPaint = true; writes = counters.save; consumes = counters.consume;
    const opened = ctx.api.open(moment); assert.equal(paints.length, 1); invalidate(); paints.shift()(); await opened;
    assert.equal(counters.save, writes); assert.equal(counters.consume, consumes);
}
// Existing accepted prose is preferred; incomplete prose falls back without generation.
for (const [body, expected] of [[{ ...event.fallback, summary: '已有正文。' }, '已有正文。'], [{}, event.fallback.summary]]) {
    moment = start('saved-prose'); stored = { narrative: body, source: 'narrative' };
    await ctx.api.open(moment); assert.equal(ctx.characterMomentPopup.value.result.summary, expected);
}
moment = start('no-usable-copy', {}); writes = counters.save;
await ctx.api.open(moment); assert.equal(ctx.characterMomentPopup.value, null); assert.equal(counters.save, writes);
assert.equal(JSON.stringify({ entities, episode, cats }), world);
assert.equal(counters.ai, 0); assert.equal(counters.create, 0); assert.equal(counters.reroll, 0);
assert.match(html, /hasHistoryRecord: id => Boolean\(findCharacterMomentRecord\(id\)\) \|\| hasReadSocialMoment\(id\)/);
console.log('PASS social-only current anchors; exactly one pre-existing Hall record; persist-before-consume, races/reload/save failure; zero AI/new-event/reroll/position/posture/T6 changes; other bubbles OFF.');
