# CHROMATIC — Game Design Specification

**Version:** 1.1 (80 levels with pipes, React/JSX)
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
- Visual: Dashed border, ⬇ icon in center (text-free design)

**Examples:**
- `"IN:RED"` — Accepts only RED arrows pointing at it
- `"IN:ORANGE,PURPLE"` — Accepts ORANGE or PURPLE arrows

### 3.3 OUTPUT_ONLY Tile (Source)

**Format:** `"OUT:CENTER|COLOR:DIR[:DIST],..."`

- **No outer color** — no tile's arrow is allowed to point at it (cannot receive)
- Has a center color (for visual display only)
- Has arrows that send signals outward, following the same matching rule
- Acts as a starting point in the signal chain
- Visual: Gold border, no text label (text-free design)

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

### 3.5 PIPE Tile (Color Transformer)

**Format:** `"PIPE:IN_DIR:IN_COLOR>OUT_DIR:OUT_COLOR[,...]"`

- **No outer color** — cannot be targeted by normal arrows
- Has channels — each channel accepts a color from one direction and outputs a different color in another direction
- Acts as a color transformer in the signal chain
- Can have multiple independent channels (cross-pipe)
- Visual: Purple theme, ⊙ for input ports, arrows for output ports (text-free design)

**Examples:**
- `"PIPE:LEFT:RED>RIGHT:BLUE"` — Accepts RED from left, outputs BLUE to right
- `"PIPE:LEFT:RED>DOWN:BLUE"` — Pipe that bends: RED enters left, BLUE exits downward
- `"PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE"` — Cross pipe with 2 independent channels

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
- **Grandmaster:** Victory screen with confetti when all 80 levels complete

### 4.3 Controls

- **? button** — Toggle hint text for current level
- **↺ button** — Clear board, return all tiles to tray
- **← Levels** — Return to chapter menu

---

## 5. Level Structure

### 5.1 Level Data Format

```javascript
{
  number: 1,                    // Level number (1-80)
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
| 8: Pipes | 61–70 | PIPE tiles, color transformation, cross pipes | #8b5cf6 |
| 9: Master | 71–80 | All mechanics combined, large grids | #f59e0b |

---

## 6. Engine Functions

### 6.1 Core Parser

```javascript
parseTile(str) → {
  type: "NORMAL" | "INPUT_ONLY" | "OUTPUT_ONLY" | "PIPE",
  outer: string | null,
  connections: [{ color, dir, distance }],
  acceptColors?: string[],  // INPUT_ONLY only
  center?: string,          // OUTPUT_ONLY only
  channels?: [{inDir, inColor, outDir, outColor}],  // PIPE only
  inPorts?: [{dir, color}], // PIPE only
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
- Handles PIPE tiles by validating input port matching
- Prune early if any constraint fails
- Stop after finding 2 solutions (enough to prove non-uniqueness)

---

## 7. Visual Design

### 7.1 Tile Rendering (Text-Free Design)

- **NORMAL:** Colored background = outer color, center circle = conic gradient of inner colors, directional arrow circles at edges
- **INPUT_ONLY:** Semi-transparent background, dashed border, ⬇ icon in center (no "SINK" text)
- **OUTPUT_ONLY:** Gold-tinted background, gold solid border, no text label (no "SRC" text)
- **PIPE:** Purple-themed background, purple border, ⊙ for input ports, arrows for output ports (no "PIPE" text)
- **Jumper arrows:** Yellow border on arrow circle + distance number badge
- **No color abbreviations** on tiles - colors identified by visual appearance only

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

## 8. Technical Stack

### Current Implementation
- React/JSX single-file component
- No external dependencies beyond React
- Runs in Next.js environment
- Google Fonts: Orbitron, JetBrains Mono
- 80 levels with full pipe support

### Planned Production
- Godot 4 with C#
- VS Code with Claude/Codex plugins
- Android target platform

---

## 9. Design Philosophy

### Text-Free Approach
The game uses a minimalist, text-free design where:
- Tiles are identified by color and shape, not labels
- Symbols (⬇, ⊙, arrows) replace text labels
- Players learn mechanics through visual patterns
- Reduces cognitive load and language barriers
- Creates a more elegant, puzzle-focused experience

### Progressive Difficulty
- Chapters 1-3: Core mechanics (30 levels)
- Chapters 4-6: Advanced mechanics (24 levels)
- Chapter 7: Expert combinations (6 levels)
- Chapter 8: Pipe mechanics (10 levels)
- Chapter 9: Master challenges (10 levels)

Total: 80 levels with verified unique solutions
