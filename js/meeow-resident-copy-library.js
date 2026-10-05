(function (global) {
    'use strict';
    const entries = [];
    // Original Meeow House copy: accepted event first, small reaction second.
    const add = (family, tag, text, context = {}) => text.trim().split('\n').forEach(line => {
        const [status, innerThought] = line.trim().split('|');
        if (!status || !innerThought) throw new Error('invalid-authored-copy-pair');
        const affinity = Object.freeze({...context.affinity});
        if (Object.keys(affinity).length > 3 || Object.entries(affinity).some(([axis,value]) =>
            !Object.hasOwn(global.Meeow.semantics.PERSONALITY_AXIS_REGISTRY,axis) ||
            !Number.isInteger(value) || !value || Math.abs(value)>2)) throw new Error('invalid-copy-affinity');
        const relationship = context.relationship && Object.freeze(Object.fromEntries(Object.entries(context.relationship)
            .map(([axis,range]) => [axis,Object.freeze([...range])])));
        entries.push(Object.freeze({id: `local-${entries.length+1}`, family,
            requires:Object.freeze(tag ? tag.split(',') : []), ...context, affinity,
            ...(relationship ? {relationship} : {}), status, innerThought}));
    });
    add("observe", "", `
看着眼前的环境。|再看一眼。
留意着附近的动静。|那边也看看。
正在观察眼前的环境。|这会儿看一看就够了。
观察着身边的细节。|眼睛还不想挪开。
看着眼前的环境。|先看着。
留意着附近的动静。|这一小片，够看一会儿了。
目光停在身边的细节上。|就看这一处。
观察着身边的细节。|嗯，接着看。`);
    add("observe", "inquiryDrive:positive", `
反复留意同一处细节，像是在比较前后的差别。|那里为什么和旁边不一样？
留意着附近的动静。|还差一点就看明白了。
把目光留在周围。|先盯住一个地方。
观察着身边的细节。|这两处，我想比一比。`, {"affinity":{"inquiryDrive":2}});
    add("observe", "inquiryDrive:negative", `
看着眼前的环境。|看得到就行。
留意着附近的动静。|不用每一处都盯着。
看着眼前的环境。|大致明白了，暂时足够。
观察着身边的细节。|最显眼的先看。`, {"affinity":{"inquiryDrive":-2}});
    add("observe", "socialEngagement:negative", `
看着眼前的环境。|不必凑得很近，我也看得见。
留意着附近的动静。|我自己看一会儿。
把目光留在周围。|这一处，我自己看看就好。
观察着身边的细节。|看着，不用搭话。`, {"solitary":true,"affinity":{"socialEngagement":-2}});
    add("observe", "socialEngagement:positive", `
看着眼前的环境。|若有人也注意到这个，应该挺有意思。
留意着附近的动静。|真想指给谁看。
把目光留在周围。|这一处可以拿来聊聊。
观察着身边的细节。|还想找谁一起看看。`, {"affinity":{"socialEngagement":2}});
    add("observe", "structurePreference:positive", `
看着眼前的环境。|先看这边，再看那边。
留意着附近的动静。|这一处还没看完。
把目光留在周围。|从左到右，挨着来。
观察着身边的细节。|别漏了边上。`, {"affinity":{"structurePreference":2}});
    add("observe", "emotionalExpression:positive", `
看着眼前的环境。|这一处还挺有意思。
看着眼前的环境。|嗯，这一处我喜欢。
把目光留在周围。|嗯，眼睛还想停一会儿。
观察着身边的细节。|越看越有意思了。`, {"affinity":{"emotionalExpression":2}});
    add("roam", "", `
正在房间里走动，步子保持着自己的节奏。|换个位置看看。
慢慢往前走。|这段路不用赶。
从原来的位置继续向前走。|走到那边再停一停。
正从原处往前走。|先往前走。
在房间里走动。|脚还想再迈一下。
迈着步子走动。|换块地方待待。
在房间里走动。|站到别处会怎样？
正从原处往前走。|慢慢过去。`);
    add("roam", "noveltySeeking:positive", `
在房间里走动。|换个角度，眼前也不一样。
在房间里走动。|过去看看，会有什么新细节？
在房间里走动。|那一头也想去看看。
正从原处往前走。|不想老看同一个方向。`, {"affinity":{"noveltySeeking":2}});
    add("roam", "noveltySeeking:negative", `
在房间里走动。|不急着换方向。
迈着步子走动。|就这么慢慢走。
在房间里走动。|走这边就好。
正从原处往前走。|没想找新地方。`, {"affinity":{"noveltySeeking":-2}});
    add("roam", "riskTolerance:negative", `
在房间里走动。|先把脚落稳。
迈着步子走动。|前面看清了再走。
在房间里走动。|一步就一步。
正从原处往前走。|不抢着冲过去。`, {"affinity":{"riskTolerance":-2}});
    add("roam", "initiative:positive", `
在房间里走动。|那边，先去看看。
迈着步子走动。|走，现在就走。
在房间里走动。|脚已经想过去了。
正从原处往前走。|不等了，我先挪个地方。`, {"affinity":{"initiative":2}});
    add("roam", "emotionalExpression:negative", `
在房间里走动。|走到那里就好。
迈着步子走动。|没什么要说的，走吧。
在房间里走动。|往前。
正从原处往前走。|不用边走边招呼。`, {"affinity":{"emotionalExpression":-2}});
    add("roam", "structurePreference:positive", `
在房间里走动。|这段走完再换方向。
迈着步子走动。|还是按顺序走。
在房间里走动。|脚下这几步，别乱。
正从原处往前走。|先到那一头。`, {"affinity":{"structurePreference":2}});
    add("rest", "", `
留在原处歇着。|先舒服地待一会儿。
停下活动，歇一会儿。|还不想起身。
歇着，没有起身。|歇着，爪子也松一松。
歇着，暂时没起身。|再歇一小会儿。
留在原处歇着。|身体想歇着。
停下活动，歇一会儿。|现在不挪了。
歇着，没有起身。|就这么歇着吧。
歇着，暂时没起身。|让爪子闲一会儿。`);
    add("rest", "socialEngagement:negative", `
留在原处歇着。|这会儿安静些就很好。
停下活动，歇一会儿。|不想被叫起来。
歇着，没有起身。|歇着，也不用找谁。
歇着，暂时没起身。|自己待着就行。`, {"solitary":true,"affinity":{"socialEngagement":-2}});
    add("rest", "initiative:positive", `
留在原处歇着。|好，我先歇了。
停下活动，歇一会儿。|想歇就歇。
歇着，没有起身。|先把爪子收回来。
歇着，暂时没起身。|这儿先待着，不挪。`, {"affinity":{"initiative":2}});
    add("rest", "emotionalExpression:positive", `
留在原处歇着。|这样待着也挺舒服。
停下活动，歇一会儿。|嗯，舒服。
歇着。|嗯，这一会儿确实需要休息。
歇着，暂时没起身。|还想再歇一点点。`, {"affinity":{"emotionalExpression":2}});
    add("rest", "ruleOrientation:positive", `
留在原处歇着。|先把这一小会儿歇够。
停下活动，歇一会儿。|在这里歇一会儿，别的等会儿想。
歇着，没有起身。|歇着的这会儿，就留给爪子。
歇着，暂时没起身。|歇好了再起身。`, {"affinity":{"ruleOrientation":2}});
    add("rest", "structurePreference:negative", `
留在原处歇着。|歇到想起来再起来。
停下活动，歇一会儿。|哪儿舒服就哪儿待着。
留在原处歇着。|现在舒服就好。
歇着，暂时没起身。|歇多久，先不数了。`, {"affinity":{"structurePreference":-2}});
    add("rest", "competitiveness:positive", `
留在原处歇着。|先歇，待会儿再比。
停下活动，歇一会儿。|爪子也不肯一直使劲。
歇着，没有起身。|不争这一下了。
歇着，暂时没起身。|这一会儿，我先不动。`, {"affinity":{"competitiveness":2}});
    add("sleep", "", `
正在睡觉，暂时没有参与周围的活动。|别的事情，醒来再想。
闭着眼睡着。|再睡一会儿。
留在原处睡觉。|眼睛不想睁。
睡着，没睁开眼。|醒来以后还有时间。
睡着了。|嗯……不起来。
闭着眼睡着。|还没想睁眼呢。
留在原处睡觉。|再闭着眼。
闭着眼睡着。|醒了再挪窝。`);
    add("sleep", "socialEngagement:negative", `
睡着了。|别叫我就行。
闭着眼睡着。|不用应声了。
留在原处睡觉。|这一觉想自己睡。
闭着眼睡着。|不用等谁，睡吧。`, {"solitary":true,"affinity":{"socialEngagement":-2}});
    add("sleep", "structurePreference:positive", `
睡着了。|爪子收好了，睡。
闭着眼睡着。|醒了再接着想。
留在原处睡觉。|这一觉先睡完。
闭着眼睡着。|不换地方了。`, {"affinity":{"structurePreference":2}});
    add("sleep", "structurePreference:negative", `
睡着了。|先睡吧，醒了再说。
闭着眼睡着。|困了就睡。
留在原处睡觉。|睁眼的事以后再说。
闭着眼睡着。|不管醒来是几点。`, {"affinity":{"structurePreference":-2}});
    add("sleep", "emotionalExpression:negative", `
睡着了。|睡了，别问了。
闭着眼睡着。|嗯，困。
留在原处睡觉。|不用替我说晚安。
闭着眼睡着。|闭上眼就好。`, {"affinity":{"emotionalExpression":-2}});
    add("sleep", "noveltySeeking:positive", `
睡着了。|醒了再找别的看看。
闭着眼睡着。|好奇也先闭上眼。
睡着了。|不知道醒来时会有什么变化。
闭着眼睡着。|新地方，醒了再想。`, {"affinity":{"noveltySeeking":2}});
    add("sleep", "ruleOrientation:positive", `
睡着了。|先睡这一觉。
闭着眼睡着。|醒来再顾别的。
留在原处睡觉。|闭着眼，睡到想醒。
闭着眼睡着。|这一觉，还想接着睡。`, {"affinity":{"ruleOrientation":2}});
    add("sit-idle", "", `
坐在原处。|先坐着。
保持坐姿，没有起身。|还不想起来。
坐着发呆。|爪子放在这儿就行。
坐着，暂时没有别的动作。|发会儿呆。
坐在原处。|先留一点空白。
留在原处坐着，没有马上起身。|之后做什么，稍后再说。
坐着发呆。|坐着也行。
坐着，暂时没有别的动作。|没想好，就不挪。`);
    add("sit-idle", "inquiryDrive:positive", `
坐在原处。|坐着想一想，那个细节还没明白。
保持坐姿，没有起身。|不挪窝，也能接着想。
坐着发呆。|几个念头还挤在一起。
坐着，暂时没有别的动作。|坐住了再想想。`, {"affinity":{"inquiryDrive":2}});
    add("sit-idle", "socialEngagement:negative", `
坐在原处。|坐这儿，不用凑过去。
安静坐在原处，没有主动搭话。|有一点自己的空间就够了。
坐着发呆。|自己坐着也没少什么。
坐着，暂时没有别的动作。|先不找谁了。`, {"solitary":true,"affinity":{"socialEngagement":-2}});
    add("sit-idle", "emotionalExpression:positive", `
坐在原处。|嗯，这样也挺好。
正坐着待着，轻松的感觉很明显。|嗯，这样也挺好。
坐着发呆。|这个呆发得不错。
坐着，暂时没有别的动作。|还想多坐一会儿呢。`, {"affinity":{"emotionalExpression":2}});
    add("sit-idle", "initiative:negative", `
坐在原处。|等会儿再说。
保持坐姿，没有起身。|没谁催我起来。
坐着发呆。|先坐着看看。
坐着，暂时没有别的动作。|不由我先动也行。`, {"affinity":{"initiative":-2}});
    add("sit-idle", "assertiveness:positive", `
坐在原处。|我就坐这儿。
保持坐姿，没有起身。|还没打算起身。
坐着发呆。|这会儿不让位给别的念头。
坐着，暂时没有别的动作。|想坐多久就坐多久。`, {"affinity":{"assertiveness":2}});
    add("sit-idle", "assertiveness:negative", `
坐在原处。|坐着就不占谁的注意了。
保持坐姿，没有起身。|待在这儿就好。
坐着发呆。|不急着让谁听我说。
坐着，暂时没有别的动作。|这一会儿简单些。`, {"affinity":{"assertiveness":-2}});
    add("groom", "", `
舔理着自己的毛。|这一处也照顾到。
专心舔理毛发，没有做别的事。|这一处也照顾到。
正把毛发一点点理顺。|慢慢整理，不必着急。
专心打理毛发。|整齐一点，感觉也清爽一点。
舔理着自己的毛。|先舔这里。
整理着毛发。|这撮毛也要理。
正在理顺自己的毛。|这一会儿就专心做这件事。
舔理着自己的毛。|这边还想舔一舔。`, {"form":"CAT"});
    add("groom", "structurePreference:positive", `
按自己的顺序整理毛发。|从这一处开始，整理完再换下一处。
整理着毛发。|边上那撮也别漏。
一点点理顺自己的毛，节奏稳定。|整齐些，看着也舒服。
专心打理毛发。|一撮一撮来。`, {"form":"CAT","affinity":{"structurePreference":2}});
    add("groom", "structurePreference:negative", `
顺着当下的感觉整理着毛。|哪儿不舒服，就先理哪儿。
整理着毛发。|先舔碰得到的地方。
放松地打理自己。|慢慢来，舒服最要紧。
专心打理毛发。|不想给毛排队。`, {"form":"CAT","affinity":{"structurePreference":-2}});
    add("groom", "emotionalExpression:positive", `
舔理着自己的毛。|弄顺了，真舒服。
整理着毛发。|舔着舔着还挺开心。
正在理顺自己的毛。|再理一点，就好啦。
专心打理毛发。|喜欢毛顺顺的感觉。`, {"form":"CAT","affinity":{"emotionalExpression":2}});
    add("groom", "emotionalExpression:negative", `
舔理着自己的毛。|整理完就好，不必多说。
整理着毛发。|自己理，自己知道。
把毛慢慢理顺，神情仍很平稳。|整理完就好，不必多说。
专心打理毛发。|不用谁夸我。`, {"form":"CAT","affinity":{"emotionalExpression":-2}});
    add("groom", "competitiveness:positive", `
舔理着自己的毛。|不想留一撮乱毛。
打理毛发时显得很专注。|自己满意了，才算做好。
正在理顺自己的毛。|要理得像样一点。
专心打理毛发。|再整齐一点点。`, {"form":"CAT","affinity":{"competitiveness":2}});
    add("groom", "ruleOrientation:positive", `
舔理着自己的毛。|这一撮，也轮到了。
整理着毛发。|这边舔一舔，再顾那边。
正在理顺自己的毛。|挨着舔过去。
专心打理毛发。|这一处先理好。`, {"form":"CAT","affinity":{"ruleOrientation":2}});
    add("idle", "", `
留在原处。|先待一会儿。
暂时没有新的动作。|这样也可以。
还待在这里。|没想去哪儿。
没有起身离开。|待着看看。
留在原处。|还没想动。
暂时没有新的动作。|不挪也行。
还待在这里。|先别忙着叫我。
没有起身离开。|在这儿就好。
留在原处。|下一步还没想好。
暂时没有新的动作。|嗯，就待着。
还待在这里。|再待一小下。
没有起身离开。|不用催。`);
    add("item-bat", "", `
伸爪拨弄着{item}。|这一拨，还想仔细试试。
伸爪拨弄着{item}。|爪子还想碰一下。
玩着{item}。|爪子再碰一下就好。
留意着正在拨弄的{item}。|玩这个就行。
拨弄着{item}。|换一点力道，感觉会不会不同？
伸爪拨弄着{item}。|再来一下。`);
    add("item-bat", "noveltySeeking:positive", `
拨弄着{item}。|再拨一下，看看有没有不一样。
伸爪拨弄着{item}。|换只爪子试试？`, {"affinity":{"noveltySeeking":2}});
    add("item-chase", "", `
正在追着{item}玩。|注意力跟着它走。
继续追逐{item}。|别跑远了，我还想追。
注意力跟着{item}，追着它玩。|追到它再停。
参与着追逐{item}的游戏。|这会儿只盯着它。
追着{item}。|再跟一小段。
追着{item}玩，兴致还没有散。|再跟一小段。`);
    add("item-chase", "competitiveness:positive", `
追着{item}。|这回要跟紧。
继续追逐{item}。|不想差那一点点。`, {"affinity":{"competitiveness":2}});
    add("item-carry", "", `
正带着{item}，没有把它放下。|把这件东西带在身边。
带着{item}。|先拿稳它。
把{item}留在身边。|还没想放下。
继续带着{item}。|带着它也行。
带着{item}。|暂时不丢开。
没有放下带着的{item}。|跟我待着吧。`);
    add("item-carry", "structurePreference:positive", `
带着{item}。|拿好了，就别乱放。
没有放下带着的{item}。|先带稳，再挪。`, {"affinity":{"structurePreference":2}});
    add("item-cuddle", "", `
正抱着{item}，动作很柔和。|这样待着很舒服。
把{item}留在怀里，没有急着放开。|这一会儿想好好抱着它。
依偎着{item}。|还不放开。
没有松开抱着的{item}。|抱着就不想忙别的。
抱着{item}。|再抱一小会儿。
把{item}留在怀里。|就抱在这儿。`);
    add("item-cuddle", "emotionalExpression:negative", `
抱着{item}。|不用说出来，它在这里就够了。
仍抱着{item}，动作收得很轻。|不用说出来，它在这里就够了。`, {"affinity":{"emotionalExpression":-2}});
    add("item-sniff", "", `
正在仔细闻{item}。|先分辨一下它的气味。
留意着{item}的气味。|鼻子还想凑近一点。
把鼻子凑向{item}嗅闻。|先闻，不忙着碰。
仔细嗅闻{item}。|闻清楚再说。
闻着{item}。|这味道得再闻一下。
留意着{item}的气味。|先让我闻闻。`);
    add("item-sniff", "inquiryDrive:positive", `
反复闻着{item}，像是在辨认细微差别。|这里面是不是还有另一种味道？
留意着{item}的气味。|再闻一处，比比看。`, {"affinity":{"inquiryDrive":2}});
    add("item-observe", "", `
正观察着{item}，没有急着碰它。|先看看它的样子。
目光停在{item}上。|不碰，也想多看一眼。
观察着{item}。|边上也看看。
仔细看着{item}，暂时没有别的动作。|先记住它的样子。
正把注意力放在{item}上。|不一定非要动手才有意思。
目光停在{item}上。|还没想碰你呢。`);
    add("item-observe", "riskTolerance:negative", `
谨慎观察着{item}，没有贸然碰它。|先看明白，会更安心。
目光停在{item}上。|还没打算碰它。`, {"affinity":{"riskTolerance":-2}});
    add("social-observe", "", `
和{partner}一起观察周围。|这一处，不知道同伴怎么看。`, {"social":true});
    add("social-observe", "initiative:positive", `
与{partner}看着同一个方向。|想先告诉{partner}我留意的是哪儿。`, {"social":true,"affinity":{"initiative":2,"emotionalExpression":1}});
    add("social-observe", "emotionalExpression:negative", `
和{partner}一起留意眼前的环境。|看着就行，有话也先不说。`, {"social":true,"affinity":{"emotionalExpression":-2,"socialEngagement":1}});
    add("social-observe", "", `
共同观察着周围，{partner}在身边。|不用开口，也看得到。
和{partner}一起观察周围。|和{partner}看的是同一边。
与{partner}看着同一个方向。|还想和它再看一会儿。
和{partner}一起留意眼前的环境。|看完这边，再看看别处。
共同观察着周围，{partner}在身边。|这回不是自己看了。`, {"social":true});
    add("social-observe", "socialEngagement:negative", `
和{partner}一起观察周围。|一起待着，不一定要不停找话。
与{partner}看着同一个方向。|不用硬找一句话。
正和{partner}安静观察。|这种不用勉强说话的相处挺好。
共同观察着周围，{partner}在身边。|先看着，别催我聊。`, {"social":true,"affinity":{"socialEngagement":-2}});
    add("social-observe", "socialEngagement:positive", `
和{partner}一起观察周围。|真想问问{partner}看见了什么。
与{partner}看着同一个方向。|一起看，就想多说两句。
和{partner}一起留意眼前的环境。|这一处想指给它看。
和{partner}一起观察周围。|能一起待着，就值得高兴。`, {"social":true,"affinity":{"socialEngagement":2}});
    add("social-presence", "", `
和{partner}一起待着。|这一会儿有同伴在身边。
仍和{partner}一起待着。|不必每一刻都说出什么。
继续和{partner}待在一起。|先和它一起待着。`, {"social":true});
    add("social-presence", "initiative:positive", `
和{partner}共享着这段活动时间。|这一会儿，我想先开个头。`, {"social":true,"affinity":{"initiative":2,"emotionalExpression":1}});
    add("social-presence", "", `
和{partner}一起待着。|这会儿不想先离开。`, {"social":true});
    add("social-presence", "emotionalExpression:negative", `
与{partner}参与共同活动。|还在一起呢，别非要找话说。`, {"social":true,"affinity":{"emotionalExpression":-2,"socialEngagement":1}});
    add("social-presence", "", `
继续和{partner}待在一起。|再陪一会儿。
和{partner}共享着这段活动时间。|一起待着也算一件事。`, {"social":true});
    add("social-presence", "socialEngagement:negative", `
与{partner}共同活动，没有刻意表现得热闹。|参与到这里，就已经够了。
与{partner}参与共同活动。|不用急着找话。
正与{partner}共同待着，反应较为克制。|舒服的距离，比很多话更重要。
参与着与{partner}的共同活动。|慢慢熟悉，不用急。`, {"social":true,"affinity":{"socialEngagement":-2}});
    add("social-presence", "socialEngagement:positive", `
与{partner}共同活动，兴致显得很足。|能一起做点事情，真不错。
与{partner}参与共同活动。|还有一会儿想和它一起过。
继续和{partner}待在一起。|有同伴，注意力也往它那儿去了。
和{partner}共享着这段活动时间。|不想这么快各忙各的。`, {"social":true,"affinity":{"socialEngagement":2}});
    add("observe", "", `
在馆长室观察周围。|这间屋子，还有哪处没看过？`, {"room":"curator"});
    add("observe", "inquiryDrive:positive", `
在馆长室观察周围。|馆长室这一处，还想看得再仔细些。`, {"room":"curator","affinity":{"inquiryDrive":2,"structurePreference":1}});
    add("rest", "", `
留在馆长室歇着。|在这间屋子再歇一会儿。
留在馆长室歇着。|先不离开馆长室。`, {"room":"curator","retired":true});
    add("roam", "", `
正在馆长室里走动。|换个角度看看这间屋子。
在馆长室走动。|走到馆长室另一头再看看。`, {"room":"curator"});
    add("observe", "noveltySeeking:positive", `
在客厅观察周围。|客厅里，还有哪处没看过？`, {"room":"living","affinity":{"noveltySeeking":2}});
    add("observe", "inquiryDrive:positive", `
在客厅观察周围。|客厅这一片，想找出没看清的地方。`, {"room":"living","affinity":{"inquiryDrive":2,"structurePreference":1}});
    add("rest", "", `
留在客厅歇着。|这会儿就在客厅歇着。
留在客厅歇着。|还不想离开客厅。`, {"room":"living","retired":true});
    add("roam", "", `
正在客厅里换一个位置。|走一走，视野也会变一变。
在客厅走动。|去客厅另一头看看。`, {"room":"living"});
    add("observe", "", `
在餐厅里观察附近，没有开始进食。|看一看，不代表现在要吃东西。`, {"room":"dining"});
    add("observe", "inquiryDrive:positive", `
在餐厅观察周围。|餐厅这边和那边，我想对着看看。`, {"room":"dining","affinity":{"inquiryDrive":2,"structurePreference":1}});
    add("rest", "", `
留在餐厅歇着。|先在餐厅歇着。
留在餐厅歇着。|这会儿不忙着在餐厅走。`, {"room":"dining","retired":true});
    add("roam", "", `
正在餐厅里走动，没有参与别的活动。|只是换个位置，不必急着做什么。
在餐厅走动。|走到餐厅那边再看看。`, {"room":"dining"});
    add("observe", "", `
在宿舍观察周围。|宿舍里，也想再看一处。`, {"room":"dorm"});
    add("observe", "inquiryDrive:positive", `
在宿舍观察周围。|宿舍边上，也不想漏过小地方。`, {"room":"dorm","affinity":{"inquiryDrive":2,"structurePreference":1}});
    add("rest", "", `
留在宿舍歇着。|先在宿舍歇着不走。
留在宿舍歇着。|这里是宿舍，先不忙别的。`, {"room":"dorm","retired":true});
    add("sleep", "", `
在宿舍睡着。|醒来以后再接着想。
在宿舍睡着。|这一觉留在宿舍睡。`, {"room":"dorm","retired":true});
    add("rest", "", `
在家具上歇着。|不用急着离开。`, {"furniture":true});
    add("rest", "", `
在家具上歇着。|靠好了，先别乱挪。`, {"furniture":true,"affinity":{"structurePreference":2}});
    add("rest", "", `
在家具上歇着。|身子靠住了，还想歇一点点。`, {"furniture":true,"affinity":{"emotionalExpression":2}});
    add("rest", "", `
在家具上歇着。|这里撑得住，我不挪了。`, {"furniture":true});
    add("sit-idle", "", `
坐在家具上，没有起身。|坐稳了，就待一会儿。`, {"furniture":true});
    add("sit-idle", "", `
坐在家具上，没有起身。|爪子收好，就坐稳这儿。`, {"furniture":true,"affinity":{"structurePreference":2}});
    add("sit-idle", "", `
坐在家具上，没有起身。|坐这儿，爪子先收好。
坐在家具上，没有起身。|这会儿坐着就好。`, {"furniture":true});
    add("observe", "", `
留在家具上观察周围。|从这里看，不用再挪了。`, {"furniture":true});
    add("observe", "inquiryDrive:positive", `
留在家具上观察周围。|身子不挪，眼睛先过去。`, {"furniture":true,"affinity":{"inquiryDrive":2,"structurePreference":1}});
    add("observe", "", `
在已经安顿好的位置上观察。|不用换位置，也有值得留意的地方。`, {"furniture":true});
    add("observe", "structurePreference:positive", `
留在家具上观察周围。|就看这一边，别漏了。`, {"furniture":true,"affinity":{"structurePreference":2}});
    add("item-bat", "inquiryDrive:positive", `
拨弄着{item}。|这次只动一点点，看看会怎样。
拨弄着{item}。|想用同样的力道再试一下。
拨弄着{item}。|爪子一碰，哪里先动？
拨弄着{item}。|爪子怎么拨，还想琢磨一下。`, {"affinity":{"inquiryDrive":2,"structurePreference":1}});
    add("item-bat", "structurePreference:positive", `
拨弄着{item}。|还是按这个力道来。
拨弄着{item}。|一拨一停，先别乱。
拨弄着{item}。|想让每一拨都差不多。
拨弄着{item}。|这一下和下一下，要比比看。`, {"affinity":{"structurePreference":2,"inquiryDrive":1}});
    add("item-bat", "initiative:positive", `
拨弄着{item}。|先拨了再说。
拨弄着{item}。|这回由我的爪子先动。
拨弄着{item}。|想拨就先伸爪。
拨弄着{item}。|轮到我的爪子啦。`, {"affinity":{"initiative":2,"assertiveness":1}});
    add("item-bat", "initiative:negative", `
拨弄着{item}。|爪子就在这儿，顺便碰一下。
拨弄着{item}。|没打算追远，拨着就行。`, {"affinity":{"initiative":-2,"riskTolerance":-1}});
    add("item-bat", "riskTolerance:negative", `
拨弄着{item}。|轻一点，别一下子过头。
拨弄着{item}。|先碰个边。
拨弄着{item}。|爪子试一下就收。`, {"affinity":{"riskTolerance":-2,"noveltySeeking":-1}});
    add("item-bat", "riskTolerance:positive", `
拨弄着{item}。|再多使一点劲试试。
拨弄着{item}。|这一下想拨得更远。
拨弄着{item}。|别只碰一点点嘛。`, {"affinity":{"riskTolerance":2,"initiative":1}});
    add("item-bat", "competitiveness:positive", `
拨弄着{item}。|想比上一拨再准一点。
拨弄着{item}。|这一下得像样。
拨弄着{item}。|还有一拨，不想认输。`, {"affinity":{"competitiveness":2,"initiative":1}});
    add("item-bat", "emotionalExpression:positive", `
拨弄着{item}。|好玩！还想拨。
拨弄着{item}。|再陪爪子玩一下。
拨弄着{item}。|这一点点玩兴，藏不住了。`, {"affinity":{"emotionalExpression":2,"noveltySeeking":1}});
    add("item-bat", "emotionalExpression:negative", `
拨弄着{item}。|又没说不好玩。
拨弄着{item}。|爪子还没打算停。
拨弄着{item}。|还拨着呢，不用问了。`, {"affinity":{"emotionalExpression":-2,"socialEngagement":1}});
    add("roam", "initiative:positive,structurePreference:positive", `
在房间里走动。|先到那边，再想别处。
在房间里走动。|这条路想一口气走完。`, {"affinity":{"initiative":1,"structurePreference":2}});
    add("roam", "initiative:positive,assertiveness:positive", `
在房间里走动。|就往那头走。
在房间里走动。|我先走，别替我改方向。`, {"affinity":{"initiative":2,"assertiveness":1}});
    add("observe", "inquiryDrive:positive,structurePreference:positive", `
看着眼前的环境。|先把两边对着看看。
看着眼前的环境。|想找出那个不一样的地方。`, {"affinity":{"inquiryDrive":2,"structurePreference":1}});
    add("observe", "noveltySeeking:positive", `
看着眼前的环境。|还有哪处没留意过？
看着眼前的环境。|不想老盯着这一处了。`, {"affinity":{"noveltySeeking":2,"inquiryDrive":1}});
    add("rest", "emotionalExpression:negative", `
留在原处歇着。|歇着呢，不用问。
留在原处歇着。|还没想动，嗯。`, {"affinity":{"emotionalExpression":-2,"socialEngagement":-1}});
    add("sleep", "riskTolerance:negative", `
睡着了。|就睡在这儿，不换了。
睡着了。|爪子收着，安心闭眼。`, {"affinity":{"riskTolerance":-2,"structurePreference":1}});
    add("social-observe", "socialEngagement:positive,emotionalExpression:positive", `
和{partner}一起观察周围。|一起看着，连这一眼都更有意思了。
和{partner}一起观察周围。|还想让{partner}知道我挺喜欢这一会儿。`, {"affinity":{"socialEngagement":1,"emotionalExpression":2},"social":true});
    add("social-observe", "socialEngagement:positive,emotionalExpression:negative", `
和{partner}一起观察周围。|没说不想一起看。
和{partner}一起观察周围。|{partner}在就行，别非要我说出来。`, {"affinity":{"socialEngagement":1,"emotionalExpression":-2},"social":true});
    add("social-observe", "socialEngagement:negative,emotionalExpression:negative", `
和{partner}一起观察周围。|先看吧，我不抢着说。
和{partner}一起观察周围。|和{partner}一起，也能不急着开口。`, {"affinity":{"socialEngagement":-2,"emotionalExpression":-1},"social":true});
    add("social-observe", "assertiveness:positive", `
和{partner}一起观察周围。|想指给{partner}看这一边。
和{partner}一起观察周围。|我先看这边，要不要一起？`, {"affinity":{"assertiveness":2,"initiative":1},"social":true});
    add("social-observe", "competitiveness:positive", `
和{partner}一起观察周围。|想比{partner}先看出点什么。
和{partner}一起观察周围。|它注意到哪儿了？我也想找找。`, {"affinity":{"competitiveness":2,"emotionalExpression":-1},"social":true});
    add("social-observe", "", `
和{partner}一起观察周围。|和{partner}一起看，不说话也不别扭。
和{partner}一起观察周围。|它在旁边，眼睛就安心看着。`, {"affinity":{"socialEngagement":-1,"emotionalExpression":-1},"social":true,"relationship":{"familiarity":[3,5],"warmth":[1,5],"trust":[1,5],"tension":[0,0]}});
    add("social-observe", "", `
和{partner}一起观察周围。|想知道{partner}会怎么说。
和{partner}一起观察周围。|还有一眼想和它一起看。`, {"affinity":{"socialEngagement":1,"initiative":1},"social":true,"relationship":{"familiarity":[3,5],"warmth":[1,5],"trust":[1,5],"tension":[0,0]}});
    add("social-observe", "", `
和{partner}一起观察周围。|先一起看，开口的事等一等。
和{partner}一起观察周围。|还没摸清{partner}喜欢留意什么。`, {"affinity":{"riskTolerance":-1,"socialEngagement":-1},"social":true,"relationship":{"familiarity":[0,1]}});
    add("social-observe", "", `
和{partner}一起观察周围。|想问{partner}第一眼会看哪儿。
和{partner}一起观察周围。|先一起看这一处，好开个头。`, {"affinity":{"socialEngagement":1,"initiative":1},"social":true,"relationship":{"familiarity":[0,1]}});
    add("social-presence", "socialEngagement:positive,emotionalExpression:positive", `
和{partner}一起待着。|有{partner}在，想多待一点！
和{partner}一起待着。|还想让{partner}知道我挺喜欢这一会儿。`, {"affinity":{"socialEngagement":1,"emotionalExpression":2},"social":true});
    add("social-presence", "socialEngagement:positive,emotionalExpression:negative", `
和{partner}一起待着。|还在旁边呢，我也没想走。
和{partner}一起待着。|这会儿不走，也没什么好解释的。`, {"affinity":{"socialEngagement":1,"emotionalExpression":-2},"social":true});
    add("social-presence", "socialEngagement:negative,emotionalExpression:negative", `
和{partner}一起待着。|先一起待着，话可以少一点。
和{partner}一起待着。|还不习惯一直搭话，陪着就行。`, {"affinity":{"socialEngagement":-2,"emotionalExpression":-1},"social":true});
    add("social-presence", "assertiveness:positive", `
和{partner}一起待着。|这一会儿想由我先拿主意。
和{partner}一起待着。|想让{partner}留意我一下。`, {"affinity":{"assertiveness":2,"initiative":1},"social":true});
    add("social-presence", "competitiveness:positive", `
和{partner}一起待着。|心里还是想比它快一点。
和{partner}一起待着。|不说出来，也想做得更好一点。`, {"affinity":{"competitiveness":2,"emotionalExpression":-1},"social":true});
    add("social-presence", "", `
和{partner}一起待着。|和{partner}待着，不开口也自在。
和{partner}一起待着。|不用找话把空隙填满。`, {"affinity":{"socialEngagement":-1,"emotionalExpression":-1},"social":true,"relationship":{"familiarity":[3,5],"warmth":[1,5],"trust":[1,5],"tension":[0,0]}});
    add("social-presence", "", `
和{partner}一起待着。|和{partner}这会儿待着，倒想再认识一点。
和{partner}一起待着。|再陪它待一小下吧。`, {"affinity":{"socialEngagement":1,"initiative":1},"social":true,"relationship":{"familiarity":[3,5],"warmth":[1,5],"trust":[1,5],"tension":[0,0]}});
    add("social-presence", "", `
和{partner}一起待着。|不太熟，先别凑得太热闹。
和{partner}一起待着。|不知道{partner}想不想多聊。`, {"affinity":{"riskTolerance":-1,"socialEngagement":-1},"social":true,"relationship":{"familiarity":[0,1]}});
    add("social-presence", "", `
和{partner}一起待着。|先和{partner}找一句简单的话说。
和{partner}一起待着。|还没那么熟，不过可以先待一会儿。`, {"affinity":{"socialEngagement":1,"initiative":1},"social":true,"relationship":{"familiarity":[0,1]}});
    add("sleep", "emotionalExpression:positive", `
睡着了。|好困啊，眼睛才不想睁。
睡着了。|这一觉还想多睡一点呢。
睡着了。|眼睛还想多闭一会儿嘛。
睡着了。|睡得正想睡，别结束呀。`, {"affinity":{"emotionalExpression":2,"socialEngagement":1}});
    add("sleep", "emotionalExpression:negative", `
睡着了。|我睡我的。
睡着了。|眼睛闭着，话也先收着。`, {"affinity":{"emotionalExpression":-2,"socialEngagement":-1}});
    add("sleep", "", `
睡着了。|再睡到不想睡为止。
睡着了。|醒着的念头，先别挤进来。`, {"affinity":{}});
    // Relationship-specific reactions; exact-partner/social guards stay in the V2 selector.
    add("social-observe", "socialEngagement:negative,emotionalExpression:negative", `
和{partner}一起观察周围。|和它一起看，话留着也自在。`, {"social":true,"affinity":{"socialEngagement":-2,"emotionalExpression":-1},"relationship":{"familiarity":[3,5],"warmth":[1,5],"trust":[1,5],"tension":[0,0]}});
    add("social-observe", "socialEngagement:positive,emotionalExpression:negative", `
和{partner}一起观察周围。|想多看一会儿，有它一起就行。`, {"social":true,"affinity":{"socialEngagement":1,"emotionalExpression":-2},"relationship":{"familiarity":[3,5],"warmth":[1,5],"trust":[1,5],"tension":[0,0]}});
    add("social-observe", "initiative:positive", `
和{partner}一起观察周围。|还想跟它看下一处，开口倒不急。`, {"social":true,"affinity":{"initiative":2,"emotionalExpression":-1},"relationship":{"familiarity":[3,5],"warmth":[1,5],"trust":[1,5],"tension":[0,0]}});
    add("social-observe", "socialEngagement:negative,emotionalExpression:negative", `
和{partner}一起观察周围。|先看着，话慢一点再说。`, {"social":true,"affinity":{"socialEngagement":-2,"emotionalExpression":-1},"relationship":{"familiarity":[0,1]}});
    add("social-observe", "socialEngagement:positive,emotionalExpression:negative", `
和{partner}一起观察周围。|想问它看哪儿，先挑一句简单的。`, {"social":true,"affinity":{"socialEngagement":1,"emotionalExpression":-2},"relationship":{"familiarity":[0,1]}});
    add("social-observe", "initiative:positive", `
和{partner}一起观察周围。|先问它想看哪边好了。`, {"social":true,"affinity":{"initiative":2},"relationship":{"familiarity":[0,1]}});
    global.Meeow.residentCopyLibrary = Object.freeze(entries.filter(entry => !entry.retired));
}(window));
