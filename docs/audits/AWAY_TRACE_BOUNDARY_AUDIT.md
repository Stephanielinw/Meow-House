# Meeow House V2.1 — Away Trace and Resident Knowledge Boundary Audit

## Purpose and reading rules

This is a read-only audit of the current systems that can describe or expose a resident's life while away. It uses `WORLD_BIBLE.md` and `V2_1_LIVING_WORLD_DESIGN.md` as future-world intent only. Current runtime code remains the source of truth for implemented behavior.

The audit does not prescribe fields, storage changes, prompts, implementation mechanics, or feature behavior.

## 1. Current implementation mapping

### 1.1 Resident-owned data used as knowledge/context

| Data | Current owner and writers | Current consumers | User visibility today |
| --- | --- | --- | --- |
| Identity and relationship reference | Persisted cat fields such as `prompt`, `personality`, `affinity`, `hallId`, and appearance; built-in data profiles provide defaults. | `Meeow.memory.buildCatIdentityBlock()` and `buildCatMemoryContext()`; roleplay, exploration, mail, and other AI prompts. | Core profile facts and affinity are visible in the UI; the full prompt is not presented as a user-facing record. |
| Current state | Cat fields including `status`, `innerVoice`, `isOut`, form, map fields, and update timestamps. `setCatStatus()` and Status Sync apply paths write much of this state. | Profile/card/map presentation, Status Sync, memory context, interaction flows. | Status is visible broadly. The current detail card also renders `innerVoice`, so it is not a private-only runtime field. |
| Direct interaction history | `cat.chatHistory` and `cat.todayInteractions`; root chat, item, focus, exploration, and visit flows append entries. | Memory context, archive snapshot and diary generation. | Chat is user-facing on its own route. `todayInteractions` is primarily a continuity/archive source rather than a dedicated record view. |
| Monitoring timeline | `cat.diary`, written through `appendMonitorEvent()` by Status Sync and other flows. `generateFullDiary()` can add generated monitoring entries. | Standard memory context, mail prompt context, daily archive/diary generation. | The monitoring modal displays it to the USER. It is therefore not an access-controlled private stream. |
| Permanent diary | `cat.logs`, written by daily diary, exploration return, visit return, and other root workflows. | Standard memory context, mail prompt context, daily archive. | The existing logs modal displays it to the USER. |
| Travelogues | `cat.travelogues`, currently written after user-led exploration and cross-hall visit return. | Explore gallery, `Meeow.memory`, outgoing-mail prompt context, daily archive, and the new Away Record Viewer. | Directly user-visible in the Explore gallery and, for an away resident, the Away Record Viewer. |
| Focus reports | `user.missionReports`, created by focus/settlement flows. | Current-day memory focus context and daily archive. | Visible through reports/archive surfaces. |

`Meeow.memory` is a read-only context formatter. It combines selected cat state, interaction history, monitoring, permanent diary, current-day focus records, travelogues, and the previous house briefing for AI consumers. It does not currently model record owner, witnesses, participants, visibility, or acquisition method.

### 1.2 User observation channels

