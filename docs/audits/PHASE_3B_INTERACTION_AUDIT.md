# Phase 3B-0 — Resident Presence Interaction Audit

## Purpose and reading rules

This is a read-only audit of how the current runtime treats a resident whose `cat.isOut === true`. It uses `WORLD_BIBLE.md`, `V2_1_LIVING_WORLD_DESIGN.md`, and `AWAY_STATE_AUDIT.md` as future-world intent only. `index.html` and the extracted `window.Meeow` modules remain the source of truth for current behavior.

The observations below do not define a feature, schema, migration, prompt change, UI flow, or implementation requirement.

## 1. Current behavior

### 1.1 Away resident profile access

`roomCats` continues to include every resident whose `hallId` matches the active hall, including away residents. The text-hall card therefore remains visible, but `isResidentAway(cat)` applies a grayscale treatment and an `外出中` badge.

| Surface | Current behavior | Runtime location | Nature of restriction |
| --- | --- | --- | --- |
| Text hall card | Visible and visually clickable; shows the away badge and the separate observation button. | `index.html` hall-card template | Presentation retains the resident in the roster. |
| Primary card click | `handleCatClick(cat)` stops an away cat from opening the detail page and shows `这只猫正在外出，暂时无法建立联络。`. | `index.html`, `handleCatClick()` | Availability guard layered on top of presence. |
| Map marker | No in-hall marker is produced for away residents. `mapOutCats` keeps a separate active-hall list for explanatory map presentation. | `mapCatMarkers`, `mapOutCats` | Spatial presentation rule, not profile access. |
| Existing detail view | If a cat is already selected and later becomes away, the detail page remains renderable. It displays the badge/grayscale state; no watcher automatically closes it. | Detail template and `selectedCat` root ref | Incidental retained access, rather than an explicit away-profile route. |
| Detail actions | Human-form toggle and bag opening are disabled in the template when the selected resident is away. | Detail action toolbar | UI-level availability guard; the underlying `toggleHumanMode()` and `useItem()` functions do not independently test `isOut`. |

The primary profile restriction is therefore not a lack of resident data. It is an inherited `handleCatClick()` availability guard that treats opening the main detail route as establishing immediate contact.

### 1.2 Away communication behavior

#### Homepage detail chat

The normal route cannot open a newly selected away cat because of `handleCatClick()`. If an away cat is already selected, the chat input stays enabled with the hint `他可能很忙...`.

`sendMessageInternal()` records the user message and interaction before checking presence. When the resident is away, the common path (`Math.random() > 0.15`) generates or reuses a short automatic reply saying they cannot reply now, then records that reply and returns. The remaining path continues into the normal structured Homepage Chat flow.

The structured normal path retains the existing five-tag response protocol and its local CAT/HUMAN form constraints. The short automatic-reply prompt is a separate AI call: it supplies character memory and the core prompt, but does not itself use the five-tag protocol or repeat the local Homepage Chat CAT-form speech instructions.

#### Phone chat

The phone contact list and `openPhoneChat()` do not currently filter or block a cat by `isOut`. `requestPhoneReply()` also has no away guard. Its prompt refers to the resident's current status and explicitly allows an ordinary public-identity reply such as `现在不太方便` when the resident is out.

Phone chat is therefore an existing communication route with different expression semantics from Homepage Chat: it presents a character's public human identity, while the prompt prohibits exposing the Meeow House cat secret. This is current behavior, not a general presence permission model.

#### Form constraints

Away state does not itself change `isHuman` or the stored form. In Homepage Chat, CAT-form direct speech remains governed by the existing CAT-form rules when the structured path is used. The phone route is intentionally framed as text from the character's public identity rather than as spoken CAT-form dialogue.

### 1.3 `查看外出记录` button

