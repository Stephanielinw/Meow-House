(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const cart = Meeow.shopCart = Meeow.shopCart || {};
    const catalogTools = () => Meeow.shopCatalog;
    const validMoney = value => Number.isSafeInteger(value) && value >= 0;
    const validQuantity = value => Number.isSafeInteger(value) && value > 0;
    const createSession = () => ({ lines: [], pending: false });

    // Cart keys refer only to catalog definitions. JSON preserves the primitive
    // type of legacy IDs, including punctuation in string IDs.
    const catalogKey = item => {
        if (!item || typeof item !== 'object') return null;
        if (item.sourceCatalogId != null) {
            return catalogTools()?.validSourceCatalogId(item.sourceCatalogId)
                ? `source:${item.sourceCatalogId}` : null;
        }
        const id = item.id;
        if (typeof id === 'string' && id.trim()) return `id:${JSON.stringify(['string', id])}`;
        if (typeof id === 'number' && Number.isFinite(id)) return `id:${JSON.stringify(['number', Object.is(id, -0) ? 0 : id])}`;
        return null;
    };
    const resolveDefinition = (catalog, key) => {
        const matches = (Array.isArray(catalog) ? catalog : []).filter(item => catalogKey(item) === key);
        return matches.length === 1 ? matches[0] : null;
    };
    const add = (session, catalog, item) => {
        if (!session || session.pending || !Array.isArray(session.lines)) return false;
        const key = catalogKey(item);
        if (!key || !resolveDefinition(catalog, key)) return false;
        const line = session.lines.find(entry => entry.catalogKey === key);
        if (line) {
            if (!validQuantity(line.quantity) || !Number.isSafeInteger(line.quantity + 1)) return false;
            line.quantity += 1;
        } else session.lines.push({ catalogKey: key, quantity: 1 });
        return true;
    };
    const setQuantity = (session, key, quantity) => {
        if (!session || session.pending || !Array.isArray(session.lines) || !validQuantity(quantity)) return false;
        const line = session.lines.find(entry => entry.catalogKey === key);
        if (!line) return false;
        line.quantity = quantity;
        return true;
    };
    const remove = (session, key) => {
        if (!session || session.pending || !Array.isArray(session.lines)) return false;
        const index = session.lines.findIndex(entry => entry.catalogKey === key);
        if (index < 0) return false;
        session.lines.splice(index, 1);
        return true;
    };
    const decrement = (session, key) => {
        const line = session?.lines?.find(entry => entry.catalogKey === key);
        if (!line || session.pending || !validQuantity(line.quantity)) return false;
        return line.quantity === 1 ? remove(session, key) : setQuantity(session, key, line.quantity - 1);
    };
    const clear = session => {
        if (!session || session.pending || !Array.isArray(session.lines)) return false;
        session.lines.splice(0);
        return true;
    };
    const summarize = (session, catalog) => {
        if (!session || !Array.isArray(session.lines)) return { valid: false, reason: 'invalid-cart', lines: [], units: 0, total: 0 };
        let units = 0, total = 0;
        const lines = [];
        const seen = new Set();
        for (const entry of session.lines) {
            if (!entry || typeof entry.catalogKey !== 'string' || seen.has(entry.catalogKey) || !validQuantity(entry.quantity))
                return { valid: false, reason: 'invalid-line', lines, units, total };
            seen.add(entry.catalogKey);
            const item = resolveDefinition(catalog, entry.catalogKey);
            if (!item) return { valid: false, reason: 'missing-catalog', lines, units, total };
            if (!validMoney(item.price) || !Number.isSafeInteger(item.price * entry.quantity) ||
                !Number.isSafeInteger(total + item.price * entry.quantity) || !Number.isSafeInteger(units + entry.quantity))
                return { valid: false, reason: 'invalid-price-or-total', lines, units, total };
            const subtotal = item.price * entry.quantity;
            lines.push({ catalogKey: entry.catalogKey, quantity: entry.quantity, item, unitPrice: item.price, subtotal });
            units += entry.quantity;
            total += subtotal;
        }
        return { valid: true, reason: '', lines, units, total };
    };
    const checkout = (session, catalog, user, persist, makeUniqueId = () => catalogTools().createInstanceUniqueId()) => {
        if (!session || session.pending) return { ok: false, reason: 'checkout-pending' };
        session.pending = true;
        try {
            const summary = summarize(session, catalog);
            if (!summary.valid) return { ok: false, reason: summary.reason };
            if (!summary.lines.length) return { ok: false, reason: 'empty-cart' };
            if (!user || !Array.isArray(user.inventory) || !validMoney(user.coins)) return { ok: false, reason: 'invalid-user' };
            if (user.coins < summary.total) return { ok: false, reason: 'insufficient-funds' };

            // Freeze the current authoritative definitions and prices before
            // preparing physical instances. Cart state itself holds no visuals.
            const snapshot = catalogTools().deepFreeze({
                total: summary.total,
                lines: summary.lines.map(line => ({
                    catalogKey: line.catalogKey, quantity: line.quantity, unitPrice: line.unitPrice,
                    definition: catalogTools().cloneSerializable(line.item)
                }))
            });
            const residentCopies = user.residentItems && typeof user.residentItems === 'object' && !Array.isArray(user.residentItems)
                ? Object.values(user.residentItems).flatMap(items => Array.isArray(items) ? items : []) : [];
            const usedIds = new Set([...user.inventory, ...residentCopies].map(entry => entry?.uniqueId));
            const instances = [];
            for (const line of snapshot.lines) {
                for (let index = 0; index < line.quantity; index += 1) {
                    let uniqueId = null;
                    for (let attempt = 0; attempt < 32; attempt += 1) {
                        const candidate = makeUniqueId();
                        if (catalogTools().validInstanceUniqueId(candidate) && !usedIds.has(candidate)) {
                            uniqueId = candidate;
                            break;
                        }
                    }
                    if (!uniqueId) return { ok: false, reason: 'unique-id-unavailable' };
                    usedIds.add(uniqueId);
                    const instance = catalogTools().createPurchaseInstance(line.definition, uniqueId);
                    if (!instance) return { ok: false, reason: 'invalid-instance' };
                    instances.push(instance);
                }
            }
            const priorCoins = user.coins;
            const priorInventory = user.inventory.slice();
            let persisted = false;
            try {
                user.coins = priorCoins - snapshot.total;
                user.inventory.push(...instances);
                persisted = typeof persist === 'function' && persist() === true;
            } catch (_) { persisted = false; }
            if (!persisted) {
                user.coins = priorCoins;
                user.inventory.splice(0, user.inventory.length, ...priorInventory);
                // The archive write may have succeeded before another storage
                // write failed. Best-effort restore the persisted pre-checkout
                // state as well as the in-memory state.
                try { if (typeof persist === 'function') persist(); } catch (_) { /* original state remains in memory */ }
                return { ok: false, reason: 'persistence-failed' };
            }
            session.lines.splice(0);
            return { ok: true, reason: 'purchased', instances, total: snapshot.total, units: instances.length, snapshot };
        } catch (_) {
            return { ok: false, reason: 'checkout-failed' };
        } finally {
            session.pending = false;
        }
    };

    Object.assign(cart, { createSession, catalogKey, resolveDefinition, add, setQuantity, decrement, remove, clear, summarize, checkout });
})(typeof window !== 'undefined' ? window : globalThis);
