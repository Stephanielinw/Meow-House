(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const DAY_MS = 24 * 60 * 60 * 1000;
    const CAT_GIFT_TREND_WINDOW_MS = 14 * DAY_MS;
    const CAT_GIFT_MIN_TENURE_MS = 30 * DAY_MS;
    const CAT_GIFT_DONOR_COOLDOWN_MS = 90 * DAY_MS;
    const CAT_GIFT_PAIR_COOLDOWN_MS = 180 * DAY_MS;
    const CAT_GIFT_ITEM_COOLDOWN_MS = 365 * DAY_MS;
    const GIFT_HOLIDAY_IDS = Object.freeze([
        'new-years-day', 'valentines-day', 'christmas-eve', 'christmas',
        'spring-festival', 'qixi', 'mid-autumn', 'lunar-new-years-eve'
    ]);
    const holidayAllowlist = new Set(GIFT_HOLIDAY_IDS);
    const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    const giftIdPattern = new RegExp(`^resident-gift-event:${UUID}$`, 'i');
    const transferIdPattern = new RegExp(`^gift-transfer:${UUID}$`, 'i');
    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const validAt = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
    const residentId = value => {
        const id = String(isRecord(value) ? value.id ?? '' : value ?? '').trim();
        return id && !['__proto__', 'prototype', 'constructor'].includes(id) ? id : '';
    };
    const typedKey = value => `${typeof value}:${String(value)}`;
    const pairIds = (a, b) => Meeow.socialActivity.pairIds(a, b);
    const pairKey = (a, b) => Meeow.socialActivity.pairKey(a, b);
    const allowedHolidays = snapshot => [...new Set((Array.isArray(snapshot?.holidays) ? snapshot.holidays : [])
        .map(holiday => String(holiday?.id || '')).filter(id => holidayAllowlist.has(id)))];
    const markerId = (sceneId, key) => `resident-special-social-event:${encodeURIComponent(sceneId)}:${key}`;
    const positive = changes => Number(changes?.warmth || 0) > 0 || Number(changes?.trust || 0) > 0 || Number(changes?.tension || 0) < 0;
    const negative = changes => Number(changes?.warmth || 0) < 0 || Number(changes?.trust || 0) < 0 || Number(changes?.tension || 0) > 0;

    const qualifyingPairs = (scene, appliedResults) => {
        if (!scene || !['ambient', 'user-directed'].includes(scene.type) || !validAt(scene.at)) return [];
        const participants = new Set((scene.participantIds || []).map(residentId).filter(Boolean));
        const directions = new Map();
        for (const result of Array.isArray(appliedResults) ? appliedResults : []) {
            const from = residentId(result?.fromId), to = residentId(result?.toId);
            if (!from || !to || from === to || !participants.has(from) || !participants.has(to) || !isRecord(result?.changes)) continue;
            const key = pairKey(from, to);
            const direction = `${from}->${to}`;
            const bucket = directions.get(key) || new Map();
            const prior = bucket.get(direction) || { positive: false, negative: false };
            bucket.set(direction, { positive: prior.positive || positive(result.changes),
                negative: prior.negative || negative(result.changes) });
            directions.set(key, bucket);
        }
        return [...directions.entries()].filter(([key, bucket]) => {
            const [a, b] = key.split('::');
            const ab = bucket.get(`${a}->${b}`), ba = bucket.get(`${b}->${a}`);
            return ab?.positive && ba?.positive && !ab.negative && !ba.negative;
        }).map(([key]) => ({ pairKey: key, residentIds: key.split('::') })).sort((a, b) => a.pairKey.localeCompare(b.pairKey));
    };

    const validMarker = marker => isRecord(marker) && marker.version === 1 &&
        marker.kind === 'mutual-positive-hall-moment' && typeof marker.sourceSceneId === 'string' && marker.sourceSceneId &&
        Array.isArray(marker.residentIds) && marker.residentIds.length === 2 &&
        pairKey(...marker.residentIds) === marker.pairKey &&
        JSON.stringify(marker.residentIds) === JSON.stringify(pairIds(...marker.residentIds)) &&
        marker.eventId === markerId(marker.sourceSceneId, marker.pairKey) && validAt(marker.at) &&
        Array.isArray(marker.holidayIds) && marker.holidayIds.every(id => holidayAllowlist.has(id)) &&
        new Set(marker.holidayIds).size === marker.holidayIds.length &&
        (marker.consumedByGiftEventId === null || giftIdPattern.test(marker.consumedByGiftEventId));
    const validGift = gift => isRecord(gift) && gift.version === 1 && giftIdPattern.test(gift.eventId) &&
        typeof gift.sourceSpecialEventId === 'string' && gift.sourceSpecialEventId.startsWith('resident-special-social-event:') &&
        typeof gift.sourceSceneId === 'string' && gift.sourceSceneId && validAt(gift.at) &&
        residentId(gift.donorId) && residentId(gift.recipientId) && gift.donorId !== gift.recipientId &&
        gift.pairKey === pairKey(gift.donorId, gift.recipientId) &&
        Meeow.residentItems.validPhysicalId(gift.itemUniqueId) && transferIdPattern.test(gift.transferEventId) &&
        Array.isArray(gift.holidayIds) && gift.holidayIds.length > 0 && gift.holidayIds.every(id => holidayAllowlist.has(id)) &&
        new Set(gift.holidayIds).size === gift.holidayIds.length;
    const validateGiftState = user => {
        if (!Array.isArray(user?.residentSpecialSocialEvents) || !Array.isArray(user?.residentGiftEvents)) return false;
        const markers = user.residentSpecialSocialEvents, gifts = user.residentGiftEvents;
        if (markers.some(marker => !validMarker(marker)) || gifts.some(gift => !validGift(gift))) return false;
        if (new Set(markers.map(marker => marker.eventId)).size !== markers.length ||
            new Set(gifts.map(gift => gift.eventId)).size !== gifts.length ||
            new Set(gifts.map(gift => gift.transferEventId)).size !== gifts.length ||
            new Set(gifts.map(gift => gift.sourceSpecialEventId)).size !== gifts.length ||
            new Set(gifts.map(gift => gift.sourceSceneId)).size !== gifts.length) return false;
        return gifts.every(gift => markers.some(marker => marker.eventId === gift.sourceSpecialEventId &&
            marker.sourceSceneId === gift.sourceSceneId && marker.pairKey === gift.pairKey &&
            marker.consumedByGiftEventId === gift.eventId &&
            Date.parse(gift.at) >= Date.parse(marker.at) &&
            JSON.stringify(marker.holidayIds) === JSON.stringify(gift.holidayIds))) &&
            markers.every(marker => marker.consumedByGiftEventId === null ||
                gifts.some(gift => gift.eventId === marker.consumedByGiftEventId &&
                    gift.sourceSpecialEventId === marker.eventId));
    };
    const normalizeGiftState = user => {
        if (!isRecord(user)) return { changed: false, valid: false };
        let changed = false;
        if (user.residentSpecialSocialEvents == null) { user.residentSpecialSocialEvents = []; changed = true; }
        if (user.residentGiftEvents == null) { user.residentGiftEvents = []; changed = true; }
        return { changed, valid: validateGiftState(user) };
    };
    const makeMarker = (scene, pair, snapshot) => ({ version: 1,
        eventId: markerId(scene.id, pair.pairKey), kind: 'mutual-positive-hall-moment',
        sourceSceneId: String(scene.id), pairKey: pair.pairKey, residentIds: [...pair.residentIds],
        at: scene.at, holidayIds: allowedHolidays(snapshot), consumedByGiftEventId: null });

    const hasPriorPositiveTrend = ({ residents, donorId, recipientId, eventAt, sourceSceneId }) => {
        const donor = (Array.isArray(residents) ? residents : []).find(cat => residentId(cat) === residentId(donorId));
        const atMs = Date.parse(eventAt || '');
        if (!donor || !Number.isFinite(atMs)) return false;
        return (Array.isArray(donor.residentRelationships?.[residentId(recipientId)]?.events)
            ? donor.residentRelationships[residentId(recipientId)].events : []).some(event => {
            const priorMs = Date.parse(event?.at || '');
            return Number.isFinite(priorMs) && priorMs >= atMs - CAT_GIFT_TREND_WINDOW_MS && priorMs < atMs &&
                event.sceneId !== sourceSceneId && /^shared-scene:/.test(String(event.sourceKey || '')) &&
                !String(event.sourceKey).endsWith(':program-familiarity') && positive(event.changes);
        });
    };
    const cooldownPassed = (giftEvents, predicate, nowMs, cooldownMs) =>
        !(Array.isArray(giftEvents) ? giftEvents : []).some(event => predicate(event) &&
            nowMs - Date.parse(event.at) < cooldownMs);
    const donorCooldownPassed = (user, donorId, nowMs) =>
        cooldownPassed(user.residentGiftEvents, event => event.donorId === donorId, nowMs, CAT_GIFT_DONOR_COOLDOWN_MS);
    const pairCooldownPassed = (user, key, nowMs) =>
        cooldownPassed(user.residentGiftEvents, event => event.pairKey === key, nowMs, CAT_GIFT_PAIR_COOLDOWN_MS);
    const itemCooldownPassed = (item, nowMs) => {
        const history = item?.provenance?.giftHistory;
        return Array.isArray(history) && !history.some(event => event.from?.kind === 'resident' &&
            event.to?.kind === 'resident' && nowMs - Date.parse(event.at) < CAT_GIFT_ITEM_COOLDOWN_MS);
    };
    const getResidentCurrentOwnershipStartedAt = (residentIdValue, item, bond) => {
        const donor = residentId(residentIdValue), authority = Meeow.residentItems;
        if (!donor || !authority.isValidProvenance(item?.provenance) || !authority.validPhysicalId(item?.uniqueId)) return null;
        const history = item.provenance.giftHistory;
        if (history.some((event, index) => typedKey(event.uniqueId) !== typedKey(item.uniqueId) ||
            (index > 0 && Date.parse(event.at) < Date.parse(history[index - 1].at)) ||
            (index > 0 && (event.from?.kind !== 'resident' ||
                residentId(event.from.residentId) !== residentId(history[index - 1].to?.residentId))) ||
            (event.from?.kind === 'resident' && event.to?.kind === 'resident' &&
                residentId(event.from.residentId) === residentId(event.to.residentId)))) return null;
        if (history.length) {
            const latest = history[history.length - 1];
            return latest.to?.kind === 'resident' && residentId(latest.to.residentId) === donor ? latest.at : null;
        }
        return item.provenance.originOwner.kind === 'resident' &&
            residentId(item.provenance.originOwner.residentId) === donor && validAt(bond?.firstOwnedAt)
            ? bond.firstOwnedAt : null;
    };
    const isUserGiftedToDonor = (item, donorId) => item.provenance.giftHistory.some(event =>
        event.from?.kind === 'user' && residentId(event.to?.residentId) === donorId);
    const isPriorResidentGiver = (item, recipientId) => item.provenance.giftHistory.some(event =>
        event.from?.kind === 'resident' && residentId(event.from.residentId) === recipientId);
    const meaningfulObjects = (user, donorId) => Meeow.residentItems.getResidentOwnedItems(user.residentItems, donorId)
        .filter(item => Meeow.residentItems.validPhysicalId(item?.uniqueId) &&
            Meeow.residentItems.isResidentItemBondEligible(item));
    const eligibleItem = ({ user, residents, donorId, recipientId, item, nowMs }) => {
        const authority = Meeow.residentItems, semantics = Meeow.semantics;
        const gameplayReward = Meeow.gameplayRewards?.hasLegitimateResidentRewardTransfer(item) === true;
        if (!authority.validPhysicalId(item?.uniqueId) || !authority.isResidentItemBondEligible(item) ||
            !['toy', 'collectible'].includes(item.semanticType) ||
            !semantics?.hasValidSemanticClassification(item) || !semantics?.getItemObjectSemantics(item) ||
            !semantics?.isSemanticallyUsableItem(item) ||
            item.visualMode === 'custom-pixel' || item.frozenVisualMode === 'custom-pixel' ||
            item.visual?.mode === 'custom-pixel' ||
            !authority.isValidProvenance(item.provenance) ||
            (item.provenance.originOwner.kind !== 'resident' && !gameplayReward)) return null;
        const owned = authority.getResidentOwnedItems(user.residentItems, donorId);
        if (owned.filter(candidate => candidate === item).length !== 1 ||
            owned.filter(candidate => typedKey(candidate?.uniqueId) === typedKey(item.uniqueId)).length !== 1 ||
            authority.scanOwnership(user.inventory, user.residentItems).duplicateIds.length) return null;
        const bond = authority.getResidentItemBond(user, donorId, item.uniqueId);
        if (!bond || bond.fondness < 0 || authority.isResidentItemCherished(bond) ||
            (!gameplayReward && isUserGiftedToDonor(item, donorId)) || isPriorResidentGiver(item, recipientId) ||
            !itemCooldownPassed(item, nowMs) || meaningfulObjects(user, donorId).length < 2) return null;
        const tenureStart = getResidentCurrentOwnershipStartedAt(donorId, item, bond);
        if (!tenureStart || Date.parse(tenureStart) > nowMs || nowMs - Date.parse(tenureStart) < CAT_GIFT_MIN_TENURE_MS) return null;
        return { itemRef: item, itemUniqueId: item.uniqueId, bond, tenureStart };
    };
    const itemWeight = bond => Math.max(1, 4 + Number(bond?.familiarity || 0) + Math.max(0, Number(bond?.fondness || 0)));
    const pickWeighted = (entries, weight, random = Math.random) => {
        if (!entries.length) return null;
        if (entries.length === 1) return entries[0];
        const total = entries.reduce((sum, entry) => sum + weight(entry), 0);
        const sample = Number(random());
        let draw = Math.max(0, Math.min(1 - Number.EPSILON, Number.isFinite(sample) ? sample : 0)) * total;
        for (const entry of entries) { draw -= weight(entry); if (draw < 0) return entry; }
        return entries[entries.length - 1];
    };
    const newEventId = prefix => Meeow.shopCatalog.createInstanceUniqueId().replace(/^item-instance:/, prefix);
    const chooseCandidate = ({ user, residents, scene, markers, holidaySnapshot, nowMs, random = Math.random,
        makeId = newEventId }) => {
        if (!validateGiftState(user) || !allowedHolidays(holidaySnapshot).length ||
            user.residentGiftEvents.some(gift => gift.sourceSceneId === scene.id)) return null;
        const pairOptions = [];
        for (const marker of markers) {
            if (marker.sourceSceneId !== scene.id || marker.consumedByGiftEventId ||
                !marker.holidayIds.length || !pairCooldownPassed(user, marker.pairKey, nowMs)) continue;
            const directions = [];
            for (const donorId of marker.residentIds) {
                const recipientId = marker.residentIds.find(id => id !== donorId);
                if (!recipientId || residents.filter(cat => residentId(cat) === donorId).length !== 1 ||
                    residents.filter(cat => residentId(cat) === recipientId).length !== 1 ||
                    !hasPriorPositiveTrend({ residents, donorId, recipientId, eventAt: marker.at,
                        sourceSceneId: marker.sourceSceneId }) || !donorCooldownPassed(user, donorId, nowMs)) continue;
                const items = meaningfulObjects(user, donorId).map(item =>
                    eligibleItem({ user, residents, donorId, recipientId, item, nowMs })).filter(Boolean);
                if (items.length) directions.push({ donorId, recipientId, items });
            }
            if (directions.length) pairOptions.push({ marker, directions });
        }
        const chosenPair = pickWeighted(pairOptions, () => 1, random);
        if (!chosenPair) return null;
        const direction = pickWeighted(chosenPair.directions, () => 1, random);
        const item = pickWeighted(direction.items, entry => itemWeight(entry.bond), random);
        const giftEventId = makeId('resident-gift-event:');
        const transferEventId = makeId('gift-transfer:');
        if (!giftIdPattern.test(giftEventId) || !transferIdPattern.test(transferEventId)) return null;
        return Object.freeze({ sourceSceneId: scene.id, sourceSpecialEventId: chosenPair.marker.eventId,
            pairKey: chosenPair.marker.pairKey, donorId: direction.donorId, recipientId: direction.recipientId,
            itemUniqueId: item.itemUniqueId, itemRef: item.itemRef, giftEventId, transferEventId,
            holidayIds: Object.freeze([...chosenPair.marker.holidayIds]) });
    };

    let transferPending = false;
    const commitCandidate = ({ user, residents, scene, appliedResults, holidaySnapshot, candidate, persist,
        now = () => new Date().toISOString(), displayName = cat => String(cat?.name || cat?.id || '') }) => {
        if (transferPending || typeof persist !== 'function' || !validateGiftState(user) || !candidate) return { ok: false, reason: 'invalid-state' };
        const existing = user.residentGiftEvents.find(gift => gift.sourceSpecialEventId === candidate.sourceSpecialEventId);
        if (existing) return { ok: true, reused: true, gift: existing };
        if (user.residentGiftEvents.some(gift => gift.sourceSceneId === scene?.id ||
            gift.eventId === candidate.giftEventId || gift.transferEventId === candidate.transferEventId) ||
            !qualifyingPairs(scene, appliedResults).some(pair => pair.pairKey === candidate.pairKey) ||
            scene.id !== candidate.sourceSceneId || !scene.participantIds.includes(candidate.donorId) ||
            !scene.participantIds.includes(candidate.recipientId)) return { ok: false, reason: 'invalid-source-event' };
        const marker = user.residentSpecialSocialEvents.find(entry => entry.eventId === candidate.sourceSpecialEventId);
        if (!marker || marker.sourceSceneId !== scene.id || marker.pairKey !== candidate.pairKey || marker.consumedByGiftEventId ||
            JSON.stringify(marker.holidayIds) !== JSON.stringify(allowedHolidays(holidaySnapshot)) ||
            JSON.stringify(candidate.holidayIds) !== JSON.stringify(marker.holidayIds)) return { ok: false, reason: 'invalid-marker-or-holiday' };
        const donor = residents.find(cat => residentId(cat) === candidate.donorId);
        const recipient = residents.find(cat => residentId(cat) === candidate.recipientId);
        if (!donor || !recipient || residents.filter(cat => residentId(cat) === candidate.donorId).length !== 1 ||
            residents.filter(cat => residentId(cat) === candidate.recipientId).length !== 1) return { ok: false, reason: 'invalid-residents' };
        let at;
        try { at = now(); } catch (_) { return { ok: false, reason: 'invalid-time' }; }
        if (!validAt(at) || Date.parse(at) < Date.parse(scene.at)) return { ok: false, reason: 'invalid-time' };
        const nowMs = Date.parse(at);
        if (!hasPriorPositiveTrend({ residents, donorId: candidate.donorId, recipientId: candidate.recipientId,
            eventAt: marker.at, sourceSceneId: scene.id }) ||
            !donorCooldownPassed(user, candidate.donorId, nowMs) || !pairCooldownPassed(user, candidate.pairKey, nowMs))
            return { ok: false, reason: 'trend-or-cooldown-changed' };
        const item = candidate.itemRef;
        const checked = eligibleItem({ user, residents, donorId: candidate.donorId,
            recipientId: candidate.recipientId, item, nowMs });
        if (!checked || typedKey(checked.itemUniqueId) !== typedKey(candidate.itemUniqueId))
            return { ok: false, reason: 'exact-item-invalidated' };
        const authority = Meeow.residentItems;
        if (!isRecord(user.residentItemBonds) || !isRecord(user.residentItemBonds[candidate.donorId]))
            return { ok: false, reason: 'invalid-bond-store' };
        const bondKey = typedKey(candidate.itemUniqueId);
        const recipientBonds = user.residentItemBonds[candidate.recipientId];
        if (recipientBonds !== undefined && !isRecord(recipientBonds)) return { ok: false, reason: 'invalid-recipient-bond-container' };
        if (recipientBonds && Object.hasOwn(recipientBonds, bondKey) && !authority.validBond(recipientBonds[bondKey]))
            return { ok: false, reason: 'invalid-recipient-bond' };
        const event = { transferId: candidate.transferEventId, uniqueId: candidate.itemUniqueId,
            from: { kind: 'resident', residentId: candidate.donorId },
            to: { kind: 'resident', residentId: candidate.recipientId }, at };
        const nextProvenance = authority.appendGiftEvent(item.provenance, event);
        if (!nextProvenance) return { ok: false, reason: 'invalid-provenance-event' };
        const gift = { version: 1, eventId: candidate.giftEventId,
            sourceSpecialEventId: marker.eventId, sourceSceneId: scene.id, at,
            donorId: candidate.donorId, recipientId: candidate.recipientId, pairKey: candidate.pairKey,
            itemUniqueId: candidate.itemUniqueId, transferEventId: candidate.transferEventId,
            holidayIds: [...candidate.holidayIds] };
        const holiday = (holidaySnapshot.holidays || []).find(entry => candidate.holidayIds.includes(entry.id));
        const text = holiday?.name
            ? `在${holiday.name}这天，${displayName(donor)}把${item.name}送给了${displayName(recipient)}。`
            : `${displayName(donor)}把${item.name}送给了${displayName(recipient)}。`;
        const giftMoment = { giftEventId: gift.eventId, itemName: String(item.name || '礼物'), text };
        const donorItems = user.residentItems[candidate.donorId];
        const recipientHadContainer = Object.hasOwn(user.residentItems, candidate.recipientId);
        const recipientItems = recipientHadContainer ? user.residentItems[candidate.recipientId] : [];
        if (!Array.isArray(recipientItems)) return { ok: false, reason: 'invalid-recipient-container' };
        const donorIndex = donorItems.indexOf(item);
        const priorProvenance = item.provenance;
        const priorMoment = scene.giftMoment;
        const priorConsumed = marker.consumedByGiftEventId;
        const priorLedgerLength = user.residentGiftEvents.length;
        const recipientHadBondContainer = Object.hasOwn(user.residentItemBonds, candidate.recipientId);
        const recipientHadBond = isRecord(recipientBonds) && Object.hasOwn(recipientBonds, bondKey);
        transferPending = true;
        let persisted = false;
        try {
            item.provenance = nextProvenance;
            donorItems.splice(donorIndex, 1);
            if (!recipientHadContainer) user.residentItems[candidate.recipientId] = recipientItems;
            recipientItems.push(item);
            if (!recipientHadBondContainer) user.residentItemBonds[candidate.recipientId] = {};
            if (!recipientHadBond) user.residentItemBonds[candidate.recipientId][bondKey] = authority.makeNeutralBond(at);
            user.residentGiftEvents.push(gift);
            marker.consumedByGiftEventId = gift.eventId;
            scene.giftMoment = giftMoment;
            persisted = validateGiftState(user) && persist() === true;
            if (persisted) return { ok: true, reused: false, gift, item, giftMoment };
        } catch (_) { /* Roll back the entire gift transaction below. */ }
        finally { transferPending = false; }
        const recipientIndex = recipientItems.indexOf(item);
        if (recipientIndex >= 0) recipientItems.splice(recipientIndex, 1);
        if (!donorItems.includes(item)) donorItems.splice(donorIndex, 0, item);
        item.provenance = priorProvenance;
        if (!recipientHadContainer) delete user.residentItems[candidate.recipientId];
        if (!recipientHadBond && isRecord(user.residentItemBonds[candidate.recipientId])) delete user.residentItemBonds[candidate.recipientId][bondKey];
        if (!recipientHadBondContainer) delete user.residentItemBonds[candidate.recipientId];
        user.residentGiftEvents.splice(priorLedgerLength);
        marker.consumedByGiftEventId = priorConsumed;
        if (priorMoment === undefined) delete scene.giftMoment; else scene.giftMoment = priorMoment;
        return { ok: false, reason: 'persistence-failed' };
    };

    const processAcceptedScene = ({ user, residents, scene, appliedResults, relationshipCommitted,
        holidaySnapshot, persist, now = () => new Date().toISOString(), random = Math.random,
        makeId = newEventId, displayName }) => {
        if (relationshipCommitted !== true || !validateGiftState(user) ||
            !scene || !scene.id || !validAt(scene.at) || typeof persist !== 'function')
            return { ok: false, reason: 'invalid-authority' };
        const pairs = qualifyingPairs(scene, appliedResults);
        if (!pairs.length) return { ok: true, markers: [], gift: null };
        const existing = user.residentGiftEvents.find(gift => gift.sourceSceneId === scene.id);
        if (existing) return { ok: true, reused: true, markers: [], gift: existing };
        const oldMarkers = user.residentSpecialSocialEvents;
        const newMarkers = pairs.map(pair => makeMarker(scene, pair, holidaySnapshot))
            .filter(marker => !oldMarkers.some(existing => existing.eventId === marker.eventId));
        if (newMarkers.length) user.residentSpecialSocialEvents = [...oldMarkers, ...newMarkers];
        let nowValue;
        try { nowValue = now(); } catch (_) { nowValue = null; }
        const nowMs = Date.parse(nowValue);
        let candidate = null;
        if (Number.isFinite(nowMs)) {
            try {
                candidate = chooseCandidate({ user, residents, scene,
                    markers: user.residentSpecialSocialEvents.filter(marker => pairs.some(pair => pair.pairKey === marker.pairKey)),
                    holidaySnapshot, nowMs, random, makeId });
            } catch (_) { /* Keep the accepted scene and marker; fail closed on unavailable identity. */ }
        }
        if (candidate) {
            const committed = commitCandidate({ user, residents, scene, appliedResults, holidaySnapshot,
                candidate, persist, now: () => nowValue, displayName });
            if (committed.ok) return { ...committed, markers: newMarkers, candidate };
            if (committed.reason === 'persistence-failed') {
                if (newMarkers.length) user.residentSpecialSocialEvents = oldMarkers;
                return { ...committed, markers: [] };
            }
        }
        if (newMarkers.length) {
            try { if (persist() !== true) throw new Error('marker-persistence-failed'); }
            catch (_) { user.residentSpecialSocialEvents = oldMarkers; return { ok: false, reason: 'marker-persistence-failed' }; }
        }
        return { ok: true, markers: newMarkers, gift: null, reason: candidate ? 'gift-candidate-invalidated' : 'no-eligible-gift' };
    };

    const authority = Object.freeze({ CAT_GIFT_TREND_WINDOW_MS, CAT_GIFT_MIN_TENURE_MS,
        CAT_GIFT_DONOR_COOLDOWN_MS, CAT_GIFT_PAIR_COOLDOWN_MS, CAT_GIFT_ITEM_COOLDOWN_MS,
        GIFT_HOLIDAY_IDS, allowedHolidays, qualifyingPairs, validMarker, validGift, validateGiftState,
        normalizeGiftState, hasPriorPositiveTrend, donorCooldownPassed, pairCooldownPassed, itemCooldownPassed,
        getResidentCurrentOwnershipStartedAt, meaningfulObjects, eligibleItem, itemWeight, pickWeighted,
        chooseCandidate, commitCandidate, processAcceptedScene });
    Meeow.catGifts = authority;
    if (typeof module !== 'undefined' && module.exports) module.exports = authority;
})(typeof window !== 'undefined' ? window : globalThis);
