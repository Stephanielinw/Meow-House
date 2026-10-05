(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const CANVAS = Object.freeze([112, 104]);
    // No production motion art has been approved. Packs are installed only by a
    // future asset pass; this registry intentionally has no entries.
    const productionBindings = Object.freeze([]);
    const finitePositive = value => Number.isFinite(value) && value > 0;
    const anchorValid = anchor => Array.isArray(anchor) && anchor.length === 2 &&
        anchor.every(Number.isFinite) && anchor[0] >= 0 && anchor[0] < CANVAS[0] &&
        anchor[1] >= 0 && anchor[1] < CANVAS[1];
    const validateBinding = (raw, definitions = Meeow.hallActivities?.definitions || {}) => {
        if (!raw || raw.version !== 1 || typeof raw.id !== 'string' || !raw.id ||
            !definitions[raw.behaviorId]?.postures?.includes(raw.posture) ||
            !['standard', 'chubby', 'fluffy', 'slim'].includes(raw.bodyType) ||
            raw.playback !== 'loop' || !Array.isArray(raw.canvas) ||
            raw.canvas.length !== 2 || raw.canvas.some((value, index) => value !== CANVAS[index]) ||
            !anchorValid(raw.groundAnchor) || !Array.isArray(raw.frames) ||
            raw.frames.length < 2 || raw.frames.length > 32 ||
            raw.frames.some((frame, index) => !frame || frame.index !== index ||
                typeof frame.assetId !== 'string' || !frame.assetId) ||
            new Set(raw.frames.map(frame => frame.assetId)).size !== raw.frames.length ||
            (raw.context != null && (typeof raw.context !== 'object' || Array.isArray(raw.context)))) return null;
        const durations = raw.frameDurationsMs == null
            ? raw.frames.map(() => raw.defaultFrameDurationMs)
            : raw.frameDurationsMs;
        if (!Array.isArray(durations) || durations.length !== raw.frames.length ||
            durations.some(value => !finitePositive(value) || value > 60000) ||
            (raw.frameDurationsMs != null && raw.defaultFrameDurationMs != null)) return null;
        const { defaultFrameDurationMs: _defaultDuration, ...normalized } = raw;
        return Object.freeze({ ...normalized, canvas: Object.freeze([...raw.canvas]),
            groundAnchor: Object.freeze([...raw.groundAnchor]),
            context: Object.freeze({ ...(raw.context || {}) }),
            frames: Object.freeze(raw.frames.map(frame => Object.freeze({ ...frame }))),
            frameDurationsMs: Object.freeze([...durations]),
            cycleDurationMs: durations.reduce((sum, value) => sum + value, 0) });
    };
    const contextMatches = (required, actual) => Object.entries(required).every(([key, value]) =>
        actual?.[key] === value);
    const resolveBinding = ({ behaviorId, posture, bodyType, context = {}, chassisAnchor,
        bindings = productionBindings, definitions = Meeow.hallActivities?.definitions || {} }) => {
        if (!definitions[behaviorId]?.postures?.includes(posture))
            return { binding: null, reason: 'invalid-behavior-posture' };
        const candidates = [];
        for (const raw of bindings) {
            const binding = validateBinding(raw, definitions);
            if (!binding || binding.behaviorId !== behaviorId || binding.posture !== posture ||
                binding.bodyType !== bodyType || !contextMatches(binding.context, context)) continue;
            if (!anchorValid(chassisAnchor) || binding.groundAnchor[0] !== chassisAnchor[0] ||
                binding.groundAnchor[1] !== chassisAnchor[1]) continue;
            candidates.push(binding);
        }
        candidates.sort((a, b) => Object.keys(b.context).length - Object.keys(a.context).length ||
            a.id.localeCompare(b.id));
        return candidates.length ? { binding: candidates[0], reason: null } :
            { binding: null, reason: 'no-compatible-binding' };
    };
    const frameAtElapsed = (binding, elapsedMs) => {
        const elapsed = Math.max(0, elapsedMs) % binding.cycleDurationMs;
        let boundary = 0;
        for (let index = 0; index < binding.frames.length; index += 1) {
            boundary += binding.frameDurationsMs[index];
            if (elapsed < boundary) return index;
        }
        return binding.frames.length - 1;
    };
    // A pack maps the moving component back to the resident's *own* rendered
    // pixels. The clean plate is rendered through the same Cat Renderer using
    // the resident's config, so newly revealed body pixels keep that identity.
    const composeResidentFrame = ({ sourceFrame, underlayFrame, sourcePixels, frame }) => {
        const width = CANVAS[0], height = CANVAS[1], pixels = width * height;
        if (sourceFrame?.width !== width || sourceFrame?.height !== height ||
            underlayFrame?.width !== width || underlayFrame?.height !== height ||
            sourceFrame.data?.length !== pixels * 4 || underlayFrame.data?.length !== pixels * 4 ||
            !Array.isArray(sourcePixels) || !Number.isInteger(frame?.shift?.x) ||
            !Number.isInteger(frame?.shift?.y) || !['front', 'behind'].includes(frame?.zOrder) ||
            sourceFrame.groundAnchor?.[0] !== underlayFrame.groundAnchor?.[0] ||
            sourceFrame.groundAnchor?.[1] !== underlayFrame.groundAnchor?.[1])
            throw new TypeError('Invalid identity-preserving motion inputs');
        const data = new Uint8ClampedArray(underlayFrame.data);
        for (const pixel of sourcePixels) {
            if (!Number.isInteger(pixel) || pixel < 0 || pixel >= pixels) throw new RangeError('Invalid source pixel');
            const x = pixel % width + frame.shift.x;
            const y = Math.floor(pixel / width) + frame.shift.y;
            if (x < 0 || y < 0 || x >= width || y >= height) throw new RangeError('Motion outside canvas');
            const target = (y * width + x) * 4;
            if (frame.zOrder === 'behind' && data[target + 3]) continue;
            data.set(sourceFrame.data.subarray(pixel * 4, pixel * 4 + 4), target);
        }
        return { width, height, data, groundAnchor: [...sourceFrame.groundAnchor] };
    };
    // The presentation controller never owns the behavior clock or world foot.
    // One RAF services every active resident, and no RAF runs with zero packs.
    const createPresentationController = ({ bindings = productionBindings,
        definitions = Meeow.hallActivities?.definitions || {},
        now = () => global.performance.now(), requestFrame = fn => global.requestAnimationFrame(fn),
        cancelFrame = id => global.cancelAnimationFrame(id), prepareFrame = () => null,
        onChange = () => {} } = {}) => {
        const active = new Map(), diagnostics = new Map();
        let raf = null, generation = 0;
        const publish = (id, visual, diagnostic) => {
            diagnostics.set(id, Object.freeze({ ...diagnostic }));
            onChange(id, visual, diagnostics.get(id));
        };
        const stopFrame = () => { if (raf !== null) cancelFrame(raf); raf = null; };
        const tick = () => {
            raf = null;
            for (const [id, item] of active) {
                const index = frameAtElapsed(item.binding, now() - item.startedAt);
                if (index === item.frameIndex) continue;
                item.frameIndex = index;
                try {
                    const visual = prepareFrame(item.binding, index, item.input);
                    if (!visual || visual.groundAnchor?.[0] !== item.input.chassisAnchor[0] ||
                        visual.groundAnchor?.[1] !== item.input.chassisAnchor[1]) throw new Error('frame-unavailable');
                    publish(id, visual, { state: 'playing', animationId: item.binding.id,
                        behaviorInstanceId: item.input.behaviorInstanceId, generation: item.token,
                        frameIndex: index, frameCount: item.binding.frames.length,
                        frameElapsedMs: (now() - item.startedAt) % item.binding.cycleDurationMs,
                        groundAnchor: item.binding.groundAnchor, bodyType: item.binding.bodyType });
                } catch (_) {
                    active.delete(id);
                    publish(id, null, { state: 'static-fallback', reason: 'frame-unavailable',
                        behaviorInstanceId: item.input.behaviorInstanceId, generation: item.token });
                }
            }
            if (active.size) raf = requestFrame(tick);
        };
        const stop = (residentId, reason = 'presentation-cancelled') => {
            const id = String(residentId);
            const item = active.get(id);
            active.delete(id);
            publish(id, null, { state: 'static-fallback', reason,
                behaviorInstanceId: item?.input.behaviorInstanceId || null,
                generation: ++generation });
            if (!active.size) stopFrame();
        };
        const sync = input => {
            const id = String(input?.residentId || '');
            if (!id) return;
            const current = active.get(id);
            if (!input.behaviorInstanceId || !input.ambientOwns || input.motionPose ||
                !input.behaviorId || !input.posture) {
                if (current) stop(id, input.motionPose ? 'motion-priority' : 'authority-unavailable');
                return;
            }
            if (current && current.input.behaviorInstanceId === input.behaviorInstanceId &&
                current.input.behaviorId === input.behaviorId &&
                current.input.posture === input.posture && current.input.bodyType === input.bodyType &&
                current.input.identityKey === input.identityKey &&
                current.input.chassisAnchor?.[0] === input.chassisAnchor?.[0] &&
                current.input.chassisAnchor?.[1] === input.chassisAnchor?.[1] &&
                JSON.stringify(current.input.context || {}) === JSON.stringify(input.context || {})) return;
            if (current) stop(id, 'behavior-instance-changed');
            const result = resolveBinding({ ...input, bindings, definitions });
            if (!result.binding) {
                const previous = diagnostics.get(id);
                if (previous?.state === 'static-fallback' && previous.reason === result.reason &&
                    previous.behaviorInstanceId === input.behaviorInstanceId) return;
                publish(id, null, { state: 'static-fallback', reason: result.reason,
                    behaviorInstanceId: input.behaviorInstanceId, generation: ++generation });
                return;
            }
            const item = { input: { ...input }, binding: result.binding, startedAt: now(),
                token: ++generation, frameIndex: -1 };
            active.set(id, item);
            if (raf === null) raf = requestFrame(tick);
        };
        return Object.freeze({ sync, stop, stopAll: reason => {
            for (const id of [...active.keys()]) stop(id, reason);
        }, debug: id => diagnostics.get(String(id)) || null,
        activeCount: () => active.size });
    };
    Meeow.hallAnimation = Object.freeze({ CANVAS, productionBindings, validateBinding,
        resolveBinding, frameAtElapsed, composeResidentFrame, createPresentationController });
}(window));
