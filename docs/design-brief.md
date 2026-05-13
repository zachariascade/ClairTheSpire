# ClairTheSpire Design Brief

## Core Idea

ClairTheSpire is a hybrid deckbuilder, turn-based strategy game, and reactive parry/action combat system.

Primary inspirations:

- Slay the Spire
- Clair Obscur: Expedition 33
- Sekiro
- character-action games
- rhythm and parry systems

The game should feel like strategic combat with expressive defensive gameplay. It is not a pure action game and not a pure deckbuilder.

## Combat Structure

Combat follows a Slay the Spire-like cadence:

1. Player turn begins.
2. Player plays cards and spends resources.
3. Player sets up attacks, blocks, counters, summons, buffs, or stance/resource changes.
4. Enemy turn begins.
5. Enemy attacks resolve as interactive timing sequences.

Enemy attacks are telegraphed, animated, and timing-based. Example patterns include:

- 3-hit combo
- delayed overhead strike
- projectile burst
- feint attack
- rhythm sequence

The player can respond with:

- parry
- dodge
- block from cards
- counter effects
- summons or intercepts

For the first prototype, parry, dodge, block modifiers, and counter prep are in scope. Summons and intercepts are later design space unless they become necessary to prove the defensive loop.

## Combat Philosophy

The game must not collapse into "just parry everything."

The intended balance:

- Strategy determines survivability.
- Execution determines efficiency and scaling.
- Deckbuilding reduces execution burden.
- Strong execution can rescue weak builds.
- Strong builds improve consistency and shorten fights.

Players should be treated as probabilistic, not perfect. Long fights, layered attack patterns, and escalating complexity make pure execution unreliable enough that scaling and defensive planning remain valuable.

## Defensive Design

Defense cards should stay relevant by modifying the reactive combat layer instead of merely adding block numbers.

Potential defensive effects:

- widen parry windows
- reduce failed-parry damage
- convert perfect parries into resources
- simplify enemy combos
- auto-block certain hit types
- prepare counters or intercepts
- reduce damage taken after a mistimed input

This creates the desired synergy: deckbuilding shapes execution difficulty, and execution expresses the build.

## Character Design Philosophy

Characters should not map cleanly to tank, mage, or rogue archetypes.

Each character should:

- change combat psychology
- define a unique combat economy
- alter emotional pacing
- redefine what "good play" means

Design principle:

> Mechanics should express personality.

## Character Concept: Perfection

The Perfection character is built around flow state, precision, and stylish dominance.

Perfection increases through:

- perfect parries
- successful combos
- clean execution
- maintaining rhythm
- avoiding damage

Higher Perfection can:

- amplify damage
- upgrade cards during combat
- unlock enhanced effects
- enable finishers
- modify animation and VFX intensity

Perfection can fall or collapse from:

- taking damage
- failed parries
- broken rhythm
- dropped combo state

Perfection is both a scaling state and a spendable resource.

For the first playable, keep Perfection narrow: gain it from clean reactions, lose it from failed reactions or damage, and spend it on one clear payoff. Card upgrades, tempo changes, and transformation-like states should wait until the simpler version creates satisfying pressure.

Example cards:

- Crescendo: consume all Perfection to deal scaling damage and reset combo state.
- Flawless Riposte: requires high Perfection, performs a major counterattack, and grants a free follow-up.
- Perfect Form: at max Perfection, transforms cards while tightening timing windows and increasing combat tempo.

Emotional pressure:

> Do not lose momentum.

## Character Concept: Stance / Fencer

Post-prototype concept.

The Stance character is built around posture control, sequencing, and rhythm management.

Cards transition the player between stances such as:

- Virtuoso Stance
- Defensive Stance
- Counter Stance
- Aggressive Stance

Each stance changes:

- card effects
- parry behavior
- combo potential
- defensive properties
- resource generation

Example stance identities:

- Virtuoso Stance: high combo potential, bonus damage, tighter parry windows, rewards aggression.
- Defensive Stance: easier parries, damage reduction, counter generation, lower offensive output.
- Counter Stance: enhanced ripostes and punish-focused reactive play.

Core player question:

> Which stance do I want to end my turn in?

Example cards:

- Elegant Flourish: attack and transition to Virtuoso.
- Brace: gain defense, widen parry windows, and transition to Defensive.
- Riposte Line: stronger when used in Counter Stance.
- Flow State: bonus if multiple stance transitions occurred this turn.

## Animation And Production Strategy

The game should be 2D, readable, and lightweight.

Avoid:

- fully animated 3D
- high-frame hand animation
- large cinematic production pipelines

Preferred presentation:

- Slay the Spire-style layout
- layered sprites
- tweened animation
- VFX-driven motion
- readable anticipation and impact

Enemy layer model:

- body layer
- weapon layer
- eyes or glow layer
- shadow layer
- VFX layer

Animation tools:

- movement
- rotation
- scaling
- squash and stretch
- flashes
- particles
- screen shake
- anticipation frames

For parry gameplay, readability matters more than fidelity.

## Reusable Attack Templates

Build attacks from reusable archetypes:

- quick slash
- heavy overhead
- multi-hit combo
- delayed strike
- projectile cast
- charge attack
- AOE pulse

Enemies can reuse these templates with different art, timing, colors, effects, and damage profiles.

## AI Usage

AI can help with:

- enemy concepts
- sprite generation
- VFX ideas
- sound prompts
- rapid content iteration

Timing, game feel, responsiveness, and combat readability must be tuned manually.

## Engine Direction

Recommended stack:

- Phaser for the combat scene
- React for menus, deckbuilding, runs, map, and meta UI
- TypeScript for shared combat definitions and data

Authoritative combat state should be owned by shared TypeScript modules, not by Phaser or React. Phaser should handle timing, animation, input windows, and feedback; React should handle card and shell UI; the shared action/reducer layer should resolve rules, resources, combat logs, Perfection, and win/loss state.

Reasoning:

- fast iteration
- strong fit for web-first deck systems
- approachable 2D animation
- React is well-suited to cards and non-combat UI
- Phaser is sufficient for the interactive combat layer
