import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dataSource = fs.readFileSync(new URL('../js/meeow-data.js', import.meta.url), 'utf8');

const dataSandbox = { window: {} };
vm.createContext(dataSandbox);
vm.runInContext(dataSource, dataSandbox);
const {
  normalizeResidentRelationships,
  normalizeResidentRelationshipPairMetadata
} = dataSandbox.window.Meeow.data;

const receiptStart = appSource.indexOf('const normalizeHallSceneConsequenceReceipt');
const receiptEnd = appSource.indexOf('const normalizeHallSceneRecords', receiptStart);
const metricStart = appSource.indexOf('const getRelationshipMetricRows');
const metricEnd = appSource.indexOf('const formatRelationshipArchiveDate', metricStart);
const relationshipStart = appSource.indexOf('const normalizeRelationshipDeltaTags');
const relationshipEnd = appSource.indexOf('const pruneHallSceneRecords', relationshipStart);
const pairRosterStart = appSource.indexOf('const normalizeResidentRelationshipPairMetadataRoster');
const pairRosterEnd = appSource.indexOf('\n\n                if (savedData)', pairRosterStart);
assert.ok(receiptStart >= 0 && receiptEnd > receiptStart, 'Hall consequence receipt normalizer must remain extractable');
assert.ok(metricStart >= 0 && metricEnd > metricStart, 'relationship metric helpers must remain extractable');
assert.ok(relationshipStart >= 0 && relationshipEnd > relationshipStart, 'relationship consequence envelope must remain extractable');
assert.ok(pairRosterStart >= 0 && pairRosterEnd > pairRosterStart, 'pair metadata roster canonicalizer must remain extractable');

const makeCat = (id, canonicalFamiliarity = 0) => ({
  id,
  canonicalFamiliarity,
  residentRelationships: {},
  residentRelationshipPairMetadata: {}
});
const state = {
  cats: { value: [] },
  hallSceneRecords: { value: [] },
  logs: []
};
const sandbox = {
  cats: state.cats,
  hallSceneRecords: state.hallSceneRecords,
  RESIDENT_RELATIONSHIP_TAGS: new Set(['protective', 'competitive', 'wary', 'affectionate', 'amused', 'resentful', 'fascinated', 'awkward', 'deferential']),
  AUTHORITATIVE_HALL_SCENE_TYPES: new Set(['ambient', 'user-directed']),
  isAuthoritativeHallSceneRecord: record => ['ambient', 'user-directed'].includes(String(record?.type || '')),
  RESIDENT_RELATIONSHIP_MAX_TAGS: 4,
  RESIDENT_RELATIONSHIP_MAX_SCENE_KEYS: 64,
  RESIDENT_RELATIONSHIP_MAX_EVENTS: 40,
  normalizeResidentRelationships,
  normalizeResidentRelationshipPairMetadata,
  getCanonicalResidentPairIds: (leftValue, rightValue) => {
    const left = String(leftValue || '').trim();
    const right = String(rightValue || '').trim();
    if (!left || !right || left === right) return [];
    return left < right ? [left, right] : [right, left];
  },
  getCanonicalResidentPairKey: (leftValue, rightValue) => [String(leftValue || '').trim(), String(rightValue || '').trim()].sort().join('::'),
  getRelationshipBaseline: (from, to) => ({ familiarity: Number(from?.canonicalFamiliarity?.[to?.id] ?? from?.canonicalFamiliarity ?? 0) }),
  getRelationshipNumber: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0)),
  cleanText: value => String(value || '').trim(),
  addLog: (message, type) => state.logs.push({ message, type }),
  console
};
vm.createContext(sandbox);
vm.runInContext(`
${appSource.slice(receiptStart, receiptEnd)}
const clampResidentRelationshipValue = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0));
${appSource.slice(metricStart, metricEnd)}
${appSource.slice(pairRosterStart, pairRosterEnd)}
${appSource.slice(relationshipStart, relationshipEnd)}
globalThis.applyConsequences = applyHallSceneRelationshipConsequences;
globalThis.normalizeReceipts = normalizeHallSceneRelationshipConsequenceReceipts;
globalThis.metricRows = getRelationshipMetricRows;
globalThis.metricPips = getRelationshipMetricPips;
globalThis.normalizePairRoster = normalizeResidentRelationshipPairMetadataRoster;
`, sandbox);

