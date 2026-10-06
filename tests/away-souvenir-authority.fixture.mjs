import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const parseLogicalDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const getOperationalDayKey = value => parseLogicalDate(value).toISOString().slice(0, 10);
const awayContext = vm.createContext({ window: { crypto: webcrypto }, Date, Math, console });
vm.runInContext(readFileSync(new URL('../js/meeow-item-visuals.js', import.meta.url), 'utf8'), awayContext);
vm.runInContext(readFileSync(new URL('../js/meeow-shop-catalog.js', import.meta.url), 'utf8'), awayContext);
vm.runInContext(readFileSync(new URL('../js/meeow-resident-items.js', import.meta.url), 'utf8'), awayContext);
vm.runInContext(readFileSync(new URL('../js/meeow-away.js', import.meta.url), 'utf8'), awayContext);
const away = awayContext.window.Meeow.away;
away.configure({
    cleanText, parseLogicalDate, getCatHallId: cat => cat.hallId,
    isPermanentOut: () => false, isResidentInHall: cat => !cat.isOut,
    addLog: () => {}
});
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const extract = (start, end) => {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first, `missing production slice: ${start}`);
    return source.slice(first, last);
};
const decisionsSlice = extract('                const buildAwayMailDecisions =', '                const buildAwayPromptContract =');
const enforcementSlice = extract('                const enforceAwayMailDecision =', '                const reconcileAwayEpisodes =');
const decisionContext = vm.createContext({ prepareAwayMailConsideration: () => { throw new Error('unexpected new qualification'); }, persistAwayMailChanges: changes => {
    const saved = decisionContext.persistNow();
    if (saved) changes.forEach(({cat, fields}) => Object.assign(cat, fields));
    return saved;
}, awayLifecycle: away, window: awayContext.window, rollPercent: () => { throw new Error('unexpected roll'); } });
vm.runInContext(`${decisionsSlice}\nglobalThis.buildDecisions = buildAwayMailDecisions; globalThis.prepareDecisions = prepareStatusSyncAwayMailDecisions; globalThis.formatAuthority = formatAwayMailAuthority;`, decisionContext);
vm.runInContext(`${enforcementSlice}\nglobalThis.enforce = enforceAwayMailDecision;`, decisionContext);
const rolls = (...values) => {
    const queue = [...values];
    return () => {
        assert.ok(queue.length, 'unexpected reroll');
        return queue.shift();
    };
};
const makeDecision = (...values) => away.createMailDecision(rolls(...values));
assert.equal(away.AWAY_SOUVENIR_CHANCE_PERCENT, 60);
const noLetter = makeDecision(51);
const souvenirAtBoundary = makeDecision(50, 60);
const noSouvenirPastBoundary = makeDecision(50, 61);
assert.equal(noLetter.shouldWrite, false);
assert.equal('souvenirDecision' in noLetter, false);
assert.equal(souvenirAtBoundary.souvenirDecision.shouldInclude, true);
assert.equal(noSouvenirPastBoundary.souvenirDecision.shouldInclude, false);

// Request construction is read-only with respect to missing decisions. The
// executable Status Sync boundary completes a legacy receipt and persists it.
const legacyDecision = { roll: 30, shouldWrite: true };
let statusRollCalls = 0;
decisionContext.rollPercent = () => { statusRollCalls++; return 60; };
assert.equal(decisionContext.buildDecisions({ bruce: 'DEPARTING_NOW', dick: 'HOME' }).bruce, undefined);
assert.equal(decisionContext.buildDecisions({ bruce: 'DEPARTING_NOW' }, { bruce: legacyDecision }).bruce.souvenirDecision, undefined);
assert.equal(statusRollCalls, 0);
const statusCat = { id: 'bruce', deferredOrdinaryAwayDeparture: {
    claimId: 'legacy-claim', hallId: 'gotham', mailDecision: legacyDecision,
    createdAt: '2026-08-31T08:00:00.000Z'
} };
const deferredSlice = extract('                const normalizeDeferredOrdinaryAwayDeparture =', '                const deferOrdinaryAwayDeparture =');
vm.runInContext(`${deferredSlice}\nglobalThis.normalizeDeferred = normalizeDeferredOrdinaryAwayDeparture;`, Object.assign(decisionContext, { parseLogicalDate }));
const rawDeferred = JSON.parse(JSON.stringify(statusCat.deferredOrdinaryAwayDeparture));
const deferredFirst = JSON.parse(JSON.stringify(decisionContext.normalizeDeferred(statusCat)));
statusCat.deferredOrdinaryAwayDeparture = JSON.parse(JSON.stringify(rawDeferred));
const deferredSecond = JSON.parse(JSON.stringify(decisionContext.normalizeDeferred(statusCat)));
assert.deepEqual(deferredFirst, deferredSecond);
assert.equal(deferredFirst.mailDecision.souvenirDecision, undefined);
assert.equal(statusRollCalls, 0);
assert.doesNotMatch(deferredSlice, /rollPercent|Math\.random|completeMailDecisionAtExecution/);
let statusPersistCalls = 0;
let persistedStatusCat;
decisionContext.persistNow = () => {
    statusPersistCalls++;
    persistedStatusCat = JSON.parse(JSON.stringify(statusCat));
    return true;
};
const statusArgs = { presenceDirectives: { bruce: 'DEPARTING_NOW', dick: 'HOME' },
    requestedCats: [statusCat], hallId: 'gotham', carriedDecisions: { bruce: legacyDecision },
    now: new Date('2026-08-31T08:00:00.000Z') };
