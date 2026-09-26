import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({ window: {} });
for (const path of ['../js/meeow-data.js', '../js/meeow-semantics.js',
    '../js/meeow-resident-semantics.js', '../js/meeow-inventory.js']) {
    vm.runInContext(read(path), context, { filename: path });
}
const { data, semantics, residentSemantics, inventory } = context.window.Meeow;
const roster = data.ALL_BUILTIN_CATS;
const rosterById = new Map(roster.map(cat => [cat.id, cat]));
const app = read('../index.html');
const catalogStart = app.indexOf('                let initialShopItems = [');
const catalogEnd = app.indexOf('                const reconcileBuiltInSemanticFoods =', catalogStart);
assert.ok(catalogStart >= 0 && catalogEnd > catalogStart);
vm.runInContext(`${app.slice(catalogStart, catalogEnd)}\nglobalThis.catalog = initialShopItems;`, context);
const foods = context.catalog.filter(item => item.category === 'food' && item.semanticType === 'food');
const foodIds = [
    'grilled-fish-plate', 'rich-meat-broth', 'steamed-egg-custard', 'steamed-egg-meat-roll',
    'bitter-vegetable-puree', 'cool-fish-vegetable-plate', 'chilled-fish-jelly', 'spiced-meat-jerky',
    'salted-grain-crisps', 'spiced-crisp-vegetables', 'sweet-sour-fruit-cup', 'dairy-grain-pudding',
    'chilled-fermented-cheese', 'lactose-free-warm-milk', 'fruit-pulp-drink', 'warm-grain-porridge'
];
assert.deepEqual(plain(foods.map(item => item.id)), foodIds.map(id => `builtin-food:${id}`));
const foodById = new Map(foods.map(item => [item.id, item]));

