(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const inventory = Meeow.inventory = Meeow.inventory || {};

    const getInventoryItemKey = (item) => item.uniqueId ?? item.id;

    const findInventoryItemIndex = (items, targetItem, itemKey) => {
        const sameReference = items.findIndex(entry => entry === targetItem);
        if (sameReference >= 0) return sameReference;
        if (targetItem.uniqueId != null) {
            return items.findIndex(entry => String(entry?.uniqueId) === String(itemKey));
        }
        return items.findIndex(entry => String(entry?.id) === String(itemKey) && entry?.name === targetItem.name);
    };

    const FOOD_ATTRIBUTE_LABELS = Object.freeze({
        'temp:cold': '冰凉', 'temp:cool': '微凉', 'temp:room': '常温', 'temp:warm': '温热', 'temp:hot': '热',
        'taste:sweet': '甜', 'taste:sour': '酸', 'taste:bitter': '苦', 'taste:salty': '咸',
        'taste:spicy': '辣', 'taste:umami': '鲜味', 'taste:bland': '清淡',
        'smell:mild': '气味清淡', 'smell:fragrant': '香气明显', 'smell:pungent': '辛香浓烈', 'smell:fermented': '发酵香气',
        'texture:soft': '柔软', 'texture:crisp': '酥脆', 'texture:chewy': '耐嚼',
        'texture:creamy': '绵密', 'texture:dry': '干爽', 'texture:juicy': '多汁',
        'family:fish': '鱼类', 'family:meat': '肉类', 'family:dairy': '乳制品', 'family:egg': '蛋类',
        'family:fruit': '水果', 'family:vegetable': '蔬菜', 'family:grain': '谷物',
        'form:meal': '正餐', 'form:snack': '零食', 'form:dessert': '甜点', 'form:beverage': '饮品'
    });
    const OBJECT_ATTRIBUTE_LABELS = Object.freeze({
        'role:play': '玩耍', 'role:comfort': '陪伴', 'role:keepsake': '纪念', 'role:display': '陈列',
        'interaction:chase': '追逐', 'interaction:bat': '拍打', 'interaction:carry': '携带',
        'interaction:cuddle': '依偎', 'interaction:sniff': '嗅闻', 'interaction:observe': '观赏',
        'stimulus:rolling': '滚动', 'stimulus:swinging': '摆动', 'stimulus:fluttering': '飘动',
        'stimulus:glowing': '发光', 'stimulus:scented': '有香气'
    });
    const getItemDisplayCategory = item => {
        if (item?.type === 'letter') return '信件';
        if (item?.type === 'collectible') return '收藏品';
        const category = { food: '食物', toy: '玩具' }[item?.category] || '道具';
        return item?.type === 'consumable' ? `${category} · 消耗品` : category;
    };
    const getItemDisplayAttributes = item => {
        if (item?.semanticType === 'toy' || item?.semanticType === 'collectible') {
            const object = Meeow.semantics?.getItemObjectSemantics(item);
            return object ? object.tags.map(tag => OBJECT_ATTRIBUTE_LABELS[tag]).filter(Boolean) : [];
        }
        const checked = item?.semanticType === 'food' ? Meeow.semantics?.normalizeSemanticTags(item) : null;
        if (checked?.valid && checked.classificationKnown)
            return checked.normalized.tags.map(tag => FOOD_ATTRIBUTE_LABELS[tag]).filter(Boolean);
        if (item?.category !== 'food') return [];
        const optional = Meeow.semantics?.normalizeOptionalFoodTags(item?.semanticTags);
        return (optional?.tags || []).map(tag => FOOD_ATTRIBUTE_LABELS[tag]).filter(Boolean);
    };
    const getItemDisplaySummary = item => {
        const category = getItemDisplayCategory(item);
        const checked = item?.semanticType === 'food' ? Meeow.semantics?.normalizeSemanticTags(item) : null;
        if (!checked?.valid || !checked.classificationKnown) return category;
        const shortTags = checked.normalized.tags
            .filter(tag => tag.startsWith('taste:') || tag.startsWith('family:'))
            .slice(0, 3).map(tag => FOOD_ATTRIBUTE_LABELS[tag]).filter(Boolean);
        return shortTags.length ? `${category} · ${shortTags.join(' / ')}` : category;
    };
    const canonicalValue = value => {
        if (Array.isArray(value)) return value.map(canonicalValue);
        if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
            .map(key => [key, canonicalValue(value[key])]));
        return value;
    };
    const getInventoryDefinitionSignature = item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const hasSemanticFields = Object.hasOwn(item, 'semanticType') || Object.hasOwn(item, 'tags');
        const checked = hasSemanticFields ? Meeow.semantics?.normalizeSemanticTags(item) : null;
        if (hasSemanticFields && (!checked?.valid || !checked.classificationKnown)) return null;
        const objectSemantics = item.semanticType === 'toy' || item.semanticType === 'collectible';
        const definition = Object.fromEntries(Object.entries(item)
            .filter(([key]) => !['id', 'uniqueId', 'sourceCatalogId', 'price', 'tags', 'semanticTags', 'visual', 'visualHint', 'provenance'].includes(key) &&
                !(objectSemantics && key === 'semanticType')));
        if (checked && !objectSemantics) definition.tags = checked.normalized.tags;
        try { return JSON.stringify(canonicalValue(definition)); } catch (_) { return null; }
    };
    const getInventoryStackIdentity = (item, catalog = []) => {
        if (!item || item.type !== 'consumable' || item.id == null ||
            item.sourceId != null || item.fullContent != null) return null;
        const entries = Array.isArray(catalog) ? catalog : [];
        const hasSourceCatalogId = typeof item.sourceCatalogId === 'string' && item.sourceCatalogId.length > 0;
        const catalogItem = entries.find(entry =>
            entry?.type === 'consumable' && entry?.name === item.name && entry?.category === item.category &&
            (hasSourceCatalogId
                ? entry?.sourceCatalogId === item.sourceCatalogId
                : entry?.id === item.id));
        if (!catalogItem) return null;
        const definition = getInventoryDefinitionSignature(item);
        if (definition === null) return null;
        return hasSourceCatalogId
            ? `catalog-source:${item.sourceCatalogId}:${definition}`
            : `catalog:${typeof item.id}:${String(item.id)}:${definition}`;
    };
    const deriveInventoryDisplayGroups = (items, catalog = []) => {
        const groups = [];
        const byKey = new Map();
        (Array.isArray(items) ? items : []).forEach((item, index) => {
            const stableKey = getInventoryStackIdentity(item, catalog);
            if (stableKey && byKey.has(stableKey)) {
                const group = byKey.get(stableKey);
                group.instances.push(item);
                group.quantity = group.instances.length;
                return;
            }
            const group = {
                stackKey: stableKey || `instance:${index}`, representativeItem: item,
                instances: [item], quantity: 1, stackable: Boolean(stableKey)
            };
            groups.push(group);
            if (stableKey) byKey.set(stableKey, group);
        });
        return groups;
    };
    const getInventoryInstanceSelector = (item, items) => {
        const inventoryItems = Array.isArray(items) ? items : [];
        for (const key of ['uniqueId', 'id']) {
            if (item?.[key] == null) continue;
            const matches = inventoryItems.filter(entry => entry?.[key] != null &&
                typeof entry[key] === typeof item[key] && String(entry[key]) === String(item[key]));
            if (matches.length === 1 && matches[0] === item) return { key, value: item[key] };
        }
        return { key: 'reference', value: item };
    };
    const resolveInventoryInstance = (items, selector) => {
        if (!selector || !Array.isArray(items)) return null;
        if (selector.key === 'reference') return items.find(item => item === selector.value) || null;
        const matches = items.filter(item => item?.[selector.key] != null &&
            typeof item[selector.key] === typeof selector.value && String(item[selector.key]) === String(selector.value));
        return matches.length === 1 ? matches[0] : null;
    };
    const resolveInventoryInstanceByUniqueId = (items, uniqueId) => {
        if (!Array.isArray(items) || uniqueId == null) return null;
        const matches = items.filter(item => item?.uniqueId === uniqueId);
        return matches.length === 1 ? matches[0] : null;
    };
    const commitInventoryInstanceVisual = (items, uniqueId, visual, persist) => {
        const target = resolveInventoryInstanceByUniqueId(items, uniqueId);
        if (!target) return { ok: false, reason: 'target-missing-or-ambiguous', target: null };
        const hadVisual = Object.hasOwn(target, 'visual'), previousVisual = target.visual;
        target.visual = visual;
        let persisted = false;
        try { persisted = typeof persist === 'function' && persist() === true; } catch (_) { persisted = false; }
        if (!persisted) {
            if (hadVisual) target.visual = previousVisual; else delete target.visual;
            return { ok: false, reason: 'persistence-failed', target };
        }
        return { ok: true, reason: '', target };
    };

    const hasCatReactionHumanDialogue = (reaction, itemForm) => {
        if (itemForm !== 'CAT') return false;
        const quotePatterns = [
            /"([^"]*)"/g,
            /“([^”]*)”/g,
            /「([^」]*)」/g,
            /『([^』]*)』/g
        ];
        const removableSoundAndPunctuation = /(?:喵|咪|呜|嗷|嘶|呼噜|呼嚕|咕噜|咕嚕|哈气|哈氣|呼|噜|嚕|\s|[，。！？、…·—\-~～!?,.;:：；（）()\[\]【】])+/g;
        return quotePatterns.some((pattern) => {
            let match;
            while ((match = pattern.exec(reaction)) !== null) {
                if (match[1].replace(removableSoundAndPunctuation, '')) return true;
            }
            return false;
        });
    };

    const resolveFoodReactionAuthority = (item, profile) => {
        const score = Meeow.semantics?.scoreResidentPreference(profile, item);
        if (!score?.valid) return {
            valid: false, authority: 'invalid-semantic', reactionClass: 'unknown',
            reason: score?.reason || 'semantic-infrastructure-unavailable', error: score?.error || 'Semantic validation unavailable.'
        };
        if (!score.classificationKnown) return {
            valid: true, authority: 'legacy-ai', reactionClass: 'unknown',
            reason: score.reason, score: null, matchedNamespaces: [], matchedPreferences: []
        };
        return {
            valid: true, authority: 'program-semantic', reactionClass: score.reactionClass,
            reason: score.reason, score: score.score,
            matchedNamespaces: score.matchedNamespaces, matchedPreferences: score.matchedPreferences
        };
    };

    const mapFoodReactionClass = reactionClass => {
        const mapping = {
            love: { liked: true, itemDisposition: '非常喜欢', affinityDirection: 'positive' },
            like: { liked: true, itemDisposition: '喜欢', affinityDirection: 'positive' },
            neutral: { liked: null, itemDisposition: '平常', affinityDirection: 'none' },
            dislike: { liked: false, itemDisposition: '不喜欢', affinityDirection: 'negative' },
            hate: { liked: false, itemDisposition: '抗拒', affinityDirection: 'negative' },
            unknown: { liked: null, itemDisposition: '未判断', affinityDirection: 'none' }
        };
        return mapping[reactionClass] ? { reactionClass, ...mapping[reactionClass] } : null;
    };

    const validateItemInteractionResponse = (data, itemForm, cleanText, options = {}) => {
        const reaction = cleanText(typeof data?.reaction === 'string' ? data.reaction : '');
        const status = cleanText(typeof data?.status === 'string' ? data.status : '');
        const posture = typeof data?.posture === 'string' ? data.posture.trim() : '';
        const innerVoice = cleanText(typeof data?.innerVoice === 'string' ? data.innerVoice : '');
        const payload = { liked: data?.liked, reaction, status, posture, innerVoice };
        const hasChineseText = (value) => /[\u3400-\u9fff]/.test(value);

        if (!data || Array.isArray(data) || typeof data !== 'object') {
            return { valid: false, error: 'ITEM INTERACTION 回包不是有效对象。', payload };
        }
        if (options.reactionAuthority !== 'program-semantic' && typeof data.liked !== 'boolean') {
            return { valid: false, error: 'ITEM INTERACTION 回包缺少 boolean liked 字段。', payload };
        }
        if (!reaction || !status || !innerVoice || !hasChineseText(reaction) || !hasChineseText(status) || !hasChineseText(innerVoice)) {
            return { valid: false, error: 'ITEM INTERACTION 回包缺少完整的中文 reaction、status 或 innerVoice 字段。', payload };
        }
        const postureValidation = Meeow.statusPosture?.validateStatusPosture(status, posture);
        if (!postureValidation?.valid) {
            return { valid: false, error: `ITEM INTERACTION posture 无效：${postureValidation?.error || 'missing posture authority'}`, payload };
        }
        if (hasCatReactionHumanDialogue(reaction, itemForm)) {
            return { valid: false, error: 'CAT FORM 的 reaction 含有带引号的人类对白。', payload };
        }
        return { valid: true, error: null, payload };
    };

    Object.assign(inventory, {
        getInventoryItemKey,
        findInventoryItemIndex,
        FOOD_ATTRIBUTE_LABELS,
        getItemDisplayCategory,
        getItemDisplayAttributes,
        getItemDisplaySummary,
        getInventoryDefinitionSignature,
        getInventoryStackIdentity,
        deriveInventoryDisplayGroups,
        getInventoryInstanceSelector,
        resolveInventoryInstance,
        resolveInventoryInstanceByUniqueId,
        commitInventoryInstanceVisual,
        hasCatReactionHumanDialogue,
        resolveFoodReactionAuthority,
        mapFoodReactionClass,
        validateItemInteractionResponse
    });
}(window));
