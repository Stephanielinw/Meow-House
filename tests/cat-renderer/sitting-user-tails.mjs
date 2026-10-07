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


const without=structuredClone(bank);delete without.sittingUniversalTails;const oldRender=createCatRenderer(without);
const report={frames:0,exactTailPixels:true,slimOffset:[-5,0],markingCases:0,markingCoverage:[]};
for(const tail of ['standard','long','thick','fluffy','short','kinked']){

 for(const body of ['standard','chubby','fluffy','slim']){
 const identity={body,tail,bib:'bib',coat:'neutral'},f=render(identity),source=bank.sittingUniversalTails[tail],user=new Uint8ClampedArray(source.length);
 for(let y=0;y<104;y++)for(let x=0;x<112;x++){const sx=x+(body==='slim'?5:0);if(sx<112)user.set(source.subarray((y*112+sx)*4,(y*112+sx)*4+4),(y*112+x)*4);}
 for(let i=0;i<user.length;i+=4)if(user[i+3])assert.deepEqual(Array.from(f.data.subarray(i,i+4)),Array.from(user.subarray(i,i+4)),'Exact neutral tail '+body+'/'+tail);
 const blue=render({...identity,coat:'blue'});assert.notDeepEqual(blue.data,f.data);
 for(const mark of ['none','tip_short','tip_long','half_tail','rings','broad_ring']){
 const marked=render({...identity,tailmark:mark}),mask=bank.assets[body[0].toUpperCase()+body.slice(1)].tails[tail].masks[mark];let outside=0,visible=0;
 for(let i=0;i<mask.length;i+=4){const mi=i+(body==='slim'?20:0);if((i/4)%112+(body==='slim'?5:0)<112&&mask[mi+3]){if(!user[i+3])outside++;else visible++;}const expected=(i/4)%112+(body==='slim'?5:0)<112&&!!mask[mi+3]&&!!user[i+3];assert.equal(!!marked.effectiveMasks.tail[i+3],expected,'Tail marking follows placement');if(!user[i+3])assert.deepEqual(marked.data.subarray(i,i+4),f.data.subarray(i,i+4),'Marking leaked outside new tail');}
 if(mark!=='none')report.markingCoverage.push({body,tail,mark,visible,oldMaskPixelsOutsideNewTail:outside});report.markingCases++;
 }
 report.frames++;
 }
}
if(process.env.TAIL_REPORT)await fs.writeFile(process.env.TAIL_REPORT,JSON.stringify(report,null,2)+'\n');
console.log({frames:report.frames,exactTailPixels:true,slimOffset:[-5,0],markingCases:report.markingCases,markingsWithNoVisiblePixels:report.markingCoverage.filter(x=>!x.visible).length,markingsClippedByNewGeometry:report.markingCoverage.filter(x=>x.oldMaskPixelsOutsideNewTail).length});

for(const body of ['standard','chubby','fluffy','slim'])for(const ear of ['standard','large','small','round','folded','tufted']){
 const f=render({body,ear,bib:'bib',coat:'neutral'});
 for(let i=0;i<f.data.length;i+=4)if(bank.ears[ear].own[i+3])assert.deepEqual(Array.from(f.data.subarray(i,i+4)),Array.from(bank.ears[ear].d.subarray(i,i+4)),'Shared ear '+body+'/'+ear);
 assert.equal(f.data[(25*112+53)*4+3],255,'Ear-root filled');
}