const statusDecisions = decisionContext.prepareDecisions(statusArgs);
assert.equal(statusDecisions.bruce.souvenirDecision.shouldInclude, true);
assert.equal(statusDecisions.dick, undefined);
assert.equal(statusRollCalls, 1);
assert.equal(statusPersistCalls, 1);
assert.equal(persistedStatusCat.deferredOrdinaryAwayDeparture.mailDecision.souvenirDecision.roll, 60);
decisionContext.rollPercent = () => { throw new Error('retry rerolled souvenir'); };
const retryDecisions = decisionContext.prepareDecisions(statusArgs);
assert.deepEqual(JSON.parse(JSON.stringify(retryDecisions.bruce)), JSON.parse(JSON.stringify(statusDecisions.bruce)));
statusCat.deferredOrdinaryAwayDeparture = persistedStatusCat.deferredOrdinaryAwayDeparture;
assert.deepEqual(JSON.parse(JSON.stringify(decisionContext.prepareDecisions(statusArgs).bruce)), JSON.parse(JSON.stringify(statusDecisions.bruce)));
const carriedOnlyCat = { id: 'carried' };
const carriedOnlyArgs = { ...statusArgs, presenceDirectives: { carried: 'DEPARTING_NOW' },
    requestedCats: [carriedOnlyCat], carriedDecisions: { carried: legacyDecision } };
let carriedRollCalls = 0;
let carriedPersisted;
decisionContext.rollPercent = () => { carriedRollCalls++; return 61; };
decisionContext.persistNow = () => { carriedPersisted = JSON.parse(JSON.stringify(carriedOnlyCat)); return true; };
assert.equal(decisionContext.prepareDecisions(carriedOnlyArgs).carried.souvenirDecision.shouldInclude, false);
assert.equal(carriedRollCalls, 1);
assert.equal(carriedPersisted.deferredOrdinaryAwayDeparture.mailDecision.souvenirDecision.roll, 61);
decisionContext.rollPercent = () => { throw new Error('carried-only reload rerolled'); };
carriedOnlyCat.deferredOrdinaryAwayDeparture = carriedPersisted.deferredOrdinaryAwayDeparture;
assert.equal(decisionContext.prepareDecisions(carriedOnlyArgs).carried.souvenirDecision.roll, 61);
const statusNegativeCat = { id: 'dick', deferredOrdinaryAwayDeparture: {
    claimId: 'negative-claim', hallId: 'gotham', mailDecision: { roll: 75, shouldWrite: false },
    createdAt: '2026-08-31T08:00:00.000Z'
} };
const negativeStatus = decisionContext.prepareDecisions({ ...statusArgs,
    presenceDirectives: { dick: 'DEPARTING_NOW' }, requestedCats: [statusNegativeCat], carriedDecisions: {} });
assert.equal(negativeStatus.dick.shouldWrite, false);
assert.equal(negativeStatus.dick.souvenirDecision, undefined);
const statusFailureCat = { id: 'tim', deferredOrdinaryAwayDeparture: {
    claimId: 'failure-claim', hallId: 'gotham', mailDecision: legacyDecision,
    createdAt: '2026-08-31T08:00:00.000Z'
} };
let failureRollCalls = 0;
decisionContext.rollPercent = () => { failureRollCalls++; return 61; };
decisionContext.persistNow = () => false;
const failedStatusArgs = { ...statusArgs, presenceDirectives: { tim: 'DEPARTING_NOW' },
    requestedCats: [statusFailureCat], carriedDecisions: {} };
assert.equal(decisionContext.prepareDecisions(failedStatusArgs), null);
assert.equal(failureRollCalls, 1);
assert.equal(statusFailureCat.deferredOrdinaryAwayDeparture.mailDecision.souvenirDecision.roll, 61);
decisionContext.rollPercent = () => { throw new Error('Status Sync persistence retry rerolled'); };
decisionContext.persistNow = () => true;
assert.equal(decisionContext.prepareDecisions(failedStatusArgs).tim.souvenirDecision.roll, 61);
assert.equal(failureRollCalls, 1);
assert.match(decisionContext.formatAuthority(['bruce'], statusDecisions), /shouldIncludeSouvenir=true/);
assert.match(decisionContext.formatAuthority(['bruce'], { bruce: noSouvenirPastBoundary }), /shouldIncludeSouvenir=false/);
assert.equal(decisionContext.buildDecisions({ bruce: 'DEPARTING_NOW' }, { bruce: noSouvenirPastBoundary }).bruce.souvenirDecision.roll, 61);
assert.equal(away.completeMailDecisionAtExecution({ roll: 70, shouldWrite: false }, () => { throw new Error('negative letter rolled'); }).souvenirDecision, undefined);
const completeUnchanged = JSON.parse(JSON.stringify(away.completeMailDecisionAtExecution(souvenirAtBoundary, () => { throw new Error('complete decision rerolled'); })));
assert.deepEqual(completeUnchanged, JSON.parse(JSON.stringify(souvenirAtBoundary)));
// A saved pre-V1 ordinary operation stays incomplete through arbitrarily many
// normalizations. Only the dispatch block may roll, and it saves before AI.
const ordinaryNormalizeSlice = extract('                const normalizeOrdinaryAwayOperation =', '                const isOrdinaryAwayEligible =');
const ordinaryNormalizeContext = vm.createContext({ awayLifecycle: away, parseLogicalDate, cleanText, Date });
vm.runInContext(`${ordinaryNormalizeSlice}\nglobalThis.normalizeOrdinary = normalizeOrdinaryAwayOperation;`, ordinaryNormalizeContext);
const legacyOperation = {
    id: 'ordinary-away:bruce:1', hallId: 'gotham', opportunityAt: '2026-08-31T08:00:00.000Z',
    promptText: 'old prompt', mailDecision: legacyDecision, status: 'retryable'
};
const normalizeRaw = () => ({ id: 'bruce', ordinaryAwayOperation: JSON.parse(JSON.stringify(legacyOperation)) });
const normalizedOrdinary = Array.from({ length: 3 }, () => JSON.parse(JSON.stringify(ordinaryNormalizeContext.normalizeOrdinary(normalizeRaw()))));
assert.deepEqual(normalizedOrdinary[0], normalizedOrdinary[1]);
assert.deepEqual(normalizedOrdinary[1], normalizedOrdinary[2]);
assert.equal(normalizedOrdinary[0].mailDecision.souvenirDecision, undefined);
assert.equal(statusRollCalls, 1, 'normalizing either pending-operation shape cannot roll');
assert.doesNotMatch(ordinaryNormalizeSlice, /rollPercent|Math\.random|completeMailDecisionAtExecution/);
const dispatchSlice = extract('                    const operation = candidate.operation;\n                    if (!isOrdinaryAwayEligible',
    '                const getLifeThreadExcursionIntent =');
