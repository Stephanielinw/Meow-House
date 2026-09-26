import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const context = vm.createContext({ window: {} });
for (const path of ['../js/meeow-status-posture.js', '../js/meeow-semantics.js',
    '../js/meeow-item-visuals.js', '../js/meeow-resident-semantics.js', '../js/meeow-inventory.js']) {
    vm.runInContext(read(path), context, { filename: path });
}
const { semantics, inventory, residentSemantics } = context.window.Meeow;
const foodTags = ['temp:cold', 'taste:spicy', 'smell:pungent', 'texture:soft', 'family:fish', 'form:meal'];
const makeFood = () => ({ id: 'fixture-food', name: '测试食物', desc: '仅供 fixture 使用', icon: 'fa-bowl',
    type: 'consumable', category: 'food', semanticType: 'food', tags: [...foodTags] });
const makeProfile = preferences => ({ semanticProfileVersion: 1, residentId: 'fixture-resident',
    reference: { mbti: null, notes: [] }, personalityAxes: {}, preferences: { food: preferences } });
const text = { reaction: '它低头闻了闻食物。', status: '坐着看向食盆。', posture: 'sitting', innerVoice: '我会认真尝一口。' };
const plain = value => JSON.parse(JSON.stringify(value));

const start = index.indexOf('                const useItem = async (item) => {');
const end = index.indexOf('                const readItem =', start);
assert.ok(start >= 0 && end > start, 'useItem must remain extractable');
const useItemSource = index.slice(start, end);
const runCase = async ({ item = makeFood(), profile = makeProfile({ 'temp:cold': 1 }), wire = { ...text },
    residentId = 'fixture-resident' } = {}) => {
    const cat = { id: residentId, name: '测试居民', affinity: 25, chatHistory: [], status: '原状态' };
    const user = { inventory: [item] };
    const calls = [], events = [], toasts = [], statusUpdates = [];
    const state = {
        window: context.window,
        selectedCat: { value: cat }, itemInteractionInFlight: { value: false },
        thinkingStates: {}, settings: { apiKey: 'fixture-key' }, user,
        showBag: { value: true }, currentHall: { value: { name: '测试馆' } },
        getResidentForm: () => 'CAT', getResidentPublicName: target => target.name,
        getBuiltinResidentSemanticProfile: id => id === residentId ? profile : null,
        getInventoryItemKey: inventory.getInventoryItemKey,
        findInventoryItemIndex: inventory.findInventoryItemIndex,
        resolveFoodReactionAuthority: inventory.resolveFoodReactionAuthority,
        mapFoodReactionClass: inventory.mapFoodReactionClass,
        validateItemInteractionResponse: inventory.validateItemInteractionResponse,
        buildUserSharedEpisodicMemoryContext: () => ({ text: '' }),
        buildResidentPublicNameContract: () => '',
        buildAuthoritativeUserIdentityContext: () => '',
        getInteractionHolidayContext: () => '',
        buildFocusedResidentStateContext: () => '',
        cleanText: value => String(value || '').trim(),
        parseAIJSON: JSON.parse,
        callAI: async (prompt, systemPrompt, maxTokens, thinkingLevel, options) => {
            calls.push({ prompt, systemPrompt, maxTokens, thinkingLevel, options });
            const response = JSON.stringify(wire);
            const validation = options.validateResponse(response);
            assert.equal(validation, true, String(validation));
            return response;
        },
        ThinkingLevel: { LOW: 'LOW' },
        showToast: (...args) => toasts.push(args),
        addLog: () => {},
        setCatStatus: (target, status, options) => {
            statusUpdates.push({ status, options });
            target.status = status;
            return true;
        },
        getCurrentTimeStr: () => '12:00',
        appendInteractionEvent: (...args) => events.push(args),
        refreshAllStatus: () => Promise.resolve(),
        Date, Math, alert: () => {}
    };
    vm.runInNewContext(`${useItemSource}\nglobalThis.runUseItem = useItem;`, state, { filename: 'index.html:useItem' });
    await state.runUseItem(item);
    return { cat, user, calls, events, toasts, statusUpdates, state };
};

assert.deepEqual(plain(inventory.mapFoodReactionClass('love')), { reactionClass: 'love', liked: true, itemDisposition: '非常喜欢', affinityDirection: 'positive' });
assert.deepEqual(plain(inventory.mapFoodReactionClass('neutral')), { reactionClass: 'neutral', liked: null, itemDisposition: '平常', affinityDirection: 'none' });
assert.equal(inventory.mapFoodReactionClass('unknown').affinityDirection, 'none');
assert.equal(inventory.mapFoodReactionClass('invented'), null);