| Step | Current implementation |
| --- | --- |
| UI entry | The away card exposes `查看外出记录`, calling `hackCamera(cat)` with event propagation stopped. |
| Preconditions | The action requires an API key and is limited by `cat.hasHackedThisPatrol`. |
| Generation | `hackCamera()` requests an AI observation log using the cat's current status and `buildCatMemoryContext(cat)`. |
| Write target | It calls `appendMonitorEvent(cat, '[监控截获] ...', 'manual-camera')`, which appends a timestamped record to `cat.diary`. |
| Immediate destination | It sets `selectedCat` and opens `showLogModal`. |
| Rendered data source | `showLogModal` renders `selectedCat.logs`, described by the UI as `过往日记`. The monitoring timeline is rendered by the separate `showDiaryModal`, which reads `selectedCat.diary`. |

The button is not currently a travelogue viewer: `cat.travelogues` are not used by this route. It is a temporary reuse of an external-observation generator plus an existing modal. There is a current routing mismatch: the newly generated observation is stored in the monitoring timeline (`diary`), while the immediately opened modal displays the permanent diary list (`logs`). The generated record still exists in runtime data and is available through the regular monitoring-log view; the audit records this mismatch without changing it.

### 1.4 Presence versus availability boundary

`Meeow.presence` is a pure interpretation layer: `isResidentAway(cat)` is exactly `Boolean(cat?.isOut)`, while `getResidentCommunicationMode(cat)` is descriptive only. Feature-specific code remains the behavioral authority.

| Area | Presence meaning consumed | Current availability behavior |
| --- | --- | --- |
| Hall cards / profile | Away residents remain in the hall roster, visually marked. | Direct primary-card profile opening is blocked; the observation action remains available. |
| Map | Away means no in-hall placement marker. | No map tap/profile route exists because no marker is rendered; the out list is presentation only. |
| Homepage chat | Away is visible in the input hint and can alter reply routing. | Existing selected cats can still receive a user message; the usual away result is an automatic reply, with a smaller path into normal structured chat. |
| Phone chat | `isOut` is available through the cat context/status but is not a contact filter. | Phone messaging and reply generation remain available. |
| Focus | Away means not physically available as a supervisor. | `availableCatsForFocus` filters to in-hall residents; focus ticks additionally filter current participants. |
| Reader | Away means not eligible for in-person companion reading. | `readerAvailableCats` filters to in-hall residents. |
| Inventory / items | The selected profile shows away state. | The bag control is disabled in the detail UI. `useItem()` itself has no separate away guard, so this is not an independent transaction-level permission rule. |
| Human form | Away is shown on the selected profile. | The form button is disabled in the detail UI; `toggleHumanMode()` itself has no presence check. |
| Cross-hall visit | Away is distinct from visiting. | Both `openCatVisit()` and `sendCatVisiting()` guard against away residents; visiting instead changes `hallId` and uses its own `isVisiting` fields. |
| Exploration companion | Away indicates the resident cannot be selected as the user's companion. | `selectExploreCompanion()` rejects the selection. Existing out residents may still appear as a chance narrative rescuer during an exploration scene. |
| Mail / delivery | An out resident is a possible off-site participant. | `generateMail()` can select an out cat as sender; one delivery branch can also select an out cat as a narrative helper. |
| Status Sync / archive | `isOut` is current cat state. | Root Status Sync and archive recovery own its writes; these are domain mutations, not general UI availability checks. |

The current runtime consequently distinguishes physical in-hall participation from communication in several places, but it does so through individual feature guards rather than one permission policy.

## 2. Existing reusable systems

- **Presence adapter:** `js/meeow-presence.js` already provides a stable, read-only interpretation of the existing boolean without owning state or persistence.
- **Roster and detail state:** `roomCats`, `selectedCat`, the hall card, and the detail layout already preserve resident identity and current status independently of map-marker visibility.
- **Limited-contact precedent:** Homepage automatic replies and phone-chat status-aware replies are existing, distinct examples of reduced or context-limited communication.
- **Episodic record stores:** `diary` (monitoring timeline), `logs` (permanent diary), `travelogues`, and `todayInteractions` already keep different kinds of past record. `Meeow.memory` reads selected continuity but does not own these writes.
- **Existing external observation:** `hackCamera()` already produces a user-triggered account of an away resident without changing `isOut` or hall membership.
- **Specialized movement workflows:** cross-hall visits and exploration preserve their own lifecycle and return traces. They demonstrate adjacent concepts but do not constitute a general away-state implementation.

