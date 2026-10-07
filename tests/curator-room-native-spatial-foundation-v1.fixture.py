"""Rebuild or verify the Curator Room's authored spatial source.

Run with the bundled Python/Pillow/NumPy runtime. --write creates derivatives;
the default mode verifies them without changing files. No runtime code imports it.
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "assets/meeow-map/curator"
SOURCE = PACKAGE / "source"
SPATIAL = PACKAGE / "spatial"
QA = ROOT / "assets/meeow-item-source/QA/living-hall-curator-room-native-spatial-foundation-v1"
SIZE = (1024, 1024)
SOURCE_FILES = ["Background.png", "bed.png", "cabin.png", "carpet.png", "chair.png",
                "closet.png", "Table.png", "window.png", "Overview.png", "reference.png"]
LAYER_ORDER = ["Background.png", "window.png", "cabin.png", "bed.png", "closet.png",
               "carpet.png", "Table.png", "chair.png"]
SURFACE_DEFINITIONS = [
    ("curator-bed-surface", "bed.png", "bed", "furniture-level", "requires-future-transition", "high",
     [(15, 223, 370, 560)], "Painted bedding overlaps the bed layer; bed is in front of the cabinet in Overview."),
    ("curator-rug-surface", "carpet.png", "floor-soft", "floor-level", "direct-floor-continuous", "high",
     [(27, 726, 433, 919)], "Red lies on the floor-layer carpet, surrounded by black ground across its decorative edge."),
    ("curator-desk-top", "Table.png", "tabletop", "furniture-level", "requires-future-transition", "high",
     [(484, 655, 989, 757)], "One broad painted desktop spans around books and plant and overlaps the Table layer."),
    ("curator-wardrobe-top", "closet.png", "wardrobe-top", "elevated", "requires-future-transition", "high",
     [(650, 50, 1015, 113)], "Paint covers the wardrobe roof in the closet layer, including one connected edge band."),
    ("curator-chair-seat", "chair.png", "seat", "furniture-level", "requires-future-transition", "medium-high",
     [(634, 814, 724, 883), (594, 826, 616, 875), (747, 826, 768, 873)],
     "Three red islands overlap the chair cushion/body; purple selects its approved foreground frame."),
    ("curator-bedside-cabinet-top", "cabin.png", "cabinet-top", "furniture-level", "requires-future-transition", "high",
     [(343, 291, 490, 333)], "Painted top wraps around lamp and plant on the cabinet layer."),
    ("curator-window-ledge", "window.png", "window-ledge", "elevated", "requires-future-transition", "medium-high",
     [(483, 258, 577, 278), (417, 262, 437, 277)],
     "Two painted ledge islands are interrupted by the plant; both overlap the window layer. The smaller also overlaps cabinet art."),
]
PALETTE = {
    "black": "R,G,B <= 8 and max channel delta from Overview >= 24",
    "red": "R >= 245, G <= 18, B <= 22 and max channel delta from Overview >= 40",
    "purple": "165 <= R <= 190, 65 <= G <= 105, B >= 240 and max channel delta from Overview >= 40",
    "coreColors": {"black": [[0, 0, 0]], "red": [[255, 0, 0], [255, 0, 4]],
                   "purple": [[177, 83, 255]]},
    "note": "Rules accept narrow near-colors only; comparison to the exact Overview rejects unchanged room art. Ambiguous blended boundary pixels outside these tolerances remain unauthorized."
}
COLORS = {
    "curator-bed-surface": (255, 49, 55),
    "curator-rug-surface": (255, 155, 36),
    "curator-desk-top": (49, 202, 127),
    "curator-wardrobe-top": (75, 147, 255),
    "curator-chair-seat": (255, 221, 51),
    "curator-bedside-cabinet-top": (255, 90, 190),
    "curator-window-ledge": (102, 220, 236),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bounds(mask: np.ndarray) -> list[int] | None:
    yy, xx = np.where(mask)
    if not len(xx):
        return None
    return [int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)]


def connected_components(mask: np.ndarray) -> list[dict]:
    """8-connected analysis of painted pixels; no dilation or route inference."""
    height, width = mask.shape
    pixels = mask.ravel()
    seen = bytearray(height * width)
    result = []
    for candidate in np.flatnonzero(pixels):
        start = int(candidate)
        if seen[start]:
            continue
        seen[start] = 1
        queue = deque([start])
        cells = []
        while queue:
            pos = queue.popleft()
            cells.append(pos)
            y, x = divmod(pos, width)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        nxt = ny * width + nx
                        if pixels[nxt] and not seen[nxt]:
                            seen[nxt] = 1
                            queue.append(nxt)
        ys, xs = np.divmod(np.asarray(cells, dtype=np.int32), width)
        result.append({"pixels": len(cells), "bounds": [int(xs.min()), int(ys.min()),
                       int(xs.max() + 1), int(ys.max() + 1)], "cells": cells})
    return sorted(result, key=lambda entry: entry["pixels"], reverse=True)


def mask_image(mask: np.ndarray) -> Image.Image:
    return Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L")


def overlay(base: Image.Image, masks: list[tuple[np.ndarray, tuple[int, int, int]]]) -> Image.Image:
    image = base.convert("RGB")
    for mask, color in masks:
        colored = Image.new("RGB", SIZE, color)
        alpha = Image.fromarray(np.where(mask, 160, 0).astype(np.uint8), "L")
        image.paste(colored, (0, 0), alpha)
    return image


def report(name: str, body: str, write: bool) -> None:
    target = QA / (name + ".txt")
    content = body.strip() + "\n"
    if write:
        if not target.exists() or target.read_text() != content:
            target.write_text(content)
    else:
        assert target.read_text() == content, f"stale report: {name}"


def image(target: Path, expected: Image.Image, write: bool) -> None:
    if write:
        if target.exists():
            actual = Image.open(target)
            if actual.size == expected.size and actual.mode == expected.mode and np.array_equal(np.asarray(actual), np.asarray(expected)):
                return
        target.parent.mkdir(parents=True, exist_ok=True)
        expected.save(target, format="PNG")
    else:
        actual = Image.open(target)
        assert actual.size == expected.size and actual.mode == expected.mode, f"image shape: {target}"
        assert np.array_equal(np.asarray(actual), np.asarray(expected)), f"image mismatch: {target}"


def main(write: bool) -> None:
    if write:
        SPATIAL.mkdir(parents=True, exist_ok=True)
        QA.mkdir(parents=True, exist_ok=True)
    loaded = {}
    asset_records = []
    for name in SOURCE_FILES:
        target = SOURCE / name
        assert target.is_file(), f"missing user art: {name}"
        current = Image.open(target)
        assert current.size == SIZE, f"wrong size: {name}"
        loaded[name] = current
        asset_records.append({"filename": name, "width": current.width, "height": current.height,
                              "mode": current.mode, "transparent": "A" in current.getbands(),
                              "nontransparentBounds": list(current.getbbox()) if "A" in current.getbands() else None,
                              "sha256": sha256(target)})
    composite = loaded["Background.png"].convert("RGBA")
    for name in LAYER_ORDER[1:]:
        composite = Image.alpha_composite(composite, loaded[name].convert("RGBA"))
    composite = composite.convert("RGB")
    overview = loaded["Overview.png"].convert("RGB")
    assert np.array_equal(np.asarray(composite), np.asarray(overview)), "layer order does not reproduce Overview"

    reference = np.asarray(loaded["reference.png"].convert("RGB"), dtype=np.int16)
    original = np.asarray(overview, dtype=np.int16)
    r, g, b = reference[:, :, 0], reference[:, :, 1], reference[:, :, 2]
    delta = np.max(np.abs(reference - original), axis=2)
    floor = (r <= 8) & (g <= 8) & (b <= 8) & (delta >= 24)
    red = (r >= 245) & (g <= 18) & (b <= 22) & (delta >= 40)
    purple = (r >= 165) & (r <= 190) & (g >= 65) & (g <= 105) & (b >= 240) & (delta >= 40)
    assert not np.any((floor & red) | (floor & purple) | (red & purple))
    assert np.all(delta[floor | red | purple] > 0), "unchanged room art was captured"
    assert (int(floor.sum()), int(red.sum()), int(purple.sum())) == (340122, 235220, 19949)
    floor_components = connected_components(floor)
    red_components = connected_components(red)
    purple_components = connected_components(purple)
    assert len(floor_components) == 3
    assert len(red_components) == 10
    assert len(purple_components) == 1

    masks = {}
    surface_records = []
    assigned_components = set()
    alpha_layers = {name: np.asarray(loaded[name].convert("RGBA"))[:, :, 3] > 0
                    for name in ["bed.png", "cabin.png", "carpet.png", "chair.png",
                                 "closet.png", "Table.png", "window.png"]}
    for sid, owner, semantic, elevation, connectivity, confidence, boxes, evidence in SURFACE_DEFINITIONS:
        matched = []
        for box in boxes:
            found = [i for i, component in enumerate(red_components) if component["bounds"] == list(box)]
            assert len(found) == 1, f"red ownership changed: {sid} {box}"
            index = found[0]
            assert index not in assigned_components
            assigned_components.add(index)
            matched.append(red_components[index])
        owned = np.zeros((1024, 1024), dtype=bool)
        for component in matched:
            owned.ravel()[component["cells"]] = True
        assert np.all(owned <= red)
        overlap = int((owned & alpha_layers[owner]).sum())
        assert overlap >= int(owned.sum() * 0.98), f"weak owner overlap: {sid}"
        masks[sid] = owned
        record = {"surfaceId": sid, "ownerLayer": owner, "semanticClass": semantic,
                  "source": "reference.png:red", "mask": f"spatial/{sid}.png",
                  "bounds": bounds(owned), "pixelCount": int(owned.sum()),
                  "connectedComponents": [{"pixels": item["pixels"], "bounds": item["bounds"]} for item in matched],
                  "elevationRelation": elevation, "currentConnectivity": connectivity,
                  "confidence": confidence, "ownerAlphaOverlapPixels": overlap, "evidence": evidence}
        surface_records.append(record)
    assert len(assigned_components) == len(red_components), "unresolved red component requires explicit audit"
    assert np.array_equal(np.logical_or.reduce(list(masks.values())), red)
    assert sum(record["pixelCount"] for record in surface_records) == int(red.sum())

    purple_overlap_chair = int((purple & alpha_layers["chair.png"]).sum())
    assert purple_overlap_chair >= int(purple.sum() * .99)
    occlusion = {"source": "reference.png:purple", "mask": "spatial/occlusion-candidate.png",
                 "pixelCount": int(purple.sum()), "bounds": bounds(purple),
                 "ownerLayer": "chair.png", "portion": "approved chair back / foreground frame and downward members",
                 "ownerAlphaOverlapPixels": purple_overlap_chair,
                 "relatedSurfaceIds": ["curator-chair-seat"],
                 "mayOcclude": "real chair pixels selected by purple may cover an authorized chair-seat resident",
                 "runtimeClippingEnabled": False,
                 "components": [{"pixels": item["pixels"], "bounds": item["bounds"]} for item in purple_components]}
    source = {"schemaVersion": 1, "roomId": "curator-room", "displayName": "馆长室",
              "scope": "spatial source only; no runtime admission or save integration",
              "assetBase": "assets/meeow-map/curator",
              "sourceAssetsDirectory": "source",
              "canonicalSize": {"width": 1024, "height": 1024},
              "layerOrder": LAYER_ORDER, "sourceAssets": asset_records,
              "palette": PALETTE,
              "floorWalkable": {"source": "reference.png:black", "mask": "spatial/floor-walkable.png",
                                "pixelCount": int(floor.sum()), "bounds": bounds(floor),
                                "components": [{"pixels": item["pixels"], "bounds": item["bounds"]} for item in floor_components]},
              "interactiveWalkableSurfaces": surface_records,
              "occlusionCandidate": occlusion,
              "entryPoints": [], "transitions": [], "behaviorAffordances": [],
              "obstacleMap": None}
    metadata = SPATIAL / "curator-room-spatial-source.json"
    # Interaction authoring lives in this source; geometry regeneration must
    # preserve it. The production navigation contract validates its coordinates.
    if metadata.exists():
        existing = json.loads(metadata.read_text())
        source["occlusionCandidate"]["runtimeClippingEnabled"] = existing.get("occlusionCandidate", {}).get("runtimeClippingEnabled", False)
        authored = existing.get("furnitureInteractions")
        if authored is not None:
            source["furnitureInteractions"] = authored
    source_json = json.dumps(source, ensure_ascii=False, indent=2) + "\n"
    if write:
        metadata.write_text(source_json)
    else:
        assert metadata.read_text() == source_json, "stale spatial metadata"

    image(SPATIAL / "floor-walkable.png", mask_image(floor), write)
    image(SPATIAL / "all-red-authored.png", mask_image(red), write)
    image(SPATIAL / "occlusion-candidate.png", mask_image(purple), write)
    for sid, mask in masks.items():
        image(SPATIAL / (sid + ".png"), mask_image(mask), write)
    image(QA / "01-layered-curator-room-composite.png", composite, write)
    compare = Image.new("RGB", (2048, 1024))
    compare.paste(composite, (0, 0)); compare.paste(overview, (1024, 0))
    image(QA / "02-composite-vs-overview.png", compare, write)
    image(QA / "03-black-floor-mask.png", mask_image(floor), write)
    image(QA / "04-all-red-mask.png", mask_image(red), write)
    separated = Image.new("RGB", (4096, 2048), (31, 28, 33))
    draw = ImageDraw.Draw(separated)
    for index, (sid, mask) in enumerate(masks.items()):
        x, y = (index % 4) * 1024, (index // 4) * 1024
        tile = Image.new("RGB", SIZE, (0, 0, 0))
        tile.paste(COLORS[sid], mask=mask_image(mask))
        separated.paste(tile, (x, y))
        draw.text((x + 15, y + 15), sid, fill=(255, 255, 255))
    image(QA / "05-red-logical-surfaces-separated.png", separated, write)
    image(QA / "06-red-surface-ownership-overlay.png",
          overlay(composite, [(mask, COLORS[sid]) for sid, mask in masks.items()]), write)
    image(QA / "07-purple-occlusion-mask.png", mask_image(purple), write)
    image(QA / "08-combined-semantic-overlay.png",
          overlay(composite, [(floor, (20, 155, 235))] +
                  [(mask, COLORS[sid]) for sid, mask in masks.items()] +
                  [(purple, (194, 60, 255))]), write)

    floor_summary = "\n".join(f"- {i + 1}: {entry['pixels']} pixels; bounds {entry['bounds']}"
                              for i, entry in enumerate(floor_components))
    surface_table = "\n".join(
        f"- {item['surfaceId']} | {item['ownerLayer']} | {item['semanticClass']} | "
        f"bounds {item['bounds']} | {item['pixelCount']} px | "
        f"{len(item['connectedComponents'])} painted components | {item['elevationRelation']} | "
        f"{item['currentConnectivity']} | confidence {item['confidence']} | "
        f"owner-alpha overlap {item['ownerAlphaOverlapPixels']} px | {item['evidence']}"
        for item in surface_records)
    palette_summary = (f"Core annotation colors: {PALETTE['coreColors']}.\n"
                       f"BLACK rule: {PALETTE['black']}.\nRED rule: {PALETTE['red']}.\n"
                       f"PURPLE rule: {PALETTE['purple']}.\n"
                       f"Counts: BLACK {int(floor.sum())}; RED {int(red.sum())}; PURPLE {int(purple.sum())}.\n"
                       "Masks are mutually disjoint. Every accepted pixel differs from exact Overview. "
                       "Thresholds reject unmarked art, including orange wood, dark outlines, green fabric, and plants. "
                       "Ambiguous antialiased blend pixels outside narrow rules remain unauthorized; no dilation was used.")
    report("asset-audit", "CURATOR ROOM / 馆长室 SOURCE ASSETS\nAll ten are full-canvas 1024x1024; original copies match user files byte-for-byte at ingestion.\n" +
           "\n".join(f"- {x['filename']}: {x['width']}x{x['height']}, {x['mode']}, transparency={x['transparent']}, "
                     f"nontransparent bounds={x['nontransparentBounds']}, SHA256={x['sha256']}" for x in asset_records) +
           "\nThese files are source authority. Neither art nor reference was cropped, rescaled, or recolored.", write)
    report("curator-room-layer-composition-audit", "COMPOSITION\nOrder back to front: " + " -> ".join(LAYER_ORDER) +
           "\nAlpha composite at original coordinates equals Overview.png exactly: 0 differing pixels. "
           "Putting bed behind cabin or chair behind desk creates visible differences. QA images 01 and 02 are full-resolution.", write)
    report("reference-palette-audit", "REFERENCE PALETTE / EXTRACTION\n" + palette_summary +
           "\nOverview is the pixel-perfect unannotated baseline. BLACK/RED/PURPLE paint is source semantics; "
           "nonmatching colors never gain spatial authority.", write)
    report("black-floor-mask-audit", "BLACK FLOOR-WALKABLE SOURCE\n" +
           f"Pixels: {int(floor.sum())}; bounds {bounds(floor)}; 8-connected components: {len(floor_components)}.\n" + floor_summary +
           "\nThe large ground component threads around bed, rug, desk and chair. A separate narrow left strip "
           "at x<38/y337-565 is not connected under the authored mask; a six-pixel edge fragment is also isolated. "
           "Potential bottlenecks around bed/rug and desk/chair need future clearance QA. No erosion, dilation, "
           "body radius, pathfinding, destination or obstacle inference is applied. Black means legal foot point only.", write)
    report("red-surface-segmentation-audit", "RED AUTHORING SEGMENTATION\n" +
           f"Exact red mask: {int(red.sum())} accepted pixels, {len(red_components)} 8-connected painted components. "
           f"Mapped to {len(surface_records)} logical surfaces without changing any pixel.\n" +
           "\n".join(f"- component {i + 1}: {c['pixels']} px; bounds {c['bounds']}"
                     for i, c in enumerate(red_components)) +
           "\nWindow ledge has two islands around the plant; chair seat has three islands around its frame. "
           "All ten meaningful components are assigned. Components are not used as one-to-one surface authority.", write)
    report("red-surface-ownership-audit", "RED LOGICAL SURFACE OWNERSHIP\n" + surface_table +
           "\nUnresolved ownership: 0. Each assigned mask has >=98% overlap with its independently inspected owner layer. "
           "The small window-ledged island also intersects cabinet alpha, but its coordinate, painted plane, "
           "Overview alignment and window-layer overlap support window ownership. Names were assigned after layer evidence.", write)
    report("red-surface-semantic-classification", "RED SURFACE SEMANTICS\n" + surface_table +
           "\nThese classes describe physical surfaces, not behavior affordances or numeric heights. "
           "The carpet is floor-level even though it is red. No sleep, sit, observe, inspect, play, work, or use-furniture action is granted.", write)
    report("red-surface-connectivity-readiness", "RED CONNECTIVITY READINESS\n" +
           "\n".join(f"- {x['surfaceId']}: {x['currentConnectivity']}; "
                     f"future transition likely {'NO' if x['currentConnectivity'] == 'direct-floor-continuous' else 'YES'}"
                     for x in surface_records) +
           "\nOnly the floor-layer rug is visibly continuous with painted ground. Furniture masks touching black "
           "do not establish reachability. No approach anchor, edge, spawn, entrance, or movement rule is authored.", write)
    report("purple-occlusion-ownership-audit", "PURPLE OCCLUSION CANDIDATE\n" +
           f"Pixels: {int(purple.sum())}; bounds {bounds(purple)}; components: {len(purple_components)}. "
           f"Chair layer overlap: {purple_overlap_chair}/{int(purple.sum())}.\n" +
           "Approved purple follows the chair back/frame and downward foreground members. Original chair pixels may cover a resident at the chair seat "
           "during its authorized interaction. Purple is presentation metadata only; it never grants walkability or world occupancy.", write)
    report("curator-room-spatial-source-contract", "MACHINE-READABLE CURATOR ROOM SOURCE\n" +
           "assets/meeow-map/curator/spatial/curator-room-spatial-source.json describes canonical 1024x1024, "
           "source hashes, exact floor and per-surface masks, classes, owners, bounds, components, confidence, "
           "connectivity and purple candidate. Full-canvas PNG masks preserve authored geometry. "
           "Original reference.png remains in curator/source and is not production-visible. "
           "This package is not registered with Hall simulation; no entry point, transition, obstacle map, POI or behavior is created.", write)
    report("future-position-semantics", "FUTURE SPATIAL POSITION (DOCUMENT ONLY)\n" +
           "A later resident position may carry room=curator-room, surface=floor or one of the seven authored "
           "surface IDs, and a canonical foot x,y. This is distinct from current curatorRoomPresence.anchor and "
           "structured Status posture. No save/Status migration or runtime projection is included. "
           "Accepted higher-authority presence and Status events must retain precedence.", write)
    report("future-navigation-readiness", "FUTURE NAVIGATION CONTRACT (DOCUMENT ONLY)\n" +
           "Behavior intent -> destination surface/position -> planner -> continuous legal route -> movement -> "
           "settled spatial state. Black authorizes ordinary foot positions but has disconnected fragments and "
           "unknown cat clearance. Rug is direct floor-continuous; six furniture surfaces need authored "
           "approach and transition semantics. No spawn/door was supplied. Navigation nodes may guide traversal "
           "but must never become behavior stopping points. Next prerequisite: author entrance/spawn and "
           "surface transition/clearance rules before Curator Free-Floor Navigation V1.", write)

    print(json.dumps({"status": "PASS", "mode": "write" if write else "verify",
                      "room": "curator-room", "compositionDiffPixels": 0,
                      "floorPixels": int(floor.sum()), "floorComponents": len(floor_components),
                      "redPixels": int(red.sum()), "redComponents": len(red_components),
                      "logicalRedSurfaces": len(surface_records), "purplePixels": int(purple.sum()),
                      "purpleComponents": len(purple_components)}, indent=2))


if __name__ == "__main__":
    main("--write" in sys.argv)
