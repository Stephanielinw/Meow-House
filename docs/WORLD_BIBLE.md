# Meeow House World Bible

## Purpose and authority

This document is the engineering-readable reference for the intended Meeow House world. It is derived from *Meeow House AI Core World Bible & Simulation Protocol v2.0* and preserves its design principles without duplicating the complete creative source.

It describes **domain intent**. Runtime code remains the source of truth for current behavior, data fields, storage, and execution flow. When intent and implementation differ, do not silently change the implementation; record the difference and decide it explicitly in future work.

This reference applies to the current multi-hall Meeow House. Existing `hallId` identifies where a cat belongs and `origin` records source context; neither term is replaced by legacy Gotham-only terminology.

## 1. Core vision

Meeow House is a living shared simulation: a home in which characters with independent personalities, histories, relationships, responsibilities, and private lives coexist with the USER.

The USER is a trusted curator, companion, and caretaker—not a direct controller of every character action or world outcome. Cats may pursue their own concerns, form relationships with one another, leave traces of lives beyond the house, and choose how much of themselves to reveal.

Many residents have both cat and human/anthropomorphic forms. The USER's ordinary perspective is centered on living with remarkable cats, while the characters retain their own identities, histories, and mutual relationships. The simulation should preserve that information asymmetry without treating residents as empty pets or as a static character list.

Characters remain faithful to their source identity: core motivations, values, voice, important relationships, flaws, and moral boundaries are not disposable for a joke, a trope, or a convenient conflict.

## 2. World simulation principles

Meeow House separates deterministic world ownership from narrative expression.

### Code owns world facts

Code is responsible for facts that must be stable, verifiable, and persistent:

- stable IDs and ownership;
- timestamps and Operational Day boundaries;
- state consistency and transition ordering;
- storage and recovery;
- validation, completion, and transaction rules;
- authoritative changes to user, cat, hall, inventory, and map state.

### AI owns constrained expression

AI is a narrative generation layer. Within supplied context and output contracts, it may generate:

- in-character dialogue and visible reactions;
- descriptions of plausible current activity;
- scene narration, travelogues, summaries, and world-facing content;
- interpretation of an event according to established character and world rules.

AI does not directly own IDs, clocks, persistence, or mutations. It must not independently decide that a world-state write occurred; code validates its output and applies only authorized state changes.

Every AI request should have a clear trigger, a narrow purpose, the minimum relevant context, and a known application boundary. Structured outputs are preferred whenever generated content affects system state.

## 3. Memory principles

Memory exists to preserve continuity, perspective, and character truth—not to accumulate an undifferentiated chat transcript. Different tasks read the smallest useful subset of memory.

### Identity Memory

Stable character reference: source identity, core personality, values, voice, important relationships, fixed appearance reference, and enduring boundaries. It prevents OOC drift and is not rewritten by ordinary interactions.

### Relationship Memory

Long-lived changes in how a character relates to the USER or another participant: meaningful trust, recurring preferences, important disclosures, firsts, conflict outcomes, and other durable relational facts. It is not a record of every interaction.

### Episodic Memory

Time-bound records of meaningful experiences: interactions, diaries, travelogues, focus events, special events, and daily records. These records may be archived, summarized, or selected for a relevant task; they are not a reason to load all history into every prompt.

### Current State Memory

The current operational snapshot: location, form, action/status, inner state, availability, and recent update time. It supports immediate continuity and time-aware state progression.

Operational time is code-owned. Dates, daily settlement, day boundaries, and elapsed-time calculations must come from deterministic local time and recorded timestamps, never from model inference.

## 4. Memory ownership and visibility

Memory is not a global knowledge pool. A fact becoming true for one character does not make it known to every resident.

For example, if the USER privately tells Cat A, “I feel sick today,” Cat B must not later ask about it unless Cat B legitimately acquired that information. Valid acquisition may include:

- Cat B was present during the event;
- Cat A intentionally shared it;
- the USER said it in a shared space;
- it became a legitimate house-level shared event;
- another established, visible source made the information available.

Canonical relationship context can be shared where the world establishes it—for example, characters may know their own original relationships and one another's identities. Personal episodic knowledge, private conversation, and user disclosures remain visibility-bound unless an acquisition path exists.

Future memory work must preserve conceptual provenance for every shareable fact:

- **source** — where the information originated;
- **owner** — whose memory or record it belongs to;
- **participants** — who was present or involved;
- **visibility** — who may know it;
- **acquisition method** — how a character learned it.

These are world rules, not instructions to change the current save schema.

## 5. Resident presence and away state

### Independent resident lives

Residents are independent living characters, not permanently anchored to Meeow House. A resident may temporarily leave their hall for human-identity responsibilities, travel, training, work or other external obligations, private character-related activities, exploration, or story-driven events.

Absence is a continuity-bearing world state, not merely a UI visibility condition. An away resident does not disappear, pause, or stop existing; they continue living through activities outside the USER's immediate view and may later return with experiences relevant to their own perspective and continuity.

