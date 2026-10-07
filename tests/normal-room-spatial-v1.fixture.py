"""Build (--write) or read-only verify the three normal rooms' spatial derivatives.

Annotations and production art are inputs; spatial JSON/PNGs are never authored.
Shares the accepted Curator builder's PNG, component and hash operations.
"""
from pathlib import Path
import importlib.util
import json
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('curator_builder', Path(__file__).with_name('curator-room-native-spatial-foundation-v1.fixture.py'))
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)


def clearance(mask):
    d = np.where(mask, 2048, 0).astype(np.int16)
    d[0] = np.minimum(d[0], 1); d[-1] = np.minimum(d[-1], 1)
    d[:, 0] = np.minimum(d[:, 0], 1); d[:, -1] = np.minimum(d[:, -1], 1)
    for y in range(1, len(d)): d[y] = np.minimum(d[y], d[y-1] + 1)
    for y in range(len(d)-2, -1, -1): d[y] = np.minimum(d[y], d[y+1] + 1)
    for x in range(1, d.shape[1]): d[:, x] = np.minimum(d[:, x], d[:, x-1] + 1)
    for x in range(d.shape[1]-2, -1, -1): d[:, x] = np.minimum(d[:, x], d[:, x+1] + 1)
    return d


def support_offsets(pose, settings):
    base = ROOT / ('assets/meeow-cat/v1/assets/Standard' if pose == 'sitting' else 'assets/meeow-cat/poses/lying-standard-v1')
    anchor = [37, 90] if pose == 'sitting' else json.loads((base / 'manifest.json').read_text())['groundAnchor']
    contact = []
    # The approved socks follow canonical paw ownership. Only their bottom
    # contact edge is used, not the head/tail or the whole sprite rectangle.
    paths = list(sorted((base / 'paws').glob('*/long_socks.png')))
    if pose == 'lying': paths.append(base / 'torso_region.png')
    for path in paths:
        pixels = np.asarray(Image.open(path).convert('RGBA'))
        mask = pixels[:, :, 3] > 0
        if path.name == 'torso_region.png': mask &= pixels[:, :, 0] > 0
        yy, xx = np.where(mask)
        if not len(xx): continue
        bottom = int(yy.max())
        for x in sorted(set(xx.tolist())):
            y = int(np.where(mask[:, x])[0].max())
            if y >= bottom - 2: contact.append((x - anchor[0], y - anchor[1]))
    assert contact, f'no canonical support: {pose}'
    offsets = set()
    for width in settings['viewportWidths']:
        scale = settings['displayWidth'] * 1024 / (112 * width)
        for x, y in contact:
            dx, dy = round(x * scale), round(y * scale)
            # One native pixel conservatively covers projection rounding.
            for ox, oy in [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)]:
                offsets.add((dx + ox, dy + oy))
    return sorted(offsets)


def supported(mask, offsets):
    result = mask.copy()
    h, w = mask.shape
    for dx, dy in offsets:
        shifted = np.zeros_like(mask)
        x0, x1 = max(0, -dx), min(w, w-dx)
        y0, y1 = max(0, -dy), min(h, h-dy)
        shifted[y0:y1, x0:x1] = mask[y0+dy:y1+dy, x0+dx:x1+dx]
        result &= shifted
    return result


