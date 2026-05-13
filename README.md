# ClairTheSpire

ClairTheSpire is the working codename for a 2D action deckbuilder roguelike: strategic card combat with expressive defensive execution.

The prototype target is intentionally narrow:

- one character
- one enemy
- three enemy attack patterns
- a parry and dodge interaction layer
- a Perfection-style mastery resource
- placeholder art and lightweight tweened animation

The first goal is not theme, content volume, or production polish. The first goal is to answer:

> Is the combat loop fun?

The first playable should start as a reaction sandbox before becoming a full card prototype: prove that enemy timing, parry, dodge, feedback, and Perfection pressure feel good, then wrap the card and deck systems around that core.

## Design Pillars

- Deckbuilding determines options, consistency, and scaling.
- Execution modifies efficiency, survival, and payoff.
- Defense cards stay relevant by changing parry, dodge, block, and punishment behavior.
- Enemy attacks are readable interactive sequences, not cinematic complexity.
- Characters express personality through combat psychology, not simple class roles.

## Current Docs

- [Design brief](docs/design-brief.md)
- [Prototype plan](docs/prototype-plan.md)

## Getting Started

Use Node 18 or newer.

```sh
npm install
npm run dev
```

For a production check:

```sh
npm run build
```

## Deployment

The `Deploy ClairTheSpire` GitHub Actions workflow publishes the Vite build to GitHub Pages on pushes to `main`.

```sh
npm run build:pages
```
