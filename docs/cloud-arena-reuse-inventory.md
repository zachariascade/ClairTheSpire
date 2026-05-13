# Cloud Arena Reuse Inventory

This is a working map of concepts and files from the downloaded `CloudArena/` project that may be useful when building ClairTheSpire. The recommendation is to reuse ideas and small modules selectively, not to make the old project the foundation.

## Best Things To Borrow

### Deterministic Combat Core

- `CloudArena/src/cloud-arena/core/engine.ts`
  - Useful pattern: one `applyBattleAction(state, action)` entry point for all state transitions.
  - Good ideas to carry forward: explicit phases, action validation, pending target resolution, cleanup after each action, win/loss checks, and battle log events.
  - For ClairTheSpire, this should become a clean turn-flow reducer with an added enemy attack timeline/reaction phase.

- `CloudArena/src/cloud-arena/core/create-battle.ts`
  - Useful pattern: battle creation from a small, deterministic input object.
  - Good ideas to carry forward: seeded shuffle, initial hand draw, enemy actor setup, slot counts, and initialized logs.
  - For ClairTheSpire, adapt this around one character, one enemy, Perfection, and attack pattern definitions.

- `CloudArena/src/cloud-arena/actions/legal-actions.ts`
  - Useful pattern: derive legal player actions from state instead of letting UI decide what is possible.
  - Good ideas to carry forward: card play checks, targeting checks, ability checks, and grouped action options.
  - For ClairTheSpire, this can power card buttons and reaction-state restrictions.

### Data-Driven Cards And Effects

- `CloudArena/src/cloud-arena/core/types.ts`
  - Useful pattern: card effects, selectors, conditions, triggers, value expressions, counters, and keywords are all explicit TypeScript data.
  - Good ideas to carry forward: `Selector`, `Condition`, `ValueExpression`, `Effect`, and `Trigger` concepts.
  - For ClairTheSpire, keep the language much smaller at first: damage, block, parry window modifiers, dodge modifiers, counter prep, Perfection gain/spend, and simple statuses.

- `CloudArena/src/cloud-arena/core/effects.ts`
  - Useful pattern: centralized effect resolution.
  - Good ideas to carry forward: target requests, optional targeting, counter/status application, card movement, and log emission.
  - For ClairTheSpire, this should resolve card effects and reaction outcomes, while Phaser handles timing and animation.

- `CloudArena/src/cloud-arena/core/selectors.ts`
  - Useful pattern: selectors are a small query language over combat objects.
  - Good ideas to carry forward: targeting cards/permanents by zone, controller, type, subtype, relation, and context.
  - For ClairTheSpire, simplify selectors around player, enemy, attack timeline, hand, discard, and active defenses.

### Enemy Intent And Patterns

- `CloudArena/src/cloud-arena/core/enemy-plan.ts`
  - Useful pattern: enemies expose a plan/queue that can be converted into readable intent.
  - Good ideas to carry forward: deterministic plan steps, repeatable behaviors, and preview labels.
  - For ClairTheSpire, use this idea for attack patterns such as quick slash, heavy overhead, and three-hit combo.

- `CloudArena/src/cloud-arena/core/enemy-intent.ts`
  - Useful pattern: intent is a structured object plus a display formatter.
  - Good ideas to carry forward: attack amount, hit count, block amount, special effects, and concise labels.
  - For ClairTheSpire, extend intent with timing data: beats, windup, parry windows, dodge windows, feints, and punish/counter windows.

- `CloudArena/src/cloud-arena/scenarios/types.ts`
  - Useful pattern: scenario presets combine player health, deck, enemy definitions, and recommended simulation bounds.
  - Good ideas to carry forward: named encounters that can be started instantly for playtesting.
  - For ClairTheSpire, create tiny scenario presets for each enemy attack pattern and tuning experiment.

### Session And UI Boundary

- `CloudArena/src/cloud-arena/session-core.ts`
  - Useful pattern: separates persistent session records from battle state snapshots and action history.
  - Good ideas to carry forward: replayable action history, normalized action records, and snapshot generation.
  - For ClairTheSpire, use this after the first prototype loop works, especially for debugging playtests.

- `CloudArena/apps/cloud-arena-web/src/lib/cloud-arena-battle-view-model.ts`
  - Useful pattern: build a UI-specific view model from the raw game/session state.
  - Good ideas to carry forward: group actions, denormalize hand/draw/discard/graveyard, expose current intent, and keep UI mapping outside the engine.
  - For ClairTheSpire, React should consume a view model while Phaser owns real-time enemy attack presentation.

