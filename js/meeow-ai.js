(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const ai = Meeow.ai = Meeow.ai || {};

    let dependencies = null;
    const apiRequestQueue = [];
    const cancelledApiBatches = new Set();
    const apiRequestDedupe = new Map();
    let isProcessingApiQueue = false;
    let activeApiRequest = null;
    let apiRequestSequence = 0;

    ai.configure = (nextDependencies) => {
        dependencies = nextDependencies;
    };

class AIRequestCancelledError extends Error {
    constructor(message = '用户已停止本次 AI 请求') {
        super(message);
        this.name = 'AIRequestCancelledError';
        this.code = 'AI_REQUEST_CANCELLED';
    }
}

class AIRequestPreemptedError extends Error {
    constructor(message = '后台 AI 请求已让位给前台操作') {
        super(message);
        this.name = 'AIRequestPreemptedError';
        this.code = 'AI_REQUEST_PREEMPTED';
    }
}

const getReadableAPIError = (rawError) => {
    const message = String(rawError?.message || rawError || '未知错误').trim();
    return message.length > 1200 ? `${message.slice(0, 1200)}…` : message;
};

const DEFAULT_PROVIDER_TIMEOUT_MS = 40000;
const ZHIPU_PROVIDER_TIMEOUT_MS = 120000;
const ZHIPU_GLM_CHAT_MODEL = /^glm-4(?:\.\d+(?:\.\d+)?)?(?:-(?:flash|air|plus|long|alltools|assistant))?$/i;

// Official Zhipu traffic must be identified from the parsed hostname. Do not
// apply BigModel-only fields to an unrelated OpenAI-compatible relay.
const getOpenAICompatibleProviderPolicy = (baseUrl, modelName) => {
    let hostname = '';
    try { hostname = new URL(baseUrl).hostname.toLowerCase(); } catch (e) { }
    const isOfficialZhipu = hostname === 'open.bigmodel.cn';
    return {
        hostname,
        isOfficialZhipu,
        disableThinking: isOfficialZhipu && ZHIPU_GLM_CHAT_MODEL.test(String(modelName || '').trim()),
        timeoutMs: isOfficialZhipu ? ZHIPU_PROVIDER_TIMEOUT_MS : DEFAULT_PROVIDER_TIMEOUT_MS
    };
};

const formatProviderError = (status, errorData, fallback = '') => {
    const error = errorData?.error && typeof errorData.error === 'object' ? errorData.error : errorData;
    const code = error?.code ?? errorData?.code;
    const message = error?.message || errorData?.message || fallback || '未知上游错误';
    const codeSuffix = code === undefined || code === null || String(code).trim() === ''
        ? '' : ` [provider code ${String(code)}]`;
    return status ? `HTTP ${status}${codeSuffix}: ${message}` : `API error${codeSuffix}: ${message}`;
};

// Only reject text that is structurally an upstream/proxy failure.
// Ordinary roleplay text mentioning an "error" is not treated as a failure.
const assertValidAIContent = (content) => {
    const normalized = String(content || '').trim();
    if (!normalized) throw new Error('AI 未返回有效内容，请检查模型名称是否正确。');

    const errorLike = [
        /^(?:\[?\s*)?(?:error|api\s*error|request\s*failed|failed|服务(?:器)?错误|请求失败|调用(?:接口|\s*api)?失败|网络(?:请求)?失败)\b/i,
        /\b(?:http(?:\s*status)?|status|error\s*code|code)\s*[:#=\-]?\s*(?:[45]\d{2}|10\d{2,3})\b/i,
        /\b(?:rate\s*limit|too\s*many\s*requests|service\s*unavailable|bad\s*gateway|gateway\s*timeout|internal\s*server\s*error|cloudflare|cf-ray|access\s*denied)\b/i,
        /^(?:<!doctype\s+html|<html[\s>])/i
    ];
    const looksLikeTransportError = normalized.length <= 1600 && errorLike.some(pattern => pattern.test(normalized));
    if (looksLikeTransportError) {
        throw new Error(`上游服务返回了错误文本：${normalized.slice(0, 500)}`);
    }
    return normalized;
};

// 单次原始请求（不含重试）
const _doSingleAPICall = async (prompt, systemPrompt, maxTokens, thinkingLevel, onProgress = null, request = null) => {
    const apiKey = (dependencies.getSettings().apiKey || "").trim();
    let baseUrl = (dependencies.getSettings().baseUrl || "").trim();

    if (!apiKey) {
        dependencies.showToast("连接失败: 缺少 API 密钥", "error");
        throw new Error("No API Key");
    }

    if (baseUrl && baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    baseUrl = baseUrl.trim();
    if (baseUrl && !baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
    }

    const modelName = dependencies.getSettings().model || "gemini-3-flash-preview";

    let url, payload, headers;
    const providerPolicy = baseUrl
        ? getOpenAICompatibleProviderPolicy(baseUrl, modelName)
        : { hostname: '', isOfficialZhipu: false, disableThinking: false, timeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS };

    if (baseUrl) {
        // --- 模式 B: OpenAI 兼容模式 (适配中转站) ---
        url = `${baseUrl}/chat/completions`;
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        payload = {
            model: modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            // A few structured foreground tasks benefit from a lower
            // temperature.  Keeping this per-request avoids changing
            // the user's normal chat / roleplay setting globally.
            temperature: Number.isFinite(request?.temperature) ? request.temperature : dependencies.getSettings().temperature,
            max_tokens: maxTokens
        };
        if (providerPolicy.disableThinking) payload.thinking = { type: 'disabled' };
    } else {
        // --- 模式 A: Google 官方模式 ---
        url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        headers = { 'Content-Type': 'application/json' };
        payload = {
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                temperature: Number.isFinite(request?.temperature) ? request.temperature : dependencies.getSettings().temperature,
                maxOutputTokens: maxTokens,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
            ]
        };
        if (thinkingLevel && modelName.includes("gemini-3")) {
            payload.generationConfig.thinkingConfig = {
                thinkingLevel: thinkingLevel,
                includeProcess: thinkingLevel === dependencies.ThinkingLevel.HIGH
            };
        }
    }

    const serializedPayload = JSON.stringify(payload);
    if (request) {
        request.payloadBytes = new TextEncoder().encode(serializedPayload).length;
        request.attemptStartedAt = Date.now();
        request.timeoutMs = providerPolicy.timeoutMs;
        let endpointHost = 'unknown-host';
        try { endpointHost = new URL(url).host || endpointHost; } catch (e) { }
        request.transportInfo = `${baseUrl ? (providerPolicy.isOfficialZhipu ? 'Zhipu direct OpenAI-compatible' : 'OpenAI-compatible relay') : 'Google direct'} · ${endpointHost} · ${modelName} · timeout=${providerPolicy.timeoutMs / 1000}s`;
        dependencies.addLog(`API REQUEST #${request.id} DISPATCH ${request.label}; ${request.transportInfo}; input=${request.guardedInputChars || request.inputChars || 0} chars, payload=${Math.ceil(request.payloadBytes / 1024)} KB, queue=${(request.queueWaitMs / 1000).toFixed(1)}s.`, 'info');
    }
    const controller = new AbortController();
    if (request) request.abortController = controller;
    if (request?.preempted) throw new AIRequestPreemptedError();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, providerPolicy.timeoutMs);
    let response;
    try {
        onProgress?.({ stage: 'connecting' });
        onProgress?.({ stage: 'waiting' });
        response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: serializedPayload,
            signal: controller.signal
        });
    } catch (err) {
        if (request?.preempted) {
            throw new AIRequestPreemptedError();
        }
        if (request?.cancelled || cancelledApiBatches.has(request?.batchId)) {
            throw new AIRequestCancelledError();
        }
        if (request) request.lastWaitMs = Date.now() - (request.attemptStartedAt || Date.now());
        if (timedOut || err?.name === 'AbortError') {
            throw new Error(`请求超时：等待反代或模型响应超过 ${providerPolicy.timeoutMs / 1000} 秒。`);
        }
        const errorMsg = `网络请求失败: ${err.message}。可能是由于 CORS 跨域限制、反代地址无效或网络连接中断。请确保反代地址以 https:// 开头。`;
        dependencies.addLog(`FETCH ERROR: ${err.message} (Target: ${url})`, "error");
        throw new Error(errorMsg);
    } finally {
        window.clearTimeout(timeoutId);
        if (request?.abortController === controller) request.abortController = null;
    }
    if (request) {
        request.lastWaitMs = Date.now() - (request.attemptStartedAt || Date.now());
        dependencies.addLog(`API REQUEST #${request.id} RESPONSE HEADERS after ${(request.lastWaitMs / 1000).toFixed(1)}s; HTTP ${response.status}.`, 'info');
    }
    onProgress?.({ stage: 'received' });

    // --- 检测 HTTP 状态码错误（包括403）---
    if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try { errorData = JSON.parse(errorText); } catch (e) { }
        throw new Error(formatProviderError(response.status, errorData, errorText));
    }

    let result;
    try {
        result = await response.json();
    } catch (error) {
        throw new Error(`API 返回了无法解析的 JSON：${error.message}`);
    }

    if (request) {
        const openAIChoice = result?.choices?.[0];
        const googleCandidate = result?.candidates?.[0];
        const usage = result?.usage || result?.usageMetadata || null;
        const finishReason = openAIChoice?.finish_reason ?? googleCandidate?.finishReason ?? 'unavailable';
        const usageSummary = usage
            ? [
                `prompt=${usage.prompt_tokens ?? usage.promptTokenCount ?? '—'}`,
                `completion=${usage.completion_tokens ?? usage.candidatesTokenCount ?? '—'}`,
                `total=${usage.total_tokens ?? usage.totalTokenCount ?? '—'}`
            ].join(', ')
            : 'unavailable';
        dependencies.addLog(`API REQUEST #${request.id} RESPONSE META: finish_reason=${finishReason}; usage=${usageSummary}.`, 'info');
    }
    let content = "";

    if (baseUrl) {
        // --- 检测响应体中的错误字段 ---
        if (result.error) {
            throw new Error(formatProviderError(null, result.error, JSON.stringify(result.error)));
        }
        if (result.choices && result.choices.length > 0) {
            content = result.choices[0].message?.content || "";
        }
    } else {
        if (result.promptFeedback && result.promptFeedback.blockReason) {
            throw new Error(`提示词被拦截 (原因: ${result.promptFeedback.blockReason})`);
        }
        if (result.error) {
            throw new Error(formatProviderError(null, result.error, JSON.stringify(result.error)));
        }
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.finishReason === 'SAFETY') {
                throw new Error("内容因安全策略被拦截");
            }
            if (candidate.content && candidate.content.parts) {
                content = candidate.content.parts.map(p => p.text).join("");
            }
        }
    }

    return assertValidAIContent(content);
};