const ordinaryDispatch = new Function('ctx', `
    const { candidate, isOrdinaryAwayEligible, halls, awayLifecycle, rollPercent,
        buildOrdinaryAwayPlanPrompt, persistAwayMailChanges, allocator, now,
        ordinaryAwayPlanningInFlight, runOrdinaryAwayOperation, addLog } = ctx;
    return () => { ${dispatchSlice.replace(/\n\s*\};\s*$/, '')} };
`);
const ordinaryCat = normalizeRaw();
ordinaryCat.ordinaryAwayOperation = ordinaryNormalizeContext.normalizeOrdinary(ordinaryCat);
let ordinaryRollCalls = 0;
const ordinaryEvents = [];
let savedOrdinaryCat;
let saveSucceeds = true;
const ordinaryCtx = {
    candidate: { cat: ordinaryCat, operation: ordinaryCat.ordinaryAwayOperation },
    isOrdinaryAwayEligible: () => true, halls: { value: [{ id: 'gotham' }] }, awayLifecycle: away,
    rollPercent: () => { ordinaryRollCalls++; return 60; },
    buildOrdinaryAwayPlanPrompt: (resident, hall, operation) => `frozen:${operation.mailDecision.souvenirDecision?.roll ?? 'none'}`,
    persistNow: () => {
        ordinaryEvents.push('persist');
        if (saveSucceeds) savedOrdinaryCat = JSON.parse(JSON.stringify(ordinaryCat));
        return saveSucceeds;
    },
    persistAwayMailChanges: changes => {
        if (!ordinaryCtx.persistNow()) return false;
        changes.forEach(({cat, fields}) => Object.assign(cat, fields));
        return true;
    },
    allocator: { lastAIDispatchAt: '' }, now: new Date('2026-08-31T08:00:00.000Z'),
    ordinaryAwayPlanningInFlight: new Set(),
    runOrdinaryAwayOperation: () => { ordinaryEvents.push('AI'); }, addLog: () => {}
};
assert.equal(ordinaryDispatch(ordinaryCtx)(), true);
assert.deepEqual(ordinaryEvents, ['persist', 'AI']);
assert.equal(ordinaryRollCalls, 1);
assert.equal(savedOrdinaryCat.ordinaryAwayOperation.mailDecision.souvenirDecision.roll, 60);
assert.equal(savedOrdinaryCat.ordinaryAwayOperation.promptText, 'frozen:60');
ordinaryCtx.rollPercent = () => { throw new Error('ordinary retry rerolled'); };
ordinaryCat.ordinaryAwayOperation.status = 'retryable';
ordinaryCtx.ordinaryAwayPlanningInFlight.clear();
ordinaryEvents.length = 0;
assert.equal(ordinaryDispatch(ordinaryCtx)(), true);
assert.deepEqual(ordinaryEvents, ['persist', 'AI']);
assert.equal(ordinaryRollCalls, 1);
ordinaryCtx.candidate = { cat: JSON.parse(JSON.stringify(savedOrdinaryCat)) };
ordinaryCtx.candidate.operation = ordinaryNormalizeContext.normalizeOrdinary(ordinaryCtx.candidate.cat);
ordinaryEvents.length = 0;
assert.equal(ordinaryDispatch(ordinaryCtx)(), true);
assert.deepEqual(ordinaryEvents, ['persist', 'AI']);
assert.equal(ordinaryRollCalls, 1);
const failedCat = normalizeRaw();
failedCat.ordinaryAwayOperation = ordinaryNormalizeContext.normalizeOrdinary(failedCat);
ordinaryCtx.candidate = { cat: failedCat, operation: failedCat.ordinaryAwayOperation };
ordinaryCtx.rollPercent = () => { ordinaryRollCalls++; return 61; };
ordinaryCtx.ordinaryAwayPlanningInFlight.clear();
ordinaryEvents.length = 0;
saveSucceeds = false;
assert.equal(ordinaryDispatch(ordinaryCtx)(), false);
assert.deepEqual(ordinaryEvents, ['persist']);
assert.equal(ordinaryRollCalls, 2);
assert.equal(failedCat.ordinaryAwayOperation.mailDecision.souvenirDecision.roll, 61);
saveSucceeds = true;
ordinaryCtx.rollPercent = () => { throw new Error('failed persistence rerolled'); };
ordinaryEvents.length = 0;
assert.equal(ordinaryDispatch(ordinaryCtx)(), true);
assert.deepEqual(ordinaryEvents, ['persist', 'AI']);
assert.equal(ordinaryRollCalls, 2);
assert.match(source, /const consideration = prepareAwayMailConsideration\(selected\.cat/, 'ordinary autonomy must use the shared qualification helper');
assert.match(source, /const awayMailDecisions = prepareStatusSyncAwayMailDecisions\(/, 'Status Sync must prepare frozen decisions before prompting');
const statusPreparationAt = source.indexOf('const awayMailDecisions = prepareStatusSyncAwayMailDecisions(');
const statusAIAt = source.indexOf('await callAI(statusRequestPrompt', statusPreparationAt);
assert.ok(statusPreparationAt >= 0 && statusAIAt > statusPreparationAt);
assert.match(source.slice(statusPreparationAt, statusAIAt), /if \(!awayMailDecisions\)[\s\S]*?return false;/,
    'Status Sync must stop before AI when decision persistence fails');
assert.match(source, /validateStatusSyncEnvelope\s*\(\s*content\s*,\s*requestedIds\s*,\s*presenceDirectives\s*,[^;]*?\bcuratorAnchorsById\s*,\s*awayMailDecisions\s*(?:,|\))/, 'Status Sync provider validation must use frozen decisions');

const cat = { id: 'bruce', name: 'Bruce', hallId: 'gotham', isOut: true };
const hall = { id: 'gotham', name: 'Gotham' };
const attachment = { name: '测试纪念品', icon: '🎁', desc: '测试旅途纪念物', visualHint: { object: 'trinket', material: 'unknown', form: 'keepsake', context: 'travel' } };
const narrative = '他沿着熟悉的街道走了一段路，留意沿途的声音和天气，也把这趟外出的所见认真记在心里。'.repeat(2);
const basePlan = mailPlan => ({
    residentId: cat.id, mode: 'departure', plannedDurationMinutes: 210,
    destination: '熟悉的街道',
    plannedActivities: [
        { afterMinutes: 35, plannedResidentActivity: '沿路查看', publicTrace: '路边有短暂停留' },
        { afterMinutes: 100, plannedResidentActivity: '整理途中发现', publicTrace: '继续前行' },
        { afterMinutes: 170, plannedResidentActivity: '准备返程', publicTrace: '回程的脚步声' }
    ],
    plannedArchiveNarrative: narrative,
    mailPlan
});
const letter = attachmentValue => ({ sendAfterMinutes: 90, content: '给馆长的一封短笺。', attachment: attachmentValue });
const check = (plan, decision) => decisionContext.enforce(away.classifyPlan(away.indexPlans([plan]), cat.id, 'departure'), decision);
const envelopeSlice = extract('                const validateStatusSyncEnvelope =', '                const validateOptionalHallScene =');
const envelopeContext = vm.createContext({
    parseAIJSON: JSON.parse,
    validateStatusSyncUpdates: () => true,
    validateLocalPresenceDirectives: () => true,
    indexAwayPlans: away.indexPlans,
    classifyAwayPlanDiagnostic: away.classifyPlan,
    enforceAwayMailDecision: decisionContext.enforce
});
vm.runInContext(`${envelopeSlice}\nglobalThis.validateEnvelope = validateStatusSyncEnvelope;`, envelopeContext);
const statusEnvelope = plan => JSON.stringify({ updates: [], awayPlans: [plan] });
assert.equal(envelopeContext.validateEnvelope(statusEnvelope(basePlan([letter(attachment)])), [], { bruce: 'DEPARTING_NOW' }, {}, null, {}, { bruce: souvenirAtBoundary }), true);
assert.match(envelopeContext.validateEnvelope(statusEnvelope(basePlan([letter(null)])), [], { bruce: 'DEPARTING_NOW' }, {}, null, {}, { bruce: souvenirAtBoundary }), /Away plan invalid/);
assert.match(envelopeContext.validateEnvelope(statusEnvelope(basePlan([letter(attachment)])), [], { bruce: 'DEPARTING_NOW' }, {}, null, {}, { bruce: noSouvenirPastBoundary }), /Away plan invalid/);
const exampleSlice = extract('                const buildOrdinaryAwayMailPlanExample =', '                const buildOrdinaryAwayPlanPrompt =');
const exampleContext = vm.createContext({});
vm.runInContext(`${exampleSlice}\nglobalThis.example = buildOrdinaryAwayMailPlanExample;`, exampleContext);
assert.equal(exampleContext.example(noLetter), '[]');
assert.match(exampleContext.example(souvenirAtBoundary), /"attachment":\{"name":/);
assert.match(exampleContext.example(noSouvenirPastBoundary), /"attachment":null/);
assert.equal(check(basePlan([]), noLetter).valid, true);
assert.equal(check(basePlan([letter(null)]), noLetter).valid, false);
assert.equal(check(basePlan([letter(null)]), noSouvenirPastBoundary).valid, true);
assert.equal(check(basePlan([letter(attachment)]), noSouvenirPastBoundary).valid, false);
assert.equal(check(basePlan([letter(attachment)]), souvenirAtBoundary).valid, true);
assert.equal(check(basePlan([letter(null)]), souvenirAtBoundary).valid, false);
assert.equal(check(basePlan([{ sendAfterMinutes: 90, content: '短笺', item: attachment }]), souvenirAtBoundary).valid, false);
for (const malformed of [
    { ...attachment, name: '  ' }, { ...attachment, icon: '' }, { ...attachment, desc: '\n  ' },
    { ...attachment, visualHint: null }, { ...attachment, visualHint: { ...attachment.visualHint, object: 'sprite-id' } },
    { ...attachment, spriteId: 'yapi:assorted:seashell' }
]) assert.equal(check(basePlan([letter(malformed)]), souvenirAtBoundary).valid, false);
assert.equal(check(basePlan([{ sendAfterMinutes: 90, content: '短笺' }]), noSouvenirPastBoundary).valid, false);
const noLetterEpisode = away.createEpisode(cat, check(basePlan([]), noLetter).plan, new Date('2026-08-31T08:00:00.000Z'), noLetter);
assert.equal(noLetterEpisode.mailPlan.length, 0);
assert.equal('souvenirDecision' in noLetterEpisode.mailDecision, false);
const letterOnlyEpisode = away.createEpisode(cat, check(basePlan([letter(null)]), noSouvenirPastBoundary).plan, new Date('2026-08-31T08:00:00.000Z'), noSouvenirPastBoundary);
assert.equal(away.normalizeEpisodes([letterOnlyEpisode])[0].mailPlan[0].attachment, null);
assert.equal(letterOnlyEpisode.mailDecision.souvenirDecision.shouldInclude, false);
assert.equal(check(basePlan([letter(attachment)]), noSouvenirPastBoundary).valid, false);
assert.equal(check(basePlan([letter(null)]), noSouvenirPastBoundary).valid, true);

// An invalid first attempt cannot downgrade the frozen decision. The valid
// retry uses the same receipt, and no random source is consulted.
const frozen = makeDecision(30, 1);
assert.equal(check(basePlan([letter(null)]), frozen).valid, false);
const accepted = check(basePlan([letter(attachment)]), frozen);
assert.equal(accepted.valid, true);
assert.equal(frozen.souvenirDecision.roll, 1);
assert.equal(away.completeMailDecisionAtExecution(frozen, () => { throw new Error('reroll'); }).souvenirDecision.roll, 1);

const departedAt = new Date('2026-08-31T08:00:00.000Z');
const episode = away.createEpisode(cat, accepted.plan, departedAt, frozen);
const frozenAttachment = JSON.parse(JSON.stringify(episode.mailPlan[0].attachment));
assert.deepEqual({ name: frozenAttachment.name, icon: frozenAttachment.icon, desc: frozenAttachment.desc, visualHint: frozenAttachment.visual.visualHint }, attachment);
assert.equal(Object.hasOwn(frozenAttachment, 'visualHint'), false);
assert.equal(frozenAttachment.visual.mode, 'auto-sprite');
assert.equal(frozenAttachment.visual.spriteId, 'baseitem:bank-card');
assert.equal(episode.mailDecision.souvenirDecision.shouldInclude, true);
const reloadedEpisode = away.normalizeEpisodes(JSON.parse(JSON.stringify([episode])))[0];
assert.deepEqual(JSON.parse(JSON.stringify(reloadedEpisode.mailPlan[0].attachment)), frozenAttachment);
assert.equal(reloadedEpisode.mailDecision.souvenirDecision.shouldInclude, true);

const deliverySlice = extract('                const recordDeliveredMail =', '                const generateMail =');
const user = { mailbox: [], inventory: [], dailyMailCount: 0, lastMailDate: '', lastMailAt: 0, lastMailSenderId: null };
const delivery = new Function('ctx', `
    const { user, cats, halls, window, parseLogicalDate, getOperationalDayKey, cleanText, getCatHallId,
        showNotification, addLog, hasPhysicalAwayMailDeliveryCapacity, getNextOperationalDayStart,
        getDeliveredPhysicalAwayMailCountForOperationalDay, isLifeThreadAwayEpisode, getResidentPublicName } = ctx;
    ${deliverySlice}
    return { deliverPlannedAwayMail };
`)({
    user, cats: { value: [cat] }, halls: { value: [hall] }, window: awayContext.window, parseLogicalDate, getOperationalDayKey,
    cleanText, getCatHallId: resident => resident.hallId, showNotification: () => {}, addLog: () => {},
    hasPhysicalAwayMailDeliveryCapacity: () => true, getNextOperationalDayStart: value => value,
    getDeliveredPhysicalAwayMailCountForOperationalDay: () => user.mailbox.length,
    isLifeThreadAwayEpisode: value => value?.provenance?.visibility === 'thread-private',
    getResidentPublicName: resident => resident.name
});
const deliveredAt = new Date('2026-08-31T10:06:00.000Z');
const reconciled = away.reconcileEpisodes({
    episodes: [reloadedEpisode], cats: [cat], reconciliationTime: deliveredAt,
    onDeliverMail: (currentEpisode, mail, sendAt, now) => delivery.deliverPlannedAwayMail(currentEpisode, mail, sendAt, now)
});
assert.equal(user.mailbox.length, 1);
assert.equal(user.mailbox[0].plannedMailId, reloadedEpisode.mailPlan[0].id);
assert.equal(user.mailbox[0].item.type, 'collectible');
assert.deepEqual(JSON.parse(JSON.stringify(user.mailbox[0].item.provenance.originOwner)),
    { kind: 'resident', residentId: String(cat.id) });
assert.deepEqual({ name: user.mailbox[0].item.name, icon: user.mailbox[0].item.icon, desc: user.mailbox[0].item.desc, visualHint: user.mailbox[0].item.visual.visualHint }, attachment);
assert.equal(Object.hasOwn(user.mailbox[0].item, 'visualHint'), false);
assert.deepEqual(user.mailbox[0].item.visual, frozenAttachment.visual);
const visualDescriptor = awayContext.window.Meeow.itemVisuals.getItemVisualDescriptor;
assert.deepEqual(JSON.parse(JSON.stringify(visualDescriptor(user.mailbox[0].item))), {
    kind: 'sprite', spriteId: 'baseitem:bank-card',
    file: 'assets/item-sprites/library/house-base-library-v1/bank-card.png',
    nativeWidth: 64, nativeHeight: 64, sheetRect: null
});
assert.equal(delivery.deliverPlannedAwayMail(reconciled.episodes[0], reconciled.episodes[0].mailPlan[0], new Date(reconciled.episodes[0].mailPlan[0].sendAt), deliveredAt), false);
assert.equal(user.mailbox.length, 1);
assert.match(source, /v-if="mail\.item"[\s\S]*?v-if="!mail\.claimed"/);
assert.equal(Boolean(user.mailbox[0].item), true);

const claimSlice = extract('                const claimMailItem =', '                const addTodo =');
const claim = new Function('user', 'showToast', 'window', 'persistNow', `${claimSlice}\nreturn claimMailItem;`)(
    user, () => {}, awayContext.window, () => true);
claim(user.mailbox[0]);
claim(user.mailbox[0]);
assert.equal(user.inventory.length, 1);
assert.equal(user.inventory[0].type, 'collectible');
assert.deepEqual(JSON.parse(JSON.stringify(user.inventory[0].provenance.originOwner)),
    { kind: 'resident', residentId: String(cat.id) });
assert.deepEqual(user.inventory[0].visual.visualHint, attachment.visualHint);
assert.equal(Object.hasOwn(user.inventory[0], 'visualHint'), false);
assert.deepEqual(user.inventory[0].visual, frozenAttachment.visual);
assert.equal(visualDescriptor(user.inventory[0]).spriteId, visualDescriptor(user.mailbox[0].item).spriteId);
assert.equal(user.mailbox[0].claimed, true);
const savedUser = JSON.parse(JSON.stringify(user));
assert.equal(savedUser.mailbox[0].claimed, true);
assert.equal(savedUser.inventory[0].name, attachment.name);

// Old episodes and already-delivered mailbox rows have no new decision receipt.
const { visualHint: ignoredLegacyHint, ...legacyAttachment } = attachment;
const oldWithGift = { ...episode, mailDecision: { roll: 30, shouldWrite: true }, mailPlan: [{ ...episode.mailPlan[0], attachment: legacyAttachment }] };
const oldWithoutGift = { ...oldWithGift, mailPlan: [{ ...episode.mailPlan[0], attachment: null }] };
const normalizedOld = away.normalizeEpisodes(JSON.parse(JSON.stringify([oldWithGift, oldWithoutGift])));
assert.deepEqual(JSON.parse(JSON.stringify(normalizedOld[0].mailPlan[0].attachment)), legacyAttachment);
assert.equal(normalizedOld[1].mailPlan[0].attachment, null);
assert.equal('souvenirDecision' in normalizedOld[0].mailDecision, false);
user.mailbox.length = 0;
assert.equal(delivery.deliverPlannedAwayMail(normalizedOld[0], normalizedOld[0].mailPlan[0], new Date(normalizedOld[0].mailPlan[0].sendAt), deliveredAt), true);
assert.equal(user.mailbox[0].item.name, attachment.name);
const oldUser = JSON.parse(JSON.stringify({ mailbox: [{ item: { ...legacyAttachment, type: 'collectible' }, claimed: false }], inventory: [] }));
assert.equal(Boolean(oldUser.mailbox[0].item), true);
const oldClaim = new Function('user', 'showToast', 'window', 'persistNow', `${claimSlice}\nreturn claimMailItem;`)(
    oldUser, () => {}, awayContext.window, () => true);
oldClaim(oldUser.mailbox[0]);
assert.equal(oldUser.inventory.length, 1);
assert.equal(oldUser.mailbox[0].claimed, true);

// The older unmanaged-mail prompt and private Thread quarantine remain separate.
const legacyMail = extract('                const generateMail =', '                const handleCatClick =');
assert.match(legacyMail, /Math\.random\(\) > 0\.25/);
assert.match(legacyMail, /附件有 60% 概率/);
assert.doesNotMatch(legacyMail, /createMailDecision|souvenirDecision/);
const threadProvenance = {
    origin: 'life-thread', visibility: 'thread-private', threadId: 'thread', threadExcursionId: 'excursion',
    actorId: cat.id, operationToken: 'token', basisFactIds: ['fact'],
    continuationSourceEventId: 'continuation', outcomeSourceEventId: 'outcome'
};
assert.equal(away.createEpisode(cat, accepted.plan, departedAt, frozen, threadProvenance).mailPlan.length, 0);

console.log('Away souvenir authority fixture: PASS');

// T5: actual production qualification, snapshot transaction and both departure
// entry points. No provider/network; the existing combined planner is spied.
const clone = value => JSON.parse(JSON.stringify(value));
const hour = 3_600_000, t0 = new Date('2026-10-05T10:00:00Z').getTime();
const qualificationSlice = extract('                // T5 product policy:', '                const getOrdinaryAwayAllocator =');
const autonomySlice = extract('                const getOrdinaryAwayAllocator =', '                const getLifeThreadExcursionIntent =');
function cadence({ saved = null, values = [20, 60] } = {}) {
    let now = t0, works = true, durable = saved ? clone(saved) : null, rollCalls = 0;
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const cat = id => ({ id, name: id, hallId: 'gotham', nextAwayOpportunityAt: new Clock(t0 - 1).toISOString(),
        chatHistory: ['PRIVATE_CHAT'], innerVoice: 'PRIVATE_VOICE' });
    const residents = saved?.cats || [cat('telemachus'), cat('zagreus')];
    const owner = saved?.user || { mailbox: [], currentStatus: 'PRIVATE_OWNER' };
    const episodes = saved?.awayEpisodes || [];
    const queue = [...values], events = [], requests = [];
    const ctx = vm.createContext({ Date: Clock, Math, console, WeakMap, Set, Object, ThinkingLevel: { LOW: 'low' },
        user: owner, cats: { value: residents }, halls: { value: [{ id: 'gotham', name: 'Gotham' }] },
        awayEpisodes: { value: episodes }, awayLifecycle: { ...away, buildDepartureSchedule: ({ requestedCats }) => ({
            selectedIds: requestedCats.filter(cat => !cat.isOut && cat.nextAwayOpportunityAt &&
                new Date(cat.nextAwayOpportunityAt).getTime() <= now).slice(0, 1).map(cat => cat.id)
        }) }, parseLogicalDate, cleanText, getCatHallId: cat => cat.hallId,
        isResidentInHall: cat => !cat.isOut, isResidentInCuratorRoom: cat => Boolean(cat.curatorRoomPresence),
        getActiveAwayEpisode: () => null, hasLifeThreadExcursionDepartureClaim: () => false,
        hasFrozenOrdinaryAwayDepartureClaim: () => false, isFocusing: { value: false }, focusCats: { value: [] },
        exploreState: { active: false }, isInteracting: { value: false }, selectedCat: { value: null },
        settings: { apiKey: 'mock' }, ordinaryAwayPlanningInFlight: new Set(), ORDINARY_AWAY_AI_MIN_INTERVAL_MS: 30 * 60_000,
        getResidentForm: () => 'CAT', getResidentLiveStatus: () => '在馆内',
        buildCatIdentityBlock: cat => `resident=${cat.id}`, AWAY_ACTIVITY_PLANNING_RULES: 'existing planning rules',
        rollPercent: () => { rollCalls++; assert.ok(queue.length, 'T5 unexpected roll'); return queue.shift(); },
        addLog: () => {}, buildSaveData: () => ({ user: owner, cats: residents, awayEpisodes: episodes }),
        window: { Meeow: { itemVisuals: awayContext.window.Meeow.itemVisuals, storage: { persistSnapshot(snapshot) {
            events.push('save');
            assert.equal(owner.lastAwayLetterGrantedAt, durable?.user.lastAwayLetterGrantedAt,
                'candidate grant must not be live before successful save');
            if (!works) return false;
            durable = clone(snapshot); return true;
        } } } },
        normalizeAwayEpisodes: away.normalizeEpisodes, indexAwayPlans: away.indexPlans,
        classifyAwayPlanDiagnostic: away.classifyPlan, parseAIJSON: JSON.parse,
        scheduleIndependentAwayDepartureGate: () => {}, appendMonitorEvent: () => {}, appendAwayTransitionTravelogue: () => {},
        createAwayEpisode: (cat, plan, at, decision, provenance, options) => {
            const episode = away.createEpisode(cat, plan, at, decision, provenance, options);
            episodes.push(episode); return episode;
        },
        requestStructuredEngine: (prompt, options) => new Promise((resolve, reject) => {
            events.push('AI'); requests.push({ prompt, options, resolve, reject });
            assert.equal(durable.cats[0].ordinaryAwayOperation.mailDecision.shouldWrite,
                residents[0].ordinaryAwayOperation.mailDecision.shouldWrite, 'frozen plan saved before AI');
        })
    });
    vm.runInContext(extract('                const isPhysicalAwayMailboxRow =', '                const getDeliveredPhysicalAwayMailCountForOperationalDay =') +
        qualificationSlice + deferredSlice + decisionsSlice + enforcementSlice + autonomySlice +
        '\nglobalThis.api = { prepare: prepareAwayMailConsideration, persist: persistAwayMailChanges, status: prepareStatusSyncAwayMailDecisions, reconcile: reconcileOrdinaryAwayAutonomy };', ctx);
    const status = (cat = residents[0], carriedDecisions = {}) => ctx.api.status({
        presenceDirectives: { [cat.id]: 'DEPARTING_NOW' }, requestedCats: [cat], hallId: cat.hallId, carriedDecisions, now: new Clock()
    });
    return { ctx, owner, residents, events, requests, status, rolls: () => rollCalls, saved: () => durable,
        advance: ms => { now += ms; }, failSave: () => { works = false; }, allowSave: () => { works = true; },
        reconcile: () => ctx.api.reconcile(new Clock()) };
}
assert.equal(away.createMailDecision(rolls(20, 60), 20).shouldWrite, true);
assert.equal(away.createMailDecision(rolls(21), 20).shouldWrite, false);
assert.equal(away.normalizeMailDecision({ roll: null, shouldWrite: false }).roll, null);
assert.equal(away.normalizeMailDecision({ roll: null, shouldWrite: true }), null);
assert.equal(away.normalizeMailDecision({ shouldWrite: false }), null);
assert.throws(() => away.createMailDecision(rolls(1), 101));

let c = cadence();
// Invalid/no opportunity never rolls, grants or dispatches.
delete c.residents[0].nextAwayOpportunityAt;
assert.equal(c.status().telemachus.shouldWrite, false);
assert.equal(c.rolls(), 0); assert.equal(c.requests.length, 0);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined);
c.residents[0].curatorRoomPresence = { anchor: 'desk' };
const rejected = c.ctx.api.prepare(c.residents[0], 'gotham', 'op', new Date(t0));
assert.equal(rejected.decision.shouldWrite, false); assert.equal(c.rolls(), 0);
assert.equal(c.ctx.api.prepare(c.residents[1], 'wrong', 'op', new Date(t0)).decision.shouldWrite, false);

// Inspection alone freezes a draft without advancing the durable grant.
c = cadence();
const inspection = c.ctx.api.prepare(c.residents[0], 'gotham', `ordinary-away:telemachus:${t0 - 1}`, new Date(t0));
assert.equal(inspection.decision.shouldWrite, true);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined);
assert.equal(c.residents[0].awayMailConsideration, undefined);
assert.equal(c.requests.length, 0); assert.equal(c.events.length, 0);
assert.equal(c.status().telemachus.shouldWrite, true); assert.equal(c.rolls(), 2);

// Miss, repeated checks, save failure/retry, reload and cache identity.
c = cadence({ values: [21] }); c.failSave();
assert.equal(c.status(), null); assert.equal(c.rolls(), 1);
assert.equal(c.residents[0].awayMailConsideration, undefined);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined);
c.allowSave(); assert.equal(c.status().telemachus.shouldWrite, false);
assert.equal(c.status().telemachus.shouldWrite, false); assert.equal(c.rolls(), 1);
let reloaded = cadence({ saved: c.saved(), values: [] });
assert.equal(reloaded.status().telemachus.shouldWrite, false); assert.equal(reloaded.rolls(), 0);
assert.equal(reloaded.owner.lastAwayLetterGrantedAt, undefined);

