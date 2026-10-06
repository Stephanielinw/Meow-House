(function (global) {
    'use strict';

    const Meeow = global.Meeow = global.Meeow || {};
    const CANONICAL_SIZE = 1024;
    const PROTOTYPE_SPEED = 80; // Canonical map pixels per second.
    const PROTOTYPE_IDLE_MS = 900;

    // These are authored foot-space bounds, independent of the PNG layers' visual extents.
    // The first slot matches the existing living-rug region's first marker placement.
    const ROOMS = Object.freeze({
        'gotham::living': Object.freeze({
            version: 1,
            hallId: 'gotham',
            roomId: 'living',
            width: CANONICAL_SIZE,
            height: CANONICAL_SIZE,
            walkableFloor: Object.freeze([
                Object.freeze({ x: 240, y: 600, width: 365, height: 150 }),
                // Sofa cushions are an isolated surface; there is no floor-to-sofa edge.
                Object.freeze({ x: 410, y: 345, width: 335, height: 85 })
            ]),
            obstacles: Object.freeze([
                Object.freeze({ id: 'sofa-base', x: 365, y: 435, width: 425, height: 55 }),
                Object.freeze({ id: 'bookshelf-base', x: 60, y: 420, width: 270, height: 55 }),
                Object.freeze({ id: 'toy-box-base', x: 810, y: 715, width: 160, height: 145 }),
                Object.freeze({ id: 'scratch-board-base', x: 825, y: 540, width: 145, height: 90 })
            ]),
            destinations: Object.freeze({
                a: Object.freeze({ id: 'rug-a', x: 443, y: 716 }),
                b: Object.freeze({ id: 'rug-b', x: 560, y: 690 })
            }),
            ambientSlots: Object.freeze({
                'rug-a': Object.freeze({ x: 443, y: 716, component: 'rug', neighbors: Object.freeze(['rug-left', 'rug-right', 'rug-back']) }),
                'rug-left': Object.freeze({ x: 370, y: 716, component: 'rug', neighbors: Object.freeze(['rug-a', 'rug-back']) }),
                'rug-right': Object.freeze({ x: 515, y: 716, component: 'rug', neighbors: Object.freeze(['rug-a', 'rug-b']) }),
                'rug-back': Object.freeze({ x: 410, y: 671, component: 'rug', neighbors: Object.freeze(['rug-a', 'rug-left']) }),
                'rug-b': Object.freeze({ x: 560, y: 690, component: 'rug', neighbors: Object.freeze(['rug-right']) }),
                'sofa-center': Object.freeze({ x: 578, y: 394, component: 'sofa', neighbors: Object.freeze(['sofa-left', 'sofa-right']) }),
                'sofa-left': Object.freeze({ x: 517, y: 394, component: 'sofa', neighbors: Object.freeze(['sofa-center']) }),
                'sofa-right': Object.freeze({ x: 638, y: 394, component: 'sofa', neighbors: Object.freeze(['sofa-center']) })
            })
        })
    });

    const getRoom = (hallId, roomId) => ROOMS[`${String(hallId)}::${String(roomId)}`] || null;
    const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
    const pointInRect = (point, rect) => finitePoint(point) &&
        point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
    const pointInObstacle = (room, point) => Boolean(room?.obstacles?.some(rect => pointInRect(point, rect)));
    const pointIsWalkable = (room, point) => Boolean(room && finitePoint(point) &&
        room.walkableFloor.some(rect => pointInRect(point, rect)) && !pointInObstacle(room, point));

    // Rectangle boundary crossings partition a segment into intervals whose
    // midpoint has a constant floor/obstacle classification. This checks the
    // entire foot route without approximating it with sprite or image bounds.
    const segmentIsWalkable = (room, from, to) => {
        if (!pointIsWalkable(room, from) || !pointIsWalkable(room, to)) return false;
        const cuts = [0, 1];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        for (const rect of [...room.walkableFloor, ...room.obstacles]) {
            if (dx !== 0) for (const x of [rect.x, rect.x + rect.width]) {
                const t = (x - from.x) / dx;
                if (t > 0 && t < 1) cuts.push(t);
            }
            if (dy !== 0) for (const y of [rect.y, rect.y + rect.height]) {
                const t = (y - from.y) / dy;
                if (t > 0 && t < 1) cuts.push(t);
            }
        }
        cuts.sort((a, b) => a - b);
        return cuts.every((t, index) => {
            const point = { x: from.x + dx * t, y: from.y + dy * t };
            if (!pointIsWalkable(room, point)) return false;
            if (index === cuts.length - 1) return true;
            const middle = (t + cuts[index + 1]) / 2;
            return pointIsWalkable(room, { x: from.x + dx * middle, y: from.y + dy * middle });
        });
    };

    const projectFoot = (room, point, contentBounds) => {
        if (!room || !finitePoint(point) || !Number.isFinite(contentBounds?.width) ||
            !Number.isFinite(contentBounds?.height) || contentBounds.width <= 0 || contentBounds.height <= 0) return null;
        return {
            x: point.x * contentBounds.width / room.width,
            y: point.y * contentBounds.height / room.height
        };
    };
    const measureStageContent = stage => {
        if (!stage || typeof stage.getBoundingClientRect !== 'function') return null;
        const rect = stage.getBoundingClientRect();
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        if (!(width > 0 && height > 0)) return null;
        return { left: rect.left + stage.clientLeft, top: rect.top + stage.clientTop, width, height };
    };
    const statusAcceptanceAdvanced = (resident, acceptedStamp) =>
        String(resident?.lastStatusUpdateTime ?? '') !== String(acceptedStamp ?? '');
    const newlyAcceptedResidentScene = (records, knownIds, hallId, residentId) =>
        (Array.isArray(records) ? records : []).find(record =>
            !knownIds.has(String(record?.id)) && String(record?.hallId) === String(hallId) &&
            Array.isArray(record?.participantIds) &&
            record.participantIds.some(id => String(id) === String(residentId))) || null;

    const placementFootFromStyle = style => {
        const x = Number.parseFloat(style?.left);
        const y = Number.parseFloat(style?.top);
        return String(style?.left).endsWith('%') && String(style?.top).endsWith('%') &&
            Number.isFinite(x) && Number.isFinite(y)
            ? { x: Math.round(x * CANONICAL_SIZE / 100), y: Math.round(y * CANONICAL_SIZE / 100) } : null;
    };
    const ambientEntrySlot = (room, spot, foot) => {
        const component = spot === 'living-rug' ? 'rug' : spot === 'sofa-seat' ? 'sofa' : '';
        return Object.entries(room?.ambientSlots || {}).find(([, slot]) =>
            slot.component === component && slot.x === foot?.x && slot.y === foot?.y)?.[0] || null;
    };
    const validateAmbientGraph = room => Object.entries(room?.ambientSlots || {}).every(([id, slot]) =>
        pointIsWalkable(room, slot) && slot.neighbors.every(nextId => {
            const next = room.ambientSlots[nextId];
            return next && next.component === slot.component && next.neighbors.includes(id) &&
                segmentIsWalkable(room, slot, next);
        }));

    const createRouteMovement = ({ points, speed = PROTOTYPE_SPEED, idleMs = 0,
        now = () => global.performance.now(), requestFrame = callback => global.requestAnimationFrame(callback),
        cancelFrame = id => global.cancelAnimationFrame(id), setTimer = (callback, ms) => global.setTimeout(callback, ms),
        clearTimer = id => global.clearTimeout(id), onPosition, onArrival }) => {
        if (!Array.isArray(points) || points.length < 2 || !points.every(finitePoint) ||
            !(speed > 0) || !(idleMs >= 0) || typeof onPosition !== 'function')
            throw new TypeError('valid route, speed, and callback required');
        let generation = 0;
        let timer = null;
        let frame = null;
        let state = 'idle';
        let startedAt = 0;
        const lengths = [0];
        for (let index = 1; index < points.length; index += 1)
            lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x,
                points[index].y - points[index - 1].y));
        const totalDistance = lengths[lengths.length - 1];
        const cancel = () => {
            generation += 1;
            if (timer !== null) clearTimer(timer);
            if (frame !== null) cancelFrame(frame);
            timer = null;
            frame = null;
            if (state !== 'arrived') state = 'cancelled';
        };
        const start = () => {
            if (state !== 'idle') return false;
            state = 'waiting';
            const token = ++generation;
            onPosition({ x: points[0].x, y: points[0].y });
            if (generation !== token) return true;
            timer = setTimer(() => {
                timer = null;
                if (generation !== token) return;
                state = 'moving';
                startedAt = now();
                const tick = () => {
                    frame = null;
                    if (generation !== token) return;
                    const travelled = Math.min(totalDistance, Math.max(0, (now() - startedAt) * speed / 1000));
                    const arrived = travelled >= totalDistance;
                    let point = { x: points[points.length - 1].x, y: points[points.length - 1].y };
                    if (!arrived) {
                        let segment = 1;
                        while (segment < lengths.length - 1 && lengths[segment] < travelled) segment += 1;
                        const leg = lengths[segment] - lengths[segment - 1];
                        const fraction = leg ? (travelled - lengths[segment - 1]) / leg : 1;
                        point = { x: points[segment - 1].x + (points[segment].x - points[segment - 1].x) * fraction,
                            y: points[segment - 1].y + (points[segment].y - points[segment - 1].y) * fraction };
                    }
                    onPosition(point, arrived ? points.length - 2 : (() => {
                        let segment = 0;
                        while (segment < lengths.length - 2 && lengths[segment + 1] < travelled) segment++;
                        return segment;
                    })());
                    if (generation !== token) return;
                    if (arrived) {
                        state = 'arrived';
                        if (typeof onArrival === 'function') onArrival(point);
                    } else frame = requestFrame(tick);
                };
                frame = requestFrame(tick);
            }, idleMs);
            return true;
        };
        return { start, cancel, getState: () => state };
    };
    const createOneShotMovement = ({ from, to, ...options }) =>
        createRouteMovement({ points: [from, to], idleMs: PROTOTYPE_IDLE_MS, ...options });

    // Painter order is based on floor contact, never sprite bounds. Structural
    // wall/floor layers stay below every floor-level entity.
    const orderSceneEntities = entities => entities.map((entity, index) => ({ ...entity, index }))
        .sort((a, b) => {
            const depth = entity => {
                const value = entity.kind === 'base' ? -1 : Number(entity.depthY);
                if (!entity.aboveLayer) return value;
                const owner = entities.find(item => item.layer === entity.aboveLayer);
                if (!owner || owner.kind !== 'furniture' || !Number.isFinite(Number(owner.depthY)))
                    throw new TypeError('interaction presentation requires its furniture layer');
                return Math.max(value, Number(owner.depthY) + 0.5);
            };
            // Numerical projection noise is a tie, not a reason to reshuffle art.
            const aDepth = Math.round(depth(a) * 1e6) / 1e6;
            const bDepth = Math.round(depth(b) * 1e6) / 1e6;
            if (!Number.isFinite(aDepth) || !Number.isFinite(bDepth))
                throw new TypeError('scene entity requires a finite floor-contact depth');
            if (aDepth !== bDepth) return aDepth - bDepth;
            if (a.kind !== 'resident' && b.kind !== 'resident') return a.index - b.index;
            return String(a.id).localeCompare(String(b.id)) || a.index - b.index;
        }).map((entity, rank) => ({ ...entity, zIndex: rank + 1 }));

    // All authority here is transient. The caller supplies current production
    // placement, keyed by stable resident ID, whenever authoritative placement changes.
    // Bounded presentation reuse only. The caller supplies current authority identity
    // and the existing real-alpha query; this never changes world placement.
    const resolvePresentationFoot = (memo, id, key, foot, { now, fits, nearby,
        speed = PROTOTYPE_SPEED, retentionMs = 1000, maxDistance = 144 }) => {
        const prior = memo.get(id);
        const current = prior?.key === key ? prior : null;
        const safePrior = current?.foot && Math.hypot(current.foot.x - foot.x,
            current.foot.y - foot.y) <= maxDistance && fits(current.foot) ? current.foot : null;
        const direct = fits(foot);
        const reuseSearch = current?.searchFoot && Math.hypot(current.searchFoot.x - foot.x,
            current.searchFoot.y - foot.y) < 4;
        const reusedTarget = current?.target && fits(current.target) ? current.target : null;
        let target = direct ? foot : reuseSearch ? reusedTarget : nearby(foot);
        let result = target;
        if (safePrior && target) {
            const gap = Math.hypot(target.x - safePrior.x, target.y - safePrior.y);
            const budget = speed * Math.max(0, now - current.at) / 1000;
            if (gap > budget) {
                const ratio = budget / gap;
                result = { x: safePrior.x + (target.x - safePrior.x) * ratio,
                    y: safePrior.y + (target.y - safePrior.y) * ratio };
            }
            // Sample the short displacement rather than jumping across an obstacle.
            const steps = Math.max(1, Math.ceil(Math.hypot(result.x - safePrior.x, result.y - safePrior.y)));
            for (let i = 1; i <= steps; i++) if (!fits({
                x: safePrior.x + (result.x - safePrior.x) * i / steps,
                y: safePrior.y + (result.y - safePrior.y) * i / steps })) { result = null; break; }
        }
        const resolved = result && target && Math.hypot(result.x - target.x, result.y - target.y) < 0.01;
        const blockedAt = resolved ? null : current?.blockedAt ?? now;
        if (!result && safePrior && now - blockedAt < retentionMs) result = safePrior;
        if (blockedAt !== null && now - blockedAt >= retentionMs) result = null;
        if (memo.size > 128) memo.clear();
        memo.set(id, { key, at: now, blockedAt, sourceFoot: { ...foot },
            searchFoot: reuseSearch && !direct ? current.searchFoot : { ...foot }, target: target && { ...target },
            foot: result && { ...result }, failure: result ? null : 'presentation-unresolved' });
        return result;
    };

    const createAmbientSimulation = ({ room, navigation = null, activityPolicy = null, episodePolicy = null,
        getAuthoritativePose = () => '',
        canOwnResident = () => true, prepareStandingVisual = () => true,
        isStandingVisualReady = () => true, isRestingVisualReady = () => true,
        now = () => global.performance.now(),
        setTimer = (callback, ms) => global.setTimeout(callback, ms),
        clearTimer = id => global.clearTimeout(id),
        requestFrame = callback => global.requestAnimationFrame(callback),
        cancelFrame = id => global.cancelAnimationFrame(id), onChange = () => {}, debug = false,
        onDiagnosticPosition = null }) => {
        if (navigation ? typeof navigation.choose !== 'function' || typeof navigation.plan !== 'function' ||
            typeof navigation.legalPoint !== 'function' : !validateAmbientGraph(room))
            throw new Error('invalid ambient navigation policy');
        const STAND_UP_MS = 350, SETTLE_MS = 350, VISUAL_TIMEOUT_MS = 5000, VISUAL_POLL_MS = 50;
        const residents = new Map(), occupied = new Map(), reserved = new Map();
        let entries = [], active = false, paused = false, instanceSerial = 0;
        const trace = [];
        const note = (runtime, event, detail = null) => {
            if (!debug) return;
            trace.push({ at: now(), residentId: runtime?.id || null,
                instanceId: runtime?.instance?.id || null, event, detail });
            if (trace.length > 96) trace.shift();
        };
        const beginInstance = (runtime, behaviorId) => {
            const instance = { id: `${runtime.id}:${++instanceSerial}`, residentId: runtime.id,
                behaviorId, posture: null, targetContext: null, claimHandles: [],
                startedAt: null, expectedEndAt: null, lifecycleState: 'PREPARING' };
            runtime.instance = instance;
            note(runtime, 'prepare-started', behaviorId);
            return instance;
        };
        const furnitureDefinition = runtime => runtime.instance?.targetContext?.kind === 'furniture'
            ? runtime.instance.targetContext.interaction : null;
        const endInstance = (runtime, state, reason) => {
            const instance = runtime.instance;
            if (!instance || instance.lifecycleState === 'COMPLETED' ||
                instance.lifecycleState === 'CANCELLED') return;
            instance.lifecycleState = state;
            if (state === 'COMPLETED') runtime.lastCompletion = { instanceId: instance.id, reason };
            else runtime.lastCancellation = { instanceId: instance.id, reason };
            note(runtime, state === 'COMPLETED' ? 'behavior-completed' : 'behavior-cancelled', reason);
            runtime.instance = null;
        };
        const publish = () => onChange(snapshot());
        const hash = value => {
            let result = 2166136261;
            for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
            return result >>> 0;
        };
        const idleDelay = (id, cycle) => navigation?.idleDelay?.(id, cycle) ??
            (1200 + hash(`${id}:${cycle}:idle`) % 1601);
        const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const nearClaim = (point, excludeId = '') => navigation &&
            [...occupied, ...reserved].some(([id, claim]) => id !== excludeId &&
                pointDistance(point, claim) < (navigation.separation ?? 48));
        const normalizedAuthority = id => {
            const pose = getAuthoritativePose(id);
            return pose === 'standing' || pose === 'sitting' || pose === 'crouching' || pose === 'lying'
                ? pose : '';
        };
        const releaseTarget = runtime => {
            if (runtime.claim) note(runtime, 'claim-released', runtime.claim.key);
            if (navigation) reserved.delete(runtime.id);
            else if (reserved.get(runtime.target) === runtime.id) reserved.delete(runtime.target);
            if (runtime.instance) runtime.instance.claimHandles = [];
            runtime.claim = null;
            runtime.target = null;
            runtime.route = null;
        };
        const cancelBehavior = (runtime, reason, clearPose = false, suspendGround = false) => {
            if (runtime.timer !== null) clearTimer(runtime.timer);
            if (runtime.visualTimeout !== null) clearTimer(runtime.visualTimeout);
            runtime.timer = null;
            runtime.visualTimeout = null;
            runtime.motion?.cancel();
            runtime.motion = null;
            runtime.presentationFoot = null;
            runtime.furnitureSolution = null;
            runtime.furnitureFacing = null;
            runtime.furnitureTraversal = null;
            runtime.pendingFurnitureExit = null; runtime.blockedFurnitureSignature = null; runtime.furnitureConfirmPending = null;
            if (furnitureDefinition(runtime) && canOwnResident(runtime.id, runtime.entryKey) &&
                !navigation.legalPoint(runtime.foot) && navigation.legalPoint(runtime.lastAuthoredFoot)) {
                runtime.foot = { ...runtime.lastAuthoredFoot };
                occupied.set(runtime.id, { ...runtime.foot });
            }
            releaseTarget(runtime);
            if (suspendGround) {
                runtime.instance.lifecycleState = 'PAUSED';
                note(runtime, 'behavior-paused', reason);
            } else endInstance(runtime, 'CANCELLED', reason);
            runtime.ambientMotionPose = null;
            if (clearPose) runtime.localActivityPose = null;
            runtime.nextDecisionAt = null;
        };
        const clearRuntime = (runtime, reason = 'context-invalid') => {
            cancelBehavior(runtime, reason, true);
            if (navigation) occupied.delete(runtime.id);
            else if (occupied.get(runtime.slot) === runtime.id) occupied.delete(runtime.slot);
        };
        const snapshot = () => ({
            residents: [...residents.values()].map(runtime => ({ id: runtime.id, state: runtime.state,
                placementKey: runtime.entryKey,
                slot: runtime.slot, target: runtime.target, foot: { ...runtime.foot },
                presentationFoot: runtime.presentationFoot ? { ...runtime.presentationFoot } : null,
                nextDecisionAt: runtime.nextDecisionAt, reason: runtime.reason, cycles: runtime.cycles,
                authoritativePose: runtime.authoritativePose, ambientMotionPose: runtime.ambientMotionPose,
                localActivityPose: runtime.localActivityPose || null,
                behaviorId: runtime.behaviorId || null, activityStartedAt: runtime.activityStartedAt ?? null,
                episodeBeatId: runtime.episodeBeatId || null,
                behaviorInstanceId: runtime.instance?.id || null,
                behaviorLifecycleState: runtime.instance?.lifecycleState || null,
                claim: runtime.claim ? { ...runtime.claim } : null,
                activityExpectedEndAt: runtime.activityExpectedEndAt ?? null,
                settledPersisted: runtime.settledPersisted ?? null,
                transitionPhase: runtime.transitionPhase, transitionGeneration: runtime.generation,
                furniture: furnitureDefinition(runtime) ? {
                    slotId: furnitureDefinition(runtime).slotId,
                    surfaceId: furnitureDefinition(runtime).surfaceId,
                    phase: runtime.instance.phase,
                    posture: runtime.instance.posture || furnitureDefinition(runtime).posture,
                    presentationFacing: runtime.furnitureFacing || null,
                    presentationSolution: runtime.furnitureSolution || null,
                    traversalSegment: runtime.furnitureTraversal ? {from: runtime.furnitureTraversal.points[runtime.furnitureTraversal.segment || 0],
                        to: runtime.furnitureTraversal.points[(runtime.furnitureTraversal.segment || 0)+1]} : null,
                    exitPresentationFoot: runtime.pendingFurnitureExit?.at(-1) || runtime.furnitureSolution?.exitPoints?.at(-1) || null,
                    presentation: ['using', 'awaiting-exit-confirmation'].includes(runtime.instance.phase)
                        ? { ...furnitureDefinition(runtime).presentation } : null,
                    token: { instanceId: runtime.instance.id, generation: runtime.generation }
                } : null,
                route: runtime.route?.points || null, rawRoute: runtime.route?.raw || null,
                recent: runtime.recent || [], visibleRestStartedAt: runtime.visibleRestStartedAt ?? null })),
            occupied: Object.fromEntries(occupied), reserved: Object.fromEntries(reserved)
        });
        const ownsCurrentRuntime = (runtime, token) => active && !paused && residents.get(runtime.id) === runtime &&
            runtime.generation === token;
        const debugSnapshot = id => {
            if (!debug) return null;
            const runtime = residents.get(String(id));
            const residentTrace = trace.filter(row => row.residentId === String(id));
            const lastTrace = event => [...residentTrace].reverse().find(row => row.event === event);
            const data = { residentId: String(id), ambientOwnership: Boolean(runtime && active && !paused &&
                canOwnResident(String(id))), currentBehaviorInstanceId: runtime?.instance?.id || null,
                currentBehaviorId: runtime?.instance?.behaviorId || null,
                behaviorLifecycleState: runtime?.instance?.lifecycleState || null,
                furniturePhase: runtime?.instance?.phase || null,
                currentPosture: runtime?.ambientMotionPose || runtime?.localActivityPose || null,
                surfaceId: runtime && activityPolicy?.surfaceAt?.(runtime) || null,
                candidates: runtime?.candidates || [], target: runtime?.target || null,
                claim: runtime?.claim || null, lastSelection: runtime?.lastSelection || null,
                lastPrepareFailure: runtime?.lastPrepareFailure || null,
                lastCancellation: runtime?.lastCancellation || (lastTrace('behavior-cancelled') && {
                    instanceId: lastTrace('behavior-cancelled').instanceId,
                    reason: lastTrace('behavior-cancelled').detail }) || null,
                lastCompletion: runtime?.lastCompletion || (lastTrace('behavior-completed') && {
                    instanceId: lastTrace('behavior-completed').instanceId,
                    reason: lastTrace('behavior-completed').detail }) || null,
                trace: residentTrace };
            const freeze = value => {
                if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
                return value;
            };
            return freeze(JSON.parse(JSON.stringify(data)));
        };
        const park = runtime => {
            runtime.generation += 1;
            clearRuntime(runtime, 'ambient-authority-unavailable');
            residents.delete(runtime.id);
            publish();
            // Current entry and current Status are read again; no old route or pose returns.
            claimEntries();
        };
        const stillAuthorized = (runtime, token) => {
            if (!ownsCurrentRuntime(runtime, token)) return false;
            const interaction = furnitureDefinition(runtime);
            if (!canOwnResident(runtime.id, runtime.entryKey) ||
                (interaction && navigation.getInteraction?.(interaction.slotId) !== interaction) || (!activityPolicy &&
                normalizedAuthority(runtime.id) !== runtime.authoritativePose)) {
                note(runtime, 'higher-authority-blocked', 'ambient-authority-unavailable');
                park(runtime);
                return false;
            }
            return true;
        };
        const schedule = (runtime, delay) => {
            const pose = normalizedAuthority(runtime.id);
            if (!pose || !canOwnResident(runtime.id) || pose !== runtime.authoritativePose) {
                park(runtime); return;
            }
            const token = ++runtime.generation;
            runtime.state = 'idle';
            runtime.transitionPhase = '';
            runtime.nextDecisionAt = now() + delay;
            runtime.timer = setTimer(() => {
                runtime.timer = null;
                if (!stillAuthorized(runtime, token)) return;
                runtime.nextDecisionAt = null;
                // Future personality/action selection enters here, before any pose switch.
                runtime.decisions += 1;
                if (navigation) {
                    const claims = [...occupied, ...reserved].filter(([id]) => id !== runtime.id).map(([, foot]) => foot);
                    const target = navigation.choose(runtime.foot, claims, runtime.recent || [],
                        `${runtime.id}:${runtime.decisions}:target`);
                    if (!target || !navigation.legalPoint(target) || nearClaim(target, runtime.id)) {
                        runtime.reason = 'no-free-target';
                        schedule(runtime, idleDelay(runtime.id, runtime.decisions));
                        return;
                    }
                    runtime.target = target;
                    reserved.set(runtime.id, target);
                    runtime.route = navigation.plan(runtime.foot, target);
                    if (!runtime.route?.valid) {
                        releaseTarget(runtime);
                        runtime.reason = 'route-unavailable';
                        schedule(runtime, idleDelay(runtime.id, runtime.decisions));
                        return;
                    }
                } else {
                    const free = room.ambientSlots[runtime.slot].neighbors.filter(slot =>
                        !occupied.has(slot) && !reserved.has(slot));
                    if (!free.length) {
                        runtime.reason = 'no-free-target';
                        schedule(runtime, idleDelay(runtime.id, runtime.decisions));
                        return;
                    }
                    runtime.target = free[hash(`${runtime.id}:${runtime.decisions}:target`) % free.length];
                    reserved.set(runtime.target, runtime.id);
                }
                if (!runtime.target) {
                    runtime.reason = 'no-free-target';
                    schedule(runtime, idleDelay(runtime.id, runtime.decisions));
                    return;
                }
                runtime.reason = '';
                beginTransition(runtime);
            }, delay);
            publish();
        };
        const waitForRestingVisual = (runtime, token) => {
            if (!stillAuthorized(runtime, token)) return;
            if (!isRestingVisualReady(runtime.id)) {
                runtime.transitionPhase = 'resting-visual-pending';
                runtime.timer = setTimer(() => {
                    runtime.timer = null;
                    waitForRestingVisual(runtime, token);
                }, VISUAL_POLL_MS);
                publish();
                return;
            }
            runtime.transitionPhase = '';
            runtime.state = 'settled';
            runtime.visibleRestStartedAt = now();
            publish();
            schedule(runtime, idleDelay(runtime.id, runtime.decisions));
        };
        const startStationaryActivity = (runtime, behaviorId, { settle = false, remaining = null, groundOnly = false, episodeBeat = null } = {}) => {
            if (!settle && !groundOnly) {
                const candidate = activityPolicy.candidates?.(runtime, false, [])
                    ?.find(row => row.behaviorId === behaviorId && row.eligible);
                for (const slotId of candidate?.furnitureTargets || []) {
                    if (requestFurnitureInteraction(runtime.id, slotId, behaviorId)) return;
                    note(runtime, 'furniture-target-unavailable', slotId);
                }
            }
            const continuing = groundOnly && runtime.instance?.lifecycleState === 'PAUSED' &&
                runtime.instance.targetContext?.kind === 'ground' && runtime.instance.behaviorId === behaviorId;
            if (!settle && !continuing) endInstance(runtime, 'COMPLETED', 'duration-complete');
            if (!runtime.candidates?.length)
                runtime.candidates = activityPolicy.candidates?.(runtime, false, []) || [];
            const instance = settle || continuing ? runtime.instance : beginInstance(runtime, behaviorId);
            if (!settle && ['sleep', 'rest', 'sit-idle', 'observe'].includes(behaviorId))
                instance.targetContext = { kind: 'ground' };
            const token = ++runtime.generation;
            if (runtime.timer !== null) clearTimer(runtime.timer);
            if (runtime.visualTimeout !== null) clearTimer(runtime.visualTimeout);
            runtime.timer = null; runtime.visualTimeout = null;
            runtime.ambientMotionPose = null;
            runtime.state = 'activity-pending';
            runtime.transitionPhase = 'activity-visual-pending';
            runtime.nextDecisionAt = null;
            const preferred = episodeBeat?.posture || continuing && instance.posture || activityPolicy.choosePosture(runtime, behaviorId);
            const choices = [];
            const add = (id, pose) => {
                if (pose && !choices.some(choice => choice.id === id && choice.pose === pose))
                    choices.push({ id, pose });
            };
            add(behaviorId, preferred);
            if (!episodeBeat) for (const pose of activityPolicy.postures(behaviorId)) add(behaviorId, pose);
            if (!episodeBeat) for (const id of ['sit-idle', 'observe', 'rest', 'groom', 'sleep'])
                for (const pose of activityPolicy.postures(id)) add(id, pose);
            const tryChoice = index => {
                if (!stillAuthorized(runtime, token)) return;
                const choice = choices[index];
                if (!choice) {
                    runtime.lastPrepareFailure = { behaviorId, reason: 'visual-unavailable' };
                    note(runtime, 'prepare-failed', 'visual-unavailable');
                    endInstance(runtime, 'CANCELLED', 'visual-unavailable');
                    runtime.localActivityPose = null;
                    runtime.behaviorId = null;
                    runtime.state = 'stationary';
                    runtime.transitionPhase = 'activity-visual-unavailable';
                    runtime.reason = 'activity-visual-unavailable';
                    if (episodeBeat) episodePolicy.progress(runtime.id, episodeBeat.id, 'invalidated', runtime.foot, 'visual-unavailable');
                    else runtime.timer = setTimer(() => startStationaryActivity(runtime, behaviorId, { settle, groundOnly }), 10000);
                    publish();
                    return;
                }
                Promise.resolve().then(() => activityPolicy.prepareVisual(runtime.id, choice.pose)).then(ok => {
                    if (!stillAuthorized(runtime, token) || runtime.instance !== instance) return;
                    if (!ok) { runtime.lastPrepareFailure = { behaviorId: choice.id,
                        reason: 'visual-unavailable' }; tryChoice(index + 1); return; }
                    runtime.localActivityPose = choice.pose;
                    runtime.behaviorId = choice.id;
                    runtime.transitionPhase = 'activity-visual-pending';
                    publish();
                    const deadline = now() + VISUAL_TIMEOUT_MS;
                    const ready = () => {
                        if (!stillAuthorized(runtime, token) || runtime.instance !== instance) return;
                        if (!activityPolicy.visualReady(runtime.id, choice.pose)) {
                            if (now() >= deadline) { tryChoice(index + 1); return; }
                            runtime.timer = setTimer(() => { runtime.timer = null; ready(); }, VISUAL_POLL_MS);
                            return;
                        }
                        const duration = episodeBeat ? Math.max(1, episodeBeat.endAt - episodePolicy.now()) :
                            remaining ?? activityPolicy.duration(runtime.id, runtime.decisions, choice.id);
                        runtime.behaviorId = choice.id;
                        runtime.localActivityPose = choice.pose;
                        runtime.ambientMotionPose = null;
                        runtime.state = 'activity';
                        runtime.transitionPhase = '';
                        runtime.reason = '';
                        runtime.activityStartedAt = continuing && instance.startedAt != null ? instance.startedAt : now();
                        runtime.activityExpectedEndAt = now() + duration;
                        if (settle) runtime.settledPersisted = activityPolicy.onStableSettle(runtime.id,
                            { ...runtime.foot }, runtime.entryKey) === true;
                        if (settle) endInstance(runtime, 'COMPLETED', 'stable-settle');
                        const activeInstance = settle ? beginInstance(runtime, choice.id) : instance;
                        activeInstance.behaviorId = choice.id;
                        activeInstance.posture = choice.pose;
                        activeInstance.startedAt = runtime.activityStartedAt;
                        activeInstance.expectedEndAt = runtime.activityExpectedEndAt;
                        activeInstance.lifecycleState = 'ACTIVE';
                        if (episodeBeat && !episodePolicy.progress(runtime.id, episodeBeat.id, 'active', runtime.foot)) {
                            cancelBehavior(runtime, 'episode-save-failed', true); runtime.state = 'stationary'; publish(); return;
                        }
                        if (['sleep', 'rest', 'sit-idle', 'observe'].includes(choice.id))
                            activeInstance.targetContext = { kind: 'ground' };
                        note(runtime, continuing ? 'behavior-resumed' : 'behavior-started', choice.id);
                        runtime.visibleRestStartedAt = runtime.activityStartedAt;
                        if (!continuing) {
                            runtime.behaviorHistory = [...(runtime.behaviorHistory || []), choice.id].slice(-2);
                            runtime.postureHistory = [...(runtime.postureHistory || []), choice.pose].slice(-2);
                        }
                        runtime.nextDecisionAt = runtime.activityExpectedEndAt;
                        publish();
                        runtime.timer = setTimer(() => {
                            runtime.timer = null;
                            if (!stillAuthorized(runtime, token) || runtime.instance !== activeInstance) return;
                            runtime.nextDecisionAt = null;
                            endInstance(runtime, 'COMPLETED', 'duration-complete');
                            if (episodeBeat) episodePolicy.progress(runtime.id, episodeBeat.id, 'completed', runtime.foot);
                            chooseNextActivity(runtime, false);
                        }, duration);
                    };
                    ready();
                }).catch(() => { if (ownsCurrentRuntime(runtime, token) &&
                    runtime.instance === instance) tryChoice(index + 1); });
            };
            publish();
            tryChoice(0);
        };
        // Optional frozen-plan input; all execution still uses this controller's
        // existing visual preparation, route validation and claim handles.
        const runEpisodeBeat = runtime => {
            const selection = episodePolicy?.get(runtime);
            if (!selection) return false;
            const beat = selection.beat;
            if (!selection.hold && !selection.invalid && beat?.id === runtime.episodeBeatId &&
                ['activity', 'activity-pending', 'moving', 'transitioning'].includes(runtime.state)) return true;
            cancelBehavior(runtime, 'episode-boundary', true);
            runtime.generation += 1; runtime.state = 'stationary'; runtime.reason = 'episode-wait';
            for (const prior of selection.skipped || [])
                if (!episodePolicy.progress(runtime.id, prior.id, 'skipped', runtime.foot)) { publish(); return true; }
            if (selection.invalid) {
                episodePolicy.progress(runtime.id, beat.id, 'invalidated', runtime.foot, selection.invalid);
                publish(); return true;
            }
            if (selection.hold) {
                if (selection.wakeAt > episodePolicy.now()) runtime.timer = setTimer(() => {
                    runtime.timer = null; if (active && !paused) runEpisodeBeat(runtime);
                }, selection.wakeAt - episodePolicy.now());
                publish(); return true;
            }
            const resumedMove = beat.behaviorId === 'roam' && beat.state === 'active' && runtime.episodeBeatId !== beat.id;
            runtime.episodeBeatId = beat.id;
            const fail = reason => {
                cancelBehavior(runtime, reason, true); runtime.state = 'stationary'; runtime.reason = reason;
                episodePolicy.progress(runtime.id, beat.id, 'invalidated', runtime.foot, reason); publish();
            };
            if (resumedMove || pointDistance(runtime.foot, beat.foot) > 1 ||
                !navigation.legalPoint(runtime.foot) || nearClaim(runtime.foot, runtime.id) ||
                !activityPolicy.postures(beat.behaviorId).includes(beat.posture)) { fail('illegal-episode-contact'); return true; }
            if (beat.behaviorId !== 'roam') {
                startStationaryActivity(runtime, beat.behaviorId, { groundOnly: true, episodeBeat: beat });
                return true;
            }
            // A hidden/interrupted move is never replayed from an intermediate contact.
            if (pointDistance(runtime.foot, beat.foot) > 1 || !beat.target ||
                !navigation.legalPoint(beat.target) || nearClaim(beat.target, runtime.id)) {
                fail('episode-target-invalid'); return true;
            }
            let route;
            try { route = navigation.plan(runtime.foot, beat.target); } catch (_) { /* fail closed */ }
            if (!route?.valid) { fail('episode-route-invalid'); return true; }
            const instance = beginInstance(runtime, 'roam');
            runtime.target = { ...beat.target }; runtime.route = route;
            reserved.set(runtime.id, runtime.target);
            runtime.claim = { kind: 'destination-reservation', key: runtime.id, ownerInstanceId: instance.id };
            instance.targetContext = { kind: 'destination', foot: { ...beat.target } };
            instance.claimHandles.push({ ...runtime.claim }); instance.lifecycleState = 'ACTIVE';
            runtime.behaviorId = 'roam'; runtime.activityStartedAt = now();
            if (!episodePolicy.progress(runtime.id, beat.id, 'active', runtime.foot)) { fail('episode-save-failed'); return true; }
            beginTransition(runtime); return true;
        };
        const chooseNextActivity = (runtime, afterRoam = false, settle = false,
            excluded = [], sameCycle = false) => {
            if (!activityPolicy) return;
            if (runEpisodeBeat(runtime)) return;
            if (!sameCycle) runtime.decisions += 1;
            runtime.candidates = activityPolicy.candidates?.(runtime, afterRoam, excluded) || [];
            note(runtime, 'candidate-evaluated', runtime.candidates.map(row =>
                [row.behaviorId, row.eligible, row.effectiveWeight]));
            let selected = activityPolicy.chooseBehavior(runtime, afterRoam, runtime.candidates);
            if (runtime.candidates.length && !runtime.candidates.some(row => row.behaviorId === selected &&
                row.eligible)) selected = runtime.candidates.find(row => row.eligible)?.behaviorId || null;
            if (!selected) {
                runtime.state = 'stationary';
                runtime.reason = runtime.candidates.flatMap(row => row.blockers)[0] || 'no-eligible-behavior';
                note(runtime, 'higher-authority-blocked', runtime.reason);
                const token = ++runtime.generation;
                runtime.timer = setTimer(() => {
                    runtime.timer = null;
                    if (stillAuthorized(runtime, token)) chooseNextActivity(runtime);
                }, 10000);
                publish();
                return;
            }
            runtime.lastSelection = { behaviorId: selected, decision: runtime.decisions };
            note(runtime, 'behavior-selected', selected);
            if (selected !== 'roam') { startStationaryActivity(runtime, selected, { settle }); return; }
            endInstance(runtime, 'COMPLETED', 'duration-complete');
            const instance = beginInstance(runtime, 'roam');
            const claims = [...occupied, ...reserved].filter(([id]) => id !== runtime.id).map(([, foot]) => foot);
            let target = null;
            try { target = navigation.choose(runtime.foot, claims, runtime.recent || [],
                `${runtime.id}:${runtime.decisions}:target`); } catch (_) { /* preparation fails closed */ }
            if (!target || !navigation.legalPoint(target) || nearClaim(target, runtime.id)) {
                runtime.reason = 'no-free-target';
                runtime.lastPrepareFailure = { behaviorId: 'roam', reason: 'no-free-target' };
                note(runtime, 'prepare-failed', 'no-free-target');
                endInstance(runtime, 'CANCELLED', 'no-free-target');
                chooseNextActivity(runtime, afterRoam, settle, [...excluded, 'roam'], true);
                return;
            }
            runtime.target = target;
            reserved.set(runtime.id, target);
            runtime.claim = { kind: 'destination-reservation', key: runtime.id,
                ownerInstanceId: instance.id };
            instance.targetContext = { kind: 'destination', foot: { ...target } };
            instance.claimHandles.push({ ...runtime.claim });
            note(runtime, 'claim-acquired', runtime.claim.key);
            try { runtime.route = navigation.plan(runtime.foot, target); }
            catch (_) { runtime.route = null; }
            if (!runtime.route?.valid) {
                releaseTarget(runtime);
                runtime.reason = 'route-unavailable';
                runtime.lastPrepareFailure = { behaviorId: 'roam', reason: 'route-unavailable' };
                note(runtime, 'prepare-failed', 'route-unavailable');
                endInstance(runtime, 'CANCELLED', 'route-unavailable');
                chooseNextActivity(runtime, afterRoam, settle, [...excluded, 'roam'], true);
                return;
            }
            runtime.behaviorId = 'roam';
            runtime.activityStartedAt = now();
            runtime.activityExpectedEndAt = null;
            instance.startedAt = runtime.activityStartedAt;
            instance.lifecycleState = 'ACTIVE';
            note(runtime, 'behavior-started', 'roam');
            runtime.behaviorHistory = [...(runtime.behaviorHistory || []), 'roam'].slice(-2);
            runtime.reason = '';
            beginTransition(runtime);
        };
        const abortRoam = (runtime, reason) => {
            if (furnitureDefinition(runtime) && runtime.instance.behaviorId) {
                fallbackFurnitureBehavior(runtime, reason);
                return;
            }
            if (runtime.episodeBeatId && episodePolicy?.get(runtime))
                episodePolicy.progress(runtime.id, runtime.episodeBeatId, 'invalidated', runtime.foot, reason);
            runtime.generation += 1;
            runtime.lastPrepareFailure = { behaviorId: 'roam', reason };
            note(runtime, 'prepare-failed', reason);
            cancelBehavior(runtime, reason);
            runtime.transitionPhase = '';
            runtime.reason = reason;
            if (activityPolicy) { chooseNextActivity(runtime, false, false, ['roam']); return; }
            schedule(runtime, idleDelay(runtime.id, runtime.decisions));
        };
        const startMovement = (runtime, token) => {
            if (!stillAuthorized(runtime, token)) return;
            if ((navigation ? reserved.get(runtime.id) !== runtime.target :
                reserved.get(runtime.target) !== runtime.id) || !isStandingVisualReady(runtime.id)) {
                abortRoam(runtime, 'standing-visual-unavailable'); return;
            }
            if (runtime.episodeBeatId && episodePolicy) {
                const selection = episodePolicy.get(runtime);
                if (selection?.beat?.id !== runtime.episodeBeatId || selection.beat.endAt <= episodePolicy.now()) {
                    abortRoam(runtime, 'episode-movement-expired'); return;
                }
                runtime.timer = setTimer(() => { runtime.timer = null;
                    if (stillAuthorized(runtime, token)) abortRoam(runtime, 'episode-movement-expired');
                }, selection.beat.endAt - episodePolicy.now());
            }
            const target = runtime.target;
            const from = navigation ? runtime.foot : room.ambientSlots[runtime.slot];
            const to = navigation ? target : room.ambientSlots[target];
            const points = navigation ? runtime.route.points : [from, to];
            runtime.state = 'moving';
            runtime.transitionPhase = '';
            runtime.motion = createRouteMovement({ points, idleMs: 0, now, setTimer, clearTimer,
                requestFrame, cancelFrame, onPosition: (point, segment = 0) => {
                    if (!stillAuthorized(runtime, token)) return;
                    if (!isStandingVisualReady(runtime.id)) { park(runtime); return; }
                    if (navigation) {
                        const authored = navigation.lastAuthoredOnSegment?.(runtime.foot, point) ||
                            (navigation.legalPoint(point) ? point : null);
                        if (authored) runtime.lastAuthoredFoot = { x: authored.x, y: authored.y };
                    }
                    runtime.foot = point;
                    // TEMP HALL HITCH DIAGNOSTIC: observe the existing segment, never alter it.
                    onDiagnosticPosition?.(runtime.id, runtime.instance?.id, runtime.generation, segment);
                    if (navigation) occupied.set(runtime.id, { ...runtime.lastAuthoredFoot });
                    publish();
                }, onArrival: () => {
                    if (!stillAuthorized(runtime, token)) return;
                    if (runtime.episodeBeatId && runtime.timer !== null) { clearTimer(runtime.timer); runtime.timer = null; }
                    if (!isStandingVisualReady(runtime.id)) { park(runtime); return; }
                    if (furnitureDefinition(runtime)) {
                        runtime.foot = { x: to.x, y: to.y };
                        runtime.lastAuthoredFoot = { ...runtime.foot };
                        occupied.set(runtime.id, { ...runtime.foot });
                        runtime.motion = null;
                        runtime.ambientMotionPose = null;
                        runtime.localActivityPose = 'standing';
                        runtime.state = 'stationary';
                        runtime.transitionPhase = '';
                        runtime.instance.phase = 'awaiting-enter-confirmation';
                        note(runtime, 'furniture-approach-arrived');
                        publish();
                        return;
                    }
                    if (!navigation && occupied.get(runtime.slot) === runtime.id) occupied.delete(runtime.slot);
                    releaseTarget(runtime);
                    if (navigation) {
                        occupied.set(runtime.id, { x: to.x, y: to.y });
                        runtime.lastAuthoredFoot = { x: to.x, y: to.y };
                        runtime.recent = [...(runtime.recent || []), { x: to.x, y: to.y }].slice(-2);
                    } else {
                        occupied.set(target, runtime.id);
                        runtime.slot = target;
                    }
                    runtime.motion = null;
                    runtime.foot = { x: to.x, y: to.y };
                    runtime.cycles += 1;
                    if (runtime.episodeBeatId && episodePolicy) {
                        endInstance(runtime, 'COMPLETED', 'episode-arrival');
                        episodePolicy.progress(runtime.id, runtime.episodeBeatId, 'completed', runtime.foot);
                    }
                    runtime.state = 'settling';
                    runtime.transitionPhase = 'standing-settle';
                    publish();
                    claimEntries();
                    runtime.timer = setTimer(() => {
                        runtime.timer = null;
                        if (!stillAuthorized(runtime, token)) return;
                        if (activityPolicy) {
                            chooseNextActivity(runtime, true, true);
                            return;
                        }
                        // Clearing the override resolves the latest accepted Status pose.
                        runtime.ambientMotionPose = null;
                        runtime.transitionPhase = 'resting-visual-pending';
                        publish();
                        waitForRestingVisual(runtime, token);
                    }, SETTLE_MS);
                } });
            runtime.motion.start();
            publish();
        };
        const waitForStandingVisual = (runtime, token) => {
            if (!stillAuthorized(runtime, token)) return;
            if (isStandingVisualReady(runtime.id)) {
                if (runtime.visualTimeout !== null) clearTimer(runtime.visualTimeout);
                runtime.visualTimeout = null;
                startMovement(runtime, token);
                return;
            }
            runtime.transitionPhase = 'standing-visual-pending';
            runtime.timer = setTimer(() => {
                runtime.timer = null;
                waitForStandingVisual(runtime, token);
            }, VISUAL_POLL_MS);
            publish();
        };
        const beginTransition = runtime => {
            const token = ++runtime.generation;
            runtime.visibleRestStartedAt = null;
            runtime.state = 'transitioning';
            runtime.transitionPhase = 'preparing-standing';
            runtime.visualTimeout = setTimer(() => {
                runtime.visualTimeout = null;
                if (ownsCurrentRuntime(runtime, token)) abortRoam(runtime, 'standing-visual-unavailable');
            }, VISUAL_TIMEOUT_MS);
            publish();
            Promise.resolve().then(() => prepareStandingVisual(runtime.id)).then(ready => {
                if (!stillAuthorized(runtime, token)) return;
                if (!ready) { abortRoam(runtime, 'standing-visual-unavailable'); return; }
                if (furnitureDefinition(runtime)) {
                    // Ground locomotion uses the approved static Standing pose;
                    // furniture enter/exit still require explicit confirmations.
                    runtime.ambientMotionPose = 'standing';
                    publish();
                    waitForStandingVisual(runtime, token);
                    return;
                }
                if ((activityPolicy ? runtime.localActivityPose : runtime.authoritativePose) === 'standing') {
                    // Already Standing: wait for the sprite, with no stand-up phase.
                    waitForStandingVisual(runtime, token);
                    return;
                }
                runtime.ambientMotionPose = 'standing';
                runtime.transitionPhase = 'stand-up';
                publish();
                runtime.timer = setTimer(() => {
                    runtime.timer = null;
                    waitForStandingVisual(runtime, token);
                }, STAND_UP_MS);
            }).catch(() => {
                if (ownsCurrentRuntime(runtime, token)) abortRoam(runtime, 'standing-visual-unavailable');
            });
        };
        const claimEntries = () => {
            if (!active || paused) return;
            for (const entry of entries) {
                if (residents.has(entry.id) || !canOwnResident(entry.id, entry.key) ||
                    (navigation ? !navigation.legalPoint(entry.foot) : !room.ambientSlots[entry.slot])) continue;
                const owner = navigation ? false :
                    occupied.get(entry.slot) || reserved.get(entry.slot);
                const pose = normalizedAuthority(entry.id);
                const runtime = { id: entry.id, entryKey: entry.key, entrySlot: entry.slot, slot: entry.slot,
                    foot: navigation ? { x: entry.foot.x, y: entry.foot.y } :
                        { x: room.ambientSlots[entry.slot].x, y: room.ambientSlots[entry.slot].y },
                    lastAuthoredFoot: navigation ? { x: entry.foot.x, y: entry.foot.y } : null,
                    target: null, claim: null, instance: null, candidates: [], timer: null,
                    visualTimeout: null, motion: null, generation: 0,
                    cycles: 0, decisions: 0, authoritativePose: pose, ambientMotionPose: null,
                    localActivityPose: null, behaviorId: null, behaviorHistory: [], postureHistory: [],
                    activityStartedAt: null, activityExpectedEndAt: null, settledPersisted: null,
                    visibleRestStartedAt: null,
                    transitionPhase: '', nextDecisionAt: null, route: null, recent: [],
                    state: owner ? 'suspended' : pose ? 'idle' : 'stationary',
                    reason: owner ? 'entry-slot-conflict' : pose ? '' : 'missing-authoritative-pose' };
                residents.set(entry.id, runtime);
                if (!owner) {
                    if (navigation) occupied.set(entry.id, { ...runtime.foot });
                    else occupied.set(entry.slot, entry.id);
                    if (pose) {
                        if (runEpisodeBeat(runtime)) continue;
                        if (activityPolicy) startStationaryActivity(runtime,
                            activityPolicy.initial(pose) || 'observe');
                        else schedule(runtime, idleDelay(entry.id, 0));
                    }
                }
            }
            for (const entry of entries) {
                const runtime = residents.get(entry.id);
                if (runtime?.state !== 'suspended' || runtime.reason !== 'entry-slot-conflict' ||
                    !canOwnResident(entry.id) || (navigation ? nearClaim(entry.foot, entry.id) :
                        occupied.has(entry.slot) || reserved.has(entry.slot))) continue;
                if (navigation) occupied.set(entry.id, { ...runtime.foot });
                else occupied.set(entry.slot, entry.id);
                const pose = normalizedAuthority(entry.id);
                runtime.authoritativePose = pose;
                runtime.state = pose ? 'idle' : 'stationary';
                runtime.reason = pose ? '' : 'missing-authoritative-pose';
                if (pose) {
                    if (runEpisodeBeat(runtime)) continue;
                    if (activityPolicy) startStationaryActivity(runtime,
                        activityPolicy.initial(pose) || 'observe');
                    else schedule(runtime, idleDelay(entry.id, runtime.decisions));
                }
            }
            publish();
        };
        const cancel = (id, reason = 'authoritative-event', cooldown = 1800) => {
            const runtime = residents.get(String(id));
            if (!runtime) return;
            runtime.generation += 1;
            clearRuntime(runtime, reason);
            residents.delete(runtime.id);
            publish();
            if (!active) return;
            const entry = entries.find(item => item.id === runtime.id);
            if (!entry || !cooldown || !canOwnResident(entry.id)) { claimEntries(); return; }
            const pose = normalizedAuthority(entry.id);
            if (!pose) { claimEntries(); return; }
            const token = { id: runtime.id, entryKey: entry.key, entrySlot: entry.slot, slot: entry.slot,
                foot: navigation ? { ...entry.foot } :
                    { x: room.ambientSlots[entry.slot].x, y: room.ambientSlots[entry.slot].y },
                lastAuthoredFoot: navigation ? { ...entry.foot } : null,
                target: null, claim: null, instance: null, candidates: [], timer: null,
                visualTimeout: null, motion: null, generation: 0,
                cycles: runtime.cycles, decisions: runtime.decisions, authoritativePose: pose,
                localActivityPose: null, behaviorId: null,
                behaviorHistory: runtime.behaviorHistory || [], postureHistory: runtime.postureHistory || [],
                activityStartedAt: null, activityExpectedEndAt: null, settledPersisted: null,
                visibleRestStartedAt: null,
                ambientMotionPose: null, transitionPhase: '', nextDecisionAt: now() + cooldown,
                route: null, recent: runtime.recent || [],
                state: 'suspended', reason };
            residents.set(token.id, token);
            token.timer = setTimer(() => {
                if (residents.get(token.id) !== token || !active) return;
                token.timer = null;
                residents.delete(token.id);
                claimEntries();
            }, cooldown);
            claimEntries();
        };
        const reconcile = (nextEntries, enabled = true) => {
            active = Boolean(enabled);
            entries = active ? nextEntries.filter(entry => entry && entry.id &&
                    (navigation ? navigation.legalPoint(entry.foot) : room.ambientSlots[entry.slot]))
                .map(entry => ({ id: String(entry.id), slot: entry.slot, key: String(entry.key),
                    foot: navigation ? { x: entry.foot.x, y: entry.foot.y } : null,
                    authoritativePose: String(entry.authoritativePose || '') })) : [];
            const current = new Map(entries.map(entry => [entry.id, entry]));
            for (const runtime of [...residents.values()]) {
                const entry = current.get(runtime.id);
                const interaction = furnitureDefinition(runtime);
                if (entry && canOwnResident(runtime.id, runtime.entryKey) && entry.key === runtime.entryKey &&
                    (!interaction || navigation.getInteraction?.(interaction.slotId) === interaction) &&
                    entry.slot === runtime.entrySlot &&
                    ((activityPolicy && runtime.reason !== 'missing-authoritative-pose') ||
                        entry.authoritativePose === runtime.authoritativePose)) {
                    if (!paused && episodePolicy) runEpisodeBeat(runtime);
                    continue;
                }
                runtime.generation += 1;
                clearRuntime(runtime, 'placement-or-presence-changed');
                residents.delete(runtime.id);
            }
            claimEntries();
        };
        const pause = (reason = 'hidden') => {
            if (!active || paused) return;
            paused = true;
            for (const runtime of residents.values()) {
                runtime.generation += 1;
                const suspendGround = runtime.instance?.targetContext?.kind === 'ground' &&
                    ['sleep', 'rest', 'sit-idle', 'observe'].includes(runtime.instance.behaviorId) &&
                    canOwnResident(runtime.id, runtime.entryKey);
                cancelBehavior(runtime, reason, false, suspendGround);
                if (navigation && canOwnResident(runtime.id, runtime.entryKey) && !navigation.legalPoint(runtime.foot))
                    runtime.foot = { ...runtime.lastAuthoredFoot };
                runtime.transitionPhase = '';
                runtime.state = 'paused'; runtime.reason = reason;
                runtime.nextDecisionAt = null;
                runtime.visibleRestStartedAt = null;
                if (navigation) occupied.set(runtime.id, { ...runtime.foot });
            }
            publish();
        };
        const resume = () => {
            if (!active || !paused) return;
            paused = false;
            for (const runtime of residents.values()) {
                const entry = entries.find(candidate => candidate.id === runtime.id);
                if (!entry || !canOwnResident(runtime.id) ||
                    (!activityPolicy && normalizedAuthority(runtime.id) !== runtime.authoritativePose)) continue;
                if (runtime.state === 'paused') {
                    runtime.reason = '';
                    if (runEpisodeBeat(runtime)) continue;
                    if (activityPolicy) startStationaryActivity(runtime,
                        runtime.behaviorId && runtime.behaviorId !== 'roam' ? runtime.behaviorId : 'rest',
                        { groundOnly: runtime.instance?.targetContext?.kind === 'ground',
                          remaining: runtime.activityExpectedEndAt && runtime.activityExpectedEndAt > now()
                            ? runtime.activityExpectedEndAt - now() : null });
                    else schedule(runtime, idleDelay(runtime.id, runtime.decisions));
                }
            }
            claimEntries();
        };
        const stop = (reason = 'stopped') => {
            active = false; paused = false; entries = [];
            for (const runtime of residents.values()) { runtime.generation += 1; clearRuntime(runtime, reason); }
            residents.clear(); occupied.clear(); reserved.clear();
            publish();
        };
        // Slot ownership is the existing instance claim handle, never a second
        // occupancy table. Stale confirmations never clean up on reject.
        const currentFurnitureRuntime = (id, token, phase) => {
            const runtime = residents.get(String(id));
            const interaction = runtime && furnitureDefinition(runtime);
            return runtime && token && ownsCurrentRuntime(runtime, token.generation) && interaction &&
                runtime.instance.id === token.instanceId && runtime.instance.phase === phase &&
                runtime.instance.claimHandles.includes(runtime.claim) &&
                canOwnResident(runtime.id, runtime.entryKey) &&
                navigation.getInteraction?.(interaction.slotId) === interaction ? runtime : null;
        };
        const requestFurnitureInteraction = (id, slotId, behaviorId = null) => {
            const runtime = residents.get(String(id));
            const interaction = navigation?.getInteraction?.(slotId);
            if (behaviorId && runtime && episodePolicy?.get(runtime)) return null;
            if (!runtime || !active || paused || !activityPolicy?.prepareVisual ||
                furnitureDefinition(runtime) || !interaction ||
                !canOwnResident(runtime.id, runtime.entryKey) || !navigation.legalPoint(runtime.foot) ||
                !navigation.legalPoint(interaction.approachPoint) || !navigation.legalPoint(interaction.exitPoint) ||
                nearClaim(interaction.approachPoint, runtime.id)) return null;
            // ponytail: scan active instances; index only if room-scale contention warrants it.
            if ([...residents.values()].some(other => other.instance?.claimHandles.some(handle =>
                handle.kind === 'furniture-slot' && handle.key === interaction.slotId))) return null;
            let route;
            try { route = navigation.plan(runtime.foot, interaction.approachPoint); }
            catch (_) { return null; }
            if (!route?.valid) return null;
            const postures = interaction.postures || [interaction.posture];
            const posture = behaviorId ? postures.find(pose => activityPolicy.postures(behaviorId).includes(pose) &&
                (!activityPolicy.resolveFurniturePresentation || activityPolicy.resolveFurniturePresentation(runtime.id, interaction, pose, runtime.generation)?.available))
                : interaction.posture;
            if (behaviorId && (!interaction.behaviors.includes(behaviorId) ||
                !['sleep', 'rest', 'sit-idle', 'observe'].includes(behaviorId) ||
                !posture)) return null;
            const solution = activityPolicy.resolveFurniturePresentation?.(runtime.id, interaction, posture, runtime.generation);
            if (activityPolicy.resolveFurniturePresentation && !solution?.available) {
                runtime.reason = solution?.reason || 'presentation-context-unsupported'; return null;
            }
            runtime.generation += 1;
            cancelBehavior(runtime, 'furniture-request', true);
            const instance = beginInstance(runtime, behaviorId);
            runtime.furnitureSolution = solution || null;
            runtime.furnitureFacing = solution?.facings.enter || null;
            instance.posture = posture;
            instance.targetContext = { kind: 'furniture', interaction };
            instance.phase = 'approaching';
            runtime.behaviorId = behaviorId;
            runtime.activityStartedAt = null;
            runtime.activityExpectedEndAt = null;
            runtime.target = interaction.approachPoint;
            runtime.route = route;
            runtime.claim = { kind: 'furniture-slot', key: interaction.slotId, ownerInstanceId: instance.id };
            instance.claimHandles.push(runtime.claim);
            reserved.set(runtime.id, runtime.target);
            note(runtime, 'claim-acquired', runtime.claim.key);
            beginTransition(runtime);
            return Object.freeze({ instanceId: instance.id, generation: runtime.generation });
        };
        const requestFurnitureExit = (id, token) => {
            const runtime = currentFurnitureRuntime(id, token, 'using');
            if (!runtime) return false;
            runtime.instance.phase = 'awaiting-exit-confirmation';
            if (runtime.timer !== null) clearTimer(runtime.timer);
            runtime.timer = null;
            runtime.nextDecisionAt = null;
            note(runtime, 'furniture-exit-requested');
            publish();
            return true;
        };
        const fallbackFurnitureBehavior = (runtime, reason) => {
            const behaviorId = runtime.instance?.behaviorId ||
                activityPolicy?.initial(normalizedAuthority(runtime.id)) || 'rest';
            if (!stillAuthorized(runtime, runtime.generation)) return false;
            runtime.generation += 1;
            runtime.lastPrepareFailure = { behaviorId, reason };
            note(runtime, 'prepare-failed', reason);
            cancelBehavior(runtime, reason, true);
            startStationaryActivity(runtime, behaviorId, { groundOnly: true });
            return true;
        };
        // Presentation failure is instance-matched just like its success callback.
        const rejectFurnitureTransition = (id, token, transition) => {
            const phase = transition === 'enter' ? 'awaiting-enter-confirmation' :
                transition === 'exit' ? 'awaiting-exit-confirmation' : null;
            const runtime = phase && currentFurnitureRuntime(id, token, phase);
            if (!runtime) return false;
            if (transition === 'exit') { runtime.reason = 'furniture-exit-presentation-blocked'; return false; }
            return fallbackFurnitureBehavior(runtime, 'furniture-visual-unavailable');
        };
        const holdFurnitureTraversal = runtime => {
            const route = runtime.furnitureTraversal;
            if (route && runtime.presentationFoot) {
                const p = runtime.presentationFoot;
                let segment = 0;
                for (let i = 0; i < route.points.length - 1; i++) if (
                    Math.abs(pointDistance(route.points[i], p) + pointDistance(p, route.points[i + 1]) -
                        pointDistance(route.points[i], route.points[i + 1])) < 0.01) segment = i;
                runtime.pendingFurnitureExit = route.direction === 'enter'
                    ? [{ ...p }, ...route.points.slice(0, segment + 1).reverse()]
                    : [{ ...p }, ...route.points.slice(segment + 1)];
            }
            runtime.motion?.cancel(); runtime.motion = null;
            runtime.instance.phase = 'awaiting-exit-confirmation';
            if (runtime.timer !== null) clearTimer(runtime.timer);
            runtime.timer = null; runtime.nextDecisionAt = null;
            runtime.reason = 'furniture-exit-presentation-blocked';
            // Claim and accepted world foot remain owned. Only the existing context
            // boundary/transition adapter retries; no opportunity timer is added.
            publish();
        };
        const reconcileFurniturePresentation = () => {
            if (!active || paused || !activityPolicy.resolveFurniturePresentation) return;
            for (const runtime of residents.values()) {
                const interaction = furnitureDefinition(runtime);
                if (!interaction || !canOwnResident(runtime.id, runtime.entryKey)) continue;
                const solution = activityPolicy.resolveFurniturePresentation(runtime.id, interaction, runtime.instance.posture, runtime.generation);
                runtime.furnitureSolution = solution;
                const phase = runtime.instance.phase;
                if (solution?.available) {
                    runtime.furnitureFacing = solution.facings[phase === 'using' ? 'using' : ['exiting','awaiting-exit-confirmation'].includes(phase) ? 'exit' : 'enter'];
                    if (runtime.furnitureTraversal && ['entering','exiting'].includes(phase)) {
                        const direction = runtime.furnitureTraversal.direction, points = runtime.furnitureTraversal.points;
                        const replacement = solution[direction + 'Points'], faces = solution[direction + 'Facings'];
                        const sameRoute = replacement?.length === points.length && replacement.every((p,n) => pointDistance(p,points[n]) < 0.01);
                        if (sameRoute && faces?.length === points.length - 1) runtime.furnitureTraversal.facings = faces;
                        else holdFurnitureTraversal(runtime);
                    }
                } else if (phase === 'using') {
                    if (solution?.facings.using) runtime.furnitureFacing = solution.facings.using;
                    else requestFurnitureExit(runtime.id, {instanceId: runtime.instance.id, generation: runtime.generation});
                } else if (phase === 'entering' || phase === 'exiting') holdFurnitureTraversal(runtime);
                else if (phase === 'approaching' || phase === 'awaiting-enter-confirmation')
                    fallbackFurnitureBehavior(runtime, 'presentation-context-unsupported');
            }
            publish();
        };
        const confirmFurnitureTransition = async (id, token, transition) => {
            const phase = transition === 'enter' ? 'awaiting-enter-confirmation' :
                transition === 'exit' ? 'awaiting-exit-confirmation' : null;
            if (!phase) return false;
            const runtime = currentFurnitureRuntime(id, token, phase);
            if (!runtime) return false;
            const preparationToken = `${token.instanceId}:${token.generation}`;
            if (runtime.furnitureConfirmPending === preparationToken) return false;
            const interaction = furnitureDefinition(runtime);
            let updated = activityPolicy.resolveFurniturePresentation?.(runtime.id, interaction, runtime.instance.posture, runtime.generation);
            if (updated) { runtime.furnitureSolution = updated; runtime.furnitureFacing = updated.facings[transition] || runtime.furnitureFacing; }
            if (runtime.blockedFurnitureSignature && runtime.blockedFurnitureSignature === updated?.signature && !runtime.pendingFurnitureExit) return false;
            if (activityPolicy.resolveFurniturePresentation && !(transition === 'enter' ? updated?.available : updated?.facings.exit || runtime.pendingFurnitureExit)) {
                if (transition === 'enter') rejectFurnitureTransition(id, token, transition);
                else { runtime.reason = 'furniture-exit-presentation-blocked'; runtime.blockedFurnitureSignature = updated?.signature; }
                return false;
            }
            const posture = transition === 'enter' ? runtime.instance.posture : normalizedAuthority(runtime.id);
            if (!posture || !activityPolicy?.prepareVisual) return false;
            let ready = false;
            runtime.furnitureConfirmPending = preparationToken;
            try { ready = await activityPolicy.prepareVisual(runtime.id, posture); }
            catch (_) { /* presentation failure follows the same guarded fallback */ }
            finally { if (runtime.furnitureConfirmPending === preparationToken) runtime.furnitureConfirmPending = null; }
            if (!ready) {
                if (transition === 'enter') rejectFurnitureTransition(id, token, transition);
                else { runtime.reason = 'furniture-exit-presentation-blocked'; runtime.blockedFurnitureSignature = updated?.signature; }
                return false;
            }
            if (currentFurnitureRuntime(id, token, phase) !== runtime) return false;
            if (activityPolicy.resolveFurniturePresentation) {
                updated = activityPolicy.resolveFurniturePresentation(runtime.id, interaction, runtime.instance.posture, runtime.generation);
                runtime.furnitureSolution = updated;
                if (!(transition === 'enter' ? updated?.available : updated?.facings.exit || runtime.pendingFurnitureExit)) {
                    if (transition === 'enter') rejectFurnitureTransition(id, token, transition);
                    else runtime.reason = 'furniture-exit-presentation-blocked';
                    return false;
                }
                runtime.furnitureFacing = updated.facings[transition] || runtime.furnitureFacing;
            }
            if (transition === 'exit' && !navigation.legalPoint(interaction.exitPoint)) return false;
            const complete = () => {
                if (currentFurnitureRuntime(id, token, activityPolicy.validateTraversal
                    ? (transition === 'enter' ? 'entering' : 'exiting') : phase) !== runtime) return;
                runtime.motion = null;
                runtime.presentationFoot = null;
                runtime.pendingFurnitureExit = null; runtime.furnitureTraversal = null;
                runtime.reason = '';
            runtime.foot = { ...(transition === 'enter' ? interaction.slotPoint : interaction.exitPoint) };
            runtime.localActivityPose = posture;
            runtime.ambientMotionPose = null;
            if (transition === 'enter') runtime.furnitureFacing = runtime.furnitureSolution?.facings.using || runtime.furnitureFacing;
            occupied.set(runtime.id, { ...runtime.foot });
            if (transition === 'enter') {
                runtime.instance.phase = 'using';
                runtime.instance.posture = posture;
                runtime.instance.lifecycleState = 'ACTIVE';
                runtime.instance.startedAt = now();
                if (runtime.instance.behaviorId) {
                    const behaviorId = runtime.instance.behaviorId;
                    const duration = activityPolicy.duration(runtime.id, runtime.decisions, behaviorId);
                    runtime.activityStartedAt = runtime.instance.startedAt;
                    runtime.activityExpectedEndAt = runtime.activityStartedAt + duration;
                    runtime.instance.expectedEndAt = runtime.activityExpectedEndAt;
                    runtime.behaviorHistory = [...(runtime.behaviorHistory || []), behaviorId].slice(-2);
                    runtime.postureHistory = [...(runtime.postureHistory || []), posture].slice(-2);
                    runtime.nextDecisionAt = runtime.activityExpectedEndAt;
                    runtime.visibleRestStartedAt = runtime.activityStartedAt;
                    note(runtime, 'behavior-started', behaviorId);
                    const instance = runtime.instance;
                    runtime.timer = setTimer(() => {
                        runtime.timer = null;
                        if (stillAuthorized(runtime, token.generation) && runtime.instance === instance)
                            requestFurnitureExit(runtime.id, token);
                    }, duration);
                }
                runtime.state = 'activity';
                note(runtime, 'furniture-enter-confirmed');
                publish();
            } else {
                runtime.lastAuthoredFoot = { ...runtime.foot };
                releaseTarget(runtime);
                endInstance(runtime, 'COMPLETED', 'furniture-exit-confirmed');
                runtime.state = 'settled';
                runtime.settledPersisted = activityPolicy.onStableSettle?.(runtime.id,
                    { ...runtime.foot }, runtime.entryKey) === true;
                publish();
                startStationaryActivity(runtime, activityPolicy.initial(posture) || 'rest', { groundOnly: true });
            }
            };
            if (!activityPolicy.validateTraversal) { complete(); return true; }
            let standing = false;
            try { standing = await prepareStandingVisual(runtime.id); } catch (_) { /* same guarded failure */ }
            if (currentFurnitureRuntime(id, token, phase) !== runtime) return false;
            let points = runtime.pendingFurnitureExit || (runtime.furnitureSolution
                ? (transition === 'enter' ? runtime.furnitureSolution.enterPoints : runtime.furnitureSolution.exitPoints)
                : transition === 'enter'
                    ? [interaction.approachPoint, ...(interaction.enterWaypoints || []), interaction.slotPoint]
                    : [interaction.slotPoint, ...(interaction.exitWaypoints || []), interaction.exitPoint]);
            let facings = !runtime.pendingFurnitureExit && runtime.furnitureSolution?.[transition + 'Facings'] ||
                points.slice(1).map(() => runtime.furnitureFacing);
            const validates = (route, faces) => route.slice(1).every((point, n) =>
                activityPolicy.validateTraversal(runtime.id, interaction, [route[n], point], faces[n], {from:route[n],to:point}));
            // Begin at the actual last displayed ground contact; never publish an
            // instantaneous jump to a derived access point.
            const displayed = transition === 'enter' && activityPolicy.getPresentationFoot?.(runtime.id);
            if (displayed && pointDistance(displayed, points[0]) > 0.01) {
                points = [{...displayed}, ...points]; facings = [facings[0], ...facings];
            }
            let traversalFits = standing && validates(points, facings);
            if (!traversalFits && transition === 'exit' && standing && runtime.pendingFurnitureExit) {
                const alternate = runtime.furnitureFacing === 'right' ? 'left' : 'right';
                const alternatives = points.slice(1).map(() => alternate);
                if (validates(points, alternatives)) { facings = alternatives; traversalFits = true; }
            }
            if (!traversalFits) {
                if (transition === 'enter') fallbackFurnitureBehavior(runtime, 'furniture-traversal-unavailable');
                else { runtime.reason = 'furniture-exit-presentation-blocked'; runtime.blockedFurnitureSignature = updated?.signature; }
                return false;
            }
            runtime.instance.phase = transition === 'enter' ? 'entering' : 'exiting';
            runtime.furnitureTraversal = {direction: transition, points, facings};
            runtime.furnitureFacing = facings[0];
            runtime.presentationFoot = { ...points[0] };
            runtime.ambientMotionPose = 'standing';
            const traversalPhase = runtime.instance.phase;
            runtime.motion = createRouteMovement({ points, speed: PROTOTYPE_SPEED, idleMs: 0, now, setTimer, clearTimer,
                requestFrame, cancelFrame,
                onPosition: (point, segment = 0) => {
                    if (currentFurnitureRuntime(id, token, traversalPhase) !== runtime) return;
                    const face = runtime.furnitureTraversal?.facings[segment] || runtime.furnitureFacing;
                    // At a direction boundary the preflight proved both adjacent
                    // silhouettes legal. Current ticks never solve the whole cycle.
                    if (!activityPolicy.validateTraversal(runtime.id, interaction, [point], face, {from:points[segment],to:points[segment+1]})) {
                        holdFurnitureTraversal(runtime); return;
                    }
                    runtime.furnitureTraversal.segment = segment;
                    runtime.furnitureFacing = face;
                    runtime.presentationFoot = { ...point };
                    // TEMP HALL HITCH DIAGNOSTIC.
                    onDiagnosticPosition?.(runtime.id, runtime.instance?.id, runtime.generation, segment);
                    publish();
                },
                onArrival: () => { if (currentFurnitureRuntime(id, token, traversalPhase) === runtime) complete(); }
            });
            publish(); runtime.motion.start();
            return true;
        };
        return { reconcile, cancel, pause, resume, stop, snapshot, debugSnapshot, idleDelay,
            requestFurnitureInteraction, requestFurnitureExit, confirmFurnitureTransition, rejectFurnitureTransition, reconcileFurniturePresentation };
    };

    Meeow.hallSpatial = Object.freeze({
        CANONICAL_SIZE, PROTOTYPE_SPEED, PROTOTYPE_IDLE_MS, ROOMS, getRoom,
        pointInRect, pointInObstacle, pointIsWalkable, segmentIsWalkable,
        projectFoot, measureStageContent, statusAcceptanceAdvanced,
        newlyAcceptedResidentScene, createRouteMovement, createOneShotMovement, placementFootFromStyle,
        ambientEntrySlot, validateAmbientGraph, resolvePresentationFoot, createAmbientSimulation, orderSceneEntities
    });
}(window));
