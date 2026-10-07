import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createCatRenderer,loadCatAssets,OPTIONS,QA_OPTIONS} from '../../js/meeow-cat-renderer.mjs';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SHARP_MODULE || 'sharp');
const baseUrl=new URL('../../assets/meeow-cat/v1/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',baseUrl)));
const bank=await loadCatAssets(manifest,baseUrl,async url=>sharp(fileURLToPath(url)).ensureAlpha().raw().toBuffer());
const render=createCatRenderer(bank,{catalog:QA_OPTIONS});
const output=process.env.CAT_QA_OUTPUT;
const tests={crownCombinations:0,faceEarBodyCombinations:0,switchSequences:0};
const equal=(a,b)=>assert.deepEqual(a,b);
const alpha=d=>Array.from({length:112*104},(_,p)=>d[p*4+3]);
const samples=[];
for(const body of OPTIONS.body) for(const ear of OPTIONS.ear) {
  const c={body,ear,tail:'fluffy',coat:'ginger',face:'forehead_m',faceColor:'brown'};
  const frame=render(c), plain=render({...c,face:'none'});
  equal(alpha(frame.data),alpha(plain.data));
  assert.equal(frame.foreheadRoots.length,0,'Sitting must use fixed forehead art');
  const mask=bank.assets.Standard.foreheadTabbyByEarFit[ear==='standard'?'standard':'other'];
  for(let i=0;i<mask.length;i+=4)assert.equal(!!frame.effectiveMasks.face[i+3],!!mask[i+3],'Exact shared Sitting forehead');
  tests.crownCombinations++;samples.push(frame);
  for(const face of OPTIONS.face) {
    const a=render({...c,face}), b=render({...c,face:'none'});
    for(let i=0;i<a.data.length;i+=4) {
      if(!a.effectiveMasks.face[i+3])equal(a.data.subarray(i,i+4),b.data.subarray(i,i+4));
      if(bank.ears[ear].own[i+3]&&face!=='forehead_m')assert.equal(a.effectiveMasks.face[i+3],0);
      for(const n of ['eyes','nose','mouth'])if(bank.sem[n][i+3])equal(a.data.subarray(i,i+4),b.data.subarray(i,i+4));
    }
    tests.faceEarBodyCombinations++;
  }
  for(const tail of OPTIONS.tail) {
    const a={...c,tail,bib:false,frontLeft:'long_socks',frontRight:'short_socks',tailmark:'rings'};
    const first=render(a), other=render({...a,ear:'small',face:'blaze',bib:true,coat:'#576e98'}), last=render(a);
    equal(first.data,last.data);
    // Consumer mutation must not leak into later renders or source assets.
    other.data.fill(0); other.effectiveMasks.face.fill(0);equal(render(a).data,first.data);
    tests.switchSequences++;
  }
}
const combinations=[];
for(const body of OPTIONS.body)for(const tail of OPTIONS.tail)for(const ear of OPTIONS.ear)for(const bib of [true,false])combinations.push({body,tail,ear,bib,face:'blaze',torso:'mackerel_tabby',coat:'ginger',frontLeft:'long_socks',frontRight:'medium_socks',rearRight:'short_socks',tailmark:'rings'});
for(const body of OPTIONS.body)for(const torso of OPTIONS.torso)for(const face of OPTIONS.face)combinations.push({body,torso,face,tail:'fluffy',coat:'blue'});
for(const body of OPTIONS.body)for(const tail of OPTIONS.tail)for(const tailmark of OPTIONS.tailmark)for(const p of OPTIONS.frontLeft)combinations.push({body,tail,tailmark,frontLeft:p,frontRight:p,rearRight:p,coat:'chocolate'});
for(const body of OPTIONS.body)for(const coat of ['neutral','ginger','cream','blue','chocolate','black','lilac','silver'])for(const tint of ['white','dark','brown','blue','pink','gold'])combinations.push({body,coat,torso:'large_patches',torsoColor:tint,face:'eye_patch',faceColor:tint,frontLeft:'long_socks',frontLeftColor:tint,tail:'fluffy',tailmark:'half_tail',tailColor:tint,bib:false});
for(const c of combinations){
 const r=render(c), geometry=render({body:c.body,ear:c.ear??'standard',tail:c.tail,bib:c.bib??'none'});
 equal(alpha(r.data),alpha(geometry.data));
 for(let i=0;i<r.data.length;i+=4){
  for(const feature of ['eyes','nose','mouth'])if(bank.sem[feature][i+3])equal(r.data.subarray(i,i+4),geometry.data.subarray(i,i+4));
  if(r.effectiveMasks.tail[i+3])for(const paw of ['frontLeft','frontRight','rearRight'])assert.equal(r.effectiveMasks[paw][i+3],0);
 }
}
tests.fullCatConfigurations=combinations.length;
assert.throws(()=>render({ear:'unknown'}));assert.throws(()=>render({coat:'bad-color'}));assert.throws(()=>render({body:'standard',bib:'false'}));
if(output) {
  await fs.mkdir(output,{recursive:true});
  const tiles=[];
  for(let i=0;i<samples.length;i++) {
    const frame=samples[i];
    await sharp(frame.data,{raw:{width:112,height:104,channels:4}}).png().toFile(`${output}/${frame.config.body}_${frame.config.ear}.png`);
    await sharp(frame.effectiveMasks.face,{raw:{width:112,height:104,channels:4}}).png().toFile(`${output}/${frame.config.body}_${frame.config.ear}_mask.png`);
    tiles.push({input:await sharp(frame.data,{raw:{width:112,height:104,channels:4}}).extract({left:17,top:5,width:44,height:40}).resize(264,240,{kernel:'nearest'}).png().toBuffer(),left:i%6*264,top:Math.floor(i/6)*278+38},{input:Buffer.from(`<svg width="264" height="38"><text x="10" y="26" font-family="sans-serif" font-size="16">${frame.config.body} / ${frame.config.ear}</text></svg>`),left:i%6*264,top:Math.floor(i/6)*278});
  }
  await sharp({create:{width:1584,height:1112,channels:4,background:'#eee8dd'}}).composite(tiles).png().toFile(output+'/ALL_HEADS.png');
  await fs.writeFile(output+'/TEST_REPORT.json',JSON.stringify(tests,null,2));
}
console.log(tests);
