(function(global){
'use strict';
/** Pixel-exact cat composition. No DOM, filesystem or mutable render state. */
const WIDTH = 112;
const HEIGHT = 104;
const SIZE = WIDTH * HEIGHT * 4;
/** Canonical Cat Creator v1 identity schema. Asset filenames retain their
 * historical spelling behind a normalization boundary. */
const OPTIONS = Object.freeze({
  body: ['standard', 'chubby', 'slim', 'fluffy'],
  ear: ['standard', 'large', 'small', 'round', 'folded', 'tufted'],
  tail: ['standard', 'long', 'thick', 'fluffy', 'short', 'kinked'],
  face: ['none', 'muzzle', 'blaze', 'point', 'eye_patch', 'forehead_m'],
  torso: ['none', 'classic_tabby', 'mackerel_tabby', 'spotted', 'large_patches', 'saddle_cape'],
  bib: ['none', 'bib'],
  frontLeft: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
  frontRight: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
  rearLeft: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
  rearRight: ['none', 'toe_tips', 'short_socks', 'medium_socks', 'long_socks'],
  tailmark: ['none', 'tip_short', 'tip_long', 'half_tail', 'rings', 'broad_ring'],
});
/** Source-asset vocabulary is intentionally broader than the Cat Creator menu.
 * QA may exercise every authored mask, while normal renderer instances expose
 * only traits explicitly approved for the product. */
const PRODUCTION_OPTIONS = OPTIONS;
const QA_OPTIONS = OPTIONS;
const TRAIT_CATALOG = Object.freeze({
  production:{torso:[...PRODUCTION_OPTIONS.torso]},
  qaOnly:{torso:[]}
});
const COAT_COLORS = Object.freeze({neutral: null, ginger: [200,142,87], cream: [219,201,164], blue: [131,149,167], chocolate: [126,96,80], black: [72,76,85], lilac: [175,151,171], silver: [190,194,200]});
const MARK_COLORS = Object.freeze({dark: [82,69,65], white: [237,227,208], cream: [225,211,188], brown: [130,79,48], blue: [80,107,135], pink: [197,140,151], gold: [194,137,65]});
const EYE_COLORS = Object.freeze({original:null, blue:[80,140,198], gold:[196,142,55], green:[88,151,111]});
const MUZZLE_COLORS = Object.freeze({base:'base',original:null,cream:[225,211,188]});
const DEFAULT_CONFIG = Object.freeze({body:'standard', ear:'standard', tail:'standard', bib:'none', face:'none', torso:'none', frontLeft:'none', frontRight:'none', rearLeft:'none', rearRight:'none', tailmark:'none', coat:'neutral', muzzleColor:'base',faceColor:'white', torsoColor:'dark', frontLeftColor:'white', frontRightColor:'white', rearLeftColor:'white', rearRightColor:'white', tailColor:'dark', eyeLeft:'original', eyeRight:'original'});
const ASSET_ID=Object.freeze({body:{standard:'Standard',chubby:'Chubby',slim:'Slim',fluffy:'Fluffy'},face:{point:'point_face',forehead_m:'forehead_tabby'},torso:{mackerel_tabby:'mackerel'}});
const canonical=(group,value)=>ASSET_ID[group]?.[value]??value;
function normalizeCatIdentity(input={}) {
  const out={...input};
  for(const [legacy,current] of Object.entries({left:'frontLeft',right:'frontRight',hind:'rearRight',leftColor:'frontLeftColor',rightColor:'frontRightColor',hindColor:'rearRightColor'}))if(out[current]===undefined&&out[legacy]!==undefined){out[current]=out[legacy];delete out[legacy];}
  if(out.body!==undefined)out.body=String(out.body).toLowerCase();
  if(out.torso==='mackerel')out.torso='mackerel_tabby';
  if(out.face==='point_face'||out.face==='half_face')out.face='point';
  if(out.face==='forehead_tabby')out.face='forehead_m';
  if(out.bib===true||['small_bib','medium_bib','full_bib',true].includes(out.bib))out.bib='bib';
  if(out.bib===false)out.bib='none';
  if(out.bib===undefined)delete out.bib;
  return out;
}
const blank = () => new Uint8ClampedArray(SIZE);
const replacePixel = (out, source, i) => out.set(source.subarray(i,i+4),i);
const alphaOverPixel = (out, source, i) => {
  const sourceAlpha=source[i+3]/255;
  if(!sourceAlpha)return;
  if(sourceAlpha===1){replacePixel(out,source,i);return;}
  const destinationAlpha=out[i+3]/255;
  const outputAlpha=sourceAlpha+destinationAlpha*(1-sourceAlpha);
  for(let channel=0;channel<3;channel++)out[i+channel]=Math.round((source[i+channel]*sourceAlpha+out[i+channel]*destinationAlpha*(1-sourceAlpha))/outputAlpha);
  out[i+3]=Math.round(outputAlpha*255);
};
const composite = (...layers) => {
  const out=blank();
  for(const layer of layers) for(let i=0;i<SIZE;i+=4) if(layer?.[i+3]) replacePixel(out,layer,i);
  return out;
};
function color(value, palette) {
  if (Object.hasOwn(palette,value)) return palette[value];
  if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  throw new TypeError(`Invalid color: ${value}`);
}
function config(input, catalog=PRODUCTION_OPTIONS) {
  const normalized=normalizeCatIdentity(input);
  for (const key of Object.keys(normalized)) if (!Object.hasOwn(DEFAULT_CONFIG,key)) throw new TypeError(`Unknown option: ${key}`);
  const c = {...DEFAULT_CONFIG,...normalized};
  for (const [key,values] of Object.entries(catalog)) if (!values.includes(c[key])) throw new TypeError(`Unsupported production option ${key}: ${c[key]}`);
  if (!OPTIONS.bib.includes(c.bib)) throw new TypeError(`Invalid bib: ${c.bib}`);
  color(c.coat,COAT_COLORS);
  for (const key of ['faceColor','torsoColor','frontLeftColor','frontRightColor','rearLeftColor','rearRightColor','tailColor']) color(c[key],MARK_COLORS);
  if(!Object.hasOwn(MUZZLE_COLORS,c.muzzleColor)) throw new TypeError(`Invalid muzzleColor: ${c.muzzleColor}`);
  color(c.eyeLeft,EYE_COLORS); color(c.eyeRight,EYE_COLORS);
  return c;
}

const poseCapabilityError = (code, message) => {
  const error = new RangeError(message);
  error.name = 'CatPoseCapabilityError';
  error.code = code;
  return error;
};

/** Three authored tapered stripes. Each root meets the first fillable crown pixel,
 * below the outline, on the currently selected ear/head geometry. Body width and
 * canvas center never influence these head-local coordinates. */
function buildForeheadMask(neutral, earOwned, features) {
  const mask = blank(), roots = [];
  const strokes = [{topX:31,endX:28,endY:24}, {topX:36,endX:33,endY:25}, {topX:41,endX:38,endY:24}];
  const fillable = (x,y) => {
    const i=(y*WIDTH+x)*4;
    return neutral[i+3] && neutral[i]>90 && !earOwned[i+3] && !features[i+3];
  };
  // Use the inter-ear crown, not an ear tip above the forehead.
  let crownY=-1;
  for(let y=8;y<=22;y++) if(fillable(36,y)) {crownY=y;break;}
  if(crownY<0) throw new Error('Missing inter-ear crown');
  for (const stroke of strokes) {
    let topY=-1;
    for(let y=crownY;y<=22;y++) if(fillable(stroke.topX,y)) {topY=y;break;}
    if(topY<0) throw new Error('Missing crown anchor');
    roots.push({x:stroke.topX,y:topY});
    for(let y=topY;y<=stroke.endY;y++) {
      const progress=(y-topY)/Math.max(1,stroke.endY-topY);
      const x=Math.round(stroke.topX+(stroke.endX-stroke.topX)*progress);
      const width=progress<0.60?2:1;
      for(let k=0;k<width;k++) if(fillable(x+k,y)) mask.set([255,255,255,255],(y*WIDTH+x+k)*4);
    }
  }
  return {mask,roots};
}

function createCatRenderer(bank, {poses={},catalog=PRODUCTION_OPTIONS}={}) {
  // Clone once: callers and returned frames cannot mutate the renderer's source bank.
  const clone = v => ArrayBuffer.isView(v) ? new Uint8ClampedArray(v) : Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]));
  const {assets,ears,legacyEars,faces,sem,chassis,sittingUniversalTails}=clone(bank);
  const eyeMasks={left:blank(),right:blank()};
  const eyePixels=[];for(let i=0;i<SIZE;i+=4)if(sem.eyes[i+3])eyePixels.push(i/4);
  const splitX=eyePixels.reduce((sum,p)=>sum+(p%WIDTH),0)/Math.max(1,eyePixels.length);
  for(const p of eyePixels){const i=p*4;(p%WIDTH)<splitX?eyeMasks.left.set([255,255,255,255],i):eyeMasks.right.set([255,255,255,255],i);}
  const rendererBank={assets,ears,legacyEars,faces,sem,chassis,sittingUniversalTails};
  const clonePose=p=>({...p,assets:clone(p.assets),...(p.ears?{ears:clone(p.ears)}:{}),...(p.faces?{faces:clone(p.faces)}:{}),...(p.foreheadTabbyByEarFit?{foreheadTabbyByEarFit:clone(p.foreheadTabbyByEarFit)}:{}),...(p.features?{features:new Uint8ClampedArray(p.features)}:{}),...(p.furOwnership?{furOwnership:new Uint8ClampedArray(p.furOwnership)}:{}),...(p.muzzleOwn?{muzzleOwn:new Uint8ClampedArray(p.muzzleOwn)}:{}),...(p.outline?{outline:new Uint8ClampedArray(p.outline)}:{})});
  const poseAssets={};
  const registerPoseDefinitions=additions=>{
    const registered=[];
    for(const[name,definition]of Object.entries(additions||{})){
      if(!name||!definition)continue;
      poseAssets[name]=clonePose(definition);registered.push(name);
    }
    return registered;
  };
  registerPoseDefinitions(poses);
  const features=blank();
  for(const n of ['eyes','nose','mouth']) for(let i=0;i<SIZE;i+=4) if(sem[n][i+3]) features[i+3]=255;
  const renderCat=function renderCat(input={}, {pose='sitting'}={}) {
    const c=config(input,catalog);
    const definition=pose==='sitting'?null:(poseAssets[pose+':'+c.body]??poseAssets[pose]);
    if(pose!=='sitting'&&!definition) throw poseCapabilityError('CAT_POSE_UNAVAILABLE', `Unsupported pose: ${pose}`);
    if(definition) for(const [key,values] of Object.entries(definition.supports)) {
      if(!values.includes(c[key])) throw poseCapabilityError('CAT_POSE_OPTION_UNSUPPORTED', `${pose} does not yet support ${key}=${c[key]}`);
    }
    // A pose may intentionally share one presentation chassis across identity
    // bodies.  This changes asset selection only; the canonical identity config
    // returned to the caller remains untouched.
    const poseBody=definition?.assetBodyAlias??c.body;
    const a=(definition?.assets??assets)[canonical('body',poseBody)], legacyTail=a.tails[c.tail], ear=(definition?.ears??(pose==='sitting'?ears:legacyEars))[c.ear];
    const fixedEarOverlay=definition?.earComposition==='fixed-overlay';
    const earInnerOwns=i=>!!ear.inner[i+3]&&(!fixedEarOverlay||!!ear.own[i+3]);
    const sharedTail=pose==='sitting'?sittingUniversalTails?.[c.tail]:null;
    const shiftLeft5=source=>{const out=blank();for(let y=0;y<HEIGHT;y++)for(let x=5;x<WIDTH;x++){const i=(y*WIDTH+x)*4;out.set(source.subarray(i,i+4),i-20);}return out;};
    const slimOffset=!!sharedTail&&c.body==='slim';
    const universalTail=slimOffset?shiftLeft5(sharedTail):sharedTail;
    const tail=universalTail?{...legacyTail,own:universalTail,masks:slimOffset?Object.fromEntries(Object.entries(legacyTail.masks).map(([name,mask])=>[name,shiftLeft5(mask)])):legacyTail.masks}:legacyTail;
    if(!tail.masks[c.tailmark])throw new RangeError(`Tail markings pending geometry approval: ${pose}/${c.tail}/${c.tailmark}`);
    const featureMask=definition?.features??features;
    // Sitting body types select BODY/CHEST pixels by bib state; head/ears
    // remain owned by the approved sitting head system.
    // The derived difference mask is material ownership only; it is never a
    // separately composited bib image.
    const sittingBibChassis=pose==='sitting'&&a.chassisByBib?.[c.bib];
    const poseBibChassis=pose!=='sitting'&&a.chassisByBib?.[c.bib];
    const fixedBibChassis=sittingBibChassis||poseBibChassis;
    const bibOwnership=blank();
    // Special-body references may differ inside the protected head plane; those
    // pixels never become bib ownership. Preserve the graduated Standard mask.
    const bibOwnershipStart=poseBody==='standard'?0:44*WIDTH*4;
    if(fixedBibChassis&&c.bib==='bib') for(let i=bibOwnershipStart;i<SIZE;i+=4) {
      const none=a.chassisByBib.none,bib=a.chassisByBib.bib;
      if(none[i]!==bib[i]||none[i+1]!==bib[i+1]||none[i+2]!==bib[i+2]||none[i+3]!==bib[i+3]) bibOwnership[i+3]=255;
    }
    // Component poses keep tailBack, body, shared head and tailFront as separate
    // authoritative sources. `base` remains available for the older baked banks.
    const data=fixedBibChassis
      ? new Uint8ClampedArray(fixedBibChassis)
      : definition?.chassisLayers
      ? composite(tail.back,definition.chassisLayers.base,tail.front)
      : definition?.componentLayers
      ? composite(tail.back,a.body,definition.componentLayers.head,tail.front)
      : new Uint8ClampedArray(universalTail?a.tails.standard.base:tail.base);
    // The sitting head/chest seam is row 44. Restore the entire head plane
    // (including transparent pixels) from the approved shared ear/head source.
    // New body references cannot overwrite forehead, face or native ears.
    if(sittingBibChassis) data.set(ears.standard.d.subarray(0,44*WIDTH*4),0);
    // Slim's authored neck taper begins two rows above the shared row-44 seam.
    // Its alpha owns only the exterior silhouette here; overlapping material
    // remains the approved shared head pixels copied above.
    if(sittingBibChassis&&c.body==='slim') for(let y=42;y<=43;y++) for(let x=0;x<WIDTH;x++) {
      const i=(y*WIDTH+x)*4;
      if(data[i+3]&&!sittingBibChassis[i+3]) data.fill(0,i,i+4);
    }
    // Sitting tails are shared components. The supplied chassis is tailless,
    // so copy only the selected tail ownership region from its authored base.
    if(universalTail) {
      // Remove the old baked tail with its existing ownership; paste the exact
      // shared tail at its authored canvas coordinates, with no body adapter.
      if(!sittingBibChassis) for(let i=0;i<SIZE;i+=4)if(a.tails.standard.own[i+3])data.fill(0,i,i+4);

    } else if(fixedBibChassis) for(let i=0;i<SIZE;i+=4) {
      if(tail.own[i+3]) replacePixel(data,tail.base,i);
    }
    for(let i=0;i<SIZE;i+=4) {
      if(!sittingBibChassis&&c.bib==='none' && a.clear[i+3]) replacePixel(data,a.none,i);
      if(pose==='sitting' && c.ear!=='standard' && chassis.earClear[i+3]) replacePixel(data,chassis.earless,i);
      const earMask=fixedEarOverlay||pose==='sitting'||definition?.componentLayers?.earMask==='own'?ear.own:ear.mask;
      if(earMask[i+3]) fixedEarOverlay?alphaOverPixel(data,ear.d,i):replacePixel(data,ear.d,i);
    }
    // Tail geometry is above the complete body/chest composition. Its ownership
    // also excludes body patterns/socks; tail markings are painted last.
    if(universalTail)for(let i=0;i<SIZE;i+=4)if(universalTail[i+3])replacePixel(data,universalTail,i);
    const neutral=new Uint8ClampedArray(data), effectiveMasks={};
    const coat=color(c.coat,COAT_COLORS);
    // Standard Standing/Crouching bib pixels are authored chassis material.
    // Their lighter source values define body-palette shading; they are not a
    // separate marking region and must participate in the normal coat pass.
    const standardPoseBibIsBodyMaterial=(c.body==='standard'&&['standing','crouching'].includes(pose))||definition?.bibIsBodyMaterial===true;
    if(coat) for(let i=0;i<SIZE;i+=4) {
      if(!data[i+3] || featureMask[i+3] || earInnerOwns(i) || (poseBibChassis&&!standardPoseBibIsBodyMaterial&&bibOwnership[i+3]) || (definition?.furOwnership&&!definition.furOwnership[i+3])) continue;
      const shade=Math.max(.18,Math.min(1.3,neutral[i]/175));
      for(let k=0;k<3;k++) data[i+k]=Math.min(255,Math.round(coat[k]*shade));
    }
    for (const [side, tint] of [['left', c.eyeLeft], ['right', c.eyeRight]]) if (tint !== 'original') {
      const rgb=color(tint,EYE_COLORS), effective=blank();
      for(let i=0;i<SIZE;i+=4) if(eyeMasks[side][i+3] && data[i+3]) {
        for(let k=0;k<3;k++) data[i+k]=rgb[k];
        effective.set([255,255,255,255],i);
      }
      effectiveMasks[`eye${side[0].toUpperCase()}${side.slice(1)}`]=effective;
    }
    function paint(name,mask,tint,allow=()=>true) {
      const rgb=color(tint,MARK_COLORS), effective=blank();
      for(let i=0;i<SIZE;i+=4) if(mask[i+3] && data[i+3] && !definition?.outline?.[i+3] && allow(i)) {
        const shade=Math.max(.35,Math.min(1.13,neutral[i]/185));
        for(let k=0;k<3;k++) data[i+k]=Math.min(255,Math.round(rgb[k]*shade));
        effective.set([255,255,255,255],i);
      }
      effectiveMasks[name]=effective;
    }
    paint('torso',(a.torsoByBib?.[c.bib]??a.torso)[canonical('torso',c.torso)],c.torsoColor,i=>!tail.own[i+3]&&!(fixedBibChassis?bibOwnership[i+3]:a.clear[i+3]));
    if(fixedBibChassis) effectiveMasks.bib=new Uint8ClampedArray(bibOwnership);
    else if(a.bib?.[c.bib]) paint('bib',a.bib[c.bib],'white',i=>!tail.own[i+3]);
    const sittingFaceAuthority=pose==='sitting'?assets.Standard:null;
    const earFit=c.ear==='standard'?'standard':'other';
    const userForehead=sittingFaceAuthority?.foreheadTabbyByEarFit?.[earFit]??definition?.foreheadTabbyByEarFit?.[earFit]??null;
    const tabbyFamily=(pose==='sitting'||definition?.automaticForeheadTabby)&&['classic_tabby','mackerel_tabby'].includes(c.torso);
    if(tabbyFamily) {
      paint('foreheadTabby',userForehead??faces.forehead_tabby,c.torsoColor,i=>userForehead?true:!ear.own[i+3]&&!earInnerOwns(i)&&!featureMask[i+3]);
    }
    const faceAsset=canonical('face',c.face),forehead=!userForehead&&!definition?.faces&&c.face==='forehead_m'?buildForeheadMask(neutral,ear.own,featureMask):null;
    const sittingFace=sittingFaceAuthority?.sittingFaces?.[faceAsset]??null;
    // Ear replacement includes forehead repair pixels. Only actual ear ownership
    // occludes face markings; never use the replacement/difference mask here.
    paint('face',sittingFace??(userForehead&&c.face==='forehead_m'?(tabbyFamily?faces.none:userForehead):definition?.faces?.[c.ear]?.[faceAsset]??forehead?.mask??faces[faceAsset]),c.faceColor,i=>userForehead&&c.face==='forehead_m'?true:!ear.own[i+3]&&!earInnerOwns(i)&&!featureMask[i+3]);
    // The muzzle is an immutable anatomical owner, applied above every face
    // marking and below feature pixels. A deliberate future tint is explicit.
    if(definition?.muzzleOwn) {
      const effective=blank(), muzzleChoice=c.face==='muzzle'&&c.muzzleColor==='base'?MUZZLE_COLORS.cream:MUZZLE_COLORS[c.muzzleColor];
      for(let i=0;i<SIZE;i+=4)if(definition.muzzleOwn[i+3]&&data[i+3]&&!definition.outline?.[i+3]&&!featureMask[i+3]) {
        if(muzzleChoice==='base'&&coat) {
          const shade=Math.max(.42,Math.min(1.16,neutral[i]/168));
          for(let k=0;k<3;k++)data[i+k]=Math.min(255,Math.round(coat[k]*shade));
        } else if(Array.isArray(muzzleChoice)) {
          const shade=Math.max(.45,Math.min(1.10,neutral[i]/185));
          for(let k=0;k<3;k++)data[i+k]=Math.min(255,Math.round(muzzleChoice[k]*shade));
        }
        effective.set([255,255,255,255],i);
      }
      effectiveMasks.muzzle=effective;
    }
    for(const [key,slot] of [['frontLeft','front_left'],['frontRight','front_right'],['rearLeft','rear_left'],['rearRight',a.paws.rear_right?'rear_right':'hind_visible']]) {
      if(a.paws[slot]) paint(key,a.paws[slot][c[key]],c[key+'Color'],i=>!featureMask[i+3]&&!tail.own[i+3]&&!(standardPoseBibIsBodyMaterial&&bibOwnership[i+3]));
    }
    paint('tail',tail.masks[c.tailmark],c.tailColor,i=>!universalTail||!!universalTail[i+3]);
    return {width:WIDTH,height:HEIGHT,data,config:c,pose,groundAnchor:[...(definition?.groundAnchor??[37,90])],effectiveMasks,foreheadRoots:forehead?.roots??[]};
  };
  Object.defineProperties(renderCat,{
    registerPoses:{value:registerPoseDefinitions},
    registerPoseTemplates:{value:entries=>{
      const additions={};
      for(const entry of entries||[]){
        const definition=entry?.manifest,template=entry?.template;
        if(!definition||!template||!['standing','crouching','lying'].includes(definition.pose))throw new RangeError('Unsupported pose template kind');
        const key=definition.body?definition.pose+':'+String(definition.body).toLowerCase():definition.pose;
        additions[key]=definition.body
          ?createBodyPose(rendererBank,template,definition.pose,definition.body)
          :definition.pose==='standing'?createStandingPose(rendererBank,template):createRestingPose(rendererBank,template,definition.pose);
      }
      return registerPoseDefinitions(additions);
    }},
    hasPoseDefinition:{value:name=>Boolean(poseAssets[String(name||'')])},
    hasPose:{value:(pose,body='standard')=>pose==='sitting'||Boolean(poseAssets[pose+':'+String(body).toLowerCase()]??poseAssets[pose])}
  });
  return renderCat;
}

