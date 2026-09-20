(function (global) {
    'use strict';

    const Meeow = global.Meeow = global.Meeow || {};
    const VALID_POSTURES = Object.freeze(['standing', 'sitting', 'lying', 'crouching']);
    const VALID_POSTURE_SET = new Set(VALID_POSTURES);
    const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    const normalizePosture = value => VALID_POSTURE_SET.has(String(value || '').trim()) ? String(value).trim() : '';
    const normalizeStatusActivity = value => {
        if (!isPlainObject(value)) return null;
        const posture = normalizePosture(value.posture);
        return posture ? { posture } : null;
    };
    const normalizeResidentStatusActivity = resident => {
        if (!resident || typeof resident !== 'object') return null;
        const normalized = normalizeStatusActivity(resident.statusActivity);
        if (normalized) resident.statusActivity = normalized;
        else if (Object.prototype.hasOwnProperty.call(resident, 'statusActivity')) delete resident.statusActivity;
        return normalized;
    };

    // Deliberately small: only unmistakable posture language participates.
    // Furniture/location words never appear here and therefore cannot invent pose.
    const EXPLICIT_POSTURE_PATTERNS = Object.freeze({
        standing: /(?:站着|站立|直立|站在|立在|\bstanding\b|\bupright\b)/i,
        sitting: /(?:坐着|坐在|端坐|席地而坐|\bsitting\b|\bseated\b)/i,
        lying: /(?:躺着|躺在|卧在|侧卧|平卧|趴着|趴在|蜷着|蜷缩着|\blying\b|\bprone\b)/i,
        crouching: /(?:蹲着|蹲在|蹲伏|伏低|低伏|匍匐|\bcrouching\b|\bcrouched\b)/i
    });
    const getExplicitPostures = status => VALID_POSTURES.filter(posture => EXPLICIT_POSTURE_PATTERNS[posture].test(String(status || '')));
    const validateStatusPosture = (status, posture) => {
        const normalized = normalizePosture(posture);
        if (!normalized) return { valid: false, error: 'status posture is missing or invalid', posture: '' };
        const explicit = getExplicitPostures(status);
        // Reject only a single, unambiguous contradiction. Multi-posture prose can
        // describe a transition and is intentionally left to the structured token.
        if (explicit.length === 1 && explicit[0] !== normalized) {
            return { valid: false, error: `status text explicitly indicates ${explicit[0]} but posture is ${normalized}`, posture: normalized };
        }
        return { valid: true, error: '', posture: normalized };
    };
    const getLegacyStatusPose = status => {
        const explicit = getExplicitPostures(status);
        return explicit.length === 1 ? explicit[0] : 'standing';
    };
    const resolveMapPose = resident => normalizeStatusActivity(resident?.statusActivity)?.posture || getLegacyStatusPose(resident?.status || '');
    const prepareStatusTransition = (resident, status, posture) => {
        const cleanStatus = String(status || '').trim();
        const validation = validateStatusPosture(cleanStatus, posture);
        if (!resident || typeof resident !== 'object' || !cleanStatus || !validation.valid) {
            return { valid: false, error: validation.error || 'resident and status are required', changed: false, fields: null };
        }
        const prior = normalizeStatusActivity(resident.statusActivity);
        return {
            valid: true,
            error: '',
            changed: cleanStatus !== String(resident.status || '').trim() || prior?.posture !== validation.posture,
            fields: { status: cleanStatus, statusActivity: { posture: validation.posture } }
        };
    };

    Meeow.statusPosture = Object.freeze({
        VALID_POSTURES,
        normalizePosture,
        normalizeStatusActivity,
        normalizeResidentStatusActivity,
        getExplicitPostures,
        validateStatusPosture,
        prepareStatusTransition,
        getLegacyStatusPose,
        resolveMapPose
    });
}(window));