const isConfigurationOrRouteError = (error) => {
    const message = getReadableAPIError(error);
    return /No API Key|缺少\s*API\s*密钥|HTTP\s*404\b|not found|反代地址无效/i.test(message);
};

const _waitForRetryDecision = (request, lastError, attemptsUsed = 5, immediateDecision = false) => {
    const maxAttempts = request.effectiveMaxAttempts || 5;
    return new Promise((resolve) => {
        request.resolveRetryDecision = resolve;
        dependencies.apiRetryModal.requestId = request.id;
        dependencies.apiRetryModal.operationLabel = request.label;
        dependencies.apiRetryModal.round = request.round;
        dependencies.apiRetryModal.attempt = attemptsUsed;
        dependencies.apiRetryModal.errorMessage = immediateDecision
            ? `当前连接配置或反代路由无法使用，已停止自动重试。\n\n错误详情：\n${getReadableAPIError(lastError)}\n\n请确认 API 密钥和反代地址后，再决定是否重新尝试。`
            : `连续 ${attemptsUsed} 次请求均失败。\n\n最后一次错误：\n${getReadableAPIError(lastError)}\n\n你可以停止本次请求，或明确再开启一轮 ${maxAttempts} 次尝试。`;
        const payloadInfo = request.payloadBytes ? `${Math.ceil(request.payloadBytes / 1024)} KB` : '尚未发送';
        const waitInfo = request.lastWaitMs ? `${(request.lastWaitMs / 1000).toFixed(1)} 秒` : '—';
        const queueInfo = request.queueWaitMs ? `${(request.queueWaitMs / 1000).toFixed(1)} 秒` : '0.0 秒';
        dependencies.apiRetryModal.diagnostics = `${request.transportInfo || '传输信息尚未取得'}\n请求 #${request.id} · 输入 ${request.guardedInputChars || request.inputChars || 0} 字符 · 请求体 ${payloadInfo}\n队列等待 ${queueInfo} · 最近一次响应等待 ${waitInfo}`;
        dependencies.apiRetryModal.waitInfo = immediateDecision
            ? '此类配置或 404 错误不会自动空转；停止后可进入终端检查连接设置。'
            : /超时/.test(getReadableAPIError(lastError))
            ? `本轮最后一次请求已等待 ${(request.timeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS) / 1000} 秒后中止；不会继续在后台挂起。`
            : `本轮 ${maxAttempts} 次尝试均已结束；选择“继续重试”才会开始新的 ${maxAttempts} 次。`;
        dependencies.apiRetryModal.isDeciding = false;
        dependencies.apiRetryModal.show = true;
    });
};