/** Map existing marking pixels through a pose's inverse part coordinates.
 * UV R/G hold source logical x/y; alpha identifies the target fillable region. */
function remapCatMask(source, uv) {
  if(source.length!==SIZE||uv.length!==SIZE) throw new TypeError('Invalid mapping buffer');
  const mapped=blank();
  for(let i=0;i<SIZE;i+=4) if(uv[i+3]) {
    const x=uv[i],y=uv[i+1];
    if(x>=WIDTH||y>=HEIGHT) throw new RangeError('UV outside logical canvas');
    if(source[(y*WIDTH+x)*4+3]) mapped.set([255,255,255,255],i);
  }
  return mapped;
}

/** This template adds geometry + part maps, not a new copy of each design. */
function createStandingPose(bank, template) {
  const source=bank.assets.Standard;
  const torso=template.torsoMasks
    ? Object.fromEntries(OPTIONS.torso.map(p=>{
        const id=canonical('torso',p),mask=p==='none'?blank():template.torsoMasks[p];
        if(!mask)throw new Error(`Missing fixed torso marking: ${p}`);
        return [id,mask];
      }))
    : Object.fromEntries(OPTIONS.torso.map(p=>{const id=canonical('torso',p);return[id,remapCatMask(source.torso[id],template.torsoUV)];}));
  const paws=template.pawMasks
    ? {front_left:template.pawMasks.front_left,front_right:template.pawMasks.front_right,rear_left:template.pawMasks.back_left,rear_right:template.pawMasks.back_right}
    : {front_left:{},front_right:{},hind_visible:{}};
  if(!template.pawMasks) for(const p of OPTIONS.frontLeft) {
      paws.front_left[p]=remapCatMask(source.paws.front_left[p],template.front_leftUV);
      paws.front_right[p]=remapCatMask(source.paws.front_right[p],template.front_rightUV);
      // Sitting's hind mask represents a folded paw only. The standing hind legs
      // use the shared full-leg sock vocabulary, while keeping the hind identity slot.
      const far=remapCatMask(source.paws.front_left[p],template.hind_farUV);
      const near=remapCatMask(source.paws.front_left[p],template.hind_nearUV);
      for(let i=0;i<SIZE;i+=4)if(near[i+3])far.set([255,255,255,255],i);
      paws.hind_visible[p]=far;
    }
  const masks=Object.fromEntries(OPTIONS.tailmark.map(p=>{
    const mask=blank();
    for(let i=0;i<SIZE;i+=4)if(template.tailCoordinates[i+3]) {
      const u=((template.tailCoordinates[i]<<8)|template.tailCoordinates[i+1])/65535;
      // Same authored standard-tail pattern ranges as the approved sitting set.
      const hit=p==='tip_short'?u>=.78:p==='tip_long'?u>=.61:p==='half_tail'?u>=.46:p==='broad_ring'?u>=.43&&u<=.67:p==='rings'?[.30,.56,.82].some(c=>Math.abs(u-c)<=.065):false;
      if(hit)mask.set([255,255,255,255],i);
    }
    return [p,mask];
  }));
  // Approved pose packages may provide the standard geometry as the same kind
  // of fixed component used by every other tail. Keep the existing standard
  // marking masks while taking geometry and ownership directly from that PNG.
  const templateTails={...(template.tails??{})};
  const fixedStandard=templateTails.standard;
  delete templateTails.standard;
  const standardTail=fixedStandard
    ? {...fixedStandard,masks:{...masks,...(fixedStandard.masks??{})}}
    : {base:template.base,own:template.tailOwn,masks};
  const fixedFaces=template.faceMasks
    ? Object.fromEntries(OPTIONS.ear.map(ear=>[ear,Object.fromEntries(Object.entries(template.faceMasks).map(([name,mask])=>[name,new Uint8ClampedArray(mask)]))]))
    : null;
  return {
    supports:{body:['standard'],tail:['standard',...Object.keys(templateTails)],bib:['none','bib']}, groundAnchor:[37,89],
    assets:{Standard:{clear:blank(),none:blank(),chassisByBib:template.chassisByBib,torso,paws,tails:{standard:standardTail,...templateTails}}},
    // Approved pose manifests provide complete fixed ear layers. Keep the
    // coordinate mapper only as a compatibility path for older pose packages.
    ...(template.ears?{ears:template.ears,earLookup:'fixed-pose-assets',earComposition:'fixed-overlay'}:{earLookup:'legacy-projection'}),
    ...(fixedFaces?{faces:fixedFaces}:{}),
    ...(template.foreheadTabbyByEarFit?{foreheadTabbyByEarFit:template.foreheadTabbyByEarFit,automaticForeheadTabby:true}:{})
  };
}