const emptyReceipts = () => sandbox.normalizeReceipts({});
const addScene = ({ id, day = '2026-09-22', participants = ['a', 'b'], deltas = [], type = 'ambient' }) => {
  const record = {
    id,
    hallId: 'hall',
    dateKey: day,
    at: `${day}T12:00:00.000Z`,
    type,
    participantIds: [...participants],
    content: '两只居民在窗边共同停留片刻。',
    relationshipConsequenceReceipts: emptyReceipts()
  };
  state.hallSceneRecords.value.push(record);
  return { record, applied: sandbox.applyConsequences(record, deltas) };
};
const runtimeFamiliarity = (fromId, toId) => Number(state.cats.value.find(cat => cat.id === fromId)?.residentRelationships?.[toId]?.familiarity || 0);
const runtimeValue = (fromId, toId, field) => Number(state.cats.value.find(cat => cat.id === fromId)?.residentRelationships?.[toId]?.[field] || 0);
const pairMetadata = (leftId = 'a', rightId = 'b') => {
  const [ownerId, targetId] = [leftId, rightId].sort();
  return state.cats.value.find(cat => cat.id === ownerId)?.residentRelationshipPairMetadata?.[targetId];
};
const reset = (cats = [makeCat('a'), makeCat('b')]) => {
  state.cats.value = cats;
  state.hallSceneRecords.value = [];
  state.logs.length = 0;
};

reset();
state.cats.value[1].residentRelationshipPairMetadata = { a: { exposureCount: 2, lastProgressionDay: '2026-09-21' } };
assert.equal(sandbox.normalizePairRoster(), true);
assert.deepEqual(JSON.parse(JSON.stringify(state.cats.value[0].residentRelationshipPairMetadata)), {
  b: { exposureCount: 2, lastProgressionDay: '2026-09-21' }
}, 'reversed pair metadata migrates to the canonical stable-ID owner');
assert.deepEqual(JSON.parse(JSON.stringify(state.cats.value[1].residentRelationshipPairMetadata)), {});

reset();
const first = addScene({ id: 'scene-1' });
assert.equal(first.applied, true);
assert.equal(pairMetadata().exposureCount, 1);
assert.equal(runtimeFamiliarity('a', 'b'), 0);
assert.equal(runtimeFamiliarity('b', 'a'), 0);
assert.deepEqual(JSON.parse(JSON.stringify(state.cats.value.map(cat => cat.residentRelationships))), [{}, {}], 'pair metadata alone creates no semantic directional relationship');
addScene({ id: 'scene-2', participants: ['b', 'a'] });
assert.equal(pairMetadata().exposureCount, 2, 'reversed participant order resolves the same canonical pair');
assert.equal(runtimeFamiliarity('a', 'b'), 0, 'two exposures do not progress familiarity');
const third = addScene({ id: 'scene-3' });
assert.equal(pairMetadata().exposureCount, 0);
assert.equal(runtimeFamiliarity('a', 'b'), 1);
assert.equal(runtimeFamiliarity('b', 'a'), 1);
assert.deepEqual(JSON.parse(JSON.stringify(third.record.relationshipConsequenceReceipts)), {
  aiRelationshipDeltas: { complete: true, directionKeys: [] },
  sharedSceneExposure: { complete: true, pairKeys: ['a::b'] },
  programFamiliarity: { complete: true, pairKeys: ['a::b'] }
});
assert.equal(sandbox.applyConsequences(third.record, []), false, 'same canonical scene cannot reapply consequences');
assert.equal(runtimeFamiliarity('a', 'b'), 1);
assert.equal(pairMetadata().exposureCount, 0);

