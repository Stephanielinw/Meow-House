(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const drafts = Meeow.adoptionDrafts, breeds = Meeow.catBreeds, visual = Meeow.residentVisual;
    const semantics = Meeow.semantics, objects = Meeow.objectPreferences;
    const generation = Meeow.residentGeneration;
    if (![drafts, breeds, visual, semantics, objects].every(Boolean))
        throw new Error('Fandom generation requires Adoption and profile authorities.');
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length &&
        keys.every(key => Object.hasOwn(value, key));
    const nonempty = (value, limit = 4000) => typeof value === 'string' && !!value.trim() && value.length <= limit;
    const fail = (code, generationId = null, detail = '') => ({ ok: false, error: code, generationId, detail });
    const NOTE_KEYS = ['identitySummary', 'personalityBasis', 'appearanceBasis', 'preferenceBasis', 'adaptationNotes'];
    const PROPOSAL_KEYS = ['gender', 'breedId', 'identityConfig', 'personalityAxes', 'foodPreferences', 'objectPreferences', 'worldContext'];
    const FAILURE = { unrecognized: 'source-unrecognized', ambiguous: 'source-ambiguous',
        'insufficient-confidence': 'source-insufficient-confidence' };
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const secureUUID = () => {
        if (typeof global.crypto?.randomUUID === 'function') return global.crypto.randomUUID();
        if (typeof global.crypto?.getRandomValues !== 'function') throw new Error('Secure UUID generation is unavailable.');
        const bytes = global.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };

    const buildFandomPrompt = ({ mode = 'invite', characterName, sourceWork, relationshipCandidates = [],
        occupiedSourceIdentities = [], worldview = null }) => {
        if (mode !== 'random' && (!nonempty(characterName, 160) || !nonempty(sourceWork, 240))) return null;
        if (mode === 'random' && !worldview?.valid) return null;
        const breedTable = breeds.listProductionBreeds().map(row =>
            [row.breedId, row.displayName, row.description]);
        const axisTable = Object.fromEntries(Object.entries(semantics.PERSONALITY_AXIS_REGISTRY)
            .map(([id, rule]) => [id, [rule.negative, rule.positive]]));
        const foodTable = Object.fromEntries(Object.entries(semantics.SEMANTIC_TAG_REGISTRY.food.namespaces)
            .map(([id, rule]) => [id, rule.values]));
        return [
            'Return exactly one clean JSON object. Use knowledge of the specified fictional source only; no research, quotes, citations, episode numbers, page numbers, or URLs.',
            ...(mode === 'random' ? [
                'RANDOM MODE: Select one confidently recognized FICTIONAL character who belongs to the PROGRAM-supplied CURRENT HALL WORLDVIEW. Choose only within the allowed source works/versions below. Do not introduce a new work, franchise, mythology, universe, adaptation family, or setting. A real person, actor as themselves, politician, influencer, or historical person is forbidden.',
                'CURRENT HALL WORLDVIEW (PROGRAM authority): ' + JSON.stringify({
                    hallId: worldview.hallId, hallName: worldview.hallName,
                    worldContext: worldview.worldContext, sourceWorks: worldview.sourceWorks,
                    sourceFamilies: worldview.sourceFamilies,
                    selectionBoundary: worldview.selectionBoundary,
                    residentSourceIdentities: worldview.residentSourceIdentities
                }),
                'Choose a new character from one of these established source works. For sourceWork, use an allowed sourceWork label exactly when possible. Any version ambiguity must produce insufficient-confidence, not a cross-version guess.',
                'Choose characterName and sourceWork in this SAME response as the complete proposal. Do not invent a resident, draft, generation, Hall, event, or provenance ID.',
                'Occupied confirmed and active-draft source identities (do not choose any matching work+character): ' + JSON.stringify(occupiedSourceIdentities),
                'For sourceGrounding include identityKind:fictional-character. If uncertain about fictional status, identity, or version, return insufficient-confidence with proposal:null.'
            ] : [
                'USER characterName (echo exactly): ' + JSON.stringify(characterName),
                'USER sourceWork (echo exactly): ' + JSON.stringify(sourceWork)
            ]),
            'Stay within the selected work/version. Do not blend adaptations or silently choose a similarly named character. If recognition or version is uncertain, return an informational failure state with ambiguityNote and proposal:null.',
            'Separate source-grounded facts from Meeow House feline adaptations in reviewNotes. Breed is a feline visual adaptation, never a claim about human canon. Do not mechanically derive body, Food, or Object preferences from gender, morality, MBTI, or personality stereotypes.',
            'Use 0 freely for personality; ±2 only for repeated defining behavior. Prefer 2–5 Food tags and 1–4 Object tags; both must be nonempty. Choose matching eyes unless source evidence or a documented strong adaptation supports heterochromia.',
            'gender=' + JSON.stringify(drafts.GENDERS),
            'breedId registry [id,name,phenotype]=' + JSON.stringify(breedTable) + '; choose mixed when no specific breed honestly fits.',
            'identityConfig must contain ALL fields from this exact default shape: ' + JSON.stringify(visual.DEFAULT_CONFIG),
            'closed structural options=' + JSON.stringify(visual.OPTIONS),
            'coat=' + JSON.stringify(visual.COATS) + ' or #RRGGBB; marking colors=' + JSON.stringify(visual.MARKS) + ' or #RRGGBB; muzzleColor=' + JSON.stringify(visual.MUZZLES) + '; eyeLeft/eyeRight=' + JSON.stringify(visual.EYES) + ' or #RRGGBB.',
            'personalityAxes: exactly these ten keys, integer -2..2; [negative,positive] meanings=' + JSON.stringify(axisTable),
            'foodPreferences: map of namespace:value to -2,-1,1,2; namespaces=' + JSON.stringify(foodTable),
            'objectPreferences: map of tag to -2,-1,1,2; tags=' + JSON.stringify(objects.TAGS) + '; no role:* tags.',
            'worldContext: concise Meeow House background tied to the specified source, not a full scene.',
            'SOURCE RELATIONSHIP CANDIDATES (PROGRAM-owned IDs; only these IDs may appear): ' + JSON.stringify(relationshipCandidates),
            'sourceRelationships must be an array. Include only well-supported relations for the named source/version, or [] if none. Each entry: {targetResidentId,relationType,confidence:high|medium,initialRelationshipState:null|{fromNewResident:{familiarity:0..5,warmth:-5..5,trust:-5..5,tension:0..5},fromTargetResident:{same four bounded fields}},reviewNote}. Allowed relationType: ' + JSON.stringify(Object.keys(generation?.TYPES || {})) + '. Do not infer from name similarity or invent a resident ID. Both directional states describe this portrayal; never derive them mechanically from relation type.',
            'Never output asset paths, filenames, sprite IDs, URLs, Hall IDs, draft/resident/event IDs, timestamps, revisions, or provenance.',
            'Exact top-level keys: version=1,result,sourceGrounding,proposal,reviewNotes. result=proposal|unrecognized|ambiguous|insufficient-confidence. sourceGrounding={characterName,sourceWork,confidence:high|medium|low,ambiguityNote:null|string' + (mode === 'random' ? ',identityKind:fictional-character|real-person|uncertain' : '') + '}. proposal={gender,breedId,identityConfig,personalityAxes,foodPreferences,objectPreferences,worldContext,sourceRelationships} or null on failure. reviewNotes={identitySummary,personalityBasis,appearanceBasis,preferenceBasis,adaptationNotes}. No other keys.',
            'Low confidence must produce insufficient-confidence, not a proposal. Return JSON only.'
        ].join('\n');
    };
    const parseFandomResponse = raw => {
        if (typeof raw !== 'string') return fail('malformed-response');
        try { const envelope = JSON.parse(raw.trim());
            return record(envelope) ? { ok: true, envelope } : fail('malformed-response');
        } catch (_) { return fail('malformed-response'); }
    };
    const validateFandomResponse = (envelope, { mode = 'invite', characterName, sourceWork,
        relationshipCandidates = [], worldview = null }) => {
        if (!exact(envelope, ['version', 'result', 'sourceGrounding', 'proposal', 'reviewNotes']) ||
            envelope.version !== 1 || !['proposal', ...Object.keys(FAILURE)].includes(envelope.result) ||
            !exact(envelope.sourceGrounding, ['characterName', 'sourceWork', 'confidence', 'ambiguityNote',
                ...(mode === 'random' ? ['identityKind'] : [])]))
            return fail('malformed-response');
        const ground = envelope.sourceGrounding;
        if (!nonempty(ground.characterName, 160) || !nonempty(ground.sourceWork, 240) ||
            (mode !== 'random' && drafts.keyForSourceIdentity(ground.sourceWork, ground.characterName) !==
                drafts.keyForSourceIdentity(sourceWork, characterName))) return fail('source-identity-mismatch');
        if (mode === 'random') {
            const boundary = generation?.validateHallWorldSource(worldview, ground.sourceWork);
            if (!boundary?.valid) return fail(boundary?.error || 'unresolved-hall-worldview');
        }
        if (mode === 'random' && ground.identityKind !== 'fictional-character') return fail('nonfictional-or-uncertain-identity');
        if (!['high', 'medium', 'low'].includes(ground.confidence) ||
            !(ground.ambiguityNote === null || nonempty(ground.ambiguityNote, 700)))
            return fail('malformed-response');
        // Informational failures never inspect or accept accidentally supplied proposal fields.
        if (envelope.result !== 'proposal') return fail(FAILURE[envelope.result], null,
            ground.ambiguityNote || 'The requested source identity could not be established.');
        if (ground.confidence === 'low') return fail('source-insufficient-confidence');
        if (!(exact(envelope.proposal, PROPOSAL_KEYS) || exact(envelope.proposal, [...PROPOSAL_KEYS, 'sourceRelationships'])) ||
            !exact(envelope.reviewNotes, NOTE_KEYS) ||
            NOTE_KEYS.some(key => !nonempty(envelope.reviewNotes[key], 1200))) return fail('malformed-response');
        const p = envelope.proposal;
        if ((mode === 'random' || relationshipCandidates.length) && !Object.hasOwn(p, 'sourceRelationships'))
            return fail('missing-source-relationships');
        if (!drafts.GENDERS.includes(p.gender)) return fail('unsupported-gender');
        if (!breeds.getBreed(p.breedId)) return fail('unsupported-breed');
        if (!exact(p.identityConfig, Object.keys(visual.DEFAULT_CONFIG))) return fail('invalid-appearance');
        let config;
        try { config = visual.canonicalizeIdentity(p.identityConfig); }
        catch (_) { return fail('invalid-appearance'); }
        const compatible = breeds.validateBreedAppearanceConsistency(p.breedId, config);
        if (!compatible.valid) return fail(compatible.error === 'breedAppearanceMismatch'
            ? 'breed-appearance-mismatch' : compatible.error);
        const axes = Object.keys(semantics.PERSONALITY_AXIS_REGISTRY);
        if (!exact(p.personalityAxes, axes) || axes.some(key => !Number.isInteger(p.personalityAxes[key]) ||
            p.personalityAxes[key] < -2 || p.personalityAxes[key] > 2)) return fail('invalid-personality');
        if (!record(p.foodPreferences) || !Object.keys(p.foodPreferences).length ||
            Object.values(p.foodPreferences).some(weight => ![-2, -1, 1, 2].includes(weight)))
            return fail('invalid-food-profile');
        if (!record(p.objectPreferences) || !Object.keys(p.objectPreferences).length) return fail('invalid-object-profile');
        if (!nonempty(p.worldContext)) return fail('invalid-world-context');
        const personality = semantics.validateSemanticProfile({ semanticProfileVersion: 1,
            residentId: 'proposal-validation', personalityAxes: p.personalityAxes, preferences: { food: {} } });
        const food = semantics.validateSemanticProfile({ semanticProfileVersion: 1,
            residentId: 'proposal-validation', personalityAxes: {}, preferences: { food: p.foodPreferences } });
        const object = objects.validateObjectPreferenceProfile({ version: 1, residentId: 'proposal-validation',
            preferences: p.objectPreferences, provenance: { authority: 'ai-confirmed' } });
        if (!personality.valid) return fail('invalid-personality');
        if (!food.valid) return fail('invalid-food-profile');
        if (!object.valid) return fail('invalid-object-profile');
        const relationships = generation?.validateSourceRelationships(p.sourceRelationships || [], relationshipCandidates);
        if (relationships && !relationships.valid) return fail(relationships.errors[0]);
        return { ok: true, value: { sourceGrounding: { characterName: mode === 'random' ? ground.characterName.trim() : characterName,
            sourceWork: mode === 'random' ? ground.sourceWork.trim() : sourceWork,
            confidence: ground.confidence, ambiguityNote: ground.ambiguityNote,
            ...(mode === 'random' ? { identityKind: ground.identityKind } : {}) },
            proposal: { gender: p.gender, breedId: p.breedId, identityConfig: config,
                personalityAxes: clone(personality.normalized.personalityAxes),
                foodPreferences: clone(food.normalized.preferences.food),
                objectPreferences: clone(object.normalized.preferences),
                worldContext: p.worldContext.trim(), sourceRelationships: clone(relationships?.normalized || []) },
            reviewNotes: clone(envelope.reviewNotes) } };
    };
    const createGenerator = ({ draftService, getState, requestStructured, uuid = secureUUID }) => {
        if (!draftService || typeof getState !== 'function' || typeof requestStructured !== 'function')
            throw new TypeError('Generator requires draft service, state, and shared structured transport.');
        const generateFandomResidentProposal = async ({ draftId, characterName, sourceWork, expectedRevision } = {}) => {
            const draft = draftService.read(draftId);
            if (!draft || !['fandom-invite', 'fandom-random'].includes(draft.mode) ||
                !['editing', 'ready'].includes(draft.status)) return fail('invalid-fandom-draft');
            const mode = draft.mode === 'fandom-random' ? 'random' : 'invite';
            if (mode === 'invite' && !nonempty(characterName, 160)) return fail('missing-character-name');
            if (mode === 'invite' && !nonempty(sourceWork, 240)) return fail('missing-source-work');
            if (expectedRevision !== undefined && expectedRevision !== draft.revision) return fail('stale-draft');
            const previousKey = drafts.keyForSourceIdentity(draft.identity?.sourceIdentity?.sourceWork,
                draft.identity?.sourceIdentity?.characterName);
            if (mode === 'invite' && previousKey && previousKey !== drafts.keyForSourceIdentity(sourceWork, characterName))
                return fail('source-identity-changed');
            const state = getState();
            const worldview = mode === 'random' ? generation?.resolveHallWorldviewContext(
                draft.hallId, state.halls, state.cats) : null;
            if (mode === 'random' && !worldview?.valid) return fail('unresolved-hall-worldview');
            const relationshipCandidates = mode === 'random' ? (state.cats || []).map(cat => ({
                residentId: String(cat.id), displayName: String(cat.name || cat.humanName || ''),
                sourceIdentity: generation?.getResidentSourceIdentity(cat) }))
                .filter(row => row.sourceIdentity && generation.validateHallWorldSource(
                    worldview, row.sourceIdentity.sourceWork).valid).slice(0, 100)
                : generation?.resolveSourceRelationshipCandidates(sourceWork, state.cats) || [];
            const occupiedSourceIdentities = [
                ...(state.cats || []).map(cat => generation?.getResidentSourceIdentity(cat)).filter(Boolean),
                ...Object.values(state.user.adoptionDrafts || {}).filter(row => row.draftId !== draftId &&
                    row.status !== 'cancelled' && row.status !== 'confirmed' && row.mode !== 'oc')
                    .map(row => row.identity?.sourceIdentity).filter(Boolean)
            ].map(row => ({ characterName: row.characterName, sourceWork: row.sourceWork }));
            const candidate = { ...draft, identity: { ...draft.identity, sourceIdentity: { characterName, sourceWork } } };
            if (mode === 'invite' && drafts.findDuplicateSourceIdentity(candidate, state.cats, state.user.adoptionDrafts))
                return fail('duplicate-source-identity');
            const generationId = 'fandom-generation:' + uuid();
            if (!UUID.test(generationId.slice(18)) || generationId === draft.fandomGeneration?.generationId)
                return fail('invalid-generation-id');
            let raw;
            try { raw = await requestStructured(buildFandomPrompt({ mode, characterName, sourceWork,
                relationshipCandidates, occupiedSourceIdentities, worldview }), {
                systemPrompt: 'Produce one source-faithful, closed JSON proposal for Meeow House. State uncertainty honestly. No citations, quotations, or extra fields.',
                maxTokens: 3600, label: 'FANDOM PROPOSAL · ' + (mode === 'random' ? '随机捡猫' : characterName.trim()),
                priority: 'foreground', origin: 'user-action', originSurface: 'adoption',
                // The shared transport's foreground error dialog can start a new
                // retry round. Suppress that dialog so this explicit attempt
                // settles after one provider request; future UI owns retry.
                uiMode: 'background', maxAttempts: 1 }); }
            catch (cause) { return fail(/timeout/i.test(String(cause?.name || '') + String(cause?.message || ''))
                ? 'ai-timeout' : 'ai-request-failed', generationId); }
            const parsed = parseFandomResponse(raw);
            if (!parsed.ok) return { ...parsed, generationId };
            if (mode === 'random') {
                const currentState = getState();
                const currentWorldview = generation.resolveHallWorldviewContext(draft.hallId,
                    currentState.halls, currentState.cats);
                if (!currentWorldview.valid || currentWorldview.boundaryKey !== worldview.boundaryKey)
                    return fail('stale-worldview', generationId);
            }
            const selectedWork = parsed.envelope?.sourceGrounding?.sourceWork;
            const advertisedIds = new Set(relationshipCandidates.map(row => row.residentId));
            const scopedCandidates = mode === 'random'
                ? (generation?.resolveSourceRelationshipCandidates(selectedWork, state.cats) || [])
                    .filter(row => advertisedIds.has(row.residentId)) : relationshipCandidates;
            const checked = validateFandomResponse(parsed.envelope, { mode, characterName, sourceWork,
                relationshipCandidates: scopedCandidates, worldview });
            if (!checked.ok) return { ...checked, generationId };
            const selected = checked.value.sourceGrounding;
            if (drafts.findDuplicateSourceIdentity({ ...draft, identity: { ...draft.identity,
                sourceIdentity: { characterName: selected.characterName, sourceWork: selected.sourceWork } } },
                state.cats, state.user.adoptionDrafts)) return fail('duplicate-source-identity', generationId);
            const applied = draftService.applyFandomProposal(draftId, checked.value, generationId, draft.revision);
            return applied.ok ? { ok: true, generationId, draft: applied.draft,
                review: checked.value.sourceGrounding.confidence === 'medium'
                    ? 'prominent-review-required' : 'review-required' } : { ...applied, generationId };
        };
        return Object.freeze({ generateFandomResidentProposal });
    };
    const createReviewModel = (draft, context = {}) => ({
        ...drafts.previewAdoptionDraft(draft, context),
        characterName: draft?.identity?.sourceIdentity?.characterName || '',
        sourceWork: draft?.identity?.sourceIdentity?.sourceWork || '',
        confidence: draft?.fandomGeneration?.sourceGrounding?.confidence || null,
        sourceGrounding: clone(draft?.fandomGeneration?.sourceGrounding || null),
        reviewNotes: clone(draft?.fandomGeneration?.reviewNotes || null),
        sourceRelationships: clone(draft?.sourceRelationships || []),
        reviewState: draft?.fandomReview?.state || 'needs-regeneration',
        generationId: draft?.fandomGeneration?.generationId || null,
        reviewRequired: draft?.fandomReview?.state !== 'accepted'
    });
    Meeow.fandomResidentGenerator = Object.freeze({ buildFandomPrompt, parseFandomResponse,
        validateFandomResponse, createGenerator, createReviewModel });
}(typeof window !== 'undefined' ? window : globalThis));
