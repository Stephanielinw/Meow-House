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

    const createOneShotMovement = ({ from, to, speed = PROTOTYPE_SPEED, idleMs = PROTOTYPE_IDLE_MS,
        now = () => global.performance.now(), requestFrame = callback => global.requestAnimationFrame(callback),
        cancelFrame = id => global.cancelAnimationFrame(id), setTimer = (callback, ms) => global.setTimeout(callback, ms),
        clearTimer = id => global.clearTimeout(id), onPosition, onArrival }) => {
        if (!finitePoint(from) || !finitePoint(to) || !(speed > 0) || !(idleMs >= 0) ||
            typeof onPosition !== 'function') throw new TypeError('valid movement endpoints, speed, and callback required');
        let generation = 0;
        let timer = null;
        let frame = null;
        let state = 'idle';
        let startedAt = 0;
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
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
            onPosition({ x: from.x, y: from.y });
            if (generation !== token) return true;
            timer = setTimer(() => {
                timer = null;
                if (generation !== token) return;
                state = 'moving';
                startedAt = now();
                const tick = () => {
                    frame = null;
                    if (generation !== token) return;
                    const fraction = distance === 0 ? 1 : Math.min(1, Math.max(0, (now() - startedAt) * speed / (1000 * distance)));
                    const point = fraction === 1 ? { x: to.x, y: to.y } : {
                        x: from.x + (to.x - from.x) * fraction,
                        y: from.y + (to.y - from.y) * fraction
                    };
                    onPosition(point);
                    if (generation !== token) return;
                    if (fraction === 1) {
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

    // All authority here is transient. The caller supplies current production
    // placement, keyed by stable resident ID, whenever authoritative placement changes.
    const createAmbientSimulation = ({ room, getAuthoritativePose = () => '',
        canOwnResident = () => true, prepareStandingVisual = () => true,
        isStandingVisualReady = () => true, now = () => global.performance.now(),
        setTimer = (callback, ms) => global.setTimeout(callback, ms),
        clearTimer = id => global.clearTimeout(id),
        requestFrame = callback => global.requestAnimationFrame(callback),
        cancelFrame = id => global.cancelAnimationFrame(id), onChange = () => {} }) => {
        if (!validateAmbientGraph(room)) throw new Error('invalid ambient graph');
        const STAND_UP_MS = 350, SETTLE_MS = 350, VISUAL_TIMEOUT_MS = 5000, VISUAL_POLL_MS = 50;
        const residents = new Map(), occupied = new Map(), reserved = new Map();
        let entries = [], active = false;
        const publish = () => onChange(snapshot());
        const hash = value => {
            let result = 2166136261;
            for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
            return result >>> 0;
        };
        const idleDelay = (id, cycle) => 1200 + hash(`${id}:${cycle}:idle`) % 1601;
        const normalizedAuthority = id => {
            const pose = getAuthoritativePose(id);
            return pose === 'standing' || pose === 'sitting' || pose === 'crouching' || pose === 'lying'
                ? pose : '';
        };
        const releaseTarget = runtime => {
            if (reserved.get(runtime.target) === runtime.id) reserved.delete(runtime.target);
            runtime.target = null;
        };
        const clearRuntime = runtime => {
            if (runtime.timer !== null) clearTimer(runtime.timer);
            if (runtime.visualTimeout !== null) clearTimer(runtime.visualTimeout);
            runtime.timer = null;
            runtime.visualTimeout = null;
            runtime.motion?.cancel();
            runtime.motion = null;
            if (occupied.get(runtime.slot) === runtime.id) occupied.delete(runtime.slot);
            releaseTarget(runtime);
            runtime.ambientMotionPose = null;
            runtime.nextDecisionAt = null;
        };
        const snapshot = () => ({
            residents: [...residents.values()].map(runtime => ({ id: runtime.id, state: runtime.state,
                slot: runtime.slot, target: runtime.target, foot: { ...runtime.foot },
                nextDecisionAt: runtime.nextDecisionAt, reason: runtime.reason, cycles: runtime.cycles,
                authoritativePose: runtime.authoritativePose, ambientMotionPose: runtime.ambientMotionPose,
                transitionPhase: runtime.transitionPhase, transitionGeneration: runtime.generation })),
            occupied: Object.fromEntries(occupied), reserved: Object.fromEntries(reserved)
        });
        const ownsCurrentRuntime = (runtime, token) => active && residents.get(runtime.id) === runtime &&
            runtime.generation === token;
        const park = runtime => {
            runtime.generation += 1;
            clearRuntime(runtime);
            residents.delete(runtime.id);
            publish();
            // Current entry and current Status are read again; no old route or pose returns.
            claimEntries();
        };
        const stillAuthorized = (runtime, token) => {
            if (!ownsCurrentRuntime(runtime, token)) return false;
            if (!canOwnResident(runtime.id) || normalizedAuthority(runtime.id) !== runtime.authoritativePose) {
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
                const free = room.ambientSlots[runtime.slot].neighbors.filter(slot =>
                    !occupied.has(slot) && !reserved.has(slot));
                if (!free.length) {
                    runtime.reason = 'no-free-target';
                    schedule(runtime, idleDelay(runtime.id, runtime.decisions));
                    return;
                }
                runtime.target = free[hash(`${runtime.id}:${runtime.decisions}:target`) % free.length];
                reserved.set(runtime.target, runtime.id);
                runtime.reason = '';
                beginTransition(runtime);
            }, delay);
            publish();
        };
        const abortRoam = (runtime, reason) => {
            runtime.generation += 1;
            if (runtime.timer !== null) clearTimer(runtime.timer);
            if (runtime.visualTimeout !== null) clearTimer(runtime.visualTimeout);
            runtime.timer = null;
            runtime.visualTimeout = null;
            releaseTarget(runtime);
            runtime.ambientMotionPose = null;
            runtime.transitionPhase = '';
            runtime.reason = reason;
            schedule(runtime, idleDelay(runtime.id, runtime.decisions));
        };
        const startMovement = (runtime, token) => {
            if (!stillAuthorized(runtime, token)) return;
            if (reserved.get(runtime.target) !== runtime.id || !isStandingVisualReady(runtime.id)) {
                abortRoam(runtime, 'standing-visual-unavailable'); return;
            }
            const target = runtime.target;
            const from = room.ambientSlots[runtime.slot], to = room.ambientSlots[target];
            runtime.state = 'moving';
            runtime.transitionPhase = '';
            runtime.motion = createOneShotMovement({ from, to, idleMs: 0, now, setTimer, clearTimer,
                requestFrame, cancelFrame, onPosition: point => {
                    if (!stillAuthorized(runtime, token)) return;
                    if (!isStandingVisualReady(runtime.id)) { park(runtime); return; }
                    runtime.foot = point;
                    publish();
                }, onArrival: () => {
                    if (!stillAuthorized(runtime, token)) return;
                    if (!isStandingVisualReady(runtime.id)) { park(runtime); return; }
                    if (occupied.get(runtime.slot) === runtime.id) occupied.delete(runtime.slot);
                    releaseTarget(runtime);
                    occupied.set(target, runtime.id);
                    runtime.slot = target;
                    runtime.motion = null;
                    runtime.foot = { x: to.x, y: to.y };
                    runtime.cycles += 1;
                    runtime.state = 'settling';
                    runtime.transitionPhase = 'standing-settle';
                    publish();
                    claimEntries();
                    runtime.timer = setTimer(() => {
                        runtime.timer = null;
                        if (!stillAuthorized(runtime, token)) return;
                        // Clearing the override resolves the latest accepted Status pose.
                        runtime.ambientMotionPose = null;
                        runtime.transitionPhase = '';
                        runtime.state = 'settled';
                        publish();
                        schedule(runtime, idleDelay(runtime.id, runtime.decisions));
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
                if (runtime.authoritativePose === 'standing') {
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
            if (!active) return;
            for (const entry of entries) {
                if (residents.has(entry.id) || !room.ambientSlots[entry.slot] || !canOwnResident(entry.id)) continue;
                const owner = occupied.get(entry.slot) || reserved.get(entry.slot);
                const pose = normalizedAuthority(entry.id);
                const runtime = { id: entry.id, entryKey: entry.key, entrySlot: entry.slot, slot: entry.slot,
                    foot: { x: room.ambientSlots[entry.slot].x, y: room.ambientSlots[entry.slot].y },
                    target: null, timer: null, visualTimeout: null, motion: null, generation: 0,
                    cycles: 0, decisions: 0, authoritativePose: pose, ambientMotionPose: null,
                    transitionPhase: '', nextDecisionAt: null,
                    state: owner ? 'suspended' : pose ? 'idle' : 'stationary',
                    reason: owner ? 'entry-slot-conflict' : pose ? '' : 'missing-authoritative-pose' };
                residents.set(entry.id, runtime);
                if (!owner) {
                    occupied.set(entry.slot, entry.id);
                    if (pose) schedule(runtime, idleDelay(entry.id, 0));
                }
            }
            for (const entry of entries) {
                const runtime = residents.get(entry.id);
                if (runtime?.state !== 'suspended' || runtime.reason !== 'entry-slot-conflict' ||
                    !canOwnResident(entry.id) || occupied.has(entry.slot) || reserved.has(entry.slot)) continue;
                occupied.set(entry.slot, entry.id);
                const pose = normalizedAuthority(entry.id);
                runtime.authoritativePose = pose;
                runtime.state = pose ? 'idle' : 'stationary';
                runtime.reason = pose ? '' : 'missing-authoritative-pose';
                if (pose) schedule(runtime, idleDelay(entry.id, runtime.decisions));
            }
            publish();
        };
        const cancel = (id, reason = 'authoritative-event', cooldown = 1800) => {
            const runtime = residents.get(String(id));
            if (!runtime) return;
            runtime.generation += 1;
            clearRuntime(runtime);
            residents.delete(runtime.id);
            publish();
            if (!active) return;
            const entry = entries.find(item => item.id === runtime.id);
            if (!entry || !cooldown || !canOwnResident(entry.id)) { claimEntries(); return; }
            const pose = normalizedAuthority(entry.id);
            if (!pose) { claimEntries(); return; }
            const token = { id: runtime.id, entryKey: entry.key, entrySlot: entry.slot, slot: entry.slot,
                foot: { x: room.ambientSlots[entry.slot].x, y: room.ambientSlots[entry.slot].y },
                target: null, timer: null, visualTimeout: null, motion: null, generation: 0,
                cycles: runtime.cycles, decisions: runtime.decisions, authoritativePose: pose,
                ambientMotionPose: null, transitionPhase: '', nextDecisionAt: now() + cooldown,
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
            entries = active ? nextEntries.filter(entry => entry && entry.id && room.ambientSlots[entry.slot])
                .map(entry => ({ id: String(entry.id), slot: entry.slot, key: String(entry.key),
                    authoritativePose: String(entry.authoritativePose || '') })) : [];
            const current = new Map(entries.map(entry => [entry.id, entry]));
            for (const runtime of [...residents.values()]) {
                const entry = current.get(runtime.id);
                if (entry && canOwnResident(runtime.id) && entry.key === runtime.entryKey &&
                    entry.slot === runtime.entrySlot && entry.authoritativePose === runtime.authoritativePose) continue;
                runtime.generation += 1;
                clearRuntime(runtime);
                residents.delete(runtime.id);
            }
            claimEntries();
        };
        const stop = (reason = 'stopped') => {
            active = false; entries = [];
            for (const runtime of residents.values()) { runtime.generation += 1; clearRuntime(runtime); }
            residents.clear(); occupied.clear(); reserved.clear();
            publish();
        };
        return { reconcile, cancel, stop, snapshot, idleDelay };
    };

    Meeow.hallSpatial = Object.freeze({
        CANONICAL_SIZE, PROTOTYPE_SPEED, PROTOTYPE_IDLE_MS, ROOMS, getRoom,
        pointInRect, pointInObstacle, pointIsWalkable, segmentIsWalkable,
        projectFoot, measureStageContent, statusAcceptanceAdvanced,
        newlyAcceptedResidentScene, createOneShotMovement, placementFootFromStyle,
        ambientEntrySlot, validateAmbientGraph, createAmbientSimulation
    });
}(window));