- `CloudArena/apps/cloud-arena-web/src/components/cloud-arena-hand-tray.tsx`
  - Useful pattern: hand tray, pile inspection, health/block change flashes, and action dispatch.
  - Good ideas to carry forward: card hand ergonomics and pile modals.
  - For ClairTheSpire, rebuild visually rather than porting directly.

### Tests Worth Using As A Coverage Model

- `CloudArena/tests/cloud-arena/combat-engine-basic.test.ts`
- `CloudArena/tests/cloud-arena/combat-engine-edge-cases.test.ts`
- `CloudArena/tests/cloud-arena/effects.test.ts`
- `CloudArena/tests/cloud-arena/selectors.test.ts`
- `CloudArena/tests/cloud-arena/targeting.test.ts`
- `CloudArena/tests/cloud-arena/triggers.test.ts`
- `CloudArena/tests/cloud-arena/value-expressions.test.ts`
- `CloudArena/tests/cloud-arena/battle-view-model.test.ts`
- `CloudArena/tests/cloud-arena/local-session.test.ts`

The exact tests are old-game-specific, but the coverage categories are excellent. ClairTheSpire should have tests for turn flow, card effects, legal actions, enemy attack timelines, parry/dodge outcomes, Perfection changes, and UI view-model mapping.

## Concepts To Reuse Carefully

### Permanents, Battlefield Slots, And Summons

Cloud Arena has a rich permanent/battlefield system. ClairTheSpire may not need this immediately. Reuse the idea only if summons/intercepts are part of the prototype. Otherwise, start with player, enemy, hand, draw, discard, active statuses, and the enemy attack timeline.

Relevant files:

- `CloudArena/src/cloud-arena/core/permanents.ts`
- `CloudArena/src/cloud-arena/core/derived-stats.ts`
- `CloudArena/src/cloud-arena/core/counters.ts`
- `CloudArena/src/cloud-arena/core/triggers.ts`

### Large Card Definition Registry

Cloud Arena has many hand-authored card definition files under:

- `CloudArena/src/cloud-arena/cards/definitions/`
- `CloudArena/src/cloud-arena/cards/definitions.ts`

This is useful as a content style reference, but too large for ClairTheSpire's first slice. Start with a tiny `src/game/data/cards.ts` or similar containing Strike, Guard, Focus, Riposte Prep, Crescendo, Flow Cut, and Recovery Step.

### Simulation And Heuristic AI

Simulation is useful later, but not first. The prototype needs human feel testing more than automated play.

Relevant files:

- `CloudArena/src/cloud-arena/simulation/run-simulation.ts`
- `CloudArena/src/cloud-arena/simulation/run-batch-simulations.ts`
- `CloudArena/src/cloud-arena/ai/heuristic-agent.ts`

Note: `heuristic-agent.ts` is marked deprecated in its own source, so use it as a thinking reference only.

## Things Not To Inherit

- Do not inherit the whole Cloud Arena app structure.
- Do not inherit the legacy replay/trace surface. The Cloud Arena docs call replay and trace visualization a dead end.
- Do not start with the full effect language, full battlefield model, full scenario catalog, or all card definitions.
- Do not let MTG-style permanents and targeting dominate the new game's identity before the parry/action layer proves itself.

## Recommended First Borrowing Plan

1. Start a clean TypeScript/React/Phaser app for ClairTheSpire.
2. Create the smallest reaction sandbox first: one enemy, one timing pattern, parry/dodge inputs, hit feedback, and Perfection deltas.
3. Create a small combat state type inspired by `core/types.ts`, but scoped to the prototype.
4. Implement one reducer-style `applyCombatAction` inspired by `core/engine.ts`; keep authoritative rules here, not inside Phaser or React.
5. Implement `enemyAttackPattern` data inspired by enemy intent/plan, but with timing beats.
6. Implement `getLegalActions` for card play, end-turn actions, and reaction-state restrictions.
7. Keep React UI state mapped through a view model, inspired by `cloud-arena-battle-view-model.ts`.
8. Add tests based on the Cloud Arena coverage categories before adding more cards.

## Porting Boundary

Borrow concepts before code. The first ClairTheSpire implementation should define its own state model, action names, timing events, and Perfection rules before any Cloud Arena modules are copied or adapted. If a Cloud Arena file is reused directly, it should be small, isolated, and reshaped around the new game's combat loop rather than pulling the old battlefield or targeting model along with it.