/** Resting templates add head/expression coordinates and protected paw pads. */
function createRestingPose(bank, template, pose) {
  if(!['crouching','lying'].includes(pose))throw new RangeError('Invalid resting pose');
  const definition=createStandingPose(bank,template);
  definition.groundAnchor=pose==='crouching'?[37,90]:[37,82];
  if(pose==='lying'){
    // Product-authoritative presentation alias: every saved identity body keeps
    // its own value while Lying deliberately uses the approved Standard chassis.
    definition.assetBodyAlias='standard';
    definition.supports={...definition.supports,body:[...OPTIONS.body]};
  }
  definition.features=template.features;
  definition.ears={};definition.faces={};
  const sourceFeatures=blank();
  for(const n of ['eyes','nose','mouth'])for(let i=0;i<SIZE;i+=4)if(bank.sem[n][i+3])sourceFeatures[i+3]=255;
  const warpRGBA=source=>{
    const out=blank();for(let i=0;i<SIZE;i+=4)if(template.headUV[i+3]){
      const j=(template.headUV[i+1]*WIDTH+template.headUV[i])*4;
      out.set(source.subarray(j,j+4),i);
    }return out;
  };
  const sourceEars=bank.legacyEars??bank.ears;
  for(const ear of OPTIONS.ear){
    const sourceEar=sourceEars[ear];
    if(template.ears?.[ear]) definition.ears[ear]=template.ears[ear];
    else {
      const replacement=blank();
      if(ear!=='standard')for(let i=0;i<SIZE;i+=4)if(template.headUV[i+3]&&template.headUV[i]>=15&&template.headUV[i]<=61&&template.headUV[i+1]<=26){
        // A tilted head's UV rectangle can cross the back. Existing body pixels
        // never belong to ear replacement, even when they lie in that rectangle.
        if(template.base[i+3]&&!template.headRegion[i+3])continue;
        replacement.set([255,255,255,255],i);
      }
      definition.ears[ear]={d:warpRGBA(sourceEar.d),mask:replacement,own:remapCatMask(sourceEar.own,template.headUV),inner:ear==='standard'?template.inner:remapCatMask(sourceEar.inner,template.headUV)};
    }
    definition.faces[ear]={};
    for(const face of OPTIONS.face){
      const faceId=canonical('face',face);
      const fixedFace=template.faceMasks?.[faceId];
      const fixedForehead=face==='forehead_m'?template.foreheadTabbyByEarFit?.[ear==='standard'?'standard':'other']:null;
      if(fixedFace||fixedForehead){
        definition.faces[ear][faceId]=new Uint8ClampedArray(fixedFace??fixedForehead);
        continue;
      }
      let canonicalMask=face==='forehead_m'?buildForeheadMask(sourceEar.d,sourceEar.own,sourceFeatures).mask:new Uint8ClampedArray(bank.faces[faceId]);
      // Feature holes belong to the old expression, not the marking design.
      const complete=new Uint8ClampedArray(canonicalMask);
      for(let i=0;i<SIZE;i+=4)if(sourceFeatures[i+3]){
        const x=i/4%WIDTH,y=Math.floor(i/4/WIDTH);let neighbors=0;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<WIDTH&&y+dy>=0&&y+dy<HEIGHT&&canonicalMask[((y+dy)*WIDTH+x+dx)*4+3])neighbors++;
        if(neighbors>=3)complete.set([255,255,255,255],i);
      }
      const mapped=remapCatMask(complete,template.headUV);
      for(let i=0;i<SIZE;i+=4)if(!template.headRegion[i+3])mapped.fill(0,i,i+4);
      definition.faces[ear][faceId]=mapped;
    }
  }
  if(template.foreheadTabbyByEarFit){
    definition.foreheadTabbyByEarFit=template.foreheadTabbyByEarFit;
    definition.automaticForeheadTabby=true;
  }
  return definition;
}

