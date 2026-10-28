# Meeow House room maps

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
