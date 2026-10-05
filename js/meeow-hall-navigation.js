(function (global) {
    'use strict';

    const Meeow = global.Meeow = global.Meeow || {};
    const GRID_STEP = 4;
    const DESTINATION_SEPARATION = 48; // Endpoint reservation only; never mask clearance.
    const CURATOR_SOURCE = 'assets/meeow-map/curator/spatial/curator-room-spatial-source.json';
    const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const hash = value => {
        let result = 2166136261;
        for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
        return result >>> 0;
    };

    // The authored rug is floor-level and explicitly direct-floor-continuous.
    // Only short, straight unpainted runs between that rug and authored floor
    // may be traversed. The result is never an authored endpoint or surface.
    const buildDirectFloorSeam = ({ width, height, floor, rug, excluded, maxGap = 5 }) => {
        if (floor?.length !== width * height || rug?.length !== width * height ||
            excluded?.length !== width * height || !Number.isInteger(maxGap) || maxGap < 1)
            throw new TypeError('valid seam masks required');
        const seam = new Uint8Array(width * height);
        for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
            if (!rug[y * width + x]) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const gap = [];
                for (let step = 1; step <= maxGap + 1; step += 1) {
                    const nx = x + dx * step, ny = y + dy * step;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) break;
                    const index = ny * width + nx;
                    if (excluded[index] || rug[index]) break;
                    if (floor[index]) {
                        if (gap.length && gap.length <= maxGap)
                            for (const candidate of gap) seam[candidate] = 1;
                        break;
                    }
                    gap.push(index);
                }
            }
        }
        return seam;
    };

    const createRasterDomain = ({ width, height, floor, rug, seam = null, step = GRID_STEP,
        floorId = 'curator-floor', rugId = 'curator-rug-surface' }) => {
        if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(step) ||
            width <= 0 || height <= 0 || step <= 0 ||
            width % step || height % step || floor?.length !== width * height || rug?.length !== width * height ||
            (seam && seam.length !== width * height))
            throw new TypeError('valid equal-sized raster masks required');
        const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
        const authoredPixel = (x, y) => inBounds(x, y) &&
            Boolean(floor[y * width + x] || rug[y * width + x]);
        const legalPixel = (x, y) => inBounds(x, y) &&
            Boolean(floor[y * width + x] || rug[y * width + x] || seam?.[y * width + x]);
        const pointOn = (point, predicate) => finitePoint(point) &&
            predicate(Math.floor(point.x + 0.5), Math.floor(point.y + 0.5));
        const legalPoint = point => pointOn(point, authoredPixel);
        const transitPoint = point => pointOn(point, legalPixel);
        const surfaceAt = point => {
            if (!legalPoint(point)) return null;
            const index = Math.floor(point.y + 0.5) * width + Math.floor(point.x + 0.5);
            return rug[index] ? rugId : floorId;
        };
        // Supercover traversal examines every pixel touched by the foot segment.
        // Integer world coordinates denote pixel centers, avoiding boundary ambiguity.
        const lineIsLegal = (from, to) => {
            if (!transitPoint(from) || !transitPoint(to)) return false;
            let x = Math.floor(from.x + 0.5), y = Math.floor(from.y + 0.5);
            const endX = Math.floor(to.x + 0.5), endY = Math.floor(to.y + 0.5);
            const ax = from.x + 0.5, ay = from.y + 0.5;
            const bx = to.x + 0.5, by = to.y + 0.5;
            const dx = bx - ax, dy = by - ay;
            const sx = Math.sign(dx), sy = Math.sign(dy);
            let tx = sx ? ((sx > 0 ? x + 1 : x) - ax) / dx : Infinity;
            let ty = sy ? ((sy > 0 ? y + 1 : y) - ay) / dy : Infinity;
            const dtx = sx ? 1 / Math.abs(dx) : Infinity;
            const dty = sy ? 1 / Math.abs(dy) : Infinity;
            while (x !== endX || y !== endY) {
                if (tx + 1e-12 < ty) { x += sx; tx += dtx; }
                else if (ty + 1e-12 < tx) { y += sy; ty += dty; }
                else {
                    if (!legalPixel(x + sx, y) || !legalPixel(x, y + sy)) return false;
                    x += sx; y += sy; tx += dtx; ty += dty;
                }
                if (!legalPixel(x, y)) return false;
            }
            return true;
        };
        const lastAuthoredOnSegment = (from, to) => {
            if (!finitePoint(from) || !finitePoint(to)) return null;
            const steps = Math.max(1, Math.ceil(distance(from, to) * 2));
            let last = null;
            for (let index = 0; index <= steps; index += 1) {
                const fraction = index / steps;
                const point = { x: from.x + (to.x - from.x) * fraction,
                    y: from.y + (to.y - from.y) * fraction };
                if (legalPoint(point)) last = point;
            }
            return last;
        };
        const columns = width / step, rows = height / step, size = columns * rows;
        const passable = new Uint8Array(size), component = new Int32Array(size);
        component.fill(-1);
        const cellPoint = index => ({ x: (index % columns) * step + step / 2,
            y: Math.floor(index / columns) * step + step / 2 });
        for (let cy = 0; cy < rows; cy += 1) for (let cx = 0; cx < columns; cx += 1) {
            passable[cy * columns + cx] = Number(transitPoint(cellPoint(cy * columns + cx)));
        }
        const edges = new Uint8Array(size);
        for (let index = 0; index < size; index += 1) {
            if (!passable[index]) continue;
            const x = index % columns, y = Math.floor(index / columns);
            if (x + 1 < columns && passable[index + 1] &&
                lineIsLegal(cellPoint(index), cellPoint(index + 1))) {
                edges[index] |= 2; edges[index + 1] |= 1;
            }
            if (y + 1 < rows && passable[index + columns] &&
                lineIsLegal(cellPoint(index), cellPoint(index + columns))) {
                edges[index] |= 8; edges[index + columns] |= 4;
            }
        }
        const neighbors = index => {
            const flags = edges[index];
            return [flags & 1 ? index - 1 : -1, flags & 2 ? index + 1 : -1,
                flags & 4 ? index - columns : -1, flags & 8 ? index + columns : -1]
                .filter(next => next >= 0);
        };
        const cellsByComponent = [];
        for (let index = 0; index < size; index += 1) {
            if (!passable[index] || component[index] !== -1) continue;
            const id = cellsByComponent.length, cells = [], queue = [index];
            component[index] = id;
            for (let head = 0; head < queue.length; head += 1) {
                const current = queue[head]; cells.push(current);
                for (const next of neighbors(current)) if (component[next] === -1) {
                    component[next] = id; queue.push(next);
                }
            }
            cellsByComponent.push(cells);
        }
        const cellFor = point => {
            if (!transitPoint(point)) return -1;
            const cx = Math.floor(point.x / step), cy = Math.floor(point.y / step);
            const index = cy * columns + cx;
            if (passable[index] && lineIsLegal(point, cellPoint(index))) return index;
            let nearest = -1, best = Infinity;
            for (let radius = 1; radius <= 3; radius += 1) {
                for (let y = Math.max(0, cy - radius); y <= Math.min(rows - 1, cy + radius); y += 1)
                    for (let x = Math.max(0, cx - radius); x <= Math.min(columns - 1, cx + radius); x += 1) {
                        const candidate = y * columns + x;
                        if (!passable[candidate]) continue;
                        const foot = cellPoint(candidate), gap = distance(point, foot);
                        if (gap < best && lineIsLegal(point, foot)) { nearest = candidate; best = gap; }
                    }
                if (nearest >= 0) break;
            }
            return nearest;
        };
        const componentAt = point => {
            const cell = cellFor(point);
            return cell < 0 ? -1 : component[cell];
        };
        return { width, height, step, floor, rug, seam, columns, rows, passable, component,
            cellsByComponent, legalPoint, transitPoint, surfaceAt, lineIsLegal,
            lastAuthoredOnSegment, cellPoint, neighbors, cellFor, componentAt };
    };

    const makeHeap = () => {
        const entries = [];
        const push = item => {
            let i = entries.length; entries.push(item);
            while (i) {
                const parent = (i - 1) >> 1;
                if (entries[parent].f <= item.f) break;
                entries[i] = entries[parent]; i = parent;
            }
            entries[i] = item;
        };
        const pop = () => {
            const result = entries[0], tail = entries.pop();
            if (entries.length) {
                let i = 0;
                while (i * 2 + 1 < entries.length) {
                    let child = i * 2 + 1;
                    if (child + 1 < entries.length && entries[child + 1].f < entries[child].f) child += 1;
                    if (tail.f <= entries[child].f) break;
                    entries[i] = entries[child]; i = child;
                }
                entries[i] = tail;
            }
            return result;
        };
        return { push, pop, get length() { return entries.length; } };
    };
    const planRoute = (domain, from, destination) => {
        if (!domain?.legalPoint(from) || !domain.legalPoint(destination)) return { valid: false, reason: 'illegal-endpoint' };
        // Full-pixel geometry outranks the coarser search graph.
        if (domain.lineIsLegal(from, destination)) {
            const points = [{ x: from.x, y: from.y }, { x: destination.x, y: destination.y }];
            return { valid: true, componentId: domain.componentAt(from), raw: points, points,
                distance: distance(from, destination) };
        }
        const start = domain.cellFor(from), goal = domain.cellFor(destination);
        if (start < 0 || goal < 0 || domain.component[start] !== domain.component[goal])
            return { valid: false, reason: 'disconnected' };
        const count = domain.passable.length, score = new Float64Array(count), previous = new Int32Array(count);
        score.fill(Infinity); previous.fill(-1);
        const closed = new Uint8Array(count), heap = makeHeap();
        const goalX = goal % domain.columns, goalY = Math.floor(goal / domain.columns);
        const heuristic = index => (Math.abs(index % domain.columns - goalX) +
            Math.abs(Math.floor(index / domain.columns) - goalY)) * domain.step;
        score[start] = 0; heap.push({ index: start, g: 0, f: heuristic(start) });
        let expanded = 0;
        while (heap.length && expanded < count) {
            const node = heap.pop();
            if (closed[node.index] || node.g !== score[node.index]) continue;
            closed[node.index] = 1; expanded += 1;
            if (node.index === goal) break;
            for (const next of domain.neighbors(node.index)) {
                if (closed[next]) continue;
                const candidate = node.g + domain.step;
                if (candidate >= score[next]) continue;
                score[next] = candidate; previous[next] = node.index;
                heap.push({ index: next, g: candidate, f: candidate + heuristic(next) });
            }
        }
        if (!closed[goal]) return { valid: false, reason: 'no-route' };
        const indices = [];
        for (let at = goal; at !== -1; at = previous[at]) indices.push(at);
        indices.reverse();
        const raw = [{ x: from.x, y: from.y }, ...indices.map(domain.cellPoint),
            { x: destination.x, y: destination.y }];
        const points = [raw[0]];
        for (let at = 0; at < raw.length - 1;) {
            let farthest = at + 1;
            for (let candidate = raw.length - 1; candidate > at + 1; candidate -= 1)
                if (domain.lineIsLegal(raw[at], raw[candidate])) { farthest = candidate; break; }
            if (!domain.lineIsLegal(raw[at], raw[farthest])) return { valid: false, reason: 'unsafe-segment' };
            points.push(raw[farthest]); at = farthest;
        }
        const length = points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);
        return { valid: true, componentId: domain.component[start], raw, points, distance: length };
    };

    const sampleDestination = (domain, { from, claims = [], recent = [], seed = 0,
        separation = DESTINATION_SEPARATION, acceptsPresentation = () => true } = {}) => {
        const componentId = domain?.componentAt(from);
        if (componentId < 0) return null;
        const bands = [[], [], [], [], []];
        for (const index of domain.cellsByComponent[componentId]) {
            const point = domain.cellPoint(index), gap = distance(from, point);
            if (!domain.legalPoint(point) || !acceptsPresentation(point) || gap < 32 ||
                claims.some(claim => distance(claim, point) < separation)) continue;
            const repeat = recent.some(prior => distance(prior, point) < 64);
            const band = gap < 72 ? 3 : gap <= 180 ? 0 : gap <= 350 ? 1 : gap <= 500 ? 2 : 4;
            bands[repeat ? 5 : band] ||= [];
            bands[repeat ? 5 : band].push(point);
        }
        const chosen = hash(seed) % 100;
        const preferred = chosen < 35 ? 0 : chosen < 85 ? 1 : 2;
        const order = [preferred, ...[0, 1, 2].filter(band => band !== preferred), 3, 4, 5];
        const options = order.map(band => bands[band]).find(group => group?.length);
        return options ? options[hash(`${seed}:point`) % options.length] : null;
    };

    // Interaction surfaces are occupiable only through an explicit instance
    // transition. They never become ordinary floor navigation pixels.
    const validateFurnitureInteractions = (source, domain, surfaceMasks) => {
        const rows = source.furnitureInteractions || [];
        if (!Array.isArray(rows)) throw new Error('interaction-metadata-invalid');
        const ids = new Set();
        const point = value => value && Number.isInteger(value.x) && Number.isInteger(value.y) &&
            value.x >= 0 && value.y >= 0 && value.x < domain.width && value.y < domain.height;
        const name = value => typeof value === 'string' && value.length > 0 && value === value.trim();
        return Object.freeze(rows.map(row => {
            const surface = source.interactiveWalkableSurfaces.find(item => item.surfaceId === row?.surfaceId);
            const mask = surfaceMasks[row?.surfaceId];
            const foreground = [source.occlusionCandidate, ...(source.foregroundRelations || [])]
                .find(item => item?.mask === row?.presentation?.foregroundMask);
            if (row?.presentation?.foregroundMask != null &&
                (foreground?.runtimeClippingEnabled !== true ||
                 row.presentation.foregroundMask !== foreground.mask ||
                 foreground.ownerLayer !== surface?.ownerLayer ||
                 !foreground.relatedSurfaceIds?.includes(row.surfaceId) ||
                 (row.presentation.foregroundRelationId != null &&
                  row.presentation.foregroundRelationId !== foreground.relationId) ||
                 !/^spatial\/[a-z0-9-]+\.png$/.test(foreground.mask)))
                throw new Error('interaction-foreground-invalid');
            if (!row || !name(row.slotId) || ids.has(row.slotId) || !name(row.furnitureId) ||
                !name(row.affordance) || (row.behaviors != null && (!Array.isArray(row.behaviors) ||
                row.behaviors.some(id => !name(id)) || new Set(row.behaviors).size !== row.behaviors.length)) ||
                row.exclusive !== true || !surface ||
                surface.currentConnectivity !== 'requires-future-transition' ||
                mask?.length !== domain.width * domain.height || !point(row.slotPoint) ||
                !mask[row.slotPoint.y * domain.width + row.slotPoint.x] ||
                domain.legalPoint(row.slotPoint) || !point(row.approachPoint) || !point(row.exitPoint) ||
                !domain.legalPoint(row.approachPoint) || !domain.legalPoint(row.exitPoint) ||
                !planRoute(domain, row.approachPoint, row.exitPoint).valid ||
                !['standing', 'sitting', 'crouching', 'lying'].includes(row.posture) ||
                (row.postures != null && (!Array.isArray(row.postures) || !row.postures.length ||
                    !row.postures.includes(row.posture) || new Set(row.postures).size !== row.postures.length ||
                    row.postures.some(pose => !['sitting', 'lying'].includes(pose)))) ||
                row.presentation?.aboveLayer !== surface.ownerLayer ||
                !source.layerOrder.includes(surface.ownerLayer)) throw new Error('interaction-metadata-invalid');
            if (row.enterWaypoints != null && (!Array.isArray(row.enterWaypoints) ||
                row.enterWaypoints.some(value => !point(value)))) throw new Error('interaction-traversal-invalid');
            if (row.exitWaypoints != null && (!Array.isArray(row.exitWaypoints) ||
                row.exitWaypoints.some(value => !point(value)))) throw new Error('interaction-traversal-invalid');
            const access = row.traversalAccess;
            if (access && (access.ownerLayer !== surface.ownerLayer || !Array.isArray(access.segments) ||
                access.segments.some(segment => !point(segment.from) || !point(segment.to) ||
                    !Array.isArray(segment.surfaceIds) || segment.surfaceIds.some(id =>
                        source.interactiveWalkableSurfaces.find(s => s.surfaceId === id)?.ownerLayer !== surface.ownerLayer) ||
                    typeof segment.foreground !== 'boolean'))) throw new Error('interaction-traversal-invalid');
            const contact = row.presentation?.supportContact;
            if (contact && (contact.pose !== row.posture || !Array.isArray(contact.runs) ||
                contact.runs.some(run => run.length !== 3 || run.some(n => !Number.isInteger(n)) ||
                    run[0] < 0 || run[0] >= 1024 || run[1] < 0 || run[2] > 1024 || run[1] >= run[2])))
                throw new Error('interaction-support-contact-invalid');
            const solutions = row.presentation?.solutions || [];
            const enter = [row.approachPoint, ...(row.enterWaypoints || []), row.slotPoint];
            const exit = [row.slotPoint, ...(row.exitWaypoints || [...(row.enterWaypoints || [])].reverse()), row.exitPoint];
            const same = (a, b) => a.x === b.x && a.y === b.y;
            const facing = value => ['left', 'right'].includes(value);
            if (!Array.isArray(solutions) || solutions.some(solution =>
                !Number.isFinite(solution.stageWidth) || solution.stageWidth <= 0 ||
                !['sitting', 'lying', 'standing', 'crouching'].includes(solution.pose) ||
                !facing(solution.preferredFacing) || !facing(solution.usingFacing) ||
                !Array.isArray(solution.enterPoints) || !Array.isArray(solution.exitPoints) ||
                solution.enterPoints.length !== enter.length || solution.exitPoints.length !== exit.length ||
                [...solution.enterPoints, ...solution.exitPoints].some(p => !point(p)) ||
                solution.enterPoints.slice(1).some((p, i) => !same(p, enter[i + 1])) ||
                solution.exitPoints.slice(0, -1).some((p, i) => !same(p, exit[i])) ||
                distance(solution.enterPoints[0], row.approachPoint) > 144 ||
                distance(solution.exitPoints.at(-1), row.exitPoint) > 144 ||
                !domain.legalPoint(solution.enterPoints[0]) || !domain.legalPoint(solution.exitPoints.at(-1)) ||
                !Array.isArray(solution.enterFacings) || !Array.isArray(solution.exitFacings) ||
                solution.enterFacings.length !== enter.length - 1 || solution.exitFacings.length !== exit.length - 1 ||
                [...solution.enterFacings, ...solution.exitFacings].some(value => !facing(value))))
                throw new Error('interaction-presentation-solution-invalid');
            ids.add(row.slotId);
            return Object.freeze({ slotId: row.slotId, furnitureId: row.furnitureId,
                surfaceId: row.surfaceId, exclusive: true, affordance: row.affordance, posture: row.posture,
                ...(row.postures ? { postures: Object.freeze([...row.postures]) } : {}),
                behaviors: Object.freeze([...(row.behaviors || [])]),
                slotPoint: Object.freeze({ ...row.slotPoint }),
                approachPoint: Object.freeze({ ...row.approachPoint }),
                exitPoint: Object.freeze({ ...row.exitPoint }),
                enterWaypoints: Object.freeze((row.enterWaypoints || []).map(value => Object.freeze({ ...value }))),
                exitWaypoints: Object.freeze((row.exitWaypoints || [...(row.enterWaypoints || [])].reverse()).map(value => Object.freeze({ ...value }))),
                traversalAccess: access ? Object.freeze({ ownerLayer: access.ownerLayer,
                    segments: Object.freeze(access.segments.map(segment => Object.freeze({ ...segment,
                        from: Object.freeze({ ...segment.from }), to: Object.freeze({ ...segment.to }),
                        surfaceIds: Object.freeze([...segment.surfaceIds]) }))) }) : null,
                presentation: Object.freeze({ aboveLayer: surface.ownerLayer,
                    traversalDisabled: row.presentation.traversalDisabled === true,
                    solutions: Object.freeze(solutions.map(solution => Object.freeze({ ...solution,
                        enterPoints: Object.freeze(solution.enterPoints.map(p => Object.freeze({ ...p }))),
                        exitPoints: Object.freeze(solution.exitPoints.map(p => Object.freeze({ ...p }))),
                        enterFacings: Object.freeze([...solution.enterFacings]), exitFacings: Object.freeze([...solution.exitFacings]) }))),
                    ...(contact ? { supportContact: Object.freeze({ pose: contact.pose, runs: Object.freeze(contact.runs.map(run => Object.freeze([...run]))) }) } : {}),
                    ...(row.presentation.foregroundMask ?
                        { foregroundMask: `${source.assetBase}/${row.presentation.foregroundMask}`,
                          ...(row.presentation.foregroundRelationId ?
                              { foregroundRelationId: row.presentation.foregroundRelationId } : {}) } : {}) }) });
        }));
    };

    const pointOnSegment = (p, a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
        const t = squared ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / squared : 0;
        return t >= -0.00001 && t <= 1.00001 && Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t) < 0.01;
    };
    const attachPresentationClearance = (domain, source, masks) => {
        const clearance = source.presentationClearance;
        const solidMasks = clearance ? Object.entries(clearance.solidMasks || {}).map(([owner, path]) =>
            [owner, masks[path.replace('spatial/', '')]]) : [];
        const solidBounds = solidMasks.map(([owner, mask]) => {
            let left = 1024, top = 1024, right = 0, bottom = 0;
            for (let index = 0; index < mask.length; index++) if (mask[index]) {
                const x = index % 1024, y = Math.floor(index / 1024);
                left = Math.min(left, x); top = Math.min(top, y);
                right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
            }
            return { left, top, right, bottom,
                frontEdge: Math.max(...(clearance.solidFrontEdges?.[owner] || [])) };
        });
        if (clearance && (!solidMasks.length ||
            !masks[clearance.groundEntryMask?.replace('spatial/', '')] ||
            solidMasks.some(([owner, mask]) => !source.layerOrder.includes(owner) || !mask ||
                !Array.isArray(clearance.solidFrontEdges?.[owner]) || clearance.solidFrontEdges[owner].length !== 1024 ||
                clearance.solidFrontEdges[owner].some(y => !Number.isInteger(y) || y < 0 || y > 1024)) ||
            source.interactiveWalkableSurfaces.some(row =>
                !masks[clearance.surfaceAllowanceMasks?.[row.surfaceId]?.replace('spatial/', '')])))
            throw new Error('presentation-clearance-source-invalid');
        domain.groundPresentationPoint = point => !clearance || Boolean(finitePoint(point) &&
            point.x >= 0 && point.y >= 0 && point.x < 1024 && point.y < 1024 &&
            masks[clearance.groundEntryMask.replace('spatial/', '')]?.[Math.floor(point.y) * 1024 + Math.floor(point.x)]);
        const contactMasks = new Map(domain.getInteractions().filter(i => i.presentation.supportContact).map(i => {
            const mask = new Uint8Array(1024 * 1024);
            for (const [y, start, end] of i.presentation.supportContact.runs) mask.fill(1, y * 1024 + start, y * 1024 + end);
            return [i.slotId, mask];
        }));
        const accessSegments = (interaction, foot, segment) => interaction?.traversalAccess?.segments.filter(authored => {
            if (pointOnSegment(foot, authored.from, authored.to)) return true;
            if (!segment || !finitePoint(segment.from) || !finitePoint(segment.to) || !pointOnSegment(foot,segment.from,segment.to)) return false;
            const same = (a,b) => a.x === b.x && a.y === b.y;
            const groundAdjustment = (point, authoredPoint) =>
                (same(authoredPoint,interaction.approachPoint) || same(authoredPoint,interaction.exitPoint)) &&
                distance(point,authoredPoint) <= 144 && domain.legalPoint(point) && domain.groundPresentationPoint(point);
            return (same(segment.to,authored.to) && groundAdjustment(segment.from,authored.from)) ||
                (same(segment.from,authored.to) && groundAdjustment(segment.to,authored.from)) ||
                (same(segment.from,authored.from) && groundAdjustment(segment.to,authored.to)) ||
                (same(segment.to,authored.from) && groundAdjustment(segment.from,authored.to));
        }) || [];
        domain.presentationFits = (frame, foot, scale, slotId = null, mirrored = false, diagnostic = null) => {
            if (!clearance) return true;
            if (!frame?.data || !finitePoint(foot) || !(scale > 0) || !Number.isFinite(scale)) return false;
            let rejected = false;
            const reject = (reason, owner = null, x = null, y = null) => {
                if (diagnostic) {
                    rejected = true;
                    if (diagnostic.hits.length < 4096) diagnostic.hits.push({ reason, owner, x, y,
                        slotId: typeof slotId === 'object' ? slotId.slotId : slotId,
                        stage: typeof slotId === 'object' ? slotId.stage || (slotId.traversal ? 'traversal' : 'using') : 'using',
                        surface: domain.getInteraction(typeof slotId === 'object' ? slotId.slotId : slotId)?.surfaceId || null,
                        allowance: 'not-covered-by-active-authored-relation', boundaryReason: reason });
                }
                return false;
            };
            const context = typeof slotId === 'object' ? slotId : null;
            const traversal = context?.traversal === true;
            if (traversal && context.stage && !['enter', 'exit'].includes(context.stage)) return reject('interaction-stage-invalid');
            const interaction = slotId && domain.getInteraction(context ? context.slotId : slotId);
            if (slotId && (!interaction || (!traversal && (foot.x !== interaction.slotPoint.x || foot.y !== interaction.slotPoint.y))))
                return reject('interaction-context-invalid');
            const segments = traversal ? accessSegments(interaction, foot, context.segment) : [];
            const segment = segments[0];
            if (traversal && !segment && !domain.legalPoint(foot)) return reject('authored-access-required');
            const surface = interaction && masks[clearance.surfaceAllowanceMasks[interaction.surfaceId]?.replace('spatial/', '')];
            const accessSurfaces = segments.flatMap(segment => segment.surfaceIds.map(id => masks[clearance.surfaceAllowanceMasks[id]?.replace('spatial/', '')]));
            const foreground = interaction?.presentation.foregroundMask &&
                masks[interaction.presentation.foregroundMask.split('/').at(-1)];
            const contact = interaction?.presentation.supportContact;
            const contactActive = !traversal && context?.stage === 'using' && context.pose === contact?.pose;
            const ownerAllows = (index, px, py) => traversal
                ? (accessSurfaces.some(mask => mask?.[index]) || (segments.some(s => s.foreground) && foreground?.[index]))
                : surface?.[index] || foreground?.[index] || (contactActive && contactMasks.get(interaction.slotId)?.[index]);
            const left = foot.x + (mirrored ? frame.groundAnchor[0] - frame.width : -frame.groundAnchor[0]) * scale;
            const top = foot.y - frame.groundAnchor[1] * scale;
            const right = left + frame.width * scale, bottom = top + frame.height * scale;
            if (left >= 0 && top >= 0 && right <= 1024 && bottom <= 1024 &&
                solidBounds.every(bounds => foot.y >= bounds.frontEdge ||
                    right <= bounds.left || left >= bounds.right ||
                    bottom <= bounds.top || top >= bounds.bottom)) return true;
            // Same collision loop, bounded to solids intersecting this sprite's
            // complete bounds. Alpha/column front-edge tests remain unchanged.
            const nearbySolids = solidMasks.filter((_, n) => {
                const bounds = solidBounds[n];
                return foot.y < bounds.frontEdge && right > bounds.left && left < bounds.right &&
                    bottom > bounds.top && top < bounds.bottom;
            });
            for (let i = 0; i < frame.width * frame.height; i++) {
                if (!frame.data[i * 4 + 3]) continue;
                const x = foot.x + (mirrored
                    ? frame.groundAnchor[0] - i % frame.width - 1
                    : i % frame.width - frame.groundAnchor[0]) * scale;
                const y = foot.y + (Math.floor(i / frame.width) - frame.groundAnchor[1]) * scale;
                for (let py = Math.floor(y); py < Math.ceil(y + scale); py++)
                    for (let px = Math.floor(x); px < Math.ceil(x + scale); px++) {
                if (px < 0 || py < 0 || px >= 1024 || py >= 1024) {
                    if (!diagnostic) return false; reject('stage-boundary', null, px, py); continue;
                }
                const index = py * 1024 + px;
                for (const [owner, mask] of nearbySolids) if (mask[index] &&
                    foot.y < clearance.solidFrontEdges[owner][px] &&
                    !(owner === interaction?.presentation.aboveLayer && ownerAllows(index, px, py))) {
                    if (!diagnostic) return false;
                    reject('solid-geometry', owner, px, py);
                }
                    }
            }
            return !rejected;
        };
        domain.traversalPresentation = (slotId, foot, stage, segment = null) => {
            if (!['enter','exit'].includes(stage)) return null;
            const interaction = domain.getInteraction(slotId);
            return accessSegments(interaction,foot,segment).some(segment => segment.foreground) ? interaction.presentation : null;
        };
        domain.inspectPresentation = (...args) => {
            const diagnostic = { hits: [] };
            const fits = domain.presentationFits(...args, diagnostic);
            return { fits, hits: diagnostic.hits };
        };
        domain.geometryVersion = hash(JSON.stringify(source));
        // Keep the existing cache-miss counter; no production route discovery remains.
        domain.solutionSearches = 0;
        domain.routeValidations = 0;
        domain.resolveFurniturePresentation = ({ interaction, standing, resting, baseline = standing, pose, width, preferredFacing = 'left', cache,
            key = '', visualKey = '', generation = '', recovery = false }) => {
            const signature = [key, generation, visualKey, domain.geometryVersion, interaction.slotId, pose, width, preferredFacing, recovery].join('|');
            if (cache?.has(signature)) return cache.get(signature);
            domain.solutionSearches++;
            const authoredEnter = [interaction.approachPoint, ...interaction.enterWaypoints, interaction.slotPoint];
            const authoredExit = [interaction.slotPoint, ...interaction.exitWaypoints, interaction.exitPoint];
            const validFrames = standing?.data && resting?.data && baseline?.data && width > 0;
            const check = (frame, foot, facing, context) => validFrames && domain.presentationFits(frame, foot,
                80 * 1024 / (frame.width * width), context, facing === 'right');
            const faces = [preferredFacing, preferredFacing === 'left' ? 'right' : 'left'];
            const finish = result => {
                const value = Object.freeze({ ...result, signature });
                if (cache) { cache.set(signature, value); while (cache.size > 128) cache.delete(cache.keys().next().value); }
                return value;
            };
            const unavailable = reason => finish({ available: false, reason, facings: Object.freeze({}),
                stages: Object.freeze({}), routes: Object.freeze({}), enterPoints: Object.freeze(authoredEnter),
                exitPoints: Object.freeze(authoredExit), enterFacings: Object.freeze([]), exitFacings: Object.freeze([]) });
            if (interaction.presentation.traversalDisabled && !recovery) return unavailable('authored-traversal-unavailable');
            if (!validFrames) return unavailable('sprite-pending');
            if (!recovery && !faces.some(face => check(resting, interaction.slotPoint, face,
                {slotId: interaction.slotId, stage: 'using', pose}))) return unavailable('presentation-context-unsupported');
            const validateRoute = (points, facings, stage) => {
                if (stage === 'enter' && !check(standing, points[0], facings[0], null)) return false;
                if (stage === 'exit' && (!check(standing, points.at(-1), facings.at(-1), null) ||
                    !check(baseline, points.at(-1), facings.at(-1), null))) return false;
                for (let n = 0; n < points.length - 1; n++) {
                    const from = points[n], to = points[n + 1], facing = facings[n];
                    if (n && facing !== facings[n - 1] &&
                        (!check(standing, from, facings[n - 1], {slotId: interaction.slotId, traversal: true, stage}) ||
                         !check(standing, from, facing, {slotId: interaction.slotId, traversal: true, stage}))) return false;
                    const steps = Math.max(1, Math.ceil(distance(from, to)));
                    for (let step = 0; step <= steps; step++) if (!check(standing,
                        {x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps}, facing,
                        {slotId: interaction.slotId, traversal: true, stage, segment: {from, to}})) return false;
                }
                return true;
            };
            const stages = {}, routes = {};
            for (const facing of faces) {
                // Select an already-authored variant; actual alpha is still checked at the measured scale.
                const known = interaction.presentation.solutions.filter(row => row.pose === pose && row.preferredFacing === facing)
                    .sort((a, b) => Math.abs(a.stageWidth - width) - Math.abs(b.stageWidth - width))[0];
                const enter = known?.enterPoints || authoredEnter, exit = known?.exitPoints || authoredExit;
                const enterFacings = known?.enterFacings || enter.slice(1).map(() => facing);
                const exitFacings = known?.exitFacings || exit.slice(1).map(() => facing);
                const usingFacing = known?.usingFacing || facing;
                domain.routeValidations++;
                routes[facing] = {enter, exit, enterFacings, exitFacings, usingFacing};
                stages[facing] = {
                    enter: validateRoute(enter, enterFacings, 'enter'),
                    using: check(resting, interaction.slotPoint, usingFacing, {slotId: interaction.slotId, stage: 'using', pose}),
                    exit: validateRoute(exit, exitFacings, 'exit')
                };
                if (Object.values(stages[facing]).every(Boolean)) break;
            }
            const common = faces.find(face => stages[face] && Object.values(stages[face]).every(Boolean));
            const selected = common ? {enter: common, using: common, exit: common} : {
                enter: faces.find(face => stages[face]?.enter), using: faces.find(face => stages[face]?.using), exit: faces.find(face => stages[face]?.exit)};
            const entering = routes[selected.enter], exiting = routes[selected.exit];
            // Existing ownership may still use a legal static/exit presentation; disabling entry never creates ownership.
            const available = !interaction.presentation.traversalDisabled && Boolean(selected.enter && selected.using && selected.exit);
            return finish({available, reason: interaction.presentation.traversalDisabled ? 'authored-traversal-unavailable' : available ? '' : 'presentation-context-unsupported',
                facings: Object.freeze({enter: entering?.enterFacings[0], using: routes[selected.using]?.usingFacing, exit: exiting?.exitFacings[0]}),
                stages: Object.freeze(stages), routes: Object.freeze(routes),
                enterFacings: Object.freeze(entering?.enterFacings || []), exitFacings: Object.freeze(exiting?.exitFacings || []),
                enterPoints: Object.freeze(entering?.enter || authoredEnter), exitPoints: Object.freeze(exiting?.exit || authoredExit)});
        };
        const main = domain.cellsByComponent.reduce((a, b) => a.length >= b.length ? a : b, []);
        domain.groundEntry = (hint, claims = [], accepts = () => true, maxDistance = Infinity) => {
            const from = finitePoint(hint) ? hint : source.groundEntry;
            if (Number.isFinite(maxDistance)) {
                // Bounded presentation search: test nearest legal candidates first.
                // Stable sorting preserves the existing first-cell tie rule.
                const candidates = main.map(cell => domain.cellPoint(cell)).map(point => ({point, gap: distance(from, point)}))
                    .filter(({point, gap}) => gap <= maxDistance && domain.legalPoint(point) && domain.groundPresentationPoint(point) &&
                        !claims.some(claim => distance(point, claim) < DESTINATION_SEPARATION))
                    .sort((a, b) => a.gap - b.gap);
                return candidates.find(({point}) => accepts(point))?.point || null;
            }
            let best = null, gap = Infinity;
            for (const cell of main) {
                const point = domain.cellPoint(cell);
                const current = distance(from, point);
                if (current >= gap || current > maxDistance || !domain.legalPoint(point) ||
                    !domain.groundPresentationPoint(point) ||
                    claims.some(claim => distance(point, claim) < DESTINATION_SEPARATION) ||
                    !accepts(point)) continue;
                if (current < gap) { best = point; gap = current; }
            }
            return best;
        };
        domain.source = Object.freeze(source);
        return domain;
    };

    let curatorDomainPromise = null;
    const loadMask = (path, width, height, alpha = false) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            try {
                if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error('mask-size-mismatch');
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(0, 0, width, height).data;
                const mask = new Uint8Array(width * height);
                for (let i = 0; i < mask.length; i += 1) mask[i] = Number(alpha ? pixels[i * 4 + 3] >= 128 : pixels[i * 4] === 255);
                resolve(mask);
            } catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error('mask-load-failed'));
        image.src = path;
    });
    const loadCuratorDomain = () => {
        if (!curatorDomainPromise) curatorDomainPromise = (async () => {
            const response = await fetch(CURATOR_SOURCE);
            if (!response.ok) throw new Error('spatial-source-load-failed');
            const source = await response.json();
            const { width, height } = source.canonicalSize || {};
            const rug = source.interactiveWalkableSurfaces?.find(item => item.surfaceId === 'curator-rug-surface');
            if (source.schemaVersion !== 1 || source.roomId !== 'curator-room' || width !== 1024 || height !== 1024 ||
                rug?.currentConnectivity !== 'direct-floor-continuous' || !source.floorWalkable?.mask || !rug.mask)
                throw new Error('spatial-source-invalid');
            const root = `${source.assetBase}/`;
            const excludedSurfaces = source.interactiveWalkableSurfaces.filter(item =>
                item.surfaceId !== 'curator-rug-surface');
            if (excludedSurfaces.length !== 6 || excludedSurfaces.some(item =>
                item.currentConnectivity !== 'requires-future-transition' || !item.mask) ||
                !source.occlusionCandidate?.mask) throw new Error('spatial-source-invalid');
            const [floorMask, rugMask, ...excludedMasks] = await Promise.all([
                loadMask(root + source.floorWalkable.mask, width, height),
                loadMask(root + rug.mask, width, height),
                ...excludedSurfaces.map(item => loadMask(root + item.mask, width, height)),
                loadMask(root + source.occlusionCandidate.mask, width, height)
            ]);
            const floorCount = floorMask.reduce((sum, value) => sum + value, 0);
            const rugCount = rugMask.reduce((sum, value) => sum + value, 0);
            if (floorCount !== source.floorWalkable.pixelCount || rugCount !== rug.pixelCount ||
                floorMask.some((value, index) => value && rugMask[index])) throw new Error('spatial-mask-mismatch');
            const excluded = new Uint8Array(width * height);
            for (const mask of excludedMasks) for (let index = 0; index < excluded.length; index += 1)
                if (mask[index]) excluded[index] = 1;
            if (excludedMasks.some((mask, index) => mask.reduce((sum, value) => sum + value, 0) !==
                (index < excludedSurfaces.length ? excludedSurfaces[index].pixelCount :
                    source.occlusionCandidate.pixelCount))) throw new Error('spatial-mask-mismatch');
            const seam = buildDirectFloorSeam({ width, height, floor: floorMask, rug: rugMask, excluded });
            const domain = createRasterDomain({ width, height, floor: floorMask, rug: rugMask, seam });
            const interactions = validateFurnitureInteractions(source, domain,
                Object.fromEntries(excludedSurfaces.map((item, index) => [item.surfaceId, excludedMasks[index]])));
            domain.getInteractions = () => interactions;
            domain.getInteraction = slotId => interactions.find(item => item.slotId === slotId) || null;
            // Read-only presentation geometry from registered full-canvas art.
            // BLACK/RED navigation remains the authored domain above.
            const masks = { 'floor-walkable.png': floorMask, [rug.mask.split('/').at(-1)]: rugMask };
            excludedSurfaces.forEach((row, index) => { masks[row.mask.split('/').at(-1)] = excludedMasks[index]; });
            masks[source.occlusionCandidate.mask.split('/').at(-1)] = excludedMasks.at(-1);
            const owners = ['bed.png', 'cabin.png', 'closet.png', 'Table.png', 'chair.png'];
            const solids = await Promise.all(owners.map(owner => loadMask(root + source.sourceAssetsDirectory + '/' + owner, width, height, true)));
            const solidMasks = {}, solidFrontEdges = {};
            owners.forEach((owner, i) => {
                for (let pixel = 0; pixel < solids[i].length; pixel++)
                    if (floorMask[pixel] || rugMask[pixel]) solids[i][pixel] = 0;
                const name = `solid-${owner.toLowerCase()}`;
                masks[name] = solids[i]; solidMasks[owner] = `spatial/${name}`;
                const edges = new Array(width).fill(0);
                for (let index = 0; index < solids[i].length; index++) if (solids[i][index])
                    edges[index % width] = Math.floor(index / width) + 1;
                solidFrontEdges[owner] = edges;
            });
            const presentationSource = { ...source, groundEntry: { x: 605, y: 530 },
                presentationClearance: { solidMasks, solidFrontEdges, groundEntryMask: 'spatial/floor-walkable.png',
                    surfaceAllowanceMasks: Object.fromEntries(source.interactiveWalkableSurfaces.map(row => [row.surfaceId, row.mask])) } };
            attachPresentationClearance(domain, presentationSource, masks);
            return domain;
        })();
        return curatorDomainPromise;
    };

    // Only source selection differs between the three normal production rooms.
    // Claims and activity lifecycle remain in the existing simulation.
    const roomDomainTasks = new Map();
    const loadRoomDomain = roomId => {
        if (!['dining', 'living', 'dorm'].includes(roomId)) return Promise.reject(new Error('unsupported-room'));
        if (!roomDomainTasks.has(roomId)) {
            const task = (async () => {
                const response = await fetch(`assets/meeow-map/${roomId}/spatial/room-spatial.json`);
                if (!response.ok) throw new Error('spatial-source-load-failed');
                const source = await response.json();
                if (source.schemaVersion !== 1 || source.roomId !== roomId ||
                    source.assetBase !== `assets/meeow-map/${roomId}` ||
                    source.canonicalSize?.width !== 1024 || source.canonicalSize?.height !== 1024 ||
                    source.authoringSource !== 'authoring/room-source.json' ||
                    !Array.isArray(source.layerOrder) || !source.maskCounts || typeof source.maskCounts !== 'object')
                    throw new Error('spatial-source-invalid');
                const masks = Object.fromEntries(await Promise.all(Object.entries(source.maskCounts).map(async ([name, count]) => {
                    if (!/^[a-z0-9-]+\.png$/.test(name)) throw new Error('spatial-mask-path-invalid');
                    const mask = await loadMask(`${source.assetBase}/spatial/${name}`, 1024, 1024);
                    if (mask.reduce((sum, value) => sum + value, 0) !== count) throw new Error('spatial-mask-mismatch');
                    return [name, mask];
                })));
                const floor = masks['floor.png'], dark = masks['dark-surface.png'];
                const red = masks['red.png'], purple = masks['purple.png'];
                if (!floor || !red || !purple || floor.some((v, i) =>
                    v && (red[i] || purple[i] || dark?.[i]))) throw new Error('ground-surface-overlap');
                const groundId = source.floorWalkable.surfaceId;
                const domain = createRasterDomain({ width: 1024, height: 1024, floor, rug: new Uint8Array(floor.length),
                    floorId: groundId, rugId: groundId });
                const interactions = validateFurnitureInteractions(source, domain,
                    Object.fromEntries(source.interactiveWalkableSurfaces.map(row =>
                        [row.surfaceId, masks[row.mask.replace('spatial/', '')]])));
                const capabilities = Object.freeze(['ordinary-stationary', 'roam-origin', 'roam-destination']);
                domain.capabilityFor = id => id === groundId ? capabilities : Object.freeze([]);
                domain.getInteractions = () => interactions;
                domain.getInteraction = id => interactions.find(row => row.slotId === id) || null;
                attachPresentationClearance(domain, source, masks);
                return domain;
            })();
            roomDomainTasks.set(roomId, task);
            task.catch(() => { if (roomDomainTasks.get(roomId) === task) roomDomainTasks.delete(roomId); });
        }
        return roomDomainTasks.get(roomId);
    };

    Meeow.hallNavigation = Object.freeze({ GRID_STEP, DESTINATION_SEPARATION, CURATOR_SOURCE,
        buildDirectFloorSeam, createRasterDomain, planRoute, sampleDestination, loadCuratorDomain,
        loadRoomDomain, validateFurnitureInteractions, hash, distance });
}(window));