/** User-authored Standing/Crouching chassis reuse the fixed pose components.
 * Legacy reference-body templates remain disabled. */
function createBodyPose(bank,template,pose,body){
  const key=String(body).toLowerCase();
  if(['standing','crouching'].includes(pose)&&['chubby','fluffy','slim'].includes(key)&&template.chassisByBib?.none&&template.chassisByBib?.bib){
    const definition=pose==='standing'?createStandingPose(bank,template):createRestingPose(bank,template,pose);
    const assets=definition.assets.Standard;
    if(template.torsoMasksByBib) assets.torsoByBib=Object.fromEntries(['none','bib'].map(bib=>[bib,Object.fromEntries(OPTIONS.torso.map(trait=>[canonical('torso',trait),trait==='none'?blank():template.torsoMasksByBib[bib][trait]]))]));
    // Approved Slim tail placement is baked into its fixed pose PNGs.
    definition.assets={[canonical('body',key)]:definition.assets.Standard};
    definition.supports={...definition.supports,body:[key]};
    definition.bibIsBodyMaterial=true;
    return definition;
  }
  throw new RangeError('Special-body pose templates require the shared-head interface migration; legacy body-dependent face mapping is disabled.');
}

/**
 * Minimum component-contract proof: Slim crouching.
 * The supplied POC bank contains one shared head, one body module and three
 * pose-tail modules. Identity is deliberately limited to the normal renderer
 * configuration; this function has no identity-specific geometry branch.
 */
