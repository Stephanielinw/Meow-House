(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const inventory = Meeow.inventory = Meeow.inventory || {};

    const getInventoryItemKey = (item) => item.uniqueId ?? item.id;
    const canConsumeInventoryItem = item => item?.type === 'consumable' &&
        (!Object.hasOwn(item, 'semanticType') || item.semanticType === 'food');

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
        const object = Meeow.semantics?.getItemObjectSemantics(item);
        if (object && (item?.type !== 'consumable' || Meeow.gameplayRewards?.getGameplayRewardEvidence(item) ||
            Meeow.shopCatalog?.isBuiltInShopToy(item)))
            return object.semanticType === 'toy' ? '玩具' : '收藏品';
        if (item?.type === 'letter') return '信件';
        if (item?.type === 'collectible') return '收藏品';
        const category = { food: '食物', toy: '玩具' }[item?.category] || '道具';
        return item?.type === 'consumable' ? `${category} · 消耗品` : category;
    };
    const getItemBackpackSection = item => Meeow.shopCatalog?.isBuiltInShopToy(item) ? 'collectible' :
        item?.type === 'consumable' ? 'consumable' :
        ['collectible', 'letter'].includes(item?.type) ? 'collectible' : null;
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
        // Retain the exact legacy catalog comparison and stack signature for the
        // four toys after their presentation type changes. This is not consumption.
        const stackView = (entry, isCatalog) => Meeow.shopCatalog?.isBuiltInShopToy(entry, { catalog: isCatalog })
            ? { ...entry, type: 'consumable' } : entry;
        item = stackView(item, false);
        if (!item || item.type !== 'consumable' || item.id == null ||
            item.sourceId != null || item.fullContent != null) return null;
        const entries = Array.isArray(catalog) ? catalog.map(entry => stackView(entry, true)) : [];
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

    const mapFoodReactionClass = reactionClass => {
        const mapping = {
            strong_like: { liked: true, itemDisposition: '很喜欢', affinityDelta: 4 },
            like: { liked: true, itemDisposition: '喜欢', affinityDelta: 2 },
            neutral: { liked: null, itemDisposition: '感觉一般', affinityDelta: 0 },
            dislike: { liked: false, itemDisposition: '不太喜欢', affinityDelta: -2 },
            strong_dislike: { liked: false, itemDisposition: '很不喜欢', affinityDelta: -4 },
            unprofiled: { liked: null, itemDisposition: '偏好未设', affinityDelta: 0 },
            unclassified: { liked: null, itemDisposition: '反应未定', affinityDelta: 0 }
        };
        return mapping[reactionClass] ? { reactionClass, ...mapping[reactionClass] } : null;
    };

    const resolveResidentFoodReaction = ({ item, profile, residentId }) => {
        const score = Meeow.semantics?.scoreResidentPreference(profile, item);
        if (!score?.valid) return {
            valid: false, authority: 'invalid-semantic', reactionClass: 'unknown',
            reason: score?.reason || 'semantic-infrastructure-unavailable', error: score?.error || 'Semantic validation unavailable.'
        };
        const id = String(residentId ?? '');
        if (!id || (profile && String(profile.residentId) !== id)) return {
            valid: false, authority: 'invalid-profile', reason: 'resident-profile-mismatch'
        };
        const reactionClass = !score.classificationKnown
            ? score.reason === 'no-profile' ? 'unprofiled' : 'unclassified'
            : score.reactionClass;
        const display = mapFoodReactionClass(reactionClass);
        if (!display) return { valid: false, authority: 'invalid-reaction-class', reason: reactionClass };
        const matchedPreferences = Object.freeze(score.matchedPreferences.map(match => Object.freeze({
            tag: match.tag, weight: match.weight
        })));
        return Object.freeze({
            version: 1, valid: true,
            authority: score.classificationKnown ? 'program-semantic' : reactionClass,
            residentId: id, itemUniqueId: item?.uniqueId ?? null,
            foodIdentity: String(item?.id || item?.sourceCatalogId || ''),
            foodName: String(item?.name || ''),
            score: score.classificationKnown ? score.score : null,
            reactionClass, matchedPreferences,
            consequence: Object.freeze({ affinityDelta: display.affinityDelta }),
            reason: score.reason
        });
    };
    // Compatibility name for older callers; the one scorer remains in Meeow.semantics.
    const resolveFoodReactionAuthority = (item, profile) =>
        item?.semanticType !== 'food' && item?.category !== 'food'
            ? { valid: true, authority: 'legacy-ai', reactionClass: 'unknown',
                reason: 'non-food-consumable', score: null, matchedPreferences: [] }
            : resolveResidentFoodReaction({ item, profile, residentId: profile?.residentId || 'unprofiled-resident' });

    const buildFoodReactionPromptContract = (decision, itemName) => {
        const display = mapFoodReactionClass(decision?.reactionClass);
        if (!display) return '';
        const reasons = decision.matchedPreferences.filter(({ weight }) => weight !== 0).map(({ tag, weight }) =>
            `${weight > 0 ? '喜欢' : weight < 0 ? '不太喜欢' : '没有明显偏好'}${FOOD_ATTRIBUTE_LABELS[tag] || tag}`);
        return `[AUTHORIZED FOOD REACTION]\nFood: ${String(itemName || '')}\nReaction: ${display.itemDisposition}\n` +
            `Matched preference reasons: ${reasons.length ? reasons.join('；') : '无已匹配的偏好理由'}\n` +
            `PROGRAM has already resolved the reaction. Write only natural presentation consistent with it. ` +
            `If giving a preference reason, use ONLY the matched reasons above. Never infer a preference from the food name, ` +
            `other food attributes, description, personality, or stereotype. If there are no matched reasons, give no preference explanation. ` +
            `Do not mention scores, tags, or this contract. Do not return liked.\n`;
    };

    const FOOD_ATTRIBUTE_CUES = Object.freeze({
        'taste:spicy': /辣/, 'smell:pungent': /辛香|呛|刺鼻/,
        'texture:crisp': /脆/, 'texture:dry': /干|燥/,
        'family:vegetable': /蔬菜|菜片/
    });
    const isFoodReactionPresentationSupported = (decision, item, presentation) => {
        if (!presentation || !decision?.valid) return false;
        const text = [presentation.reaction, presentation.status, presentation.innerVoice]
            .join(' ').split(String(item?.name || '')).join('');
        const positive = /很喜欢|真喜欢|爱吃|好吃|美味|合胃口/;
        const negative = /不喜欢|讨厌|难吃|没兴趣|不愿|受不了|嫌弃/;
        if (['strong_like', 'like'].includes(decision.reactionClass) && negative.test(text)) return false;
        if (['dislike', 'strong_dislike'].includes(decision.reactionClass) && positive.test(text)) return false;
        if (['neutral', 'unprofiled', 'unclassified'].includes(decision.reactionClass) &&
            (positive.test(text) || negative.test(text))) return false;
        if (decision.authority !== 'program-semantic') return true;
        const matched = new Set(decision.matchedPreferences.filter(entry => entry.weight !== 0).map(entry => entry.tag));
        return !(item.tags || []).some(tag => !matched.has(tag) &&
            (FOOD_ATTRIBUTE_CUES[tag] || (FOOD_ATTRIBUTE_LABELS[tag]
                ? new RegExp(FOOD_ATTRIBUTE_LABELS[tag]) : null))?.test(text));
    };

    const getFoodReactionFallback = (decision, residentName, itemName) => {
        const resident = String(residentName || '它'), food = String(itemName || '这份食物');
        const reactions = {
            strong_like: `${resident}尝了尝${food}，明显很喜欢。`,
            like: `${resident}尝了尝${food}，吃得挺开心。`,
            neutral: `${resident}尝了尝${food}，反应很平常。`,
            dislike: `${resident}尝了尝${food}，没有太大兴趣。`,
            strong_dislike: `${resident}尝了尝${food}，明显不愿继续吃。`,
            unprofiled: `${resident}尝了尝${food}。`,
            unclassified: `${resident}尝了尝${food}。`
        };
        if (!Object.hasOwn(reactions, decision?.reactionClass)) return null;
        return { reaction: reactions[decision.reactionClass],
            status: `${resident}正站着尝${food}。`, posture: 'standing', innerVoice: '我先尝一口。' };
    };

    const commitFoodInteraction = ({ user, resident, item, decision, eventId, presentation,
        setStatus, appendEvent, persist, normalizeVisual, timeLabel }) => {
        if (['toy', 'collectible'].includes(item?.semanticType)) return { ok: false, reason: 'persistent-object' };
        if (!user || !resident || !decision?.valid || !eventId || !presentation ||
            String(resident.id) !== decision.residentId || decision.itemUniqueId == null ||
            decision.itemUniqueId !== item?.uniqueId) return { ok: false, reason: 'invalid-snapshot' };
        const prior = (resident.chatHistory || []).find(row => row?.foodInteractionEventId === eventId);
        if (prior) return prior.itemUniqueId === decision.itemUniqueId
            ? { ok: true, reused: true, card: prior, appliedAffinityDelta: prior.affinityDelta }
            : { ok: false, reason: 'event-identity-conflict' };
        if (resolveInventoryInstanceByUniqueId(user.inventory, decision.itemUniqueId) !== item)
            return { ok: false, reason: 'target-missing-or-ambiguous' };
        const display = mapFoodReactionClass(decision.reactionClass);
        if (!display || display.affinityDelta !== decision.consequence.affinityDelta)
            return { ok: false, reason: 'invalid-consequence' };
        const inventoryBefore = [...user.inventory];
        const residentBefore = Object.fromEntries(Object.entries(resident).map(([key, value]) =>
            [key, Array.isArray(value) ? [...value] : value]));
        const at = new Date().toISOString();
        try {
            setStatus(resident, presentation.status, {
                posture: presentation.posture, innerVoice: presentation.innerVoice,
                source: 'item', forceLog: true
            });
            if (resident.status !== presentation.status || resident.innerVoice !== presentation.innerVoice)
                throw new Error('status-presentation-rejected');
            const beforeAffinity = Math.max(0, Math.min(100, Number(resident.affinity) || 0));
            resident.affinity = Math.max(0, Math.min(100, beforeAffinity + display.affinityDelta));
            const appliedAffinityDelta = resident.affinity - beforeAffinity;
            const card = {
                role: 'assistant', type: 'item-interaction', foodInteractionEventId: eventId,
                itemUniqueId: decision.itemUniqueId, itemName: decision.foodName, itemIcon: item.icon,
                itemVisual: normalizeVisual(item.visual), itemDisposition: display.itemDisposition,
                reactionAuthority: decision.authority, reactionClass: decision.reactionClass,
                foodReaction: decision, affinityDelta: appliedAffinityDelta,
                content: presentation.reaction, time: timeLabel(), at
            };
            if (!Array.isArray(resident.chatHistory)) resident.chatHistory = [];
            resident.chatHistory.push(card);
            const event = appendEvent(resident, 'item', `馆长使用${decision.foodName}：${presentation.reaction}`, {
                source: 'item-interaction', foodInteractionEventId: eventId,
                itemUniqueId: decision.itemUniqueId, itemId: item.id, itemName: decision.foodName,
                liked: display.liked, reactionAuthority: decision.authority,
                reactionClass: decision.reactionClass, matchedPreferences: decision.matchedPreferences,
                affinityDelta: appliedAffinityDelta
            });
            if (!event) throw new Error('history-append-failed');
            if (['toy', 'collectible'].includes(item.semanticType)) throw new Error('persistent-object');
            user.inventory.splice(user.inventory.indexOf(item), 1);
            if (persist() !== true) throw new Error('persistence-failed');
            return { ok: true, reused: false, card, event, appliedAffinityDelta };
        } catch (error) {
            user.inventory.splice(0, user.inventory.length, ...inventoryBefore);
            Object.keys(resident).forEach(key => { if (!Object.hasOwn(residentBefore, key)) delete resident[key]; });
            Object.assign(resident, residentBefore);
            try { persist(); } catch (_) { /* Memory is already restored. */ }
            return { ok: false, reason: error.message || 'commit-failed' };
        }
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
        getItemBackpackSection,
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
        resolveResidentFoodReaction,
        resolveFoodReactionAuthority,
        mapFoodReactionClass,
        buildFoodReactionPromptContract,
        isFoodReactionPresentationSupported,
        getFoodReactionFallback,
        commitFoodInteraction, canConsumeInventoryItem,
        validateItemInteractionResponse
    });
}(window));
