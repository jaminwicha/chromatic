import { readFileSync } from 'node:fs';

const DIRS = { UP: { dr: -1, dc: 0 }, DOWN: { dr: 1, dc: 0 }, LEFT: { dr: 0, dc: -1 }, RIGHT: { dr: 0, dc: 1 }, UP_LEFT: { dr: -1, dc: -1 }, UP_RIGHT: { dr: -1, dc: 1 }, DOWN_LEFT: { dr: 1, dc: -1 }, DOWN_RIGHT: { dr: 1, dc: 1 } };
const OPPOSITE = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT", UP_LEFT: "DOWN_RIGHT", DOWN_RIGHT: "UP_LEFT", UP_RIGHT: "DOWN_LEFT", DOWN_LEFT: "UP_RIGHT", SHELF_UP: "SHELF_DOWN", SHELF_DOWN: "SHELF_UP" };
const ROTATE_CW = { UP: "RIGHT", RIGHT: "DOWN", DOWN: "LEFT", LEFT: "UP", UP_RIGHT: "DOWN_RIGHT", DOWN_RIGHT: "DOWN_LEFT", DOWN_LEFT: "UP_LEFT", UP_LEFT: "UP_RIGHT" };
function rotateDirection(dir) { return ROTATE_CW[dir] || dir; }
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
function getAllPipeRotations(pipeStr) {
  if (!pipeStr.startsWith("PIPE:")) return [pipeStr];
  const rotations = new Set(); rotations.add(pipeStr);
  let current = pipeStr;
  for (let i = 0; i < 3; i++) { current = rotatePipe(current); rotations.add(current); }
  return [...rotations];
}
function parseTile(str) {
  if (!str || typeof str !== 'string') return { type: "EMPTY", connections: [], inPorts: [] };
  if (str.startsWith("IN:")) return { type: "INPUT_ONLY", acceptColors: str.slice(3).split(","), outer: null, connections: [], inPorts: [], id: str };
  if (str.startsWith("OUT:")) {
    const rest = str.slice(4); const [center, innerPart] = rest.split("|");
    const connections = innerPart.split(",").map(p => { const parts = p.split(":"); return { color: parts[0], dir: parts[1], distance: parts[2] ? Number.parseInt(parts[2]) : 1 }; });
    return { type: "OUTPUT_ONLY", center, outer: null, connections, inPorts: [], id: str };
  }
  if (str.startsWith("TRIGGER:")) {
    const [header, innerPart] = str.split("|"); const parts = header.split(":");
    const reqColor = parts[1]; const targetCell = parts[2];
    let connections = [];
    if (innerPart) { connections = innerPart.split(",").map(p => { const bits = p.split(":"); return { color: bits[0], dir: bits[1], distance: bits[2] ? parseInt(bits[2]) : 1 }; }); }
    return { type: "TRIGGER", reqColor, targetCell, center: reqColor, outer: reqColor, connections, inPorts: [], id: str };
  }
  if (str.startsWith("STAIRS:")) {
    const [header, innerPart] = str.split("|"); const parts = header.split(":");
    const stairsDir = parts[1]; const stairsColor = parts[2];
    let connections = [];
    if (innerPart) {
      connections = innerPart.split(",").map(p => {
        const bits = p.split(":");
        if (bits.length === 1) return { color: bits[0], dir: stairsDir === "UP" ? "SHELF_UP" : "SHELF_DOWN", distance: 1 };
        const targetDir = (bits[1] === "UP" || bits[1] === "SHELF_UP") ? "SHELF_UP" : (bits[1] === "DOWN" || bits[1] === "SHELF_DOWN") ? "SHELF_DOWN" : bits[1];
        return { color: bits[0], dir: targetDir, distance: bits[2] ? parseInt(bits[2]) : 1 };
      });
    } else { connections.push({ color: stairsColor, dir: stairsDir === "UP" ? "SHELF_UP" : "SHELF_DOWN", distance: 1 }); }
    return { type: "STAIRS", stairsDir, stairsColor, outer: stairsColor, connections, id: str };
  }
  if (str.startsWith("PIPE:")) {
    const rest = str.slice(5);
    const channels = rest.split(",").map(ch => {
      const [inPart, outPart] = ch.split(">"); const [inDir, inColor] = inPart.split(":"); const [outDir, outColor] = outPart.split(":");
      return { inDir, inColor, outDir, outColor };
    });
    const connections = channels.map(ch => ({ color: ch.outColor, dir: ch.outDir, distance: 1 }));
    const inPorts = channels.map(ch => ({ dir: ch.inDir, color: ch.inColor }));
    return { type: "PIPE", outer: null, connections, channels, inPorts, id: str };
  }
  const pts = str.split("|"); const outer = pts[0]; const innerStr = pts[1] || "";
  const connections = innerStr.split(",").filter(Boolean).map(p => { const parts = p.split(":"); return { color: parts[0], dir: parts[1], distance: parts[2] ? Number.parseInt(parts[2]) : 1 }; });
  return { type: "NORMAL", outer, connections, inPorts: [], id: str };
}
function getLayout3D(layout) {
  if (!layout || layout.length === 0) return [];
  if (Array.isArray(layout[0]) && Array.isArray(layout[0][0])) return layout;
  return [layout];
}
function findCellPos(layout, cellName) {
  const l3d = getLayout3D(layout);
  for (let z = 0; z < l3d.length; z++)
    for (let r = 0; r < l3d[z].length; r++)
      for (let c = 0; c < l3d[z][r].length; c++)
        if (l3d[z][r][c] === cellName) return { z, row: r, col: c };
  return null;
}
function getNeighborAtDist(layout, z, row, col, dir, dist) {
  const l3d = getLayout3D(layout);
  if (dir === "SHELF_UP") {
    if (l3d[z + dist] && l3d[z + dist][row] && l3d[z + dist][row][col]) return { cell: l3d[z + dist][row][col], z: z + dist, row, col };
    return null;
  }
  if (dir === "SHELF_DOWN") {
    if (l3d[z - dist] && l3d[z - dist][row] && l3d[z - dist][row][col]) return { cell: l3d[z - dist][row][col], z: z - dist, row, col };
    return null;
  }
  const d = DIRS[dir];
  if (!d) return null;
  const nr = row + d.dr * dist, nc = col + d.dc * dist;
  if (l3d[z] && nr >= 0 && nr < l3d[z].length && nc >= 0 && nc < (l3d[z][nr]?.length || 0) && l3d[z][nr][nc])
    return { cell: l3d[z][nr][nc], z, row: nr, col: nc };
  return null;
}
function checkMatch(sourceTile, conn, targetTile) {
  if (!targetTile || targetTile.type === "EMPTY") return false;
  const oppDir = OPPOSITE[conn.dir];
  if (targetTile.type === "NORMAL" && conn.color === targetTile.outer) return true;
  if (targetTile.type === "INPUT_ONLY" && targetTile.acceptColors.includes(conn.color)) return true;
  if (targetTile.type === "STAIRS" && conn.color === targetTile.outer) return true;
  if (targetTile.type === "OUTPUT_ONLY" && conn.color === targetTile.center) return true;
  if (targetTile.type === "PIPE") {
    return !!targetTile.inPorts?.find(p => p.dir === oppDir && p.color === conn.color);
  }
  if (targetTile.type === "TRIGGER" && conn.color === targetTile.reqColor) return true;
  return false;
}
function getSatisfiedTriggers(level, board) {
  const satisfied = new Set();
  Object.entries(board).forEach(([sourceCell, sourceStr]) => {
    const sTile = parseTile(sourceStr);
    const sPos = findCellPos(level.layout, sourceCell);
    if (!sPos) return;
    sTile.connections.forEach(conn => {
      const neighbor = getNeighborAtDist(level.layout, sPos.z, sPos.row, sPos.col, conn.dir, conn.distance || 1);
      if (neighbor && board[neighbor.cell]) {
        const nTile = parseTile(board[neighbor.cell]);
        if (nTile.type === "TRIGGER" && nTile.reqColor === conn.color) {
          satisfied.add(neighbor.cell);
        }
      }
    });
  });
  return satisfied;
}
function isLocked(level, board, cellName) {
  const satisfied = getSatisfiedTriggers(level, board);
  for (const [cell, str] of Object.entries(board)) {
    const t = parseTile(str);
    if (t.type === "TRIGGER" && t.targetCell === cellName && !satisfied.has(cell)) {
      return true;
    }
  }
  return false;
}

