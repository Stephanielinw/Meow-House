# Meeow Living World master roadmap

This is the durable order for the Living World workstream. Read it at the start of each future Living World implementation or audit. Record the current step and the immediate next step; do not silently reorder, skip, or implement the next step without a user request. If a dependency changes, document the proposed change before altering this order.

## Completed foundation

Curator native spatial foundation; runtime visual integration; legacy placement reconciliation; free-floor navigation; floor/rug seam navigation; depth, motion, and rest coherence; Ambient Activity and Pose Capability; Persistent Settled World State V1; Industry Architecture Comparative Audit V1.

## Numbered workstream

1. **COMPLETE / LOCKED — Behavior Eligibility + Affordance + Claim + Interruption + Diagnostics Foundation V1.** Pure behavior candidates precede selection; the chosen behavior prepares its visual or destination; a session instance owns its lifecycle and existing destination reservation. Current stationary behaviors remain targetless. This step adds no Item, Furniture, or Social behavior.
2. **BLOCKED — Animation Binding + Chassis Anchor Contract V1.** Runtime binding, world-foot invariance, fallback, cancellation, and synthetic overlap/reveal conversion are implemented. Lock is withheld because an externally generated pixel-consistent clean body plate and motion frames have not been demonstrated; the current exact-fit converter cannot prove that ordinary AI output will avoid manual pixel repair. See the Step #2 QA handoff and conversion audit.
3. **NOT STARTED — Ambient Animation Slice V1.** First low-risk idle, observe, groom, and sleep animations; no target-dependent animation.
4. **NOT STARTED — Furniture Interaction Contract V1.** Generic interaction surface, approach, occupancy slot, transition, posture, affordance, occlusion, and exit; one complete reference furniture object.
5. **NOT STARTED — Furniture Behaviors V1.** Connect sleep, sit-idle, observe, and rest to authored furniture affordances, with contention and fallback.
6. **NOT STARTED — Owned Item Interaction Contract V1.** Exact item ID, ownership and semantic eligibility, claim, cancellation, cooldown, and behavior context. Preferences, Bond, and fondness remain bounded influences.
7. **NOT STARTED — Item Prop Presentation + Item Animation V1.** Frozen item visual identity, posture-relative prop presentation, first item-use animations.
8. **NOT STARTED — Social Interaction Contract V1.** Initiator, recipient, availability, shared instance, partner slots, claims, approach, phases, synchronized start, interruption, consequence receipt.
9. **NOT STARTED — Social Behaviors + Pair Animation V1.** PROGRAM-owned cat-to-cat behaviors and synchronized presentation.
10. **NOT STARTED — Structured Personality Integration V1.** Bounded inspectable weight modifiers after eligibility; Personality does not override physical availability.
11. **NOT STARTED — Behavior Selection Evolution V2.** Evaluate continuation, cooldowns, context, target attractiveness, relationships, and bounded Personality influence only where justified.
12. **NOT STARTED — Multi-Resident Performance + Scheduling V1.** Profile 1, 6, 12, and 20 visible residents before adding scheduling budgets; 55 global residents do not all need per-frame simulation.
13. **NOT STARTED — Five-Minute Watch Test V1.** Observe movement, repetition, destination reuse, synchronized decisions, contention, abrupt changes, dead time, crowding, and believable continuation.
14. **LATER — Inactive Room / Re-entry Simulation V1.** Active-room-first; later evaluate bounded inactive abstraction and event-jump catch-up.
15. **DEFER — Offline / Long-Term World Simulation.** Build only for a demonstrated product need; prefer idempotent event jumps over hidden continuous simulation.

At the end of every future pass, identify each step as NOT STARTED, IN PROGRESS, BLOCKED, COMPLETE, or COMPLETE / LOCKED, and name the immediate next step. Resolve Step #2's external-reference conversion blocker before starting Step #3.