| Channel | What the USER can currently see | Current boundary |
| --- | --- | --- |
| Hall cards, profile, and map | Hall roster, current status, `isOut` presentation, map placement for in-hall residents, and detail-card inner voice. | Physical presence affects presentation, but a stored state value is broadly displayed; no privacy classification is applied. |
| Homepage Chat | The user-visible conversation and the resulting current state updates. Away residents retain existing limited/automatic-reply behavior. | The route supplies selected memory/context to AI, but no separate visibility ledger exists for what each resident learned. |
| Phone chat | Public-identity phone conversations and associated phone chat history. | This is a separate expression route from Homepage Chat; its prompt rules preserve the cat-secret premise but it is not a general knowledge-permission system. |
| Monitoring / diary modal | `selectedCat.diary`, including status-driven monitor events and manually/generated monitoring records. | The USER can open the timeline; the data model does not distinguish private resident knowledge from observable monitoring. |
| Permanent logs modal | `selectedCat.logs`, including generated daily diary content and return summaries. | This is a resident-expression surface, but all stored entries are viewable once opened. |
| Away Record Viewer | The away resident's current status plus existing `travelogues`, shown in reverse chronology; empty when none exist. | It creates no record and reads no diary, logs, interaction history, mailbox, or hidden-form data. Travelogues are already user-visible traces and are not asserted to be Away events. |
| Explore travelogue gallery | Existing `travelogues` for residents in the current hall. | Records come from user-led exploration or cross-hall visits, so they are not evidence of an independent-away lifecycle. |
| Mailbox | Stored mail from an out resident, with content and any attached item. `generateMail()` may choose an `isOut` sender. | Mail is an explicit delivery to the USER, but it presently draws on several cat record types and uses no provenance policy. |
| Reports, phone applications, and status displays | Mission reports, phone application content, public moments/news, and current status. | These are distinct presentation systems; they do not currently share a common resident-knowledge or trace-visibility boundary. |

## 2. Information visibility boundaries

### Current implementation

The runtime has **record ownership by storage location**—for example, cat-owned arrays and user-owned mission reports—but it does not have an enforced distinction between resident-private knowledge, witnessed knowledge, house-shared knowledge, and USER-observable traces.

- `innerVoice` is a cat state field but is rendered on the detail card.
- `diary`, `logs`, and `travelogues` are cat-owned arrays, yet each has a user-facing reader or indirect user-facing consumer.
- `buildCatMemoryContext()` selects records by relevance and budget, not by participant or visibility rules.
- Current prompts may describe secrecy or form constraints, but there is no stored proof of how another resident learned a fact.

### World Bible intent

The World Bible treats knowledge as perspective-bound: private events remain owned by their resident unless a legitimate acquisition path makes them visible. Trust does not grant omniscience, and CAT-form expression does not allow verbal disclosure beyond the form's limits.

This is an intent / implementation difference. The current code does not yet provide a data-level provenance or visibility boundary, and this audit does not change that fact.

## 3. Away, memory, diary, and trace separation

| Concept | Intended conceptual role | Current implementation reality |
| --- | --- | --- |
| Away Record | A limited, user-visible trace of life outside the hall: an observable result rather than a complete account. | The dedicated viewer currently reads existing `travelogues` only. It has no independent away-record store, generator, or lifecycle. A travelogue may describe exploration or visiting rather than independent absence. |
| Resident Memory | What the resident experienced, interpreted, remembers, or chooses to retain privately. | No separate private-memory store exists. AI context is assembled from shared cat fields and historical arrays without participant/visibility metadata. |
| Diary | A selected expression window: reflection or partial disclosure rather than an omniscient transcript. | `logs` are permanent diary entries; `diary` is a monitoring timeline. Both are currently user-readable, and some are AI-generated from supplied context. |
| Mailbox | An explicit item of communication delivered to the USER. | `generateMail()` can select an out resident and writes a user mailbox entry. It is distinct from the Away Record Viewer but currently draws on monitoring, diary, travelogue, and current-status context. |
| Current status | A present-tense state description. | `status`, `innerVoice`, and `isOut` are authoritative cat state used by the UI and Status Sync; they are not an away-event history. |

The important current distinction is therefore **source and presentation**, not information rights: travelogues, diaries, and mailbox entries have separate arrays/routes, but they are not yet protected by a unified visibility model.

## 4. Exploration separation

### Current exploration model

Exploration is a user-led adventure workflow in `index.html`. It owns transient `exploreState`, destination/location selection, companion selection, scene history, AI narration, dice/check processing, settlement, rewards, and return presentation.

`selectExploreCompanion()` rejects an away resident as the user's companion. On a normal return, `finishExploration()` can write a travelogue, interaction event, monitor event, permanent log, affinity/reward changes, and a post-return status update for the companion. Cross-hall visiting has a parallel but separate return workflow that also writes a travelogue and return traces.

