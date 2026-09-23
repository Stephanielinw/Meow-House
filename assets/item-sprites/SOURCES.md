# Meeow House item sprite sources

Vendored 2026-09-23 from each creator's official itch.io download flow. Original archives are retained in `source-archives/`; `library/` contains unmodified item PNGs or unmodified source sheets. No art was repainted, recolored, rescaled, or interpolated. The static registry in `js/meeow-item-visuals.js` selects item-like artwork only. Its Shade entries address creator-confirmed 16×16 sheet cells by rectangle; no sheet pixels were modified.

| Pack | Author | Source and official download | License checked | Native assets | Registered | Excluded from registry |
| --- | --- | --- | --- | --- | ---: | --- |
| Idylwild's Inventory | Idylwild | [source page](https://idylwild.itch.io/idylwilds-inventory), official `Idylwild's Inventory.zip` via page download control | CC0-like explicit permission to copy, redistribute, adapt, and use commercially; attribution optional. [Evidence](licenses/idylwild-inventory.txt) | 50 individual 32×32 PNGs, one sheet, one `.ase` | 50 primary | Sheet and `.ase` duplicate the individual art; retained in archive only |
| 100 Assorted Items | Yapi | [source page](https://yapilol.itch.io/100-assorted-items-16x16-pixel), official `100 assorted items - yapilol.itch.io.7z` | Page marks CC0. [Evidence](licenses/yapi-assorted-items.txt) | 100 individual 16×16 PNGs plus 32×32 versions | 53 fallback | 47 less relevant or ambiguous objects and all 32×32 variants; retained in archive |
| Free 16×16 Assorted RPG Icons | Shade / Merchant Shade | [source page](https://merchant-shade.itch.io/16x16-mixed-rpg-icons), official `16x16 Assorted RPG Icons.zip` | Page marks CC0; creator confirms CC0 and 16×16 square grid. [Evidence](licenses/shade-assorted-rpg.txt) | Multiple 16×16-grid sheets | 3 fallback cells | Preview, cave/tavern sheets, armours, weapons, and ambiguous/redundant cells; retained in archive |

Archives SHA-256:

```text
ecf73c5d795eb94e409dc361fad51c78b5c640fe44eb44b13e55e572eecca5de  idylwild-inventory.zip
d3ddc97685b5766c964ddecd8086a57110f07f1a300535acd5802d7898949367  yapi-assorted-items.7z
5b2e700739eeb2636468e891b630064a2ada7cf450118b732a02936e94d60c13  shade-assorted-rpg.zip
```

The archives contain no separate license/readme files. The license evidence files preserve the relevant creator-page terms and URLs as checked at intake.

Deferred, **not downloaded or registered**: [ghostpixxells Free Pixel foods](https://ghostpixxells.itch.io/pixelfood) and [Pixel Mart](https://ghostpixxells.itch.io/pixel-mart). Their pages show CC0 metadata, but the creator states that redistributing the original file is not permitted. That conflict requires creator clarification before repository vendoring.
