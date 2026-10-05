(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const visual = Meeow.residentVisual;
    if (!visual) throw new Error('Cat breeds require the resident visual schema.');

    const define = (id, displayName, description, required, allowed, seed, notes, contrast = null) => Object.freeze({
        version: 1, id, displayName, description,
        constraints: Object.freeze({ required: Object.freeze({ ...required }),
            allowed: Object.freeze(Object.fromEntries(Object.entries(allowed).map(([field, values]) =>
                [field, Object.freeze([...values])]))),
            contrast: contrast ? Object.freeze({ ...contrast }) : null }),
        seed: Object.freeze({ ...seed }), notes: Object.freeze({ ...notes })
    });
    const BREED_REGISTRY = Object.freeze({ version: 1, breeds: Object.freeze({
        mixed: define('mixed', '米克斯', '自由搭配的混血外观', {}, {}, {},
            { phenotype: 'Any valid Cat Creator configuration.' }),
        'scottish-fold': define('scottish-fold', '苏格兰折耳猫', '折耳、圆润的外观',
            { ear: 'folded' }, { body: ['standard', 'chubby'] },
            { body: 'chubby', ear: 'folded', tail: 'thick', coat: 'silver', eyeLeft: 'gold', eyeRight: 'gold' },
            { phenotype: 'Visible folded-ear variant; straight-eared pedigree cats use mixed in V1.' }),
        siamese: define('siamese', '暹罗猫', '修长身形与重点色面部',
            { body: 'slim', face: 'point' }, { ear: ['large', 'standard'] },
            { body: 'slim', ear: 'large', tail: 'long', coat: 'cream', face: 'point', faceColor: 'dark',
                eyeLeft: 'blue', eyeRight: 'blue' },
            { phenotype: 'Slim silhouette and visible point-face mask; compatible colors must retain visible contrast.' },
            { light: 'coat', dark: 'faceColor', minLumaDifference: 35 }),
        'maine-coon': define('maine-coon', '缅因猫', '蓬松身形、耳簇与大尾巴',
            { body: 'fluffy', ear: 'tufted' }, { tail: ['fluffy', 'long', 'thick'] },
            { body: 'fluffy', ear: 'tufted', tail: 'fluffy', coat: 'chocolate', bib: 'bib',
                eyeLeft: 'green', eyeRight: 'green' },
            { phenotype: 'Fluffy silhouette and tufted ears; square muzzle is unavailable.' }),
        ragdoll: define('ragdoll', '布偶猫', '蓬松身形与重点色面部',
            { body: 'fluffy', face: 'point' }, { tail: ['fluffy', 'long'], ear: ['standard', 'large'] },
            { body: 'fluffy', ear: 'standard', tail: 'fluffy', coat: 'cream', face: 'point', faceColor: 'brown',
                eyeLeft: 'blue', eyeRight: 'blue' },
            { phenotype: 'Fluffy silhouette and point-face mask; eye color remains user-controlled.' },
            { light: 'coat', dark: 'faceColor', minLumaDifference: 35 })
    }) });
    const listProductionBreeds = () => Object.values(BREED_REGISTRY.breeds).map(breed => ({
        breedId: breed.id, displayName: breed.displayName, description: breed.description
    }));
    const getBreed = (breedId, registry = BREED_REGISTRY) => registry?.breeds?.[breedId]?.id === breedId
        ? registry.breeds[breedId] : null;
    const getResidentBreedDisplay = resident => resident?.breedId &&
        resident?.creationProvenance?.version === 1
        ? (getBreed(resident.breedId)?.displayName || resident?.breed || '未设定')
        : (resident?.breed || '');
    const failure = (code, field, expected, actual) => ({ field, code, expected, actual });
    // Named swatches mirror the renderer palette. Neutral uses the source coat's
    // approximate midtone; hex colors remain valid through the same rule.
    const COAT_RGB = Object.freeze({ neutral: [158, 151, 149], ginger: [200, 142, 87],
        cream: [219, 201, 164], blue: [131, 149, 167], chocolate: [126, 96, 80],
        black: [72, 76, 85], lilac: [175, 151, 171], silver: [190, 194, 200] });
    const MARK_RGB = Object.freeze({ dark: [82, 69, 65], white: [237, 227, 208],
        cream: [225, 211, 188], brown: [130, 79, 48], blue: [80, 107, 135],
        pink: [197, 140, 151], gold: [194, 137, 65] });
    const rgb = (value, palette) => palette[value] || (/^#[0-9a-f]{6}$/i.test(value)
        ? [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16)) : null);
    const luma = channels => channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    const validateBreedAppearanceConsistency = (breedId, identityConfig, registry = BREED_REGISTRY) => {
        const breed = getBreed(breedId, registry);
        if (!breed) return { valid: false, error: 'unsupported-breed',
            errors: [failure('unsupported-breed', 'breedId', Object.keys(registry?.breeds || {}), breedId)] };
        let config;
        try { config = visual.canonicalizeIdentity(identityConfig); }
        catch (_) { return { valid: false, error: 'invalid-appearance',
            errors: [failure('invalid-appearance', 'identityConfig', 'valid-creator-config', null)] }; }
        const contract = breed.constraints || (breed.appearanceConstraints
            ? { allowed: breed.appearanceConstraints } : { required: {}, allowed: {} });
        const required = contract.required || {}, allowed = contract.allowed || {};
        const errors = [];
        for (const [field, expected] of Object.entries(required)) {
            if (!Object.hasOwn(config, field) || !visual.OPTIONS[field] || !visual.OPTIONS[field].includes(expected))
                return { valid: false, error: 'invalid-breed-contract', errors: [failure('invalid-breed-contract', field, expected, config[field])] };
            if (config[field] !== expected) errors.push(failure('breed-required-value', field, [expected], config[field]));
        }
        for (const [field, values] of Object.entries(allowed)) {
            if (!Object.hasOwn(config, field) || !visual.OPTIONS[field] || !Array.isArray(values) ||
                values.length === 0 || values.some(value => !visual.OPTIONS[field].includes(value)))
                return { valid: false, error: 'invalid-breed-contract', errors: [failure('invalid-breed-contract', field, values, config[field])] };
            if (!values.includes(config[field])) errors.push(failure('breed-disallowed-value', field, values, config[field]));
        }
        if (contract.contrast) {
            const { light, dark, minLumaDifference } = contract.contrast;
            if (light !== 'coat' || dark !== 'faceColor' || !Number.isFinite(minLumaDifference) || minLumaDifference <= 0)
                return { valid: false, error: 'invalid-breed-contract',
                    errors: [failure('invalid-breed-contract', 'faceColor', contract.contrast, null)] };
            const delta = luma(rgb(config[light], COAT_RGB)) - luma(rgb(config[dark], MARK_RGB));
            if (delta < minLumaDifference) errors.push(failure('breed-insufficient-point-contrast',
                'faceColor', `at least ${minLumaDifference} luma darker than coat`, config.faceColor));
        }
        return errors.length ? { valid: false, error: 'breedAppearanceMismatch', errors, breed, config }
            : { valid: true, errors: [], breed, config };
    };
    const getBreedSeedIdentityConfig = breedId => {
        const breed = getBreed(breedId);
        if (!breed) return null;
        const config = visual.canonicalizeIdentity({ ...visual.DEFAULT_CONFIG, ...breed.seed });
        if (!validateBreedAppearanceConsistency(breedId, config).valid) throw new Error(`Invalid breed seed: ${breedId}`);
        return config;
    };
    Meeow.catBreeds = Object.freeze({ VERSION: 1, BREED_REGISTRY, listProductionBreeds, getBreed,
        getResidentBreedDisplay, validateBreedAppearanceConsistency, getBreedSeedIdentityConfig });
}(typeof window !== 'undefined' ? window : globalThis));