### Shared state and mixing risk

Exploration and resident absence are not the same current domain:

- Exploration begins from a USER-selected outing with a present companion.
- Resident Away is represented only by the cat's `isOut` state and associated feature-specific behavior.
- The shared `travelogues` array is the principal overlap: it is used by exploration/visit returns, memory context, outgoing-mail context, the Explore gallery, daily archive, and the Away Record Viewer.
- `status`, `diary`, `logs`, and `todayInteractions` are also shared continuity sources, so a future feature must not treat their presence alone as proof of an independently generated away event.

The current Away Record Viewer deliberately shows already-visible travelogues without reclassifying them. It does not turn user-led exploration into resident-independent life.

## 5. Existing reusable systems

- **Presence interpretation:** `Meeow.presence` derives in-hall versus away from the existing `cat.isOut` flag without owning transitions or storage.
- **Read-only trace presentation:** the Away Record Viewer can display an explicit resident subject and existing travelogue records without changing cat data.
- **Episodic record stores:** `travelogues`, `diary`, `logs`, `chatHistory`, `todayInteractions`, and `missionReports` already preserve different kinds of continuity data.
- **Explicit delivery channel:** the mailbox is an existing USER-facing communication surface with a sender identity and persisted item payload.
- **Exploration settlement:** user-led exploration already demonstrates its own contained sequence from narrative history to return traces; it remains a separate workflow.
- **Bounded memory formatting:** `Meeow.memory` already selects limited records for an AI context, while remaining non-authoritative over their writes.

## 6. Future implementation risks

- Treating any `travelogues` entry as proof of independent-away activity would conflate user-led exploration and cross-hall visits with resident absence.
- Reusing `diary` or `logs` as a hidden-away-event stream would expose monitoring or reflection as if it were an observable trace.
- Passing all stored cat records to every AI caller can cause one resident's private or unrelated history to become inappropriate shared knowledge without an acquisition path.
- Letting an away-view UI generate, infer, or persist content would merge observation with simulation and make the UI an implicit state owner.
- Folding mailbox, exploration, and Away Record presentation into one record type would erase their existing trigger and audience differences.
- Any future external-life feature must preserve existing CAT-form limits: an away resident's knowledge does not authorize human dialogue or direct revelation in CAT form.

## 7. Recommended conceptual separation

This is a boundary recommendation, not an implementation specification.

| Domain | Keep conceptually separate from | Boundary to preserve |
| --- | --- | --- |
| Away | Exploration | Away describes resident presence outside the hall; exploration is a USER-led adventure session. Shared traces do not make their lifecycles identical. |
| Away Record | Resident Memory | The record is a deliberately limited USER-visible trace, not a complete account of what the resident knows or experienced. |
| Diary | Away Record | A diary is a resident expression/reflection surface; an away record is an observable trace. Neither should automatically substitute for the other. |
| Mailbox | Away Record | Mail is explicit communication addressed to the USER; a trace can exist without a message, and a message does not disclose every event behind it. |
| Memory | All presentation surfaces | Memory should preserve character continuity and perspective; UI surfaces should expose only the information their existing route legitimately presents. |

Future work can use this separation to evaluate ownership and visibility without changing the current `isOut` state, existing save schema, Status Sync contract, exploration lifecycle, or current record arrays.

## Reference locations

- `index.html`: cat state, record writers, current UI surfaces, Away Record Viewer, mail, chat, phone, exploration, visit return, daily archive, and persistence wiring.
- `js/meeow-memory.js`: bounded memory/context builders and their selected record sources.
- `js/meeow-storage.js`: root save persistence for the existing user/cat/hall state.
- `docs/WORLD_BIBLE.md`: intended knowledge ownership, visibility, presence, trust/disclosure, and form rules.
- `docs/V2_1_LIVING_WORLD_DESIGN.md`: future conceptual design for memory ownership, resident presence, and independent relationships.
