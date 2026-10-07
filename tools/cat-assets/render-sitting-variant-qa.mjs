/** Render concrete sitting combinations through the production renderer. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCatRenderer, EYE_COLORS, loadCatAssets } from '../../js/meeow-cat-renderer.mjs';

const sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE || 'sharp');
const root = new URL('../../assets/meeow-cat/v1/', import.meta.url);
const output = process.env.CAT_QA_OUTPUT;
if (!output) throw new Error('Set CAT_QA_OUTPUT to a writable review directory');
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root)));
const bank = await loadCatAssets(manifest, root, async url => sharp(fileURLToPath(url)).ensureAlpha().raw().toBuffer());
const render = createCatRenderer(bank);

const cats = [
  {
    id: '01_slim_round_cow_bib',
    label: '瘦 / 圆耳 / 胸毛 / 奶牛',
    config: { body: 'Slim', ear: 'round', tail: 'standard', bib: true, coat: 'black', torso: 'large_patches', torsoColor: 'white', tailmark: 'tip_long', tailColor: 'white' }
  },
  {
    id: '02_chubby_folded_siamese_mixed_socks',
    label: '胖 / 折耳 / 暹罗重点 / 左长袜右短袜',
    config: { body: 'chubby', ear: 'folded', tail: 'standard', bib: 'bib', coat: 'cream', face: 'point', faceColor: 'dark', frontLeft: 'long_socks', frontRight: 'short_socks', frontLeftColor: 'white', frontRightColor: 'white', tailmark: 'half_tail', tailColor: 'dark' }
  },
  {
    id: '03_large_ear_tabby_heterochromia',
    label: '大耳 / 虎斑 / 左蓝右金异色瞳',
    config: { body: 'standard', ear: 'large', tail: 'standard', bib: 'bib', coat: 'ginger', face: 'forehead_m', faceColor: 'dark', torso: 'mackerel_tabby', torsoColor: 'dark', tailmark: 'rings', tailColor: 'dark', eyeLeft: 'blue', eyeRight: 'gold' }
  }
];

await fs.mkdir(output, { recursive: true });
const tiles = [];
for (const [index, cat] of cats.entries()) {
  const frame = render(cat.config);
  assert.equal(frame.pose, 'sitting');
  assert.equal(frame.data.length, 112 * 104 * 4);
  if (cat.config.eyeLeft !== undefined) {
    for (const [maskName, expected] of [['eyeLeft', EYE_COLORS.blue], ['eyeRight', EYE_COLORS.gold]]) {
      const mask = frame.effectiveMasks[maskName];
      assert.ok(mask?.some((value, i) => i % 4 === 3 && value), `${maskName} missing`);
      for (let i = 0; i < mask.length; i += 4) if (mask[i + 3]) assert.deepEqual([...frame.data.subarray(i, i + 3)], expected);
    }
  }
  await sharp(frame.data, { raw: { width: 112, height: 104, channels: 4 } }).png().toFile(`${output}/${cat.id}.png`);
  await fs.writeFile(`${output}/${cat.id}.json`, JSON.stringify({ ...cat, runtime: 'production sitting renderer' }, null, 2));
  tiles.push(
    { input: await sharp(frame.data, { raw: { width: 112, height: 104, channels: 4 } }).resize(448, 416, { kernel: 'nearest' }).png().toBuffer(), left: index * 448, top: 46 },
    { input: Buffer.from(`<svg width="448" height="46"><text x="10" y="29" font-family="sans-serif" font-size="17" fill="#302b28">${index + 1}. ${cat.label}</text></svg>`), left: index * 448, top: 0 }
  );
}
await sharp({ create: { width: 1344, height: 462, channels: 4, background: '#eee8dd' } }).composite(tiles).png().toFile(`${output}/SITTING_VARIANT_QA.png`);
await fs.writeFile(`${output}/SITTING_VARIANT_QA_REPORT.json`, JSON.stringify({ status: 'PASS', cases: cats.map(cat => ({ id: cat.id, config: cat.config })) }, null, 2));
