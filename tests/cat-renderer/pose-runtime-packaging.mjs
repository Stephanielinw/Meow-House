import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, OPTIONS, MARK_COLORS, createCatRenderer, loadCatAssets } from '../../js/meeow-cat-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WIDTH = 112;
const HEIGHT = 104;
const BODIES = ['standard', 'chubby', 'slim', 'fluffy'];
const POSES = ['sitting', 'standing', 'crouching', 'lying'];

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
    assert.deepEqual([width, height, bitDepth, colorType, interlace], [WIDTH, HEIGHT, 8, 6, 0]);
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

const readManifestEntry = async relative => {
    const manifestUrl = new URL(`../../${relative}`, import.meta.url);
    const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
    const template = await loadCatAssets(manifest, new URL('.', manifestUrl), decodeUrl);
    return { manifest, template };
};

async function createCanonicalRenderer() {
    const sittingUrl = new URL('../../assets/meeow-cat/v1/manifest.json', import.meta.url);
    const bank = await loadCatAssets(JSON.parse(fs.readFileSync(sittingUrl, 'utf8')), new URL('.', sittingUrl), decodeUrl);
    const renderer = createCatRenderer(bank);
    const entries = [];
    for (const pose of ['standing', 'crouching']) {
        for (const body of ['standard', 'slim', 'chubby', 'fluffy']) entries.push(await readManifestEntry(`assets/meeow-cat/poses/${pose}-${body}-v1/manifest.json`));
    }
    entries.push(await readManifestEntry('assets/meeow-cat/poses/lying-standard-v1/manifest.json'));
    renderer.registerPoseTemplates(entries);
    return renderer;
}

function createRuntimeSandbox() {
    let decodedAssets = 0;
    const sandbox = {
        console,
        URL,
        Uint8ClampedArray,
        ArrayBuffer,
        window: null,
        location: { href: `file://${root}/index.html` },
        fetch: async url => ({ ok: true, blob: async () => ({ url: String(url) }) }),
        createImageBitmap: async blob => {
            decodedAssets += 1;
            return { width: WIDTH, height: HEIGHT, data: decodeUrl(blob.url), close() {} };
        },
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
    const execute = relative => vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), sandbox, { filename: relative });
    return { sandbox, execute, decodedAssets: () => decodedAssets };
}

const canonical = await createCanonicalRenderer();
const runtime = createRuntimeSandbox();
runtime.execute('js/meeow-cat-runtime.js');
runtime.execute('js/meeow-cat-bank-sitting.js');
const generated = await runtime.sandbox.Meeow.catRuntimeCore.createFileRenderer(runtime.sandbox.Meeow.catRuntimeBanks);
const sharedRenderer = generated;
assert.equal(generated.hasPose('sitting', 'fluffy'), true);
for (const pose of ['standing', 'crouching', 'lying']) assert.equal(generated.hasPose(pose, 'standard'), false, `${pose} must be lazy`);

const expectedDefinitions = { standing: 4, crouching: 4, lying: 1 };
const decodeDeltas = {};
for (const pose of ['standing', 'crouching', 'lying']) {
    runtime.execute(`js/meeow-cat-bank-${pose}.js`);
    const packed = runtime.sandbox.Meeow.catRuntimeBanks[pose];
    const before = runtime.decodedAssets();
    const registered = await runtime.sandbox.Meeow.catRuntimeCore.registerFilePoseBank(generated, packed);
    decodeDeltas[pose] = runtime.decodedAssets() - before;
    assert.equal(registered.length, expectedDefinitions[pose]);
    assert.strictEqual(generated, sharedRenderer, 'pose registration must retain one shared renderer');
    delete runtime.sandbox.Meeow.catRuntimeBanks[pose];
    assert.equal(generated.hasPose(pose, 'standard'), true);
    if (pose !== 'lying') for (const body of BODIES) assert.equal(generated.hasPose(pose, body), true);
    else for (const body of BODIES) assert.equal(generated.hasPose('lying', body), true);
    const afterFirstRegistration = runtime.decodedAssets();
    const repeated = await runtime.sandbox.Meeow.catRuntimeCore.registerFilePoseBank(generated, packed);
    assert.equal(repeated.length, 0, `${pose} must register at most once`);
    assert.equal(runtime.decodedAssets(), afterFirstRegistration, `${pose} repeat must not decode assets`);
}

