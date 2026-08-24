(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const presence = Meeow.presence = Meeow.presence || {};

    const isResidentAway = (cat) => Boolean(cat?.isOut);
    const isResidentInHall = (cat) => !isResidentAway(cat);
    // Descriptive only. Feature-specific workflows remain the authority for
    // interaction eligibility and may apply their own availability rules.
    const getResidentCommunicationMode = (cat) => isResidentAway(cat) ? 'limited' : 'normal';
    const getResidentPresenceLabel = (cat) => isResidentAway(cat) ? '外出中' : '在馆';
    const deriveResidentPresence = (cat) => {
        const isAway = isResidentAway(cat);
        return {
            state: isAway ? 'AWAY' : 'IN_HALL',
            isAway,
            isInHall: !isAway,
            communicationMode: getResidentCommunicationMode(cat),
            label: getResidentPresenceLabel(cat)
        };
    };

    Object.assign(presence, {
        isResidentAway,
        isResidentInHall,
        getResidentCommunicationMode,
        getResidentPresenceLabel,
        deriveResidentPresence
    });
}(window));
