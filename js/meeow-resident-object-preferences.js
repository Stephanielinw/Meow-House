(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const semantics = Meeow.semantics;
    const residents = Meeow.residentSemantics;
    if (!semantics || !residents) throw new Error('Resident semantics must load before object preferences.');

    const VERSION = 1;
    const ALLOWED_WEIGHTS = Object.freeze([-2, -1, 1, 2]);
    const AUTHORITIES = Object.freeze(['meeow-design', 'user-confirmed', 'ai-confirmed', 'test-fixture']);
    const TAGS = Object.freeze([
        ...semantics.OBJECT_VALUES.interaction.map(value => `interaction:${value}`),
        ...semantics.OBJECT_VALUES.stimulus.map(value => `stimulus:${value}`)
    ]);
    const TAG_SET = new Set(TAGS);
    const DISPLAY_LABELS = Object.freeze({
        'interaction:chase': '追逐', 'interaction:bat': '拨弄', 'interaction:carry': '带着走',
        'interaction:cuddle': '依偎', 'interaction:sniff': '闻闻', 'interaction:observe': '观察',
        'stimulus:rolling': '滚动', 'stimulus:swinging': '摇摆', 'stimulus:fluttering': '飘动',
        'stimulus:glowing': '发光', 'stimulus:scented': '有香味'
    });
    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const result = (valid, errors, normalized = null) => ({ valid, error: errors[0] || null, errors, normalized });
    const normalizeObjectPreferenceProfile = input => {
        if (!isRecord(input)) return result(false, ['Object preference profile must be an object.']);
        const errors = [];
        if (Object.keys(input).some(key => !['version', 'residentId', 'preferences', 'provenance'].includes(key)))
            errors.push('Unknown object preference profile field.');
        if (input.version !== VERSION) errors.push('Unsupported object preference version.');
        if (typeof input.residentId !== 'string' || !input.residentId.trim() || input.residentId !== input.residentId.trim())
            errors.push('Invalid residentId.');
        if (!isRecord(input.provenance) || Object.keys(input.provenance).length !== 1 ||
            !AUTHORITIES.includes(input.provenance.authority)) errors.push('Invalid object preference provenance.');

        // The saved wire format is a map, matching Food preferences. Entry
        // arrays are accepted at the validation boundary so duplicate tags can
        // be detected before converting draft rows into that map.
        const entries = isRecord(input.preferences) ? Object.entries(input.preferences)
            : Array.isArray(input.preferences) ? input.preferences.map(entry =>
                isRecord(entry) ? [entry.tag, entry.weight] : [null, null]) : null;
        if (!entries) errors.push('Object preferences must be a map or entry array.');
        const seen = new Set();
        for (const [tag, weight] of entries || []) {
            if (typeof tag !== 'string' || !TAG_SET.has(tag)) errors.push(`Unknown object preference tag: ${String(tag)}`);
            else if (seen.has(tag)) errors.push(`Duplicate object preference tag: ${tag}`);
            else seen.add(tag);
            if (!ALLOWED_WEIGHTS.includes(weight)) errors.push(`Invalid object preference weight: ${String(tag)}`);
        }
        if (errors.length) return result(false, errors);
        const selected = new Map(entries);
        return result(true, [], {
            version: VERSION,
            residentId: input.residentId,
            preferences: Object.fromEntries(TAGS.filter(tag => selected.has(tag)).map(tag => [tag, selected.get(tag)])),
            provenance: { authority: input.provenance.authority }
        });
    };
    const validateObjectPreferenceProfile = normalizeObjectPreferenceProfile;
    // Project-owned, individually authored Meeow House adaptations. These are
    // general tendencies; neither exact-item bonds nor runtime selection weights.
    const makeDesignProfile = (residentId, preferences) => {
        const checked = normalizeObjectPreferenceProfile({ version: VERSION, residentId,
            preferences, provenance: { authority: 'meeow-design' } });
        if (!checked.valid) throw new Error(`Invalid canonical Object profile: ${residentId}`);
        return Object.freeze({ ...checked.normalized,
            preferences: Object.freeze(checked.normalized.preferences),
            provenance: Object.freeze(checked.normalized.provenance) });
    };
    const BUILTIN_RESIDENT_OBJECT_PROFILES = Object.freeze(Object.fromEntries(Object.entries({
        'gotham-bruce': { 'interaction:observe': 1, 'interaction:carry': 1, 'stimulus:swinging': -1 },
        'gotham-dick': { 'interaction:chase': 1, 'interaction:bat': 1, 'stimulus:swinging': 2 },
        'gotham-jason': { 'interaction:cuddle': 1, 'interaction:carry': 1 },
        'gotham-tim': { 'interaction:observe': 1, 'stimulus:glowing': 1, 'stimulus:swinging': -1 },
        'gotham-damian': { 'interaction:bat': 1, 'interaction:chase': 1, 'stimulus:swinging': -1 },
        'gotham-stephanie': { 'interaction:carry': 1, 'interaction:bat': 1, 'stimulus:fluttering': 1 },
        'gotham-cassandra': { 'interaction:observe': 2, 'stimulus:fluttering': 1 },
        'gotham-barbara': { 'interaction:observe': 1, 'interaction:carry': 1 },
        'marvel-peter': { 'interaction:bat': 1, 'interaction:carry': 1, 'stimulus:swinging': 1 },
        'marvel-harry': { 'interaction:observe': 1, 'interaction:cuddle': 1 },
        'marvel-tony': { 'interaction:bat': 1, 'interaction:observe': 1, 'stimulus:glowing': 1 },
        'marvel-wade': { 'interaction:chase': 1, 'interaction:bat': 1, 'stimulus:rolling': 1 },
        'marvel-steve': { 'interaction:bat': 1, 'interaction:cuddle': 1 },
        'marvel-bucky': { 'interaction:cuddle': 1, 'interaction:sniff': 1, 'stimulus:swinging': -1 },
        'marvel-natasha': { 'interaction:bat': 1, 'interaction:carry': 1, 'stimulus:glowing': -1 },
        'marvel-thor': { 'interaction:carry': 1, 'interaction:bat': 1 },
        'marvel-loki': { 'interaction:observe': 1, 'interaction:bat': 1, 'stimulus:scented': -1 },
        'marvel-clint': { 'interaction:carry': 2, 'interaction:bat': 1 },
        'marvel-yelena': { 'interaction:sniff': 1, 'interaction:bat': 1, 'stimulus:scented': -1 },
        'greek-telemachus': { 'interaction:observe': 1, 'interaction:carry': 1, 'stimulus:rolling': 1 },
        'greek-antinous': { 'interaction:cuddle': 1, 'interaction:observe': 1, 'stimulus:rolling': -1 },
        'greek-eurymachus': { 'interaction:observe': 1, 'interaction:sniff': 1 },
        'greek-telegonus': { 'interaction:bat': 1, 'interaction:carry': 1, 'stimulus:rolling': 1 },
        'greek-melanthios': { 'interaction:observe': 1, 'interaction:sniff': 1, 'interaction:cuddle': -1 },
        'greek-amphinomos': { 'interaction:cuddle': 1, 'stimulus:rolling': -1 },
        'greek-peiraios': { 'interaction:carry': 1, 'interaction:observe': 1, 'stimulus:glowing': -1 },
        'greek-peisistratus': { 'interaction:bat': 1, 'interaction:carry': 1 },
        'greek-odysseus': { 'interaction:bat': 1, 'interaction:observe': 1, 'stimulus:rolling': 1 },
        'greek-diomendes': { 'interaction:carry': 1, 'interaction:bat': 1, 'stimulus:rolling': -1 },
        'troy-agamemnon': { 'interaction:observe': 1, 'interaction:cuddle': 1, 'stimulus:swinging': -1 },
        'troy-menelaus': { 'interaction:observe': 1, 'interaction:carry': 1, 'stimulus:fluttering': 1 },
        'troy-ajax': { 'interaction:carry': 1, 'interaction:cuddle': 1, 'stimulus:fluttering': -1 },
        'troy-nestor': { 'interaction:cuddle': 1, 'interaction:sniff': 1 },
        'troy-hector': { 'interaction:carry': 1, 'interaction:observe': 1, 'stimulus:scented': 1 },
        'troy-paris': { 'interaction:bat': 1, 'stimulus:fluttering': 1, 'interaction:chase': -1 },
        'troy-aeneas': { 'interaction:carry': 1, 'interaction:cuddle': 1, 'stimulus:rolling': -1 },
        'troy-sarpedon': { 'interaction:observe': 1, 'interaction:sniff': 1, 'stimulus:swinging': -1 },
        'greek-zagreus': { 'interaction:chase': 1, 'interaction:carry': 1, 'stimulus:rolling': 1 },
        'underworld-hades': { 'interaction:bat': 1, 'interaction:observe': 1, 'stimulus:fluttering': -1 },
        'underworld-hypnos': { 'interaction:cuddle': 1, 'interaction:bat': 1, 'interaction:chase': -1 },
        'underworld-thanatos': { 'interaction:carry': 1, 'interaction:observe': 1, 'stimulus:swinging': -1 },
        'underworld-achilles': { 'interaction:bat': 1, 'interaction:observe': 1 },
        'underworld-patroclus': { 'interaction:cuddle': 1, 'interaction:sniff': 1, 'stimulus:glowing': 1 },
        'olympus-zeus': { 'interaction:observe': 1, 'interaction:bat': 1 },
        'olympus-hera': { 'interaction:observe': 1, 'interaction:carry': 1, 'stimulus:fluttering': -1 },
        'olympus-poseidon': { 'interaction:bat': 1, 'stimulus:rolling': 1 },
        'olympus-demeter': { 'interaction:sniff': 1, 'interaction:carry': 1, 'stimulus:scented': 1 },
        'olympus-athena': { 'interaction:bat': 1, 'interaction:observe': 1, 'stimulus:swinging': -1 },
        'olympus-apollo': { 'interaction:bat': 1, 'stimulus:swinging': 1, 'stimulus:scented': -1 },
        'olympus-artemis': { 'interaction:chase': 1, 'interaction:sniff': 1, 'stimulus:fluttering': 1 },
        'olympus-ares': { 'interaction:bat': 1, 'interaction:chase': 1 },
        'olympus-aphrodite': { 'interaction:sniff': 1, 'stimulus:scented': 1, 'stimulus:fluttering': 1 },
        'olympus-hephaestus': { 'interaction:bat': 1, 'interaction:carry': 1, 'stimulus:rolling': -1 },
        'olympus-hermes': { 'interaction:carry': 1, 'interaction:chase': 1, 'stimulus:fluttering': 1 },
        'olympus-dionysus': { 'interaction:cuddle': 1, 'interaction:bat': 1, 'stimulus:scented': 1 }
    }).map(([residentId, preferences]) => [residentId, makeDesignProfile(residentId, preferences)])));
    const getBuiltinResidentObjectPreferenceProfile = residentId =>
        typeof residentId === 'string' && Object.hasOwn(BUILTIN_RESIDENT_OBJECT_PROFILES, residentId)
            ? BUILTIN_RESIDENT_OBJECT_PROFILES[residentId] : null;
    const UNPROFILED = Object.freeze({ state: 'unprofiled', profile: null, source: null, provenance: null });
    const getResidentObjectPreferenceProfile = (residentId, roster) => {
        const builtin = getBuiltinResidentObjectPreferenceProfile(residentId);
        if (builtin) return Object.freeze({ state: 'profiled', profile: builtin,
            source: 'design', provenance: builtin.provenance });
        const raw = residents.findSavedResident(residentId, roster)?.objectPreferenceProfile;
        if (!raw || raw.residentId !== residentId) return UNPROFILED;
        const checked = normalizeObjectPreferenceProfile(raw);
        if (!checked.valid) return UNPROFILED;
        const profile = Object.freeze({ ...checked.normalized,
            preferences: Object.freeze(checked.normalized.preferences),
            provenance: Object.freeze(checked.normalized.provenance) });
        return Object.freeze({ state: 'profiled', profile, source: 'resident-saved',
            provenance: profile.provenance });
    };
    const scoreResidentObjectPreference = (profile, item) => {
        const checkedProfile = normalizeObjectPreferenceProfile(profile);
        if (!checkedProfile.valid) return {
            state: 'unprofiled', score: null, matchedPreferences: [], reason: 'missing-or-invalid-profile'
        };
        const object = semantics.getItemObjectSemantics(item);
        if (!object) return {
            state: 'unclassified-item', score: null, matchedPreferences: [], reason: 'missing-or-invalid-object-semantics'
        };
        const preferences = checkedProfile.normalized.preferences;
        const matchedPreferences = object.tags.filter(tag => TAG_SET.has(tag) && Object.hasOwn(preferences, tag))
            .map(tag => Object.freeze({ tag, weight: preferences[tag] }));
        return Object.freeze({ state: 'scored', score: matchedPreferences.reduce((sum, match) => sum + match.weight, 0),
            matchedPreferences: Object.freeze(matchedPreferences), reason: matchedPreferences.length ? 'exact-match' : 'no-exact-match' });
    };
    const scoreResidentObjectForResident = (residentId, item, roster) =>
        scoreResidentObjectPreference(getResidentObjectPreferenceProfile(residentId, roster).profile, item);
    const sliderToPreferenceWeight = value => Number.isInteger(value) && value >= 1 && value <= 5
        ? (value === 3 ? null : value - 3) : null;
    const sliderToPersonalityAxis = value => Number.isInteger(value) && value >= 1 && value <= 5
        ? value - 3 : null;

    Meeow.objectPreferences = Object.freeze({
        VERSION, TAGS, DISPLAY_LABELS, ALLOWED_WEIGHTS, AUTHORITIES,
        BUILTIN_RESIDENT_OBJECT_PROFILES, getBuiltinResidentObjectPreferenceProfile,
        normalizeObjectPreferenceProfile, validateObjectPreferenceProfile,
        getResidentObjectPreferenceProfile, scoreResidentObjectPreference, scoreResidentObjectForResident,
        sliderToPreferenceWeight, sliderToPersonalityAxis
    });
}(window));
