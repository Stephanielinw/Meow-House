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
    // Design-owned tendencies for the remaining canonical residents. Unlisted
    // axes are deliberately authored as 0: the project text does not justify a
    // stable lean. Each nonzero tendency cites an existing resident field.
    const FULL_ROSTER_PERSONALITY_DESIGNS = deepFreeze({
        'gotham-jason': {
            socialEngagement: [-1, 'prompt', 'inclined to handle something alone'],
            initiative: [1, 'prompt', 'inclined to handle something alone before making a sharp, unfiltered comment'],
            emotionalExpression: [-1, 'prompt', 'you do NOT perform sadness'],
            assertiveness: [1, 'prompt', 'strong convictions about food, personal space, and not tolerating disrespect']
        },
        'gotham-damian': {
            structurePreference: [2, 'prompt', 'disciplined, and competitive'],
            assertiveness: [2, 'prompt', 'strong opinions about combat, discipline, animal husbandry'],
            competitiveness: [2, 'prompt', 'disciplined, and competitive'],
            ruleOrientation: [1, 'prompt', 'seriousness about household order, animals, and responsibility']
        },
        'gotham-stephanie': {
            initiative: [1, 'prompt', 'impulsively brave'],
            riskTolerance: [1, 'prompt', 'impulsively brave'],
            emotionalExpression: [1, 'personality', '擅长把压力变成玩笑']
        },
        'gotham-cassandra': {
            socialEngagement: [-1, 'prompt', 'Speak sparingly and directly'],
            initiative: [1, 'prompt', 'protective action'],
            emotionalExpression: [-2, 'prompt', 'warmth shows through attention and protective action'],
            inquiryDrive: [1, 'prompt', 'read movement, intent, and silence with extraordinary precision']
        },
        'gotham-barbara': {
            initiative: [1, 'prompt', 'notices practical needs']
        },
        'marvel-harry': {
            emotionalExpression: [-1, 'prompt', 'defenses tend to tighten expression, redirect a subject, or contain emotion']
        },
        'marvel-tony': {
            socialEngagement: [1, 'prompt', 'fast-talking'],
            emotionalExpression: [-1, 'prompt', 'sincerity should arrive sideways']
        },
        'marvel-wade': {
            socialEngagement: [1, 'personality', '话痨'],
            initiative: [1, 'prompt', 'reveal care through absurd action'],
            structurePreference: [-1, 'prompt', 'Chaotic, self-aware, fast, irreverent']
        },
        'marvel-steve': {
            initiative: [1, 'prompt', 'Protect without preaching'],
            ruleOrientation: [2, 'prompt', 'Principled, humble, observant, and quietly stubborn']
        },
        'marvel-bucky': {
            socialEngagement: [-1, 'prompt', 'Reserved, dryly funny'],
            emotionalExpression: [-1, 'prompt', 'Reserved, dryly funny']
        },
        'marvel-natasha': {
            socialEngagement: [-1, 'prompt', 'private, and deeply caring beneath restraint'],
            emotionalExpression: [-2, 'prompt', 'deeply caring beneath restraint'],
            inquiryDrive: [1, 'prompt', 'observant, capable, private']
        },
        'marvel-loki': {
            assertiveness: [1, 'prompt', 'Preserve his agency and family history']
        },
        'marvel-clint': {
            emotionalExpression: [-1, 'prompt', 'allergic to unnecessary drama'],
            inquiryDrive: [-1, 'prompt', 'Practical, dryly funny, loyal']
        },
        'marvel-yelena': {
            emotionalExpression: [1, 'prompt', 'emotionally honest when it matters'],
            assertiveness: [1, 'prompt', 'Blunt, perceptive, funny']
        },
        'greek-antinous': {
            socialEngagement: [1, 'prompt', 'social dominance, and selective courtesy'],
            assertiveness: [2, 'prompt', 'entitlement, possessiveness, status-consciousness, social dominance'],
            competitiveness: [1, 'prompt', 'competition, interest, rank, or a real point of conflict']
        },
        'greek-eurymachus': {
            socialEngagement: [1, 'prompt', 'Charming, calculating, and politically agile'],
            emotionalExpression: [-1, 'personality', '擅长隐藏真实意图']
        },
        'greek-telegonus': {
            initiative: [1, 'personality', '好奇、坚定'],
            noveltySeeking: [1, 'prompt', 'Curious, resilient, and shaped by a difficult inheritance'],
            inquiryDrive: [1, 'prompt', 'Curious, resilient']
        },
        'greek-melanthios': {
            riskTolerance: [-1, 'prompt', 'retreat, or change sides'],
            ruleOrientation: [-2, 'prompt', 'loyal to power rather than principle']
        },
        'greek-amphinomos': {
            initiative: [-1, 'prompt', 'tragic failure to choose in time'],
            riskTolerance: [-1, 'personality', '克制、犹豫'],
            emotionalExpression: [-1, 'prompt', 'thoughtful and restrained'],
            assertiveness: [-1, 'prompt', 'conscience, hesitation']
        },
        'greek-peiraios': {
            initiative: [1, 'prompt', 'entrusts you with practical responsibilities'],
            ruleOrientation: [1, 'prompt', 'safeguarding the gifts brought back from Menelaus'],
            inquiryDrive: [-1, 'personality', '务实']
        },
        'greek-peisistratus': {
            socialEngagement: [1, 'personality', '友善、健谈'],
            emotionalExpression: [1, 'prompt', 'Preserve his warmth']
        },
        'greek-diomendes': {
            socialEngagement: [-1, 'prompt', 'Keep your words spare'],
            initiative: [2, 'prompt', 'act decisively but never foolishly'],
            riskTolerance: [1, 'prompt', 'Direct, brave, disciplined'],
            structurePreference: [1, 'prompt', 'Direct, brave, disciplined'],
            emotionalExpression: [-1, 'prompt', 'Keep your words spare'],
            ruleOrientation: [1, 'prompt', 'disciplined, and loyal']
        },
        'troy-agamemnon': {
            initiative: [1, 'prompt', 'A commanding king'],
            assertiveness: [2, 'prompt', 'proud and politically forceful']
        },
        'troy-menelaus': {
            emotionalExpression: [-1, 'personality', '克制、心事很深'],
            ruleOrientation: [1, 'prompt', 'dutiful, and more thoughtful']
        },
        'troy-ajax': {
            socialEngagement: [-1, 'personality', '沉默'],
            initiative: [1, 'personality', '行动胜过言辞'],
            emotionalExpression: [-1, 'prompt', 'plain-spoken']
        },
        'troy-nestor': {
            socialEngagement: [1, 'prompt', 'Wise, verbose, diplomatic'],
            initiative: [1, 'prompt', 'desire to guide younger people'],
            emotionalExpression: [1, 'prompt', 'rhetorical warmth']
        },
        'troy-hector': {
            riskTolerance: [1, 'prompt', 'dutiful, brave'],
            emotionalExpression: [-1, 'personality', '克制、负责'],
            ruleOrientation: [2, 'prompt', 'Devoted, dutiful, brave']
        },
        'troy-paris': {
            initiative: [-1, 'prompt', 'evasive under pressure'],
            riskTolerance: [-1, 'prompt', 'evasive under pressure'],
            assertiveness: [-1, 'prompt', 'evasive under pressure']
        },
        'troy-aeneas': {
            socialEngagement: [-1, 'personality', '安静'],
            initiative: [1, 'prompt', 'guided by responsibility to survivors and future'],
            emotionalExpression: [-1, 'prompt', 'restrained, enduring'],
            ruleOrientation: [2, 'prompt', 'Dutiful, restrained, enduring']
        },
        'troy-sarpedon': {
            riskTolerance: [1, 'prompt', 'Noble, courageous']
        },
        'greek-zagreus': {
            socialEngagement: [1, 'prompt', 'warm, quick-witted, compassionate'],
            initiative: [2, 'prompt', 'relentlessly determined to understand his family and escape the Underworld'],
            riskTolerance: [1, 'prompt', 'Defiant, warm'],
            emotionalExpression: [1, 'prompt', 'warm, quick-witted, compassionate'],
            inquiryDrive: [1, 'prompt', 'determined to understand his family']
        },
        'underworld-hypnos': {
            socialEngagement: [1, 'personality', '友好、爱聊天'],
            structurePreference: [-1, 'prompt', 'distractible, sleepy'],
            emotionalExpression: [1, 'prompt', 'Friendly, distractible, sleepy']
        },
        'underworld-thanatos': {
            socialEngagement: [-1, 'prompt', 'Reserved, exacting'],
            initiative: [1, 'trickArchetype', '不声不响就把乱掉东西收好的人'],
            structurePreference: [1, 'prompt', 'exacting'],
            emotionalExpression: [-2, 'prompt', 'quietly tender'],
            competitiveness: [1, 'prompt', 'competitive in a controlled way']
        },
        'underworld-patroclus': {
            emotionalExpression: [-2, 'prompt', 'emotional restraint, and tenderness']
        },
        'olympus-zeus': {
            socialEngagement: [1, 'prompt', 'charismatic'],
            initiative: [1, 'prompt', 'Commanding, charismatic, impulsive'],
            structurePreference: [-1, 'prompt', 'impulsive'],
            assertiveness: [2, 'prompt', 'Commanding, charismatic, impulsive']
        },
        'olympus-hera': {
            structurePreference: [1, 'prompt', 'exacting'],
            ruleOrientation: [2, 'prompt', 'fiercely attentive to vows and dignity']
        },
        'olympus-poseidon': {
            assertiveness: [1, 'prompt', 'territorial']
        },
        'olympus-demeter': {
            assertiveness: [1, 'prompt', 'resolute, and formidable when loss is involved'],
            emotionalExpression: [1, 'prompt', 'original mythic emotional weight']
        },
        'olympus-apollo': {
            structurePreference: [1, 'prompt', 'exacting'],
            emotionalExpression: [1, 'prompt', 'artistic, exacting, and radiant']
        },
        'olympus-artemis': {
            socialEngagement: [-1, 'personality', '独立、警觉、厌恶被打扰'],
            initiative: [1, 'prompt', 'swift to judge intrusion'],
            assertiveness: [1, 'prompt', 'swift to judge intrusion']
        },
        'olympus-ares': {
            initiative: [1, 'prompt', 'drawn to conflict'],
            riskTolerance: [1, 'prompt', 'drawn to conflict'],
            emotionalExpression: [2, 'personality', '情绪炽烈'],
            assertiveness: [1, 'prompt', 'Blunt, martial, emotional']
        },
        'olympus-hephaestus': {
            socialEngagement: [-1, 'personality', '沉默'],
            emotionalExpression: [-1, 'personality', '沉默、专注']
        },
        'olympus-hermes': {
            socialEngagement: [1, 'personality', '健谈'],
            initiative: [1, 'prompt', 'Quick, witty, curious, diplomatic, and mischievous'],
            noveltySeeking: [1, 'prompt', 'curious, diplomatic, and mischievous'],
            emotionalExpression: [1, 'personality', '健谈'],
            inquiryDrive: [1, 'prompt', 'curious, diplomatic']
        }
    });
    const FULL_PERSONALITY_AXIS_IDS = Object.keys(semantics.PERSONALITY_AXIS_REGISTRY);
    const makeFoodProfile = (residentId, palateConcept, food) => {
        const design = FULL_ROSTER_PERSONALITY_DESIGNS[residentId];
        if (!design) throw new Error(`Missing built-in personality design: ${residentId}`);
        const nonzeroAxes = Object.fromEntries(Object.entries(design).map(([axisId, [value]]) => [axisId, value]));
        const evidence = Object.fromEntries(Object.entries(design).map(([axisId, [, sourceField, excerpt]]) =>
            [axisId, [sourceField, excerpt]]));
        const partial = makeProfile(residentId, nonzeroAxes, evidence, { palateConcept, food });
        const completeAxes = Object.fromEntries(FULL_PERSONALITY_AXIS_IDS.map(axisId => [axisId, nonzeroAxes[axisId] ?? 0]));
        const validated = semantics.validateSemanticProfile({ ...partial, personalityAxes: completeAxes });
        if (!validated.valid) throw new Error(`Invalid full-roster personality profile: ${residentId}`);
        return deepFreeze(validated.normalized);
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
        'gotham-jason': makeFoodProfile('gotham-jason', 'substantial and savory; impatient with bland food',
            { 'texture:chewy': 1, 'taste:umami': 1, 'taste:bland': -1 }),
        'gotham-damian': makeFoodProfile('gotham-damian', 'controlled, clean textures; avoids intrusive aromas',
            { 'taste:bland': 1, 'texture:crisp': 1, 'smell:pungent': -1 }),
        'gotham-stephanie': makeFoodProfile('gotham-stephanie', 'bright, playful crunch; little patience for bitterness',
            { 'taste:sweet': 1, 'texture:crisp': 1, 'taste:bitter': -1 }),
        'gotham-cassandra': makeFoodProfile('gotham-cassandra', 'quiet, gentle sensory experience',
            { 'smell:mild': 1, 'texture:soft': 1, 'smell:pungent': -1 }),
        'gotham-barbara': makeFoodProfile('gotham-barbara', 'warm, fresh and easy to share; avoids parched texture',
            { 'temp:warm': 1, 'texture:juicy': 1, 'texture:dry': -1 }),
        'marvel-harry': makeFoodProfile('marvel-harry', 'smooth, restrained comfort; avoids aggressive aroma',
            { 'texture:creamy': 1, 'temp:cool': 1, 'smell:pungent': -1 }),
        'marvel-tony': makeFoodProfile('marvel-tony', 'sharp, savory texture; dislikes dull food',
            { 'taste:salty': 1, 'texture:crisp': 1, 'taste:bland': -1 }),
        'marvel-wade': makeFoodProfile('marvel-wade', 'lively contrasts; little interest in blandness',
            { 'taste:spicy': 1, 'taste:sour': 1, 'taste:bland': -1 }),
        'marvel-steve': makeFoodProfile('marvel-steve', 'unfussy, warming comfort; avoids overpowering aroma',
            { 'temp:warm': 1, 'texture:soft': 1, 'smell:pungent': -1 }),
        'marvel-bucky': makeFoodProfile('marvel-bucky', 'grounded, warming food with some substance',
            { 'temp:warm': 1, 'texture:chewy': 1, 'taste:sour': -1 }),
        'marvel-natasha': makeFoodProfile('marvel-natasha', 'precise, restrained, lightly tart; avoids sweetness',
            { 'smell:mild': 1, 'taste:sour': 1, 'taste:sweet': -1 }),
        'marvel-loki': makeFoodProfile('marvel-loki', 'aromatic, expressive; dislikes dull flavors',
            { 'smell:fragrant': 1, 'taste:bland': -1 }),
        'marvel-clint': makeFoodProfile('marvel-clint', 'practical, savory, substantial; avoids intrusive aroma',
            { 'taste:salty': 1, 'texture:chewy': 1, 'smell:pungent': -1 }),
        'marvel-yelena': makeFoodProfile('marvel-yelena', 'direct, lively snack texture; rejects dullness',
            { 'texture:crisp': 1, 'taste:sour': 1, 'taste:bland': -1 }),
        'greek-antinous': makeFoodProfile('greek-antinous', 'indulgent smooth sweets; disdains plain fare',
            { 'form:dessert': 1, 'texture:creamy': 1, 'taste:bland': -1 }),
        'greek-eurymachus': makeFoodProfile('greek-eurymachus', 'pleasant aroma and freshness; avoids bitter edges',
            { 'smell:fragrant': 1, 'texture:juicy': 1, 'taste:bitter': -1 }),
        'greek-telegonus': makeFoodProfile('greek-telegonus', 'simple warmth after travel; avoids sharp aroma',
            { 'temp:warm': 1, 'taste:salty': 1, 'smell:pungent': -1 }),
        'greek-melanthios': makeFoodProfile('greek-melanthios', 'self-serving snack habit; dislikes plain fare',
            { 'form:snack': 1, 'taste:salty': 1, 'taste:bland': -1 }),
        'greek-amphinomos': makeFoodProfile('greek-amphinomos', 'mild, fresh food; shies from aggressive aroma',
            { 'smell:mild': 1, 'texture:juicy': 1, 'smell:pungent': -1 }),
        'greek-peiraios': makeFoodProfile('greek-peiraios', 'warming, plain food suited to hospitality',
            { 'temp:warm': 1, 'taste:bland': 1, 'texture:dry': -1 }),
        'greek-peisistratus': makeFoodProfile('greek-peisistratus', 'refreshing food for shared travel',
            { 'temp:cool': 1, 'texture:juicy': 1, 'taste:bitter': -1 }),
        'greek-diomendes': makeFoodProfile('greek-diomendes', 'straightforward substantial savory food',
            { 'taste:salty': 1, 'texture:chewy': 1, 'taste:sweet': -1 }),
        'troy-agamemnon': makeFoodProfile('troy-agamemnon', 'hot, ordered savory meals; dislikes acidity',
            { 'temp:hot': 1, 'taste:salty': 1, 'taste:sour': -1 }),
        'troy-menelaus': makeFoodProfile('troy-menelaus', 'warming smooth comfort; avoids sharp spice',
            { 'temp:warm': 1, 'texture:creamy': 1, 'taste:spicy': -1 }),
        'troy-ajax': makeFoodProfile('troy-ajax', 'solid, warming texture; avoids sourness',
            { 'temp:hot': 1, 'texture:chewy': 1, 'taste:sour': -1 }),
        'troy-nestor': makeFoodProfile('troy-nestor', 'warming soft food for long conversations',
            { 'temp:warm': 1, 'texture:soft': 1, 'texture:dry': -1 }),
        'troy-hector': makeFoodProfile('troy-hector', 'hearty warmth with gentle texture',
            { 'temp:hot': 1, 'texture:soft': 1, 'taste:bitter': -1 }),
        'troy-paris': makeFoodProfile('troy-paris', 'fragrant and fresh; avoids intrusive smells',
            { 'smell:fragrant': 1, 'texture:juicy': 1, 'smell:pungent': -1 }),
        'troy-aeneas': makeFoodProfile('troy-aeneas', 'simple warming food; avoids sharp acidity',
            { 'smell:mild': 1, 'temp:warm': 1, 'taste:sour': -1 }),
        'troy-sarpedon': makeFoodProfile('troy-sarpedon', 'steady, substantial fare without much sweetness',
            { 'temp:room': 1, 'texture:chewy': 1, 'taste:sweet': -1 }),
        'greek-zagreus': makeFoodProfile('greek-zagreus', 'refreshing, bright food after exertion',
            { 'temp:cool': 1, 'taste:sour': 1, 'taste:bland': -1 }),
        'underworld-hypnos': makeFoodProfile('underworld-hypnos', 'soft warming comfort; avoids dry food',
            { 'texture:creamy': 1, 'temp:warm': 1, 'texture:dry': -1 }),
        'underworld-thanatos': makeFoodProfile('underworld-thanatos', 'precise and mild; avoids assertive aroma',
            { 'temp:room': 1, 'smell:mild': 1, 'smell:pungent': -1 }),
        'underworld-patroclus': makeFoodProfile('underworld-patroclus', 'gentle warmth and moisture; avoids excess salt',
            { 'temp:warm': 1, 'texture:juicy': 1, 'taste:salty': -1 }),
        'olympus-zeus': makeFoodProfile('olympus-zeus', 'warm, aromatic abundance; dislikes plain fare',
            { 'temp:hot': 1, 'smell:fragrant': 1, 'taste:bland': -1 }),
        'olympus-hera': makeFoodProfile('olympus-hera', 'clean, precise textures; avoids intrusive aroma',
            { 'texture:crisp': 1, 'smell:mild': 1, 'smell:pungent': -1 }),
        'olympus-poseidon': makeFoodProfile('olympus-poseidon', 'forceful warmth; little taste for sharp acidity',
            { 'temp:hot': 1, 'taste:sour': -1 }),
        'olympus-demeter': makeFoodProfile('olympus-demeter', 'grain and gentle texture; avoids desiccated food',
            { 'family:grain': 1, 'texture:soft': 1, 'texture:dry': -1 }),
        'olympus-apollo': makeFoodProfile('olympus-apollo', 'bright aromatic clarity; avoids harsh aroma',
            { 'smell:fragrant': 1, 'smell:pungent': -1 }),
        'olympus-artemis': makeFoodProfile('olympus-artemis', 'cool, clean crunch; avoids heavy creaminess',
            { 'temp:cool': 1, 'texture:crisp': 1, 'texture:creamy': -1 }),
        'olympus-ares': makeFoodProfile('olympus-ares', 'direct, substantial savory food',
            { 'taste:umami': 1, 'texture:chewy': 1, 'taste:sweet': -1 }),
        'olympus-hephaestus': makeFoodProfile('olympus-hephaestus', 'warming savory craft; avoids overwhelming aroma',
            { 'temp:warm': 1, 'taste:umami': 1, 'smell:pungent': -1 }),
        'olympus-hermes': makeFoodProfile('olympus-hermes', 'portable lively crunch; dislikes dullness',
            { 'form:snack': 1, 'texture:crisp': 1, 'taste:bland': -1 }),
    });
    const getBuiltinResidentSemanticProfile = residentId =>
        typeof residentId === 'string' && Object.hasOwn(BUILTIN_RESIDENT_SEMANTIC_PROFILES, residentId)
            ? BUILTIN_RESIDENT_SEMANTIC_PROFILES[residentId] : null;
    // Only the accepted resident roster is passed to these lookups. An adoption
    // draft is never a profile source, even if it has the same fields.
    const findSavedResident = (residentId, residents) => {
        if (typeof residentId !== 'string' || !residentId.trim() || residentId !== residentId.trim() ||
            !Array.isArray(residents)) return null;
        const matches = residents.filter(resident => resident && String(resident.id) === residentId);
        return matches.length === 1 ? matches[0] : null;
    };
    const UNPROFILED = Object.freeze({ state: 'unprofiled', profile: null, source: null, provenance: null });
    const resolveSemanticPart = (residentId, residents, field, hasPart) => {
        const builtin = getBuiltinResidentSemanticProfile(residentId);
        const source = builtin ? 'design' : 'resident-saved';
        const raw = builtin || findSavedResident(residentId, residents)?.[field];
        if (!raw || raw.residentId !== residentId) return UNPROFILED;
        const checked = semantics.normalizeSemanticProfile(raw);
        if (!checked.valid || !hasPart(checked.normalized)) return UNPROFILED;
        const profile = builtin ? builtin : deepFreeze(checked.normalized);
        return Object.freeze({ state: 'profiled', profile, source,
            provenance: field === 'foodPreferenceProfile' || builtin
                ? profile.reference.foodPreferenceProvenance || null : null });
    };
    const getResidentFoodPreferenceProfile = (residentId, residents) =>
        resolveSemanticPart(residentId, residents, 'foodPreferenceProfile', profile =>
            profile.preferences.food !== undefined);
    const getResidentPersonalityProfile = (residentId, residents) =>
        resolveSemanticPart(residentId, residents, 'personalityProfile', profile =>
            Object.keys(profile.personalityAxes).length > 0);
    Meeow.residentSemantics = Object.freeze({
        BUILTIN_RESIDENT_SEMANTIC_PROFILES,
        getBuiltinResidentSemanticProfile,
        findSavedResident,
        getResidentFoodPreferenceProfile,
        getResidentPersonalityProfile
    });
}(window));
