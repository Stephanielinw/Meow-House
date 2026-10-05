(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const visual = Meeow.residentVisual;
    const catBreeds = Meeow.catBreeds;
    const semantics = Meeow.semantics;
    const objects = Meeow.objectPreferences;
    const generation = Meeow.residentGeneration;
    if (!visual || !catBreeds || !semantics || !objects) throw new Error('Adoption drafts require resident visual, breed, and preference validators.');

    const VERSION = 1;
    const MODES = Object.freeze(['oc', 'fandom-invite', 'fandom-random']);
    const STATUSES = Object.freeze(['editing', 'ready', 'confirmed', 'cancelled']);
    const GENDERS = Object.freeze(['Secret', 'Male', 'Female', 'Other']);
    const BREED_REGISTRY = catBreeds.BREED_REGISTRY;
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const nonempty = value => typeof value === 'string' && Boolean(value.trim());
    const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
    const secureUUID = () => {
        if (typeof global.crypto?.randomUUID === 'function') return global.crypto.randomUUID();
        if (typeof global.crypto?.getRandomValues !== 'function') throw new Error('Secure UUID generation is unavailable.');
        const bytes = global.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
    const keyForSourceIdentity = (sourceWork, characterName) => {
        const clean = value => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US') : '';
        const work = clean(sourceWork), character = clean(characterName);
        return work && character ? JSON.stringify([work, character]) : '';
    };
    const deriveEyeIdentity = identityConfig => {
        const config = visual.canonicalizeIdentity(identityConfig);
        return Object.freeze({ left: config.eyeLeft, right: config.eyeRight,
            heterochromia: config.eyeLeft !== config.eyeRight });
    };
    const EYE_LABELS = Object.freeze({ original: '原色', blue: '蓝色', gold: '金色', green: '绿色' });
    const eyeColorDisplay = identityConfig => {
        const eyes = deriveEyeIdentity(identityConfig);
        const label = value => EYE_LABELS[value] || value;
        return eyes.heterochromia ? `左眼${label(eyes.left)} / 右眼${label(eyes.right)}` : label(eyes.left);
    };
    const residentEyeColorDisplay = resident => {
        if (resident?.creationProvenance?.version === 1) {
            const saved = visual.normalizeVisual(resident.visual);
            if (saved) return eyeColorDisplay(saved.identityConfig);
        }
        return resident?.eyeColor || '';
    };
    const validateBreedAppearanceConsistency = catBreeds.validateBreedAppearanceConsistency;
    const draftIdValid = value => typeof value === 'string' && value.startsWith('adoption-draft:') && UUID.test(value.slice(15));
    const normalizeDraftStore = raw => {
        if (!record(raw)) return {};
        const out = {};
        for (const [id, draft] of Object.entries(raw)) {
            if (!draftIdValid(id) || !record(draft) || draft.version !== VERSION || draft.draftId !== id ||
                !MODES.includes(draft.mode) || !STATUSES.includes(draft.status) || !iso(draft.createdAt) ||
                !iso(draft.updatedAt) || !Number.isSafeInteger(draft.revision) || draft.revision < 0 ||
                !record(draft.identity) || typeof draft.hallId !== 'string') continue;
            if (draft.status === 'confirmed' &&
                (!nonempty(draft.confirmedResidentId) || !UUID.test(draft.confirmedResidentId.slice(9)) ||
                    !draft.confirmedResidentId.startsWith('resident:') ||
                    !nonempty(draft.adoptionEventId) || !draft.adoptionEventId.startsWith('resident-adoption-event:') ||
                    !UUID.test(draft.adoptionEventId.slice(24)))) continue;
            out[id] = clone(draft);
        }
        return out;
    };
    const sourceKeyForDraft = draft => draft?.mode === 'oc' ? '' : keyForSourceIdentity(
        draft?.identity?.sourceIdentity?.sourceWork, draft?.identity?.sourceIdentity?.characterName);
    const sourceKeyForResident = resident => keyForSourceIdentity(
        resident?.sourceIdentity?.sourceWork || resident?.sourceWork,
        resident?.sourceIdentity?.characterName || resident?.name);
    const findDuplicateSourceIdentity = (draft, cats = [], drafts = {}) => {
        const key = sourceKeyForDraft(draft);
        if (!key) return null;
        const familyKey = generation?.sourceKey(generation.sourceFamily(
            draft.identity?.sourceIdentity?.sourceWork), draft.identity?.sourceIdentity?.characterName);
        for (const resident of cats) if (sourceKeyForResident(resident) === key ||
            (familyKey && (() => { const source = generation.getResidentSourceIdentity(resident);
                return source && generation.sourceKey(source.sourceFamily, source.characterName) === familyKey; })()))
            return { kind: 'resident', id: String(resident.id) };
        for (const other of Object.values(drafts)) if (other?.draftId !== draft.draftId &&
            other?.status !== 'cancelled' && other?.status !== 'confirmed' &&
            (sourceKeyForDraft(other) === key || (familyKey && generation.sourceKey(
                generation.sourceFamily(other.identity?.sourceIdentity?.sourceWork),
                other.identity?.sourceIdentity?.characterName) === familyKey)))
            return { kind: 'draft', id: other.draftId };
        return null;
    };
    const profileCheck = (profile, draftId, part) => {
        if (!record(profile) || profile.residentId !== draftId) return false;
        const checked = part === 'object' ? objects.validateObjectPreferenceProfile(profile)
            : semantics.validateSemanticProfile(profile);
        if (!checked.valid) return false;
        if (part === 'personality') return Object.keys(checked.normalized.personalityAxes).length > 0;
        if (part === 'food') return Object.keys(checked.normalized.preferences.food).length > 0 &&
            Object.values(checked.normalized.preferences.food).every(weight => [-2, -1, 1, 2].includes(weight));
        return Object.keys(checked.normalized.preferences).length > 0;
    };
    const validateAdoptionDraftForCommit = (draft, { halls = [], cats = [], drafts = {},
        breedRegistry = BREED_REGISTRY, requireFandomReview = true } = {}) => {
        const errors = [];
        if (!record(draft) || !draftIdValid(draft.draftId) || draft.version !== VERSION || !MODES.includes(draft.mode))
            return { valid: false, errors: ['invalid-draft'] };
        if (!['editing', 'ready'].includes(draft.status)) errors.push('inactive-draft');
        if (!nonempty(draft.hallId) || !halls.some(hall => String(hall?.id) === draft.hallId)) errors.push('invalid-hall');
        if (!nonempty(draft.identity?.name)) errors.push('missing-name');
        if (!GENDERS.includes(draft.identity?.gender)) errors.push('missing-gender');
        if (!nonempty(draft.identity?.breedId)) errors.push('missing-breed');
        if (Object.hasOwn(draft.identity || {}, 'eyeColor') || Object.hasOwn(draft.appearance || {}, 'eyeIdentity'))
            errors.push('independent-eye-authority');
        if (draft.appearance?.confirmed !== true || !record(draft.appearance.identityConfig)) errors.push('missing-appearance');
        else {
            const breed = validateBreedAppearanceConsistency(draft.identity.breedId, draft.appearance.identityConfig, breedRegistry);
            if (!breed.valid) errors.push(breed.error);
        }
        if (!profileCheck(draft.personalityProfile, draft.draftId, 'personality')) errors.push('invalid-personality');
        if (!profileCheck(draft.foodPreferenceProfile, draft.draftId, 'food')) errors.push('invalid-food');
        if (!profileCheck(draft.objectPreferenceProfile, draft.draftId, 'object')) errors.push('invalid-object');
        if (!nonempty(draft.worldContext)) errors.push('missing-world-context');
        if (draft.mode !== 'oc') {
            if (!sourceKeyForDraft(draft)) errors.push('missing-source-identity');
            else if (findDuplicateSourceIdentity(draft, cats, drafts)) errors.push('duplicate-source-identity');
            if (draft.mode === 'fandom-random') {
                const worldview = generation?.resolveHallWorldviewContext(draft.hallId, halls, cats);
                const boundary = generation?.validateHallWorldSource(worldview,
                    draft.identity?.sourceIdentity?.sourceWork);
                if (!boundary?.valid) errors.push(boundary?.error || 'unresolved-hall-worldview');
            }
            if (requireFandomReview && (!draft.fandomGeneration?.generationId ||
                draft.fandomGeneration.sourceIdentityKey !== sourceKeyForDraft(draft) ||
                draft.fandomReview?.state !== 'accepted' ||
                draft.fandomReview.generationId !== draft.fandomGeneration.generationId))
                errors.push('fandom-review-required');
        }
        if (generation) {
            const candidates = generation.resolveSourceRelationshipCandidates(
                draft.identity?.sourceIdentity?.sourceWork, cats);
            const shared = generation.validateResidentGenerationBundle(draft, {
                halls, cats, candidates, requireProvenance: false });
            errors.push(...shared.errors);
        }
        return { valid: errors.length === 0, errors: [...new Set(errors)] };
    };
    const previewAdoptionDraft = (draft, context = {}) => {
        const checked = validateAdoptionDraftForCommit(draft, context);
        const breed = catBreeds.getBreed(draft?.identity?.breedId, context.breedRegistry || BREED_REGISTRY);
        const compatibility = draft?.appearance?.identityConfig && draft?.identity?.breedId
            ? validateBreedAppearanceConsistency(draft.identity.breedId, draft.appearance.identityConfig,
                context.breedRegistry || BREED_REGISTRY) : null;
        const firstMismatch = compatibility?.errors?.[0];
        const mismatchReason = firstMismatch ? ({ body: '体型与所选品种不符', ear: '耳型与所选品种不符',
            tail: '尾型与所选品种不符', face: '面部花纹与所选品种不符' }[firstMismatch.field] || '外观与所选品种不符') : '';
        let eyes = null;
        try { if (draft?.appearance?.identityConfig) eyes = deriveEyeIdentity(draft.appearance.identityConfig); } catch (_) { /* incomplete draft */ }
        return { draftId: draft?.draftId || '', mode: draft?.mode || '', name: draft?.identity?.name || '',
            gender: draft?.identity?.gender || '', sourceIdentity: clone(draft?.identity?.sourceIdentity || null),
            breedId: draft?.identity?.breedId || '', breedLabel: breed?.displayName || '',
            breedCompatibility: compatibility ? { valid: compatibility.valid,
                code: compatibility.valid ? '' : compatibility.error, reason: mismatchReason } : null, eyeIdentity: eyes,
            identityConfig: clone(draft?.appearance?.identityConfig || null),
            personalitySummary: semantics.derivePersonalityLabels(draft?.personalityProfile || null),
            foodPreferenceSummary: Object.entries(draft?.foodPreferenceProfile?.preferences?.food || {}).map(([tag, weight]) =>
                ({ tag, label: Meeow.inventory?.FOOD_ATTRIBUTE_LABELS?.[tag] || tag, weight })),
            objectPreferenceSummary: Object.entries(draft?.objectPreferenceProfile?.preferences || {}).map(([tag, weight]) =>
                ({ tag, label: objects.DISPLAY_LABELS[tag] || tag, weight })),
            worldContext: draft?.worldContext || '', complete: checked.valid, errors: checked.errors };
    };
    const createService = ({ getState, persistSnapshot, publish, defaultAffinity = 25,
        isEligibleArrivalAudience = cat => !cat.isOut && !cat.isVisiting && !cat.curatorRoomPresence,
        uuid = secureUUID, now = () => new Date().toISOString() }) => {
        const current = () => getState();
        const transact = (modify, publishChange) => {
            const snapshot = clone(current());
            const outcome = modify(snapshot);
            if (!outcome?.ok) return outcome;
            let persisted = false;
            try { persisted = persistSnapshot(snapshot) === true; } catch (_) { persisted = false; }
            if (!persisted) return { ok: false, error: 'save-failed' };
            publish(publishChange(snapshot, outcome));
            return outcome;
        };
        const create = ({ mode, hallId }) => {
            if (!MODES.includes(mode) || !nonempty(hallId) || !current().halls.some(hall => String(hall.id) === String(hallId)))
                return { ok: false, error: 'invalid-create-input' };
            const id = `adoption-draft:${uuid()}`;
            if (!draftIdValid(id) || current().user.adoptionDrafts?.[id]) return { ok: false, error: 'draft-id-collision' };
            const at = now();
            const draft = { version: VERSION, draftId: id, mode, status: 'editing', createdAt: at,
                updatedAt: at, revision: 0, hallId: String(hallId), identity: {}, appearance: null,
                personalityProfile: null, foodPreferenceProfile: null, objectPreferenceProfile: null,
                sourceRelationships: [], worldContext: '' };
            return transact(snapshot => {
                snapshot.user.adoptionDrafts = normalizeDraftStore(snapshot.user.adoptionDrafts);
                snapshot.user.adoptionDrafts[id] = draft;
                return { ok: true, draft: clone(draft) };
            }, snapshot => ({ drafts: snapshot.user.adoptionDrafts }));
        };
        const read = id => clone(current().user.adoptionDrafts?.[id] || null);
        const change = (id, transform, expectedRevision, { skipFandomInvalidation = false } = {}) => transact(snapshot => {
            snapshot.user.adoptionDrafts = normalizeDraftStore(snapshot.user.adoptionDrafts);
            const draft = snapshot.user.adoptionDrafts[id];
            if (!draft || !['editing', 'ready'].includes(draft.status)) return { ok: false, error: 'inactive-draft' };
            if (expectedRevision !== undefined && draft.revision !== expectedRevision) return { ok: false, error: 'stale-draft' };
            const prior = clone(draft);
            const error = transform(draft, snapshot);
            if (error) return { ok: false, error };
            if (!skipFandomInvalidation && draft.mode !== 'oc' && prior.fandomGeneration) {
                const oldSource = JSON.stringify(prior.identity?.sourceIdentity || null);
                const newSource = JSON.stringify(draft.identity?.sourceIdentity || null);
                if (oldSource !== newSource) {
                    draft.identity.name = draft.identity?.sourceIdentity?.characterName || '';
                    draft.identity.gender = undefined;
                    draft.identity.breedId = undefined;
                    draft.appearance = null;
                    draft.personalityProfile = null;
                    draft.foodPreferenceProfile = null;
                    draft.objectPreferenceProfile = null;
                    draft.sourceRelationships = [];
                    draft.worldContext = '';
                    draft.fandomGeneration = null;
                    draft.fandomReview = { version: 1, state: 'needs-regeneration', generationId: null, reviewedAt: null };
                    draft.status = 'editing';
                } else if (['name', 'gender', 'breedId'].some(key => prior.identity?.[key] !== draft.identity?.[key]) ||
                    ['appearance', 'personalityProfile', 'foodPreferenceProfile', 'objectPreferenceProfile', 'sourceRelationships', 'worldContext']
                        .some(key => JSON.stringify(prior[key]) !== JSON.stringify(draft[key]))) {
                    const corrected = ['name', 'gender', 'breedId'].some(key => prior.identity?.[key] !== draft.identity?.[key]) ||
                        ['personalityProfile', 'foodPreferenceProfile', 'objectPreferenceProfile', 'sourceRelationships', 'worldContext']
                            .some(key => JSON.stringify(prior[key]) !== JSON.stringify(draft[key])) ||
                        JSON.stringify(prior.appearance?.identityConfig) !== JSON.stringify(draft.appearance?.identityConfig);
                    if (corrected) draft.fandomGeneration.hasUserCorrections = true;
                    draft.fandomReview = { version: 1, state: 'pending',
                        generationId: prior.fandomGeneration.generationId, reviewedAt: null };
                    draft.status = 'editing';
                }
            }
            draft.revision += 1;
            draft.updatedAt = now();
            return { ok: true, draft: clone(draft) };
        }, snapshot => ({ drafts: snapshot.user.adoptionDrafts }));
        const update = (id, patch, expectedRevision) => change(id, draft => {
            if (!record(patch) || Object.keys(patch).some(key => !['identity', 'personalityProfile', 'foodPreferenceProfile', 'objectPreferenceProfile', 'sourceRelationships', 'worldContext'].includes(key)))
                return 'invalid-patch';
            if (Object.hasOwn(patch, 'identity')) {
                if (!record(patch.identity) || Object.keys(patch.identity).some(key => !['name', 'gender', 'breedId', 'sourceIdentity'].includes(key))) return 'invalid-identity';
                draft.identity = { ...draft.identity, ...clone(patch.identity) };
            }
            for (const key of ['personalityProfile', 'foodPreferenceProfile', 'objectPreferenceProfile', 'sourceRelationships', 'worldContext'])
                if (Object.hasOwn(patch, key)) draft[key] = clone(patch[key]);
            draft.status = 'editing';
            return null;
        }, expectedRevision);
        const updateSourceRelationship = (id, targetResidentId, relationType, expectedRevision) => change(id, (draft, snapshot) => {
            if (draft.mode === 'oc' || !Array.isArray(draft.sourceRelationships)) return 'invalid-fandom-draft';
            const index = draft.sourceRelationships.findIndex(row => row.targetResidentId === targetResidentId);
            if (index < 0) return 'unknown-source-relation';
            if (relationType === null) draft.sourceRelationships.splice(index, 1);
            else {
                if (!generation || !Object.hasOwn(generation.TYPES, relationType)) return 'invalid-source-relation-type';
                draft.sourceRelationships[index].relationType = relationType;
                draft.sourceRelationships[index].reviewNote = '你已调整这项原作关系；请在最终确认前核对设定。';
            }
            const candidates = generation.resolveSourceRelationshipCandidates(draft.identity?.sourceIdentity?.sourceWork,
                snapshot.cats);
            const checked = generation.validateSourceRelationships(draft.sourceRelationships, candidates);
            if (!checked.valid) return checked.errors[0];
            draft.status = 'editing';
            return null;
        }, expectedRevision);
        const applyBreedToAdoptionDraft = (id, breedId, expectedRevision) => change(id, draft => {
            const seed = catBreeds.getBreedSeedIdentityConfig(breedId);
            if (!seed) return 'unsupported-breed';
            draft.identity.breedId = breedId;
            if (draft.mode !== 'oc' && draft.appearance?.identityConfig) {
                draft.appearance.confirmed = false;
            } else if (draft.appearance?.confirmed !== true) {
                const prior = draft.appearance?.identityConfig;
                draft.appearance = { identityConfig: visual.canonicalizeIdentity({ ...seed,
                    ...(prior ? { eyeLeft: prior.eyeLeft, eyeRight: prior.eyeRight } : {}) }), confirmed: false };
            }
            const compatibility = draft.appearance?.identityConfig
                ? validateBreedAppearanceConsistency(breedId, draft.appearance.identityConfig) : null;
            draft.validationErrors = compatibility && !compatibility.valid ? [compatibility.error] : [];
            draft.status = 'editing';
            return null;
        }, expectedRevision);
        const setEyes = (id, left, right, expectedRevision) => change(id, draft => {
            try {
                const config = visual.canonicalizeIdentity({ ...(draft.appearance?.identityConfig || visual.DEFAULT_CONFIG), eyeLeft: left, eyeRight: right });
                const changed = JSON.stringify(config) !== JSON.stringify(draft.appearance?.identityConfig);
                draft.appearance = { identityConfig: config,
                    confirmed: draft.appearance?.confirmed === true && (!changed || draft.mode === 'oc') };
                draft.status = 'editing';
                return null;
            } catch (_) { return 'invalid-eye-color'; }
        }, expectedRevision);
        const confirmAppearance = (id, identityConfig, expectedRevision) => change(id, draft => {
            try {
                const config = visual.canonicalizeIdentity(identityConfig);
                if (draft.mode !== 'oc') {
                    const compatible = validateBreedAppearanceConsistency(draft.identity?.breedId, config);
                    if (!compatible.valid) return compatible.error;
                }
                draft.appearance = { identityConfig: config, confirmed: true };
                draft.status = 'editing';
                return null;
            } catch (_) { return 'invalid-appearance'; }
        }, expectedRevision);
        const acceptCurrentFandomAppearance = (id, generationId, expectedRevision) => change(id, draft => {
            if (!['fandom-invite', 'fandom-random'].includes(draft.mode) ||
                !draft.fandomGeneration?.generationId || draft.fandomGeneration.generationId !== generationId ||
                draft.fandomGeneration.sourceIdentityKey !== sourceKeyForDraft(draft)) return 'stale-generation';
            if (!draft.appearance?.identityConfig ||
                visual.stableIdentity(draft.appearance.identityConfig) !== draft.fandomGeneration.proposedAppearanceIdentity)
                return 'appearance-changed';
            const checked = validateBreedAppearanceConsistency(draft.identity?.breedId, draft.appearance.identityConfig);
            if (!checked.valid) return checked.error;
            draft.appearance.confirmed = true;
            return null;
        }, expectedRevision);
        const applyFandomProposal = (id, validated, generationId, expectedRevision) => change(id, (draft, snapshot) => {
            if (!['fandom-invite', 'fandom-random'].includes(draft.mode)) return 'invalid-fandom-draft';
            if (typeof generationId !== 'string' || !generationId.startsWith('fandom-generation:') ||
                !UUID.test(generationId.slice(18)) || generationId === draft.fandomGeneration?.generationId)
                return 'invalid-generation-id';
            const grounding = validated?.sourceGrounding;
            const requestedKey = keyForSourceIdentity(grounding?.sourceWork, grounding?.characterName);
            if (!requestedKey || (draft.mode === 'fandom-invite' && sourceKeyForDraft(draft) && sourceKeyForDraft(draft) !== requestedKey))
                return 'source-identity-changed';
            const candidate = { ...draft, identity: { ...draft.identity, sourceIdentity: {
                characterName: grounding.characterName, sourceWork: grounding.sourceWork } } };
            const worldview = draft.mode === 'fandom-random'
                ? generation?.resolveHallWorldviewContext(draft.hallId, snapshot.halls, snapshot.cats) : null;
            if (draft.mode === 'fandom-random') {
                const boundary = generation?.validateHallWorldSource(worldview, grounding.sourceWork);
                if (!boundary?.valid) return boundary?.error || 'unresolved-hall-worldview';
            }
            if (findDuplicateSourceIdentity(candidate, snapshot.cats, snapshot.user.adoptionDrafts))
                return 'duplicate-source-identity';
            const validator = Meeow.fandomResidentGenerator?.validateFandomResponse;
            if (typeof validator !== 'function') return 'generator-unavailable';
            const checked = validator({ version: 1, result: 'proposal', sourceGrounding: grounding,
                proposal: validated.proposal, reviewNotes: validated.reviewNotes }, {
                ...grounding, mode: draft.mode === 'fandom-random' ? 'random' : 'invite',
                worldview,
                relationshipCandidates: generation?.resolveSourceRelationshipCandidates(
                    grounding.sourceWork, snapshot.cats) || [] });
            if (!checked.ok) return checked.error;
            const p = checked.value.proposal;
            const existingSource = draft.identity.sourceIdentity;
            const sourceIdentity = existingSource && sourceKeyForDraft(draft) === requestedKey
                ? clone(existingSource) : { characterName: grounding.characterName, sourceWork: grounding.sourceWork };
            draft.identity = { ...draft.identity, name: sourceIdentity.characterName.trim(),
                gender: p.gender, breedId: p.breedId, sourceIdentity };
            draft.appearance = { identityConfig: clone(p.identityConfig), confirmed: false };
            draft.personalityProfile = { semanticProfileVersion: 1, residentId: id,
                personalityAxes: clone(p.personalityAxes), preferences: { food: {} } };
            draft.foodPreferenceProfile = { semanticProfileVersion: 1, residentId: id,
                personalityAxes: {}, preferences: { food: clone(p.foodPreferences) } };
            draft.objectPreferenceProfile = { version: 1, residentId: id,
                preferences: clone(p.objectPreferences), provenance: { authority: 'ai-confirmed' } };
            draft.worldContext = p.worldContext;
            draft.sourceRelationships = clone(p.sourceRelationships || []);
            draft.fandomGeneration = { version: 1, generationId, sourceIdentityKey: requestedKey,
                sourceGrounding: clone(checked.value.sourceGrounding),
                reviewNotes: clone(checked.value.reviewNotes), generatedAt: now(),
                proposedAppearanceIdentity: visual.stableIdentity(p.identityConfig), hasUserCorrections: false };
            draft.fandomReview = { version: 1, state: 'pending', generationId, reviewedAt: null };
            draft.validationErrors = [];
            draft.status = 'editing';
            return null;
        }, expectedRevision, { skipFandomInvalidation: true });
        const acceptFandomDraftReview = (id, generationId, expectedRevision) => change(id, (draft, snapshot) => {
            if (!['fandom-invite', 'fandom-random'].includes(draft.mode)) return 'invalid-fandom-draft';
            if (!draft.fandomGeneration?.generationId || draft.fandomGeneration.generationId !== generationId ||
                draft.fandomReview?.generationId !== generationId ||
                draft.fandomGeneration.sourceIdentityKey !== sourceKeyForDraft(draft)) return 'stale-generation';
            const checked = validateAdoptionDraftForCommit(draft, { halls: snapshot.halls,
                cats: snapshot.cats, drafts: snapshot.user.adoptionDrafts, requireFandomReview: false });
            if (!checked.valid) return 'incomplete-fandom-review';
            draft.fandomReview = { version: 1, state: 'accepted', generationId, reviewedAt: now() };
            draft.status = 'editing';
            return null;
        }, expectedRevision);
        const validate = (id, expectedRevision) => change(id, (draft, snapshot) => {
            const checked = validateAdoptionDraftForCommit(draft, { halls: snapshot.halls, cats: snapshot.cats, drafts: snapshot.user.adoptionDrafts });
            draft.status = checked.valid ? 'ready' : 'editing';
            draft.validationErrors = checked.errors;
            return null;
        }, expectedRevision);
        const cancel = (id, expectedRevision) => change(id, draft => { draft.status = 'cancelled'; return null; }, expectedRevision);
        const confirm = (id, expectedRevision) => {
            const existing = read(id);
            if (existing?.status === 'confirmed') return { ok: true, unchanged: true,
                residentId: existing.confirmedResidentId, adoptionEventId: existing.adoptionEventId };
            if (existing?.status !== 'ready') return { ok: false, error: 'draft-not-ready' };
            return transact(snapshot => {
                snapshot.user.adoptionDrafts = normalizeDraftStore(snapshot.user.adoptionDrafts);
                const draft = snapshot.user.adoptionDrafts[id];
                if (!draft || draft.status !== 'ready') return { ok: false, error: 'draft-not-ready' };
                if (expectedRevision !== undefined && draft.revision !== expectedRevision) return { ok: false, error: 'stale-draft' };
                const checked = validateAdoptionDraftForCommit(draft, { halls: snapshot.halls, cats: snapshot.cats, drafts: snapshot.user.adoptionDrafts });
                if (!checked.valid) return { ok: false, error: 'incomplete-draft', errors: checked.errors };
                const residentId = `resident:${uuid()}`;
                const adoptionEventId = `resident-adoption-event:${uuid()}`;
                if (!UUID.test(residentId.slice(9)) || !UUID.test(adoptionEventId.slice(24)) || snapshot.cats.some(cat => String(cat.id) === residentId))
                    return { ok: false, error: 'id-collision' };
                const rebind = profile => ({ ...clone(profile), residentId });
                const personalityProfile = semantics.validateSemanticProfile(rebind(draft.personalityProfile));
                const foodPreferenceProfile = semantics.validateSemanticProfile(rebind(draft.foodPreferenceProfile));
                const objectPreferenceProfile = objects.validateObjectPreferenceProfile(rebind(draft.objectPreferenceProfile));
                if (![personalityProfile, foodPreferenceProfile, objectPreferenceProfile].every(result => result.valid))
                    return { ok: false, error: 'invalid-rebound-profile' };
                const at = now();
                const sourceIdentity = draft.mode === 'oc' ? undefined : { ...clone(draft.identity.sourceIdentity),
                    normalizedIdentityKey: sourceKeyForDraft(draft) };
                const resident = {
                    id: residentId, hallId: draft.hallId, name: draft.identity.name.trim(),
                    gender: draft.identity.gender, breedId: draft.identity.breedId,
                    visual: visual.makeVisual(null, draft.appearance.identityConfig).visual,
                    personalityProfile: personalityProfile.normalized,
                    personality: semantics.derivePersonalityLabels(personalityProfile.normalized).map(entry => entry.label).join('、'),
                    foodPreferenceProfile: foodPreferenceProfile.normalized,
                    objectPreferenceProfile: objectPreferenceProfile.normalized,
                    worldContext: draft.worldContext.trim(),
                    ...(sourceIdentity ? { sourceIdentity, sourceWork: sourceIdentity.sourceWork } : {}),
                    creationProvenance: { version: 1, mode: draft.mode, createdAt: at, draftId: id,
                        adoptionEventId, identityAuthority: draft.mode === 'oc' ? 'user' : 'ai-proposed-user-confirmed',
                        appearanceAuthority: draft.mode === 'oc' ? 'user-cat-creator' : 'ai-proposed-user-confirmed',
                        preferenceAuthority: draft.mode === 'oc' ? 'user' : 'ai-proposed-user-confirmed' },
                    status: '新入住，正站在馆内熟悉环境', statusActivity: { posture: 'standing' },
                    isOut: false, affinity: defaultAffinity, isHuman: false, hasRevealedHumanForm: false,
                    currentForm: 'CAT', lastFormChangeAt: null, nextFormReconsiderAt: null,
                    image: '', image_human: '', chatHistory: [], diary: [], logs: [], travelogues: [],
                    todayInteractions: [], residentRelationships: {}, residentRelationshipPairMetadata: {},
                    innerVoice: '...', lastFocusTime: 0, lastInteractionDate: null, lastLogDate: null,
                    prompt: `You are ${draft.identity.name.trim()}, a resident of Meeow House. ${draft.worldContext.trim()} The USER is an accepted caretaker. Preserve the confirmed structured personality and preferences.`,
                    isMarvel: false
                };
                const normalizedResident = Meeow.data.normalizeCatHall(resident);
                snapshot.cats.push(normalizedResident);
                if (generation) {
                    const candidates = generation.resolveSourceRelationshipCandidates(sourceIdentity?.sourceWork, snapshot.cats,
                        { excludeIds: [residentId] });
                    const relations = generation.validateSourceRelationships(draft.sourceRelationships || [], candidates);
                    if (!relations.valid) return { ok: false, error: 'invalid-source-relationships', errors: relations.errors };
                    generation.applyAcceptedSourceRelationships({ user: snapshot.user, cats: snapshot.cats,
                        residentId, relations: relations.normalized,
                        sourceIdentityKey: sourceKeyForDraft(draft), sourceEventId: adoptionEventId, at });
                    const arrivalEventId = `resident-arrival-event:${uuid()}`;
                    if (!UUID.test(arrivalEventId.slice(23))) return { ok: false, error: 'invalid-arrival-event-id' };
                    snapshot.user.residentArrivalEvents = generation.normalizeArrivalEvents(snapshot.user.residentArrivalEvents);
                    const audienceResidentIds = snapshot.cats.filter(cat => String(cat.hallId) === String(draft.hallId) &&
                        (String(cat.id) === residentId || isEligibleArrivalAudience(cat, draft.hallId, at)))
                        .map(cat => String(cat.id));
                    const arrivalEvent = generation.createArrivalEvent({
                        eventId: arrivalEventId, hallId: draft.hallId, newResidentIds: [residentId],
                        audienceResidentIds, sourceCreationEventIds: [adoptionEventId], createdAt: at });
                    arrivalEvent.context = generation.getResidentArrivalStatusContext({ event: arrivalEvent,
                        cats: snapshot.cats, hall: snapshot.halls.find(hall => String(hall.id) === String(draft.hallId)),
                        user: snapshot.user });
                    snapshot.user.residentArrivalEvents[arrivalEventId] = arrivalEvent;
                    resident.creationProvenance.arrivalEventId = arrivalEventId;
                    normalizedResident.creationProvenance.arrivalEventId = arrivalEventId;
                    draft.arrivalEventId = arrivalEventId;
                }
                draft.status = 'confirmed';
                draft.confirmedResidentId = residentId;
                draft.adoptionEventId = adoptionEventId;
                draft.updatedAt = at;
                draft.revision += 1;
                return { ok: true, residentId, adoptionEventId,
                    arrivalEventId: draft.arrivalEventId || null, resident: clone(normalizedResident) };
            }, snapshot => ({ drafts: snapshot.user.adoptionDrafts,
                sourceRelationships: snapshot.user.residentSourceRelationships,
                arrivalEvents: snapshot.user.residentArrivalEvents,
                resident: snapshot.cats.find(cat => String(cat.id) === snapshot.user.adoptionDrafts[id].confirmedResidentId) }));
        };
        return Object.freeze({ create, read, update, applyBreedToAdoptionDraft,
            setEyes, confirmAppearance, acceptCurrentFandomAppearance, applyFandomProposal, updateSourceRelationship, acceptFandomDraftReview,
            validate, cancel, confirm });
    };
    Meeow.adoptionDrafts = Object.freeze({ VERSION, MODES, STATUSES, GENDERS, BREED_REGISTRY,
        normalizeDraftStore, keyForSourceIdentity, deriveEyeIdentity, eyeColorDisplay, residentEyeColorDisplay,
        validateBreedAppearanceConsistency,
        findDuplicateSourceIdentity, validateAdoptionDraftForCommit, previewAdoptionDraft, createService });
}(typeof window !== 'undefined' ? window : globalThis));