const resolveApiRetryDecision = (decision) => {
    const request = activeApiRequest;
    if (!request || !dependencies.apiRetryModal.show || dependencies.apiRetryModal.isDeciding ||
        request.id !== dependencies.apiRetryModal.requestId || !request.resolveRetryDecision) return;

    dependencies.apiRetryModal.isDeciding = true;
    const resolve = request.resolveRetryDecision;
    request.resolveRetryDecision = null;
    dependencies.apiRetryModal.show = false;

    if (decision === 'abort') {
        request.cancelled = true;
        if (request.cancelBatchOnAbort) cancelledApiBatches.add(request.batchId);
        dependencies.addLog(`API REQUEST #${request.id} STOPPED BY USER. batch=${request.batchId}`, 'warn');
    } else {
        dependencies.addLog(`API REQUEST #${request.id} USER STARTED ROUND ${request.round + 1}.`, 'warn');
    }
    resolve(decision);
};

const cancelCurrentAIRequest = () => {
    const request = activeApiRequest;
    if (!request) return;
    request.cancelled = true;
    if (request.cancelBatchOnAbort) cancelledApiBatches.add(request.batchId);
    request.abortController?.abort();
    if (request.resolveRetryDecision) {
        const resolve = request.resolveRetryDecision;
        request.resolveRetryDecision = null;
        dependencies.apiRetryModal.show = false;
        resolve('abort');
    }
    dependencies.addLog(`API REQUEST #${request.id} STOPPED FROM LOADING UI. batch=${request.batchId}`, 'warn');
    dependencies.showToast('已停止当前请求；未完成内容不会写入。', 'info');
};

