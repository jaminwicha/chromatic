# Chromatic

A tile-placement puzzle game where you match inner arrow colors to neighbors' outer colors to form chains.

## Rules

- Each tile has an **outer color** (its border identity) and one or more **inner colors**, each with an arrow.
- An arrow points away from the tile toward a neighboring cell.
- The neighbor's **outer color** must match the arrow's **inner color**.
- Place all tiles so every arrow satisfies this rule.

## Current State

React/JSX prototype with 9 levels introducing mechanics progressively:
- Cardinal arrows (up/down/left/right)
- Multi-output tiles (2+ arrows per tile)
- Diagonal arrows

## Running

Open `tile-puzzle-game.jsx` as a React component, or paste into any React playground (e.g. Claude artifacts).

## Planned

- Godot 4 + C# production build
- 3-output and 4-output tile levels
- Android deployment
