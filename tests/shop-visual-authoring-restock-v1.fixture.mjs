import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const context = vm.createContext({ window: {}, console, Buffer, Uint8Array, Uint8ClampedArray });
vm.runInContext(read('../js/meeow-semantics.js'), context);
vm.runInContext(read('../js/meeow-item-visuals.js'), context);
vm.runInContext(read('../js/meeow-shop-catalog.js'), context);
vm.runInContext(read('../js/meeow-inventory.js'), context);
const shop = context.window.Meeow.shopCatalog;
const visuals = context.window.Meeow.itemVisuals;
const inventory = context.window.Meeow.inventory;
const plain = value => JSON.parse(JSON.stringify(value));

const pixels = Buffer.alloc(64 * 64 * 4);
pixels[0] = 33; pixels[1] = 66; pixels[2] = 99; pixels[3] = 255;
const customVisual = {
    version: 1, mode: 'custom-pixel', spriteId: null, visualHint: null,
    customPixel: { version: 1, width: 64, height: 64, encoding: 'rgba-base64', data: pixels.toString('base64') }
};
assert.ok(visuals.normalizeItemVisual(customVisual));

let uuidSequence = 0;
const fakeCrypto = { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}` };
const sourceCatalogId = shop.createSourceCatalogId(fakeCrypto);
const uniqueOne = shop.createInstanceUniqueId(fakeCrypto);
const uniqueTwo = shop.createInstanceUniqueId(fakeCrypto);
const uniqueRollback = shop.createInstanceUniqueId(fakeCrypto);
const uniqueCommitted = shop.createInstanceUniqueId(fakeCrypto);
const requestA = shop.createAppraisalRequestToken(fakeCrypto);
const requestB = shop.createAppraisalRequestToken(fakeCrypto);
assert.match(sourceCatalogId, /^shop-catalog:/);
assert.notEqual(uniqueOne, uniqueTwo);
assert.notEqual(uniqueOne, sourceCatalogId);
assert.match(uniqueOne, /^item-instance:/);
assert.equal(shop.validInstanceUniqueId(uniqueOne), true);
assert.equal(shop.validInstanceUniqueId('item-instance:not-a-uuid'), false);
assert.equal(shop.isActiveAppraisalRequest(requestB, requestA), false, 'stale Draft A response cannot complete Draft B');
assert.equal(shop.isActiveAppraisalRequest(requestB, requestB), true);

assert.equal(shop.legacySourceCatalogId(123), 'legacy-shop:number:123');
assert.notEqual(shop.legacySourceCatalogId(123), shop.legacySourceCatalogId('123'));
assert.equal(shop.legacySourceCatalogId('a:b /猫'), shop.legacySourceCatalogId(JSON.parse(JSON.stringify('a:b /猫'))));
assert.match(shop.legacySourceCatalogId('a:b /猫'), /^legacy-shop:string:[A-Za-z0-9_-]+$/);
assert.equal(shop.legacySourceCatalogId('   '), null, 'blank legacy IDs remain unmigrated');
assert.equal(shop.legacySourceCatalogId(''), null, 'empty legacy IDs remain unmigrated');

const builtIn = { id: 'builtin-food:one', name: '内置', category: 'food', type: 'consumable' };
const numberLegacy = { id: 123, name: '数字旧商品', category: 'toy', type: 'consumable' };
const stringLegacy = { id: '123', name: '字符串旧商品', category: 'toy', type: 'consumable' };
const punctuatedLegacy = { id: 'old:/ 商品 | 甲', name: '标点旧商品', category: 'food', type: 'consumable' };
const duplicateA = { id: 'duplicate', name: '重复甲', category: 'toy', type: 'consumable' };
const duplicateB = { id: 'duplicate', name: '重复乙', category: 'toy', type: 'consumable' };
const blankLegacy = { id: '', name: '空 ID', category: 'toy', type: 'consumable' };
const whitespaceLegacy = { id: '   ', name: '空白 ID', category: 'toy', type: 'consumable' };
const migrated = shop.normalizeShopCatalog(
    [builtIn, numberLegacy, stringLegacy, punctuatedLegacy, duplicateA, duplicateB, blankLegacy, whitespaceLegacy], [builtIn.id]
);
assert.equal(migrated.changed, true);
assert.equal(migrated.migratedCount, 3);
assert.equal(migrated.ambiguousCount, 2);
assert.equal(migrated.items[0], builtIn, 'built-in authority remains byte/object-identical');
assert.equal(migrated.items[1].sourceCatalogId, 'legacy-shop:number:123');
assert.notEqual(migrated.items[1].sourceCatalogId, migrated.items[2].sourceCatalogId, 'number and string IDs never collide');
assert.equal(migrated.items[4].sourceCatalogId, undefined);
assert.equal(migrated.items[5].sourceCatalogId, undefined);
assert.equal(migrated.items[6].sourceCatalogId, undefined);
assert.equal(migrated.items[7].sourceCatalogId, undefined);
const migrationRoundTrip = shop.normalizeShopCatalog(JSON.parse(JSON.stringify(migrated.items)), [builtIn.id]);
assert.equal(migrationRoundTrip.changed, false);
assert.deepEqual(plain(migrationRoundTrip.items), plain(migrated.items));

const owned = [
    { ...numberLegacy, uniqueId: 'old-instance' },
    { id: 999, name: numberLegacy.name, category: 'toy', type: 'consumable', uniqueId: 'phone-like' }
];
const ownedMigration = shop.migrateOwnedCatalogSources(owned, migrated.items);
assert.equal(ownedMigration.migratedCount, 1);
assert.equal(ownedMigration.items[0].sourceCatalogId, 'legacy-shop:number:123');
assert.equal(ownedMigration.items[1].sourceCatalogId, undefined, 'unmatched item identity is not guessed');

const mutableDraft = {
    name: '  星光线团  ', desc: '  手工编成的发光线团。  ', icon: '🧶', category: 'toy',
    visualMode: 'custom-pixel', visual: plain(customVisual)
};
const captured = shop.captureAuthoringSnapshot(mutableDraft, visuals.normalizeItemVisual);
assert.equal(captured.valid, true);
assert.equal(Object.isFrozen(captured.snapshot), true);
assert.equal(Object.isFrozen(captured.snapshot.visual.customPixel), true);
mutableDraft.name = '错误的新草稿';
mutableDraft.visual.customPixel.data = 'changed-after-dispatch';
assert.equal(captured.snapshot.name, '星光线团');
assert.equal(captured.snapshot.visual.customPixel.data, customVisual.customPixel.data,
    'appraisal snapshot keeps exact submitted custom pixels');
const defaultCaptured = shop.captureAuthoringSnapshot({
    name: '默认商品', desc: '等待图库匹配。', icon: '', category: 'toy',
    visualMode: 'ai-match', visual: customVisual
}, visuals.normalizeItemVisual);
assert.equal(defaultCaptured.valid, true);
assert.deepEqual(plain(defaultCaptured.snapshot.visual), plain(shop.legacyVisual()),
    'AI matching captures a neutral placeholder rather than trusting draft artwork');

const appraisal = shop.normalizeAppraisal({ approved: true, price: 88, effect: 2,
    sourceCatalogId: 'ai-owned', spriteId: 'bad:sprite', url: 'https://invalid.example' });
assert.deepEqual(plain(appraisal), { valid: true, approved: true, price: 88, effect: 2, reason: '', visualHint: null, objectSemantics: null });
const definition = shop.createCatalogDefinition(captured.snapshot, appraisal, sourceCatalogId);
assert.equal(definition.id, sourceCatalogId);
assert.equal(definition.sourceCatalogId, sourceCatalogId);
assert.equal(definition.name, '星光线团');
assert.equal(definition.visual.customPixel.data, customVisual.customPixel.data);
assert.equal(Object.hasOwn(definition, 'stock'), false, 'Shop remains unlimited supply');
assert.equal(shop.validateCatalogDefinition(definition, visuals.normalizeItemVisual).valid, true);
assert.equal(shop.validateCatalogDefinition({ ...definition, sourceCatalogId: 'shop-catalog:not-a-uuid' }, visuals.normalizeItemVisual).valid, false);
const failedCatalog = [];
assert.equal(shop.commitCatalogDefinition(failedCatalog, definition, () => false).reason, 'persistence-failed');
assert.equal(failedCatalog.length, 0, 'failed catalog persistence rolls insertion back');
const committedCatalog = [];
assert.equal(shop.commitCatalogDefinition(committedCatalog, definition, () => true).reason, 'created');
assert.equal(shop.commitCatalogDefinition(committedCatalog, plain(definition), () => true).reason, 'already-exists');
assert.equal(committedCatalog.length, 1, 'catalog reuse is idempotent');

const purchaseOne = shop.createPurchaseInstance(definition, uniqueOne);
const purchaseTwo = shop.createPurchaseInstance(definition, uniqueTwo);
assert.notEqual(purchaseOne.uniqueId, purchaseTwo.uniqueId);
assert.equal(purchaseOne.sourceCatalogId, purchaseTwo.sourceCatalogId);
assert.equal(purchaseOne.visual.customPixel.data, definition.visual.customPixel.data);
assert.notEqual(purchaseOne.visual, definition.visual, 'V1 freezes a full visual copy on the physical instance');
const definitionBeforePurchases = plain(definition);
assert.equal(visuals.getItemVisualDescriptor(purchaseOne).data, customVisual.customPixel.data,
    'shared Shop/Backpack renderer receives the exact frozen custom pixels');
assert.deepEqual(plain(definition), definitionBeforePurchases, 'creating physical instances leaves the catalog unchanged');
assert.equal(purchaseOne.visual.customPixel.data, customVisual.customPixel.data, 'purchased visual remains frozen');
const failedBuyer = { coins: 100, inventory: [] };
assert.equal(shop.commitCatalogPurchase(failedBuyer, definition, uniqueRollback, () => false).reason, 'persistence-failed');
assert.equal(failedBuyer.coins, 100);
assert.equal(failedBuyer.inventory.length, 0, 'failed purchase persistence rolls inventory back');
const successfulBuyer = { coins: 100, inventory: [] };
assert.equal(shop.commitCatalogPurchase(successfulBuyer, definition, uniqueCommitted, () => true).reason, 'purchased');
assert.equal(successfulBuyer.coins, 12);
assert.equal(successfulBuyer.inventory[0].sourceCatalogId, sourceCatalogId);
assert.deepEqual(plain(definition), definitionBeforePurchases, 'purchases do not mutate or decrement the unlimited catalog definition');
const coinsAfterPurchase = successfulBuyer.coins;
assert.equal(shop.commitCatalogPurchase(successfulBuyer, definition, uniqueCommitted, () => true).reason, 'duplicate-or-invalid-instance-id');
assert.equal(successfulBuyer.coins, coinsAfterPurchase, 'duplicate physical ID is rejected before coin mutation');
assert.equal(successfulBuyer.inventory.length, 1, 'duplicate physical ID cannot create another instance');
const preexistingId = shop.createInstanceUniqueId(fakeCrypto);
const preexistingBuyer = { coins: 100, inventory: [{ id: 'unrelated', uniqueId: preexistingId }] };
assert.equal(shop.commitCatalogPurchase(preexistingBuyer, definition, preexistingId, () => true).reason,
    'duplicate-or-invalid-instance-id', 'an unrelated existing inventory ID cannot be reused');
assert.equal(preexistingBuyer.coins, 100);
assert.equal(preexistingBuyer.inventory.length, 1);

const sourceCatalogIdB = shop.createSourceCatalogId(fakeCrypto);
const definitionB = { ...plain(definition), id: sourceCatalogIdB, sourceCatalogId: sourceCatalogIdB, visual: plain(customVisual) };
definition.visual = plain(customVisual);
const purchaseB = shop.createPurchaseInstance(definitionB, shop.createInstanceUniqueId(fakeCrypto));
assert.equal(inventory.deriveInventoryDisplayGroups([purchaseOne, purchaseTwo], [definition]).length, 1,
    'same source catalog identity stacks under existing semantics');
assert.equal(inventory.deriveInventoryDisplayGroups([purchaseOne, purchaseB], [definition, definitionB]).length, 2,
    'same name and art cannot merge different catalog definitions');
assert.equal(shop.findCatalogDefinition([definition], sourceCatalogId), definition,
    'unlimited restock/reuse returns the existing definition');
assert.equal([definition].length, 1, 'catalog reuse creates no duplicate definition');

const serialized = JSON.stringify({ shopItems: [definition], inventory: [purchaseOne] });
const reloaded = JSON.parse(serialized);
assert.equal(reloaded.shopItems[0].sourceCatalogId, sourceCatalogId);
assert.equal(reloaded.inventory[0].visual.customPixel.data, customVisual.customPixel.data);

const app = read('../index.html');
assert.match(app, /src="\.\/js\/meeow-shop-catalog\.js"/);
assert.match(app, /captureAuthoringSnapshot\(\s*newItem/);
assert.match(app, /const snapshot = captured\.snapshot/);
assert.match(app, /isActiveAppraisalRequest\(activeShopAppraisalToken, requestToken\)/);
assert.match(app, /createCatalogDefinition\(snapshot, appraisal, sourceCatalogId\)/);
assert.doesNotMatch(app, /createCatalogDefinition\(newItem/);
assert.match(app, /:disabled="isSubmittingItem" placeholder="商品名称"/);
assert.match(app, /showShopPixelEditor && shopPixelEditorDraftItem/);
assert.match(app, /<meeow-item-pixel-editor :item="shopPixelEditorDraftItem" :stack-quantity="1"/);
assert.doesNotMatch(app.slice(app.indexOf('const shopPixelEditorDraftItem'), app.indexOf('const authoredShopItems')), /uniqueId/,
    'Shop editor draft does not fabricate an inventory identity');
assert.match(app, /<meeow-item-visual :item="shopDraftPreviewItem" size="small"><\/meeow-item-visual>/);
assert.match(app, /<meeow-item-visual :item="shopDraftPreviewItem" size="medium"><\/meeow-item-visual>/);
assert.match(app, /commitCatalogPurchase\(user, item, uniqueId/);
assert.match(read('../js/meeow-shop-catalog.js'), /TODO\(V2 storage\)/);
assert.equal((app.match(/callAI\(/g) || []).length, 40, 'no production AI call added');

// Run the production submit handler with deferred appraisal replies. This
// checks the actual asynchronous boundary, not a duplicate test algorithm.
const submitStart = app.indexOf('                const submitShopItem = async () => {');
const submitEnd = app.indexOf('                const generateFullDiary = async () => {', submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart);
const submitSource = app.slice(submitStart, submitEnd);
const makeAppraisalHarness = () => {
    const pending = [], catalog = [], alerts = [];
    const draft = { name: 'Draft A', desc: 'Original concept', icon: '🧶', category: 'toy',
        visualMode: 'ai-match', visual: plain(shop.legacyVisual()) };
    const guardedShop = { ...shop,
        createAppraisalRequestToken: () => shop.createAppraisalRequestToken(fakeCrypto),
        createSourceCatalogId: () => shop.createSourceCatalogId(fakeCrypto) };
    const dependencies = {
        window: { Meeow: { shopCatalog: guardedShop, itemVisuals: visuals } },
        newItem: draft, isSubmittingItem: { value: false }, lastShopVisualResult: { value: null }, shopItems: { value: catalog },
        callAI: prompt => new Promise(resolve => pending.push({ prompt, resolve })),
        parseAIJSON: JSON.parse, persistNow: () => true,
        alert: message => alerts.push(message)
    };
    const factory = new Function('ctx', `
        const { window, newItem, isSubmittingItem, lastShopVisualResult, shopItems, callAI, parseAIJSON, persistNow, alert } = ctx;
        let activeShopAppraisalToken = '';
        const resetShopAuthoringDraft = () => {
            activeShopAppraisalToken = '';
            isSubmittingItem.value = false;
            newItem.name = ''; newItem.desc = '';
        };
        ${submitSource}
        return { submit: submitShopItem, invalidate: () => {
            activeShopAppraisalToken = ''; isSubmittingItem.value = false;
        } };
    `);
    return { ...factory(dependencies), draft, pending, catalog, alerts };
};
const approvedReply = JSON.stringify({ approved: true, price: 88, effect: 2, reason: '' });
const race = makeAppraisalHarness();
const firstDispatch = race.submit();
const duplicateDispatch = race.submit();
assert.equal(race.pending.length, 1, 'double-submit sends exactly one appraisal request');
race.draft.name = 'Draft B';
race.draft.desc = 'Changed after dispatch';
race.pending[0].resolve(approvedReply);
await Promise.all([firstDispatch, duplicateDispatch]);
assert.equal(race.catalog.length, 1);
assert.equal(race.catalog[0].name, 'Draft A', 'accepted product comes from the immutable submitted draft');
assert.equal(race.catalog[0].desc, 'Original concept');

const outOfOrder = makeAppraisalHarness();
const oldDispatch = outOfOrder.submit();
outOfOrder.invalidate();
outOfOrder.draft.name = 'Draft B';
const newDispatch = outOfOrder.submit();
assert.equal(outOfOrder.pending.length, 2);
outOfOrder.pending[1].resolve(approvedReply);
await newDispatch;
outOfOrder.pending[0].resolve(approvedReply);
await oldDispatch;
assert.equal(outOfOrder.catalog.length, 1, 'stale and out-of-order reply cannot create another catalog definition');
assert.equal(outOfOrder.catalog[0].name, 'Draft B');

const cancelled = makeAppraisalHarness();
const cancelledDispatch = cancelled.submit();
cancelled.invalidate();
cancelled.pending[0].resolve(approvedReply);
await cancelledDispatch;
assert.equal(cancelled.catalog.length, 0, 'cancelled appraisal creates nothing');

const manifest = JSON.parse(read('../assets/meeow-item-source/house-style-food-v1/manifest.json'));
assert.equal(manifest.sprites.length, 16);
for (const sprite of manifest.sprites) {
    const sha = path => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
    assert.equal(sha(sprite.file), sprite.sha256, `${sprite.id} runtime hash unchanged`);
    assert.equal(sha(sprite.sourceFile), sprite.sha256, `${sprite.id} source hash unchanged`);
}
const baseManifest = JSON.parse(read('../assets/meeow-item-source/house-base-library-v1/manifest.json'));
assert.equal(baseManifest.sprites.length, 46);
for (const sprite of baseManifest.sprites) {
    const sha = path => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
    assert.equal(sha(sprite.file), sprite.sha256, `${sprite.id} runtime hash unchanged`);
    assert.equal(sha(sprite.sourceFile), sprite.sha256, `${sprite.id} source hash unchanged`);
}

console.log('Shop visual authoring / catalog identity V1 fixture: PASS');
