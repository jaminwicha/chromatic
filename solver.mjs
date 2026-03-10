#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// CHROMATIC — Backtracking Puzzle Solver with Pipe Support
// Verifies all levels have unique solutions
// Usage: node solver.mjs
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

const DIRS = {
  UP: { dr: -1, dc: 0 }, DOWN: { dr: 1, dc: 0 },
  LEFT: { dr: 0, dc: -1 }, RIGHT: { dr: 0, dc: 1 },
  UP_LEFT: { dr: -1, dc: -1 }, UP_RIGHT: { dr: -1, dc: 1 },
  DOWN_LEFT: { dr: 1, dc: -1 }, DOWN_RIGHT: { dr: 1, dc: 1 },
};
const OPPOSITE = {
  UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT",
  UP_LEFT: "DOWN_RIGHT", DOWN_RIGHT: "UP_LEFT",
  UP_RIGHT: "DOWN_LEFT", DOWN_LEFT: "UP_RIGHT",
};

// ─── TILE PARSER ────────────────────────────────────────────────────────

function parseTile(str) {
  // INPUT_ONLY: "IN:RED" or "IN:RED,BLUE"
  if (str.startsWith("IN:")) {
    return { type: "INPUT_ONLY", acceptColors: str.slice(3).split(","), outer: null, connections: [], inPorts: [], id: str };
  }
  // OUTPUT_ONLY: "OUT:CENTER|COLOR:DIR[:DIST],..."
  if (str.startsWith("OUT:")) {
    const rest = str.slice(4);
    const [center, innerPart] = rest.split("|");
    const connections = innerPart.split(",").map(p => {
      const parts = p.split(":");
      return { color: parts[0], dir: parts[1], distance: parts[2] ? Number.parseInt(parts[2]) : 1 };
    });
    return { type: "OUTPUT_ONLY", center, outer: null, connections, inPorts: [], id: str };
  }
  // PIPE: "PIPE:IN_DIR:IN_COLOR>OUT_DIR:OUT_COLOR,..."
  if (str.startsWith("PIPE:")) {
    const rest = str.slice(5);
    const channels = rest.split(",").map(ch => {
      const [inPart, outPart] = ch.split(">");
      const [inDir, inColor] = inPart.split(":");
      const [outDir, outColor] = outPart.split(":");
      return { inDir, inColor, outDir, outColor };
    });
    const connections = channels.map(ch => ({ color: ch.outColor, dir: ch.outDir, distance: 1 }));
    const inPorts = channels.map(ch => ({ dir: ch.inDir, color: ch.inColor }));
    return { type: "PIPE", outer: null, connections, channels, inPorts, id: str };
  }
  // NORMAL: "OUTER|INNER:DIR[:DIST],..."
  const [outer, innerPart] = str.split("|");
  const connections = innerPart.split(",").map(p => {
    const parts = p.split(":");
    return { color: parts[0], dir: parts[1], distance: parts[2] ? Number.parseInt(parts[2]) : 1 };
  });
  return { type: "NORMAL", outer, connections, inPorts: [], id: str };
}

// ─── GRID UTILITIES ─────────────────────────────────────────────────────

function findCellPos(layout, cellName) {
  for (let r = 0; r < layout.length; r++)
    for (let c = 0; c < layout[r].length; c++)
      if (layout[r][c] === cellName) return { row: r, col: c };
  return null;
}

function getNeighborAtDist(layout, row, col, dir, dist) {
  const { dr, dc } = DIRS[dir];
  const nr = row + dr * dist, nc = col + dc * dist;
  if (nr >= 0 && nr < layout.length && nc >= 0 && nc < (layout[nr]?.length || 0) && layout[nr][nc])
    return { cell: layout[nr][nc], row: nr, col: nc };
  return null;
}

// ─── SOLVER ─────────────────────────────────────────────────────────────

