import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCatRenderer, loadCatAssets } from '../../js/meeow-cat-renderer.mjs';

const sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE || 'sharp');
const root = new URL('../../assets/meeow-cat/v1/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root)));
const bank = await loadCatAssets(manifest, root, async url => sharp(fileURLToPath(url)).ensureAlpha().raw().toBuffer());
const render = createCatRenderer(bank);

const catA = {body:'standard',bib:'bib',coat:'blue',ear:'folded',tail:'long',torso:'classic_tabby',frontLeft:'short_socks',frontRight:'short_socks',rearRight:'short_socks'};
const catB = {body:'standard',bib:'none',coat:'ginger',ear:'large',tail:'short',torso:'none'};
const a = render(catA), b = render(catB);
const alphaCount = data => { let count=0; for(let i=3;i<data.length;i+=4) if(data[i]) count++; return count; };
const different = (x,y) => !Buffer.from(x).equals(Buffer.from(y));

assert.equal(alphaCount(a.effectiveMasks.bib),222,'Bib chassis ownership must come from the authored chassis pair');
assert.equal(alphaCount(b.effectiveMasks.bib),0,'bib:none must not expose bib ownership');
assert.ok(alphaCount(a.effectiveMasks.torso)>0,'Tabby layer must remain active');
assert.ok(alphaCount(a.effectiveMasks.foreheadTabby)>0,'Tabby family must include the approved forehead marking');
assert.ok(alphaCount(a.effectiveMasks.frontLeft)>0&&alphaCount(a.effectiveMasks.frontRight)>0&&alphaCount(a.effectiveMasks.rearRight)>0,'Short socks must remain active');
assert.ok(different(a.data,render({...catA,ear:'standard'}).data),'Folded ears must change the composite');
assert.ok(different(b.data,render({...catB,ear:'standard'}).data),'Large ears must change the composite');
assert.ok(different(a.data,render({...catA,tail:'standard'}).data),'Long tail must change the composite');
assert.ok(different(b.data,render({...catB,tail:'standard'}).data),'Short tail must change the composite');

// A fake legacy chest restore and a fake independent bib overlay must have no
// effect on the new Standard Sitting chassis path.
const poisoned = structuredClone(bank);
poisoned.assets.Standard.none.fill(255);
poisoned.assets.Standard.bib={bib:new Uint8ClampedArray(112*104*4).fill(255)};
const poisonedRender=createCatRenderer(poisoned);
assert.deepEqual(poisonedRender(catA).data,a.data,'Legacy bib overlay was applied');
assert.deepEqual(poisonedRender(catB).data,b.data,'Legacy bib:none restore was applied');

const maskPoisoned=structuredClone(bank);
maskPoisoned.ears.folded.mask.fill(255);maskPoisoned.ears.large.mask.fill(255);
const ownershipRender=createCatRenderer(maskPoisoned);
assert.deepEqual(ownershipRender(catA).data,a.data,'Folded ear used the broad replacement mask instead of ownership');
assert.deepEqual(ownershipRender(catB).data,b.data,'Large ear used the broad replacement mask instead of ownership');

// Bib follows coat while preserving geometry and authored value variation.
const orange=render({...catA,coat:'ginger'});
assert.throws(()=>render({...catA,bibColor:'cream'}),/Unknown option/);
let changed=0;const shades=new Set();
for(let i=0;i<a.data.length;i+=4){
 assert.equal(a.data[i+3],orange.data[i+3]);
 if(a.effectiveMasks.bib[i+3]){changed+=different(a.data.subarray(i,i+3),orange.data.subarray(i,i+3));shades.add(a.data[i]);}
}
assert.ok(changed>0);assert.ok(shades.size>4);
for(const ear of ['large','small','round','folded','tufted'])assert.equal(render({...catA,ear}).data[(25*112+53)*4+3],255,ear+' ear-root hole');
console.log({status:'PASS',bibOwnershipPixels:alphaCount(a.effectiveMasks.bib),foreheadTabbyPixels:alphaCount(a.effectiveMasks.foreheadTabby),derivedBibShades:shades.size});

for(const bib of ['none','bib']) {
 const native=render({ear:'standard',bib,coat:'neutral'}).data,source=bank.ears.standard.d;
 for(let y=0;y<43;y++)for(let x=0;x<112;x++){const i=(y*112+x)*4;assert.deepEqual(Array.from(native.subarray(i,i+4)),Array.from(source.subarray(i,i+4)),'Head must match approved Standard head, not body reference');}
}
for(const coat of ['blue','ginger']) {
 const f=render({...catA,coat}),rgb=coat==='blue'?[131,149,167]:[200,142,87],source=bank.assets.Standard.chassisByBib.bib;
 const laterLayers=['torso','foreheadTabby','face','frontLeft','frontRight','rearRight','tail'];
 for(let i=44*112*4;i<f.data.length;i+=4)if(f.effectiveMasks.bib[i+3]&&f.data[i+3]&&source[i+3]&&!bank.sittingUniversalTails[catA.tail][i+3]&&!laterLayers.some(name=>f.effectiveMasks[name]?.[i+3]))for(let k=0;k<3;k++)assert.equal(f.data[i+k],Math.min(255,Math.round(rgb[k]*Math.max(.18,Math.min(1.3,source[i]/175)))),'Visible bib must use existing body recolor');
}

// Body references have no authority above the head/chest seam.
const alteredBody=structuredClone(bank);
for(const bib of ['none','bib'])alteredBody.assets.Standard.chassisByBib[bib].fill(0,0,44*112*4);
const isolated=createCatRenderer(alteredBody);
for(const ear of ['standard','folded'])for(const bib of ['none','bib'])assert.deepEqual(isolated({...catA,ear,bib}).data,render({...catA,ear,bib}).data);

for(const ear of ['standard','large','small','round','folded','tufted']){
 const frame=render({...catA,ear}),mask=bank.assets.Standard.foreheadTabbyByEarFit[ear==='standard'?'standard':'other'];
 for(let i=0;i<mask.length;i+=4)assert.equal(!!frame.effectiveMasks.foreheadTabby[i+3],!!mask[i+3],'Exact user mask '+ear);
 assert.deepEqual(render({...catA,ear,face:'forehead_m'}).data,frame.data,'No duplicate forehead');
 const unused=structuredClone(bank);unused.faces.forehead_tabby.fill(0);
 assert.deepEqual(createCatRenderer(unused)({...catA,ear}).data,frame.data,'No legacy root adapter');
}
// User face replacements are scoped to Standard Sitting and applied once.
for(const face of ['eye_patch','muzzle'])for(const torso of ['none','classic_tabby']){
 const identity={...catA,ear:'standard',face,torso},f=render(identity),plain=render({...identity,face:'none'}),mask=bank.assets.Standard.sittingFaces[face];
 for(let i=0;i<mask.length;i+=4){assert.equal(!!f.effectiveMasks.face[i+3],!!mask[i+3]);assert.equal(f.data[i+3],plain.data[i+3]);if(!mask[i+3])assert.deepEqual(f.data.subarray(i,i+4),plain.data.subarray(i,i+4));}
 const poisonedFace=structuredClone(bank);poisonedFace.faces[face].fill(255);
 assert.deepEqual(createCatRenderer(poisonedFace)(identity).data,f.data,'Legacy face must not be composited');
 if(torso==='classic_tabby')assert.deepEqual(f.effectiveMasks.foreheadTabby,plain.effectiveMasks.foreheadTabby);
}
