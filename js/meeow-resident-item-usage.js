(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const usage = Meeow.residentItemUsage = Meeow.residentItemUsage || {};
    const BASE_ITEM_USAGE_CHANCE = 0.12;
    const RESIDENT_ITEM_USAGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const INTERACTIONS = Object.freeze(['chase', 'bat', 'carry', 'cuddle', 'sniff', 'observe']);
    const committedEventIds = new Set();
    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const residentIdOf = value => String(isRecord(value) ? value.id ?? '' : value ?? '').trim();
    const physicalKey = id => `${typeof id}:${String(id)}`;
    const safeRoll = random => {
        const value = random();
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1 ? value : null;
    };
    const getResidentLastItemUseAt = (user, residentId) => {
        const records = user?.residentItemBonds?.[residentIdOf(residentId)];
        if (records == null) return { valid: true, at: null };
        if (!isRecord(records)) return { valid: false, at: null };
        let latest = null;
        for (const bond of Object.values(records)) {
            if (!Meeow.residentItems.validBond(bond)) return { valid: false, at: null };
            if (bond.lastUsedAt && (!latest || Date.parse(bond.lastUsedAt) > Date.parse(latest))) latest = bond.lastUsedAt;
        }
        return { valid: true, at: latest };
    };
    const isUsageCooldownActive = (user, residentId, now = new Date()) => {
        const history = getResidentLastItemUseAt(user, residentId);
        if (!history.valid) return true; // Unknown use history is not permission to reroll.
        return Boolean(history.at && now.getTime() - Date.parse(history.at) < RESIDENT_ITEM_USAGE_COOLDOWN_MS);
    };
    const isEligibleOwnedItem = (user, residentId, item) => {
        const residentItems = Meeow.residentItems;
        const semantics = Meeow.semantics;
        const owned = residentItems.getResidentOwnedItems(user?.residentItems, residentId);
        if (!owned.includes(item) || !residentItems.isResidentItemBondEligible(item) ||
            !residentItems.validPhysicalId(item?.uniqueId) ||
            owned.filter(entry => entry?.uniqueId === item.uniqueId).length !== 1 ||
            !semantics?.isSemanticallyUsableItem(item)) return false;
        const classification = semantics.getItemObjectSemantics(item);
        const interaction = semantics.getPrimaryItemInteraction(item);
        return Boolean(classification && ['toy', 'collectible'].includes(classification.semanticType) &&
            INTERACTIONS.includes(interaction) && residentItems.getResidentItemBond(user, residentId, item.uniqueId));
    };
    const getEligibleOwnedItems = (user, residentId) => {
        const items = Meeow.residentItems.getResidentOwnedItems(user?.residentItems, residentId);
        if (Meeow.residentItems.scanOwnership(user?.inventory, user?.residentItems).duplicateIds.length) return [];
        return items.filter(item => isEligibleOwnedItem(user, residentId, item));
    };
    const getItemUseWeight = bond => {
        if (!Meeow.residentItems.validBond(bond)) return 0;
        return Math.max(1, 6 + bond.familiarity + 2 * bond.fondness +
            (Meeow.residentItems.isResidentItemCherished(bond) ? 4 : 0));
    };
    const getObjectPreferenceBias = scored => scored?.state === 'scored' &&
        typeof scored.score === 'number' && Number.isFinite(scored.score)
        ? Math.max(-2, Math.min(2, scored.score)) : 0;
    const getResidentItemFondnessPreferenceBand = ({ preferenceState, rawScore } = {}) => {
        if (preferenceState === 'unprofiled') return 'unprofiled';
        if (preferenceState !== 'scored' || !Number.isSafeInteger(rawScore)) return 'ineligible';
        return rawScore > 0 ? 'positive' : rawScore < 0 ? 'negative' : 'neutral';
    };
    const getResidentItemFondnessMilestone = ({ preferenceState, rawScore, useOrdinal } = {}) => {
        const preferenceBand = getResidentItemFondnessPreferenceBand({ preferenceState, rawScore });
        const validOrdinal = Number.isSafeInteger(useOrdinal) && useOrdinal > 0;
        const milestone = validOrdinal && (preferenceBand === 'positive'
            ? useOrdinal >= 3 && (useOrdinal - 3) % 4 === 0
            : preferenceBand === 'neutral' || preferenceBand === 'unprofiled'
                ? useOrdinal >= 5 && (useOrdinal - 5) % 6 === 0
                : preferenceBand === 'negative' && useOrdinal >= 8 && useOrdinal % 8 === 0);
        return Object.freeze({ version: 1, useOrdinal, preferenceBand, milestone,
            plannedDelta: milestone ? 1 : 0 });
    };
    // Validate the frozen wire evidence, never a later profile or item score.
    const validObjectPreferenceEvidence = evidence => {
        if (!isRecord(evidence) || !Array.isArray(evidence.matchedPreferences)) return false;
        if (evidence.state === 'unprofiled' || evidence.state === 'unclassified-item')
            return evidence.rawScore === null && evidence.bias === 0 && evidence.matchedPreferences.length === 0;
        if (evidence.state !== 'scored' || !Number.isSafeInteger(evidence.rawScore)) return false;
        const tags = new Set([...Meeow.semantics.OBJECT_VALUES.interaction.map(value => `interaction:${value}`),
            ...Meeow.semantics.OBJECT_VALUES.stimulus.map(value => `stimulus:${value}`)]);
        const seen = new Set();
        for (const match of evidence.matchedPreferences) {
            if (!isRecord(match) || !tags.has(match.tag) || seen.has(match.tag) ||
                ![-2, -1, 1, 2].includes(match.weight)) return false;
            seen.add(match.tag);
        }
        return evidence.rawScore === evidence.matchedPreferences.reduce((sum, match) => sum + match.weight, 0) &&
            evidence.bias === getObjectPreferenceBias({ state: 'scored', score: evidence.rawScore });
    };
    const getResidentItemUsageCandidateWeight = ({ user, residents = [], residentId, item }) => {
        const id = residentIdOf(residentId);
        const eligible = getEligibleOwnedItems(user, id).includes(item);
        const existingBondWeight = getItemUseWeight(
            Meeow.residentItems.getResidentItemBond(user, id, item?.uniqueId));
        // Matching and lookup stay in the shared Object Preference authority.
        // A missing module/profile supplies no extra bias, preserving the baseline.
        const scored = Meeow.objectPreferences?.scoreResidentObjectForResident(id, item, residents) || {
            state: 'unprofiled', score: null, matchedPreferences: []
        };
        const objectPreference = Object.freeze({ state: scored.state, rawScore: scored.score,
            bias: getObjectPreferenceBias(scored), matchedPreferences: Object.freeze(
                scored.matchedPreferences.map(match => Object.freeze({ ...match }))) });
        return Object.freeze({ eligible, existingBondWeight, objectPreference,
            finalWeight: eligible ? Math.max(1, existingBondWeight + objectPreference.bias) : 0 });
    };
    const selectWeightedOwnedCandidate = (user, residentId, items, random, residents) => {
        const candidates = items.map(item => {
            const diagnostics = getResidentItemUsageCandidateWeight({ user, residents, residentId, item });
            return { item, weight: diagnostics.finalWeight, objectPreference: diagnostics.objectPreference };
        })
            .filter(candidate => candidate.weight > 0);
        const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
        const roll = total ? safeRoll(random) : null;
        if (roll === null) return null;
        let target = roll * total;
        for (const candidate of candidates) {
            target -= candidate.weight;
            if (target < 0) return candidate;
        }
        return candidates.at(-1) || null;
    };
    const selectWeightedOwnedItem = (user, residentId, items, random = Math.random, residents = []) =>
        selectWeightedOwnedCandidate(user, residentId, items, random, residents)?.item || null;
    const freezeItemUseDecision = ({ user, residents, residentId, now = new Date(),
        random = Math.random, makeEventId = () => Meeow.shopCatalog.createInstanceUniqueId()
            .replace(/^item-instance:/, 'resident-item-use:') }) => {
        const id = residentIdOf(residentId);
        if (!id || !Array.isArray(residents) || residents.filter(cat => residentIdOf(cat) === id).length !== 1 ||
            !(now instanceof Date) || Number.isNaN(now.getTime()) || isUsageCooldownActive(user, id, now)) return null;
        const eligible = getEligibleOwnedItems(user, id);
        if (!eligible.length) return null;
        const chanceRoll = safeRoll(random);
        if (chanceRoll === null || chanceRoll >= BASE_ITEM_USAGE_CHANCE) return null;
        const candidate = selectWeightedOwnedCandidate(user, id, eligible, random, residents);
        const selected = candidate?.item;
        if (!selected) return null;
        const semantics = Meeow.semantics.getItemObjectSemantics(selected);
        const bond = Meeow.residentItems.getResidentItemBond(user, id, selected.uniqueId);
        if (bond.useCount >= Number.MAX_SAFE_INTEGER || !validObjectPreferenceEvidence(candidate.objectPreference)) return null;
        const fondnessEvolution = getResidentItemFondnessMilestone({
            preferenceState: candidate.objectPreference.state, rawScore: candidate.objectPreference.rawScore,
            useOrdinal: bond.useCount + 1 });
        let eventId;
        try { eventId = makeEventId(); } catch (_) { return null; }
        if (typeof eventId !== 'string' ||
            !/^resident-item-use:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) return null;
        const event = Object.freeze({
            version: 1, eventId, residentId: id, itemUniqueId: selected.uniqueId,
            sourceCatalogId: selected.sourceCatalogId ?? null,
            itemName: String(selected.name || '这件小物品').trim(),
            semanticType: semantics.semanticType,
            role: semantics.tags.find(tag => tag.startsWith('role:')).slice(5),
            interaction: Meeow.semantics.getPrimaryItemInteraction(selected),
            stimulus: Object.freeze(semantics.tags.filter(tag => tag.startsWith('stimulus:')).map(tag => tag.slice(9))),
            bondDisplay: Object.freeze(Meeow.residentItems.getResidentItemBondDisplayState(bond)),
            objectPreference: candidate.objectPreference,
            fondnessEvolution
        });
        return Object.freeze({ event, itemRef: selected });
    };
    const canCommitItemUse = (user, decision, now = new Date()) => {
        if (!decision?.event || !(now instanceof Date) || Number.isNaN(now.getTime())) return false;
        const event = decision.event;
        // Resolve stable physical identity from current ownership, not a captured
        // JS object: save import may rematerialize the same authoritative item.
        const item = getEligibleOwnedItems(user, event.residentId)
            .find(current => current.uniqueId === event.itemUniqueId);
        if (!item || (item.sourceCatalogId ?? null) !== event.sourceCatalogId ||
            isUsageCooldownActive(user, event.residentId, now)) return false;
        const semantics = Meeow.semantics.getItemObjectSemantics(item);
        return semantics?.semanticType === event.semanticType &&
            semantics.tags.includes(`role:${event.role}`) &&
            Meeow.semantics.getPrimaryItemInteraction(item) === event.interaction &&
            JSON.stringify(semantics.tags.filter(tag => tag.startsWith('stimulus:')).map(tag => tag.slice(9))) ===
                JSON.stringify(event.stimulus);
    };
    const commitItemUse = ({ user, residents, decision, at = new Date().toISOString(), persist }) => {
        if (committedEventIds.has(decision?.event?.eventId)) return { ok: false, reason: 'already-committed' };
        if (!decision?.event) return { ok: false, reason: 'item-no-longer-current' };
        const event = decision.event, plan = event.fondnessEvolution;
        if (!validObjectPreferenceEvidence(event.objectPreference) || !isRecord(plan) ||
            !Number.isSafeInteger(plan.useOrdinal) || plan.useOrdinal < 1) return { ok: false, reason: 'invalid-evolution-plan' };
        const expected = getResidentItemFondnessMilestone({ preferenceState: event.objectPreference.state,
            rawScore: event.objectPreference.rawScore, useOrdinal: plan.useOrdinal });
        if (Object.keys(expected).some(key => plan[key] !== expected[key])) return { ok: false, reason: 'invalid-evolution-plan' };
        const before = Meeow.residentItems.getResidentItemBond(user, event.residentId, event.itemUniqueId);
        // Durable compare-and-set: neither retries nor a competing event may
        // reinterpret a frozen ordinal as a later use/milestone after reload.
        if (before && before.useCount !== plan.useOrdinal - 1) return { ok: false, reason: 'stale-use-ordinal' };
        if (!canCommitItemUse(user, decision, new Date(at))) return { ok: false, reason: 'item-no-longer-current' };
        const stagedUser = { ...user, residentItemBonds: { ...user.residentItemBonds,
            [event.residentId]: { ...user.residentItemBonds[event.residentId] } } };
        const result = Meeow.residentItems.recordResidentItemUse({ user: stagedUser, residents,
            residentId: event.residentId, uniqueId: event.itemUniqueId,
            requireUsableSemantics: true, now: () => at });
        if (!result.ok) return result;
        if (plan.plannedDelta) {
            const adjustment = Meeow.residentItems.adjustResidentItemFondness({ user: stagedUser, residents,
                residentId: event.residentId, uniqueId: event.itemUniqueId,
                delta: plan.plannedDelta, reason: 'authorized-interaction' });
            if (!adjustment.ok) return adjustment;
        }
        const bond = Meeow.residentItems.getResidentItemBond(stagedUser, event.residentId, event.itemUniqueId);
        if (typeof persist === 'function') {
            try { if (persist({ bond, event }) !== true) return { ok: false, reason: 'persistence-failed' }; }
            catch (_) { return { ok: false, reason: 'persistence-failed' }; }
        }
        user.residentItemBonds[event.residentId][physicalKey(event.itemUniqueId)] = bond;
        committedEventIds.add(event.eventId);
        return { ok: true, bond, fondnessDelta: bond.fondness - before.fondness };
    };
    const buildStatusItemUseContext = decision => {
        const event = decision?.event;
        if (!event) return '';
        return `[CURRENT AUTHORIZED ITEM ACTIVITY]
Resident ID: ${event.residentId}
Owned physical item: ${event.itemName}
Required interaction: ${event.interaction}
Object role: ${event.role}
Stimulus: ${event.stimulus.join(', ') || 'none'}
Relationship: ${event.bondDisplay.familiarity}; ${event.bondDisplay.fondness}${event.bondDisplay.cherished ? '; 珍爱之物' : ''}
PROGRAM has already selected this exact owned physical item and interaction. Write this resident's current status naturally around the item activity. Include the exact item name. Do not replace it, invent ownership or another action family, or claim a giver or acquisition history. Never expose this control block.`;
    };
    const fallbackTemplates = Object.freeze({
        chase: (name, item) => `${name}正在追着${item}跑。`,
        bat: (name, item) => `${name}正用爪子拨弄${item}。`,
        carry: (name, item) => `${name}正带着${item}到处走。`,
        cuddle: (name, item) => `${name}正抱着${item}休息。`,
        sniff: (name, item) => `${name}正在仔细闻${item}。`,
        observe: (name, item) => `${name}正在安静地看着${item}。`
    });
    const getItemUseFallback = (decision, residentName) => {
        const event = decision?.event;
        return event && fallbackTemplates[event.interaction]
            ? fallbackTemplates[event.interaction](String(residentName || event.residentId), event.itemName) : '';
    };
    Object.assign(usage, { BASE_ITEM_USAGE_CHANCE, RESIDENT_ITEM_USAGE_COOLDOWN_MS, INTERACTIONS,
        getResidentLastItemUseAt, isUsageCooldownActive, isEligibleOwnedItem, getEligibleOwnedItems,
        getItemUseWeight, getObjectPreferenceBias, getResidentItemUsageCandidateWeight,
        getResidentItemFondnessPreferenceBand, getResidentItemFondnessMilestone,
        selectWeightedOwnedItem, freezeItemUseDecision, canCommitItemUse,
        commitItemUse, buildStatusItemUseContext, getItemUseFallback });
    if (typeof module !== 'undefined' && module.exports) module.exports = usage;
}(typeof window !== 'undefined' ? window : globalThis));
