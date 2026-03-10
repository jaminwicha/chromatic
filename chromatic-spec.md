# CHROMATIC — Game Design Specification

**Version:** 1.0 (60 levels, React/JSX prototype)
**Author:** Jesse / Claude collaboration
**Date:** March 2026

---

## 1. Overview

Chromatic is a tile-placement puzzle game. The player is given a set of tiles and a grid layout. The goal is to place every tile into the correct cell so that all arrow constraints are satisfied. Every level has exactly one valid solution, verified by a backtracking solver.

---

## 2. Core Rules

### 2.1 Tile Structure

Every tile has:

- **Outer color** — The tile's border color. This is what other tiles "see" when they point at this tile.
- **Inner section** — Contains 1–8 colored arrows. Each inner color gets exactly one directional arrow.

### 2.2 Arrow Rule (THE fundamental rule)

> Each inner-color arrow points AWAY from the tile in a direction. The tile in that direction must have an **outer color** matching the arrow's inner color.

Example: If tile A has inner color RED with arrow pointing RIGHT, then the tile to A's right must have outer color RED.

### 2.3 Directions

8 possible arrow directions:

| Cardinal     | Diagonal       |
|-------------|----------------|
| UP          | UP_LEFT        |
| DOWN        | UP_RIGHT       |
| LEFT        | DOWN_LEFT      |
| RIGHT       | DOWN_RIGHT     |

### 2.4 Win Condition

The board matches the SOLUTION exactly — every cell has the correct tile placed in it. The solver verifies unique solutions silently; the player never sees solver status.

### 2.5 Available Colors

BLUE, RED, YELLOW, GREEN, PURPLE, ORANGE, CYAN, PINK

---

## 3. Tile Types

### 3.1 NORMAL Tile

**Format:** `"OUTER|INNER1:DIR1,INNER2:DIR2,..."`