function createSlimCrouchingPose(bank,poc) {
  const required=['body','head','tails','ears'];
  for(const key of required) if(!poc[key]) throw new TypeError(`Slim crouching POC missing ${key}`);
  const torso=Object.fromEntries(OPTIONS.torso.map(name=>{const id=canonical('torso',name);return[id,remapCatMask(bank.assets.Slim.torso[id],poc.body.torsoUV)];}));
  const paws={front_left:{},front_right:{},hind_visible:{}};
  for(const name of OPTIONS.frontLeft) {
    paws.front_left[name]=remapCatMask(bank.assets.Slim.paws.front_left[name],poc.body.frontLeftUV);
    paws.front_right[name]=remapCatMask(bank.assets.Slim.paws.front_right[name],poc.body.frontRightUV);
    paws.hind_visible[name]=remapCatMask(bank.assets.Slim.paws.hind_visible[name],poc.body.hindUV);
  }
  // Reuse the existing crouching face mapping rules, but replace every body and
  // ear source with the POC's shared components afterwards.
  const mappingTemplate={
    base:poc.head.base, tailOwn:poc.tails.standard.own, tails:{}, torsoUV:poc.body.torsoUV,
    front_leftUV:poc.body.frontLeftUV, front_rightUV:poc.body.frontRightUV,
    hind_farUV:blank(), hind_nearUV:poc.body.hindUV, tailCoordinates:poc.tails.standard.coordinates,
    features:poc.head.features, inner:poc.head.inner, headUV:poc.head.uv, headRegion:poc.head.region
  };
  const mapped=createRestingPose(bank,mappingTemplate,'crouching');
  const ears=Object.fromEntries(OPTIONS.ear.map(name=>[name,{
    d:poc.ears[name].rgba, mask:poc.ears[name].own, own:poc.ears[name].own, inner:poc.ears[name].inner
  }]));
  return {
    supports:{body:['slim'],tail:['standard','thick','kinked'],bib:['bib']},
    groundAnchor:[37,90], features:poc.head.features, ears, faces:mapped.faces,
    componentLayers:{head:poc.head.base,earMask:'own'},
    assets:{Slim:{clear:blank(),none:blank(),body:poc.body.rgba,torso,paws,tails:poc.tails}}
  };
}

