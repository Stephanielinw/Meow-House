import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const context = vm.createContext({ window: {} });
for (const name of ['meeow-data', 'meeow-semantics', 'meeow-resident-semantics',
    'meeow-resident-object-preferences', 'meeow-resident-visual', 'meeow-cat-breeds',
    'meeow-resident-generation', 'meeow-adoption-drafts', 'meeow-fandom-resident-generator'])
    vm.runInContext(read(`js/${name}.js`), context, { filename: name });
const { residentGeneration: generation, adoptionDrafts: adoption, residentVisual: visual,
    semantics, data } = context.window.Meeow;
const plain = value => JSON.parse(JSON.stringify(value));
const uuidAt = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let serial = 0, failWrite = false, saved = '';
let state = { user: { adoptionDrafts: {}, residentSourceRelationships: {}, residentArrivalEvents: {} },
    cats: [plain(data.ALL_BUILTIN_CATS.find(cat => cat.id === 'greek-telemachus'))],
    halls: [{ id: 'greek', name: '伊萨卡馆' }] };
const service = adoption.createService({ getState: () => state,
    persistSnapshot: snapshot => { if (failWrite) return false; saved = JSON.stringify(snapshot); return true; },
    publish: change => { state.user.adoptionDrafts = change.drafts;
        if (change.sourceRelationships) state.user.residentSourceRelationships = change.sourceRelationships;
        if (change.arrivalEvents) state.user.residentArrivalEvents = change.arrivalEvents;
        if (change.resident) state.cats.push(change.resident); },
    uuid: () => uuidAt(++serial), now: () => '2026-09-27T12:00:00.000Z' });
const axes = Object.fromEntries(Object.keys(semantics.PERSONALITY_AXIS_REGISTRY).map(id => [id, 0]));
const complete = id => {
    assert.equal(service.update(id, { identity: { name: '原创猫', gender: 'Other', breedId: 'mixed' },
        personalityProfile: { semanticProfileVersion: 1, residentId: id, personalityAxes: axes,
            preferences: { food: {} } },
        foodPreferenceProfile: { semanticProfileVersion: 1, residentId: id, personalityAxes: {},
            preferences: { food: { 'taste:sweet': 1 } } },
        objectPreferenceProfile: { version: 1, residentId: id,
            preferences: { 'interaction:chase': 1 }, provenance: { authority: 'user-confirmed' } },
        worldContext: '海边小镇的日常生活。' }).ok, true);
    assert.equal(service.confirmAppearance(id, visual.DEFAULT_CONFIG).ok, true);
};
const draft = service.create({ mode: 'oc', hallId: 'greek' });
assert.equal(draft.ok, true);
assert.equal(state.cats.length, 1, 'draft must remain outside gameplay roster');
complete(draft.draft.draftId);
assert.equal(service.validate(draft.draft.draftId).draft.status, 'ready');
failWrite = true;
assert.equal(service.confirm(draft.draft.draftId).error, 'save-failed');
assert.equal(state.cats.length, 1);
assert.equal(Object.keys(state.user.residentArrivalEvents).length, 0);
failWrite = false;
const result = service.confirm(draft.draft.draftId);
assert.equal(result.ok, true);
assert.match(result.arrivalEventId, /^resident-arrival-event:/);
assert.equal(state.cats.length, 2);
assert.equal(state.cats[1].personalityProfile.residentId, result.residentId);
assert.equal(state.cats[1].foodPreferenceProfile.residentId, result.residentId);
assert.equal(state.cats[1].objectPreferenceProfile.residentId, result.residentId);
assert.equal(state.cats[1].creationProvenance.arrivalEventId, result.arrivalEventId);
const event = state.user.residentArrivalEvents[result.arrivalEventId];
assert.equal(event.state, 'pending');
assert.deepEqual(plain(event.audienceResidentIds), ['greek-telemachus', result.residentId]);
assert.match(event.context, /原创猫/);
const frozenContext = event.context;
state.cats[1].name = '后来改名';
assert.equal(generation.getResidentArrivalStatusContext({ event, cats: state.cats,
    hall: state.halls[0], user: state.user }), frozenContext);
