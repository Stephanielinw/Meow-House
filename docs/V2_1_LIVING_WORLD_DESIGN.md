# Meeow House V2.1 — Living World Design Draft

## Purpose and status

This document is a future design exploration for making Meeow House feel more like a living shared world. It develops the world intent recorded in `WORLD_BIBLE.md` while preserving the distinction between domain intent and current implementation.

It is a planning reference, not an implementation specification. It does not define fields, storage structures, APIs, gameplay loops, balancing rules, UI flows, or implementation mechanics. Current code and architecture mappings remain the source of truth for implemented behavior.

## 1. Memory ownership model

Memory should remain perspective-bound rather than becoming a global pool of facts. A resident's knowledge is shaped by what they experienced, witnessed, were told, or could legitimately learn through an established shared source.

### Private memories

Private conversations, internal reactions, undisclosed history, and personal observations belong to their owner. They do not become shared merely because they are important to the USER or to the wider story.

### Witnessed events

An event may become known to residents who were present and able to perceive it. Witnessing does not require identical interpretation: participants can remember the same event differently according to their own perspective, relationship, and context.

### Shared house knowledge

Some facts may become shared house knowledge when the USER communicates them publicly, when a resident intentionally shares them, or when an event is legitimately visible to the house. Shared knowledge remains distinct from every resident having access to all private details surrounding it.

### Relationship knowledge

Relationship knowledge is specific to the people involved. Trust, preferences, history, conflict, affection, and disclosures should not automatically transfer from one relationship to another.

### Acquisition paths and provenance

Future work should preserve the conceptual question of how a resident learned something. Legitimate acquisition can include direct experience, witnessing, intentional disclosure, public communication, or an established visible source. Provenance remains a world rule: it describes perspective and visibility without prescribing a data model.

## 2. Resident presence system

Resident presence should communicate that characters have independent lives while preserving Meeow House as an inhabited shared home.

### In-hall presence

An in-hall resident is presently available within the shared house environment. Presence supports ordinary companionship, spontaneous interaction, and the sense that the hall remains lived in.

### Away state

An away resident is temporarily living through matters outside the USER's immediate view: identity responsibilities, travel, training, work, private activities, exploration, or story-driven events. Away is continued existence and continuity, not disappearance or a system limitation.

### Unavailable state

An unavailable resident is not presently able to participate in ordinary interaction. This can reflect immediate circumstances without implying rejection, punishment, or a loss of affection.

### Returned with experiences

A returning resident may carry new experiences, impressions, or continuity from time spent away. What they reveal remains governed by perspective, relationship depth, current form, and context; return does not require complete explanation or disclosure.

### User perception and companionship balance

From the USER's perspective, an absent cat is living their own life rather than simply failing to appear. At the same time, resident independence should not empty the house: some residents should remain available so Meeow House retains companionship and emotional continuity.

### Communication while away

Communication can be delayed, absent, shorter, or constrained by current circumstances and form. CAT-form residents remain subject to CAT-form expression limits while away: they may communicate through feline sounds, visible or indirect behavior, and emotional reactions, but not human dialogue.

## 3. Character relationship model

Residents have relationships with one another as well as with the USER. These relationships should remain independent, source-faithful, and perspective-specific.

### Independent perspectives

Each resident may hold their own history, impressions, trust, friendship, conflict, admiration, resentment, or uncertainty toward another resident. One resident's opinion or knowledge does not establish another's.

### Relationship evolution

Relationships can change through meaningful interaction, shared experience, conflict, distance, repair, cooperation, and disclosure. Such change should remain situated in the relationship itself rather than being inferred from a resident's separate relationship with the USER.

### Conflict and friendship

Conflict, friendship, loyalty, and distrust can coexist with a shared home. They should arise from character perspective, source relationships, and legitimate events, not from an assumption that all residents agree, become friends, or share the same knowledge.

## 4. Non-goals

This draft does not authorize systems that would undermine the world rules above. In particular, future work should not introduce:

- omniscient personal memory or automatic house-wide disclosure;
- forced resident availability or the idea that absence is a relationship penalty;
- universal relationship knowledge, opinion transfer, or identical resident perspectives;
- CAT-form human dialogue, including verbal exposure of private knowledge that the form cannot naturally express.

## Reference use

Use this draft to assess whether future domain proposals preserve ownership, perspective, independent resident lives, relationship boundaries, and form-safe expression. Use `WORLD_BIBLE.md` for canonical world intent and the architecture/domain mapping documents for current implementation boundaries.
