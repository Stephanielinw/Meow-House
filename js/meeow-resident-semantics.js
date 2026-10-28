(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const semantics = Meeow.semantics;
    if (!semantics) throw new Error('Meeow semantics must load before resident semantic profiles.');
    const deepFreeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(deepFreeze);
            Object.freeze(value);
        }
        return value;
    };
    const makeProfile = (residentId, personalityAxes, evidence, { palateConcept, food, notes = [] }) => {
        const axisEvidence = Object.fromEntries(Object.entries(evidence).map(([axisName, [sourceField, excerpt]]) => [
            axisName, [{ sourceField, evidence: excerpt }]
        ]));
        const profile = {
            semanticProfileVersion: semantics.SEMANTIC_PROFILE_VERSION,
            residentId,
            reference: {
                mbti: null, notes, axisEvidence, palateConcept,
                foodPreferenceProvenance: Object.fromEntries(Object.keys(food).map(tag => [tag, 'meeow-design']))
            },
            personalityAxes,
            preferences: { food }
        };
        const validation = semantics.validateSemanticProfile(profile);
        if (!validation.valid || Object.keys(personalityAxes).some(axisName => !Object.hasOwn(axisEvidence, axisName))) {
            throw new Error(`Invalid built-in resident semantic profile: ${residentId}`);
        }
        return deepFreeze(validation.normalized);
    };
    // Evidence is an authoring audit trail, not a simulation input.
    const BUILTIN_RESIDENT_SEMANTIC_PROFILES = deepFreeze({
        'gotham-bruce': makeProfile('gotham-bruce', {
            socialEngagement: -2, initiative: 1, structurePreference: 2,
            emotionalExpression: -2, assertiveness: 2, inquiryDrive: 2
        }, {
            socialEngagement: ['prompt', 'emotional guardedness, limited disclosure, and strong personal boundaries'],
            initiative: ['prompt', 'concern is usually shown by anticipating a problem, remembering something, or quietly dealing with it'],
            structurePreference: ['personality', '控制欲强'],
            emotionalExpression: ['prompt', 'Your speech is curt and measured'],
            assertiveness: ['prompt', 'beginning from practical judgment without turning every ordinary exchange into a tactical assessment'],
            inquiryDrive: ['prompt', 'You observe before speaking']
        }, {
            palateConcept: 'clean, savory, restrained; avoids overpowering flavors',
            food: { 'taste:salty': 1, 'smell:pungent': -2, 'texture:chewy': 1 }
        }),
        'greek-telemachus': makeProfile('greek-telemachus', {
            initiative: 0, riskTolerance: 0, emotionalExpression: -1, inquiryDrive: 1
        }, {
            initiative: ['personality', '谨慎、渴望成长'],
            riskTolerance: ['prompt', 'Young, observant, and growing into courage'],
            emotionalExpression: ['prompt', 'Speak with restraint'],
            inquiryDrive: ['prompt', 'Young, observant']
        }, {
            palateConcept: 'mild, soft, approachable; dislikes aggressive smells',
            food: { 'taste:bland': 1, 'texture:soft': 1, 'smell:pungent': -2 }
        }),
        'greek-odysseus': makeProfile('greek-odysseus', {
            initiative: 2, structurePreference: 2, emotionalExpression: -1,
            assertiveness: 1, ruleOrientation: -1, inquiryDrive: 2
        }, {
            initiative: ['personality', '机敏、坚韧、善于谋略、疲惫而不服输'],
            structurePreference: ['prompt', 'Speak strategically'],
            emotionalExpression: ['prompt', 'with dry wit and earned weariness'],
            assertiveness: ['prompt', 'proud, politically shrewd'],
            ruleOrientation: ['trickArchetype', '总能从馆舍后门回来'],
            inquiryDrive: ['personality', '机敏、坚韧、善于谋略']
        }, {
            palateConcept: 'practical, savory, portable; dislikes dry food',
            food: { 'family:fish': 1, 'taste:umami': 1, 'taste:sour': -1, 'texture:dry': -1 }
        }),
        'olympus-aphrodite': makeProfile('olympus-aphrodite', {
            socialEngagement: 1, emotionalExpression: 2, assertiveness: 1
        }, {
            socialEngagement: ['prompt', 'Magnetic, perceptive, playful'],
            emotionalExpression: ['prompt', 'playful and formidable in matters of desire'],
            assertiveness: ['personality', '迷人、敏感、知道自己很有影响力']
        }, {
            palateConcept: 'fresh, tart, juicy; dislikes dry and overpowering food',
            food: { 'taste:sour': 1, 'texture:juicy': 1, 'smell:pungent': -1, 'texture:dry': -1 }
        }),
        'underworld-hades': makeProfile('underworld-hades', {
            socialEngagement: -2, initiative: 1, structurePreference: 2,
            emotionalExpression: -2, assertiveness: 2, ruleOrientation: 2
        }, {
            socialEngagement: ['prompt', 'emotionally guarded rather than heartless'],
            initiative: ['personality', '严厉、克制、疲惫、极重责任'],
            structurePreference: ['trickArchetype', '把每张馆舍表格都摆得笔直的馆主'],
            emotionalExpression: ['prompt', 'emotionally guarded rather than heartless'],
            assertiveness: ['prompt', 'Formal, stern'],
            ruleOrientation: ['personality', '极重责任']
        }, {
            palateConcept: 'hot, restrained, not sweet',
            food: { 'temp:hot': 1, 'taste:sweet': -2 }
        }),
        'marvel-peter': makeProfile('marvel-peter', {
            socialEngagement: 1, initiative: 2, riskTolerance: 1,
            structurePreference: -1, emotionalExpression: 1, assertiveness: 0
        }, {
            socialEngagement: ['prompt', 'approachable, compassionate, and recognizably Peter Parker'],
            initiative: ['prompt', 'unable to ignore someone in trouble'],
            riskTolerance: ['prompt', 'Confidence may surface while solving a problem'],
            structurePreference: ['prompt', 'Your humor is self-deprecating, slightly awkward, earnest, and quick-witted'],
            emotionalExpression: ['prompt', 'self-deprecating, slightly awkward, earnest'],
            assertiveness: ['prompt', 'rather than swaggering or domineering']
        }, {
            palateConcept: 'familiar, sweet-leaning, crisp; avoids very aggressive flavors',
            food: { 'taste:sweet': 2, 'texture:crisp': 1, 'taste:spicy': -1 }
        }),
        'gotham-dick': makeProfile('gotham-dick', {
            socialEngagement: 2, emotionalExpression: 2
        }, {
            socialEngagement: ['prompt', 'Genuinely warm, socially gifted'],
            emotionalExpression: ['prompt', 'you SHOW it openly and honestly']
        }, {
            palateConcept: 'bright, fresh, crisp; likes lively tastes',
            food: { 'taste:sour': 1, 'texture:crisp': 1, 'temp:cool': 1, 'taste:bland': -1 },
            notes: ['Canonical personality says 爱吃麦片 (likes cereal); the Food registry has no exact cereal tag.']
        }),
        'gotham-tim': makeProfile('gotham-tim', {
            initiative: 1, inquiryDrive: 2
        }, {
            initiative: ['prompt', 'filling gaps, remembering details the user mentioned earlier, and acting on them without explanation'],
            inquiryDrive: ['prompt', 'You genuinely like understanding problems']
        }, {
            palateConcept: 'hot, savory, practical comfort food',
            food: { 'temp:hot': 1, 'taste:salty': 1, 'taste:bland': -1, 'texture:chewy': 1 },
            notes: ['Canonical personality and prompt mention caffeine; form:beverage is broader than caffeine.']
        }),
        'marvel-thor': makeProfile('marvel-thor', {
            emotionalExpression: 1
        }, {
            emotionalExpression: ['personality', '坦率、热情']
        }, {
            palateConcept: 'hearty, savory, rich',
            food: { 'taste:umami': 1, 'family:meat': 2, 'taste:sour': -1 }
        }),
        'underworld-achilles': makeProfile('underworld-achilles', {
            structurePreference: 1
        }, {
            structurePreference: ['trickArchetype', '会把每次练习都拆成三步讲清楚的教官']
        }, {
            palateConcept: 'warm, simple, substantial',
            food: { 'temp:warm': 1, 'taste:salty': 1, 'texture:creamy': -1 }
        }),
        'olympus-athena': makeProfile('olympus-athena', {
            structurePreference: 2, competitiveness: 1
        }, {
            structurePreference: ['prompt', 'Strategic, disciplined, incisive'],
            competitiveness: ['personality', '好胜']
        }, {
            palateConcept: 'clean, crisp, savory; dislikes overly aggressive spice',
            food: { 'taste:salty': 1, 'texture:crisp': 1, 'taste:spicy': -2 }
        }),
        'olympus-dionysus': makeProfile('olympus-dionysus', {
            socialEngagement: 1, emotionalExpression: 2
        }, {
            socialEngagement: ['prompt', 'welcoming'],
            emotionalExpression: ['prompt', 'Ecstatic']
        }, {
            palateConcept: 'vivid, spicy, creamy, cool; dislikes dry food',
            food: { 'taste:spicy': 1, 'texture:creamy': 1, 'texture:dry': -1, 'temp:cool': 1 }
        }),
    });
    const getBuiltinResidentSemanticProfile = residentId =>
        typeof residentId === 'string' && Object.hasOwn(BUILTIN_RESIDENT_SEMANTIC_PROFILES, residentId)
            ? BUILTIN_RESIDENT_SEMANTIC_PROFILES[residentId] : null;
    Meeow.residentSemantics = Object.freeze({
        BUILTIN_RESIDENT_SEMANTIC_PROFILES,
        getBuiltinResidentSemanticProfile
    });
}(window));
