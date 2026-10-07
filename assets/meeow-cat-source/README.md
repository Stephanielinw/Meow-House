# Meeow Cat Creator source workspace

This is the small, human-facing workspace for Cat Creator artwork. It is now the current editable source workspace. The Standard files were originally consolidated from `assets/meeow-cat-baseline/CURRENT_STANDARD`; that retired path may no longer exist after cleanup.

Production still lives in `assets/meeow-cat/`. Replacing a PNG here does **not** change the game or production renderer. Give the changed PNG to Codex; Codex should use `SOURCE_MANIFEST.json` to identify its original source and dependencies, rebuild affected derived assets, and run the renderer tests before integration.

## How files are organized

- `standard/<pose>/`: visible Standard components for sitting, standing, crouching, and lying.
- `mappings/<pose>/`: UV, coordinate, ownership, head-region, and feature maps used to fit shared designs to a pose.
- `masks/`: special-purpose masks that are neither standalone artwork nor complete mappings.
- `references/special-body/`: approved Slim, Chubby, and Fluffy geometry/reference material. These are references, not integrated runtime assets.
- `references/pose/`: compact pose and tail reference images.
- `working/accepted-manual/`: visually accepted manual artwork that is not integrated yet.
- `working/unfinished/`: useful candidates that still need review or safe rebasing.
- `QA/`: explicitly referenced current manual approvals and mapping guides can be authoritative inputs. Generated test cats and previews are outputs, never source artwork; historical review material is not automatically a current dependency.

Names follow `body type / pose / subsystem / trait`. For example, `standard/sitting/face-markings/eye_patch.png` is the Standard sitting eye-patch source, while `mappings/crouching/face/headUV.png` maps shared head artwork into the crouching pose.

Do not replace mapping PNGs as ordinary painted artwork unless the task specifically concerns pose fitting. `SOURCE_MANIFEST.json` records every copied file, its historical original path, status, and SHA-256. Historical paths are provenance strings and are not guaranteed to remain present after cleanup.

## Authority and Git checkpoint closure

A manifest record is not, by itself, a current build dependency. Historical and WIP records retain provenance; use the current runtime manifest, mapping dependency, or explicit current approval to establish source authority. Historical `originalSha256` / `copiedSha256` describe the earlier copy, while current `sourceSha256` / `runtimeSha256` describe the corresponding canonical bytes. Do not normalize historical hashes to current artwork.

A formal / approved / locked / runtime promotion is complete only when the canonical source, runtime output, and manifest/mapping agree; required source/tool/test dependencies are Git-tracked; the exact promotion files are committed in a narrow checkpoint; and Git status is checked for leftover promotion files. Unintegrated WIP and historical material remain separate.