const baseItem = makeFood();
const noPreference = inventory.resolveFoodReactionAuthority(baseItem, makeProfile({}));
assert.equal(noPreference.valid, true);
assert.equal(noPreference.authority, 'legacy-ai');
assert.equal(noPreference.reactionClass, 'unknown');
assert.equal(noPreference.reason, 'no-matched-preferences');
assert.equal(inventory.resolveFoodReactionAuthority(baseItem, null).authority, 'legacy-ai');
const legacy = { id: 'old-item', name: '旧道具', type: 'consumable', category: 'food' };
assert.equal(inventory.resolveFoodReactionAuthority(legacy, makeProfile({ 'temp:cold': 2 })).authority, 'legacy-ai');
assert.equal(inventory.resolveFoodReactionAuthority(legacy, makeProfile({ 'temp:cold': 2 })).reactionClass, 'unknown');
assert.equal(inventory.resolveFoodReactionAuthority({ ...baseItem, tags: [...foodTags, 'taste:purple'] }, null).authority, 'invalid-semantic');
assert.equal(inventory.resolveFoodReactionAuthority({ ...baseItem, tags: [...foodTags, 'temp:hot'] }, makeProfile({})).valid, false);
assert.equal(inventory.resolveFoodReactionAuthority({ ...baseItem, tags: [...foodTags, 'taste:bland'] }, makeProfile({})).valid, false);
assert.equal(inventory.resolveFoodReactionAuthority({ ...legacy, desc: '辣辣的冰鱼' }, makeProfile({ 'taste:spicy': 2 })).authority, 'legacy-ai', 'prose must not create semantic tags');

const classes = [
    [2, 'love', true, 'positive'],
    [1, 'like', true, 'positive'],
    [0, 'neutral', null, 'none'],
    [-1, 'dislike', false, 'negative'],
    [-2, 'hate', false, 'negative']
];
for (const [weight, reactionClass, expectedLiked, direction] of classes) {
    const profile = makeProfile({ 'temp:cold': weight });
    const decision = inventory.resolveFoodReactionAuthority(makeFood(), profile);
    assert.equal(decision.authority, 'program-semantic');
    assert.equal(decision.reactionClass, reactionClass);
    assert.equal(decision.score, weight);
    assert.equal(decision.matchedNamespaces.length, 1);
    const wire = { ...text, liked: !expectedLiked }; // Deliberate AI contradiction; ignored in semantic mode.
    const result = await runCase({ profile, wire });
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].prompt.includes('[AUTHORITATIVE FOOD REACTION]'), true);
    assert.equal(result.calls[0].prompt.includes(`reactionClass: ${reactionClass.toUpperCase()}`), true);
    assert.equal(result.calls[0].prompt.includes('"liked": boolean'), false);
    assert.equal(result.cat.chatHistory.length, 1);
    assert.equal(result.cat.chatHistory[0].reactionAuthority, 'program-semantic');
    assert.equal(result.cat.chatHistory[0].reactionClass, reactionClass);
    assert.equal(result.events[0][3].liked, expectedLiked);
    assert.equal(result.events[0][3].reactionAuthority, 'program-semantic');
    assert.equal(result.user.inventory.length, 0, 'successful interaction consumes exactly one item');
    assert.equal(result.statusUpdates.length, 1, 'existing posture/status path remains active');
    const delta = result.cat.affinity - 25;
    if (direction === 'positive') assert.ok(delta >= 1 && delta <= 3);
    else if (direction === 'negative') assert.ok(delta >= -4 && delta <= -2);
    else assert.equal(delta, 0, 'known neutral food creates no affinity consequence');
}
const fractionalProfile = makeProfile({ 'temp:cold': 1, 'taste:spicy': 1, 'smell:pungent': -1 });
const fractionalScore = inventory.resolveFoodReactionAuthority(makeFood(), fractionalProfile).score;
const fractionalResult = await runCase({ profile: fractionalProfile });
assert.equal(fractionalScore, 1 / 3);
assert.notEqual(fractionalResult.cat.affinity - 25, fractionalScore, 'raw Food score must not be added to affinity');
const noLikedWire = await runCase({ wire: { ...text } });
assert.equal(noLikedWire.calls.length, 1, 'semantic response needs only four presentation fields');

