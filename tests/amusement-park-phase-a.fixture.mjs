import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const normalizationStart = appSource.indexOf('const SKILL_GAME_IDS');
const normalizationEnd = appSource.indexOf('const settings = reactive', normalizationStart);
const slotsStart = appSource.indexOf('const SLOT_BETS');
const skillRoundStart = appSource.indexOf('// --- PROGRAM-OWNED SKILL GAME ROUNDS ---');
const skillRoundEnd = appSource.indexOf('// TETRIS', skillRoundStart);
const matchDeckStart = appSource.indexOf("const ICONS = ['fa-moon'", skillRoundEnd);
const matchDeckEnd = appSource.indexOf('const _updateClickable', matchDeckStart);
assert.ok(normalizationStart >= 0 && normalizationEnd > normalizationStart, 'phone-game normalization helpers must exist');
assert.ok(slotsStart >= 0 && skillRoundStart > slotsStart, 'CatVegas helpers must precede skill-game helpers');
assert.ok(skillRoundEnd > skillRoundStart && matchDeckEnd > matchDeckStart, 'skill game and Match deck helpers must be present');

let persistCalls = 0;
const flavorResolvers = [];
const user = {
    coins: 500,
    phoneData: { games: { stats: {}, rounds: [] }, walletTransactions: [], casino: null }
};
const phoneState = {
    games: { activeGame: null, activeRoundId: '', selectedRoundId: '', flavorLoadingRoundId: '' }
};
const wallet = (type, amount, title, detail, metadata = {}) => {
    const sourceId = String(metadata.sourceId || '');
    const existing = sourceId && user.phoneData.walletTransactions.find(entry => entry.sourceId === sourceId);
    if (existing) return existing;
    const entry = { id: sourceId || `wallet:${Date.now()}`, type, amount: Number(amount) || 0, title, detail, ...(sourceId ? { sourceId } : {}) };
    user.phoneData.walletTransactions.unshift(entry);
    user.coins += type === 'in' ? entry.amount : -entry.amount;
    return entry;
};
const sandbox = {
    Object, Array, String, Number, Math, Date, Map, Set, JSON, Promise, console,
    user, phoneState,
    settings: { apiKey: '' },
    slotState: { todayNet: 0, totalSpins: 0 },
    tetrisState: { score: 0 }, mergeState: { score: 0 }, matchState: { score: 0 },
    reactive: value => value,
    computed: getter => ({ get value() { return getter(); } }),
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    persistNow: () => { persistCalls += 1; },
    addWalletTransaction: wallet,
    getCurrentTimeStr: () => '12:00',
    getOperationalDayKey: () => '2026-09-01',
    showToast: () => {},
    ThinkingLevel: { LOW: 'low' },
    parseAIJSON: value => JSON.parse(value),
    callAI: () => new Promise(resolve => { flavorResolvers.push(resolve); }),
    cancelAnimationFrame: () => {}, clearTimeout: () => {}, setTimeout,
    window: { setTimeout },
    globalThis: null
};
sandbox.globalThis = sandbox;
vm.runInNewContext(`${appSource.slice(normalizationStart, normalizationEnd)}
${appSource.slice(slotsStart, skillRoundEnd)}
${appSource.slice(matchDeckStart, matchDeckEnd)}
globalThis.park = {
  normalizePhoneGamesData, getSkillGameReward, isMeaningfulSkillGameRound,
  makeSkillGameRoundId, freezeSkillGameTerminalRound, claimSkillGameRound,
  getSkillGameRound, getPhoneGamesData, requestSkillGameRoundFlavor,
  buildMatchDeck, syncSlots, persistSlots, getResolvedSlotSnapshot, collectSlotWin, slotState
};`, sandbox, { filename: 'index.html:amusement-park-phase-a' });
const park = sandbox.park;

// Legacy and malformed phone-game state safely normalizes to a bounded, complete shape.
user.phoneData.games = { stats: { tetris: { plays: -1 } }, rounds: [{ roundId: '', gameId: 'tetris' }] };
park.normalizePhoneGamesData(user.phoneData);
for (const gameId of ['tetris', 'merge', 'match']) {
    const stats = user.phoneData.games.stats[gameId];
    assert.equal(stats.plays, 0);
    assert.equal(stats.losses, 0);
    assert.equal(stats.abandons, 0);
    assert.equal(stats.bestScore, 0);
}
assert.equal(user.phoneData.games.rounds.length, 0);
assert.notEqual(park.makeSkillGameRoundId('tetris'), park.makeSkillGameRoundId('tetris'), 'each skill run receives a distinct round ID');