state.cats[1].name = '原创猫';
assert.equal(event.newResidentIds.length, 1);
assert.equal(service.confirm(draft.draft.draftId).unchanged, true);
assert.equal(Object.keys(state.user.residentArrivalEvents).length, 1);
assert.equal(generation.normalizeArrivalEvents(JSON.parse(saved).user.residentArrivalEvents)[result.arrivalEventId].eventId,
    result.arrivalEventId);
const sixIds = Array.from({ length: 6 }, (_, index) => `resident:${uuidAt(index + 100)}`);
const batch = generation.createArrivalEvent({ eventId: `resident-arrival-event:${uuidAt(200)}`,
    hallId: 'new-hall', newResidentIds: sixIds, audienceResidentIds: sixIds,
    sourceCreationEventIds: [`resident-adoption-event:${uuidAt(201)}`],
    createdAt: '2026-09-27T12:00:00Z' });
assert.equal(batch.newResidentIds.length, 6);
assert.equal(Object.keys(generation.normalizeArrivalEvents({ [batch.eventId]: batch })).length, 1,
    'a six-resident founding batch creates one durable event');
assert.ok(generation.getResidentArrivalStatusContext({ event, cats: state.cats, hall: state.halls[0],
    user: state.user }).includes('原创猫'));
assert.equal(generation.validateArrivalPresentation({ event, cats: state.cats, updates: [
    { id: 'greek-telemachus', status: 'Telemachus 看着新来的原创猫走进门。', innerVoice: '她会住在这里。' },
    { id: result.residentId, status: '原创猫站在门边。', innerVoice: '先看看四周。' }
] }), true);
assert.equal(generation.validateArrivalPresentation({ event, cats: state.cats, updates: [
    { id: 'greek-telemachus', status: 'Telemachus 正在看窗外。', innerVoice: '海面很安静。' },
    { id: result.residentId, status: '原创猫站在门边。', innerVoice: '先看看四周。' }
] }), false, 'existing audience may not ignore the arrival');
state.cats.push({ id: 'away-cat', hallId: 'greek', name: '外出者', isOut: true },
    { id: 'other-hall-cat', hallId: 'troy', name: '别馆者', isOut: false });
const nextDraft = service.create({ mode: 'oc', hallId: 'greek' }).draft.draftId;
complete(nextDraft);
assert.equal(service.validate(nextDraft).draft.status, 'ready');
const nextResult = service.confirm(nextDraft);
assert.equal(nextResult.ok, true);
const nextAudience = state.user.residentArrivalEvents[nextResult.arrivalEventId].audienceResidentIds;
assert.ok(!nextAudience.includes('away-cat'));
assert.ok(!nextAudience.includes('other-hall-cat'));
assert.ok(nextAudience.includes(nextResult.residentId));
const incomplete = { ...service.read(draft.draft.draftId), status: 'editing', foodPreferenceProfile: null };
assert.equal(generation.validateResidentGenerationBundle(incomplete, { halls: state.halls }).valid, false);
const html = read('index.html');
assert.match(html, /arrivalContext: requestOptions\.arrivalEvent/);
assert.match(html, /validateArrivalPresentation/);
assert.match(html, /frozenCatsToUpdate: audience/);
assert.match(html, /isEligibleArrivalAudience: \(cat, hallId, at\)/);
assert.match(html, /!getActiveAwayEpisode\(cat, new Date\(at\)\)/);
assert.match(html, /persistSnapshot\(snapshot\) !== true/);
assert.match(html, /const pendingArrivalTasks = new Set\(\)/);
assert.match(html, /appliedArrivalEventIds/);
assert.doesNotMatch(html, /旧版许愿暂不可用|旧版抽卡暂不可用/);
assert.equal((html.match(/callAI\(/g) || []).length +
    [...html.matchAll(/<script src="\.\/js\/([^"]+)/g)].length * 0, 36);
console.log('PASS unified-resident-generation-arrival-v1: complete bundle, atomic adoption, durable arrival, retry gate, legacy fail-closed');
