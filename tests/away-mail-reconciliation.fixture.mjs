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
const createDeliveryHarness = ({ user, cats, halls, notifications, logs, hasPhysicalCapacity = () => true, nextDeliveryDay = value => new Date(new Date(value).getTime() + 24 * 60 * 60 * 1000), isThreadPrivate = episode => episode?.provenance?.origin === 'life-thread' && episode.provenance.visibility === 'thread-private' }) => new Function('ctx', `
    const { user, cats, halls, parseLogicalDate, getOperationalDayKey, cleanText, getCatHallId,
        showNotification, addLog, hasMailCapacityForLogicalTime, hasMailSpacingAt,
        hasPhysicalAwayMailDeliveryCapacity, getNextOperationalDayStart,
        getDeliveredPhysicalAwayMailCountForOperationalDay, isLifeThreadAwayEpisode,
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
    hasPhysicalAwayMailDeliveryCapacity: hasPhysicalCapacity,
    getNextOperationalDayStart: nextDeliveryDay,
    getDeliveredPhysicalAwayMailCountForOperationalDay: () => (user.mailbox || []).length,
    isLifeThreadAwayEpisode: isThreadPrivate,
    reservePlannedAwayMailTime: () => { throw new Error('fixture should not defer mail'); },
    getResidentPublicName: cat => cat.humanName || cat.name
});

const cat = { id: 'bruce', name: 'Bruce', humanName: 'Bruce', hallId: 'gotham' };
const hall = { id: 'gotham', name: 'Gotham' };
const scheduledAt = '2026-08-31T10:00:00.000Z';
const deliveredAt = '2026-08-31T10:06:00.000Z';
const createEpisode = (id, status = 'active', provenance = null) => ({
    id, residentId: cat.id, hallId: hall.id, status,
    departedAt: '2026-08-31T08:00:00.000Z',
    plannedReturnAt: '2026-08-31T18:00:00.000Z',
    destination: 'private destination', activityPlans: [{ plannedResidentActivity: 'private activity' }],
    ...(provenance ? { provenance } : {})
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

// Physical delivery is globally capped at four for the operational day. Excess
// due letters retain their original sendAt and wait for the next day.
{
    const user = { mailbox: [], dailyMailCount: 0, lastMailDate: '', lastMailAt: 0, lastMailSenderId: null };
    const notifications = [], logs = [];
    const nextDay = new Date('2026-09-01T03:00:00.000Z');
    const { deliverPlannedAwayMail } = createDeliveryHarness({
        user, cats: [cat], halls: [hall], notifications, logs,
        hasPhysicalCapacity: () => user.mailbox.length < 4,
        nextDeliveryDay: () => nextDay
    });
    const mails = Array.from({ length: 6 }, (_, index) => ({
        episode: createEpisode(`episode-cap-${index}`),
        mail: { ...createMail(`episode-cap-${index}:mail:primary`), sendAt: `2026-08-${25 + index}T10:00:00.000Z` }
    }));
    mails.forEach(({ episode, mail }) => deliverPlannedAwayMail(episode, mail, new Date(mail.sendAt), new Date('2026-08-31T20:00:00.000Z')));
    assert.equal(user.mailbox.length, 4);
    assert.equal(notifications.length, 4);
    mails.slice(4).forEach(({ mail }) => {
        assert.equal(mail.state, 'planned');
        assert.equal(mail.nextDeliveryAttemptAt, nextDay.toISOString());
        assert.match(mail.sendAt, /^2026-08-/);
    });
}

// Thread-private planned mail is never materialized as a mailbox row.
{
    const user = { mailbox: [], dailyMailCount: 0, lastMailDate: '', lastMailAt: 0, lastMailSenderId: null };
    const notifications = [], logs = [];
    const { deliverPlannedAwayMail } = createDeliveryHarness({ user, cats: [cat], halls: [hall], notifications, logs });
    const episode = { ...createEpisode('episode-thread-private'), provenance: { origin: 'life-thread', visibility: 'thread-private' } };
    const mail = createMail('episode-thread-private:mail:primary');
    assert.equal(deliverPlannedAwayMail(episode, mail, new Date(scheduledAt), new Date(deliveredAt)), false);
    assert.equal(mail.state, 'cancelled');
    assert.equal(user.mailbox.length, 0);
    assert.equal(notifications.length, 0);
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

// Due mail order is stable by original sendAt and then mail ID; a deferred
// attempt is skipped until its explicit retry time.
{
    const delivered = [];
    awayLifecycle.reconcileEpisodes({
        episodes: [
            { ...createEpisode('episode-order-a'), mailPlan: [{ id: 'z-mail', sendAt: scheduledAt, content: 'Z', state: 'planned' }] },
            { ...createEpisode('episode-order-b'), mailPlan: [{ id: 'a-mail', sendAt: scheduledAt, content: 'A', state: 'planned' }] },
            { ...createEpisode('episode-order-deferred'), mailPlan: [{ id: 'later-mail', sendAt: scheduledAt, nextDeliveryAttemptAt: '2026-09-01T10:00:00.000Z', content: 'Later', state: 'planned' }] }
        ],
        cats: [cat], reconciliationTime: new Date('2026-08-31T12:00:00.000Z'),
        onDeliverMail: (_episode, mail) => delivered.push(mail.id)
    });
    assert.deepEqual(delivered, ['a-mail', 'z-mail']);
}

// Missing legacy mail IDs normalize to one stable episode-owned slot; existing IDs stay intact.
{
    const normalized = awayLifecycle.normalizeEpisodes([{ id: 'episode-legacy', residentId: cat.id, hallId: hall.id, departedAt: '2026-08-31T08:00:00.000Z', plannedReturnAt: '2026-08-31T09:00:00.000Z', mailPlan: [{ sendAt: scheduledAt, content: 'Legacy letter' }], status: 'active' }]);
    assert.equal(normalized[0].mailPlan[0].id, 'episode-legacy:mail:primary');
    const preserved = awayLifecycle.normalizeEpisodes([{ id: 'episode-preserved', residentId: cat.id, hallId: hall.id, departedAt: '2026-08-31T08:00:00.000Z', plannedReturnAt: '2026-08-31T09:00:00.000Z', mailPlan: [{ id: 'existing-mail-id', sendAt: scheduledAt, content: 'Existing letter' }], status: 'active' }]);
    assert.equal(preserved[0].mailPlan[0].id, 'existing-mail-id');
}

console.log('Away mail reconciliation fixture: PASS');
