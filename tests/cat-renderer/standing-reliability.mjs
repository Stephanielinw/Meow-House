import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_CONFIG,
    OPTIONS,
    createBodyPose,
    createCatRenderer,
    createStandingPose,
    loadCatAssets
} from '../../js/meeow-cat-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WIDTH = 112;
const HEIGHT = 104;

function decodePngBytes(bytes) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(bytes.subarray(0, 8).equals(signature), 'invalid PNG signature');
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
    }
    assert.deepEqual([width, height, bitDepth, colorType, interlace], [WIDTH, HEIGHT, 8, 6, 0], 'fixture decoder expects production RGBA PNGs');
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * 4;
    const out = new Uint8ClampedArray(width * height * 4);
    const paeth = (a, b, c) => {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    let source = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = raw[source++];
        for (let x = 0; x < stride; x += 1) {
            const value = raw[source++];
            const target = y * stride + x;
            const left = x >= 4 ? out[target - 4] : 0;
            const up = y > 0 ? out[target - stride] : 0;
            const upperLeft = y > 0 && x >= 4 ? out[target - stride - 4] : 0;
            const decoded = filter === 0 ? value
                : filter === 1 ? value + left
                : filter === 2 ? value + up
                : filter === 3 ? value + Math.floor((left + up) / 2)
                : filter === 4 ? value + paeth(left, up, upperLeft)
                : Number.NaN;
            assert.ok(Number.isFinite(decoded), `unsupported PNG filter ${filter}`);
            out[target] = decoded & 255;
        }
    }
    return out;
}

