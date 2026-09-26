(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const editor = Meeow.itemPixelEditor = Meeow.itemPixelEditor || {};
    const SIZE = 64;
    const BYTE_LENGTH = SIZE * SIZE * 4;
    const ZOOMS = Object.freeze([1, 2, 4, 8, 12, 16]);
    const PALETTE = Object.freeze(['#1c1b22', '#4a3b3b', '#7b4f3b', '#b06b4f', '#e2a56f', '#f4d6a0', '#fff3dc', '#ffffff',
        '#7d3045', '#c84b5f', '#ef7d72', '#f5b0a5', '#8f5d9f', '#c48bd4', '#4d6fa9', '#78a8d8',
        '#356859', '#5e9b68', '#92c777', '#c6dd86', '#b28b3e', '#e4bd55', '#8a8175', '#c4bbb0']);

    const clonePixels = pixels => new Uint8ClampedArray(pixels || BYTE_LENGTH);
    const emptyPixels = () => new Uint8ClampedArray(BYTE_LENGTH);
    const pixelOffset = (x, y, width = SIZE) => (y * width + x) * 4;
    const normalizeTransparentPixels = pixels => {
        const result = clonePixels(pixels);
        for (let index = 0; index < result.length; index += 4) if (result[index + 3] === 0) {
            result[index] = 0; result[index + 1] = 0; result[index + 2] = 0;
        }
        return result;
    };
    const hasOpaquePixels = pixels => {
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] === 255) return true;
        return false;
    };
    const countPartialAlpha = pixels => {
        let count = 0;
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0 && pixels[index] !== 255) count += 1;
        return count;
    };
    const rgbaEqual = (pixels, left, right) => pixels[left] === pixels[right] && pixels[left + 1] === pixels[right + 1] &&
        pixels[left + 2] === pixels[right + 2] && pixels[left + 3] === pixels[right + 3];
    const hexToRgba = hex => {
        const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!match) return null;
        return [0, 2, 4].map(offset => parseInt(match[1].slice(offset, offset + 2), 16)).concat(255);
    };
    const rgbaToHex = rgba => `#${rgba.slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('')}`;
    const setPixel = (pixels, x, y, rgba, mask = null) => {
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE || (mask && !mask[y * SIZE + x])) return false;
        const index = pixelOffset(x, y);
        if (pixels[index] === rgba[0] && pixels[index + 1] === rgba[1] && pixels[index + 2] === rgba[2] && pixels[index + 3] === rgba[3]) return false;
        pixels.set(rgba, index);
        return true;
    };
    const drawLine = (pixels, from, to, rgba, mask = null) => {
        let x0 = Math.trunc(from.x), y0 = Math.trunc(from.y), x1 = Math.trunc(to.x), y1 = Math.trunc(to.y), changed = false;
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let error = dx + dy;
        while (true) {
            changed = setPixel(pixels, x0, y0, rgba, mask) || changed;
            if (x0 === x1 && y0 === y1) break;
            const twice = error * 2;
            if (twice >= dy) { error += dy; x0 += sx; }
            if (twice <= dx) { error += dx; y0 += sy; }
        }
        return changed;
    };
    const floodFill = (pixels, x, y, rgba, mask = null) => {
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || (mask && !mask[y * SIZE + x])) return false;
        const start = pixelOffset(x, y);
        if (pixels[start] === rgba[0] && pixels[start + 1] === rgba[1] && pixels[start + 2] === rgba[2] && pixels[start + 3] === rgba[3]) return false;
        const source = pixels.slice(start, start + 4), queue = [[x, y]], visited = new Uint8Array(SIZE * SIZE);
        let changed = false;
        while (queue.length) {
            const [cx, cy] = queue.pop();
            if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
            const key = cy * SIZE + cx;
            if (visited[key] || (mask && !mask[key])) continue;
            visited[key] = 1;
            const index = pixelOffset(cx, cy);
            if (pixels[index] !== source[0] || pixels[index + 1] !== source[1] || pixels[index + 2] !== source[2] || pixels[index + 3] !== source[3]) continue;
            pixels.set(rgba, index); changed = true;
            queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
        return changed;
    };
    const createRectMask = (start, end) => {
        const mask = new Uint8Array(SIZE * SIZE);
        const left = Math.max(0, Math.min(start.x, end.x)), right = Math.min(SIZE - 1, Math.max(start.x, end.x));
        const top = Math.max(0, Math.min(start.y, end.y)), bottom = Math.min(SIZE - 1, Math.max(start.y, end.y));
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) mask[y * SIZE + x] = 1;
        return mask;
    };
    const pointInPolygon = (x, y, points) => {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i], b = points[j];
            if (((a.y > y) !== (b.y > y)) && x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1) + a.x) inside = !inside;
        }
        return inside;
    };
    const createLassoMask = points => {
        const mask = new Uint8Array(SIZE * SIZE);
        if (!Array.isArray(points) || points.length < 3) return mask;
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (pointInPolygon(x + 0.5, y + 0.5, points)) mask[y * SIZE + x] = 1;
        return mask;
    };
    const getMaskBounds = mask => {
        let left = SIZE, top = SIZE, right = -1, bottom = -1;
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (mask?.[y * SIZE + x]) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    };
    const captureSelection = (pixels, mask) => {
        const bounds = getMaskBounds(mask);
        if (!bounds) return null;
        const selectedPixels = new Uint8ClampedArray(bounds.width * bounds.height * 4), selectedMask = new Uint8Array(bounds.width * bounds.height);
        for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
            const canvasKey = (bounds.y + y) * SIZE + bounds.x + x, key = y * bounds.width + x;
            if (!mask[canvasKey]) continue;
            selectedMask[key] = 1;
            selectedPixels.set(pixels.slice(canvasKey * 4, canvasKey * 4 + 4), key * 4);
        }
        return { ...bounds, pixels: selectedPixels, mask: selectedMask };
    };
    const clearSelection = (pixels, mask) => {
        for (let key = 0; key < mask.length; key++) if (mask[key]) pixels.fill(0, key * 4, key * 4 + 4);
    };
    const scaleSelection = (selection, width, height) => {
        width = Math.max(1, Math.min(SIZE, Math.round(width))); height = Math.max(1, Math.min(SIZE, Math.round(height)));
        const pixels = new Uint8ClampedArray(width * height * 4), mask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const sourceX = Math.min(selection.width - 1, Math.floor(x * selection.width / width));
            const sourceY = Math.min(selection.height - 1, Math.floor(y * selection.height / height));
            const sourceKey = sourceY * selection.width + sourceX, key = y * width + x;
            mask[key] = selection.mask[sourceKey]; pixels.set(selection.pixels.slice(sourceKey * 4, sourceKey * 4 + 4), key * 4);
        }
        return { ...selection, width, height, pixels, mask };
    };
    const flipSelection = (selection, horizontal) => {
        const pixels = new Uint8ClampedArray(selection.pixels.length), mask = new Uint8Array(selection.mask.length);
        for (let y = 0; y < selection.height; y++) for (let x = 0; x < selection.width; x++) {
            const sourceX = horizontal ? selection.width - 1 - x : x, sourceY = horizontal ? y : selection.height - 1 - y;
            const from = sourceY * selection.width + sourceX, to = y * selection.width + x;
            mask[to] = selection.mask[from]; pixels.set(selection.pixels.slice(from * 4, from * 4 + 4), to * 4);
        }
        return { ...selection, pixels, mask };
    };
    const rotateSelection = (selection, degrees) => {
        const turns = ((Math.round(degrees / 90) % 4) + 4) % 4;
        let result = { ...selection, pixels: clonePixels(selection.pixels), mask: new Uint8Array(selection.mask) };
        for (let turn = 0; turn < turns; turn++) {
            const width = result.height, height = result.width, pixels = new Uint8ClampedArray(width * height * 4), mask = new Uint8Array(width * height);
            for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) {
                const toX = result.height - 1 - y, toY = x, from = y * result.width + x, to = toY * width + toX;
                mask[to] = result.mask[from]; pixels.set(result.pixels.slice(from * 4, from * 4 + 4), to * 4);
            }
            result = { ...result, width, height, pixels, mask };
        }
        return result;
    };
    const compositeSelection = (pixels, selection) => {
        const result = clonePixels(pixels); let clippedOpaque = 0;
        for (let y = 0; y < selection.height; y++) for (let x = 0; x < selection.width; x++) {
            const key = y * selection.width + x;
            if (!selection.mask[key]) continue;
            const targetX = selection.x + x, targetY = selection.y + y, alpha = selection.pixels[key * 4 + 3];
            if (targetX < 0 || targetY < 0 || targetX >= SIZE || targetY >= SIZE) { if (alpha === 255) clippedOpaque += 1; continue; }
            result.set(selection.pixels.slice(key * 4, key * 4 + 4), pixelOffset(targetX, targetY));
        }
        return { pixels: result, clippedOpaque };
    };
    const buildCustomPixelVisual = pixels => {
        const clean = normalizeTransparentPixels(pixels);
        if (clean.length !== BYTE_LENGTH || countPartialAlpha(clean) || !hasOpaquePixels(clean)) return null;
        const visuals = Meeow.itemVisuals;
        const data = visuals?.bytesToBase64 ? visuals.bytesToBase64(clean) : null;
        const visual = data ? { version: 1, mode: 'custom-pixel', spriteId: null, visualHint: null,
            customPixel: { version: 1, width: 64, height: 64, encoding: 'rgba-base64', data } } : null;
        return visuals?.normalizeItemVisual(visual);
    };
    const pixelsFromVisual = visual => {
        const normalized = Meeow.itemVisuals?.normalizeItemVisual(visual);
        return normalized?.mode === 'custom-pixel' ? new Uint8ClampedArray(Meeow.itemVisuals.base64ToBytes(normalized.customPixel.data)) : emptyPixels();
    };

    const component = {
        props: { item: { type: Object, required: true }, stackQuantity: { type: Number, default: 1 } },
        emits: ['save', 'cancel'],
        setup(props, { emit }) {
            const V = global.Vue;
            const artCanvas = V.ref(null), overlayCanvas = V.ref(null), nativePreview = V.ref(null), viewport = V.ref(null), importInput = V.ref(null);
            const pixels = V.ref(pixelsFromVisual(props.item?.visual)), revision = V.ref(0), tool = V.ref('pencil'), color = V.ref('#1c1b22');
            const zoom = V.ref(8), pan = V.reactive({ x: 0, y: 0 }), grid = V.ref(true), preserveAspect = V.ref(true);
            const selectionMask = V.ref(null), floating = V.ref(null), clipboard = V.ref(null), lassoPoints = V.ref([]), rectStart = V.ref(null), pointer = V.reactive({ active: false, mode: '', last: null, start: null, panStart: null, changed: false });
            const undoStack = V.ref([]), redoStack = V.ref([]), spacePressed = V.ref(false);
            const initialData = Meeow.itemVisuals?.bytesToBase64(normalizeTransparentPixels(pixels.value)) || '';
            const composedPixels = () => floating.value ? compositeSelection(pixels.value, floating.value).pixels : clonePixels(pixels.value);
            const currentData = V.computed(() => { void revision.value; return Meeow.itemVisuals.bytesToBase64(normalizeTransparentPixels(composedPixels())); });
            const dirty = V.computed(() => currentData.value !== initialData);
            const transformBox = V.computed(() => floating.value || getMaskBounds(selectionMask.value));
            const stageStyle = V.computed(() => ({ width: `${SIZE * zoom.value}px`, height: `${SIZE * zoom.value}px`,
                left: `calc(50% - ${SIZE * zoom.value / 2}px)`, top: `calc(50% - ${SIZE * zoom.value / 2}px)`,
                transform: `translate(${pan.x}px, ${pan.y}px)` }));
            const transformBoxStyle = V.computed(() => transformBox.value ? ({ left: `${transformBox.value.x * zoom.value}px`, top: `${transformBox.value.y * zoom.value}px`, width: `${transformBox.value.width * zoom.value}px`, height: `${transformBox.value.height * zoom.value}px` }) : {});
            const previewItem = V.computed(() => { void revision.value; const visual = buildCustomPixelVisual(composedPixels()); return { icon: props.item?.icon || '🎁', ...(visual ? { visual } : {}) }; });
            const bump = () => { revision.value += 1; V.nextTick(renderAll); };
            const putPixels = (canvas, value) => {
                if (!canvas) return;
                canvas.width = SIZE; canvas.height = SIZE;
                const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
                context.clearRect(0, 0, SIZE, SIZE); context.putImageData(new ImageData(new Uint8ClampedArray(value), SIZE, SIZE), 0, 0);
            };
            const drawMaskOutline = (context, mask, width, height, originX = 0, originY = 0) => {
                if (!mask) return;
                context.strokeStyle = '#ffd65a'; context.lineWidth = 1; context.setLineDash([4, 3]); context.lineDashOffset = -(Date.now() / 150) % 7;
                context.beginPath();
                for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) {
                    const px = (originX + x) * zoom.value, py = (originY + y) * zoom.value, z = zoom.value;
                    if (!mask[y * width + x - 1] || x === 0) { context.moveTo(px, py); context.lineTo(px, py + z); }
                    if (!mask[y * width + x + 1] || x === width - 1) { context.moveTo(px + z, py); context.lineTo(px + z, py + z); }
                    if (!mask[(y - 1) * width + x] || y === 0) { context.moveTo(px, py); context.lineTo(px + z, py); }
                    if (!mask[(y + 1) * width + x] || y === height - 1) { context.moveTo(px, py + z); context.lineTo(px + z, py + z); }
                }
                context.stroke(); context.setLineDash([]);
            };
            const renderOverlay = () => {
                const canvas = overlayCanvas.value;
                if (!canvas) return;
                const side = SIZE * zoom.value; canvas.width = side; canvas.height = side;
                const context = canvas.getContext('2d'); context.clearRect(0, 0, side, side);
                if (grid.value && zoom.value >= 4) {
                    context.strokeStyle = 'rgba(255,255,255,.12)'; context.lineWidth = 1; context.beginPath();
                    for (let value = 1; value < SIZE; value++) { const at = value * zoom.value + .5; context.moveTo(at, 0); context.lineTo(at, side); context.moveTo(0, at); context.lineTo(side, at); }
                    context.stroke();
                }
                if (floating.value) drawMaskOutline(context, floating.value.mask, floating.value.width, floating.value.height, floating.value.x, floating.value.y);
                else if (selectionMask.value) drawMaskOutline(context, selectionMask.value, SIZE, SIZE);
                if (lassoPoints.value.length > 1) {
                    context.strokeStyle = '#70d7ff'; context.lineWidth = 1; context.beginPath();
                    lassoPoints.value.forEach((point, index) => { const x = (point.x + .5) * zoom.value, y = (point.y + .5) * zoom.value; index ? context.lineTo(x, y) : context.moveTo(x, y); });
                    context.stroke();
                }
            };
            const renderAll = () => { putPixels(artCanvas.value, composedPixels()); putPixels(nativePreview.value, composedPixels()); renderOverlay(); };
            const snapshot = value => ({ pixels: clonePixels(value), selection: selectionMask.value ? new Uint8Array(selectionMask.value) : null });
            const pushHistory = value => { undoStack.value = [...undoStack.value.slice(-49), snapshot(value ?? pixels.value)]; redoStack.value = []; };
            const restoreSnapshot = state => { pixels.value = clonePixels(state.pixels); selectionMask.value = state.selection ? new Uint8Array(state.selection) : null; floating.value = null; bump(); };
            const cancelFloating = () => { if (!floating.value) return; pixels.value = clonePixels(floating.value.beforePixels); floating.value = null; bump(); };
            const commitFloating = (confirmClip = true) => {
                if (!floating.value) return true;
                const result = compositeSelection(pixels.value, floating.value);
                if (result.clippedOpaque && confirmClip && !global.confirm(`提交会裁掉 ${result.clippedOpaque} 个画面外像素，继续吗？`)) return false;
                pushHistory(floating.value.beforePixels); pixels.value = result.pixels; floating.value = null; selectionMask.value = null; bump(); return true;
            };
            const undo = () => { if (floating.value) cancelFloating(); const state = undoStack.value.at(-1); if (!state) return; redoStack.value = [...redoStack.value.slice(-49), snapshot(pixels.value)]; undoStack.value = undoStack.value.slice(0, -1); restoreSnapshot(state); };
            const redo = () => { if (floating.value) cancelFloating(); const state = redoStack.value.at(-1); if (!state) return; undoStack.value = [...undoStack.value.slice(-49), snapshot(pixels.value)]; redoStack.value = redoStack.value.slice(0, -1); restoreSnapshot(state); };
            const canvasPoint = event => {
                const rect = overlayCanvas.value?.getBoundingClientRect(); if (!rect) return null;
                return { x: Math.floor((event.clientX - rect.left) / zoom.value), y: Math.floor((event.clientY - rect.top) / zoom.value) };
            };
            const activeColor = erase => erase ? [0, 0, 0, 0] : (hexToRgba(color.value) || [28, 27, 34, 255]);
            const ensureFloating = (duplicate = false) => {
                if (floating.value) return floating.value;
                const captured = captureSelection(pixels.value, selectionMask.value); if (!captured) return null;
                const beforePixels = clonePixels(pixels.value);
                if (!duplicate) clearSelection(pixels.value, selectionMask.value);
                floating.value = { ...captured, beforePixels };
                selectionMask.value = null; bump(); return floating.value;
            };
            const setTool = next => { if (floating.value && !commitFloating()) return; tool.value = next; };
            const pointerDown = event => {
                if (event.button === 1 || spacePressed.value || tool.value === 'pan') {
                    pointer.active = true; pointer.mode = 'pan'; pointer.panStart = { clientX: event.clientX, clientY: event.clientY, x: pan.x, y: pan.y }; event.preventDefault(); return;
                }
                if (event.button !== 0) return;
                const point = canvasPoint(event); if (!point || point.x < 0 || point.y < 0 || point.x >= SIZE || point.y >= SIZE) return;
                overlayCanvas.value.setPointerCapture?.(event.pointerId); pointer.active = true; pointer.last = point; pointer.start = point; pointer.changed = false;
                if (tool.value === 'pencil' || tool.value === 'eraser') {
                    if (floating.value && !commitFloating()) { pointer.active = false; return; }
                    pointer.mode = 'draw'; pushHistory(); pointer.changed = setPixel(pixels.value, point.x, point.y, activeColor(tool.value === 'eraser'), selectionMask.value); bump();
                } else if (tool.value === 'fill') {
                    if (floating.value && !commitFloating()) { pointer.active = false; return; }
                    pushHistory(); if (!floodFill(pixels.value, point.x, point.y, activeColor(false), selectionMask.value)) undoStack.value = undoStack.value.slice(0, -1); bump(); pointer.active = false;
                } else if (tool.value === 'eyedropper') {
                    const source = composedPixels(), index = pixelOffset(point.x, point.y), rgba = Array.from(source.slice(index, index + 4));
                    color.value = rgba[3] ? rgbaToHex(rgba) : '#000000'; tool.value = rgba[3] ? 'pencil' : 'eraser'; pointer.active = false;
                } else if (tool.value === 'rect') { pointer.mode = 'rect'; rectStart.value = point; selectionMask.value = createRectMask(point, point); bump(); }
                else if (tool.value === 'lasso') { pointer.mode = 'lasso'; lassoPoints.value = [point]; selectionMask.value = null; bump(); }
                else if (tool.value === 'move') {
                    const box = transformBox.value;
                    if (!box || point.x < box.x || point.y < box.y || point.x >= box.x + box.width || point.y >= box.y + box.height) { pointer.active = false; return; }
                    const value = ensureFloating(); if (!value) { pointer.active = false; return; }
                    pointer.mode = 'move'; pointer.start = { ...point, x0: value.x, y0: value.y };
                }
            };
            const pointerMove = event => {
                if (!pointer.active) return;
                if (pointer.mode === 'pan') { pan.x = pointer.panStart.x + event.clientX - pointer.panStart.clientX; pan.y = pointer.panStart.y + event.clientY - pointer.panStart.clientY; return; }
                const point = canvasPoint(event); if (!point) return;
                if (pointer.mode === 'draw') { pointer.changed = drawLine(pixels.value, pointer.last, point, activeColor(tool.value === 'eraser'), selectionMask.value) || pointer.changed; pointer.last = point; bump(); }
                else if (pointer.mode === 'rect') { selectionMask.value = createRectMask(rectStart.value, { x: Math.max(0, Math.min(63, point.x)), y: Math.max(0, Math.min(63, point.y)) }); bump(); }
                else if (pointer.mode === 'lasso') { const bounded = { x: Math.max(0, Math.min(63, point.x)), y: Math.max(0, Math.min(63, point.y)) }; if (!pointer.last || bounded.x !== pointer.last.x || bounded.y !== pointer.last.y) lassoPoints.value.push(bounded); pointer.last = bounded; bump(); }
                else if (pointer.mode === 'move' && floating.value) {
                    floating.value.x = pointer.start.x0 + point.x - pointer.start.x; floating.value.y = pointer.start.y0 + point.y - pointer.start.y;
                    floating.value.x = Math.max(1 - floating.value.width, Math.min(SIZE - 1, floating.value.x));
                    floating.value.y = Math.max(1 - floating.value.height, Math.min(SIZE - 1, floating.value.y)); bump();
                }
            };
            const pointerUp = () => {
                if (!pointer.active) return;
                if (pointer.mode === 'draw' && !pointer.changed) undoStack.value = undoStack.value.slice(0, -1);
                if (pointer.mode === 'lasso') { selectionMask.value = createLassoMask(lassoPoints.value); lassoPoints.value = []; bump(); }
                pointer.active = false; pointer.mode = '';
            };
            const copySelection = () => { const value = floating.value || captureSelection(pixels.value, selectionMask.value); if (value) clipboard.value = { ...value, pixels: clonePixels(value.pixels), mask: new Uint8Array(value.mask) }; };
            const cutSelection = () => { copySelection(); if (floating.value) { pushHistory(floating.value.beforePixels); floating.value = null; selectionMask.value = null; bump(); return; } if (selectionMask.value) { pushHistory(); clearSelection(pixels.value, selectionMask.value); selectionMask.value = null; bump(); } };
            const pasteSelection = () => { if (!clipboard.value) return; if (floating.value && !commitFloating()) return; const value = clipboard.value; floating.value = { ...value, x: Math.max(0, Math.min(63, value.x + 1)), y: Math.max(0, Math.min(63, value.y + 1)), pixels: clonePixels(value.pixels), mask: new Uint8Array(value.mask), beforePixels: clonePixels(pixels.value) }; bump(); };
            const duplicateSelection = () => { copySelection(); pasteSelection(); };
            const deleteSelection = () => { if (floating.value) { pushHistory(floating.value.beforePixels); floating.value = null; selectionMask.value = null; bump(); return; } if (selectionMask.value) { pushHistory(); clearSelection(pixels.value, selectionMask.value); selectionMask.value = null; bump(); } };
            const clampFloatingPosition = value => {
                value.x = Math.max(1 - value.width, Math.min(SIZE - 1, Math.round(value.x)));
                value.y = Math.max(1 - value.height, Math.min(SIZE - 1, Math.round(value.y)));
                return value;
            };
            const nudge = (dx, dy) => { const value = ensureFloating(); if (!value) return; value.x += dx; value.y += dy; clampFloatingPosition(value); bump(); };
            const resizeFloating = (width, height) => { const value = ensureFloating(); if (!value) return; floating.value = { ...scaleSelection(value, width, height), beforePixels: value.beforePixels }; bump(); };
            const updateDimension = (axis, event) => {
                const value = ensureFloating(); if (!value) return;
                let width = value.width, height = value.height, next = Math.max(1, Math.min(SIZE, Math.round(Number(event.target.value) || 1)));
                if (axis === 'width') { width = next; if (preserveAspect.value) height = Math.max(1, Math.min(SIZE, Math.round(next * value.height / value.width))); }
                else { height = next; if (preserveAspect.value) width = Math.max(1, Math.min(SIZE, Math.round(next * value.width / value.height))); }
                resizeFloating(width, height);
            };
            const updatePosition = (axis, event) => { const value = ensureFloating(); if (!value) return; value[axis] = Math.round(Number(event.target.value) || 0); clampFloatingPosition(value); bump(); };
            const flip = horizontal => { const value = ensureFloating(); if (!value) return; floating.value = { ...flipSelection(value, horizontal), beforePixels: value.beforePixels }; bump(); };
            const rotate = degrees => { const value = ensureFloating(); if (!value) return; floating.value = { ...rotateSelection(value, degrees), beforePixels: value.beforePixels }; bump(); };
            const beginResize = (handle, event) => {
                const value = ensureFloating(); if (!value) return;
                event.preventDefault(); event.stopPropagation();
                const source = { ...value, pixels: clonePixels(value.pixels), mask: new Uint8Array(value.mask) }, startX = event.clientX, startY = event.clientY;
                const move = moveEvent => {
                    let dx = Math.round((moveEvent.clientX - startX) / zoom.value), dy = Math.round((moveEvent.clientY - startY) / zoom.value);
                    let width = source.width + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0);
                    let height = source.height + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0);
                    width = Math.max(1, Math.min(SIZE, width)); height = Math.max(1, Math.min(SIZE, height));
                    if (preserveAspect.value) {
                        if (Math.abs(dx) >= Math.abs(dy)) height = Math.max(1, Math.min(SIZE, Math.round(width * source.height / source.width)));
                        else width = Math.max(1, Math.min(SIZE, Math.round(height * source.width / source.height)));
                    }
                    let next = scaleSelection(source, width, height);
                    next.x = handle.includes('w') ? source.x + source.width - width : source.x;
                    next.y = handle.includes('n') ? source.y + source.height - height : source.y;
                    floating.value = { ...next, beforePixels: source.beforePixels }; bump();
                };
                const up = () => { global.removeEventListener('pointermove', move); global.removeEventListener('pointerup', up); };
                global.addEventListener('pointermove', move); global.addEventListener('pointerup', up, { once: true });
            };
            const clearCanvas = () => { if (floating.value && !commitFloating()) return; pushHistory(); pixels.value = emptyPixels(); selectionMask.value = null; bump(); };
            const fitView = () => {
                const box = viewport.value; if (!box) return;
                const limit = Math.max(1, Math.floor(Math.min(box.clientWidth - 24, box.clientHeight - 24) / SIZE));
                zoom.value = [...ZOOMS].reverse().find(value => value <= limit) || 1; pan.x = 0; pan.y = 0; bump();
            };
            const setZoom = value => { zoom.value = value; bump(); };
            const importPng = async event => {
                const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
                if (file.type !== 'image/png' && !/\.png$/i.test(file.name)) return global.alert('只支持 PNG 文件。');
                try {
                    const bitmap = await global.createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                    let width = bitmap.width, height = bitmap.height;
                    if (width > SIZE || height > SIZE) {
                        const suggestedScale = Math.min(SIZE / width, SIZE / height);
                        const proposedWidth = Math.max(1, Math.round(width * suggestedScale));
                        const inputWidth = global.prompt(`图片为 ${width}×${height}。请输入最近邻导入宽度（1–64）：`, String(proposedWidth)); if (inputWidth == null) return;
                        width = Math.max(1, Math.min(SIZE, Math.round(Number(inputWidth) || 0)));
                        const proposedHeight = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
                        const inputHeight = global.prompt('请输入最近邻导入高度（1–64）：', String(proposedHeight)); if (inputHeight == null) return;
                        height = Math.max(1, Math.min(SIZE, Math.round(Number(inputHeight) || 0)));
                    }
                    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                    const context = canvas.getContext('2d', { willReadFrequently: true }); context.imageSmoothingEnabled = false;
                    context.clearRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
                    const imported = context.getImageData(0, 0, width, height).data;
                    if (countPartialAlpha(imported)) return global.alert('导入失败：PNG 含有半透明像素（alpha 1–254）。V1 只接受完全透明或完全不透明像素。');
                    const clean = normalizeTransparentPixels(imported);
                    if (width === SIZE && height === SIZE) { if (floating.value && !commitFloating()) return; pushHistory(); pixels.value = clean; selectionMask.value = null; bump(); }
                    else {
                        if (floating.value && !commitFloating()) return;
                        const mask = new Uint8Array(width * height); mask.fill(1);
                        floating.value = { x: Math.floor((SIZE - width) / 2), y: Math.floor((SIZE - height) / 2), width, height,
                            pixels: clean, mask, beforePixels: clonePixels(pixels.value) }; bump();
                    }
                } catch (error) { global.alert(`PNG 导入失败：${error.message}`); }
            };
            const exportPng = () => {
                const canvas = document.createElement('canvas'); putPixels(canvas, composedPixels());
                canvas.toBlob(blob => { if (!blob) return global.alert('PNG 导出失败。'); const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'meeow-item-custom-64x64.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, 'image/png');
            };
            const requestCancel = () => { if (!dirty.value || global.confirm('放弃尚未保存的像素修改吗？')) emit('cancel'); };
            const save = () => { if (floating.value && !commitFloating()) return; const visual = buildCustomPixelVisual(pixels.value); if (!visual) return global.alert('空白画布不能保存为自定义像素图。'); emit('save', visual); };
            const keyDown = event => {
                if (event.key === ' ') { spacePressed.value = true; if (!['INPUT', 'TEXTAREA'].includes(event.target?.tagName)) event.preventDefault(); }
                if (['INPUT', 'TEXTAREA'].includes(event.target?.tagName)) return;
                const meta = event.ctrlKey || event.metaKey;
                if (meta && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
                else if (meta && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
                else if (meta && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); }
                else if (meta && event.key.toLowerCase() === 'x') { event.preventDefault(); cutSelection(); }
                else if (meta && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelection(); }
                else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
                else if (event.key === 'Enter') commitFloating();
                else if (event.key === 'Escape') floating.value ? cancelFloating() : requestCancel();
                else if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-1, 0); }
                else if (event.key === 'ArrowRight') { event.preventDefault(); nudge(1, 0); }
                else if (event.key === 'ArrowUp') { event.preventDefault(); nudge(0, -1); }
                else if (event.key === 'ArrowDown') { event.preventDefault(); nudge(0, 1); }
            };
            const keyUp = event => { if (event.key === ' ') spacePressed.value = false; };
            V.onMounted(() => { global.addEventListener('keydown', keyDown); global.addEventListener('keyup', keyUp); global.addEventListener('pointerup', pointerUp); V.nextTick(() => { fitView(); renderAll(); }); });
            V.onBeforeUnmount(() => { global.removeEventListener('keydown', keyDown); global.removeEventListener('keyup', keyUp); global.removeEventListener('pointerup', pointerUp); });
            return { SIZE, ZOOMS, PALETTE, artCanvas, overlayCanvas, nativePreview, viewport, importInput, pixels, tool, color, zoom, pan, grid, preserveAspect,
                selectionMask, floating, clipboard, undoStack, redoStack, dirty, transformBox, transformBoxStyle, stageStyle, previewItem,
                setTool, pointerDown, pointerMove, pointerUp, copySelection, cutSelection, pasteSelection, duplicateSelection, deleteSelection, nudge,
                updateDimension, updatePosition, flip, rotate, beginResize, commitFloating, cancelFloating, undo, redo, clearCanvas, fitView, setZoom,
                importPng, exportPng, requestCancel, save };
        },
        template: `<div class="item-pixel-editor" role="dialog" aria-modal="true" aria-label="64×64 物品像素编辑器">
            <header class="item-pixel-editor__header"><div><strong>物品像素编辑器</strong><small>64×64 · {{ item.name || '未命名物品' }}<span v-if="stackQuantity > 1"> · 仅编辑此堆叠中的 1 件</span></small></div><button type="button" @click="requestCancel" aria-label="关闭">×</button></header>
            <div class="item-pixel-editor__toolbar">
                <button type="button" @click="undo" :disabled="!undoStack.length">撤销</button><button type="button" @click="redo" :disabled="!redoStack.length">重做</button>
                <button type="button" @click="clearCanvas">清空</button><button type="button" @click="importInput.click()">导入 PNG</button><button type="button" @click="exportPng">导出 PNG</button>
                <input ref="importInput" type="file" accept="image/png,.png" hidden @change="importPng">
            </div>
            <div class="item-pixel-editor__body">
                <aside class="item-pixel-editor__tools" aria-label="绘图工具">
                    <button v-for="entry in [['pencil','铅笔'],['eraser','橡皮'],['fill','填充'],['eyedropper','取色'],['rect','矩形选择'],['lasso','套索'],['move','移动'],['pan','平移']]" :key="entry[0]" type="button" :class="{active:tool===entry[0]}" @click="setTool(entry[0])">{{ entry[1] }}</button>
                    <hr><button type="button" @click="copySelection">复制</button><button type="button" @click="cutSelection">剪切</button><button type="button" @click="pasteSelection" :disabled="!clipboard">粘贴</button><button type="button" @click="duplicateSelection">复制一份</button><button type="button" @click="deleteSelection">删除选择</button>
                </aside>
                <main class="item-pixel-editor__workspace">
                    <div ref="viewport" class="item-pixel-editor__viewport">
                        <div class="item-pixel-editor__stage" :style="stageStyle">
                            <canvas ref="artCanvas" class="item-pixel-editor__art"></canvas>
                            <canvas ref="overlayCanvas" class="item-pixel-editor__overlay" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp"></canvas>
                            <div v-if="floating && transformBox" class="item-pixel-editor__transform-box" :style="transformBoxStyle">
                                <span v-for="handle in ['nw','n','ne','e','se','s','sw','w']" :key="handle" :class="'handle handle--'+handle" @pointerdown="beginResize(handle,$event)"></span>
                            </div>
                        </div>
                    </div>
                    <div class="item-pixel-editor__view-controls"><button v-for="value in ZOOMS" :key="value" type="button" :class="{active:zoom===value}" @click="setZoom(value)">{{ value }}×</button><button type="button" @click="fitView">适应</button><label><input v-model="grid" type="checkbox" @change="setZoom(zoom)"> 网格</label></div>
                </main>
                <aside class="item-pixel-editor__inspector">
                    <section><h4>颜色</h4><div class="item-pixel-editor__current-color" :style="{background:color}"></div><input v-model="color" type="color"><div class="item-pixel-editor__palette"><button v-for="swatch in PALETTE" :key="swatch" type="button" :style="{background:swatch}" :aria-label="swatch" @click="color=swatch"></button></div></section>
                    <section><h4>选择变换</h4><div class="item-pixel-editor__fields">
                        <label>X<input type="number" :value="transformBox?.x ?? 0" @change="updatePosition('x',$event)"></label><label>Y<input type="number" :value="transformBox?.y ?? 0" @change="updatePosition('y',$event)"></label>
                        <label>宽<input type="number" min="1" max="64" :value="transformBox?.width ?? 1" @change="updateDimension('width',$event)"></label><label>高<input type="number" min="1" max="64" :value="transformBox?.height ?? 1" @change="updateDimension('height',$event)"></label>
                    </div><label><input v-model="preserveAspect" type="checkbox"> 保持比例</label><div class="item-pixel-editor__actions"><button type="button" @click="flip(true)">水平翻转</button><button type="button" @click="flip(false)">垂直翻转</button><button type="button" @click="rotate(90)">旋转 90°</button><button type="button" @click="rotate(180)">180°</button><button type="button" @click="rotate(270)">270°</button></div><div class="item-pixel-editor__nudge"><button @click="nudge(0,-1)">↑</button><button @click="nudge(-1,0)">←</button><button @click="nudge(1,0)">→</button><button @click="nudge(0,1)">↓</button></div><div class="item-pixel-editor__actions"><button type="button" @click="commitFloating">应用变换</button><button type="button" @click="cancelFloating">取消变换</button></div></section>
                    <section><h4>预览</h4><div class="item-pixel-editor__previews"><div><canvas ref="nativePreview"></canvas><small>实际 64×64</small></div><div><span class="item-pixel-editor__game-preview"><meeow-item-visual :item="previewItem" size="small"></meeow-item-visual></span><small>背包尺寸</small></div></div></section>
                </aside>
            </div>
            <footer class="item-pixel-editor__footer"><span>{{ dirty ? '有未保存修改' : '尚未修改' }}</span><div><button type="button" @click="requestCancel">取消</button><button type="button" class="primary" @click="save">保存自定义像素</button></div></footer>
        </div>`
    };

    Object.assign(editor, { SIZE, BYTE_LENGTH, ZOOMS, PALETTE, clonePixels, emptyPixels, normalizeTransparentPixels, hasOpaquePixels,
        countPartialAlpha, hexToRgba, rgbaToHex, setPixel, drawLine, floodFill, createRectMask, createLassoMask, getMaskBounds,
        captureSelection, clearSelection, scaleSelection, flipSelection, rotateSelection, compositeSelection, buildCustomPixelVisual,
        pixelsFromVisual, component });
    if (typeof module !== 'undefined' && module.exports) module.exports = editor;
})(typeof window !== 'undefined' ? window : globalThis);
