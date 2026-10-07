#!/usr/bin/env python3
"""Verify committed Dining/Dorm hybrid authority; never promote or repair output."""
import argparse
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from check_deployment_snapshot import Snapshot


ROOMS = {
    "dining": {
        "source": "946403297dea6c9a037019832ce6a310a1a6b8db9cbd4a9ccec7810ab96b2811",
        "formal": "61286eda3e86d9603d1f16a674986c173eb3c6867168f6c0ea8c802b79e6417c",
        "base_count": 14, "solid_count": 10,
    },
    "dorm": {
        "source": "83cf9427d6e4540f147b77ce9d1a9991eaa33486872458b77c0e21b948c60edb",
        "formal": "e53ed1c4f35bc77f45f1cb17e1f998152d4be30d5c33cb2b8bb3278c93951b50",
        "base_count": 19, "solid_count": 6,
    },
}
GENERATOR = "tests/normal-room-spatial-v1.fixture.py"
GENERATOR_SHA = "40878b36cc8178b8d5b974c27125d3ccebe2f9517b0742c4a0b355fb1e8dd424"
SHARED = "tests/curator-room-native-spatial-foundation-v1.fixture.py"
PROTECTED = (
    "furnitureInteractions", "presentationClearance", "layerDepth",
    "foregroundRelations", "disabledInteractions", "groundForeground",
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def projection(config):
    require(isinstance(config, dict), "candidate must be a configuration object")
    return {key: config[key] for key in PROTECTED if key in config}


def validate_candidate(formal, candidate):
    """Only reject changed Layer C; this function cannot merge or write anything."""
    require(candidate.get("roomId") == formal["roomId"], "candidate room identity differs")
    # JSON tokens distinguish true from 1 (Python equality does not).
    require(json.dumps(projection(candidate), sort_keys=True) ==
            json.dumps(projection(formal), sort_keys=True),
            "candidate removes or modifies protected Layer C authority")


def expect_rejection(formal, candidate):
    try:
        validate_candidate(formal, candidate)
    except (ValueError, AttributeError):
        return
    raise ValueError("non-overwrite negative case was incorrectly accepted")


def mutation_checks(formal):
    validate_candidate(formal, deepcopy(formal))
    for key in projection(formal):
        missing = deepcopy(formal)
        del missing[key]
        expect_rejection(formal, missing)
        changed = deepcopy(formal)
        changed[key] = {"rejected-test-mutation": True}
        expect_rejection(formal, changed)
    nested = deepcopy(formal)
    nested["furnitureInteractions"][0]["approachPoint"]["x"] += 1
    expect_rejection(formal, nested)
    nested = deepcopy(formal)
    del nested["furnitureInteractions"][0]["traversalAccess"]
    expect_rejection(formal, nested)
    nested = deepcopy(formal)
    nested["presentationClearance"]["groundSolidLayers"].append("rejected-test-layer.png")
    expect_rejection(formal, nested)
    nested = deepcopy(formal)
    nested["furnitureInteractions"][0]["exclusive"] = 1
    expect_rejection(formal, nested)
    nested = deepcopy(formal)
    nested["presentationClearance"]["solidAlphaMinimum"] = 128.0
    expect_rejection(formal, nested)


def check(snapshot, candidate_root=None):
    # Existing builder dependencies; no renderer, local WIP or QA export is used.
    import numpy as np
    from PIL import Image

    reads = set()

    def read(path):
        data = snapshot.read(path)
        require(data is not None, f"required committed input missing: {path}")
        reads.add(path)
        return data

    require(sha256(read(GENERATOR)).hexdigest() == GENERATOR_SHA,
            "historical base generator fingerprint differs")
    formal_configs = {}
    for room, expected in ROOMS.items():
        path = f"assets/meeow-map/{room}/spatial/room-spatial.json"
        raw = read(path)
        # Review guard only. The formal JSON remains authority, not this fingerprint.
        require(sha256(raw).hexdigest() == expected["formal"],
                f"{room}: formal configuration changed; explicit authority review required")
        formal = json.loads(raw)
        require(formal["roomId"] == room, f"{room}: formal room identity differs")
        mutation_checks(formal)
        formal_configs[room] = formal
        if candidate_root is not None:
            candidate_path = candidate_root / path
            require(candidate_path.is_file() and not candidate_path.is_symlink(),
                    f"candidate config missing or not a regular file: {candidate_path}")
            validate_candidate(formal, json.loads(candidate_path.read_bytes()))

    with TemporaryDirectory(prefix="meeow-hybrid-base-") as temporary:
        root = Path(temporary)

        def copy_input(path):
            require(not Path(path).is_absolute() and ".." not in Path(path).parts,
                    "input path escapes temporary reproduction directory")
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(read(path))

        copy_input(GENERATOR)
        copy_input(SHARED)
        lying = "assets/meeow-cat/poses/lying-standard-v1/"
        copy_input(lying + "manifest.json")
        copy_input(lying + "torso_region.png")
        for prefix in ["assets/meeow-cat/v1/assets/Standard/", lying]:
            paws = sorted(path for path in snapshot.entries
                          if path.startswith(prefix + "paws/") and path.endswith("/long_socks.png"))
            require(bool(paws), f"canonical paw inputs missing: {prefix}")
            for path in paws:
                copy_input(path)

        for room, expected in ROOMS.items():
            base = f"assets/meeow-map/{room}/"
            source_path = base + "authoring/room-source.json"
            source_bytes = read(source_path)
            require(sha256(source_bytes).hexdigest() == expected["source"],
                    f"{room}: canonical base source fingerprint differs")
            source = json.loads(source_bytes)
            formal = formal_configs[room]
            require(formal["authoringSha256"] == expected["source"],
                    f"{room}: historical provenance differs from canonical source")
            copy_input(source_path)
            for path in [*source["layerOrder"], source["annotation"]["reference"],
                         source["annotation"]["baseline"]]:
                copy_input(base + path)
            require(sha256(read(base + source["annotation"]["reference"])).hexdigest()
                    == formal["annotationSha256"], f"{room}: annotation provenance differs")
            env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
            result = subprocess.run([sys.executable, str(root / GENERATOR), f"--room={room}", "--write"],
                                    cwd=root, env=env, capture_output=True, text=True, timeout=90)
            require(result.returncode == 0,
                    f"{room}: temporary base generation failed: {result.stderr.strip()}")
            generated = json.loads((root / base / "spatial/room-spatial.json").read_bytes())
            require(len(generated["maskCounts"]) == expected["base_count"],
                    f"{room}: unexpected base mask family")
            for name, count in generated["maskCounts"].items():
                path = base + "spatial/" + name
                require((root / path).read_bytes() == read(path), f"{room}: base mask differs: {name}")
                require(formal["maskCounts"][name] == count, f"{room}: base mask count differs: {name}")
            expect_rejection(formal, generated)

            clearance = formal["presentationClearance"]
            require(len(clearance["solidMasks"]) == expected["solid_count"],
                    f"{room}: unexpected solid mask family")
            for owner, mask_path in clearance["solidMasks"].items():
                art = np.asarray(Image.open(BytesIO(read(base + owner))).convert("RGBA"))
                solid = art[:, :, 3] >= clearance["solidAlphaMinimum"]
                buffer = BytesIO()
                Image.fromarray(np.where(solid, 255, 0).astype(np.uint8), "L").save(buffer, format="PNG")
                require(buffer.getvalue() == read(base + mask_path), f"{room}: solid PNG differs: {owner}")
                yy = np.indices(solid.shape)[0]
                edges = np.max(np.where(solid, yy + 1, 0), axis=0).tolist()
                require(edges == clearance["solidFrontEdges"][owner], f"{room}: front edge differs: {owner}")
                require(int(solid.sum()) == formal["maskCounts"][Path(mask_path).name],
                        f"{room}: solid mask count differs: {owner}")
            print(f"PASS — {room}: base {expected['base_count']}/{expected['base_count']}; "
                  f"solid {expected['solid_count']}/{expected['solid_count']}; front edges/counts exact; "
                  "raw base output rejected for full formal promotion; Layer C negative cases rejected")
    print(f"PASS — {snapshot.label}: {len(reads)} committed inputs verified; no local WIP used; no formal writes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--ref", help="committed ref to verify (default: HEAD)")
    mode.add_argument("--index", action="store_true", help="verify the staged snapshot only")
    parser.add_argument("--candidate-root", type=Path,
                        help="reject changed formal Layer C configs under this candidate repository root")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    try:
        snapshot = Snapshot(repo, index=args.index, ref=None if args.index else args.ref or "HEAD")
        check(snapshot, args.candidate_root)
    except (ValueError, KeyError, TypeError, AttributeError, OSError, ImportError,
            json.JSONDecodeError, subprocess.SubprocessError) as error:
        print(f"FAIL — do not promote Dining/Dorm candidate: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