// New positive qualification is not published on failed save; successful save
// owns the grant. A reused qualification never advances the clock.
c = cadence(); c.failSave();
assert.equal(c.status(), null); assert.equal(c.rolls(), 2);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined); assert.equal(c.requests.length, 0);
c.allowSave(); c.advance(60_000);
assert.equal(c.status().telemachus.shouldWrite, true);
const grant = c.owner.lastAwayLetterGrantedAt;
assert.equal(grant, new Date(t0 + 60_000).toISOString());
c.advance(hour);
assert.equal(c.status().telemachus.shouldWrite, true);
assert.equal(c.owner.lastAwayLetterGrantedAt, grant); assert.equal(c.rolls(), 2);
// Another resident's negative receipt is independent and remains negative after
// cooldown expiry and reload. A later real opportunity may receive a new roll.
assert.equal(c.status(c.residents[1]).zagreus.shouldWrite, false); assert.equal(c.rolls(), 2);
assert.equal(c.residents[1].awayMailConsideration.decision.roll, null);
assert.notEqual(c.residents[0].awayMailConsideration.opportunityId, c.residents[1].awayMailConsideration.opportunityId);
reloaded = cadence({ saved: c.saved(), values: [] }); reloaded.advance(9 * hour);
assert.equal(reloaded.status(reloaded.residents[1]).zagreus.shouldWrite, false);
assert.equal(reloaded.rolls(), 0); assert.equal(reloaded.owner.lastAwayLetterGrantedAt, grant);
reloaded.residents[1].nextAwayOpportunityAt = new Date(t0 + 9 * hour).toISOString();
reloaded.ctx.rollPercent = rolls(20, 61);
assert.equal(reloaded.status(reloaded.residents[1]).zagreus.shouldWrite, true);
assert.equal(reloaded.owner.lastAwayLetterGrantedAt, new Date(t0 + 9 * hour).toISOString());

