(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const SOCIAL_OPPORTUNITY_CADENCE_MS = 20 * 60 * 1000;
    const PAIR_EXPOSURE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const PAIR_EXPOSURE_RECENT_MS = 6 * 60 * 60 * 1000;
    const MAX_PAIR_EXPOSURES = 200;
    const MAX_OUTCOME_DIAGNOSTICS = 100;
    const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
    const pairIds = (left, right) => {
        const a = String(left || '').trim(), b = String(right || '').trim();
        return a && b && a !== b ? [a, b].sort() : [];
    };
    const pairKey = (left, right) => pairIds(left, right).join('::');
    const isDue = (hall, nowMs = Date.now()) => {
        const last = Date.parse(hall?.lastHallSocialOpportunityAt || '');
        return Number.isFinite(nowMs) && (!Number.isFinite(last) || nowMs - last >= SOCIAL_OPPORTUNITY_CADENCE_MS);
    };
    const normalizePairExposures = (source, nowMs = Date.now()) => {
        const seen = new Set();
        return (Array.isArray(source) ? source : []).filter(entry => {
            const ids = pairIds(entry?.residentIds?.[0], entry?.residentIds?.[1]);
            const atMs = Date.parse(entry?.at || '');
            const key = `${String(entry?.sceneId || '')}:${ids.join('::')}`;
            if (!ids.length || !String(entry?.sceneId || '').trim() || !validTime(entry?.at) ||
                atMs > nowMs || nowMs - atMs >= PAIR_EXPOSURE_WINDOW_MS || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map(entry => ({ sceneId: String(entry.sceneId), residentIds: pairIds(entry.residentIds[0], entry.residentIds[1]), at: entry.at }))
            .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.sceneId.localeCompare(b.sceneId))
            .slice(-MAX_PAIR_EXPOSURES);
    };
    const pairWeight = (left, right, exposure, nowMs = Date.now()) => {
        const key = pairKey(left, right);
        const matches = normalizePairExposures(exposure, nowMs).filter(entry => pairKey(...entry.residentIds) === key);
        const recentlySeen = matches.some(entry => nowMs - Date.parse(entry.at) < PAIR_EXPOSURE_RECENT_MS);
        return Math.max(1, 6 - 2 * Math.min(2, matches.length) - (recentlySeen ? 1 : 0));
    };
    const selectPair = ({ residents, exposure, nowMs = Date.now(), random = Math.random }) => {
        const ids = [...new Set((Array.isArray(residents) ? residents : []).map(cat => String(cat?.id || '').trim()).filter(Boolean))].sort();
        const candidates = [];
        for (let left = 0; left < ids.length; left += 1) for (let right = left + 1; right < ids.length; right += 1) {
            candidates.push({ residentIds: [ids[left], ids[right]], weight: pairWeight(ids[left], ids[right], exposure, nowMs) });
        }
        if (!candidates.length) return null;
        const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
        const sample = Number(random());
        let draw = (Number.isFinite(sample) ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0) * total;
        for (const candidate of candidates) {
            draw -= candidate.weight;
            if (draw < 0) return { ...candidate, pairKey: pairKey(...candidate.residentIds) };
        }
        const last = candidates[candidates.length - 1];
        return { ...last, pairKey: pairKey(...last.residentIds) };
    };
    const claimOpportunity = ({ hall, hallId, token, claims, nowMs = Date.now() }) => {
        const id = String(hallId || '').trim();
        if (!id || !hall || !token || !(claims instanceof Map) || claims.has(id) || !isDue(hall, nowMs)) return null;
        const claim = Object.freeze({ hallId: id, token: String(token), at: new Date(nowMs).toISOString() });
        claims.set(id, claim);
        return claim;
    };
    const releaseOpportunity = (claim, claims) => {
        if (!claim || !(claims instanceof Map) || claims.get(claim.hallId) !== claim) return false;
        claims.delete(claim.hallId);
        return true;
    };
    const commitOpportunity = (claim, claims, hall) => {
        if (!claim || !hall || !(claims instanceof Map) || claims.get(claim.hallId) !== claim ||
            !isDue(hall, Date.parse(claim.at))) return false;
        hall.lastHallSocialOpportunityAt = claim.at;
        claims.delete(claim.hallId);
        return true;
    };
    const appendSceneExposures = (hall, scene, nowMs = Date.now()) => {
        if (!hall || !scene || !['ambient', 'user-directed'].includes(scene.type)) return 0;
        const ids = [...new Set((scene.participantIds || []).map(id => String(id || '').trim()).filter(Boolean))].sort();
        const records = normalizePairExposures(hall.recentSocialPairExposures, nowMs);
        let added = 0;
        for (let a = 0; a < ids.length; a += 1) for (let b = a + 1; b < ids.length; b += 1) {
            if (records.some(entry => entry.sceneId === scene.id && pairKey(...entry.residentIds) === pairKey(ids[a], ids[b]))) continue;
            records.push({ sceneId: String(scene.id), residentIds: [ids[a], ids[b]], at: scene.at });
            added += 1;
        }
        hall.recentSocialPairExposures = normalizePairExposures(records, nowMs);
        return added;
    };
    const socialSigns = changes => ({
        positive: Number(changes?.warmth || 0) > 0 || Number(changes?.trust || 0) > 0 || Number(changes?.tension || 0) < 0,
        negative: Number(changes?.warmth || 0) < 0 || Number(changes?.trust || 0) < 0 || Number(changes?.tension || 0) > 0
    });
    const classifyOutcome = ({ proposedCount = 0, validDeltas = [], appliedResults = [], committed = true }) => {
        if (!committed) return 'delta-rejected';
        if (proposedCount === 0) return 'no-delta-proposed';
        if (!validDeltas.length) return 'delta-rejected';
        const signs = appliedResults.reduce((result, entry) => {
            const next = socialSigns(entry?.changes);
            return { positive: result.positive || next.positive, negative: result.negative || next.negative };
        }, { positive: false, negative: false });
        if (signs.positive && signs.negative) return 'delta-applied-mixed';
        if (signs.positive) return 'delta-applied-positive';
        if (signs.negative) return 'delta-applied-negative';
        const proposedSocialChange = validDeltas.some(delta =>
            Number(delta.warmthDelta || 0) !== 0 || Number(delta.trustDelta || 0) !== 0 || Number(delta.tensionDelta || 0) !== 0);
        return proposedSocialChange ? 'delta-saturated' : 'delta-neutral';
    };
    const substantivePair = appliedResults => (Array.isArray(appliedResults) ? appliedResults : [])
        .find(entry => {
            const signs = socialSigns(entry?.changes);
            return signs.positive || signs.negative;
        }) || null;
    const recordDiagnostic = (store, entry) => {
        if (!Array.isArray(store)) return false;
        store.push({ sceneId: String(entry.sceneId || ''), hallId: String(entry.hallId || ''),
            category: String(entry.category || ''), at: String(entry.at || '') });
        if (store.length > MAX_OUTCOME_DIAGNOSTICS) store.splice(0, store.length - MAX_OUTCOME_DIAGNOSTICS);
        return true;
    };
    Meeow.socialActivity = Object.freeze({ SOCIAL_OPPORTUNITY_CADENCE_MS, PAIR_EXPOSURE_WINDOW_MS,
        MAX_PAIR_EXPOSURES, MAX_OUTCOME_DIAGNOSTICS, pairIds, pairKey, isDue, normalizePairExposures,
        pairWeight, selectPair, claimOpportunity, releaseOpportunity, commitOpportunity,
        appendSceneExposures, classifyOutcome, substantivePair, recordDiagnostic });
    if (typeof module !== 'undefined' && module.exports) module.exports = Meeow.socialActivity;
})(typeof window !== 'undefined' ? window : globalThis);