const _runAIRequest = async (request) => {
    const maxAttempts = Number.isInteger(request.maxAttempts)
        ? Math.max(1, request.maxAttempts)
        : 5;
    request.effectiveMaxAttempts = maxAttempts;
    const guardedSystemPrompt = `${request.systemPrompt || ''}\n${dependencies.getCanonFidelityGuardrail()}`;
    // Background work (status sync, wording polish, phone photo)
    // must not overwrite a user-facing notification such as a new
    // friend request. Its progress remains visible in the system log.
    if (request.priority !== 'background') dependencies.showToast('正在建立加密通道...', 'loading');
    request.guardedInputChars = String(request.prompt || '').length + String(guardedSystemPrompt || '').length;
    dependencies.addLog(`API REQUEST #${request.id} QUEUED: ${request.label}; model=${dependencies.getSettings().model || 'default'} maxTokens=${request.maxTokens}; input=${request.guardedInputChars} chars; attempts=${maxAttempts}.`);
    request.onProgress?.({ stage: 'queued', requestId: request.id, label: request.label, attempt: 0, round: request.round });

    while (!request.cancelled && !request.preempted && !cancelledApiBatches.has(request.batchId)) {
        request.round += 1;
        let lastError = null;
        let attemptsUsed = 0;
        let immediateDecision = false;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            attemptsUsed = attempt;
            if (request.preempted) throw new AIRequestPreemptedError();
            if (request.cancelled || cancelledApiBatches.has(request.batchId)) throw new AIRequestCancelledError();
            try {
                if (attempt > 1) {
                    dependencies.addLog(`API REQUEST #${request.id} RETRY ${attempt}/${maxAttempts} (round ${request.round})...`, 'warn');
                    if (request.priority !== 'background') dependencies.showToast(`🔄 重试中 (${attempt}/${maxAttempts})...`, "loading");
                    request.onProgress?.({ stage: 'retrying', requestId: request.id, label: request.label, attempt, round: request.round });
                    await new Promise(r => setTimeout(r, 800 * attempt));
                    if (request.preempted) throw new AIRequestPreemptedError();
                }

                request.onProgress?.({ stage: attempt > 1 ? 'retrying' : 'connecting', requestId: request.id, label: request.label, attempt, round: request.round });
                const content = await _doSingleAPICall(request.prompt, guardedSystemPrompt, request.maxTokens, request.thinkingLevel, (event) => {
                    request.onProgress?.({ ...event, requestId: request.id, label: request.label, attempt, round: request.round });
                }, request);
                if (request.preempted) throw new AIRequestPreemptedError();
                const validationStartedAt = Date.now();
                request.onProgress?.({ stage: 'validating', requestId: request.id, label: request.label, attempt, round: request.round });
                if (typeof request.validateResponse === 'function') {
                    const validation = request.validateResponse(content);
                    if (validation === false) throw new Error('AI 回复未通过内容校验。');
                    if (typeof validation === 'string') throw new Error(validation);
                }
                request.validationMs = Date.now() - validationStartedAt;
                request.onProgress?.({ stage: 'complete', requestId: request.id, label: request.label, attempt, round: request.round });
                if (request.priority !== 'background') dependencies.showToast('数据传输完成', 'success');
                const elapsed = request.startedAt ? ((Date.now() - request.startedAt) / 1000).toFixed(1) : '—';
                dependencies.addLog(`API REQUEST #${request.id} SUCCESS (round ${request.round}, attempt ${attempt}). ${elapsed}s; output=${content.length} chars; validation=${request.validationMs || 0}ms.`, 'sent');
                return content;
            } catch (e) {
                if (e instanceof AIRequestPreemptedError || request.preempted) {
                    throw e instanceof AIRequestPreemptedError ? e : new AIRequestPreemptedError();
                }
                if (e instanceof AIRequestCancelledError) throw e;
                lastError = e;
                request.lastError = getReadableAPIError(e);
                dependencies.addLog(`API REQUEST #${request.id} ATTEMPT ${attempt} FAILED: ${getReadableAPIError(e)}`, 'error');
                console.warn(`[callAI #${request.id}] Attempt ${attempt} failed:`, e.message);
                if (isConfigurationOrRouteError(e)) {
                    immediateDecision = true;
                    dependencies.addLog(`API REQUEST #${request.id} STOPPED AUTO-RETRY: configuration or route error.`, 'warn');
                    break;
                }
            }
        }

        if (request.priority === 'background') {
            dependencies.addLog(`API REQUEST #${request.id} BACKGROUND FAILED AFTER ${attemptsUsed}/${maxAttempts}; releasing queue.`, 'warn');
            throw lastError || new Error('后台请求未返回有效内容。');
        }
        dependencies.addLog(`API REQUEST #${request.id} ${immediateDecision ? 'NEEDS CONFIGURATION DECISION' : `FAILED ${maxAttempts} TIMES`}. Waiting for user decision.`, 'error');
        if (request.priority !== 'background') dependencies.showToast(immediateDecision ? '连接配置或反代路由有误，请查看错误窗口' : `连续 ${maxAttempts} 次请求失败，请查看错误窗口`, "error");
        const decision = await _waitForRetryDecision(request, lastError, attemptsUsed, immediateDecision);
        if (decision !== 'retry' || request.cancelled || cancelledApiBatches.has(request.batchId)) {
            throw new AIRequestCancelledError();
        }
        if (request.priority !== 'background') dependencies.showToast('重新开始重试...', 'loading');
    }
    if (request.preempted) throw new AIRequestPreemptedError();
    throw new AIRequestCancelledError();
};

