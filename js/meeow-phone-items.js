(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const tools = () => Meeow.shopCatalog;
    // Only an explicit Shop-origin path may resolve catalog provenance. The
    // native delivery menu's numeric IDs overlap Shop IDs and are not evidence.
    const resolveShopDefinition = (catalog, reference) => {
        if (!reference || typeof reference !== 'object') return null;
        if (reference.sourceCatalogId != null)
            return tools().findCatalogDefinition(catalog, reference.sourceCatalogId);
        const matches = (Array.isArray(catalog) ? catalog : []).filter(item =>
            tools().typedIdKey(reference.id) && item?.id === reference.id &&
            item.name === reference.name && item.category === reference.category && item.type === reference.type);
        return matches.length === 1 ? matches[0] : null;
    };
    const prepareInstance = (inventory, source, { origin, catalog = [], otherOwnedItems = [], makeUniqueId = () => tools().createInstanceUniqueId() } = {}) => {
        if (!Array.isArray(inventory) || !source || !['shop', 'native'].includes(origin))
            return { ok: false, reason: 'invalid-source' };
        const definition = origin === 'shop' ? resolveShopDefinition(catalog, source) : source;
        if (!definition || (origin === 'native' && source.sourceCatalogId != null))
            return { ok: false, reason: 'missing-or-ambiguous-source' };
        try {
            const used = new Set([...inventory, ...otherOwnedItems].map(item => item?.uniqueId));
            for (let attempt = 0; attempt < 32; attempt += 1) {
                const uniqueId = makeUniqueId();
                if (!tools().validInstanceUniqueId(uniqueId) || used.has(uniqueId)) continue;
                const item = tools().createPurchaseInstance(definition, uniqueId);
                if (!item) return { ok: false, reason: 'invalid-instance' };
                if (origin === 'native') item.provenance.origin.kind = 'phone-delivery';
                return { ok: true, reason: '', item, definition };
            }
        } catch (_) { /* crypto or nonserializable source: no inventory mutation */ }
        return { ok: false, reason: 'unique-id-unavailable' };
    };
    const createSession = () => ({ pending: false });
    const purchase = (session, catalog, user, reference, persist, makeUniqueId) => {
        if (!session || session.pending) return { ok: false, reason: 'purchase-pending' };
        session.pending = true;
        try {
            const otherOwnedItems = user?.residentItems && typeof user.residentItems === 'object' && !Array.isArray(user.residentItems)
                ? Object.values(user.residentItems).flatMap(items => Array.isArray(items) ? items : []) : [];
            const prepared = prepareInstance(user?.inventory, reference, { origin: 'shop', catalog, otherOwnedItems, makeUniqueId });
            if (!prepared.ok) return prepared;
            const price = prepared.definition.price;
            if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(user?.coins) || user.coins < 0)
                return { ok: false, reason: 'invalid-purchase' };
            const result = tools().commitCatalogPurchase(user, prepared.definition, prepared.item.uniqueId, persist);
            if (result.reason === 'persistence-failed') {
                try { if (typeof persist === 'function') persist(); } catch (_) { /* restored memory remains authoritative */ }
            }
            return result;
        } finally { session.pending = false; }
    };
    Meeow.phoneItems = Object.freeze({ resolveShopDefinition, prepareInstance, createSession, purchase });
})(typeof window !== 'undefined' ? window : globalThis);
