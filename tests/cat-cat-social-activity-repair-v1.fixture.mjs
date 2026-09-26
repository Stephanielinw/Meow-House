import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import social from '../js/meeow-social-activity.js';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const minute = 60_000;
const start = Date.parse('2026-09-26T00:00:00.000Z');
const rng = (seed) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const residents = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id }));
const hall = { id: 'hall-1', lastSuccessfulStatusSyncAt: new Date(start + 19 * minute).toISOString() };
const claims = new Map();
assert.equal(social.SOCIAL_OPPORTUNITY_CADENCE_MS, 20 * minute);
assert.equal(social.isDue(hall, start), true, 'status freshness cannot block a social opportunity');
const first = social.claimOpportunity({ hall, hallId: hall.id, token: 'request-1', claims, nowMs: start });
assert.ok(first);
assert.equal(social.claimOpportunity({ hall, hallId: hall.id, token: 'retry', claims, nowMs: start }), null);
assert.equal(social.commitOpportunity(first, claims, hall), true);
assert.equal(social.commitOpportunity(first, claims, hall), false, 'retry cannot advance twice');
assert.equal(hall.lastHallSocialOpportunityAt, new Date(start).toISOString());
assert.equal(social.isDue(hall, start + 19 * minute), false);
assert.equal(social.isDue(hall, start + 20 * minute), true, 'completion latency cannot shift the due time');
const stale = social.claimOpportunity({ hall, hallId: hall.id, token: 'stale', claims, nowMs: start + 20 * minute });
assert.ok(stale);
assert.equal(social.releaseOpportunity(stale, claims), true);
const current = social.claimOpportunity({ hall, hallId: hall.id, token: 'current', claims, nowMs: start + 20 * minute });
assert.ok(current);
assert.equal(social.commitOpportunity(stale, claims, hall), false, 'stale claim cannot commit');
assert.equal(social.commitOpportunity(current, claims, hall), true);
const otherHall = { id: 'hall-2' };
assert.equal(social.isDue(otherHall, start + 20 * minute), true);
assert.equal(social.pairKey('b', 'a'), 'a::b');

const exposure = [{ sceneId: 's1', residentIds: ['b', 'a'], at: new Date(start).toISOString() }];
assert.ok(social.pairWeight('a', 'b', exposure, start + minute) < social.pairWeight('a', 'c', exposure, start + minute));
assert.equal(social.pairWeight('a', 'b', Array.from({ length: 10 }, (_, i) => ({
    sceneId: `s${i}`, residentIds: ['a', 'b'], at: new Date(start + i * minute).toISOString()
})), start + 11 * minute), 1);
const lowDraw = social.selectPair({ residents: residents.slice(0, 3), exposure, nowMs: start + minute, random: () => 0 });
const highDraw = social.selectPair({ residents: residents.slice(0, 3), exposure, nowMs: start + minute, random: () => .99 });
assert.notEqual(lowDraw.pairKey, highDraw.pairKey, 'selection remains weighted random');
const filtered = social.selectPair({ residents: [residents[0], residents[2]], exposure, nowMs: start + minute, random: () => .5 });
assert.equal(filtered.pairKey, 'a::c', 'caller supplied eligible candidates only');
assert.equal(social.selectPair({ residents: [residents[0]], exposure, nowMs: start }), null);
const exposureHall = { recentSocialPairExposures: [] };
const scene = { id: 'scene-1', type: 'ambient', participantIds: ['b', 'a'], at: new Date(start).toISOString() };
assert.equal(social.appendSceneExposures(exposureHall, scene, start), 1);
assert.equal(social.appendSceneExposures(exposureHall, scene, start), 0);

const change = (warmth = 0, trust = 0, tension = 0, familiarity = 0) =>
    [{ fromId: 'a', toId: 'b', changes: { warmth, trust, tension, familiarity } }];
const classify = (proposedCount, validDeltas, appliedResults, committed = true) =>
    social.classifyOutcome({ proposedCount, validDeltas, appliedResults, committed });
assert.equal(classify(0, [], []), 'no-delta-proposed');
assert.equal(classify(1, [], []), 'delta-rejected');
assert.equal(classify(1, [{}], []), 'delta-neutral');
assert.equal(classify(1, [{ warmthDelta: 1 }], []), 'delta-saturated');
assert.equal(classify(1, [{}], change(1)), 'delta-applied-positive');
assert.equal(classify(1, [{}], change(-1)), 'delta-applied-negative');
assert.equal(classify(2, [{}, {}], [...change(1), ...change(-1)]), 'delta-applied-mixed');
assert.equal(classify(1, [{}], [], false), 'delta-rejected');
assert.equal(social.substantivePair(change(0, 0, 0, 1)), null);
assert.ok(social.substantivePair(change(0, 1)));
const diagnostics = [];
for (let i = 0; i < 105; i++) social.recordDiagnostic(diagnostics, { sceneId: `s${i}`, hallId: 'hall-1', category: 'delta-neutral', at: scene.at });
assert.equal(diagnostics.length, social.MAX_OUTCOME_DIAGNOSTICS);
assert.equal(diagnostics[0].sceneId, 's5');