const decodeUrl = url => {
    const value = String(url);
    if (value.startsWith('data:image/png;base64,')) return decodePngBytes(Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'));
    return decodePngBytes(fs.readFileSync(fileURLToPath(url)));
};

async function createCanonicalRenderer() {
    const sittingUrl = new URL('../../assets/meeow-cat/v1/manifest.json', import.meta.url);
    const sittingManifest = JSON.parse(fs.readFileSync(sittingUrl, 'utf8'));
    const bank = await loadCatAssets(sittingManifest, new URL('.', sittingUrl), decodeUrl);
    const poses = {};
    for (const body of ['standard', 'slim', 'chubby', 'fluffy']) {
        const manifestUrl = new URL(`../../assets/meeow-cat/poses/standing-${body}-v1/manifest.json`, import.meta.url);
        const definition = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
        const template = await loadCatAssets(definition, new URL('.', manifestUrl), decodeUrl);
        poses[`standing:${body}`] = definition.body
            ? createBodyPose(bank, template, definition.pose, definition.body)
            : createStandingPose(bank, template);
    }
    return createCatRenderer(bank, { poses });
}

async function createGeneratedRenderer() {
    const sandbox = {
        console,
        URL,
        Uint8ClampedArray,
        ArrayBuffer,
        window: null,
        location: { href: `file://${root}/index.html` },
        fetch: async url => ({ ok: true, blob: async () => ({ url: String(url) }) }),
        createImageBitmap: async blob => ({ width: WIDTH, height: HEIGHT, data: decodeUrl(blob.url), close() {} }),
        document: {
            createElement: () => {
                let pixels = null;
                return {
                    width: 0,
                    height: 0,
                    getContext: () => ({
                        drawImage: bitmap => { pixels = bitmap.data; },
                        getImageData: () => ({ data: pixels })
                    })
                };
            }
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const relative of ['js/meeow-cat-runtime.js', 'js/meeow-cat-bank-sitting.js', 'js/meeow-cat-bank-standing.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), sandbox, { filename: relative });
    }
    const renderer = await sandbox.Meeow.catRuntimeCore.createFileRenderer(sandbox.Meeow.catRuntimeBanks);
    await sandbox.Meeow.catRuntimeCore.registerFilePoseBank(renderer, sandbox.Meeow.catRuntimeBanks.standing);
    return renderer;
}

const canonical = await createCanonicalRenderer();
const generated = await createGeneratedRenderer();
let parityCases = 0;
const assertParity = (config, pose = 'standing') => {
    const expected = canonical(config, { pose });
    const actual = generated(config, { pose });
    assert.equal(expected.pose, pose);
    assert.equal(actual.pose, pose);
    assert.equal(JSON.stringify(actual.config), JSON.stringify(expected.config));
    assert.deepEqual(Buffer.from(actual.data), Buffer.from(expected.data));
    parityCases += 1;
    return expected;
};

for (const render of [canonical, generated]) {
    assert.throws(() => render(DEFAULT_CONFIG, { pose: 'unsupported-pose' }), error => (
        error?.name === 'CatPoseCapabilityError' && error?.code === 'CAT_POSE_UNAVAILABLE'
    ));
}

const alphaPixels = mask => {
    const pixels = [];
    for (let index = 0; index < mask.length; index += 4) if (mask[index + 3]) pixels.push(index / 4);
    return pixels;
};
const changedPixels = (before, after) => {
    const pixels = [];
    for (let index = 0; index < before.length; index += 4) {
        if (before[index] !== after[index] || before[index + 1] !== after[index + 1] || before[index + 2] !== after[index + 2] || before[index + 3] !== after[index + 3]) pixels.push(index / 4);
    }
    return pixels;
};

// Independent standing eye recoloring works for every body and changes only its eight-pixel mask.
for (const body of OPTIONS.body) {
    const baseline = canonical({ ...DEFAULT_CONFIG, body }, { pose: 'standing' });
    for (const side of ['eyeLeft', 'eyeRight']) {
        for (const tint of ['blue', 'gold', 'green', '#123456']) {
            const frame = assertParity({ ...DEFAULT_CONFIG, body, [side]: tint });
            const mask = frame.effectiveMasks[side];
            assert.equal(alphaPixels(mask).length, 8, `${body}/${side}/${tint} eye mask size`);
            assert.deepEqual(changedPixels(baseline.data, frame.data), alphaPixels(mask), `${body}/${side}/${tint} changed unexpected pixels`);
            assert.equal(frame.pose, 'standing');
        }
    }
    const mixed = assertParity({ ...DEFAULT_CONFIG, body, eyeLeft: 'blue', eyeRight: '#abcdef' });
    const left = alphaPixels(mixed.effectiveMasks.eyeLeft);
    const right = alphaPixels(mixed.effectiveMasks.eyeRight);
    assert.equal(left.length, 8);
    assert.equal(right.length, 8);
    assert.equal(left.some(pixel => right.includes(pixel)), false, `${body} eye masks overlap`);
}

for (const malformed of ['#12345', '#1234567', 'red', 'rgb(1,2,3)', 'var(--eye)', '']) {
    assert.throws(() => canonical({ ...DEFAULT_CONFIG, eyeLeft: malformed }, { pose: 'standing' }), /Invalid color/);
    assert.throws(() => generated({ ...DEFAULT_CONFIG, eyeRight: malformed }, { pose: 'standing' }), /Invalid color/);
}

// Every editor-exposed option and color path remains standing-capable on every body.
const optionGroups = { ...OPTIONS };
const colorGroups = {
    coat: ['neutral', 'ginger', 'cream', 'blue', 'chocolate', 'black', 'lilac', 'silver', '#102030'],
    muzzleColor: ['base', 'original', 'cream'],
    faceColor: ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold', '#203040'],
    torsoColor: ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold', '#304050'],
    frontLeftColor: ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold', '#405060'],
    frontRightColor: ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold', '#506070'],
    rearLeftColor: ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold', '#607080'],
    rearRightColor: ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold', '#708090'],
    tailColor: ['dark', 'white', 'cream', 'brown', 'blue', 'pink', 'gold', '#8090a0'],
    eyeLeft: ['original', 'blue', 'gold', 'green', '#90a0b0'],
    eyeRight: ['original', 'blue', 'gold', 'green', '#a0b0c0']
};
for (const body of OPTIONS.body) {
    for (const [key, values] of Object.entries(optionGroups)) {
        if (key === 'body') continue;
        for (const value of values) assertParity({ ...DEFAULT_CONFIG, body, [key]: value });
    }
    for (const [key, values] of Object.entries(colorGroups)) {
        for (const value of values) {
            const activation = key === 'muzzleColor' ? { face: 'muzzle' }
                : key === 'faceColor' ? { face: 'blaze' }
                : key === 'torsoColor' ? { torso: 'spotted' }
                : key.endsWith('Color') && key !== 'tailColor' ? { [key.slice(0, -5)]: 'long_socks' }
                : key === 'tailColor' ? { tailmark: 'rings' }
                : {};
            assertParity({ ...DEFAULT_CONFIG, body, ...activation, [key]: value });
        }
    }
}

// Sitting remains valid and generated/canonical equivalent after the standing-only reliability correction.
for (const body of OPTIONS.body) assertParity({ ...DEFAULT_CONFIG, body, eyeLeft: 'green', eyeRight: '#445566' }, 'sitting');

console.log(`Standing reliability fixture passed (${parityCases} canonical/generated pixel parity cases).`);