/**
 * Visual-first POC: one complete Slim crouching chassis and one Standard tail.
 * The head, neck, chest and body remain a single source image because their
 * approved pixel-art transition is more valuable than an artificial seam.
 */
function createSlimCrouchingChassisV2(bank,poc) {
  const noOp=blank();
  return {
    supports:{body:['slim'],tail:['standard'],ear:['standard'],bib:['none','bib']},groundAnchor:[37,90],
    features:poc.chassis.features,faces:{standard:poc.chassis.faceMasks},furOwnership:poc.chassis.furOwnership,muzzleOwn:poc.chassis.muzzleOwn,outline:poc.chassis.outline,
    ears:{standard:{d:noOp,mask:noOp,own:poc.chassis.earOwn,inner:poc.chassis.inner}},
    chassisLayers:{base:poc.chassis.base},
    assets:{Slim:{clear:blank(),none:blank(),bib:poc.chassis.bib,torso:poc.chassis.torsoMasks,paws:poc.chassis.paws,tails:{standard:poc.tails.standard}}}
  };
}

/** Loader adapter: decodePng(url) must return exact 112×104 RGBA bytes. */
async function loadCatAssets(manifest, baseUrl, decodePng) {
  if(manifest.version!==1 || manifest.canvas?.[0]!==WIDTH || manifest.canvas?.[1]!==HEIGHT) throw new Error('Unsupported cat asset manifest');
  async function load(node) {
    if(node.png) {
      const bytes=await decodePng(new URL(node.png,baseUrl));
      if(!ArrayBuffer.isView(bytes)||bytes.length!==SIZE) throw new Error(`Invalid asset dimensions: ${node.png}`);
      return bytes;
    }
    const entries=await Promise.all(Object.entries(node).map(async([k,v])=>[k,await load(v)]));
    return Object.fromEntries(entries);
  }
  return load(manifest.tree);
}