## 3. Current limitations

- A primary hall-card click treats away as unavailable for profile access, even though the card, state, and some detail rendering are already available.
- There is no explicit, consistently reachable away-profile mode. Retained detail access after a state change is incidental.
- Away communication is route-dependent: Homepage Chat is mostly automatic-reply-oriented, while phone chat remains available. No shared layer describes this difference as a user-facing interaction policy.
- The current observation-button label implies a record view, but its generated entry goes to `diary` while the opened modal displays `logs`.
- `travelogues` represent prior travel/returns but are not a current away-record surface. They do not provide a current location, reason, or return lifecycle.
- `isOut` is still one boolean consumed by map presentation, feature availability, mail, Status Sync, archive recovery, and some narrative branches. It cannot by itself explain why a resident is away or which contacts are suitable.
- UI disabled states for form and item actions are not duplicated in their underlying controllers. The present behavior depends on the normal UI route remaining the gate.
- The permanent `gotham-test` fixture is a deliberate testing exception that keeps its `isOut` value through merge, Status Sync, and daily restoration. It is not a general resident-presence lifecycle.

## 4. Recommended Phase 3B scope

### World Bible intent

The World Bible describes absence as continued independent life, not disappearance or rejection. It also keeps communication, knowledge visibility, relationship depth, and form expression distinct from physical location.

### Safest boundary to evaluate next

The smallest future boundary is an **interaction-facing root adapter** that consumes the existing `Meeow.presence` interpretation and existing cat records without taking ownership of presence transitions.

At a conceptual level, that boundary can keep three concerns separate:

1. **Away profile access:** interpret the resident as viewable even when immediate in-hall actions remain unavailable.
2. **Limited communication routing:** make an existing route's limited-contact behavior explicit without treating `communicationMode` as a universal permission check or changing form rules.
3. **Away record presentation:** select among existing monitoring and travel-related records without redefining them as a new memory store.

This is a boundary recommendation, not a feature specification. It does not decide UI layout, content policy, prompts, field additions, data migration, or which existing route should be preferred.

### Keep outside the initial boundary

- **Memory system:** `Meeow.memory` should remain a read-only context builder. It should not become the owner of profile access, record presentation, or presence transitions.
- **Exploration and visits:** retain their current start/return and episodic-record workflows; they are integration cases, not the away-state owner.
- **Status Sync mutation:** keep exact-ID validation, full-response completion, map application, and `isOut` writes in the existing authoritative root path.
- **Save schema and migration:** this audit identifies no schema change. Existing cat-owned records remain the current storage reality.
- **AI infrastructure and prompts:** the queue, transport, validators, and current interaction prompts are outside this audit's recommended boundary.

## 5. Explicit non-goals

This audit does not authorize or require:

- a new away reason, destination, return-time, unavailable subtype, or relationship field;
- a general resident presence lifecycle or Status Sync contract change;
- new exploration, travel, rewards, notifications, gameplay loops, or balancing rules;
- global sharing of private memory, travel knowledge, or one resident's opinion;
- CAT-form human dialogue or disclosure beyond existing form rules;
- a replacement for existing `diary`, `logs`, `travelogues`, phone history, or Status Sync state.

## Reference locations

- `js/meeow-presence.js`: pure `isOut` interpretation and descriptive communication mode.
- `index.html`: hall-card template, map adapters, `handleCatClick()`, `hackCamera()`, `sendMessageInternal()`, phone chat, Focus, Reader, item interaction, visits, exploration, Status Sync, and archive restoration.
- `docs/WORLD_BIBLE.md`: future-world rules for resident presence, relationship perspective, trust/disclosure, and form expression.
- `docs/V2_1_LIVING_WORLD_DESIGN.md`: future design intent for memory ownership, resident presence, and independent relationships.
- `docs/AWAY_STATE_AUDIT.md`: prior read-only audit of broader presence-state ownership and lifecycle boundaries.
