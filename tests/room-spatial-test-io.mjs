import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

// PNG decoding is test I/O, not an alternative interaction implementation.
export function png(bytes) {
    let offset = 8, width, height, channels;
    const chunks = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            assert.equal(data[8], 8); assert.equal(data[12], 0);
            channels = ({ 0: 1, 2: 3, 6: 4 })[data[9]];
            assert.ok(channels);
        }
        if (type === 'IDAT') chunks.push(data);
        offset += length + 12;
        if (type === 'IEND') break;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
    const pixels = new Uint8Array(stride * height), rgba = new Uint8ClampedArray(width * height * 4);
    let cursor = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = raw[cursor++];
        for (let x = 0; x < stride; x += 1) {
            const i = y * stride + x, left = x >= channels ? pixels[i - channels] : 0;
            const up = y ? pixels[i - stride] : 0, corner = y && x >= channels ? pixels[i - stride - channels] : 0;
            const p = left + up - corner, distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
            const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : corner;
            const prediction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
            assert.notEqual(prediction, undefined);
            pixels[i] = raw[cursor++] + prediction;
        }
    }
    for (let i = 0; i < width * height; i += 1) {
        rgba.set(channels === 1 ? [pixels[i], pixels[i], pixels[i], 255] :
            [pixels[i * channels], pixels[i * channels + 1], pixels[i * channels + 2], channels === 4 ? pixels[i * channels + 3] : 255], i * 4);
    }
    return { width, height, data: rgba };
}
export function clock() {
    let time = 0, serial = 0;
    const tasks = new Map();
    const set = (fn, delay) => { const id = ++serial; tasks.set(id, { at: time + delay, fn }); return id; };
    const advance = async duration => {
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        const end = time + duration;
        for (let count = 0; count < 20000; count += 1) {
            const due = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            time = due[1].at; tasks.delete(due[0]); due[1].fn();
            for (let i = 0; i < 10; i += 1) await Promise.resolve();
        }
        time = end;
    };
    return { now: () => time, set, clear: id => tasks.delete(id), advance, callbacks: () => [...tasks.values()].map(row => row.fn) };
}

// Bind the shipped resident SVG for native browser tests. Never redraw its
// cat, prop or foreground with a fixture compositor.
export function residentSvg(html, entity, base, curator = false) {
    if (curator) html = html.replaceAll('entity.visual', 'entity.marker.catVisual');
    if (!entity.marker.catVisual) return ''; // The shipped SVG's outer v-if.
    const start = html.indexOf('<svg v-if="entity.marker.catVisual"');
    assert.ok(start > 0);
    const bindings = {
        'entity.marker.catVisual.src': entity.marker.catVisual.src,
        'entity.foreground.src': entity.foreground && base + entity.foreground.src,
        'entity.foreground.mask': entity.foreground && base + entity.foreground.mask,
        'entity.filterId': entity.filterId,
        'entity.x': entity.x, 'entity.y': entity.y, 'entity.width': entity.width, 'entity.height': entity.height,
        "entity.facing === 'right' ? 'translate(' + (2 * entity.footX) + ' 0) scale(-1 1)' : null":
            entity.facing === 'right' ? `translate(${2 * entity.footX} 0) scale(-1 1)` : '',
        "'url(#' + entity.filterId + ')'": `url(#${entity.filterId})`
    };
    if (entity.itemProp) for (const key of ['src', 'x', 'y', 'width', 'height'])
        bindings[`entity.itemProp.${key}`] = key === 'src' ? base + entity.itemProp[key] : entity.itemProp[key];
    let svg = html.slice(start, html.indexOf('</svg>', start) + 6)
        .replace('v-if="entity.marker.catVisual"', `id="cat-${entity.id}"`)
        .replace(':style="{zIndex: entity.zIndex}"', `style="z-index:${entity.zIndex}"`);
    if (!entity.foreground) svg = svg.replace(/<defs[\s\S]*?<\/defs>/, '').replace(/<g v-if="entity.foreground"[\s\S]*?<\/g>\s*<\/g>/, '');
    else svg = svg.replaceAll('v-if="entity.foreground"', '');
    if (!entity.itemProp) svg = svg.replace(/<image v-if="entity.itemProp"[^>]*\/>/g, '');
    else svg = svg.replaceAll('v-if="entity.itemProp"', '');
    return svg.replace(/:(href|id|x|y|width|height|filter|transform)="([^"]+)"/g, (_, attr, expression) => {
        assert.ok(expression in bindings, expression);
        return `${attr}="${bindings[expression]}"`;
    });
}
