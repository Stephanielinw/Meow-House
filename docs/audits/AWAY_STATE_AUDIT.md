# Meeow House V2.1 — Resident Presence System Audit

## Purpose and reading rules

This is a read-only engineering audit of the current resident presence boundary. It compares implemented runtime behavior with the future-world intent in `WORLD_BIBLE.md` and `V2_1_LIVING_WORLD_DESIGN.md`.

The World Bible and V2.1 draft describe intent only. `index.html` and the extracted `window.Meeow` modules remain the source of truth for what currently runs. This audit does not prescribe a schema, implementation plan, UI flow, or feature behavior.

## 1. Current implementation findings

### 1.1 Resident location and presence

| Concern | Current implementation | Status |
| --- | --- | --- |
| Hall membership | Each cat has a persisted `hallId`. `roomCats` in `index.html` selects cats whose hall matches `activeHallId`. | **Implemented** |
| In-hall spatial placement | Cats may carry `mapRoom`, `mapPoint`, `mapSpot`, `mapFurniture`, and `mapPositionLabel`. The root map adapter derives marker placement from those fields and current status. | **Implemented** |
| Basic away indicator | Cats have persisted `isOut`. Builtins default it to `false`; save restoration and daily snapshots preserve it. | **Implemented** |
| In-hall visibility | The text hall still lists an out cat, with a grayscale card and an `外出中` badge. Map markers exclude `isOut` cats, while `mapOutCats` retains the active hall's out list for map presentation. | **Implemented** |
| Availability policy | `isOut` blocks several entry points, but it is not a single universal availability contract. | **Partially implemented** |
| Presence identity beyond boolean out/home | There is no current runtime distinction for away reason, destination, expected return, unavailable subtype, or returned-with-experiences state. | **Not implemented** |

`setCatStatus()` owns status timestamps, monitor events, and map interpretation, but it does not own a resident-presence lifecycle. Its optional status data can coexist with `isOut`; the Status Sync apply path writes the boolean separately.

### 1.2 Existing away-like behavior

| Existing behavior | Current code location | What it represents |
| --- | --- | --- |
| Whole-hall Status Sync | `_refreshAllStatus()` / `refreshAllStatus()` in `index.html` | A model response may set `isOut`. The root applies a monitor event when it changes, and enforces that a hall with two or more cats retains at least two at home. This is the closest current runtime presence transition, but it has no explicit departure reason or return lifecycle. |
| Outgoing mail | `generateMail()` | A scheduled, optional narrative use of cats already marked `isOut`. It can create mail from a cat's current status and records, but does not send a cat away or return one. |
| External observation | `hackCamera(cat)` | A manual AI-generated observation log for an out cat. It adds a diary entry and a per-day guard; it is narrative output, not location tracking or a presence transition. |
| Homepage chat while out | `sendMessageInternal()` | An out cat may produce a short automatic reply in the common path. This models reduced availability, but does not fully prohibit contact or establish a separate communication state. |
| Focus and Reader availability | `availableCatsForFocus`, focus participant filtering, and `readerAvailableCats` | These workflows exclude out cats from participation or selection. They consume the existing boolean as availability input. |
| Cross-hall visiting | `openCatVisit`, `sendCatVisiting`, `returnVisitingCat` | A distinct temporary workflow. It moves `hallId`, uses `isVisiting`, `visitOriginHallId`, and `visitStartedAt`, then writes a return travelogue. It is cross-hall relocation, not `isOut` presence. |
| Exploration | `exploreState`, `startExploration`, `finishExploration`, and `beginExploreReturn` | A user-led session with one companion. It produces interaction records, travelogues, rewards, and a post-return Status Sync, but does not set the companion's `isOut` during the session. It is a temporary feature workflow and narrative outing, not a general resident-away state. |
| Travel records | Cat `travelogues`, diary/monitor entries, and logs; `Meeow.memory` context builders | Durable episodic records of exploration and visits. They support continuity but do not by themselves decide whether a resident is currently home. |

### 1.3 Current data ownership

| Area | Current owner / location | Presence relevance |
| --- | --- | --- |
| Cat state | Root `cats` ref in `index.html`, persisted through the existing root save path | `hallId`, `isOut`, `isHuman`, status, inner voice, timestamps, map fields, visiting fields, diaries, logs, travelogues, and interaction history live on each cat record. |
| Hall state | Root `halls` ref and `activeHallId` | Defines home membership and current hall selection. `hallId` is also temporarily reassigned during cross-hall visits. |
| Map state | Root map adapters plus `Meeow.map` static references | The map uses cat-owned position fields for at-home placement; it excludes out cats rather than representing an external location. |
| Memory | `js/meeow-memory.js` | Full and Status Sync context include current form/out status. Full contexts may include recent travelogues; bounded Status Sync continuity prefers recent travel when a cat is out. Memory reads these facts but does not mutate them. |
| Status Sync | Root status workflow in `index.html` | The exact-ID response contract includes `isOut`; root apply code changes it, creates transition monitor entries, and applies the two-at-home defense rule. |
| Exploration state | Root `exploreState` reactive object | Holds an active user-led exploration session, selected companion, destination, narration, checks, settlement, and return progress. It is session state rather than a general per-resident availability owner. |
| Daily lifecycle | Root archive snapshot/reset logic in `index.html` | Snapshots and restores `isOut` during archive recovery. Daily record clearing preserves the current away boolean. |
| Storage | `Meeow.storage` serializes the root cat array through injected state | There is no standalone localStorage key or storage module concept for presence; compatibility currently follows the saved cat record. |

### 1.4 User-facing entry points

Current UI and workflow surfaces that already consume away-like state are:

