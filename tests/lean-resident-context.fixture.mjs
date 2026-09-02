import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const memorySource = fs.readFileSync(new URL('../js/meeow-memory.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(memorySource, sandbox, { filename: 'js/meeow-memory.js' });
const memory = sandbox.window.Meeow.memory;

const makeResident = (id, overrides = {}) => ({
    id, name: `Resident ${id}`, humanName: `Resident ${id}`, hallId: 'gotham',
    personality: 'careful, dryly funny, and observant', prompt: `Full immutable canon for ${id}. `.repeat(36),
    breed: 'cat', eyeColor: 'green', currentForm: 'CAT', isHuman: false, affinity: 42,
    status: `observable status ${id}`, innerVoice: `PRIVATE INNER VOICE ${id}`,
    todayInteractions: Array.from({ length: 8 }, (_, index) => ({ time: `${index}:00`, type: 'chat', content: `interaction ${id} ${index} `.repeat(28) })),
    diary: Array.from({ length: 8 }, (_, index) => ({ time: `${index}:00`, content: `monitor secret ${id} ${index} `.repeat(28) })),
    logs: Array.from({ length: 3 }, (_, index) => ({ date: '2026-08-31', content: `diary secret ${id} ${index} `.repeat(35) })),
    travelogues: Array.from({ length: 2 }, (_, index) => ({ date: '2026-08-30', location: 'Hidden dock', content: `away private purpose ${id} ${index} `.repeat(30) })),
    residentRelationships: { peer: { evidenceExcerpt: 'PRIVATE RELATIONSHIP EVIDENCE', tags: ['secret'] } },
    episodicMemories: [],
    ...overrides
});

const residents = Array.from({ length: 7 }, (_, index) => makeResident(`r${index + 1}`));
memory.configure({
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    getCats: () => residents,
    getHalls: () => [{ id: 'gotham', name: 'Gotham Hall' }],
    getCurrentHall: () => ({ id: 'gotham', name: 'Gotham Hall' }),
    getUser: () => ({ missionReports: [] }),
    getDateContext: () => 'today', getOperationalDayKey: () => '2026-08-31',
    getPreviousOperationalDayKey: () => '2026-08-30', buildOwnerDailyContext: () => '',
    getResidentPublicName: cat => cat.humanName || cat.name,
    getResidentForm: cat => cat.currentForm === 'HUMAN' ? 'HUMAN' : 'CAT',
    describeResidentForm: cat => cat.currentForm === 'HUMAN' ? 'HUMAN' : 'CAT'
});

const ambient = memory.buildAmbientResidentContext(residents[0], {
    hallName: 'Gotham Hall', presence: 'HALL', form: 'CAT',
    publicRelationshipLines: ['with Resident r2: canonical public baseline — allies']
});
assert.ok(ambient.length <= 900);
assert.match(ambient, /Authoritative form: CAT/);
assert.match(ambient, /Hall: Gotham Hall/);
assert.match(ambient, /Observable current status: observable status r1/);
assert.match(ambient, /canonical public baseline — allies/);
assert.doesNotMatch(ambient, /PRIVATE INNER VOICE|42|monitor secret|diary secret|away private purpose|PRIVATE RELATIONSHIP EVIDENCE|episodic/i);

// Ambient admission is whole-field only: an oversized personality is omitted,
// not cut into an ambiguous fragment.
const oversized = makeResident('oversized', { personality: `PERSONALITY-WHOLE-${'x'.repeat(1000)}`, status: 'visible status' });
residents.push(oversized);
const oversizedAmbient = memory.buildAmbientResidentContext(oversized, { hallName: 'Gotham Hall', presence: 'HALL' });
assert.ok(oversizedAmbient.length <= 900);
assert.doesNotMatch(oversizedAmbient, /PERSONALITY-WHOLE/);

const foreground = memory.buildForegroundLeanResidentContext(residents[0], {
    hallName: 'Gotham Hall', presence: 'HALL', form: 'CAT',
    userRelationship: 'USER is the accepted caretaker. Current affinity: 42/100.'
});
assert.match(foreground, /Full immutable canon for r1/);
assert.match(foreground, /Current inner voice: PRIVATE INNER VOICE r1/);
assert.match(foreground, /Current affinity: 42\/100/);

// Current-session evidence must be drawn from visible/shared log text only.
const helperStart = appSource.indexOf('const buildSharedFocusSessionEvidence');
const helperEnd = appSource.indexOf('const logPromptBudget', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const focusSandbox = { cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim() };
vm.runInNewContext(`${appSource.slice(helperStart, helperEnd)}\nglobalThis.buildEvidence = buildSharedFocusSessionEvidence;`, focusSandbox, { filename: 'index.html:focus-evidence' });
const evidence = focusSandbox.buildEvidence([
    '10:00｜Resident r1 remained beside the USER-visible desk.',
    '10:01｜[PRIVATE] hidden Thread fact',
    '10:02｜内心独白：不能让任何人知道。',
    '10:03｜USER sent a visible encouragement message.'
], 6, 420);
assert.match(evidence, /USER-visible desk/);
assert.match(evidence, /visible encouragement/);
assert.doesNotMatch(evidence, /PRIVATE|内心独白|Thread fact/);

// The five scoped callers must use the lean tiers rather than broad history;
// all other Phase-1 integrations remain separate.
const slice = (start, end) => appSource.slice(appSource.indexOf(start), appSource.indexOf(end, appSource.indexOf(start)));
const scanSlice = slice('const scanSignal = async', 'const hackCamera');
const groupSlice = slice('const sendGroupMessage = async', 'const HERO_GLITCH_STATUSES');
const catchSlice = slice('const catchInTheAct = async', 'const startGlitchTimer');
const focusSlice = slice('const focusTickBehavior = async', 'const startFocus');
const settlementSlice = slice('const finishFocus = async', 'const confirmSettlement');
[scanSlice, groupSlice, focusSlice, settlementSlice].forEach(target => {
    assert.match(target, /buildLeanAmbientContext/);
    assert.doesNotMatch(target, /buildCatMemoryContext\(/);
});
assert.match(catchSlice, /buildLeanForegroundContext/);
assert.doesNotMatch(catchSlice, /buildCatMemoryContext\(/);
assert.match(scanSlice, /roomCats\.value\.filter\(isResidentInHall\)/);
assert.match(groupSlice, /roomCats\.value\.filter\(isResidentInHall\)/);
assert.match(focusSlice, /buildSharedFocusSessionEvidence\(currentFocusLog\.value, 3, 420\)/);
assert.match(focusSlice, /validateFocusSharedMoment/);
assert.match(focusSlice, /sharedMoment\.content/);
assert.match(settlementSlice, /buildSharedFocusSessionEvidence\(\[\.\.\.chronologicalLogs\]\.reverse\(\), 6, 900\)/);
assert.match(appSource, /getRelationshipBaseline\(left, right\)/);
assert.doesNotMatch(appSource.slice(appSource.indexOf('const buildPublicSharedPeerRelationshipLines'), appSource.indexOf('const getEffectiveRelationshipProjection')), /residentRelationships/);

const broad = residents.slice(0, 7).map(cat => memory.buildCatMemoryContext(cat)).join('\n---\n');
const ambientSeven = residents.slice(0, 7).map(cat => memory.buildAmbientResidentContext(cat, { hallName: 'Gotham Hall', presence: 'HALL' })).join('\n---\n');
const focusOneBefore = memory.buildCatMemoryContext(residents[0]).length;
const focusOneAfter = memory.buildAmbientResidentContext(residents[0], { hallName: 'Gotham Hall', presence: 'HALL' }).length;
const foregroundBefore = memory.buildCatMemoryContext(residents[0]).length;
const foregroundAfter = foreground.length;

console.log(JSON.stringify({
    fixture: 'lean-resident-context', status: 'PASS',
    measurements: {
        focusTick1: { beforeResidentContextChars: focusOneBefore, afterResidentContextChars: focusOneAfter },
        focusTick4: { beforeResidentContextChars: focusOneBefore * 4, afterResidentContextChars: focusOneAfter * 4 },
        scan7: { beforeResidentContextChars: broad.length, afterResidentContextChars: ambientSeven.length },
        group7: { beforeResidentContextChars: broad.length, afterResidentContextChars: ambientSeven.length },
        catch1: { beforeResidentContextChars: foregroundBefore, afterResidentContextChars: foregroundAfter },
        focusSettlement4: { beforeResidentContextChars: focusOneBefore * 4, afterResidentContextChars: focusOneAfter * 4 }
    }
}));
