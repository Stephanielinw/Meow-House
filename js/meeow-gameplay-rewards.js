(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const getGameplayRewardEvidence = item => {
        if (!Meeow.residentItems?.isValidProvenance(item?.provenance) ||
            !Meeow.residentItems.validPhysicalId(item.uniqueId) || item.sourceCatalogId != null ||
            item.provenance.origin.kind !== 'explore' ||
            typeof item.provenance.origin.eventId !== 'string' || !item.provenance.origin.eventId.trim()) return null;
        const eventId = item.provenance.origin.eventId;
        const sourceId = `explore-settlement:${eventId}:loot`;
        if (item.sourceId !== sourceId || item.id !== sourceId) return null;
        return Object.freeze({ version: 1, producer: 'explore-settlement', eventId, sourceId });
    };
    const normalizeRewardObjectProposal = raw => {
        const object = Meeow.semantics.normalizeObjectSemanticProposal(raw, raw?.semanticType);
        return object ? { type: 'collectible', category: object.semanticType, ...object }
            : { type: 'collectible', category: 'collectible' };
    };
    const getGameplayRewardCompatibilityPatch = item => {
        if (!getGameplayRewardEvidence(item)) return null;
        const object = Meeow.semantics.getItemObjectSemantics(item);
        // Never turn explicit Food, letter records, or malformed semantics into objects.
        if (!object && (Object.hasOwn(item, 'semanticType') || item.category === 'food' || item.type === 'letter')) return null;
        const category = object?.semanticType || 'collectible';
        return item.type !== 'collectible' || item.category !== category ? { type: 'collectible', category } : null;
    };
    const normalizeOwnedGameplayRewards = user => {
        let updatedCount = 0;
        const items = [...(Array.isArray(user?.inventory) ? user.inventory : []),
            ...Object.values(user?.residentItems || {}).flatMap(value => Array.isArray(value) ? value : [])];
        for (const item of items) {
            const patch = getGameplayRewardCompatibilityPatch(item);
            if (patch) { Object.assign(item, patch); updatedCount += 1; }
        }
        return { changed: updatedCount > 0, updatedCount };
    };
    const hasLegitimateResidentRewardTransfer = item => {
        if (!getGameplayRewardEvidence(item) || item.provenance.originOwner.kind !== 'user') return false;
        const history = item.provenance.giftHistory;
        if (!history.length || history[0].from.kind !== 'user') return false;
        return history.every((entry, index) => entry.uniqueId === item.uniqueId &&
            (!index || (entry.from.kind === 'resident' &&
                String(entry.from.residentId) === String(history[index - 1].to.residentId))));
    };
    Meeow.gameplayRewards = Object.freeze({ getGameplayRewardEvidence, normalizeRewardObjectProposal,
        getGameplayRewardCompatibilityPatch, normalizeOwnedGameplayRewards, hasLegitimateResidentRewardTransfer });
}(typeof window !== 'undefined' ? window : globalThis));
