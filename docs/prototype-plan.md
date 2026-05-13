# ClairTheSpire Prototype Plan

## Prototype Goal

Build the smallest version that can answer:

> Is the combat loop fun?

The prototype should test the relationship between card planning and timing-based defense. It should not attempt a full roguelike, final theme, large card pool, or polished production art.

The first playable should prove the reaction loop before the full card loop is complete. A tiny enemy attack sandbox with parry, dodge, hit feedback, and Perfection changes is more valuable than a complete deck UI that cannot yet answer whether defending feels good.

## Vertical Slice

Implement:

- one playable character: Perfection
- one enemy
- three enemy attacks
- one player deck
- parry
- dodge
- block or guard effects from cards
- Perfection gain, loss, thresholds, and spending
- lightweight enemy intent UI
- placeholder layered sprites and VFX

## Core Combat Loop

1. Draw hand.
2. Player spends energy to play attacks, defense, and setup cards.
3. Player ends turn.
4. Enemy executes one interactive attack pattern.
5. Player reacts with parry, dodge, or prepared defenses.
6. Resolve damage, counters, Perfection changes, and status effects.
7. Repeat until win or loss.

## Initial Player Stats

Starting tuning values should be simple and disposable:

- Health: 60
- Energy per turn: 3
- Hand size: 5
- Starting Perfection: 0
- Max Perfection: 10

Suggested Perfection behavior:

- perfect parry: +2
- normal parry: +1
- successful dodge: +1
- played clean combo finisher: +1
- take unblocked damage: -3
- failed parry: -2
- reaching 10 Perfection unlocks enhanced card effects

First-pass Perfection should stay intentionally small:

- gain Perfection from clean reactions
- lose Perfection from damage and failed reactions
- spend Perfection with Crescendo

Save card transformation, tempo changes, and max-Perfection mode effects until the basic loop is already satisfying.

## Initial Deck

Use a small deck that directly tests the system.

- Strike: deal damage.
- Guard: gain block and reduce failed-parry punishment this turn.
- Focus: widen the next parry window.
- Riposte Prep: next successful parry deals counter damage.
- Crescendo: spend Perfection for scaling damage.
- Flow Cut: attack, gains bonus if the player parried last enemy turn.
- Recovery Step: dodge support, mitigates one failed reaction.

## Enemy Attack Patterns

### Quick Slash

Purpose: baseline timing check.

- one fast hit
- short anticipation
- generous early tuning
- teaches parry feedback

### Heavy Overhead

Purpose: delayed timing and panic control.

- long windup
- late impact
- high damage
- dodgeable
- parry gives more Perfection than Quick Slash

### Three-Hit Combo

Purpose: sequence memory and pressure.

- three impact beats
- mixed spacing
- final hit has higher damage
- defense cards can simplify or soften this pattern

## Defensive Card Test Cases

Each defensive card should change the execution layer in a visible way.

- Focus widens the next timing window.
- Guard reduces damage from mistimed reactions.
- Riposte Prep rewards a successful parry with counter damage.
- Recovery Step protects the player from one failed input.

If these cards feel valuable even for a skilled player, the design is on the right track.

## Phaser + React Architecture

Recommended separation:

- React owns shell UI, deck display, card buttons, run state, menus, and future map screens.
- Phaser owns enemy animation, hit timing, input windows, combat VFX, and impact feedback.
- Shared TypeScript modules define cards, enemies, attacks, combat events, and player state.

Authoritative combat state should live outside Phaser and React in a reducer-style action layer. Phaser should emit reaction results such as `PARRY_PERFECT`, `PARRY_NORMAL`, `DODGE_SUCCESS`, `REACTION_FAILED`, or `HIT_TAKEN`; the shared combat reducer should decide damage, counters, Perfection changes, card effects, win/loss, and logs. React should render the resulting view model and dispatch card/end-turn actions.

Likely folders:

- `src/app`
- `src/game`
- `src/game/scenes`
- `src/game/combat`
- `src/game/data`
- `src/ui`

## First Implementation Milestones

1. Create app scaffold with React, Phaser, and TypeScript.
2. Build a reaction sandbox: one enemy dummy, one attack timeline, parry/dodge input, hit feedback, and Perfection gain/loss.
3. Add Quick Slash, Heavy Overhead, and Three-Hit Combo as data-driven attack patterns.
4. Tune the three attacks until timing, readability, and feedback feel fair.
5. Render combat layout with placeholder player, enemy, hand, and intent.
6. Implement deterministic turn flow through a shared combat reducer.
7. Implement card play, energy, draw, discard, and simple damage.
8. Add defense cards that modify the reaction layer: Focus, Guard, Riposte Prep, and Recovery Step.
9. Add Crescendo as the first Perfection spender.
10. Run browser playtests and record what feels confusing, cheap, or exciting.

## Fun Test Questions

- Does the player want to end turn, or does it feel like surrendering control?
- Are defensive cards exciting because they alter reaction pressure?
- Is a perfect parry satisfying before any reward text appears?
- Does Perfection create delicious pressure, or just anxiety?
- Can a strong build survive imperfect execution?
- Can a skilled player squeeze extra value out of a mediocre build?
- Are enemy patterns readable enough to feel fair?

## Playtest Success Signals

Track a few concrete signals before expanding scope:

- Players understand when to parry or dodge without reading instructions.
- Quick Slash becomes learnable within a few attempts.
- Heavy Overhead causes anticipation, not confusion.
- Three-Hit Combo feels pressured but fair after repeated exposure.
- Defensive cards are chosen voluntarily, not only when damage numbers demand them.
- Ending turn feels like entering a duel phase, not surrendering control.
- Perfection creates excitement without making every mistake feel run-ending.

After 3-5 short playtests, review notes before adding more cards, enemies, characters, map systems, or roguelike structure.

## Deferred Until After The Prototype

These ideas are promising but should not enter the first playable unless the core loop is already working:

- Stance / Fencer as a second character.
- Summons, intercepts, or permanent-style board entities.
- Full roguelike map progression.
- Large card pools or rarity systems.
- Max-Perfection transformation modes.
- Production art, bespoke animation, or final theme work.