- **Hall cards:** out cats remain visible but are dimmed, badged, and offered an external-observation action instead of a visit action.
- **Map:** out cats are removed from room markers; the map computes an out-cat list separately from at-home markers.
- **Cat detail and chat:** direct opening of an out cat is blocked in the main click handler; an already-addressed out cat has an away-oriented input hint and can receive an automatic reply path.
- **Cat actions:** human-form toggle, item bag access, cross-hall visit setup, Focus participation, and Reader selection all exclude or disable out cats in their relevant paths.
- **Phone/mail:** scheduled outgoing mail can use an already-out resident as sender.
- **Status display and logs:** status text, monitor entries, and daily snapshots preserve or describe the existing boolean transition.

## 2. Existing reusable systems

The following current boundaries are reusable conceptual anchors for a future presence system, without implying that they are sufficient as-is:

- **Cat-owned current state:** the saved cat record already owns current availability-adjacent facts rather than placing them in transient UI state.
- **Status transition application:** the root Status Sync workflow already applies status, inner voice, form, map information, timestamps, and out/home changes in one authoritative mutation area.
- **Episodic continuity:** travelogues, monitor events, interaction events, and logs can represent prior outings and returns without making all history globally visible.
- **Whole-hall safety policy:** Status Sync currently ensures at least two cats remain home in a multi-cat hall, which is an existing example of companionship balance enforced by code.
- **Cross-hall visit workflow:** visiting demonstrates that a temporary relocation can preserve origin, start time, return handling, and a post-return narrative record, though its semantics differ from away state.
- **Availability-aware consumers:** map, Focus, Reader, visit controls, chat behavior, and outgoing mail already show where current availability affects user-facing behavior.

## 3. Missing capabilities

### Current implementation gaps

- `isOut` expresses only a boolean home/away condition. It does not currently distinguish ordinary absence, external responsibility, travel, exploration, temporary unavailability, or a completed return.
- The code has no single owner for a departure, continued absence, communication availability, and return as one coherent resident lifecycle.
- Current external location is not represented: map data remains an in-hall placement system and simply removes out cats from markers.
- A return experience exists for exploration and visiting workflows, but not for a general resident-away transition.
- Status Sync can cause away changes through generated output, but the model response does not carry a deterministic provenance or lifecycle explanation for the transition.
- Resident-to-resident awareness of an absence is not represented as a separate visibility or relationship concept; current hall social context is based primarily on whether a cat is at home.

### World Bible intent not yet represented as a complete runtime domain

The World Bible and V2.1 design draft describe independent lives, present/away/unavailable/returned distinctions, reduced communication availability, perspective-bound knowledge, and a balance between residence and companionship. Current code supports fragments of that intent through `isOut`, travel records, visits, exploration, and mail, but does not implement those concepts as a unified resident-presence domain.

## 4. Risks and coupling

| Risk | Why it matters in the current implementation |
| --- | --- |
| Overloaded `isOut` meaning | The same boolean drives UI availability, map omission, Status Sync output, mail eligibility, Focus/Reader exclusion, and monitor wording. Changing its meaning would affect multiple workflows at once. |
| AI-owned transition pressure | Status Sync currently receives and applies `isOut` from model output. Any future lifecycle must preserve code-owned authority over valid transitions and avoid treating narrative output as the sole source of resident availability. |
| Hall membership versus absence | Cross-hall visiting changes `hallId` and uses `isVisiting`; away residents retain their hall membership. Collapsing those concepts would affect roster filtering, current-hall UI, and return behavior. |
| Map coupling | Map logic assumes out cats have no in-hall marker. A future external-location concept must not be mistaken for an additional in-hall map point. |
| Archive and persistence compatibility | `isOut` is included in saved cat records and daily snapshot/restore. Any future work must account for existing saves and archive recovery without treating this audit as authority to migrate them. |
| Inconsistent availability semantics | Some paths block out cats, while chat can produce an automatic reply and mail can originate from them. A future design should preserve the distinction between physical presence and communication availability rather than assuming they are identical. |
| Concurrent feature workflows | Status Sync, exploration return, cross-hall visits, daily archive recovery, and user interactions all write related cat state. Presence changes would need careful ownership boundaries to avoid overwriting a return or visit transition. |

## 5. Recommended future implementation boundary

### World Bible intent

Future work should treat resident presence as a domain concern: residents can be present, away, unavailable, or returned with continuity, while relationships, memory visibility, and form constraints remain independent rules.

### Current implementation boundary

The safest future boundary is a focused **resident-presence domain adapter**, separate from `Meeow.memory`, `Meeow.map`, and the generic AI queue. It should be introduced as a new domain rather than expanding Status Sync or exploration into an all-purpose availability owner.

The root application should remain the composition and mutation owner during an initial implementation because it currently owns `cats`, `setCatStatus`, map placement, activity logs, Status Sync application, persistence, and UI state. A future presence boundary can therefore concentrate on presence semantics and transition decisions while using explicit root-owned adapters for application and persistence.

### Integration points to evaluate in future work

- **Cat current state:** the existing `isOut` boundary and cat-owned current-status records are the primary runtime integration surface.
- **Status Sync:** Status Sync is the existing whole-hall update path and must remain subject to its exact-ID validation, completion, and at-home safety behavior.
- **Memory:** `Meeow.memory` is a read-only consumer of current presence and episodic travel records; it should remain a context builder rather than become a transition owner.
- **Map and UI:** map marker filtering and availability-sensitive entry points are consumers of presence, not authoritative state owners.
- **Exploration and visits:** these are existing specialized workflows with their own return narratives; they are integration cases, not substitutes for a general presence lifecycle.

This recommendation is a boundary assessment only. It does not define a feature, data model, migration, extraction commit, gameplay loop, or UI requirement.
