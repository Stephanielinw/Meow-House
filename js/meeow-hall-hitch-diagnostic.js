// TEMP HALL HITCH DIAGNOSTIC — remove after the real-session movement repair.
(function (global) {
    const LIMIT = 2048, MAX_MOVERS = 64, MAX_EVENTS = 128;
    const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) ? {x:p.x, y:p.y} : null;
    const create = ({now = () => performance.now(), requestFrame = fn => requestAnimationFrame(fn),
        cancelFrame = id => cancelAnimationFrame(id), onState = () => {}, observe = true} = {}) => {
        const ring = new Array(LIMIT), movers = new Map(), segments = new Map(), controllers = new WeakMap();
        let head = 0, count = 0, truncated = false, serial = 0, context = null, phase = 'idle', disposed = false;
        let raf = null, observer = null, longTaskObservable = false, lastFrame = null, trigger = null, stopAt = null, artifact = null;
        let events = [], counters = {}, preFeet = new Map(), firstAfter = new Map();
        const restores = [];
        const recording = () => Boolean(context && (phase === 'waiting' || phase === 'capturing'));
        const state = value => { phase = value; onState(value); };
        const rows = () => Array.from({length:count}, (_, n) => ring[(head+n)%LIMIT]);
        const event = value => { events.push(value); if(events.length > MAX_EVENTS) {events.shift();truncated=true;} };
        const trim = cutoff => { while(count && ring[head].timestamp < cutoff) { ring[head] = null; head=(head+1)%LIMIT; count--; } };
        const push = value => {
            if(count === LIMIT) { head=(head+1)%LIMIT; count--; truncated=true; }
            ring[(head+count)%LIMIT]=value; count++;
        };
        const bump = (kind, duration = 0) => {
            if(!recording()) return;
            const c = counters[kind] ||= {count:0,totalMs:0,maxMs:0};
            c.count++; c.totalMs+=duration; c.maxMs=Math.max(c.maxMs,duration);
        };
        const measure = (kind, fn) => {
            if(!recording()) return fn();
            const start=now();
            try { return fn(); } finally {
                const duration=now()-start; bump(kind,duration);
                if(duration >= 30) event({kind,start,duration});
            }
        };
        const disconnect = () => {
            if(raf !== null) cancelFrame(raf); raf=null;
            observer?.disconnect(); observer=null;
        };
        const freeze = (reason = 'complete') => {
            if(phase !== 'capturing') return;
            disconnect();
            artifact = {schema:'TEMP_HALL_HITCH_V1',triggerSource:trigger.source,
                triggerTimestamp:trigger.timestamp,hitchStart:trigger.hitchStart,hitchDurationMs:trigger.duration,
                severity:trigger.duration === null ? 'unknown' : trigger.duration > 500 ? '>500ms' : trigger.duration > 250 ? '>250ms' : '>120ms',
                room:trigger.room,roomGeneration:trigger.generation,activeMoverCount:trigger.activeMoverCount,
                window:{beforeMs:5000,afterMs:2000,completion:reason,truncated},
                trace:rows(),events:events.filter(e => e.start >= (count ? ring[head].timestamp : trigger.timestamp)-1),
                counterScope:'Cumulative since this room was armed; each trace frame contains a counter snapshot',summarizedCounters:Object.fromEntries(Object.entries(counters).map(([k,c])=>[k,{...c}])),
                catchUpJumps:[...firstAfter.values()],firstDivergentLayer:'undetermined',
                longTaskObservable,publicationMeaning:'Vue update completed; actual browser paint is not directly observed'};
            state('captured');
        };
        const triggerCapture = (source, timestamp, duration = null) => {
            if(phase !== 'waiting' || !context) return false;
            const start=lastFrame ?? timestamp;
            trim(start-5000);
            trigger={source,timestamp,hitchStart:source === 'auto' ? start : null,duration,
                room:context.room,generation:context.generation,activeMoverCount:movers.size};
            const previousFrame = count ? ring[(head+count-1)%LIMIT] : null;
            preFeet=new Map([...movers].map(([id,r])=>{
                const previous=previousFrame?.movingResidents.find(p=>p.residentId === id && p.episodeId === r.episode && p.generation === r.generation);
                return [id,{episode:r.episode,generation:r.generation,foot:point(source === 'auto' && r.lastMoveAt >= timestamp ? r.previousMoveFoot || previous?.committedFoot : r.committedFoot),steps:r.steps.slice()}];
            }));
            stopAt=timestamp+2000; state('capturing');
            // Other RAF callbacks may have committed this frame before the monitor ran.
            for(const [id,r] of movers) if(r.committedAt >= timestamp) rememberAfter(id,r,r.committedFoot,r.committedAt);
            return true;
        };
        const sample = timestamp => {
            raf=null;
            if(!recording()) return;
            const delta=lastFrame === null ? null : timestamp-lastFrame;
            if(phase === 'waiting' && delta > 120) triggerCapture('auto',timestamp,delta);
            if(phase === 'waiting') trim(timestamp-5000);
            push({timestamp,frameDelta:delta,room:context.room,roomGeneration:context.generation,
                activeMoverCount:movers.size,movingResidents:[...movers].map(([id,r])=>({residentId:id,
                    episodeId:r.episode,generation:r.generation,routeSegment:r.segment,
                    worldFoot:point(r.worldFoot),presentationFoot:point(r.presentationFoot),
                    committedFoot:point(r.committedFoot),worldAt:r.worldAt,presentationAt:r.presentationAt,committedAt:r.committedAt})),
                counters:Object.fromEntries(Object.entries(counters).map(([k,c])=>[k,{...c}]))});
            lastFrame=timestamp;
            if(phase === 'capturing' && timestamp >= stopAt) freeze();
            else raf=requestFrame(sample);
        };
        const startObserver = () => {
            if(!observe || !global.PerformanceObserver) return;
            try {
                observer=new global.PerformanceObserver(list=>{if(recording())for(const entry of list.getEntries())
                    event({kind:'longtask',start:entry.startTime,duration:entry.duration});});
                observer.observe({type:'longtask',buffered:false}); longTaskObservable=true;
            } catch (_) { observer?.disconnect(); observer=null; }
        };
        const setContext = next => {
            if(disposed || phase === 'captured') return;
            if(next?.room === context?.room && next?.generation === context?.generation) return;
            if(phase === 'capturing') { freeze('context-ended'); context=null; return; }
            disconnect(); context=next; lastFrame=null; movers.clear(); segments.clear();
            head=0; count=0; ring.fill(null); counters={}; events=[]; truncated=false;
            if(context) { state('waiting'); startObserver(); raf=requestFrame(sample); } else state('idle');
        };
        const controllerId = controller => {
            if(!controller || typeof controller !== 'object') return null;
            if(!controllers.has(controller)) controllers.set(controller,++serial);
            return controllers.get(controller);
        };
        const route = (id, episode, generation, segment) => {
            if(recording() && (segments.has(String(id)) || segments.size < MAX_MOVERS)) segments.set(String(id),{episode,generation,segment});
        };
        const snapshot = (snapshot, generation) => {
            if(!recording() || generation !== context.generation) return;
            bump('residentPublication'); const seen=new Set(), timestamp=now();
            for(const row of snapshot.residents) {
                if(row.state !== 'moving' && !['entering','exiting'].includes(row.furniture?.phase)) continue;
                if(seen.size >= MAX_MOVERS) {truncated=true;break;}
                const id=String(row.id), episode=row.behaviorInstanceId, token=row.transitionGeneration;
                seen.add(id); let r=movers.get(id);
                if(!r || r.episode !== episode || r.generation !== token) r={episode,generation:token,steps:[]};
                const segment=segments.get(id);
                Object.assign(r,{worldFoot:point(row.foot),worldAt:timestamp,
                    segment:segment?.episode === episode && segment.generation === token ? segment.segment : null});
                movers.set(id,r);
            }
            for(const id of movers.keys()) if(!seen.has(id)) { movers.delete(id); segments.delete(id); }
        };
        const presentation = (entities, generation) => {
            if(!recording() || generation !== context.generation) return;
            const timestamp=now(); bump('presentationPublication');
            // Only values already produced by scene reconciliation are observed.
            for(const r of movers.values()) { r.presentationFoot=null; r.presentationAt=null; }
            for(const e of entities) { const r=movers.get(String(e.id));
                if(e.kind === 'resident' && r) { r.presentationFoot=point({x:e.footX,y:e.depthY}); r.presentationAt=timestamp; }
            }
        };
        const rememberAfter = (id,r,foot,timestamp) => {
            if(phase !== 'capturing' || firstAfter.has(id) || r.presentationAt < trigger.timestamp) return;
            const prior=preFeet.get(id);
            if(!prior?.foot || prior.episode !== r.episode || prior.generation !== r.generation) return;
            const distance=Math.hypot(foot.x-prior.foot.x,foot.y-prior.foot.y);
            const baseline=prior.steps.slice().sort((a,b)=>a-b), median=baseline.length ? baseline[Math.floor(baseline.length/2)] : null;
            firstAfter.set(id,{residentId:id,episodeId:r.episode,generation:r.generation,
                preHitchFoot:prior.foot,worldFootAfterHitch:point(r.worldFoot),firstCommittedFoot:point(foot),
                committedAt:timestamp,distance,baselineSamples:baseline.length,medianStep:median,
                unusuallyLarge:baseline.length >= 5 ? distance > 4 && distance > 3*median : null});
        };
        const commit = () => {
            if(!recording()) return;
            bump('vueCommit'); const timestamp=now();
            for(const [id,r] of movers) {
                const foot=point(r.presentationFoot), before=point(r.committedFoot);
                // A diagnostic-label render is not a new resident publication.
                if(!foot || r.presentationAt === r.committedPresentationAt) continue;
                rememberAfter(id,r,foot,timestamp);
                const step=before ? Math.hypot(foot.x-before.x,foot.y-before.y) : 0;
                if(step > 0) { r.previousMoveFoot=before; r.lastMoveAt=timestamp; }
                if(before && phase === 'waiting') {
                    if(step > 0 && lastFrame !== null && timestamp-lastFrame <= 120) { r.steps.push(step); if(r.steps.length > 20) r.steps.shift(); }
                }
                r.committedFoot=foot; r.committedAt=timestamp; r.committedPresentationAt=r.presentationAt;
            }
        };
        // Wrappers preserve return values and exceptions; no geometry is added.
        const instrumentDomain = domain => {
            if(disposed || !domain || domain.__tempHitchInstrumented) return;
            Object.defineProperty(domain,'__tempHitchInstrumented',{value:true,configurable:true});
            restores.push(() => {delete domain.__tempHitchInstrumented;});
            for(const name of ['presentationFits','resolveFurniturePresentation','groundEntry']) {
                const original=domain[name]; if(typeof original !== 'function') continue;
                const wrapped=function(...args){
                    if(!recording()) return original.apply(this,args);
                    return measure(name,()=>original.apply(this,args));
                };
                domain[name]=wrapped;
                restores.push(() => {if(domain[name] === wrapped) domain[name]=original;});
            }
        };
        return {setContext,controllerId,route,snapshot,presentation,commit,measure,instrumentDomain,
            manual:()=>triggerCapture('manual',now()),getArtifact:()=>artifact,
            dispose:()=>{if(phase === 'capturing')freeze('teardown');disconnect();context=null;disposed=true;for(const restore of restores.splice(0).reverse())restore();},
            getState:()=>phase};
    };
    global.Meeow ||= {};
    global.Meeow.hallHitchDiagnostic=Object.freeze({create});
})(window);
