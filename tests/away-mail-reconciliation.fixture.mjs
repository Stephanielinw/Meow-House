import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const parseLogicalDate = value => {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const getOperationalDayKey = value => parseLogicalDate(value).toISOString().slice(0, 10);

const awayContext = vm.createContext({ window: {}, Date, Math, console });
vm.runInContext(readFileSync(new URL('../js/meeow-away.js', import.meta.url), 'utf8'), awayContext);
awayContext.window.Meeow.away.configure({
    cleanText, parseLogicalDate, getCatHallId: cat => cat.hallId,
    isPermanentOut: () => false, isResidentInHall: cat => !cat.isOut,
    addLog: () => {}
});
const awayLifecycle = awayContext.window.Meeow.away;

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const deliveryStart = indexSource.indexOf('                const recordDeliveredMail =');
const deliveryEnd = indexSource.indexOf('                const generateMail =', deliveryStart);
assert.ok(deliveryStart >= 0 && deliveryEnd > deliveryStart, 'Away mail delivery slice must exist');
const deliverySlice = indexSource.slice(deliveryStart, deliveryEnd);
const createDeliveryHarness = ({ user, cats, halls, notifications, logs }) => new Function('ctx', `
    const { user, cats, halls, parseLogicalDate, getOperationalDayKey, cleanText, getCatHallId,
        showNotification, addLog, hasMailCapacityForLogicalTime, hasMailSpacingAt,
        reservePlannedAwayMailTime, getResidentPublicName } = ctx;
    ${deliverySlice}
    return { deliverPlannedAwayMail };
`)({
    user, cats: { value: cats }, halls: { value: halls }, parseLogicalDate, getOperationalDayKey, cleanText,
    getCatHallId: cat => cat.hallId,
    showNotification: (...args) => notifications.push(args),
    addLog: (...args) => logs.push(args),
    hasMailCapacityForLogicalTime: () => true,
    hasMailSpacingAt: () => true,
    reservePlannedAwayMailTime: () => { throw new Error('fixture should not defer mail'); },
    getResidentPublicName: cat => cat.humanName || cat.name
});

const cat = { id: 'bruce', name: 'Bruce', humanName: 'Bruce', hallId: 'gotham' };
const hall = { id: 'gotham', name: 'Gotham' };
const scheduledAt = '2026-08-31T10:00:00.000Z';
const deliveredAt = '2026-08-31T10:06:00.000Z';
const createEpisode = (id, status = 'active') => ({
    id, residentId: cat.id, hallId: hall.id, status,
    destination: 'private destination', activityPlans: [{ plannedResidentActivity: 'private activity' }],
    provenance: { origin: 'life-thread', threadId: 'hidden-thread' }
});
const createMail = (id, state = 'planned') => ({
    id, sendAt: scheduledAt, content: 'A purpose-blind physical letter.', attachment: null, state, deliveredAt: null
});

// Due persisted episode: successful delivery has one authoritative mailbox row.
{
    const user = { mailbox: [], dailyMailCount: 0, lastMailDate: '', lastMailAt: 0, lastMailSenderId: null };
    const notifications = [], logs = [];
    const { deliverPlannedAwayMail } = createDeliveryHarness({ user, cats: [cat], halls: [hall], notifications, logs });
    const episode = createEpisode('episode-normal');
    const mail = createMail('episode-normal:mail:primary');
    assert.equal(deliverPlannedAwayMail(episode, mail, new Date(scheduledAt), new Date(deliveredAt)), true);
    assert.equal(user.mailbox.length, 1);
    assert.equal(mail.state, 'delivered');
    assert.equal(mail.deliveredAt, deliveredAt);
    assert.equal(user.mailbox[0].sentAt, scheduledAt);
    assert.equal(user.mailbox[0].deliveredAt, deliveredAt);
    assert.equal(user.mailbox[0].plannedMailId, mail.id);
    assert.equal(notifications.length, 1);
    assert.equal('provenance' in user.mailbox[0], false);
    assert.equal('destination' in user.mailbox[0], false);
    assert.equal('activityPlans' in user.mailbox[0], false);
    assert.equal(deliverPlannedAwayMail(episode, mail, new Date(scheduledAt), new Date('2026-08-31T11:00:00.000Z')), false);
    assert.equal(user.mailbox.length, 1);
}

// Exact crash recovery: mailbox was committed, but the episode mail remained planned.
{
    const priorDelivery = '2026-08-31T10:07:00.000Z';
    const mail = createMail('episode-recovery:mail:primary');
    mail.deliveredAt = '2026-08-31T10:08:00.000Z';
    const user = { mailbox: [{ plannedMailId: mail.id, sentAt: scheduledAt, deliveredAt: priorDelivery }], dailyMailCount: 1, lastMailDate: '2026-08-31', lastMailAt: Date.parse(scheduledAt), lastMailSenderId: cat.id };
    const notifications = [], logs = [];
    const { deliverPlannedAwayMail } = createDeliveryHarness({ user, cats: [cat], halls: [hall], notifications, logs });
    assert.equal(deliverPlannedAwayMail(createEpisode('episode-recovery'), mail, new Date(scheduledAt), new Date('2026-08-31T12:00:00.000Z')), true);
    assert.equal(mail.state, 'delivered');
    assert.equal(mail.deliveredAt, priorDelivery);
    assert.equal(user.mailbox.length, 1);
    assert.equal(notifications.length, 0);
}

// A completed episode may deliver its guaranteed deferred post-return letter.
{
    const user = { mailbox: [], dailyMailCount: 0, lastMailDate: '', lastMailAt: 0, lastMailSenderId: null };
    const notifications = [], logs = [];
    const { deliverPlannedAwayMail } = createDeliveryHarness({ user, cats: [cat], halls: [hall], notifications, logs });
    const mail = createMail('episode-deferred:mail:primary');
    assert.equal(deliverPlannedAwayMail(createEpisode('episode-deferred', 'completed'), mail, new Date(scheduledAt), new Date(deliveredAt)), true);
    assert.equal(user.mailbox.length, 1);
    assert.equal(mail.state, 'delivered');
}

// No planned mail means shouldWrite=false cannot deliver anything during reconciliation.
{
    let deliveredCount = 0;
    awayLifecycle.reconcileEpisodes({
        episodes: [{ id: 'episode-no-mail', residentId: cat.id, hallId: hall.id, departedAt: '2026-08-31T08:00:00.000Z', plannedReturnAt: '2026-08-31T09:00:00.000Z', mailDecision: { roll: 99, shouldWrite: false }, mailPlan: [], status: 'completed' }],
        cats: [cat], reconciliationTime: new Date('2026-08-31T12:00:00.000Z'),
        onDeliverMail: () => { deliveredCount += 1; }
    });
    assert.equal(deliveredCount, 0);
}

// Missing legacy mail IDs normalize to one stable episode-owned slot; existing IDs stay intact.
{
    const normalized = awayLifecycle.normalizeEpisodes([{ id: 'episode-legacy', residentId: cat.id, hallId: hall.id, departedAt: '2026-08-31T08:00:00.000Z', plannedReturnAt: '2026-08-31T09:00:00.000Z', mailPlan: [{ sendAt: scheduledAt, content: 'Legacy letter' }], status: 'active' }]);
    assert.equal(normalized[0].mailPlan[0].id, 'episode-legacy:mail:primary');
    const preserved = awayLifecycle.normalizeEpisodes([{ id: 'episode-preserved', residentId: cat.id, hallId: hall.id, departedAt: '2026-08-31T08:00:00.000Z', plannedReturnAt: '2026-08-31T09:00:00.000Z', mailPlan: [{ id: 'existing-mail-id', sendAt: scheduledAt, content: 'Existing letter' }], status: 'active' }]);
    assert.equal(preserved[0].mailPlan[0].id, 'existing-mail-id');
}

console.log('Away mail reconciliation fixture: PASS');