let parityCases = 0;
const hashes = {};
for (const pose of POSES) {
    hashes[pose] = {};
    for (const body of BODIES) {
        const input = { ...DEFAULT_CONFIG, body, eyeLeft: 'blue', eyeRight: '#4e87d6', torso: 'spotted', frontLeft: 'short_socks', tailmark: 'rings' };
        const snapshot = JSON.stringify(input);
        const expected = canonical(input, { pose });
        const actual = generated(input, { pose });
        assert.equal(JSON.stringify(input), snapshot, `${pose}/${body} mutated caller identity`);
        assert.equal(expected.config.body, body);
        assert.equal(actual.config.body, body);
        assert.equal(JSON.stringify(actual.config), JSON.stringify(expected.config));
        assert.deepEqual(Buffer.from(actual.data), Buffer.from(expected.data), `${pose}/${body} canonical/runtime parity`);
        hashes[pose][body] = crypto.createHash('sha256').update(expected.data).digest('hex');
        parityCases += 1;
    }
}

for (const body of BODIES) assert.equal(hashes.lying[body], hashes.lying.standard, `${body} must use Standard lying presentation`);
for (const body of ['chubby', 'slim', 'fluffy']) {
    for (const pose of ['sitting', 'standing', 'crouching']) {
        assert.notEqual(hashes[pose][body], hashes[pose].standard, `${body} must regain its ${pose} silhouette after lying`);
    }
    const identity = { ...DEFAULT_CONFIG, body, eyeLeft: 'blue', eyeRight: '#4e87d6', torso: 'spotted', frontLeft: 'short_socks', tailmark: 'rings' };
    generated(identity, { pose: 'lying' });
    for (const pose of ['sitting', 'standing', 'crouching']) {
        const restored = generated(identity, { pose });
        assert.equal(restored.config.body, body, `${body} identity must survive lying -> ${pose}`);
        assert.equal(crypto.createHash('sha256').update(restored.data).digest('hex'), hashes[pose][body], `${body} ${pose} silhouette must restore after lying`);
    }
}

// Fixed paw masks are selections, not permission to repaint protected anatomy.
// Exercise every slot/style through both real renderer entry points, including
// all four identities sharing the Standard lying presentation.
const lyingTemplate = (await readManifestEntry('assets/meeow-cat/poses/lying-standard-v1/manifest.json')).template;
const pawSlots = { frontLeft: 'front_left', frontRight: 'front_right', rearLeft: 'back_left', rearRight: 'back_right' };
const previouslyAffected = {
    'frontLeft/long_socks': 1,
    'rearLeft/short_socks': 4,
    'rearLeft/medium_socks': 14,
    'rearLeft/long_socks': 14,
    'rearRight/short_socks': 7,
    'rearRight/medium_socks': 10,
    'rearRight/long_socks': 10
};
const protectedPawPixels = new Set();
const standardPawHashes = new Map();
let lyingPawParityCases = 0;
for (const body of BODIES) {
    const plain = canonical({ ...DEFAULT_CONFIG, body }, { pose: 'lying' });
    for (const [slot, assetSlot] of Object.entries(pawSlots)) {
        for (const style of OPTIONS[slot]) {
            const label = `${body}/${slot}/${style}`;
            const input = { ...DEFAULT_CONFIG, body, [slot]: style };
            const snapshot = JSON.stringify(input);
            const expected = canonical(input, { pose: 'lying' });
            const actual = generated(input, { pose: 'lying' });
            assert.equal(JSON.stringify(input), snapshot, `${label}: caller identity mutated`);
            assert.equal(expected.config.body, body);
            assert.equal(actual.config.body, body);
            assert.equal(JSON.stringify(actual.config), JSON.stringify(expected.config));
            assert.deepEqual(Buffer.from(actual.data), Buffer.from(expected.data), `${label}: pixel parity`);
            assert.deepEqual(Buffer.from(actual.effectiveMasks[slot]), Buffer.from(expected.effectiveMasks[slot]), `${label}: effective mask parity`);
            const rawMask = lyingTemplate.pawMasks[assetSlot][style];
            let protectedOverlap = 0;
            let recolored = 0;
            for (let i = 0; i < plain.data.length; i += 4) {
                const protectedPixel = Boolean(lyingTemplate.features[i + 3]);
                if (rawMask[i + 3] && protectedPixel) {
                    protectedOverlap += 1;
                    protectedPawPixels.add(i);
                }
                const shouldPaint = Boolean(rawMask[i + 3] && plain.data[i + 3] && !protectedPixel && !lyingTemplate.tails.standard.own[i + 3]);
                assert.equal(Boolean(expected.effectiveMasks[slot][i + 3]), shouldPaint, `${label}: effective ownership at pixel ${i / 4}`);
                if (protectedPixel || !shouldPaint) {
                    assert.deepEqual(expected.data.subarray(i, i + 4), plain.data.subarray(i, i + 4), `${label}: non-paw/protected pixel ${i / 4} changed`);
                } else {
                    const shade = Math.max(.35, Math.min(1.13, plain.data[i] / 185));
                    const tint = [...MARK_COLORS.white.map(value => Math.min(255, Math.round(value * shade))), plain.data[i + 3]];
                    assert.deepEqual(Array.from(expected.data.subarray(i, i + 4)), tint, `${label}: normal sock tint missing`);
                    if (!Buffer.from(expected.data.subarray(i, i + 4)).equals(Buffer.from(plain.data.subarray(i, i + 4)))) recolored += 1;
                }
            }
            assert.equal(protectedOverlap, previouslyAffected[`${slot}/${style}`] || 0, `${label}: reviewed overlap coverage`);
            assert.equal(recolored > 0, style !== 'none', `${label}: sock coloring must remain effective`);
            const hash = crypto.createHash('sha256').update(expected.data).digest('hex');
            if (body === 'standard') standardPawHashes.set(`${slot}/${style}`, hash);
            else assert.equal(hash, standardPawHashes.get(`${slot}/${style}`), `${label}: shared lying presentation`);
            lyingPawParityCases += 1;
        }
    }
}
assert.equal(lyingPawParityCases, 80);
assert.equal(protectedPawPixels.size, 25, 'cover every previously affected protected pixel');
assert.equal([...protectedPawPixels].filter(i => lyingTemplate.pads[i + 3]).length, 24);
assert.equal([...protectedPawPixels].filter(i => lyingTemplate.headRegion[i + 3]).length, 1);
const knownPad = (76 * WIDTH + 76) * 4;
for (const renderer of [canonical, generated]) {
    const frame = renderer({ rearRight: 'short_socks' }, { pose: 'lying' });
    assert.deepEqual(Array.from(frame.data.subarray(knownPad, knownPad + 4)), [178, 135, 128, 255]);
}

