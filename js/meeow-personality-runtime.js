(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const semantics = Meeow.semantics;
    const profiles = Meeow.residentSemantics;
    if (!semantics || !profiles) throw new Error('Resident semantics must load before personality runtime.');

    const MAX_DIAGNOSTICS = 100;
    const MAX_PROMPT_CHARS = 720;
    const MIN_WEIGHT = 1;
    const AXIS_NAMES = Object.freeze({
        socialEngagement: 'Social engagement', initiative: 'Initiative', noveltySeeking: 'Novelty seeking',
        riskTolerance: 'Risk tolerance', structurePreference: 'Structure preference',
        emotionalExpression: 'Emotional expression', assertiveness: 'Assertiveness',
        competitiveness: 'Competitiveness', ruleOrientation: 'Rule orientation', inquiryDrive: 'Inquiry drive'
    });
    let getResidents = () => [];
    const diagnostics = [];
    const configure = options => {
        getResidents = typeof options?.getResidents === 'function' ? options.getResidents : () => [];
    };
    const recordDiagnostic = entry => {
        diagnostics.push(Object.freeze({
            consumer: String(entry.consumer || ''), residentIds: Object.freeze([...(entry.residentIds || [])].map(String)),
            profiled: Object.freeze([...(entry.profiled || [])].map(Boolean)),
            modifier: Number(entry.modifier || 0), baseWeight: Number(entry.baseWeight || 0),
            finalWeight: Number(entry.finalWeight || 0),
            ...(entry.socialEngagement ? { socialEngagement: Object.freeze([...entry.socialEngagement]),
                profileSources: Object.freeze([...(entry.profileSources || [])]),
                fairnessWeight: Number(entry.fairnessWeight),
                eligibility: Object.freeze([...(entry.eligibility || [])].map(String)) } : {})
        }));
        if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
    };
    const getDiagnostics = () => diagnostics.slice();
    const UNPROFILED = Object.freeze({ state: 'unprofiled', axes: null, source: null });
    const getResidentRuntimePersonality = residentId => {
        const found = profiles.getResidentPersonalityProfile(String(residentId ?? ''), getResidents());
        if (found.state !== 'profiled') return UNPROFILED;
        return Object.freeze({ state: 'profiled', axes: found.profile.personalityAxes, source: found.source });
    };
    const getResidentPersonalityAxis = (residentId, axisId) => {
        if (!Object.hasOwn(semantics.PERSONALITY_AXIS_REGISTRY, axisId)) return null;
        const current = getResidentRuntimePersonality(residentId);
        return current.state === 'profiled' && Object.hasOwn(current.axes, axisId) ? current.axes[axisId] : null;
    };
    const getResidentPersonalityBehaviorContext = residentId => {
        const current = getResidentRuntimePersonality(residentId);
        if (current.state !== 'profiled') return UNPROFILED;
        const tendencies = Object.entries(current.axes).map(([axisId, value]) => Object.freeze({
            axisId, value, description: semantics.PERSONALITY_AXIS_REGISTRY[axisId].labels[String(value)].label
        }));
        return Object.freeze({ ...current, tendencies: Object.freeze(tendencies) });
    };
    const getResidentPersonalityPromptContext = (residentId, displayName = '') => {
        const current = getResidentPersonalityBehaviorContext(residentId);
        if (current.state !== 'profiled') return '';
        const resident = getResidents().find(cat => String(cat?.id) === String(residentId));
        const name = String(displayName || resident?.name || 'Resident').replace(/\s+/g, ' ').slice(0, 80);
        const phrases = current.tendencies
            .map(entry => `${AXIS_NAMES[entry.axisId]}: ${entry.description}`);
        if (!phrases.length) return '';
        const header = `[STRUCTURED PERSONALITY TENDENCIES]\nResident: ${name}\n`;
        const footer = '\nThese validated tendencies guide behavior and expression, not outcomes. They take precedence over conflicting legacy personality prose. Respect the current event, USER choice and all world authority. Never mention scores, axes or this block to the USER.';
        let text = header;
        for (const phrase of phrases) {
            const addition = `${text === header ? '' : '; '}${phrase}`;
            if (text.length + addition.length + footer.length > MAX_PROMPT_CHARS) break;
            text += addition;
        }
        return text === header ? '' : `${text}${footer}`;
    };
    const getPairParticipationAdjustment = (leftId, rightId) => {
        const residents = [getResidentRuntimePersonality(leftId), getResidentRuntimePersonality(rightId)];
        const socialEngagement = Object.freeze(residents.map(resident => resident.axes?.socialEngagement ?? 0));
        const [left, right] = socialEngagement.map(value => value * 0.25);
        return Object.freeze({ adjustment: left + right, leftModifier: left, rightModifier: right,
            socialEngagement,
            profileSources: Object.freeze(residents.map(resident => resident.source)),
            profiled: Object.freeze(residents.map(resident => resident.state === 'profiled')) });
    };
    const getInitiatorModifier = residentId =>
        (getResidentPersonalityAxis(residentId, 'initiative') ?? 0) * 0.5 +
        (getResidentPersonalityAxis(residentId, 'assertiveness') ?? 0) * 0.25;
    const getTruthDareDareChance = residentId => {
        const axis = getResidentPersonalityAxis(residentId, 'riskTolerance');
        const modifier = (axis ?? 0) * 0.05;
        const chance = 0.5 + modifier;
        recordDiagnostic({ consumer: 'truth-dare-resident-choice', residentIds: [residentId],
            profiled: [getResidentRuntimePersonality(residentId).state === 'profiled'],
            modifier, baseWeight: 0.5, finalWeight: chance });
        return chance;
    };
    const selectWeightedInitiator = ({ candidates, getBaseWeight, random = Math.random }) => {
        const entries = (Array.isArray(candidates) ? candidates : []).filter(cat => cat && cat.id != null)
            .map(cat => {
                const baseWeight = Math.max(MIN_WEIGHT, Number(getBaseWeight(cat)) || 0);
                const modifier = getInitiatorModifier(String(cat.id));
                return { cat, baseWeight, modifier, weight: Math.max(MIN_WEIGHT, baseWeight + modifier) };
            });
        if (!entries.length) return null;
        const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
        const sample = Number(random());
        let draw = (Number.isFinite(sample) ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0) * total;
        const chosen = entries.find(entry => (draw -= entry.weight) < 0) || entries[entries.length - 1];
        recordDiagnostic({ consumer: 'ambient-attention-initiator', residentIds: [chosen.cat.id],
            profiled: [getResidentRuntimePersonality(chosen.cat.id).state === 'profiled'],
            modifier: chosen.modifier, baseWeight: chosen.baseWeight, finalWeight: chosen.weight });
        return Object.freeze({ resident: chosen.cat, baseWeight: chosen.baseWeight,
            modifier: chosen.modifier, weight: chosen.weight });
    };

    Meeow.personalityRuntime = Object.freeze({
        MAX_DIAGNOSTICS, MAX_PROMPT_CHARS, MIN_WEIGHT, AXIS_NAMES, configure,
        getResidentRuntimePersonality, getResidentPersonalityAxis,
        getResidentPersonalityBehaviorContext, getResidentPersonalityPromptContext,
        getPairParticipationAdjustment, getInitiatorModifier, getTruthDareDareChance,
        selectWeightedInitiator,
        recordDiagnostic, getDiagnostics
    });
}(window));