const _processAIQueue = async () => {
    if (isProcessingApiQueue) return;
    isProcessingApiQueue = true;
    while (apiRequestQueue.length > 0) {
        const request = apiRequestQueue.shift();
        if (request.cancelled || cancelledApiBatches.has(request.batchId)) {
            request.reject(new AIRequestCancelledError('该批次已停止，未执行此请求'));
            continue;
        }
        activeApiRequest = request;
        dependencies.activeAIRequestId.value = request.id;
        request.startedAt = Date.now();
        request.queueWaitMs = Math.max(0, request.startedAt - request.enqueuedAt);
        try {
            request.resolve(await _runAIRequest(request));
        } catch (error) {
            request.reject(error);
        } finally {
            if (dependencies.apiRetryModal.requestId === request.id) dependencies.apiRetryModal.show = false;
            activeApiRequest = null;
            dependencies.activeAIRequestId.value = null;
        }
    }
    isProcessingApiQueue = false;
};

// Public AI entry point. Existing call sites keep the same signature;
// the optional fifth argument supports labels, batches and dedupe keys.
const callAI = (prompt, systemPrompt, maxTokens = 8192, thinkingLevel = null, options = {}) => {
    const dedupeKey = options.dedupeKey || '';
    if (dedupeKey && apiRequestDedupe.has(dedupeKey)) return apiRequestDedupe.get(dedupeKey);

    const request = {
        id: ++apiRequestSequence,
        prompt, systemPrompt, maxTokens, thinkingLevel,
        validateResponse: options.validateResponse || null,
        onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
        label: options.label || 'MEEOW HOUSE AI REQUEST',
        batchId: options.batchId || `single-${Date.now()}-${apiRequestSequence}`,
        cancelBatchOnAbort: options.cancelBatchOnAbort !== false,
        round: 0,
        cancelled: false,
        preempted: false,
        preemptionLogged: false,
        abortController: null,
        priority: options.priority || 'normal',
        maxAttempts: Number.isInteger(options.maxAttempts) ? Math.max(1, options.maxAttempts) : null,
        temperature: Number.isFinite(options.temperature) ? options.temperature : null,
        resolveRetryDecision: null,
        enqueuedAt: Date.now(),
        queueWaitMs: 0,
        inputChars: String(prompt || '').length,
        guardedInputChars: 0,
        payloadBytes: 0,
        lastWaitMs: 0,
        validationMs: 0,
        transportInfo: '',
        resolve: null,
        reject: null
    };
    const promise = new Promise((resolve, reject) => {
        request.resolve = resolve;
        request.reject = reject;
    });
    if (dedupeKey) {
        apiRequestDedupe.set(dedupeKey, promise);
        promise.then(
            () => apiRequestDedupe.delete(dedupeKey),
            () => apiRequestDedupe.delete(dedupeKey)
        );
    }
    const priorityRank = { foreground: 0, normal: 1, background: 2 };
    if (request.priority === 'foreground' && activeApiRequest?.priority === 'background' && !activeApiRequest.preempted) {
        activeApiRequest.preempted = true;
        if (!activeApiRequest.preemptionLogged) {
            activeApiRequest.preemptionLogged = true;
            dependencies.addLog(`API REQUEST #${activeApiRequest.id} BACKGROUND PREEMPTED BY FOREGROUND`, 'warn');
        }
        activeApiRequest.abortController?.abort();
    }
    const insertAt = apiRequestQueue.findIndex(queued => (priorityRank[queued.priority] ?? 1) > (priorityRank[request.priority] ?? 1));
    if (insertAt === -1) apiRequestQueue.push(request);
    else apiRequestQueue.splice(insertAt, 0, request);
    _processAIQueue();
    return promise;
};


    Object.assign(ai, {
        AIRequestCancelledError,
        getReadableAPIError,
        assertValidAIContent,
        resolveApiRetryDecision,
        cancelCurrentAIRequest,
        callAI
    });
}(window));
