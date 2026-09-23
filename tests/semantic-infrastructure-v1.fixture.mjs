import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../index.html');
const data = read('../js/meeow-data.js');
const semanticSource = read('../js/meeow-semantics.js');
const profilesSource = read('../js/meeow-resident-semantics.js');
const context = vm.createContext({ window: {} });
vm.runInContext(data, context, { filename: 'meeow-data.js' });
vm.runInContext(semanticSource, context, { filename: 'meeow-semantics.js' });
vm.runInContext(profilesSource, context, { filename: 'meeow-resident-semantics.js' });
const semantic = context.window.Meeow.semantics;
const resident = context.window.Meeow.residentSemantics;
const roster = context.window.Meeow.data.ALL_BUILTIN_CATS;
const plain = value => JSON.parse(JSON.stringify(value));
const food = tags => ({ semanticType: 'food', tags });
const fullFood = [
    'temp:cold', 'taste:spicy', 'taste:umami', 'smell:pungent',
    'texture:creamy', 'family:fish', 'form:meal'
];
const profile = foodPreferences => ({
    semanticProfileVersion: 1, residentId: 'fixture-resident',
    reference: { mbti: null, notes: [], axisEvidence: {} },
    personalityAxes: { socialEngagement: 0 }, preferences: { food: foodPreferences }
});
const recursivelyFrozen = value => {
    assert.equal(Object.isFrozen(value), true);
    if (value && typeof value === 'object') Object.values(value).forEach(recursivelyFrozen);
};

assert.equal(semantic.SEMANTIC_PROFILE_VERSION, 1);
assert.equal(semantic.SEMANTIC_TAG_REGISTRY_VERSION, 1);
assert.deepEqual(Object.keys(semantic.PERSONALITY_AXIS_REGISTRY), [
    'socialEngagement', 'initiative', 'noveltySeeking', 'riskTolerance', 'structurePreference',
    'emotionalExpression', 'assertiveness', 'competitiveness', 'ruleOrientation', 'inquiryDrive'
]);
const foodRegistry = semantic.SEMANTIC_TAG_REGISTRY.food;
assert.deepEqual(Object.keys(foodRegistry.namespaces), ['temp', 'taste', 'smell', 'texture', 'family', 'form']);
assert.deepEqual(plain(foodRegistry.namespaces.temp.values), ['cold', 'cool', 'room', 'warm', 'hot']);
assert.deepEqual(plain(foodRegistry.namespaces.taste.values), ['sweet', 'sour', 'bitter', 'salty', 'spicy', 'umami', 'bland']);
assert.deepEqual(plain(foodRegistry.namespaces.smell.values), ['mild', 'fragrant', 'pungent', 'fermented']);
assert.deepEqual(plain(foodRegistry.namespaces.texture.values), ['soft', 'crisp', 'chewy', 'creamy', 'dry', 'juicy']);
assert.deepEqual(plain(foodRegistry.namespaces.family.values), ['fish', 'meat', 'dairy', 'egg', 'fruit', 'vegetable', 'grain']);
assert.deepEqual(plain(foodRegistry.namespaces.form.values), ['meal', 'snack', 'dessert', 'beverage']);
assert.equal(foodRegistry.maxTags, 10);
for (const rule of Object.values(foodRegistry.namespaces)) assert.equal(rule.preferenceScored, true);
recursivelyFrozen(semantic.PERSONALITY_AXIS_REGISTRY);
recursivelyFrozen(semantic.SEMANTIC_TAG_REGISTRY);
assert.equal(semantic.validateSemanticRegistry(semantic.SEMANTIC_TAG_REGISTRY).valid, true);
const duplicateRegistry = plain(semantic.SEMANTIC_TAG_REGISTRY);
duplicateRegistry.food.namespaces.temp.values.push('cold');
assert.equal(semantic.validateSemanticRegistry(duplicateRegistry).valid, false);
const duplicateNamespaceRegistry = plain(semantic.SEMANTIC_TAG_REGISTRY);
duplicateNamespaceRegistry.food.namespaces = [
    { name: 'temp', ...plain(foodRegistry.namespaces.temp) },
    { name: 'temp', ...plain(foodRegistry.namespaces.temp) }
];
assert.match(semantic.validateSemanticRegistry(duplicateNamespaceRegistry).errors[0], /duplicate namespace/);

