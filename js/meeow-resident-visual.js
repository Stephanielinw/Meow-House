(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const visual = Meeow.residentVisual = Meeow.residentVisual || {};

    const OPTIONS = Object.freeze({
        body: ['standard', 'chubby', 'slim', 'fluffy'],
        ear: ['standard', 'large', 'small', 'round', 'folded', 'tufted'],
        tail: ['standard', 'long', 'thick', 'fluffy', 'short', 'kinked'],
        bib: ['none', 'bib'],
        face: ['none', 'muzzle', 'blaze', 'point', 'eye_patch', 'forehead_m'],
        torso: ['none', 'classic_tabby', 'mackerel_tabby', 'spotted', 'large_patches', 'saddle_cape'],
        frontLeft: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
        frontRight: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
        rearLeft: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
        rearRight: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
        tailmark: ['none', 'tip_short', 'tip_long', 'half_tail', 'rings', 'broad_ring']
    });
    const COATS = ['neutral', 'ginger', 'cream', 'blue', 'chocolate', 'black', 'lilac', 'silver'];
    const MARKS = ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold'];
    const EYES = ['original', 'blue', 'gold', 'green'];
    const MUZZLES = ['base', 'original', 'cream'];
    const POSE_CAPABILITY_CODES = Object.freeze(['CAT_POSE_UNAVAILABLE', 'CAT_POSE_OPTION_UNSUPPORTED']);
    const DEFAULT_CONFIG = Object.freeze({
        body: 'standard', ear: 'standard', tail: 'standard', bib: 'none', face: 'none', torso: 'none',
        frontLeft: 'none', frontRight: 'none', rearLeft: 'none', rearRight: 'none', tailmark: 'none',
        coat: 'neutral', muzzleColor: 'base', faceColor: 'white', torsoColor: 'dark',
        frontLeftColor: 'white', frontRightColor: 'white', rearLeftColor: 'white', rearRightColor: 'white',
        tailColor: 'dark', eyeLeft: 'original', eyeRight: 'original'
    });
    const freezePresetMap = presets => Object.freeze(Object.fromEntries(
        Object.entries(presets).map(([residentId, preset]) => [residentId, Object.freeze({ ...preset })])
    ));
    // Built-in residents use these authored visual interpretations only when
    // they have no valid saved resident.visual. Unspecified fields inherit
    // DEFAULT_CONFIG; user-saved visuals always remain authoritative.
    const BUILTIN_VISUAL_PRESETS = freezePresetMap({
        'gotham-barbara': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: 'ginger', bib: 'bib',
            face: 'blaze', faceColor: 'white', frontLeft: 'medium_socks', frontRight: 'medium_socks',
            rearLeft: 'long_socks', rearRight: 'long_socks', tailmark: 'tip_short', tailColor: 'white',
            eyeLeft: '#2E8B57', eyeRight: '#2E8B57'
        },
        'gotham-bruce': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: 'black',
            eyeLeft: '#4682B4', eyeRight: '#4682B4'
        },
        'gotham-cassandra': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: 'black',
            eyeLeft: '#4A2F22', eyeRight: '#4A2F22'
        },
        'gotham-damian': {
            body: 'slim', ear: 'large', tail: 'long', coat: 'black',
            eyeLeft: '#238B57', eyeRight: '#238B57'
        },
        'gotham-dick': {
            body: 'slim', ear: 'tufted', tail: 'fluffy', coat: 'black',
            torso: 'large_patches', torsoColor: '#244F87', tailmark: 'broad_ring', tailColor: '#244F87',
            eyeLeft: '#2585FF', eyeRight: '#2585FF'
        },
        'gotham-jason': {
            body: 'standard', ear: 'standard', tail: 'kinked', coat: 'black', bib: 'bib',
            torso: 'large_patches', torsoColor: 'white', face: 'blaze', faceColor: 'white',
            frontLeft: 'medium_socks', rearRight: 'long_socks', tailmark: 'tip_short', tailColor: 'white',
            eyeLeft: '#2456C4', eyeRight: '#2456C4'
        },
        'gotham-stephanie': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: 'lilac',
            torso: 'mackerel_tabby', torsoColor: '#725F83', tailmark: 'rings', tailColor: '#725F83',
            eyeLeft: '#558FD4', eyeRight: '#558FD4'
        },
        'gotham-tim': {
            body: 'slim', ear: 'large', tail: 'long', coat: '#665148', face: 'point', faceColor: '#2F2826',
            frontLeft: 'long_socks', frontLeftColor: '#2F2826', frontRight: 'long_socks', frontRightColor: '#2F2826',
            rearLeft: 'long_socks', rearLeftColor: '#2F2826', rearRight: 'long_socks', rearRightColor: '#2F2826',
            tailmark: 'half_tail', tailColor: '#2F2826', eyeLeft: '#A9DAFF', eyeRight: '#A9DAFF'
        },
        'marvel-bucky': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#6E747B',
            eyeLeft: '#4682B4', eyeRight: '#4682B4'
        },
        'marvel-clint': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: '#8A5438',
            torso: 'mackerel_tabby', torsoColor: '#4F3528', tailmark: 'rings', tailColor: '#4F3528',
            eyeLeft: '#8A693D', eyeRight: '#8A693D'
        },
        'marvel-harry': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#294A3D',
            eyeLeft: '#708F79', eyeRight: '#708F79'
        },
        'marvel-loki': {
            body: 'slim', ear: 'large', tail: 'long', coat: '#193E34',
            eyeLeft: '#238B57', eyeRight: '#238B57'
        },
        'marvel-natasha': {
            body: 'slim', ear: 'large', tail: 'long', coat: '#A75C43',
            eyeLeft: '#708F79', eyeRight: '#708F79'
        },
        'marvel-peter': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: '#B53C42',
            torso: 'large_patches', torsoColor: '#365D91', face: 'eye_patch', faceColor: '#365D91',
            tailmark: 'broad_ring', tailColor: '#365D91', eyeLeft: '#8A693D', eyeRight: '#8A693D'
        },
        'marvel-steve': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: 'silver', bib: 'bib',
            face: 'blaze', faceColor: 'white', frontLeft: 'medium_socks', frontRight: 'medium_socks',
            rearLeft: 'medium_socks', rearRight: 'medium_socks', tailmark: 'tip_short', tailColor: 'white',
            eyeLeft: '#A9DAFF', eyeRight: '#A9DAFF'
        },
        'marvel-thor': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#D5B36D',
            eyeLeft: '#59B9FF', eyeRight: '#59B9FF'
        },
        'marvel-tony': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: '#D19A3E',
            torso: 'saddle_cape', torsoColor: '#A53B32', tailmark: 'broad_ring', tailColor: '#A53B32',
            eyeLeft: '#C68A2A', eyeRight: '#C68A2A'
        },
        'marvel-wade': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: 'black',
            torso: 'mackerel_tabby', torsoColor: '#A62F35', tailmark: 'rings', tailColor: '#A62F35',
            eyeLeft: '#5798D0', eyeRight: '#7B4C2B'
        },
        'marvel-yelena': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: 'cream', bib: 'bib',
            eyeLeft: '#7A90A7', eyeRight: '#7A90A7'
        },
        'greek-amphinomos': {
            body: 'fluffy', ear: 'standard', tail: 'fluffy', coat: '#87543A',
            torso: 'saddle_cape', torsoColor: '#C3984E', eyeLeft: '#D29B50', eyeRight: '#D29B50'
        },
        'greek-antinous': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: 'black',
            torso: 'saddle_cape', torsoColor: 'gold', tailmark: 'tip_long', tailColor: 'gold',
            eyeLeft: '#4A3326', eyeRight: '#4A3326'
        },
        'greek-eurymachus': {
            body: 'slim', ear: 'standard', tail: 'long', coat: '#78533E', bib: 'bib',
            torso: 'large_patches', torsoColor: 'white', frontLeft: 'short_socks', frontRight: 'medium_socks',
            rearLeft: 'medium_socks', rearRight: 'long_socks', eyeLeft: '#C38A34', eyeRight: '#C38A34'
        },
        'greek-melanthios': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: '#736052',
            torso: 'mackerel_tabby', torsoColor: '#45382F', tailmark: 'rings', tailColor: '#45382F',
            eyeLeft: '#A97945', eyeRight: '#A97945'
        },
        'greek-peiraios': {
            body: 'slim', ear: 'standard', tail: 'long', coat: '#985039',
            eyeLeft: '#8E6630', eyeRight: '#8E6630'
        },
        'greek-peisistratus': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#D6B46C',
            eyeLeft: '#89A8BF', eyeRight: '#89A8BF'
        },
        'greek-telegonus': {
            body: 'standard', ear: 'round', tail: 'thick', coat: '#B3AEA4',
            eyeLeft: '#D5B267', eyeRight: '#D5B267'
        },
        'greek-telemachus': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: '#788794', bib: 'bib',
            torso: 'large_patches', torsoColor: 'white', face: 'blaze', faceColor: 'white',
            frontLeft: 'short_socks', frontRight: 'short_socks', rearLeft: 'medium_socks', rearRight: 'medium_socks',
            tailmark: 'tip_short', tailColor: 'white', eyeLeft: '#3E86B7', eyeRight: '#3E86B7'
        },
        'greek-diomendes': {
            body: 'chubby', ear: 'standard', tail: 'thick', coat: 'silver',
            eyeLeft: '#646B73', eyeRight: '#646B73'
        },
        'greek-odysseus': {
            body: 'standard', ear: 'standard', tail: 'kinked', coat: '#756A5C',
            torso: 'mackerel_tabby', torsoColor: '#443B33', tailmark: 'rings', tailColor: '#443B33',
            eyeLeft: '#687581', eyeRight: '#687581'
        },
        'troy-aeneas': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: '#98543D',
            eyeLeft: '#A8792D', eyeRight: '#A8792D'
        },
        'troy-agamemnon': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#B27440',
            eyeLeft: '#C68A2A', eyeRight: '#C68A2A'
        },
        'troy-ajax': {
            body: 'chubby', ear: 'round', tail: 'thick', coat: 'blue',
            eyeLeft: '#8A5A3B', eyeRight: '#8A5A3B'
        },
        'troy-hector': {
            body: 'standard', ear: 'standard', tail: 'standard', coat: '#5E4639',
            eyeLeft: '#7B5A43', eyeRight: '#7B5A43'
        },
        'troy-menelaus': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#C99C4A', bib: 'bib',
            torso: 'large_patches', torsoColor: 'white', face: 'blaze', faceColor: 'white',
            frontLeft: 'medium_socks', frontRight: 'medium_socks', rearLeft: 'long_socks', rearRight: 'long_socks',
            eyeLeft: '#3E86B7', eyeRight: '#3E86B7'
        },
        'troy-nestor': {
            body: 'fluffy', ear: 'standard', tail: 'fluffy', coat: 'silver', bib: 'bib', face: 'muzzle',
            frontLeft: 'short_socks', frontRight: 'short_socks', rearLeft: 'short_socks', rearRight: 'short_socks',
            eyeLeft: '#B69B7C', eyeRight: '#B69B7C'
        },
        'troy-paris': {
            body: 'fluffy', ear: 'small', tail: 'fluffy', coat: 'cream', face: 'muzzle', bib: 'bib',
            eyeLeft: '#A6B9C9', eyeRight: '#A6B9C9'
        },
        'troy-sarpedon': {
            body: 'fluffy', ear: 'standard', tail: 'fluffy', coat: '#C9A461',
            eyeLeft: '#B26A3C', eyeRight: '#B26A3C'
        },
        'greek-zagreus': {
            body: 'standard', ear: 'large', tail: 'long', coat: 'black',
            torso: 'large_patches', torsoColor: '#60416F', tailmark: 'broad_ring', tailColor: '#60416F',
            eyeLeft: '#48A267', eyeRight: '#C84747'
        },
        'underworld-achilles': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#DDD3B7',
            eyeLeft: '#4C9A8B', eyeRight: '#4C9A8B'
        },
        'underworld-hades': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#222426',
            eyeLeft: '#506B86', eyeRight: '#506B86'
        },
        'underworld-hypnos': {
            body: 'slim', ear: 'large', tail: 'long', coat: 'lilac', face: 'point', faceColor: '#554A61',
            frontLeft: 'long_socks', frontLeftColor: '#554A61', frontRight: 'long_socks', frontRightColor: '#554A61',
            rearLeft: 'long_socks', rearLeftColor: '#554A61', rearRight: 'long_socks', rearRightColor: '#554A61',
            tailmark: 'half_tail', tailColor: '#554A61', eyeLeft: '#9B7BB5', eyeRight: '#9B7BB5'
        },
        'underworld-patroclus': {
            body: 'fluffy', ear: 'standard', tail: 'fluffy', coat: '#B9A5AB',
            eyeLeft: '#D5B56F', eyeRight: '#D5B56F'
        },
        'underworld-thanatos': {
            body: 'slim', ear: 'large', tail: 'long', coat: '#484E56',
            eyeLeft: '#ADB8C5', eyeRight: '#ADB8C5'
        },
        'olympus-aphrodite': {
            body: 'fluffy', ear: 'round', tail: 'fluffy', coat: 'cream', bib: 'bib',
            torso: 'large_patches', torsoColor: '#D39BA6', tailmark: 'tip_short', tailColor: '#D39BA6',
            eyeLeft: '#B76E79', eyeRight: '#B76E79'
        },
        'olympus-apollo': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#D5A63B',
            eyeLeft: '#D4A62A', eyeRight: '#D4A62A'
        },
        'olympus-ares': {
            body: 'chubby', ear: 'standard', tail: 'thick', coat: '#8F4A40',
            eyeLeft: '#B16A3C', eyeRight: '#B16A3C'
        },
        'olympus-artemis': {
            body: 'slim', ear: 'standard', tail: 'long', coat: '#D8DEE6',
            eyeLeft: '#DEE8F3', eyeRight: '#DEE8F3'
        },
        'olympus-athena': {
            body: 'slim', ear: 'large', tail: 'standard', coat: '#9099A3',
            eyeLeft: '#7990A8', eyeRight: '#7990A8'
        },
        'olympus-demeter': {
            body: 'chubby', ear: 'round', tail: 'thick', coat: '#C3A25D',
            eyeLeft: '#C3A25D', eyeRight: '#C3A25D'
        },
        'olympus-dionysus': {
            body: 'chubby', ear: 'round', tail: 'thick', coat: '#76506F',
            eyeLeft: '#7D5AA6', eyeRight: '#7D5AA6'
        },
        'olympus-hephaestus': {
            body: 'chubby', ear: 'standard', tail: 'thick', coat: '#55585D',
            frontLeft: 'toe_tips', frontLeftColor: '#44464A', frontRight: 'toe_tips', frontRightColor: '#44464A',
            rearLeft: 'toe_tips', rearLeftColor: '#44464A', rearRight: 'toe_tips', rearRightColor: '#44464A',
            eyeLeft: '#D26932', eyeRight: '#D26932'
        },
        'olympus-hera': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#285E6D', bib: 'bib',
            torso: 'large_patches', torsoColor: 'white', face: 'blaze', faceColor: 'white',
            frontLeft: 'medium_socks', frontRight: 'medium_socks', rearLeft: 'long_socks', rearRight: 'long_socks',
            tailmark: 'tip_long', tailColor: 'white', eyeLeft: '#286B7A', eyeRight: '#286B7A'
        },
        'olympus-hermes': {
            body: 'slim', ear: 'large', tail: 'long', coat: '#B77A3E',
            eyeLeft: '#C48736', eyeRight: '#C48736'
        },
        'olympus-poseidon': {
            body: 'standard', ear: 'round', tail: 'thick', coat: '#244B67',
            eyeLeft: '#2E6E66', eyeRight: '#2E6E66'
        },
        'olympus-zeus': {
            body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: '#89919B', bib: 'bib',
            torso: 'large_patches', torsoColor: 'white', face: 'blaze', faceColor: 'white',
            tailmark: 'tip_short', tailColor: 'white', eyeLeft: '#A7B4C5', eyeRight: '#A7B4C5'
        }
    });
    const KEYS = Object.keys(DEFAULT_CONFIG);
    const HEX = /^#[0-9a-f]{6}$/i;
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]');
    const exact = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_-]+/g, '') : '';
    const color = (value, names, key) => {
        if (typeof value !== 'string' || (!names.includes(value) && !HEX.test(value))) throw new TypeError(`Invalid ${key}`);
        return value.toLowerCase();
    };

    const canonicalizeIdentity = input => {
        if (!plain(input)) throw new TypeError('Invalid cat identity config');
        const unknown = Object.keys(input).filter(key => !KEYS.includes(key));
        if (unknown.length) throw new TypeError(`Unknown cat identity field: ${unknown[0]}`);
        const out = {};
        for (const key of KEYS) out[key] = input[key] === undefined ? DEFAULT_CONFIG[key] : input[key];
        for (const [key, values] of Object.entries(OPTIONS)) if (!values.includes(out[key])) throw new TypeError(`Invalid ${key}`);
        out.coat = color(out.coat, COATS, 'coat');
        for (const key of ['faceColor', 'torsoColor', 'frontLeftColor', 'frontRightColor', 'rearLeftColor', 'rearRightColor', 'tailColor']) out[key] = color(out[key], MARKS, key);
        out.eyeLeft = color(out.eyeLeft, EYES, 'eyeLeft');
        out.eyeRight = color(out.eyeRight, EYES, 'eyeRight');
        if (!MUZZLES.includes(out.muzzleColor)) throw new TypeError('Invalid muzzle color');
        return out;
    };
    const stableIdentity = input => JSON.stringify(canonicalizeIdentity(input));
    const identityHash = input => {
        const source = stableIdentity(input);
        let hash = 2166136261;
        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    };

    const STRUCTURED_MAPS = Object.freeze({
        body: { standard: 'standard', 标准: 'standard', 标准体型: 'standard', chubby: 'chubby', 圆润: 'chubby', 圆润体型: 'chubby', slim: 'slim', 纤细: 'slim', 纤细体型: 'slim', fluffy: 'fluffy', 蓬松: 'fluffy', 蓬松体型: 'fluffy' },
        coat: { neutral: 'neutral', ginger: 'ginger', 橘色: 'ginger', 姜黄色: 'ginger', cream: 'cream', 奶油色: 'cream', blue: 'blue', 蓝灰色: 'blue', chocolate: 'chocolate', 巧克力色: 'chocolate', black: 'black', 黑色: 'black', lilac: 'lilac', 淡紫色: 'lilac', silver: 'silver', 银色: 'silver' },
        torso: { none: 'none', 无花纹: 'none', classic_tabby: 'classic_tabby', 经典虎斑: 'classic_tabby', mackerel_tabby: 'mackerel_tabby', 鱼骨虎斑: 'mackerel_tabby', spotted: 'spotted', 斑点: 'spotted', large_patches: 'large_patches', 大片花斑: 'large_patches', saddle_cape: 'saddle_cape', 鞍背: 'saddle_cape' },
        eye: { original: 'original', 原色: 'original', blue: 'blue', 蓝色: 'blue', gold: 'gold', 金色: 'gold', green: 'green', 绿色: 'green' }
    });
    const EXACT_BREED_SEEDS = Object.freeze({
        黑色猫: { coat: 'black' }, 橘色猫: { coat: 'ginger' }, 奶油色猫: { coat: 'cream' },
        蓝灰色猫: { coat: 'blue' }, 巧克力色猫: { coat: 'chocolate' }, 银色猫: { coat: 'silver' },
        蓬松猫: { body: 'fluffy' }, 圆润猫: { body: 'chubby' }, 纤细猫: { body: 'slim' }
    });
    const mapExact = (table, value) => table[exact(value)] || table[String(value || '').trim()] || null;
    const getBuiltinVisualPreset = residentId => {
        const preset = BUILTIN_VISUAL_PRESETS[String(residentId || '').trim()];
        return preset ? canonicalizeIdentity({ ...DEFAULT_CONFIG, ...preset }) : null;
    };
    const seedIdentity = resident => {
        const builtinPreset = getBuiltinVisualPreset(resident?.id);
        if (builtinPreset) return builtinPreset;
        const seeded = { ...DEFAULT_CONFIG };
        const appearance = plain(resident?.appearance) ? resident.appearance : {};
        const body = mapExact(STRUCTURED_MAPS.body, appearance.bodyType ?? resident?.bodyType);
        const coat = mapExact(STRUCTURED_MAPS.coat, appearance.coatColor ?? resident?.coatColor);
        const torso = mapExact(STRUCTURED_MAPS.torso, appearance.coatPattern ?? resident?.coatPattern);
        const left = mapExact(STRUCTURED_MAPS.eye, appearance.leftEyeColor ?? resident?.leftEyeColor);
        const right = mapExact(STRUCTURED_MAPS.eye, appearance.rightEyeColor ?? resident?.rightEyeColor);
        if (body) seeded.body = body;
        if (coat) seeded.coat = coat;
        if (torso) seeded.torso = torso;
        if (left) seeded.eyeLeft = left;
        if (right) seeded.eyeRight = right;
        const breedSeed = EXACT_BREED_SEEDS[String(resident?.breed || '').trim()];
        if (breedSeed && !body && !coat) Object.assign(seeded, breedSeed);
        const commonEye = mapExact(STRUCTURED_MAPS.eye, resident?.eyeColor);
        if (commonEye && !left && !right) seeded.eyeLeft = seeded.eyeRight = commonEye;
        return canonicalizeIdentity(seeded);
    };

    const normalizeVisual = raw => {
        if (!plain(raw) || raw.renderer !== 'meeow-cat' || raw.rendererVersion !== 1 || raw.configVersion !== 1 || raw.assetPackVersion !== 'v1' || raw.enabled !== true) return null;
        try {
            return { renderer: 'meeow-cat', rendererVersion: 1, configVersion: 1, assetPackVersion: 'v1', enabled: true, identityConfig: canonicalizeIdentity(raw.identityConfig), revision: Math.max(1, Math.floor(Number(raw.revision) || 1)) };
        } catch (_) { return null; }
    };
    const resolveResidentVisual = (resident, { allowDerived = false } = {}) => {
        const saved = normalizeVisual(resident?.visual);
        if (saved) return {
            source: 'saved',
            config: clone(saved.identityConfig),
            revision: saved.revision,
            rendererVersion: saved.rendererVersion,
            configVersion: saved.configVersion,
            assetPackVersion: saved.assetPackVersion,
            identityHash: identityHash(saved.identityConfig)
        };
        if (!allowDerived || !resident) return null;
        const config = seedIdentity(resident);
        return {
            source: 'derived',
            config,
            revision: 0,
            rendererVersion: 1,
            configVersion: 1,
            assetPackVersion: 'v1',
            identityHash: identityHash(config)
        };
    };
    const makeSpriteCacheKey = ({ residentId, effectiveForm, visual, pose = 'standing', size = 72 }) => {
        if (!visual) return '';
        return [String(residentId || ''), String(effectiveForm || ''), visual.source, visual.rendererVersion, visual.configVersion, visual.assetPackVersion, visual.revision, visual.identityHash, pose, size].join('|');
    };
    const makeGroundAnchorPlacement = (frame, displayWidth = 72) => {
        const width = Math.max(1, Number(frame?.width) || 1);
        const height = Math.max(1, Number(frame?.height) || 1);
        const anchor = Array.isArray(frame?.groundAnchor) ? frame.groundAnchor : [width / 2, height];
        const cssWidth = Math.max(1, Number(displayWidth) || 72);
        const cssHeight = cssWidth * height / width;
        return {
            width: cssWidth,
            height: cssHeight,
            anchorXPercent: Math.max(0, Math.min(100, Number(anchor[0]) / width * 100)),
            anchorYPercent: Math.max(0, Math.min(100, Number(anchor[1]) / height * 100))
        };
    };
    const createSpriteRequestCoordinator = (onChange = null) => {
        const cache = new Map();
        const inFlight = new Map();
        const residentKeys = new Map();
        const tokens = new Map();
        const notify = () => { if (typeof onChange === 'function') onChange(); };
        const peek = (residentId, key) => residentKeys.get(String(residentId)) === key ? cache.get(key) || null : null;
        const invalidate = residentId => {
            const id = String(residentId || '');
            const key = residentKeys.get(id);
            if (key) cache.delete(key);
            residentKeys.delete(id);
            tokens.set(id, (tokens.get(id) || 0) + 1);
            notify();
        };
        const request = ({ residentId, key, load }) => {
            const id = String(residentId || '');
            if (!id || !key || typeof load !== 'function') return Promise.resolve(null);
            const cached = peek(id, key);
            if (cached) return Promise.resolve(cached);
            if (inFlight.has(key)) return inFlight.get(key);
            const token = (tokens.get(id) || 0) + 1;
            tokens.set(id, token);
            const task = Promise.resolve().then(load).then(value => {
                if (tokens.get(id) !== token) return null;
                if (value == null) return null;
                const previous = residentKeys.get(id);
                if (previous && previous !== key) cache.delete(previous);
                residentKeys.set(id, key);
                cache.set(key, value);
                notify();
                return value;
            }).finally(() => { if (inFlight.get(key) === task) inFlight.delete(key); });
            inFlight.set(key, task);
            return task;
        };
        return { peek, request, invalidate, cache, inFlight };
    };
    const createSpriteFailureBackoff = ({ now = () => Date.now(), delays = [1500, 5000, 15000, 30000] } = {}) => {
        const retryDelays = (Array.isArray(delays) ? delays : [])
            .map(value => Math.max(0, Math.floor(Number(value) || 0)))
            .filter(value => value > 0);
        if (!retryDelays.length) retryDelays.push(1500);
        const records = new Map();
        const listeners = new Set();
        const notify = () => { for (const listener of listeners) listener(); };
        const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
        const deadlines = () => Object.freeze(Array.from(records, ([key, record]) => Object.freeze({ key, attempts: record.attempts, nextRetryAt: record.nextRetryAt })));
        const snapshot = record => record ? { ...record } : null;
        const get = key => snapshot(records.get(String(key || '')));
        const canAttempt = (key, at = now()) => {
            const record = records.get(String(key || ''));
            return !record || Number(at) >= record.nextRetryAt;
        };
        const recordFailure = ({ key, residentId, errorCategory = 'Error', at = now() }) => {
            const safeKey = String(key || '');
            const safeResidentId = String(residentId || '');
            if (!safeKey || !safeResidentId) return null;
            const previous = records.get(safeKey);
            const attempts = (previous?.attempts || 0) + 1;
            const retryAfterMs = retryDelays[Math.min(attempts - 1, retryDelays.length - 1)];
            const record = {
                residentId: safeResidentId,
                attempts,
                nextRetryAt: Number(at) + retryAfterMs,
                retryAfterMs,
                lastErrorCategory: String(errorCategory || 'Error').slice(0, 48)
            };
            records.set(safeKey, record);
            notify();
            return snapshot(record);
        };
        const clearSuccess = key => {
            const safeKey = String(key || '');
            const record = records.get(safeKey);
            records.delete(safeKey);
            if (record) notify();
            return snapshot(record);
        };
        const invalidateResident = residentId => {
            const safeResidentId = String(residentId || '');
            let removed = 0;
            for (const [key, record] of records) {
                if (record.residentId !== safeResidentId) continue;
                records.delete(key);
                removed += 1;
            }
            if (removed) notify();
            return removed;
        };
        const retainResidentKey = (residentId, currentKey) => {
            const safeResidentId = String(residentId || '');
            const safeCurrentKey = String(currentKey || '');
            let removed = 0;
            for (const [key, record] of records) {
                if (record.residentId !== safeResidentId || key === safeCurrentKey) continue;
                records.delete(key);
                removed += 1;
            }
            if (removed) notify();
            return removed;
        };
        const size = () => records.size;
        return { get, canAttempt, recordFailure, clearSuccess, invalidateResident, retainResidentKey, size, deadlines, subscribe };
    };
    // One app-owned timer, with one wakeup per failure occurrence. Consumed
    // deadlines remain retryable; hidden Maps simply consume their dirty computed
    // value later. They must not repeatedly schedule an expired deadline.
    const createSpriteRetryWakeup = ({ failures, wake, now = () => Date.now(), setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = handle => clearTimeout(handle) }) => {
        const consumed = new Map();
        let timer = null;
        let target = null;
        let generation = 0;
        let disposed = false;
        const occurrence = record => `${record.attempts}:${record.nextRetryAt}`;
        const cancel = () => {
            generation += 1;
            if (timer !== null) clearTimer(timer);
            timer = null;
            target = null;
        };
        const schedule = () => {
            if (disposed) return;
            const records = failures.deadlines();
            const current = new Map(records.map(record => [record.key, occurrence(record)]));
            for (const [key, value] of consumed) if (current.get(key) !== value) consumed.delete(key);
            const pending = records.filter(record => consumed.get(record.key) !== occurrence(record));
            const earliest = pending.length ? Math.min(...pending.map(record => record.nextRetryAt)) : null;
            if (earliest === null) { cancel(); return; }
            if (timer !== null && target === earliest) return;
            cancel();
            target = earliest;
            const token = generation;
            timer = setTimer(() => {
                if (disposed || token !== generation) return;
                const at = now();
                const due = failures.deadlines().filter(record => record.nextRetryAt <= at && consumed.get(record.key) !== occurrence(record));
                // Consume before notifying Vue, including synchronous/reentrant
                // consumers. A backward clock shift leaves the occurrence pending.
                for (const record of due) consumed.set(record.key, occurrence(record));
                timer = null;
                target = null;
                generation += 1;
                try { if (due.length) wake(); }
                finally { schedule(); }
            }, Math.max(0, earliest - now()));
        };
        const unsubscribe = failures.subscribe(schedule);
        schedule();
        return { dispose: () => { disposed = true; unsubscribe(); cancel(); consumed.clear(); } };
    };
    const makeVisual = (previous, identityConfig) => {
        const config = canonicalizeIdentity(identityConfig);
        const normalized = normalizeVisual(previous);
        if (normalized && stableIdentity(normalized.identityConfig) === stableIdentity(config)) return { visual: normalized, changed: false };
        return { visual: { renderer: 'meeow-cat', rendererVersion: 1, configVersion: 1, assetPackVersion: 'v1', enabled: true, identityConfig: config, revision: normalized ? normalized.revision + 1 : 1 }, changed: true };
    };
    const restoreVisual = (resident, hadVisual, previous) => { if (hadVisual) resident.visual = clone(previous); else delete resident.visual; };
    const saveVisual = ({ resident, identityConfig, persistNow, verifyStored }) => {
        const hadVisual = Object.prototype.hasOwnProperty.call(resident, 'visual');
        const previous = clone(resident.visual);
        const next = makeVisual(previous, identityConfig);
        if (!next.changed) return { ok: true, unchanged: true, visual: next.visual };
        resident.visual = next.visual;
        let persisted = false;
        try { persisted = persistNow() === true; } catch (_) { persisted = false; }
        if (persisted) return { ok: true, unchanged: false, visual: next.visual };
        restoreVisual(resident, hadVisual, previous);
        let rollbackPersisted = false;
        try { rollbackPersisted = persistNow() === true; } catch (_) { rollbackPersisted = false; }
        let rollbackVerified = false;
        try { rollbackVerified = typeof verifyStored === 'function' ? verifyStored(hadVisual, previous) === true : rollbackPersisted; } catch (_) { rollbackVerified = false; }
        return { ok: false, unchanged: false, rollbackPersisted, rollbackVerified };
    };
    const renderStandingWithFallback = (render, input) => {
        const config = canonicalizeIdentity(input);
        try { return { frame: render(config, { pose: 'standing' }), requestedPose: 'standing', renderedPose: 'standing', fallback: false }; }
        catch (standingError) {
            const fallbackReason = String(standingError?.code || '');
            if (!POSE_CAPABILITY_CODES.includes(fallbackReason)) throw standingError;
            return { frame: render(config, { pose: 'sitting' }), requestedPose: 'standing', renderedPose: 'sitting', fallback: true, fallbackReason, standingError: String(standingError?.message || standingError) };
        }
    };
    const isCurrentPreviewRequest = (token, currentToken, editorOpen = true) => editorOpen === true && token === currentToken;

    Object.assign(visual, { OPTIONS, COATS, MARKS, EYES, MUZZLES, POSE_CAPABILITY_CODES, DEFAULT_CONFIG, BUILTIN_VISUAL_PRESETS, canonicalizeIdentity, stableIdentity, identityHash, getBuiltinVisualPreset, seedIdentity, normalizeVisual, resolveResidentVisual, makeSpriteCacheKey, makeGroundAnchorPlacement, createSpriteRequestCoordinator, createSpriteFailureBackoff, createSpriteRetryWakeup, makeVisual, saveVisual, renderStandingWithFallback, isCurrentPreviewRequest, clone });
})(typeof window !== 'undefined' ? window : globalThis);