const changedAxes = makeProfile({ 'temp:cold': 1 });
changedAxes.personalityAxes = { noveltySeeking: 2, riskTolerance: -2, socialEngagement: 2 };
assert.equal(inventory.resolveFoodReactionAuthority(baseItem, changedAxes).score,
    inventory.resolveFoodReactionAuthority(baseItem, makeProfile({ 'temp:cold': 1 })).score);
assert.equal(inventory.resolveFoodReactionAuthority(baseItem, changedAxes).reactionClass, 'like');
const beforeItem = JSON.stringify(baseItem), beforeProfile = JSON.stringify(changedAxes);
inventory.resolveFoodReactionAuthority(baseItem, changedAxes);
assert.equal(JSON.stringify(baseItem), beforeItem);
assert.equal(JSON.stringify(changedAxes), beforeProfile);

const legacyResult = await runCase({ item: legacy, wire: { ...text, liked: false } });
assert.equal(legacyResult.calls.length, 1);
assert.equal(legacyResult.calls[0].prompt.includes('[AUTHORITATIVE FOOD REACTION]'), false);
assert.equal(legacyResult.calls[0].prompt.includes('"liked": boolean'), true);
assert.equal(legacyResult.cat.chatHistory[0].reactionAuthority, 'legacy-ai');
assert.equal(legacyResult.cat.chatHistory[0].reactionClass, 'unknown');
assert.ok(legacyResult.cat.affinity <= 23 && legacyResult.cat.affinity >= 21);
assert.equal(legacyResult.user.inventory.length, 0);
for (const profile of [null, makeProfile({})]) {
    const result = await runCase({ profile, wire: { ...text, liked: true } });
    assert.equal(result.calls[0].prompt.includes('[AUTHORITATIVE FOOD REACTION]'), false);
    assert.equal(result.cat.chatHistory[0].reactionAuthority, 'legacy-ai');
}
const invalidItem = { ...makeFood(), tags: [...foodTags, 'taste:purple'] };
const invalidResult = await runCase({ item: invalidItem });
assert.equal(invalidResult.calls.length, 0);
assert.equal(invalidResult.user.inventory.length, 1);
assert.equal(invalidResult.cat.affinity, 25);
assert.equal(invalidResult.statusUpdates.length, 0);
assert.equal(invalidResult.state.itemInteractionInFlight.value, false);
assert.ok(invalidResult.toasts.some(([message]) => message.includes('语义分类无效')));

assert.equal(inventory.validateItemInteractionResponse({ ...text }, 'CAT', value => value.trim(),
    { reactionAuthority: 'legacy-ai' }).valid, false, 'legacy still requires liked');
assert.equal(inventory.validateItemInteractionResponse({ ...text }, 'CAT', value => value.trim(),
    { reactionAuthority: 'program-semantic' }).valid, true, 'semantic output only needs presentation');
assert.equal(inventory.validateItemInteractionResponse({ ...text, posture: 'lying' }, 'CAT', value => value.trim(),
    { reactionAuthority: 'program-semantic' }).valid, false, 'posture authority still applies');
assert.equal(inventory.validateItemInteractionResponse({ ...text, reaction: '它说“你好”。' }, 'CAT', value => value.trim(),
    { reactionAuthority: 'program-semantic' }).valid, false, 'CAT quoted human speech still rejects');

for (const id of ['gotham-bruce', 'greek-telemachus', 'greek-odysseus', 'olympus-aphrodite', 'underworld-hades', 'marvel-peter']) {
    assert.ok(Object.keys(residentSemantics.getBuiltinResidentSemanticProfile(id).preferences.food).length > 0,
        'canonical pilot Food preferences are now authored explicitly');
}
const builtInCatalogSource = index.slice(index.indexOf('                let initialShopItems = ['), index.indexOf('                const reconcileBuiltInSemanticFoods ='));
const builtInCatalogContext = vm.createContext({ window: { Meeow: { semantics } } });
vm.runInContext(`${builtInCatalogSource}\nglobalThis.items = initialShopItems;`, builtInCatalogContext);
for (const legacyFoodId of [1, 7]) {
    const legacyFood = builtInCatalogContext.items.find(item => item.id === legacyFoodId);
    assert.ok(legacyFood, `legacy Food ${legacyFoodId} remains in the shop`);
    assert.equal(semantics.validateSemanticTags(legacyFood).classificationState, 'unclassified',
        'legacy Food remains unclassified rather than gaining guessed properties');
}
assert.equal((index.match(/callAI\(/g) || []).length, 40);
console.log('Food Semantic Integration V1 fixture passed.');
