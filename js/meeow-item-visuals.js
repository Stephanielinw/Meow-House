(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const visuals = Meeow.itemVisuals = Meeow.itemVisuals || {};

    const taxonomy = Object.freeze({
        object: Object.freeze('fish meat egg fruit vegetable grain bread dessert drink branch stick leaf flower herb seed mushroom stone gem crystal shell bone feather book paper scroll photo letter bottle cup mug jar box bag basket coin key ring necklace cloth ribbon rope tool toy trinket unknown'.split(' ')),
        material: Object.freeze('organic wood stone mineral metal glass ceramic paper cloth leather food liquid mixed unknown'.split(' ')),
        form: Object.freeze('meal snack dessert beverage ingredient natural-object keepsake container document jewelry craft-material tool toy household-object unknown'.split(' ')),
        context: Object.freeze('food household nature travel writing craft fantasy collectible gift market unknown'.split(' '))
    });
    const dimensions = Object.freeze(['object', 'material', 'form', 'context']);
    const allowed = Object.fromEntries(dimensions.map(key => [key, new Set(taxonomy[key])]));
    const hintKeys = Object.freeze(dimensions.slice());

    const validateVisualHint = raw => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join('|') !== hintKeys.slice().sort().join('|')) return null;
        const hint = {};
        for (const key of hintKeys) {
            if (typeof raw[key] !== 'string') return null;
            const value = raw[key].trim();
            if (!allowed[key].has(value)) return null;
            hint[key] = value;
        }
        return hint;
    };
    const forbiddenSpriteAuthorityKeys = new Set(['spriteid', 'sprite_id', 'sprite', 'spritefile', 'spriteurl', 'filename', 'file', 'filepath', 'path', 'url', 'asseturl', 'assetpath', 'assetsource', 'search', 'searchquery']);
    const validateAuthoredItemVisualHint = item => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => forbiddenSpriteAuthorityKeys.has(key.toLowerCase()))) return null;
        return validateVisualHint(item.visualHint);
    };

    const formatVisualHintContract = () => `For every non-null newly authored item, include visualHint exactly as {"object":"...","material":"...","form":"...","context":"..."}. You classify appearance only; PROGRAM chooses the local sprite. Do not return sprite IDs, filenames, file paths, URLs, or freeform search queries. Closed values: object=${taxonomy.object.join('|')}; material=${taxonomy.material.join('|')}; form=${taxonomy.form.join('|')}; context=${taxonomy.context.join('|')}. Use unknown only when genuinely unclear.`;

    // Each tuple is original filename, closed object/material/form/context tags, then registry-only aliases.
    // The aliases help authors find entries; the runtime resolver never scores them.
    const idylwild = [
        ['acorn','seed','organic','natural-object','nature','橡果'], ['apple','fruit','food','ingredient','food','苹果'],
        ['arrow','tool','wood,metal','tool','fantasy','箭'], ['basket','basket','wood,organic','container','household','篮子'],
        ['board','stick','wood','craft-material','craft','木板'], ['bone','bone','organic','natural-object','nature','骨头'],
        ['bonemeal','bone','organic','craft-material','craft','骨粉'], ['book','book','paper','document','writing','书'],
        ['bread','bread,grain','food','snack','food','面包'], ['bucket','box','wood,metal','container','household','水桶'],
        ['chain','rope','metal','craft-material','craft','铁链'], ['cloth','cloth','cloth','craft-material','craft','布'],
        ['copper_ingot','trinket','metal','craft-material','craft','铜锭'], ['copper_ore','stone','mineral','natural-object','nature','铜矿'],
        ['copper_rod','tool','metal','tool','craft','鱼竿'], ['egg','egg','food','ingredient','food','鸡蛋'],
        ['gold_ingot','trinket','metal','craft-material','craft','金锭'], ['gold_key','key','metal','keepsake','travel','金钥匙'],
        ['gold_ore','stone','mineral','natural-object','nature','金矿'], ['grass','leaf,herb','organic','natural-object','nature','草'],
        ['herb','herb,leaf','organic','natural-object','nature','草药'], ['inkpot','bottle','glass,liquid','container','writing','墨水瓶'],
        ['iron_ingot','trinket','metal','craft-material','craft','铁锭'], ['iron_ore','stone','mineral','natural-object','nature','铁矿'],
        ['iron_pickaxe','tool','metal,wood','tool','craft','镐'], ['leather','cloth','leather','craft-material','craft','皮革'],
        ['log','branch,stick','wood','natural-object','nature','木头'], ['mug','mug,cup','ceramic','container','household','马克杯'],
        ['mushroom','mushroom,vegetable','organic,food','ingredient','nature','蘑菇'], ['parchment','paper','paper','document','writing','羊皮纸'],
        ['plate','trinket','ceramic','household-object','household','盘子'], ['platinum_ingot','trinket','metal','craft-material','craft','铂金锭'],
        ['platinum_ore','stone','mineral','natural-object','nature','铂金矿'], ['quill','feather','organic','document','writing','羽毛笔'],
        ['rawhide','cloth','leather','craft-material','craft','生皮'], ['rope','rope','organic','craft-material','craft','绳子'],
        ['sack','bag','cloth','container','household','袋子'], ['scroll','scroll,paper','paper','document','writing','卷轴'],
        ['silk','cloth,ribbon','cloth','craft-material','craft','丝绸'], ['silver_ingot','trinket','metal','craft-material','craft','银锭'],
        ['silver_ore','stone','mineral','natural-object','nature','银矿'], ['silver_shovel','tool','metal,wood','tool','craft','铲'],
        ['steak','meat','food','meal','food','肉排'], ['stick','branch,stick','wood,organic','natural-object,keepsake','nature,travel','树枝,枝条,木枝,冷杉枝'],
        ['string','rope','cloth','craft-material','craft','细绳'], ['thread','rope','cloth','craft-material','craft','线'],
        ['torch','tool','wood','tool','travel','火把'], ['torch_lit','tool','wood','tool','travel','燃烧的火把'],
        ['urn','jar','ceramic','container','household','陶罐'], ['wheat','grain,seed','food,organic','ingredient','food','小麦']
    ];
    const yapi = [
        ['banana','fruit','food','ingredient','food','香蕉'], ['bean','vegetable,seed','food','ingredient','food','豆'],
        ['beast bone','bone','organic','natural-object','nature','兽骨'], ['beast meat','meat','food','ingredient','food','兽肉'],
        ['berry','fruit','food','ingredient','food','浆果'], ['blanket','cloth','cloth','household-object','household','毯子'],
        ['carrot','vegetable','food','ingredient','food','胡萝卜'],
        ['chocolate bar','dessert','food','dessert,snack','food','巧克力'], ['cinnamon','herb','organic,food','ingredient','food','肉桂'],
        ['cloth','cloth','cloth','craft-material','craft','布'],
        ['coconut','fruit','food','ingredient','food','椰子'], ['coffee beans','grain,seed','food','ingredient','food','咖啡豆'],
        ['corn','vegetable,grain','food','ingredient','food','玉米'], ['cotton','cloth','organic','craft-material','craft','棉花'],
        ['cupcake','dessert','food','dessert','food','杯子蛋糕'],
        ['diamond','gem,crystal','mineral','keepsake','collectible','钻石'], ['egg','egg','food','ingredient','food','鸡蛋'],
        ['fish','fish','food','ingredient','food','鱼'], ['flower','flower','organic','natural-object,keepsake','nature,travel','花'],
        ['fruit salad','fruit','food','meal,dessert','food','水果沙拉'], ['gold','coin','metal','keepsake','collectible','金子'],
        ['grass','leaf,herb','organic','natural-object','nature','草'], ['handpainted mug','mug,cup','ceramic','container,keepsake','household,gift','手绘杯'],
        ['hard candy','dessert','food','snack,dessert','food','糖果'], ['herbs','herb,leaf','organic','natural-object','nature','草药'],
        ['ice cream','dessert','food','dessert','food','冰淇淋'], ['iron','trinket','metal','craft-material','craft','铁'],
        ['lemon','fruit','food','ingredient','food','柠檬'], ['melon','fruit','food','ingredient','food','瓜'],
        ['milk','drink','liquid,food','beverage','food','牛奶'], ['nut','seed','organic,food','snack','food','坚果'],
        ['oats','grain','food','ingredient','food','燕麦'], ['octopus','fish','food','ingredient','food','章鱼'],
        ['paper','paper','paper','document','writing','纸'], ['photo frame','photo','wood,paper','keepsake','collectible','照片'],
        ['picnic basket','basket','wood,organic','container','travel','野餐篮'], ['pie','dessert','food','dessert','food','派'],
        ['potato','vegetable','food','ingredient','food','土豆'], ['ramen','grain','food','meal','food','拉面'],
        ['rice bowl','grain','food','meal','food','米饭'], ['rock','stone','stone','natural-object,keepsake','nature,travel','石头'],
        ['rope','rope','organic','craft-material','travel','绳子'], ['seashell','shell','organic','natural-object,keepsake','travel,nature','贝壳,海螺'],
        ['seed','seed','organic','natural-object','nature','种子'], ['shiny stone','stone,gem','stone,mineral','keepsake','travel,collectible','亮石头'],
        ['silk','cloth,ribbon','cloth','craft-material','craft','丝绸'], ['stew','meat','food','meal','food','炖菜'],
        ['string','rope','cloth','craft-material','craft','线'], ['teabag','herb','organic,food','ingredient','food','茶包'],
        ['tropical juice','drink,fruit','liquid,food','beverage','food','果汁'], ['water','drink','liquid','beverage','food','水'],
        ['wheat','grain','food','ingredient','food','小麦'], ['wood','branch,stick','wood','craft-material,keepsake','nature,travel','木头']
    ];
    const rowsToRegistry = (rows, prefix, pack, root, size, tier) => rows.map(([name, objects, materials, forms, contexts, aliases]) => Object.freeze({
        id: `${prefix}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        sourcePack: pack, file: `${root}/${name}.png`, license: 'CC0', nativeSize: Object.freeze({ width: size, height: size }), qualityTier: tier,
        objectTags: Object.freeze(objects.split(',')), materialTags: Object.freeze(materials.split(',')),
        formTags: Object.freeze(forms.split(',')), contextTags: Object.freeze(contexts.split(',')),
        aliases: Object.freeze(aliases ? aliases.split(',') : [])
    }));
    const registry = Object.freeze([
        ...rowsToRegistry(idylwild, 'idylwild:inventory', 'idylwild-inventory', 'assets/item-sprites/library/idylwild-inventory', 32, 'primary'),
        ...rowsToRegistry(yapi, 'yapi:assorted', 'yapi-assorted', 'assets/item-sprites/library/yapi-assorted', 16, 'fallback'),
        ...[
            ['book', 'books.png', 0, 0, 'book', 'paper', 'document', 'writing', '书'],
            ['chest', 'chests.png', 0, 0, 'box', 'wood', 'container', 'fantasy', '箱子'],
            ['potion', 'potions.png', 0, 0, 'bottle', 'glass,liquid', 'container', 'fantasy', '药水瓶']
        ].map(([name, file, x, y, objects, materials, forms, contexts, aliases]) => Object.freeze({
            id: `shade:rpg:${name}`, sourcePack: 'shade-rpg', file: `assets/item-sprites/library/shade-rpg/${file}`, sheetRect: Object.freeze({ x, y, width: 16, height: 16 }),
            license: 'CC0', nativeSize: Object.freeze({ width: 16, height: 16 }), qualityTier: 'fallback',
            objectTags: Object.freeze(objects.split(',')), materialTags: Object.freeze(materials.split(',')), formTags: Object.freeze(forms.split(',')),
            contextTags: Object.freeze(contexts.split(',')), aliases: Object.freeze(aliases.split(','))
        }))
    ]);
    const approvedPacks = new Set(['idylwild-inventory', 'yapi-assorted', 'shade-rpg']);
    const validateSpriteRegistry = (entries = registry, fileExists) => {
        if (!Array.isArray(entries)) return { valid: false, errors: ['registry must be an array'] };
        const errors = [], ids = new Set();
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') { errors.push('entry must be an object'); continue; }
            if (!/^[a-z0-9]+(?::[a-z0-9-]+)+$/.test(entry.id || '') || ids.has(entry.id)) errors.push(`invalid or duplicate ID: ${entry.id}`);
            ids.add(entry.id);
            if (!approvedPacks.has(entry.sourcePack) || entry.license !== 'CC0') errors.push(`unapproved source/license: ${entry.id}`);
            if (typeof entry.file !== 'string' || !entry.file.startsWith('assets/item-sprites/library/') || entry.file.includes('..') || (fileExists && !fileExists(entry.file))) errors.push(`missing/unsafe file: ${entry.id}`);
            if (!Number.isInteger(entry.nativeSize?.width) || !Number.isInteger(entry.nativeSize?.height) || entry.nativeSize.width < 1 || entry.nativeSize.height < 1) errors.push(`invalid size: ${entry.id}`);
            if (!['primary', 'fallback'].includes(entry.qualityTier)) errors.push(`invalid tier: ${entry.id}`);
            if (entry.sheetRect && (!Number.isInteger(entry.sheetRect.x) || !Number.isInteger(entry.sheetRect.y) || entry.sheetRect.x < 0 || entry.sheetRect.y < 0 || entry.sheetRect.width !== entry.nativeSize.width || entry.sheetRect.height !== entry.nativeSize.height)) errors.push(`invalid sheet rectangle: ${entry.id}`);
            for (const key of dimensions) {
                const tags = entry[`${key}Tags`];
                if (!Array.isArray(tags) || !tags.length || tags.some(tag => !allowed[key].has(tag))) errors.push(`invalid ${key} tags: ${entry.id}`);
            }
            if (!Array.isArray(entry.aliases) || entry.aliases.some(alias => typeof alias !== 'string')) errors.push(`invalid aliases: ${entry.id}`);
        }
        return { valid: errors.length === 0, errors };
    };
    const resolveItemSpriteCandidate = (rawHint, entries = registry) => {
        const hint = validateVisualHint(rawHint);
        if (!hint || hint.object === 'unknown') return null;
        const weights = { object: 12, material: 3, form: 3, context: 1 };
        const matches = [];
        for (const entry of entries) {
            if (!entry.objectTags?.includes(hint.object)) continue;
            const matchedTags = dimensions.filter(key => entry[`${key}Tags`]?.includes(hint[key]) && hint[key] !== 'unknown');
            const score = matchedTags.reduce((sum, key) => sum + weights[key], 0);
            if (score >= 12) matches.push({ spriteId: entry.id, score, matchedTags, qualityTier: entry.qualityTier, entry });
        }
        matches.sort((a, b) => b.score - a.score || (a.qualityTier === 'primary' ? -1 : 1) - (b.qualityTier === 'primary' ? -1 : 1) || a.spriteId.localeCompare(b.spriteId, 'en'));
        return matches[0] || null;
    };
    Object.assign(visuals, { taxonomy, registry, validateVisualHint, validateAuthoredItemVisualHint, formatVisualHintContract, validateSpriteRegistry, resolveItemSpriteCandidate });
    if (typeof module !== 'undefined' && module.exports) module.exports = visuals;
})(typeof window !== 'undefined' ? window : globalThis);
