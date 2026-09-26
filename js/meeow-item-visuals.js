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
    const CUSTOM_PIXEL_BYTE_LENGTH = 64 * 64 * 4;
    const customPixelKeys = Object.freeze(['data', 'encoding', 'height', 'version', 'width']);
    const base64ToBytes = value => {
        if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4) return null;
        try {
            if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
            const binary = global.atob(value);
            return Uint8Array.from(binary, char => char.charCodeAt(0));
        } catch (_) { return null; }
    };
    const bytesToBase64 = bytes => {
        if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return global.btoa(binary);
    };
    const normalizeCustomPixel = raw => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
            Object.keys(raw).sort().join('|') !== customPixelKeys.join('|') || raw.version !== 1 ||
            raw.width !== 64 || raw.height !== 64 || raw.encoding !== 'rgba-base64') return null;
        const bytes = base64ToBytes(raw.data);
        if (!bytes || bytes.length !== CUSTOM_PIXEL_BYTE_LENGTH || bytesToBase64(bytes) !== raw.data) return null;
        let opaque = 0;
        for (let index = 0; index < bytes.length; index += 4) {
            const alpha = bytes[index + 3];
            if (alpha !== 0 && alpha !== 255) return null;
            if (alpha === 0 && (bytes[index] || bytes[index + 1] || bytes[index + 2])) return null;
            if (alpha === 255) opaque += 1;
        }
        if (!opaque) return null;
        return { version: 1, width: 64, height: 64, encoding: 'rgba-base64', data: raw.data };
    };

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
    const forbiddenSpriteAuthorityKeys = new Set(['visual', 'mode', 'registryversion', 'resolverversion', 'spriteid', 'sprite_id', 'sprite', 'spritefile', 'spriteurl', 'filename', 'file', 'filepath', 'path', 'url', 'asseturl', 'assetpath', 'assetsource', 'search', 'searchquery']);
    const validateAuthoredItemVisualHint = item => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => forbiddenSpriteAuthorityKeys.has(key.toLowerCase()))) return null;
        return validateVisualHint(item.visualHint);
    };

    const formatVisualHintContract = () => `For every non-null newly authored item, include visualHint exactly as {"object":"...","material":"...","form":"...","context":"..."}. You classify appearance only; PROGRAM chooses the local sprite. Do not return sprite IDs, filenames, file paths, URLs, or freeform search queries. Closed values: object=${taxonomy.object.join('|')}; material=${taxonomy.material.join('|')}; form=${taxonomy.form.join('|')}; context=${taxonomy.context.join('|')}. Use unknown only when genuinely unclear.`;

    // The active production library contains first-party house art only.
    const housefood = [
        ['salmon-steak','fish','food','meal','food','香煎三文鱼排'],
        ['pumpkin-chicken-stew','meat','food','meal','food','南瓜鸡肉炖锅'],
        ['tuna-egg-custard','egg','food','meal','food','金枪鱼蒸蛋'],
        ['chicken-oat-risotto','grain','food','meal','food','鸡汤燕麦烩饭'],
        ['roasted-vegetable-platter','vegetable','food','meal','food','香烤时蔬拼盘'],
        ['sour-fish-vegetable-salad','fish','food','meal','food','酸香凉拌鱼蔬丝'],
        ['seaweed-fish-crisps','fish','food','snack','food','海苔小鱼脆'],
        ['charred-chicken-strips','meat','food','snack','food','炭烤鸡肉条'],
        ['cheese-grain-crackers','grain','food','snack','food','芝士谷物脆饼'],
        ['spicy-veggie-chips','vegetable','food','snack','food','辣味蔬菜脆片'],
        ['strawberry-panna-cotta','dessert','food','dessert','food','草莓奶冻'],
        ['pumpkin-pudding','dessert','food','dessert','food','南瓜布丁'],
        ['berry-yogurt-cup','dessert','food','dessert','food','酸奶莓果杯'],
        ['warm-milk','drink','liquid,food','beverage','food','暖暖牛奶'],
        ['fruit-pulp-drink','drink','liquid,food','beverage','food','冰镇果肉饮'],
        ['apple-oat-milk','drink','liquid,food','beverage','food','苹果燕麦奶']
    ];
    const basefood = [
        ['fish-meal','fish','food','meal','food','鱼肉餐,generic fish meal'],
        ['meat-meal','meat','food','meal','food','肉类餐,generic meat meal'],
        ['egg-meal','egg','food','meal','food','蛋类餐,generic egg meal'],
        ['grain-bowl','grain','food','meal','food','谷物碗,generic grain bowl'],
        ['vegetable-meal','vegetable','food','meal','food','蔬菜餐,generic vegetable meal'],
        ['bread-meal','bread','food','meal','food','面包餐,generic bread meal'],
        ['dried-fish-snack','fish','food','snack','food','小鱼零嘴,dried fish snack'],
        ['meat-jerky','meat','food','snack','food','肉干零食,meat jerky'],
        ['vegetable-snack','vegetable','food','snack','food','蔬菜零嘴,vegetable snack'],
        ['fruit-snack','fruit','food','snack','food','水果零食,fruit snack'],
        ['bread-loaf','bread','food','snack','food','面包,bread loaf'],
        ['dessert-cake','dessert','food','dessert','food','蛋糕甜点,dessert cake'],
        ['grain-snack','grain','food','snack','food','谷物零食,grain snack'],
        ['dessert-snack','dessert','food','snack','food','甜点小食,dessert snack'],
        ['fruit-dessert','fruit','food','dessert','food','水果甜品,fruit dessert'],
        ['generic-drink','drink','liquid,food','beverage','food','通用饮品,generic drink'],
        ['hot-mug','mug','ceramic','beverage','food','热饮杯,hot mug'],
        ['fruit-drink','fruit','liquid','beverage','food','果味饮品,fruit drink'],
        ['egg-ingredient','egg','food','ingredient','food','鸡蛋食材,egg ingredient'],
        ['fruit-ingredient','fruit','food','ingredient','food','水果食材,fruit ingredient'],
        ['raw-fish','fish','food','ingredient','food','生鱼食材,raw fish'],
        ['raw-meat','meat','food','ingredient','food','生肉食材,raw meat'],
        ['vegetable-ingredient','vegetable','food','ingredient','food','蔬菜食材,vegetable ingredient'],
        ['grain-ingredient','grain','food','ingredient','food','谷物食材,grain ingredient']
    ];
    const baseitem = [
        ['branch','branch','wood','natural-object','nature','树枝,branch','souvenir'],
        ['herb','herb','organic','natural-object','nature','草药,herb','souvenir'],
        ['stone','stone','stone','natural-object','nature','石头,stone','souvenir'],
        ['crystal','crystal','mineral','natural-object','fantasy','水晶,crystal','souvenir'],
        ['shell','shell','organic','keepsake','travel','贝壳,shell','souvenir'],
        ['feather','feather','organic','natural-object','nature','羽毛,feather','souvenir'],
        ['leaf','leaf','organic','natural-object','nature','叶片,leaf','souvenir'],
        ['flower','flower','organic','natural-object','nature','花朵,flower','souvenir'],
        ['coin','coin','metal','keepsake','collectible','硬币,coin','trinket'],
        ['necklace','necklace','metal','jewelry','collectible','项链,necklace','trinket'],
        ['watch','trinket','mixed','jewelry','collectible','手表,watch','trinket'],
        ['hairclip','trinket','mixed','jewelry','gift','发卡,hair clip','trinket'],
        ['wallet','bag','leather','container','market','钱包,wallet','trinket'],
        ['bank-card','trinket','mixed','keepsake','market','银行卡,bank card','trinket'],
        ['ring','ring','metal','jewelry','collectible','戒指,ring','trinket'],
        ['crown','trinket','metal','jewelry','fantasy','王冠,crown','trinket'],
        ['glasses','trinket','mixed','household-object','household','眼镜,glasses','trinket'],
        ['star-sand-orb','toy,trinket','glass','toy,keepsake','fantasy,household','星砂发光球,star sand orb','trinket'],
        ['teaser-wand','toy,tool','mixed','toy','household','伸缩逗猫杆,teaser wand','trinket'],
        ['catnip-pouch','herb,bag','cloth,organic','toy,container','household','浓缩猫薄荷包,catnip pouch','trinket'],
        ['riddle-paper-ball','paper,toy','paper','toy','household','谜语纸团球,riddle paper ball','trinket'],
        ['letter','letter,paper','paper','document','writing,gift','来自居民的信,resident letter','trinket']
    ];
    const registry = Object.freeze([
        ...housefood.map(([name, objects, materials, forms, contexts, aliases]) => Object.freeze({
        id: `housefood:${name}`, sourcePack: 'house-style-food-v1', sourceType: 'first-party', provenance: 'house-art',
        file: `assets/item-sprites/library/house-style-food-v1/${name}.png`, license: 'In-house original',
        nativeSize: Object.freeze({ width: 64, height: 64 }), qualityTier: 'primary', category: 'food', semanticType: 'food', resolverEligible: false,
        objectTags: Object.freeze(objects.split(',')), materialTags: Object.freeze(materials.split(',')),
        formTags: Object.freeze(forms.split(',')), contextTags: Object.freeze(contexts.split(',')),
        aliases: Object.freeze(aliases.split(','))
        })),
        ...basefood.map(([name, objects, materials, forms, contexts, aliases]) => Object.freeze({
            id: `basefood:${name}`, sourcePack: 'house-base-library-v1', sourceType: 'first-party', provenance: 'house-art',
            file: `assets/item-sprites/library/house-base-library-v1/${name}.png`, license: 'In-house original',
            nativeSize: Object.freeze({ width: 64, height: 64 }), qualityTier: 'primary', category: 'food', semanticType: 'food', resolverEligible: true,
            objectTags: Object.freeze(objects.split(',')), materialTags: Object.freeze(materials.split(',')),
            formTags: Object.freeze(forms.split(',')), contextTags: Object.freeze(contexts.split(',')),
            aliases: Object.freeze(aliases.split(','))
        })),
        ...baseitem.map(([name, objects, materials, forms, contexts, aliases, semanticType]) => Object.freeze({
            id: `baseitem:${name}`, sourcePack: 'house-base-library-v1', sourceType: 'first-party', provenance: 'house-art',
            file: `assets/item-sprites/library/house-base-library-v1/${name}.png`, license: 'In-house original',
            nativeSize: Object.freeze({ width: 64, height: 64 }), qualityTier: 'primary', category: 'item', semanticType, resolverEligible: true,
            objectTags: Object.freeze(objects.split(',')), materialTags: Object.freeze(materials.split(',')),
            formTags: Object.freeze(forms.split(',')), contextTags: Object.freeze(contexts.split(',')),
            aliases: Object.freeze(aliases.split(','))
        }))
    ]);
    const approvedFirstPartyPacks = new Set(['house-style-food-v1', 'house-base-library-v1']);
    const validateSpriteRegistry = (entries = registry, fileExists) => {
        if (!Array.isArray(entries)) return { valid: false, errors: ['registry must be an array'] };
        const errors = [], ids = new Set();
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') { errors.push('entry must be an object'); continue; }
            if (!/^[a-z0-9]+(?::[a-z0-9-]+)+$/.test(entry.id || '') || ids.has(entry.id)) errors.push(`invalid or duplicate ID: ${entry.id}`);
            ids.add(entry.id);
            const approvedFirstParty = approvedFirstPartyPacks.has(entry.sourcePack) && entry.sourceType === 'first-party' && entry.license === 'In-house original';
            if (!approvedFirstParty) errors.push(`unapproved source/license: ${entry.id}`);
            if (typeof entry.resolverEligible !== 'boolean') errors.push(`missing resolver eligibility: ${entry.id}`);
            if (typeof entry.file !== 'string' || !entry.file.startsWith('assets/item-sprites/library/') || entry.file.includes('..') || (fileExists && !fileExists(entry.file))) errors.push(`missing/unsafe file: ${entry.id}`);
            if (!Number.isInteger(entry.nativeSize?.width) || !Number.isInteger(entry.nativeSize?.height) || entry.nativeSize.width < 1 || entry.nativeSize.height < 1) errors.push(`invalid size: ${entry.id}`);
            if (!['primary', 'fallback'].includes(entry.qualityTier)) errors.push(`invalid tier: ${entry.id}`);
            if (entry.sheetRect && (!Number.isInteger(entry.sheetRect.x) || !Number.isInteger(entry.sheetRect.y) || entry.sheetRect.x < 0 || entry.sheetRect.y < 0 || entry.sheetRect.width !== entry.nativeSize.width || entry.sheetRect.height !== entry.nativeSize.height)) errors.push(`invalid sheet rectangle: ${entry.id}`);
            if (entry.sheetRect && (!Number.isInteger(entry.sheetSize?.width) || !Number.isInteger(entry.sheetSize?.height) ||
                entry.sheetRect.x + entry.sheetRect.width > entry.sheetSize.width || entry.sheetRect.y + entry.sheetRect.height > entry.sheetSize.height)) errors.push(`invalid sheet dimensions: ${entry.id}`);
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
            if (entry.resolverEligible === false) continue;
            if (!entry.objectTags?.includes(hint.object)) continue;
            const matchedTags = dimensions.filter(key => entry[`${key}Tags`]?.includes(hint[key]) && hint[key] !== 'unknown');
            const score = matchedTags.reduce((sum, key) => sum + weights[key], 0);
            if (score >= 12) matches.push({ spriteId: entry.id, score, matchedTags, qualityTier: entry.qualityTier, entry });
        }
        matches.sort((a, b) => b.score - a.score || (a.qualityTier === 'primary' ? -1 : 1) - (b.qualityTier === 'primary' ? -1 : 1) || a.spriteId.localeCompare(b.spriteId, 'en'));
        return matches[0] || null;
    };
    // Load-time validation never consults the registry or resolver. A stored ID
    // remains the item's identity even if its asset is removed in a later build.
    const normalizeItemVisual = raw => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return null;
        const keys = Object.keys(raw).sort().join('|');
        if (raw.mode === 'custom-pixel') {
            if (keys !== 'customPixel|mode|spriteId|version|visualHint' || raw.spriteId !== null || raw.visualHint !== null) return null;
            const customPixel = normalizeCustomPixel(raw.customPixel);
            return customPixel ? { version: 1, mode: 'custom-pixel', spriteId: null, visualHint: null, customPixel } : null;
        }
        if (keys !== 'mode|spriteId|version|visualHint') return null;
        const hint = raw.visualHint === null ? null : validateVisualHint(raw.visualHint);
        if (raw.visualHint !== null && !hint) return null;
        if (raw.mode === 'legacy-icon') {
            if (raw.spriteId !== null) return null;
        } else if (raw.mode === 'auto-sprite') {
            if (!hint || typeof raw.spriteId !== 'string' || !/^[a-z0-9]+(?::[a-z0-9-]+)+$/.test(raw.spriteId)) return null;
        } else if (raw.mode === 'builtin-sprite') {
            if (typeof raw.spriteId !== 'string' || !/^[a-z0-9]+(?::[a-z0-9-]+)+$/.test(raw.spriteId)) return null;
        } else return null;
        return { version: 1, mode: raw.mode, spriteId: raw.spriteId, visualHint: hint };
    };
    const createBuiltinItemVisual = (spriteId, entries = registry) => {
        if (!entries.some(entry => entry.id === spriteId)) return null;
        return { version: 1, mode: 'builtin-sprite', spriteId, visualHint: null };
    };
    // Call only when a new AI-authored item is accepted for persistence.
    const assignAutoVisualIdentity = (item, entries = registry) => {
        const hint = validateAuthoredItemVisualHint(item);
        if (!hint) return null;
        const candidate = resolveItemSpriteCandidate(hint, entries);
        return {
            ...item,
            visualHint: hint,
            visual: { version: 1, mode: candidate ? 'auto-sprite' : 'legacy-icon',
                spriteId: candidate?.spriteId || null, visualHint: { ...hint } }
        };
    };
    const getItemVisualDescriptor = (item, entries = registry) => {
        const visual = normalizeItemVisual(item?.visual);
        if (visual?.mode === 'custom-pixel') {
            return { kind: 'custom-pixel', nativeWidth: 64, nativeHeight: 64,
                data: visual.customPixel.data, pixels: base64ToBytes(visual.customPixel.data) };
        }
        const entry = visual?.spriteId ? entries.find(candidate => candidate.id === visual.spriteId) : null;
        if (entry) {
            return { kind: 'sprite', spriteId: entry.id, file: entry.file,
                nativeWidth: entry.nativeSize.width, nativeHeight: entry.nativeSize.height,
                sheetRect: entry.sheetRect ? { ...entry.sheetRect, sheetWidth: entry.sheetSize.width, sheetHeight: entry.sheetSize.height } : null };
        }
        return { kind: 'legacy-icon', icon: item?.icon ?? '' };
    };
    const itemVisualSizes = Object.freeze({ small: Object.freeze({ box: 32, art: 32 }),
        medium: Object.freeze({ box: 48, art: 32 }), large: Object.freeze({ box: 80, art: 64 }) });
    const getItemSpriteLayout = (descriptor, size = 'medium') => {
        if (!['sprite', 'custom-pixel'].includes(descriptor?.kind)) return null;
        const target = itemVisualSizes[size] || itemVisualSizes.medium;
        const nativeMax = Math.max(descriptor.nativeWidth, descriptor.nativeHeight);
        const scale = nativeMax > target.art ? target.art / nativeMax : Math.max(1, Math.floor(target.art / nativeMax));
        const width = descriptor.nativeWidth * scale, height = descriptor.nativeHeight * scale;
        const sheet = descriptor.sheetRect;
        return { scale, width, height,
            imageStyle: sheet ? { width: `${sheet.sheetWidth * scale}px`, height: `${sheet.sheetHeight * scale}px`,
                left: `${-sheet.x * scale}px`, top: `${-sheet.y * scale}px` }
                : { width: `${width}px`, height: `${height}px` } };
    };
    // One decorative renderer for every item surface. The clipped image is
    // also the error source, so missing individual PNGs and sheets both fall back.
    const component = {
        props: { item: { type: Object, default: null }, size: { type: String, default: 'medium' }, legacyIcon: { type: String, default: '' } },
        setup(props) {
            const failed = global.Vue.ref(false);
            const customCanvas = global.Vue.ref(null);
            const descriptor = global.Vue.computed(() => getItemVisualDescriptor(props.item));
            const layout = global.Vue.computed(() => getItemSpriteLayout(descriptor.value, props.size));
            const legacyDisplayIcon = global.Vue.computed(() => props.legacyIcon || props.item?.icon || descriptor.value.icon || '');
            global.Vue.watch(() => [descriptor.value.spriteId, descriptor.value.file], () => { failed.value = false; });
            const drawCustomPixel = () => {
                const canvas = customCanvas.value;
                const value = descriptor.value;
                if (!canvas || value.kind !== 'custom-pixel' || !value.pixels) return;
                try {
                    const context = canvas.getContext('2d');
                    context.imageSmoothingEnabled = false;
                    context.putImageData(new ImageData(new Uint8ClampedArray(value.pixels), 64, 64), 0, 0);
                    failed.value = false;
                } catch (_) { failed.value = true; }
            };
            const nextTick = global.Vue.nextTick || (callback => Promise.resolve().then(callback));
            global.Vue.watch(() => descriptor.value.kind === 'custom-pixel' ? descriptor.value.data : '', () => nextTick(drawCustomPixel), { immediate: true });
            if (global.Vue.onMounted) global.Vue.onMounted(() => nextTick(drawCustomPixel));
            return { failed, customCanvas, descriptor, layout, legacyDisplayIcon };
        },
        template: `<span class="meeow-item-visual" :class="'meeow-item-visual--' + size" aria-hidden="true">
            <span v-if="descriptor.kind === 'sprite' && !failed && layout" class="meeow-item-visual__art"
                :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
                <img :src="'./' + descriptor.file" alt="" draggable="false" @error="failed = true"
                    :class="descriptor.sheetRect ? 'meeow-item-visual__sheet' : 'meeow-item-visual__image'"
                    :style="layout.imageStyle">
            </span>
            <span v-else-if="descriptor.kind === 'custom-pixel' && !failed && layout" class="meeow-item-visual__art"
                :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
                <canvas ref="customCanvas" width="64" height="64" class="meeow-item-visual__custom"
                    :style="{ width: layout.width + 'px', height: layout.height + 'px' }"></canvas>
            </span>
            <span v-else class="meeow-item-visual__legacy">
                <i v-if="legacyDisplayIcon && legacyDisplayIcon.startsWith('fa-')" :class="legacyDisplayIcon"></i>
                <span v-else-if="legacyDisplayIcon">{{ legacyDisplayIcon }}</span>
                <i v-else class="fas fa-box"></i>
            </span>
        </span>`
    };
    Object.assign(visuals, { taxonomy, registry, validateVisualHint, validateAuthoredItemVisualHint, formatVisualHintContract, validateSpriteRegistry, resolveItemSpriteCandidate,
        normalizeCustomPixel, normalizeItemVisual, createBuiltinItemVisual, assignAutoVisualIdentity, getItemVisualDescriptor, getItemSpriteLayout,
        base64ToBytes, bytesToBase64, component });
    if (typeof module !== 'undefined' && module.exports) module.exports = visuals;
})(typeof window !== 'undefined' ? window : globalThis);