- Has an outer color (can be targeted by other tiles' arrows)
- Has 1–8 inner colors, each with a directional arrow
- Both sends and receives signals

**Examples:**
- `"RED|BLUE:RIGHT"` — Outer RED, sends BLUE signal rightward
- `"BLUE|RED:LEFT,GREEN:DOWN"` — Outer BLUE, sends RED left and GREEN down
- `"ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN"` — 4-arrow hub

### 3.2 INPUT_ONLY Tile (Sink)

**Format:** `"IN:COLOR1,COLOR2,..."`

- **No outer color** — cannot be targeted by the outer-matching rule in the normal way
- **No arrows** — does not send any signals
- Accepts incoming arrows whose color matches one of its listed accept colors
- Acts as a terminal/endpoint in the signal chain
- Visual: Dashed border, ⬇ icon in center

**Examples:**
- `"IN:RED"` — Accepts only RED arrows pointing at it
- `"IN:ORANGE,PURPLE"` — Accepts ORANGE or PURPLE arrows

### 3.3 OUTPUT_ONLY Tile (Source)

**Format:** `"OUT:CENTER|COLOR:DIR[:DIST],..."`

- **No outer color** — no tile's arrow is allowed to point at it (cannot receive)
- Has a center color (for visual display only)
- Has arrows that send signals outward, following the same matching rule
- Acts as a starting point in the signal chain
- Visual: Gold border, "OUT" label

**Examples:**
- `"OUT:RED|RED:RIGHT"` — Source with red center, sends RED rightward
- `"OUT:RED|BLUE:RIGHT,GREEN:DOWN"` — Source sending two signals

### 3.4 JUMPER Arrow (Distance Modifier)

**Format:** `"OUTER|COLOR:DIR:DIST"` (applies to NORMAL or OUTPUT_ONLY)

- Distance suffix `:2`, `:3`, `:4` after the direction
- Distance 1 = adjacent (default), 2 = skip 1 cell, 3 = skip 2 cells, 4 = skip 3 cells
- The arrow "jumps over" intermediate cells to land on the target
- Same matching rule applies at the landing cell
- A single tile can mix normal (dist 1) and jumper arrows
- Visual: Yellow border + distance number badge on arrow circle

**Examples:**
- `"RED|BLUE:RIGHT:2"` — Outer RED, sends BLUE jumping over 1 cell to land 2 away
- `"RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3"` — Three arrows at distances 1, 2, and 3

---

## 4. Interaction Model

### 4.1 Click-to-Place

1. Player clicks a tile in the PIECES tray → tile becomes "selected" (golden glow)
2. Player clicks an empty grid cell → tile is placed there
3. Player clicks an occupied cell while holding a tile → tiles swap
4. Player clicks a placed tile with nothing selected → tile returns to hand

### 4.2 Feedback

- **Error highlighting:** When a placed tile's arrow points at a neighbor with the wrong outer color, the arrow connection shakes red
- **Selected indicator:** Golden pulse animation on the selected tile
- **Completion:** "FINISH!" overlay with confetti on level solve
- **Grandmaster:** Victory screen with confetti when all 60 levels complete

### 4.3 Controls

- **? button** — Toggle hint text for current level
- **↺ button** — Clear board, return all tiles to tray
- **← Levels** — Return to chapter menu

---

## 5. Level Structure

### 5.1 Level Data Format

```javascript
{
  number: 1,                    // Level number (1-60)
  name: "First Link",          // Display name
  cells: ["A", "B"],           // Cell identifiers
  layout: [["A", "B"]],        // 2D grid (null = empty space)
  pieces: ["BLUE|RED:RIGHT", "RED|BLUE:LEFT"],  // Available tiles
  solution: { A: "BLUE|RED:RIGHT", B: "RED|BLUE:LEFT" },  // Unique solution
  hint: "A's inner RED arrow points right. B's outer must be RED."
}
```

### 5.2 Chapter Organization

| Chapter | Levels | Mechanic Introduced | Color |
|---------|--------|---------------------|-------|
| 1: Fundamentals | 1–9 | Basic chains, corners, diagonals | #3b82f6 |
| 2: Multi-Output | 10–18 | 3-output, 4-output tiles | #a855f7 |
| 3: Complex Layouts | 19–30 | Large grids, 8-tile helix, 9-tile grid | #22c55e |
| 4: Sources & Sinks | 31–38 | INPUT_ONLY + OUTPUT_ONLY tiles | #f59e0b |
| 5: Jumper Arrows | 39–46 | Distance 2/3 arrows, vertical snipe | #ef4444 |
| 6: Advanced Combos | 47–54 | Mixed IO + jumpers, reverse flow, pincer | #06b6d4 |
| 7: Expert | 55–60 | 7-tile pipeline, 9-tile star, 12-tile omega | #ec4899 |

### 5.3 Complete Level List

**Chapter 1: Fundamentals**
- L1 "First Link" — 2 tiles, basic left-right chain
- L2 "Three Chain" — 3 tiles, right-flowing chain
- L3 "Corner Turn" — 3 tiles, L-shaped layout
- L4 "Split Signal" — 3 tiles, first multi-arrow tile
- L5 "Hub" — 4 tiles, 2x2 grid with central hub
- L6 "Diagonal" — 4 tiles, introduces diagonal arrows
- L7 "X Marks It" — 4 tiles, all-diagonal X pattern
- L8 "Star Node" — 5 tiles, cross layout with center
- L9 "Full Grid" — 6 tiles, 2x3 grid

**Chapter 2: Multi-Output**
- L10 "Triple Threat" — 4 tiles, first 3-output tile
- L11 "Broadcast" — 5 tiles, 3-output with diagonal
- L12 "Quad Core" — 5 tiles, first 4-output tile (cardinal)
- L13 "Relay" — 6 tiles, 3-output relay chain
- L14 "Crossfire" — 5 tiles, two multi-output tiles
- L15 "Pinwheel" — 4 tiles, mixed cardinal + diagonal
- L16 "Cascade" — 4 tiles, 4-wide row waterfall
- L17 "Trident" — 5 tiles, 3-prong vertical layout
- L18 "Mirror" — 6 tiles, mirrored dual-hub

**Chapter 3: Complex Layouts**
- L19 "Diamond" — 5 tiles, cross with diagonals
- L20 "Web" — 6 tiles, 4-output center with diagonal
- L21 "Zigzag" — 4 tiles, staggered layout
- L22 "Fortress" — 6 tiles, twin-tower 2x3
- L23 "Helix" — 8 tiles, 2x4 winding chain
- L24 "Compass" — 5 tiles, 4-way compass with diagonal
- L25 "River" — 5 tiles, 5-wide bidirectional flow
- L26 "Spiral" — 5 tiles, 3-arrow spiral pattern
- L27 "Nexus" — 6 tiles, twin 3-output nexus hubs
- L28 "Galaxy" — 5 tiles, 4-output core + diagonal arm
- L29 "Labyrinth" — 7 tiles, dual-hub 7-cell layout
- L30 "Chromatic Finale" — 9 tiles, 3x3 grid, 4-output center

**Chapter 4: Sources & Sinks**
- L31 "Source & Sink" — 2 tiles, simplest OUT→IN
- L32 "Relay Station" — 3 tiles, OUT→NORMAL→IN
- L33 "Broadcaster" — 3 tiles, source with 2 signals to sink
- L34 "Funnel" — 3 tiles, RED→BLUE color transformation
- L35 "Twin Sinks" — 4 tiles, source splits to 2 sinks
- L36 "Distribution" — 5 tiles, source→hub→2 sinks
- L37 "Pipeline" — 5 tiles, 5-step color-shifting pipeline
- L38 "Crossroads" — 6 tiles, source splits into 2 independent lanes

**Chapter 5: Jumper Arrows**
- L39 "Leap" — 3 tiles, first distance-2 jump
- L40 "Hop Skip" — 4 tiles, mixed distance 1 + distance 2
- L41 "Long Shot" — 4 tiles, distance-3 jump
- L42 "Spectrum" — 4 tiles, distances 1, 2, and 3 from one tile
- L43 "Vault" — 6 tiles, vertical distance-2 jump
- L44 "Sniper" — 4 tiles, source with distance-3 shot
- L45 "Catapult" — 5 tiles, source + catapult jumper + sink
- L46 "Vertical Snipe" — 9 tiles, 3x3 with vertical distance-2

**Chapter 6: Advanced Combos**
- L47 "Network" — 6 tiles, source→2 lanes→2 sinks
- L48 "Jump Hub" — 5 tiles, source→hub→2 sinks (cross layout)
- L49 "Skip Chain" — 5 tiles, two distance-2 jumps chained
- L50 "Triple Strike" — 4 tiles, source fires 3 diagonal/cardinal to 3 sinks
- L51 "Leapfrog" — 6 tiles, leapfrog jump pattern A→C→E→sink
- L52 "Reverse Flow" — 5 tiles, source at end fires backward (LEFT:3)
- L53 "Pincer" — 5 tiles, two sources pinch center hub → 2 sinks
- L54 "Double Leap" — 6 tiles, two rows each with distance-2 jump

**Chapter 7: Expert**
- L55 "Grand Pipeline" — 7 tiles, 6 color shifts source→sink
- L56 "Star Burst" — 9 tiles, 3x3 grid, center with 4 outputs
- L57 "Highway" — 8 tiles, 2x4, dual lanes with exits
- L58 "Sniper Nest" — 9 tiles, 3x3, 3-level fire including distance-2 snipe
- L59 "Grand Cross" — 7 tiles, 5-row cross layout, 4-way hub
- L60 "Chromatic Omega" — 12 tiles, 3x4, 3 connected rows, the finale

---

## 6. Engine Functions

### 6.1 Core Parser

```javascript
parseTile(str) → {
  type: "NORMAL" | "INPUT_ONLY" | "OUTPUT_ONLY",
  outer: string | null,
  connections: [{ color, dir, distance }],
  acceptColors?: string[],  // INPUT_ONLY only
  center?: string,          // OUTPUT_ONLY only
  id: string
}
```

### 6.2 Grid Utilities

```javascript
findCellPos(layout, cellName) → { row, col } | null
getNeighborAtDist(layout, row, col, dir, dist) → { cell, row, col } | null
```

### 6.3 Validation

```javascript
getConnectionErrors(level, board) → Set<"CELL:DIR">  // error keys for UI highlighting
checkSolution(level, board) → boolean                  // exact match against solution
```

### 6.4 Solver (Backtracking)

```javascript
solvePuzzle(level) → Solution[]  // returns 0, 1, or 2+ solutions
```

The solver uses constraint propagation during partial placement:
- For each placed tile, check all outgoing arrows against already-placed neighbors
- Check all placed neighbors' arrows pointing back at the newly placed tile
- Prune early if any constraint fails
- Stop after finding 2 solutions (enough to prove non-uniqueness)

---

## 7. Visual Design

### 7.1 Tile Rendering

- **NORMAL:** Colored background = outer color, center circle = conic gradient of inner colors, directional arrow circles at edges
- **INPUT_ONLY:** Semi-transparent background, dashed border, ⬇ icon in center, center color = accept color(s)
- **OUTPUT_ONLY:** Gold-tinted background, gold solid border, "OUT" label, arrows like normal
- **Jumper arrows:** Yellow border on arrow circle + distance number badge

### 7.2 Color Palette

| Color | Background | Glow |
|-------|-----------|------|
| BLUE | #2563eb | #3b82f6 |
| RED | #dc2626 | #ef4444 |
| YELLOW | #ca8a04 | #eab308 |
| GREEN | #16a34a | #22c55e |
| PURPLE | #9333ea | #a855f7 |
| ORANGE | #ea580c | #f97316 |
| CYAN | #0891b2 | #06b6d4 |
| PINK | #db2777 | #ec4899 |

### 7.3 UI Theme

- Dark gradient background (#0f0f1a → #1a1a2e → #16213e)
- Fonts: Orbitron (headings), JetBrains Mono (body)
- Animations: float, shimmer, shake, pulseGlow, fadeIn
- Chapter headers with color-coded accent bars

---

## 8. Planned Features (Not Yet Implemented)

### 8.1 PIPE Tiles (Chapter 8)

**Concept:** A pipe tile has no outer color. It has channels — each channel has an IN port (accepts a color from a direction) and an OUT port (sends a different color in another direction). Acts as a color transformer.

**Format (proposed):**
- `"PIPE:IN_DIR:IN_COLOR,OUT_DIR:OUT_COLOR"` — 2-port pipe
- `"PIPE:IN1_DIR:IN1_COLOR,OUT1_DIR:OUT1_COLOR,IN2_DIR:IN2_COLOR,OUT2_DIR:OUT2_COLOR"` — 4-port pipe (2 independent channels)

**Mechanic notes:**
- Originally planned as PIPE_2 (2-port) and PIPE_4 (4-port, two crossing channels)
- Rotation mechanic was considered but deferred due to engine complexity
- Would need solver extension to validate pipe channel matching
- Purple-themed visual with "PIPE" label, IN/OUT port indicators

### 8.2 Production Build

- Target: Godot 4 + C# with VS Code + AI-assisted development
- Android deployment required
- Code-first workflow preferred over traditional game engine UI

---

## 9. Technical Stack

### Current Prototype
- React/JSX single-file component
- No external dependencies beyond React
- Runs in Claude.ai artifact renderer or any React environment
- Google Fonts: Orbitron, JetBrains Mono

### Planned Production
- Godot 4 with C#
- VS Code with Claude/Codex plugins
- Android target platform