const approved = {
    'gotham-bruce': {
        concept: 'clean, savory, restrained; avoids overpowering flavors',
        food: { 'taste:salty': 1, 'smell:pungent': -2, 'texture:chewy': 1 }
    },
    'gotham-dick': {
        concept: 'bright, fresh, crisp; likes lively tastes',
        food: { 'taste:sour': 1, 'texture:crisp': 1, 'temp:cool': 1, 'taste:bland': -1 }
    },
    'gotham-tim': {
        concept: 'hot, savory, practical comfort food',
        food: { 'temp:hot': 1, 'taste:salty': 1, 'taste:bland': -1, 'texture:chewy': 1 }
    },
    'marvel-peter': {
        concept: 'familiar, sweet-leaning, crisp; avoids very aggressive flavors',
        food: { 'taste:sweet': 2, 'texture:crisp': 1, 'taste:spicy': -1 }
    },
    'marvel-thor': {
        concept: 'hearty, savory, rich',
        food: { 'taste:umami': 1, 'family:meat': 2, 'taste:sour': -1 }
    },
    'greek-telemachus': {
        concept: 'mild, soft, approachable; dislikes aggressive smells',
        food: { 'taste:bland': 1, 'texture:soft': 1, 'smell:pungent': -2 }
    },
    'greek-odysseus': {
        concept: 'practical, savory, portable; dislikes dry food',
        food: { 'family:fish': 1, 'taste:umami': 1, 'taste:sour': -1, 'texture:dry': -1 }
    },
    'underworld-achilles': {
        concept: 'warm, simple, substantial',
        food: { 'temp:warm': 1, 'taste:salty': 1, 'texture:creamy': -1 }
    },
    'underworld-hades': {
        concept: 'hot, restrained, not sweet',
        food: { 'temp:hot': 1, 'taste:sweet': -2 }
    },
    'olympus-aphrodite': {
        concept: 'fresh, tart, juicy; dislikes dry and overpowering food',
        food: { 'taste:sour': 1, 'texture:juicy': 1, 'smell:pungent': -1, 'texture:dry': -1 }
    },
    'olympus-athena': {
        concept: 'clean, crisp, savory; dislikes overly aggressive spice',
        food: { 'taste:salty': 1, 'texture:crisp': 1, 'taste:spicy': -2 }
    },
    'olympus-dionysus': {
        concept: 'vivid, spicy, creamy, cool; dislikes dry food',
        food: { 'taste:spicy': 1, 'texture:creamy': 1, 'texture:dry': -1, 'temp:cool': 1 }
    }
};
const existingAxes = {
    'gotham-bruce': { socialEngagement: -2, initiative: 1, structurePreference: 2, emotionalExpression: -2, assertiveness: 2, inquiryDrive: 2 },
    'marvel-peter': { socialEngagement: 1, initiative: 2, riskTolerance: 1, structurePreference: -1, emotionalExpression: 1, assertiveness: 0 },
    'greek-telemachus': { initiative: 0, riskTolerance: 0, emotionalExpression: -1, inquiryDrive: 1 },
    'greek-odysseus': { initiative: 2, structurePreference: 2, emotionalExpression: -1, assertiveness: 1, ruleOrientation: -1, inquiryDrive: 2 },
    'underworld-hades': { socialEngagement: -2, initiative: 1, structurePreference: 2, emotionalExpression: -2, assertiveness: 2, ruleOrientation: 2 },
    'olympus-aphrodite': { socialEngagement: 1, emotionalExpression: 2, assertiveness: 1 }
};
const newAxes = {
    'gotham-dick': { socialEngagement: 2, emotionalExpression: 2 },
    'gotham-tim': { initiative: 1, inquiryDrive: 2 },
    'marvel-thor': { emotionalExpression: 1 },
    'underworld-achilles': { structurePreference: 1 },
    'olympus-athena': { structurePreference: 2, competitiveness: 1 },
    'olympus-dionysus': { socialEngagement: 1, emotionalExpression: 2 }
};
assert.equal(Object.keys(approved).length, 12);
assert.deepEqual(new Set(Object.keys(residentSemantics.BUILTIN_RESIDENT_SEMANTIC_PROFILES)), new Set(Object.keys(approved)));
for (const cat of roster) {
    assert.equal(residentSemantics.getBuiltinResidentSemanticProfile(cat.id) === null, !Object.hasOwn(approved, cat.id));
    assert.equal(Object.hasOwn(cat, 'semanticProfile'), false, 'canonical profiles stay outside mutable roster data');
}
assert.equal(app.includes('semanticProfileVersion'), false, 'canonical profiles are not serialized through the app');

