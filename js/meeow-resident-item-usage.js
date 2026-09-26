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
    const selectWeightedOwnedItem = (user, residentId, items, random = Math.random) => {
        const candidates = items.map(item => ({ item,
            weight: getItemUseWeight(Meeow.residentItems.getResidentItemBond(user, residentId, item.uniqueId)) }))
            .filter(candidate => candidate.weight > 0);
        const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
        const roll = total ? safeRoll(random) : null;
        if (roll === null) return null;
        let target = roll * total;
        for (const candidate of candidates) {
            target -= candidate.weight;
            if (target < 0) return candidate.item;
        }
        return candidates.at(-1)?.item || null;
    };
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
        const selected = selectWeightedOwnedItem(user, id, eligible, random);
        if (!selected) return null;
        const semantics = Meeow.semantics.getItemObjectSemantics(selected);
        const bond = Meeow.residentItems.getResidentItemBond(user, id, selected.uniqueId);
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
            bondDisplay: Object.freeze(Meeow.residentItems.getResidentItemBondDisplayState(bond))
        });
        return Object.freeze({ event, itemRef: selected });
    };
    const canCommitItemUse = (user, decision) => {
        if (!decision?.event || !decision.itemRef) return false;
        const event = decision.event;
        const owned = Meeow.residentItems.getResidentOwnedItems(user?.residentItems, event.residentId);
        if (!owned.includes(decision.itemRef) ||
            owned.filter(item => item?.uniqueId === event.itemUniqueId).length !== 1 ||
            decision.itemRef.uniqueId !== event.itemUniqueId ||
            (decision.itemRef.sourceCatalogId ?? null) !== event.sourceCatalogId ||
            !isEligibleOwnedItem(user, event.residentId, decision.itemRef)) return false;
        const semantics = Meeow.semantics.getItemObjectSemantics(decision.itemRef);
        return semantics?.semanticType === event.semanticType &&
            semantics.tags.includes(`role:${event.role}`) &&
            Meeow.semantics.getPrimaryItemInteraction(decision.itemRef) === event.interaction &&
            JSON.stringify(semantics.tags.filter(tag => tag.startsWith('stimulus:')).map(tag => tag.slice(9))) ===
                JSON.stringify(event.stimulus);
    };
    const commitItemUse = ({ user, residents, decision, at = new Date().toISOString() }) => {
        if (committedEventIds.has(decision?.event?.eventId)) return { ok: false, reason: 'already-committed' };
        if (!canCommitItemUse(user, decision)) return { ok: false, reason: 'item-no-longer-current' };
        const result = Meeow.residentItems.recordResidentItemUse({ user, residents,
            residentId: decision.event.residentId, uniqueId: decision.event.itemUniqueId,
            requireUsableSemantics: true, now: () => at });
        if (result.ok) committedEventIds.add(decision.event.eventId);
        return result;
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
        getItemUseWeight, selectWeightedOwnedItem, freezeItemUseDecision, canCommitItemUse,
        commitItemUse, buildStatusItemUseContext, getItemUseFallback });
    if (typeof module !== 'undefined' && module.exports) module.exports = usage;
}(typeof window !== 'undefined' ? window : globalThis));