// Floors and reward bands are program-owned; an intentional immediate loss cannot farm gold or a record bonus.
assert.equal(park.isMeaningfulSkillGameRound('tetris', 99), false);
assert.equal(park.isMeaningfulSkillGameRound('merge', 15), false);
assert.equal(park.isMeaningfulSkillGameRound('match', 29), false);
const trivialTetrisReward = park.getSkillGameReward({ gameId: 'tetris', status: 'lost', score: 0, isNewBest: true });
assert.equal(trivialTetrisReward.gold, 0);
assert.equal(trivialTetrisReward.reason, '本局尚未达到参与奖励门槛');
assert.equal(park.getSkillGameReward({ gameId: 'tetris', status: 'lost', score: 100, isNewBest: false }).gold, 5);
assert.equal(park.getSkillGameReward({ gameId: 'tetris', status: 'lost', score: 300, isNewBest: false }).gold, 10);
assert.equal(park.getSkillGameReward({ gameId: 'tetris', status: 'lost', score: 800, isNewBest: false }).gold, 15);
assert.equal(park.getSkillGameReward({ gameId: 'merge', status: 'lost', score: 16, isNewBest: false }).gold, 5);
assert.equal(park.getSkillGameReward({ gameId: 'match', status: 'lost', score: 30, isNewBest: false }).gold, 5);
assert.equal(park.getSkillGameReward({ gameId: 'match', status: 'lost', score: 180, isNewBest: false }).gold, 10);
assert.equal(park.getSkillGameReward({ gameId: 'match', status: 'won', score: 420, isNewBest: false }).gold, 30);
assert.equal(park.getSkillGameReward({ gameId: 'tetris', status: 'lost', score: 100, isNewBest: true }).gold, 15);

const activate = (gameId, roundId) => {
    phoneState.games.activeGame = gameId;
    phoneState.games.activeRoundId = roundId;
    phoneState.games.selectedRoundId = '';
};

// First terminal freeze is the only stats mutation; duplicate terminal callbacks and reload reconciliation reuse it.
activate('tetris', 'round-tetris-1');
const first = park.freezeSkillGameTerminalRound('tetris', 'lost', 100);
assert.ok(first);
assert.equal(first.reward.gold, 15, 'meaningful new best gets the fixed loss + record reward');
assert.equal(user.phoneData.games.stats.tetris.plays, 1);
assert.equal(user.phoneData.games.stats.tetris.losses, 1);
assert.equal(user.phoneData.games.stats.tetris.bestScore, 100);
const afterFirstStats = JSON.stringify(user.phoneData.games.stats.tetris);
activate('tetris', 'round-tetris-1');
assert.equal(park.freezeSkillGameTerminalRound('tetris', 'lost', 999), first, 'duplicate callback returns frozen terminal record');
assert.equal(JSON.stringify(user.phoneData.games.stats.tetris), afterFirstStats, 'duplicate terminal callback cannot update stats');
park.normalizePhoneGamesData(user.phoneData);
activate('tetris', 'round-tetris-1');
const reloadedFirst = park.freezeSkillGameTerminalRound('tetris', 'lost', 999);
assert.equal(reloadedFirst?.score, 100, 'reload reconciliation keeps the original score');
assert.equal(reloadedFirst?.reward.gold, 15, 'reload reconciliation keeps the frozen reward');
assert.equal(JSON.stringify(user.phoneData.games.stats.tetris), afterFirstStats, 'reload reconciliation cannot apply stats a second time');

// Rewards are frozen before the true claim. The stable ledger source makes the claim exactly once across reloads.
const coinsBeforeClaim = user.coins;
assert.equal(reloadedFirst.claimedAt, '');
park.claimSkillGameRound(reloadedFirst.roundId);
assert.equal(user.coins, coinsBeforeClaim + 15);
assert.ok(reloadedFirst.claimedAt);
assert.equal(user.phoneData.walletTransactions.filter(entry => entry.sourceId === `game-round:${reloadedFirst.roundId}`).length, 1);
park.claimSkillGameRound(reloadedFirst.roundId);
assert.equal(user.coins, coinsBeforeClaim + 15, 'duplicate claim cannot duplicate wallet credit');
assert.equal(user.phoneData.walletTransactions.filter(entry => entry.sourceId === `game-round:${reloadedFirst.roundId}`).length, 1);

activate('merge', 'round-merge-abandon');
const abandoned = park.freezeSkillGameTerminalRound('merge', 'abandoned', 200);
assert.equal(abandoned.reward.gold, 0);
assert.equal(abandoned.claimedAt, '');
assert.equal(abandoned.flavor.status, 'local');
assert.equal(user.phoneData.games.stats.merge.plays, 1);
assert.equal(user.phoneData.games.stats.merge.abandons, 1);