const registry = semantics.SEMANTIC_TAG_REGISTRY.food.namespaces;
const score = (id, foodId) => semantics.scoreResidentPreference(
    residentSemantics.getBuiltinResidentSemanticProfile(id), foodById.get(`builtin-food:${foodId}`)
);
for (const [id, expected] of Object.entries(approved)) {
    const profile = residentSemantics.getBuiltinResidentSemanticProfile(id);
    const source = rosterById.get(id);
    assert.ok(source, `missing built-in resident ${id}`);
    assert.ok(profile, `missing semantic profile ${id}`);
    assert.equal(profile.residentId, id);
    assert.equal(semantics.validateSemanticProfile(profile).valid, true);
    assert.equal(profile.reference.mbti, null);
    assert.equal(profile.reference.palateConcept, expected.concept);
    assert.deepEqual(plain(profile.personalityAxes), existingAxes[id] || newAxes[id]);
    assert.deepEqual(plain(profile.preferences.food), expected.food);
    assert.ok(Object.keys(expected.food).length >= 2 && Object.keys(expected.food).length <= 4);
    assert.deepEqual(plain(profile.reference.foodPreferenceProvenance),
        Object.fromEntries(Object.keys(expected.food).map(tag => [tag, 'meeow-design'])));
    for (const [tag, weight] of Object.entries(profile.preferences.food)) {
        const [namespace, value] = tag.split(':');
        assert.ok(registry[namespace]?.values.includes(value), `${id}: unknown Food tag ${tag}`);
        assert.ok(Number.isInteger(weight) && weight >= -2 && weight <= 2 && weight !== 0);
        assert.equal(typeof profile.reference.foodPreferenceProvenance[tag], 'string');
    }
    assert.deepEqual(Object.keys(profile.reference.axisEvidence).sort(), Object.keys(profile.personalityAxes).sort());
    for (const [axis, entries] of Object.entries(profile.reference.axisEvidence)) {
        assert.ok(entries.length > 0, `${id}.${axis}: missing evidence`);
        for (const { sourceField, evidence } of entries) {
            assert.ok(typeof source[sourceField] === 'string' && source[sourceField].includes(evidence),
                `${id}.${axis}: evidence must occur in canonical ${sourceField}`);
        }
    }
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.reference.foodPreferenceProvenance), true);
    assert.equal(Object.isFrozen(profile.preferences.food), true);

    const changed = plain(profile);
    changed.reference.mbti = 'INTJ';
    changed.reference.notes = ['metadata cannot change Food reactions'];
    changed.reference.axisEvidence = {};
    changed.reference.palateConcept = 'a different authoring description';
    changed.reference.foodPreferenceProvenance = Object.fromEntries(
        Object.keys(changed.preferences.food).map(tag => [tag, 'source-canon'])
    );
    changed.personalityAxes = {};
    assert.equal(semantics.validateSemanticProfile(changed).valid, true);
    for (const item of foods) {
        const original = semantics.scoreResidentPreference(profile, item);
        const altered = semantics.scoreResidentPreference(changed, item);
        assert.equal(altered.score, original.score, `${id}: metadata/axes changed Food score`);
        assert.equal(altered.reactionClass, original.reactionClass);
        const decision = inventory.resolveFoodReactionAuthority(item, profile);
        assert.equal(decision.authority, original.classificationKnown ? 'program-semantic' : 'legacy-ai');
        assert.equal(decision.reactionClass, original.reactionClass);
        if (!original.classificationKnown) {
            assert.equal(original.score, null);
            assert.equal(original.reactionClass, 'unknown');
        }
    }
    assert.ok(foods.some(item => semantics.scoreResidentPreference(profile, item).reactionClass === 'unknown'),
        `${id}: unmatched Food must remain unknown`);
}
assert.match(residentSemantics.getBuiltinResidentSemanticProfile('gotham-dick').reference.notes.join(' '), /麦片/);
assert.equal(Object.hasOwn(approved['gotham-dick'].food, 'family:grain'), false);
assert.match(residentSemantics.getBuiltinResidentSemanticProfile('gotham-tim').reference.notes.join(' '), /caffeine/);
assert.equal(Object.hasOwn(approved['gotham-tim'].food, 'form:beverage'), false);
assert.equal(Object.hasOwn(approved['marvel-peter'].food, 'family:egg'), false);
assert.equal(approved['olympus-aphrodite'].food['texture:juicy'], 1);
assert.deepEqual(approved['underworld-hades'].food, { 'temp:hot': 1, 'taste:sweet': -2 });
const malformed = plain(residentSemantics.getBuiltinResidentSemanticProfile('gotham-bruce'));
malformed.reference.palateConcept = '   ';
assert.equal(semantics.validateSemanticProfile(malformed).valid, false);
malformed.reference.palateConcept = approved['gotham-bruce'].concept;
malformed.reference.foodPreferenceProvenance['taste:salty'] = 'unknown-provenance';
assert.equal(semantics.validateSemanticProfile(malformed).valid, false);
delete malformed.reference.foodPreferenceProvenance['taste:salty'];
assert.equal(semantics.validateSemanticProfile(malformed).valid, false);

