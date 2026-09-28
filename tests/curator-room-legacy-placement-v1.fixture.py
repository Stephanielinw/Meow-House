"""Verify Curator legacy presentation anchors against the authored floor mask.

--write creates static QA derivatives; default mode verifies without mutation.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "assets/meeow-map/curator"
QA = ROOT / "assets/meeow-item-source/QA/curator-room-legacy-placement-reconciliation-v1"
OLD = {
    "bed": ("床边", 24, 73),
    "nightstand": ("床头柜旁", 39, 65),
    "desk": ("书桌前", 73, 64),
    "window": ("窗边", 79, 25),
    "wardrobe": ("衣柜旁", 20, 31),
    "floor": ("房间里", 51, 76),
}
OLD_ISSUE = {
    "bed": "misleading: on rug rather than beside bed",
    "nightstand": "misleading: legal floor but far below cabinet",
    "desk": "invalid: unmarked desktop art",
    "window": "invalid: unmarked closet front",
    "wardrobe": "misleading: on bed rather than beside closet",
    "floor": "invalid: unmarked table/front art",
}


def read_runtime_feet() -> dict[str, tuple[int, int, str]]:
    module = (ROOT / "js/meeow-curator-placement.js").read_text()
    block = re.search(r"const COMPATIBILITY_FEET = Object\.freeze\(\{(.*?)\n    \}\);", module, re.S)
    assert block, "Curator compatibility source missing"
    matches = re.findall(r"(\w+): Object\.freeze\(\{ x: (\d+), y: (\d+), surface: '([^']+)' \}\)", block.group(1))
    feet = {name: (int(x), int(y), surface) for name, x, y, surface in matches}
    assert set(feet) == set(OLD) and len(matches) == len(feet)
    assert "CANONICAL_SIZE = 1024" in module
    assert "foot.x / CANONICAL_SIZE * 100" in module
    assert "foot.y / CANONICAL_SIZE * 100" in module
    return feet


def main(write: bool) -> None:
    source = json.loads((PACKAGE / "spatial/curator-room-spatial-source.json").read_text())
    assert source["roomId"] == "curator-room" and source["canonicalSize"] == {"width": 1024, "height": 1024}
    html = (ROOT / "index.html").read_text()
    block = re.search(r"const CURATOR_ROOM_ANCHORS = Object\.freeze\(\{(.*?)\n                \}\);", html, re.S)
    assert block
    labels = dict(re.findall(r"(\w+): Object\.freeze\(\{ label: '([^']+)' \}\)", block.group(1)))
    assert labels == {name: item[0] for name, item in OLD.items()}
    assert "window.Meeow.curatorPlacement.getMarkerStyle(getCuratorRoomAnchor(cat))" in html
    feet = read_runtime_feet()

    floor = np.asarray(Image.open(PACKAGE / "spatial/floor-walkable.png").convert("L")) == 255
    red = np.asarray(Image.open(PACKAGE / "spatial/all-red-authored.png").convert("L")) == 255
    purple = np.asarray(Image.open(PACKAGE / "spatial/occlusion-candidate.png").convert("L")) == 255
    furniture = {name: np.asarray(Image.open(PACKAGE / f"source/{name}.png").getchannel("A")) > 0
                 for name in ["bed", "cabin", "carpet", "chair", "closet", "Table", "window"]}
    table = ["| Legacy ID | Display meaning | Old XY (%) / canvas | New anchor XY | Surface | Semantic level | Pose/activity | PASS |",
             "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    old_audit = []
    for name, (label, old_x, old_y) in OLD.items():
        x, y, surface = feet[name]
        assert surface == "curator-floor"
        assert 15 <= x < 1009 and 15 <= y < 1009
        assert floor[y, x] and not red[y, x] and not purple[y, x]
        assert bool(np.all(floor[y - 15:y + 16, x - 15:x + 16]))
        assert not any(alpha[y, x] for alpha in furniture.values())
        old_canvas = (round(old_x * 1024 / 100), round(old_y * 1024 / 100))
        old_surfaces = ["curator-floor"] if floor[old_canvas[1], old_canvas[0]] else []
        old_surfaces += [entry["surfaceId"] for entry in source["interactiveWalkableSurfaces"]
                         if np.asarray(Image.open(PACKAGE / entry["mask"]).convert("L"))[old_canvas[1], old_canvas[0]] == 255]
        old_furniture = [layer for layer, alpha in furniture.items() if alpha[old_canvas[1], old_canvas[0]]]
        old_audit.append(f"- {name} ({label}): old {old_x}%,{old_y}% = {old_canvas}; "
                         f"painted surface {old_surfaces or ['unmarked']}; furniture alpha {old_furniture or ['none']}; "
                         f"{OLD_ISSUE[name]}.")
        table.append(f"| `{name}` | {label} | {old_x},{old_y} / {old_canvas[0]},{old_canvas[1]} | "
                     f"{x},{y} | {surface} | floor-level | independent Status | PASS |")

    overview = Image.open(PACKAGE / "source/Overview.png").convert("RGB")
    preview = overview.copy()
    draw = ImageDraw.Draw(preview)
    for name, (_, ox, oy) in OLD.items():
        x, y, _ = feet[name]
        px, py = round(ox * 1024 / 100), round(oy * 1024 / 100)
        draw.line((px - 7, py - 7, px + 7, py + 7), fill=(235, 40, 55), width=3)
        draw.line((px - 7, py + 7, px + 7, py - 7), fill=(235, 40, 55), width=3)
        draw.ellipse((x - 8, y - 8, x + 8, y + 8), fill=(30, 205, 100), outline="white", width=2)
        label_x = min(x + 12, 910)
        label_y = max(y - 22, 4)
        draw.text((label_x, label_y), name, fill="white", stroke_width=2, stroke_fill="black")
    draw.text((16, 16), "RED X = obsolete legacy foot; GREEN = verified authored-floor foot", fill="white", stroke_width=2, stroke_fill="black")

    reports = {
        "placement-reconciliation-table.txt": "CURATOR ROOM / 馆长室 — LEGACY PRESENTATION COMPATIBILITY\n"
            + "\n".join(table)
            + "\nAll new points are exact BLACK-mask pixels, outside RED/PURPLE and all furniture alpha at the foot. "
              "A 31x31 neighborhood around each foot also remains BLACK. These are compatibility presentation positions, "
              "never navigation stops, POIs, transition slots, or new Status authority.\n",
        "legacy-coordinate-audit.txt": "OBSOLETE PLACEHOLDER COORDINATES\n"
            + "\n".join(old_audit)
            + "\nThe old window point (809,256) lies over closet art; bed lies on the rug; wardrobe lies on the bed. "
              "Desk, window and floor are outside both authored legal masks. All six IDs are location labels; "
              "structured pose comes from statusActivity.posture and activity prose from cat.status, with no per-ID pose rule. "
              "Old XY is retained only in this audit.\n",
        "position-authority-contract.txt": "PRESENTATION-ONLY RECONCILIATION\n"
            "curatorRoomPresence.anchor remains the accepted six-ID location authority. "
            "CURATOR_ROOM_ANCHORS retains labels and validation, without obsolete XY. "
            "Meeow.curatorPlacement maps the ID to one canonical 1024x1024 floor foot, then projects by the shared square stage. "
            "Status, save schema, narrative, pose, map-point IDs, and other Hall rooms are untouched. "
            "The generic renderer's ground anchor keeps the same world foot through pose changes. "
            "Future spatial state should use room + surface + foot x/y; these six compatibility points are not that model.\n",
        "window-and-live-case-audit.txt": "WINDOW / ODYSSEUS AUDIT\n"
            "The production label 窗边 belongs only to legacy ID window. Its contract says near the window; it does not say on the ledge. "
            "The user reports the live header Odysseus 正在窗边, which is composed by getCuratorRoomAnchorLabel from "
            "the accepted curatorRoomPresence.anchor. This identifies the live ID as window without resident-specific logic. "
            "Old 79%,25% projects to (809,256), over closet alpha. New window foot (570,400) is BLACK floor below the window "
            "with no furniture alpha at the foot. A post-change browser screenshot is unavailable because the browser tool "
            "rejected the file:// tab; visual verification is therefore pending.\n",
        "status-text-audit.txt": "TEXT / STRUCTURED AUTHORITY\n"
            "The Curator header location is getCuratorRoomAnchorLabel(curatorRoomResident), derived from curatorRoomPresence.anchor. "
            "The status card and resident tooltip use getResidentLiveStatus, which presents stored cat.status text when compatible. "
            "statusActivity.posture supplies structured pose, not a structured Curator surface location. "
            "Floor narrative and window-near-floor are coherent; no contradictory structured location is established by the supplied case. "
            "Any independently contradictory saved prose must be reported separately, not rewritten by placement mapping.\n"
    }
    if write:
        QA.mkdir(parents=True, exist_ok=True)
    for filename, content in reports.items():
        target = QA / filename
        if write:
            target.write_text(content)
        else:
            assert target.read_text() == content, f"stale QA report: {filename}"
    target = QA / "compatibility-anchor-overlay.png"
    if write:
        preview.save(target)
    else:
        assert np.array_equal(np.asarray(Image.open(target).convert("RGB")), np.asarray(preview)), "stale QA overlay"
    print(json.dumps({"status": "PASS", "mode": "write" if write else "verify", "anchors": len(feet),
                      "legalBlackFeet": len(feet), "residentSpecificRules": 0, "navigationEdges": 0}))


if __name__ == "__main__":
    main("--write" in sys.argv)
