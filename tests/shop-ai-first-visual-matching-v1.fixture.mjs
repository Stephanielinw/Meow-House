import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({ window: {}, console, Buffer, Uint8Array, Uint8ClampedArray });
for (const file of ['meeow-semantics.js', 'meeow-item-visuals.js', 'meeow-shop-catalog.js', 'meeow-shop-cart.js', 'meeow-inventory.js'])
    vm.runInContext(read(`../js/${file}`), context);
const { itemVisuals: visuals, shopCatalog: shop, shopCart: cart, inventory } = context.window.Meeow;
const html = read('../index.html');

assert.match(html, /visualMode: 'ai-match'/);
assert.equal((html.match(/setShopVisualMode\('ai-match'\)/g) || []).length, 2);
assert.equal((html.match(/>智能匹配图库<\/button>/g) || []).length, 2);
assert.equal((html.match(/>自定义像素<\/button>/g) || []).length, 2);
assert.ok(!html.includes('>默认图标</button>'));
assert.ok(!html.includes('placeholder="默认图标(emoji / fa-*)"'));
assert.match(html, /提交上架申请后，将根据商品描述从馆舍图库中匹配最合适的像素图/);
assert.match(html, /formatVisualHintContract\(\)/);
assert.match(html, /const res = await callAI\(prompt, "Shop AI", 500\)/);
assert.equal((html.match(/callAI\(/g) || []).length, 40);
assert.match(html, /lastShopVisualResult\.value = definition/);
assert.equal((html.match(/<meeow-item-visual :item="lastShopVisualResult"/g) || []).length, 2);
assert.match(html, /馆舍图库暂无合适像素图，暂用后备图标/);

const registry = visuals.registry;
assert.equal(registry.length, 62);
assert.equal(registry.filter(entry => entry.id.startsWith('housefood:')).length, 16);
assert.equal(registry.filter(entry => entry.id.startsWith('basefood:')).length, 24);
assert.equal(registry.filter(entry => entry.id.startsWith('baseitem:')).length, 22);
assert.equal(registry.filter(entry => entry.sourceType !== 'first-party').length, 0);
assert.equal(registry.filter(entry => entry.id.startsWith('housefood:') && entry.resolverEligible).length, 0);

const id = 'shop-catalog:00000000-0000-4000-8000-000000000011';
const fishHint = { object: 'fish', material: 'food', form: 'meal', context: 'food' };
const draft = { name: '清蒸鱼饭', desc: '鱼和米饭组成的一餐。', category: 'food', icon: '',
    visualMode: 'ai-match', visual: shop.legacyVisual() };
const captured = shop.captureAuthoringSnapshot(draft, visuals.normalizeItemVisual);
assert.equal(captured.valid, true);
assert.equal(Object.isFrozen(captured.snapshot), true);
assert.equal(captured.snapshot.visualMode, 'ai-match');
draft.name = '后来修改的商品';
draft.visualMode = 'custom-pixel';
const raw = { approved: true, price: 30, effect: 2, reason: '通过', visualHint: fishHint,
    semanticTags: ['temp:warm', 'taste:umami', 'smell:fragrant', 'texture:soft', 'family:fish', 'form:meal'],
    spriteId: 'housefood:salmon-steak', path: '/wrong.png', url: 'https://wrong.example', visual: { mode: 'builtin-sprite' } };
const appraisal = shop.normalizeAppraisal(raw, 'food');
assert.equal(appraisal.valid, true);
assert.deepEqual(plain(appraisal.visualHint), fishHint);
for (const field of ['spriteId', 'path', 'url', 'visual', 'sourceCatalogId', 'uniqueId'])
    assert.equal(appraisal[field], undefined, `AI ${field} cannot become authority`);
for (const field of ['object', 'material', 'form', 'context']) {
    const invalid = shop.normalizeAppraisal({ ...raw, visualHint: { ...fishHint, [field]: 'unsupported' } }, 'food');
    assert.equal(invalid.visualHint, null, `invalid ${field} is rejected`);
}
assert.equal(shop.normalizeAppraisal({ ...raw, visualHint: { ...fishHint, extra: 'x' } }, 'food').visualHint, null);
assert.equal(shop.normalizeAppraisal({ ...raw, visualHint: ['fish'] }, 'food').visualHint, null);
const definition = shop.createCatalogDefinition(captured.snapshot, appraisal, id);
assert.equal(definition.name, '清蒸鱼饭', 'submitted Draft A stays authoritative');
assert.equal(definition.visual.mode, 'auto-sprite');
assert.equal(definition.visual.spriteId, 'basefood:fish-meal');
assert.deepEqual(plain(definition.visual.visualHint), fishHint);
assert.deepEqual(plain(definition.visualHint), fishHint);
assert.equal(definition.semanticType, 'food');
assert.equal(definition.tags.includes('family:fish'), true, 'Food semantics remain separate');
assert.equal(shop.validateCatalogDefinition(definition).valid, true);
assert.equal(visuals.getItemVisualDescriptor(definition).spriteId, 'basefood:fish-meal');
assert.equal(shop.resolveAppraisedVisual(captured.snapshot, fishHint,
    registry.filter(entry => entry.id.startsWith('housefood:'))).mode, 'legacy-icon',
    'canonical House Food is never selected for generic Shop matching');
assert.equal(shop.resolveAppraisedVisual(captured.snapshot, fishHint,
    [{ ...registry.find(entry => entry.id === 'basefood:fish-meal'), sourceType: 'third-party' }]).mode, 'legacy-icon');

const reloaded = plain({ shopItems: [definition] });
assert.equal(shop.normalizeShopCatalog(reloaded.shopItems).changed, false);
assert.deepEqual(reloaded.shopItems[0].visual, plain(definition.visual), 'load/export/import preserve frozen visual');
const futureRegistry = [{ ...registry.find(entry => entry.id === 'basefood:fish-meal'), id: 'basefood:future-perfect-match' }, ...registry];
assert.equal(visuals.getItemVisualDescriptor(reloaded.shopItems[0], futureRegistry).spriteId,
    'basefood:fish-meal', 'later registry growth cannot re-resolve a frozen sprite');
const session = cart.createSession();
assert.equal(cart.add(session, reloaded.shopItems, definition), true);
assert.equal(visuals.getItemVisualDescriptor(cart.summarize(session, reloaded.shopItems).lines[0].item).spriteId,
    'basefood:fish-meal', 'Cart uses frozen catalog visual');
const purchase = shop.createPurchaseInstance(definition, 'item-instance:00000000-0000-4000-8000-000000000012');
assert.deepEqual(plain(purchase.visual), plain(definition.visual));
assert.equal(visuals.getItemVisualDescriptor(purchase).spriteId, 'basefood:fish-meal', 'Backpack uses frozen sprite');
assert.equal(inventory.getItemDisplayAttributes(purchase).length, 6);

const noMatch = shop.createCatalogDefinition(captured.snapshot,
    shop.normalizeAppraisal({ approved: true, price: 8, effect: 1,
        visualHint: { object: 'unknown', material: 'unknown', form: 'unknown', context: 'unknown' } }, 'food'),
    'shop-catalog:00000000-0000-4000-8000-000000000013');
assert.equal(noMatch.visual.mode, 'legacy-icon');
assert.equal(noMatch.visual.spriteId, null);
assert.equal(noMatch.icon, 'fa-solid fa-box');
assert.equal(noMatch.visual.visualHint.object, 'unknown', 'valid no-match hint is retained');
const invalidHint = shop.createCatalogDefinition(captured.snapshot,
    shop.normalizeAppraisal({ approved: true, price: 8, effect: 1, visualHint: { ...fishHint, object: 'bad' } }, 'food'),
    'shop-catalog:00000000-0000-4000-8000-000000000014');
assert.equal(invalidHint.visual.mode, 'legacy-icon');
assert.equal(invalidHint.visual.visualHint, null);
assert.equal(shop.validateCatalogDefinition({ ...definition, visualHint: { ...fishHint, material: 'bad' } }).valid, false);

const bytes = Buffer.alloc(64 * 64 * 4);
bytes[3] = 255;
const custom = { version: 1, mode: 'custom-pixel', spriteId: null, visualHint: null,
    customPixel: { version: 1, width: 64, height: 64, encoding: 'rgba-base64', data: bytes.toString('base64') } };
const customSnapshot = shop.captureAuthoringSnapshot({ name: '手绘玩具', desc: '自己画的玩具。', category: 'toy', icon: '',
    visualMode: 'custom-pixel', visual: custom }, visuals.normalizeItemVisual).snapshot;
const customDefinition = shop.createCatalogDefinition(customSnapshot,
    shop.normalizeAppraisal({ approved: true, price: 10, effect: 1, visualHint: fishHint }, 'toy'),
    'shop-catalog:00000000-0000-4000-8000-000000000015');
assert.equal(customDefinition.visual.mode, 'custom-pixel');
assert.equal(customDefinition.visual.customPixel.data, custom.customPixel.data);
assert.equal(customDefinition.visualHint, undefined, 'AI hint cannot override user pixels');

assert.match(html, /isActiveAppraisalRequest\(activeShopAppraisalToken, requestToken\)/);
assert.match(html, /createCatalogDefinition\(snapshot, appraisal, sourceCatalogId\)/);
assert.doesNotMatch(html, /createCatalogDefinition\(newItem/);
const submitStart = html.indexOf('                const submitShopItem = async () => {');
const submitEnd = html.indexOf('                const generateFullDiary = async () => {', submitStart);
assert.ok(submitStart > 0 && submitEnd > submitStart);
let nextId = 20;
const pending = [], catalog = [];
const liveDraft = { name: 'Draft A', desc: 'Fish dinner', category: 'food', icon: '',
    visualMode: 'ai-match', visual: shop.legacyVisual() };
const scopedShop = { ...shop,
    createAppraisalRequestToken: () => `shop-appraisal:00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    createSourceCatalogId: () => `shop-catalog:00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}` };
const appraisalState = { window: { Meeow: { shopCatalog: scopedShop, itemVisuals: visuals, semantics: context.window.Meeow.semantics } },
    newItem: liveDraft, isSubmittingItem: { value: false }, shopItems: { value: catalog },
    lastShopVisualResult: { value: null }, callAI: prompt => new Promise(resolve => pending.push({ prompt, resolve })),
    parseAIJSON: JSON.parse, persistNow: () => true, alert: () => {} };
const handler = new Function('state', `const { window, newItem, isSubmittingItem, shopItems,
    lastShopVisualResult, callAI, parseAIJSON, persistNow, alert } = state;
    let activeShopAppraisalToken = '';
    const resetShopAuthoringDraft = () => { activeShopAppraisalToken = ''; isSubmittingItem.value = false; };
    ${html.slice(submitStart, submitEnd)}
    return { submit: submitShopItem, invalidate: () => { activeShopAppraisalToken = ''; isSubmittingItem.value = false; } };
`)(appraisalState);
const oldRequest = handler.submit();
assert.equal(pending.length, 1);
assert.match(pending[0].prompt, /visualHint/);
assert.match(pending[0].prompt, /semanticTags/);
handler.invalidate();
liveDraft.name = 'Draft B'; liveDraft.desc = 'Grain dinner';
const newRequest = handler.submit();
assert.equal(pending.length, 2);
pending[1].resolve(JSON.stringify({ ...raw, visualHint: { object: 'grain', material: 'food', form: 'meal', context: 'food' } }));
await newRequest;
pending[0].resolve(JSON.stringify(raw));
await oldRequest;
assert.equal(catalog.length, 1, 'stale appraisal creates no catalog or sprite assignment');
assert.equal(catalog[0].name, 'Draft B');
assert.equal(catalog[0].visual.spriteId, 'basefood:grain-bowl');
assert.equal(catalog[0].tags.includes('family:fish'), true, 'Food semantic tags remain a separate contract');
console.log('Shop AI-first visual matching V1 fixture: PASS');
