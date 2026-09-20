import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const rendererPath = path.join(root, 'js/meeow-cat-renderer.mjs');
const sittingPath = path.join(root, 'assets/meeow-cat/v1/manifest.json');
const posePaths = {
    standing: ['standard', 'slim', 'chubby', 'fluffy'].map(body => path.join(root, `assets/meeow-cat/poses/standing-${body}-v1/manifest.json`)),
    crouching: ['standard', 'slim', 'chubby', 'fluffy'].map(body => path.join(root, `assets/meeow-cat/poses/crouching-${body}-v1/manifest.json`)),
    // Lying intentionally shares the approved Standard presentation chassis
    // across all identity bodies. The renderer preserves identityConfig.body.
    lying: [path.join(root, 'assets/meeow-cat/poses/lying-standard-v1/manifest.json')]
};
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');

function embedManifest(manifestPath) {
    const directory = path.dirname(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const hashes = [];
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.png === 'string') {
            const assetPath = path.resolve(directory, node.png);
            const bytes = fs.readFileSync(assetPath);
            hashes.push(`${path.relative(root, assetPath)}:${digest(bytes)}`);
            node.png = `data:image/png;base64,${bytes.toString('base64')}`;
            return;
        }
        Object.values(node).forEach(visit);
    };
    visit(manifest.tree);
    return { manifest, fingerprint: digest(fs.readFileSync(manifestPath)), assetFingerprint: digest(hashes.sort().join('\n')), assetCount: hashes.length };
}

const sitting = embedManifest(sittingPath);
const poseBanks = Object.fromEntries(Object.entries(posePaths).map(([pose, paths]) => [pose, paths.map(embedManifest)]));
const sourceWithoutExports = rendererSource.replace(/^export\s+/gm, '');
const runtime = `(function(global){\n'use strict';\n${sourceWithoutExports}\nasync function decodeDataPng(url){const response=await fetch(url);if(!response.ok)throw new Error('Cat asset decode failed');const bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});try{if(bitmap.width!==WIDTH||bitmap.height!==HEIGHT)throw new Error('Invalid cat asset size');const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);return context.getImageData(0,0,WIDTH,HEIGHT).data;}finally{bitmap.close();}}\nasync function createFileRenderer(banks){if(!banks?.sitting?.manifest)throw new Error('Cat sitting runtime bank missing');const bank=await loadCatAssets(banks.sitting.manifest,global.location?.href||'file:///',decodeDataPng);return createCatRenderer(bank);}\nasync function registerFilePoseBank(renderer,packedBank){if(typeof renderer?.registerPoseTemplates!=='function'||!Array.isArray(packedBank))throw new Error('Cat pose runtime bank missing');const pending=packedBank.filter(packed=>{const definition=packed?.manifest,key=definition?.body?definition.pose+':'+String(definition.body).toLowerCase():definition?.pose;return definition&&key&&!renderer.hasPoseDefinition(key);});if(!pending.length)return[];const entries=await Promise.all(pending.map(async packed=>({manifest:packed.manifest,template:await loadCatAssets(packed.manifest,global.location?.href||'file:///',decodeDataPng)})));return renderer.registerPoseTemplates(entries);}\nconst Meeow=global.Meeow=global.Meeow||{};Meeow.catRuntimeCore=Object.freeze({createFileRenderer,registerFilePoseBank,sourceFingerprint:'${digest(rendererSource)}'});\n})(window);\n`;
const sittingScript = `(function(g){const M=g.Meeow=g.Meeow||{};const B=M.catRuntimeBanks=M.catRuntimeBanks||{};B.sitting=${JSON.stringify(sitting)};})(window);\n`;
const poseScripts = Object.fromEntries(Object.entries(poseBanks).map(([pose, bank]) => [pose, `(function(g){const M=g.Meeow=g.Meeow||{};const B=M.catRuntimeBanks=M.catRuntimeBanks||{};B.${pose}=${JSON.stringify(bank)};})(window);\n`]));
const outputs = new Map([
    [path.join(root, 'js/meeow-cat-runtime.js'), runtime],
    [path.join(root, 'js/meeow-cat-bank-sitting.js'), sittingScript],
    ...Object.entries(poseScripts).map(([pose, script]) => [path.join(root, `js/meeow-cat-bank-${pose}.js`), script])
]);
let mismatch = false;
for (const [target, content] of outputs) {
    if (check) {
        if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) { console.error(`OUTDATED ${path.relative(root, target)}`); mismatch = true; }
    } else fs.writeFileSync(target, content);
}
if (mismatch) process.exitCode = 1;
const report = {
    rendererFingerprint: digest(rendererSource),
    sitting: { bytes: Buffer.byteLength(sittingScript), assets: sitting.assetCount },
    ...Object.fromEntries(Object.entries(poseScripts).map(([pose, script]) => [pose, {
        bytes: Buffer.byteLength(script),
        assets: poseBanks[pose].reduce((sum, item) => sum + item.assetCount, 0)
    }])),
    runtimeBytes: Buffer.byteLength(runtime),
    check
};
console.log(JSON.stringify(report, null, 2));
