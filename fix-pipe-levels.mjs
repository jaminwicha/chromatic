#!/usr/bin/env node
// Tool to fix pipe levels by finding valid solutions with rotation
import { readFileSync, writeFileSync } from 'node:fs';

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

const ROTATE_CW = {
  UP: "RIGHT", RIGHT: "DOWN", DOWN: "LEFT", LEFT: "UP",
  UP_RIGHT: "DOWN_RIGHT", DOWN_RIGHT: "DOWN_LEFT", 
  DOWN_LEFT: "UP_LEFT", UP_LEFT: "UP_RIGHT"
};

function rotateDirection(dir) {
  return ROTATE_CW[dir] || dir;
}

function rotatePipe(pipeStr) {
  if (!pipeStr.startsWith("PIPE:")) return pipeStr;
  
  const rest = pipeStr.slice(5);
  const channels = rest.split(",").map(ch => {
    const [inPart, outPart] = ch.split(">");
    const [inDir, inColor] = inPart.split(":");
    const [outDir, outColor] = outPart.split(":");
    
    return `${rotateDirection(inDir)}:${inColor}>${rotateDirection(outDir)}:${outColor}`;
  });
  
  return `PIPE:${channels.join(",")}`;
}

function getAllRotations(piece) {
  if (!piece.startsWith("PIPE:")) return [piece];
  
  const rotations = [piece];
  let current = piece;
  
  for (let i = 0; i < 3; i++) {
    current = rotatePipe(current);
    if (!rotations.includes(current)) {
      rotations.push(current);
    }
  }
  
  return rotations;
}

function parseTile(str) {
  if (str.startsWith("IN:")) {
    return { type: "INPUT_ONLY", acceptColors: str.slice(3).split(","), outer: null, connections: [], inPorts: [], id: str };
  }
  if (str.startsWith("OUT:")) {
    const rest = str.slice(4);
    const [center, innerPart] = rest.split("|");
    const connections = innerPart.split(",").map(p => {
      const parts = p.split(":");
      return { color: parts[0], dir: parts[1], distance: parts[2] ? Number.parseInt(parts[2]) : 1 };
    });
    return { type: "OUTPUT_ONLY", center, outer: null, connections, inPorts: [], id: str };
  }
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
  const [outer, innerPart] = str.split("|");
  const connections = innerPart.split(",").map(p => {
    const parts = p.split(":");
    return { color: parts[0], dir: parts[1], distance: parts[2] ? Number.parseInt(parts[2]) : 1 };
  });
  return { type: "NORMAL", outer, connections, inPorts: [], id: str };
}

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

function solvePuzzle(level) {
  const cells = level.cells;
  const solutions = [];
  
  // Expand pieces to include all rotations of pipes
  const expandedPieces = [];
  for (const piece of level.pieces) {
    const rotations = getAllRotations(piece);
    expandedPieces.push(...rotations);
  }

  function isValidPartial(board, cellName, tileStr) {
    const tile = parseTile(tileStr);
    const pos = findCellPos(level.layout, cellName);
    if (!pos) return false;

    if (tile.type !== "INPUT_ONLY") {
      for (const conn of tile.connections) {
        const n = getNeighborAtDist(level.layout, pos.row, pos.col, conn.dir, conn.distance || 1);
        if (!n) return false;
        if (board[n.cell]) {
          const nt = parseTile(board[n.cell]);
          if (nt.type === "NORMAL" && conn.color !== nt.outer) return false;
          if (nt.type === "INPUT_ONLY" && !nt.acceptColors.includes(conn.color)) return false;
          if (nt.type === "OUTPUT_ONLY") return false;
          if (nt.type === "PIPE") {
            const oppDir = OPPOSITE[conn.dir];
            if (!nt.inPorts?.find(p => p.dir === oppDir && p.color === conn.color)) return false;
          }
        }
      }
    }

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
            if (tile.type === "NORMAL" && nConn.color !== tile.outer) return false;
            if (tile.type === "INPUT_ONLY" && !tile.acceptColors.includes(nConn.color)) return false;
            if (tile.type === "OUTPUT_ONLY") return false;
            if (tile.type === "PIPE") {
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
        if (solutions.length >= 1) return; // Just find one solution
      }
    }
  }

  solve(0, {}, expandedPieces);
  return solutions;
}

// Test specific level
const levelNum = process.argv[2] ? Number.parseInt(process.argv[2]) : 71;

const content = readFileSync('./app/ChromaticPuzzle.jsx', 'utf-8');
const levelsMatch = content.match(/const LEVELS = \[([\s\S]*?)\];/);
if (!levelsMatch) {
  console.error("Could not find LEVELS array");
  process.exit(1);
}

const levelsStr = '[' + levelsMatch[1] + ']';
const LEVELS = eval(levelsStr);

const level = LEVELS.find(l => l.number === levelNum);
if (!level) {
  console.error(`Level ${levelNum} not found`);
  process.exit(1);
}

console.log(`\nTesting Level ${level.number}: ${level.name}`);
console.log(`Cells: ${level.cells.length}, Pieces: ${level.pieces.length}`);
console.log(`Pieces: ${level.pieces.join(", ")}`);

const solutions = solvePuzzle(level);

if (solutions.length === 0) {
  console.log("❌ NO SOLUTION FOUND");
} else {
  console.log(`✓ Found solution!`);
  console.log("\nSolution:");
  console.log(JSON.stringify(solutions[0], null, 2));
  console.log("\nCopy this to replace the solution in the level:");
  console.log(`solution:${JSON.stringify(solutions[0])},`);
}
