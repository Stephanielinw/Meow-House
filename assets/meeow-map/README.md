# Meeow House room maps

> The older layout notes below are historical. For current Dining/Dorm source
> authority and regeneration, use the hybrid contract at the end of this file.

The 小猫宿舍 is now a layered 1024 × 1024 scene under `dorm/`, rather than a
single flattened background. Its order is:

1. `background.png`
2. floor furniture: `carpet.png`, `cushion-a.png`, `cushion-b.png`
3. cat markers
4. `window.png`, `cat-climber.png`, `shelf.png`, `cat-house.png`

This lets foreground furniture naturally cover part of a cat when their map
positions overlap. `Overview.png` remains the Photoshop layout reference and
is intentionally not loaded by the app.

The other four rooms still accept a single shared background at these paths:

- `living.png` — 客厅
- `dining.png` — 餐厅
- `litter.png` — 猫砂间
- `bath.png` — 浴室

Each file must be a `1024 × 1024 px` PNG in sRGB, with no cats, captions, status labels, or UI text. Use a 16 px pixel grid (64 × 64 cells). Keep walls and upper furniture in the top 0–255 px; draw walkable floor and furniture below it.

The dorm uses its own 72 px cat markers, with each marker's **feet** locked to the
furniture anchors in `DORM_CAT_ANCHORS` in `index.html`. Its old placeholder
coordinates below are no longer used. For the other four rooms, cats are rendered
as 64 × 64 px sprites centred on their anchor; leave at least 96 × 96 px clear
around each one.

| Room | Area | Centre |
| --- | --- | --- |
| dorm | 分层家具落脚点 | 见 `DORM_CAT_ANCHORS`（1024 × 1024 原画坐标） |
| living | 沙发 / 玩具区 / 抓板 / 地毯 / 书架 | 215,455 / 790,455 / 175,835 / 505,735 / 850,785 |
| dining | 猫粮柜 / 食盆 / 水碗 / 零食架 / 餐桌边 | 175,430 / 425,720 / 745,620 / 845,430 / 250,835 |
| litter | 猫砂盆 A / 猫砂盆 B / 除味区 / 清洁柜 / 等候垫 | 220,520 / 735,520 / 510,425 / 175,840 / 805,835 |
| bath | 洗手台 / 浴盆 / 吹干区 / 毛巾架 / 洗衣篮 | 180,435 / 770,455 / 505,675 / 170,835 / 845,840 |

The current CSS grid remains a visible placeholder for rooms without artwork.

## Dining / Dorm hybrid authority — current contract

These rooms have three authority layers. A base generator is not a complete
room generator and must never replace the current formal configuration.

### A. Historical generated base

The canonical Git versions of `dining/authoring/room-source.json` and
`dorm/authoring/room-source.json`, their `reference.png` and
`annotation-baseline.png`, the committed room art, and canonical cat support
inputs feed `tests/normal-room-spatial-v1.fixture.py`.

| Historical input | Git blob | SHA-256 |
| --- | --- | --- |
| Dining source | `eb1697f9003723fd3c1003fdbeacc59e90d58c8d` | `946403297dea6c9a037019832ce6a310a1a6b8db9cbd4a9ccec7810ab96b2811` |
| Dorm source | `4b55559b6fab4bc514129ebfdb730c09f3bb55aa` | `83cf9427d6e4540f147b77ce9d1a9991eaa33486872458b77c0e21b948c60edb` |
| Base generator | `979f3d6584c5bdc159ff9506725b176020562368` | `40878b36cc8178b8d5b974c27125d3ccebe2f9517b0742c4a0b355fb1e8dd424` |

The generator reuses `tests/curator-room-native-spatial-foundation-v1.fixture.py`.
Dining has 14 canonical base masks; Dorm has 19. Composition previews are not
required runtime output. Local same-path authoring or generator modifications
remain unpromoted WIP; only the committed historical versions are base authority.

### B. Deterministic solid geometry

Committed room-layer alpha >= 128 defines each solid mask. Per-column maximum
solid Y + 1 defines `solidFrontEdges`; solid pixel totals define corresponding
`maskCounts`. Dining has 10 solid masks; Dorm has 6. No navigation coordinates or
furniture design are inferred by this rule.

### C. Formal artifact authority

**Committed `dining/spatial/room-spatial.json` and
`dorm/spatial/room-spatial.json` are canonical authority for promoted layers.**
Preserve complete `furnitureInteractions` (authored routes, approach/exit points,
traversal metadata and saved presentation solutions), `presentationClearance`
(including `groundSolidLayers`, surface allowances and entry-mask selection),
`layerDepth` (including Dining chair-b = 829), `foregroundRelations`,
`disabledInteractions` and `groundForeground` where present.

The generated base is recorded in recovery checkpoint `8ac0c11`, together with
the promoted route/clearance data. Historical traversal reports describe authored
routes and resolver solutions saved into formal metadata; Dining's 8 and Dorm's
6 saved solutions match that promotion evidence. Commit `bd09251` explicitly adds
ground-solid classifications and the Dining chair-b depth correction; its tests
lock the intended composition. Base regeneration cannot recreate these layers.

### Safe verification and promotion

Run `python3 tools/check_room_hybrid_authority.py --ref HEAD` using the existing
Python environment with NumPy and Pillow. Use `--index` to check an intentionally
staged candidate. The verifier reads Git snapshot inputs, runs the exact legacy
builder only in a disposable temporary directory, checks base and solid bytes,
and confirms that raw base output is rejected as a complete formal replacement.
It never merges, repairs, promotes or overwrites formal configuration. Its formal
fingerprints are review guards, not a new source authority.

For a full room candidate, also run
`python3 tools/check_room_hybrid_authority.py --candidate-root /path/to/candidate`.
Changed or deleted Layer C data returns nonzero. This is a promotion gate, not an
interceptor for bypassed writes: **do not run the legacy builder's `--write` in a
formal working tree**. Its ordinary full-config comparison is not the hybrid
verification command and will reject the intentionally richer formal config.

Future authoring changes become canonical only through explicit approval and a
narrow source/tool/runtime checkpoint. Deliberate Layer C changes require review
and an explicit guard-baseline update; never update fingerprints automatically
or silently promote local WIP. Retain the historical source hashes as provenance.