const validInput = food([...fullFood].reverse());
const inputBefore = JSON.stringify(validInput);
const valid = semantic.validateSemanticTags(validInput);
assert.equal(valid.valid, true);
assert.equal(valid.classificationState, 'classified');
assert.equal(valid.classificationKnown, true);
assert.deepEqual(plain(valid.normalized), food(fullFood));
assert.equal(JSON.stringify(validInput), inputBefore);
assert.deepEqual(plain(semantic.normalizeSemanticTags(food(fullFood)).normalized), plain(valid.normalized));
assert.deepEqual(plain(semantic.validateSemanticTags(food(fullFood.map(tag => ` ${tag} `))).normalized), plain(valid.normalized));
assert.equal(semantic.hasValidSemanticClassification(validInput), true);
for (const candidate of [
    food(['temp:cold', 'temp:hot', ...fullFood.slice(1)]),
    food(['temp:cold', 'taste:bland', 'taste:spicy', ...fullFood.slice(3)]),
    food(fullFood.map(tag => tag === 'taste:spicy' ? 'taste:purple' : tag)),
    food(fullFood.map(tag => tag === 'taste:spicy' ? 'unknownNamespace:value' : tag)),
    food([...fullFood, 'temp:cold']),
    food([...fullFood, 'texture:soft', 'texture:dry']),
    food([...fullFood, 'taste:sweet', 'taste:sour']),
    { semanticType: 'toy', tags: fullFood },
    { semanticType: 'food' },
    { tags: fullFood },
    { semanticType: 'food', tags: [] }
]) {
    const before = JSON.stringify(candidate);
    const result = semantic.validateSemanticTags(candidate);
    assert.equal(result.valid, false, before);
    assert.equal(result.classificationState, 'invalid', before);
    assert.equal(result.classificationKnown, false, before);
    assert.equal(result.normalized, null, before);
    assert.equal(JSON.stringify(candidate), before);
}
const legacy = { id: 1, type: 'consumable', category: 'food', desc: 'legacy item' };
assert.equal(semantic.validateSemanticTags(legacy).classificationState, 'unclassified');
assert.equal(semantic.validateSemanticTags({ tags: [] }).classificationState, 'unclassified');
assert.equal(semantic.hasValidSemanticClassification(legacy), false);
assert.equal(semantic.normalizeSemanticTags(legacy).normalized.classificationState, 'unclassified');
assert.equal(semantic.validateSemanticTags(food(fullFood)).normalized.semanticType, 'food');
assert.equal(Object.hasOwn(semantic.validateSemanticTags(food(fullFood)).normalized, 'itemType'), false);

const sparse = profile({ 'temp:cold': 1 });
assert.equal(semantic.validateSemanticProfile(sparse).valid, true);
assert.equal(semantic.validateSemanticProfile(sparse).normalized.personalityAxes.socialEngagement, 0);
assert.equal(Object.hasOwn(semantic.validateSemanticProfile(sparse).normalized.personalityAxes, 'initiative'), false);
for (const candidate of [
    { ...sparse, personalityAxes: { unknownAxis: 1 } },
    { ...sparse, personalityAxes: { initiative: 3 } },
    { ...sparse, personalityAxes: { initiative: -3 } },
    { ...sparse, personalityAxes: { initiative: 0.5 } },
    { ...sparse, preferences: { food: { 'taste:purple': 1 } } },
    { ...sparse, preferences: { food: { 'taste:spicy': 3 } } },
    { ...sparse, reference: { mbti: 'BAD', notes: [] } },
    { ...sparse, residentId: '  ' }
]) assert.equal(semantic.validateSemanticProfile(candidate).valid, false);
assert.equal(semantic.validateSemanticProfile({ ...sparse, reference: { mbti: 'INTJ', notes: ['authoring only'] } }).valid, true);