// One Status request with two new departures authorizes at most one grant,
// saving the positive and blocked decisions atomically. Exact 8h allows a NEW event.
c = cadence();
const both = c.ctx.api.status({ presenceDirectives: { telemachus: 'DEPARTING_NOW', zagreus: 'DEPARTING_NOW' },
    requestedCats: c.residents, hallId: 'gotham', carriedDecisions: {}, now: new Date(t0) });
assert.equal(both.telemachus.shouldWrite, true); assert.equal(both.zagreus.shouldWrite, false);
assert.equal(c.rolls(), 2); assert.equal(c.events.length, 1);
c.advance(8 * hour);
c.residents[1].nextAwayOpportunityAt = new Date(t0 + 8 * hour).toISOString();
c.ctx.rollPercent = rolls(20, 61);
assert.equal(c.status(c.residents[1]).zagreus.shouldWrite, true);
assert.equal(c.owner.lastAwayLetterGrantedAt, new Date(t0 + 8 * hour).toISOString());

// Delivery time is a conservative reader only, never backfilled as a grant.
c = cadence({ values: [] }); c.owner.mailbox.push({ deliveredAt: new Date(t0 - hour).toISOString() });
assert.equal(c.status().telemachus.shouldWrite, false); assert.equal(c.rolls(), 0);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined);
// Old positive decisions remain valid under the new chance and cost no grant.
c = cadence({ values: [] });
assert.equal(c.status(c.residents[0], { telemachus: souvenirAtBoundary }).telemachus.shouldWrite, true);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined); assert.equal(c.rolls(), 0);

