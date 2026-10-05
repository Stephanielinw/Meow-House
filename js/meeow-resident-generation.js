(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const clean = value => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US') : '';
    const sourceKey = (work, character) => clean(work) && clean(character) ? JSON.stringify([clean(work), clean(character)]) : '';
    const TYPES = Object.freeze({ spouse: '配偶', parent: '家长', child: '子女', sibling: '手足',
        friend: '朋友', ally: '盟友', rival: '对手', enemy: '敌对', mentor: '导师',
        student: '学生', acquaintance: '相识' });
    const RECIPROCAL = Object.freeze({ spouse: 'spouse', parent: 'child', child: 'parent',
        sibling: 'sibling', friend: 'friend', ally: 'ally', rival: 'rival', enemy: 'enemy',
        mentor: 'student', student: 'mentor', acquaintance: 'acquaintance' });
    const validDirectionalState = state => record(state) && Object.keys(state).length === 4 &&
            [['familiarity', 0, 5], ['warmth', -5, 5], ['trust', -5, 5], ['tension', 0, 5]]
                .every(([key, low, high]) => Number.isInteger(state[key]) && state[key] >= low && state[key] <= high);
    const validInitialState = state => state === null || state === undefined ||
        (record(state) && Object.keys(state).length === 2 &&
            validDirectionalState(state.fromNewResident) && validDirectionalState(state.fromTargetResident));

    // Only explicit current-project origin/prompt metadata is considered. The Odyssey
    // bridge is supported by the existing canonical Telemachus/Odysseus pair.
    const sourceFamily = work => {
        const value = clean(work);
        if (/(batman|gotham|蝙蝠侠|哥谭)/u.test(value)) return 'dc-batman-gotham';
        if (/(marvel cinematic universe|\bmcu\b)/u.test(value)) return 'marvel-mcu-compatible';
        if (/(odyssey|奥德赛|greek epic|homeric iliad|trojan cycle|epic cycle|telegony)/u.test(value)) return 'homeric-epic';
        if (/(hades|哈迪斯)/u.test(value) && /(supergiant|game|游戏)/u.test(value)) return 'hades-supergiant';
        return value;
    };
    const builtinIdentities = Object.freeze(Object.fromEntries((Meeow.data?.ALL_BUILTIN_CATS || [])
        .map(cat => {
            const canonicalHallId = cat.hallId || (String(cat.id).startsWith('gotham-') ? 'gotham' : '');
            const hallSource = Meeow.data?.DEFAULT_HALLS?.find(hall => hall.id === canonicalHallId)?.source;
            const work = typeof cat?.origin === 'string' && cat.origin.trim() ? cat.origin : hallSource;
            if (!work || typeof (cat.humanName || cat.name) !== 'string') return null;
            return [String(cat.id), Object.freeze({ characterName: cat.humanName || cat.name,
                sourceWork: work, sourceFamily: sourceFamily(work),
                authority: cat.origin ? 'project-authored-origin' : 'project-authored-hall-and-prompt' })];
        }).filter(Boolean)));
    const getResidentSourceIdentity = (resident, registry = builtinIdentities) => {
        const id = typeof resident === 'string' ? resident : String(resident?.id || '');
        const explicit = record(resident?.sourceIdentity) ? resident.sourceIdentity : null;
        if (explicit && sourceKey(explicit.sourceWork, explicit.characterName)) return {
            characterName: explicit.characterName, sourceWork: explicit.sourceWork,
            sourceFamily: sourceFamily(explicit.sourceWork), authority: 'confirmed-resident' };
        return registry[id] || null;
    };
    const resolveSourceRelationshipCandidates = (sourceWork, cats = [], options = {}) => {
        const family = sourceFamily(sourceWork);
        if (!family) return [];
        const excluded = new Set(options.excludeIds || []);
        return cats.filter(cat => !excluded.has(String(cat?.id)))
            .map(cat => ({ cat, sourceIdentity: getResidentSourceIdentity(cat) }))
            .filter(({ sourceIdentity }) => sourceIdentity?.sourceFamily === family)
            .map(({ cat, sourceIdentity }) => ({ residentId: String(cat.id),
                displayName: String(cat.name || cat.humanName || ''), sourceIdentity }));
    };
    // Hall source metadata and confirmed home residents are the Random world's
    // authority. Visitors and prose-only Hall descriptions cannot add a world.
    const meaningfulHallSource = value => typeof value === 'string' && clean(value).length >= 2 &&
        !/^(unknown|unspecified|custom|none|new hall|自定义|未指定|未知|喵喵馆|新馆舍)$/u.test(clean(value));
    const sourceVersion = work => {
        const value = clean(work);
        const lineage = ['odyssey', 'iliad', 'telegony', 'aeneid', '奥德赛', '伊利亚特', '埃涅阿斯纪']
            .filter(token => value.includes(token));
        const medium = ['film', 'movie', 'tv', 'television', 'series', 'game', 'remake',
            'comic', 'comics', '电影', '电视剧', '动画', '游戏', '漫画', '重制']
            .filter(token => value.includes(token));
        return { lineage, medium };
    };
    const canonicalLineageAlias = work => {
        const value = clean(work);
        if (/^(?:(?:the|homer's|homeric)\s+)?odyssey$/u.test(value)) return 'odyssey';
        if (/^(?:(?:the|homer's|homeric)\s+)?iliad$/u.test(value)) return 'iliad';
        return '';
    };
    const resolveHallWorldviewContext = (hallId, halls = [], cats = []) => {
        const hall = halls.find(row => String(row?.id || '') === String(hallId || ''));
        if (!hall) return { valid: false, error: 'unresolved-hall-worldview', hallId: String(hallId || '') };
        const residents = cats.filter(cat => String(cat?.hallId || '') === String(hall.id) &&
            !cat.isVisiting && !cat.visitOriginHallId)
            .map(cat => ({ cat, sourceIdentity: getResidentSourceIdentity(cat) }))
            .filter(row => row.sourceIdentity && meaningfulHallSource(row.sourceIdentity.sourceWork));
        const works = new Map();
        const add = work => { if (meaningfulHallSource(work) && !works.has(clean(work))) works.set(clean(work), work.trim()); };
        add(hall.source);
        residents.forEach(row => add(row.sourceIdentity.sourceWork));
        const sourceWorks = [...works.values()];
        if (!sourceWorks.length) return { valid: false, error: 'unresolved-hall-worldview',
            hallId: String(hall.id), hallName: String(hall.name || '') };
        const residentSourceIdentities = residents.map(({ cat, sourceIdentity }) => ({
            residentId: String(cat.id), displayName: String(cat.name || cat.humanName || ''),
            characterName: sourceIdentity.characterName, sourceWork: sourceIdentity.sourceWork
        }));
        return { valid: true, hallId: String(hall.id), hallName: String(hall.name || ''),
            worldContext: String(hall.source || ''), sourceWorks,
            sourceFamilies: [...new Set(sourceWorks.map(sourceFamily))], residentSourceIdentities,
            selectionBoundary: 'hall-source-and-confirmed-home-residents',
            boundaryKey: JSON.stringify(sourceWorks.map(clean).sort()) };
    };
    const validateHallWorldSource = (worldview, proposedWork) => {
        if (!worldview?.valid || !Array.isArray(worldview.sourceWorks))
            return { valid: false, error: 'unresolved-hall-worldview' };
        const proposed = clean(proposedWork);
        if (!proposed) return { valid: false, error: 'outside-hall-worldview' };
        const exact = worldview.sourceWorks.find(work => clean(work) === proposed);
        if (exact) return { valid: true, matchedWork: exact, match: 'exact' };
        const family = sourceFamily(proposedWork), version = sourceVersion(proposedWork);
        const aliasLineage = canonicalLineageAlias(proposedWork);
        // Only a named lineage permits a normalized alias. Generic family
        // matches cannot silently broaden a source/version into a franchise.
        if (aliasLineage && version.lineage.length === 1) {
            const alias = worldview.sourceWorks.find(work => {
                const accepted = sourceVersion(work);
                return sourceFamily(work) === family &&
                    accepted.lineage.includes(aliasLineage) &&
                    JSON.stringify(accepted.medium) === JSON.stringify(version.medium);
            });
            if (alias) return { valid: true, matchedWork: alias, match: 'version-aligned-alias' };
        }
        return { valid: false, error: 'outside-hall-worldview' };
    };
    const validateSourceRelationships = (relations, candidates = [], options = {}) => {
        if (!Array.isArray(relations)) return { valid: false, errors: ['invalid-source-relationships'] };
        const ids = new Set(candidates.map(candidate => String(candidate.residentId)));
        const seen = new Set();
        const errors = [];
        const normalized = [];
        for (const relation of relations) {
            const id = String(relation?.targetResidentId || '');
            if (!ids.has(id) || seen.has(id)) { errors.push('invalid-source-target'); continue; }
            seen.add(id);
            if (!Object.hasOwn(TYPES, relation?.relationType)) errors.push('invalid-source-relation-type');
            if (!['high', 'medium'].includes(relation?.confidence)) errors.push('unconfirmed-source-relation');
            if (!validInitialState(relation?.initialRelationshipState)) errors.push('invalid-initial-relationship');
            if (typeof relation?.reviewNote !== 'string' || !relation.reviewNote.trim() || relation.reviewNote.length > 700)
                errors.push('missing-source-relation-note');
            if (!errors.length) normalized.push({ targetResidentId: id, relationType: relation.relationType,
                confidence: relation.confidence, initialRelationshipState: clone(relation.initialRelationshipState || null),
                reviewNote: relation.reviewNote.trim() });
        }
        return { valid: errors.length === 0, errors: [...new Set(errors)], normalized };
    };
    const validateResidentGenerationBundle = (bundle, { halls = [], cats = [], candidates = [],
        requireProvenance = true } = {}) => {
        const errors = [];
        if (!record(bundle) || !record(bundle.identity)) return { valid: false, errors: ['invalid-generation-bundle'] };
        if (!String(bundle.hallId || '').trim() || !halls.some(hall => String(hall.id) === String(bundle.hallId))) errors.push('invalid-hall');
        if (!String(bundle.identity.name || '').trim()) errors.push('missing-name');
        if (!['Secret', 'Male', 'Female', 'Other'].includes(bundle.identity.gender)) errors.push('missing-gender');
        if (Object.hasOwn(bundle.identity, 'eyeColor') || Object.hasOwn(bundle.appearance || {}, 'eyeIdentity'))
            errors.push('independent-eye-authority');
        if (bundle.appearance?.confirmed !== true || !record(bundle.appearance.identityConfig)) errors.push('missing-appearance');
        else {
            const checked = Meeow.catBreeds.validateBreedAppearanceConsistency(bundle.identity.breedId,
                bundle.appearance.identityConfig);
            if (!checked.valid) errors.push(checked.error);
        }
        const ownerId = String(bundle.draftId || bundle.bundleId || bundle.residentId || '');
        const semantic = Meeow.semantics, object = Meeow.objectPreferences;
        const personality = semantic.validateSemanticProfile(bundle.personalityProfile);
        const food = semantic.validateSemanticProfile(bundle.foodPreferenceProfile);
        const objects = object.validateObjectPreferenceProfile(bundle.objectPreferenceProfile);
        if (bundle.personalityProfile?.residentId !== ownerId || !personality.valid ||
            Object.keys(personality.normalized?.personalityAxes || {}).length !== 10) errors.push('invalid-personality');
        if (bundle.foodPreferenceProfile?.residentId !== ownerId || !food.valid ||
            !Object.keys(food.normalized?.preferences?.food || {}).length) errors.push('invalid-food');
        if (bundle.objectPreferenceProfile?.residentId !== ownerId || !objects.valid ||
            !Object.keys(objects.normalized?.preferences || {}).length) errors.push('invalid-object');
        if (!String(bundle.worldContext || '').trim()) errors.push('missing-world-context');
        const isFandom = bundle.mode !== 'oc';
        if (isFandom && !sourceKey(bundle.identity.sourceIdentity?.sourceWork,
            bundle.identity.sourceIdentity?.characterName)) errors.push('missing-source-identity');
        if (!isFandom && (bundle.sourceRelationships || []).length) errors.push('oc-source-relations');
        if (isFandom) {
            const checked = validateSourceRelationships(bundle.sourceRelationships, candidates);
            errors.push(...checked.errors);
        }
        if (requireProvenance && (!record(bundle.creationProvenance) ||
            bundle.creationProvenance.version !== 1 ||
            bundle.creationProvenance.mode !== bundle.mode))
            errors.push('missing-creation-provenance');
        return { valid: errors.length === 0, errors: [...new Set(errors)] };
    };
    const edgeKey = (fromId, toId) => `${fromId}::${toId}`;
    const rebindBatchSourceRelationships = (relations, batchResidentIds) => {
        if (!Array.isArray(relations) || !Array.isArray(batchResidentIds)) return null;
        const output = [];
        for (const relation of relations) {
            const match = /^hall-batch:([1-9]\d*)$/.exec(String(relation.targetResidentId || ''));
            const targetResidentId = match ? batchResidentIds[Number(match[1]) - 1] : relation.targetResidentId;
            if (!targetResidentId) return null;
            output.push({ ...clone(relation), targetResidentId: String(targetResidentId) });
        }
        return output;
    };
    const sourceEdge = (fromId, toId, type, sourceIdentityKey, sourceEventId, at, provenance) => ({
        version: 1, residentId: fromId, otherResidentId: toId, relationType: type,
        sourceIdentityKey, provenance, createdAt: at, sourceEventId
    });
    const applyAcceptedSourceRelationships = ({ user, cats, residentId, relations, sourceIdentityKey,
        sourceEventId, at, provenance = 'ai-proposed-user-confirmed' }) => {
        user.residentSourceRelationships = record(user.residentSourceRelationships) ? user.residentSourceRelationships : {};
        const resident = cats.find(cat => String(cat.id) === residentId);
        if (!resident) throw new Error('missing-new-resident');
        for (const relation of relations) {
            const target = cats.find(cat => String(cat.id) === relation.targetResidentId);
            if (!target) throw new Error('missing-source-target');
            user.residentSourceRelationships[edgeKey(residentId, target.id)] = sourceEdge(residentId,
                String(target.id), relation.relationType, sourceIdentityKey, sourceEventId, at, provenance);
            user.residentSourceRelationships[edgeKey(String(target.id), residentId)] = sourceEdge(
                String(target.id), residentId, RECIPROCAL[relation.relationType], sourceIdentityKey,
                sourceEventId, at, provenance);
            const initial = relation.initialRelationshipState;
            if (initial) {
                resident.residentRelationships ||= {};
                // Initial state has no shared-scene event: it does not fabricate Hall history.
                if (!resident.residentRelationships[String(target.id)]) resident.residentRelationships[String(target.id)] = {
                    ...clone(initial.fromNewResident), tags: [], appliedSceneKeys: [], events: [] };
                target.residentRelationships ||= {};
                if (!target.residentRelationships[residentId]) target.residentRelationships[residentId] = {
                    ...clone(initial.fromTargetResident), tags: [], appliedSceneKeys: [], events: [] };
            }
        }
    };
    const getSourceEdge = (user, fromId, toId) => {
        const edge = user?.residentSourceRelationships?.[edgeKey(String(fromId), String(toId))];
        return edge?.version === 1 && edge.residentId === String(fromId) &&
            edge.otherResidentId === String(toId) && Object.hasOwn(TYPES, edge.relationType) ? edge : null;
    };
    const normalizeSourceRelationships = (raw, cats = []) => {
        if (!record(raw)) return {};
        const ids = new Set(cats.map(cat => String(cat.id)));
        const out = {};
        for (const [key, edge] of Object.entries(raw)) {
            if (!record(edge) || edge.version !== 1 || key !== edgeKey(edge.residentId, edge.otherResidentId) ||
                edge.residentId === edge.otherResidentId || !ids.has(edge.residentId) ||
                !ids.has(edge.otherResidentId) || !Object.hasOwn(RECIPROCAL, edge.relationType) ||
                typeof edge.sourceIdentityKey !== 'string' ||
                typeof edge.createdAt !== 'string' || !Number.isFinite(Date.parse(edge.createdAt))) continue;
            const reverse = raw[edgeKey(edge.otherResidentId, edge.residentId)];
            if (!record(reverse) || reverse.relationType !== RECIPROCAL[edge.relationType] ||
                reverse.sourceEventId !== edge.sourceEventId) continue;
            out[key] = clone(edge);
        }
        return out;
    };
    const createArrivalEvent = ({ eventId, hallId, newResidentIds, audienceResidentIds,
        sourceCreationEventIds, createdAt }) => ({ version: 1, eventId, hallId: String(hallId),
        newResidentIds: [...new Set(newResidentIds.map(String))],
        audienceResidentIds: [...new Set(audienceResidentIds.map(String))],
        sourceCreationEventIds: [...new Set(sourceCreationEventIds.map(String))], createdAt,
        state: 'pending' });
    const normalizeArrivalEvents = raw => {
        if (!record(raw)) return {};
        return Object.fromEntries(Object.entries(raw).filter(([id, event]) =>
            id === event?.eventId && /^resident-arrival-event:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) &&
            event.version === 1 && ['pending', 'completed'].includes(event.state) &&
            typeof event.hallId === 'string' && Array.isArray(event.newResidentIds) &&
            event.newResidentIds.length > 0 && Array.isArray(event.audienceResidentIds) &&
            event.newResidentIds.every(residentId => event.audienceResidentIds.includes(residentId)) &&
            typeof event.createdAt === 'string' && Number.isFinite(Date.parse(event.createdAt)))
            .map(([id, event]) => [id, clone(event)]));
    };
    const getResidentArrivalStatusContext = ({ event, cats, hall, user }) => {
        if (typeof event?.context === 'string' && event.context.trim()) return event.context;
        const names = event.newResidentIds.map(id => cats.find(cat => String(cat.id) === id)).filter(Boolean);
        const audience = event.audienceResidentIds.map(id => cats.find(cat => String(cat.id) === id)).filter(Boolean);
        const sourceRelations = names.flatMap(cat => audience.filter(other => other.id !== cat.id)
            .map(other => ({ from: cat.name, to: other.name, relation: getSourceEdge(user, cat.id, other.id)?.relationType }))
            .filter(row => row.relation).map(row => `${row.from} → ${row.to}: ${TYPES[row.relation]}`));
        return `[RESIDENT ARRIVAL EVENT]\nEvent: ${event.eventId}\nHall: ${hall?.name || event.hallId}\nNew residents: ${names.map(cat => `${cat.id} (${cat.name}; personality: ${cat.personality || ''}; world: ${String(cat.worldContext || '').slice(0, 240)})`).join('; ')}\nFrozen audience: ${audience.map(cat => `${cat.id} (${cat.name})`).join('; ')}\nSource relationships: ${sourceRelations.join('; ') || 'none'}\nGive every new resident an initial current action and inner thought. Give every existing audience resident a natural status that acknowledges the arrival. This event is already authoritative; do not invent or change identities, relationships, preferences, ownership, or inventory.`;
    };
    const validateArrivalPresentation = ({ event, updates, cats }) => {
        if (!event || !Array.isArray(updates) || !Array.isArray(cats)) return false;
        const updateById = new Map(updates.map(update => [String(update?.id || ''), update]));
        const names = event.newResidentIds.map(id => cats.find(cat => String(cat.id) === id)?.name)
            .filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
        const arrivalWords = /新来的|新来|新猫|新成员|新住户|新居民|新伙伴|刚到|刚来|到来|入驻|入住|来客|newcomer|arrival|arrived/iu;
        return event.audienceResidentIds.every(id => {
            const update = updateById.get(String(id));
            if (!update || !String(update.status || '').trim() || !String(update.innerVoice || '').trim()) return false;
            if (event.newResidentIds.includes(id)) return true;
            const prose = `${update.status}\n${update.innerVoice}`;
            return arrivalWords.test(prose) || names.some(name => prose.includes(name));
        });
    };
    Meeow.residentGeneration = Object.freeze({ TYPES, RECIPROCAL, sourceKey, sourceFamily,
        builtinIdentities, getResidentSourceIdentity, resolveSourceRelationshipCandidates,
        resolveHallWorldviewContext, validateHallWorldSource,
        validateSourceRelationships, validateResidentGenerationBundle, edgeKey,
        rebindBatchSourceRelationships,
        applyAcceptedSourceRelationships, getSourceEdge, normalizeSourceRelationships, createArrivalEvent,
        normalizeArrivalEvents, getResidentArrivalStatusContext, validateArrivalPresentation });
}(typeof window !== 'undefined' ? window : globalThis));