function solvePuzzle(level) {
  const cells = level.cells;
  const solutions = [];

  function isValidPartial(board, cellName, tileStr) {
    const tile = parseTile(tileStr);
    const pos = findCellPos(level.layout, cellName);
    if (!pos) return false;

    // Check outgoing arrows (NORMAL, OUTPUT_ONLY, and PIPE tiles)
    if (tile.type !== "INPUT_ONLY") {
      for (const conn of tile.connections) {
        const n = getNeighborAtDist(level.layout, pos.row, pos.col, conn.dir, conn.distance || 1);
        if (!n) return false; // arrow points off-grid or to null cell
        if (board[n.cell]) {
          const nt = parseTile(board[n.cell]);
          if (nt.type === "NORMAL" && conn.color !== nt.outer) return false;
          if (nt.type === "INPUT_ONLY" && !nt.acceptColors.includes(conn.color)) return false;
          if (nt.type === "OUTPUT_ONLY") return false; // can't point at a source
          if (nt.type === "PIPE") {
            // Check if pipe has matching input port
            const oppDir = OPPOSITE[conn.dir];
            if (!nt.inPorts?.find(p => p.dir === oppDir && p.color === conn.color)) return false;
          }
        }
      }
    }

    // Check already-placed neighbors pointing back at us
    for (const [dir, delta] of Object.entries(DIRS)) {
      for (let d = 1; d <= 4; d++) {
        const nr = pos.row + delta.dr * d, nc = pos.col + delta.dc * d;
        if (nr < 0 || nr >= level.layout.length || nc < 0 || nc >= (level.layout[nr]?.length || 0)) continue;
        const nCell = level.layout[nr]?.[nc];
        if (!nCell || !board[nCell]) continue;
        const nt = parseTile(board[nCell]);
        const oppDir = OPPOSITE[dir];
        for (const nConn of nt.connections) {
          if (nConn.dir === oppDir && (nConn.distance || 1) === d) {
            // This neighbor is pointing at us from distance d
            if (tile.type === "NORMAL" && nConn.color !== tile.outer) return false;
            if (tile.type === "INPUT_ONLY" && !tile.acceptColors.includes(nConn.color)) return false;
            if (tile.type === "OUTPUT_ONLY") return false; // sources can't receive
            if (tile.type === "PIPE") {
              // Check if we have matching input port for this incoming arrow
              if (!tile.inPorts?.find(p => p.dir === dir && p.color === nConn.color)) return false;
            }
          }
        }
      }
    }
    return true;
  }

  function solve(ci, board, remaining) {
    if (ci === cells.length) {
      // Full validation pass
      for (const cell of cells) {
        const t = parseTile(board[cell]);
        const p = findCellPos(level.layout, cell);
        for (const c of t.connections) {
          const n = getNeighborAtDist(level.layout, p.row, p.col, c.dir, c.distance || 1);
          if (!n || !board[n.cell]) return;
          const nt = parseTile(board[n.cell]);
          if (nt.type === "NORMAL" && c.color !== nt.outer) return;
          if (nt.type === "INPUT_ONLY" && !nt.acceptColors.includes(c.color)) return;
          if (nt.type === "OUTPUT_ONLY") return;
          if (nt.type === "PIPE") {
            const oppDir = OPPOSITE[c.dir];
            if (!nt.inPorts?.find(p => p.dir === oppDir && p.color === c.color)) return;
          }
        }
      }
      solutions.push({ ...board });
      return;
    }
    const cn = cells[ci];
    for (let i = 0; i < remaining.length; i++) {
      if (isValidPartial(board, cn, remaining[i])) {
        solve(ci + 1,
          { ...board, [cn]: remaining[i] },
          [...remaining.slice(0, i), ...remaining.slice(i + 1)]
        );
        if (solutions.length >= 2) return; // stop after 2 (enough to prove non-unique)
      }
    }
  }

  solve(0, {}, [...level.pieces]);
  return solutions;
}

// ─── EXTRACT LEVELS FROM JSX ───────────────────────────────────────────

function extractLevels() {
  const content = readFileSync('./app/ChromaticPuzzle.jsx', 'utf-8');
  const levelsMatch = content.match(/const LEVELS = \[([\s\S]*?)\];/);
  if (!levelsMatch) throw new Error("Could not find LEVELS array");
  
  const levelsStr = '[' + levelsMatch[1] + ']';
  // Use eval carefully - only on our own code
  const levels = eval(levelsStr);
  return levels;
}

// ─── VERIFY ALL ─────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════");
console.log("  CHROMATIC SOLVER — Verifying all levels");
console.log("═══════════════════════════════════════════════════\n");

const LEVELS = extractLevels();
let good = 0, bad = 0;

for (const level of LEVELS) {
  const sols = solvePuzzle(level);
  const ok = sols.length === 1;
  const match = ok && Object.keys(level.solution).every(k => sols[0][k] === level.solution[k]);
  const status = sols.length === 0 ? "✗ IMPOSSIBLE"
    : sols.length === 1 ? "✓ UNIQUE"
    : `⚠ ${sols.length} solutions`;
  console.log(`L${String(level.number).padStart(2,"0")} "${level.name}": ${status} | Solution match: ${match}`);
  if (sols.length > 0 && !match) {
    console.log(`  Expected: ${JSON.stringify(level.solution)}`);
    console.log(`  Found:    ${JSON.stringify(sols[0])}`);
  }
  if (ok && match) good++; else bad++;
}

console.log(`\n═══════════════════════════════════════════════════`);
console.log(`  Results: ${good} verified, ${bad} issues, ${LEVELS.length} total`);
console.log(`═══════════════════════════════════════════════════`);

process.exit(bad === 0 ? 0 : 1);
