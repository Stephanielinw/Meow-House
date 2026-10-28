(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const residentItems = Meeow.residentItems = Meeow.residentItems || {};
    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const residentKey = value => {
        const id = isRecord(value) ? value.id : value;
        const key = (typeof id === 'string' || typeof id === 'number') && String(id).trim() ? String(id) : '';
        return ['__proto__', 'prototype', 'constructor'].includes(key) ? '' : key;
    };
    const isGiftableToResident = item => isRecord(item) && item.type !== 'letter' && item.category !== 'food' &&
        (item.category === 'toy' || item.type === 'toy' || item.type === 'collectible' || item.type === 'souvenir');
    const validPhysicalId = id => (typeof id === 'string' && id.trim().length > 0) ||
        (typeof id === 'number' && Number.isFinite(id)); // Preserve historical primitive instance IDs.
    const physicalKey = id => `${typeof id}:${String(id)}`;
    const isResidentItemBondEligible = item => isGiftableToResident(item);
    const validTimestamp = value => value === null || (typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        !Number.isNaN(Date.parse(value)));
    const validBond = bond => isRecord(bond) && bond.version === 1 &&
        Number.isInteger(bond.familiarity) && bond.familiarity >= 0 && bond.familiarity <= 5 &&
        Number.isInteger(bond.fondness) && bond.fondness >= -2 && bond.fondness <= 3 &&
        Number.isSafeInteger(bond.useCount) && bond.useCount >= 0 &&
        validTimestamp(bond.firstOwnedAt) && validTimestamp(bond.lastUsedAt) &&
        Object.keys(bond).length === 6 &&
        ['version', 'familiarity', 'fondness', 'useCount', 'firstOwnedAt', 'lastUsedAt']
            .every(field => Object.hasOwn(bond, field));
    const makeNeutralBond = (firstOwnedAt = null) => ({ version: 1, familiarity: 0,
        fondness: 0, useCount: 0, firstOwnedAt, lastUsedAt: null });
    const firstTransferIntoResident = (item, residentId) => {
        if (!isValidProvenance(item?.provenance)) return null;
        const matches = item.provenance.giftHistory.filter(event => validTimestamp(event.at) &&
            physicalKey(event.uniqueId) === physicalKey(item.uniqueId) &&
            residentKey(event.to.residentId) === residentId);
        return matches.length ? matches.reduce((earliest, event) =>
            Date.parse(event.at) < Date.parse(earliest) ? event.at : earliest, matches[0].at) : null;
    };
    const getResidentItemBond = (user, residentId, uniqueId) => {
        const id = residentKey(residentId);
        if (!id || !validPhysicalId(uniqueId) || !isRecord(user?.residentItemBonds) ||
            !isRecord(user.residentItemBonds[id])) return null;
        const bond = user.residentItemBonds[id][physicalKey(uniqueId)];
        return validBond(bond) ? { ...bond } : null;
    };
    const getResidentOwnedItemBonds = (user, residentId) => getResidentOwnedItems(user?.residentItems, residentId)
        .filter(item => isResidentItemBondEligible(item) && validPhysicalId(item.uniqueId))
        .map(item => ({ item, bond: getResidentItemBond(user, residentId, item.uniqueId) }));
    const validateResidentItemBonds = (user, residents) => {
        const errors = [];
        const roster = new Set((Array.isArray(residents) ? residents : []).map(residentKey).filter(Boolean));
        const store = user?.residentItemBonds;
        if (!isRecord(store)) return { valid: false, errors: ['invalid-bond-store'] };
        Object.entries(store).forEach(([residentId, records]) => {
            if (!residentKey(residentId) || !roster.has(residentId)) errors.push(`invalid-resident-id:${residentId}`);
            if (!isRecord(records)) { errors.push(`invalid-bond-container:${residentId}`); return; }
            Object.entries(records).forEach(([key, bond]) => {
                const match = /^(string|number):(.+)$/.exec(key);
                if (!match || !validPhysicalId(match[1] === 'number' ? Number(match[2]) : match[2]) ||
                    (match[1] === 'number' && physicalKey(Number(match[2])) !== key))
                    errors.push(`invalid-physical-id:${residentId}:${key}`);
                if (!validBond(bond)) errors.push(`invalid-bond:${residentId}:${key}`);
            });
        });
        return { valid: errors.length === 0, errors };
    };
    const normalizeResidentItemBonds = (user, residents) => {
        if (!isRecord(user) || !isRecord(user.residentItems))
            return { changed: false, errors: ['invalid-resident-item-store'] };
        let changed = false;
        if (user.residentItemBonds == null) { user.residentItemBonds = {}; changed = true; }
        if (!isRecord(user.residentItemBonds)) return { changed, errors: ['invalid-bond-store'] };
        const roster = new Set((Array.isArray(residents) ? residents : []).map(residentKey).filter(Boolean));
        Object.entries(user.residentItems).forEach(([residentId, items]) => {
            if (!roster.has(residentId) || !Array.isArray(items)) return;
            for (const item of items) {
                if (!isResidentItemBondEligible(item) || !validPhysicalId(item.uniqueId)) continue;
                const key = physicalKey(item.uniqueId);
                const records = user.residentItemBonds[residentId];
                const hasRecords = Object.hasOwn(user.residentItemBonds, residentId);
                if (hasRecords && !isRecord(records)) continue;
                if (records && Object.hasOwn(records, key)) continue; // Preserve invalid records for review.
                if (!hasRecords) user.residentItemBonds[residentId] = {};
                user.residentItemBonds[residentId][key] = makeNeutralBond(firstTransferIntoResident(item, residentId));
                changed = true;
            }
        });
        return { changed, errors: validateResidentItemBonds(user, residents).errors };
    };
    const isResidentItemCherished = bond => validBond(bond) && bond.familiarity >= 4 && bond.fondness >= 2;
    const getResidentItemBondDisplayState = bond => validBond(bond) ? {
        familiarity: ['刚收到', '开始熟悉', '已经熟悉', '很熟悉', '陪伴很久', '陪伴很久'][bond.familiarity],
        fondness: ['不太喜欢', '兴趣不大', '还在了解', '挺喜欢', '很喜欢', '特别喜欢'][bond.fondness + 2],
        cherished: isResidentItemCherished(bond)
    } : null;
    const currentOwnedItem = (user, residents, residentId, uniqueId) => {
        const id = residentKey(residentId);
        if (!id || !Array.isArray(residents) || residents.filter(cat => residentKey(cat) === id).length !== 1 ||
            !validPhysicalId(uniqueId) || !isRecord(user?.residentItems) || !Array.isArray(user.residentItems[id])) return null;
        const matches = user.residentItems[id].filter(item => item?.uniqueId === uniqueId && isResidentItemBondEligible(item));
        if (matches.length !== 1 || scanOwnership(user.inventory, user.residentItems).duplicateIds.length) return null;
        return matches[0];
    };
    const familiarityForUses = count => count >= 12 ? 5 : count >= 7 ? 4 : count >= 4 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0;
    const recordResidentItemUse = ({ user, residents, residentId, uniqueId, requireUsableSemantics = false,
        now = () => new Date().toISOString(), persist }) => {
        const item = currentOwnedItem(user, residents, residentId, uniqueId);
        if (!item) return { ok: false, reason: 'not-current-owner' };
        if (requireUsableSemantics && !Meeow.semantics?.hasValidSemanticClassification(item))
            return { ok: false, reason: 'unclassified-item' };
        const bond = getResidentItemBond(user, residentId, uniqueId);
        if (!bond) return { ok: false, reason: 'missing-or-invalid-bond' };
        let at;
        try { at = now(); } catch (_) { return { ok: false, reason: 'invalid-timestamp' }; }
        if (!validTimestamp(at) || at === null) return { ok: false, reason: 'invalid-timestamp' };
        if (bond.useCount >= Number.MAX_SAFE_INTEGER) return { ok: false, reason: 'use-count-overflow' };
        const next = { ...bond, useCount: bond.useCount + 1, lastUsedAt: at,
            familiarity: Math.max(bond.familiarity, familiarityForUses(bond.useCount + 1)) };
        const key = physicalKey(uniqueId), id = residentKey(residentId);
        user.residentItemBonds[id][key] = next;
        if (typeof persist === 'function') {
            try { if (persist() !== true) throw new Error('persistence-failed'); }
            catch (_) { user.residentItemBonds[id][key] = bond; return { ok: false, reason: 'persistence-failed' }; }
        }
        return { ok: true, bond: next };
    };
    const FONDNESS_REASONS = Object.freeze(['authorized-interaction', 'explicit-resolver']);
    const adjustResidentItemFondness = ({ user, residents, residentId, uniqueId, delta, reason, persist }) => {
        if (!Number.isInteger(delta) || delta < -2 || delta > 2 || delta === 0 || !FONDNESS_REASONS.includes(reason))
            return { ok: false, reason: 'invalid-adjustment' };
        if (!currentOwnedItem(user, residents, residentId, uniqueId)) return { ok: false, reason: 'not-current-owner' };
        const bond = getResidentItemBond(user, residentId, uniqueId);
        if (!bond) return { ok: false, reason: 'missing-or-invalid-bond' };
        const next = { ...bond, fondness: Math.max(-2, Math.min(3, bond.fondness + delta)) };
        const key = physicalKey(uniqueId), id = residentKey(residentId);
        user.residentItemBonds[id][key] = next;
        if (typeof persist === 'function') {
            try { if (persist() !== true) throw new Error('persistence-failed'); }
            catch (_) { user.residentItemBonds[id][key] = bond; return { ok: false, reason: 'persistence-failed' }; }
        }
        return { ok: true, bond: next };
    };
    const newPhysicalId = (owned, makeId = () => Meeow.shopCatalog.createInstanceUniqueId()) => {
        const used = new Set(owned.map(item => item?.uniqueId).filter(validPhysicalId).map(physicalKey));
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const id = makeId();
            if (Meeow.shopCatalog.validInstanceUniqueId(id) && !used.has(physicalKey(id))) return id;
        }
        return null;
    };
    const makeProvenance = (originOwner = { kind: 'unknown' }, origin = { kind: 'unknown' }) => ({
        version: 1, originOwner: { ...originOwner }, origin: { ...origin }, giftHistory: []
    });
    const validOwnerRef = owner => isRecord(owner) && (owner.kind === 'user' ||
        (owner.kind === 'resident' && Boolean(residentKey(owner.residentId))));
    const validGiftEvent = event => isRecord(event) && validPhysicalId(event.uniqueId) &&
        typeof event.transferId === 'string' &&
        /^gift-transfer:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.transferId) &&
        validOwnerRef(event.from) && event.to?.kind === 'resident' && Boolean(residentKey(event.to.residentId)) &&
        typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at));
    const isValidProvenance = value => isRecord(value) && value.version === 1 &&
        isRecord(value.originOwner) && ['user', 'resident', 'unknown'].includes(value.originOwner.kind) &&
        (value.originOwner.kind !== 'resident' || Boolean(residentKey(value.originOwner.residentId))) &&
        isRecord(value.origin) && typeof value.origin.kind === 'string' && value.origin.kind.length > 0 &&
        Array.isArray(value.giftHistory) && value.giftHistory.every(validGiftEvent);
    const withOrigin = (item, originOwner, origin) => {
        if (!isRecord(item)) return item;
        if (isValidProvenance(item.provenance)) return item;
        if (Object.hasOwn(item, 'provenance')) return item; // Do not erase malformed history.
        return { ...item, provenance: makeProvenance(originOwner, origin) };
    };
    const getResidentOwnedItems = (store, residentId) => {
        const key = residentKey(residentId);
        return key && isRecord(store) && Object.hasOwn(store, key) && Array.isArray(store[key]) ? store[key] : [];
    };
    const scanOwnership = (inventory, store) => {
        const owners = new Map(), duplicateIds = [], missingIds = [];
        const visit = (items, owner) => (Array.isArray(items) ? items : []).forEach((item, index) => {
            if (!validPhysicalId(item?.uniqueId)) { missingIds.push({ owner, index }); return; }
            const key = physicalKey(item.uniqueId);
            const entries = owners.get(key) || [];
            entries.push(owner);
            owners.set(key, entries);
            if (entries.length === 2) duplicateIds.push({ uniqueId: item.uniqueId, owners: entries });
        });
        visit(inventory, 'user');
        if (isRecord(store)) Object.entries(store).forEach(([id, items]) => visit(items, `resident:${id}`));
        return { duplicateIds, missingIds, ownerCount: owners.size };
    };
    const inferClaimedMailOrigin = (item, mailbox) => {
        if (!isRecord(item) || !Array.isArray(mailbox)) return null;
        const matches = mailbox.filter(mail => mail?.claimed === true && isRecord(mail.item) &&
            validPhysicalId(mail.item.id) && physicalKey(mail.item.id) === physicalKey(item.id) &&
            mail.item.name === item.name && residentKey(mail.catId));
        return matches.length === 1 ? {
            originOwner: { kind: 'resident', residentId: residentKey(matches[0].catId) },
            origin: { kind: 'resident-mail', residentId: residentKey(matches[0].catId),
                ...(matches[0].plannedMailId ? { eventId: String(matches[0].plannedMailId) } : {}) }
        } : null;
    };
    const normalizeOwnedState = (user, makeId) => {
        if (!isRecord(user) || !Array.isArray(user.inventory)) return { changed: false, assigned: 0, errors: ['invalid-user-inventory'] };
        let changed = false, assigned = 0;
        if (user.residentItems == null) { user.residentItems = {}; changed = true; }
        if (!isRecord(user.residentItems)) return { changed, assigned, errors: ['invalid-resident-item-store'] };
        const errors = [];
        Object.entries(user.residentItems).forEach(([id, items]) => { if (!Array.isArray(items)) errors.push(`invalid-resident-container:${id}`); });
        const allOwned = [...user.inventory, ...Object.values(user.residentItems).flatMap(items => Array.isArray(items) ? items : [])];
        for (const item of user.inventory) {
            if (!isGiftableToResident(item)) continue;
            if (!validPhysicalId(item.uniqueId)) {
                const id = newPhysicalId(allOwned, makeId);
                if (!id) { errors.push('physical-id-generation-failed'); continue; }
                item.uniqueId = id; changed = true; assigned += 1;
            }
            if (!Object.hasOwn(item, 'provenance')) {
                const mail = inferClaimedMailOrigin(item, user.mailbox);
                if (mail) { item.provenance = makeProvenance(mail.originOwner, mail.origin); changed = true; }
            }
        }
        const ownership = scanOwnership(user.inventory, user.residentItems);
        if (ownership.duplicateIds.length) errors.push(`duplicate-ownership:${ownership.duplicateIds.length}`);
        return { changed, assigned, errors, ownership };
    };
    const appendGiftEvent = (provenance, event) => {
        if (!isValidProvenance(provenance) || !validGiftEvent(event) ||
            provenance.giftHistory.some(entry => entry?.transferId === event.transferId)) return null;
        return { ...provenance, giftHistory: [...provenance.giftHistory, event] };
    };
    const firstGiver = item => isValidProvenance(item?.provenance) ? item.provenance.giftHistory[0]?.from || null : null;
    let transferPending = false;
    const transferUserToResident = ({ user, residents, uniqueId, recipientId, persist,
        makeTransferId = () => Meeow.shopCatalog.createInstanceUniqueId().replace(/^item-instance:/, 'gift-transfer:'),
        now = () => new Date().toISOString() }) => {
        if (transferPending) return { ok: false, reason: 'transfer-pending' };
        if (!isRecord(user) || !Array.isArray(user.inventory) || !isRecord(user.residentItems) || !validPhysicalId(uniqueId))
            return { ok: false, reason: 'invalid-state-or-id' };
        if (user.residentItemBonds != null && !isRecord(user.residentItemBonds))
            return { ok: false, reason: 'invalid-bond-store' };
        const recipient = residentKey(recipientId);
        if (!recipient || !Array.isArray(residents) || residents.filter(cat => residentKey(cat) === recipient).length !== 1)
            return { ok: false, reason: 'invalid-recipient' };
        const matching = user.inventory.filter(item => item?.uniqueId === uniqueId);
        if (matching.length !== 1) return { ok: false, reason: 'target-missing-or-ambiguous' };
        const item = matching[0];
        if (!isGiftableToResident(item)) return { ok: false, reason: 'ineligible-item' };
        const bondKey = physicalKey(uniqueId);
        const previousBonds = user.residentItemBonds;
        const existingBonds = isRecord(previousBonds) ? previousBonds[recipient] : undefined;
        if (isRecord(previousBonds) && Object.hasOwn(previousBonds, recipient) && !isRecord(existingBonds))
            return { ok: false, reason: 'invalid-bond-container' };
        if (isRecord(existingBonds) && Object.hasOwn(existingBonds, bondKey) && !validBond(existingBonds[bondKey]))
            return { ok: false, reason: 'invalid-existing-bond' };
        const ownership = scanOwnership(user.inventory, user.residentItems);
        if (ownership.duplicateIds.length) return { ok: false, reason: 'duplicate-ownership' };
        if (Object.hasOwn(user.residentItems, recipient) && !Array.isArray(user.residentItems[recipient]))
            return { ok: false, reason: 'invalid-resident-container' };
        const hadProvenance = Object.hasOwn(item, 'provenance'), previousProvenance = item.provenance;
        if (hadProvenance && !isValidProvenance(previousProvenance)) return { ok: false, reason: 'invalid-provenance' };
        let transferId, timestamp;
        try { transferId = makeTransferId(); timestamp = now(); }
        catch (_) { return { ok: false, reason: 'identity-unavailable' }; }
        const event = { transferId, uniqueId, from: { kind: 'user' },
            to: { kind: 'resident', residentId: recipient }, at: timestamp };
        const nextProvenance = appendGiftEvent(hadProvenance ? previousProvenance : makeProvenance(), event);
        if (!nextProvenance || !validTimestamp(event.at) || event.at === null) return { ok: false, reason: 'invalid-transfer-event' };
        const index = user.inventory.indexOf(item), hadContainer = Object.hasOwn(user.residentItems, recipient);
        const target = hadContainer ? user.residentItems[recipient] : (user.residentItems[recipient] = []);
        const hadBondStore = Object.hasOwn(user, 'residentItemBonds');
        const hadBondContainer = isRecord(previousBonds) && Object.hasOwn(previousBonds, recipient);
        const hadBond = isRecord(existingBonds) && Object.hasOwn(existingBonds, bondKey);
        transferPending = true;
        try {
            item.provenance = nextProvenance;
            user.inventory.splice(index, 1);
            target.push(item);
            if (!isRecord(user.residentItemBonds)) user.residentItemBonds = {};
            if (!isRecord(user.residentItemBonds[recipient])) user.residentItemBonds[recipient] = {};
            if (!hadBond) user.residentItemBonds[recipient][bondKey] = makeNeutralBond(timestamp);
            if (persist() === true) return { ok: true, item, event };
        } catch (_) { /* Roll back both ownership containers below. */ }
        finally { transferPending = false; }
        const targetIndex = target.indexOf(item);
        if (targetIndex >= 0) target.splice(targetIndex, 1);
        user.inventory.splice(index, 0, item);
        if (hadProvenance) item.provenance = previousProvenance; else delete item.provenance;
        if (!hadContainer) delete user.residentItems[recipient];
        if (!hadBond) delete user.residentItemBonds[recipient][bondKey];
        if (!hadBondContainer) delete user.residentItemBonds[recipient];
        if (!hadBondStore) delete user.residentItemBonds;
        return { ok: false, reason: 'persistence-failed' };
    };
    Object.assign(residentItems, { isGiftableToResident, validPhysicalId, newPhysicalId, makeProvenance,
        isValidProvenance, withOrigin, getResidentOwnedItems, scanOwnership, inferClaimedMailOrigin,
        normalizeOwnedState, appendGiftEvent, firstGiver, transferUserToResident,
        isResidentItemBondEligible, validBond, makeNeutralBond, getResidentItemBond,
        getResidentOwnedItemBonds, validateResidentItemBonds, normalizeResidentItemBonds,
        isResidentItemCherished, getResidentItemBondDisplayState, recordResidentItemUse,
        adjustResidentItemFondness, FONDNESS_REASONS });
    if (typeof module !== 'undefined' && module.exports) module.exports = residentItems;
}(typeof window !== 'undefined' ? window : globalThis));