// AI flavor is explicitly non-authoritative and is scoped to the frozen round ID, never the currently selected card.
sandbox.settings.apiKey = 'configured';
activate('match', 'round-flavor-a');
const roundA = park.freezeSkillGameTerminalRound('match', 'lost', 30);
const roundARewardBeforeFlavor = roundA.reward.gold;
activate('match', 'round-flavor-b');
const roundB = park.freezeSkillGameTerminalRound('match', 'lost', 30);
phoneState.games.selectedRoundId = roundB.roundId;
assert.equal(flavorResolvers.length, 2, 'terminal flavor uses the existing one optional request path per finished round');
flavorResolvers[0]('{"comment":"Round A only."}');
await new Promise(resolve => setImmediate(resolve));
assert.equal(park.getSkillGameRound(roundA.roundId).flavor.comment, 'Round A only.');
assert.notEqual(park.getSkillGameRound(roundB.roundId).flavor.comment, 'Round A only.', 'late Round A flavor cannot bleed onto Round B');
assert.equal(roundA.reward.gold, roundARewardBeforeFlavor, 'flavor cannot alter frozen rewards');

// Match deck arithmetic is triple-compatible. This makes the clear branch reachable, without claiming every layout is solvable.
const deck = park.buildMatchDeck();
assert.equal(deck.length, 42);
const deckCounts = Object.values(deck.reduce((counts, icon) => ({ ...counts, [icon]: (counts[icon] || 0) + 1 }), {}));
assert.ok(deckCounts.every(count => count % 3 === 0), 'every Match icon count is divisible by three');
const reachableMatchWin = park.getSkillGameReward({ gameId: 'match', status: 'won', score: 420, isNewBest: true });
assert.equal(reachableMatchWin.gold, 40);

// Frozen CatVegas post-spin state restores direct authority and never needs a payout recomputation.
user.phoneData.casino = {
    history: [], totalSpins: 7, todayNet: 18, lastDay: '2026-09-01',
    resolvedSnapshot: { spinId: 'catvegas:resolved', pendingWin: 75, freeSpins: 2, gambleCount: 1, combo: 3, lastPayout: 75, message: '冻结派彩', resolvedAt: '2026-09-01T12:00:00.000Z' }
};
park.syncSlots();
assert.equal(park.slotState.spinId, 'catvegas:resolved');
assert.equal(park.slotState.pendingWin, 75);
assert.equal(park.slotState.combo, 3);
assert.equal(park.getResolvedSlotSnapshot().pendingWin, 75);
const coinsBeforeCasinoCollect = user.coins;
park.collectSlotWin();
assert.equal(user.coins, coinsBeforeCasinoCollect + 75);
assert.equal(user.phoneData.casino.resolvedSnapshot, null, 'collect clears only the resolved pending-payout snapshot');

// Static integration guards: authority stays program-owned, with no generated inventory/world mutation.
const gameSource = appSource.slice(skillRoundStart, matchDeckEnd);
assert.match(gameSource, /sourceId = `game-round:\$\{round\.roundId\}`/);
assert.match(gameSource, /storedRound = getSkillGameRound\(roundId\)/);
assert.doesNotMatch(gameSource, /item_name|gold_reward|user\.inventory|cats\.value|awayEpisodes|lifeThreads/);
assert.match(appSource, /const buildMatchDeck = \(\) =>/);
assert.match(appSource, /six icons × six copies/); // Documents the deliberately limited, triple-compatible objective.
assert.match(appSource, /matchState\.tiles\.length === 0\) finishSkillGame\('match', 'won'/, 'the valid Match clear branch remains reachable');
assert.match(appSource, /resolvedSnapshot: slotState\.isSpinning/);
assert.match(appSource, /park-result-card/);
assert.match(appSource, /park-tetris-canvas/);
assert.match(appSource, /park-match-tile/);
assert.equal((appSource.match(/callAI\s*\(/g) || []).length, 40, 'Phase A must add no callAI site');
assert.ok(persistCalls > 0, 'terminal, claim, and flavor changes persist through the existing path');

console.log(JSON.stringify({
    fixture: 'amusement-park-phase-a', status: 'PASS',
    checks: ['terminal-idempotency', 'meaningful-loss-floor', 'true-claim', 'wallet-source-dedupe', 'reload-recovery', 'round-scoped-flavor', 'match-triple-compatibility', 'catvegas-frozen-snapshot', 'no-world-mutation']
}));
