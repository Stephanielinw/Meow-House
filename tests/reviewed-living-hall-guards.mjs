import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// This pass intentionally adds the Hall spatial wrapper/controller to the
// production HTML. Keep the reviewed Shop toy bytes as historical evidence;
// require this exact newer HTML before crossing back to that older boundary.
const root = new URL('../', import.meta.url);
const file = 'index.html';
const before = '70b93563c0387cc10bf644c8f9bba8f03ee07bd084d1bc869983106be4b2f6c1';
// The current Hall boundary includes the local ambient pose transition.
// Historical Shop bytes stay frozen.
const after = '4a0f4371d81d045893117f6c85d51b5c3d5c2397a13144ba36b523d87f38b92a';
const newModule = 'js/meeow-hall-spatial.js';
const newModuleHash = '64bc0b776532f33cf80fdf4ea1225ddbdf5daf279b93867aa229c91cdb2b9c1f';

export function reviewedLivingHallHash(candidate, historical) {
    return candidate === file ? after : historical;
}
export function reviewedLivingHallVisualHintReference(row) {
    if (row.file !== file) return row;
    // Hall spatial and ambient insertions shift only source line locations;
    // the reviewed visualHint source text and occurrence counts stay exact.
    return { ...row, line: row.line + (row.line < 12400 ? 72 : row.line < 22540 ? 458 : 472) };
}
export function restoreHistoricalLivingHallHash(hashes) {
    const current = createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
    assert.equal(current, after, 'reviewed Living Hall spatial HTML: ' + file);
    const moduleCurrent = createHash('sha256').update(readFileSync(new URL(newModule, root))).digest('hex');
    assert.equal(moduleCurrent, newModuleHash, 'reviewed Living Hall spatial module: ' + newModule);
    if (Object.hasOwn(hashes, newModule)) {
        assert.equal(hashes[newModule], newModuleHash, 'Living Hall module hash before historical comparison');
        delete hashes[newModule]; // This module did not exist at the historical boundary.
    }
    if (Object.hasOwn(hashes, file)) {
        assert.equal(hashes[file], after, 'Living Hall current hash before historical comparison: ' + file);
        hashes[file] = before;
    }
}
