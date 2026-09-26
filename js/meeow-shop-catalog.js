(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const shopCatalog = Meeow.shopCatalog = Meeow.shopCatalog || {};

    const CATEGORY_VALUES = new Set(['food', 'toy']);
    const SOURCE_PREFIX = 'shop-catalog:';
    const INSTANCE_PREFIX = 'item-instance:';
    const REQUEST_PREFIX = 'shop-appraisal:';
    const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

    const cloneSerializable = value => JSON.parse(JSON.stringify(value));
    const deepFreeze = value => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    };
    const typedIdKey = value => {
        if (typeof value === 'number' && Number.isFinite(value)) return `number:${Object.is(value, -0) ? '0' : String(value)}`;
        if (typeof value === 'string' && value.length) return `string:${value}`;
        return null;
    };
    const utf8Bytes = value => {
        const bytes = [];
        for (const symbol of value) {
            const point = symbol.codePointAt(0);
            if (point <= 0x7f) bytes.push(point);
            else if (point <= 0x7ff) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
            else if (point <= 0xffff) bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
            else bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
        }
        return bytes;
    };
    const base64Url = bytes => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let output = '';
        for (let index = 0; index < bytes.length; index += 3) {
            const a = bytes[index], b = bytes[index + 1], c = bytes[index + 2];
            output += alphabet[a >> 2];
            output += alphabet[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
            if (b !== undefined) output += alphabet[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
            if (c !== undefined) output += alphabet[c & 63];
        }
        return output;
    };
    const legacySourceCatalogId = value => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return `legacy-shop:number:${Object.is(value, -0) ? '0' : String(value)}`;
        }
        if (typeof value === 'string' && value.trim().length) return `legacy-shop:string:${base64Url(utf8Bytes(value))}`;
        return null;
    };

    const randomUuid = (cryptoSource = global.crypto) => {
        if (cryptoSource && typeof cryptoSource.randomUUID === 'function') return String(cryptoSource.randomUUID()).toLowerCase();
        if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') throw new Error('Secure random identity generation is unavailable.');
        const bytes = new Uint8Array(16);
        cryptoSource.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    };
    const createId = (prefix, cryptoSource) => `${prefix}${randomUuid(cryptoSource)}`;
    const createSourceCatalogId = cryptoSource => createId(SOURCE_PREFIX, cryptoSource);
    const createInstanceUniqueId = cryptoSource => createId(INSTANCE_PREFIX, cryptoSource);
    const createAppraisalRequestToken = cryptoSource => createId(REQUEST_PREFIX, cryptoSource);
    const isActiveAppraisalRequest = (activeToken, responseToken) =>
        typeof activeToken === 'string' && activeToken.length > 0 && activeToken === responseToken;
    const validGeneratedId = (value, prefix) => typeof value === 'string' &&
        new RegExp(`^${prefix}${UUID_PATTERN}$`, 'i').test(value);
    const validInstanceUniqueId = value => validGeneratedId(value, INSTANCE_PREFIX);

    const validSourceCatalogId = value => {
        if (typeof value !== 'string') return false;
        if (validGeneratedId(value, SOURCE_PREFIX)) return true;
        if (value.startsWith('legacy-shop:number:')) {
            const encoded = value.slice('legacy-shop:number:'.length);
            const parsed = Number(encoded);
            return Number.isFinite(parsed) && legacySourceCatalogId(parsed) === value;
        }
        return /^legacy-shop:string:[A-Za-z0-9_-]+$/.test(value);
    };
    const normalizeShopCatalog = (rawItems, builtInIds = []) => {
        const items = Array.isArray(rawItems) ? rawItems : [];
        const builtInKeys = new Set((Array.isArray(builtInIds) ? builtInIds : []).map(typedIdKey).filter(Boolean));
        const counts = new Map();
        items.forEach(item => {
            const key = typedIdKey(item?.id);
            if (!key || builtInKeys.has(key)) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        let changed = false, migratedCount = 0, ambiguousCount = 0;
        const normalized = items.map(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item) || validSourceCatalogId(item.sourceCatalogId)) return item;
            const key = typedIdKey(item.id);
            if (!key || builtInKeys.has(key)) return item;
            if (counts.get(key) !== 1) { ambiguousCount += 1; return item; }
            const sourceCatalogId = legacySourceCatalogId(item.id);
            if (!sourceCatalogId) return item;
            changed = true;
            migratedCount += 1;
            return { ...item, sourceCatalogId };
        });
        return { items: changed ? normalized : items, changed, migratedCount, ambiguousCount };
    };

    const sameLegacyDefinition = (item, catalogItem) => item && catalogItem &&
        typedIdKey(item.id) === typedIdKey(catalogItem.id) && item.id === catalogItem.id &&
        item.name === catalogItem.name && item.category === catalogItem.category && item.type === catalogItem.type;
    const migrateOwnedCatalogSources = (rawItems, catalog) => {
        const items = Array.isArray(rawItems) ? rawItems : [];
        const definitions = (Array.isArray(catalog) ? catalog : []).filter(item => validSourceCatalogId(item?.sourceCatalogId));
        let changed = false, migratedCount = 0, ambiguousCount = 0;
        const normalized = items.map(item => {
            if (!item || typeof item !== 'object' || validSourceCatalogId(item.sourceCatalogId)) return item;
            const matches = definitions.filter(definition => sameLegacyDefinition(item, definition));
            if (matches.length !== 1) { if (matches.length > 1) ambiguousCount += 1; return item; }
            changed = true;
            migratedCount += 1;
            return { ...item, sourceCatalogId: matches[0].sourceCatalogId };
        });
        return { items: changed ? normalized : items, changed, migratedCount, ambiguousCount };
    };

    const legacyVisual = () => ({ version: 1, mode: 'legacy-icon', spriteId: null, visualHint: null });
    const normalizePersistentVisual = (raw, normalizeVisual = Meeow.itemVisuals?.normalizeItemVisual) =>
        typeof normalizeVisual === 'function' ? normalizeVisual(raw) : null;
    const captureAuthoringSnapshot = (draft, normalizeVisual) => {
        if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { valid: false, error: '商品草稿无效。', snapshot: null };
        const name = typeof draft.name === 'string' ? draft.name.trim() : '';
        const desc = typeof draft.desc === 'string' ? draft.desc.trim() : '';
        const category = typeof draft.category === 'string' ? draft.category.trim() : '';
        const icon = typeof draft.icon === 'string' ? draft.icon.trim().slice(0, 120) : '';
        if (!name || name.length > 80) return { valid: false, error: '商品名称应为 1–80 个字符。', snapshot: null };
        if (!desc || desc.length > 500) return { valid: false, error: '商品描述应为 1–500 个字符。', snapshot: null };
        if (!CATEGORY_VALUES.has(category)) return { valid: false, error: '商品分类无效。', snapshot: null };
        if (!['ai-match', 'custom-pixel'].includes(draft.visualMode)) return { valid: false, error: '商品视觉模式无效。', snapshot: null };
        const requestedMode = draft.visualMode;
        const rawVisual = requestedMode === 'custom-pixel' ? draft.visual : legacyVisual();
        const visual = normalizePersistentVisual(rawVisual, normalizeVisual);
        if (!visual || visual.mode !== (requestedMode === 'custom-pixel' ? 'custom-pixel' : 'legacy-icon'))
            return { valid: false, error: requestedMode === 'custom-pixel' ? '请先完成并保存像素图。' : '商品视觉无效。', snapshot: null };
        const snapshot = { name, desc, category, type: 'consumable', icon, visualMode: requestedMode, visual: cloneSerializable(visual) };
        return { valid: true, error: '', snapshot: deepFreeze(snapshot) };
    };
    const normalizeAppraisal = (raw, category = 'toy') => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { valid: false, approved: false, error: '审核回包无效。' };
        if (raw.approved !== true) return { valid: true, approved: false, reason: typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 300) : '' };
        if (!Number.isInteger(raw.price) || raw.price < 1 || raw.price > 999999) return { valid: false, approved: false, error: '审核价格无效。' };
        if (!Number.isInteger(raw.effect) || raw.effect < 1 || raw.effect > 3) return { valid: false, approved: false, error: '审核效果无效。' };
        const foodTags = category === 'food'
            ? Meeow.semantics?.normalizeOptionalFoodTags(raw.semanticTags) || { tags: [], rejected: [] }
            : { tags: [], rejected: [] };
        const objectSemantics = category === 'toy'
            ? Meeow.semantics?.normalizeObjectSemanticProposal(raw.objectSemantics, 'toy') || null : null;
        const visualHint = Meeow.itemVisuals?.validateVisualHint(raw.visualHint) || null;
        return { valid: true, approved: true, price: raw.price, effect: raw.effect,
            reason: typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 300) : '',
            visualHint,
            ...(category === 'food' ? { semanticTags: foodTags.tags, rejectedSemanticTags: foodTags.rejected } : {}),
            ...(category === 'toy' ? { objectSemantics } : {}) };
    };
    const resolveAppraisedVisual = (snapshot, hint, entries = Meeow.itemVisuals?.registry || []) => {
        if (snapshot?.visualMode === 'custom-pixel') return normalizePersistentVisual(snapshot.visual);
        if (snapshot?.visualMode !== 'ai-match') return null;
        const acceptedHint = Meeow.itemVisuals?.validateVisualHint(hint);
        const firstParty = entries.filter(entry => entry.sourceType === 'first-party' && entry.resolverEligible === true &&
            /^(basefood|baseitem):/.test(entry.id));
        const candidate = acceptedHint ? Meeow.itemVisuals.resolveItemSpriteCandidate(acceptedHint, firstParty) : null;
        return normalizePersistentVisual({ version: 1, mode: candidate ? 'auto-sprite' : 'legacy-icon',
            spriteId: candidate?.spriteId || null, visualHint: acceptedHint });
    };
    const createCatalogDefinition = (snapshot, appraisal, sourceCatalogId) => {
        if (!snapshot || snapshot.type !== 'consumable' || !CATEGORY_VALUES.has(snapshot.category) || !validSourceCatalogId(sourceCatalogId)) return null;
        const normalizedAppraisal = normalizeAppraisal(appraisal, snapshot.category);
        if (!normalizedAppraisal.valid || !normalizedAppraisal.approved) return null;
        const name = typeof snapshot.name === 'string' ? snapshot.name.trim() : '';
        const desc = typeof snapshot.desc === 'string' ? snapshot.desc.trim() : '';
        const icon = typeof snapshot.icon === 'string' ? snapshot.icon.trim().slice(0, 120) : '';
        const visual = resolveAppraisedVisual(snapshot, normalizedAppraisal.visualHint);
        if (!name || name.length > 80 || !desc || desc.length > 500 || !visual) return null;
        const foodClassification = snapshot.category === 'food'
            ? Meeow.semantics?.normalizeOptionalFoodTags(normalizedAppraisal.semanticTags)
            : null;
        return {
            id: sourceCatalogId, sourceCatalogId,
            name, desc, icon: icon || 'fa-solid fa-box',
            category: snapshot.category, type: snapshot.type,
            price: normalizedAppraisal.price, effect: normalizedAppraisal.effect,
            visual: cloneSerializable(visual),
            ...(visual.visualHint ? { visualHint: cloneSerializable(visual.visualHint) } : {}),
            ...(foodClassification?.complete
                ? { semanticType: 'food', tags: [...foodClassification.tags] }
                : foodClassification?.tags.length
                    ? { semanticTags: [...foodClassification.tags] } : {}),
            ...(snapshot.category === 'toy' && normalizedAppraisal.objectSemantics
                ? { semanticType: 'toy', tags: [...normalizedAppraisal.objectSemantics.tags] } : {})
        };
    };
    const validateCatalogDefinition = (raw, normalizeVisual) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.id !== raw.sourceCatalogId ||
            !validGeneratedId(raw.sourceCatalogId, SOURCE_PREFIX) || raw.type !== 'consumable' ||
            !CATEGORY_VALUES.has(raw.category)) return { valid: false, error: 'invalid-identity-or-category' };
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        const desc = typeof raw.desc === 'string' ? raw.desc.trim() : '';
        const visual = normalizePersistentVisual(raw.visual, normalizeVisual);
        if (!name || name.length > 80 || !desc || desc.length > 500) return { valid: false, error: 'invalid-copy' };
        if (!Number.isInteger(raw.price) || raw.price < 1 || raw.price > 999999 ||
            !Number.isInteger(raw.effect) || raw.effect < 1 || raw.effect > 3) return { valid: false, error: 'invalid-appraisal' };
        if (!visual) return { valid: false, error: 'invalid-visual' };
        if (Object.hasOwn(raw, 'visualHint')) {
            const hint = Meeow.itemVisuals?.validateVisualHint(raw.visualHint);
            if (!hint || JSON.stringify(hint) !== JSON.stringify(visual.visualHint))
                return { valid: false, error: 'invalid-visual-hint' };
        }
        const hasCanonicalTags = Object.hasOwn(raw, 'semanticType') || Object.hasOwn(raw, 'tags');
        if (hasCanonicalTags) {
            const expectedType = raw.category === 'food' ? 'food' : raw.category === 'toy' ? 'toy' : null;
            const checked = raw.semanticType === expectedType ? Meeow.semantics?.normalizeSemanticTags(raw) : null;
            if (!checked?.valid || !checked.classificationKnown ||
                JSON.stringify(checked.normalized.tags) !== JSON.stringify(raw.tags) || Object.hasOwn(raw, 'semanticTags'))
                return { valid: false, error: 'invalid-semantic-classification' };
        }
        if (Object.hasOwn(raw, 'semanticTags')) {
            const checked = raw.category === 'food' ? Meeow.semantics?.normalizeOptionalFoodTags(raw.semanticTags) : null;
            if (!checked || checked.rejected.length || JSON.stringify(checked.tags) !== JSON.stringify(raw.semanticTags))
                return { valid: false, error: 'invalid-semantic-tags' };
        }
        return { valid: true, error: '', definition: { ...raw, name, desc, visual: cloneSerializable(visual) } };
    };
    // TODO(V2 storage): custom-pixel visuals are intentionally frozen into every
    // purchased instance in V1. A later version may deduplicate immutable visual
    // blobs without changing catalog or physical item identity.
    const createPurchaseInstance = (catalogItem, uniqueId) => {
        if (!catalogItem || typeof catalogItem !== 'object' || !validInstanceUniqueId(uniqueId) ||
            (Object.hasOwn(catalogItem, 'sourceCatalogId') && !validSourceCatalogId(catalogItem.sourceCatalogId))) return null;
        return { ...cloneSerializable(catalogItem), uniqueId,
            provenance: { version: 1, originOwner: { kind: 'user' }, origin: { kind: 'shop' }, giftHistory: [] } };
    };
    const findCatalogDefinition = (catalog, sourceCatalogId) => {
        if (!validSourceCatalogId(sourceCatalogId)) return null;
        const matches = (Array.isArray(catalog) ? catalog : []).filter(item => item?.sourceCatalogId === sourceCatalogId);
        return matches.length === 1 ? matches[0] : null;
    };
    const commitCatalogDefinition = (catalog, definition, persist) => {
        const checked = validateCatalogDefinition(definition);
        if (!Array.isArray(catalog) || !checked.valid) {
            return { ok: false, reason: 'invalid-definition', definition: null };
        }
        definition = checked.definition;
        const existing = catalog.find(item => item?.id === definition.id || item?.sourceCatalogId === definition.sourceCatalogId);
        if (existing) return { ok: true, reason: 'already-exists', definition: existing };
        catalog.push(definition);
        let persisted = false;
        try { persisted = typeof persist === 'function' && persist() === true; } catch (_) { persisted = false; }
        if (persisted) return { ok: true, reason: 'created', definition };
        const index = catalog.indexOf(definition);
        if (index >= 0) catalog.splice(index, 1);
        return { ok: false, reason: 'persistence-failed', definition: null };
    };
    const commitCatalogPurchase = (user, catalogItem, uniqueId, persist) => {
        if (!user || !Array.isArray(user.inventory) || !Number.isFinite(user.coins) || !Number.isFinite(catalogItem?.price)) {
            return { ok: false, reason: 'invalid-purchase', item: null };
        }
        const residentCopies = user.residentItems && typeof user.residentItems === 'object' && !Array.isArray(user.residentItems)
            ? Object.values(user.residentItems).flatMap(items => Array.isArray(items) ? items : []) : [];
        if (!validInstanceUniqueId(uniqueId) || [...user.inventory, ...residentCopies].some(entry => entry?.uniqueId === uniqueId)) {
            return { ok: false, reason: 'duplicate-or-invalid-instance-id', item: null };
        }
        if (user.coins < catalogItem.price) return { ok: false, reason: 'insufficient-funds', item: null };
        const item = createPurchaseInstance(catalogItem, uniqueId);
        if (!item) return { ok: false, reason: 'invalid-purchase', item: null };
        user.coins -= catalogItem.price;
        user.inventory.push(item);
        let persisted = false;
        try { persisted = typeof persist === 'function' && persist() === true; } catch (_) { persisted = false; }
        if (persisted) return { ok: true, reason: 'purchased', item };
        const index = user.inventory.indexOf(item);
        if (index >= 0) user.inventory.splice(index, 1);
        user.coins += catalogItem.price;
        return { ok: false, reason: 'persistence-failed', item: null };
    };

    Object.assign(shopCatalog, {
        CATEGORY_VALUES, cloneSerializable, deepFreeze, typedIdKey, legacySourceCatalogId,
        createSourceCatalogId, createInstanceUniqueId, createAppraisalRequestToken,
        isActiveAppraisalRequest, validInstanceUniqueId,
        validSourceCatalogId, normalizeShopCatalog, migrateOwnedCatalogSources,
        legacyVisual, captureAuthoringSnapshot, normalizeAppraisal, resolveAppraisedVisual, createCatalogDefinition,
        validateCatalogDefinition,
        createPurchaseInstance, findCatalogDefinition, commitCatalogDefinition, commitCatalogPurchase
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = shopCatalog;
}(typeof window !== 'undefined' ? window : globalThis));