const detached = { ...third.record, relationshipConsequenceReceipts: emptyReceipts() };
assert.equal(sandbox.applyConsequences(detached, []), false, 'detached scene copies have no consequence authority');
const rejected = { ...third.record, id: 'rejected', relationshipConsequenceReceipts: emptyReceipts() };
assert.equal(sandbox.applyConsequences(rejected, []), false, 'unaccepted scenes absent from the Hall store cannot apply');
state.hallSceneRecords.value = state.hallSceneRecords.value.filter(record => record.id !== 'scene-2');
assert.equal(sandbox.applyConsequences(first.record, []), false, 'completed accepted scenes remain receipt-idempotent');
const prunedCopy = { ...first.record, relationshipConsequenceReceipts: emptyReceipts() };
state.hallSceneRecords.value = state.hallSceneRecords.value.filter(record => record.id !== first.record.id);
assert.equal(sandbox.applyConsequences(prunedCopy, []), false, 'pruned scenes cannot be replayed');

reset([makeCat('a'), makeCat('b'), makeCat('c')]);
addScene({ id: 'multi-1', participants: ['c', 'a', 'b'] });
assert.equal(pairMetadata('a', 'b').exposureCount, 1);
assert.equal(pairMetadata('a', 'c').exposureCount, 1);
assert.equal(pairMetadata('b', 'c').exposureCount, 1);

reset();
for (let index = 1; index <= 6; index += 1) addScene({ id: `day-one-${index}` });
assert.equal(runtimeFamiliarity('a', 'b'), 1, 'daily cap permits only one progression');
assert.equal(runtimeFamiliarity('b', 'a'), 1);
assert.equal(pairMetadata().exposureCount, 3, 'post-cap exposure is retained');
addScene({ id: 'day-two-1', day: '2026-09-23' });
assert.equal(runtimeFamiliarity('a', 'b'), 2, 'next accepted scene on a later operational day consumes one retained milestone');
assert.equal(runtimeFamiliarity('b', 'a'), 2);
assert.equal(pairMetadata().exposureCount, 1);

reset([makeCat('a', { b: 5 }), makeCat('b', { a: 4 })]);
addScene({ id: 'sat-1' }); addScene({ id: 'sat-2' }); addScene({ id: 'sat-3' });
assert.equal(runtimeFamiliarity('a', 'b'), 0, 'canonically saturated direction receives no runtime overflow');
assert.equal(runtimeFamiliarity('b', 'a'), 1, 'unsaturated reverse direction may progress');
assert.equal(pairMetadata().exposureCount, 0);

reset([makeCat('a', { b: 5 }), makeCat('b', { a: 5 })]);
addScene({ id: 'full-1' }); addScene({ id: 'full-2' }); addScene({ id: 'full-3' });
assert.equal(pairMetadata().exposureCount, 0, 'fully saturated milestone is consumed instead of retried forever');
assert.deepEqual(JSON.parse(JSON.stringify(state.cats.value.map(cat => cat.residentRelationships))), [{}, {}]);

reset();
addScene({ id: 'coexist-1' }); addScene({ id: 'coexist-2' });
addScene({ id: 'coexist-3', deltas: [{ fromId: 'a', toId: 'b', familiarityDelta: 1, warmthDelta: 1, trustDelta: 1, tensionDelta: 0, addTags: [], removeTags: [] }] });
assert.equal(runtimeFamiliarity('a', 'b'), 2, 'AI and PROGRAM familiarity coexist within effective headroom');
assert.equal(runtimeFamiliarity('b', 'a'), 1);
assert.equal(runtimeValue('a', 'b', 'warmth'), 1);
assert.equal(runtimeValue('b', 'a', 'warmth'), 0, 'AI warmth remains directional');
assert.equal(runtimeValue('a', 'b', 'trust'), 1);
assert.equal(runtimeValue('b', 'a', 'trust'), 0, 'AI trust remains directional');
const normalizedCoexistingLink = normalizeResidentRelationships(state.cats.value[0].residentRelationships, 'a', new Set(['a', 'b'])).b;
assert.ok(normalizedCoexistingLink.events.some(event => event.sourceKey === 'shared-scene:coexist-3:program-familiarity' && event.evidenceExcerpt === ''), 'PROGRAM familiarity event survives normalization without inferred prose');