function solvePuzzle(level) {
  const cells = level.cells;
  const solutions = [];

  function isValidPartial(board, cellName, tileStr) {
    const tile = parseTile(tileStr);
    if (isLocked(level, board, cellName)) {
      if (tile.type !== "TRIGGER" || tile.targetCell !== cellName) return false;
    }
    const pos = findCellPos(level.layout, cellName);
    if (!pos) return false;

    if (tile.type !== "INPUT_ONLY" && tile.type !== "TRIGGER") {
      for (const conn of tile.connections) {
        const n = getNeighborAtDist(level.layout, pos.z, pos.row, pos.col, conn.dir, conn.distance || 1);
        if (!n) return false;
        if (board[n.cell]) {
          if (!checkMatch(tile, conn, parseTile(board[n.cell]))) return false;
        }
      }
    }

    for (const [otherCell, otherStr] of Object.entries(board)) {
      const ot = parseTile(otherStr);
      const op = findCellPos(level.layout, otherCell);
      for (const oc of ot.connections) {
        const on = getNeighborAtDist(level.layout, op.z, op.row, op.col, oc.dir, oc.distance || 1);
        if (on && on.cell === cellName) {
          if (!checkMatch(ot, oc, tile)) return false;
        }
      }
    }
    return true;
  }

  function solve(board, remaining) {
    if (remaining.length === 0) {
      const finalSatisfied = getSatisfiedTriggers(level, board);
      for (const [cell, str] of Object.entries(board)) {
        const t = parseTile(str);
        if (t.type === "TRIGGER" && !finalSatisfied.has(cell)) return;
      }
      for (const cell of cells) {
        const t = parseTile(board[cell]);
        const p = findCellPos(level.layout, cell);
        for (const c of t.connections) {
          const n = getNeighborAtDist(level.layout, p.z, p.row, p.col, c.dir, c.distance || 1);
          if (!n || !board[n.cell]) return;
          if (!checkMatch(t, c, parseTile(board[n.cell]))) return;
        }
      }
      const isDuplicate = solutions.some(sol => {
        const keys = Object.keys(sol);
        if (keys.length !== Object.keys(board).length) return false;
        return keys.every(k => sol[k] === board[k]);
      });
      if (!isDuplicate) solutions.push({ ...board });
      return;
    }

    let targetCell = null;
    for (const c of cells) {
      if (!board[c] && !isLocked(level, board, c)) { targetCell = c; break; }
    }
    if (!targetCell) return;

    for (let i = 0; i < remaining.length; i++) {
      const piece = remaining[i];
      const variants = getAllPipeRotations(piece);
      for (const variant of variants) {
        if (isValidPartial(board, targetCell, variant)) {
          solve({ ...board, [targetCell]: variant }, [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
          if (solutions.length >= 2) return;
        }
      }
    }
  }

  solve({}, [...level.pieces]);
  return solutions;
}

const levels = JSON.parse(readFileSync('test_levels.json', 'utf8'));
for (const level of levels) {
  const sols = solvePuzzle(level);
  console.log(`L${level.number}: ${sols.length} solutions`);
  if (sols.length !== 1) console.log("FAILED");
}
