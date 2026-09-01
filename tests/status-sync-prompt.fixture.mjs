import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helperStart = appSource.indexOf('const STATUS_SYNC_RESIDENT_ROW_TARGET_CHARS');
const helperEnd = appSource.indexOf('const _refreshAllStatus = async', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Status packet helpers must be present before _refreshAllStatus.');

const cleanText = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const publicNames = new Map();
const sandbox = {
    cleanText,
    getResidentForm: cat => cat?.currentForm === 'HUMAN' ? 'HUMAN' : 'CAT',
    getResidentPublicName: cat => publicNames.get(String(cat?.id)) || cat?.name || '',
    getResidentLiveStatus: cat => cat?.status || '',
    getCuratorRoomAnchor: cat => String(cat?.curatorRoomPresence?.anchor || 'floor'),
    isResidentInCuratorRoom: cat => Boolean(cat?.inCuratorRoom),
    isResidentInHall: cat => !cat?.isOut && !cat?.inCuratorRoom && !cat?.isVisiting,
    getRelationshipBaseline: (left, right) => left?.publicPeerBaselines?.[String(right?.id)] || null,
    getRecentAwayReturn: cat => Boolean(cat?.recentPublicReturn),
    AWAY_PROMPT_MODES: { NO_AWAY_WORK: 'NO_AWAY_WORK' },
    Date
};
vm.runInNewContext(`${appSource.slice(helperStart, helperEnd)}
globalThis.statusPacket = {
  buildStatusSyncResidentRow,
  buildStatusSyncPresenceAuthority,
  buildStatusSyncFormAuthority,
  buildCuratorStatusSharedContext,
  buildStatusSyncSharedCanonicalRelationships,
  buildStatusSyncAwaySourceCapsule,
  buildStatusSyncCurrentEventAddenda,
  buildStatusSyncGlobalContract,
  buildStatusSyncOutputContract,
  buildStatusSyncPromptPacket,
  STATUS_SYNC_RESIDENT_ROW_TARGET_CHARS
};`, sandbox, { filename: 'index.html:status-packet' });
const packet = sandbox.statusPacket;

const now = new Date('2026-08-31T18:30:00.000Z');
const makeResident = (id, overrides = {}) => ({
    id,
    name: `Public ${id}`,
    humanName: `UNREVEALED HUMAN ${id}`,
    sourceWork: 'Mythic Harbor Chronicle',
    origin: 'Bronze-age island coast',
    sourceRole: 'public navigator',
    personality: 'deliberate, observant, and dryly patient',
    prompt: `FULL PRIVATE CANON ${id} `.repeat(120),
    currentForm: 'CAT',
    status: `visible current status ${id}`,
    innerVoice: `PRIVATE INNER VOICE ${id}`,
    affinity: 87,
    hallId: 'harbor',
    lastStatusUpdateTime: now.getTime() - 42 * 60 * 1000,
    lastInteractionTimestamp: now.getTime() - 2 * 60 * 60 * 1000,
    diary: `PRIVATE DIARY ${id}`,
    monitor: `PRIVATE MONITOR ${id}`,
    travelogues: [`HIDDEN AWAY PURPOSE ${id}`],
    episodicMemories: [{ summary: `PHONE DISCLOSURE ${id}` }],
    residentRelationships: { secret: `PRIVATE RELATIONSHIP ${id}` },
    knowledgeLedger: [`THREAD PRIVATE FACT ${id}`],
    publicPeerBaselines: {},
    ...overrides
});
const residents = Array.from({ length: 7 }, (_, index) => makeResident(`r${index + 1}`));
residents[0].publicPeerBaselines.r2 = { label: 'public canonical allies' };
publicNames.set('r1', 'Public R1');
publicNames.set('r2', 'Public R2');
const hall = { id: 'harbor', name: 'Harbor Hall' };

const normalRow = packet.buildStatusSyncResidentRow({ cat: residents[0], hall, directive: 'STAYING_HOME', now, crossedOperationalDay: false });
assert.ok(normalRow.length <= packet.STATUS_SYNC_RESIDENT_ROW_TARGET_CHARS);
assert.match(normalRow, /Machine ID: r1/);
assert.match(normalRow, /Authoritative form: CAT/);
assert.match(normalRow, /Physical presence: HOME_HALL/);
assert.match(normalRow, /Hall: Harbor Hall/);
assert.match(normalRow, /Local directive: STAYING_HOME/);
assert.match(normalRow, /Time state: Δt=42m; dayBoundary=same-day/);
assert.match(normalRow, /Public resident name: Public R1/);
assert.doesNotMatch(normalRow, /UNREVEALED HUMAN|PRIVATE INNER VOICE|87|PRIVATE DIARY|PRIVATE MONITOR|HIDDEN AWAY PURPOSE|PHONE DISCLOSURE|THREAD PRIVATE FACT|FULL PRIVATE CANON/);

// Required authority is never trimmed merely to meet the nominal row cap.
const oversizedHall = { id: 'huge', name: `HALL-${'x'.repeat(900)}` };
const pressureRow = packet.buildStatusSyncResidentRow({ cat: residents[0], hall: oversizedHall, directive: 'DEPARTING_NOW', now, crossedOperationalDay: true });
assert.match(pressureRow, /Machine ID: r1/);
assert.match(pressureRow, /Authoritative form: CAT/);
assert.match(pressureRow, /Local directive: DEPARTING_NOW/);
assert.match(pressureRow, /dayBoundary=crossed/);
assert.doesNotMatch(pressureRow, /Observable current status|Structured personality|Shared-safe source anchor/);

const curator = makeResident('curator', {
    inCuratorRoom: true,
    curatorRoomPresence: { anchor: 'desk', enteredAt: '2026-08-31T17:00:00.000Z' }
});
const curatorRow = packet.buildStatusSyncResidentRow({ cat: curator, hall, directive: 'CURATOR_ROOM', now });
assert.match(curatorRow, /Physical presence: CURATOR_ROOM/);
assert.match(curatorRow, /Authoritative Curator anchor: desk/);
const curatorShared = packet.buildCuratorStatusSharedContext({
    resident: curator, now, isNight: false,
    formDirectives: { curator: { targetForm: 'CAT', transitioned: false } },
    curatorAnchors: { curator: 'desk' }
});
assert.match(curatorShared, /curatorRoomAnchor=desk \(echo exactly\)/);
assert.doesNotMatch(curatorShared, /HALL SOCIAL|SCHEDULED AWAY|FRIDGE|LIFE THREAD|SCENE|PRIVATE INNER VOICE|FULL PRIVATE CANON|UNREVEALED HUMAN/);

const sharedRelationships = packet.buildStatusSyncSharedCanonicalRelationships(residents);
assert.match(sharedRelationships, /Public R1 ↔ Public R2: public canonical allies/);
assert.doesNotMatch(sharedRelationships, /PRIVATE RELATIONSHIP/);

const capsule = packet.buildStatusSyncAwaySourceCapsule(residents, { r1: 'DEPARTING_NOW' });
assert.match(capsule, /AWAY SOURCE-WORLD CAPSULE · r1/);
assert.match(capsule, /Mythic Harbor Chronicle/);
assert.doesNotMatch(capsule, /FULL PRIVATE CANON|UNREVEALED HUMAN|PRIVATE RELATIONSHIP|THREAD PRIVATE FACT|HIDDEN AWAY PURPOSE/);
const insufficientCapsule = packet.buildStatusSyncAwaySourceCapsule([
    makeResident('sparse', { sourceWork: '', origin: '', sourceRole: '', personality: '' })
], { sparse: 'DEPARTING_NOW' });
assert.match(insufficientCapsule, /Return no departure plan/);

const addenda = packet.buildStatusSyncCurrentEventAddenda({
    requestedCats: [makeResident('returning', { recentPublicReturn: true })],
    activeCatIds: ['returning'], isFocusEnd: true, isExploreEnd: true, now
});
assert.match(addenda, /generic settling-in|generic completion transition|generic return transition/);
assert.doesNotMatch(addenda, /PRIVATE INNER VOICE|THREAD PRIVATE FACT|HIDDEN AWAY PURPOSE/);

const assembled = packet.buildStatusSyncPromptPacket({
    globalContract: packet.buildStatusSyncGlobalContract(),
    hallShared: '[SHARED HALL / SCENE CONTEXT]\nHarbor Hall',
    residentRows: `[COMPACT RESIDENT ROWS]\n${residents.map(cat => packet.buildStatusSyncResidentRow({ cat, hall, directive: 'STAYING_HOME', now })).join('\n---\n')}`,
    residentAddenda: addenda,
    awayContract: '[AWAY / MAIL CONTRACT]\nFrozen mail decision is program-owned.',
    awayAddenda: capsule,
    fridgeContext: '[FRIDGE NOTE]\nshared bounded candidate text',
    sceneContext: '[SCENE]\nshared only',
    lifeThreadContext: '[LIFE THREAD]\noptional sidecar',
    outputContract: '[OUTPUT CONTRACT]\nupdates only'
});
assert.match(assembled.prompt, /\[GLOBAL STATUS CONTRACT\][\s\S]*\[COMPACT RESIDENT ROWS\]/);
assert.doesNotMatch(assembled.prompt, /GNN:|PRIVATE INNER VOICE|UNREVEALED HUMAN|FULL PRIVATE CANON|THREAD PRIVATE FACT|HIDDEN AWAY PURPOSE/);

const noAwayOutput = packet.buildStatusSyncOutputContract({
    curatorRoomStatusSync: false, requestedIds: ['r1'],
    awayPromptContract: { mode: 'NO_AWAY_WORK' }, sceneMode: '',
    hasFridgeNoteSidecar: false, hasLifeThreadSidecar: false
});
assert.match(noAwayOutput, /awayPlans must be exactly \[\]/);
assert.doesNotMatch(noAwayOutput, /plannedArchiveNarrative|knowledgeClaims/);
const optionalPacket = packet.buildStatusSyncPromptPacket({
    globalContract: 'global', hallShared: 'hall', residentRows: 'rows', residentAddenda: '', awayContract: '', awayAddenda: '',
    fridgeContext: '', sceneContext: '', lifeThreadContext: '', outputContract: noAwayOutput
});
assert.doesNotMatch(optionalPacket.prompt, /AWAY \/ MAIL|FRIDGE|LIFE THREAD|SCENE/);

// Structural integration checks protect deferred callers and existing validation/application paths.
const statusStart = appSource.indexOf('const _refreshAllStatus = async');
const statusEnd = appSource.indexOf('const refreshAllStatus = async', statusStart);
const statusSlice = appSource.slice(statusStart, statusEnd);
assert.match(statusSlice, /buildStatusSyncPromptPacket\(/);
assert.match(statusSlice, /buildStatusSyncResidentRow\(/);
assert.match(statusSlice, /buildStatusSyncAwaySourceCapsule\(/);
assert.match(statusSlice, /const curatorAnchorsById = Object\.freeze/);
assert.match(statusSlice, /awayPromptContract\.mode === AWAY_PROMPT_MODES\.NO_AWAY_WORK/);
assert.match(statusSlice, /const sharedStatusUserContext = \(isFocusEnd \|\| isExploreEnd\)/);
assert.match(statusSlice, /activeCatNames\.push\(getResidentPublicName\(c\)\)/);
assert.doesNotMatch(statusSlice, /buildPresenceInferenceContext\(/);
assert.doesNotMatch(statusSlice, /gnnTrendsGlobal|phoneData\.gnn/);
assert.doesNotMatch(statusSlice, /cat\?\.prompt|cat\.prompt/);
const outputAssemblyStart = statusSlice.indexOf('const outputContract =');
const outputAssemblyEnd = statusSlice.indexOf('const statusPacket =', outputAssemblyStart);
assert.ok(outputAssemblyStart >= 0 && outputAssemblyEnd > outputAssemblyStart);
assert.doesNotMatch(statusSlice.slice(outputAssemblyStart, outputAssemblyEnd), /relationshipDeltas|memoryMeta|participantIds/);
for (const preserved of [
    'validateStatusSyncUpdates', 'classifyFormDirectiveCompatibility',
    'commitFridgeNoteReactionOpportunities',
    'enforceAwayMailDecision', 'classifyAwayPlanDiagnostic'
]) assert.match(statusSlice, new RegExp(preserved));

const validatorStart = appSource.indexOf('const validateLocalPresenceDirectives');
const validatorEnd = appSource.indexOf('const validateStatusSyncEnvelope', validatorStart);
assert.ok(validatorStart >= 0 && validatorEnd > validatorStart);
const validationSandbox = {
    CURATOR_ROOM_ANCHORS: { bed: {}, desk: {}, nightstand: {}, window: {}, wardrobe: {}, floor: {} },
    cleanText
};
vm.runInNewContext(`${appSource.slice(validatorStart, validatorEnd)}\nglobalThis.validatePresence = validateLocalPresenceDirectives;`, validationSandbox, { filename: 'index.html:curator-presence-validation' });
const validCuratorResponse = [{ id: 'curator', curatorRoomAnchor: 'desk', isOut: false, isHuman: false, status: '在书桌前整理纸页。', innerVoice: '我先把这一页看完。' }];
assert.equal(validationSandbox.validatePresence(validCuratorResponse, { curator: 'CURATOR_ROOM' }, { curator: 'desk' }), true);
assert.match(validationSandbox.validatePresence([{ ...validCuratorResponse[0], curatorRoomAnchor: 'window' }], { curator: 'CURATOR_ROOM' }, { curator: 'desk' }), /must echo authoritative anchor/);
assert.match(validationSandbox.validatePresence([{ ...validCuratorResponse[0], curatorRoomAnchor: '' }], { curator: 'CURATOR_ROOM' }, { curator: 'desk' }), /is invalid/);

const legacyResidentBlock = residents.map(cat => [
    cat.prompt, cat.innerVoice, cat.diary, cat.monitor, cat.travelogues.join('\n'),
    cat.episodicMemories.map(memory => memory.summary).join('\n'),
    JSON.stringify(cat.residentRelationships), JSON.stringify(cat.knowledgeLedger)
].join('\n')).join('\n---\n');
const rows1 = packet.buildStatusSyncResidentRow({ cat: residents[0], hall, directive: 'STAYING_HOME', now });
const rows4 = residents.slice(0, 4).map(cat => packet.buildStatusSyncResidentRow({ cat, hall, directive: 'STAYING_HOME', now })).join('\n---\n');
const rows7 = residents.map(cat => packet.buildStatusSyncResidentRow({ cat, hall, directive: 'STAYING_HOME', now })).join('\n---\n');
const oldSevenChars = legacyResidentBlock.length + 9000;
const newSevenChars = assembled.prompt.length;
assert.ok(newSevenChars <= oldSevenChars * 0.65, `expected >=35% reduction, got old=${oldSevenChars}, new=${newSevenChars}`);
const curatorPacket = packet.buildStatusSyncPromptPacket({
    globalContract: packet.buildStatusSyncGlobalContract({ curatorRoomStatusSync: true }),
    hallShared: curatorShared,
    residentRows: `[COMPACT RESIDENT ROWS]\n${curatorRow}`,
    residentAddenda: '', awayContract: '', awayAddenda: '', fridgeContext: '', sceneContext: '', lifeThreadContext: '',
    outputContract: packet.buildStatusSyncOutputContract({
        curatorRoomStatusSync: true, requestedIds: ['curator'],
        awayPromptContract: { mode: 'NO_AWAY_WORK' }, sceneMode: '', hasFridgeNoteSidecar: false, hasLifeThreadSidecar: false
    })
});
assert.ok(curatorShared.length < 4260, `Curator hallShared should beat real pre-fix 4260 chars, got ${curatorShared.length}`);
assert.ok(curatorPacket.prompt.length < 6259, `Curator user packet should beat real pre-fix 6259 chars, got ${curatorPacket.prompt.length}`);
const eighthResident = makeResident('r8');
const eightResidents = [...residents, eighthResident];
const eightRows = eightResidents.map(cat => packet.buildStatusSyncResidentRow({ cat, hall, directive: cat.id === 'r1' ? 'DEPARTING_NOW' : 'STAYING_HOME', now })).join('\n---\n');
const allOptionalEight = packet.buildStatusSyncPromptPacket({
    globalContract: packet.buildStatusSyncGlobalContract(),
    hallShared: '[SHARED HALL / SCENE CONTEXT]\npublic Hall state only',
    residentRows: `[COMPACT RESIDENT ROWS]\n${eightRows}`,
    residentAddenda: '[SAFE CURRENT-EVENT ADDENDA]\ngeneric public return',
    awayContract: '[AWAY / MAIL CONTRACT]\nvalid departure and frozen mail decision',
    awayAddenda: capsule,
    fridgeContext: '[FRIDGE NOTES]\none bounded shared opportunity',
    sceneContext: '[AMBIENT HALL SOCIAL SCENE]\nshared participants only',
    lifeThreadContext: '[LIFE THREAD CANDIDATE]\noptional accepted-response sidecar',
    outputContract: 'output'
});
for (const heading of ['AWAY / MAIL', 'FRIDGE NOTES', 'AMBIENT HALL SOCIAL SCENE', 'LIFE THREAD CANDIDATE']) {
    assert.match(allOptionalEight.prompt, new RegExp(heading));
}

console.log(JSON.stringify({
    fixture: 'status-sync-prompt', status: 'PASS',
    measurements: {
        ordinary1: { oldResidentChars: legacyResidentBlock.split('\n---\n')[0].length, newResidentRowsChars: rows1.length },
        ordinary4: { oldResidentChars: legacyResidentBlock.split('\n---\n').slice(0, 4).join('\n---\n').length, newResidentRowsChars: rows4.length },
        ordinary7: { oldResidentChars: legacyResidentBlock.length, newResidentRowsChars: rows7.length, oldUserPromptChars: oldSevenChars, newUserPromptChars: newSevenChars, reductionPercent: Number(((1 - newSevenChars / oldSevenChars) * 100).toFixed(1)) },
        sevenWithAwayCandidate: { residentRowsChars: rows7.length, awayCapsuleChars: capsule.length },
        sevenWithFridge: { residentRowsChars: rows7.length, fridgeContextChars: '[FRIDGE NOTE]\nshared bounded candidate text'.length },
        eightWithAllOptionalContexts: { residentRowsChars: eightRows.length, totalUserPacketChars: allOptionalEight.prompt.length },
        curatorOne: { hallSharedBeforeChars: 4260, hallSharedAfterChars: curatorShared.length, userBeforeChars: 6259, userAfterChars: curatorPacket.prompt.length, residentRowChars: curatorRow.length }
    }
}));
