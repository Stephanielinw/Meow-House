import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {createCatRenderer,createRestingPose,loadCatAssets,OPTIONS,QA_OPTIONS} from '../../js/meeow-cat-renderer.mjs';
const sharp=createRequire(import.meta.url)(process.env.SHARP_MODULE||'sharp');const root=new URL('../../assets/meeow-cat/',import.meta.url);const load=async u=>loadCatAssets(JSON.parse(await fs.readFile(new URL('manifest.json',u))),u,async f=>sharp(fileURLToPath(f)).ensureAlpha().raw().toBuffer());
const bank=await load(new URL('v1/',root)),poses={},templates={};for(const pose of ['crouching','lying']){templates[pose]=await load(new URL(`poses/${pose}-standard-v1/`,root));poses[pose]=createRestingPose(bank,templates[pose],pose);}const render=createCatRenderer(bank,{poses,catalog:QA_OPTIONS}),sitOnly=createCatRenderer(bank,{catalog:QA_OPTIONS}),out=process.env.CAT_QA_OUTPUT;
const report={status:'CANDIDATE_VISUAL_REVIEW_PENDING',poseCases:{},featureAndPadProtection:true,identityPreserved:true,sittingUnchanged:true};
// Anatomy landmarks are reviewed against the neutral reference, independently
// of the mapping builder. A self-consistent but misplaced region must fail.
const landmarks={
 crouching:{torso:[[61,59],[74,65],[70,77]],front_left:[[23,85]],front_right:[[37,86]],hind_near:[[65,84]],tail:[[85,80],[74,87]]},
 lying:{torso:[[60,52],[77,60]],front_left:[[24,78]],front_right:[[42,78]],hind_far:[[65,76]],hind_near:[[76,77]],tail:[[96,78],[84,84]]}
};
for(const pose of Object.keys(poses)){
 const dir=new URL(`poses/${pose}-standard-v1/`,root),t=templates[pose];
 const read=async name=>sharp(fileURLToPath(new URL(name+'.png',dir))).ensureAlpha().raw().toBuffer();
 const regions={};
 for(const part of ['head','chest','torso','front_left','front_right','hind_far','hind_near','tail'])regions[part]=await read(part+'_region');
 for(let i=0;i<t.base.length;i+=4)assert.equal(Object.values(regions).filter(m=>m[i+3]).length,t.base[i+3]?1:0,'Ownership must partition visible geometry');
 for(const[part,points]of Object.entries(landmarks[pose]))for(const[x,y]of points)assert.ok(regions[part][(y*112+x)*4+3],`${pose} ${part} misplaced at ${x},${y}`);
 for(const part of ['torso','front_left','front_right','hind_far','hind_near','tail']){
  const fill=await read(part+'_fillable'),uv=t[part==='tail'?'tailCoordinates':part+'UV'];
  for(let i=0;i<fill.length;i+=4)assert.equal(uv[i+3],fill[i+3],`${pose} ${part}: unmapped fur or UV spill`);
 }
 assert.equal(poses[pose].earComposition,'fixed-overlay','Non-Sitting ears must use the locked body-preserving overlay contract');
 for(const ear of OPTIONS.ear){
  const result=render({ear},{pose});
  for(let i=0;i<t.chassisByBib.none.length;i+=4)if(t.chassisByBib.none[i+3])assert.ok(result.data[i+3],'Ear overlay cleared a current body pixel');
 }
 const tips=['tip_short','tip_long','half_tail'].map(tailmark=>render({tailmark},{pose}).effectiveMasks.tail);
 for(let i=0;i<t.base.length;i+=4){if(tips[0][i+3])assert.ok(tips[1][i+3]);if(tips[1][i+3])assert.ok(tips[2][i+3]);}
}
report.anatomyLandmarks=true;report.completeUVSupport=true;report.earSwitchPreservesBody=true;report.nestedTailTips=true;
for(const pose of Object.keys(poses)){let count=0;for(const ear of OPTIONS.ear)for(const face of OPTIONS.face)for(const torso of OPTIONS.torso){let c={ear,face,torso,coat:'ginger',frontLeft:'short_socks',frontRight:'long_socks',rearRight:'short_socks',tailmark:'rings'},r=render(c,{pose}),plain=render({ear,coat:'ginger'},{pose});assert.deepEqual(r.config,render(c).config);assert.deepEqual(render(c).data,sitOnly(c).data);for(let i=0;i<r.data.length;i+=4){assert.equal(r.data[i+3],plain.data[i+3]);if(templates[pose].features[i+3])assert.deepEqual(r.data.subarray(i,i+4),new Uint8ClampedArray(templates[pose].base.subarray(i,i+4)),'Protected expression / pad changed');for(const paw of ['frontLeft','frontRight','rearRight'])if(r.effectiveMasks.tail[i+3])assert.equal(r.effectiveMasks[paw][i+3],0);}count++;}
for(const tailmark of OPTIONS.tailmark)for(const p of OPTIONS.frontLeft){const c={coat:'blue',tailmark,frontLeft:p,frontRight:p,rearRight:p},r=render(c,{pose});const first=render(c).data;render(c,{pose});assert.deepEqual(render(c).data,first);for(const [part,name]of [['tail',tailmark],['frontLeft',p],['frontRight',p],['rearRight',p]])if(name!=='none')assert.ok(r.effectiveMasks[part].some((v,i)=>i%4===3&&v),'Missing '+part);count++;}report.poseCases[pose]=count;
if(pose==='lying'){
 const standard=render({body:'standard'},{pose});
 for(const body of OPTIONS.body){
  const identity={body},snapshot=JSON.stringify(identity),frame=render(identity,{pose});
  assert.equal(JSON.stringify(identity),snapshot,'Lying must not mutate caller identity');
  assert.equal(frame.config.body,body,'Lying must preserve the returned identity body');
  assert.deepEqual(frame.data,standard.data,'Every body uses the intentional Standard lying presentation');
 }
}else{
 // This fixture registers only Standard crouching, not the body-specific banks.
 assert.throws(()=>render({body:'chubby'},{pose}));
}
assert.ok(render({tail:'fluffy'},{pose}).data.some(v=>v));assert.equal(render({bib:false},{pose}).config.bib,'none');}
if(out){await fs.mkdir(out,{recursive:true});const identities=[{coat:'ginger',face:'forehead_m',faceColor:'dark',torso:'mackerel_tabby',frontLeft:'short_socks',frontRight:'short_socks',tailmark:'rings'},{coat:'chocolate',ear:'round',face:'blaze',torso:'large_patches',torsoColor:'white',frontLeft:'medium_socks',frontRight:'medium_socks',rearRight:'short_socks',tailmark:'tip_long',tailColor:'white'},{coat:'blue',ear:'large',face:'eye_patch',torso:'classic_tabby',frontLeft:'long_socks',frontRight:'long_socks',frontRightColor:'blue',rearRight:'toe_tips',tailmark:'broad_ring'},{coat:'cream',ear:'tufted',face:'muzzle',torso:'spotted',torsoColor:'brown',frontLeft:'toe_tips',frontRight:'short_socks',rearRight:'short_socks',tailmark:'half_tail',tailColor:'brown'}];let tiles=[];for(let[col,c]of identities.entries()){await fs.writeFile(out+`/0${col+1}_identity.json`,JSON.stringify(render(c).config,null,2));for(let[row,pose]of ['sitting','crouching','lying'].entries()){let r=render(c,{pose});await sharp(r.data,{raw:{width:112,height:104,channels:4}}).png().toFile(out+`/0${col+1}_${pose}.png`);if(pose!=='sitting')for(const[n,m]of Object.entries(r.effectiveMasks))await sharp(m,{raw:{width:112,height:104,channels:4}}).png().toFile(out+`/0${col+1}_${pose}_${n}_mask.png`);tiles.push({input:await sharp(r.data,{raw:{width:112,height:104,channels:4}}).resize(448,416,{kernel:'nearest'}).png().toBuffer(),left:col*448,top:row*460+44},{input:Buffer.from(`<svg width="448" height="44"><text x="12" y="29" font-family="sans-serif" font-size="19">0${col+1} / ${c.coat} / ${pose}</text></svg>`),left:col*448,top:row*460});}}await sharp({create:{width:1792,height:1380,channels:4,background:'#eee8dd'}}).composite(tiles).png().toFile(out+'/THREE_POSES.png');await fs.writeFile(out+'/TEST_REPORT.json',JSON.stringify(report,null,2));}
console.log(report);
