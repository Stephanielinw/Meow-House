(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const curatorPlacement = Meeow.curatorPlacement = Meeow.curatorPlacement || {};
    const CANONICAL_SIZE = 1024;

    // Presentation compatibility for existing curatorRoomPresence.anchor IDs.
    // These are authored-floor foot points, not navigation nodes or behavior targets.
    const COMPATIBILITY_FEET = Object.freeze({
        bed: Object.freeze({ x: 415, y: 615, surface: 'curator-floor' }),
        nightstand: Object.freeze({ x: 540, y: 485, surface: 'curator-floor' }),
        desk: Object.freeze({ x: 865, y: 970, surface: 'curator-floor' }),
        window: Object.freeze({ x: 570, y: 400, surface: 'curator-floor' }),
        wardrobe: Object.freeze({ x: 825, y: 535, surface: 'curator-floor' }),
        floor: Object.freeze({ x: 605, y: 530, surface: 'curator-floor' })
    });

    const getCompatibilityFoot = (legacyAnchorId) => COMPATIBILITY_FEET[legacyAnchorId] || COMPATIBILITY_FEET.floor;
    const getMarkerStyle = (legacyAnchorId) => {
        const foot = getCompatibilityFoot(legacyAnchorId);
        return { left: `${foot.x / CANONICAL_SIZE * 100}%`, top: `${foot.y / CANONICAL_SIZE * 100}%` };
    };

    Object.assign(curatorPlacement, { CANONICAL_SIZE, COMPATIBILITY_FEET, getCompatibilityFoot, getMarkerStyle });
})(window);
