(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const library = Meeow.residentCopyLibrary;
    if (!library?.length) throw new Error('Resident copy library must load first.');
    const recent = new Map(), visible = new Map(), socialContent = new Map();
    const postureWords = Object.freeze({ standing: '站着', sitting: '坐着', crouching: '蹲着', lying: '躺着' });
    const families = new Set(['sleep','rest','sit-idle','observe','groom','roam','idle','social-observe','social-presence',
        'item-chase','item-bat','item-carry','item-cuddle','item-sniff','item-observe']);
    const signature = facts => JSON.stringify(facts);
    const hash = value => { let h=2166136261; for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0; };
    const boundedSet = (map,key,value) => { map.set(key,value);while(map.size>128)map.delete(map.keys().next().value);return value; };
    const voiceTags = axes => Object.entries(axes || {}).filter(([axis,value]) =>
        Object.hasOwn(Meeow.semantics?.PERSONALITY_AXIS_REGISTRY || {},axis) && Number.isInteger(value) && value>=-2 && value<=2 && value!==0)
        .map(([axis,value]) => `${axis}:${value>0?'positive':'negative'}`);
    const socialRelationship = (accepted, family) => {
        const link = accepted.relationship;
        if (!family.startsWith('social-') || !accepted.partnerId ||
            String(link?.partnerId) !== String(accepted.partnerId)) return null;
        const ranges = { familiarity: [0,5], warmth: [-5,5], trust: [-5,5], tension: [0,5] };
        if (!Object.entries(ranges).every(([axis,[min,max]]) => Number.isInteger(link[axis]) &&
            link[axis] >= min && link[axis] <= max)) return null;
        return Object.freeze(Object.fromEntries(['partnerId',...Object.keys(ranges)].map(key =>
            [key,key === 'partnerId' ? String(link[key]) : link[key]])));
    };
    const deriveContext = (fact, accepted = {}) => {
        const tags=voiceTags(fact.axes), social=Boolean(accepted.partnerId && accepted.partnerName), item=accepted.item || null;
        let family=accepted.activity || 'idle';
        if(item?.eventId && item.name && families.has('item-'+item.interaction)) family='item-'+item.interaction;
        else if(social) family=family==='observe'?'social-observe':'social-presence';
        if(!families.has(family)) family='idle';
        const posture=accepted.posture || fact.posture;
        const activityPoses={sleep:['lying'],rest:['lying','crouching'],roam:['standing'],
            'sit-idle':['sitting'],groom:['sitting','crouching','lying'],observe:['standing','sitting','crouching']};
        if(activityPoses[family] && !activityPoses[family].includes(posture)) family='idle';
        return Object.freeze({id:String(fact.id),name:String(fact.name || ''),form:fact.form,posture:accepted.posture || fact.posture,
            room:accepted.room || fact.room || '',hall:fact.hall || '',mapPoint:fact.mapPoint || '',isOut:Boolean(fact.isOut),
            curatorAnchor:fact.curatorAnchor || '',axes:fact.axes || null,tags:Object.freeze(tags),family,
            episodeId:String(accepted.episodeId || fact.episodeId || ''),authority:String(fact.authority || ''),
            furniture:Boolean(accepted.furniture),social,partnerId:social?String(accepted.partnerId):'',partner:social?String(accepted.partnerName):'',
            item:item?.eventId?String(item.name || ''):'',itemId:item?.eventId?String(item.eventId):'',
            relationship:socialRelationship(accepted,family)});
    };
    const compatible = (entry,context) => entry.family===context.family &&
        entry.requires.every(tag=>context.tags.includes(tag)) && (!entry.room || entry.room===context.room) &&
        (!entry.form || entry.form===context.form) && (!entry.social || context.social) &&
        (!entry.solitary || !context.social) && (!entry.furniture || context.furniture) &&
        (!entry.relationship || context.family.startsWith('social-') && context.social &&
            context.relationship?.partnerId === context.partnerId &&
            Object.entries(entry.relationship).every(([axis,[min,max]]) =>
                context.relationship[axis] >= min && context.relationship[axis] <= max)) &&
        (!entry.status.includes('{item}') || Boolean(context.item && context.itemId)) &&
        (!entry.status.includes('{partner}') || Boolean(context.social && context.partnerId)) &&
        (!entry.innerThought.includes('{item}') || Boolean(context.item && context.itemId)) &&
        (!entry.innerThought.includes('{partner}') || Boolean(context.social && context.partnerId));
    const pools = new Map();
    library.forEach(entry=>{if(!pools.has(entry.family))pools.set(entry.family,[]);pools.get(entry.family).push(entry);});
    const candidateWeights = context => {
        let candidates=(pools.get(context.family)||[]).filter(entry=>compatible(entry,context));
        if(!candidates.length) candidates=pools.get('idle').filter(entry=>compatible(entry,{...context,family:'idle'}));
        return Object.freeze(candidates.map(entry => {
            const traits = Object.entries(entry.affinity || {}).map(([axis,coefficient]) => {
                const value = context.axes?.[axis];
                return Object.freeze({axis,coefficient,value:Number.isInteger(value) && value>=-2 && value<=2 ? value : 0});
            });
            const magnitude = traits.reduce((sum,trait)=>sum+Math.abs(trait.coefficient),0);
            const score = magnitude ? traits.reduce((sum,trait)=>sum+trait.coefficient*trait.value/2,0)/magnitude : 0;
            const baseWeight = 1+entry.requires.length*4+Number(Boolean(entry.room))*2+Number(Boolean(entry.furniture))*2;
            const affinityWeight = 1+0.5*Math.max(-1,Math.min(1,score));
            return Object.freeze({id:entry.id,requires:entry.requires,room:entry.room || '',furniture:Boolean(entry.furniture),
                relationship:entry.relationship || null,relationshipInput:entry.relationship ? context.relationship : null,
                traits:Object.freeze(traits),baseWeight,affinityWeight,weight:baseWeight*affinityWeight});
        }));
    };
    let selections=0;
    const selectPair = context => {
        if(!context.episodeId || !postureWords[context.posture]) return null;
        const candidates=candidateWeights(context);
        const key=context.id+'|'+context.family, previous=recent.get(key)||[];
        const fresh=candidates.filter(entry=>!previous.includes(entry.id));
        const available=fresh.length?fresh:candidates;
        let draw=hash(context.id+'|'+context.episodeId+'|'+context.family)/4294967296 * available.reduce((sum,entry)=>sum+entry.weight,0);
        const selected=available.find(entry=>(draw-=entry.weight)<0) || available.at(-1);
        const entry=selected && library.find(entry=>entry.id===selected.id);
        if(!entry)return null;
        const fill=text=>text.replaceAll('{item}',context.item).replaceAll('{partner}',context.partner);
        boundedSet(recent,key,[...previous,entry.id].slice(-2));selections++;
        return Object.freeze({id:entry.id,status:fill(entry.status),innerThought:fill(entry.innerThought),selection:selected});
    };
    // Content cache never grants episode ownership. Every read still requires
    // the caller's current accepted context; view suspension can reuse a pair.
    const episodePair = context => {
        // Relationship changes cannot rewrite an already selected social episode.
        const key='pair:'+signature({...context,authority:'',relationship:null});
        if(socialContent.has(key))return socialContent.get(key);
        const pair=selectPair(context);
        return pair ? boundedSet(socialContent,key,pair) : null;
    };
    const project = context => {
        const key=signature(context), prior=visible.get(context.id);
        if(prior?.signature===key)return prior.pair;
        const pair=episodePair(context);
        if(!pair){visible.delete(context.id);return null;}
        boundedSet(visible,context.id,{signature:key,pair});return pair;
    };
    const readPair = context => visible.get(context.id)?.signature===signature(context)?visible.get(context.id).pair:null;
    const clear = id => {if(id==null){visible.clear();recent.clear();socialContent.clear();}else visible.delete(String(id));};
    const factFor = (cat, posture, form, category = 'calm') => ({id:String(cat.id),name:String(cat.name || ''),posture,form,
        room:cat.mapRoom || '',hall:cat.hallId || '',mapPoint:cat.mapPoint || cat.mapSpot || '',isOut:Boolean(cat.isOut),category,
        authority:String(cat.lastStatusUpdateTime || ''),axes:Meeow.personalityRuntime?.getResidentRuntimePersonality?.(cat.id)?.axes || null,
        ...(cat.curatorRoomPresence?.anchor?{curatorAnchor:cat.curatorRoomPresence.anchor}:{})});
    const createEnvelope = async ({facts,episode,pairIds=[]}) => {
        if(!episode || !Array.isArray(facts) || facts.some(row=>!postureWords[row.posture]))throw new Error('local-copy-authority-missing');
        const key=signature(facts);
        if(episode.localContent?.signature===key)return episode.localContent.envelope;
        const contexts=facts.map(row=>deriveContext(row,{...row.accepted,
            episodeId:row.accepted?.episodeId || episode.requestToken || episode.episodeId || key,
            ...(pairIds.includes(row.id)?{activity:'observe',partnerId:pairIds.find(id=>id!==row.id),
                partnerName:facts.find(other=>other.id===pairIds.find(id=>id!==row.id))?.name || '同伴'}:{})}));
        const pairs=contexts.map(episodePair), lines=Object.fromEntries(facts.map((row,i)=>[row.id,pairs[i].status]));
        const updates=facts.map((row,i)=>({id:row.id,status:`正在${postureWords[row.posture]}。${pairs[i].status}`,
            posture:row.posture,innerVoice:pairs[i].innerThought,formDecision:row.form,isOut:row.isOut,mapRoom:row.room,
            mapPoint:row.mapPoint,mapSpot:row.mapPoint,...(row.curatorAnchor?{curatorRoomAnchor:row.curatorAnchor}:{})}));
        updates.forEach((update,i)=>{if(facts[i].curatorAnchor){delete update.mapPoint;delete update.mapSpot;delete update.mapRoom;}});
        const scene=pairIds.length===2?{participantIds:[...pairIds],participantForms:Object.fromEntries(facts.filter(row=>pairIds.includes(row.id)).map(row=>[row.id,row.form])),
            content:'两位居民留在当前房间，共同观察着眼前的环境。',reactions:pairIds.map(id=>({id,content:lines[id]})),relationshipDeltas:[]}:null;
        const envelope={updates,scene,awayPlans:[],routineCopy:lines,contexts,pairs};
        episode.localContent={signature:key,envelope};return envelope;
    };
    const createSocialEnvelope = async ({episodeId,type,fact,bidType='',objectName='',physical=false}) => {
        if(!episodeId || !postureWords[fact?.posture])throw new Error('local-copy-authority-missing');
        const key=signature({episodeId,type,fact,bidType,objectName,physical});if(socialContent.has(key))return socialContent.get(key);
        const pair=episodePair(deriveContext(fact,{episodeId}));let envelope;
        if(type==='progression')envelope={decision:'stay',content:pair.status,status:`正在${postureWords[fact.posture]}。${pair.status}`,posture:fact.posture};
        else if(type==='attention') {
            if(bidType==='offer'&&!objectName)throw new Error('local-copy-object-missing');
            envelope={content:bidType==='offer'?`留意着身边的${objectName}。`:physical?'它走近馆长，安静地停在身边。':pair.status,
                ...(physical?{entryStatus:`正在馆长身边${postureWords[fact.posture]}。`,entryPosture:fact.posture}:{})};
        } else throw new Error('local-copy-episode-type-invalid');
        return boundedSet(socialContent,key,JSON.stringify(envelope));
    };
    const publish = (facts,envelope) => (envelope.contexts || []).forEach((context,i)=>boundedSet(visible,context.id,
        {signature:signature(context),pair:envelope.pairs[i]}));
    Meeow.residentCopy=Object.freeze({factFor,deriveContext,voiceTags,compatible,candidateWeights,selectPair,project,readPair,clear,signature,
        createEnvelope,createSocialEnvelope,publish,read:fact=>readPair(deriveContext(fact))?.status || '',pools:library,
        statusFor:fact=>postureWords[fact.posture]?`正在${postureWords[fact.posture]}。`: '',
        diagnostics:()=>({selections,visible:visible.size,recent:recent.size,entries:library.length})});
}(window));