/** Browser adapter. No script inclusion or existing page behavior is changed. */
async function createBrowserCatRenderer(manifestUrl, {poseManifestUrls=[]}={}) {
  const url=new URL(manifestUrl,globalThis.location?.href);
  const response=await fetch(url);
  if(!response.ok) throw new Error(`Cat manifest HTTP ${response.status}`);
  const manifest=await response.json();
  const decode=async assetUrl=>{
    const response=await fetch(assetUrl);
    if(!response.ok) throw new Error(`Cat asset HTTP ${response.status}`);
    const bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
    try {
      if(bitmap.width!==WIDTH||bitmap.height!==HEIGHT) throw new Error('Invalid cat PNG size');
      const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.drawImage(bitmap,0,0);
      return context.getImageData(0,0,WIDTH,HEIGHT).data;
    } finally {bitmap.close();}
  };
  const bank=await loadCatAssets(manifest,new URL('.',url),decode), poses={};
  for(const poseUrl of poseManifestUrls) {
    const resolved=new URL(poseUrl,globalThis.location?.href);
    const response=await fetch(resolved);
    if(!response.ok)throw new Error(`Pose manifest HTTP ${response.status}`);
    const definition=await response.json();
    if(!['standing','crouching','lying'].includes(definition.pose))throw new RangeError('Unsupported pose template kind');
    const template=await loadCatAssets(definition,new URL('.',resolved),decode);
    if(definition.kind==='chassis-poc-v2') {
      if(definition.pose!=='crouching'||definition.body!=='Slim') throw new RangeError('Unsupported chassis POC');
      poses[definition.pose+':'+String(definition.body).toLowerCase()]=createSlimCrouchingChassisV2(bank,template);
    }
    else if(definition.kind==='component-poc') {
      if(definition.pose!=='crouching'||definition.body!=='Slim') throw new RangeError('Unsupported component POC');
      poses[definition.pose+':'+definition.body]=createSlimCrouchingPose(bank,template);
    }
    else if(definition.body)poses[definition.pose+':'+String(definition.body).toLowerCase()]=createBodyPose(bank,template,definition.pose,definition.body);
    else poses[definition.pose]=definition.pose==='standing'?createStandingPose(bank,template):createRestingPose(bank,template,definition.pose);
  }
  return createCatRenderer(bank,{poses});
}