const normalizeStart = source.indexOf('const normalizeHallSceneRecords');
const normalizeEnd = source.indexOf('const AUTHORITATIVE_HALL_SCENE_TYPES', normalizeStart);
assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart);
const sceneSandbox = {
    Date,
    cleanText: value => String(value || '').trim(),
    getOperationalDayKey: () => '2026-09-26',
    normalizeFormValue: value => value || 'CAT',
    normalizeHallSceneRelationshipConsequenceReceipts: () => ({})
};
vm.runInNewContext(`${source.slice(normalizeStart, normalizeEnd)}\nglobalThis.normalizeScenes = normalizeHallSceneRecords;`, sceneSandbox);
const savedScene = { id: 'accepted-cue', hallId: 'hall-1', dateKey: '2026-09-26',
    at: new Date(start).toISOString(), type: 'ambient', participantIds: ['a', 'b'],
    content: '两位居民在走廊里停下来认真交流。', reactions: [{ id: 'a', content: '点了点头' }, { id: 'b', content: '轻声回应' }],
    relationshipCue: { pairIds: ['b', 'a'] } };
const [reloaded] = sceneSandbox.normalizeScenes([savedScene]);
assert.equal(JSON.stringify(reloaded.relationshipCue), JSON.stringify({ pairIds: ['a', 'b'] }), 'cue survives scene reload');
assert.equal(sceneSandbox.normalizeScenes([{ ...savedScene, relationshipCue: { pairIds: ['a', 'other'] } }])[0].relationshipCue, undefined);
assert.equal(sceneSandbox.normalizeScenes([{ ...savedScene, type: 'attention-bid' }])[0].relationshipCue, undefined);

// A seed gives a reproducible scenario, not a measured AI acceptance rate.
// The model may validly return scene:null, so 35% is an explicit test assumption.
const random = rng(20260926);
const tickHall = { id: 'ticks' };
let tickOpportunities = 0;
for (let tick = 0; tick < 100; tick++) {
    const at = start + tick * 10 * minute;
    if (!social.isDue(tickHall, at)) continue;
    const claim = social.claimOpportunity({ hall: tickHall, hallId: tickHall.id, token: `tick-${tick}`, claims, nowMs: at });
    assert.ok(claim);
    assert.equal(social.commitOpportunity(claim, claims, tickHall), true);
    tickOpportunities++;
}
assert.equal(tickOpportunities, 50, '100 ten-minute timer ticks mean 50 eligible opportunities');

const simulationHall = { id: 'simulation', recentSocialPairExposures: [] };
const outcomes = Object.fromEntries(['no-delta-proposed', 'delta-rejected', 'delta-neutral', 'delta-saturated',
    'delta-applied-positive', 'delta-applied-negative', 'delta-applied-mixed'].map(key => [key, 0]));
const pairCounts = new Map();
const participantIds = new Set();
let accepted = 0;
for (let opportunity = 0; opportunity < 100; opportunity++) {
    const at = start + opportunity * 20 * minute;
    const candidate = social.selectPair({ residents, exposure: simulationHall.recentSocialPairExposures, nowMs: at, random });
    if (random() >= .35) continue;
    accepted++;
    candidate.residentIds.forEach(id => participantIds.add(id));
    pairCounts.set(candidate.pairKey, (pairCounts.get(candidate.pairKey) || 0) + 1);
    social.appendSceneExposures(simulationHall, { id: `accepted-${opportunity}`, type: 'ambient',
        participantIds: candidate.residentIds, at: new Date(at).toISOString() }, at);
    const draw = random();
    const category = draw < .5 ? 'no-delta-proposed' : draw < .7 ? 'delta-neutral' :
        draw < .84 ? 'delta-applied-positive' : draw < .95 ? 'delta-applied-negative' : 'delta-applied-mixed';
    outcomes[category]++;
}
const pairTotal = residents.length * (residents.length - 1) / 2;
const summary = {
    timerTicks: 100, timerTickMinutes: 10, eligibleOpportunitiesFromTicks: tickOpportunities,
    simulatedEligibleOpportunities: 100, assumedSceneAcceptance: .35,
    acceptedScenes: accepted, eligibleResidents: residents.length, activeResidents: participantIds.size,
    zeroParticipationResidents: residents.length - participantIds.size,
    eligiblePairs: pairTotal, activePairs: pairCounts.size, zeroParticipationPairs: pairTotal - pairCounts.size,
    topPairShare: Number((Math.max(...pairCounts.values()) / accepted).toFixed(3)), outcomes
};
assert.equal(Object.values(outcomes).reduce((sum, count) => sum + count, 0), accepted);
assert.match(source, /const socialDue = hall && getAutomaticHallSocialCandidates/);
assert.match(source, /sceneMode: socialDue \? 'ambient' : ''/);
assert.match(source, /socialActivity\.claimOpportunity/);
assert.match(source, /socialActivity\.commitOpportunity/);
assert.match(source, /socialActivity\.releaseOpportunity/);
assert.match(source, /sceneContext\.automaticPairIds/);
assert.match(source, /ambient scene omitted the frozen automatic resident pair/);
assert.match(source, /applyHallSceneRelationshipConsequences\(\s*record, sceneToApply\.scene\.relationshipDeltas, relationshipDiagnostic\)/);
assert.match(source, /record\.relationshipCue =/);
assert.match(source, /openHallSceneRelationship\(scene\)/);
assert.match(source, /getResidentPublicName\(entry\.target\) \}\} → \{\{ getResidentPublicName\(catArchiveCat\)/);
assert.doesNotMatch(source, /总好感度/);
console.log(JSON.stringify({ fixture: 'cat-cat-social-activity-repair-v1', status: 'PASS', summary }));
