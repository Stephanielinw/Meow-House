(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const semantics = Meeow.semantics;
    const objects = Meeow.objectPreferences;
    const visual = Meeow.residentVisual;
    if (!semantics || !objects || !visual || !Meeow.adoptionDrafts || !Meeow.catBreeds)
        throw new Error('OC form requires adoption, breed, visual, and semantic authorities.');

    const SECTIONS = Object.freeze([
        { id: 'basic', label: '基本信息' }, { id: 'appearance', label: '外貌' },
        { id: 'personality', label: '性格' }, { id: 'preferences', label: '喜好' },
        { id: 'world', label: '世界观' }, { id: 'preview', label: '预览与确认' }
    ]);
    const GENDERS = Object.freeze([
        { value: 'Secret', label: '保密' }, { value: 'Male', label: '男' },
        { value: 'Female', label: '女' }, { value: 'Other', label: '其他' }
    ]);
    const AXIS_NAMES = Object.freeze({ socialEngagement: '社交', initiative: '主动性',
        noveltySeeking: '新鲜事物', riskTolerance: '冒险', structurePreference: '行事方式',
        emotionalExpression: '情绪表达', assertiveness: '表达主张', competitiveness: '竞争倾向',
        ruleOrientation: '规则态度', inquiryDrive: '探索问题' });
    const ENDPOINT_LABELS = Object.freeze({ reserved: '内敛', 'social-seeking': '爱社交',
        reactive: '顺势回应', proactive: '主动发起', 'routine-seeking': '偏爱熟悉', exploratory: '乐于探索',
        cautious: '谨慎', bold: '大胆', spontaneous: '随性', structured: '有条理',
        restrained: '含蓄', expressive: '外露', accommodating: '愿意迁就', directive: '坚持主张',
        cooperative: '合作', competitive: '好胜', improvisational: '随机应变',
        'duty-oriented': '重视规则', practical: '务实', investigative: '追根究底' });
    const PERSONALITY_AXES = Object.freeze(Object.entries(semantics.PERSONALITY_AXIS_REGISTRY).map(([id, rule]) =>
        Object.freeze({ id, label: AXIS_NAMES[id], negative: ENDPOINT_LABELS[rule.negative],
            positive: ENDPOINT_LABELS[rule.positive] })));
    if (PERSONALITY_AXES.length !== 10 || PERSONALITY_AXES.some(axis => !axis.label || !axis.negative || !axis.positive))
        throw new Error('OC personality labels do not cover the canonical registry.');
    const FOOD_GROUP_NAMES = Object.freeze({ temp: '温度', taste: '口味', smell: '气味',
        texture: '口感', family: '食材', form: '类型' });
    const FOOD_GROUPS = Object.freeze(Object.entries(semantics.SEMANTIC_TAG_REGISTRY.food.namespaces)
        .map(([namespace, rule]) => Object.freeze({ namespace, label: FOOD_GROUP_NAMES[namespace],
            rows: Object.freeze(rule.values.map(value => Object.freeze({ tag: `${namespace}:${value}`,
                label: Meeow.inventory.FOOD_ATTRIBUTE_LABELS[`${namespace}:${value}`] }))) })));
    const OBJECT_GROUPS = Object.freeze([
        Object.freeze({ namespace: 'interaction', label: '互动方式', rows: Object.freeze(objects.TAGS
            .filter(tag => tag.startsWith('interaction:')).map(tag => Object.freeze({ tag, label: objects.DISPLAY_LABELS[tag] }))) }),
        Object.freeze({ namespace: 'stimulus', label: '物品特征', rows: Object.freeze(objects.TAGS
            .filter(tag => tag.startsWith('stimulus:')).map(tag => Object.freeze({ tag, label: objects.DISPLAY_LABELS[tag] }))) })
    ]);
    const EYE_OPTIONS = Object.freeze([
        { value: 'original', label: '原色' }, { value: 'blue', label: '蓝色' },
        { value: 'gold', label: '金色' }, { value: 'green', label: '绿色' },
        { value: 'custom', label: '自定义颜色' }
    ]);
    const errorMessages = Object.freeze({ 'invalid-hall': '暂时找不到可入住的馆舍。',
        'missing-name': '请填写小猫的名字。', 'missing-gender': '请选择性别。',
        'missing-breed': '请选择猫品种。', 'unsupported-breed': '这个品种暂不支持。',
        'missing-appearance': '请在猫咪形象设计器里确认外貌。',
        breedAppearanceMismatch: '当前外貌与所选品种特征不一致，请修改外貌或更换品种。',
        'invalid-appearance': '猫咪外貌配置无效，请重新设计。',
        'independent-eye-authority': '瞳色与猫咪形象配置不一致。',
        'invalid-personality': '请完成十项性格倾向。',
        'invalid-food': '请至少设置一项食物喜好或不喜欢的口味。',
        'invalid-object': '请至少设置一项物品喜好或不喜欢的特征。',
        'missing-world-context': '请写下这只小猫的世界观或背景。' });
    const errorSection = Object.freeze({ 'invalid-hall': 'basic', 'missing-name': 'basic',
        'missing-gender': 'basic', 'missing-breed': 'basic', 'unsupported-breed': 'basic',
        'missing-appearance': 'appearance', breedAppearanceMismatch: 'appearance',
        'invalid-appearance': 'appearance', 'independent-eye-authority': 'basic',
        'invalid-personality': 'personality', 'invalid-food': 'preferences',
        'invalid-object': 'preferences', 'missing-world-context': 'world' });
    const messagesForSection = (errors, section) => (errors || [])
        .filter(code => !section || errorSection[code] === section)
        .map(code => errorMessages[code] || '这部分还需要补充。');
    const resolveHallId = (activeHallId, halls, defaultHallId = 'gotham') => {
        if (!Array.isArray(halls)) return null;
        const valid = halls.filter(hall => hall && hall.id !== undefined && String(hall.id).trim());
        return String(valid.find(hall => String(hall.id) === String(activeHallId))?.id ||
            valid.find(hall => String(hall.id) === String(defaultHallId))?.id || valid[0]?.id || '') || null;
    };
    const findActiveOCDraft = drafts => Object.values(drafts || {})
        .filter(draft => draft?.mode === 'oc' && ['editing', 'ready'].includes(draft.status))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) ||
            String(b.draftId).localeCompare(String(a.draftId)))[0] || null;
    const sliderToAxis = value => objects.sliderToPersonalityAxis(Number(value));
    const sliderToPreference = value => objects.sliderToPreferenceWeight(Number(value));
    const preferencePosition = weight => Number.isInteger(weight) ? weight + 3 : 3;
    const personalityPosition = value => Number.isInteger(value) ? value + 3 : 3;
    const preferenceLabel = position => ({ 1: '非常不喜欢', 2: '不太喜欢', 3: '没有明显偏好',
        4: '喜欢', 5: '非常喜欢' })[position] || '没有明显偏好';
    const neutralPersonalityProfile = residentId => ({ semanticProfileVersion: 1, residentId,
        personalityAxes: Object.fromEntries(PERSONALITY_AXES.map(axis => [axis.id, 0])),
        preferences: { food: {} } });
    const setPersonalityAxis = (profile, residentId, axisId, position) => {
        if (!Object.hasOwn(semantics.PERSONALITY_AXIS_REGISTRY, axisId)) return null;
        const value = sliderToAxis(position);
        if (value === null) return null;
        const base = profile || neutralPersonalityProfile(residentId);
        const next = { ...base, residentId, personalityAxes: { ...base.personalityAxes, [axisId]: value } };
        const checked = semantics.validateSemanticProfile(next);
        return checked.valid ? checked.normalized : null;
    };
    const setFoodPreference = (profile, residentId, tag, position) => {
        if (!FOOD_GROUPS.some(group => group.rows.some(row => row.tag === tag))) return null;
        const value = sliderToPreference(position);
        if (value === null && Number(position) !== 3) return null;
        const food = { ...(profile?.preferences?.food || {}) };
        if (value === null) delete food[tag]; else food[tag] = value;
        const checked = semantics.validateSemanticProfile({ semanticProfileVersion: 1, residentId,
            personalityAxes: {}, preferences: { food } });
        return checked.valid ? checked.normalized : null;
    };
    const setObjectPreference = (profile, residentId, tag, position) => {
        if (!objects.TAGS.includes(tag)) return null;
        const value = sliderToPreference(position);
        if (value === null && Number(position) !== 3) return null;
        const preferences = { ...(profile?.preferences || {}) };
        if (value === null) delete preferences[tag]; else preferences[tag] = value;
        const checked = objects.validateObjectPreferenceProfile({ version: 1, residentId,
            preferences, provenance: { authority: 'user-confirmed' } });
        return checked.valid ? checked.normalized : null;
    };
    const eyeChoice = value => visual.EYES.includes(value) ? value : 'custom';
    const validEyeColor = value => {
        if (typeof value !== 'string' || !value.trim()) return false;
        try { visual.canonicalizeIdentity({ ...visual.DEFAULT_CONFIG, eyeLeft: value, eyeRight: value }); return true; }
        catch (_) { return false; }
    };
    Meeow.adoptionOCForm = Object.freeze({ SECTIONS, GENDERS, PERSONALITY_AXES, FOOD_GROUPS, OBJECT_GROUPS,
        EYE_OPTIONS, errorMessages, messagesForSection, resolveHallId, findActiveOCDraft,
        sliderToAxis, sliderToPreference, preferencePosition, personalityPosition, preferenceLabel,
        neutralPersonalityProfile, setPersonalityAxis, setFoodPreference, setObjectPreference,
        eyeChoice, validEyeColor });
}(typeof window !== 'undefined' ? window : globalThis));
