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
    const MEMORY_AUTHORITIES = new Set(['HISTORICAL_FACT', 'USER_STATEMENT', 'INTERPRETATION', 'GENERATED_NARRATIVE']);
    const EPISODIC_MAX_SUMMARY_CHARS = 280;
    const EPISODIC_MAX_TAGS = 8;
    const EPISODIC_MAX_TAG_CHARS = 32;
    const EPISODIC_RETRIEVAL_LIMITS = Object.freeze({
        keywords: Object.freeze({ count: 14, chars: 32 }),
        entityIds: Object.freeze({ count: 10, chars: 80 }),
        locationKeys: Object.freeze({ count: 6, chars: 48 }),
        topicKeys: Object.freeze({ count: 10, chars: 32 })
    });
    const USER_SHARED_EPISODIC_SOURCE_TYPES = new Set([
        'homepage', 'shared-scene', 'first-human-reveal', 'fanfic-reading'
    ]);
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
    const normalizeRetrievalTerm = (value, maxChars) => {
        if (typeof value !== 'string') return '';
        const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
        return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
    };
    const normalizeRetrievalTerms = (values, limits) => [...new Set((Array.isArray(values) ? values : [])
        .map(value => normalizeRetrievalTerm(value, limits.chars)).filter(Boolean))].slice(0, limits.count);
    const normalizeEpisodicRetrieval = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        return {
            keywords: normalizeRetrievalTerms(value.keywords, EPISODIC_RETRIEVAL_LIMITS.keywords),
            entityIds: normalizeRetrievalTerms(value.entityIds, EPISODIC_RETRIEVAL_LIMITS.entityIds),
            locationKeys: normalizeRetrievalTerms(value.locationKeys, EPISODIC_RETRIEVAL_LIMITS.locationKeys),
            topicKeys: normalizeRetrievalTerms(value.topicKeys, EPISODIC_RETRIEVAL_LIMITS.topicKeys),
            hallId: normalizeRetrievalTerm(value.hallId, EPISODIC_RETRIEVAL_LIMITS.locationKeys.chars)
        };
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
        const retrieval = normalizeEpisodicRetrieval(memory.retrieval);
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
            knowledgeMode,
            ...(MEMORY_AUTHORITIES.has(memory.authority) ? { authority: memory.authority } : {}),
            ...(typeof memory.sourceRecordId === 'string' && memory.sourceRecordId.trim()
                ? { sourceRecordId: memory.sourceRecordId.trim().slice(0, 180) } : {}),
            ...(retrieval ? { retrieval } : {})
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
            .map(memory => ({ ...memory, participantIds: [...memory.participantIds], tags: [...memory.tags],
                ...(memory.retrieval ? {
                    retrieval: {
                        ...memory.retrieval,
                        keywords: [...memory.retrieval.keywords], entityIds: [...memory.retrieval.entityIds],
                        locationKeys: [...memory.retrieval.locationKeys], topicKeys: [...memory.retrieval.topicKeys]
                    }
                } : {}) }));
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
        // New entries persist bounded metadata. Legacy entries without this
        // field remain untouched and are derived only in retrieval memory.
        candidate.retrieval = candidate.retrieval || deriveEpisodicRetrievalMetadata(candidate, cat);
        cat.episodicMemories.push(candidate);
        return { stored: true, reason: '', memory: candidate };
    };
    const getResidentAliasMatches = (text) => {
        const haystack = normalizeRetrievalTerm(cleanText(text || ''), 16000);
        if (!haystack) return [];
        const candidates = (dependencies.getCats?.() || []).flatMap(cat => {
            const id = String(cat?.id ?? '').trim();
            const aliases = [
                getResidentPublicName(cat), cat?.name, cat?.humanName, cat?.codename, cat?.alias,
                ...(Array.isArray(cat?.aliases) ? cat.aliases : [])
            ].map(value => normalizeRetrievalTerm(cleanText(value || ''), 80)).filter(alias => alias.length > 1);
            return [...new Set(aliases)].map(alias => ({ id, alias }));
        }).filter(entry => entry.id && entry.alias);
        const ownerByAlias = new Map();
        candidates.forEach(entry => {
            if (!ownerByAlias.has(entry.alias)) ownerByAlias.set(entry.alias, new Set());
            ownerByAlias.get(entry.alias).add(entry.id);
        });
        return [...ownerByAlias.entries()].filter(([alias, ids]) => ids.size === 1 && haystack.includes(alias))
            .map(([, ids]) => [...ids][0]);
    };
    const getResidentNameMatches = (text) => {
        const haystack = cleanText(text || '').toLocaleLowerCase();
        if (!haystack) return [];
        const candidates = (dependencies.getCats?.() || []).map(cat => ({
            id: String(cat?.id ?? ''), name: cleanText(getResidentPublicName(cat)).toLocaleLowerCase()
        })).filter(entry => entry.id && entry.name.length > 1);
        const counts = new Map(candidates.map(entry => [entry.name, 0]));
        candidates.forEach(entry => counts.set(entry.name, (counts.get(entry.name) || 0) + 1));
        return candidates.filter(entry => counts.get(entry.name) === 1 && haystack.includes(entry.name)).map(entry => entry.id);
    };
    const buildEpisodicQuery = (context = {}) => cleanText([
        context.query, context.userInput, context.userAction, context.contextText, context.itemName,
        ...(Array.isArray(context.topicKeys) ? context.topicKeys : [])
    ].filter(Boolean).join('\n'));
    const getContextResidentIds = (context, query) => {
        const knownIds = getKnownResidentIds();
        const suppliedIds = [
            ...(Array.isArray(context?.participantIds) ? context.participantIds : []),
            ...(Array.isArray(context?.relatedResidentIds) ? context.relatedResidentIds : []),
            ...(Array.isArray(context?.residentIds) ? context.residentIds : [])
        ].map(id => String(id || '').trim()).filter(id => knownIds.has(id));
        const matches = context?.retrievalV2 === true ? getResidentAliasMatches(query) : getResidentNameMatches(query);
        return new Set([...suppliedIds, ...matches]);
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
    const deriveEpisodicRetrievalMetadata = (memory, cat) => ({
        keywords: normalizeRetrievalTerms([
            ...(memory?.tags || []), ...getMeaningfulMemoryTerms(String(memory?.summary || '').normalize('NFKC'))
        ], EPISODIC_RETRIEVAL_LIMITS.keywords),
        entityIds: normalizeRetrievalTerms((memory?.participantIds || []).filter(id => id !== 'USER'), EPISODIC_RETRIEVAL_LIMITS.entityIds),
        locationKeys: normalizeRetrievalTerms([cat?.hallId || ''], EPISODIC_RETRIEVAL_LIMITS.locationKeys),
        topicKeys: normalizeRetrievalTerms([memory?.sourceType || '', ...(memory?.tags || [])], EPISODIC_RETRIEVAL_LIMITS.topicKeys),
        hallId: normalizeRetrievalTerm(cat?.hallId || '', EPISODIC_RETRIEVAL_LIMITS.locationKeys.chars)
    });
    const getEpisodicRetrievalMetadata = (memory, cat) => memory?.retrieval || deriveEpisodicRetrievalMetadata(memory, cat);
    const isUserSharedEpisodicMemory = (memory, context = {}) => {
        if (!context.userSharedOnly) return true;
        const allowedSources = context.allowedSourceTypes instanceof Set
            ? context.allowedSourceTypes
            : USER_SHARED_EPISODIC_SOURCE_TYPES;
        return allowedSources.has(String(memory?.sourceType || '')) &&
            Array.isArray(memory?.participantIds) && memory.participantIds.includes('USER');
    };
    const getRetrievalContextKeys = (context = {}) => ({
        locations: new Set(normalizeRetrievalTerms([
            context.hallId || '', context.locationKey || '', ...(Array.isArray(context.locationKeys) ? context.locationKeys : [])
        ], EPISODIC_RETRIEVAL_LIMITS.locationKeys)),
        topics: new Set(normalizeRetrievalTerms([
            context.feature || '', ...(Array.isArray(context.topicKeys) ? context.topicKeys : [])
        ], EPISODIC_RETRIEVAL_LIMITS.topicKeys))
    });
    const retrieveRelevantMemories = (cat, context = {}) => {
        const memories = getEpisodicMemories(cat);
        const ownerId = String(cat?.id ?? '');
        const retrievalV2 = context.retrievalV2 === true;
        const query = buildEpisodicQuery(context);
        const queryTerms = getMeaningfulMemoryTerms(query);
        const contextIds = getContextResidentIds(context, query);
        const contextKeys = retrievalV2 ? getRetrievalContextKeys(context) : { locations: new Set(), topics: new Set() };
        const now = context.now instanceof Date ? context.now : new Date();
        const eligible = memories.map(memory => {
            if (!isUserSharedEpisodicMemory(memory, context)) return null;
            const retrieval = retrievalV2 ? getEpisodicRetrievalMetadata(memory, cat) : null;
            const participantMatches = memory.participantIds.filter(id => id !== ownerId && id !== 'USER' && contextIds.has(id));
            const entityMatches = retrievalV2 ? retrieval.entityIds.filter(id => id !== ownerId && id !== 'user' && contextIds.has(id)) : [];
            const tagOverlap = countSharedTerms(memory.tags.join(' '), query);
            const summaryOverlap = countSharedTerms(memory.summary, query);
            const keywordOverlap = retrievalV2 ? countSharedTerms(retrieval.keywords.join(' '), query) : 0;
            const topicMatches = retrievalV2 ? retrieval.topicKeys.filter(key => contextKeys.topics.has(key)) : [];
            const locationMatches = retrievalV2 ? retrieval.locationKeys.filter(key => contextKeys.locations.has(key)) : [];
            const hallMatch = retrievalV2 && Boolean(retrieval.hallId && contextKeys.locations.has(retrieval.hallId));
            const publicNameMatches = (retrievalV2 ? getResidentAliasMatches(memory.summary) : getResidentNameMatches(memory.summary))
                .filter(id => id !== ownerId && contextIds.has(id));
            if (!participantMatches.length && !entityMatches.length && !publicNameMatches.length && !tagOverlap && !summaryOverlap &&
                !keywordOverlap && !topicMatches.length && !locationMatches.length && !hallMatch) return null;
            const relevanceScore = participantMatches.length * 80 + entityMatches.length * 70 + publicNameMatches.length * 50 +
                locationMatches.length * 45 + (hallMatch ? 35 : 0) + topicMatches.length * 24 +
                keywordOverlap * 18 + tagOverlap * 18 + summaryOverlap * 7;
            const score = relevanceScore + memory.importance * 3 + memory.emotionalWeight * 2 +
                (memory.unresolved ? 5 : 0) + memoryRecencyScore(memory.eventAt, now);
            return {
                memory,
                score,
                signals: { participantMatches, entityMatches, publicNameMatches, locationMatches, hallMatch, topicMatches, keywordOverlap, tagOverlap, summaryOverlap },
                ...(retrievalV2 ? { retrieval } : {})
            };
        }).filter(Boolean).sort((left, right) => right.score - left.score ||
            String(left.memory.sourceKey).localeCompare(String(right.memory.sourceKey)) ||
            String(left.memory.id).localeCompare(String(right.memory.id)));
        return {
            stored: memories.length,
            eligible: eligible.length,
            queryTerms,
            selected: eligible.slice(0, Math.max(0, Number.isInteger(context.maxEntries) ? context.maxEntries : 4))
        };
    };
    // A label stored on prose is not evidence. Only raw-record projection below
    // can issue verified facts; legacy/source labels never upgrade a summary.
    const projectMemoryAuthority = (memory) => ({
        authority: memory?.authority === 'GENERATED_NARRATIVE' ? 'GENERATED_NARRATIVE' : 'INTERPRETATION',
        verification: 'UNVERIFIED'
    });
    const formatEpisodicMemoryEntry = (memory, { authorityBoundary = false } = {}) => {
        const date = String(memory?.eventAt || '').slice(0, 10) || '历史';
        const tags = memory?.tags?.length ? ` · tags: ${memory.tags.join(', ')}` : '';
        const projected = projectMemoryAuthority(memory);
        const label = authorityBoundary ? ` [${projected.authority} / ${projected.verification}; date is record time, not proof of narrated events]` : '';
        return `- [${date}]${label} ${memory?.summary || ''}${tags}`;
    };
    const makeEpisodicMemorySnapshot = (memory) => ({
        id: String(memory?.id || ''), sourceKey: String(memory?.sourceKey || ''),
        eventAt: String(memory?.eventAt || ''), summary: String(memory?.summary || ''),
        ...projectMemoryAuthority(memory),
        ...(memory?.sourceRecordId ? { sourceRecordId: memory.sourceRecordId } : {}),
        tags: Array.isArray(memory?.tags) ? [...memory.tags] : []
    });
    const buildEpisodicMemoryContext = (cat, context = {}) => {
        const result = retrieveRelevantMemories(cat, context);
        const header = typeof context.header === 'string' ? context.header : '[OWNER EPISODIC MEMORIES · PRIVATE]';
        const maxChars = Number.isFinite(context.maxChars) ? Math.max(0, context.maxChars) : 2400;
        const lines = [header];
        let length = lines[0].length;
        const included = [];
        result.selected.forEach(entry => {
            const memory = entry.memory;
            const line = formatEpisodicMemoryEntry(memory, context);
            if (length + line.length + 1 > maxChars) return;
            lines.push(line);
            length += line.length + 1;
            included.push(entry);
        });
        return {
            text: included.length ? lines.join('\n') : '',
            snapshots: included.map(entry => makeEpisodicMemorySnapshot(entry.memory)),
            result: { ...result, selected: included }
        };
    };

    const HISTORY_BOUNDARY_VERSION = 'homepage-history-opt-in-v2';
    const classifyHistoricalIntent = (message, { dayKey = '', previousDayKey = '' } = {}) => {
        const text = String(message || '').normalize('NFKC').toLowerCase();
        // ponytail: explicit language patterns cover this v1, not arbitrary
        // semantic inference. Extend with a reproduced missed historical query.
        const pastTime = /以前|之前|过去|曾经|昨天|前天|上次|上周|上个月|去年|那次|当时|第一次|首次|最初|\d{4}[-年]\d{1,2}[-月]\d{1,2}/.test(text);
        const historical = /(?:什么时候|何时).*(?:开始|喜欢|好感|爱|说|聊|谈|见|送|给|用|喂|做|发生|变|专注|任务|片段)/.test(text)
            || /(?:记得|记不记得|回忆).*(?:说过|聊过|谈过|做过|发生过|送过|用过|去过|那次|昨天|第一次.*(?:聊|见)|我们.*(?:去|聊|见|做))/.test(text)
            || pastTime && /发生了什么|做(?:了)?什么|说(?:了|过)什么|聊(?:了|过)什么|为什么|为何/.test(text)
            || /(?:说过|聊过|谈过|做过|发生过|送过|用过|去过).*(?:吗|么|？|\?)/.test(text)
            || /\b(?:when did|when was|what happened|why were|why did)\b/.test(text)
            || /\b(?:remember|recollect)\b.*\b(?:when|said|told|we|yesterday|last|first|talked|gave|went)\b/.test(text);
        const unsupported = /为什么|为何|最初|第一次|首次|\b(?:why|first|cause)\b|(?:开始|起初|何时|什么时候).*(?:喜欢|好感|爱)|(?:喜欢|好感|爱).*(?:开始|起初)|(?:start|began|begin).*(?:liking|loving|feelings)/i.test(text);
        const kind = /说过|聊|谈|对话|消息|告诉|\b(?:said|say|told|talk|conversation|message)\b/i.test(text) ? 'chat'
            : /物品|送|给过|使用|用过|喂|\b(?:item|gift|gave|fed)\b/i.test(text) ? 'item'
            : /专注|任务|\b(?:focus|task)\b/i.test(text) ? 'focus'
            : /片段|心事|\b(?:moment)\b/i.test(text) ? 'moment'
            : /发生了什么|做了什么|\bwhat happened\b/i.test(text) ? 'any' : null;
        const date = text.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
        const requestedDay = date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`
            : /昨天|\byesterday\b/.test(text) ? previousDayKey : /今天|\btoday\b/.test(text) ? dayKey : '';
        const topic = kind === 'chat' ? text
            .replace(/\d{4}[-年]\d{1,2}[-月]\d{1,2}日?/g, '')
            .replace(/什么时候|记不记得|发生了什么|记得|说过|聊过|谈过|告诉|对话|消息|聊天|昨天|今天|上次|过去|以前|之前|曾经|何时|什么|我们|你|我|还|吗|呢|了|的|关于|一起/g, '')
            .replace(/\b(?:do|did|you|we|i|me|us|our|when|what|remember|recollect|said|say|told|talk|talked|about|conversation|message|yesterday|today|last|time|ever)\b/g, '')
            .replace(/[\s\p{P}]+/gu, '') : '';
        return Object.freeze({ historical, unsupported: unsupported || /前天|上周|上个月|去年|\b(?:ago|last week|last month|last year)\b/.test(text), kind, dayKey: requestedDay, topic });
    };
    const buildHistoricalEvidenceBundle = (cat, { query = '', interactions = cat?.todayInteractions || [],
        focusReports = [], momentRecords = [], excludeRecordId = '', dayKey = '', previousDayKey = '' } = {}) => {
        const ownerId = String(cat?.id || '');
        const intent = classifyHistoricalIntent(query, { dayKey, previousDayKey });
        const candidates = [];
        const add = (source, recordId, at, kind, fields, recordDay = '') => {
            if (!ownerId || typeof recordId !== 'string' || !recordId.trim() || recordId.length > 180 ||
                recordId === excludeRecordId || !parseEpisodicTimestamp(at)) return;
            candidates.push({ id: `${source}:${recordId}`, recordId, residentId: ownerId, authority: 'HISTORICAL_FACT',
                kind, at: new Date(at).toISOString(), dayKey: recordDay || dependencies.getOperationalDayKey(new Date(at)), ...fields });
        };
        interactions.forEach(record => {
            if (!record || record.residentId && String(record.residentId) !== ownerId) return;
            if (record.source === 'detail-chat' && ['chat-user', 'chat-reply'].includes(record.type)) {
                const fields = { type: record.type };
                // The raw user utterance proves only that it was said. Never
                // extract event assertions from either speaker's generated prose.
                if (record.type === 'chat-user' && typeof record.content === 'string') {
                    fields.userStatement = record.content.slice(0, 400);
                    fields.statementTruncated = record.content.length > 400;
                }
                add('interaction', record.id, record.at, 'chat', fields, record.dateKey);
            } else if (record.type === 'item' && ['item-interaction', 'food-interaction'].includes(record.source) && record.itemId != null) {
                const fields = { type: 'item', itemId: String(record.itemId).slice(0, 180) };
                if (typeof record.itemName === 'string') fields.itemName = record.itemName.slice(0, 100);
                if (record.reactionAuthority === 'program-semantic' && Number.isFinite(record.affinityDelta))
                    fields.affinityDelta = record.affinityDelta;
                add('interaction', record.id, record.at, 'item', fields, record.dateKey);
            }
        });
        focusReports.forEach(record => {
            if (!record?.participants?.some(p => String(p.id) === ownerId) ||
                !['COMPLETED', 'FAILED'].includes(record.status) || !Number.isFinite(record.duration) || record.duration < 0) return;
            const fields = { type: 'focus-settlement', duration: record.duration, status: record.status };
            if (Number.isFinite(record.affinityDelta)) fields.affinityDelta = record.affinityDelta;
            add('focus', record.id, record.archivedAt, 'focus', fields);
        });
        momentRecords.forEach(record => {
            if (!record?.participantIds?.includes(ownerId) || !['thought', 'social', 'userInteraction'].includes(record.type)) return;
            add('moment', record.recordId, record.at, 'moment', { type: record.type }, record.dayKey);
        });
        const grouped = new Map();
        candidates.forEach(entry => {
            const prior = grouped.get(entry.id);
            // Conflicting copies of a record cannot both be trusted.
            grouped.set(entry.id, prior === undefined ? entry : JSON.stringify(prior) === JSON.stringify(entry) ? prior : null);
        });
        const ranked = [...grouped.values()].filter(Boolean).map(entry => ({ entry,
            score: (intent.kind === entry.kind ? 20 : 0) + (intent.dayKey && intent.dayKey === entry.dayKey ? 30 : 0) +
                (hasMeaningfulMemoryOverlap(query, entry.userStatement || entry.itemName || '') ? 10 : 0)
        })).sort((a, b) => b.score - a.score || b.entry.at.localeCompare(a.entry.at) || a.entry.id.localeCompare(b.entry.id));
        const note = 'Bounded surviving records only; not a complete lifetime archive. Earliest included record is not the first occurrence. User quotations prove statements, not the events asserted in them.';
        const lines = ['[FACTUAL EVIDENCE]', note];
        const statements = [];
        const entries = [];
        let length = lines.join('\n').length + '[USER STATEMENTS]'.length + 2;
        ranked.forEach(({ entry }) => {
            if (entries.length >= 12) return;
            const { userStatement, statementTruncated, ...fact } = entry;
            const factLine = JSON.stringify(fact);
            const statementLine = userStatement === undefined ? '' : JSON.stringify({ evidenceId: entry.id,
                authority: 'USER_STATEMENT', text: userStatement, truncated: statementTruncated });
            if (length + factLine.length + statementLine.length + 2 > 3600) return;
            entries.push(Object.freeze(entry));
            lines.push(factLine);
            if (statementLine) statements.push(statementLine);
            length += factLine.length + statementLine.length + 2;
        });
        const text = [...lines, '[USER STATEMENTS]', ...statements].join('\n');
        return Object.freeze({ ownerId, intent, entries: Object.freeze(entries), text,
            fingerprint: stableMemoryHash(JSON.stringify([HISTORY_BOUNDARY_VERSION, ownerId, intent, entries])) });
    };
    const validateHistoryGrounding = (grounding, bundle) => {
        if (!grounding || typeof grounding !== 'object' || Array.isArray(grounding) ||
            !['not_historical', 'supported', 'insufficient_evidence'].includes(grounding.mode) ||
            !Array.isArray(grounding.evidenceIds) || grounding.evidenceIds.some(id => typeof id !== 'string') ||
            new Set(grounding.evidenceIds).size !== grounding.evidenceIds.length) return 'Invalid historyGrounding contract.';
        if (grounding.mode !== 'supported') {
            if (grounding.evidenceIds.length) return 'Only supported history may cite evidence.';
            if (bundle.intent.historical && grounding.mode === 'not_historical') return 'Historical question requires grounding.';
            return true;
        }
        if (!grounding.evidenceIds.length || !bundle.intent.historical || bundle.intent.unsupported || !bundle.intent.kind)
            return 'This historical question has no supported event projection.';
        for (const id of grounding.evidenceIds) {
            const entry = bundle.entries.find(record => record.id === id);
            if (!entry || entry.residentId !== bundle.ownerId || entry.authority !== 'HISTORICAL_FACT' ||
                bundle.intent.kind !== 'any' && entry.kind !== bundle.intent.kind ||
                bundle.intent.dayKey && entry.dayKey !== bundle.intent.dayKey ||
                bundle.intent.topic && !hasMeaningfulMemoryOverlap(bundle.intent.topic, entry.userStatement || ''))
                return 'Historical evidence is absent or does not support this event type/day/topic.';
        }
        return true;
    };
    const validateHistoricalResponse = (active, bundle) => {
        const grounding = validateHistoryGrounding(active.historyGrounding, bundle);
        if (grounding !== true) return grounding;
        if (active.historyGrounding.mode === 'insufficient_evidence') {
            const reply = String(active.reply || '');
            const uncertain = /说不出|说不准|说不清|记不清|想不起|不记得|不确定|不知道|(?:无法|不能|没法).{0,24}(?:确认|确定|指认|判断)|没有.{0,12}(?:记录|证据)|\b(?:not sure|cannot identify|can't identify|don't remember)\b/i;
            const concretePast = /那次|那天|那一年|某一天|某次|有一次|有一回|当时你|我记得你|上次你|昨天你|前天你|就是.{0,12}(?:的时候|那一刻)|\d{4}[-年]\d{1,2}[-月]\d{1,2}/;
            if (!uncertain.test(reply)) return 'Historical answer must acknowledge insufficient evidence.';
            if (concretePast.test(reply + String(active.innerVoice || ''))) return 'Historical answer invents a concrete past scene without evidence.';
        }
        return true;
    };
    // Only a rejected/failed historical request uses this local fallback.
    const makeHistoricalFallback = ({ form, status, posture }) => ({
        reply: form === 'CAT' ? '它留在原处，安静听着。可靠记录不足以确认那个具体时刻或经过，不能把猜测当作回忆。'
            : '我没法从可靠的记录里确认那个具体时刻或经过，不想拿猜出来的场景当作回忆。',
        status, posture, innerVoice: '【我只把能确认的记录当作往事。】',
        userStatus: '询问历史记录', memoryCandidate: null,
        historyGrounding: { mode: 'insufficient_evidence', evidenceIds: [] }
    });

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
    const eyeColorFor = cat => Meeow.adoptionDrafts?.residentEyeColorDisplay(cat) || cat?.eyeColor || '未设定';
    const breedFor = cat => Meeow.catBreeds?.getResidentBreedDisplay(cat) || cat?.breed || '未设定';
    const buildCatIdentityBlock = (cat) => {
        const halls = dependencies.getHalls();
        const currentHall = dependencies.getCurrentHall();
        const hall = halls.find(item => item.id === cat?.hallId) || currentHall;
        return `[IMMUTABLE CHARACTER IDENTITY]
- Name: ${getResidentPublicName(cat)}; Hall: ${hall?.name || 'Meeow House'}
- Canon personality / stored prompt: ${cat?.prompt || cat?.personality || '以原作设定为准'}
- Fixed cat breed: ${breedFor(cat)}; fixed eye color: ${eyeColorFor(cat)}.
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
        homepage: { interactions: 8, interactionChars: 180, monitoring: 8, monitorChars: 160, diaries: 3, diaryChars: 260, focus: 2, focusChars: 220, travel: 2, travelChars: 200, briefingChars: 260 },
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
        const isHomepageProjection = profileName === 'homepage';
        const interactions = (cat.todayInteractions || []).map(entry => `[${entry.time || '历史'} · ${entry.type || '互动'}] ${cleanText(entry.content || '')}`);
        const monitoring = getRecentMonitorEntries(cat, profile.monitoring);
        const diaries = getPermanentDiaryEntries(cat, profile.diaries);
        const focus = getCatFocusReports(cat, profile.focus);
        const travelogues = (cat.travelogues || []).map(entry => `[${entry.date || '历史'} · ${entry.location || '外出'}] ${cleanText(entry.content || '')}`);
        const briefing = getLatestHouseBriefing();
        const activeMetadata = isHomepageProjection ? '' : `- ${buildCatIdentityBlock(cat)}
- Hall: ${hall?.name || 'Meeow House'} · Guardian: ${hall?.guardian || '未指定'}
- Date context: ${dependencies.getDateContext()}
- ${dependencies.buildOwnerDailyContext(profileName)}
- Closeness / affinity: ${cat.affinity || 0}/100
- Current status: ${truncateMemoryText(cat.status || '未知', 180)}
`;
        return `
[${isHomepageProjection ? 'HOMEPAGE CONTINUITY · REQUIRED' : 'CHARACTER MEMORY · REQUIRED'}]
${activeMetadata}${isHomepageProjection ? `- Date context: ${dependencies.getDateContext()}
` : ''}
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
    // Lean contexts are intentionally separate from the broad historical
    // continuity package above. Ambient callers may safely share only
    // observable, current state; private thoughts and relationship-to-USER
    // data never enter a multi-resident request through this builder.
    const LEAN_RESIDENT_CONTEXT_LIMITS = Object.freeze({
        ambient: 900,
        foregroundSupplemental: 900
    });
    const buildWholeFieldContext = (header, fields, maxChars) => {
        const lines = [header];
        let length = header.length;
        (Array.isArray(fields) ? fields : []).forEach(field => {
            const label = cleanText(field?.label || '');
            const value = cleanText(field?.value || '');
            if (!label || !value) return;
            const line = `- ${label}: ${value}`;
            if (length + line.length + 1 > maxChars) return;
            lines.push(line);
            length += line.length + 1;
        });
        return lines.join('\n');
    };
    const getLeanHall = (cat) => {
        const halls = dependencies.getHalls();
        const currentHall = dependencies.getCurrentHall();
        return halls.find(item => item.id === cat?.hallId) || currentHall;
    };
    const getLeanForm = (cat, value) => {
        const form = String(value || getResidentForm(cat) || 'CAT').trim().toUpperCase();
        return form === 'HUMAN' ? 'HUMAN' : 'CAT';
    };
    const buildAmbientResidentContext = (cat, options = {}) => {
        const hall = getLeanHall(cat);
        const publicRelationshipLines = [...new Set((Array.isArray(options.publicRelationshipLines)
            ? options.publicRelationshipLines : []).map(value => cleanText(value)).filter(Boolean))];
        return buildWholeFieldContext('[AMBIENT RESIDENT · SHARED CURRENT STATE]', [
            { label: 'ID', value: String(cat?.id || '') },
            { label: 'Name', value: getResidentPublicName(cat) },
            { label: 'Hall', value: options.hallName || hall?.name || 'Meeow House' },
            { label: 'Physical presence', value: options.presence || (cat?.isOut ? 'AWAY' : 'HALL') },
            { label: 'Authoritative form', value: getLeanForm(cat, options.form) },
            { label: 'Stored personality traits', value: cat?.personality || '' },
            // `status` is an observable presentation field. Never add
            // innerVoice here: it is private even when stored beside status.
            { label: 'Observable current status', value: options.status === undefined ? (cat?.status || '') : options.status },
            ...publicRelationshipLines.map(value => ({ label: 'Public/shared peer baseline', value }))
        ], LEAN_RESIDENT_CONTEXT_LIMITS.ambient);
    };
    const buildForegroundLeanResidentContextParts = (cat, options = {}) => {
        const hall = getLeanHall(cat);
        const stateFields = [
            { label: 'Physical presence', value: options.presence || (cat?.isOut ? 'AWAY' : 'HALL') },
            { label: 'Hall', value: options.hallName || hall?.name || 'Meeow House' },
            { label: 'Authoritative form', value: getLeanForm(cat, options.form) },
            { label: 'Current status', value: options.status === undefined ? (cat?.status || '') : options.status },
            { label: 'Current inner voice', value: options.innerVoice === undefined ? (cat?.innerVoice || '') : options.innerVoice }
        ];
        const relationshipField = { label: 'USER relationship baseline', value: options.userRelationship || '' };
        const header = '[CURRENT SINGLE-RESIDENT STATE]';
        const lines = [header];
        const currentStateLines = [header];
        let relationship = '';
        let length = header.length;
        [...stateFields, relationshipField].forEach(field => {
            const label = cleanText(field?.label || '');
            const value = cleanText(field?.value || '');
            if (!label || !value) return;
            const line = `- ${label}: ${value}`;
            if (length + line.length + 1 > LEAN_RESIDENT_CONTEXT_LIMITS.foregroundSupplemental) return;
            lines.push(line);
            length += line.length + 1;
            if (label === relationshipField.label) relationship = line;
            else currentStateLines.push(line);
        });
        const canon = buildCatIdentityBlock(cat);
        const currentState = currentStateLines.join('\n');
        const supplemental = lines.join('\n');
        return {
            canon,
            currentState,
            relationship,
            text: `${canon}\n${supplemental}`
        };
    };
    const buildForegroundLeanResidentContext = (cat, options = {}) =>
        buildForegroundLeanResidentContextParts(cat, options).text;
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
Breed: ${truncateMemoryText(breedFor(cat), 32)}; Eyes: ${truncateMemoryText(eyeColorFor(cat), 22)}
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
        LEAN_RESIDENT_CONTEXT_LIMITS,
        buildAmbientResidentContext,
        buildForegroundLeanResidentContext,
        buildForegroundLeanResidentContextParts,
        buildStatusSyncCatContext,
        normalizeEpisodicMemories,
        getEpisodicMemories,
        hasEpisodicMemorySource,
        appendEpisodicMemory,
        EPISODIC_RETRIEVAL_LIMITS,
        MEMORY_AUTHORITIES,
        projectMemoryAuthority,
        HISTORY_BOUNDARY_VERSION,
        classifyHistoricalIntent,
        buildHistoricalEvidenceBundle,
        validateHistoryGrounding,
        validateHistoricalResponse,
        makeHistoricalFallback,
        USER_SHARED_EPISODIC_SOURCE_TYPES,
        getMeaningfulMemoryTerms,
        hasMeaningfulMemoryOverlap,
        retrieveRelevantMemories,
        buildEpisodicMemoryContext,
        formatEpisodicMemoryEntry,
        makeEpisodicMemorySnapshot,
        getEpisodicRetrievalMetadata
    });
}(window));
