(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const definitions = Object.freeze({
        sleep: Object.freeze({ id: 'sleep', postures: Object.freeze(['lying']), duration: Object.freeze([60000, 180000]), weight: 2, stationary: true, label: '正在睡觉' }),
        rest: Object.freeze({ id: 'rest', postures: Object.freeze(['lying', 'crouching']), duration: Object.freeze([30000, 90000]), weight: 3, stationary: true, label: '正在休息' }),
        'sit-idle': Object.freeze({ id: 'sit-idle', postures: Object.freeze(['sitting']), duration: Object.freeze([20000, 60000]), weight: 3, stationary: true, label: '正坐着发呆' }),
        observe: Object.freeze({ id: 'observe', postures: Object.freeze(['standing', 'sitting', 'crouching']), duration: Object.freeze([20000, 50000]), weight: 3, stationary: true, label: '正在四处看看' }),
        groom: Object.freeze({ id: 'groom', postures: Object.freeze(['sitting', 'crouching', 'lying']), duration: Object.freeze([15000, 40000]), weight: 2, stationary: true, label: '正在舔毛' }),
        roam: Object.freeze({ id: 'roam', postures: Object.freeze(['standing']), duration: null, weight: 4, stationary: false, label: '正在房间里走动' })
    });
    // Only the original connected floor/rug domain has ordinary ambient
    // affordances. Authored furniture surfaces require explicit transitions.
    const surfaceCapabilities = Object.freeze({
        'curator-floor': Object.freeze(['ordinary-stationary', 'roam-origin', 'roam-destination']),
        'curator-rug-surface': Object.freeze(['ordinary-stationary', 'roam-origin', 'roam-destination'])
    });
    const capabilityFor = surfaceId => surfaceCapabilities[String(surfaceId || '')] || Object.freeze([]);
    const buildCandidates = ({ surfaceId, residentPresent = true, ambientOwnership = true,
        navigationAvailable = true, afterRoam = false, recent = [], excluded = [], interactions = [],
        capabilities = capabilityFor(surfaceId) } = {}) => {
        const exclusions = new Set(excluded);
        return Object.values(definitions).map(definition => {
            const blockers = [];
            if (!residentPresent) blockers.push('resident-not-present');
            if (!ambientOwnership) blockers.push('higher-authority-owner');
            if (exclusions.has(definition.id)) blockers.push('preparing-failed');
            const required = definition.stationary ? 'ordinary-stationary' : 'roam-origin';
            if (!capabilities.includes(required)) blockers.push('unsupported-surface');
            if (!definition.stationary && !navigationAvailable) blockers.push('no-navigation-domain');
            if (!definition.stationary && afterRoam) blockers.push('roam-after-roam');
            const recentModifier = (recent.at(-1) === definition.id ? 0.35 : 1) *
                (recent.at(-2) === definition.id ? 0.65 : 1);
            const eligible = blockers.length === 0;
            return Object.freeze({
                behaviorId: definition.id, eligible, blockers: Object.freeze(blockers),
                furnitureTargets: Object.freeze(eligible && ['sleep', 'rest', 'sit-idle', 'observe'].includes(definition.id)
                    ? interactions.filter(item => item.behaviors?.includes(definition.id) &&
                        (item.postures || [item.posture]).some(pose => definition.postures.includes(pose)))
                        .map(item => item.slotId) : []),
                baseWeight: definition.weight,
                modifiers: Object.freeze({ recentHistory: recentModifier }),
                effectiveWeight: eligible ? definition.weight * recentModifier : 0,
                allowedPostures: definition.postures,
                surfaceId: String(surfaceId || ''), targetRequired: !definition.stationary,
                targetKind: definition.stationary ? null : 'destination',
                requiredAffordance: required,
                claimRequirement: definition.stationary ? null : 'destination-reservation',
                preparationCost: definition.stationary ? 'visual' : 'route',
                interruptionPolicy: 'higher-authority-or-context-invalid',
                contextCapability: Object.freeze([])
            });
        });
    };
    const hash = value => {
        let result = 2166136261;
        for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
        return result >>> 0;
    };
    const weightedPick = (rows, seed) => {
        const total = rows.reduce((sum, row) => sum + row.weight, 0);
        if (!(total > 0)) return null;
        let roll = hash(seed) / 0x100000000 * total;
        for (const row of rows) { roll -= row.weight; if (roll < 0) return row.id; }
        return rows.at(-1).id;
    };
    const initialBehavior = pose => ({ lying: 'rest', crouching: 'rest', sitting: 'sit-idle', standing: 'observe' })[pose] || null;
    const selectBehavior = ({ residentId, cycle, recent = [], afterRoam = false, available = () => true }) => {
        const rows = Object.values(definitions).filter(definition =>
            available(definition) && !(afterRoam && definition.id === 'roam')).map(definition => ({
                id: definition.id,
                weight: definition.weight * (recent.at(-1) === definition.id ? 0.35 : 1) *
                    (recent.at(-2) === definition.id ? 0.65 : 1)
            }));
        return weightedPick(rows, `${residentId}:${cycle}:behavior`);
    };
    const selectCandidate = (candidates, residentId, cycle) =>
        weightedPick((Array.isArray(candidates) ? candidates : [])
            .filter(candidate => candidate?.eligible && candidate.effectiveWeight > 0)
            .map(candidate => ({ id: candidate.behaviorId, weight: candidate.effectiveWeight })),
        residentId + ':' + cycle + ':behavior');
    const selectPosture = ({ residentId, cycle, behaviorId, current = '', recent = [], available = () => true }) => {
        const definition = definitions[behaviorId];
        if (!definition) return null;
        const rows = definition.postures.filter(available).map(id => ({ id,
            weight: (id === current ? 1.4 : 1) * (recent.at(-1) === id ? 0.8 : 1) *
                (recent.at(-2) === id ? 0.9 : 1) }));
        return weightedPick(rows, `${residentId}:${cycle}:${behaviorId}:pose`);
    };
    const hallRhythmRanges = Object.freeze({ sleep: Object.freeze([180000, 600000]), rest: Object.freeze([90000, 240000]),
        'sit-idle': Object.freeze([60000, 150000]), observe: Object.freeze([45000, 120000]) });
    const durationFor = (residentId, cycle, behaviorId, options = {}) => {
        const calibrated = options.hallPresence === true && hallRhythmRanges[behaviorId];
        const range = calibrated || definitions[behaviorId]?.duration;
        if (!range) return null;
        const duration = range[0] + hash(`${residentId}:${cycle}:${behaviorId}:duration`) % (range[1] - range[0] + 1);
        const trait = key => Number.isInteger(options.axes?.[key]) && Math.abs(options.axes[key]) <= 2 ? options.axes[key] : 0;
        const multiplier = calibrated ? 1 + .2 * (trait('structurePreference') - trait('initiative') - trait('noveltySeeking')) / 6 : 1;
        return Math.round(duration * multiplier);
    };
    const labelFor = (behaviorId, surfaceId = '') => {
        const label = definitions[behaviorId]?.label || '';
        if (!label) return '';
        if (surfaceId !== 'curator-rug-surface' || behaviorId === 'roam') return label;
        return `在地毯上${label.replace(/^正(在)?/, '')}`;
    };
    const placementSignature = ({ residentId, hallId, roomId = 'curator-room', presence }) => {
        if (!residentId || !hallId || roomId !== 'curator-room' ||
            !presence?.anchor || !presence?.enteredAt ||
            !Number.isFinite(Date.parse(presence.enteredAt))) return '';
        return JSON.stringify([String(residentId), String(hallId), roomId,
            String(presence.anchor), String(presence.enteredAt)]);
    };
    const validateSettled = (raw, { residentId, hallId, roomId = 'curator-room',
        placement, domain, spatialVersion = 1 }) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 ||
            raw.residentId !== String(residentId) || raw.hallId !== String(hallId) ||
            raw.roomId !== roomId || raw.spatialVersion !== spatialVersion ||
            !placement || raw.placementSignature !== placement || !domain ||
            typeof raw.settledAt !== 'string' || !Number.isFinite(Date.parse(raw.settledAt)) ||
            !Number.isFinite(raw.foot?.x) || !Number.isFinite(raw.foot?.y) ||
            raw.foot.x < 0 || raw.foot.y < 0 || raw.foot.x >= domain.width || raw.foot.y >= domain.height ||
            !domain.legalPoint(raw.foot) || domain.surfaceAt(raw.foot) !== raw.surfaceId ||
            !['curator-floor', 'curator-rug-surface'].includes(raw.surfaceId)) return null;
        return { ...raw, foot: { x: raw.foot.x, y: raw.foot.y } };
    };
    const makeSettled = ({ residentId, hallId, foot, domain, placement, settledAt }) => {
        const surfaceId = domain?.surfaceAt(foot);
        if (!placement || typeof settledAt !== 'string' || !Number.isFinite(Date.parse(settledAt)) ||
            !Number.isFinite(foot?.x) || !Number.isFinite(foot?.y) ||
            !['curator-floor', 'curator-rug-surface'].includes(surfaceId) ||
            !domain.legalPoint(foot)) return null;
        return { version: 1, residentId: String(residentId), hallId: String(hallId),
            roomId: 'curator-room', surfaceId, foot: { x: foot.x, y: foot.y },
            spatialVersion: 1, placementSignature: placement, settledAt };
    };
    const stageSettledSnapshot = (state, record) => ({ ...state, user: { ...state.user,
        livingHallSettledPositions: { ...(state.user?.livingHallSettledPositions || {}),
            [record.residentId]: record } } });
    const episodeWindow = (time = Date.now()) => {
        const now = new Date(time);
        if (!Number.isFinite(now.getTime())) return null;
        // Subtract elapsed local minutes rather than setHours/setMinutes: those
        // setters can select the first occurrence of a repeated DST hour.
        const start = now.getTime() - ((now.getMinutes() % 20) * 60000 + now.getSeconds() * 1000 + now.getMilliseconds());
        return { key: String(start), start, end: start + 1200000 };
    };
    const buildEpisodeWindow = ({ hallId, now, residents }) => {
        const window = episodeWindow(now);
        if (!window) return null;
        const plan = { version: 1, hallId: String(hallId), windowKey: window.key,
            windowStart: window.start, windowEnd: window.end, planStart: Number(now),
            residents: [], content: { state: 'unclaimed', entries: [] } };
        for (const row of residents) {
            if (!row.domain?.legalPoint(row.foot) || !definitions[initialBehavior(row.posture)]) continue;
            const residentId = String(row.id), seed = `${hallId}:${window.key}:${residentId}`;
            const record = { residentId, roomId: row.roomId, authority: row.authority,
                state: 'valid', lastFoot: { ...row.foot }, beats: [] };
            let foot = { ...row.foot }, cursor = Number(now), recent = [];
            for (let i = 0; i < 3 && cursor < window.end; i++) {
                const candidates = buildCandidates({ surfaceId: row.domain.surfaceAt(foot),
                    capabilities: row.domain.capabilityFor(row.domain.surfaceAt(foot)), recent,
                    navigationAvailable: row.canMove === true && i < 2,
                    afterRoam: recent.at(-1) === 'roam', interactions: [] });
                let behaviorId = i === 0 && candidates.some(c => c.behaviorId === row.currentBehavior && c.eligible)
                    ? row.currentBehavior : selectCandidate(candidates, seed, i);
                if (!behaviorId) break;
                let target = null, duration = durationFor(seed, i, behaviorId, { hallPresence: true, axes: row.axes });
                if (behaviorId === 'roam') {
                    target = Meeow.hallNavigation.sampleDestination(row.domain, { from: foot, seed: `${seed}:${i}:target`,
                        claims: residents.filter(other => other.id !== row.id && other.roomId === row.roomId).map(other => other.foot),
                        acceptsPresentation: row.domain.groundPresentationPoint });
                    const route = target && Meeow.hallNavigation.planRoute(row.domain, foot, target);
                    duration = route?.valid ? Math.ceil(route.points.slice(1).reduce((sum, point, n) =>
                        sum + Math.hypot(point.x - route.points[n].x, point.y - route.points[n].y), 0) / Meeow.hallSpatial.PROTOTYPE_SPEED * 1000) + 700 : null;
                    if (!duration || cursor + duration + 1000 >= window.end) {
                        behaviorId = selectCandidate(candidates.filter(c => definitions[c.behaviorId].stationary), seed, i);
                        target = null; duration = durationFor(seed, i, behaviorId, { hallPresence: true, axes: row.axes });
                    }
                }
                const posture = selectPosture({ residentId: seed, cycle: i, behaviorId, current: row.posture });
                if (!posture || !duration) break;
                const sustainable = definitions[behaviorId].stationary && (i === 2 || row.canMove !== true || cursor + duration >= window.end);
                const beat = { id: `${seed}:${i}`, behaviorId, posture, roomId: row.roomId,
                    startAt: cursor, endAt: sustainable ? window.end : Math.min(cursor + duration, window.end),
                    foot: { ...foot }, target: target && { x: target.x, y: target.y }, state: 'pending',
                    requiresBeatId: record.beats.at(-1)?.target ? record.beats.at(-1).id : null };
                record.beats.push(beat); cursor = beat.endAt;
                if (target) foot = { ...target };
                recent.push(behaviorId);
            }
            if (record.beats.length && definitions[record.beats.at(-1).behaviorId].stationary) plan.residents.push(record);
        }
        return plan;
    };
    const validateEpisodeContent = (payload, plan) => {
        if (!payload || Object.keys(payload).some(key => key !== 'entries') || !Array.isArray(payload.entries)) return 'Invalid episode content envelope.';
        const expected = new Set(plan.residents.flatMap(row => row.beats.map(beat => `${row.residentId}|${beat.id}`)));
        const seen = new Set();
        for (const entry of payload.entries) {
            if (!entry || Object.keys(entry).some(key => !['residentId', 'beatId', 'status', 'innerThought'].includes(key)) ||
                typeof entry.residentId !== 'string' || typeof entry.beatId !== 'string' ||
                typeof entry.status !== 'string' || !entry.status.trim() || entry.status.length > 160 ||
                typeof entry.innerThought !== 'string' || !entry.innerThought.trim() || entry.innerThought.length > 240) return 'Invalid episode content row.';
            const key = `${entry.residentId}|${entry.beatId}`;
            if (!expected.has(key) || seen.has(key)) return 'Unknown or duplicate episode content row.';
            seen.add(key);
        }
        return seen.size === expected.size ? true : 'Incomplete episode content.';
    };
    Meeow.hallActivities = Object.freeze({ definitions, surfaceCapabilities, capabilityFor,
        buildCandidates, selectCandidate, initialBehavior, selectBehavior,
        selectPosture, durationFor, labelFor, placementSignature, validateSettled, makeSettled,
        stageSettledSnapshot, episodeWindow, buildEpisodeWindow, validateEpisodeContent });
}(window));