def build(room, write=False):
    package = ROOT / 'assets/meeow-map' / room
    source_path = package / 'authoring/room-source.json'
    source = json.loads(source_path.read_text())
    assert source['roomId'] == room and source['canonicalSize'] == {'width': 1024, 'height': 1024}
    assert source['annotation']['import'] == 'approved-color-regions-only'
    assets = {}
    for name in source['layerOrder']:
        path = package / name
        assert shared.sha256(path) == source['assetHashes'][name], f'asset source changed: {room}/{name}'
        assets[name] = Image.open(path).convert('RGBA')
        assert assets[name].size == (1024, 1024)
    ref = np.asarray(Image.open(package / source['annotation']['reference']).convert('RGB'), dtype=np.int16)
    baseline = np.asarray(Image.open(package / source['annotation']['baseline']).convert('RGB'), dtype=np.int16)
    assert ref.shape == baseline.shape == (1024, 1024, 3)
    delta = np.max(abs(ref-baseline), axis=2)
    classes = {name: np.all(ref == color, axis=2) & (delta >= (24 if name == 'black' else 40))
               for name, color in source['annotation']['palette'].items()}
    empty = np.zeros((1024, 1024), dtype=bool)
    black, red = classes['black'], classes['red']
    dark, purple = classes.get('darkRed', empty), classes.get('purple', empty)
    assert not np.any((black | dark) & (red | purple))
    dark_name = 'dark-surface.png' if dark.any() else 'dark-ground.png'
    outputs = {'floor.png': black, dark_name: dark, 'red.png': red, 'purple.png': purple}
    alphas = {name: np.asarray(image)[:, :, 3] > 0 for name, image in assets.items() if name != 'background.png'}
    ground = black
    components = shared.connected_components(ground)
    largest = np.zeros_like(ground)
    largest.ravel()[components[0]['cells']] = True
    safe_ground = largest & (clearance(ground) >= 4)
    yy, xx = np.indices(ground.shape)
    safe_ground &= (xx % 4 == 2) & (yy % 4 == 2)
    gy, gx = np.where(safe_ground)
    assert len(gx), 'no legal ground approach'
    offsets = {pose: support_offsets(pose, source['supportContact']) for pose in source['supportContact']['poses']}
    surfaces, interactions, disabled, relations = [], [], [], []
    owner_counts = {}
    # Adjacent red tabletop and dark seats have different surface authority.
    components = shared.connected_components(red) + shared.connected_components(dark)
    for component in sorted(components, key=lambda c: (c['bounds'][1], c['bounds'][0])):
        if component['pixels'] < 64: continue  # Blended speckles never authorize a slot.
        cells = np.asarray(component['cells'])
        owners = sorted([(int(mask.ravel()[cells].sum()), name) for name, mask in alphas.items()], reverse=True)
        count, owner = owners[0]
        if count < component['pixels'] * .95 or (len(owners) > 1 and owners[1][0] >= count * .95):
            disabled.append({'bounds': component['bounds'], 'reason': 'surface-owner-ambiguous'}); continue
        owner_counts[owner] = owner_counts.get(owner, 0) + 1
        sid = f"{room}-{Path(owner).stem}-surface-{owner_counts[owner]}"
        mask = np.zeros_like(red); mask.ravel()[cells] = True
        mask &= alphas[owner]
        path = sid + '.png'; outputs[path] = mask
        surfaces.append({'surfaceId': sid, 'ownerLayer': owner, 'mask': 'spatial/'+path,
                         'pixelCount': int(mask.sum()), 'currentConnectivity': 'requires-future-transition'})
        # A lower seat may be behind another real furniture asset. Preserve
        # that authored relation even when its canonical support does not fit.
        for relation in source.get('furnitureForeground', []):
            if relation.get('activation'): continue
            if relation['surfaceOwnerLayer'] != owner or not np.any(mask & classes[relation['surfaceClass']]):
                continue
            foreground_owner = relation['foregroundOwnerLayer']
            foreground = classes[relation['foregroundClass']] & alphas[foreground_owner]
            assert foreground.any()
            fg_path = f"{Path(foreground_owner).stem}-seat-foreground.png"
            outputs[fg_path] = foreground
            related = next((r for r in relations if r['mask'] == 'spatial/'+fg_path), None)
            if related: related['relatedSurfaceIds'].append(sid)
            else: relations.append({'mask': 'spatial/'+fg_path, 'ownerLayer': foreground_owner,
                                    'relatedSurfaceIds': [sid], 'runtimeClippingEnabled': False})
        valid = {pose: supported(mask, points) for pose, points in offsets.items()}
        poses = [pose for pose in valid if valid[pose].any()]
        if not poses:
            disabled.append({'surfaceId': sid, 'reason': 'canonical-support-contact-does-not-fit'}); continue
        joint = np.logical_and.reduce([valid[p] for p in poses])
        if not joint.any():
            poses = [max(poses, key=lambda p: int(valid[p].sum()))]; joint = valid[poses[0]]
        score = clearance(mask); score[~joint] = -1
        sy, sx = np.unravel_index(int(score.argmax()), score.shape)
        candidates = np.ones(len(gx), dtype=bool)
        target_y = sy
        for relation in source.get('furnitureApproach', []):
            if relation['ownerLayer'] != owner: continue
            assert relation['side'] == 'lower-base'
            left, top, right, bottom = assets[owner].getbbox()
            candidates &= (gx >= left) & (gx < right) & (gy >= bottom + 4)
            target_y = bottom + 4
        assert candidates.any(), f'no authored approach: {sid}'
        distance = np.where(candidates, (gx-sx)**2 + (gy-target_y)**2, np.inf)
        approach = int(np.argmin(distance))
        point = {'x': int(gx[approach]), 'y': int(gy[approach])}
        behaviors = [b for p in poses for b in (['sit-idle', 'observe'] if p == 'sitting' else ['sleep', 'rest'])]
        presentation = {'aboveLayer': owner}
        foreground = purple & alphas[owner]
        binding = next((r for r in source.get('furnitureForeground', []) if sid in r.get('surfaceIds', [])), None)
        if any(r.get('activation') and r['foregroundOwnerLayer'] == owner
               for r in source.get('furnitureForeground', [])):
            assert binding, f'explicit foreground surface binding missing: {sid}'
        if binding:
            assert binding['surfaceOwnerLayer'] == binding['foregroundOwnerLayer'] == owner
            assert binding['activation'] == 'surface-behind-foreground-base'
            foreground = classes[binding['foregroundClass']] & alphas[owner]
            # Preserve all approved pixels as source coverage. The runtime
            # subset belongs to this surface's frozen contact, not the PNG.
            source_mask = f"{Path(owner).stem}-foreground.png"
            outputs[source_mask] = foreground
            subset = np.zeros_like(foreground)
            regions = []
            for region in shared.connected_components(foreground):
                if region['pixels'] < 64: continue  # Same annotation-speckle rule as surfaces.
                front_edge = region['bounds'][3]
                active = bool(sy < front_edge)
                regions.append({'bounds': region['bounds'], 'pixelCount': region['pixels'],
                                'frontEdgeY': front_edge, 'activeAtSlot': active})
                if active: subset.ravel()[region['cells']] = True
            fg_path = sid + '-foreground.png'
            outputs[fg_path] = subset
            relation_id = sid + '-foreground'
            relations.append({'relationId': relation_id, 'mask': 'spatial/'+fg_path,
                'sourceMask': 'spatial/'+source_mask, 'ownerLayer': owner,
                'relatedSurfaceIds': [sid], 'runtimeClippingEnabled': bool(subset.any()),
                'activation': {'rule': binding['activation'], 'surfaceId': sid,
                    'contact': {'x': int(sx), 'y': int(sy)}, 'regions': regions}})
            if subset.any():
                presentation.update({'foregroundMask': 'spatial/'+fg_path, 'foregroundRelationId': relation_id})
        elif foreground.any():
            fg_path = f"{Path(owner).stem}-foreground.png"; outputs[fg_path] = foreground
            presentation['foregroundMask'] = 'spatial/'+fg_path
            related = next((r for r in relations if r['mask'] == presentation['foregroundMask']), None)
            if related: related['relatedSurfaceIds'].append(sid)
            else: relations.append({'mask': presentation['foregroundMask'], 'ownerLayer': owner,
                                    'relatedSurfaceIds': [sid], 'runtimeClippingEnabled': True})
        interactions.append({'slotId': sid+'-slot', 'furnitureId': Path(owner).stem, 'surfaceId': sid,
            'affordance': 'static-rest', 'exclusive': True, 'posture': poses[0], 'postures': poses,
            'behaviors': behaviors, 'slotPoint': {'x': int(sx), 'y': int(sy)},
            'approachPoint': point, 'exitPoint': dict(point), 'presentation': presentation})
    derived = {'schemaVersion': 1, 'roomId': room, 'assetBase': source['assetBase'],
        'canonicalSize': source['canonicalSize'], 'layerOrder': source['layerOrder'],
        'layerDepth': {name: (assets[name].getbbox()[3] if assets[name].getbbox() else 0)
                       for name in source['layerOrder']},
        'authoringSource': 'authoring/room-source.json', 'authoringSha256': shared.sha256(source_path),
        'annotationSha256': shared.sha256(package / source['annotation']['reference']),
        'floorWalkable': {'surfaceId': room+'-ground', 'mask': 'spatial/floor.png', 'pixelCount': int(black.sum())},
        **({'furnitureSurface': {'mask': 'spatial/dark-surface.png', 'pixelCount': int(dark.sum())}} if dark.any()
           else {'darkGround': {'mask': 'spatial/dark-ground.png', 'pixelCount': 0}}),
        'interactiveWalkableSurfaces': surfaces, 'furnitureInteractions': interactions,
        'foregroundRelations': relations, **({} if dark.any() else {'groundForeground': []}),
        'disabledInteractions': disabled, 'supportOffsets': offsets,
        'groundEntry': {'x': int(gx[len(gx)//2]), 'y': int(gy[len(gy)//2])},
        'maskCounts': {name: int(mask.sum()) for name, mask in outputs.items()}}
    for name, mask in outputs.items(): shared.image(package / 'spatial' / name, shared.mask_image(mask), write)
    composite = Image.new('RGBA', (1024, 1024))
    for name in source['layerOrder']: composite.alpha_composite(assets[name])
    shared.image(package / 'spatial/composition.png', composite, write)
    content = json.dumps(derived, ensure_ascii=False, indent=2) + '\n'
    target = package / 'spatial/room-spatial.json'
    if write: target.write_text(content)
    else: assert target.read_text() == content, f'stale derivative: {room}'
    print(room, 'PASS', len(interactions), 'exclusive slots;', len(disabled), 'disabled surfaces')
    return derived


if __name__ == '__main__':
    rooms = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--room=')] or ['dining', 'living', 'dorm']
    assert all(room in ['dining', 'living', 'dorm'] for room in rooms)
    for room in rooms: build(room, '--write' in sys.argv)
