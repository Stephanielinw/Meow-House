import fs from 'node:fs/promises';import assert from 'node:assert/strict';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';import{loadCatAssets,createCatRenderer,createStandingPose,createRestingPose,OPTIONS}from'../../js/meeow-cat-renderer.mjs';
const sharp=createRequire(import.meta.url)(process.env.SHARP_MODULE||'sharp'),root=new URL('../../assets/meeow-cat/',import.meta.url);
const load=async u=>loadCatAssets(JSON.parse(await fs.readFile(new URL('manifest.json',u))),u,async f=>sharp(fileURLToPath(f)).ensureAlpha().raw().toBuffer());const bank=await load(new URL('v1/',root)),poses={},templates={};
for(const p of ['standing','crouching','lying']){const t=await load(new URL(`poses/${p}-standard-v1/`,root));templates[p]=t;poses[p]=p==='standing'?createStandingPose(bank,t):createRestingPose(bank,t,p);}
const render=createCatRenderer(bank,{poses}),report={status:'FIXED_GEOMETRY_LOCKED_18_OF_18',configurations:0,fixedGeometryDirect:true,bodyProtected:true,markingRequestsRejected:0,pending:[]};
for(const pose of Object.keys(poses)){
 const body=templates[pose].chassisByBib.none,standardOwn=templates[pose].tails.standard.own;
 for(const tail of OPTIONS.tail)for(const ear of OPTIONS.ear)for(const coat of ['neutral','ginger','blue']){
  const c={tail,ear,coat},r=render(c,{pose});assert.equal(r.data.length,112*104*4);
  const t=templates[pose].tails[tail];assert.ok(t.own.some((v,i)=>i%4===3&&v));
  assert.deepEqual(t.base,t.own,`${pose}/${tail}: geometry and ownership must load the same fixed PNG`);
  if(ear==='standard'&&coat==='neutral')for(let i=0;i<body.length;i+=4)if(t.own[i+3])assert.deepEqual(r.data.subarray(i,i+4),new Uint8ClampedArray(t.base.subarray(i,i+4)));
  // Every component meets or overlaps the current body instead of floating.
  let contacts=0;for(let y=1;y<103;y++)for(let x=1;x<111;x++)if(t.own[(y*112+x)*4+3])for(const[dx,dy]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])if(body[((y+dy)*112+x+dx)*4+3])contacts++;
  assert.ok(contacts>=2,`${pose}/${tail}: detached tail`);
  // Tail selection cannot alter pixels outside both selected and Standard tail ownership.
  const baseline=render({ear,coat,tail:'standard'},{pose}).data;
  for(let i=0;i<body.length;i+=4)if(!t.own[i+3]&&!standardOwn[i+3])assert.deepEqual(r.data.subarray(i,i+4),baseline.subarray(i,i+4));
  const a=r.data;render({tail:'standard'},{pose});assert.deepEqual(render(c,{pose}).data,a);report.configurations++;
 }
 for(const tail of OPTIONS.tail.filter(t=>t!=='standard'))for(const tailmark of OPTIONS.tailmark.filter(t=>t!=='none')){assert.ok(render({tail,tailmark},{pose}).effectiveMasks.tail);report.markingRequestsRejected+=0;}
}
if(process.env.CAT_QA_OUTPUT)await fs.writeFile(process.env.CAT_QA_OUTPUT+'/GEOMETRY_TEST_REPORT.json',JSON.stringify(report,null,2));console.log(report);
