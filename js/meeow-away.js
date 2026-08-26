(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const away = Meeow.away = Meeow.away || {};

    let dependencies = null;

    const INITIAL_AWAY_OPPORTUNITY_MAX_MS = 12 * 60 * 60 * 1000;
    const RETURN_AWAY_OPPORTUNITY_MIN_MS = 6 * 60 * 60 * 1000;
    const RETURN_AWAY_OPPORTUNITY_MAX_MS = 24 * 60 * 60 * 1000;
    const RECENT_RETURN_CONTINUITY_MS = 30 * 60 * 1000;
    const AWAY_EPISODE_MIN_DURATION_MINUTES = 30;
    const AWAY_EPISODE_MAX_DURATION_MINUTES = 720;

    away.configure = (nextDependencies) => {
        dependencies = nextDependencies;
    };

    const cleanText = (value) => dependencies.cleanText(value);
    const parseLogicalDate = (value) => dependencies.parseLogicalDate(value);
    const getCatHallId = (cat) => dependencies.getCatHallId(cat);
    const isPermanentOut = (cat) => dependencies.isPermanentOut(cat);
    const addLog = (message, type) => dependencies.addLog(message, type);

    const getAwayActivityBeatCount = (durationMinutes) => {
        const duration = Number(durationMinutes) || 0;
        if (duration < 90) return 1;
        if (duration < 180) return 2;
        if (duration < 360) return 3;
        return 4;
    };

    const getAwayActivityTimingRules = (durationMinutes, beatCount = getAwayActivityBeatCount(durationMinutes)) => {
        const duration = Math.max(1, Number(durationMinutes) || 0);
        const gaps = Math.max(0, beatCount - 1);
        const preferredMargin = 10;
        const preferredSpacing = 10;
        const margin = Math.max(1, Math.min(preferredMargin, Math.floor((duration - gaps * preferredSpacing) / 2)));
        const spacing = gaps
            ? Math.max(1, Math.min(preferredSpacing, Math.floor((duration - margin * 2) / gaps)))
            : preferredSpacing;
        return { margin, spacing };
    };

    const getValidAwayArchiveNarrative = (value) => {
        if (typeof value !== 'string') return '';
        const narrative = cleanText(value);
        if (narrative.length < 80 || narrative.length > 360) return '';
        const chineseCharacters = (narrative.match(/[\u3400-\u9fff]/g) || []).length;
        if (chineseCharacters < 50) return '';
        const compact = narrative.replace(/[\s，。！？、；：,.!?;:'"“”‘’—-]/g, '').toLowerCase();
        if (/^(无|暂无|未知|空|none|null|n\/a|test|测试|占位|placeholder)(内容|记录|叙事|手记)?$/.test(compact)) return '';
        return narrative;
    };

    const normalizeEpisodes = (episodes) => (Array.isArray(episodes) ? episodes : [])
        .filter(episode => episode && typeof episode === 'object')
        .map(episode => {
            const departedAt = parseLogicalDate(episode.departedAt)?.toISOString() || '';
            const plannedReturnAt = parseLogicalDate(episode.plannedReturnAt)?.toISOString() || '';
            const rawActivityPlans = Array.isArray(episode.activityPlans)
                ? episode.activityPlans
                : (episode.activityPlan && typeof episode.activityPlan === 'object' ? [episode.activityPlan] : []);
            const activityPlans = rawActivityPlans.map(activityPlan => {
                const activityAt = parseLogicalDate(activityPlan?.activityAt)?.toISOString() || '';
                const hasValidActivity = activityAt &&
                    typeof activityPlan?.plannedResidentActivity === 'string' && activityPlan.plannedResidentActivity.trim() &&
                    typeof activityPlan?.publicTrace === 'string' && activityPlan.publicTrace.trim();
                return hasValidActivity ? {
                    activityAt,
                    plannedResidentActivity: cleanText(activityPlan.plannedResidentActivity),
                    publicTrace: cleanText(activityPlan.publicTrace),
                    state: activityPlan.state === 'materialized' ? 'materialized' : 'planned',
                    materializedAt: parseLogicalDate(activityPlan.materializedAt)?.toISOString() || null
                } : null;
            }).filter(Boolean).sort((a, b) => new Date(a.activityAt) - new Date(b.activityAt));
            return {
                id: String(episode.id || `away-episode-${departedAt || Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                residentId: String(episode.residentId || ''),
                hallId: String(episode.hallId || ''),
                departedAt,
                plannedReturnAt,
                destination: typeof episode.destination === 'string' ? cleanText(episode.destination) : '',
                plannedReturnStatus: typeof episode.plannedReturnStatus === 'string' ? cleanText(episode.plannedReturnStatus) : '',
                plannedArchiveNarrative: typeof episode.plannedArchiveNarrative === 'string' ? cleanText(episode.plannedArchiveNarrative) : '',
                activityPlans,
                mailPlan: (Array.isArray(episode.mailPlan) ? episode.mailPlan : [])
                    .filter(mail => mail && typeof mail === 'object')
                    .map(mail => ({
                        id: String(mail.id || `away-mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                        sendAt: parseLogicalDate(mail.sendAt)?.toISOString() || '',
                        content: cleanText(mail.content || ''),
                        attachment: mail.attachment && typeof mail.attachment === 'object' ? { ...mail.attachment } : null,
                        state: mail.state === 'delivered' || mail.state === 'cancelled' ? mail.state : 'planned',
                        deliveredAt: parseLogicalDate(mail.deliveredAt)?.toISOString() || null
                    }))
                    .filter(mail => mail.sendAt && mail.content),
                status: episode.status === 'completed' ? 'completed' : 'active',
                returnedAt: parseLogicalDate(episode.returnedAt)?.toISOString() || null,
                settledAt: parseLogicalDate(episode.settledAt)?.toISOString() || null,
                legacy: episode.legacy === true
            };
        })
        .filter(episode => episode.residentId && episode.hallId && episode.departedAt && episode.plannedReturnAt);

    const getActiveEpisode = (episodes, catOrId, now = new Date()) => {
        const id = String(typeof catOrId === 'object' ? catOrId?.id : catOrId || '');
        const timestamp = parseLogicalDate(now)?.getTime() || Date.now();
        return normalizeEpisodes(episodes).find(episode =>
            episode.residentId === id && episode.status === 'active' &&
            (parseLogicalDate(episode.plannedReturnAt)?.getTime() || 0) > timestamp
        ) || null;
    };

    const getRecentReturn = (episodes, catOrId, now = new Date()) => {
        const id = String(typeof catOrId === 'object' ? catOrId?.id : catOrId || '');
        const timestamp = parseLogicalDate(now)?.getTime() || Date.now();
        return normalizeEpisodes(episodes)
            .filter(episode => episode.residentId === id && episode.status === 'completed')
            .sort((a, b) => (parseLogicalDate(b.returnedAt)?.getTime() || 0) - (parseLogicalDate(a.returnedAt)?.getTime() || 0))
            .find(episode => {
                const returnedAt = parseLogicalDate(episode.returnedAt)?.getTime() || 0;
                const elapsed = timestamp - returnedAt;
                return elapsed >= 0 && elapsed <= RECENT_RETURN_CONTINUITY_MS;
            }) || null;
    };

    const getCompletedEpisodes = (episodes, catOrId) => {
        const id = String(typeof catOrId === 'object' ? catOrId?.id : catOrId || '');
        return normalizeEpisodes(episodes)
            .filter(episode => episode.residentId === id && episode.status === 'completed')
            .sort((a, b) => {
                const aTime = parseLogicalDate(a.returnedAt || a.plannedReturnAt)?.getTime() || 0;
                const bTime = parseLogicalDate(b.returnedAt || b.plannedReturnAt)?.getTime() || 0;
                return bTime - aTime;
            });
    };

    const getAwayOpportunityAt = (cat) => parseLogicalDate(cat?.nextAwayOpportunityAt);
    const scheduleAwayOpportunity = (cat, baseTime = new Date(), minDelayMs = 0, maxDelayMs = INITIAL_AWAY_OPPORTUNITY_MAX_MS) => {
        if (!cat || cat.isOut || isPermanentOut(cat)) return null;
        const base = parseLogicalDate(baseTime) || new Date();
        const minDelay = Math.max(0, Number(minDelayMs) || 0);
        const maxDelay = Math.max(minDelay, Number(maxDelayMs) || minDelay);
        const offset = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
        const opportunityAt = new Date(base.getTime() + offset);
        cat.nextAwayOpportunityAt = opportunityAt.toISOString();
        return opportunityAt;
    };

    const ensureAwayOpportunity = (cat, episodes, now = new Date()) => {
        if (!cat || isPermanentOut(cat)) return null;
        if (cat.isOut || getActiveEpisode(episodes, cat, now)) {
            cat.nextAwayOpportunityAt = null;
            return null;
        }
        return getAwayOpportunityAt(cat) || scheduleAwayOpportunity(cat, now);
    };

    const ensureHomeAwayOpportunities = (cats, episodes, now = new Date()) => {
        (cats || []).forEach(cat => ensureAwayOpportunity(cat, episodes, now));
    };

    const schedulePostReturnAwayOpportunity = (cat, logicalReturnAt) =>
        scheduleAwayOpportunity(cat, logicalReturnAt, RETURN_AWAY_OPPORTUNITY_MIN_MS, RETURN_AWAY_OPPORTUNITY_MAX_MS);

    const buildDepartureSchedule = ({ hallId, hallCats, requestedCats, episodes, departureCandidateIds = [], now = new Date(), excluded = [] }) => {
        const candidateIds = new Set((departureCandidateIds || []).map(id => String(id)));
        const directives = {};
        const due = [];
        const blocked = [...excluded];
        const homeCount = (hallCats || []).filter(cat => !cat.isOut && !isPermanentOut(cat)).length;
        (requestedCats || []).forEach(cat => {
            if (!cat || cat.isOut || isPermanentOut(cat)) return;
            const id = String(cat.id);
            directives[id] = 'HOME';
            const opportunityAt = ensureAwayOpportunity(cat, episodes, now);
            if (!opportunityAt || opportunityAt > now) return;
            due.push({ cat, id, opportunityAt });
            if (!candidateIds.has(id)) blocked.push(`${id}:active-interaction`);
            else if (getRecentReturn(episodes, cat, now)) blocked.push(`${id}:recent-return`);
        });
        const eligibleDue = due.filter(entry => candidateIds.has(entry.id) && !getRecentReturn(episodes, entry.cat, now));
        let selected = null;
        if (eligibleDue.length) {
            if (homeCount < 3) {
                eligibleDue.forEach(entry => blocked.push(`${entry.id}:minimum-two-at-home`));
            } else {
                selected = [...eligibleDue].sort((a, b) =>
                    a.opportunityAt.getTime() - b.opportunityAt.getTime() || a.id.localeCompare(b.id)
                )[0];
                directives[selected.id] = 'DEPARTING_NOW';
            }
        }
        return {
            hallId,
            directives,
            dueIds: due.map(entry => entry.id),
            selectedIds: selected ? [selected.id] : [],
            blocked
        };
    };

    const validatePlan = (plan, expectedId, mode) => {
        if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
        if (String(plan.residentId || '') !== String(expectedId) || plan.mode !== mode) return null;
        const duration = Number(plan.plannedDurationMinutes);
        if (!Number.isInteger(duration) || duration < AWAY_EPISODE_MIN_DURATION_MINUTES || duration > AWAY_EPISODE_MAX_DURATION_MINUTES) return null;
        if (mode === 'legacy-continuation') {
            if (plan.destination || plan.plannedResidentActivity || plan.publicTrace || plan.plannedActivities || plan.plannedArchiveNarrative || plan.plannedReturnStatus || (Array.isArray(plan.mailPlan) && plan.mailPlan.length)) return null;
            return { residentId: String(expectedId), mode, plannedDurationMinutes: duration };
        }
        const destination = cleanText(plan.destination || '');
        const plannedReturnStatus = typeof plan.plannedReturnStatus === 'string' ? cleanText(plan.plannedReturnStatus) : '';
        const plannedArchiveNarrative = getValidAwayArchiveNarrative(plan.plannedArchiveNarrative);
        const expectedBeatCount = getAwayActivityBeatCount(duration);
        const timing = getAwayActivityTimingRules(duration, expectedBeatCount);
        if (!destination || !plannedArchiveNarrative || !Array.isArray(plan.plannedActivities) || plan.plannedActivities.length !== expectedBeatCount) return null;
        const plannedActivities = plan.plannedActivities.map(activity => {
            if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return null;
            const afterMinutes = Number(activity.afterMinutes);
            const plannedResidentActivity = cleanText(activity.plannedResidentActivity || '');
            const publicTrace = cleanText(activity.publicTrace || '');
            if (!Number.isInteger(afterMinutes) || !plannedResidentActivity || !publicTrace) return null;
            return { afterMinutes, plannedResidentActivity, publicTrace };
        });
        if (plannedActivities.some(activity => !activity)) return null;
        for (let index = 0; index < plannedActivities.length; index++) {
            const activity = plannedActivities[index];
            if (activity.afterMinutes < timing.margin || activity.afterMinutes > duration - timing.margin) return null;
            if (index > 0 && activity.afterMinutes - plannedActivities[index - 1].afterMinutes < timing.spacing) return null;
        }
        const rawMailPlan = plan.mailPlan === undefined ? [] : plan.mailPlan;
        if (!Array.isArray(rawMailPlan) || rawMailPlan.length > 1) return null;
        const mailPlan = rawMailPlan.map(mail => {
            if (!mail || typeof mail !== 'object' || Array.isArray(mail)) return null;
            const sendAfterMinutes = Number(mail.sendAfterMinutes);
            const content = cleanText(mail.content || '');
            if (!Number.isInteger(sendAfterMinutes) || sendAfterMinutes <= plannedActivities[0].afterMinutes || sendAfterMinutes >= duration || !content) return null;
            const attachment = mail.attachment === null || mail.attachment === undefined ? null : mail.attachment;
            if (attachment !== null && (typeof attachment !== 'object' || Array.isArray(attachment) || !cleanText(attachment.name || '') || !cleanText(attachment.icon || '') || !cleanText(attachment.desc || ''))) return null;
            return {
                sendAfterMinutes,
                content,
                attachment: attachment ? { name: cleanText(attachment.name), icon: cleanText(attachment.icon), desc: cleanText(attachment.desc) } : null
            };
        });
        if (mailPlan.some(mail => !mail)) return null;
        return {
            residentId: String(expectedId), mode, plannedDurationMinutes: duration,
            destination, plannedActivities,
            plannedReturnStatus: plannedReturnStatus.length <= 80 ? plannedReturnStatus : '',
            plannedArchiveNarrative,
            mailPlan
        };
    };

    const indexPlans = (awayPlans) => (Array.isArray(awayPlans) ? awayPlans : []).reduce((index, plan) => {
        const id = String(plan?.residentId || '');
        if (!id) return index;
        if (!index.has(id)) index.set(id, []);
        index.get(id).push(plan);
        return index;
    }, new Map());

    const classifyPlan = (plansByResident, residentId, mode) => {
        const candidates = (plansByResident.get(String(residentId)) || []).filter(plan => plan?.mode === mode);
        if (!candidates.length) return { candidates, plan: null, valid: false, reason: `missing ${mode} plan` };
        if (candidates.length !== 1) return { candidates, plan: null, valid: false, reason: `duplicate ${mode} plans` };
        const plan = validatePlan(candidates[0], residentId, mode);
        return plan
            ? { candidates, plan, valid: true, reason: '' }
            : { candidates, plan: null, valid: false, reason: 'existing validator rejected plan' };
    };

    const createEpisode = (cat, plan, departedAt = new Date()) => {
        const departure = parseLogicalDate(departedAt) || new Date();
        const durationMs = Number(plan.plannedDurationMinutes) * 60 * 1000;
        return {
            id: `away-episode-${String(cat.id)}-${departure.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
            residentId: String(cat.id),
            hallId: getCatHallId(cat),
            departedAt: departure.toISOString(),
            plannedReturnAt: new Date(departure.getTime() + durationMs).toISOString(),
            destination: cleanText(plan.destination || ''),
            plannedReturnStatus: cleanText(plan.plannedReturnStatus || ''),
            plannedArchiveNarrative: cleanText(plan.plannedArchiveNarrative || ''),
            activityPlans: plan.mode === 'departure' ? (plan.plannedActivities || []).map(activity => ({
                activityAt: new Date(departure.getTime() + Number(activity.afterMinutes) * 60 * 1000).toISOString(),
                plannedResidentActivity: cleanText(activity.plannedResidentActivity || ''),
                publicTrace: cleanText(activity.publicTrace || ''),
                state: 'planned',
                materializedAt: null
            })) : [],
            mailPlan: (plan.mailPlan || []).map(mail => ({
                id: `away-mail-${String(cat.id)}-${departure.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
                sendAt: new Date(departure.getTime() + Number(mail.sendAfterMinutes) * 60 * 1000).toISOString(),
                content: cleanText(mail.content),
                attachment: mail.attachment ? { ...mail.attachment } : null,
                state: 'planned',
                deliveredAt: null
            })),
            status: 'active',
            returnedAt: null,
            settledAt: null,
            legacy: plan.mode === 'legacy-continuation'
        };
    };

    const getUsablePlannedReturnStatus = (episode) => {
        const status = cleanText(episode?.plannedReturnStatus || '');
        return status && status.length <= 80 ? status : '';
    };

    const materializeActivity = (event, now, hooks) => {
        const { episode, plan, at, beatIndex, beatCount } = event;
        const cat = (hooks.cats || []).find(item => String(item.id) === String(episode.residentId));
        if (!cat || !plan || plan.state === 'materialized') return false;
        if (hooks.onMaterializeActivity?.({ cat, episode, plan, logicalAt: at, reconciledAt: now, beatIndex, beatCount }) === false) return false;
        plan.state = 'materialized';
        plan.materializedAt = now.toISOString();
        addLog(`AWAY EPISODE ACTIVITY MATERIALIZED: episode=${episode.id}; resident=${episode.residentId}; beat=${beatIndex + 1}/${beatCount}; logicalAt=${at.toISOString()}`, 'sent');
        return true;
    };

    const settleReturn = (episode, eventAt, now, hooks) => {
        const cat = (hooks.cats || []).find(item => String(item.id) === String(episode.residentId));
        if (!cat || episode.status !== 'active') return false;
        const logicalReturnAt = parseLogicalDate(eventAt) || new Date();
        const settledPromptly = now.getTime() - logicalReturnAt.getTime() <= RECENT_RETURN_CONTINUITY_MS;
        const returnStatus = settledPromptly
            ? (getUsablePlannedReturnStatus(episode) || '刚回到馆内，正在门边安静整理前爪。')
            : '正在馆内安静休息，偶尔整理前爪。';
        cat.isOut = false;
        if (hooks.onSettleReturn?.({ cat, episode, logicalReturnAt, reconciledAt: now, returnStatus }) === false) return false;
        (episode.mailPlan || []).forEach(mail => {
            if (mail.state === 'planned') mail.state = 'cancelled';
        });
        episode.status = 'completed';
        episode.returnedAt = logicalReturnAt.toISOString();
        episode.settledAt = now.toISOString();
        schedulePostReturnAwayOpportunity(cat, logicalReturnAt);
        hooks.onDiaryReady?.(episode);
        addLog(`AWAY EPISODE RETURN SETTLED: episode=${episode.id}; resident=${episode.residentId}; returnedAt=${episode.returnedAt}`, 'sent');
        return true;
    };

    const reconcileEpisodes = ({ episodes, cats, reconciliationTime = new Date(), onMaterializeActivity, onDeliverMail, onSettleReturn, onDiaryReady } = {}) => {
        const now = parseLogicalDate(reconciliationTime) || new Date();
        const normalizedEpisodes = normalizeEpisodes(episodes);
        const dueEvents = [];
        const returnedResidentIds = [];
        normalizedEpisodes.forEach(episode => {
            if (episode.status !== 'active') return;
            (episode.activityPlans || []).forEach((plan, beatIndex, allPlans) => {
                const activityAt = parseLogicalDate(plan?.activityAt);
                if (plan?.state === 'planned' && activityAt && activityAt <= now) {
                    dueEvents.push({ type: 'activity', at: activityAt, episode, plan, beatIndex, beatCount: allPlans.length });
                }
            });
            (episode.mailPlan || []).forEach(mail => {
                const sendAt = parseLogicalDate(mail.sendAt);
                if (mail.state === 'planned' && sendAt && sendAt <= now) dueEvents.push({ type: 'mail', at: sendAt, episode, mail });
            });
            const returnAt = parseLogicalDate(episode.plannedReturnAt);
            if (returnAt && returnAt <= now) dueEvents.push({ type: 'return', at: returnAt, episode });
        });
        const rank = { activity: 0, mail: 1, return: 2 };
        dueEvents.sort((a, b) => a.at - b.at || rank[a.type] - rank[b.type]);
        const hooks = { cats: Array.isArray(cats) ? cats : [], onMaterializeActivity, onSettleReturn, onDiaryReady };
        dueEvents.forEach(event => {
            if (event.type === 'activity') materializeActivity(event, now, hooks);
            else if (event.type === 'mail') onDeliverMail?.(event.episode, event.mail, event.at, now);
            else if (event.type === 'return' && settleReturn(event.episode, event.at, now, hooks)) returnedResidentIds.push(String(event.episode.residentId));
        });
        ensureHomeAwayOpportunities(hooks.cats, normalizedEpisodes, now);
        return { episodes: normalizedEpisodes, count: dueEvents.length, returnedResidentIds };
    };

    Object.assign(away, {
        normalizeEpisodes,
        getActiveEpisode,
        getRecentReturn,
        getCompletedEpisodes,
        buildDepartureSchedule,
        validatePlan,
        indexPlans,
        classifyPlan,
        createEpisode,
        reconcileEpisodes
    });
}(window));
