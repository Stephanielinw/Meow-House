(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const SEMANTIC_PROFILE_VERSION = 1;
    const SEMANTIC_TAG_REGISTRY_VERSION = 1;
    const AXIS_MIN = -2;
    const AXIS_MAX = 2;
    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const deepFreeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(deepFreeze);
            Object.freeze(value);
        }
        return value;
    };
    const axis = (negative, positive, negativeLabel, positiveLabel) => ({
        min: AXIS_MIN, max: AXIS_MAX, negative, positive,
        labels: {
            '-2': { key: negativeLabel, label: `strongly ${negative}` },
            '-1': { key: negativeLabel, label: negative },
            '0': { key: 'mixed', label: 'mixed / context-dependent' },
            '1': { key: positiveLabel, label: positive },
            '2': { key: positiveLabel, label: `strongly ${positive}` }
        }
    });
    const PERSONALITY_AXIS_REGISTRY = deepFreeze({
        socialEngagement: axis('reserved', 'social-seeking', 'reserved', 'social-seeking'),
        initiative: axis('reactive', 'proactive', 'reactive', 'proactive'),
        noveltySeeking: axis('routine-seeking', 'exploratory', 'routine-seeking', 'exploratory'),
        riskTolerance: axis('cautious', 'bold', 'cautious', 'bold'),
        structurePreference: axis('spontaneous', 'structured', 'spontaneous', 'structured'),
        emotionalExpression: axis('restrained', 'expressive', 'restrained', 'expressive'),
        assertiveness: axis('accommodating', 'directive', 'accommodating', 'directive'),
        competitiveness: axis('cooperative', 'competitive', 'cooperative', 'competitive'),
        ruleOrientation: axis('improvisational', 'duty-oriented', 'improvisational', 'duty-oriented'),
        inquiryDrive: axis('practical', 'investigative', 'practical', 'investigative')
    });
    const namespace = (values, min, max, mutuallyExclusiveWithOthers = [], preferenceScored = true) => ({
        values, min, max, preferenceScored, mutuallyExclusiveWithOthers
    });
    const OBJECT_VALUES = deepFreeze({
        role: ['play', 'comfort', 'keepsake', 'display'],
        interaction: ['chase', 'bat', 'carry', 'cuddle', 'sniff', 'observe'],
        stimulus: ['rolling', 'swinging', 'fluttering', 'glowing', 'scented']
    });
    const OBJECT_VALIDITY = deepFreeze({
        toy: { play: ['chase', 'bat', 'carry', 'sniff'], comfort: ['carry', 'cuddle'] },
        collectible: { keepsake: ['carry', 'observe'], display: ['observe'] }
    });
    const objectNamespaces = () => ({
        role: namespace(OBJECT_VALUES.role, 1, 1, [], false),
        interaction: namespace(OBJECT_VALUES.interaction, 1, 1, [], false),
        stimulus: namespace(OBJECT_VALUES.stimulus, 0, 2, [], false)
    });
    const SEMANTIC_TAG_REGISTRY = deepFreeze({
        food: {
            maxTags: 10,
            namespaces: {
                temp: namespace(['cold', 'cool', 'room', 'warm', 'hot'], 1, 1),
                taste: namespace(['sweet', 'sour', 'bitter', 'salty', 'spicy', 'umami', 'bland'], 1, 3, ['bland']),
                smell: namespace(['mild', 'fragrant', 'pungent', 'fermented'], 1, 1),
                texture: namespace(['soft', 'crisp', 'chewy', 'creamy', 'dry', 'juicy'], 1, 2),
                family: namespace(['fish', 'meat', 'dairy', 'egg', 'fruit', 'vegetable', 'grain'], 1, 2),
                form: namespace(['meal', 'snack', 'dessert', 'beverage'], 1, 1)
            }
        },
        toy: { maxTags: 4, namespaces: objectNamespaces() },
        collectible: { maxTags: 4, namespaces: objectNamespaces() }
    });
    const validateSemanticRegistry = registry => {
        const errors = [];
        if (!isRecord(registry)) return { valid: false, errors: ['Registry must be an object.'] };
        for (const [semanticType, definition] of Object.entries(registry)) {
            if (Array.isArray(definition?.namespaces)) {
                const names = definition.namespaces.map(entry => entry?.name);
                errors.push(names.length !== new Set(names).size
                    ? `${semanticType}: duplicate namespace definition` : `${semanticType}: namespaces must be an object`);
                continue;
            }
            if (!isRecord(definition) || !isRecord(definition.namespaces)) {
                errors.push(`${semanticType}: invalid definition`);
                continue;
            }
            let maximum = 0;
            for (const [name, entry] of Object.entries(definition.namespaces)) {
                if (!isRecord(entry) || !Array.isArray(entry.values) || entry.values.length !== new Set(entry.values).size ||
                    entry.values.some(value => typeof value !== 'string' || !value || value.includes(':')) ||
                    !Number.isInteger(entry.min) || !Number.isInteger(entry.max) || entry.min < 0 || entry.max < entry.min || entry.max > entry.values.length) {
                    errors.push(`${semanticType}.${name}: invalid or duplicate values/cardinality`);
                    continue;
                }
                if (!Array.isArray(entry.mutuallyExclusiveWithOthers) || entry.mutuallyExclusiveWithOthers.some(value => !entry.values.includes(value))) {
                    errors.push(`${semanticType}.${name}: invalid exclusion`);
                }
                maximum += entry.max;
            }
            if (!Number.isInteger(definition.maxTags) || definition.maxTags < maximum) errors.push(`${semanticType}: maxTags below legal maximum`);
        }
        return { valid: errors.length === 0, errors };
    };
    if (!validateSemanticRegistry(SEMANTIC_TAG_REGISTRY).valid) throw new Error('Invalid Meeow semantic registry.');
    const tagResult = (valid, classificationState, errors, normalized = null) => ({
        valid, classificationState, classificationKnown: classificationState === 'classified',
        error: errors[0] || null, errors, normalized
    });
    const normalizeSemanticTags = input => {
        if (!isRecord(input)) return tagResult(false, 'invalid', ['Semantic object must be an object.']);
        const hasType = Object.hasOwn(input, 'semanticType');
        const hasTags = Object.hasOwn(input, 'tags');
        if (!hasType && (!hasTags || (Array.isArray(input.tags) && input.tags.length === 0))) {
            return tagResult(true, 'unclassified', [], { classificationState: 'unclassified' });
        }
        if (!hasType || !hasTags) return tagResult(false, 'invalid', ['Incomplete semantic classification.']);
        const semanticType = input.semanticType;
        const definition = SEMANTIC_TAG_REGISTRY[semanticType];
        if (typeof semanticType !== 'string' || !Object.hasOwn(SEMANTIC_TAG_REGISTRY, semanticType)) {
            return tagResult(false, 'invalid', ['Unknown semanticType.']);
        }
        if (!Array.isArray(input.tags)) return tagResult(false, 'invalid', ['tags must be an array.']);
        const errors = [];
        const seen = new Set();
        const groups = Object.fromEntries(Object.keys(definition.namespaces).map(name => [name, []]));
        for (const raw of input.tags) {
            if (typeof raw !== 'string') { errors.push('Tag must be a string.'); continue; }
            const tag = raw.trim();
            const separator = tag.indexOf(':');
            const name = tag.slice(0, separator);
            const value = tag.slice(separator + 1);
            const rule = definition.namespaces[name];
            if (separator < 1 || !rule || !rule.values.includes(value)) { errors.push(`Unknown semantic tag: ${tag}`); continue; }
            if (seen.has(tag)) { errors.push(`Duplicate semantic tag: ${tag}`); continue; }
            seen.add(tag);
            groups[name].push(value);
        }
        if (input.tags.length > definition.maxTags) errors.push(`Too many semantic tags: ${input.tags.length}`);
        for (const [name, rule] of Object.entries(definition.namespaces)) {
            const values = groups[name];
            if (values.length < rule.min || values.length > rule.max) errors.push(`${name} requires ${rule.min}–${rule.max} value(s).`);
            if (values.length > 1 && rule.mutuallyExclusiveWithOthers.some(value => values.includes(value))) {
                errors.push(`${name} contains mutually exclusive values.`);
            }
        }
        if (semanticType === 'toy' || semanticType === 'collectible') {
            const role = groups.role[0];
            const interaction = groups.interaction[0];
            if (role && interaction && !OBJECT_VALIDITY[semanticType][role]?.includes(interaction))
                errors.push('Incompatible object role and interaction.');
            if (semanticType === 'collectible' && groups.stimulus.some(value =>
                value === 'rolling' || value === 'swinging' || value === 'fluttering'))
                errors.push('Play-only stimulus on collectible.');
            if ((Object.hasOwn(input, 'category') && (semanticType === 'toy' ? input.category !== 'toy'
                : !['collectible', 'souvenir'].includes(input.category))) ||
                (Object.hasOwn(input, 'type') && semanticType === 'collectible' &&
                    !['collectible', 'souvenir'].includes(input.type)) ||
                (Object.hasOwn(input, 'type') && semanticType === 'toy' && input.type === 'letter'))
                errors.push('Semantic type conflicts with canonical item category/type.');
        }
        if (errors.length) return tagResult(false, 'invalid', errors);
        const tags = Object.entries(definition.namespaces).flatMap(([name, rule]) =>
            rule.values.filter(value => groups[name].includes(value)).map(value => `${name}:${value}`)
        );
        return tagResult(true, 'classified', [], { semanticType, tags });
    };
    const validateSemanticTags = normalizeSemanticTags;
    const normalizeObjectSemanticProposal = (raw, semanticType) => {
        if (!Object.hasOwn(OBJECT_VALIDITY, semanticType) || !isRecord(raw)) return null;
        const tags = Array.isArray(raw.tags) ? raw.tags : [
            `role:${raw.role}`, `interaction:${raw.interaction}`,
            ...(Array.isArray(raw.stimulus) ? raw.stimulus.map(value => `stimulus:${value}`) :
                raw.stimulus === undefined ? [] : ['stimulus:invalid'])
        ];
        const checked = normalizeSemanticTags({ semanticType, tags });
        return checked.classificationKnown ? checked.normalized : null;
    };
    const getItemObjectSemantics = item => {
        if (!isRecord(item) || !Object.hasOwn(OBJECT_VALIDITY, item.semanticType)) return null;
        const checked = normalizeSemanticTags(item);
        return checked.classificationKnown ? checked.normalized : null;
    };
    const getPrimaryItemInteraction = item => getItemObjectSemantics(item)?.tags
        .find(tag => tag.startsWith('interaction:'))?.slice('interaction:'.length) || null;
    const isSemanticallyUsableItem = item => getPrimaryItemInteraction(item) !== null;
    const STATIC_TOY_SEMANTICS = deepFreeze({
        2: { semanticType: 'toy', tags: ['role:play', 'interaction:chase', 'stimulus:rolling', 'stimulus:glowing'] },
        3: { semanticType: 'toy', tags: ['role:play', 'interaction:bat', 'stimulus:swinging'] },
        4: { semanticType: 'toy', tags: ['role:play', 'interaction:sniff', 'stimulus:scented'] },
        5: { semanticType: 'toy', tags: ['role:play', 'interaction:bat', 'stimulus:rolling'] }
    });
    const STATIC_COLLECTIBLE_CONCEPTS = deepFreeze({
        shell: { semanticType: 'collectible', tags: ['role:keepsake', 'interaction:observe'] },
        'portable-branch': { semanticType: 'collectible', tags: ['role:keepsake', 'interaction:carry'] },
        'decorative-badge': { semanticType: 'collectible', tags: ['role:display', 'interaction:observe'] },
        'decorative-jewelry': { semanticType: 'collectible', tags: ['role:display', 'interaction:observe'] }
    });
    const getStaticToySemantics = id => typeof id === 'number' && Object.hasOwn(STATIC_TOY_SEMANTICS, id)
        ? { semanticType: 'toy', tags: [...STATIC_TOY_SEMANTICS[id].tags] } : null;
    const getStaticCollectibleSemantics = conceptId => typeof conceptId === 'string' &&
        Object.hasOwn(STATIC_COLLECTIBLE_CONCEPTS, conceptId)
        ? { semanticType: 'collectible', tags: [...STATIC_COLLECTIBLE_CONCEPTS[conceptId].tags] } : null;
    // Optional authored-food presentation tags use the existing closed Food
    // vocabulary. Partial proposals remain descriptive; they do not become a
    // canonical gameplay classification or change resident reaction scoring.
    const normalizeOptionalFoodTags = raw => {
        if (raw == null) return { tags: [], rejected: [], complete: false };
        if (!Array.isArray(raw)) return { tags: [], rejected: ['semanticTags must be an array'], complete: false };
        const rules = SEMANTIC_TAG_REGISTRY.food.namespaces;
        const groups = Object.fromEntries(Object.keys(rules).map(name => [name, []]));
        const rejected = [];
        const seen = new Set();
        for (const candidate of raw) {
            if (typeof candidate !== 'string' || candidate.length > 40) { rejected.push(String(candidate).slice(0, 40)); continue; }
            const separator = candidate.indexOf(':');
            const name = candidate.slice(0, separator);
            const value = candidate.slice(separator + 1);
            const rule = rules[name];
            if (separator < 1 || !rule || !rule.values.includes(value) || candidate !== `${name}:${value}` || seen.has(candidate)) {
                rejected.push(candidate); continue;
            }
            const selected = groups[name];
            if (selected.length >= rule.max ||
                (name === 'taste' && selected.length && (value === 'bland' || selected.includes('bland')))) {
                rejected.push(candidate); continue;
            }
            selected.push(value);
            seen.add(candidate);
        }
        let tags = Object.entries(rules).flatMap(([name, rule]) =>
            rule.values.filter(value => groups[name].includes(value)).map(value => `${name}:${value}`));
        if (tags.length > SEMANTIC_TAG_REGISTRY.food.maxTags) {
            rejected.push(...tags.slice(SEMANTIC_TAG_REGISTRY.food.maxTags));
            tags = tags.slice(0, SEMANTIC_TAG_REGISTRY.food.maxTags);
        }
        return { tags, rejected, complete: normalizeSemanticTags({ semanticType: 'food', tags }).classificationKnown };
    };
    const hasValidSemanticClassification = input => normalizeSemanticTags(input).classificationKnown;
    const MBTI_CODES = new Set(['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
        'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']);
    const profileResult = (valid, errors, normalized = null) => ({ valid, error: errors[0] || null, errors, normalized });
    const normalizeSemanticProfile = profile => {
        if (!isRecord(profile)) return profileResult(false, ['Profile must be an object.']);
        const errors = [];
        if (profile.semanticProfileVersion !== SEMANTIC_PROFILE_VERSION) errors.push('Unsupported semanticProfileVersion.');
        if (typeof profile.residentId !== 'string' || !profile.residentId.trim() || profile.residentId !== profile.residentId.trim()) errors.push('Invalid residentId.');
        if (profile.personalityAxes !== undefined && !isRecord(profile.personalityAxes)) errors.push('personalityAxes must be an object.');
        const axes = {};
        if (isRecord(profile.personalityAxes)) {
            for (const [key, value] of Object.entries(profile.personalityAxes)) {
                if (!Object.hasOwn(PERSONALITY_AXIS_REGISTRY, key)) errors.push(`Unknown personality axis: ${key}`);
                else if (!Number.isInteger(value) || value < AXIS_MIN || value > AXIS_MAX) errors.push(`Invalid personality axis value: ${key}`);
            }
            for (const key of Object.keys(PERSONALITY_AXIS_REGISTRY)) {
                if (Object.hasOwn(profile.personalityAxes, key)) axes[key] = profile.personalityAxes[key];
            }
        }
        if (profile.preferences !== undefined && !isRecord(profile.preferences)) errors.push('preferences must be an object.');
        const food = {};
        if (isRecord(profile.preferences)) {
            for (const [type, entries] of Object.entries(profile.preferences)) {
                if (type !== 'food' || !isRecord(entries)) { errors.push(`Unknown or invalid preference group: ${type}`); continue; }
                for (const [tag, weight] of Object.entries(entries)) {
                    const separator = tag.indexOf(':');
                    const rule = SEMANTIC_TAG_REGISTRY.food.namespaces[tag.slice(0, separator)];
                    if (separator < 1 || !rule || !rule.values.includes(tag.slice(separator + 1))) errors.push(`Unknown preference tag: ${tag}`);
                    else if (!Number.isInteger(weight) || weight < AXIS_MIN || weight > AXIS_MAX) errors.push(`Invalid preference weight: ${tag}`);
                }
            }
            for (const [name, rule] of Object.entries(SEMANTIC_TAG_REGISTRY.food.namespaces)) {
                for (const value of rule.values) {
                    const tag = `${name}:${value}`;
                    if (Object.hasOwn(profile.preferences.food || {}, tag)) food[tag] = profile.preferences.food[tag];
                }
            }
        }
        if (profile.reference !== undefined && !isRecord(profile.reference)) errors.push('reference must be an object.');
        const reference = { mbti: null, notes: [], axisEvidence: {} };
        if (isRecord(profile.reference)) {
            const mbti = profile.reference.mbti ?? null;
            if (mbti !== null && !MBTI_CODES.has(mbti)) errors.push('Invalid reference MBTI.');
            else reference.mbti = mbti;
            if (profile.reference.notes !== undefined && (!Array.isArray(profile.reference.notes) || profile.reference.notes.some(value => typeof value !== 'string'))) errors.push('Invalid reference notes.');
            else reference.notes = [...(profile.reference.notes || [])];
            if (profile.reference.axisEvidence !== undefined && !isRecord(profile.reference.axisEvidence)) errors.push('Invalid axisEvidence.');
            else if (isRecord(profile.reference.axisEvidence)) {
                for (const [key, entries] of Object.entries(profile.reference.axisEvidence)) {
                    if (!Object.hasOwn(PERSONALITY_AXIS_REGISTRY, key) || !Object.hasOwn(axes, key) || !Array.isArray(entries) || !entries.length ||
                        entries.some(entry => !isRecord(entry) || !['personality', 'prompt', 'trickArchetype', 'canonicalRelationship'].includes(entry.sourceField) || typeof entry.evidence !== 'string' || !entry.evidence.trim())) {
                        errors.push(`Invalid axisEvidence: ${key}`);
                    } else reference.axisEvidence[key] = entries.map(entry => ({ sourceField: entry.sourceField, evidence: entry.evidence }));
                }
            }
            if (profile.reference.palateConcept !== undefined) {
                if (typeof profile.reference.palateConcept !== 'string' || !profile.reference.palateConcept.trim() ||
                    profile.reference.palateConcept !== profile.reference.palateConcept.trim()) {
                    errors.push('Invalid palateConcept.');
                } else reference.palateConcept = profile.reference.palateConcept;
            }
            if (profile.reference.foodPreferenceProvenance !== undefined) {
                const provenance = profile.reference.foodPreferenceProvenance;
                if (!isRecord(provenance) || Object.keys(provenance).some(tag => !Object.hasOwn(food, tag) ||
                    !['meeow-design', 'source-canon'].includes(provenance[tag])) ||
                    Object.keys(food).some(tag => !Object.hasOwn(provenance, tag))) {
                    errors.push('Invalid foodPreferenceProvenance.');
                } else reference.foodPreferenceProvenance = Object.fromEntries(
                    Object.keys(food).map(tag => [tag, provenance[tag]])
                );
            }
        }
        if (errors.length) return profileResult(false, errors);
        return profileResult(true, [], {
            semanticProfileVersion: SEMANTIC_PROFILE_VERSION,
            residentId: profile.residentId,
            reference,
            personalityAxes: axes,
            preferences: { food }
        });
    };
    const validateSemanticProfile = normalizeSemanticProfile;
    const derivePersonalityLabels = profile => {
        const validation = normalizeSemanticProfile(profile);
        if (!validation.valid) return [];
        return Object.entries(validation.normalized.personalityAxes).map(([axisName, value]) => {
            const definition = PERSONALITY_AXIS_REGISTRY[axisName].labels[String(value)];
            return Object.freeze({ axis: axisName, value, key: `${axisName}:${definition.key}`, label: definition.label });
        });
    };
    const scoreResidentPreference = (profile, semanticObject) => {
        const unknown = reason => ({ valid: true, classificationKnown: false, score: null, reactionClass: 'unknown', reason, matchedPreferences: [], matchedNamespaces: [] });
        const checkedObject = normalizeSemanticTags(semanticObject);
        if (!checkedObject.valid) return { ...unknown('invalid-classification'), valid: false, error: checkedObject.error };
        if (profile == null) return unknown('no-profile');
        const checkedProfile = normalizeSemanticProfile(profile);
        if (!checkedProfile.valid) return { ...unknown('invalid-profile'), valid: false, error: checkedProfile.error };
        if (!checkedObject.classificationKnown) return unknown('unclassified-object');
        const preferences = checkedProfile.normalized.preferences[checkedObject.normalized.semanticType] || {};
        const matches = checkedObject.normalized.tags.filter(tag => Object.hasOwn(preferences, tag)).map(tag => ({
            namespace: tag.split(':')[0], tag, weight: preferences[tag]
        }));
        if (!matches.length) return unknown('no-matched-preferences');
        const contributions = Object.keys(SEMANTIC_TAG_REGISTRY[checkedObject.normalized.semanticType].namespaces)
            .map(namespaceName => {
                const weights = matches.filter(match => match.namespace === namespaceName);
                if (!weights.length) return null;
                const sum = weights.reduce((total, match) => total + match.weight, 0);
                return { namespace: namespaceName, rawSum: sum, contribution: Math.max(AXIS_MIN, Math.min(AXIS_MAX, sum)) };
            }).filter(Boolean);
        const total = contributions.reduce((sum, entry) => sum + entry.contribution, 0);
        const count = contributions.length;
        const reactionClass = total * 4 >= count * 5 ? 'love'
            : total * 4 >= count ? 'like'
            : total * 4 > -count ? 'neutral'
            : total * 4 > -count * 5 ? 'dislike' : 'hate';
        return {
            valid: true, classificationKnown: true, score: total / count, reactionClass, reason: 'matched-preferences',
            matchedPreferences: matches, matchedNamespaces: contributions
        };
    };
    Meeow.semantics = Object.freeze({
        SEMANTIC_PROFILE_VERSION, SEMANTIC_TAG_REGISTRY_VERSION,
        PERSONALITY_AXIS_REGISTRY, SEMANTIC_TAG_REGISTRY,
        OBJECT_VALUES, OBJECT_VALIDITY, STATIC_TOY_SEMANTICS, STATIC_COLLECTIBLE_CONCEPTS,
        validateSemanticRegistry, validateSemanticTags, normalizeSemanticTags, normalizeOptionalFoodTags, hasValidSemanticClassification,
        normalizeObjectSemanticProposal, getItemObjectSemantics, getPrimaryItemInteraction, isSemanticallyUsableItem,
        getStaticToySemantics, getStaticCollectibleSemantics,
        validateSemanticProfile, normalizeSemanticProfile, scoreResidentPreference, derivePersonalityLabels
    });
}(window));