reset();
addScene({ id: 'persist-1' }); addScene({ id: 'persist-2' });
const persistedCats = JSON.parse(JSON.stringify(state.cats.value));
state.cats.value = persistedCats.map(cat => ({
  ...cat,
  residentRelationships: normalizeResidentRelationships(cat.residentRelationships, cat.id, new Set(['a', 'b'])),
  residentRelationshipPairMetadata: normalizeResidentRelationshipPairMetadata(cat.residentRelationshipPairMetadata, cat.id, new Set(['a', 'b']))
}));
addScene({ id: 'persist-3' });
assert.equal(runtimeFamiliarity('a', 'b'), 1, '2/3 exposure survives normalization and reload-shaped data');

reset();
const rollbackScene = {
  id: 'rollback-1', hallId: 'hall', dateKey: '2026-09-22', at: '2026-09-22T12:00:00.000Z', type: 'ambient',
  participantIds: ['a', 'b'], content: '共同片段', relationshipConsequenceReceipts: emptyReceipts()
};
state.hallSceneRecords.value.push(rollbackScene);
let storedRelationships = state.cats.value[1].residentRelationships;
let throwOnce = true;
Object.defineProperty(state.cats.value[1], 'residentRelationships', {
  configurable: true,
  get: () => storedRelationships,
  set: value => {
    if (throwOnce) { throwOnce = false; throw new Error('injected commit failure'); }
    storedRelationships = value;
  }
});
assert.equal(sandbox.applyConsequences(rollbackScene, []), false);
assert.deepEqual(JSON.parse(JSON.stringify(state.cats.value[0].residentRelationships)), {}, 'partial relationship commit rolls back');
assert.deepEqual(JSON.parse(JSON.stringify(state.cats.value[0].residentRelationshipPairMetadata)), {}, 'partial exposure commit rolls back');
assert.equal(rollbackScene.relationshipConsequenceReceipts.aiRelationshipDeltas.complete, false, 'rollback leaves receipt namespaces unapplied');

const envelopeSource = appSource.slice(appSource.indexOf('const applyHallSceneRelationshipConsequences'), appSource.indexOf('const pruneHallSceneRecords'));
assert.doesNotMatch(envelopeSource, /\bawait\b|scheduleSave\(|persistNow\(/, 'consequence envelope remains synchronous before save scheduling');
assert.match(appSource, /applyHallSceneRelationshipConsequences\(\s*record, sceneToApply\.scene\.relationshipDeltas, relationshipDiagnostic\)/);
assert.ok(appSource.indexOf('applyHallSceneRelationshipConsequences(') > appSource.indexOf('appendHallSceneRecord({'));
assert.equal((appSource.match(/callAI\(/g) || []).length, 40, 'relationship progression adds no AI call site');

const metricRows = sandbox.metricRows({ familiarity: 3, warmth: -2, trust: 4, tension: 1 });
assert.deepEqual([...sandbox.metricPips(metricRows[0])], [true, true, true, false, false]);
assert.equal(metricRows[1].tone, 'negative');
assert.match(appSource, /getCatArchiveRelationshipDirections[\s\S]*from: target, to: owner/);
assert.match(appSource, /meeow-relationship-metrics/);

console.log('resident relationship progression fixture passed');
