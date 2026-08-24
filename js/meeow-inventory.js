(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const inventory = Meeow.inventory = Meeow.inventory || {};

    const getInventoryItemKey = (item) => item.uniqueId ?? item.id;

    const findInventoryItemIndex = (items, targetItem, itemKey) => {
        if (targetItem.uniqueId != null) {
            return items.findIndex(entry => String(entry?.uniqueId) === String(itemKey));
        }
        const sameReference = items.findIndex(entry => entry === targetItem);
        if (sameReference >= 0) return sameReference;
        return items.findIndex(entry => String(entry?.id) === String(itemKey) && entry?.name === targetItem.name);
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

    const validateItemInteractionResponse = (data, itemForm, cleanText) => {
        const reaction = cleanText(typeof data?.reaction === 'string' ? data.reaction : '');
        const status = cleanText(typeof data?.status === 'string' ? data.status : '');
        const innerVoice = cleanText(typeof data?.innerVoice === 'string' ? data.innerVoice : '');
        const payload = { liked: data?.liked, reaction, status, innerVoice };
        const hasChineseText = (value) => /[\u3400-\u9fff]/.test(value);

        if (!data || Array.isArray(data) || typeof data !== 'object') {
            return { valid: false, error: 'ITEM INTERACTION 回包不是有效对象。', payload };
        }
        if (typeof data.liked !== 'boolean') {
            return { valid: false, error: 'ITEM INTERACTION 回包缺少 boolean liked 字段。', payload };
        }
        if (!reaction || !status || !innerVoice || !hasChineseText(reaction) || !hasChineseText(status) || !hasChineseText(innerVoice)) {
            return { valid: false, error: 'ITEM INTERACTION 回包缺少完整的中文 reaction、status 或 innerVoice 字段。', payload };
        }
        if (hasCatReactionHumanDialogue(reaction, itemForm)) {
            return { valid: false, error: 'CAT FORM 的 reaction 含有带引号的人类对白。', payload };
        }
        return { valid: true, error: null, payload };
    };

    Object.assign(inventory, {
        getInventoryItemKey,
        findInventoryItemIndex,
        hasCatReactionHumanDialogue,
        validateItemInteractionResponse
    });
}(window));
