(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const memory = Meeow.memory = Meeow.memory || {};

    let dependencies = null;

    memory.configure = (nextDependencies) => {
        dependencies = nextDependencies;
    };

    const cleanText = (...args) => dependencies.cleanText(...args);
    const getResidentForm = (cat) => dependencies.getResidentForm
        ? dependencies.getResidentForm(cat)
        : (cat?.isHuman ? 'HUMAN' : 'CAT');

    const getPermanentDiaryEntries = (cat, limit = 5) => (cat?.logs || []).slice(-limit)
        .map(entry => `[${entry.date || entry.time || '历史'}] ${cleanText(entry.content || '')}`);
    const getRecentMonitorEntries = (cat, limit = 16) => (cat?.diary || []).slice(-limit)
        .map(entry => `[${entry.time || '历史'}] ${cleanText(entry.content || '')}`);
    const getBriefingDateKey = (report) => {
        const explicitKey = String(report?.dateKey || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(explicitKey)) return explicitKey;
        const rawDate = String(report?.date || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) return '';
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    };
    const getFocusReportOperationalDayKey = (report) => {
        const timestamp = report?.archivedAt || report?.at || report?.date;
        return timestamp ? dependencies.getOperationalDayKey(timestamp) : '';
    };
    const getCatFocusReports = (cat, limit = 5) => {
        const user = dependencies.getUser();
        const operationalDayKey = dependencies.getOperationalDayKey();
        return (user.missionReports || [])
            .filter(report => String(report.executor || '').includes(cat.name) && report.duration > 0 && getFocusReportOperationalDayKey(report) === operationalDayKey)
            .slice(-limit)
            .map(report => `[${report.date || '历史'} · ${report.missionName}] ${cleanText(report.summary || '')}${report.logs?.length ? ` | LIVE LOG: ${report.logs.slice(-5).join(' / ')}` : ''}`);
    };
    const getLatestHouseBriefing = () => {
        const user = dependencies.getUser();
        const previousOperationalDayKey = dependencies.getPreviousOperationalDayKey();
        return [...(user.missionReports || [])].reverse()
            .find(report => report.missionName === '昨日总结报告' && getBriefingDateKey(report) === previousOperationalDayKey) || null;
    };
    const buildCatIdentityBlock = (cat) => {
        const halls = dependencies.getHalls();
        const currentHall = dependencies.getCurrentHall();
        const hall = halls.find(item => item.id === cat?.hallId) || currentHall;
        return `[IMMUTABLE CHARACTER IDENTITY]
- Name: ${cat?.name || '未命名角色'}; Hall: ${hall?.name || 'Meeow House'}
- Canon personality / stored prompt: ${cat?.prompt || cat?.personality || '以原作设定为准'}
- Fixed cat breed: ${cat?.breed || '未设定'}; fixed eye color: ${cat?.eyeColor || '未设定'}.
- Current form: ${getResidentForm(cat) === 'HUMAN' ? 'human form' : 'cat form'}; closeness (affinity): ${cat?.affinity ?? 0}/100.
- The USER is already a trusted and accepted caretaker. Affinity controls intimacy and disclosure, never basic safety or permission to be nearby.
- Fixed breed and eye color are immutable reference facts: never change, contradict, omit, or substitute them. Reference only; do not narrate unless explicitly relevant under the appearance rule. Never change original personality, relationships, or hall boundary.`;
    };
    // Character memories are shared by every cat-facing feature, but the
    // source records can become very large (especially focus LIVE LOGs).
    // Profiles keep the newest, most relevant continuity while making
    // foreground requests small enough for slow OpenAI-compatible proxies.
    const CAT_MEMORY_PROFILES = {
        standard: { interactions: 8, interactionChars: 180, monitoring: 8, monitorChars: 160, diaries: 3, diaryChars: 260, focus: 2, focusChars: 220, travel: 2, travelChars: 200, briefingChars: 260 },
        compact: { interactions: 5, interactionChars: 120, monitoring: 4, monitorChars: 120, diaries: 2, diaryChars: 180, focus: 1, focusChars: 160, travel: 1, travelChars: 160, briefingChars: 180 },
        reader: { interactions: 4, interactionChars: 100, monitoring: 3, monitorChars: 100, diaries: 2, diaryChars: 150, focus: 1, focusChars: 120, travel: 1, travelChars: 120, briefingChars: 160 },
        exploreModule: { interactions: 5, interactionChars: 140, monitoring: 4, monitorChars: 140, diaries: 2, diaryChars: 190, focus: 1, focusChars: 160, travel: 1, travelChars: 160, briefingChars: 200 },
        exploreScene: { interactions: 6, interactionChars: 160, monitoring: 6, monitorChars: 140, diaries: 3, diaryChars: 220, focus: 2, focusChars: 180, travel: 2, travelChars: 180, briefingChars: 240 }
    };
    const truncateMemoryText = (value, maxChars) => {
        const text = cleanText(value || '');
        return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}…` : text;
    };
    const formatMemoryEntries = (entries, limit, maxChars) => entries.slice(-limit)
        .map(entry => truncateMemoryText(entry, maxChars)).filter(Boolean).join(' | ') || 'None';
    const buildCatMemoryContext = (cat, options = {}) => {
        const halls = dependencies.getHalls();
        const currentHall = dependencies.getCurrentHall();
        const hall = halls.find(item => item.id === cat.hallId) || currentHall;
        const profileName = options.profile || (options.compact ? 'compact' : 'standard');
        const profile = CAT_MEMORY_PROFILES[profileName] || CAT_MEMORY_PROFILES.standard;
        const interactions = (cat.todayInteractions || []).map(entry => `[${entry.time || '历史'} · ${entry.type || '互动'}] ${cleanText(entry.content || '')}`);
        const monitoring = getRecentMonitorEntries(cat, profile.monitoring);
        const diaries = getPermanentDiaryEntries(cat, profile.diaries);
        const focus = getCatFocusReports(cat, profile.focus);
        const travelogues = (cat.travelogues || []).map(entry => `[${entry.date || '历史'} · ${entry.location || '外出'}] ${cleanText(entry.content || '')}`);
        const briefing = getLatestHouseBriefing();
        return `
[CHARACTER MEMORY · REQUIRED]
- ${buildCatIdentityBlock(cat)}
- Hall: ${hall?.name || 'Meeow House'} · Guardian: ${hall?.guardian || '未指定'}
- Date context: ${dependencies.getDateContext()}
- ${dependencies.buildOwnerDailyContext(profileName)}
- Closeness / affinity: ${cat.affinity || 0}/100
- Current status: ${truncateMemoryText(cat.status || '未知', 180)}
- Last status update: ${cat.lastStatusUpdateTime ? new Date(cat.lastStatusUpdateTime).toLocaleString() : '无记录'}
- All interactions today: ${formatMemoryEntries(interactions, profile.interactions, profile.interactionChars)}
- Recent monitoring today: ${formatMemoryEntries(monitoring, profile.monitoring, profile.monitorChars)}
- Recent permanent diary entries: ${formatMemoryEntries(diaries, profile.diaries, profile.diaryChars)}
- Current operational day focus records: ${formatMemoryEntries(focus, profile.focus, profile.focusChars)}
- Recent travelogues: ${formatMemoryEntries(travelogues, profile.travel, profile.travelChars)}
- Latest Nain house briefing: ${briefing ? truncateMemoryText(briefing.summary || '', profile.briefingChars) : 'None'}
${options.extra || ''}
[CONTINUITY RULE] Read this timeline before writing. Continue from the latest plausible action; do not repeat a stale status after meaningful time has passed. The stored original-character prompt and immutable identity are binding: never OOC, never generic cute-cat behavior, and never impose a DC/superhero premise outside a hall where it belongs.`;
    };
    // Status Sync runs one request for every cat in a hall. It needs
    // stable identity and immediate continuity, not each feature's
    // full memory package repeated once per character.
    const buildStatusSyncCatContext = (cat, options = {}) => {
        const now = options.now instanceof Date ? options.now : new Date();
        const lastUpdate = Number(cat?.lastStatusUpdateTime) || (now.getTime() - 3600000);
        const diffMinutes = Math.max(0, Math.floor((now.getTime() - lastUpdate) / 60000));
        const interactions = (cat?.todayInteractions || []).map(entry =>
            `[${entry.time || '近期'}·${entry.type || '互动'}] ${cleanText(entry.content || '')}`
        );
        const monitoring = getRecentMonitorEntries(cat, 1);
        const travel = (cat?.travelogues || []).slice(-1).map(entry =>
            `[${entry.date || '近期'}·${entry.location || '外出'}] ${cleanText(entry.content || '')}`
        );
        const focus = getCatFocusReports(cat, 1);
        const permanent = getPermanentDiaryEntries(cat, 1);
        const continuity = cat?.isOut ? travel[0] : (focus[0] || permanent[0] || travel[0]);
        const lastStatusLabel = cat?.lastStatusUpdateTime
            ? new Date(cat.lastStatusUpdateTime).toLocaleString()
            : '无记录';
        const context = `[STATUS SYNC CONTEXT]
ID: ${String(cat?.id || '')}
Name: ${cat?.name || '未命名角色'}
Breed: ${truncateMemoryText(cat?.breed || '未设定', 32)}; Eyes: ${truncateMemoryText(cat?.eyeColor || '未设定', 22)}
Traits: ${truncateMemoryText(cat?.personality || '以原作设定为准', 28)}
Canon: ${truncateMemoryText(cat?.prompt || cat?.personality || '以原作设定为准', 85)}
Affinity: ${cat?.affinity ?? 0}/100; Form: ${getResidentForm(cat)}; Out: ${Boolean(cat?.isOut)}
Current status: ${truncateMemoryText(cat?.status || '未知', 35)}
Current inner voice: ${truncateMemoryText(cat?.innerVoice || '无记录', 24)}
Updated: ${lastStatusLabel}; [Δt RULE]: ${diffMinutes}m
Recent interactions: ${formatMemoryEntries(interactions, 2, 25)}
Recent monitoring: ${formatMemoryEntries(monitoring, 1, 28)}
Continuity: ${truncateMemoryText(continuity || 'None', 34)}`;
        return truncateMemoryText(context, 570);
    };

    Object.assign(memory, {
        CAT_MEMORY_PROFILES,
        truncateMemoryText,
        formatMemoryEntries,
        getPermanentDiaryEntries,
        getRecentMonitorEntries,
        getCatFocusReports,
        getLatestHouseBriefing,
        buildCatIdentityBlock,
        buildCatMemoryContext,
        buildStatusSyncCatContext
    });
}(window));