// Real ordinary reconciliation saves operation + frozen result + grant together.
c = cadence(); c.failSave();
assert.equal(c.reconcile(), false); assert.equal(c.requests.length, 0);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined);
assert.equal(c.residents[0].ordinaryAwayOperation, undefined);
c.allowSave(); assert.equal(c.reconcile(), true);
assert.equal(c.requests.length, 1); assert.equal(c.rolls(), 2);
assert.deepEqual(c.events, ['save', 'save', 'AI']);
const ordinaryGrant = c.owner.lastAwayLetterGrantedAt;
assert.equal(c.saved().user.lastAwayLetterGrantedAt, ordinaryGrant);
assert.ok(c.saved().cats[0].awayMailConsideration);
assert.match(c.requests[0].prompt, /shouldWrite=true/);
assert.doesNotMatch(c.requests[0].prompt, /PRIVATE_CHAT|PRIVATE_VOICE|PRIVATE_OWNER/);
assert.equal(c.reconcile(), false); assert.equal(c.requests.length, 1);
c.requests[0].reject(new Error('mock provider failure after successful grant'));
await new Promise(resolve => setImmediate(resolve));
assert.equal(c.owner.lastAwayLetterGrantedAt, ordinaryGrant);
assert.equal(c.status(c.residents[1]).zagreus.shouldWrite, false, 'no compensating departure grant');
c.advance(30 * 60_000); assert.equal(c.reconcile(), true);
assert.equal(c.requests.length, 2); assert.equal(c.rolls(), 2);
assert.equal(c.owner.lastAwayLetterGrantedAt, ordinaryGrant, 'planning retry does not extend grant');
const response = JSON.stringify({ ...basePlan([letter(attachment)]), residentId: 'telemachus' });
assert.equal(c.requests[1].options.validateResponse(response), true);
c.requests[1].resolve(response); await new Promise(resolve => setImmediate(resolve));
assert.equal(c.residents[0].isOut, true);
assert.equal(c.residents[0].ordinaryAwayOperation, null);
assert.equal(c.ctx.awayEpisodes.value.length, 1);
assert.equal(c.ctx.awayEpisodes.value[0].mailPlan.length, 1);
assert.equal(c.owner.lastAwayLetterGrantedAt, ordinaryGrant);
// Chance miss still starts ONE necessary combined Away plan, no letter request.
c = cadence({ values: [21] }); assert.equal(c.reconcile(), true);
assert.equal(c.requests.length, 1); assert.match(c.requests[0].prompt, /shouldWrite=false/);
assert.match(c.requests[0].prompt, /"mailPlan":\[\]/);
assert.equal(c.owner.lastAwayLetterGrantedAt, undefined);
c.requests[0].reject(new Error('mock cleanup')); await new Promise(resolve => setImmediate(resolve));

