import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── ENGINE ─────────────────────────────────────────────────────────────────

const COLORS = {
  BLUE: { bg: "#2563eb", glow: "#3b82f6" },
  RED: { bg: "#dc2626", glow: "#ef4444" },
  YELLOW: { bg: "#ca8a04", glow: "#eab308" },
  GREEN: { bg: "#16a34a", glow: "#22c55e" },
  PURPLE: { bg: "#9333ea", glow: "#a855f7" },
  ORANGE: { bg: "#ea580c", glow: "#f97316" },
  CYAN: { bg: "#0891b2", glow: "#06b6d4" },
  PINK: { bg: "#db2777", glow: "#ec4899" },
};

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
  SHELF_UP: "SHELF_DOWN", SHELF_DOWN: "SHELF_UP"
};

const ROTATE_CW = {
  UP: "RIGHT", RIGHT: "DOWN", DOWN: "LEFT", LEFT: "UP",
  UP_RIGHT: "DOWN_RIGHT", DOWN_RIGHT: "DOWN_LEFT",
  DOWN_LEFT: "UP_LEFT", UP_LEFT: "UP_RIGHT"
};

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

function randomizePipeOrientations(pieces) {
  return pieces.map(piece => {
    if (!piece.startsWith("PIPE:")) return piece;
    let result = piece;
    const rotations = Math.floor(Math.random() * 4);
    for (let i = 0; i < rotations; i++) {
      result = rotatePipe(result);
    }
    return result;
  });
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
  // Check triggers already placed on board
  const satisfied = getSatisfiedTriggers(level, board);
  for (const [cell, str] of Object.entries(board)) {
    const t = parseTile(str);
    if (t.type === "TRIGGER" && t.targetCell === cellName && !satisfied.has(cell)) {
      return true;
    }
  }
  // Also lock cells targeted by triggers still in the tray (unplaced)
  for (const pieceStr of level.pieces) {
    const t = parseTile(pieceStr);
    if (t.type === "TRIGGER" && t.targetCell === cellName) {
      // Check if this trigger is placed and satisfied
      const placedCell = Object.entries(board).find(([c, s]) => s === pieceStr)?.[0];
      if (!placedCell || !satisfied.has(placedCell)) return true;
    }
  }
  return false;
}

function getConnectionErrors(level, board) {
  const errors = new Set();
  const l3d = getLayout3D(level.layout);
  for (let z = 0; z < l3d.length; z++) {
    for (let r = 0; r < l3d[z].length; r++) {
      for (let c = 0; c < l3d[z][r].length; c++) {
        const cellName = l3d[z][r][c];
        if (!cellName || !board[cellName]) continue;
        const tile = parseTile(board[cellName]);
        for (const conn of tile.connections) {
          const dist = conn.distance || 1;
          const neighbor = getNeighborAtDist(level.layout, z, r, c, conn.dir, dist);
          if (!neighbor || !board[neighbor.cell]) {
            errors.add(`${cellName}:${conn.dir}`);
            continue;
          }
          const nTile = parseTile(board[neighbor.cell]);
          if (!checkMatch(tile, conn, nTile)) {
            errors.add(`${cellName}:${conn.dir}`);
          }
        }
      }
    }
  }
  return errors;
}

