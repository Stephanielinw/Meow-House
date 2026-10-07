# Meeow House — canonical Cat Creator v1 identity schema

This is the product-facing identity contract. Renderer asset spelling may differ
internally, but public configurations and returned configurations use these IDs.

```text
body: standard | chubby | slim | fluffy
ear: standard | large | small | round | folded | tufted
tail: standard | long | thick | fluffy | short | kinked
torso: none | classic_tabby | mackerel_tabby | spotted | large_patches | saddle_cape
face: none | muzzle | blaze | point | eye_patch | forehead_m
bib: none | bib
frontLeft/frontRight/rearLeft/rearRight:
  none | toe_tips | short_socks | medium_socks | long_socks
```

## Compatibility normalization

| Legacy stored value | Canonical value |
| --- | --- |
| `Standard`, `Chubby`, `Slim`, `Fluffy` | lowercase body ID |
| `mackerel` | `mackerel_tabby` |
| `point_face`, `half_face` | `point` |
| `forehead_tabby` | `forehead_m` |
| `small_bib`, `medium_bib`, `full_bib`, `true` | `bib` |
| `false` | `none` |
| `left`, `right`, `hind` | `frontLeft`, `frontRight`, `rearRight` |

The renderer keeps all four anatomical paw states in the identity. A pose maps
only the limbs it visibly owns; unseen limbs remain stored and are not renamed
by screen position.

`muzzle` is a face-marking choice. Muzzle geometry, nose, mouth and eyes remain
anatomical owners for every cat. `face: none` does not add a colored muzzle
patch.