// Calendar date derives only from stored canonical time, never now/op-day.
const dateContext = vm.createContext({ parseLogicalDate });
vm.runInContext(extract('                const formatMailboxDate =', '                const getMailOperationalDayKey =') +
    '\nglobalThis.formatDate = formatMailboxDate;', dateContext);
const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
for (const sentAt of ['2026-10-05T18:20:00Z', '2026-10-04T18:20:00Z', '2025-12-31T23:48:00Z']) {
    const mail = { sentAt, deliveredAt: '2026-10-05T23:00:00Z', operationalDayKey: 'WRONG_DAY' };
    const expected = new Date(sentAt).toLocaleString(undefined, dateOptions);
    assert.equal(dateContext.formatDate(mail), expected);
    assert.equal(dateContext.formatDate(clone(mail)), expected);
}
assert.equal(dateContext.formatDate({ sentAt: 'invalid', deliveredAt: '2025-12-31T23:48:00Z' }),
    new Date('2025-12-31T23:48:00Z').toLocaleString(undefined, dateOptions));
assert.equal(dateContext.formatDate({ deliveryClaimedAt: '2025-12-31T23:48:00Z' }),
    new Date('2025-12-31T23:48:00Z').toLocaleString(undefined, dateOptions));
for (const sentAt of [null, '', undefined, 'invalid']) {
    assert.equal(dateContext.formatDate({ sentAt, date: '18:20', operationalDayKey: '2026-10-05' }), '18:20 · 日期未知');
}
assert.equal(dateContext.formatDate({ sentAt: t0 }), new Date(t0).toLocaleString(undefined, dateOptions));
assert.equal(dateContext.formatDate({ sentAt: 0 }), '日期未知');
assert.equal(dateContext.formatDate({}), '日期未知');
assert.equal((source.match(/checkMailboxLogic/g) || []).length, 1, 'dormant producer stays dormant');
console.log('T5 cadence/date: 20% boundary, 8h saved grant, no reroll, failed-save/provider boundaries, real departure planner, calendar date PASS');