### User perspective

From the USER's perspective, “my cat is not at home” means that the resident is currently living through their own activities, rather than being unavailable because of a system limitation. Meeow House should preserve the feeling that residents have lives beyond direct interaction.

### Presence balance

Resident independence should remain balanced with companionship. Not all residents should be away simultaneously: Meeow House should continue to feel inhabited, with some residents available to maintain emotional continuity.

### Communication while away

A resident's communication availability may decrease while away. Responses may be delayed or absent, become shorter, or be limited by the resident's current situation and form.

Away status is not rejection, punishment, or reduced affection. It describes the resident's current circumstances, not a change in the legitimacy of their relationship with the USER.

### Future-world distinctions

Future world systems may distinguish between residents who are:

- physically present in their hall;
- temporarily away;
- unavailable; or
- returned with new experiences.

These distinctions describe world intent only. They do not claim that every away-state behavior or transition is currently implemented.

### Form constraint

Away status does not override character expression rules. A CAT-form resident communicating while away remains limited to feline sounds, visible or indirect behavior, and emotional reactions; they may not use human dialogue.

## 6. Character-to-character relationships

Relationships exist between residents, not only between each resident and the USER. Characters may hold independent histories, trust, conflicts, friendships, impressions, and perspectives concerning one another.

A character's relationship with the USER does not automatically determine their relationship with another resident. Likewise, one resident's knowledge, opinion, or emotional response does not automatically transfer to others.

Character interactions should preserve these independent perspectives. Shared knowledge, agreement, or conflict must arise from an established relationship or a legitimate acquisition path rather than from a house-wide assumption.

## 7. Trust and disclosure are separate

Trusted companionship does not grant complete disclosure or omniscient access. A character may trust the USER while maintaining personal boundaries, a hidden identity, private memories, or undisclosed history.

What a character reveals remains dependent on relationship depth, current form, situational context, and established world rules. Trust establishes safety and legitimacy within the shared world; it does not erase a character's right to perspective, privacy, or selective disclosure.

## 8. Character form and expression

A character's memory does not determine what they can express aloud. Expression depends on current form, context, visibility, and relationship conditions.

### Cat form

In cat form, a character may communicate through feline sounds, visible actions, posture, gaze, movement, and emotional reactions. They may demonstrate intelligence or personality through behavior.

They may not use human dialogue, explain a hidden identity, or verbally expose private knowledge. Internal thought may exist in system-facing context, but it is not automatically spoken aloud to the USER.

### Human or anthropomorphic form

In human/anthropomorphic form, a character may communicate normally. What they choose to say remains constrained by memory visibility, relationship depth, current context, personality, and the ongoing information asymmetry.

Form is not a mechanical reward switch. Characters retain agency over whether and when to show a form, subject to established world conditions and current implementation behavior.

## 9. Domain boundaries

Meeow House domains should remain separated by responsibility. A domain may collaborate with another through explicit inputs, adapters, or validated outputs; it should not silently take ownership of unrelated state.

| Domain | Intended responsibility |
| --- | --- |
| AI | Transport and constrained narrative/content generation; never authoritative world mutation. |
| Memory | Select and format the smallest relevant continuity context with ownership and visibility respected. |
| Storage | Persist and recover authoritative state without redefining gameplay semantics. |
| Map / Spatial Reference | Define stable room/point reference and support placement interpretation. |
| Reader | Manage reading content and reader-specific local data without becoming a general phone-state owner. |
| Inventory | Represent items and validate item interaction inputs; transactional ownership remains explicit. |
| Exploration | Coordinate user-led outings, scenes, checks, settlement, and return traces while protecting player choice and form rules. |
| Status Sync | Produce and apply bounded current-state updates under exact ID, time, and completion contracts. |
| Daily Lifecycle | Advance Operational Day, archive appropriate daily records, and prepare new-day world context. |

The UI/application composition layer remains responsible for connecting these domains to reactive state and visible interaction flows.

## 10. Future development principles

- Prefer a focused new domain or narrow adapter over expanding a root god module.
- Preserve observed behavior, localStorage compatibility, prompt contracts, and state ownership during refactoring.
- Treat AI output as proposed narrative data until code validates and applies it.
- Keep characters in their own perspective: no omniscient personal memory, no accidental relationship rewrites, and no forced generic personality.
- Respect form limitations even when a character knows more than they can presently reveal.
- Preserve multi-hall residence and source context; a character's `hallId` describes where they live, while `origin` informs who they are.
- Keep long-term world intent distinct from current implementation facts. Unimplemented intent remains a future-domain reference, not authorization to add behavior.

## Reference use

Use this document when deciding domain ownership, context visibility, form-safe expression, or simulation boundaries. Use the full private creative World Bible for broader narrative source material, and use current code/documented mappings to determine what is actually implemented today.