// Captured from production before the feature-exclusion correction. These
// aggregate full-frame baselines ensure other poses do not change, even if
// canonical and generated renderers were to regress identically.
const priorPawHashes = {
    sitting: '71888feb2010764b42d83a618f988d78575ff4df08e104121f5414952eb3633a',
    standing: '18c7cf31c631e894f5cd294b66d0216eefa806ce14d0f746d179ca70986ae251',
    crouching: '83fecb184a949dfde6fd2f6c7eebb9219ebe002070121c5592116c2f51219c10'
};
let unchangedPawCases = 0;
for (const [pose, priorHash] of Object.entries(priorPawHashes)) {
    const hash = crypto.createHash('sha256');
    for (const body of BODIES) for (const slot of Object.keys(pawSlots)) for (const style of OPTIONS[slot]) {
        const input = { ...DEFAULT_CONFIG, body, [slot]: style };
        const expected = canonical(input, { pose });
        const actual = generated(input, { pose });
        assert.deepEqual(Buffer.from(actual.data), Buffer.from(expected.data), `${pose}/${body}/${slot}/${style}: parity`);
        hash.update(JSON.stringify(input));
        hash.update(expected.data);
        unchangedPawCases += 1;
    }
    assert.equal(hash.digest('hex'), priorHash, `${pose}: paw output changed from pre-fix production`);
}

const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(indexSource, /standing:\s*'\.\/js\/meeow-cat-bank-standing\.js'/);
assert.match(indexSource, /crouching:\s*'\.\/js\/meeow-cat-bank-crouching\.js'/);
assert.match(indexSource, /lying:\s*'\.\/js\/meeow-cat-bank-lying\.js'/);
assert.match(indexSource, /catVisualPosePromises\.has\(requestedPose\)/);
assert.match(indexSource, /registerFilePoseBank\(renderer, packedBank\)/);

console.log(JSON.stringify({
    status: 'PASS',
    parityCases,
    lyingPawParityCases,
    protectedPawPixels: protectedPawPixels.size,
    unchangedPawCases,
    decodedAssetsByLazyBank: decodeDeltas,
    lyingPresentationHash: hashes.lying.standard.slice(0, 16),
    identityBodiesPreserved: BODIES
}, null, 2));