const expectedMatrix = {
    'gotham-bruce': 'LIKE ? ? ? ? LIKE LIKE LIKE LIKE HATE ? ? ? ? ? ?',
    'gotham-dick': '? ? ? ? LIKE LIKE LIKE ? LIKE LIKE ? LIKE LIKE DISLIKE ? LIKE',
    'gotham-tim': 'LIKE ? ? LIKE LIKE LIKE LIKE LIKE LIKE ? ? ? ? DISLIKE ? ?',
    'marvel-peter': '? ? ? ? LIKE ? LIKE ? LIKE NEUTRAL LOVE LOVE LOVE ? LOVE LOVE',
    'marvel-thor': 'LIKE LOVE LIKE LOVE LIKE NEUTRAL LIKE LOVE ? ? ? ? DISLIKE ? ? ?',
    'greek-telemachus': 'LIKE LIKE LIKE LIKE ? ? ? ? ? HATE LIKE LIKE ? LIKE ? ?',
    'greek-odysseus': 'LIKE LIKE LIKE LIKE LIKE LIKE LIKE DISLIKE DISLIKE DISLIKE ? ? DISLIKE ? ? ?',
    'underworld-achilles': 'LIKE LIKE NEUTRAL DISLIKE ? ? LIKE LIKE LIKE ? DISLIKE DISLIKE DISLIKE NEUTRAL ? DISLIKE',
    'underworld-hades': 'LIKE ? ? LIKE LIKE ? ? ? ? ? HATE HATE HATE ? HATE HATE',
    'olympus-aphrodite': 'LIKE LIKE ? ? LIKE LIKE DISLIKE DISLIKE DISLIKE DISLIKE ? ? LIKE ? LIKE ?',
    'olympus-athena': 'LIKE ? ? ? LIKE ? LIKE LIKE LIKE DISLIKE ? ? ? ? ? ?',
    'olympus-dionysus': '? ? LIKE LIKE ? LIKE DISLIKE DISLIKE DISLIKE NEUTRAL LIKE LIKE LIKE LIKE ? LIKE'
};
const totals = { LOVE: 0, LIKE: 0, NEUTRAL: 0, DISLIKE: 0, HATE: 0, '?': 0 };
for (const [id, expected] of Object.entries(expectedMatrix)) {
    const actual = foods.map(item => {
        const reaction = semantics.scoreResidentPreference(residentSemantics.getBuiltinResidentSemanticProfile(id), item).reactionClass;
        return reaction === 'unknown' ? '?' : reaction.toUpperCase();
    });
    assert.deepEqual(plain(actual), expected.split(' '), `${id}: production scorer matrix drifted`);
    actual.forEach(value => { totals[value] += 1; });
}
assert.deepEqual(totals, { LOVE: 8, LIKE: 68, NEUTRAL: 5, DISLIKE: 20, HATE: 7, '?': 84 });
for (const item of foods) assert.ok(Object.keys(expectedMatrix).some(id => score(id, item.id.slice('builtin-food:'.length)).classificationKnown), `${item.name}: all residents unknown`);
for (const [id, suffix, expected] of [
    ['gotham-bruce', 'spiced-meat-jerky', 'like'],
    ['gotham-bruce', 'spiced-crisp-vegetables', 'hate'],
    ['marvel-peter', 'sweet-sour-fruit-cup', 'love'],
    ['marvel-peter', 'fruit-pulp-drink', 'love'],
    ['marvel-peter', 'dairy-grain-pudding', 'love'],
    ['marvel-thor', 'spiced-meat-jerky', 'love'],
    ['marvel-thor', 'rich-meat-broth', 'love'],
    ['marvel-thor', 'steamed-egg-meat-roll', 'love'],
    ['greek-telemachus', 'lactose-free-warm-milk', 'like'],
    ['greek-telemachus', 'spiced-crisp-vegetables', 'hate'],
    ['underworld-hades', 'sweet-sour-fruit-cup', 'hate'],
    ['underworld-hades', 'fruit-pulp-drink', 'hate'],
    ['underworld-hades', 'dairy-grain-pudding', 'hate'],
    ['olympus-athena', 'spiced-crisp-vegetables', 'dislike']
]) assert.equal(score(id, suffix).reactionClass, expected);
assert.equal(score('marvel-thor', 'rich-meat-broth').score, 1.5);
assert.equal(score('greek-telemachus', 'spiced-crisp-vegetables').score, -2);
assert.equal(score('underworld-achilles', 'steamed-egg-custard').score, 0);
assert.equal(score('underworld-hades', 'chilled-fermented-cheese').reactionClass, 'hate');
console.log('Resident Food Preference Pilot V1 fixture passed.');