const compactFood = food(['temp:cold', 'taste:spicy', 'smell:pungent', 'texture:soft', 'family:fish', 'form:snack']);
const sample = profile({ 'temp:cold': 1, 'taste:spicy': 1, 'smell:pungent': -1 });
const sampleBefore = JSON.stringify(sample);
const objectBefore = JSON.stringify(compactFood);
const scored = semantic.scoreResidentPreference(sample, compactFood);
assert.equal(scored.valid, true);
assert.equal(scored.classificationKnown, true);
assert.equal(scored.reactionClass, 'like');
assert.equal(scored.score, 1 / 3);
assert.equal(scored.matchedNamespaces.length, 3);
assert.equal(JSON.stringify(sample), sampleBefore);
assert.equal(JSON.stringify(compactFood), objectBefore);
assert.equal(semantic.scoreResidentPreference({ ...sample, reference: { mbti: 'INTJ', notes: ['different'], axisEvidence: {} } }, compactFood).score, scored.score);
assert.equal(semantic.scoreResidentPreference({ ...sample, personalityAxes: { socialEngagement: -2 } }, compactFood).score, scored.score);
for (const [weight, expected] of [[2, 'love'], [1, 'like'], [0, 'neutral'], [-1, 'dislike'], [-2, 'hate']]) {
    assert.equal(semantic.scoreResidentPreference(profile({ 'temp:cold': weight }), compactFood).reactionClass, expected);
}
for (const [total, count, expected] of [[1, 4, 'like'], [-1, 4, 'dislike'], [5, 4, 'love'], [-5, 4, 'hate']]) {
    const entries = ['temp:cold', 'taste:spicy', 'smell:pungent', 'family:fish'];
    const weights = total === 1 ? [1, 0, 0, 0] : total === -1 ? [-1, 0, 0, 0] : total === 5 ? [2, 1, 1, 1] : [-2, -1, -1, -1];
    assert.equal(weights.reduce((a, b) => a + b, 0), total);
    assert.equal(semantic.scoreResidentPreference(profile(Object.fromEntries(entries.map((tag, i) => [tag, weights[i]]))), compactFood).reactionClass, expected);
}
const clamped = semantic.scoreResidentPreference(profile({ 'taste:spicy': 2, 'taste:umami': 2, 'taste:salty': 2 }),
    food(['temp:cold', 'taste:spicy', 'taste:umami', 'taste:salty', 'smell:mild', 'texture:soft', 'family:fish', 'form:meal']));
assert.equal(clamped.matchedNamespaces[0].rawSum, 6);
assert.equal(clamped.matchedNamespaces[0].contribution, 2);
assert.equal(clamped.score, 2);
assert.equal(semantic.scoreResidentPreference(profile({ 'temp:cold': 1 }), compactFood).score, 1);
assert.equal(semantic.scoreResidentPreference(profile({ 'temp:cold': 1 }), food(fullFood)).score, 1, 'unmatched tags add no score');
assert.deepEqual(plain(semantic.scoreResidentPreference(profile({}), compactFood)).reactionClass, 'unknown');
assert.equal(semantic.scoreResidentPreference(profile({}), compactFood).classificationKnown, false);
assert.equal(semantic.scoreResidentPreference(profile({}), compactFood).score, null);
assert.equal(semantic.scoreResidentPreference(sample, legacy).reason, 'unclassified-object');
assert.equal(semantic.scoreResidentPreference(null, compactFood).reason, 'no-profile');
assert.equal(semantic.scoreResidentPreference(sample, food(['taste:purple'])).valid, false);
assert.equal(semantic.scoreResidentPreference(null, food(['taste:purple'])).valid, false);

const labels = semantic.derivePersonalityLabels({ ...sparse, personalityAxes: {
    socialEngagement: -2, initiative: -1, noveltySeeking: 0, riskTolerance: 1, structurePreference: 2
} });
assert.deepEqual(plain(labels.map(label => label.value)), [-2, -1, 0, 1, 2]);
assert.deepEqual(plain(labels.map(label => label.key)), [
    'socialEngagement:reserved', 'initiative:reactive', 'noveltySeeking:mixed',
    'riskTolerance:bold', 'structurePreference:structured'
]);
assert.equal(semantic.derivePersonalityLabels({ ...sparse, personalityAxes: {} }).length, 0);
assert.equal(Object.hasOwn(sparse, 'derivedLabels'), false);