async function decodeDataPng(url){const response=await fetch(url);if(!response.ok)throw new Error('Cat asset decode failed');const bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});try{if(bitmap.width!==WIDTH||bitmap.height!==HEIGHT)throw new Error('Invalid cat asset size');const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);return context.getImageData(0,0,WIDTH,HEIGHT).data;}finally{bitmap.close();}}
async function createFileRenderer(banks){if(!banks?.sitting?.manifest)throw new Error('Cat sitting runtime bank missing');const bank=await loadCatAssets(banks.sitting.manifest,global.location?.href||'file:///',decodeDataPng);return createCatRenderer(bank);}
async function registerFilePoseBank(renderer,packedBank){if(typeof renderer?.registerPoseTemplates!=='function'||!Array.isArray(packedBank))throw new Error('Cat pose runtime bank missing');const pending=packedBank.filter(packed=>{const definition=packed?.manifest,key=definition?.body?definition.pose+':'+String(definition.body).toLowerCase():definition?.pose;return definition&&key&&!renderer.hasPoseDefinition(key);});if(!pending.length)return[];const entries=await Promise.all(pending.map(async packed=>({manifest:packed.manifest,template:await loadCatAssets(packed.manifest,global.location?.href||'file:///',decodeDataPng)})));return renderer.registerPoseTemplates(entries);}
const Meeow=global.Meeow=global.Meeow||{};Meeow.catRuntimeCore=Object.freeze({createFileRenderer,registerFilePoseBank,sourceFingerprint:'a9f4db9d5790449bc364443e389197ed50942d48fdc4414796a8ef1e2da314fe'});
})(window);