function checkSolution(level, board) {
  for (const cell of level.cells)
    if (!board[cell]) return false;

  const errs = getConnectionErrors(level, board);
  if (errs.size > 0) return false;

  const finalSatisfied = getSatisfiedTriggers(level, board);
  for (const [cell, str] of Object.entries(board)) {
    const t = parseTile(str);
    if (t.type === "TRIGGER" && !finalSatisfied.has(cell)) return false;
  }

  return true;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── ALL 60 LEVELS ──────────────────────────────────────────────────────────

const LEVELS = [
  // === CH1: FUNDAMENTALS (1-9) ===
  { number: 1, name: "First Link", cells: ["A", "B"], layout: [["A", "B"]], pieces: ["BLUE|RED:RIGHT", "RED|BLUE:LEFT"], solution: { A: "BLUE|RED:RIGHT", B: "RED|BLUE:LEFT" }, hint: "A's inner RED arrow points right. B's outer must be RED." },
  { number: 2, name: "Three Chain", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|GREEN:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|BLUE:RIGHT", C: "BLUE|GREEN:LEFT" }, hint: "A→B→C flows right. C points back left to B." },
  { number: 3, name: "Corner Turn", cells: ["A", "B", "C"], layout: [["A", null], ["B", "C"]], pieces: ["GREEN|BLUE:DOWN", "BLUE|RED:RIGHT", "RED|BLUE:LEFT"], solution: { A: "GREEN|BLUE:DOWN", B: "BLUE|RED:RIGHT", C: "RED|BLUE:LEFT" }, hint: "A sends down to B. B sends right to C. C sends back to B." },
  { number: 4, name: "Split Signal", cells: ["A", "B", "C"], layout: [["A", "B"], ["C", null]], pieces: ["PURPLE|GREEN:RIGHT,RED:DOWN", "GREEN|PURPLE:LEFT", "RED|PURPLE:UP"], solution: { A: "PURPLE|GREEN:RIGHT,RED:DOWN", B: "GREEN|PURPLE:LEFT", C: "RED|PURPLE:UP" }, hint: "A has TWO arrows! GREEN right, RED down." },
  { number: 5, name: "Hub", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN", "BLUE|RED:LEFT", "GREEN|RED:UP", "ORANGE|GREEN:LEFT"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN", B: "BLUE|RED:LEFT", C: "GREEN|RED:UP", D: "ORANGE|GREEN:LEFT" }, hint: "A is the hub — BLUE right, GREEN down." },
  { number: 6, name: "Diagonal", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["BLUE|RED:DOWN_RIGHT", "GREEN|RED:DOWN", "PURPLE|RED:RIGHT", "RED|GREEN:UP"], solution: { A: "BLUE|RED:DOWN_RIGHT", B: "GREEN|RED:DOWN", C: "PURPLE|RED:RIGHT", D: "RED|GREEN:UP" }, hint: "A goes DIAGONAL to D!" },
  { number: 7, name: "X Marks It", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["RED|GREEN:DOWN_RIGHT", "BLUE|RED:DOWN_LEFT", "RED|BLUE:UP_RIGHT", "GREEN|RED:UP_LEFT"], solution: { A: "RED|GREEN:DOWN_RIGHT", B: "BLUE|RED:DOWN_LEFT", C: "RED|BLUE:UP_RIGHT", D: "GREEN|RED:UP_LEFT" }, hint: "All arrows are diagonal — forming an X." },
  { number: 8, name: "Star Node", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["PURPLE|ORANGE:DOWN", "ORANGE|ORANGE:RIGHT", "ORANGE|PURPLE:UP,ORANGE:LEFT", "GREEN|ORANGE:LEFT", "PURPLE|ORANGE:UP"], solution: { A: "PURPLE|ORANGE:DOWN", B: "ORANGE|ORANGE:RIGHT", C: "ORANGE|PURPLE:UP,ORANGE:LEFT", D: "GREEN|ORANGE:LEFT", E: "PURPLE|ORANGE:UP" }, hint: "C is the star center with 2 arrows." },
  { number: 9, name: "Full Grid", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["RED|BLUE:RIGHT", "BLUE|GREEN:RIGHT,RED:DOWN_LEFT", "GREEN|BLUE:DOWN", "RED|GREEN:RIGHT", "GREEN|BLUE:UP", "BLUE|GREEN:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|GREEN:RIGHT,RED:DOWN_LEFT", C: "GREEN|BLUE:DOWN", D: "RED|GREEN:RIGHT", E: "GREEN|BLUE:UP", F: "BLUE|GREEN:LEFT" }, hint: "B has 2 arrows at different angles." },
  // === CH2: MULTI-OUTPUT (10-18) ===
  { number: 10, name: "Triple Threat", cells: ["A", "B", "C", "D"], layout: [[null, "A", null], ["B", "C", "D"]], pieces: ["PURPLE|ORANGE:DOWN", "ORANGE|ORANGE:RIGHT", "ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT", "GREEN|ORANGE:LEFT"], solution: { A: "PURPLE|ORANGE:DOWN", B: "ORANGE|ORANGE:RIGHT", C: "ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT", D: "GREEN|ORANGE:LEFT" }, hint: "C has THREE arrows — one to each neighbor!" },
  { number: 11, name: "Broadcast", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B"], ["C", "D"], ["E", null]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", "BLUE|RED:LEFT", "GREEN|RED:UP", "PURPLE|GREEN:LEFT", "CYAN|GREEN:UP"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", B: "BLUE|RED:LEFT", C: "GREEN|RED:UP", D: "PURPLE|GREEN:LEFT", E: "CYAN|GREEN:UP" }, hint: "A broadcasts 3 signals!" },
  { number: 12, name: "Quad Core", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["RED|ORANGE:DOWN", "BLUE|ORANGE:RIGHT", "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|ORANGE:LEFT", "PURPLE|ORANGE:UP"], solution: { A: "RED|ORANGE:DOWN", B: "BLUE|ORANGE:RIGHT", C: "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", D: "GREEN|ORANGE:LEFT", E: "PURPLE|ORANGE:UP" }, hint: "C has FOUR arrows — one to each cardinal!" },
  { number: 13, name: "Relay", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", "BLUE|RED:LEFT", "ORANGE|BLUE:LEFT", "GREEN|RED:UP", "PURPLE|GREEN:LEFT", "PINK|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", B: "BLUE|RED:LEFT", C: "ORANGE|BLUE:LEFT", D: "GREEN|RED:UP", E: "PURPLE|GREEN:LEFT", F: "PINK|PURPLE:LEFT" }, hint: "A relays 3 signals across the grid." },
  { number: 14, name: "Crossfire", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["BLUE|RED:DOWN,GREEN:DOWN_LEFT", "GREEN|RED:RIGHT", "RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN", "PURPLE|RED:LEFT", "ORANGE|RED:UP"], solution: { A: "BLUE|RED:DOWN,GREEN:DOWN_LEFT", B: "GREEN|RED:RIGHT", C: "RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN", D: "PURPLE|RED:LEFT", E: "ORANGE|RED:UP" }, hint: "A and C both have multiple outputs." },
  { number: 15, name: "Pinwheel", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["RED|GREEN:DOWN_RIGHT,BLUE:RIGHT", "BLUE|RED:DOWN_LEFT", "RED|BLUE:UP_RIGHT", "GREEN|RED:UP_LEFT"], solution: { A: "RED|GREEN:DOWN_RIGHT,BLUE:RIGHT", B: "BLUE|RED:DOWN_LEFT", C: "RED|BLUE:UP_RIGHT", D: "GREEN|RED:UP_LEFT" }, hint: "A spins two arrows: diagonal and cardinal." },
  { number: 16, name: "Cascade", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "PURPLE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|BLUE:RIGHT", C: "BLUE|PURPLE:RIGHT", D: "PURPLE|BLUE:LEFT" }, hint: "A waterfall of arrows flows right." },
  { number: 17, name: "Trident", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C"], [null, "D", null], [null, "E", null]], pieces: ["RED|PURPLE:RIGHT", "PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", "GREEN|PURPLE:LEFT", "BLUE|ORANGE:DOWN", "ORANGE|BLUE:UP"], solution: { A: "RED|PURPLE:RIGHT", B: "PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", C: "GREEN|PURPLE:LEFT", D: "BLUE|ORANGE:DOWN", E: "ORANGE|BLUE:UP" }, hint: "B is the trident head — 3 prongs." },
  { number: 18, name: "Mirror", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["GREEN|BLUE:DOWN", "RED|GREEN:LEFT,PURPLE:RIGHT", "PURPLE|RED:LEFT", "BLUE|GREEN:UP", "ORANGE|BLUE:LEFT,CYAN:RIGHT", "CYAN|ORANGE:LEFT"], solution: { A: "GREEN|BLUE:DOWN", B: "RED|GREEN:LEFT,PURPLE:RIGHT", C: "PURPLE|RED:LEFT", D: "BLUE|GREEN:UP", E: "ORANGE|BLUE:LEFT,CYAN:RIGHT", F: "CYAN|ORANGE:LEFT" }, hint: "B and E mirror each other." },
  // === CH3: COMPLEX LAYOUTS (19-30) ===
  { number: 19, name: "Diamond", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT", "GREEN|CYAN:UP_RIGHT", "RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT", "PURPLE|CYAN:UP_LEFT", "ORANGE|RED:UP"], solution: { A: "CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT", B: "GREEN|CYAN:UP_RIGHT", C: "RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT", D: "PURPLE|CYAN:UP_LEFT", E: "ORANGE|RED:UP" }, hint: "A shoots diagonals. C controls the center." },
  { number: 20, name: "Web", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["CYAN|BLUE:RIGHT", "BLUE|ORANGE:DOWN", "PINK|BLUE:LEFT", "RED|ORANGE:RIGHT", "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT", "GREEN|ORANGE:LEFT"], solution: { A: "CYAN|BLUE:RIGHT", B: "BLUE|ORANGE:DOWN", C: "PINK|BLUE:LEFT", D: "RED|ORANGE:RIGHT", E: "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT", F: "GREEN|ORANGE:LEFT" }, hint: "E is the web center with 4 arrows!" },
  { number: 21, name: "Zigzag", cells: ["A", "B", "C", "D"], layout: [["A", "B", null], [null, "C", "D"]], pieces: ["RED|GREEN:RIGHT", "GREEN|RED:DOWN,BLUE:DOWN_RIGHT", "RED|GREEN:UP", "BLUE|RED:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|RED:DOWN,BLUE:DOWN_RIGHT", C: "RED|GREEN:UP", D: "BLUE|RED:LEFT" }, hint: "B sends two arrows down." },
  { number: 22, name: "Fortress", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN", "BLUE|RED:LEFT", "PURPLE|ORANGE:DOWN", "GREEN|RED:UP", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:UP,GREEN:LEFT"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN", B: "BLUE|RED:LEFT", C: "PURPLE|ORANGE:DOWN", D: "GREEN|RED:UP", E: "GREEN|ORANGE:RIGHT", F: "ORANGE|PURPLE:UP,GREEN:LEFT" }, hint: "A and F are the twin towers." },
  { number: 23, name: "Helix", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|BLUE:RIGHT", "BLUE|GREEN:LEFT", "CYAN|PURPLE:RIGHT", "PURPLE|BLUE:UP", "ORANGE|GREEN:UP,PURPLE:LEFT", "PINK|ORANGE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", C: "GREEN|BLUE:RIGHT", D: "BLUE|GREEN:LEFT", E: "CYAN|PURPLE:RIGHT", F: "PURPLE|BLUE:UP", G: "ORANGE|GREEN:UP,PURPLE:LEFT", H: "PINK|ORANGE:LEFT" }, hint: "The helix winds through 8 tiles." },
  { number: 24, name: "Compass", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["RED|ORANGE:DOWN,BLUE:DOWN_LEFT", "BLUE|ORANGE:RIGHT", "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|ORANGE:LEFT", "PURPLE|ORANGE:UP"], solution: { A: "RED|ORANGE:DOWN,BLUE:DOWN_LEFT", B: "BLUE|ORANGE:RIGHT", C: "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", D: "GREEN|ORANGE:LEFT", E: "PURPLE|ORANGE:UP" }, hint: "C is a 4-way compass." },
  { number: 25, name: "River", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["RED|GREEN:RIGHT", "GREEN|RED:LEFT", "PURPLE|GREEN:LEFT,BLUE:RIGHT", "BLUE|PURPLE:LEFT", "ORANGE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|RED:LEFT", C: "PURPLE|GREEN:LEFT,BLUE:RIGHT", D: "BLUE|PURPLE:LEFT", E: "ORANGE|BLUE:LEFT" }, hint: "C splits the river." },
  { number: 26, name: "Spiral", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B"], ["C", "D"], ["E", null]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", "BLUE|RED:LEFT", "GREEN|RED:UP", "PURPLE|GREEN:LEFT", "ORANGE|GREEN:UP"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", B: "BLUE|RED:LEFT", C: "GREEN|RED:UP", D: "PURPLE|GREEN:LEFT", E: "ORANGE|GREEN:UP" }, hint: "A spirals outward with 3 arrows." },
  { number: 27, name: "Nexus", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|BLUE:LEFT", "RED|PURPLE:RIGHT", "PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT", "GREEN|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", C: "GREEN|BLUE:LEFT", D: "RED|PURPLE:RIGHT", E: "PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT", F: "GREEN|PURPLE:LEFT" }, hint: "B and E are twin nexus points!" },
  { number: 28, name: "Galaxy", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT", "BLUE|ORANGE:RIGHT", "ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN", "GREEN|ORANGE:LEFT", "RED|ORANGE:UP"], solution: { A: "PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT", B: "BLUE|ORANGE:RIGHT", C: "ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN", D: "GREEN|ORANGE:LEFT", E: "RED|ORANGE:UP" }, hint: "C is a galaxy core with 4 outputs." },
  { number: 29, name: "Labyrinth", cells: ["A", "B", "C", "D", "E", "F", "G"], layout: [[null, "A", null], ["B", "C", "D"], ["E", "F", "G"]], pieces: ["RED|BLUE:DOWN", "CYAN|BLUE:RIGHT", "BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT", "PURPLE|BLUE:LEFT", "ORANGE|GREEN:RIGHT", "GREEN|ORANGE:LEFT,PINK:RIGHT", "PINK|GREEN:LEFT"], solution: { A: "RED|BLUE:DOWN", B: "CYAN|BLUE:RIGHT", C: "BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT", D: "PURPLE|BLUE:LEFT", E: "ORANGE|GREEN:RIGHT", F: "GREEN|ORANGE:LEFT,PINK:RIGHT", G: "PINK|GREEN:LEFT" }, hint: "C and F are dual hubs." },
  { number: 30, name: "Chromatic Grid", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:LEFT,CYAN:RIGHT", "CYAN|BLUE:LEFT", "RED|ORANGE:RIGHT", "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|ORANGE:LEFT", "YELLOW|PURPLE:RIGHT", "PURPLE|YELLOW:LEFT,PINK:RIGHT", "PINK|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:LEFT,CYAN:RIGHT", C: "CYAN|BLUE:LEFT", D: "RED|ORANGE:RIGHT", E: "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", F: "GREEN|ORANGE:LEFT", G: "YELLOW|PURPLE:RIGHT", H: "PURPLE|YELLOW:LEFT,PINK:RIGHT", I: "PINK|PURPLE:LEFT" }, hint: "E has 4 outputs. 9 tiles!" },
  // === CH4: SOURCES & SINKS (31-38) ===
  { number: 31, name: "Source & Sink", cells: ["A", "B"], layout: [["A", "B"]], pieces: ["OUT:RED|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT", B: "IN:RED" }, hint: "SRC (gold) sends arrows out. SINK (blue) is the destination — arrows point INTO it." },
  { number: 32, name: "Relay Station", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["OUT:GREEN|GREEN:RIGHT", "GREEN|RED:RIGHT", "IN:RED"], solution: { A: "OUT:GREEN|GREEN:RIGHT", B: "GREEN|RED:RIGHT", C: "IN:RED" }, hint: "Source→relay→sink. Colors shift at each tile." },
  { number: 33, name: "Broadcaster", cells: ["A", "B", "C"], layout: [["A", "B"], [null, "C"]], pieces: ["OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT", "BLUE|GREEN:DOWN", "IN:GREEN"], solution: { A: "OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT", B: "BLUE|GREEN:DOWN", C: "IN:GREEN" }, hint: "Source sends two signals. Both reach the sink!" },
  { number: 34, name: "Funnel", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["OUT:RED|RED:RIGHT", "RED|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT", B: "RED|BLUE:RIGHT", C: "IN:BLUE" }, hint: "RED→BLUE transformation through the relay." },
  { number: 35, name: "Twin Sinks", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["OUT:RED|GREEN:RIGHT,PURPLE:DOWN", "IN:GREEN", "PURPLE|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|GREEN:RIGHT,PURPLE:DOWN", B: "IN:GREEN", C: "PURPLE|BLUE:RIGHT", D: "IN:BLUE" }, hint: "Source splits to two paths, each ending at a sink." },
  { number: 36, name: "Distribution", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:CYAN|CYAN:DOWN", "ORANGE|CYAN:RIGHT", "CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "IN:GREEN", "IN:PURPLE"], solution: { A: "OUT:CYAN|CYAN:DOWN", B: "ORANGE|CYAN:RIGHT", C: "CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", D: "IN:GREEN", E: "IN:PURPLE" }, hint: "Source feeds C. C distributes to two sinks." },
  { number: 37, name: "Pipeline", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT", B: "RED|GREEN:RIGHT", C: "GREEN|BLUE:RIGHT", D: "BLUE|PURPLE:RIGHT", E: "IN:PURPLE" }, hint: "Long pipeline: each tile shifts the color once." },
  { number: 38, name: "Crossroads", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|BLUE:RIGHT,GREEN:DOWN", "BLUE|PURPLE:RIGHT", "IN:PURPLE", "GREEN|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|BLUE:RIGHT,GREEN:DOWN", B: "BLUE|PURPLE:RIGHT", C: "IN:PURPLE", D: "GREEN|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Two lanes from one source to two sinks." },
  // === CH5: JUMPER ARROWS (39-46) ===
  { number: 39, name: "Leap", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["RED|BLUE:RIGHT:2", "PURPLE|RED:LEFT", "BLUE|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT:2", B: "PURPLE|RED:LEFT", C: "BLUE|PURPLE:LEFT" }, hint: "A jumps OVER B to reach C! Distance-2 arrow." },
  { number: 40, name: "Hop Skip", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|GREEN:RIGHT,BLUE:RIGHT:2", "GREEN|RED:LEFT", "BLUE|GREEN:LEFT", "ORANGE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT,BLUE:RIGHT:2", B: "GREEN|RED:LEFT", C: "BLUE|GREEN:LEFT", D: "ORANGE|BLUE:LEFT" }, hint: "A sends nearby AND jumps. Two distances from one tile." },
  { number: 41, name: "Long Shot", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|BLUE:RIGHT:3", "GREEN|RED:LEFT", "PURPLE|GREEN:LEFT", "BLUE|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT:3", B: "GREEN|RED:LEFT", C: "PURPLE|GREEN:LEFT", D: "BLUE|PURPLE:LEFT" }, hint: "A fires all the way to D — distance 3!" },
  { number: 42, name: "Spectrum", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3", "GREEN|RED:LEFT", "BLUE|GREEN:LEFT", "PURPLE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3", B: "GREEN|RED:LEFT", C: "BLUE|GREEN:LEFT", D: "PURPLE|BLUE:LEFT" }, hint: "A sends 3 arrows at distances 1, 2, and 3!" },
  { number: 43, name: "Vault", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["RED|BLUE:DOWN:2", "GREEN|RED:DOWN", "PURPLE|RED:RIGHT", "RED|GREEN:UP,PURPLE:LEFT", "BLUE|PURPLE:RIGHT", "PURPLE|BLUE:LEFT"], solution: { A: "RED|BLUE:DOWN:2", B: "GREEN|RED:DOWN", C: "PURPLE|RED:RIGHT", D: "RED|GREEN:UP,PURPLE:LEFT", E: "BLUE|PURPLE:RIGHT", F: "PURPLE|BLUE:LEFT" }, hint: "A vaults over row 2 to reach row 3!" },
  { number: 44, name: "Sniper", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["OUT:RED|BLUE:RIGHT:3", "GREEN|RED:RIGHT", "RED|GREEN:LEFT", "BLUE|RED:LEFT"], solution: { A: "OUT:RED|BLUE:RIGHT:3", B: "GREEN|RED:RIGHT", C: "RED|GREEN:LEFT", D: "BLUE|RED:LEFT" }, hint: "Source snipes distance 3 to the far end." },
  { number: 45, name: "Catapult", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["OUT:RED|RED:RIGHT,GREEN:RIGHT:3", "RED|BLUE:RIGHT", "BLUE|ORANGE:RIGHT:2", "GREEN|PURPLE:RIGHT", "IN:ORANGE,PURPLE"], solution: { A: "OUT:RED|RED:RIGHT,GREEN:RIGHT:3", B: "RED|BLUE:RIGHT", C: "BLUE|ORANGE:RIGHT:2", D: "GREEN|PURPLE:RIGHT", E: "IN:ORANGE,PURPLE" }, hint: "Source fires short and long. C catapults over D." },
  { number: 46, name: "Vertical Snipe", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|GREEN:RIGHT,BLUE:DOWN:2", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "IN:PURPLE", "CYAN|PURPLE:LEFT,PINK:RIGHT", "PINK|CYAN:LEFT", "BLUE|RED:RIGHT", "RED|CYAN:RIGHT", "IN:CYAN"], solution: { A: "RED|GREEN:RIGHT,BLUE:DOWN:2", B: "GREEN|ORANGE:RIGHT", C: "IN:ORANGE", D: "IN:PURPLE", E: "CYAN|PURPLE:LEFT,PINK:RIGHT", F: "PINK|CYAN:LEFT", G: "BLUE|RED:RIGHT", H: "RED|CYAN:RIGHT", I: "IN:CYAN" }, hint: "A snipes vertically down 2 rows to G!" },
  // === CH6: GAPS (47-54) ===
  { number: 47, name: "Mind the Gap", cells: ["A", "B"], layout: [["A", null, "B"]], pieces: ["RED|BLUE:RIGHT:2", "IN:BLUE"], solution: { A: "RED|BLUE:RIGHT:2", B: "IN:BLUE" }, hint: "A jumps OVER the empty gap to reach the sink!" },
  { number: 48, name: "Canyon", cells: ["A", "B", "C"], layout: [["A", null, null, "B", "C"]], pieces: ["RED|GREEN:RIGHT:3", "GREEN|BLUE:RIGHT", "IN:BLUE"], solution: { A: "RED|GREEN:RIGHT:3", B: "GREEN|BLUE:RIGHT", C: "IN:BLUE" }, hint: "A fires across a 2-cell canyon to reach B!" },
  { number: 49, name: "Bridge Builder", cells: ["A", "B", "C", "D"], layout: [["A", null, "B"], [null, null, null], ["C", null, "D"]], pieces: ["RED|BLUE:RIGHT:2,GREEN:DOWN:2", "BLUE|PURPLE:DOWN:2", "GREEN|ORANGE:RIGHT:2", "IN:ORANGE,PURPLE"], solution: { A: "RED|BLUE:RIGHT:2,GREEN:DOWN:2", B: "BLUE|PURPLE:DOWN:2", C: "GREEN|ORANGE:RIGHT:2", D: "IN:ORANGE,PURPLE" }, hint: "Build signal bridges across a 3×3 grid with only corners filled!" },
  { number: 50, name: "Island Hop", cells: ["A", "B", "C", "D", "E"], layout: [["A", null, "B", null, "C"], [null, null, null, null, null], ["D", null, null, null, "E"]], pieces: ["RED|GREEN:RIGHT:2,BLUE:DOWN:2", "GREEN|ORANGE:RIGHT:2", "IN:ORANGE", "BLUE|CYAN:RIGHT:4", "IN:CYAN"], solution: { A: "RED|GREEN:RIGHT:2,BLUE:DOWN:2", B: "GREEN|ORANGE:RIGHT:2", C: "IN:ORANGE", D: "BLUE|CYAN:RIGHT:4", E: "IN:CYAN" }, hint: "Hop between islands across a sea of gaps!" },
  { number: 51, name: "Gap Cross", cells: ["A", "B", "C", "D"], layout: [["A", "B"], [null, null], ["C", "D"]], pieces: ["OUT:RED|RED:RIGHT,GREEN:DOWN:2", "IN:RED", "GREEN|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT,GREEN:DOWN:2", B: "IN:RED", C: "GREEN|BLUE:RIGHT", D: "IN:BLUE" }, hint: "Source fires right AND vaults the gap to the bottom!" },
  { number: 52, name: "Ravine", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], [null, null, null], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN:2", "RED|GREEN:RIGHT", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN:2", B: "RED|GREEN:RIGHT", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Source bridges the ravine with a distance-2 vertical jump!" },
  { number: 53, name: "Archipelago", cells: ["A", "B", "C", "D", "E", "F", "G"], layout: [["A", null, "B", null, "C"], [null, null, null, null, null], ["D", null, "E", null, "F"], [null, null, null, null, null], [null, null, "G", null, null]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN:2", "RED|GREEN:RIGHT:2", "IN:GREEN", "BLUE|CYAN:RIGHT:2", "CYAN|PINK:RIGHT:2", "IN:PINK", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN:2", B: "RED|GREEN:RIGHT:2", C: "IN:GREEN", D: "BLUE|CYAN:RIGHT:2", E: "CYAN|PINK:RIGHT:2", F: "IN:PINK", G: "IN:PURPLE" }, hint: "7 islands in a sea of gaps! Chain jumps across the archipelago." },
  { number: 54, name: "Grand Chasm", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", null, null, "C", "D"], [null, null, null, null, null, null], ["E", "F", null, null, "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN:2", "RED|GREEN:RIGHT:3", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT", "CYAN|PINK:RIGHT:3", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN:2", B: "RED|GREEN:RIGHT:3", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "CYAN|PINK:RIGHT:3", G: "PINK|RED:RIGHT", H: "IN:RED" }, hint: "8 tiles on 2 platforms separated by a grand chasm!" },
  // === CH7: ADVANCED COMBOS (55-62) ===
  { number: 55, name: "Network", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|BLUE:RIGHT,GREEN:DOWN", "BLUE|PURPLE:RIGHT", "IN:PURPLE", "GREEN|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|BLUE:RIGHT,GREEN:DOWN", B: "BLUE|PURPLE:RIGHT", C: "IN:PURPLE", D: "GREEN|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Two pipelines from one source to two sinks." },
  { number: 56, name: "Jump Hub", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:ORANGE|ORANGE:DOWN", "RED|ORANGE:RIGHT", "ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", "IN:GREEN", "IN:BLUE"], solution: { A: "OUT:ORANGE|ORANGE:DOWN", B: "RED|ORANGE:RIGHT", C: "ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", D: "IN:GREEN", E: "IN:BLUE" }, hint: "Source feeds the central hub. Hub distributes to sinks." },
  { number: 57, name: "Skip Chain", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["RED|GREEN:RIGHT:2", "BLUE|RED:LEFT", "GREEN|BLUE:RIGHT:2", "PURPLE|GREEN:LEFT", "IN:BLUE"], solution: { A: "RED|GREEN:RIGHT:2", B: "BLUE|RED:LEFT", C: "GREEN|BLUE:RIGHT:2", D: "PURPLE|GREEN:LEFT", E: "IN:BLUE" }, hint: "Two distance-2 jumps form a skip chain!" },
  { number: 58, name: "Triple Strike", cells: ["A", "B", "C", "D"], layout: [[null, "A", null], ["B", "C", "D"]], pieces: ["OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT", "IN:GREEN", "IN:BLUE", "IN:PURPLE"], solution: { A: "OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT", B: "IN:GREEN", C: "IN:BLUE", D: "IN:PURPLE" }, hint: "Source fires 3 arrows: diagonal, down, diagonal!" },
  { number: 59, name: "Leapfrog", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C", "D", "E", "F"]], pieces: ["RED|GREEN:RIGHT:2", "ORANGE|RED:LEFT", "GREEN|BLUE:RIGHT:2", "PURPLE|GREEN:LEFT", "BLUE|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "RED|GREEN:RIGHT:2", B: "ORANGE|RED:LEFT", C: "GREEN|BLUE:RIGHT:2", D: "PURPLE|GREEN:LEFT", E: "BLUE|PURPLE:RIGHT", F: "IN:PURPLE" }, hint: "Leapfrog: A→C, C→E, E walks to the sink." },
  { number: 60, name: "Reverse Flow", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D"], ["E", null, null, null]], pieces: ["IN:RED", "RED|GREEN:RIGHT,BLUE:DOWN", "GREEN|RED:LEFT", "OUT:BLUE|RED:LEFT:3", "BLUE|RED:UP"], solution: { A: "RED|GREEN:RIGHT,BLUE:DOWN", B: "GREEN|RED:LEFT", C: "IN:RED", D: "OUT:BLUE|RED:LEFT:3", E: "BLUE|RED:UP" }, hint: "Source fires BACKWARD with a distance-3 shot!" },
  { number: 61, name: "Pincer", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:RED|RED:DOWN", "IN:BLUE", "RED|BLUE:LEFT,GREEN:RIGHT", "IN:GREEN", "OUT:CYAN|RED:UP"], solution: { A: "OUT:RED|RED:DOWN", B: "IN:BLUE", C: "RED|BLUE:LEFT,GREEN:RIGHT", D: "IN:GREEN", E: "OUT:CYAN|RED:UP" }, hint: "Two sources pinch the center. Hub feeds two sinks." },
  { number: 62, name: "Gap Leap", cells: ["A", "B", "C", "D"], layout: [["A", null, "B"], ["C", null, "D"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "IN:RED", "BLUE|GREEN:RIGHT:2", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "IN:RED", C: "BLUE|GREEN:RIGHT:2", D: "IN:GREEN" }, hint: "Jump gaps on two different rows!" },
  // === CH7: EXPERT (55-60) ===
  { number: 63, name: "Grand Pipeline", cells: ["A", "B", "C", "D", "E", "F", "G"], layout: [["A", "B", "C", "D", "E", "F", "G"]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "PURPLE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT", B: "RED|GREEN:RIGHT", C: "GREEN|BLUE:RIGHT", D: "BLUE|PURPLE:RIGHT", E: "PURPLE|ORANGE:RIGHT", F: "ORANGE|CYAN:RIGHT", G: "IN:CYAN" }, hint: "7 tiles, 6 color shifts. The longest pipeline!" },
  { number: 64, name: "Star Burst", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:DOWN", "PINK|BLUE:LEFT", "ORANGE|RED:RIGHT", "RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|RED:LEFT", "CYAN|ORANGE:UP", "PURPLE|RED:UP", "YELLOW|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:DOWN", C: "PINK|BLUE:LEFT", D: "ORANGE|RED:RIGHT", E: "RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", F: "GREEN|RED:LEFT", G: "CYAN|ORANGE:UP", H: "PURPLE|RED:UP", I: "YELLOW|PURPLE:LEFT" }, hint: "E is a 4-output star in a 3x3 grid!" },
  { number: 65, name: "Highway", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "GREEN|ORANGE:RIGHT,PURPLE:DOWN", "IN:ORANGE", "BLUE|CYAN:RIGHT", "CYAN|BLUE:LEFT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "GREEN|ORANGE:RIGHT,PURPLE:DOWN", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "CYAN|BLUE:LEFT", G: "PURPLE|PINK:RIGHT", H: "IN:PINK" }, hint: "Two highway lanes with exits and sinks." },
  { number: 66, name: "Sniper Nest", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2", "GREEN|RED:LEFT,GREEN:RIGHT", "IN:GREEN", "BLUE|GREEN:RIGHT", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "PURPLE|CYAN:RIGHT", "CYAN|PINK:RIGHT", "IN:PINK"], solution: { A: "RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2", B: "GREEN|RED:LEFT,GREEN:RIGHT", C: "IN:GREEN", D: "BLUE|GREEN:RIGHT", E: "GREEN|ORANGE:RIGHT", F: "IN:ORANGE", G: "PURPLE|CYAN:RIGHT", H: "CYAN|PINK:RIGHT", I: "IN:PINK" }, hint: "A fires 3 levels deep including a distance-2 snipe!" },
  { number: 67, name: "Grand Gap Cross", cells: ["A", "B", "C", "D", "E"], layout: [[null, null, "A", null, null], [null, null, null, null, null], ["B", null, "C", null, "D"], [null, null, null, null, null], [null, null, "E", null, null]], pieces: ["IN:RED", "IN:BLUE", "OUT:PURPLE|RED:UP:2,BLUE:LEFT:2,GREEN:RIGHT:2,ORANGE:DOWN:2", "IN:GREEN", "IN:ORANGE"], solution: { A: "IN:RED", B: "IN:BLUE", C: "OUT:PURPLE|RED:UP:2,BLUE:LEFT:2,GREEN:RIGHT:2,ORANGE:DOWN:2", D: "IN:GREEN", E: "IN:ORANGE" }, hint: "A grand cross spanning distance-2 gaps in all directions!" },
  { number: 68, name: "Chromatic Nexus", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "GREEN|ORANGE:RIGHT,PURPLE:DOWN", "IN:ORANGE", "BLUE|CYAN:RIGHT,RED:DOWN", "CYAN|BLUE:LEFT", "PURPLE|PINK:RIGHT", "PINK|PURPLE:LEFT", "RED|YELLOW:RIGHT", "YELLOW|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "GREEN|ORANGE:RIGHT,PURPLE:DOWN", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT,RED:DOWN", F: "CYAN|BLUE:LEFT", G: "PURPLE|PINK:RIGHT", H: "PINK|PURPLE:LEFT", I: "RED|YELLOW:RIGHT", J: "YELLOW|BLUE:RIGHT", K: "BLUE|GREEN:RIGHT", L: "IN:GREEN" }, hint: "12 tiles, 3 connected rows. The nexus!" },
  // === CHAPTER 8: PIPES (61-70) ===
  { number: 69, name: "First Pipe", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "IN:BLUE"], solution: { A: "RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "IN:BLUE" }, hint: "The pipe transforms RED into BLUE! New tile type." },
  { number: 70, name: "Pipe Relay", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["OUT:RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN" }, hint: "Source → pipe → sink. The pipe changes the color." },
  { number: 71, name: "Double Transform", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "PIPE:LEFT:BLUE>RIGHT:GREEN", "IN:GREEN"], solution: { A: "RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "PIPE:LEFT:BLUE>RIGHT:GREEN", D: "IN:GREEN" }, hint: "Two pipes chain: RED→BLUE→GREEN." },
  { number: 72, name: "Pipe or Normal?", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["OUT:RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "BLUE|GREEN:RIGHT", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "BLUE|GREEN:RIGHT", D: "IN:GREEN" }, hint: "Mix of pipe and normal tile. Which goes where?" },
  { number: 73, name: "Pipe Bend", cells: ["A", "B", "C"], layout: [["A", "B"], [null, "C"]], pieces: ["RED|RED:RIGHT", "PIPE:LEFT:RED>DOWN:BLUE", "IN:BLUE"], solution: { A: "RED|RED:RIGHT", B: "PIPE:LEFT:RED>DOWN:BLUE", C: "IN:BLUE" }, hint: "This pipe bends — enters left, exits downward." },
  { number: 74, name: "Cross Pipe", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["RED|RED:DOWN", "BLUE|BLUE:RIGHT", "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", "IN:PURPLE", "IN:GREEN"], solution: { A: "RED|RED:DOWN", B: "BLUE|BLUE:RIGHT", C: "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", D: "IN:PURPLE", E: "IN:GREEN" }, hint: "Cross pipe has TWO channels! Signals pass through independently." },
  { number: 75, name: "Pipe Fork", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["RED|RED:RIGHT,GREEN:DOWN", "PIPE:LEFT:RED>DOWN:BLUE", "GREEN|PURPLE:RIGHT", "IN:BLUE,PURPLE"], solution: { A: "RED|RED:RIGHT,GREEN:DOWN", B: "PIPE:LEFT:RED>DOWN:BLUE", C: "GREEN|PURPLE:RIGHT", D: "IN:BLUE,PURPLE" }, hint: "A sends two signals. One goes through the pipe." },
  { number: 76, name: "Pipe Vault", cells: ["A", "B", "C"], layout: [["A", null, "B", "C"]], pieces: ["OUT:RED|RED:RIGHT:2", "PIPE:LEFT:RED>RIGHT:BLUE", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT:2", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "IN:BLUE" }, hint: "Jump the gap straight into the pipe!" },
  { number: 77, name: "L-Pipe Chain", cells: ["A", "B", "C", "D"], layout: [["A", "B"], [null, "C"], [null, "D"]], pieces: ["OUT:RED|RED:RIGHT", "PIPE:LEFT:RED>DOWN:BLUE", "PIPE:UP:BLUE>DOWN:GREEN", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT", B: "PIPE:LEFT:RED>DOWN:BLUE", C: "PIPE:UP:BLUE>DOWN:GREEN", D: "IN:GREEN" }, hint: "Two bending pipes form an L-shaped path." },
  { number: 78, name: "Pipe Star", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:RED|RED:DOWN", "OUT:BLUE|BLUE:RIGHT", "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", "IN:PURPLE", "IN:GREEN"], solution: { A: "OUT:RED|RED:DOWN", B: "OUT:BLUE|BLUE:RIGHT", C: "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", D: "IN:PURPLE", E: "IN:GREEN" }, hint: "Two sources feed a cross pipe. Two sinks absorb." },
  // === CHAPTER 9: MASTER (71-80) ===
  { number: 79, name: "Pipe Cascade", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT,RED:DOWN", "CYAN|YELLOW:RIGHT", "YELLOW|PINK:RIGHT", "IN:PINK", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT,RED:DOWN", F: "CYAN|YELLOW:RIGHT", G: "YELLOW|PINK:RIGHT", H: "IN:PINK", I: "RED|GREEN:RIGHT", J: "GREEN|BLUE:RIGHT", K: "BLUE|PURPLE:RIGHT", L: "IN:PURPLE" }, hint: "12 tiles with pipe transforming colors across 3 connected lanes!" },
  { number: 80, name: "Transform Junction", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "One pipe lane + one normal lane from a single source!" },
  { number: 81, name: "Sniper Pipes", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "PURPLE|RED:RIGHT", "PIPE:LEFT:RED>DOWN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:GREEN,PURPLE"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "PURPLE|RED:RIGHT", C: "PIPE:LEFT:RED>DOWN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|PURPLE:RIGHT", F: "IN:GREEN,PURPLE" }, hint: "Distance-2 snipe feeds a bending pipe!" },
  { number: 82, name: "Pipe Matrix", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:DOWN", "BLUE|CYAN:RIGHT,PURPLE:DOWN", "CYAN|PINK:RIGHT", "IN:ORANGE,PINK", "PURPLE|YELLOW:RIGHT", "YELLOW|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:DOWN", D: "BLUE|CYAN:RIGHT,PURPLE:DOWN", E: "CYAN|PINK:RIGHT", F: "IN:ORANGE,PINK", G: "PURPLE|YELLOW:RIGHT", H: "YELLOW|RED:RIGHT", I: "IN:RED" }, hint: "3x3 grid with pipe + vertical flow!" },
  { number: 83, name: "Gap Over Pipe", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C"], ["D", null, "E"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT:2", "IN:ORANGE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT:2", E: "IN:ORANGE" }, hint: "Normal flow up top, but the bottom row jumps a gap!" },
  { number: 84, name: "Grand Transformer", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "PIPE:LEFT:ORANGE>RIGHT:PURPLE", "IN:PURPLE", "BLUE|CYAN:RIGHT", "PIPE:LEFT:CYAN>RIGHT:PINK", "PINK|YELLOW:RIGHT", "YELLOW|GREEN:RIGHT", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "PIPE:LEFT:ORANGE>RIGHT:PURPLE", E: "IN:PURPLE", F: "BLUE|CYAN:RIGHT", G: "PIPE:LEFT:CYAN>RIGHT:PINK", H: "PINK|YELLOW:RIGHT", I: "YELLOW|GREEN:RIGHT", J: "IN:GREEN" }, hint: "10 tiles! 3 pipes create a transformation chain!" },
  { number: 85, name: "Pipe Nexus", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["OUT:RED|RED:DOWN,BLUE:RIGHT", "BLUE|GREEN:DOWN,PINK:RIGHT", "IN:PINK", "RED|CYAN:RIGHT", "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:PURPLE", "IN:ORANGE", "IN:YELLOW", "PURPLE|YELLOW:LEFT,RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:DOWN,BLUE:RIGHT", B: "BLUE|GREEN:DOWN,PINK:RIGHT", C: "IN:PINK", D: "RED|CYAN:RIGHT", E: "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:PURPLE", F: "IN:ORANGE", G: "IN:YELLOW", H: "PURPLE|YELLOW:LEFT,RED:RIGHT", I: "IN:RED" }, hint: "Cross pipe in the center routes signals vertically and horizontally!" },
  { number: 86, name: "Chromatic Forge", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,GREEN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|CYAN:RIGHT", "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:YELLOW", "ORANGE|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED", "IN:BLUE", "YELLOW|RED:RIGHT", "RED|BLUE:RIGHT", "BLUE|ORANGE:RIGHT", "IN:ORANGE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,GREEN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|CYAN:RIGHT", G: "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:YELLOW", H: "ORANGE|PINK:RIGHT", I: "PINK|RED:RIGHT", J: "IN:RED", K: "IN:BLUE", L: "YELLOW|RED:RIGHT", M: "RED|BLUE:RIGHT", N: "BLUE|ORANGE:RIGHT", O: "IN:ORANGE" }, hint: "15 tiles! Cross-pipe nexus connects all 3 lanes." },
  { number: 87, name: "Ultimate Synthesis", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"], ["M", "N", "O", "P"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT,YELLOW:DOWN", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", "PURPLE|BLUE:RIGHT", "IN:BLUE", "YELLOW|GREEN:DOWN", "RED|CYAN:RIGHT", "CYAN|YELLOW:RIGHT", "IN:YELLOW", "GREEN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT,YELLOW:DOWN", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", G: "PURPLE|BLUE:RIGHT", H: "IN:BLUE", I: "YELLOW|GREEN:DOWN", J: "RED|CYAN:RIGHT", K: "CYAN|YELLOW:RIGHT", L: "IN:YELLOW", M: "GREEN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "PINK|RED:RIGHT", P: "IN:RED" }, hint: "16 tiles! Cross-pipe nexus connects rows 0-3!" },
  { number: 88, name: "Chromatic Apex", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"], layout: [["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "PIPE:LEFT:GREEN>RIGHT:ORANGE", "ORANGE|PURPLE:RIGHT", "PURPLE|CYAN:RIGHT", "IN:CYAN", "BLUE|PINK:RIGHT,YELLOW:DOWN", "PINK|RED:RIGHT", "RED|BLUE:RIGHT", "BLUE|YELLOW:RIGHT", "YELLOW|GREEN:RIGHT", "IN:GREEN", "YELLOW|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PIPE:LEFT:PURPLE>RIGHT:PINK", "PINK|ORANGE:RIGHT", "ORANGE|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "PIPE:LEFT:GREEN>RIGHT:ORANGE", D: "ORANGE|PURPLE:RIGHT", E: "PURPLE|CYAN:RIGHT", F: "IN:CYAN", G: "BLUE|PINK:RIGHT,YELLOW:DOWN", H: "PINK|RED:RIGHT", I: "RED|BLUE:RIGHT", J: "BLUE|YELLOW:RIGHT", K: "YELLOW|GREEN:RIGHT", L: "IN:GREEN", M: "YELLOW|CYAN:RIGHT", N: "CYAN|PURPLE:RIGHT", O: "PIPE:LEFT:PURPLE>RIGHT:PINK", P: "PINK|ORANGE:RIGHT", Q: "ORANGE|RED:RIGHT", R: "IN:RED" }, hint: "18 tiles! The ultimate challenge with pipes across 3 lanes!" },
  // === CHAPTER 10: MASTER II (81-100) ===
  { number: 89, name: "Pipe Flow", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Pipe transforms red to green in a 2-lane flow." },
  { number: 90, name: "Cross Bend", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["OUT:RED|RED:DOWN,BLUE:RIGHT", "BLUE|GREEN:DOWN", "RED|ORANGE:RIGHT", "PIPE:UP:GREEN>DOWN:CYAN,LEFT:ORANGE>DOWN_LEFT:PURPLE", "IN:PURPLE", "IN:CYAN"], solution: { A: "OUT:RED|RED:DOWN,BLUE:RIGHT", B: "BLUE|GREEN:DOWN", C: "RED|ORANGE:RIGHT", D: "PIPE:UP:GREEN>DOWN:CYAN,LEFT:ORANGE>DOWN_LEFT:PURPLE", E: "IN:PURPLE", F: "IN:CYAN" }, hint: "Cross-pipe routes signals in a vertical flow!" },
  { number: 91, name: "Vertical Flow", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "IN:RED", "BLUE|GREEN:RIGHT,ORANGE:DOWN", "IN:GREEN", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "IN:RED", C: "BLUE|GREEN:RIGHT,ORANGE:DOWN", D: "IN:GREEN", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Three rows linked by vertical arrows!" },
  { number: 92, name: "Triple Lane", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "IN:RED", "BLUE|GREEN:RIGHT,CYAN:DOWN", "IN:GREEN", "CYAN|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "IN:RED", C: "BLUE|GREEN:RIGHT,CYAN:DOWN", D: "IN:GREEN", E: "CYAN|PURPLE:RIGHT", F: "IN:PURPLE" }, hint: "3 parallel lanes from multi-output source!" },
  { number: 93, name: "Pipe Junction", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "CYAN|PURPLE:RIGHT", G: "PURPLE|PINK:RIGHT", H: "IN:PINK" }, hint: "Pipe + sink + multi-output!" },
  { number: 94, name: "Dual Pipe", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT", "PIPE:LEFT:CYAN>RIGHT:PURPLE", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "PIPE:LEFT:CYAN>RIGHT:PURPLE", G: "PURPLE|PINK:RIGHT", H: "IN:PINK" }, hint: "Two pipes in parallel lanes!" },
  { number: 95, name: "Gap Bypass", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", null, "B", "C"], ["D", "E", null, "F"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT:2", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|PURPLE:RIGHT:2", F: "IN:PURPLE" }, hint: "Both lanes feature a gap jump!" },
  { number: 96, name: "Long Pipeline", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "PIPE:LEFT:GREEN>RIGHT:ORANGE", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|CYAN:RIGHT", "CYAN|YELLOW:RIGHT", "YELLOW|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "PIPE:LEFT:GREEN>RIGHT:ORANGE", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|CYAN:RIGHT", G: "CYAN|YELLOW:RIGHT", H: "YELLOW|PINK:RIGHT", I: "PINK|RED:RIGHT", J: "IN:RED" }, hint: "5-tile lane with pipe transformation!" },
  { number: 97, name: "Pipe Waterfall", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|CYAN:RIGHT,PURPLE:DOWN", "CYAN|ORANGE:RIGHT", "IN:ORANGE", "PURPLE|YELLOW:RIGHT", "YELLOW|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|CYAN:RIGHT,PURPLE:DOWN", E: "CYAN|ORANGE:RIGHT", F: "IN:ORANGE", G: "PURPLE|YELLOW:RIGHT", H: "YELLOW|PINK:RIGHT", I: "IN:PINK" }, hint: "3 rows linked by multi-output + pipe!" },
  { number: 98, name: "Dual Cross", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", "PURPLE|RED:RIGHT", "IN:RED", "IN:GREEN", "YELLOW|GREEN:LEFT,BLUE:RIGHT", "BLUE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", G: "PURPLE|RED:RIGHT", H: "IN:RED", I: "IN:GREEN", J: "YELLOW|GREEN:LEFT,BLUE:RIGHT", K: "BLUE|CYAN:RIGHT", L: "IN:CYAN" }, hint: "Cross-pipe nexus in a 4x3 grid!" },
  { number: 99, name: "Signal Hub", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT,PINK:DOWN", "CYAN|YELLOW:RIGHT", "YELLOW|PURPLE:RIGHT", "IN:PURPLE", "PINK|ORANGE:RIGHT", "ORANGE|BLUE:RIGHT", "BLUE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT,PINK:DOWN", F: "CYAN|YELLOW:RIGHT", G: "YELLOW|PURPLE:RIGHT", H: "IN:PURPLE", I: "PINK|ORANGE:RIGHT", J: "ORANGE|BLUE:RIGHT", K: "BLUE|CYAN:RIGHT", L: "IN:CYAN" }, hint: "12 tiles, 3 lanes with unique color chains!" },
  { number: 100, name: "Pipe Cascade II", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", "PURPLE|RED:RIGHT", "IN:RED", "IN:GREEN", "YELLOW|GREEN:LEFT,BLUE:RIGHT", "BLUE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", G: "PURPLE|RED:RIGHT", H: "IN:RED", I: "IN:GREEN", J: "YELLOW|GREEN:LEFT,BLUE:RIGHT", K: "BLUE|CYAN:RIGHT", L: "IN:CYAN" }, hint: "12 tiles with cross-pipe nexus!" },
  { number: 101, name: "Triple Transform", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,ORANGE:DOWN", "GREEN|CYAN:RIGHT", "IN:CYAN", "BLUE|PINK:RIGHT", "PIPE:UP:ORANGE>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", "PURPLE|RED:RIGHT", "IN:RED", "IN:GREEN", "YELLOW|GREEN:LEFT,BLUE:RIGHT", "BLUE|ORANGE:RIGHT", "IN:ORANGE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,ORANGE:DOWN", C: "GREEN|CYAN:RIGHT", D: "IN:CYAN", E: "BLUE|PINK:RIGHT", F: "PIPE:UP:ORANGE>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", G: "PURPLE|RED:RIGHT", H: "IN:RED", I: "IN:GREEN", J: "YELLOW|GREEN:LEFT,BLUE:RIGHT", K: "BLUE|ORANGE:RIGHT", L: "IN:ORANGE" }, hint: "12 tiles with pipe + cross-pipe!" },
  { number: 102, name: "Grand Nexus", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"], ["M", "N", "O", "P"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT,YELLOW:DOWN", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", "PURPLE|BLUE:RIGHT", "IN:BLUE", "YELLOW|GREEN:DOWN", "RED|CYAN:RIGHT", "CYAN|YELLOW:RIGHT", "IN:YELLOW", "GREEN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT,YELLOW:DOWN", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", G: "PURPLE|BLUE:RIGHT", H: "IN:BLUE", I: "YELLOW|GREEN:DOWN", J: "RED|CYAN:RIGHT", K: "CYAN|YELLOW:RIGHT", L: "IN:YELLOW", M: "GREEN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "PINK|RED:RIGHT", P: "IN:RED" }, hint: "16 tiles with cross-pipe nexus!" },
  { number: 103, name: "Pipe Fortress", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,ORANGE:DOWN", "GREEN|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "IN:PURPLE", "BLUE|PINK:RIGHT", "PIPE:UP:ORANGE>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", "YELLOW|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "IN:GREEN", "IN:CYAN", "RED|CYAN:LEFT,ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,ORANGE:DOWN", C: "GREEN|CYAN:RIGHT", D: "CYAN|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|PINK:RIGHT", G: "PIPE:UP:ORANGE>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", H: "YELLOW|BLUE:RIGHT", I: "BLUE|GREEN:RIGHT", J: "IN:GREEN", K: "IN:CYAN", L: "RED|CYAN:LEFT,ORANGE:RIGHT", M: "ORANGE|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "IN:PINK" }, hint: "15 tiles with cross-pipe nexus!" },
  { number: 104, name: "Master Flow", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", "YELLOW|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "IN:GREEN", "IN:ORANGE", "RED|ORANGE:LEFT,CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|PINK:RIGHT", G: "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", H: "YELLOW|BLUE:RIGHT", I: "BLUE|GREEN:RIGHT", J: "IN:GREEN", K: "IN:ORANGE", L: "RED|ORANGE:LEFT,CYAN:RIGHT", M: "CYAN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "IN:PINK" }, hint: "15 tiles with cross-pipe nexus!" },
  { number: 105, name: "Dual Transform", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", "YELLOW|BLUE:RIGHT", "PIPE:LEFT:BLUE>RIGHT:GREEN", "IN:GREEN", "IN:ORANGE", "RED|ORANGE:LEFT,CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|PINK:RIGHT", G: "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", H: "YELLOW|BLUE:RIGHT", I: "PIPE:LEFT:BLUE>RIGHT:GREEN", J: "IN:GREEN", K: "IN:ORANGE", L: "RED|ORANGE:LEFT,CYAN:RIGHT", M: "CYAN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "IN:PINK" }, hint: "15 tiles with pipe + cross-pipe!" },
  { number: 106, name: "Mega Gap Grid", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", null, "B", "C"], ["D", "E", null, "F"], [null, "G", null, "H"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT,PURPLE:DOWN_RIGHT", "ORANGE|PINK:RIGHT:2", "IN:PINK", "PURPLE|CYAN:RIGHT:2", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT,PURPLE:DOWN_RIGHT", E: "ORANGE|PINK:RIGHT:2", F: "IN:PINK", G: "PURPLE|CYAN:RIGHT:2", H: "IN:CYAN" }, hint: "Three lanes with pipes, diagonals, and distance-2 gap jumps!" },
  { number: 107, name: "Chromatic Master", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"], layout: [["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK", "BLUE|YELLOW:RIGHT", "PIPE:UP:CYAN>RIGHT:RED,LEFT:YELLOW>DOWN:ORANGE", "RED|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "GREEN|CYAN:RIGHT", "IN:CYAN", "IN:PURPLE", "ORANGE|PURPLE:LEFT,PINK:RIGHT", "PINK|RED:RIGHT", "RED|YELLOW:RIGHT", "YELLOW|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "PURPLE|PINK:RIGHT", F: "IN:PINK", G: "BLUE|YELLOW:RIGHT", H: "PIPE:UP:CYAN>RIGHT:RED,LEFT:YELLOW>DOWN:ORANGE", I: "RED|BLUE:RIGHT", J: "BLUE|GREEN:RIGHT", K: "GREEN|CYAN:RIGHT", L: "IN:CYAN", M: "IN:PURPLE", N: "ORANGE|PURPLE:LEFT,PINK:RIGHT", O: "PINK|RED:RIGHT", P: "RED|YELLOW:RIGHT", Q: "YELLOW|BLUE:RIGHT", R: "IN:BLUE" }, hint: "18 tiles, ultimate pipe challenge!" },
  { number: 108, name: "Chromatic Infinity", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"], layout: [["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,ORANGE:DOWN", "GREEN|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK", "BLUE|YELLOW:RIGHT", "PIPE:UP:ORANGE>RIGHT:RED,LEFT:YELLOW>DOWN:CYAN", "RED|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "IN:PURPLE", "CYAN|PURPLE:LEFT,PINK:RIGHT", "PINK|RED:RIGHT", "RED|YELLOW:RIGHT", "YELLOW|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,ORANGE:DOWN", C: "GREEN|CYAN:RIGHT", D: "CYAN|PURPLE:RIGHT", E: "PURPLE|PINK:RIGHT", F: "IN:PINK", G: "BLUE|YELLOW:RIGHT", H: "PIPE:UP:ORANGE>RIGHT:RED,LEFT:YELLOW>DOWN:CYAN", I: "RED|BLUE:RIGHT", J: "BLUE|GREEN:RIGHT", K: "GREEN|ORANGE:RIGHT", L: "IN:ORANGE", M: "IN:PURPLE", N: "CYAN|PURPLE:LEFT,PINK:RIGHT", O: "PINK|RED:RIGHT", P: "RED|YELLOW:RIGHT", Q: "YELLOW|BLUE:RIGHT", R: "IN:BLUE" }, hint: "18 tiles! Cross-pipe + multi-output finale!" },
  { number: 109, name: "Logic Gate", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, "H", null, null], [null, "G", null, "A"], ["D", null, "C", "B"], ["E", "F", null, null]], pieces: ["OUT:RED|PURPLE:DOWN", "PURPLE|RED:LEFT", "RED|BLUE:LEFT:2", "TRIGGER:BLUE:E|YELLOW:DOWN", "YELLOW|PURPLE:RIGHT", "PURPLE|BLUE:UP:2", "BLUE|RED:UP", "IN:RED"], solution: { "A": "OUT:RED|PURPLE:DOWN", "B": "PURPLE|RED:LEFT", "C": "RED|BLUE:LEFT:2", "D": "TRIGGER:BLUE:E|YELLOW:DOWN", "E": "YELLOW|PURPLE:RIGHT", "F": "PURPLE|BLUE:UP:2", "G": "BLUE|RED:UP", "H": "IN:RED" }, hint: "The trigger at D locks cell E — feed it BLUE to unlock!" },
  { number: 110, name: "Signal Relay", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["F", "E", null, "D"], ["G", null, null, "C"], [null, null, null, null], ["H", null, "A", "B"]], pieces: ["OUT:RED|PINK:RIGHT", "PINK|RED:UP:2", "RED|GREEN:UP", "GREEN|CYAN:LEFT:2", "TRIGGER:CYAN:F|ORANGE:LEFT", "PIPE:RIGHT:ORANGE>DOWN:BLUE", "BLUE|GREEN:DOWN:2", "IN:GREEN"], solution: { "A": "OUT:RED|PINK:RIGHT", "B": "PINK|RED:UP:2", "C": "RED|GREEN:UP", "D": "GREEN|CYAN:LEFT:2", "E": "TRIGGER:CYAN:F|ORANGE:LEFT", "F": "PIPE:RIGHT:ORANGE>DOWN:BLUE", "G": "BLUE|GREEN:DOWN:2", "H": "IN:GREEN" }, hint: "The trigger at E locks cell F — relay CYAN to unlock the pipe!" },
  { number: 111, name: "Decision Tree", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, "D", null, "E", "F"], [null, "C", null, "H", "G"], [null, null, null, null, null], ["A", "B", null, null, null]], pieces: ["OUT:RED|BLUE:RIGHT", "BLUE|RED:UP:2", "RED|GREEN:UP", "GREEN|CYAN:RIGHT:2", "PIPE:LEFT:CYAN>RIGHT:YELLOW", "TRIGGER:YELLOW:G|BLUE:DOWN", "TRIGGER:BLUE:C|PINK:LEFT", "IN:PINK"], solution: { "A": "OUT:RED|BLUE:RIGHT", "B": "BLUE|RED:UP:2", "C": "RED|GREEN:UP", "D": "GREEN|CYAN:RIGHT:2", "E": "PIPE:LEFT:CYAN>RIGHT:YELLOW", "F": "TRIGGER:YELLOW:G|BLUE:DOWN", "G": "TRIGGER:BLUE:C|PINK:LEFT", "H": "IN:PINK" }, hint: "Chain triggers! F locks G, and G locks C — satisfy them in order." },
  { number: 112, name: "Packet Switch", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, null, null, "H", "G"], [null, null, null, null, "F"], [null, null, null, null, "E"], ["A", "B", "C", null, "D"]], pieces: ["OUT:RED|RED:RIGHT", "RED|PURPLE:RIGHT", "PURPLE|RED:RIGHT:2", "TRIGGER:RED:F|GREEN:UP", "GREEN|BLUE:UP", "BLUE|RED:UP", "RED|GREEN:LEFT", "IN:GREEN"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|PURPLE:RIGHT", "C": "PURPLE|RED:RIGHT:2", "D": "TRIGGER:RED:F|GREEN:UP", "E": "GREEN|BLUE:UP", "F": "BLUE|RED:UP", "G": "RED|GREEN:LEFT", "H": "IN:GREEN" }, hint: "The trigger at D locks F — the packet must switch through before climbing!" },
  { number: 113, name: "Traffic Controller", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, null, null, "H"], ["E", "F", null, "G"], ["D", "C", "B", "A"]], pieces: ["OUT:RED|CYAN:LEFT", "CYAN|BLUE:LEFT", "PIPE:RIGHT:BLUE>LEFT:GREEN", "GREEN|RED:UP", "RED|BLUE:RIGHT", "BLUE|RED:RIGHT:2", "TRIGGER:RED:B|BLUE:UP", "IN:BLUE"], solution: { "A": "OUT:RED|CYAN:LEFT", "B": "CYAN|BLUE:LEFT", "C": "PIPE:RIGHT:BLUE>LEFT:GREEN", "D": "GREEN|RED:UP", "E": "RED|BLUE:RIGHT", "F": "BLUE|RED:RIGHT:2", "G": "TRIGGER:RED:B|BLUE:UP", "H": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 114, name: "Flow State", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["F", null, "E"], ["G", "C", "D"], ["H", "B", null], [null, "A", null]], pieces: ["OUT:RED|RED:UP", "RED|GREEN:UP", "TRIGGER:GREEN:D|CYAN:RIGHT", "CYAN|BLUE:UP", "BLUE|YELLOW:LEFT:2", "PIPE:RIGHT:YELLOW>DOWN:BLUE", "PIPE:UP:BLUE>DOWN:RED", "IN:RED"], solution: { "A": "OUT:RED|RED:UP", "B": "RED|GREEN:UP", "C": "TRIGGER:GREEN:D|CYAN:RIGHT", "D": "CYAN|BLUE:UP", "E": "BLUE|YELLOW:LEFT:2", "F": "PIPE:RIGHT:YELLOW>DOWN:BLUE", "G": "PIPE:UP:BLUE>DOWN:RED", "H": "IN:RED" }, hint: "The trigger at C locks D — achieve flow state by unlocking the path!" },
  { number: 115, name: "Layer Cake", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["A", "B", "C"], [null, null, null], [null, null, null]], [[null, null, "D"], [null, null, "E"], ["H", "G", "F"]]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:RIGHT", "STAIRS:UP:GREEN|BLUE:SHELF_UP", "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "RED|YELLOW:DOWN", "YELLOW|BLUE:LEFT", "BLUE|RED:LEFT", "IN:RED"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|GREEN:RIGHT", "C": "STAIRS:UP:GREEN|BLUE:SHELF_UP", "D": "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "E": "RED|YELLOW:DOWN", "F": "YELLOW|BLUE:LEFT", "G": "BLUE|RED:LEFT", "H": "IN:RED" }, hint: "The stairs at C connect the layers — climb up!" },
  { number: 116, name: "Stack Trace", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["F", "E"], ["G", null], ["H", null]], [[null, "D"], [null, "C"], ["A", "B"]]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:UP", "GREEN|BLUE:UP", "STAIRS:DOWN:BLUE|PURPLE:SHELF_DOWN", "PURPLE|RED:LEFT", "RED|CYAN:DOWN", "CYAN|YELLOW:DOWN", "IN:YELLOW"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|GREEN:UP", "C": "GREEN|BLUE:UP", "D": "STAIRS:DOWN:BLUE|PURPLE:SHELF_DOWN", "E": "PURPLE|RED:LEFT", "F": "RED|CYAN:DOWN", "G": "CYAN|YELLOW:DOWN", "H": "IN:YELLOW" }, hint: "Trace the stack downward through the shelf!" },
  { number: 117, name: "Storage Array", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["E", "D"], ["F", null], ["G", "H"]], [[null, "C"], [null, "B"], [null, "A"]]], pieces: ["OUT:RED|RED:UP", "RED|GREEN:UP", "STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN", "BLUE|PURPLE:LEFT", "PURPLE|RED:DOWN", "RED|CYAN:DOWN", "CYAN|YELLOW:RIGHT", "IN:YELLOW"], solution: { "A": "OUT:RED|RED:UP", "B": "RED|GREEN:UP", "C": "STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN", "D": "BLUE|PURPLE:LEFT", "E": "PURPLE|RED:DOWN", "F": "RED|CYAN:DOWN", "G": "CYAN|YELLOW:RIGHT", "H": "IN:YELLOW" }, hint: "Store data across shelf levels!" },
  { number: 118, name: "Vertical Limit", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["H", null, null, null], [null, null, "D", "C"], ["G", "F", "E", null]], [[null, null, null, null], [null, null, null, "B"], [null, null, null, "A"]]], pieces: ["OUT:RED|PINK:UP", "STAIRS:DOWN:PINK|GREEN:SHELF_DOWN", "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "PURPLE|BLUE:DOWN", "BLUE|YELLOW:LEFT", "YELLOW|BLUE:LEFT", "BLUE|RED:UP:2", "IN:RED"], solution: { "A": "OUT:RED|PINK:UP", "B": "STAIRS:DOWN:PINK|GREEN:SHELF_DOWN", "C": "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "D": "PURPLE|BLUE:DOWN", "E": "BLUE|YELLOW:LEFT", "F": "YELLOW|BLUE:LEFT", "G": "BLUE|RED:UP:2", "H": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 119, name: "Tiered System", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["H", "G", null, null, null], [null, null, null, null, null], [null, null, null, null, null]], [[null, "F", "E", null, null], [null, null, null, "A", "B"], [null, null, "D", null, "C"]]], pieces: ["OUT:RED|PURPLE:RIGHT", "PURPLE|ORANGE:DOWN", "ORANGE|RED:LEFT:2", "RED|BLUE:UP:2", "BLUE|RED:LEFT", "STAIRS:DOWN:RED|BLUE:SHELF_DOWN", "BLUE|RED:LEFT", "IN:RED"], solution: { "A": "OUT:RED|PURPLE:RIGHT", "B": "PURPLE|ORANGE:DOWN", "C": "ORANGE|RED:LEFT:2", "D": "RED|BLUE:UP:2", "E": "BLUE|RED:LEFT", "F": "STAIRS:DOWN:RED|BLUE:SHELF_DOWN", "G": "BLUE|RED:LEFT", "H": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 120, name: "Depth Perception", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["F", "E", null], ["G", null, null], ["H", null, null]], [[null, "D", null], [null, "C", null], [null, "B", "A"]]], pieces: ["OUT:RED|RED:LEFT", "RED|GREEN:UP", "GREEN|BLUE:UP", "STAIRS:DOWN:BLUE|RED:SHELF_DOWN", "RED|PURPLE:LEFT", "PURPLE|CYAN:DOWN", "CYAN|YELLOW:DOWN", "IN:YELLOW"], solution: { "A": "OUT:RED|RED:LEFT", "B": "RED|GREEN:UP", "C": "GREEN|BLUE:UP", "D": "STAIRS:DOWN:BLUE|RED:SHELF_DOWN", "E": "RED|PURPLE:LEFT", "F": "PURPLE|CYAN:DOWN", "G": "CYAN|YELLOW:DOWN", "H": "IN:YELLOW" }, hint: "Perceive the depth — stairs bridge the shelves!" },
  { number: 121, name: "Base Camp", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[[null, null, "A", "B"], [null, null, null, "C"], [null, null, null, "D"], [null, "G", "F", "E"], [null, null, null, null]], [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, "H", null, null], ["J", "I", null, null]]], pieces: ["OUT:RED|RED:RIGHT", "RED|BLUE:DOWN", "PIPE:UP:BLUE>DOWN:RED", "PIPE:UP:RED>DOWN:BLUE", "BLUE|GREEN:LEFT", "GREEN|YELLOW:LEFT", "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "RED|BLUE:LEFT", "IN:BLUE"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|BLUE:DOWN", "C": "PIPE:UP:BLUE>DOWN:RED", "D": "PIPE:UP:RED>DOWN:BLUE", "E": "BLUE|GREEN:LEFT", "F": "GREEN|YELLOW:LEFT", "G": "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "H": "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "I": "RED|BLUE:LEFT", "J": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 122, name: "High Altitude", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[["D", "E", "F", "G"], ["C", null, null, null], [null, null, "I", "H"], [null, null, "J", null]], [["A", null, null, null], ["B", null, null, null], [null, null, null, null], [null, null, null, null]]], pieces: ["OUT:RED|RED:DOWN", "STAIRS:DOWN:RED|ORANGE:SHELF_DOWN", "PIPE:SHELF_UP:ORANGE>UP:GREEN", "GREEN|RED:RIGHT", "RED|CYAN:RIGHT", "PIPE:LEFT:CYAN>RIGHT:RED", "RED|YELLOW:DOWN:2", "YELLOW|BLUE:LEFT", "BLUE|GREEN:DOWN", "IN:GREEN"], solution: { "A": "OUT:RED|RED:DOWN", "B": "STAIRS:DOWN:RED|ORANGE:SHELF_DOWN", "C": "PIPE:SHELF_UP:ORANGE>UP:GREEN", "D": "GREEN|RED:RIGHT", "E": "RED|CYAN:RIGHT", "F": "PIPE:LEFT:CYAN>RIGHT:RED", "G": "RED|YELLOW:DOWN:2", "H": "YELLOW|BLUE:LEFT", "I": "BLUE|GREEN:DOWN", "J": "IN:GREEN" }, hint: "Use all pieces correctly!" },
  { number: 123, name: "Summit Push", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[[null, null, null, null], [null, null, null, null], ["B", "C", null, null], ["A", null, null, null]], [[null, "G", "F", null], [null, "H", "I", "J"], [null, "D", "E", null], [null, null, null, null]]], pieces: ["OUT:RED|YELLOW:UP", "YELLOW|RED:RIGHT", "STAIRS:UP:RED|YELLOW:SHELF_UP", "PIPE:SHELF_DOWN:YELLOW>RIGHT:BLUE", "BLUE|RED:UP:2", "PIPE:DOWN:RED>LEFT:BLUE", "TRIGGER:BLUE:H|RED:DOWN", "PIPE:UP:RED>RIGHT:BLUE", "BLUE|GREEN:RIGHT", "IN:GREEN"], solution: { "A": "OUT:RED|YELLOW:UP", "B": "YELLOW|RED:RIGHT", "C": "STAIRS:UP:RED|YELLOW:SHELF_UP", "D": "PIPE:SHELF_DOWN:YELLOW>RIGHT:BLUE", "E": "BLUE|RED:UP:2", "F": "PIPE:DOWN:RED>LEFT:BLUE", "G": "TRIGGER:BLUE:H|RED:DOWN", "H": "PIPE:UP:RED>RIGHT:BLUE", "I": "BLUE|GREEN:RIGHT", "J": "IN:GREEN" }, hint: "The trigger at G locks H — push to the summit by unlocking the relay!" },
  { number: 124, name: "Thin Air", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[[null, null, null, "H", "G"], [null, null, null, null, "F"], ["B", null, "C", "D", "E"], ["A", null, null, null, null]], [[null, "J", null, "I", null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]]], pieces: ["OUT:RED|GREEN:UP", "GREEN|RED:RIGHT:2", "PIPE:LEFT:RED>RIGHT:BLUE", "TRIGGER:BLUE:B|RED:RIGHT", "RED|RED:UP", "RED|YELLOW:UP", "TRIGGER:YELLOW:H|BLUE:LEFT", "STAIRS:UP:BLUE|PURPLE:SHELF_UP", "PURPLE|BLUE:LEFT:2", "IN:BLUE"], solution: { "A": "OUT:RED|GREEN:UP", "B": "GREEN|RED:RIGHT:2", "C": "PIPE:LEFT:RED>RIGHT:BLUE", "D": "TRIGGER:BLUE:B|RED:RIGHT", "E": "RED|RED:UP", "F": "RED|YELLOW:UP", "G": "TRIGGER:YELLOW:H|BLUE:LEFT", "H": "STAIRS:UP:BLUE|PURPLE:SHELF_UP", "I": "PURPLE|BLUE:LEFT:2", "J": "IN:BLUE" }, hint: "Two triggers! D locks B, G locks H — the air is thin up here!" },
  { number: 125, name: "The Zenith", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"], layout: [[["I", "H", null, null], [null, null, null, null], [null, "G", null, null], [null, "F", null, null], [null, "E", "D", null]], [["J", "K", null, null], [null, null, null, null], [null, null, null, null], [null, null, "B", "A"], [null, null, "C", null]]], pieces: ["OUT:RED|PINK:LEFT", "PINK|RED:DOWN", "STAIRS:DOWN:RED|GREEN:SHELF_DOWN", "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "PIPE:RIGHT:PURPLE>UP:BLUE", "TRIGGER:BLUE:B|RED:UP", "RED|GREEN:UP:2", "GREEN|BLUE:LEFT", "STAIRS:UP:BLUE|GREEN:SHELF_UP", "TRIGGER:GREEN:D|YELLOW:RIGHT", "IN:YELLOW"], solution: { "A": "OUT:RED|PINK:LEFT", "B": "PINK|RED:DOWN", "C": "STAIRS:DOWN:RED|GREEN:SHELF_DOWN", "D": "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "E": "PIPE:RIGHT:PURPLE>UP:BLUE", "F": "TRIGGER:BLUE:B|RED:UP", "G": "RED|GREEN:UP:2", "H": "GREEN|BLUE:LEFT", "I": "STAIRS:UP:BLUE|GREEN:SHELF_UP", "J": "TRIGGER:GREEN:D|YELLOW:RIGHT", "K": "IN:YELLOW" }, hint: "Use all pieces correctly!" },
  { number: 126, name: "Chain Reaction", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [["F", "E", "D", null], ["G", null, null, null], ["H", null, "C", null], ["I", null, "B", "A"], ["J", "K", null, null], [null, "L", null, null], [null, null, null, null], ["N", "M", null, null]], pieces: ["OUT:RED|GREEN:LEFT", "PIPE:RIGHT:GREEN>UP:RED", "RED|BLUE:UP:2", "PIPE:DOWN:BLUE>LEFT:RED", "RED|YELLOW:LEFT", "YELLOW|RED:DOWN", "TRIGGER:RED:C|YELLOW:DOWN", "YELLOW|RED:DOWN", "PIPE:UP:RED>DOWN:CYAN", "CYAN|BLUE:RIGHT", "TRIGGER:BLUE:D|RED:DOWN", "RED|GREEN:DOWN:2", "GREEN|PURPLE:LEFT", "IN:PURPLE"], solution: { "A": "OUT:RED|GREEN:LEFT", "B": "PIPE:RIGHT:GREEN>UP:RED", "C": "RED|BLUE:UP:2", "D": "PIPE:DOWN:BLUE>LEFT:RED", "E": "RED|YELLOW:LEFT", "F": "YELLOW|RED:DOWN", "G": "TRIGGER:RED:C|YELLOW:DOWN", "H": "YELLOW|RED:DOWN", "I": "PIPE:UP:RED>DOWN:CYAN", "J": "CYAN|BLUE:RIGHT", "K": "TRIGGER:BLUE:D|RED:DOWN", "L": "RED|GREEN:DOWN:2", "M": "GREEN|PURPLE:LEFT", "N": "IN:PURPLE" }, hint: "Use all pieces correctly!" },
  { number: 127, name: "Quick Trigger", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [["D", "E", null, null, null], [null, "F", null, "G", null], ["C", "B", "I", "H", null], [null, "A", "J", null, null], [null, null, "K", null, "N"], [null, null, "L", null, "M"]], pieces: ["OUT:RED|CYAN:UP", "CYAN|RED:LEFT", "RED|BLUE:UP:2", "PIPE:DOWN:BLUE>RIGHT:RED", "RED|BLUE:DOWN", "BLUE|GREEN:RIGHT:2", "GREEN|RED:DOWN", "RED|BLUE:LEFT", "PIPE:RIGHT:BLUE>DOWN:RED", "RED|YELLOW:DOWN", "TRIGGER:YELLOW:A|GREEN:DOWN", "GREEN|RED:RIGHT:2", "RED|BLUE:UP", "IN:BLUE"], solution: { "A": "OUT:RED|CYAN:UP", "B": "CYAN|RED:LEFT", "C": "RED|BLUE:UP:2", "D": "PIPE:DOWN:BLUE>RIGHT:RED", "E": "RED|BLUE:DOWN", "F": "BLUE|GREEN:RIGHT:2", "G": "GREEN|RED:DOWN", "H": "RED|BLUE:LEFT", "I": "PIPE:RIGHT:BLUE>DOWN:RED", "J": "RED|YELLOW:DOWN", "K": "TRIGGER:YELLOW:A|GREEN:DOWN", "L": "GREEN|RED:RIGHT:2", "M": "RED|BLUE:UP", "N": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 128, name: "Cause and Effect", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[null, null, "B", "A", null, null, null, null], ["D", null, "C", null, null, null, null, null], [null, null, null, null, null, null, null, "N"], ["E", null, null, null, null, null, "L", "M"], ["F", "G", null, "H", "I", "J", "K", null]], pieces: ["OUT:RED|GREEN:LEFT", "PIPE:RIGHT:GREEN>DOWN:YELLOW", "YELLOW|RED:LEFT:2", "RED|BLUE:DOWN:2", "BLUE|GREEN:DOWN", "TRIGGER:GREEN:D|YELLOW:RIGHT", "YELLOW|GREEN:RIGHT:2", "GREEN|RED:RIGHT", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|GREEN:UP", "PIPE:DOWN:GREEN>RIGHT:BLUE", "TRIGGER:BLUE:F|RED:UP", "IN:RED"], solution: { "A": "OUT:RED|GREEN:LEFT", "B": "PIPE:RIGHT:GREEN>DOWN:YELLOW", "C": "YELLOW|RED:LEFT:2", "D": "RED|BLUE:DOWN:2", "E": "BLUE|GREEN:DOWN", "F": "TRIGGER:GREEN:D|YELLOW:RIGHT", "G": "YELLOW|GREEN:RIGHT:2", "H": "GREEN|RED:RIGHT", "I": "RED|GREEN:RIGHT", "J": "GREEN|BLUE:RIGHT", "K": "BLUE|GREEN:UP", "L": "PIPE:DOWN:GREEN>RIGHT:BLUE", "M": "TRIGGER:BLUE:F|RED:UP", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 129, name: "Tripwire", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [["D", null, "E", "F", "G"], ["C", "B", "A", "I", "H"], [null, null, null, "J", null], [null, null, null, null, null], [null, null, null, "K", null], [null, "N", "M", "L", null]], pieces: ["OUT:RED|PURPLE:LEFT", "PIPE:RIGHT:PURPLE>LEFT:RED", "RED|YELLOW:UP", "YELLOW|GREEN:RIGHT:2", "GREEN|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|RED:DOWN", "RED|BLUE:LEFT", "TRIGGER:BLUE:E|YELLOW:DOWN", "YELLOW|RED:DOWN:2", "RED|BLUE:DOWN", "PIPE:UP:BLUE>LEFT:RED", "RED|BLUE:LEFT", "IN:BLUE"], solution: { "A": "OUT:RED|PURPLE:LEFT", "B": "PIPE:RIGHT:PURPLE>LEFT:RED", "C": "RED|YELLOW:UP", "D": "YELLOW|GREEN:RIGHT:2", "E": "GREEN|RED:RIGHT", "F": "PIPE:LEFT:RED>RIGHT:GREEN", "G": "GREEN|RED:DOWN", "H": "RED|BLUE:LEFT", "I": "TRIGGER:BLUE:E|YELLOW:DOWN", "J": "YELLOW|RED:DOWN:2", "K": "RED|BLUE:DOWN", "L": "PIPE:UP:BLUE>LEFT:RED", "M": "RED|BLUE:LEFT", "N": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 130, name: "Event Horizon", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[null, null, null, null, "N"], ["C", "D", null, "L", "M"], ["B", "E", null, "K", null], ["A", "F", null, "J", null], [null, "G", "H", "I", null]], pieces: ["OUT:RED|CYAN:UP", "PIPE:DOWN:CYAN>UP:YELLOW", "PIPE:DOWN:YELLOW>RIGHT:GREEN", "GREEN|RED:DOWN", "RED|GREEN:DOWN", "GREEN|RED:DOWN", "TRIGGER:RED:C|BLUE:RIGHT", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>UP:GREEN", "GREEN|BLUE:UP", "BLUE|YELLOW:UP", "TRIGGER:YELLOW:M|RED:RIGHT", "PIPE:LEFT:RED>UP:BLUE", "IN:BLUE"], solution: { "A": "OUT:RED|CYAN:UP", "B": "PIPE:DOWN:CYAN>UP:YELLOW", "C": "PIPE:DOWN:YELLOW>RIGHT:GREEN", "D": "GREEN|RED:DOWN", "E": "RED|GREEN:DOWN", "F": "GREEN|RED:DOWN", "G": "TRIGGER:RED:C|BLUE:RIGHT", "H": "BLUE|RED:RIGHT", "I": "PIPE:LEFT:RED>UP:GREEN", "J": "GREEN|BLUE:UP", "K": "BLUE|YELLOW:UP", "L": "TRIGGER:YELLOW:M|RED:RIGHT", "M": "PIPE:LEFT:RED>UP:BLUE", "N": "IN:BLUE" }, hint: "Two triggers lock C and M — cross the event horizon!" },
  { number: 131, name: "Library of Babel", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, null, null, null], ["J", "K", "L", "M", "N"], [null, null, null, null, null], [null, null, null, null, null]], [[null, "G", "F", null, null], ["I", "H", "E", null, null], [null, "C", "D", null, null], ["A", "B", null, null, null]]], pieces: ["OUT:RED|CYAN:RIGHT", "PIPE:LEFT:CYAN>UP:RED", "RED|GREEN:RIGHT", "PIPE:LEFT:GREEN>UP:BLUE", "PIPE:DOWN:BLUE>UP:GREEN", "PIPE:DOWN:GREEN>LEFT:RED", "PIPE:RIGHT:RED>DOWN:BLUE", "PIPE:UP:BLUE>LEFT:GREEN", "STAIRS:DOWN:GREEN|YELLOW:SHELF_DOWN", "YELLOW|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:PINK", "IN:PINK"], solution: { "A": "OUT:RED|CYAN:RIGHT", "B": "PIPE:LEFT:CYAN>UP:RED", "C": "RED|GREEN:RIGHT", "D": "PIPE:LEFT:GREEN>UP:BLUE", "E": "PIPE:DOWN:BLUE>UP:GREEN", "F": "PIPE:DOWN:GREEN>LEFT:RED", "G": "PIPE:RIGHT:RED>DOWN:BLUE", "H": "PIPE:UP:BLUE>LEFT:GREEN", "I": "STAIRS:DOWN:GREEN|YELLOW:SHELF_DOWN", "J": "YELLOW|RED:RIGHT", "K": "PIPE:LEFT:RED>RIGHT:BLUE", "L": "BLUE|RED:RIGHT", "M": "PIPE:LEFT:RED>RIGHT:PINK", "N": "IN:PINK" }, hint: "Use all pieces correctly!" },
  { number: 132, name: "File System", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, "M", null, "N"], [null, null, "L", null, null], [null, null, "K", "J", null], [null, "H", null, "I", null]], [[null, "A", "B", null, null], [null, null, "C", null, null], ["E", null, "D", null, null], ["F", "G", null, null, null]]], pieces: ["OUT:RED|PINK:RIGHT", "PIPE:LEFT:PINK>DOWN:BLUE", "PIPE:UP:BLUE>DOWN:RED", "RED|BLUE:LEFT:2", "BLUE|GREEN:DOWN", "PIPE:UP:GREEN>RIGHT:BLUE", "STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN", "GREEN|YELLOW:RIGHT:2", "YELLOW|ORANGE:UP", "ORANGE|RED:LEFT", "RED|BLUE:UP", "BLUE|RED:UP", "RED|BLUE:RIGHT:2", "IN:BLUE"], solution: { "A": "OUT:RED|PINK:RIGHT", "B": "PIPE:LEFT:PINK>DOWN:BLUE", "C": "PIPE:UP:BLUE>DOWN:RED", "D": "RED|BLUE:LEFT:2", "E": "BLUE|GREEN:DOWN", "F": "PIPE:UP:GREEN>RIGHT:BLUE", "G": "STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN", "H": "GREEN|YELLOW:RIGHT:2", "I": "YELLOW|ORANGE:UP", "J": "ORANGE|RED:LEFT", "K": "RED|BLUE:UP", "L": "BLUE|RED:UP", "M": "RED|BLUE:RIGHT:2", "N": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 133, name: "Data Warehouse", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, null, "A", "B"], [null, "E", "D", null, "C"], [null, null, null, null, null], [null, null, null, null, null]], [["N", null, null, null, null], ["M", "F", null, null, null], ["L", "G", "H", null, null], ["K", "J", "I", null, null]]], pieces: ["OUT:RED|CYAN:RIGHT", "PIPE:LEFT:CYAN>DOWN:RED", "RED|ORANGE:LEFT:2", "PIPE:RIGHT:ORANGE>LEFT:BLUE", "STAIRS:UP:BLUE|YELLOW:SHELF_UP", "YELLOW|BLUE:DOWN", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>DOWN:CYAN", "PIPE:UP:CYAN>LEFT:RED", "RED|PURPLE:LEFT", "PURPLE|RED:UP", "RED|BLUE:UP", "BLUE|RED:UP", "IN:RED"], solution: { "A": "OUT:RED|CYAN:RIGHT", "B": "PIPE:LEFT:CYAN>DOWN:RED", "C": "RED|ORANGE:LEFT:2", "D": "PIPE:RIGHT:ORANGE>LEFT:BLUE", "E": "STAIRS:UP:BLUE|YELLOW:SHELF_UP", "F": "YELLOW|BLUE:DOWN", "G": "BLUE|RED:RIGHT", "H": "PIPE:LEFT:RED>DOWN:CYAN", "I": "PIPE:UP:CYAN>LEFT:RED", "J": "RED|PURPLE:LEFT", "K": "PURPLE|RED:UP", "L": "RED|BLUE:UP", "M": "BLUE|RED:UP", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 134, name: "Sorting Office", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, "F", null, "G", null], [null, "E", null, "K", "J"], [null, null, null, "H", "I"], ["A", "D", null, null, null], ["B", "C", null, null, null]], [[null, "N", null, "M", null], [null, null, null, "L", null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]]], pieces: ["OUT:RED|GREEN:DOWN", "GREEN|RED:RIGHT", "PIPE:LEFT:RED>UP:GREEN", "GREEN|RED:UP:2", "RED|BLUE:UP", "BLUE|RED:RIGHT:2", "RED|BLUE:DOWN:2", "PIPE:UP:BLUE>RIGHT:RED", "RED|BLUE:UP", "BLUE|YELLOW:LEFT", "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "BLUE|GREEN:UP", "GREEN|RED:LEFT:2", "IN:RED"], solution: { "A": "OUT:RED|GREEN:DOWN", "B": "GREEN|RED:RIGHT", "C": "PIPE:LEFT:RED>UP:GREEN", "D": "GREEN|RED:UP:2", "E": "RED|BLUE:UP", "F": "BLUE|RED:RIGHT:2", "G": "RED|BLUE:DOWN:2", "H": "PIPE:UP:BLUE>RIGHT:RED", "I": "RED|BLUE:UP", "J": "BLUE|YELLOW:LEFT", "K": "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "L": "BLUE|GREEN:UP", "M": "GREEN|RED:LEFT:2", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 135, name: "Archive Deep", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, null, null], [null, null, null, null], ["K", null, "J", null], [null, null, null, null]], [[null, null, "A", "B"], ["M", "D", null, "C"], ["L", null, "I", null], [null, "E", "H", null]], [[null, null, null, null], ["N", null, null, null], [null, null, null, null], [null, "F", "G", null]]], pieces: ["OUT:RED|GREEN:RIGHT", "GREEN|RED:DOWN", "RED|BLUE:LEFT:2", "BLUE|PURPLE:DOWN:2", "STAIRS:UP:PURPLE|RED:SHELF_UP", "RED|YELLOW:RIGHT", "STAIRS:DOWN:YELLOW|RED:SHELF_DOWN", "RED|PURPLE:UP", "STAIRS:DOWN:PURPLE|CYAN:SHELF_DOWN", "CYAN|RED:LEFT:2", "STAIRS:UP:RED|YELLOW:SHELF_UP", "YELLOW|GREEN:UP", "STAIRS:UP:GREEN|RED:SHELF_UP", "IN:RED"], solution: { "A": "OUT:RED|GREEN:RIGHT", "B": "GREEN|RED:DOWN", "C": "RED|BLUE:LEFT:2", "D": "BLUE|PURPLE:DOWN:2", "E": "STAIRS:UP:PURPLE|RED:SHELF_UP", "F": "RED|YELLOW:RIGHT", "G": "STAIRS:DOWN:YELLOW|RED:SHELF_DOWN", "H": "RED|PURPLE:UP", "I": "STAIRS:DOWN:PURPLE|CYAN:SHELF_DOWN", "J": "CYAN|RED:LEFT:2", "K": "STAIRS:UP:RED|YELLOW:SHELF_UP", "L": "YELLOW|GREEN:UP", "M": "STAIRS:UP:GREEN|RED:SHELF_UP", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 136, name: "Grand Design", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [[[null, null, null, null, null], [null, null, "H", null, null], [null, null, "I", null, null], [null, null, "J", null, null], [null, null, "K", null, null], ["P", "M", "L", null, null], ["O", "N", null, null, null]], [[null, "E", null, "D", "C"], [null, "F", "G", null, null], [null, null, null, "A", "B"], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]]], pieces: ["OUT:RED|CYAN:RIGHT", "CYAN|YELLOW:UP:2", "YELLOW|BLUE:LEFT", "BLUE|GREEN:LEFT:2", "GREEN|RED:DOWN", "PIPE:UP:RED>RIGHT:BLUE", "STAIRS:DOWN:BLUE|PURPLE:SHELF_DOWN", "PURPLE|GREEN:DOWN", "GREEN|BLUE:DOWN", "PIPE:UP:BLUE>DOWN:CYAN", "TRIGGER:CYAN:E|BLUE:DOWN", "BLUE|RED:LEFT", "RED|BLUE:DOWN", "BLUE|PINK:LEFT", "PIPE:RIGHT:PINK>UP:RED", "IN:RED"], solution: { "A": "OUT:RED|CYAN:RIGHT", "B": "CYAN|YELLOW:UP:2", "C": "YELLOW|BLUE:LEFT", "D": "BLUE|GREEN:LEFT:2", "E": "GREEN|RED:DOWN", "F": "PIPE:UP:RED>RIGHT:BLUE", "G": "STAIRS:DOWN:BLUE|PURPLE:SHELF_DOWN", "H": "PURPLE|GREEN:DOWN", "I": "GREEN|BLUE:DOWN", "J": "PIPE:UP:BLUE>DOWN:CYAN", "K": "TRIGGER:CYAN:E|BLUE:DOWN", "L": "BLUE|RED:LEFT", "M": "RED|BLUE:DOWN", "N": "BLUE|PINK:LEFT", "O": "PIPE:RIGHT:PINK>UP:RED", "P": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 137, name: "Master Plan", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [[[null, null, null, null, null], ["C", "B", null, null, null], [null, "A", null, null, null], [null, null, null, null, null], [null, null, "P", "O", null]], [[null, "F", "G", null, null], ["D", "E", "H", "I", null], [null, null, null, "J", null], [null, null, null, "K", "L"], [null, null, null, "N", "M"]]], pieces: ["OUT:RED|PURPLE:UP", "PIPE:DOWN:PURPLE>LEFT:RED", "STAIRS:UP:RED|BLUE:SHELF_UP", "PIPE:SHELF_DOWN:BLUE>RIGHT:YELLOW", "YELLOW|BLUE:UP", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>DOWN:BLUE", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>DOWN:PURPLE", "PIPE:UP:PURPLE>DOWN:RED", "TRIGGER:RED:B|GREEN:RIGHT", "GREEN|BLUE:DOWN", "BLUE|RED:LEFT", "STAIRS:DOWN:RED|PINK:SHELF_DOWN", "PINK|RED:LEFT", "IN:RED"], solution: { "A": "OUT:RED|PURPLE:UP", "B": "PIPE:DOWN:PURPLE>LEFT:RED", "C": "STAIRS:UP:RED|BLUE:SHELF_UP", "D": "PIPE:SHELF_DOWN:BLUE>RIGHT:YELLOW", "E": "YELLOW|BLUE:UP", "F": "BLUE|RED:RIGHT", "G": "PIPE:LEFT:RED>DOWN:BLUE", "H": "BLUE|RED:RIGHT", "I": "PIPE:LEFT:RED>DOWN:PURPLE", "J": "PIPE:UP:PURPLE>DOWN:RED", "K": "TRIGGER:RED:B|GREEN:RIGHT", "L": "GREEN|BLUE:DOWN", "M": "BLUE|RED:LEFT", "N": "STAIRS:DOWN:RED|PINK:SHELF_DOWN", "O": "PINK|RED:LEFT", "P": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 138, name: "Final Synthesis", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [[[null, null, null, "C", null, null], [null, null, null, "D", null, null], [null, null, null, "E", "F", null], [null, null, null, null, "G", null], [null, null, null, null, null, null], [null, null, null, null, null, null]], [[null, null, null, "B", null, null], [null, null, null, "A", null, null], [null, null, null, null, null, null], [null, null, null, null, "H", "I"], [null, null, null, null, null, "J"], [null, null, null, null, null, null]], [[null, null, null, null, null, null], [null, null, null, null, null, null], [null, null, null, null, null, null], [null, null, null, null, null, null], [null, null, null, "M", "L", "K"], ["P", "O", null, "N", null, null]]], pieces: ["OUT:RED|CYAN:UP", "STAIRS:DOWN:CYAN|RED:SHELF_DOWN", "RED|BLUE:DOWN", "BLUE|GREEN:DOWN", "PIPE:UP:GREEN>RIGHT:RED", "RED|PURPLE:DOWN", "STAIRS:UP:PURPLE|BLUE:SHELF_UP", "PIPE:SHELF_DOWN:BLUE>RIGHT:YELLOW", "TRIGGER:YELLOW:J|RED:DOWN", "STAIRS:UP:RED|BLUE:SHELF_UP", "BLUE|YELLOW:LEFT", "YELLOW|RED:LEFT", "PIPE:RIGHT:RED>DOWN:YELLOW", "YELLOW|RED:LEFT:2", "PIPE:RIGHT:RED>LEFT:GREEN", "IN:GREEN"], solution: { "A": "OUT:RED|CYAN:UP", "B": "STAIRS:DOWN:CYAN|RED:SHELF_DOWN", "C": "RED|BLUE:DOWN", "D": "BLUE|GREEN:DOWN", "E": "PIPE:UP:GREEN>RIGHT:RED", "F": "RED|PURPLE:DOWN", "G": "STAIRS:UP:PURPLE|BLUE:SHELF_UP", "H": "PIPE:SHELF_DOWN:BLUE>RIGHT:YELLOW", "I": "TRIGGER:YELLOW:J|RED:DOWN", "J": "STAIRS:UP:RED|BLUE:SHELF_UP", "K": "BLUE|YELLOW:LEFT", "L": "YELLOW|RED:LEFT", "M": "PIPE:RIGHT:RED>DOWN:YELLOW", "N": "YELLOW|RED:LEFT:2", "O": "PIPE:RIGHT:RED>LEFT:GREEN", "P": "IN:GREEN" }, hint: "The trigger at I locks J — synthesize the final path across all shelves!" },
  { number: 139, name: "Harmonic Convergence", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [[[null, null, null, null, null], [null, "C", "D", null, null], ["F", null, "E", null, null], ["A", "B", null, null, null]], [["P", "M", "L", null, null], ["O", "N", "K", null, "J"], ["G", null, "H", null, "I"], [null, null, null, null, null]]], pieces: ["OUT:RED|CYAN:RIGHT", "CYAN|RED:UP:2", "PIPE:DOWN:RED>RIGHT:YELLOW", "PIPE:LEFT:YELLOW>DOWN:RED", "RED|ORANGE:LEFT:2", "STAIRS:UP:ORANGE|BLUE:SHELF_UP", "BLUE|GREEN:RIGHT:2", "GREEN|BLUE:RIGHT:2", "PIPE:LEFT:BLUE>UP:RED", "RED|BLUE:LEFT:2", "BLUE|GREEN:UP", "PIPE:DOWN:GREEN>LEFT:RED", "TRIGGER:RED:B|PURPLE:DOWN", "PIPE:UP:PURPLE>LEFT:RED", "RED|BLUE:UP", "IN:BLUE"], solution: { "A": "OUT:RED|CYAN:RIGHT", "B": "CYAN|RED:UP:2", "C": "PIPE:DOWN:RED>RIGHT:YELLOW", "D": "PIPE:LEFT:YELLOW>DOWN:RED", "E": "RED|ORANGE:LEFT:2", "F": "STAIRS:UP:ORANGE|BLUE:SHELF_UP", "G": "BLUE|GREEN:RIGHT:2", "H": "GREEN|BLUE:RIGHT:2", "I": "PIPE:LEFT:BLUE>UP:RED", "J": "RED|BLUE:LEFT:2", "K": "BLUE|GREEN:UP", "L": "PIPE:DOWN:GREEN>LEFT:RED", "M": "TRIGGER:RED:B|PURPLE:DOWN", "N": "PIPE:UP:PURPLE>LEFT:RED", "O": "RED|BLUE:UP", "P": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 140, name: "Chromatic Singularity", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [[[null, "E", "F", "G", "H"], [null, null, null, null, "I"], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]], [["C", "D", null, null, null], [null, null, null, null, "J"], ["B", null, null, null, "K"], ["A", null, null, null, "L"], [null, null, null, null, "M"], [null, null, null, null, null], [null, null, null, null, "N"], [null, null, null, "P", "O"]]], pieces: ["OUT:RED|YELLOW:UP", "YELLOW|RED:UP:2", "RED|GREEN:RIGHT", "STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN", "TRIGGER:BLUE:B|GREEN:RIGHT", "GREEN|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "TRIGGER:BLUE:C|YELLOW:DOWN", "STAIRS:UP:YELLOW|CYAN:SHELF_UP", "CYAN|RED:DOWN", "PIPE:UP:RED>DOWN:BLUE", "BLUE|RED:DOWN", "RED|GREEN:DOWN:2", "PIPE:UP:GREEN>DOWN:RED", "PIPE:UP:RED>LEFT:GREEN", "IN:GREEN"], solution: { "A": "OUT:RED|YELLOW:UP", "B": "YELLOW|RED:UP:2", "C": "RED|GREEN:RIGHT", "D": "STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN", "E": "TRIGGER:BLUE:B|GREEN:RIGHT", "F": "GREEN|RED:RIGHT", "G": "PIPE:LEFT:RED>RIGHT:BLUE", "H": "TRIGGER:BLUE:C|YELLOW:DOWN", "I": "STAIRS:UP:YELLOW|CYAN:SHELF_UP", "J": "CYAN|RED:DOWN", "K": "PIPE:UP:RED>DOWN:BLUE", "L": "BLUE|RED:DOWN", "M": "RED|GREEN:DOWN:2", "N": "PIPE:UP:GREEN>DOWN:RED", "O": "PIPE:UP:RED>LEFT:GREEN", "P": "IN:GREEN" }, hint: "Use all pieces correctly!" },
];

// ─── ARROW VISUALS ──────────────────────────────────────────────────────────

const ARROW_SYM = { UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→", UP_LEFT: "↖", UP_RIGHT: "↗", DOWN_LEFT: "↙", DOWN_RIGHT: "↘" };
const ARROW_POS = {
  UP: { top: 2, left: "50%", transform: "translateX(-50%)" }, DOWN: { bottom: 2, left: "50%", transform: "translateX(-50%)" },
  LEFT: { left: 2, top: "50%", transform: "translateY(-50%)" }, RIGHT: { right: 2, top: "50%", transform: "translateY(-50%)" },
  UP_LEFT: { top: 2, left: 2 }, UP_RIGHT: { top: 2, right: 2 }, DOWN_LEFT: { bottom: 2, left: 2 }, DOWN_RIGHT: { bottom: 2, right: 2 },
};
const CHAPTERS = [
  { name: "Fundamentals", range: [1, 9], color: "#3b82f6", bg: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)", glow: "rgba(59,130,246,0.15)" },
  { name: "Multi-Output", range: [10, 18], color: "#a855f7", bg: "radial-gradient(circle at top right,#2e1065 0%,#0f0a1c 100%)", glow: "rgba(168,85,247,0.15)" },
  { name: "Complex Layouts", range: [19, 30], color: "#22c55e", bg: "linear-gradient(180deg,#064e3b 0%,#022c22 100%)", glow: "rgba(34,197,94,0.15)" },
  { name: "Sources & Sinks", range: [31, 38], color: "#f59e0b", bg: "radial-gradient(ellipse at center,#451a03 0%,#1c1917 100%)", glow: "rgba(245,158,11,0.15)" },
  { name: "Jumper Arrows", range: [39, 46], color: "#ef4444", bg: "linear-gradient(to right bottom,#450a0a 0%,#1a0505 100%)", glow: "rgba(239,68,68,0.15)" },
  { name: "Gaps", range: [47, 54], color: "#14b8a6", bg: "radial-gradient(circle at 50% 50%,#042f2e 0%,#020617 100%)", glow: "rgba(20,184,166,0.15)" },
  { name: "Advanced Combos", range: [55, 62], color: "#06b6d4", bg: "linear-gradient(135deg,#164e63 0%,#082f49 100%)", glow: "rgba(6,182,212,0.15)" },
  { name: "Expert", range: [63, 68], color: "#ec4899", bg: "radial-gradient(circle at top left,#500724 0%,#171717 100%)", glow: "rgba(236,72,153,0.15)" },
  { name: "Pipes", range: [69, 78], color: "#8b5cf6", bg: "linear-gradient(160deg,#2e1065 0%,#09090b 100%)", glow: "rgba(139,92,246,0.15)" },
  { name: "Master", range: [79, 88], color: "#fbbf24", bg: "radial-gradient(circle at top,#78350f 20%,#0f172a 100%)", glow: "rgba(251,191,36,0.15)" },
  { name: "Master II", range: [89, 98], color: "#f43f5e", bg: "linear-gradient(45deg,#881337 0%,#0f172a 100%)", glow: "rgba(244,63,94,0.15)" },
  { name: "Master III", range: [99, 108], color: "#e11d48", bg: "radial-gradient(ellipse at bottom,#7f1d1d 0%,#030712 100%)", glow: "rgba(225,29,72,0.15)" },
  { name: "Control Flow", range: [109, 114], color: "#8b5cf6", bg: "linear-gradient(135deg,#4c1d95 0%,#171717 100%)", glow: "rgba(139,92,246,0.15)" },
  { name: "Multi-Shelf", range: [115, 120], color: "#10b981", bg: "radial-gradient(circle at bottom,#064e3b 0%,#020617 100%)", glow: "rgba(16,185,129,0.15)" },
  { name: "Ascension", range: [121, 125], color: "#fbbf24", bg: "radial-gradient(circle at top,#78350f 20%,#0f172a 100%)", glow: "rgba(251,191,36,0.15)" },
  { name: "Master IV", range: [126, 130], color: "#a855f7", bg: "radial-gradient(circle at top right,#2e1065 0%,#0f0a1c 100%)", glow: "rgba(168,85,247,0.15)" },
  { name: "Master V", range: [131, 135], color: "#14b8a6", bg: "radial-gradient(circle at 50% 50%,#042f2e 0%,#020617 100%)", glow: "rgba(20,184,166,0.15)" },
  { name: "Master VI", range: [136, 140], color: "#ec4899", bg: "radial-gradient(circle at top left,#500724 0%,#171717 100%)", glow: "rgba(236,72,153,0.15)" }
];

// ─── TILE COMPONENT ─────────────────────────────────────────────────────────

function TilePiece({ tileStr, size = 80, onClick, isDragging, isPlaced, className, displayLabelMap }) {
  const tile = parseTile(tileStr);
  const isIn = tile.type === "INPUT_ONLY", isOut = tile.type === "OUTPUT_ONLY";

  // INPUT_ONLY: simple colored slab, no circle, no arrows
  if (isIn) {
    const cols = tile.acceptColors.map(c => COLORS[c]?.bg || "#888");
    const bg = cols.length === 1 ? cols[0] : `linear-gradient(135deg,${cols.join(",")})`;
    return (
      <div onClick={onClick} className={className || (isPlaced ? "tile-placed" : "")} style={{
        width: size, height: size, borderRadius: 12, background: bg, opacity: 0.85,
        boxShadow: isDragging ? `0 0 24px ${cols[0]}, 0 8px 32px rgba(0,0,0,0.6)` : undefined,
        cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", transform: isDragging ? "scale(1.15)" : "scale(1)",
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none",
        border: "2px dashed rgba(255,255,255,0.35)", zIndex: isDragging ? 50 : 1
      }}>
        {!isPlaced && <div className="tile-glint" />}
      </div>
    );
  }

  const bgColor = isOut ? "rgba(251,191,36,0.15)" : tile.type === "PIPE" ? "rgba(139,92,246,0.15)" : COLORS[tile.outer]?.bg || "#444";
  const glowC = isOut ? "#fbbf24" : tile.type === "PIPE" ? "#8b5cf6" : COLORS[tile.outer]?.glow || "#666";
  const isPipe = tile.type === "PIPE";

  // PIPE rendering
  if (isPipe) {
    const channels = tile.channels || [];
    return (
      <div onClick={onClick} className={className || (isPlaced ? "tile-placed" : "")} style={{
        width: size, height: size, borderRadius: 14,
        background: "rgba(139,92,246,0.12)",
        boxShadow: isDragging ? `0 0 24px #8b5cf6, 0 8px 32px rgba(0,0,0,0.6)` : undefined,
        cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", transform: isDragging ? "scale(1.15)" : "scale(1)",
        position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none",
        border: "2px solid rgba(139,92,246,0.4)", zIndex: isDragging ? 50 : 1
      }}>
        {!isPlaced && <div className="tile-glint" />}
        <div style={{
          width: size * 0.32, height: size * 0.32, borderRadius: 6, background: "rgba(139,92,246,0.35)",
          border: "2px solid rgba(139,92,246,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2
        }}>
          <span style={{ fontSize: Math.max(size * 0.1, 7), fontWeight: 900, color: "rgba(255,255,255,0.95)" }}>{channels.length > 1 ? "×" : "⇢"}</span>
        </div>
        {channels.map((ch, i) => {
          const inC = COLORS[ch.inColor], outC = COLORS[ch.outColor];
          const inPos = ARROW_POS[ch.inDir], outPos = ARROW_POS[ch.outDir];
          const sz = size > 70 ? 20 : size > 50 ? 16 : 12;
          return [
            <div key={`in${i}`} style={{
              position: "absolute", ...inPos, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center",
              background: inC?.bg || "#888", borderRadius: "50%", width: sz, height: sz,
              border: "2px solid rgba(255,255,255,0.6)", boxShadow: `0 0 8px ${inC?.glow || "#888"}80`
            }}>
              <span style={{ fontSize: sz > 14 ? 10 : 8, color: "rgba(255,255,255,0.95)", lineHeight: 1, fontWeight: 900 }}>⊙</span>
            </div>,
            <div key={`out${i}`} style={{
              position: "absolute", ...outPos, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center",
              background: outC?.bg || "#888", borderRadius: "50%", width: sz, height: sz,
              border: "1.5px solid rgba(255,255,255,0.5)", boxShadow: `0 0 8px ${outC?.glow || "#888"}80`
            }}>
              <span style={{ fontSize: sz > 14 ? 12 : 9, color: "rgba(255,255,255,0.95)", lineHeight: 1, fontWeight: 900 }}>{ARROW_SYM[ch.outDir]}</span>
            </div>
          ];
        })}
      </div>
    );
  }
  const innerCols = tile.connections.map(c => COLORS[c.color]);
  const centerGrad = innerCols.length === 0 ? "#555"
    : innerCols.length === 1 ? innerCols[0].bg
      : `conic-gradient(${innerCols.map((c, i) => `${c.bg} ${(i / innerCols.length) * 360}deg ${((i + 1) / innerCols.length) * 360}deg`).join(",")})`;
  return (
    <div onClick={onClick} className={className || (isPlaced ? "tile-placed" : "")} style={{
      width: size, height: size, borderRadius: 12, background: bgColor,
      boxShadow: isDragging ? `0 0 24px ${glowC}, 0 8px 32px rgba(0,0,0,0.6)` : undefined,
      cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", transform: isDragging ? "scale(1.15)" : "scale(1)",
      position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none",
      border: isOut ? "2px solid rgba(251,191,36,0.6)" : "2px solid rgba(255,255,255,0.25)",
      zIndex: isDragging ? 50 : 1
    }}>
      {!isPlaced && <div className="tile-glint" />}
      {tile.type === "TRIGGER" ? (
        <div style={{
          width: size * 0.55, height: size * 0.36, borderRadius: 6, background: "rgba(0,0,0,0.45)",
          border: "1.5px solid rgba(251,191,36,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
          boxShadow: "0 0 10px rgba(251,191,36,0.25)", zIndex: 2, padding: "0 3px"
        }}>
          <span style={{ fontSize: Math.max(size * 0.16, 10), lineHeight: 1 }}>🔒</span>
          <span style={{ fontSize: Math.max(size * 0.15, 9), fontWeight: 800, color: "#fbbf24", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.02em", lineHeight: 1 }}>{(displayLabelMap && displayLabelMap[tile.targetCell]) || tile.targetCell}</span>
        </div>
      ) : (
        <div style={{
          width: size * 0.36, height: size * 0.36, borderRadius: "50%", background: centerGrad,
          border: "2px solid rgba(255,255,255,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px rgba(255,255,255,0.25)", zIndex: 2
        }} />
      )}
      {tile.connections.map((conn, i) => {
        const c = COLORS[conn.color], pos = ARROW_POS[conn.dir], sz = size > 70 ? 20 : size > 50 ? 16 : 12, dist = conn.distance || 1;
        return (<div key={i} style={{
          position: "absolute", ...pos, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
          background: c?.bg || "#888", borderRadius: "50%", width: sz, height: sz,
          border: dist > 1 ? "2px solid rgba(255,255,0,0.8)" : "2px solid rgba(255,255,255,0.5)",
          boxShadow: dist > 1 ? "0 0 10px rgba(255,255,0,0.6)" : `0 0 8px ${c?.glow || "#888"}80`
        }}>
          <span style={{ fontSize: sz > 14 ? 12 : 9, color: "rgba(255,255,255,1)", lineHeight: 1, fontWeight: 900 }}>{ARROW_SYM[conn.dir]}</span>
          {dist > 1 && <span style={{ fontSize: 7, color: "rgba(255,255,0,1)", lineHeight: 1, fontWeight: 900, marginTop: -2 }}>{dist}</span>}
        </div>);
      })}
    </div>
  );
}

function GridCell({ cellName, displayLabel, size, tile, hasError, onClick, isTarget, isLockedCell, currentChapter, flashColor, displayLabelMap }) {
  return (<div id={`cell-${cellName}`} onClick={onClick} style={{
    "--flash-color": flashColor || "transparent",
    width: size, height: size, borderRadius: 12,
    background: flashColor ? flashColor : isLockedCell ? "rgba(251,191,36,0.04)" : (tile ? "transparent" : (currentChapter ? `rgba(255,255,255,0.02)` : "rgba(255,255,255,0.04)")),
    border: tile ? "none" : isLockedCell ? "2px solid rgba(251,191,36,0.3)" : isTarget ? `2px dashed ${currentChapter ? currentChapter.color : "rgba(255,255,255,0.5)"}` : "2px dashed rgba(255,255,255,0.15)",
    cursor: isLockedCell ? "not-allowed" : "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s ease", animation: hasError ? "shake 0.4s ease" : "none",
    boxShadow: hasError ? "0 0 16px rgba(239,68,68,0.6)" : isTarget ? `0 0 16px ${currentChapter ? currentChapter.glow : "rgba(255,255,255,0.15)"}` : (tile ? "none" : "inset 0 4px 12px rgba(0,0,0,0.2)")
  }}>
    {flashColor && <div style={{
      position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "inherit",
      color: flashColor, animation: "energyRing 1s cubic-bezier(0.1, 0.9, 0.2, 1) forwards", zIndex: 0
    }} />}
    {tile ? <TilePiece tileStr={tile} size={size - 4} isPlaced displayLabelMap={displayLabelMap} /> :
      isLockedCell ? <span style={{ fontSize: Math.max(size * 0.22, 14), opacity: 0.5 }}>🔒</span> :
      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.15)", fontFamily: "'JetBrains Mono',monospace" }}>{displayLabel || cellName}</span>}
  </div>);
}

function Confetti() { const ref = useRef(null); useEffect(() => { const cv = ref.current; if (!cv) return; const ctx = cv.getContext("2d"); cv.width = window.innerWidth; cv.height = window.innerHeight; const cols = ["#fbbf24", "#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#06b6d4"]; const ps = Array.from({ length: 150 }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height - cv.height, w: Math.random() * 10 + 4, h: Math.random() * 6 + 2, color: cols[Math.floor(Math.random() * cols.length)], vy: Math.random() * 3 + 2, vx: (Math.random() - 0.5) * 2, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 8, opacity: 1 })); let raf; function draw() { ctx.clearRect(0, 0, cv.width, cv.height); let alive = false; for (const p of ps) { p.x += p.vx; p.y += p.vy; p.rot += p.vr; if (p.y > cv.height + 20) p.opacity -= 0.02; if (p.opacity <= 0) continue; alive = true; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180); ctx.globalAlpha = Math.max(0, p.opacity); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore() } if (alive) raf = requestAnimationFrame(draw) } draw(); return () => cancelAnimationFrame(raf) }, []); return <canvas ref={ref} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 200 }} />; }

function VictoryScreen({ onBack }) {
  const [show, setShow] = useState(false); useEffect(() => { setTimeout(() => setShow(true), 100) }, []); return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at center,#1a1a2e 0%,#0f0f1a 100%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, opacity: show ? 1 : 0, transition: "opacity 0.8s ease" }}>
      <Confetti /><div style={{ textAlign: "center", zIndex: 201, transform: show ? "scale(1)" : "scale(0.7)", transition: "transform 0.8s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <div style={{ fontSize: 60, fontWeight: 900, fontFamily: "'Orbitron',sans-serif", background: "linear-gradient(135deg,#fbbf24,#f59e0b,#ef4444,#a855f7,#3b82f6,#22c55e)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite", filter: "drop-shadow(0 4px 20px rgba(251,191,36,0.5))", marginBottom: 8 }}>CHROMATIC</div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Orbitron',sans-serif", color: "#fbbf24", marginBottom: 8, letterSpacing: "0.2em" }}>GRANDMASTER</div>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "'JetBrains Mono',monospace", marginBottom: 8 }}>All 140 levels complete</p>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", marginBottom: 40, maxWidth: 300, margin: "0 auto 40px" }}>Sources, sinks, jumpers, chains, and master puzzles — you've conquered Chromatic.</p>
        <button onClick={onBack} style={{ padding: "14px 36px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#1a1a2e", fontSize: 15, fontWeight: 700, fontFamily: "'Orbitron',sans-serif", cursor: "pointer", boxShadow: "0 4px 20px rgba(251,191,36,0.4)", letterSpacing: "0.1em" }}>RETURN TO LEVELS</button>
      </div></div>);
}

function FinishOverlay({ level, onNext, onReplay, hasNext }) {
  const [show, setShow] = useState(false); useEffect(() => { setTimeout(() => setShow(true), 100) }, []); return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, opacity: show ? 1 : 0, transition: "opacity 0.5s ease" }}>
      <div style={{ textAlign: "center", transform: show ? "scale(1)" : "scale(0.8)", transition: "transform 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <div style={{ fontSize: 56, fontWeight: 900, fontFamily: "'Orbitron',sans-serif", background: "linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.1em", marginBottom: 8, filter: "drop-shadow(0 4px 12px rgba(251,191,36,0.4))" }}>FINISH!</div>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "'JetBrains Mono',monospace", marginBottom: 32 }}>Level {level.number} — {level.name}</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button onClick={onReplay} style={{ padding: "12px 28px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer" }}>Replay</button>
          {hasNext && <button onClick={onNext} style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#1a1a2e", fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer", boxShadow: "0 4px 16px rgba(245,158,11,0.3)" }}>Next Level →</button>}
        </div></div></div>);
}

// ─── MAIN GAME ──────────────────────────────────────────────────────────────

export default function ChromaticPuzzle() {
  const [currentLevel, setCurrentLevel] = useState(0);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [skippedLevels, setSkippedLevels] = useState(new Set());
  useEffect(() => {
    const saved = localStorage.getItem("chromatic_skipped");
    if (saved) setSkippedLevels(new Set(JSON.parse(saved)));
  }, []);

  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isSfxMuted, setIsSfxMuted] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const audioRef = useRef(null);

  const [board, setBoard] = useState({});
  const [tray, setTray] = useState([]);
  const [selectedTile, setSelectedTile] = useState(null);
  const [solved, setSolved] = useState(false);
  const [errors, setErrors] = useState(new Set());
  const [showHint, setShowHint] = useState(false);
  const [screen, setScreen] = useState("menu");
  const [completedLevels, setCompletedLevels] = useState(new Set());
  const [currentShelf, setCurrentShelf] = useState(0);
  const containerRef = useRef(null);
  useEffect(() => {
    const saved = localStorage.getItem("chromatic_completed");
    if (saved) setCompletedLevels(new Set(JSON.parse(saved)));
  }, []);
  useEffect(() => {
    if (completedLevels.size > 0) {
      localStorage.setItem("chromatic_completed", JSON.stringify([...completedLevels]));
    }
  }, [completedLevels]);
  const [showVictory, setShowVictory] = useState(false);
  const [flashes, setFlashes] = useState({});
  const level = LEVELS[currentLevel];
  const allComplete = completedLevels.size === LEVELS.length;

  const TRACKS = [
    { src: "/track1-fractal-groove.wav?v=4", name: "Prismatic Groove" },
    { src: "/track2-sierpinski-dreams.wav?v=4", name: "Cyan Dreams" },
    { src: "/track3-chaos-theory.wav?v=4", name: "Amber Chaos" },
    { src: "/track4-ultraviolet-haze.wav?v=4", name: "Ultraviolet Haze" },
    { src: "/track5-crimson-pulse.wav?v=4", name: "Crimson Pulse" },
    { src: "/track6-golden-hour.wav?v=4", name: "Golden Hour" },
    { src: "/track7-neon-surge.wav?v=4", name: "Neon Surge" },
    { src: "/track8-prismatic-shift.wav?v=4", name: "Prismatic Shift" },
    { src: "/track9-exotica.wav?v=4", name: "Exotica Cypher" },
    { src: "/track10-obsidian-groove.wav?v=4", name: "Obsidian Groove" },
    { src: "/track11-scarlet-pulse.wav?v=4", name: "Scarlet Pulse" },
    { src: "/track12-cobalt-surge.wav?v=4", name: "Cobalt Surge" },
    { src: "/track13-emerald-bounce.wav?v=4", name: "Emerald Bounce" },
    { src: "/track14-amethyst-drill.wav?v=4", name: "Amethyst Drill" }
  ];

  const trackCount = TRACKS.length;
  const changeTrack = useCallback((dir) => {
    setCurrentTrack(prev => {
      const next = (prev + dir + trackCount) % trackCount;
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          if (!isMusicMuted) audioRef.current.play().catch(() => { });
        }
      }, 50);
      return next;
    });
  }, [isMusicMuted, trackCount]);

  const handleTrackEnd = useCallback(() => {
    changeTrack(1);
  }, [changeTrack]);

  const playSfx = useCallback((name) => {
    if (isSfxMuted) return;
    const a = new Audio(`/sfx-${name}.wav`);
    a.volume = name === 'complete' ? 0.6 : 0.4;
    a.play().catch(() => { });
  }, [isSfxMuted]);

  const initLevel = useCallback((idx) => {
    playSfx('select');
    const pieces = randomizePipeOrientations(LEVELS[idx].pieces);
    const l3d = getLayout3D(LEVELS[idx].layout);
    setCurrentLevel(idx); setBoard({}); setTray(shuffleArray(pieces));
    setCurrentShelf(Math.floor(l3d.length / 2));
    setSelectedTile(null); setSolved(false); setErrors(new Set()); setShowHint(false); setScreen("game");
  }, [playSfx]);

  const markSolved = (newBoard) => {
    setSolved(true);
    playSfx('complete');
    const next = new Set([...completedLevels, currentLevel]);
    setCompletedLevels(next);
    if (skippedLevels.has(currentLevel)) {
      const nextSkipped = new Set(skippedLevels);
      nextSkipped.delete(currentLevel);
      setSkippedLevels(nextSkipped);
    }
    if (next.size === LEVELS.length) setTimeout(() => setShowVictory(true), 1500);
  };

  const triggerLinkAnimation = (cellName, droppedTileStr, nb, errs) => {
    const tileObj = parseTile(droppedTileStr);
    const newFlashes = {};

    let cr = -1, cc = -1;
    for (let r = 0; r < level.layout.length; r++) {
      for (let c = 0; c < level.layout[r].length; c++) {
        if (level.layout[r][c] === cellName) {
          cr = r; cc = c; break;
        }
      }
      if (cr !== -1) break;
    }

    if (cr === -1) return;

    tileObj.connections.forEach(conn => {
      const d = DIRS[conn.dir];
      const dist = conn.distance || 1;
      const targetR = cr + d.top * dist;
      const targetC = cc + d.left * dist;

      if (targetR >= 0 && targetR < level.layout.length && targetC >= 0 && targetC < (level.layout[targetR]?.length || 0)) {
        const targetCell = level.layout[targetR][targetC];
        if (targetCell && nb[targetCell]) {
          const targetObj = parseTile(nb[targetCell]);
          let isMatch = false;

          if (targetObj.type === "NORMAL" && conn.color === targetObj.outer) isMatch = true;
          if (targetObj.type === "INPUT_ONLY" && targetObj.acceptColors.includes(conn.color)) isMatch = true;
          if (targetObj.type === "PIPE") {
            const oppDir = OPPOSITE[conn.dir];
            if (targetObj.inPorts?.find(p => p.dir === oppDir && p.color === conn.color)) isMatch = true;
          }

          if (isMatch) {
            newFlashes[cellName] = COLORS[conn.color]?.glow || "rgba(255,255,255,0.8)";
            newFlashes[targetCell] = COLORS[conn.color]?.glow || "rgba(255,255,255,0.8)";
          }
        }
      }
    });
    if (Object.keys(newFlashes).length > 0) {
      setFlashes(newFlashes);
      setTimeout(() => setFlashes({}), 1200);
    }
  };

  // Remove only the first matching element from array (not all duplicates)
  const removeFirstMatch = (arr, target) => {
    const idx = arr.indexOf(target);
    if (idx === -1) return arr;
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  };

  const handleCellClick = (cellName) => {
    if (solved) return;
    // Enforce trigger locks: locked cells cannot accept or swap tiles
    if (!board[cellName] && isLocked(level, board, cellName)) {
      playSfx('error');
      return;
    }
    if (board[cellName] && !selectedTile) {
      playSfx('remove');
      const tile = board[cellName]; const nb = { ...board }; delete nb[cellName];
      setBoard(nb); setTray(p => [...p, tile]); setSelectedTile(tile);
      setErrors(getConnectionErrors(level, nb)); return;
    }
    if (board[cellName] && selectedTile) {
      playSfx('place');
      const existing = board[cellName]; const nb = { ...board, [cellName]: selectedTile };
      setBoard(nb); setTray(p => removeFirstMatch(p, selectedTile).concat(existing));
      setSelectedTile(existing);
      const errs = getConnectionErrors(level, nb);
      setErrors(errs);
      triggerLinkAnimation(cellName, selectedTile, nb, errs);
      if (checkSolution(level, nb)) markSolved(nb);
      return;
    }
    if (selectedTile && !board[cellName]) {
      playSfx('place');
      const nb = { ...board, [cellName]: selectedTile };
      setBoard(nb); setTray(p => removeFirstMatch(p, selectedTile));
      setSelectedTile(null);
      const errs = getConnectionErrors(level, nb);
      setErrors(errs);
      triggerLinkAnimation(cellName, selectedTile, nb, errs);
      if (checkSolution(level, nb)) markSolved(nb);
    }
  };

  const handleTrayClick = (tileStr, event) => {
    if (solved) return;
    playSfx('select');

    // If it's a pipe and right-click or shift-click, rotate it
    if (tileStr.startsWith("PIPE:") && (event?.shiftKey || event?.button === 2)) {
      event?.preventDefault();
      const rotated = rotatePipe(tileStr);
      setTray(p => p.map(t => t === tileStr ? rotated : t));
      if (selectedTile === tileStr) setSelectedTile(rotated);
      return;
    }

    // If it's a pipe and already selected, rotate it on click
    if (tileStr.startsWith("PIPE:") && selectedTile === tileStr) {
      const rotated = rotatePipe(tileStr);
      setTray(p => p.map(t => t === tileStr ? rotated : t));
      setSelectedTile(rotated);
      return;
    }

    // Normal selection behavior
    setSelectedTile(selectedTile === tileStr ? null : tileStr);
  };

  const handleClear = () => {
    const pieces = randomizePipeOrientations(level.pieces);
    setBoard({}); setTray(shuffleArray(pieces)); setSelectedTile(null); setErrors(new Set());
  };

  const currentChapter = CHAPTERS.find(ch => level && level.number >= ch.range[0] && level.number <= ch.range[1]) || CHAPTERS[0];
  const skipsInChapter = [...skippedLevels].filter(idx => {
    const n = LEVELS[idx].number;
    return n >= currentChapter.range[0] && n <= currentChapter.range[1];
  }).length;
  const canSkip = skipsInChapter < 2;

  // Build display label map: sequential A-Z across all shelves, reading order
  const displayLabelMap = useMemo(() => {
    if (!level) return {};
    const l3d = getLayout3D(level.layout);
    const map = {};
    let idx = 0;
    for (let z = 0; z < l3d.length; z++) {
      for (let r = 0; r < l3d[z].length; r++) {
        for (let c = 0; c < l3d[z][r].length; c++) {
          if (l3d[z][r][c]) {
            map[l3d[z][r][c]] = idx < 26 ? String.fromCharCode(65 + idx) : String.fromCharCode(65 + Math.floor(idx / 26) - 1) + String.fromCharCode(65 + (idx % 26));
            idx++;
          }
        }
      }
    }
    return map;
  }, [level]);

  const handleSkip = () => {
    if (!canSkip || solved) return;
    const nextSkipped = new Set([...skippedLevels, currentLevel]);
    setSkippedLevels(nextSkipped);

    if (currentLevel < LEVELS.length - 1) {
      initLevel(currentLevel + 1);
    } else {
      setScreen("menu");
    }
  };

  const cellSize = (() => {
    if (!level) return 100;
    const is3D = Array.isArray(level.layout[0]?.[0]);
    let cols, rows;
    if (is3D) {
      const l3d = level.layout;
      cols = Math.max(...l3d.map(layer => Math.max(...layer.map(r => r.length))));
      rows = Math.max(...l3d.map(layer => layer.length));
      if (rows >= 6) return 48;
      if (rows >= 5) return 52;
      if (rows >= 4) return 58;
      return 64;
    } else {
      cols = Math.max(...level.layout.map(r => r.length));
      rows = level.layout.length;
    }
    const totalCells = rows * cols;
    if (totalCells >= 30) return 52;
    if (cols >= 7) return 56;
    if (cols >= 6) return 62;
    if (cols >= 5) return 68;
    if (rows >= 6) return 62;
    if (rows >= 5) return 72;
    if (cols >= 4) return 78;
    if (rows >= 4) return 82;
    if (rows >= 3 && cols >= 3) return 88;
    return 96;
  })();

  const sharedHead = (<>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
    <style dangerouslySetInnerHTML={{
      __html: `
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
      @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
      @keyframes pulseGlow{0%,100%{box-shadow:0 0 8px rgba(251,191,36,0.2)}50%{box-shadow:0 0 20px rgba(251,191,36,0.5)}}
      @keyframes energyRing{0%{transform:scale(0.8); opacity:1; box-shadow:0 0 20px 10px currentColor, inset 0 0 20px 10px currentColor;}100%{transform:scale(1.8); opacity:0; box-shadow:0 0 80px 30px currentColor, inset 0 0 40px 20px currentColor;}}
      @keyframes beamPulse{0%{opacity:0.3}50%{opacity:1}100%{opacity:0.7}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes glintSweep{0%{transform:translateX(-100%) skewX(-15deg)}100%{transform:translateX(200%) skewX(-15deg)}}
      @keyframes dash{0%{stroke-dashoffset:150}100%{stroke-dashoffset:0}}
      .tile-glint { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; pointer-events: none; }
      .tile-glint::after { content: ""; display: block; position: absolute; top: 0; left: 0; width: 50%; height: 100%; background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%); animation: glintSweep 3s infinite; }
      .tile-placed { box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1); }
      .tile-tray { box-shadow: 0 6px 16px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.25) !important; animation: float 6s ease-in-out infinite alternate; }
      *::-webkit-scrollbar{width:6px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
    `}} />
    <audio ref={audioRef} id="bgm" src={TRACKS[currentTrack].src} onEnded={handleTrackEnd} muted={isMusicMuted} autoPlay />
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 1000, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", borderRadius: 20, padding: "4px 8px", border: "1px solid rgba(255,255,255,0.08)" }}>
      <button onClick={() => changeTrack(-1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer", padding: "4px 6px" }} title="Previous Track">⏮</button>
      <button onClick={() => {
        const nextMuted = !isMusicMuted;
        setIsMusicMuted(nextMuted);
        if (audioRef.current) {
          nextMuted ? audioRef.current.pause() : audioRef.current.play().catch(() => { });
        }
      }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 14, cursor: "pointer", padding: "4px 6px" }} title={isMusicMuted ? "Unmute Music" : "Mute Music"}>
        {isMusicMuted ? "🔇" : "🎵"}
      </button>
      <button onClick={() => setIsSfxMuted(!isSfxMuted)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 14, cursor: "pointer", padding: "4px 6px", borderLeft: "1px solid rgba(255,255,255,0.1)", marginLeft: 4 }} title={isSfxMuted ? "Unmute SFX" : "Mute SFX"}>
        {isSfxMuted ? "🔕" : "🔔"}
      </button>
      <button onClick={() => changeTrack(1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer", padding: "4px 6px" }} title="Next Track">⏭</button>
      {!isMusicMuted && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "'JetBrains Mono',monospace", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{TRACKS[currentTrack].name}</span>}
    </div>
  </>);

  const maxUnlockedChapterIndex = useMemo(() => {
    let maxIdx = 0;
    for (let i = 0; i < CHAPTERS.length; i++) {
      maxIdx = i;
      const chLevels = LEVELS.filter(l => l.number >= CHAPTERS[i].range[0] && l.number <= CHAPTERS[i].range[1]);
      const isComplete = chLevels.every(lvl => {
        const idx = LEVELS.indexOf(lvl);
        return completedLevels.has(idx) || skippedLevels.has(idx);
      });
      if (!isComplete) break;
    }
    return maxIdx;
  }, [completedLevels, skippedLevels]);

  if (showVictory) return <>{sharedHead}<VictoryScreen onBack={() => { setShowVictory(false); setScreen("menu"); }} /></>;

  // ─── MENU ─────────────────────────────────────────────────────────────────
  if (screen === "menu") {
    const progress = completedLevels.size;
    const currentChapterMenu = CHAPTERS[currentChapterIndex];
    return (
      <div style={{ minHeight: "100vh", background: currentChapterMenu.bg || "linear-gradient(160deg,#0f0f1a 0%,#1a1a2e 40%,#16213e 100%)", transition: "background 0.5s ease", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'JetBrains Mono',monospace", padding: "24px 16px" }}>
        {sharedHead}
        <div style={{ animation: "float 4s ease-in-out infinite", marginBottom: 16, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {["RED", "BLUE", "GREEN"].map(c => (<div key={c} style={{ width: 40, height: 40, borderRadius: 10, background: `radial-gradient(circle,${COLORS[c].glow},${COLORS[c].bg})`, boxShadow: `0 0 20px ${COLORS[c].glow}40` }} />))}
          </div>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Orbitron',sans-serif", background: "linear-gradient(90deg,#60a5fa,#a78bfa,#f472b6,#60a5fa)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 4s linear infinite", marginBottom: 4, textAlign: "center" }}>CHROMATIC</h1>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 8, letterSpacing: "0.3em" }}>TILE · ARROW · CHAIN</p>
        <p style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, marginBottom: 20, maxWidth: 300, textAlign: "center", lineHeight: 1.6 }}>Place tiles so each arrow points at a neighbor whose outer color matches.</p>
        {progress > 0 && (<div style={{ marginBottom: 16, padding: "6px 16px", borderRadius: 8, background: allComplete ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${allComplete ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.06)"}` }}>
          <span style={{ color: allComplete ? "#fbbf24" : "rgba(255,255,255,0.4)", fontSize: 11 }}>{allComplete ? "★ ALL COMPLETE ★" : `${progress} / ${LEVELS.length}`}</span>
          {allComplete && <button onClick={() => setShowVictory(true)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fbbf24", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>View Victory</button>}
        </div>)}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 8px", width: "100%", maxWidth: 420 }}>
          <button
            onClick={() => setCurrentChapterIndex(p => Math.max(0, p - 1))}
            disabled={currentChapterIndex === 0}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: currentChapterIndex === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.8)", fontSize: 18, width: 40, height: 40, cursor: currentChapterIndex === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >◄</button>
          <div style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", color: CHAPTERS[currentChapterIndex].color, border: `1px solid ${CHAPTERS[currentChapterIndex].color}40`, borderRadius: 8, background: `${CHAPTERS[currentChapterIndex].color}10`, width: 220, textAlign: "center" }}>
            {CHAPTERS[currentChapterIndex].name.toUpperCase()}
          </div>
          <button
            onClick={() => setCurrentChapterIndex(p => Math.min(CHAPTERS.length - 1, p + 1))}
            disabled={currentChapterIndex === CHAPTERS.length - 1}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: currentChapterIndex === CHAPTERS.length - 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.8)", fontSize: 18, width: 40, height: 40, cursor: currentChapterIndex === CHAPTERS.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >►</button>
        </div>
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 4, maxHeight: "60vh", overflowY: "auto", padding: "0 4px" }}>
          {(() => {
            const ch = CHAPTERS[currentChapterIndex];
            const chLevels = LEVELS.filter(l => l.number >= ch.range[0] && l.number <= ch.range[1]);
            return chLevels.map(lvl => {
              const idx = LEVELS.indexOf(lvl);
              const done = completedLevels.has(idx);
              const maxOut = Math.max(...lvl.pieces.map(p => { const t = parseTile(p); return t.connections.length }));
              const hasJump = lvl.pieces.some(p => /:\d+/.test(p.replace(/^(OUT:\w+\||IN:\w+|\w+\|)/, "")));
              const hasIO = lvl.pieces.some(p => p.startsWith("IN:") || p.startsWith("OUT:"));
              const hasPipe = lvl.pieces.some(p => p.startsWith("PIPE:"));
              const tags = []; if (maxOut >= 4) tags.push("4×"); else if (maxOut >= 3) tags.push("3×"); if (hasJump) tags.push("jump"); if (hasIO) tags.push("io"); if (hasPipe) tags.push("pipe");

              let bg = "rgba(255,255,255,0.02)";
              let border = "rgba(255,255,255,0.05)";
              let statusText = `${lvl.cells.length}t`;
              let statusColor = "rgba(255,255,255,0.18)";

              if (done) {
                bg = "rgba(34,197,94,0.04)";
                border = "rgba(34,197,94,0.15)";
                statusText = "✓ " + lvl.cells.length + "t";
                statusColor = "rgba(34,197,94,0.6)";
              }

              return (
                <button key={idx} onClick={() => initLevel(idx)} style={{
                  width: "100%", padding: "10px 14px", borderRadius: 9,
                  border: `1px solid ${border}`, background: bg,
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                  transition: "all 0.15s", textAlign: "left", marginBottom: 2, animation: `fadeIn 0.2s ease ${(idx % 10) * 0.02}s both`
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = bg }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, minWidth: 20 }}>{String(lvl.number).padStart(2, "0")}</span>
                    <span>{lvl.name}</span>
                    {tags.length > 0 && <span style={{ fontSize: 8, color: `${ch.color}80`, whiteSpace: "nowrap" }}>{tags.join("·")}</span>}
                  </span>
                  <span style={{ fontSize: 10, color: statusColor, minWidth: 18, textAlign: "right" }}>{statusText}</span>
                </button>
              );
            });
          })()}
        </div>
      </div>
    );
  }

  // ─── CONNECTION BEAMS ─────────────────────────────────────────────────────────

  function ConnectionBeams({ board, level, containerRef }) {
    const [beams, setBeams] = useState([]);

    useEffect(() => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newBeams = [];
      const l3d = getLayout3D(level.layout);

      for (let z = 0; z < l3d.length; z++) {
        for (let r = 0; r < l3d[z].length; r++) {
          for (let c = 0; c < l3d[z][r].length; c++) {
            const cellName = l3d[z][r][c];
            if (!cellName || !board[cellName]) continue;

            const sourceEl = document.getElementById(`cell-${cellName}`);
            if (!sourceEl) continue;
            const sRect = sourceEl.getBoundingClientRect();
            const sX = sRect.left - containerRect.left + sRect.width / 2;
            const sY = sRect.top - containerRect.top + sRect.height / 2;

            const tile = parseTile(board[cellName]);

            for (const conn of tile.connections) {
              const dist = conn.distance || 1;
              const neighbor = getNeighborAtDist(level.layout, z, r, c, conn.dir, dist);
              if (!neighbor || !board[neighbor.cell]) continue;

              const targetTile = parseTile(board[neighbor.cell]);
              if (!checkMatch(tile, conn, targetTile)) continue;

              const targetEl = document.getElementById(`cell-${neighbor.cell}`);
              if (!targetEl) continue;

              const tRect = targetEl.getBoundingClientRect();
              const tX = tRect.left - containerRect.left + tRect.width / 2;
              const tY = tRect.top - containerRect.top + tRect.height / 2;

              let targetColor = conn.color;
              if (targetTile.type === "OUTPUT_ONLY" && targetTile.center) targetColor = targetTile.center;
              else if (targetTile.type === "NORMAL" && targetTile.outer) targetColor = targetTile.outer;
              else if (targetTile.type === "PIPE") {
                const oppDir = OPPOSITE[conn.dir];
                const p = targetTile.inPorts.find(p => p.dir === oppDir && p.color === conn.color);
                if (p) targetColor = p.color;
              }

              newBeams.push({
                id: `${cellName}-${neighbor.cell}-${conn.dir}`,
                x1: sX, y1: sY, x2: tX, y2: tY,
                color1: COLORS[conn.color]?.glow || "#fff",
                color2: COLORS[targetColor]?.glow || "#fff"
              });
            }
          }
        }
      }
      setBeams(newBeams);
    }, [board, level.layout, containerRef]);

    return (
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 30, overflow: "visible" }}>
        <defs>
          {beams.map(b => (
            <linearGradient key={`grad-${b.id}`} id={`grad-${b.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={b.color1} />
              <stop offset="100%" stopColor={b.color2} />
            </linearGradient>
          ))}
          <filter id="beam-glow"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {beams.map(b => (
          <g key={b.id} style={{ animation: "beamPulse 1.5s ease-out forwards" }}>
            <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={`url(#grad-${b.id})`} strokeWidth="8" filter="url(#beam-glow)" />
            <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={`url(#grad-${b.id})`} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    );
  }

  // ─── GAME ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: currentChapter.bg || "linear-gradient(160deg,#0f0f1a 0%,#1a1a2e 40%,#16213e 100%)", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'JetBrains Mono',monospace", padding: "16px 12px" }}>
      {sharedHead}
      <div style={{ width: "100%", maxWidth: 520, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => setScreen("menu")} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 12px", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer" }}>← Levels</button>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 9, color: currentChapter.color || "rgba(255,255,255,0.4)", letterSpacing: "0.25em", display: "block", marginBottom: 2 }}>{currentChapter.name}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.2em", display: "block" }}>LEVEL {level.number}</span>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Orbitron',sans-serif", color: "rgba(255,255,255,0.9)" }}>{level.name}</span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => setShowHint(!showHint)} style={{ background: showHint ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px", color: showHint ? "#fbbf24" : "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }} title="Hint">?</button>
          <button onClick={handleClear} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }} title="Restart">↺</button>
          <button onClick={handleSkip} disabled={!canSkip || solved} style={{ background: (canSkip && !solved) ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.03)", border: "1px solid " + ((canSkip && !solved) ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.05)"), borderRadius: 8, padding: "7px 10px", color: (canSkip && !solved) ? "#ef4444" : "rgba(255,255,255,0.2)", fontSize: 13, cursor: (canSkip && !solved) ? "pointer" : "not-allowed" }} title={canSkip ? `Skip Level (${2 - skipsInChapter} skips left in chapter)` : "No skips left in chapter"}>⏭</button>
        </div>
      </div>
      {showHint && <div style={{ maxWidth: 520, width: "100%", marginBottom: 12, padding: "9px 14px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", fontSize: 12, lineHeight: 1.5 }}>{level.hint}</div>}
      <div style={{ maxWidth: 520, width: "100%", marginBottom: 14, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontSize: 10, textAlign: "center" }}>
        Each arrow must point at a tile whose outer color matches{level.pieces.some(p => /:\d+/.test(p.replace(/^(OUT:\w+\||IN:\w+|\w+\|)/, ""))) ? " · numbered arrows jump over tiles!" : ""}{level.pieces.some(p => p.startsWith("OUT:")) ? " · SRC = source (sends only)" : ""}{level.pieces.some(p => p.startsWith("IN:")) ? " · SINK = destination" : ""}
      </div>
      {(() => {
        const l3d = getLayout3D(level.layout);
        const numShelves = l3d.length;
        if (numShelves === 1) {
          return (
            <div ref={containerRef} style={{ position: "relative", marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <ConnectionBeams board={board} level={level} containerRef={containerRef} />
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${l3d[0][0].length}, ${cellSize}px)`, gap: 4 }}>
                {l3d[0].flatMap((row, r) => row.map((cellName, c) => {
                  if (!cellName) return <div key={`${r}-${c}`} style={{ width: cellSize, height: cellSize }} />;
                  const isErr = Array.from(errors).some(e => e.startsWith(`${cellName}:`));
                  const locked = !board[cellName] && isLocked(level, board, cellName);
                  return <GridCell key={`${r}-${c}`} cellName={cellName} displayLabel={displayLabelMap[cellName]} size={cellSize} tile={board[cellName]} hasError={isErr} onClick={() => handleCellClick(cellName)} isTarget={!solved && selectedTile && !board[cellName] && !locked} isLockedCell={locked} currentChapter={currentChapter} flashColor={flashes[cellName]} displayLabelMap={displayLabelMap} />;
                }))}
              </div>
            </div>
          );
        }

        const maxRows = Math.max(...l3d.map(layer => layer.length));
        const maxCols = Math.max(...l3d.map(layer => layer[0].length));
        const shelfGap = 6;
        const offsetAmount = cellSize * 0.3; // reduced from 0.7 — tighter diagonal spread

        const baseWidth = maxCols * cellSize + (maxCols - 1) * shelfGap;
        const baseHeight = maxRows * cellSize + (maxRows - 1) * shelfGap;

        const maxDelta = Math.max(currentShelf, numShelves - 1 - currentShelf);
        const totalWidth = baseWidth + maxDelta * offsetAmount * 2 + 20;
        const totalHeight = baseHeight + maxDelta * offsetAmount * 2 + 20;

        // Build dotted connection lines between cells at the same (row,col) across shelves
        const shelfConnectors = [];
        for (let z = 0; z < numShelves - 1; z++) {
          const layerA = l3d[z];
          const layerB = l3d[z + 1];
          const deltaA = z - currentShelf;
          const deltaB = (z + 1) - currentShelf;
          const oxA = deltaA * offsetAmount;
          const oyA = -deltaA * offsetAmount;
          const oxB = deltaB * offsetAmount;
          const oyB = -deltaB * offsetAmount;
          for (let r = 0; r < Math.min(layerA.length, layerB.length); r++) {
            for (let c = 0; c < Math.min(layerA[r].length, layerB[r].length); c++) {
              if (layerA[r][c] && layerB[r][c]) {
                const cx = c * (cellSize + shelfGap) + cellSize / 2;
                const cy = r * (cellSize + shelfGap) + cellSize / 2;
                const x1 = totalWidth / 2 + oxA + cx - baseWidth / 2;
                const y1 = totalHeight / 2 + oyA + cy - baseHeight / 2;
                const x2 = totalWidth / 2 + oxB + cx - baseWidth / 2;
                const y2 = totalHeight / 2 + oyB + cy - baseHeight / 2;
                shelfConnectors.push({ x1, y1, x2, y2, key: `sc-${z}-${r}-${c}` });
              }
            }
          }
        }

        return (
          <div ref={containerRef} style={{ position: "relative", marginBottom: 10, padding: 10, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <ConnectionBeams board={board} level={level} containerRef={containerRef} />
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {l3d.map((_, z) => (
                <button key={z} onClick={() => setCurrentShelf(z)} style={{ padding: "3px 10px", borderRadius: 8, border: z === currentShelf ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.2)", background: z === currentShelf ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)", color: z === currentShelf ? "#fbbf24" : "white", cursor: "pointer", transition: "all 0.2s", fontSize: 11 }}>
                  Shelf {z + 1}
                </button>
              ))}
            </div>

            <div style={{ position: "relative", width: totalWidth, height: totalHeight }}>
              {/* Dotted 3D connection lines between shelf levels */}
              <svg style={{ position: "absolute", top: 0, left: 0, width: totalWidth, height: totalHeight, pointerEvents: "none", zIndex: 5 }}>
                {shelfConnectors.map(({ x1, y1, x2, y2, key }) => (
                  <line key={key} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,4"
                    style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.05))" }} />
                ))}
              </svg>

              {l3d.map((layer, z) => {
                const zDelta = z - currentShelf;
                const offsetX = zDelta * offsetAmount;
                const offsetY = -zDelta * offsetAmount;

                const isFocused = z === currentShelf;

                return (
                  <div key={z} style={{
                    position: "absolute",
                    left: "50%", top: "50%",
                    transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                    zIndex: isFocused ? 20 : 10 + z,
                    opacity: isFocused ? 1 : 0.35,
                    pointerEvents: isFocused ? "auto" : "none",
                    transition: "all 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
                    filter: isFocused ? "none" : "blur(1px) grayscale(30%)"
                  }}>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${layer[0].length}, ${cellSize}px)`, gap: shelfGap }}>
                      {layer.flatMap((row, r) => row.map((cellName, c) => {
                          if (!cellName) return <div key={`${r}-${c}`} style={{ width: cellSize, height: cellSize }} />;
                          const isErr = Array.from(errors).some(e => e.startsWith(`${cellName}:`));
                          const locked = !board[cellName] && isLocked(level, board, cellName);
                          return <GridCell key={`${r}-${c}`} cellName={cellName} displayLabel={displayLabelMap[cellName]} size={cellSize} tile={board[cellName]} hasError={isErr} onClick={() => handleCellClick(cellName)} isTarget={!solved && selectedTile && !board[cellName] && !locked} isLockedCell={locked} currentChapter={currentChapter} flashColor={flashes[cellName]} displayLabelMap={displayLabelMap} />;
                        }))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {selectedTile && (<div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
        <span style={{ color: "#fbbf24", fontSize: 11 }}>Selected:</span>
        <TilePiece tileStr={selectedTile} size={40} displayLabelMap={displayLabelMap} />
        <button onClick={() => setSelectedTile(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 15, cursor: "pointer", padding: "2px 5px" }}>✕</button>
      </div>)}
      <div style={{ marginBottom: 12 }}>
        <span style={{ display: "block", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 10, letterSpacing: "0.2em", marginBottom: 8 }}>PIECES</span>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 8, padding: "24px 16px", borderRadius: 16, background: "rgba(0,0,0,0.2)", minHeight: 120, border: `1px solid ${currentChapter.glow}`, boxShadow: `0 4px 60px ${currentChapter.glow}` }}>
          {tray.map((t, i) => (
            <TilePiece key={i} tileStr={t} size={cellSize} onClick={(e) => handleTrayClick(t, e)}
              isDragging={selectedTile === t} className="tile-tray" displayLabelMap={displayLabelMap} />
          ))}
          {tray.length === 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 13, alignSelf: "center", fontFamily: "'JetBrains Mono',monospace" }}>Tray empty</span>}
        </div>
        {tray.some(t => t.startsWith("PIPE:")) && <p style={{ color: "rgba(139,92,246,0.6)", fontSize: 9, textAlign: "center", marginTop: 8 }}>Click pipes to rotate ↻</p>}
      </div>
      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{Object.keys(board).length} / {level.cells.length} placed</div>
      {solved && <FinishOverlay level={level} hasNext={currentLevel < LEVELS.length - 1} onNext={() => initLevel(currentLevel + 1)} onReplay={() => initLevel(currentLevel)} />}
      {showVictory && <VictoryScreen onBack={() => { setShowVictory(false); setScreen("menu"); }} />}
    </div>
  );
}