const ids = [
    'gotham-bruce', 'greek-telemachus', 'greek-odysseus', 'olympus-aphrodite', 'underworld-hades', 'marvel-peter',
    'gotham-dick', 'gotham-tim', 'marvel-thor', 'underworld-achilles', 'olympus-athena', 'olympus-dionysus'
];
assert.deepEqual(Object.keys(resident.BUILTIN_RESIDENT_SEMANTIC_PROFILES), ids);
const rosterById = new Map(roster.map(cat => [cat.id, cat]));
recursivelyFrozen(resident.BUILTIN_RESIDENT_SEMANTIC_PROFILES);
for (const id of ids) {
    const current = resident.getBuiltinResidentSemanticProfile(id);
    assert.ok(rosterById.has(id));
    assert.equal(current, resident.getBuiltinResidentSemanticProfile(id), 'getter returns the same frozen canonical definition');
    assert.equal(semantic.validateSemanticProfile(current).valid, true);
    assert.equal(current.semanticProfileVersion, 1);
    assert.equal(current.reference.mbti, null);
    assert.ok(Object.keys(current.preferences.food).length > 0);
    for (const axis of Object.keys(current.personalityAxes)) {
        const entries = current.reference.axisEvidence[axis];
        assert.ok(entries?.length, `${id}.${axis} needs evidence`);
        for (const entry of entries) {
            const source = rosterById.get(id)[entry.sourceField];
            assert.ok(typeof source === 'string' && source.includes(entry.evidence), `${id}.${axis}: evidence must occur verbatim in canonical ${entry.sourceField}`);
        }
    }
    const withoutEvidence = plain(current);
    withoutEvidence.reference.axisEvidence = {};
    assert.equal(semantic.validateSemanticProfile(withoutEvidence).valid, true);
    assert.equal(semantic.scoreResidentPreference(withoutEvidence, compactFood).reactionClass,
        semantic.scoreResidentPreference(current, compactFood).reactionClass);
    assert.equal(Object.hasOwn(rosterById.get(id), 'semanticProfile'), false);
}
assert.equal(resident.getBuiltinResidentSemanticProfile('gotham-jason'), null);
assert.equal(resident.getBuiltinResidentSemanticProfile('nonexistent'), null);
const canonicalBefore = JSON.stringify(resident.getBuiltinResidentSemanticProfile('gotham-bruce'));
assert.throws(() => { resident.getBuiltinResidentSemanticProfile('gotham-bruce').personalityAxes.initiative = -2; }, TypeError);
assert.equal(JSON.stringify(resident.getBuiltinResidentSemanticProfile('gotham-bruce')), canonicalBefore);
assert.equal(app.includes('<script src="./js/meeow-semantics.js"></script>'), true);
assert.equal(app.includes('<script src="./js/meeow-resident-semantics.js"></script>'), true);
assert.ok(app.indexOf('meeow-data.js') < app.indexOf('meeow-semantics.js'));
assert.ok(app.indexOf('meeow-semantics.js') < app.indexOf('meeow-resident-semantics.js'));
assert.match(app, /const getBuiltinResidentSemanticProfile = window\.Meeow\.residentSemantics\.getBuiltinResidentSemanticProfile/);
assert.equal((app.match(/getBuiltinResidentSemanticProfile\(/g) || []).length, 1, 'only item use may look up a built-in semantic profile');
for (const name of ['scoreResidentPreference', 'validateSemanticTags']) {
    assert.equal(app.includes(name), false, `gameplay must use the shared inventory authority rather than calling ${name} directly`);
}
assert.equal(app.includes('semanticProfileVersion'), false, 'canonical semantic profiles must not enter save data');
assert.equal((app.match(/callAI\(/g) || []).length, 40);
console.log('Semantic Infrastructure V1 fixture passed.');
