(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const memory = Meeow.memory = Meeow.memory || {};

    let dependencies = null;

    memory.configure = (nextDependencies) => {
        dependencies = nextDependencies;
    };

    const cleanText = (...args) => dependencies.cleanText(...args);
    const getResidentPublicName = (cat) => dependencies.getResidentPublicName
        ? dependencies.getResidentPublicName(cat)
        : cleanText(cat?.name || '') || '未命名角色';
    const getResidentForm = (cat) => dependencies.getResidentForm
        ? dependencies.getResidentForm(cat)
        : (cat?.isHuman ? 'HUMAN' : 'CAT');
    const describeResidentForm = (catOrForm) => {
        if (dependencies.describeResidentForm) return dependencies.describeResidentForm(catOrForm);
        const form = typeof catOrForm === 'string' ? catOrForm : getResidentForm(catOrForm);
        return form === 'HUMAN'
            ? 'HUMAN FORM: human-shaped body; natural cat ears in the hair/on top of the head and a natural cat tail from the lower back are ordinary physical anatomy. They can speak human language; ears and tail move naturally with attention, mood, touch, and body language.'
            : 'CAT FORM: full feline body. They communicate aloud only through feline sounds and feline body language.';
    };

    const EPISODIC_KNOWLEDGE_MODES = new Set([
        'direct-conversation', 'witnessed', 'self-experience', 'milestone'
    ]);
    const EPISODIC_MAX_SUMMARY_CHARS = 280;
    const EPISODIC_MAX_TAGS = 8;
    const EPISODIC_MAX_TAG_CHARS = 32;
    // These words are useful for conversation, but cannot on their own make a
    // durable event relevant. Keep this small and deterministic: it is a
    // noise guard, not a linguistic interpretation layer.
    const GENERIC_MEMORY_TERMS = new Set([
        '今天', '昨天', '明天', '现在', '刚才', '后来', '回来', '以后', '怎么样', '什么', '这个', '那个',
        '事情', '一下', '可以', '已经', '还是', '如果', '因为', '然后', '真的', '感觉', '时候', '这里', '那里',
        '一起', '你们', '我们', '他们', '他们的', '就是', '没有', '不会', '应该', '只是', '还有', '还是',
        'the', 'and', 'with', 'that', 'this', 'then', 'when', 'what', 'have', 'from', 'about'
    ]);

    const truncateEpisodicText = (value, maxChars) => {
        const text = cleanText(value || '');
        return text.length > maxChars ? text.slice(0, maxChars) : text;
    };
    const parseEpisodicTimestamp = (value) => {
        if (typeof value !== 'string') return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const stableMemoryHash = (value) => {
        let hash = 2166136261;
        for (const char of String(value || '')) {
            hash ^= char.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    };
    const getMeaningfulMemoryTerms = (value) => {
        const text = cleanText(value || '').toLocaleLowerCase();
        if (!text) return [];
        const terms = new Set();
        (text.match(/[a-z0-9][a-z0-9'-]{1,}/g) || []).forEach(term => {
            if (!GENERIC_MEMORY_TERMS.has(term)) terms.add(term);
        });
        let cjkText = text;
        [...GENERIC_MEMORY_TERMS].filter(term => /[\u3400-\u9fff]/.test(term) && term.length > 1)
            .forEach(term => { cjkText = cjkText.split(term).join(' '); });
        (cjkText.match(/[\u3400-\u9fff]+/g) || []).forEach(sequence => {
            for (let index = 0; index < sequence.length - 1; index += 1) {
                const term = sequence.slice(index, index + 2);
                if (!GENERIC_MEMORY_TERMS.has(term)) terms.add(term);
            }
        });
        return [...terms];
    };
    const hasMeaningfulMemoryOverlap = (left, right) => {
        const leftTerms = new Set(getMeaningfulMemoryTerms(left));
        return getMeaningfulMemoryTerms(right).some(term => leftTerms.has(term));
    };
    const getKnownResidentIds = () => new Set((dependencies.getCats?.() || [])
        .filter(cat => cat && cat.id !== undefined && cat.id !== null)
        .map(cat => String(cat.id)));
    const normalizeEpisodicParticipants = (ownerId, values) => {
        const knownIds = getKnownResidentIds();
        const participants = [...new Set((Array.isArray(values) ? values : [])
            .map(value => String(value || '').trim())
            .filter(id => id === 'USER' || knownIds.has(id)))];
        if (!participants.includes(ownerId)) participants.unshift(ownerId);
        return participants;
    };
    const normalizeEpisodicTags = (values) => [...new Set((Array.isArray(values) ? values : [])
        .map(value => truncateEpisodicText(value, EPISODIC_MAX_TAG_CHARS))
        .filter(Boolean))].slice(0, EPISODIC_MAX_TAGS);
    const normalizeEpisodicMemory = (memory, ownerId, { allowGeneratedId = false } = {}) => {
        if (!memory || typeof memory !== 'object' || Array.isArray(memory) || !ownerId) return null;
        const sourceType = truncateEpisodicText(memory.sourceType, 48);
        const sourceKey = truncateEpisodicText(memory.sourceKey, 180);
        const eventAt = parseEpisodicTimestamp(memory.eventAt);
        const createdAt = parseEpisodicTimestamp(memory.createdAt);
        const summary = truncateEpisodicText(memory.summary, EPISODIC_MAX_SUMMARY_CHARS);
        const importance = Number(memory.importance);
        const emotionalWeight = Number(memory.emotionalWeight);
        const knowledgeMode = String(memory.knowledgeMode || '').trim();
        const requestedOwner = memory.ownerId === undefined || memory.ownerId === null
            ? ownerId
            : String(memory.ownerId);
        if (requestedOwner !== ownerId || !sourceType || !sourceKey || !eventAt || !createdAt || !summary ||
            !Number.isInteger(importance) || importance < 1 || importance > 5 ||
            !Number.isInteger(emotionalWeight) || emotionalWeight < 1 || emotionalWeight > 5 ||
            !EPISODIC_KNOWLEDGE_MODES.has(knowledgeMode)) return null;
        const id = String(memory.id || (allowGeneratedId ? `episodic-${ownerId}-${stableMemoryHash(sourceKey)}` : '')).trim();
        if (!id) return null;
        return {
            id,
            ownerId,
            sourceType,
            sourceKey,
            eventAt: eventAt.toISOString(),
            createdAt: createdAt.toISOString(),
            summary,
            participantIds: normalizeEpisodicParticipants(ownerId, memory.participantIds),
            tags: normalizeEpisodicTags(memory.tags),
            importance,
            emotionalWeight,
            unresolved: memory.unresolved === true,
            knowledgeMode
        };
    };
    const normalizeEpisodicMemories = (cat) => {
        if (!cat || cat.id === undefined || cat.id === null) return [];
        const ownerId = String(cat.id);
        const seenSourceKeys = new Set();
        const normalized = (Array.isArray(cat.episodicMemories) ? cat.episodicMemories : [])
            .map(memory => normalizeEpisodicMemory(memory, ownerId))
            .filter(memory => {
                if (!memory || seenSourceKeys.has(memory.sourceKey)) return false;
                seenSourceKeys.add(memory.sourceKey);
                return true;
            });
        cat.episodicMemories = normalized;
        return normalized;
    };
    const getEpisodicMemories = (cat) => {
        if (!cat || cat.id === undefined || cat.id === null) return [];
        const ownerId = String(cat.id);
        const seenSourceKeys = new Set();
        return (Array.isArray(cat.episodicMemories) ? cat.episodicMemories : [])
            .map(memory => normalizeEpisodicMemory(memory, ownerId))
            .filter(memory => {
                if (!memory || seenSourceKeys.has(memory.sourceKey)) return false;
                seenSourceKeys.add(memory.sourceKey);
                return true;
            })
            .map(memory => ({ ...memory, participantIds: [...memory.participantIds], tags: [...memory.tags] }));
    };
    const hasEpisodicMemorySource = (cat, sourceKey) => Boolean(sourceKey &&
        getEpisodicMemories(cat).some(memory => memory.sourceKey === String(sourceKey)));
    const appendEpisodicMemory = (cat, memory) => {
        if (!cat || cat.id === undefined || cat.id === null) return { stored: false, reason: 'missing-owner', memory: null };
        const ownerId = String(cat.id);
        const existing = normalizeEpisodicMemories(cat);
        const candidate = normalizeEpisodicMemory({
            ...memory,
            ownerId,
            createdAt: memory?.createdAt || new Date().toISOString()
        }, ownerId, { allowGeneratedId: true });
        if (!candidate) return { stored: false, reason: 'invalid', memory: null };
        if (existing.some(entry => entry.sourceKey === candidate.sourceKey)) {
            return { stored: false, reason: 'duplicate', memory: null };
        }
        cat.episodicMemories.push(candidate);
        return { stored: true, reason: '', memory: candidate };
    };
    const getResidentNameMatches = (text) => {
        const haystack = cleanText(text || '').toLocaleLowerCase();
        if (!haystack) return [];
        const candidates = (dependencies.getCats?.() || []).map(cat => ({
            id: String(cat?.id ?? ''),
            name: cleanText(getResidentPublicName(cat)).toLocaleLowerCase()
        })).filter(entry => entry.id && entry.name.length > 1);
        const counts = new Map(candidates.map(entry => [entry.name, 0]));
        candidates.forEach(entry => counts.set(entry.name, (counts.get(entry.name) || 0) + 1));
        return candidates.filter(entry => counts.get(entry.name) === 1 && haystack.includes(entry.name)).map(entry => entry.id);
    };
    const buildEpisodicQuery = (context = {}) => cleanText([
        context.query, context.userInput, context.userAction, context.contextText, context.itemName
    ].filter(Boolean).join('\n'));
    const getContextResidentIds = (context, query) => {
        const knownIds = getKnownResidentIds();
        const suppliedIds = [
            ...(Array.isArray(context?.participantIds) ? context.participantIds : []),
            ...(Array.isArray(context?.relatedResidentIds) ? context.relatedResidentIds : []),
            ...(Array.isArray(context?.residentIds) ? context.residentIds : [])
        ].map(id => String(id || '').trim()).filter(id => knownIds.has(id));
        return new Set([...suppliedIds, ...getResidentNameMatches(query)]);
    };
    const countSharedTerms = (left, right) => {
        const leftTerms = new Set(getMeaningfulMemoryTerms(left));
        return getMeaningfulMemoryTerms(right).filter(term => leftTerms.has(term)).length;
    };
    const memoryRecencyScore = (eventAt, now) => {
        const eventMs = parseEpisodicTimestamp(eventAt)?.getTime();
        if (!eventMs) return 0;
        const ageDays = Math.max(0, (now.getTime() - eventMs) / 86400000);
        return Math.max(0, 4 - Math.floor(ageDays / 30));
    };
    const retrieveRelevantMemories = (cat, context = {}) => {
        const memories = getEpisodicMemories(cat);
        const ownerId = String(cat?.id ?? '');
        const query = buildEpisodicQuery(context);
        const queryTerms = getMeaningfulMemoryTerms(query);
        const contextIds = getContextResidentIds(context, query);
        const now = context.now instanceof Date ? context.now : new Date();
        const eligible = memories.map(memory => {
            const participantMatches = memory.participantIds.filter(id => id !== ownerId && id !== 'USER' && contextIds.has(id));
            const tagOverlap = countSharedTerms(memory.tags.join(' '), query);
            const summaryOverlap = countSharedTerms(memory.summary, query);
            const publicNameMatches = getResidentNameMatches(memory.summary)
                .filter(id => id !== ownerId && contextIds.has(id));
            if (!participantMatches.length && !publicNameMatches.length && !tagOverlap && !summaryOverlap) return null;
            const relevanceScore = participantMatches.length * 80 + publicNameMatches.length * 50 +
                tagOverlap * 18 + summaryOverlap * 7;
            const score = relevanceScore + memory.importance * 3 + memory.emotionalWeight * 2 +
                (memory.unresolved ? 5 : 0) + memoryRecencyScore(memory.eventAt, now);
            return {
                memory,
                score,
                signals: { participantMatches, publicNameMatches, tagOverlap, summaryOverlap }
            };
        }).filter(Boolean).sort((left, right) => right.score - left.score ||
            String(left.memory.sourceKey).localeCompare(String(right.memory.sourceKey)) ||
            String(left.memory.id).localeCompare(String(right.memory.id)));
        return {
            stored: memories.length,
            eligible: eligible.length,
            queryTerms,
            selected: eligible.slice(0, 4)
        };
    };
    const buildEpisodicMemoryContext = (cat, context = {}) => {
        const result = retrieveRelevantMemories(cat, context);
        const lines = ['[OWNER EPISODIC MEMORIES · PRIVATE]'];
        let length = lines[0].length;
        const included = [];
        result.selected.forEach(entry => {
            const memory = entry.memory;
            const date = memory.eventAt.slice(0, 10);
            const tags = memory.tags.length ? ` · tags: ${memory.tags.join(', ')}` : '';
            const line = `- [${date}] ${memory.summary}${tags}`;
            if (length + line.length + 1 > 2400) return;
            lines.push(line);
            length += line.length + 1;
            included.push(entry);
        });
        return {
            text: included.length ? lines.join('\n') : '',
            result: { ...result, selected: included }
        };
    };

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
- Name: ${getResidentPublicName(cat)}; Hall: ${hall?.name || 'Meeow House'}
- Canon personality / stored prompt: ${cat?.prompt || cat?.personality || '以原作设定为准'}
- Fixed cat breed: ${cat?.breed || '未设定'}; fixed eye color: ${cat?.eyeColor || '未设定'}.
- Current physical form: ${describeResidentForm(cat)}; closeness (affinity): ${cat?.affinity ?? 0}/100.
- The supplied current physical form is the authoritative visible anatomy for this request.
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
Name: ${getResidentPublicName(cat)}
Breed: ${truncateMemoryText(cat?.breed || '未设定', 32)}; Eyes: ${truncateMemoryText(cat?.eyeColor || '未设定', 22)}
Traits: ${truncateMemoryText(cat?.personality || '以原作设定为准', 28)}
Canon: ${truncateMemoryText(cat?.prompt || cat?.personality || '以原作设定为准', 85)}
Affinity: ${cat?.affinity ?? 0}/100; Physical form: ${describeResidentForm(cat)}; Out: ${Boolean(cat?.isOut)}
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
        buildStatusSyncCatContext,
        normalizeEpisodicMemories,
        getEpisodicMemories,
        hasEpisodicMemorySource,
        appendEpisodicMemory,
        getMeaningfulMemoryTerms,
        hasMeaningfulMemoryOverlap,
        retrieveRelevantMemories,
        buildEpisodicMemoryContext
    });
}(window));
