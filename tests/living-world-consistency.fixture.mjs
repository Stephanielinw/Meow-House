import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const awaySource = readFileSync(new URL('../js/meeow-away.js', import.meta.url), 'utf8');

// The global allocator has one dispatch lane. Status packets deliberately emit
// HOME directives unless an externally frozen compatibility directive exists.
assert.match(source, /ORDINARY_AWAY_AI_MIN_INTERVAL_MS = 30 \* 60 \* 1000/);
assert.match(source, /lastAIDispatchAt/);
assert.match(source, /ordinaryAwayOperation/);
assert.match(source, /operation\.promptText = buildOrdinaryAwayPlanPrompt/);
assert.match(source, /ordinaryAwayOperationId/);
assert.match(source, /ordinary-away-global-allocator/);
assert.match(source, /directives: Object\.fromEntries\(requestedCats\.map\(cat => \[String\(cat\.id\), 'HOME'\]\)\)/);

// Delivery-day authority, deferred retry, and Thread-private quarantine are
// explicit at the physical mailbox boundary.
assert.match(source, /getDeliveredPhysicalAwayMailCountForOperationalDay/);
assert.match(source, /deliveryClaimedAt, mail\?\.sentAt/);
assert.match(source, /mail\.nextDeliveryAttemptAt = getNextOperationalDayStart/);
assert.match(source, /if \(isLifeThreadAwayEpisode\(episode\)\)/);
assert.match(source, /mailType: 'physical-away'/);
assert.doesNotMatch(source, /reservePlannedAwayMailTime\(episode, mail, nextStart, 'due-collision'\)/);

// Status text has both prompt-level and deterministic application guards.
assert.match(source, /isControlPlaneStatusText/);
assert.match(source, /Status is visible in-world activity only/);
assert.match(source, /STATUS META QUARANTINED/);
assert.doesNotMatch(source, /因外出计划未能确认，暂时留在馆舍/);

// Phone exit restores captured UI route rather than entering Curator Room.
assert.match(source, /const phoneReturnRoute = ref\(null\)/);
assert.match(source, /const capturePhoneReturnRoute/);
assert.match(source, /const leavePhone/);
assert.match(source, /currentTab === 'phone' \? leavePhone\(\) : openCuratorRoom\(\)/);
assert.doesNotMatch(source, /leavePhone[\s\S]{0,1200}enterHall\(/);

const context = vm.createContext({ window: {}, Date, Math, console });
vm.runInContext(awaySource, context);
context.window.Meeow.away.configure({
    cleanText: value => String(value ?? '').trim(),
    parseLogicalDate: value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    },
    getCatHallId: cat => cat.hallId,
    isPermanentOut: () => false,
    isResidentInHall: cat => !cat.isOut,
    addLog: () => {}
});
const away = context.window.Meeow.away;
const cat = { id: 'resident', hallId: 'hall', isOut: false };
const plan = {
    mode: 'departure', plannedDurationMinutes: 90, destination: 'place',
    plannedActivities: [{ afterMinutes: 20, plannedResidentActivity: 'act', publicTrace: 'trace' }],
    plannedArchiveNarrative: '这是一段足够长的中文外出记录，包含居民在外处理自己的事务、观察周围环境并在返回前整理想法。这里继续补足字数以符合存档叙事要求。',
    mailPlan: [{ sendAfterMinutes: 30, content: 'mail', attachment: null }]
};
const operationId = 'ordinary-away:resident:123';
const episode = away.createEpisode(cat, plan, new Date('2026-09-01T12:00:00Z'), { roll: 1, shouldWrite: true }, null, { ordinaryAwayOperationId: operationId });
assert.equal(episode.id, `away-episode-ordinary-${operationId}`);
assert.equal(episode.ordinaryAwayOperationId, operationId);

const privateEpisode = away.createEpisode(cat, plan, new Date('2026-09-01T12:00:00Z'), { roll: 1, shouldWrite: true }, {
    origin: 'life-thread', threadId: 't', threadExcursionId: 'e', actorId: 'resident', operationToken: 'o', continuationSourceEventId: 'c', outcomeSourceEventId: 'r', basisFactIds: ['f'], visibility: 'thread-private'
});
assert.deepEqual(Array.from(privateEpisode.mailPlan), []);

console.log(JSON.stringify({ fixture: 'living-world-consistency', status: 'PASS' }));
