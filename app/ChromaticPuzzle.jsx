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

// Conduit routing: when an arrow points off-grid, check if a conduit catches it
function getConduitNeighbor(level, cellName, dir) {
  if (!level.conduits) return null;
  for (const conduit of level.conduits) {
    if (conduit.from.cell === cellName && conduit.from.dir === dir) {
      return { cell: conduit.to.cell, arrivalDir: conduit.to.dir };
    }
  }
  return null;
}

function isWallBlocked(level, targetCell, arrivalDir) {
  if (!level.walls || !level.walls[targetCell]) return false;
  return level.walls[targetCell].includes(arrivalDir);
}

// Jumper walls: block jumper arrows from crossing OVER a cell
// Checks all intermediate cells in a jumper path (dist > 1)
function isJumperWallBlocked(level, layout, z, row, col, dir, dist) {
  if (dist <= 1 || !level.jumperWalls) return false;
  const l3d = getLayout3D(layout);
  const d = DIRS[dir];
  if (!d) {
    // SHELF_UP/DOWN: check intermediate shelves
    for (let i = 1; i < dist; i++) {
      const iz = dir === "SHELF_UP" ? z + i : z - i;
      if (l3d[iz] && l3d[iz][row] && l3d[iz][row][col]) {
        const intermediateCell = l3d[iz][row][col];
        if (level.jumperWalls[intermediateCell]) return true;
      }
    }
    return false;
  }
  for (let i = 1; i < dist; i++) {
    const ir = row + d.dr * i, ic = col + d.dc * i;
    if (l3d[z] && ir >= 0 && ir < l3d[z].length && ic >= 0 && ic < (l3d[z][ir]?.length || 0) && l3d[z][ir][ic]) {
      const intermediateCell = l3d[z][ir][ic];
      if (level.jumperWalls[intermediateCell]) return true;
    }
  }
  return false;
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
      let targetCell = neighbor?.cell;
      // Conduit fallback for trigger satisfaction
      if (!targetCell) {
        const conduit = getConduitNeighbor(level, sourceCell, conn.dir);
        if (conduit) targetCell = conduit.cell;
      }
      if (targetCell && board[targetCell]) {
        const nTile = parseTile(board[targetCell]);
        if (nTile.type === "TRIGGER" && nTile.reqColor === conn.color) {
          satisfied.add(targetCell);
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
          // Outgoing wall check: block if THIS cell has a wall on the outgoing side
          if (isWallBlocked(level, cellName, conn.dir)) {
            errors.add(`${cellName}:${conn.dir}`);
            continue;
          }
          // Jumper wall check: block if intermediate cells have jumper walls
          if (dist > 1 && isJumperWallBlocked(level, level.layout, z, r, c, conn.dir, dist)) {
            errors.add(`${cellName}:${conn.dir}`);
            continue;
          }
          let neighbor = getNeighborAtDist(level.layout, z, r, c, conn.dir, dist);
          // Conduit fallback: if off-grid, check for conduit routing
          if (!neighbor) {
            const conduit = getConduitNeighbor(level, cellName, conn.dir);
            if (conduit && board[conduit.cell]) {
              const nTile = parseTile(board[conduit.cell]);
              // Match using conduit arrival direction
              if (nTile.type === "PIPE") {
                const oppDir = OPPOSITE[conduit.arrivalDir];
                if (!nTile.inPorts?.find(p => p.dir === oppDir && p.color === conn.color)) {
                  errors.add(`${cellName}:${conn.dir}`);
                }
              } else if (nTile.type === "TRIGGER") {
                if (conn.color !== nTile.reqColor) errors.add(`${cellName}:${conn.dir}`);
              } else if (nTile.type === "INPUT_ONLY") {
                if (!nTile.acceptColors.includes(conn.color)) errors.add(`${cellName}:${conn.dir}`);
              } else {
                if (conn.color !== nTile.outer) errors.add(`${cellName}:${conn.dir}`);
              }
              continue;
            }
            errors.add(`${cellName}:${conn.dir}`);
            continue;
          }
          if (!board[neighbor.cell]) {
            errors.add(`${cellName}:${conn.dir}`);
            continue;
          }
          // Incoming wall check: block if target cell has a wall on the arrival side
          const arrivalDir = OPPOSITE[conn.dir];
          if (arrivalDir && isWallBlocked(level, neighbor.cell, arrivalDir)) {
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
  // === BONUS: WARMUP (negative levels) ===
  { number: -6, name: "Split Signal", cells: ["A","B","C"], layout: [["A","B"],["C",null]], pieces: ["PURPLE|GREEN:RIGHT,RED:DOWN","GREEN|PURPLE:LEFT","RED|PURPLE:UP"], solution: {"A":"PURPLE|GREEN:RIGHT,RED:DOWN","B":"GREEN|PURPLE:LEFT","C":"RED|PURPLE:UP"}, hint: "One piece sends two signals!" },
  { number: -5, name: "Hub", cells: ["A","B","C","D"], layout: [["A","B"],["C","D"]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT","GREEN|RED:UP","ORANGE|GREEN:LEFT"], solution: {"A":"RED|BLUE:RIGHT,GREEN:DOWN","B":"BLUE|RED:LEFT","C":"GREEN|RED:UP","D":"ORANGE|GREEN:LEFT"}, hint: "A sends signals in two directions." },
  { number: -4, name: "Diagonal", cells: ["A","B","C","D"], layout: [["A","B"],["C","D"]], pieces: ["BLUE|RED:DOWN_RIGHT","GREEN|RED:DOWN","PURPLE|RED:RIGHT","RED|GREEN:UP"], solution: {"A":"BLUE|RED:DOWN_RIGHT","B":"GREEN|RED:DOWN","C":"PURPLE|RED:RIGHT","D":"RED|GREEN:UP"}, hint: "A shoots diagonally!" },
  { number: -3, name: "X Marks It (Classic)", cells: ["A","B","C","D"], layout: [["A","B"],["C","D"]], pieces: ["RED|GREEN:DOWN_RIGHT","BLUE|RED:DOWN_LEFT","RED|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"], solution: {"A":"RED|GREEN:DOWN_RIGHT","B":"BLUE|RED:DOWN_LEFT","C":"RED|BLUE:UP_RIGHT","D":"GREEN|RED:UP_LEFT"}, hint: "Everything crosses!" },
  { number: -2, name: "Star Node", cells: ["A","B","C","D","E"], layout: [[null,"A",null],["B","C","D"],[null,"E",null]], pieces: ["PURPLE|ORANGE:DOWN","ORANGE|ORANGE:RIGHT","ORANGE|PURPLE:UP,ORANGE:LEFT","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"], solution: {"A":"PURPLE|ORANGE:DOWN","B":"ORANGE|ORANGE:RIGHT","C":"ORANGE|PURPLE:UP,ORANGE:LEFT","D":"GREEN|ORANGE:LEFT","E":"PURPLE|ORANGE:UP"}, hint: "C is the star — it connects to everyone!" },
  { number: -1, name: "Full Grid", cells: ["A","B","C","D","E","F"], layout: [["A","B","C"],["D","E","F"]], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:RIGHT,RED:DOWN_LEFT","GREEN|BLUE:DOWN","RED|GREEN:RIGHT","GREEN|BLUE:UP","BLUE|GREEN:LEFT"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:RIGHT,RED:DOWN_LEFT","C":"GREEN|BLUE:DOWN","D":"RED|GREEN:RIGHT","E":"GREEN|BLUE:UP","F":"BLUE|GREEN:LEFT"}, hint: "Fill the whole grid — watch the diagonal!" },
  // === CH1: FUNDAMENTALS (1-9) ===
  { number: 1, name: "First Link", cells: ["A", "B"], layout: [["A", "B"]], pieces: ["BLUE|RED:RIGHT", "RED|BLUE:LEFT"], solution: { A: "BLUE|RED:RIGHT", B: "RED|BLUE:LEFT" }, hint: "A's inner RED arrow points right. B's outer must be RED." },
  { number: 2, name: "Three Chain", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|GREEN:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|BLUE:RIGHT", C: "BLUE|GREEN:LEFT" }, hint: "A→B→C flows right. C points back left to B." },
  { number: 3, name: "Corner Turn", cells: ["A", "B", "C"], layout: [["A", null], ["B", "C"]], pieces: ["GREEN|BLUE:DOWN", "BLUE|RED:RIGHT", "RED|BLUE:LEFT"], solution: { A: "GREEN|BLUE:DOWN", B: "BLUE|RED:RIGHT", C: "RED|BLUE:LEFT" }, hint: "A sends down to B. B sends right to C. C sends back to B." },
  { number: 4, name: "Downward", cells: ["A","B","C"], layout: [["A"],["B"],["C"]], pieces: ["RED|GREEN:DOWN","GREEN|BLUE:DOWN","BLUE|GREEN:UP"], solution: {"A":"RED|GREEN:DOWN","B":"GREEN|BLUE:DOWN","C":"BLUE|GREEN:UP"}, hint: "Arrows can point down too!" },
  { number: 5, name: "Right Angle", cells: ["A","B","C","D"], layout: [["A","B"],[null,"C"],[null,"D"]], pieces: ["BLUE|RED:RIGHT","RED|GREEN:DOWN","GREEN|PURPLE:DOWN","PURPLE|GREEN:UP"], solution: {"A":"BLUE|RED:RIGHT","B":"RED|GREEN:DOWN","C":"GREEN|PURPLE:DOWN","D":"PURPLE|GREEN:UP"}, hint: "Follow the turns!" },
  { number: 6, name: "Zigzag", cells: ["A","B","C","D"], layout: [["A",null],["B","C"],[null,"D"]], pieces: ["RED|BLUE:DOWN","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|GREEN:UP"], solution: {"A":"RED|BLUE:DOWN","B":"BLUE|GREEN:RIGHT","C":"GREEN|PURPLE:DOWN","D":"PURPLE|GREEN:UP"}, hint: "Zigzag down the grid!" },
  { number: 7, name: "U-Turn", cells: ["A","B","C","D","E"], layout: [["A","B"],["C","D"],["E",null]], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","PURPLE|ORANGE:DOWN","GREEN|PURPLE:LEFT","ORANGE|PURPLE:UP"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","D":"GREEN|PURPLE:LEFT","C":"PURPLE|ORANGE:DOWN","E":"ORANGE|PURPLE:UP"}, hint: "Make a U-turn!" },
  { number: 8, name: "Spiral", cells: ["A","B","C","D","E","F"], layout: [["A","B"],["C","D"],["E","F"]], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","ORANGE|RED:DOWN","GREEN|PURPLE:DOWN","RED|ORANGE:UP","PURPLE|RED:LEFT"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","D":"GREEN|PURPLE:DOWN","F":"PURPLE|RED:LEFT","E":"RED|ORANGE:UP","C":"ORANGE|RED:DOWN"}, hint: "Spiral around the grid." },
  { number: 9, name: "Winding Path", cells: ["A","B","C","D","E","F"], layout: [["A","B","C"],["D","E","F"]], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|RED:DOWN","ORANGE|RED:UP","PURPLE|ORANGE:LEFT","RED|PURPLE:LEFT"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:RIGHT","C":"GREEN|RED:DOWN","D":"ORANGE|RED:UP","E":"PURPLE|ORANGE:LEFT","F":"RED|PURPLE:LEFT"}, hint: "Trace the winding path." },
  // === CH2: MULTI-OUTPUT (10-18) ===
  { number: 10, name: "First Diagonal", cells: ["A","B"], layout: [["A",null],[null,"B"]], pieces: ["BLUE|RED:DOWN_RIGHT","RED|BLUE:UP_LEFT"], solution: {"A":"BLUE|RED:DOWN_RIGHT","B":"RED|BLUE:UP_LEFT"}, hint: "Arrows can point diagonally!" },
{ number: 11, name: "Cross Cut", cells: ["A","B"], layout: [[null,"A"],["B",null]], pieces: ["GREEN|RED:DOWN_LEFT","RED|GREEN:UP_RIGHT"], solution: {"A":"GREEN|RED:DOWN_LEFT","B":"RED|GREEN:UP_RIGHT"}, hint: "Try the other diagonal." },
{ number: 12, name: "X Marks It", cells: ["A","B","C","D"], layout: [["A","B"],["C","D"]], pieces: ["RED|GREEN:DOWN_RIGHT","BLUE|PURPLE:DOWN_LEFT","PURPLE|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"], solution: {"A":"RED|GREEN:DOWN_RIGHT","B":"BLUE|PURPLE:DOWN_LEFT","C":"PURPLE|BLUE:UP_RIGHT","D":"GREEN|RED:UP_LEFT"}, hint: "Every tile points diagonally!" },
{ number: 13, name: "Slanted Step", cells: ["A","B","C","D"], layout: [["A","B"],["C","D"]], pieces: ["RED|GREEN:DOWN_RIGHT","PURPLE|BLUE:DOWN_LEFT","BLUE|PURPLE:UP_RIGHT","GREEN|BLUE:LEFT"], solution: {"A":"RED|GREEN:DOWN_RIGHT","B":"PURPLE|BLUE:DOWN_LEFT","C":"BLUE|PURPLE:UP_RIGHT","D":"GREEN|BLUE:LEFT"}, hint: "Mix straight and diagonal." },
{ number: 14, name: "Diamond Trail", cells: ["A","B","C","D","E"], layout: [[null,"A",null],["B","C","D"],[null,"E",null]], pieces: ["RED|BLUE:DOWN_LEFT","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN_LEFT","ORANGE|PURPLE:UP_RIGHT"], solution: {"A":"RED|BLUE:DOWN_LEFT","B":"BLUE|GREEN:RIGHT","C":"GREEN|PURPLE:RIGHT","D":"PURPLE|ORANGE:DOWN_LEFT","E":"ORANGE|PURPLE:UP_RIGHT"}, hint: "Bounce between diagonals." },
{ number: 15, name: "Angle Grid", cells: ["A","B","C","D","E","F"], layout: [["A","B","C"],["D","E","F"]], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN_LEFT","RED|ORANGE:DOWN","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:RIGHT","ORANGE|RED:UP"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN_LEFT","C":"RED|ORANGE:DOWN","D":"GREEN|PURPLE:RIGHT","E":"PURPLE|ORANGE:RIGHT","F":"ORANGE|RED:UP"}, hint: "Diagonals and cardinals work together." },
{ number: 16, name: "Star Cross", cells: ["A","B","C","D","E"], layout: [[null,"A",null],["B","C","D"],[null,"E",null]], pieces: ["BLUE|PURPLE:DOWN_LEFT","PURPLE|ORANGE:DOWN_RIGHT","GREEN|RED:RIGHT","RED|BLUE:UP_LEFT","ORANGE|PURPLE:UP_LEFT"], solution: {"A":"BLUE|PURPLE:DOWN_LEFT","B":"PURPLE|ORANGE:DOWN_RIGHT","C":"GREEN|RED:RIGHT","D":"RED|BLUE:UP_LEFT","E":"ORANGE|PURPLE:UP_LEFT"}, hint: "A star of diagonals!" },
{ number: 17, name: "Diagonal Maze", cells: ["A","B","C","D","E","F"], layout: [["A","B",null],["C","D","E"],[null,"F",null]], pieces: ["RED|BLUE:DOWN","GREEN|PURPLE:DOWN_RIGHT","BLUE|GREEN:UP_RIGHT","ORANGE|RED:DOWN","PURPLE|ORANGE:LEFT","RED|ORANGE:UP"], solution: {"A":"RED|BLUE:DOWN","B":"GREEN|PURPLE:DOWN_RIGHT","C":"BLUE|GREEN:UP_RIGHT","D":"ORANGE|RED:DOWN","E":"PURPLE|ORANGE:LEFT","F":"RED|ORANGE:UP"}, hint: "Navigate the diagonal maze." },
{ number: 18, name: "Triple Threat", cells: ["A", "B", "C", "D"], layout: [[null, "A", null], ["B", "C", "D"]], pieces: ["PURPLE|ORANGE:DOWN", "ORANGE|ORANGE:RIGHT", "ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT", "GREEN|ORANGE:LEFT"], solution: { A: "PURPLE|ORANGE:DOWN", B: "ORANGE|ORANGE:RIGHT", C: "ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT", D: "GREEN|ORANGE:LEFT" }, hint: "C has THREE arrows — one to each neighbor!" },
  { number: 19, name: "Broadcast", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B"], ["C", "D"], ["E", null]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", "BLUE|RED:LEFT", "GREEN|RED:UP", "PURPLE|GREEN:LEFT", "CYAN|GREEN:UP"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", B: "BLUE|RED:LEFT", C: "GREEN|RED:UP", D: "PURPLE|GREEN:LEFT", E: "CYAN|GREEN:UP" }, hint: "A broadcasts 3 signals!" },
  { number: 20, name: "Quad Core", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["RED|ORANGE:DOWN", "BLUE|ORANGE:RIGHT", "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|ORANGE:LEFT", "PURPLE|ORANGE:UP"], solution: { A: "RED|ORANGE:DOWN", B: "BLUE|ORANGE:RIGHT", C: "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", D: "GREEN|ORANGE:LEFT", E: "PURPLE|ORANGE:UP" }, hint: "C has FOUR arrows — one to each cardinal!" },
  { number: 21, name: "Relay", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", "BLUE|RED:LEFT", "ORANGE|BLUE:LEFT", "GREEN|RED:UP", "PURPLE|GREEN:LEFT", "PINK|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", B: "BLUE|RED:LEFT", C: "ORANGE|BLUE:LEFT", D: "GREEN|RED:UP", E: "PURPLE|GREEN:LEFT", F: "PINK|PURPLE:LEFT" }, hint: "A relays 3 signals across the grid." },
  { number: 22, name: "Crossfire", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["BLUE|RED:DOWN,GREEN:DOWN_LEFT", "GREEN|RED:RIGHT", "RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN", "PURPLE|RED:LEFT", "ORANGE|RED:UP"], solution: { A: "BLUE|RED:DOWN,GREEN:DOWN_LEFT", B: "GREEN|RED:RIGHT", C: "RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN", D: "PURPLE|RED:LEFT", E: "ORANGE|RED:UP" }, hint: "A and C both have multiple outputs." },
  { number: 23, name: "Pinwheel", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["RED|GREEN:DOWN_RIGHT,BLUE:RIGHT", "BLUE|RED:DOWN_LEFT", "RED|BLUE:UP_RIGHT", "GREEN|RED:UP_LEFT"], solution: { A: "RED|GREEN:DOWN_RIGHT,BLUE:RIGHT", B: "BLUE|RED:DOWN_LEFT", C: "RED|BLUE:UP_RIGHT", D: "GREEN|RED:UP_LEFT" }, hint: "A spins two arrows: diagonal and cardinal." },
  { number: 24, name: "Cascade", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "PURPLE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|BLUE:RIGHT", C: "BLUE|PURPLE:RIGHT", D: "PURPLE|BLUE:LEFT" }, hint: "A waterfall of arrows flows right." },
  { number: 25, name: "Trident", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C"], [null, "D", null], [null, "E", null]], pieces: ["RED|PURPLE:RIGHT", "PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", "GREEN|PURPLE:LEFT", "BLUE|ORANGE:DOWN", "ORANGE|BLUE:UP"], solution: { A: "RED|PURPLE:RIGHT", B: "PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", C: "GREEN|PURPLE:LEFT", D: "BLUE|ORANGE:DOWN", E: "ORANGE|BLUE:UP" }, hint: "B is the trident head — 3 prongs." },
  { number: 26, name: "Mirror", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["GREEN|BLUE:DOWN", "RED|GREEN:LEFT,PURPLE:RIGHT", "PURPLE|RED:LEFT", "BLUE|GREEN:UP", "ORANGE|BLUE:LEFT,CYAN:RIGHT", "CYAN|ORANGE:LEFT"], solution: { A: "GREEN|BLUE:DOWN", B: "RED|GREEN:LEFT,PURPLE:RIGHT", C: "PURPLE|RED:LEFT", D: "BLUE|GREEN:UP", E: "ORANGE|BLUE:LEFT,CYAN:RIGHT", F: "CYAN|ORANGE:LEFT" }, hint: "B and E mirror each other." },
  // === CH3: COMPLEX LAYOUTS (19-30) ===
  { number: 27, name: "Diamond", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT", "GREEN|CYAN:UP_RIGHT", "RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT", "PURPLE|CYAN:UP_LEFT", "ORANGE|RED:UP"], solution: { A: "CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT", B: "GREEN|CYAN:UP_RIGHT", C: "RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT", D: "PURPLE|CYAN:UP_LEFT", E: "ORANGE|RED:UP" }, hint: "A shoots diagonals. C controls the center." },
  { number: 28, name: "Web", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["CYAN|BLUE:RIGHT", "BLUE|ORANGE:DOWN", "PINK|BLUE:LEFT", "RED|ORANGE:RIGHT", "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT", "GREEN|ORANGE:LEFT"], solution: { A: "CYAN|BLUE:RIGHT", B: "BLUE|ORANGE:DOWN", C: "PINK|BLUE:LEFT", D: "RED|ORANGE:RIGHT", E: "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT", F: "GREEN|ORANGE:LEFT" }, hint: "E is the web center with 4 arrows!" },
  { number: 29, name: "Sharp Zigzag", cells: ["A", "B", "C", "D"], layout: [["A", "B", null], [null, "C", "D"]], pieces: ["RED|GREEN:RIGHT", "GREEN|RED:DOWN,BLUE:DOWN_RIGHT", "RED|GREEN:UP", "BLUE|RED:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|RED:DOWN,BLUE:DOWN_RIGHT", C: "RED|GREEN:UP", D: "BLUE|RED:LEFT" }, hint: "B sends two arrows down." },
  { number: 30, name: "Fortress", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN", "BLUE|RED:LEFT", "PURPLE|ORANGE:DOWN", "GREEN|RED:UP", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:UP,GREEN:LEFT"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN", B: "BLUE|RED:LEFT", C: "PURPLE|ORANGE:DOWN", D: "GREEN|RED:UP", E: "GREEN|ORANGE:RIGHT", F: "ORANGE|PURPLE:UP,GREEN:LEFT" }, hint: "A and F are the twin towers." },
  { number: 31, name: "Helix", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|BLUE:RIGHT", "BLUE|GREEN:LEFT", "CYAN|PURPLE:RIGHT", "PURPLE|BLUE:UP", "ORANGE|GREEN:UP,PURPLE:LEFT", "PINK|ORANGE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", C: "GREEN|BLUE:RIGHT", D: "BLUE|GREEN:LEFT", E: "CYAN|PURPLE:RIGHT", F: "PURPLE|BLUE:UP", G: "ORANGE|GREEN:UP,PURPLE:LEFT", H: "PINK|ORANGE:LEFT" }, hint: "The helix winds through 8 tiles." },
  { number: 32, name: "Compass", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["RED|ORANGE:DOWN,BLUE:DOWN_LEFT", "BLUE|ORANGE:RIGHT", "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|ORANGE:LEFT", "PURPLE|ORANGE:UP"], solution: { A: "RED|ORANGE:DOWN,BLUE:DOWN_LEFT", B: "BLUE|ORANGE:RIGHT", C: "ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN", D: "GREEN|ORANGE:LEFT", E: "PURPLE|ORANGE:UP" }, hint: "C is a 4-way compass." },
  { number: 33, name: "River", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["RED|GREEN:RIGHT", "GREEN|RED:LEFT", "PURPLE|GREEN:LEFT,BLUE:RIGHT", "BLUE|PURPLE:LEFT", "ORANGE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT", B: "GREEN|RED:LEFT", C: "PURPLE|GREEN:LEFT,BLUE:RIGHT", D: "BLUE|PURPLE:LEFT", E: "ORANGE|BLUE:LEFT" }, hint: "C splits the river." },
  { number: 34, name: "Helix", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B"], ["C", "D"], ["E", null]], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", "BLUE|RED:LEFT", "GREEN|RED:UP", "PURPLE|GREEN:LEFT", "ORANGE|GREEN:UP"], solution: { A: "RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT", B: "BLUE|RED:LEFT", C: "GREEN|RED:UP", D: "PURPLE|GREEN:LEFT", E: "ORANGE|GREEN:UP" }, hint: "A spirals outward with 3 arrows." },
  { number: 35, name: "Nexus", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|BLUE:LEFT", "RED|PURPLE:RIGHT", "PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT", "GREEN|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", C: "GREEN|BLUE:LEFT", D: "RED|PURPLE:RIGHT", E: "PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT", F: "GREEN|PURPLE:LEFT" }, hint: "B and E are twin nexus points!" },
  { number: 36, name: "Galaxy", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT", "BLUE|ORANGE:RIGHT", "ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN", "GREEN|ORANGE:LEFT", "RED|ORANGE:UP"], solution: { A: "PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT", B: "BLUE|ORANGE:RIGHT", C: "ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN", D: "GREEN|ORANGE:LEFT", E: "RED|ORANGE:UP" }, hint: "C is a galaxy core with 4 outputs." },
  { number: 37, name: "Labyrinth", cells: ["A", "B", "C", "D", "E", "F", "G"], layout: [[null, "A", null], ["B", "C", "D"], ["E", "F", "G"]], pieces: ["RED|BLUE:DOWN", "CYAN|BLUE:RIGHT", "BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT", "PURPLE|BLUE:LEFT", "ORANGE|GREEN:RIGHT", "GREEN|ORANGE:LEFT,PINK:RIGHT", "PINK|GREEN:LEFT"], solution: { A: "RED|BLUE:DOWN", B: "CYAN|BLUE:RIGHT", C: "BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT", D: "PURPLE|BLUE:LEFT", E: "ORANGE|GREEN:RIGHT", F: "GREEN|ORANGE:LEFT,PINK:RIGHT", G: "PINK|GREEN:LEFT" }, hint: "C and F are dual hubs." },
  { number: 38, name: "Chromatic Grid", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:LEFT,CYAN:RIGHT", "CYAN|BLUE:LEFT", "RED|ORANGE:RIGHT", "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|ORANGE:LEFT", "YELLOW|PURPLE:RIGHT", "PURPLE|YELLOW:LEFT,PINK:RIGHT", "PINK|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:LEFT,CYAN:RIGHT", C: "CYAN|BLUE:LEFT", D: "RED|ORANGE:RIGHT", E: "ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN", F: "GREEN|ORANGE:LEFT", G: "YELLOW|PURPLE:RIGHT", H: "PURPLE|YELLOW:LEFT,PINK:RIGHT", I: "PINK|PURPLE:LEFT" }, hint: "E has 4 outputs. 9 tiles!" },
  // === CH4: SOURCES & SINKS (31-38) ===
  { number: 39, name: "Source & Sink", cells: ["A", "B"], layout: [["A", "B"]], pieces: ["OUT:RED|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT", B: "IN:RED" }, hint: "SRC (gold) sends arrows out. SINK (blue) is the destination — arrows point INTO it." },
  { number: 40, name: "Relay Station", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["OUT:GREEN|GREEN:RIGHT", "GREEN|RED:RIGHT", "IN:RED"], solution: { A: "OUT:GREEN|GREEN:RIGHT", B: "GREEN|RED:RIGHT", C: "IN:RED" }, hint: "Source→relay→sink. Colors shift at each tile." },
  { number: 41, name: "Broadcaster", cells: ["A", "B", "C"], layout: [["A", "B"], [null, "C"]], pieces: ["OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT", "BLUE|GREEN:DOWN", "IN:GREEN"], solution: { A: "OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT", B: "BLUE|GREEN:DOWN", C: "IN:GREEN" }, hint: "Source sends two signals. Both reach the sink!" },
  { number: 42, name: "Funnel", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["OUT:RED|RED:RIGHT", "RED|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT", B: "RED|BLUE:RIGHT", C: "IN:BLUE" }, hint: "RED→BLUE transformation through the relay." },
  { number: 43, name: "Twin Sinks", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["OUT:RED|GREEN:RIGHT,PURPLE:DOWN", "IN:GREEN", "PURPLE|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|GREEN:RIGHT,PURPLE:DOWN", B: "IN:GREEN", C: "PURPLE|BLUE:RIGHT", D: "IN:BLUE" }, hint: "Source splits to two paths, each ending at a sink." },
  { number: 44, name: "Distribution", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:CYAN|CYAN:DOWN", "ORANGE|CYAN:RIGHT", "CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "IN:GREEN", "IN:PURPLE"], solution: { A: "OUT:CYAN|CYAN:DOWN", B: "ORANGE|CYAN:RIGHT", C: "CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", D: "IN:GREEN", E: "IN:PURPLE" }, hint: "Source feeds C. C distributes to two sinks." },
  { number: 45, name: "Pipeline", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT", B: "RED|GREEN:RIGHT", C: "GREEN|BLUE:RIGHT", D: "BLUE|PURPLE:RIGHT", E: "IN:PURPLE" }, hint: "Long pipeline: each tile shifts the color once." },
  { number: 46, name: "Crossroads", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|BLUE:RIGHT,GREEN:DOWN", "BLUE|PURPLE:RIGHT", "IN:PURPLE", "GREEN|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|BLUE:RIGHT,GREEN:DOWN", B: "BLUE|PURPLE:RIGHT", C: "IN:PURPLE", D: "GREEN|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Two lanes from one source to two sinks." },
  // === CH5: JUMPER ARROWS (39-46) ===
  { number: 47, name: "Leap", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["RED|BLUE:RIGHT:2", "PURPLE|RED:LEFT", "BLUE|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT:2", B: "PURPLE|RED:LEFT", C: "BLUE|PURPLE:LEFT" }, hint: "A jumps OVER B to reach C! Distance-2 arrow." },
  { number: 48, name: "Hop Skip", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|GREEN:RIGHT,BLUE:RIGHT:2", "GREEN|RED:LEFT", "BLUE|GREEN:LEFT", "ORANGE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT,BLUE:RIGHT:2", B: "GREEN|RED:LEFT", C: "BLUE|GREEN:LEFT", D: "ORANGE|BLUE:LEFT" }, hint: "A sends nearby AND jumps. Two distances from one tile." },
  { number: 49, name: "Long Shot", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|BLUE:RIGHT:3", "GREEN|RED:LEFT", "PURPLE|GREEN:LEFT", "BLUE|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT:3", B: "GREEN|RED:LEFT", C: "PURPLE|GREEN:LEFT", D: "BLUE|PURPLE:LEFT" }, hint: "A fires all the way to D — distance 3!" },
  { number: 50, name: "Spectrum", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3", "GREEN|RED:LEFT", "BLUE|GREEN:LEFT", "PURPLE|BLUE:LEFT"], solution: { A: "RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3", B: "GREEN|RED:LEFT", C: "BLUE|GREEN:LEFT", D: "PURPLE|BLUE:LEFT" }, hint: "A sends 3 arrows at distances 1, 2, and 3!" },
  { number: 51, name: "Vault", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["RED|BLUE:DOWN:2", "GREEN|RED:DOWN", "PURPLE|RED:RIGHT", "RED|GREEN:UP,PURPLE:LEFT", "BLUE|PURPLE:RIGHT", "PURPLE|BLUE:LEFT"], solution: { A: "RED|BLUE:DOWN:2", B: "GREEN|RED:DOWN", C: "PURPLE|RED:RIGHT", D: "RED|GREEN:UP,PURPLE:LEFT", E: "BLUE|PURPLE:RIGHT", F: "PURPLE|BLUE:LEFT" }, hint: "A vaults over row 2 to reach row 3!" },
  { number: 52, name: "Sniper", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["OUT:RED|BLUE:RIGHT:3", "GREEN|RED:RIGHT", "RED|GREEN:LEFT", "BLUE|RED:LEFT"], solution: { A: "OUT:RED|BLUE:RIGHT:3", B: "GREEN|RED:RIGHT", C: "RED|GREEN:LEFT", D: "BLUE|RED:LEFT" }, hint: "Source snipes distance 3 to the far end." },
  { number: 53, name: "Catapult", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["OUT:RED|RED:RIGHT,GREEN:RIGHT:3", "RED|BLUE:RIGHT", "BLUE|ORANGE:RIGHT:2", "GREEN|PURPLE:RIGHT", "IN:ORANGE,PURPLE"], solution: { A: "OUT:RED|RED:RIGHT,GREEN:RIGHT:3", B: "RED|BLUE:RIGHT", C: "BLUE|ORANGE:RIGHT:2", D: "GREEN|PURPLE:RIGHT", E: "IN:ORANGE,PURPLE" }, hint: "Source fires short and long. C catapults over D." },
  { number: 54, name: "Vertical Snipe", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|GREEN:RIGHT,BLUE:DOWN:2", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "IN:PURPLE", "CYAN|PURPLE:LEFT,PINK:RIGHT", "PINK|CYAN:LEFT", "BLUE|RED:RIGHT", "RED|CYAN:RIGHT", "IN:CYAN"], solution: { A: "RED|GREEN:RIGHT,BLUE:DOWN:2", B: "GREEN|ORANGE:RIGHT", C: "IN:ORANGE", D: "IN:PURPLE", E: "CYAN|PURPLE:LEFT,PINK:RIGHT", F: "PINK|CYAN:LEFT", G: "BLUE|RED:RIGHT", H: "RED|CYAN:RIGHT", I: "IN:CYAN" }, hint: "A snipes vertically down 2 rows to G!" },
  // === CH6: GAPS (47-54) ===
  { number: 55, name: "Mind the Gap", cells: ["A", "B"], layout: [["A", null, "B"]], pieces: ["RED|BLUE:RIGHT:2", "IN:BLUE"], solution: { A: "RED|BLUE:RIGHT:2", B: "IN:BLUE" }, hint: "A jumps OVER the empty gap to reach the sink!" },
  { number: 56, name: "Canyon", cells: ["A", "B", "C"], layout: [["A", null, null, "B", "C"]], pieces: ["RED|GREEN:RIGHT:3", "GREEN|BLUE:RIGHT", "IN:BLUE"], solution: { A: "RED|GREEN:RIGHT:3", B: "GREEN|BLUE:RIGHT", C: "IN:BLUE" }, hint: "A fires across a 2-cell canyon to reach B!" },
  { number: 57, name: "Bridge Builder", cells: ["A", "B", "C", "D"], layout: [["A", null, "B"], [null, null, null], ["C", null, "D"]], pieces: ["RED|BLUE:RIGHT:2,GREEN:DOWN:2", "BLUE|PURPLE:DOWN:2", "GREEN|ORANGE:RIGHT:2", "IN:ORANGE,PURPLE"], solution: { A: "RED|BLUE:RIGHT:2,GREEN:DOWN:2", B: "BLUE|PURPLE:DOWN:2", C: "GREEN|ORANGE:RIGHT:2", D: "IN:ORANGE,PURPLE" }, hint: "Build signal bridges across a 3×3 grid with only corners filled!" },
  { number: 58, name: "Island Hop", cells: ["A", "B", "C", "D", "E"], layout: [["A", null, "B", null, "C"], [null, null, null, null, null], ["D", null, null, null, "E"]], pieces: ["RED|GREEN:RIGHT:2,BLUE:DOWN:2", "GREEN|ORANGE:RIGHT:2", "IN:ORANGE", "BLUE|CYAN:RIGHT:4", "IN:CYAN"], solution: { A: "RED|GREEN:RIGHT:2,BLUE:DOWN:2", B: "GREEN|ORANGE:RIGHT:2", C: "IN:ORANGE", D: "BLUE|CYAN:RIGHT:4", E: "IN:CYAN" }, hint: "Hop between islands across a sea of gaps!" },
  { number: 59, name: "Gap Cross", cells: ["A", "B", "C", "D"], layout: [["A", "B"], [null, null], ["C", "D"]], pieces: ["OUT:RED|RED:RIGHT,GREEN:DOWN:2", "IN:RED", "GREEN|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT,GREEN:DOWN:2", B: "IN:RED", C: "GREEN|BLUE:RIGHT", D: "IN:BLUE" }, hint: "Source fires right AND vaults the gap to the bottom!" },
  { number: 60, name: "Ravine", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], [null, null, null], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN:2", "RED|GREEN:RIGHT", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN:2", B: "RED|GREEN:RIGHT", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Source bridges the ravine with a distance-2 vertical jump!" },
  { number: 61, name: "Archipelago", cells: ["A", "B", "C", "D", "E", "F", "G"], layout: [["A", null, "B", null, "C"], [null, null, null, null, null], ["D", null, "E", null, "F"], [null, null, null, null, null], [null, null, "G", null, null]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN:2", "RED|GREEN:RIGHT:2", "IN:GREEN", "BLUE|CYAN:RIGHT:2", "CYAN|PINK:RIGHT:2", "IN:PINK", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN:2", B: "RED|GREEN:RIGHT:2", C: "IN:GREEN", D: "BLUE|CYAN:RIGHT:2", E: "CYAN|PINK:RIGHT:2", F: "IN:PINK", G: "IN:PURPLE" }, hint: "7 islands in a sea of gaps! Chain jumps across the archipelago." },
  { number: 62, name: "Grand Chasm", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", null, null, "C", "D"], [null, null, null, null, null, null], ["E", "F", null, null, "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN:2", "RED|GREEN:RIGHT:3", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT", "CYAN|PINK:RIGHT:3", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN:2", B: "RED|GREEN:RIGHT:3", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "CYAN|PINK:RIGHT:3", G: "PINK|RED:RIGHT", H: "IN:RED" }, hint: "8 tiles on 2 platforms separated by a grand chasm!" },
  // === CH7: ADVANCED COMBOS (55-62) ===
  { number: 63, name: "Network", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|BLUE:RIGHT,GREEN:DOWN", "BLUE|PURPLE:RIGHT", "IN:PURPLE", "GREEN|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|BLUE:RIGHT,GREEN:DOWN", B: "BLUE|PURPLE:RIGHT", C: "IN:PURPLE", D: "GREEN|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Two pipelines from one source to two sinks." },
  { number: 64, name: "Jump Hub", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:ORANGE|ORANGE:DOWN", "RED|ORANGE:RIGHT", "ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", "IN:GREEN", "IN:BLUE"], solution: { A: "OUT:ORANGE|ORANGE:DOWN", B: "RED|ORANGE:RIGHT", C: "ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN", D: "IN:GREEN", E: "IN:BLUE" }, hint: "Source feeds the central hub. Hub distributes to sinks." },
  { number: 65, name: "Skip Chain", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D", "E"]], pieces: ["RED|GREEN:RIGHT:2", "BLUE|RED:LEFT", "GREEN|BLUE:RIGHT:2", "PURPLE|GREEN:LEFT", "IN:BLUE"], solution: { A: "RED|GREEN:RIGHT:2", B: "BLUE|RED:LEFT", C: "GREEN|BLUE:RIGHT:2", D: "PURPLE|GREEN:LEFT", E: "IN:BLUE" }, hint: "Two distance-2 jumps form a skip chain!" },
  { number: 66, name: "Triple Strike", cells: ["A", "B", "C", "D"], layout: [[null, "A", null], ["B", "C", "D"]], pieces: ["OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT", "IN:GREEN", "IN:BLUE", "IN:PURPLE"], solution: { A: "OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT", B: "IN:GREEN", C: "IN:BLUE", D: "IN:PURPLE" }, hint: "Source fires 3 arrows: diagonal, down, diagonal!" },
  { number: 67, name: "Leapfrog", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C", "D", "E", "F"]], pieces: ["RED|GREEN:RIGHT:2", "ORANGE|RED:LEFT", "GREEN|BLUE:RIGHT:2", "PURPLE|GREEN:LEFT", "BLUE|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "RED|GREEN:RIGHT:2", B: "ORANGE|RED:LEFT", C: "GREEN|BLUE:RIGHT:2", D: "PURPLE|GREEN:LEFT", E: "BLUE|PURPLE:RIGHT", F: "IN:PURPLE" }, hint: "Leapfrog: A→C, C→E, E walks to the sink." },
  { number: 68, name: "Reverse Flow", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C", "D"], ["E", null, null, null]], pieces: ["IN:RED", "RED|GREEN:RIGHT,BLUE:DOWN", "GREEN|RED:LEFT", "OUT:BLUE|RED:LEFT:3", "BLUE|RED:UP"], solution: { A: "RED|GREEN:RIGHT,BLUE:DOWN", B: "GREEN|RED:LEFT", C: "IN:RED", D: "OUT:BLUE|RED:LEFT:3", E: "BLUE|RED:UP" }, hint: "Source fires BACKWARD with a distance-3 shot!" },
  { number: 69, name: "Pincer", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:RED|RED:DOWN", "IN:BLUE", "RED|BLUE:LEFT,GREEN:RIGHT", "IN:GREEN", "OUT:CYAN|RED:UP"], solution: { A: "OUT:RED|RED:DOWN", B: "IN:BLUE", C: "RED|BLUE:LEFT,GREEN:RIGHT", D: "IN:GREEN", E: "OUT:CYAN|RED:UP" }, hint: "Two sources pinch the center. Hub feeds two sinks." },
  { number: 70, name: "Gap Leap", cells: ["A", "B", "C", "D"], layout: [["A", null, "B"], ["C", null, "D"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "IN:RED", "BLUE|GREEN:RIGHT:2", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "IN:RED", C: "BLUE|GREEN:RIGHT:2", D: "IN:GREEN" }, hint: "Jump gaps on two different rows!" },
  // === CH7: EXPERT (55-60) ===
  { number: 71, name: "Grand Pipeline", cells: ["A", "B", "C", "D", "E", "F", "G"], layout: [["A", "B", "C", "D", "E", "F", "G"]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "PURPLE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT", B: "RED|GREEN:RIGHT", C: "GREEN|BLUE:RIGHT", D: "BLUE|PURPLE:RIGHT", E: "PURPLE|ORANGE:RIGHT", F: "ORANGE|CYAN:RIGHT", G: "IN:CYAN" }, hint: "7 tiles, 6 color shifts. The longest pipeline!" },
  { number: 72, name: "Star Burst", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|BLUE:RIGHT", "BLUE|RED:DOWN", "PINK|BLUE:LEFT", "ORANGE|RED:RIGHT", "RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", "GREEN|RED:LEFT", "CYAN|ORANGE:UP", "PURPLE|RED:UP", "YELLOW|PURPLE:LEFT"], solution: { A: "RED|BLUE:RIGHT", B: "BLUE|RED:DOWN", C: "PINK|BLUE:LEFT", D: "ORANGE|RED:RIGHT", E: "RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN", F: "GREEN|RED:LEFT", G: "CYAN|ORANGE:UP", H: "PURPLE|RED:UP", I: "YELLOW|PURPLE:LEFT" }, hint: "E is a 4-output star in a 3x3 grid!" },
  { number: 73, name: "Highway", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "GREEN|ORANGE:RIGHT,PURPLE:DOWN", "IN:ORANGE", "BLUE|CYAN:RIGHT", "CYAN|BLUE:LEFT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "GREEN|ORANGE:RIGHT,PURPLE:DOWN", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "CYAN|BLUE:LEFT", G: "PURPLE|PINK:RIGHT", H: "IN:PINK" }, hint: "Two highway lanes with exits and sinks." },
  { number: 74, name: "Sniper Nest", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2", "GREEN|RED:LEFT,GREEN:RIGHT", "IN:GREEN", "BLUE|GREEN:RIGHT", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "PURPLE|CYAN:RIGHT", "CYAN|PINK:RIGHT", "IN:PINK"], solution: { A: "RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2", B: "GREEN|RED:LEFT,GREEN:RIGHT", C: "IN:GREEN", D: "BLUE|GREEN:RIGHT", E: "GREEN|ORANGE:RIGHT", F: "IN:ORANGE", G: "PURPLE|CYAN:RIGHT", H: "CYAN|PINK:RIGHT", I: "IN:PINK" }, hint: "A fires 3 levels deep including a distance-2 snipe!" },
  { number: 75, name: "Grand Gap Cross", cells: ["A", "B", "C", "D", "E"], layout: [[null, null, "A", null, null], [null, null, null, null, null], ["B", null, "C", null, "D"], [null, null, null, null, null], [null, null, "E", null, null]], pieces: ["IN:RED", "IN:BLUE", "OUT:PURPLE|RED:UP:2,BLUE:LEFT:2,GREEN:RIGHT:2,ORANGE:DOWN:2", "IN:GREEN", "IN:ORANGE"], solution: { A: "IN:RED", B: "IN:BLUE", C: "OUT:PURPLE|RED:UP:2,BLUE:LEFT:2,GREEN:RIGHT:2,ORANGE:DOWN:2", D: "IN:GREEN", E: "IN:ORANGE" }, hint: "A grand cross spanning distance-2 gaps in all directions!" },
  { number: 76, name: "Prism Core", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "GREEN|ORANGE:RIGHT,PURPLE:DOWN", "IN:ORANGE", "BLUE|CYAN:RIGHT,RED:DOWN", "CYAN|BLUE:LEFT", "PURPLE|PINK:RIGHT", "PINK|PURPLE:LEFT", "RED|YELLOW:RIGHT", "YELLOW|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "GREEN|ORANGE:RIGHT,PURPLE:DOWN", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT,RED:DOWN", F: "CYAN|BLUE:LEFT", G: "PURPLE|PINK:RIGHT", H: "PINK|PURPLE:LEFT", I: "RED|YELLOW:RIGHT", J: "YELLOW|BLUE:RIGHT", K: "BLUE|GREEN:RIGHT", L: "IN:GREEN" }, hint: "12 tiles, 3 connected rows. The nexus!" },
  // === CHAPTER 8: PIPES (61-70) ===
  { number: 77, name: "First Pipe", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "IN:BLUE"], solution: { A: "RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "IN:BLUE" }, hint: "The pipe transforms RED into BLUE! New tile type." },
  { number: 78, name: "Pipe Relay", cells: ["A", "B", "C"], layout: [["A", "B", "C"]], pieces: ["OUT:RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN" }, hint: "Source → pipe → sink. The pipe changes the color." },
  { number: 79, name: "Double Transform", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "PIPE:LEFT:BLUE>RIGHT:GREEN", "IN:GREEN"], solution: { A: "RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "PIPE:LEFT:BLUE>RIGHT:GREEN", D: "IN:GREEN" }, hint: "Two pipes chain: RED→BLUE→GREEN." },
  { number: 80, name: "Pipe or Normal?", cells: ["A", "B", "C", "D"], layout: [["A", "B", "C", "D"]], pieces: ["OUT:RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "BLUE|GREEN:RIGHT", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "BLUE|GREEN:RIGHT", D: "IN:GREEN" }, hint: "Mix of pipe and normal tile. Which goes where?" },
  { number: 81, name: "Pipe Bend", cells: ["A", "B", "C"], layout: [["A", "B"], [null, "C"]], pieces: ["RED|RED:RIGHT", "PIPE:LEFT:RED>DOWN:BLUE", "IN:BLUE"], solution: { A: "RED|RED:RIGHT", B: "PIPE:LEFT:RED>DOWN:BLUE", C: "IN:BLUE" }, hint: "This pipe bends — enters left, exits downward." },
  { number: 82, name: "Cross Pipe", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["RED|RED:DOWN", "BLUE|BLUE:RIGHT", "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", "IN:PURPLE", "IN:GREEN"], solution: { A: "RED|RED:DOWN", B: "BLUE|BLUE:RIGHT", C: "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", D: "IN:PURPLE", E: "IN:GREEN" }, hint: "Cross pipe has TWO channels! Signals pass through independently." },
  { number: 83, name: "Pipe Fork", cells: ["A", "B", "C", "D"], layout: [["A", "B"], ["C", "D"]], pieces: ["RED|RED:RIGHT,GREEN:DOWN", "PIPE:LEFT:RED>DOWN:BLUE", "GREEN|PURPLE:RIGHT", "IN:BLUE,PURPLE"], solution: { A: "RED|RED:RIGHT,GREEN:DOWN", B: "PIPE:LEFT:RED>DOWN:BLUE", C: "GREEN|PURPLE:RIGHT", D: "IN:BLUE,PURPLE" }, hint: "A sends two signals. One goes through the pipe." },
  { number: 84, name: "Pipe Vault", cells: ["A", "B", "C"], layout: [["A", null, "B", "C"]], pieces: ["OUT:RED|RED:RIGHT:2", "PIPE:LEFT:RED>RIGHT:BLUE", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT:2", B: "PIPE:LEFT:RED>RIGHT:BLUE", C: "IN:BLUE" }, hint: "Jump the gap straight into the pipe!" },
  { number: 85, name: "L-Pipe Chain", cells: ["A", "B", "C", "D"], layout: [["A", "B"], [null, "C"], [null, "D"]], pieces: ["OUT:RED|RED:RIGHT", "PIPE:LEFT:RED>DOWN:BLUE", "PIPE:UP:BLUE>DOWN:GREEN", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT", B: "PIPE:LEFT:RED>DOWN:BLUE", C: "PIPE:UP:BLUE>DOWN:GREEN", D: "IN:GREEN" }, hint: "Two bending pipes form an L-shaped path." },
  { number: 86, name: "Pipe Star", cells: ["A", "B", "C", "D", "E"], layout: [[null, "A", null], ["B", "C", "D"], [null, "E", null]], pieces: ["OUT:RED|RED:DOWN", "OUT:BLUE|BLUE:RIGHT", "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", "IN:PURPLE", "IN:GREEN"], solution: { A: "OUT:RED|RED:DOWN", B: "OUT:BLUE|BLUE:RIGHT", C: "PIPE:UP:RED>DOWN:GREEN,LEFT:BLUE>RIGHT:PURPLE", D: "IN:PURPLE", E: "IN:GREEN" }, hint: "Two sources feed a cross pipe. Two sinks absorb." },
  // === CHAPTER 9: MASTER (71-80) ===
  { number: 87, name: "Pipe Cascade", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT,RED:DOWN", "CYAN|YELLOW:RIGHT", "YELLOW|PINK:RIGHT", "IN:PINK", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT,RED:DOWN", F: "CYAN|YELLOW:RIGHT", G: "YELLOW|PINK:RIGHT", H: "IN:PINK", I: "RED|GREEN:RIGHT", J: "GREEN|BLUE:RIGHT", K: "BLUE|PURPLE:RIGHT", L: "IN:PURPLE" }, hint: "12 tiles with pipe transforming colors across 3 connected lanes!" },
  { number: 88, name: "Transform Junction", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "One pipe lane + one normal lane from a single source!" },
  { number: 89, name: "Sniper Pipes", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "PURPLE|RED:RIGHT", "PIPE:LEFT:RED>DOWN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:GREEN,PURPLE"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "PURPLE|RED:RIGHT", C: "PIPE:LEFT:RED>DOWN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|PURPLE:RIGHT", F: "IN:GREEN,PURPLE" }, hint: "Distance-2 snipe feeds a bending pipe!" },
  { number: 90, name: "Pipe Matrix", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:DOWN", "BLUE|CYAN:RIGHT,PURPLE:DOWN", "CYAN|PINK:RIGHT", "IN:ORANGE,PINK", "PURPLE|YELLOW:RIGHT", "YELLOW|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:DOWN", D: "BLUE|CYAN:RIGHT,PURPLE:DOWN", E: "CYAN|PINK:RIGHT", F: "IN:ORANGE,PINK", G: "PURPLE|YELLOW:RIGHT", H: "YELLOW|RED:RIGHT", I: "IN:RED" }, hint: "3x3 grid with pipe + vertical flow!" },
  { number: 91, name: "Gap Over Pipe", cells: ["A", "B", "C", "D", "E"], layout: [["A", "B", "C"], ["D", null, "E"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT:2", "IN:ORANGE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT:2", E: "IN:ORANGE" }, hint: "Normal flow up top, but the bottom row jumps a gap!" },
  { number: 92, name: "Grand Transformer", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "PIPE:LEFT:ORANGE>RIGHT:PURPLE", "IN:PURPLE", "BLUE|CYAN:RIGHT", "PIPE:LEFT:CYAN>RIGHT:PINK", "PINK|YELLOW:RIGHT", "YELLOW|GREEN:RIGHT", "IN:GREEN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "PIPE:LEFT:ORANGE>RIGHT:PURPLE", E: "IN:PURPLE", F: "BLUE|CYAN:RIGHT", G: "PIPE:LEFT:CYAN>RIGHT:PINK", H: "PINK|YELLOW:RIGHT", I: "YELLOW|GREEN:RIGHT", J: "IN:GREEN" }, hint: "10 tiles! 3 pipes create a transformation chain!" },
  { number: 93, name: "Pipe Nexus", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["OUT:RED|RED:DOWN,BLUE:RIGHT", "BLUE|GREEN:DOWN,PINK:RIGHT", "IN:PINK", "RED|CYAN:RIGHT", "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:PURPLE", "IN:ORANGE", "IN:YELLOW", "PURPLE|YELLOW:LEFT,RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:DOWN,BLUE:RIGHT", B: "BLUE|GREEN:DOWN,PINK:RIGHT", C: "IN:PINK", D: "RED|CYAN:RIGHT", E: "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:PURPLE", F: "IN:ORANGE", G: "IN:YELLOW", H: "PURPLE|YELLOW:LEFT,RED:RIGHT", I: "IN:RED" }, hint: "Cross pipe in the center routes signals vertically and horizontally!" },
  { number: 94, name: "Chromatic Forge", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,GREEN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|CYAN:RIGHT", "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:YELLOW", "ORANGE|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED", "IN:BLUE", "YELLOW|RED:RIGHT", "RED|BLUE:RIGHT", "BLUE|ORANGE:RIGHT", "IN:ORANGE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,GREEN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|CYAN:RIGHT", G: "PIPE:UP:GREEN>RIGHT:ORANGE,LEFT:CYAN>DOWN:YELLOW", H: "ORANGE|PINK:RIGHT", I: "PINK|RED:RIGHT", J: "IN:RED", K: "IN:BLUE", L: "YELLOW|RED:RIGHT", M: "RED|BLUE:RIGHT", N: "BLUE|ORANGE:RIGHT", O: "IN:ORANGE" }, hint: "15 tiles! Cross-pipe nexus connects all 3 lanes." },
  { number: 95, name: "Ultimate Synthesis", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"], ["M", "N", "O", "P"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT,YELLOW:DOWN", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", "PURPLE|BLUE:RIGHT", "IN:BLUE", "YELLOW|GREEN:DOWN", "RED|CYAN:RIGHT", "CYAN|YELLOW:RIGHT", "IN:YELLOW", "GREEN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT,YELLOW:DOWN", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", G: "PURPLE|BLUE:RIGHT", H: "IN:BLUE", I: "YELLOW|GREEN:DOWN", J: "RED|CYAN:RIGHT", K: "CYAN|YELLOW:RIGHT", L: "IN:YELLOW", M: "GREEN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "PINK|RED:RIGHT", P: "IN:RED" }, hint: "16 tiles! Cross-pipe nexus connects rows 0-3!" },
  { number: 96, name: "Radiant Summit", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"], layout: [["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "PIPE:LEFT:GREEN>RIGHT:ORANGE", "ORANGE|PURPLE:RIGHT", "PURPLE|CYAN:RIGHT", "IN:CYAN", "BLUE|PINK:RIGHT,YELLOW:DOWN", "PINK|RED:RIGHT", "RED|BLUE:RIGHT", "BLUE|YELLOW:RIGHT", "YELLOW|GREEN:RIGHT", "IN:GREEN", "YELLOW|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PIPE:LEFT:PURPLE>RIGHT:PINK", "PINK|ORANGE:RIGHT", "ORANGE|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "PIPE:LEFT:GREEN>RIGHT:ORANGE", D: "ORANGE|PURPLE:RIGHT", E: "PURPLE|CYAN:RIGHT", F: "IN:CYAN", G: "BLUE|PINK:RIGHT,YELLOW:DOWN", H: "PINK|RED:RIGHT", I: "RED|BLUE:RIGHT", J: "BLUE|YELLOW:RIGHT", K: "YELLOW|GREEN:RIGHT", L: "IN:GREEN", M: "YELLOW|CYAN:RIGHT", N: "CYAN|PURPLE:RIGHT", O: "PIPE:LEFT:PURPLE>RIGHT:PINK", P: "PINK|ORANGE:RIGHT", Q: "ORANGE|RED:RIGHT", R: "IN:RED" }, hint: "18 tiles! The ultimate challenge with pipes across 3 lanes!" },
  // === CHAPTER 10: MASTER II (81-100) ===
  { number: 97, name: "Pipe Flow", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B", "C"], ["D", "E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Pipe transforms red to green in a 2-lane flow." },
  { number: 98, name: "Cross Bend", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["OUT:RED|RED:DOWN,BLUE:RIGHT", "BLUE|GREEN:DOWN", "RED|ORANGE:RIGHT", "PIPE:UP:GREEN>DOWN:CYAN,LEFT:ORANGE>DOWN_LEFT:PURPLE", "IN:PURPLE", "IN:CYAN"], solution: { A: "OUT:RED|RED:DOWN,BLUE:RIGHT", B: "BLUE|GREEN:DOWN", C: "RED|ORANGE:RIGHT", D: "PIPE:UP:GREEN>DOWN:CYAN,LEFT:ORANGE>DOWN_LEFT:PURPLE", E: "IN:PURPLE", F: "IN:CYAN" }, hint: "Cross-pipe routes signals in a vertical flow!" },
  { number: 99, name: "Vertical Flow", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "IN:RED", "BLUE|GREEN:RIGHT,ORANGE:DOWN", "IN:GREEN", "ORANGE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "IN:RED", C: "BLUE|GREEN:RIGHT,ORANGE:DOWN", D: "IN:GREEN", E: "ORANGE|CYAN:RIGHT", F: "IN:CYAN" }, hint: "Three rows linked by vertical arrows!" },
  { number: 100, name: "Triple Lane", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", "B"], ["C", "D"], ["E", "F"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "IN:RED", "BLUE|GREEN:RIGHT,CYAN:DOWN", "IN:GREEN", "CYAN|PURPLE:RIGHT", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "IN:RED", C: "BLUE|GREEN:RIGHT,CYAN:DOWN", D: "IN:GREEN", E: "CYAN|PURPLE:RIGHT", F: "IN:PURPLE" }, hint: "3 parallel lanes from multi-output source!" },
  { number: 101, name: "Pipe Junction", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "CYAN|PURPLE:RIGHT", G: "PURPLE|PINK:RIGHT", H: "IN:PINK" }, hint: "Pipe + sink + multi-output!" },
  { number: 102, name: "Dual Pipe", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT", "PIPE:LEFT:CYAN>RIGHT:PURPLE", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT", F: "PIPE:LEFT:CYAN>RIGHT:PURPLE", G: "PURPLE|PINK:RIGHT", H: "IN:PINK" }, hint: "Two pipes in parallel lanes!" },
  { number: 103, name: "Gap Bypass", cells: ["A", "B", "C", "D", "E", "F"], layout: [["A", null, "B", "C"], ["D", "E", null, "F"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT:2", "IN:PURPLE"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT", E: "ORANGE|PURPLE:RIGHT:2", F: "IN:PURPLE" }, hint: "Both lanes feature a gap jump!" },
  { number: 104, name: "Long Pipeline", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "PIPE:LEFT:GREEN>RIGHT:ORANGE", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|CYAN:RIGHT", "CYAN|YELLOW:RIGHT", "YELLOW|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "PIPE:LEFT:GREEN>RIGHT:ORANGE", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|CYAN:RIGHT", G: "CYAN|YELLOW:RIGHT", H: "YELLOW|PINK:RIGHT", I: "PINK|RED:RIGHT", J: "IN:RED" }, hint: "5-tile lane with pipe transformation!" },
  { number: 105, name: "Pipe Waterfall", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], layout: [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|CYAN:RIGHT,PURPLE:DOWN", "CYAN|ORANGE:RIGHT", "IN:ORANGE", "PURPLE|YELLOW:RIGHT", "YELLOW|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|CYAN:RIGHT,PURPLE:DOWN", E: "CYAN|ORANGE:RIGHT", F: "IN:ORANGE", G: "PURPLE|YELLOW:RIGHT", H: "YELLOW|PINK:RIGHT", I: "IN:PINK" }, hint: "3 rows linked by multi-output + pipe!" },
  { number: 106, name: "Dual Cross", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", "PURPLE|RED:RIGHT", "IN:RED", "IN:GREEN", "YELLOW|GREEN:LEFT,BLUE:RIGHT", "BLUE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", G: "PURPLE|RED:RIGHT", H: "IN:RED", I: "IN:GREEN", J: "YELLOW|GREEN:LEFT,BLUE:RIGHT", K: "BLUE|CYAN:RIGHT", L: "IN:CYAN" }, hint: "Cross-pipe nexus in a 4x3 grid!" },
  { number: 107, name: "Signal Hub", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|CYAN:RIGHT,PINK:DOWN", "CYAN|YELLOW:RIGHT", "YELLOW|PURPLE:RIGHT", "IN:PURPLE", "PINK|ORANGE:RIGHT", "ORANGE|BLUE:RIGHT", "BLUE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|CYAN:RIGHT,PINK:DOWN", F: "CYAN|YELLOW:RIGHT", G: "YELLOW|PURPLE:RIGHT", H: "IN:PURPLE", I: "PINK|ORANGE:RIGHT", J: "ORANGE|BLUE:RIGHT", K: "BLUE|CYAN:RIGHT", L: "IN:CYAN" }, hint: "12 tiles, 3 lanes with unique color chains!" },
  { number: 108, name: "Pipe Cascade II", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", "PURPLE|RED:RIGHT", "IN:RED", "IN:GREEN", "YELLOW|GREEN:LEFT,BLUE:RIGHT", "BLUE|CYAN:RIGHT", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", G: "PURPLE|RED:RIGHT", H: "IN:RED", I: "IN:GREEN", J: "YELLOW|GREEN:LEFT,BLUE:RIGHT", K: "BLUE|CYAN:RIGHT", L: "IN:CYAN" }, hint: "12 tiles with cross-pipe nexus!" },
  { number: 109, name: "Triple Transform", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,ORANGE:DOWN", "GREEN|CYAN:RIGHT", "IN:CYAN", "BLUE|PINK:RIGHT", "PIPE:UP:ORANGE>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", "PURPLE|RED:RIGHT", "IN:RED", "IN:GREEN", "YELLOW|GREEN:LEFT,BLUE:RIGHT", "BLUE|ORANGE:RIGHT", "IN:ORANGE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,ORANGE:DOWN", C: "GREEN|CYAN:RIGHT", D: "IN:CYAN", E: "BLUE|PINK:RIGHT", F: "PIPE:UP:ORANGE>RIGHT:PURPLE,LEFT:PINK>DOWN:YELLOW", G: "PURPLE|RED:RIGHT", H: "IN:RED", I: "IN:GREEN", J: "YELLOW|GREEN:LEFT,BLUE:RIGHT", K: "BLUE|ORANGE:RIGHT", L: "IN:ORANGE" }, hint: "12 tiles with pipe + cross-pipe!" },
  { number: 110, name: "Grand Nexus", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"], layout: [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"], ["M", "N", "O", "P"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "BLUE|PINK:RIGHT,YELLOW:DOWN", "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", "PURPLE|BLUE:RIGHT", "IN:BLUE", "YELLOW|GREEN:DOWN", "RED|CYAN:RIGHT", "CYAN|YELLOW:RIGHT", "IN:YELLOW", "GREEN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "PINK|RED:RIGHT", "IN:RED"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "IN:ORANGE", E: "BLUE|PINK:RIGHT,YELLOW:DOWN", F: "PIPE:UP:CYAN>RIGHT:PURPLE,LEFT:PINK>DOWN:RED", G: "PURPLE|BLUE:RIGHT", H: "IN:BLUE", I: "YELLOW|GREEN:DOWN", J: "RED|CYAN:RIGHT", K: "CYAN|YELLOW:RIGHT", L: "IN:YELLOW", M: "GREEN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "PINK|RED:RIGHT", P: "IN:RED" }, hint: "16 tiles with cross-pipe nexus!" },
  { number: 111, name: "Pipe Fortress", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,ORANGE:DOWN", "GREEN|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "IN:PURPLE", "BLUE|PINK:RIGHT", "PIPE:UP:ORANGE>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", "YELLOW|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "IN:GREEN", "IN:CYAN", "RED|CYAN:LEFT,ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,ORANGE:DOWN", C: "GREEN|CYAN:RIGHT", D: "CYAN|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|PINK:RIGHT", G: "PIPE:UP:ORANGE>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", H: "YELLOW|BLUE:RIGHT", I: "BLUE|GREEN:RIGHT", J: "IN:GREEN", K: "IN:CYAN", L: "RED|CYAN:LEFT,ORANGE:RIGHT", M: "ORANGE|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "IN:PINK" }, hint: "15 tiles with cross-pipe nexus!" },
  { number: 112, name: "Master Flow", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", "YELLOW|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "IN:GREEN", "IN:ORANGE", "RED|ORANGE:LEFT,CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|PINK:RIGHT", G: "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", H: "YELLOW|BLUE:RIGHT", I: "BLUE|GREEN:RIGHT", J: "IN:GREEN", K: "IN:ORANGE", L: "RED|ORANGE:LEFT,CYAN:RIGHT", M: "CYAN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "IN:PINK" }, hint: "15 tiles with cross-pipe nexus!" },
  { number: 113, name: "Dual Transform", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"], layout: [["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "IN:PURPLE", "BLUE|PINK:RIGHT", "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", "YELLOW|BLUE:RIGHT", "PIPE:LEFT:BLUE>RIGHT:GREEN", "IN:GREEN", "IN:ORANGE", "RED|ORANGE:LEFT,CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "IN:PURPLE", F: "BLUE|PINK:RIGHT", G: "PIPE:UP:CYAN>RIGHT:YELLOW,LEFT:PINK>DOWN:RED", H: "YELLOW|BLUE:RIGHT", I: "PIPE:LEFT:BLUE>RIGHT:GREEN", J: "IN:GREEN", K: "IN:ORANGE", L: "RED|ORANGE:LEFT,CYAN:RIGHT", M: "CYAN|PURPLE:RIGHT", N: "PURPLE|PINK:RIGHT", O: "IN:PINK" }, hint: "15 tiles with pipe + cross-pipe!" },
  { number: 114, name: "Mega Gap Grid", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["A", null, "B", "C"], ["D", "E", null, "F"], [null, "G", null, "H"]], pieces: ["OUT:RED|RED:RIGHT:2,BLUE:DOWN", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN", "BLUE|ORANGE:RIGHT,PURPLE:DOWN_RIGHT", "ORANGE|PINK:RIGHT:2", "IN:PINK", "PURPLE|CYAN:RIGHT:2", "IN:CYAN"], solution: { A: "OUT:RED|RED:RIGHT:2,BLUE:DOWN", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN", D: "BLUE|ORANGE:RIGHT,PURPLE:DOWN_RIGHT", E: "ORANGE|PINK:RIGHT:2", F: "IN:PINK", G: "PURPLE|CYAN:RIGHT:2", H: "IN:CYAN" }, hint: "Three lanes with pipes, diagonals, and distance-2 gap jumps!" },
  { number: 115, name: "Chromatic Master", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"], layout: [["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,CYAN:DOWN", "GREEN|ORANGE:RIGHT", "ORANGE|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK", "BLUE|YELLOW:RIGHT", "PIPE:UP:CYAN>RIGHT:RED,LEFT:YELLOW>DOWN:ORANGE", "RED|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "GREEN|CYAN:RIGHT", "IN:CYAN", "IN:PURPLE", "ORANGE|PURPLE:LEFT,PINK:RIGHT", "PINK|RED:RIGHT", "RED|YELLOW:RIGHT", "YELLOW|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,CYAN:DOWN", C: "GREEN|ORANGE:RIGHT", D: "ORANGE|PURPLE:RIGHT", E: "PURPLE|PINK:RIGHT", F: "IN:PINK", G: "BLUE|YELLOW:RIGHT", H: "PIPE:UP:CYAN>RIGHT:RED,LEFT:YELLOW>DOWN:ORANGE", I: "RED|BLUE:RIGHT", J: "BLUE|GREEN:RIGHT", K: "GREEN|CYAN:RIGHT", L: "IN:CYAN", M: "IN:PURPLE", N: "ORANGE|PURPLE:LEFT,PINK:RIGHT", O: "PINK|RED:RIGHT", P: "RED|YELLOW:RIGHT", Q: "YELLOW|BLUE:RIGHT", R: "IN:BLUE" }, hint: "18 tiles, ultimate pipe challenge!" },
  { number: 116, name: "Endless Lattice", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"], layout: [["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"]], pieces: ["OUT:RED|RED:RIGHT,BLUE:DOWN", "RED|GREEN:RIGHT,ORANGE:DOWN", "GREEN|CYAN:RIGHT", "CYAN|PURPLE:RIGHT", "PURPLE|PINK:RIGHT", "IN:PINK", "BLUE|YELLOW:RIGHT", "PIPE:UP:ORANGE>RIGHT:RED,LEFT:YELLOW>DOWN:CYAN", "RED|BLUE:RIGHT", "BLUE|GREEN:RIGHT", "GREEN|ORANGE:RIGHT", "IN:ORANGE", "IN:PURPLE", "CYAN|PURPLE:LEFT,PINK:RIGHT", "PINK|RED:RIGHT", "RED|YELLOW:RIGHT", "YELLOW|BLUE:RIGHT", "IN:BLUE"], solution: { A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "RED|GREEN:RIGHT,ORANGE:DOWN", C: "GREEN|CYAN:RIGHT", D: "CYAN|PURPLE:RIGHT", E: "PURPLE|PINK:RIGHT", F: "IN:PINK", G: "BLUE|YELLOW:RIGHT", H: "PIPE:UP:ORANGE>RIGHT:RED,LEFT:YELLOW>DOWN:CYAN", I: "RED|BLUE:RIGHT", J: "BLUE|GREEN:RIGHT", K: "GREEN|ORANGE:RIGHT", L: "IN:ORANGE", M: "IN:PURPLE", N: "CYAN|PURPLE:LEFT,PINK:RIGHT", O: "PINK|RED:RIGHT", P: "RED|YELLOW:RIGHT", Q: "YELLOW|BLUE:RIGHT", R: "IN:BLUE" }, hint: "18 tiles! Cross-pipe + multi-output finale!" },
  { number: 117, name: "Logic Gate", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, "H", null, null], [null, "G", null, "A"], ["D", null, "C", "B"], ["E", "F", null, null]], pieces: ["OUT:RED|PURPLE:DOWN", "PURPLE|RED:LEFT", "RED|BLUE:LEFT:2", "TRIGGER:BLUE:E|YELLOW:DOWN", "YELLOW|PURPLE:RIGHT", "PURPLE|BLUE:UP:2", "BLUE|RED:UP", "IN:RED"], solution: { "A": "OUT:RED|PURPLE:DOWN", "B": "PURPLE|RED:LEFT", "C": "RED|BLUE:LEFT:2", "D": "TRIGGER:BLUE:E|YELLOW:DOWN", "E": "YELLOW|PURPLE:RIGHT", "F": "PURPLE|BLUE:UP:2", "G": "BLUE|RED:UP", "H": "IN:RED" }, hint: "The trigger at D locks cell E — feed it BLUE to unlock!" },
  { number: 118, name: "Signal Relay", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["F", "E", null, "D"], ["G", null, null, "C"], [null, null, null, null], ["H", null, "A", "B"]], pieces: ["OUT:RED|PINK:RIGHT", "PINK|RED:UP:2", "RED|GREEN:UP", "GREEN|CYAN:LEFT:2", "TRIGGER:CYAN:F|ORANGE:LEFT", "PIPE:RIGHT:ORANGE>DOWN:BLUE", "BLUE|GREEN:DOWN:2", "IN:GREEN"], solution: { "A": "OUT:RED|PINK:RIGHT", "B": "PINK|RED:UP:2", "C": "RED|GREEN:UP", "D": "GREEN|CYAN:LEFT:2", "E": "TRIGGER:CYAN:F|ORANGE:LEFT", "F": "PIPE:RIGHT:ORANGE>DOWN:BLUE", "G": "BLUE|GREEN:DOWN:2", "H": "IN:GREEN" }, hint: "The trigger at E locks cell F — relay CYAN to unlock the pipe!" },
  { number: 119, name: "Decision Tree", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, "D", null, "E", "F"], [null, "C", null, "H", "G"], [null, null, null, null, null], ["A", "B", null, null, null]], pieces: ["OUT:RED|BLUE:RIGHT", "BLUE|RED:UP:2", "RED|GREEN:UP", "GREEN|CYAN:RIGHT:2", "PIPE:LEFT:CYAN>RIGHT:YELLOW", "TRIGGER:YELLOW:G|BLUE:DOWN", "TRIGGER:BLUE:C|PINK:LEFT", "IN:PINK"], solution: { "A": "OUT:RED|BLUE:RIGHT", "B": "BLUE|RED:UP:2", "C": "RED|GREEN:UP", "D": "GREEN|CYAN:RIGHT:2", "E": "PIPE:LEFT:CYAN>RIGHT:YELLOW", "F": "TRIGGER:YELLOW:G|BLUE:DOWN", "G": "TRIGGER:BLUE:C|PINK:LEFT", "H": "IN:PINK" }, hint: "Chain triggers! F locks G, and G locks C — satisfy them in order." },
  { number: 120, name: "Packet Switch", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, null, null, "H", "G"], [null, null, null, null, "F"], [null, null, null, null, "E"], ["A", "B", "C", null, "D"]], pieces: ["OUT:RED|RED:RIGHT", "RED|PURPLE:RIGHT", "PURPLE|RED:RIGHT:2", "TRIGGER:RED:F|GREEN:UP", "GREEN|BLUE:UP", "BLUE|RED:UP", "RED|GREEN:LEFT", "IN:GREEN"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|PURPLE:RIGHT", "C": "PURPLE|RED:RIGHT:2", "D": "TRIGGER:RED:F|GREEN:UP", "E": "GREEN|BLUE:UP", "F": "BLUE|RED:UP", "G": "RED|GREEN:LEFT", "H": "IN:GREEN" }, hint: "The trigger at D locks F — the packet must switch through before climbing!" },
  { number: 121, name: "Traffic Controller", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[null, null, null, "H"], ["E", "F", null, "G"], ["D", "C", "B", "A"]], pieces: ["OUT:RED|CYAN:LEFT", "CYAN|BLUE:LEFT", "PIPE:RIGHT:BLUE>LEFT:GREEN", "GREEN|RED:UP", "RED|BLUE:RIGHT", "BLUE|RED:RIGHT:2", "TRIGGER:RED:B|BLUE:UP", "IN:BLUE"], solution: { "A": "OUT:RED|CYAN:LEFT", "B": "CYAN|BLUE:LEFT", "C": "PIPE:RIGHT:BLUE>LEFT:GREEN", "D": "GREEN|RED:UP", "E": "RED|BLUE:RIGHT", "F": "BLUE|RED:RIGHT:2", "G": "TRIGGER:RED:B|BLUE:UP", "H": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 122, name: "Flow State", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [["F", null, "E"], ["G", "C", "D"], ["H", "B", null], [null, "A", null]], pieces: ["OUT:RED|RED:UP", "RED|GREEN:UP", "TRIGGER:GREEN:D|CYAN:RIGHT", "CYAN|BLUE:UP", "BLUE|YELLOW:LEFT:2", "PIPE:RIGHT:YELLOW>DOWN:BLUE", "PIPE:UP:BLUE>DOWN:RED", "IN:RED"], solution: { "A": "OUT:RED|RED:UP", "B": "RED|GREEN:UP", "C": "TRIGGER:GREEN:D|CYAN:RIGHT", "D": "CYAN|BLUE:UP", "E": "BLUE|YELLOW:LEFT:2", "F": "PIPE:RIGHT:YELLOW>DOWN:BLUE", "G": "PIPE:UP:BLUE>DOWN:RED", "H": "IN:RED" }, hint: "The trigger at C locks D — achieve flow state by unlocking the path!" },
  { number: 123, name: "Layer Cake", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["A", "B", "C"], [null, null, null], [null, null, null]], [[null, null, "D"], [null, null, "E"], ["H", "G", "F"]]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:RIGHT", "STAIRS:UP:GREEN|BLUE:SHELF_UP", "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "RED|YELLOW:DOWN", "YELLOW|BLUE:LEFT", "BLUE|RED:LEFT", "IN:RED"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|GREEN:RIGHT", "C": "STAIRS:UP:GREEN|BLUE:SHELF_UP", "D": "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "E": "RED|YELLOW:DOWN", "F": "YELLOW|BLUE:LEFT", "G": "BLUE|RED:LEFT", "H": "IN:RED" }, hint: "The stairs at C connect the layers — climb up!" },
  { number: 124, name: "Stack Trace", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["F", "E"], ["G", null], ["H", null]], [[null, "D"], [null, "C"], ["A", "B"]]], pieces: ["OUT:RED|RED:RIGHT", "RED|GREEN:UP", "GREEN|BLUE:UP", "STAIRS:DOWN:BLUE|PURPLE:SHELF_DOWN", "PURPLE|RED:LEFT", "RED|CYAN:DOWN", "CYAN|YELLOW:DOWN", "IN:YELLOW"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|GREEN:UP", "C": "GREEN|BLUE:UP", "D": "STAIRS:DOWN:BLUE|PURPLE:SHELF_DOWN", "E": "PURPLE|RED:LEFT", "F": "RED|CYAN:DOWN", "G": "CYAN|YELLOW:DOWN", "H": "IN:YELLOW" }, hint: "Trace the stack downward through the shelf!" },
  { number: 125, name: "Storage Array", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["E", "D"], ["F", null], ["G", "H"]], [[null, "C"], [null, "B"], [null, "A"]]], pieces: ["OUT:RED|RED:UP", "RED|GREEN:UP", "STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN", "BLUE|PURPLE:LEFT", "PURPLE|RED:DOWN", "RED|CYAN:DOWN", "CYAN|YELLOW:RIGHT", "IN:YELLOW"], solution: { "A": "OUT:RED|RED:UP", "B": "RED|GREEN:UP", "C": "STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN", "D": "BLUE|PURPLE:LEFT", "E": "PURPLE|RED:DOWN", "F": "RED|CYAN:DOWN", "G": "CYAN|YELLOW:RIGHT", "H": "IN:YELLOW" }, hint: "Store data across shelf levels!" },
  { number: 126, name: "Vertical Limit", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["H", null, null, null], [null, null, "D", "C"], ["G", "F", "E", null]], [[null, null, null, null], [null, null, null, "B"], [null, null, null, "A"]]], pieces: ["OUT:RED|PINK:UP", "STAIRS:DOWN:PINK|GREEN:SHELF_DOWN", "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "PURPLE|BLUE:DOWN", "BLUE|YELLOW:LEFT", "YELLOW|BLUE:LEFT", "BLUE|RED:UP:2", "IN:RED"], solution: { "A": "OUT:RED|PINK:UP", "B": "STAIRS:DOWN:PINK|GREEN:SHELF_DOWN", "C": "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "D": "PURPLE|BLUE:DOWN", "E": "BLUE|YELLOW:LEFT", "F": "YELLOW|BLUE:LEFT", "G": "BLUE|RED:UP:2", "H": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 127, name: "Tiered System", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["H", "G", null, null, null], [null, null, null, null, null], [null, null, null, null, null]], [[null, "F", "E", null, null], [null, null, null, "A", "B"], [null, null, "D", null, "C"]]], pieces: ["OUT:RED|PURPLE:RIGHT", "PURPLE|ORANGE:DOWN", "ORANGE|RED:LEFT:2", "RED|BLUE:UP:2", "BLUE|RED:LEFT", "STAIRS:DOWN:RED|BLUE:SHELF_DOWN", "BLUE|RED:LEFT", "IN:RED"], solution: { "A": "OUT:RED|PURPLE:RIGHT", "B": "PURPLE|ORANGE:DOWN", "C": "ORANGE|RED:LEFT:2", "D": "RED|BLUE:UP:2", "E": "BLUE|RED:LEFT", "F": "STAIRS:DOWN:RED|BLUE:SHELF_DOWN", "G": "BLUE|RED:LEFT", "H": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 128, name: "Depth Perception", cells: ["A", "B", "C", "D", "E", "F", "G", "H"], layout: [[["F", "E", null], ["G", null, null], ["H", null, null]], [[null, "D", null], [null, "C", null], [null, "B", "A"]]], pieces: ["OUT:RED|RED:LEFT", "RED|GREEN:UP", "GREEN|BLUE:UP", "STAIRS:DOWN:BLUE|RED:SHELF_DOWN", "RED|PURPLE:LEFT", "PURPLE|CYAN:DOWN", "CYAN|YELLOW:DOWN", "IN:YELLOW"], solution: { "A": "OUT:RED|RED:LEFT", "B": "RED|GREEN:UP", "C": "GREEN|BLUE:UP", "D": "STAIRS:DOWN:BLUE|RED:SHELF_DOWN", "E": "RED|PURPLE:LEFT", "F": "PURPLE|CYAN:DOWN", "G": "CYAN|YELLOW:DOWN", "H": "IN:YELLOW" }, hint: "Perceive the depth — stairs bridge the shelves!" },
  { number: 129, name: "Base Camp", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[[null, null, "A", "B"], [null, null, null, "C"], [null, null, null, "D"], [null, "G", "F", "E"], [null, null, null, null]], [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, "H", null, null], ["J", "I", null, null]]], pieces: ["OUT:RED|RED:RIGHT", "RED|BLUE:DOWN", "PIPE:UP:BLUE>DOWN:RED", "PIPE:UP:RED>DOWN:BLUE", "BLUE|GREEN:LEFT", "GREEN|YELLOW:LEFT", "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "RED|BLUE:LEFT", "IN:BLUE"], solution: { "A": "OUT:RED|RED:RIGHT", "B": "RED|BLUE:DOWN", "C": "PIPE:UP:BLUE>DOWN:RED", "D": "PIPE:UP:RED>DOWN:BLUE", "E": "BLUE|GREEN:LEFT", "F": "GREEN|YELLOW:LEFT", "G": "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "H": "PIPE:SHELF_DOWN:BLUE>DOWN:RED", "I": "RED|BLUE:LEFT", "J": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 130, name: "High Altitude", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[["D", "E", "F", "G"], ["C", null, null, null], [null, null, "I", "H"], [null, null, "J", null]], [["A", null, null, null], ["B", null, null, null], [null, null, null, null], [null, null, null, null]]], pieces: ["OUT:RED|RED:DOWN", "STAIRS:DOWN:RED|ORANGE:SHELF_DOWN", "PIPE:SHELF_UP:ORANGE>UP:GREEN", "GREEN|RED:RIGHT", "RED|CYAN:RIGHT", "PIPE:LEFT:CYAN>RIGHT:RED", "RED|YELLOW:DOWN:2", "YELLOW|BLUE:LEFT", "BLUE|GREEN:DOWN", "IN:GREEN"], solution: { "A": "OUT:RED|RED:DOWN", "B": "STAIRS:DOWN:RED|ORANGE:SHELF_DOWN", "C": "PIPE:SHELF_UP:ORANGE>UP:GREEN", "D": "GREEN|RED:RIGHT", "E": "RED|CYAN:RIGHT", "F": "PIPE:LEFT:CYAN>RIGHT:RED", "G": "RED|YELLOW:DOWN:2", "H": "YELLOW|BLUE:LEFT", "I": "BLUE|GREEN:DOWN", "J": "IN:GREEN" }, hint: "Use all pieces correctly!" },
  { number: 131, name: "Summit Push", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[[null, null, null, null], [null, null, null, null], ["B", "C", null, null], ["A", null, null, null]], [[null, "G", "F", null], [null, "H", "I", "J"], [null, "D", "E", null], [null, null, null, null]]], pieces: ["OUT:RED|YELLOW:UP", "YELLOW|RED:RIGHT", "STAIRS:UP:RED|YELLOW:SHELF_UP", "PIPE:SHELF_DOWN:YELLOW>RIGHT:BLUE", "BLUE|RED:UP:2", "PIPE:DOWN:RED>LEFT:BLUE", "TRIGGER:BLUE:H|RED:DOWN", "PIPE:UP:RED>RIGHT:BLUE", "BLUE|GREEN:RIGHT", "IN:GREEN"], solution: { "A": "OUT:RED|YELLOW:UP", "B": "YELLOW|RED:RIGHT", "C": "STAIRS:UP:RED|YELLOW:SHELF_UP", "D": "PIPE:SHELF_DOWN:YELLOW>RIGHT:BLUE", "E": "BLUE|RED:UP:2", "F": "PIPE:DOWN:RED>LEFT:BLUE", "G": "TRIGGER:BLUE:H|RED:DOWN", "H": "PIPE:UP:RED>RIGHT:BLUE", "I": "BLUE|GREEN:RIGHT", "J": "IN:GREEN" }, hint: "The trigger at G locks H — push to the summit by unlocking the relay!" },
  { number: 132, name: "Thin Air", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], layout: [[[null, null, null, "H", "G"], [null, null, null, null, "F"], ["B", null, "C", "D", "E"], ["A", null, null, null, null]], [[null, "J", null, "I", null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]]], pieces: ["OUT:RED|GREEN:UP", "GREEN|RED:RIGHT:2", "PIPE:LEFT:RED>RIGHT:BLUE", "TRIGGER:BLUE:B|RED:RIGHT", "RED|RED:UP", "RED|YELLOW:UP", "TRIGGER:YELLOW:H|BLUE:LEFT", "STAIRS:UP:BLUE|PURPLE:SHELF_UP", "PURPLE|BLUE:LEFT:2", "IN:BLUE"], solution: { "A": "OUT:RED|GREEN:UP", "B": "GREEN|RED:RIGHT:2", "C": "PIPE:LEFT:RED>RIGHT:BLUE", "D": "TRIGGER:BLUE:B|RED:RIGHT", "E": "RED|RED:UP", "F": "RED|YELLOW:UP", "G": "TRIGGER:YELLOW:H|BLUE:LEFT", "H": "STAIRS:UP:BLUE|PURPLE:SHELF_UP", "I": "PURPLE|BLUE:LEFT:2", "J": "IN:BLUE" }, hint: "Two triggers! D locks B, G locks H — the air is thin up here!" },
  { number: 133, name: "Crown Ascent", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"], layout: [[["I", "H", null, null], [null, null, null, null], [null, "G", null, null], [null, "F", null, null], [null, "E", "D", null]], [["J", "K", null, null], [null, null, null, null], [null, null, null, null], [null, null, "B", "A"], [null, null, "C", null]]], pieces: ["OUT:RED|PINK:LEFT", "PINK|RED:DOWN", "STAIRS:DOWN:RED|GREEN:SHELF_DOWN", "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "PIPE:RIGHT:PURPLE>UP:BLUE", "TRIGGER:BLUE:B|RED:UP", "RED|GREEN:UP:2", "GREEN|BLUE:LEFT", "STAIRS:UP:BLUE|GREEN:SHELF_UP", "TRIGGER:GREEN:D|YELLOW:RIGHT", "IN:YELLOW"], solution: { "A": "OUT:RED|PINK:LEFT", "B": "PINK|RED:DOWN", "C": "STAIRS:DOWN:RED|GREEN:SHELF_DOWN", "D": "PIPE:SHELF_UP:GREEN>LEFT:PURPLE", "E": "PIPE:RIGHT:PURPLE>UP:BLUE", "F": "TRIGGER:BLUE:B|RED:UP", "G": "RED|GREEN:UP:2", "H": "GREEN|BLUE:LEFT", "I": "STAIRS:UP:BLUE|GREEN:SHELF_UP", "J": "TRIGGER:GREEN:D|YELLOW:RIGHT", "K": "IN:YELLOW" }, hint: "Use all pieces correctly!" },
  { number: 134, name: "Chain Reaction", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [["F", "E", "D", null], ["G", null, null, null], ["H", null, "C", null], ["I", null, "B", "A"], ["J", "K", null, null], [null, "L", null, null], [null, null, null, null], ["N", "M", null, null]], pieces: ["OUT:RED|GREEN:LEFT", "PIPE:RIGHT:GREEN>UP:RED", "RED|BLUE:UP:2", "PIPE:DOWN:BLUE>LEFT:RED", "RED|YELLOW:LEFT", "YELLOW|RED:DOWN", "TRIGGER:RED:C|YELLOW:DOWN", "YELLOW|RED:DOWN", "PIPE:UP:RED>DOWN:CYAN", "CYAN|BLUE:RIGHT", "TRIGGER:BLUE:D|RED:DOWN", "RED|GREEN:DOWN:2", "GREEN|PURPLE:LEFT", "IN:PURPLE"], solution: { "A": "OUT:RED|GREEN:LEFT", "B": "PIPE:RIGHT:GREEN>UP:RED", "C": "RED|BLUE:UP:2", "D": "PIPE:DOWN:BLUE>LEFT:RED", "E": "RED|YELLOW:LEFT", "F": "YELLOW|RED:DOWN", "G": "TRIGGER:RED:C|YELLOW:DOWN", "H": "YELLOW|RED:DOWN", "I": "PIPE:UP:RED>DOWN:CYAN", "J": "CYAN|BLUE:RIGHT", "K": "TRIGGER:BLUE:D|RED:DOWN", "L": "RED|GREEN:DOWN:2", "M": "GREEN|PURPLE:LEFT", "N": "IN:PURPLE" }, hint: "Use all pieces correctly!" },
  { number: 135, name: "Quick Trigger", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [["D", "E", null, null, null], [null, "F", null, "G", null], ["C", "B", "I", "H", null], [null, "A", "J", null, null], [null, null, "K", null, "N"], [null, null, "L", null, "M"]], pieces: ["OUT:RED|CYAN:UP", "CYAN|RED:LEFT", "RED|BLUE:UP:2", "PIPE:DOWN:BLUE>RIGHT:RED", "RED|BLUE:DOWN", "BLUE|GREEN:RIGHT:2", "GREEN|RED:DOWN", "RED|BLUE:LEFT", "PIPE:RIGHT:BLUE>DOWN:RED", "RED|YELLOW:DOWN", "TRIGGER:YELLOW:A|GREEN:DOWN", "GREEN|RED:RIGHT:2", "RED|BLUE:UP", "IN:BLUE"], solution: { "A": "OUT:RED|CYAN:UP", "B": "CYAN|RED:LEFT", "C": "RED|BLUE:UP:2", "D": "PIPE:DOWN:BLUE>RIGHT:RED", "E": "RED|BLUE:DOWN", "F": "BLUE|GREEN:RIGHT:2", "G": "GREEN|RED:DOWN", "H": "RED|BLUE:LEFT", "I": "PIPE:RIGHT:BLUE>DOWN:RED", "J": "RED|YELLOW:DOWN", "K": "TRIGGER:YELLOW:A|GREEN:DOWN", "L": "GREEN|RED:RIGHT:2", "M": "RED|BLUE:UP", "N": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 136, name: "Cause and Effect", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[null, null, "B", "A", null, null, null, null], ["D", null, "C", null, null, null, null, null], [null, null, null, null, null, null, null, "N"], ["E", null, null, null, null, null, "L", "M"], ["F", "G", null, "H", "I", "J", "K", null]], pieces: ["OUT:RED|GREEN:LEFT", "PIPE:RIGHT:GREEN>DOWN:YELLOW", "YELLOW|RED:LEFT:2", "RED|BLUE:DOWN:2", "BLUE|GREEN:DOWN", "TRIGGER:GREEN:D|YELLOW:RIGHT", "YELLOW|GREEN:RIGHT:2", "GREEN|RED:RIGHT", "RED|GREEN:RIGHT", "GREEN|BLUE:RIGHT", "BLUE|GREEN:UP", "PIPE:DOWN:GREEN>RIGHT:BLUE", "TRIGGER:BLUE:F|RED:UP", "IN:RED"], solution: { "A": "OUT:RED|GREEN:LEFT", "B": "PIPE:RIGHT:GREEN>DOWN:YELLOW", "C": "YELLOW|RED:LEFT:2", "D": "RED|BLUE:DOWN:2", "E": "BLUE|GREEN:DOWN", "F": "TRIGGER:GREEN:D|YELLOW:RIGHT", "G": "YELLOW|GREEN:RIGHT:2", "H": "GREEN|RED:RIGHT", "I": "RED|GREEN:RIGHT", "J": "GREEN|BLUE:RIGHT", "K": "BLUE|GREEN:UP", "L": "PIPE:DOWN:GREEN>RIGHT:BLUE", "M": "TRIGGER:BLUE:F|RED:UP", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 137, name: "Tripwire", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [["D", null, "E", "F", "G"], ["C", "B", "A", "I", "H"], [null, null, null, "J", null], [null, null, null, null, null], [null, null, null, "K", null], [null, "N", "M", "L", null]], pieces: ["OUT:RED|PURPLE:LEFT", "PIPE:RIGHT:PURPLE>LEFT:RED", "RED|YELLOW:UP", "YELLOW|GREEN:RIGHT:2", "GREEN|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:GREEN", "GREEN|RED:DOWN", "RED|BLUE:LEFT", "TRIGGER:BLUE:E|YELLOW:DOWN", "YELLOW|RED:DOWN:2", "RED|BLUE:DOWN", "PIPE:UP:BLUE>LEFT:RED", "RED|BLUE:LEFT", "IN:BLUE"], solution: { "A": "OUT:RED|PURPLE:LEFT", "B": "PIPE:RIGHT:PURPLE>LEFT:RED", "C": "RED|YELLOW:UP", "D": "YELLOW|GREEN:RIGHT:2", "E": "GREEN|RED:RIGHT", "F": "PIPE:LEFT:RED>RIGHT:GREEN", "G": "GREEN|RED:DOWN", "H": "RED|BLUE:LEFT", "I": "TRIGGER:BLUE:E|YELLOW:DOWN", "J": "YELLOW|RED:DOWN:2", "K": "RED|BLUE:DOWN", "L": "PIPE:UP:BLUE>LEFT:RED", "M": "RED|BLUE:LEFT", "N": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 138, name: "Event Horizon", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[null, null, null, null, "N"], ["C", "D", null, "L", "M"], ["B", "E", null, "K", null], ["A", "F", null, "J", null], [null, "G", "H", "I", null]], pieces: ["OUT:RED|CYAN:UP", "PIPE:DOWN:CYAN>UP:YELLOW", "PIPE:DOWN:YELLOW>RIGHT:GREEN", "GREEN|RED:DOWN", "RED|GREEN:DOWN", "GREEN|RED:DOWN", "TRIGGER:RED:C|BLUE:RIGHT", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>UP:GREEN", "GREEN|BLUE:UP", "BLUE|YELLOW:UP", "TRIGGER:YELLOW:M|RED:RIGHT", "PIPE:LEFT:RED>UP:BLUE", "IN:BLUE"], solution: { "A": "OUT:RED|CYAN:UP", "B": "PIPE:DOWN:CYAN>UP:YELLOW", "C": "PIPE:DOWN:YELLOW>RIGHT:GREEN", "D": "GREEN|RED:DOWN", "E": "RED|GREEN:DOWN", "F": "GREEN|RED:DOWN", "G": "TRIGGER:RED:C|BLUE:RIGHT", "H": "BLUE|RED:RIGHT", "I": "PIPE:LEFT:RED>UP:GREEN", "J": "GREEN|BLUE:UP", "K": "BLUE|YELLOW:UP", "L": "TRIGGER:YELLOW:M|RED:RIGHT", "M": "PIPE:LEFT:RED>UP:BLUE", "N": "IN:BLUE" }, hint: "Two triggers lock C and M — cross the event horizon!" },
  { number: 139, name: "Library of Babel", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, null, null, null], ["J", "K", "L", "M", "N"], [null, null, null, null, null], [null, null, null, null, null]], [[null, "G", "F", null, null], ["I", "H", "E", null, null], [null, "C", "D", null, null], ["A", "B", null, null, null]]], pieces: ["OUT:RED|CYAN:RIGHT", "PIPE:LEFT:CYAN>UP:RED", "RED|GREEN:RIGHT", "PIPE:LEFT:GREEN>UP:BLUE", "PIPE:DOWN:BLUE>UP:GREEN", "PIPE:DOWN:GREEN>LEFT:RED", "PIPE:RIGHT:RED>DOWN:BLUE", "PIPE:UP:BLUE>LEFT:GREEN", "STAIRS:DOWN:GREEN|YELLOW:SHELF_DOWN", "YELLOW|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:BLUE", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:PINK", "IN:PINK"], solution: { "A": "OUT:RED|CYAN:RIGHT", "B": "PIPE:LEFT:CYAN>UP:RED", "C": "RED|GREEN:RIGHT", "D": "PIPE:LEFT:GREEN>UP:BLUE", "E": "PIPE:DOWN:BLUE>UP:GREEN", "F": "PIPE:DOWN:GREEN>LEFT:RED", "G": "PIPE:RIGHT:RED>DOWN:BLUE", "H": "PIPE:UP:BLUE>LEFT:GREEN", "I": "STAIRS:DOWN:GREEN|YELLOW:SHELF_DOWN", "J": "YELLOW|RED:RIGHT", "K": "PIPE:LEFT:RED>RIGHT:BLUE", "L": "BLUE|RED:RIGHT", "M": "PIPE:LEFT:RED>RIGHT:PINK", "N": "IN:PINK" }, hint: "Use all pieces correctly!" },
  { number: 140, name: "File System", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, "M", null, "N"], [null, null, "L", null, null], [null, null, "K", "J", null], [null, "H", null, "I", null]], [[null, "A", "B", null, null], [null, null, "C", null, null], ["E", null, "D", null, null], ["F", "G", null, null, null]]], pieces: ["OUT:RED|PINK:RIGHT", "PIPE:LEFT:PINK>DOWN:BLUE", "PIPE:UP:BLUE>DOWN:RED", "RED|BLUE:LEFT:2", "BLUE|GREEN:DOWN", "PIPE:UP:GREEN>RIGHT:BLUE", "STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN", "GREEN|YELLOW:RIGHT:2", "YELLOW|ORANGE:UP", "ORANGE|RED:LEFT", "RED|BLUE:UP", "BLUE|RED:UP", "RED|BLUE:RIGHT:2", "IN:BLUE"], solution: { "A": "OUT:RED|PINK:RIGHT", "B": "PIPE:LEFT:PINK>DOWN:BLUE", "C": "PIPE:UP:BLUE>DOWN:RED", "D": "RED|BLUE:LEFT:2", "E": "BLUE|GREEN:DOWN", "F": "PIPE:UP:GREEN>RIGHT:BLUE", "G": "STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN", "H": "GREEN|YELLOW:RIGHT:2", "I": "YELLOW|ORANGE:UP", "J": "ORANGE|RED:LEFT", "K": "RED|BLUE:UP", "L": "BLUE|RED:UP", "M": "RED|BLUE:RIGHT:2", "N": "IN:BLUE" }, hint: "Use all pieces correctly!" },
  { number: 141, name: "Data Warehouse", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, null, "A", "B"], [null, "E", "D", null, "C"], [null, null, null, null, null], [null, null, null, null, null]], [["N", null, null, null, null], ["M", "F", null, null, null], ["L", "G", "H", null, null], ["K", "J", "I", null, null]]], pieces: ["OUT:RED|CYAN:RIGHT", "PIPE:LEFT:CYAN>DOWN:RED", "RED|ORANGE:LEFT:2", "PIPE:RIGHT:ORANGE>LEFT:BLUE", "STAIRS:UP:BLUE|YELLOW:SHELF_UP", "YELLOW|BLUE:DOWN", "BLUE|RED:RIGHT", "PIPE:LEFT:RED>DOWN:CYAN", "PIPE:UP:CYAN>LEFT:RED", "RED|PURPLE:LEFT", "PURPLE|RED:UP", "RED|BLUE:UP", "BLUE|RED:UP", "IN:RED"], solution: { "A": "OUT:RED|CYAN:RIGHT", "B": "PIPE:LEFT:CYAN>DOWN:RED", "C": "RED|ORANGE:LEFT:2", "D": "PIPE:RIGHT:ORANGE>LEFT:BLUE", "E": "STAIRS:UP:BLUE|YELLOW:SHELF_UP", "F": "YELLOW|BLUE:DOWN", "G": "BLUE|RED:RIGHT", "H": "PIPE:LEFT:RED>DOWN:CYAN", "I": "PIPE:UP:CYAN>LEFT:RED", "J": "RED|PURPLE:LEFT", "K": "PURPLE|RED:UP", "L": "RED|BLUE:UP", "M": "BLUE|RED:UP", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 142, name: "Sorting Office", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, "F", null, "G", null], [null, "E", null, "K", "J"], [null, null, null, "H", "I"], ["A", "D", null, null, null], ["B", "C", null, null, null]], [[null, "N", null, "M", null], [null, null, null, "L", null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]]], pieces: ["OUT:RED|GREEN:DOWN", "GREEN|RED:RIGHT", "PIPE:LEFT:RED>UP:GREEN", "GREEN|RED:UP:2", "RED|BLUE:UP", "BLUE|RED:RIGHT:2", "RED|BLUE:DOWN:2", "PIPE:UP:BLUE>RIGHT:RED", "RED|BLUE:UP", "BLUE|YELLOW:LEFT", "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "BLUE|GREEN:UP", "GREEN|RED:LEFT:2", "IN:RED"], solution: { "A": "OUT:RED|GREEN:DOWN", "B": "GREEN|RED:RIGHT", "C": "PIPE:LEFT:RED>UP:GREEN", "D": "GREEN|RED:UP:2", "E": "RED|BLUE:UP", "F": "BLUE|RED:RIGHT:2", "G": "RED|BLUE:DOWN:2", "H": "PIPE:UP:BLUE>RIGHT:RED", "I": "RED|BLUE:UP", "J": "BLUE|YELLOW:LEFT", "K": "STAIRS:UP:YELLOW|BLUE:SHELF_UP", "L": "BLUE|GREEN:UP", "M": "GREEN|RED:LEFT:2", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 143, name: "Archive Deep", cells: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"], layout: [[[null, null, null, null], [null, null, null, null], ["K", null, "J", null], [null, null, null, null]], [[null, null, "A", "B"], ["M", "D", null, "C"], ["L", null, "I", null], [null, "E", "H", null]], [[null, null, null, null], ["N", null, null, null], [null, null, null, null], [null, "F", "G", null]]], pieces: ["OUT:RED|GREEN:RIGHT", "GREEN|RED:DOWN", "RED|BLUE:LEFT:2", "BLUE|PURPLE:DOWN:2", "STAIRS:UP:PURPLE|RED:SHELF_UP", "RED|YELLOW:RIGHT", "STAIRS:DOWN:YELLOW|RED:SHELF_DOWN", "RED|PURPLE:UP", "STAIRS:DOWN:PURPLE|CYAN:SHELF_DOWN", "CYAN|RED:LEFT:2", "STAIRS:UP:RED|YELLOW:SHELF_UP", "YELLOW|GREEN:UP", "STAIRS:UP:GREEN|RED:SHELF_UP", "IN:RED"], solution: { "A": "OUT:RED|GREEN:RIGHT", "B": "GREEN|RED:DOWN", "C": "RED|BLUE:LEFT:2", "D": "BLUE|PURPLE:DOWN:2", "E": "STAIRS:UP:PURPLE|RED:SHELF_UP", "F": "RED|YELLOW:RIGHT", "G": "STAIRS:DOWN:YELLOW|RED:SHELF_DOWN", "H": "RED|PURPLE:UP", "I": "STAIRS:DOWN:PURPLE|CYAN:SHELF_DOWN", "J": "CYAN|RED:LEFT:2", "K": "STAIRS:UP:RED|YELLOW:SHELF_UP", "L": "YELLOW|GREEN:UP", "M": "STAIRS:UP:GREEN|RED:SHELF_UP", "N": "IN:RED" }, hint: "Use all pieces correctly!" },
  { number: 144, name: "Grand Design", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], layout: [[[null,null,null,"H"],[null,null,"J","I"],[null,null,"K",null],[null,null,"L",null],[null,null,"M","N"],[null,null,"P","O"]],[["B",null,"C","G"],["A",null,null,"F"],[null,null,"D","E"],[null,null,null,null],[null,null,null,null],[null,null,null,null]]], pieces: ["OUT:RED|BLUE:UP","BLUE|PURPLE:RIGHT:2","PURPLE|CYAN:DOWN:2","CYAN|YELLOW:RIGHT","PIPE:LEFT:YELLOW>UP:RED","PIPE:DOWN:RED>UP:PURPLE","STAIRS:DOWN:PURPLE|BLUE:SHELF_DOWN","PIPE:SHELF_UP:BLUE>DOWN:RED","RED|BLUE:LEFT","BLUE|YELLOW:DOWN","YELLOW|BLUE:DOWN","BLUE|GREEN:DOWN","TRIGGER:GREEN:G|BLUE:RIGHT","BLUE|RED:DOWN","RED|BLUE:LEFT","IN:BLUE"], solution: {"A":"OUT:RED|BLUE:UP","B":"BLUE|PURPLE:RIGHT:2","C":"PURPLE|CYAN:DOWN:2","D":"CYAN|YELLOW:RIGHT","E":"PIPE:LEFT:YELLOW>UP:RED","F":"PIPE:DOWN:RED>UP:PURPLE","G":"STAIRS:DOWN:PURPLE|BLUE:SHELF_DOWN","H":"PIPE:SHELF_UP:BLUE>DOWN:RED","I":"RED|BLUE:LEFT","J":"BLUE|YELLOW:DOWN","K":"YELLOW|BLUE:DOWN","L":"BLUE|GREEN:DOWN","M":"TRIGGER:GREEN:G|BLUE:RIGHT","N":"BLUE|RED:DOWN","O":"RED|BLUE:LEFT","P":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 145, name: "Master Plan", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], layout: [[[null,null,null,null,"P",null],[null,null,null,null,"O","N"],[null,null,null,null,"L","M"],[null,null,null,null,null,null]],[[null,null,null,null,null,null],["D",null,null,null,null,null],["C",null,"B",null,"K",null],[null,null,"A",null,null,null]],[[null,null,null,null,null,null],["E","F","G","H",null,null],[null,null,null,"I","J",null],[null,null,null,null,null,null]]], pieces: ["OUT:RED|PURPLE:UP","PURPLE|GREEN:LEFT:2","GREEN|RED:UP","STAIRS:UP:RED|GREEN:SHELF_UP","PIPE:SHELF_DOWN:GREEN>RIGHT:RED","PIPE:LEFT:RED>RIGHT:YELLOW","TRIGGER:YELLOW:E|BLUE:RIGHT","PIPE:LEFT:BLUE>DOWN:CYAN","PIPE:UP:CYAN>RIGHT:GREEN","STAIRS:DOWN:GREEN|RED:SHELF_DOWN","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","GREEN|BLUE:RIGHT","BLUE|CYAN:UP","TRIGGER:CYAN:K|YELLOW:LEFT","YELLOW|ORANGE:UP","IN:ORANGE"], solution: {"A":"OUT:RED|PURPLE:UP","B":"PURPLE|GREEN:LEFT:2","C":"GREEN|RED:UP","D":"STAIRS:UP:RED|GREEN:SHELF_UP","E":"PIPE:SHELF_DOWN:GREEN>RIGHT:RED","F":"PIPE:LEFT:RED>RIGHT:YELLOW","G":"TRIGGER:YELLOW:E|BLUE:RIGHT","H":"PIPE:LEFT:BLUE>DOWN:CYAN","I":"PIPE:UP:CYAN>RIGHT:GREEN","J":"STAIRS:DOWN:GREEN|RED:SHELF_DOWN","K":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","L":"GREEN|BLUE:RIGHT","M":"BLUE|CYAN:UP","N":"TRIGGER:CYAN:K|YELLOW:LEFT","O":"YELLOW|ORANGE:UP","P":"IN:ORANGE"}, hint: "Use all pieces correctly!" },
{ number: 146, name: "Final Synthesis", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], layout: [[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],["K","J",null,null,null],[null,null,null,null,null],["L","M",null,null,null]],[[null,null,null,"B","C"],[null,null,null,"A","D"],[null,null,null,"F","E"],[null,"I","H","G",null],["P",null,null,null,null],["O","N",null,null,null]]], pieces: ["OUT:RED|RED:UP","RED|YELLOW:RIGHT","YELLOW|RED:DOWN","RED|GREEN:DOWN","TRIGGER:GREEN:B|RED:LEFT","PIPE:RIGHT:RED>DOWN:GREEN","PIPE:UP:GREEN>LEFT:YELLOW","YELLOW|BLUE:LEFT","STAIRS:DOWN:BLUE|YELLOW:SHELF_DOWN","YELLOW|RED:LEFT","RED|BLUE:DOWN:2","BLUE|RED:RIGHT","STAIRS:UP:RED|BLUE:SHELF_UP","PIPE:SHELF_DOWN:BLUE>LEFT:RED","RED|BLUE:UP","IN:BLUE"], solution: {"A":"OUT:RED|RED:UP","B":"RED|YELLOW:RIGHT","C":"YELLOW|RED:DOWN","D":"RED|GREEN:DOWN","E":"TRIGGER:GREEN:B|RED:LEFT","F":"PIPE:RIGHT:RED>DOWN:GREEN","G":"PIPE:UP:GREEN>LEFT:YELLOW","H":"YELLOW|BLUE:LEFT","I":"STAIRS:DOWN:BLUE|YELLOW:SHELF_DOWN","J":"YELLOW|RED:LEFT","K":"RED|BLUE:DOWN:2","L":"BLUE|RED:RIGHT","M":"STAIRS:UP:RED|BLUE:SHELF_UP","N":"PIPE:SHELF_DOWN:BLUE>LEFT:RED","O":"RED|BLUE:UP","P":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 147, name: "Harmonic Convergence", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], layout: [[null,null,"F","E",null],["B","C",null,"D",null],["A",null,"G",null,null],[null,null,"H","K","L"],[null,null,"I","J","M"],[null,null,null,null,"N"],[null,null,null,"P","O"]], pieces: ["OUT:RED|CYAN:UP","PIPE:DOWN:CYAN>RIGHT:RED","RED|YELLOW:RIGHT:2","YELLOW|BLUE:UP","BLUE|GREEN:LEFT","GREEN|RED:DOWN:2","RED|BLUE:DOWN","PIPE:UP:BLUE>DOWN:RED","RED|BLUE:RIGHT","BLUE|ORANGE:UP","ORANGE|RED:RIGHT","RED|BLUE:DOWN","BLUE|GREEN:DOWN","GREEN|RED:DOWN","TRIGGER:RED:G|BLUE:LEFT","IN:BLUE"], solution: {"A":"OUT:RED|CYAN:UP","B":"PIPE:DOWN:CYAN>RIGHT:RED","C":"RED|YELLOW:RIGHT:2","D":"YELLOW|BLUE:UP","E":"BLUE|GREEN:LEFT","F":"GREEN|RED:DOWN:2","G":"RED|BLUE:DOWN","H":"PIPE:UP:BLUE>DOWN:RED","I":"RED|BLUE:RIGHT","J":"BLUE|ORANGE:UP","K":"ORANGE|RED:RIGHT","L":"RED|BLUE:DOWN","M":"BLUE|GREEN:DOWN","N":"GREEN|RED:DOWN","O":"TRIGGER:RED:G|BLUE:LEFT","P":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 148, name: "Dark Matter", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], layout: [[[null,null,null,null,null],[null,null,null,null,"K"],["P","O","N","M","L"],[null,null,null,null,null]],[[null,null,null,null,"I"],[null,null,null,null,"J"],[null,null,null,null,null],["A","B",null,null,null]],[[null,null,"F","G","H"],[null,null,null,null,null],[null,null,"E",null,null],[null,"C","D",null,null]]], pieces: ["OUT:RED|GREEN:RIGHT","STAIRS:UP:GREEN|BLUE:SHELF_UP","BLUE|RED:RIGHT","RED|ORANGE:UP","ORANGE|RED:UP:2","PIPE:DOWN:RED>RIGHT:BLUE","PIPE:LEFT:BLUE>RIGHT:RED","STAIRS:DOWN:RED|YELLOW:SHELF_DOWN","TRIGGER:YELLOW:E|PURPLE:DOWN","STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","TRIGGER:RED:F|BLUE:DOWN","BLUE|RED:LEFT","RED|GREEN:LEFT","PIPE:RIGHT:GREEN>LEFT:BLUE","BLUE|RED:LEFT","IN:RED"], solution: {"A":"OUT:RED|GREEN:RIGHT","B":"STAIRS:UP:GREEN|BLUE:SHELF_UP","C":"BLUE|RED:RIGHT","D":"RED|ORANGE:UP","E":"ORANGE|RED:UP:2","F":"PIPE:DOWN:RED>RIGHT:BLUE","G":"PIPE:LEFT:BLUE>RIGHT:RED","H":"STAIRS:DOWN:RED|YELLOW:SHELF_DOWN","I":"TRIGGER:YELLOW:E|PURPLE:DOWN","J":"STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","K":"TRIGGER:RED:F|BLUE:DOWN","L":"BLUE|RED:LEFT","M":"RED|GREEN:LEFT","N":"PIPE:RIGHT:GREEN>LEFT:BLUE","O":"BLUE|RED:LEFT","P":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 149, name: "Convergence Point", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], layout: [[[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,"M"],[null,null,null,"L"]],[["C","B","A",null],["D","E",null,null],[null,"F",null,null],["H","G",null,"N"],["I","J",null,"K"]],[[null,null,null,null],[null,null,null,null],[null,null,null,"P"],[null,null,null,"O"],[null,null,null,null]]], pieces: ["OUT:RED|PINK:LEFT","PINK|RED:LEFT","RED|GREEN:DOWN","TRIGGER:GREEN:B|RED:RIGHT","RED|BLUE:DOWN","TRIGGER:BLUE:D|RED:DOWN","RED|GREEN:LEFT","GREEN|RED:DOWN","RED|BLUE:RIGHT","BLUE|CYAN:RIGHT:2","STAIRS:DOWN:CYAN|GREEN:SHELF_DOWN","GREEN|BLUE:UP","STAIRS:UP:BLUE|RED:SHELF_UP","STAIRS:UP:RED|YELLOW:SHELF_UP","PIPE:SHELF_DOWN:YELLOW>UP:RED","IN:RED"], solution: {"A":"OUT:RED|PINK:LEFT","B":"PINK|RED:LEFT","C":"RED|GREEN:DOWN","D":"TRIGGER:GREEN:B|RED:RIGHT","E":"RED|BLUE:DOWN","F":"TRIGGER:BLUE:D|RED:DOWN","G":"RED|GREEN:LEFT","H":"GREEN|RED:DOWN","I":"RED|BLUE:RIGHT","J":"BLUE|CYAN:RIGHT:2","K":"STAIRS:DOWN:CYAN|GREEN:SHELF_DOWN","L":"GREEN|BLUE:UP","M":"STAIRS:UP:BLUE|RED:SHELF_UP","N":"STAIRS:UP:RED|YELLOW:SHELF_UP","O":"PIPE:SHELF_DOWN:YELLOW>UP:RED","P":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 150, name: "Dual Axis", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], layout: [[[null,null,"F",null,null],[null,null,"G","H",null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]],[[null,null,"E",null,null],[null,null,"D","I","J"],["A","B","C",null,"K"],[null,null,null,null,"L"],[null,null,null,null,"M"]],[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,"P","O"],[null,null,null,null,"N"]]], pieces: ["OUT:RED|GREEN:RIGHT","GREEN|RED:RIGHT","RED|GREEN:UP","GREEN|RED:UP","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","TRIGGER:BLUE:D|YELLOW:DOWN","YELLOW|GREEN:RIGHT","STAIRS:UP:GREEN|RED:SHELF_UP","TRIGGER:RED:G|BLUE:RIGHT","BLUE|RED:DOWN","RED|BLUE:DOWN","PIPE:UP:BLUE>DOWN:RED","STAIRS:UP:RED|BLUE:SHELF_UP","BLUE|PINK:UP","PINK|YELLOW:LEFT","IN:YELLOW"], solution: {"A":"OUT:RED|GREEN:RIGHT","B":"GREEN|RED:RIGHT","C":"RED|GREEN:UP","D":"GREEN|RED:UP","E":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","F":"TRIGGER:BLUE:D|YELLOW:DOWN","G":"YELLOW|GREEN:RIGHT","H":"STAIRS:UP:GREEN|RED:SHELF_UP","I":"TRIGGER:RED:G|BLUE:RIGHT","J":"BLUE|RED:DOWN","K":"RED|BLUE:DOWN","L":"PIPE:UP:BLUE>DOWN:RED","M":"STAIRS:UP:RED|BLUE:SHELF_UP","N":"BLUE|PINK:UP","O":"PINK|YELLOW:LEFT","P":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 151, name: "Triple Helix", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q"], layout: [[["I",null,"H","G","F"],["J","K",null,null,null],[null,null,null,null,null],[null,"L",null,null,null],[null,"M",null,null,null]],[[null,null,"A","B","E"],[null,null,null,"C","D"],[null,null,null,null,null],[null,null,null,null,null],[null,"N","O","P",null]],[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,"Q",null]]], pieces: ["OUT:RED|ORANGE:RIGHT","ORANGE|RED:DOWN","RED|BLUE:RIGHT","BLUE|GREEN:UP","STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN","BLUE|RED:LEFT","RED|GREEN:LEFT","GREEN|YELLOW:LEFT:2","PIPE:RIGHT:YELLOW>DOWN:RED","RED|BLUE:RIGHT","BLUE|CYAN:DOWN:2","TRIGGER:CYAN:B|RED:DOWN","STAIRS:UP:RED|CYAN:SHELF_UP","CYAN|BLUE:RIGHT","TRIGGER:BLUE:B|GREEN:RIGHT","STAIRS:UP:GREEN|RED:SHELF_UP","IN:RED"], solution: {"A":"OUT:RED|ORANGE:RIGHT","B":"ORANGE|RED:DOWN","C":"RED|BLUE:RIGHT","D":"BLUE|GREEN:UP","E":"STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN","F":"BLUE|RED:LEFT","G":"RED|GREEN:LEFT","H":"GREEN|YELLOW:LEFT:2","I":"PIPE:RIGHT:YELLOW>DOWN:RED","J":"RED|BLUE:RIGHT","K":"BLUE|CYAN:DOWN:2","L":"TRIGGER:CYAN:B|RED:DOWN","M":"STAIRS:UP:RED|CYAN:SHELF_UP","N":"CYAN|BLUE:RIGHT","O":"TRIGGER:BLUE:B|GREEN:RIGHT","P":"STAIRS:UP:GREEN|RED:SHELF_UP","Q":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 152, name: "Infinite Loop", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q"], layout: [[[null,null,"G","H","M"],[null,null,null,"I","L"],[null,null,null,null,null],[null,null,null,"J","K"]],[[null,null,"F",null,"N"],["C","D","E",null,"O"],["B",null,null,null,"P"],["A",null,null,null,null]],[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,"Q"],[null,null,null,null,null]]], pieces: ["OUT:RED|CYAN:UP","CYAN|RED:UP","RED|YELLOW:RIGHT","YELLOW|BLUE:RIGHT","BLUE|YELLOW:UP","STAIRS:DOWN:YELLOW|BLUE:SHELF_DOWN","BLUE|GREEN:RIGHT","GREEN|BLUE:DOWN","BLUE|YELLOW:DOWN:2","PIPE:UP:YELLOW>RIGHT:RED","RED|YELLOW:UP:2","TRIGGER:YELLOW:F|ORANGE:UP","STAIRS:UP:ORANGE|RED:SHELF_UP","RED|PURPLE:DOWN","TRIGGER:PURPLE:I|RED:DOWN","STAIRS:UP:RED|GREEN:SHELF_UP","IN:GREEN"], solution: {"A":"OUT:RED|CYAN:UP","B":"CYAN|RED:UP","C":"RED|YELLOW:RIGHT","D":"YELLOW|BLUE:RIGHT","E":"BLUE|YELLOW:UP","F":"STAIRS:DOWN:YELLOW|BLUE:SHELF_DOWN","G":"BLUE|GREEN:RIGHT","H":"GREEN|BLUE:DOWN","I":"BLUE|YELLOW:DOWN:2","J":"PIPE:UP:YELLOW>RIGHT:RED","K":"RED|YELLOW:UP:2","L":"TRIGGER:YELLOW:F|ORANGE:UP","M":"STAIRS:UP:ORANGE|RED:SHELF_UP","N":"RED|PURPLE:DOWN","O":"TRIGGER:PURPLE:I|RED:DOWN","P":"STAIRS:UP:RED|GREEN:SHELF_UP","Q":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 153, name: "Final Cipher", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R"], layout: [[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,"H"],[null,"E","F",null,"G"]],[[null,null,null,null,null],[null,null,"N",null,null],[null,null,"M","L",null],[null,"A","B","K",null],[null,null,null,"J","I"],[null,"D","C",null,null]],[["R","Q","P",null,null],[null,null,"O",null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]]], pieces: ["OUT:RED|PURPLE:RIGHT","PURPLE|GREEN:DOWN:2","GREEN|RED:LEFT","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","PIPE:SHELF_UP:BLUE>RIGHT:YELLOW","YELLOW|RED:RIGHT:2","RED|YELLOW:UP","STAIRS:UP:YELLOW|RED:SHELF_UP","RED|BLUE:LEFT","PIPE:RIGHT:BLUE>UP:GREEN","GREEN|RED:UP","RED|CYAN:LEFT","CYAN|RED:UP","STAIRS:UP:RED|YELLOW:SHELF_UP","TRIGGER:YELLOW:M|PURPLE:UP","PURPLE|GREEN:LEFT","TRIGGER:GREEN:M|PURPLE:LEFT","IN:PURPLE"], solution: {"A":"OUT:RED|PURPLE:RIGHT","B":"PURPLE|GREEN:DOWN:2","C":"GREEN|RED:LEFT","D":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","E":"PIPE:SHELF_UP:BLUE>RIGHT:YELLOW","F":"YELLOW|RED:RIGHT:2","G":"RED|YELLOW:UP","H":"STAIRS:UP:YELLOW|RED:SHELF_UP","I":"RED|BLUE:LEFT","J":"PIPE:RIGHT:BLUE>UP:GREEN","K":"GREEN|RED:UP","L":"RED|CYAN:LEFT","M":"CYAN|RED:UP","N":"STAIRS:UP:RED|YELLOW:SHELF_UP","O":"TRIGGER:YELLOW:M|PURPLE:UP","P":"PURPLE|GREEN:LEFT","Q":"TRIGGER:GREEN:M|PURPLE:LEFT","R":"IN:PURPLE"}, hint: "Use all pieces correctly!" },
{ number: 154, name: "Gentle Flow", cells: ["A","B","C","D","E","F"], layout: [[[null,"D"],[null,"E"],[null,"F"]],[[null,"C"],["A","B"],[null,null]]], pieces: ["OUT:RED|PINK:RIGHT","PINK|RED:UP","STAIRS:DOWN:RED|YELLOW:SHELF_DOWN","PIPE:SHELF_UP:YELLOW>DOWN:RED","TRIGGER:RED:C|BLUE:DOWN","IN:BLUE"], solution: {"A":"OUT:RED|PINK:RIGHT","B":"PINK|RED:UP","C":"STAIRS:DOWN:RED|YELLOW:SHELF_DOWN","D":"PIPE:SHELF_UP:YELLOW>DOWN:RED","E":"TRIGGER:RED:C|BLUE:DOWN","F":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 155, name: "Soft Landing", cells: ["A","B","C","D","E","F"], layout: [[[null,null,null],["F","E",null]],[[null,"C","B"],[null,"D","A"]]], pieces: ["OUT:RED|BLUE:UP","BLUE|RED:LEFT","RED|BLUE:DOWN","STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN","TRIGGER:GREEN:C|RED:LEFT","IN:RED"], solution: {"A":"OUT:RED|BLUE:UP","B":"BLUE|RED:LEFT","C":"RED|BLUE:DOWN","D":"STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN","E":"TRIGGER:GREEN:C|RED:LEFT","F":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 156, name: "Easy Breeze", cells: ["A","B","C","D","E","F"], layout: [[["C","D"],[null,null],["B",null],["A",null]],[[null,"E"],[null,"F"],[null,null],[null,null]]], pieces: ["OUT:RED|PURPLE:UP","PURPLE|RED:UP:2","RED|BLUE:RIGHT","STAIRS:UP:BLUE|RED:SHELF_UP","TRIGGER:RED:B|GREEN:DOWN","IN:GREEN"], solution: {"A":"OUT:RED|PURPLE:UP","B":"PURPLE|RED:UP:2","C":"RED|BLUE:RIGHT","D":"STAIRS:UP:BLUE|RED:SHELF_UP","E":"TRIGGER:RED:B|GREEN:DOWN","F":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 157, name: "Quiet Stream", cells: ["A","B","C","D","E","F"], layout: [[[null,"D","E","F"],[null,null,null,null],[null,"C",null,null]],[[null,null,null,null],[null,null,null,null],["A","B",null,null]]], pieces: ["OUT:RED|GREEN:RIGHT","STAIRS:DOWN:GREEN|PINK:SHELF_DOWN","PINK|PURPLE:UP:2","PIPE:DOWN:PURPLE>RIGHT:RED","TRIGGER:RED:C|BLUE:RIGHT","IN:BLUE"], solution: {"A":"OUT:RED|GREEN:RIGHT","B":"STAIRS:DOWN:GREEN|PINK:SHELF_DOWN","C":"PINK|PURPLE:UP:2","D":"PIPE:DOWN:PURPLE>RIGHT:RED","E":"TRIGGER:RED:C|BLUE:RIGHT","F":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 158, name: "Smooth Passage", cells: ["A","B","C","D","E","F","G"], layout: [[["G",null],["F","E"],[null,"D"]],[[null,null],["A",null],["B","C"]]], pieces: ["OUT:RED|BLUE:DOWN","BLUE|PURPLE:RIGHT","STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","PIPE:SHELF_UP:RED>UP:GREEN","TRIGGER:GREEN:C|BLUE:LEFT","BLUE|GREEN:UP","IN:GREEN"], solution: {"A":"OUT:RED|BLUE:DOWN","B":"BLUE|PURPLE:RIGHT","C":"STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","D":"PIPE:SHELF_UP:RED>UP:GREEN","E":"TRIGGER:GREEN:C|BLUE:LEFT","F":"BLUE|GREEN:UP","G":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 159, name: "Still Waters", cells: ["A","B","C","D","E","F","G"], layout: [[["G",null,null,null],[null,null,null,null]],[["F",null,"C","B"],["E",null,"D","A"]]], pieces: ["OUT:RED|ORANGE:UP","ORANGE|RED:LEFT","RED|BLUE:DOWN","BLUE|YELLOW:LEFT:2","TRIGGER:YELLOW:C|RED:UP","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","IN:GREEN"], solution: {"A":"OUT:RED|ORANGE:UP","B":"ORANGE|RED:LEFT","C":"RED|BLUE:DOWN","D":"BLUE|YELLOW:LEFT:2","E":"TRIGGER:YELLOW:C|RED:UP","F":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","G":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 160, name: "Light Touch", cells: ["A","B","C","D","E","F","G"], layout: [[[null,"E"],["C","D"],["B","A"]],[[null,"F"],[null,"G"],[null,null]]], pieces: ["OUT:RED|ORANGE:LEFT","PIPE:RIGHT:ORANGE>UP:RED","PIPE:DOWN:RED>RIGHT:GREEN","TRIGGER:GREEN:B|BLUE:UP","STAIRS:UP:BLUE|GREEN:SHELF_UP","PIPE:SHELF_DOWN:GREEN>DOWN:YELLOW","IN:YELLOW"], solution: {"A":"OUT:RED|ORANGE:LEFT","B":"PIPE:RIGHT:ORANGE>UP:RED","C":"PIPE:DOWN:RED>RIGHT:GREEN","D":"TRIGGER:GREEN:B|BLUE:UP","E":"STAIRS:UP:BLUE|GREEN:SHELF_UP","F":"PIPE:SHELF_DOWN:GREEN>DOWN:YELLOW","G":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 161, name: "Simple Path", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,"A",null],[null,"B",null],["D","C",null],[null,null,null]],[[null,null,null],[null,null,null],["E",null,null],["F","G","H"]]], pieces: ["OUT:RED|RED:DOWN","PIPE:UP:RED>DOWN:BLUE","PIPE:UP:BLUE>LEFT:YELLOW","STAIRS:UP:YELLOW|RED:SHELF_UP","PIPE:SHELF_DOWN:RED>DOWN:BLUE","TRIGGER:BLUE:D|GREEN:RIGHT","GREEN|BLUE:RIGHT","IN:BLUE"], solution: {"A":"OUT:RED|RED:DOWN","B":"PIPE:UP:RED>DOWN:BLUE","C":"PIPE:UP:BLUE>LEFT:YELLOW","D":"STAIRS:UP:YELLOW|RED:SHELF_UP","E":"PIPE:SHELF_DOWN:RED>DOWN:BLUE","F":"TRIGGER:BLUE:D|GREEN:RIGHT","G":"GREEN|BLUE:RIGHT","H":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 162, name: "Warm Glow", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,"A","B",null],[null,null,null,null],[null,null,null,null]],[[null,null,"C","D"],[null,null,null,"E"],["H",null,"G","F"]]], pieces: ["OUT:RED|GREEN:RIGHT","STAIRS:UP:GREEN|YELLOW:SHELF_UP","YELLOW|ORANGE:RIGHT","PIPE:LEFT:ORANGE>DOWN:YELLOW","TRIGGER:YELLOW:C|BLUE:DOWN","PIPE:UP:BLUE>LEFT:RED","RED|YELLOW:LEFT:2","IN:YELLOW"], solution: {"A":"OUT:RED|GREEN:RIGHT","B":"STAIRS:UP:GREEN|YELLOW:SHELF_UP","C":"YELLOW|ORANGE:RIGHT","D":"PIPE:LEFT:ORANGE>DOWN:YELLOW","E":"TRIGGER:YELLOW:C|BLUE:DOWN","F":"PIPE:UP:BLUE>LEFT:RED","G":"RED|YELLOW:LEFT:2","H":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 163, name: "Clear Skies", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,"H",null,null],[null,null,null,null],[null,null,null,null]],[["F","G",null,null],["E","D","C","B"],[null,null,null,"A"]]], pieces: ["OUT:RED|PINK:UP","PINK|RED:LEFT","RED|RED:LEFT","RED|BLUE:LEFT","TRIGGER:BLUE:A|PINK:UP","PINK|BLUE:RIGHT","STAIRS:DOWN:BLUE|RED:SHELF_DOWN","IN:RED"], solution: {"A":"OUT:RED|PINK:UP","B":"PINK|RED:LEFT","C":"RED|RED:LEFT","D":"RED|BLUE:LEFT","E":"TRIGGER:BLUE:A|PINK:UP","F":"PINK|BLUE:RIGHT","G":"STAIRS:DOWN:BLUE|RED:SHELF_DOWN","H":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 164, name: "Drifting Petals", cells: ["A","B","C","D","E","F","G"], layout: [[[null,null],["A",null],["B",null]],[["G",null],["F","E"],["C","D"]]], pieces: ["OUT:RED|CYAN:DOWN","STAIRS:UP:CYAN|BLUE:SHELF_UP","PIPE:SHELF_DOWN:BLUE>RIGHT:ORANGE","PIPE:LEFT:ORANGE>UP:CYAN","CYAN|RED:LEFT","TRIGGER:RED:D|GREEN:UP","IN:GREEN"], solution: {"A":"OUT:RED|CYAN:DOWN","B":"STAIRS:UP:CYAN|BLUE:SHELF_UP","C":"PIPE:SHELF_DOWN:BLUE>RIGHT:ORANGE","D":"PIPE:LEFT:ORANGE>UP:CYAN","E":"CYAN|RED:LEFT","F":"TRIGGER:RED:D|GREEN:UP","G":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 165, name: "Morning Dew", cells: ["A","B","C","D","E","F","G"], layout: [[["G","F",null],[null,"E",null],[null,"D","C"]],[[null,null,null],[null,null,"A"],[null,null,"B"]]], pieces: ["OUT:RED|PINK:DOWN","STAIRS:DOWN:PINK|RED:SHELF_DOWN","RED|GREEN:LEFT","TRIGGER:GREEN:B|YELLOW:UP","PIPE:DOWN:YELLOW>UP:BLUE","BLUE|YELLOW:LEFT","IN:YELLOW"], solution: {"A":"OUT:RED|PINK:DOWN","B":"STAIRS:DOWN:PINK|RED:SHELF_DOWN","C":"RED|GREEN:LEFT","D":"TRIGGER:GREEN:B|YELLOW:UP","E":"PIPE:DOWN:YELLOW>UP:BLUE","F":"BLUE|YELLOW:LEFT","G":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 166, name: "Sunlit Pool", cells: ["A","B","C","D","E","F","G"], layout: [[[null,"A","B"],[null,null,null],[null,null,null]],[[null,null,"C"],["G",null,"D"],["F",null,"E"]]], pieces: ["OUT:RED|RED:RIGHT","STAIRS:UP:RED|BLUE:SHELF_UP","PIPE:SHELF_DOWN:BLUE>DOWN:RED","TRIGGER:RED:B|GREEN:DOWN","GREEN|YELLOW:LEFT:2","PIPE:RIGHT:YELLOW>UP:GREEN","IN:GREEN"], solution: {"A":"OUT:RED|RED:RIGHT","B":"STAIRS:UP:RED|BLUE:SHELF_UP","C":"PIPE:SHELF_DOWN:BLUE>DOWN:RED","D":"TRIGGER:RED:B|GREEN:DOWN","E":"GREEN|YELLOW:LEFT:2","F":"PIPE:RIGHT:YELLOW>UP:GREEN","G":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 167, name: "Mossy Stone", cells: ["A","B","C","D","E","F","G","H"], layout: [[["B","C",null,null],["A","D",null,null],[null,null,null,null]],[[null,null,null,null],[null,"E","F","G"],[null,null,null,"H"]]], pieces: ["OUT:RED|ORANGE:UP","ORANGE|RED:RIGHT","RED|BLUE:DOWN","STAIRS:UP:BLUE|PURPLE:SHELF_UP","PURPLE|BLUE:RIGHT","BLUE|GREEN:RIGHT","TRIGGER:GREEN:E|RED:DOWN","IN:RED"], solution: {"A":"OUT:RED|ORANGE:UP","B":"ORANGE|RED:RIGHT","C":"RED|BLUE:DOWN","D":"STAIRS:UP:BLUE|PURPLE:SHELF_UP","E":"PURPLE|BLUE:RIGHT","F":"BLUE|GREEN:RIGHT","G":"TRIGGER:GREEN:E|RED:DOWN","H":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 168, name: "Birdsong", cells: ["A","B","C","D","E","F","G","H"], layout: [[["A","B","C",null],[null,null,"D",null],[null,null,"E","F"],[null,null,null,"G"]],[[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,"H"]]], pieces: ["OUT:RED|RED:RIGHT","RED|GREEN:RIGHT","PIPE:LEFT:GREEN>DOWN:BLUE","PIPE:UP:BLUE>DOWN:RED","TRIGGER:RED:C|BLUE:RIGHT","BLUE|PURPLE:DOWN","STAIRS:UP:PURPLE|BLUE:SHELF_UP","IN:BLUE"], solution: {"A":"OUT:RED|RED:RIGHT","B":"RED|GREEN:RIGHT","C":"PIPE:LEFT:GREEN>DOWN:BLUE","D":"PIPE:UP:BLUE>DOWN:RED","E":"TRIGGER:RED:C|BLUE:RIGHT","F":"BLUE|PURPLE:DOWN","G":"STAIRS:UP:PURPLE|BLUE:SHELF_UP","H":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 169, name: "Amber Light", cells: ["A","B","C","D","E","F","G","H"], layout: [[["H",null,null],[null,"B","A"],[null,"C",null]],[["G",null,null],["F",null,null],["E","D",null]]], pieces: ["OUT:RED|YELLOW:LEFT","YELLOW|BLUE:DOWN","STAIRS:UP:BLUE|GREEN:SHELF_UP","PIPE:SHELF_DOWN:GREEN>LEFT:BLUE","BLUE|PURPLE:UP","TRIGGER:PURPLE:D|RED:UP","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","IN:BLUE"], solution: {"A":"OUT:RED|YELLOW:LEFT","B":"YELLOW|BLUE:DOWN","C":"STAIRS:UP:BLUE|GREEN:SHELF_UP","D":"PIPE:SHELF_DOWN:GREEN>LEFT:BLUE","E":"BLUE|PURPLE:UP","F":"TRIGGER:PURPLE:D|RED:UP","G":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","H":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 170, name: "Winding Creek", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,null,"D","E"],[null,null,null,"F"],[null,null,"H","G"]],[["A","B","C",null],[null,null,null,null],[null,null,null,null]]], pieces: ["OUT:RED|RED:RIGHT","RED|PURPLE:RIGHT","STAIRS:DOWN:PURPLE|CYAN:SHELF_DOWN","PIPE:SHELF_UP:CYAN>RIGHT:RED","TRIGGER:RED:C|BLUE:DOWN","BLUE|YELLOW:DOWN","TRIGGER:YELLOW:E|PURPLE:LEFT","IN:PURPLE"], solution: {"A":"OUT:RED|RED:RIGHT","B":"RED|PURPLE:RIGHT","C":"STAIRS:DOWN:PURPLE|CYAN:SHELF_DOWN","D":"PIPE:SHELF_UP:CYAN>RIGHT:RED","E":"TRIGGER:RED:C|BLUE:DOWN","F":"BLUE|YELLOW:DOWN","G":"TRIGGER:YELLOW:E|PURPLE:LEFT","H":"IN:PURPLE"}, hint: "Use all pieces correctly!" },
{ number: 171, name: "Autumn Leaf", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,null],[null,null,null],[null,null,"I"],[null,null,null]],[[null,"E","F"],[null,"D","G"],[null,"C","H"],["A","B",null]]], pieces: ["OUT:RED|PINK:RIGHT","PINK|RED:UP","PIPE:DOWN:RED>UP:BLUE","PIPE:DOWN:BLUE>UP:RED","TRIGGER:RED:C|BLUE:RIGHT","BLUE|PURPLE:DOWN","PURPLE|RED:DOWN","STAIRS:DOWN:RED|ORANGE:SHELF_DOWN","IN:ORANGE"], solution: {"A":"OUT:RED|PINK:RIGHT","B":"PINK|RED:UP","C":"PIPE:DOWN:RED>UP:BLUE","D":"PIPE:DOWN:BLUE>UP:RED","E":"TRIGGER:RED:C|BLUE:RIGHT","F":"BLUE|PURPLE:DOWN","G":"PURPLE|RED:DOWN","H":"STAIRS:DOWN:RED|ORANGE:SHELF_DOWN","I":"IN:ORANGE"}, hint: "Use all pieces correctly!" },
{ number: 172, name: "Quiet Dawn", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[["I","H"],[null,"G"],[null,"F"],[null,null]],[[null,null],["C","D"],["B","E"],["A",null]]], pieces: ["OUT:RED|YELLOW:UP","YELLOW|RED:UP","RED|YELLOW:RIGHT","PIPE:LEFT:YELLOW>DOWN:RED","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","PIPE:SHELF_UP:BLUE>UP:RED","TRIGGER:RED:E|GREEN:UP","TRIGGER:GREEN:D|RED:LEFT","IN:RED"], solution: {"A":"OUT:RED|YELLOW:UP","B":"YELLOW|RED:UP","C":"RED|YELLOW:RIGHT","D":"PIPE:LEFT:YELLOW>DOWN:RED","E":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","F":"PIPE:SHELF_UP:BLUE>UP:RED","G":"TRIGGER:RED:E|GREEN:UP","H":"TRIGGER:GREEN:D|RED:LEFT","I":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 173, name: "Meadow Mist", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,"H","I"],[null,null,null],[null,null,null]],[[null,"G",null],["C","F","B"],["D","E","A"]]], pieces: ["OUT:RED|BLUE:UP","BLUE|RED:LEFT:2","PIPE:RIGHT:RED>DOWN:ORANGE","ORANGE|GREEN:RIGHT","GREEN|BLUE:UP","TRIGGER:BLUE:D|RED:UP","STAIRS:DOWN:RED|PURPLE:SHELF_DOWN","PURPLE|BLUE:RIGHT","IN:BLUE"], solution: {"A":"OUT:RED|BLUE:UP","B":"BLUE|RED:LEFT:2","C":"PIPE:RIGHT:RED>DOWN:ORANGE","D":"ORANGE|GREEN:RIGHT","E":"GREEN|BLUE:UP","F":"TRIGGER:BLUE:D|RED:UP","G":"STAIRS:DOWN:RED|PURPLE:SHELF_DOWN","H":"PURPLE|BLUE:RIGHT","I":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 174, name: "Twilight Calm", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,"H"],["F","G"],["E","D"],[null,"C"]],[[null,null],[null,null],[null,null],["A","B"]]], pieces: ["OUT:RED|PURPLE:RIGHT","STAIRS:DOWN:PURPLE|BLUE:SHELF_DOWN","PIPE:SHELF_UP:BLUE>UP:GREEN","GREEN|BLUE:LEFT","TRIGGER:BLUE:C|YELLOW:UP","PIPE:DOWN:YELLOW>RIGHT:PURPLE","PURPLE|RED:UP","IN:RED"], solution: {"A":"OUT:RED|PURPLE:RIGHT","B":"STAIRS:DOWN:PURPLE|BLUE:SHELF_DOWN","C":"PIPE:SHELF_UP:BLUE>UP:GREEN","D":"GREEN|BLUE:LEFT","E":"TRIGGER:BLUE:C|YELLOW:UP","F":"PIPE:DOWN:YELLOW>RIGHT:PURPLE","G":"PURPLE|RED:UP","H":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 175, name: "Starry Pond", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,"E",null],[null,"F",null],["H","G",null],[null,null,null]],[[null,"D",null],[null,null,null],[null,"C","B"],[null,null,"A"]]], pieces: ["OUT:RED|RED:UP","PIPE:DOWN:RED>LEFT:BLUE","BLUE|YELLOW:UP:2","STAIRS:DOWN:YELLOW|RED:SHELF_DOWN","RED|ORANGE:DOWN","PIPE:UP:ORANGE>DOWN:RED","TRIGGER:RED:E|BLUE:LEFT","IN:BLUE"], solution: {"A":"OUT:RED|RED:UP","B":"PIPE:DOWN:RED>LEFT:BLUE","C":"BLUE|YELLOW:UP:2","D":"STAIRS:DOWN:YELLOW|RED:SHELF_DOWN","E":"RED|ORANGE:DOWN","F":"PIPE:UP:ORANGE>DOWN:RED","G":"TRIGGER:RED:E|BLUE:LEFT","H":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 176, name: "Moonlit Path", cells: ["A","B","C","D","E","F","G","H"], layout: [[["E",null,null],["D","C","B"],[null,null,"A"]],[["F",null,null],["G",null,"H"],[null,null,null]]], pieces: ["OUT:RED|BLUE:UP","PIPE:DOWN:BLUE>LEFT:RED","PIPE:RIGHT:RED>LEFT:BLUE","TRIGGER:BLUE:B|RED:UP","STAIRS:UP:RED|BLUE:SHELF_UP","PIPE:SHELF_DOWN:BLUE>DOWN:GREEN","GREEN|RED:RIGHT:2","IN:RED"], solution: {"A":"OUT:RED|BLUE:UP","B":"PIPE:DOWN:BLUE>LEFT:RED","C":"PIPE:RIGHT:RED>LEFT:BLUE","D":"TRIGGER:BLUE:B|RED:UP","E":"STAIRS:UP:RED|BLUE:SHELF_UP","F":"PIPE:SHELF_DOWN:BLUE>DOWN:GREEN","G":"GREEN|RED:RIGHT:2","H":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 177, name: "Soft Ember", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,null,null],[null,null,null,null],["E","F",null,"A"],["D","C",null,"B"]],[["I","H",null,null],[null,null,null,null],[null,"G",null,null],[null,null,null,null]]], pieces: ["OUT:RED|YELLOW:DOWN","YELLOW|BLUE:LEFT:2","BLUE|RED:LEFT","PIPE:RIGHT:RED>UP:YELLOW","PIPE:DOWN:YELLOW>RIGHT:GREEN","STAIRS:UP:GREEN|PURPLE:SHELF_UP","PURPLE|RED:UP:2","TRIGGER:RED:E|BLUE:LEFT","IN:BLUE"], solution: {"A":"OUT:RED|YELLOW:DOWN","B":"YELLOW|BLUE:LEFT:2","C":"BLUE|RED:LEFT","D":"PIPE:RIGHT:RED>UP:YELLOW","E":"PIPE:DOWN:YELLOW>RIGHT:GREEN","F":"STAIRS:UP:GREEN|PURPLE:SHELF_UP","G":"PURPLE|RED:UP:2","H":"TRIGGER:RED:E|BLUE:LEFT","I":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 178, name: "Glassy Lake", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,null],[null,null,null],[null,null,null],["I",null,null]],[[null,"B","A"],[null,"C","D"],[null,null,"E"],["H","G","F"]]], pieces: ["OUT:RED|GREEN:LEFT","GREEN|BLUE:DOWN","BLUE|PURPLE:RIGHT","PURPLE|RED:DOWN","TRIGGER:RED:C|GREEN:DOWN","GREEN|BLUE:LEFT","BLUE|RED:LEFT","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","IN:GREEN"], solution: {"A":"OUT:RED|GREEN:LEFT","B":"GREEN|BLUE:DOWN","C":"BLUE|PURPLE:RIGHT","D":"PURPLE|RED:DOWN","E":"TRIGGER:RED:C|GREEN:DOWN","F":"GREEN|BLUE:LEFT","G":"BLUE|RED:LEFT","H":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","I":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 179, name: "Feather Fall", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,null,null],[null,null,null,"I"],[null,null,null,null]],[["D","E","F",null],["C","B","G","H"],[null,"A",null,null]]], pieces: ["OUT:RED|GREEN:UP","GREEN|RED:LEFT","RED|PURPLE:UP","TRIGGER:PURPLE:B|RED:RIGHT","PIPE:LEFT:RED>RIGHT:BLUE","PIPE:LEFT:BLUE>DOWN:GREEN","TRIGGER:GREEN:E|PURPLE:RIGHT","STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","IN:RED"], solution: {"A":"OUT:RED|GREEN:UP","B":"GREEN|RED:LEFT","C":"RED|PURPLE:UP","D":"TRIGGER:PURPLE:B|RED:RIGHT","E":"PIPE:LEFT:RED>RIGHT:BLUE","F":"PIPE:LEFT:BLUE>DOWN:GREEN","G":"TRIGGER:GREEN:E|PURPLE:RIGHT","H":"STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","I":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 180, name: "Silent Snow", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[["G","H","I",null],[null,null,null,null],[null,null,null,null],[null,null,null,null]],[["F",null,null,null],[null,null,null,null],["E",null,null,null],["D","C","B","A"]]], pieces: ["OUT:RED|GREEN:LEFT","PIPE:RIGHT:GREEN>LEFT:BLUE","BLUE|YELLOW:LEFT","YELLOW|RED:UP","RED|YELLOW:UP:2","STAIRS:DOWN:YELLOW|BLUE:SHELF_DOWN","TRIGGER:BLUE:D|YELLOW:RIGHT","PIPE:LEFT:YELLOW>RIGHT:GREEN","IN:GREEN"], solution: {"A":"OUT:RED|GREEN:LEFT","B":"PIPE:RIGHT:GREEN>LEFT:BLUE","C":"BLUE|YELLOW:LEFT","D":"YELLOW|RED:UP","E":"RED|YELLOW:UP:2","F":"STAIRS:DOWN:YELLOW|BLUE:SHELF_DOWN","G":"TRIGGER:BLUE:D|YELLOW:RIGHT","H":"PIPE:LEFT:YELLOW>RIGHT:GREEN","I":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 181, name: "Dewdrop", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[["G","F",null,null],[null,null,null,null],[null,null,null,null],[null,null,null,null]],[["H","E",null,null],["I","D",null,null],["J","C",null,"B"],[null,null,null,"A"]]], pieces: ["OUT:RED|PINK:UP","PINK|RED:LEFT:2","RED|GREEN:UP","PIPE:DOWN:GREEN>UP:RED","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","BLUE|GREEN:LEFT","STAIRS:UP:GREEN|BLUE:SHELF_UP","TRIGGER:BLUE:F|YELLOW:DOWN","YELLOW|BLUE:DOWN","IN:BLUE"], solution: {"A":"OUT:RED|PINK:UP","B":"PINK|RED:LEFT:2","C":"RED|GREEN:UP","D":"PIPE:DOWN:GREEN>UP:RED","E":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","F":"BLUE|GREEN:LEFT","G":"STAIRS:UP:GREEN|BLUE:SHELF_UP","H":"TRIGGER:BLUE:F|YELLOW:DOWN","I":"YELLOW|BLUE:DOWN","J":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 182, name: "Velvet Sky", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[[null,"F",null,null],[null,"G",null,null]],[["J","E","D","A"],["I","H","C","B"]]], pieces: ["OUT:RED|CYAN:DOWN","PIPE:UP:CYAN>LEFT:RED","RED|GREEN:UP","GREEN|RED:LEFT","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","BLUE|CYAN:DOWN","STAIRS:UP:CYAN|RED:SHELF_UP","PIPE:SHELF_DOWN:RED>LEFT:BLUE","TRIGGER:BLUE:E|RED:UP","IN:RED"], solution: {"A":"OUT:RED|CYAN:DOWN","B":"PIPE:UP:CYAN>LEFT:RED","C":"RED|GREEN:UP","D":"GREEN|RED:LEFT","E":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","F":"BLUE|CYAN:DOWN","G":"STAIRS:UP:CYAN|RED:SHELF_UP","H":"PIPE:SHELF_DOWN:RED>LEFT:BLUE","I":"TRIGGER:BLUE:E|RED:UP","J":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 183, name: "Tide Pool", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[[null,null],[null,null],[null,null],[null,"A"],[null,"B"],[null,"C"],["E","D"]],[["J",null],[null,null],["I",null],[null,null],["H",null],["G",null],["F",null]]], pieces: ["OUT:RED|RED:DOWN","RED|BLUE:DOWN","PIPE:UP:BLUE>DOWN:YELLOW","YELLOW|GREEN:LEFT","STAIRS:UP:GREEN|PURPLE:SHELF_UP","PURPLE|BLUE:UP","TRIGGER:BLUE:E|GREEN:UP","GREEN|BLUE:UP:2","BLUE|YELLOW:UP:2","IN:YELLOW"], solution: {"A":"OUT:RED|RED:DOWN","B":"RED|BLUE:DOWN","C":"PIPE:UP:BLUE>DOWN:YELLOW","D":"YELLOW|GREEN:LEFT","E":"STAIRS:UP:GREEN|PURPLE:SHELF_UP","F":"PURPLE|BLUE:UP","G":"TRIGGER:BLUE:E|GREEN:UP","H":"GREEN|BLUE:UP:2","I":"BLUE|YELLOW:UP:2","J":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 184, name: "Lantern Glow", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,"D",null,null,null],[null,"E",null,"F",null]],[[null,"C",null,null,null],["A","B",null,"G","H"]]], pieces: ["OUT:RED|BLUE:RIGHT","BLUE|RED:UP","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","TRIGGER:GREEN:B|BLUE:DOWN","BLUE|ORANGE:RIGHT:2","STAIRS:UP:ORANGE|BLUE:SHELF_UP","BLUE|YELLOW:RIGHT","IN:YELLOW"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"BLUE|RED:UP","C":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","D":"TRIGGER:GREEN:B|BLUE:DOWN","E":"BLUE|ORANGE:RIGHT:2","F":"STAIRS:UP:ORANGE|BLUE:SHELF_UP","G":"BLUE|YELLOW:RIGHT","H":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 185, name: "Coral Reef", cells: ["A","B","C","D","E","F","G","H"], layout: [[[null,null,null,"H"],["B",null,null,null],["A",null,null,null]],[[null,null,"F","G"],["C","D","E",null],[null,null,null,null]]], pieces: ["OUT:RED|GREEN:UP","STAIRS:UP:GREEN|BLUE:SHELF_UP","BLUE|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:UP","TRIGGER:PURPLE:C|YELLOW:RIGHT","STAIRS:DOWN:YELLOW|RED:SHELF_DOWN","IN:RED"], solution: {"A":"OUT:RED|GREEN:UP","B":"STAIRS:UP:GREEN|BLUE:SHELF_UP","C":"BLUE|GREEN:RIGHT","D":"GREEN|BLUE:RIGHT","E":"BLUE|PURPLE:UP","F":"TRIGGER:PURPLE:C|YELLOW:RIGHT","G":"STAIRS:DOWN:YELLOW|RED:SHELF_DOWN","H":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 186, name: "Paper Crane", cells: ["A","B","C","D","E","F","G","H"], layout: [[["C","D","E","H"],[null,null,"F","G"]],[["B","A",null,null],[null,null,null,null]]], pieces: ["OUT:RED|PURPLE:LEFT","STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","RED|BLUE:RIGHT","TRIGGER:BLUE:B|GREEN:RIGHT","PIPE:LEFT:GREEN>DOWN:RED","RED|GREEN:RIGHT","GREEN|YELLOW:UP","IN:YELLOW"], solution: {"A":"OUT:RED|PURPLE:LEFT","B":"STAIRS:DOWN:PURPLE|RED:SHELF_DOWN","C":"RED|BLUE:RIGHT","D":"TRIGGER:BLUE:B|GREEN:RIGHT","E":"PIPE:LEFT:GREEN>DOWN:RED","F":"RED|GREEN:RIGHT","G":"GREEN|YELLOW:UP","H":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 187, name: "Bamboo Wind", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,"E","F","I"],[null,null,null,"G","H"],[null,null,null,null,null],[null,null,null,null,null]],[["C",null,"D",null,null],[null,null,null,null,null],["B",null,null,null,null],["A",null,null,null,null]]], pieces: ["OUT:RED|PURPLE:UP","PURPLE|RED:UP:2","RED|GREEN:RIGHT:2","STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN","PURPLE|RED:RIGHT","RED|YELLOW:DOWN","YELLOW|RED:RIGHT","TRIGGER:RED:F|BLUE:UP","IN:BLUE"], solution: {"A":"OUT:RED|PURPLE:UP","B":"PURPLE|RED:UP:2","C":"RED|GREEN:RIGHT:2","D":"STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN","E":"PURPLE|RED:RIGHT","F":"RED|YELLOW:DOWN","G":"YELLOW|RED:RIGHT","H":"TRIGGER:RED:F|BLUE:UP","I":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 188, name: "River Stone", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,null,null],[null,null,null,"F"],[null,null,null,null],[null,"I","H","G"]],[["A","B","C",null],[null,null,"D","E"],[null,null,null,null],[null,null,null,null]]], pieces: ["OUT:RED|BLUE:RIGHT","PIPE:LEFT:BLUE>RIGHT:GREEN","GREEN|BLUE:DOWN","BLUE|RED:RIGHT","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","GREEN|RED:DOWN:2","PIPE:UP:RED>LEFT:YELLOW","TRIGGER:YELLOW:E|RED:LEFT","IN:RED"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"PIPE:LEFT:BLUE>RIGHT:GREEN","C":"GREEN|BLUE:DOWN","D":"BLUE|RED:RIGHT","E":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","F":"GREEN|RED:DOWN:2","G":"PIPE:UP:RED>LEFT:YELLOW","H":"TRIGGER:YELLOW:E|RED:LEFT","I":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 189, name: "Cloud Garden", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[["I","H","G","F"],[null,null,"D","E"],[null,null,"C",null]],[[null,null,null,null],[null,null,null,null],[null,null,"B","A"]]], pieces: ["OUT:RED|RED:LEFT","STAIRS:DOWN:RED|PURPLE:SHELF_DOWN","PURPLE|RED:UP","RED|BLUE:RIGHT","TRIGGER:BLUE:C|CYAN:UP","CYAN|RED:LEFT","RED|BLUE:LEFT","BLUE|YELLOW:LEFT","IN:YELLOW"], solution: {"A":"OUT:RED|RED:LEFT","B":"STAIRS:DOWN:RED|PURPLE:SHELF_DOWN","C":"PURPLE|RED:UP","D":"RED|BLUE:RIGHT","E":"TRIGGER:BLUE:C|CYAN:UP","F":"CYAN|RED:LEFT","G":"RED|BLUE:LEFT","H":"BLUE|YELLOW:LEFT","I":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 190, name: "Honey Light", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,null],[null,null,null],[null,null,null],[null,"A","B"],[null,null,"C"]],[["I",null,null],["H","G",null],[null,"F",null],[null,null,null],[null,"E","D"]]], pieces: ["OUT:RED|PINK:RIGHT","PINK|RED:DOWN","STAIRS:UP:RED|BLUE:SHELF_UP","BLUE|YELLOW:LEFT","YELLOW|PURPLE:UP:2","PURPLE|BLUE:UP","BLUE|RED:LEFT","TRIGGER:RED:F|BLUE:UP","IN:BLUE"], solution: {"A":"OUT:RED|PINK:RIGHT","B":"PINK|RED:DOWN","C":"STAIRS:UP:RED|BLUE:SHELF_UP","D":"BLUE|YELLOW:LEFT","E":"YELLOW|PURPLE:UP:2","F":"PURPLE|BLUE:UP","G":"BLUE|RED:LEFT","H":"TRIGGER:RED:F|BLUE:UP","I":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 191, name: "Pebble Shore", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[[null,null,"F","I","J"],[null,null,"G","H",null],[null,null,null,null,null],[null,null,null,null,null]],[[null,"D","E",null,null],[null,null,null,null,null],[null,"C",null,null,null],["A","B",null,null,null]]], pieces: ["OUT:RED|BLUE:RIGHT","BLUE|PURPLE:UP","PURPLE|YELLOW:UP:2","TRIGGER:YELLOW:B|GREEN:RIGHT","STAIRS:DOWN:GREEN|RED:SHELF_DOWN","RED|BLUE:DOWN","BLUE|RED:RIGHT","TRIGGER:RED:E|YELLOW:UP","TRIGGER:YELLOW:F|RED:RIGHT","IN:RED"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"BLUE|PURPLE:UP","C":"PURPLE|YELLOW:UP:2","D":"TRIGGER:YELLOW:B|GREEN:RIGHT","E":"STAIRS:DOWN:GREEN|RED:SHELF_DOWN","F":"RED|BLUE:DOWN","G":"BLUE|RED:RIGHT","H":"TRIGGER:RED:E|YELLOW:UP","I":"TRIGGER:YELLOW:F|RED:RIGHT","J":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 192, name: "Candle Flame", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[[null,null,null,null],[null,null,null,null],[null,null,"I","J"],[null,null,"H",null]],[["B","C",null,null],["A","D",null,null],[null,"E",null,null],[null,"F","G",null]]], pieces: ["OUT:RED|RED:UP","PIPE:DOWN:RED>RIGHT:PINK","PINK|BLUE:DOWN","PIPE:UP:BLUE>DOWN:YELLOW","PIPE:UP:YELLOW>DOWN:RED","RED|GREEN:RIGHT","STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN","TRIGGER:BLUE:F|GREEN:UP","TRIGGER:GREEN:E|RED:RIGHT","IN:RED"], solution: {"A":"OUT:RED|RED:UP","B":"PIPE:DOWN:RED>RIGHT:PINK","C":"PINK|BLUE:DOWN","D":"PIPE:UP:BLUE>DOWN:YELLOW","E":"PIPE:UP:YELLOW>DOWN:RED","F":"RED|GREEN:RIGHT","G":"STAIRS:DOWN:GREEN|BLUE:SHELF_DOWN","H":"TRIGGER:BLUE:F|GREEN:UP","I":"TRIGGER:GREEN:E|RED:RIGHT","J":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 193, name: "Silk Thread", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[[null,null,null,null,null],[null,null,null,"A","B"]],[["G","J","F","E",null],["H","I",null,"D","C"]]], pieces: ["OUT:RED|CYAN:RIGHT","STAIRS:UP:CYAN|RED:SHELF_UP","RED|BLUE:LEFT","TRIGGER:BLUE:B|PURPLE:UP","TRIGGER:PURPLE:C|RED:LEFT","RED|BLUE:LEFT:2","BLUE|PURPLE:DOWN","PURPLE|BLUE:RIGHT","BLUE|GREEN:UP","IN:GREEN"], solution: {"A":"OUT:RED|CYAN:RIGHT","B":"STAIRS:UP:CYAN|RED:SHELF_UP","C":"RED|BLUE:LEFT","D":"TRIGGER:BLUE:B|PURPLE:UP","E":"TRIGGER:PURPLE:C|RED:LEFT","F":"RED|BLUE:LEFT:2","G":"BLUE|PURPLE:DOWN","H":"PURPLE|BLUE:RIGHT","I":"BLUE|GREEN:UP","J":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 194, name: "Crystal Cave", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[["I",null,null,null],["H","E","D",null],["G","F",null,null],[null,null,"C",null]],[[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,"B","A"]]], pieces: ["OUT:RED|BLUE:LEFT","STAIRS:DOWN:BLUE|RED:SHELF_DOWN","RED|YELLOW:UP:2","PIPE:DOWN:YELLOW>LEFT:BLUE","PIPE:RIGHT:BLUE>DOWN:GREEN","GREEN|PURPLE:LEFT","PIPE:RIGHT:PURPLE>UP:RED","TRIGGER:RED:D|GREEN:UP","IN:GREEN"], solution: {"A":"OUT:RED|BLUE:LEFT","B":"STAIRS:DOWN:BLUE|RED:SHELF_DOWN","C":"RED|YELLOW:UP:2","D":"PIPE:DOWN:YELLOW>LEFT:BLUE","E":"PIPE:RIGHT:BLUE>DOWN:GREEN","F":"GREEN|PURPLE:LEFT","G":"PIPE:RIGHT:PURPLE>UP:RED","H":"TRIGGER:RED:D|GREEN:UP","I":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 195, name: "Painted Sky", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[[null,null,null,null,"H"],[null,null,"F",null,"G"],[null,null,null,null,null],[null,null,null,null,null]],[[null,null,null,null,"I"],[null,null,"E",null,null],[null,null,"D",null,null],["A","B","C",null,null]]], pieces: ["OUT:RED|CYAN:RIGHT","PIPE:LEFT:CYAN>RIGHT:RED","PIPE:LEFT:RED>UP:BLUE","PIPE:DOWN:BLUE>UP:RED","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","GREEN|BLUE:RIGHT:2","TRIGGER:BLUE:E|RED:UP","STAIRS:UP:RED|PINK:SHELF_UP","IN:PINK"], solution: {"A":"OUT:RED|CYAN:RIGHT","B":"PIPE:LEFT:CYAN>RIGHT:RED","C":"PIPE:LEFT:RED>UP:BLUE","D":"PIPE:DOWN:BLUE>UP:RED","E":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","F":"GREEN|BLUE:RIGHT:2","G":"TRIGGER:BLUE:E|RED:UP","H":"STAIRS:UP:RED|PINK:SHELF_UP","I":"IN:PINK"}, hint: "Use all pieces correctly!" },
{ number: 196, name: "Fern Hollow", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[["D","C",null,null],["E","H",null,"I"],["F","G",null,null]],[["A","B",null,null],[null,null,null,null],[null,null,null,null]]], pieces: ["OUT:RED|PINK:RIGHT","STAIRS:DOWN:PINK|RED:SHELF_DOWN","RED|GREEN:LEFT","GREEN|ORANGE:DOWN","TRIGGER:ORANGE:C|PURPLE:DOWN","PURPLE|RED:RIGHT","TRIGGER:RED:D|BLUE:UP","BLUE|GREEN:RIGHT:2","IN:GREEN"], solution: {"A":"OUT:RED|PINK:RIGHT","B":"STAIRS:DOWN:PINK|RED:SHELF_DOWN","C":"RED|GREEN:LEFT","D":"GREEN|ORANGE:DOWN","E":"TRIGGER:ORANGE:C|PURPLE:DOWN","F":"PURPLE|RED:RIGHT","G":"TRIGGER:RED:D|BLUE:UP","H":"BLUE|GREEN:RIGHT:2","I":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 197, name: "Opal Stream", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[["E","D",null,null],["F","G","H","I"],[null,null,null,"J"]],[[null,"C","B",null],[null,null,"A",null],[null,null,null,null]]], pieces: ["OUT:RED|BLUE:UP","BLUE|RED:LEFT","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","TRIGGER:GREEN:B|BLUE:LEFT","PIPE:RIGHT:BLUE>DOWN:GREEN","GREEN|RED:RIGHT","PIPE:LEFT:RED>RIGHT:BLUE","PIPE:LEFT:BLUE>RIGHT:RED","TRIGGER:RED:F|BLUE:DOWN","IN:BLUE"], solution: {"A":"OUT:RED|BLUE:UP","B":"BLUE|RED:LEFT","C":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","D":"TRIGGER:GREEN:B|BLUE:LEFT","E":"PIPE:RIGHT:BLUE>DOWN:GREEN","F":"GREEN|RED:RIGHT","G":"PIPE:LEFT:RED>RIGHT:BLUE","H":"PIPE:LEFT:BLUE>RIGHT:RED","I":"TRIGGER:RED:F|BLUE:DOWN","J":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 198, name: "Raindrop", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[[null,null,null,null,"C"],[null,null,null,null,"D"],[null,null,null,null,null],[null,null,"G","F","E"],["J","I","H",null,null]],[[null,null,null,"A","B"],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]]], pieces: ["OUT:RED|RED:RIGHT","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","BLUE|RED:DOWN","RED|PURPLE:DOWN:2","PURPLE|RED:LEFT","PIPE:RIGHT:RED>LEFT:PINK","TRIGGER:PINK:D|BLUE:DOWN","BLUE|RED:LEFT","PIPE:RIGHT:RED>LEFT:BLUE","IN:BLUE"], solution: {"A":"OUT:RED|RED:RIGHT","B":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","C":"BLUE|RED:DOWN","D":"RED|PURPLE:DOWN:2","E":"PURPLE|RED:LEFT","F":"PIPE:RIGHT:RED>LEFT:PINK","G":"TRIGGER:PINK:D|BLUE:DOWN","H":"BLUE|RED:LEFT","I":"PIPE:RIGHT:RED>LEFT:BLUE","J":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 199, name: "Cedar Shade", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[[null,null,null,null],[null,"E","D",null],[null,null,"C","B"],[null,null,null,"A"]],[["J",null,null,null],["I","F",null,null],["H","G",null,null],[null,null,null,null]]], pieces: ["OUT:RED|ORANGE:UP","PIPE:DOWN:ORANGE>LEFT:RED","RED|GREEN:UP","GREEN|BLUE:LEFT","STAIRS:UP:BLUE|PURPLE:SHELF_UP","PURPLE|BLUE:DOWN","BLUE|GREEN:LEFT","GREEN|BLUE:UP","TRIGGER:BLUE:G|RED:UP","IN:RED"], solution: {"A":"OUT:RED|ORANGE:UP","B":"PIPE:DOWN:ORANGE>LEFT:RED","C":"RED|GREEN:UP","D":"GREEN|BLUE:LEFT","E":"STAIRS:UP:BLUE|PURPLE:SHELF_UP","F":"PURPLE|BLUE:DOWN","G":"BLUE|GREEN:LEFT","H":"GREEN|BLUE:UP","I":"TRIGGER:BLUE:G|RED:UP","J":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 200, name: "Glass Bloom", cells: ["A","B","C","D","E","F","G","H","I","J"], layout: [[["A","B",null,null,null],[null,null,null,null,"J"],[null,null,null,null,"I"],[null,null,null,"G","H"]],[[null,"C",null,null,null],[null,null,null,null,null],[null,"D",null,"E",null],[null,null,null,"F",null]]], pieces: ["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|PURPLE:SHELF_UP","PURPLE|RED:DOWN:2","RED|GREEN:RIGHT:2","GREEN|RED:DOWN","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","TRIGGER:GREEN:E|BLUE:RIGHT","TRIGGER:BLUE:E|RED:UP","RED|BLUE:UP","IN:BLUE"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|PURPLE:SHELF_UP","C":"PURPLE|RED:DOWN:2","D":"RED|GREEN:RIGHT:2","E":"GREEN|RED:DOWN","F":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","G":"TRIGGER:GREEN:E|BLUE:RIGHT","H":"TRIGGER:BLUE:E|RED:UP","I":"RED|BLUE:UP","J":"IN:BLUE"}, hint: "Use all pieces correctly!" },
{ number: 201, name: "Copper Moon", cells: ["A","B","C","D","E","F","G","H","I","J","K"], layout: [[[null,null,null,null],[null,null,null,null],["F","E",null,null],[null,"D","C",null]],[[null,null,null,null],[null,null,null,null],["G","H",null,null],[null,null,"B","A"]],[[null,"K",null,null],[null,"J",null,null],[null,"I",null,null],[null,null,null,null]]], pieces: ["OUT:RED|PURPLE:LEFT","STAIRS:DOWN:PURPLE|BLUE:SHELF_DOWN","PIPE:SHELF_UP:BLUE>LEFT:RED","RED|BLUE:UP","BLUE|GREEN:LEFT","STAIRS:UP:GREEN|PURPLE:SHELF_UP","PURPLE|RED:RIGHT","STAIRS:UP:RED|PURPLE:SHELF_UP","TRIGGER:PURPLE:G|BLUE:UP","PIPE:DOWN:BLUE>UP:RED","IN:RED"], solution: {"A":"OUT:RED|PURPLE:LEFT","B":"STAIRS:DOWN:PURPLE|BLUE:SHELF_DOWN","C":"PIPE:SHELF_UP:BLUE>LEFT:RED","D":"RED|BLUE:UP","E":"BLUE|GREEN:LEFT","F":"STAIRS:UP:GREEN|PURPLE:SHELF_UP","G":"PURPLE|RED:RIGHT","H":"STAIRS:UP:RED|PURPLE:SHELF_UP","I":"TRIGGER:PURPLE:G|BLUE:UP","J":"PIPE:DOWN:BLUE>UP:RED","K":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 202, name: "Snow Blossom", cells: ["A","B","C","D","E","F","G","H","I","J","K"], layout: [[[null,null,null,null,null],[null,"D",null,null,null],[null,"E","F",null,null],[null,null,null,null,null],[null,null,"G","H","I"]],[["A","B",null,null,null],[null,"C",null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,"K","J"]]], pieces: ["OUT:RED|CYAN:RIGHT","PIPE:LEFT:CYAN>DOWN:RED","STAIRS:DOWN:RED|GREEN:SHELF_DOWN","GREEN|PURPLE:DOWN","PURPLE|BLUE:RIGHT","BLUE|GREEN:DOWN:2","TRIGGER:GREEN:E|RED:RIGHT","PIPE:LEFT:RED>RIGHT:YELLOW","STAIRS:UP:YELLOW|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","IN:PURPLE"], solution: {"A":"OUT:RED|CYAN:RIGHT","B":"PIPE:LEFT:CYAN>DOWN:RED","C":"STAIRS:DOWN:RED|GREEN:SHELF_DOWN","D":"GREEN|PURPLE:DOWN","E":"PURPLE|BLUE:RIGHT","F":"BLUE|GREEN:DOWN:2","G":"TRIGGER:GREEN:E|RED:RIGHT","H":"PIPE:LEFT:RED>RIGHT:YELLOW","I":"STAIRS:UP:YELLOW|GREEN:SHELF_UP","J":"GREEN|PURPLE:LEFT","K":"IN:PURPLE"}, hint: "Use all pieces correctly!" },
{ number: 203, name: "Jade Mirror", cells: ["A","B","C","D","E","F","G","H","I","J","K"], layout: [[[null,"E",null,null,null],[null,"D",null,null,null],[null,"C",null,null,null]],[[null,"F","G","H","I"],[null,null,null,"K","J"],["A","B",null,null,null]]], pieces: ["OUT:RED|YELLOW:RIGHT","STAIRS:DOWN:YELLOW|ORANGE:SHELF_DOWN","ORANGE|GREEN:UP","GREEN|PURPLE:UP","STAIRS:UP:PURPLE|ORANGE:SHELF_UP","TRIGGER:ORANGE:C|RED:RIGHT","PIPE:LEFT:RED>RIGHT:BLUE","BLUE|GREEN:RIGHT","PIPE:LEFT:GREEN>DOWN:RED","PIPE:UP:RED>LEFT:YELLOW","IN:YELLOW"], solution: {"A":"OUT:RED|YELLOW:RIGHT","B":"STAIRS:DOWN:YELLOW|ORANGE:SHELF_DOWN","C":"ORANGE|GREEN:UP","D":"GREEN|PURPLE:UP","E":"STAIRS:UP:PURPLE|ORANGE:SHELF_UP","F":"TRIGGER:ORANGE:C|RED:RIGHT","G":"PIPE:LEFT:RED>RIGHT:BLUE","H":"BLUE|GREEN:RIGHT","I":"PIPE:LEFT:GREEN>DOWN:RED","J":"PIPE:UP:RED>LEFT:YELLOW","K":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
  // === CONDUITS (204-213) ===
  { number: 204, name: "First Conduit", cells: ["A","B","C","D"], layout: [["A",null],[null,"B"],["C","D"]], conduits: [{"from":{"cell":"A","dir":"DOWN"},"to":{"cell":"C","dir":"LEFT"}},{"from":{"cell":"B","dir":"UP"},"to":{"cell":"A","dir":"RIGHT"}}], pieces: ["RED|BLUE:DOWN","PURPLE|RED:UP","BLUE|GREEN:RIGHT","GREEN|PURPLE:UP"], solution: {"A":"RED|BLUE:DOWN","B":"PURPLE|RED:UP","C":"BLUE|GREEN:RIGHT","D":"GREEN|PURPLE:UP"}, hint: "The conduit carries your signal around!" },
  { number: 205, name: "Around the Bend", cells: ["A","B","C","D","E"], layout: [["A","B",null],[null,"C","D"],[null,null,"E"]], conduits: [{"from":{"cell":"E","dir":"LEFT"},"to":{"cell":"A","dir":"LEFT"}}], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN","ORANGE|RED:LEFT"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","C":"GREEN|PURPLE:RIGHT","D":"PURPLE|ORANGE:DOWN","E":"ORANGE|RED:LEFT"}, hint: "The conduit wraps around the staircase!" },
  { number: 206, name: "Signal Loop", cells: ["A","B","C","D","E"], layout: [["A","B"],[null,"C"],["D","E"]], conduits: [{"from":{"cell":"D","dir":"UP"},"to":{"cell":"A","dir":"LEFT"}}], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","ORANGE|RED:UP"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","C":"GREEN|PURPLE:DOWN","E":"PURPLE|ORANGE:LEFT","D":"ORANGE|RED:UP"}, hint: "The conduit wraps the signal back to the top!" },
  { number: 207, name: "Diagonal Hook", cells: ["A","B","C","D","E"], layout: [[null,"A","B"],["C",null,null],[null,"D","E"]], conduits: [{"from":{"cell":"B","dir":"DOWN"},"to":{"cell":"E","dir":"RIGHT"}},{"from":{"cell":"D","dir":"LEFT"},"to":{"cell":"C","dir":"DOWN"}},{"from":{"cell":"C","dir":"UP"},"to":{"cell":"A","dir":"LEFT"}}], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:LEFT","PURPLE|ORANGE:LEFT","ORANGE|RED:UP"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","E":"GREEN|PURPLE:LEFT","D":"PURPLE|ORANGE:LEFT","C":"ORANGE|RED:UP"}, hint: "Conduits route signals around the hook!" },
  { number: 208, name: "Signal Fork", cells: ["A","B","C","D","E","F"], layout: [["A","B",null],[null,"C",null],["F","D","E"]], conduits: [{"from":{"cell":"A","dir":"DOWN"},"to":{"cell":"F","dir":"LEFT"}}], pieces: ["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:DOWN","PURPLE|ORANGE:DOWN","GREEN|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","CYAN|ORANGE:LEFT"], solution: {"A":"RED|BLUE:RIGHT,GREEN:DOWN","B":"BLUE|PURPLE:DOWN","C":"PURPLE|ORANGE:DOWN","F":"GREEN|ORANGE:RIGHT","D":"ORANGE|CYAN:RIGHT","E":"CYAN|ORANGE:LEFT"}, hint: "A multi-output piece feeds the conduit!" },
  { number: 209, name: "Slant Route", cells: ["A","B","C","D","E","F"], layout: [["A",null,"B"],["C","D",null],[null,null,"E"],[null,"F",null]], conduits: [{"from":{"cell":"A","dir":"RIGHT"},"to":{"cell":"B","dir":"LEFT"}}], pieces: ["RED|GREEN:DOWN,BLUE:RIGHT","BLUE|PURPLE:DOWN_LEFT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN_RIGHT","ORANGE|CYAN:DOWN_LEFT","CYAN|ORANGE:UP_RIGHT"], solution: {"A":"RED|GREEN:DOWN,BLUE:RIGHT","B":"BLUE|PURPLE:DOWN_LEFT","C":"GREEN|PURPLE:RIGHT","D":"PURPLE|ORANGE:DOWN_RIGHT","E":"ORANGE|CYAN:DOWN_LEFT","F":"CYAN|ORANGE:UP_RIGHT"}, hint: "Diagonals and conduits combine!" },
  { number: 210, name: "Warp Grid", cells: ["A","B","C","D","E","F","G"], layout: [["A","B",null,null],[null,"C","D",null],[null,null,"E","F"],[null,null,null,"G"]], conduits: [{"from":{"cell":"G","dir":"LEFT"},"to":{"cell":"A","dir":"DOWN"}}], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN","ORANGE|CYAN:RIGHT","CYAN|PINK:DOWN","PINK|RED:LEFT"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","C":"GREEN|PURPLE:RIGHT","D":"PURPLE|ORANGE:DOWN","E":"ORANGE|CYAN:RIGHT","F":"CYAN|PINK:DOWN","G":"PINK|RED:LEFT"}, hint: "The conduit wraps the entire grid!" },
  { number: 211, name: "Triple Path", cells: ["A","B","C","D","E","F","G","H"], layout: [[null,"A","B"],[null,null,"C"],["D","E",null],["F",null,"G"],[null,"H",null]], conduits: [{"from":{"cell":"C","dir":"DOWN"},"to":{"cell":"G","dir":"UP"}},{"from":{"cell":"H","dir":"LEFT"},"to":{"cell":"F","dir":"DOWN"}}], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:DOWN","PURPLE|ORANGE:DOWN_LEFT","ORANGE|CYAN:LEFT","CYAN|RED:UP","RED|PINK:RIGHT","PINK|GREEN:UP_RIGHT"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","C":"GREEN|PURPLE:DOWN","G":"PURPLE|ORANGE:DOWN_LEFT","H":"ORANGE|CYAN:LEFT","F":"CYAN|RED:UP","D":"RED|PINK:RIGHT","E":"PINK|GREEN:UP_RIGHT"}, hint: "Diagonals and conduits weave through the grid!" },
  { number: 212, name: "Color Cascade", cells: ["A","B","C","D","E","F","G","H"], layout: [["A","B",null,null],[null,"C","D",null],[null,null,"E","F"],["G",null,null,"H"]], conduits: [{"from":{"cell":"H","dir":"LEFT"},"to":{"cell":"G","dir":"RIGHT"}},{"from":{"cell":"G","dir":"UP"},"to":{"cell":"A","dir":"LEFT"}}], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN","ORANGE|CYAN:RIGHT","CYAN|PINK:DOWN","PINK|RED:LEFT","RED|RED:UP"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:DOWN","C":"GREEN|PURPLE:RIGHT","D":"PURPLE|ORANGE:DOWN","E":"ORANGE|CYAN:RIGHT","F":"CYAN|PINK:DOWN","H":"PINK|RED:LEFT","G":"RED|RED:UP"}, hint: "The cascade wraps back on itself!" },
  { number: 213, name: "Nexus Loop", cells: ["A","B","C","D","E","F","G","H","I"], layout: [[null,"A",null,null],["B","C","D",null],[null,null,"E","F"],[null,"G",null,null],[null,"H","I",null]], conduits: [{"from":{"cell":"F","dir":"DOWN"},"to":{"cell":"G","dir":"UP"}},{"from":{"cell":"I","dir":"UP"},"to":{"cell":"A","dir":"UP"}}], pieces: ["RED|GREEN:DOWN","YELLOW|GREEN:RIGHT","GREEN|PURPLE:RIGHT,ORANGE:DOWN_RIGHT","PURPLE|ORANGE:DOWN","ORANGE|CYAN:RIGHT","CYAN|BLUE:DOWN","BLUE|PINK:DOWN","PINK|RED:RIGHT","RED|RED:UP"], solution: {"A":"RED|GREEN:DOWN","B":"YELLOW|GREEN:RIGHT","C":"GREEN|PURPLE:RIGHT,ORANGE:DOWN_RIGHT","D":"PURPLE|ORANGE:DOWN","E":"ORANGE|CYAN:RIGHT","F":"CYAN|BLUE:DOWN","G":"BLUE|PINK:DOWN","H":"PINK|RED:RIGHT","I":"RED|RED:UP"}, hint: "The ultimate conduit challenge!" },
  { number: 214, name: "Bridge Up", cells: ["A","B","C","D","E"], layout: [[["A",null,"B"]],[["C","D","E"]]], conduits: [{"from":{"cell":"A","dir":"RIGHT"},"to":{"cell":"B","dir":"LEFT"}}], pieces: ["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","PURPLE|ORANGE:LEFT","IN:ORANGE"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP","E":"GREEN|PURPLE:LEFT","D":"PURPLE|ORANGE:LEFT","C":"IN:ORANGE"}, hint: "The conduit bridges a gap on the same shelf!" },
  { number: 215, name: "Upper Loop", cells: ["A","B","C","D","E"], layout: [[["A","B"]],[["C","D"],["E",null]]], conduits: [{"from":{"cell":"D","dir":"DOWN"},"to":{"cell":"E","dir":"RIGHT"}}], pieces: ["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:DOWN","PURPLE|ORANGE:UP","IN:ORANGE"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP","D":"GREEN|PURPLE:DOWN","E":"PURPLE|ORANGE:UP","C":"IN:ORANGE"}, hint: "The conduit routes around on the upper shelf!" },
  { number: 216, name: "Split Route", cells: ["A","B","C","D","E"], layout: [[["A",null,"B"]],[["C","D","E"]]], conduits: [{"from":{"cell":"A","dir":"RIGHT"},"to":{"cell":"B","dir":"LEFT"}}], pieces: ["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","PURPLE|CYAN:LEFT","IN:CYAN"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP","E":"GREEN|PURPLE:LEFT","D":"PURPLE|CYAN:LEFT","C":"IN:CYAN"}, hint: "A conduit bridges the gap, stairs change shelves!" },
  { number: 217, name: "Spiral Route", cells: ["A","B","C","D","E","F"], layout: [[["A","B","C"]],[["D",null,"E"],["F",null,null]]], conduits: [{"from":{"cell":"E","dir":"LEFT"},"to":{"cell":"D","dir":"RIGHT"}}], pieces: ["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","STAIRS:UP:GREEN|PURPLE:SHELF_UP","PURPLE|ORANGE:LEFT","ORANGE|CYAN:DOWN","IN:CYAN"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"BLUE|GREEN:RIGHT","C":"STAIRS:UP:GREEN|PURPLE:SHELF_UP","E":"PURPLE|ORANGE:LEFT","D":"ORANGE|CYAN:DOWN","F":"IN:CYAN"}, hint: "The conduit routes around a gap on the upper shelf!" },
  { number: 218, name: "Tower Bypass", cells: ["A","B","C","D"], layout: [[["A",null,"B"]],[["C",null,"D"]]], conduits: [{"from":{"cell":"A","dir":"RIGHT"},"to":{"cell":"B","dir":"LEFT"}},{"from":{"cell":"D","dir":"LEFT"},"to":{"cell":"C","dir":"RIGHT"}}], pieces: ["RED|BLUE:RIGHT","BLUE|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","PURPLE|RED:SHELF_DOWN"], solution: {"A":"RED|BLUE:RIGHT","B":"BLUE|GREEN:SHELF_UP","D":"GREEN|PURPLE:LEFT","C":"PURPLE|RED:SHELF_DOWN"}, hint: "Conduits bridge gaps on each shelf!" },
  { number: 219, name: "Diagonal Relay", cells: ["A","B","C","D","E"], layout: [[["A","B"]],[["C","D"],[null,"E"]]], conduits: [{"from":{"cell":"E","dir":"LEFT"},"to":{"cell":"C","dir":"DOWN"}}], pieces: ["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","IN:ORANGE"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP","D":"GREEN|PURPLE:DOWN","E":"PURPLE|ORANGE:LEFT","C":"IN:ORANGE"}, hint: "The conduit loops back on the same shelf!" },
  {number:220,name: "Dual Routes",cells:["A","B","C","D","E"],layout:[[["A",null,"B"]],[["C","D","E"]]],conduits:[{"from":{"cell":"A","dir":"RIGHT"},"to":{"cell":"B","dir":"LEFT"}}],pieces:["RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","PURPLE|ORANGE:LEFT","ORANGE|RED:SHELF_DOWN"],solution:{"A":"RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP","E":"GREEN|PURPLE:LEFT","D":"PURPLE|ORANGE:LEFT","C":"ORANGE|RED:SHELF_DOWN"},hint:"A conduit and stairs work in harmony!"},
  { number: 221, name: "High Wire", cells: ["A","B","C","D","E"], layout: [[["A","B"]],[["C","D"],[null,"E"]]], conduits: [{"from":{"cell":"E","dir":"LEFT"},"to":{"cell":"C","dir":"DOWN"}}], pieces: ["RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","ORANGE|RED:SHELF_DOWN"], solution: {"A":"RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP","D":"GREEN|PURPLE:DOWN","E":"PURPLE|ORANGE:LEFT","C":"ORANGE|RED:SHELF_DOWN"}, hint: "The conduit loops back on the upper shelf!" },
  { number: 222, name: "Fork & Bridge", cells: ["A","B","C","D","E","F"], layout: [[["A","B","C"]],[["D",null,"E"],["F",null,null]]], conduits: [{"from":{"cell":"E","dir":"LEFT"},"to":{"cell":"D","dir":"RIGHT"}}], pieces: ["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","STAIRS:UP:GREEN|PURPLE:SHELF_UP","PURPLE|ORANGE:LEFT","ORANGE|CYAN:DOWN","IN:CYAN"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"BLUE|GREEN:RIGHT","C":"STAIRS:UP:GREEN|PURPLE:SHELF_UP","E":"PURPLE|ORANGE:LEFT","D":"ORANGE|CYAN:DOWN","F":"IN:CYAN"}, hint: "The conduit routes around a gap!" },
  { number: 223, name: "Nexus Bridge", cells: ["A","B","C","D","E","F","G","H"], layout: [[["A","B","C","D"]],[["E",null,null,"F"],["G",null,null,"H"]]], conduits: [{"from":{"cell":"F","dir":"LEFT"},"to":{"cell":"E","dir":"RIGHT"}},{"from":{"cell":"G","dir":"RIGHT"},"to":{"cell":"H","dir":"LEFT"}}], pieces: ["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP","ORANGE|CYAN:LEFT","CYAN|PINK:DOWN","PINK|RED:RIGHT","IN:RED"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"BLUE|GREEN:RIGHT","C":"GREEN|PURPLE:RIGHT","D":"STAIRS:UP:PURPLE|ORANGE:SHELF_UP","F":"ORANGE|CYAN:LEFT","E":"CYAN|PINK:DOWN","G":"PINK|RED:RIGHT","H":"IN:RED"}, hint: "Two conduits span the upper shelf!" },
  { number:224, name: "Long Leap", cells:["A","B","C"], layout:[[["A"]],[["B"]],[["C"]]], pieces:["STAIRS:UP:RED|BLUE:SHELF_UP:2","IN:GREEN","STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN"], solution:{"A":"STAIRS:UP:RED|BLUE:SHELF_UP:2","C":"STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN","B":"IN:GREEN"}, hint:"Jump two shelves at once!" },
  { number:225, name: "Sky Step", cells:["A","B","C","D"], layout:[[["A","B"]],[[null,null]],[["C","D"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","IN:PURPLE"], solution:{"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP:2","D":"GREEN|PURPLE:LEFT","C":"IN:PURPLE"}, hint:"One piece leaps over a shelf!" },
  { number:226, name: "Elevator", cells:["A","B","C","D","E"], layout:[[["A","B"]],[["C","D"]],[[null,"E"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN","PURPLE|ORANGE:LEFT","IN:ORANGE"], solution:{"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP:2","E":"STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN","D":"PURPLE|ORANGE:LEFT","C":"IN:ORANGE"}, hint:"The elevator skips a floor!" },
  { number:227, name: "Bounce", cells:["A","B","C","D","E"], layout:[[["A","B"]],[["C","D"]],[[null,"E"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|PURPLE:SHELF_UP:2","STAIRS:DOWN:PURPLE|GREEN:SHELF_DOWN","GREEN|CYAN:LEFT","IN:CYAN"], solution:{"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|PURPLE:SHELF_UP:2","E":"STAIRS:DOWN:PURPLE|GREEN:SHELF_DOWN","D":"GREEN|CYAN:LEFT","C":"IN:CYAN"}, hint:"Jump up two then come back down!" },
  { number:228, name: "Rocket", cells:["A","B","C","D"], layout:[[["A"]],[["B"]],[["C"]],[["D"]]], pieces:["STAIRS:UP:RED|BLUE:SHELF_UP:3","IN:PURPLE","STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN","STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN"], solution:{"A":"STAIRS:UP:RED|BLUE:SHELF_UP:3","D":"STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN","C":"STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN","B":"IN:PURPLE"}, hint:"Rocket three shelves up!" },
  { number:229, name: "Express Lane", cells:["A","B","C","D","E"], layout:[[["A",null,"B"]],[["C","D","E"]]], conduits:[{"from":{"cell":"A","dir":"RIGHT"},"to":{"cell":"B","dir":"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","PURPLE|ORANGE:LEFT","IN:ORANGE"], solution:{"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP","E":"GREEN|PURPLE:LEFT","D":"PURPLE|ORANGE:LEFT","C":"IN:ORANGE"}, hint:"Conduit bridges to the stairs!" },
  { number:230, name: "Overpass", cells:["A","B","C","D","E","F"], layout:[[["A","B"]],[["C","D"]],[["E","F"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN","ORANGE|CYAN:RIGHT","IN:CYAN"], solution:{"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP:2","F":"GREEN|PURPLE:LEFT","E":"STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN","C":"ORANGE|CYAN:RIGHT","D":"IN:CYAN"}, hint:"Jump over the middle shelf!" },
  { number:231, name: "Fork Lift", cells:["A","B","C","D","E"], layout:[[["A","B"]],[[null,"C"]],[["D","E"]]], pieces:["OUT:RED|BLUE:RIGHT,GREEN:SHELF_UP:2","STAIRS:UP:BLUE|PURPLE:SHELF_UP","IN:PURPLE","GREEN|CYAN:RIGHT","IN:CYAN"], solution:{"A":"OUT:RED|BLUE:RIGHT,GREEN:SHELF_UP:2","B":"STAIRS:UP:BLUE|PURPLE:SHELF_UP","C":"IN:PURPLE","D":"GREEN|CYAN:RIGHT","E":"IN:CYAN"}, hint:"Multi-output across shelves!" },
  { number:232, name: "Warp Jump", cells:["A","B","C","D"], layout:[[["A","B"]],[[null,null]],[["C","D"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","IN:PURPLE","GREEN|PURPLE:LEFT"], solution:{"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP:2","D":"GREEN|PURPLE:LEFT","C":"IN:PURPLE"}, hint:"Warp up and bounce down!" },
  { number:233, name: "Stratosphere", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN","ORANGE|CYAN:RIGHT","STAIRS:UP:CYAN|PINK:SHELF_UP:2","PINK|RED:LEFT","IN:RED"], solution:{"A":"OUT:RED|BLUE:RIGHT","B":"STAIRS:UP:BLUE|GREEN:SHELF_UP:2","F":"GREEN|PURPLE:LEFT","E":"STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN","C":"ORANGE|CYAN:RIGHT","D":"STAIRS:UP:CYAN|PINK:SHELF_UP:2","H":"PINK|RED:LEFT","G":"IN:RED"}, hint:"Four shelves of jumps!" },
  { number:234, name: "Neurotoxin", cells:["A","B","C","D"], layout:[[["A","B"],["C","D"]]], walls:{"B":["LEFT"]}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:RIGHT","GREEN|PURPLE:UP","IN:PURPLE"], solution:{A:"OUT:RED|BLUE:DOWN",C:"BLUE|GREEN:RIGHT",D:"GREEN|PURPLE:UP",B:"IN:PURPLE"}, hint:"The wall blocks the direct path — go around!" },
  { number:235, name: "Paradox Engine", cells:["A","B","C","D"], layout:[[["A","B"],["C","D"]]], walls:{"B":["LEFT"]}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:RIGHT","GREEN|PURPLE:UP","IN:PURPLE"], solution:{A:"OUT:RED|BLUE:DOWN",C:"BLUE|GREEN:RIGHT",D:"GREEN|PURPLE:UP",B:"IN:PURPLE"}, hint:"You can't enter D from above!" },
  { number:236, name: "Quantum Lattice", cells:["A","B","C","D","E"], layout:[[["A","B","C"],["D","E",null]]], walls:{"B":["LEFT"]}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:RIGHT","GREEN|PURPLE:UP","PURPLE|ORANGE:RIGHT","IN:ORANGE"], solution:{A:"OUT:RED|BLUE:DOWN",D:"BLUE|GREEN:RIGHT",E:"GREEN|PURPLE:UP",B:"PURPLE|ORANGE:RIGHT",C:"IN:ORANGE"}, hint:"Route around the wall on B!" },
  { number:237, name: "Singularity Mesh", cells:["A","B","C","D","E","F"], layout:[[["A","B","C"],["D","E","F"]]], walls:{"A":["DOWN"],"B":["DOWN"]}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","ORANGE|CYAN:LEFT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",F:"PURPLE|ORANGE:LEFT",E:"ORANGE|CYAN:LEFT",D:"IN:CYAN"}, hint:"Two walls force a specific path!" },
  { number:238, name: "Neural Cascade", cells:["A","B","C","D","E","F"], layout:[[["A","B","C"],["D","E","F"]]], walls:{"E":["UP"]}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:UP","ORANGE|CYAN:LEFT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:DOWN",D:"BLUE|GREEN:RIGHT",E:"GREEN|PURPLE:RIGHT",F:"PURPLE|ORANGE:UP",C:"ORANGE|CYAN:LEFT",B:"IN:CYAN"}, hint:"The wall on E forces you downward first!" },
  { number:239, name: "Omega Prism", cells:["A","B","C","D","E","F"], layout:[[["A","B","C"],["D","E","F"]]], walls:{"B":["LEFT"]}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:UP","ORANGE|CYAN:LEFT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:DOWN",D:"BLUE|GREEN:RIGHT",E:"GREEN|PURPLE:RIGHT",F:"PURPLE|ORANGE:UP",C:"ORANGE|CYAN:LEFT",B:"IN:CYAN"}, hint:"Both walls narrow your options!" },
  { number:240, name: "Venom Circuit", cells:["A","B","C","D","E","F","G"], layout:[[["A","B","C"],["D","E","F"],["G",null,null]]], walls:{"E":["UP"]}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","ORANGE|CYAN:LEFT","CYAN|PINK:DOWN","IN:PINK"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",F:"PURPLE|ORANGE:LEFT",E:"ORANGE|CYAN:LEFT",D:"CYAN|PINK:DOWN",G:"IN:PINK"}, hint:"The wall diverts your flow!" },
  { number:241, name: "Acid Rain", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B","C","D"],["E","F","G","H"]]], walls:{"B":["DOWN"],"G":["UP"]}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN","ORANGE|CYAN:LEFT","CYAN|PINK:LEFT","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:RIGHT",D:"PURPLE|ORANGE:DOWN",H:"ORANGE|CYAN:LEFT",G:"CYAN|PINK:LEFT",F:"PINK|RED:LEFT",E:"IN:RED"}, hint:"Walls narrow the corridor!" },
  { number:242, name: "Toxic Maze", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B","C"],["D","E","F"],["G","H",null]]], walls:{"B":["DOWN"],"E":["UP"]}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PIPE:UP:PURPLE>LEFT:ORANGE","ORANGE|CYAN:DOWN","CYAN|PINK:LEFT","PINK|RED:UP","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",F:"PIPE:UP:PURPLE>LEFT:ORANGE",E:"ORANGE|CYAN:DOWN",H:"CYAN|PINK:LEFT",G:"PINK|RED:UP",D:"IN:RED"}, hint:"Walls and pipes create the maze!" },
  { number:243, name: "Dark Pulse", cells:["A","B","C","D","E","F","G","H","I"], layout:[[["A","B","C"],["D","E","F"],["G","H","I"]]], walls:{"B":["DOWN"],"E":["RIGHT"],"H":["UP"]}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|ORANGE:DOWN","ORANGE|CYAN:LEFT","CYAN|PINK:LEFT","PINK|RED:UP","RED|YELLOW:RIGHT","IN:YELLOW"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",F:"PURPLE|ORANGE:DOWN",I:"ORANGE|CYAN:LEFT",H:"CYAN|PINK:LEFT",G:"PINK|RED:UP",D:"RED|YELLOW:RIGHT",E:"IN:YELLOW"}, hint:"Three walls create a fortress maze!" },
  { number:244, name:"Barricade", cells:["A","B","C","D"], layout:[[["A","B","C",null,"D"]]], jumperWalls:{"B":true}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT:2","IN:PURPLE"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:RIGHT:2",D:"IN:PURPLE"}, hint:"You can't jump over B — but you CAN jump over the gap!" },
  { number:245, name:"Blockade", cells:["A","B","C","D","E"], layout:[[["A","B","C","D",null,"E"]]], jumperWalls:{"C":true}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:RIGHT:2","IN:ORANGE"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:RIGHT",D:"PURPLE|ORANGE:RIGHT:2",E:"IN:ORANGE"}, hint:"Can't jump over C, but the gap is fair game!" },
  { number:246, name:"Fortified", cells:["A","B","C","D","E"], layout:[[["A","B","C"],["D",null,"E"]]], jumperWalls:{"B":true}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:RIGHT:2","GREEN|PURPLE:UP","PURPLE|ORANGE:LEFT","IN:ORANGE"], solution:{A:"OUT:RED|BLUE:DOWN",D:"BLUE|GREEN:RIGHT:2",E:"GREEN|PURPLE:UP",C:"PURPLE|ORANGE:LEFT",B:"IN:ORANGE"}, hint:"Jump the gap below, not the wall above!" },
  { number:247, name:"Shield Wall", cells:["A","B","C","D","E","F","G"], layout:[[["A","B","C"],["D",null,"E"],["F",null,"G"]]], jumperWalls:{"B":true,"D":true}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|ORANGE:DOWN","ORANGE|CYAN:LEFT:2","CYAN|PINK:UP","IN:PINK"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",E:"PURPLE|ORANGE:DOWN",G:"ORANGE|CYAN:LEFT:2",F:"CYAN|PINK:UP",D:"IN:PINK"}, hint:"Two jumper walls block shortcuts — find the long way!" },
  { number:248, name:"Double Guard", cells:["A","B","C","D","E","F","G"], layout:[[["A","B","C","D"],["E",null,"F","G"]]], jumperWalls:{"B":true}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN","ORANGE|CYAN:LEFT","CYAN|PINK:LEFT:2","IN:PINK"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:RIGHT",D:"PURPLE|ORANGE:DOWN",G:"ORANGE|CYAN:LEFT",F:"CYAN|PINK:LEFT:2",E:"IN:PINK"}, hint:"Jump the gap, not the wall!" },
  { number:249, name:"Warden", cells:["A","B","C","D","E","F"], layout:[[["A","B","C"],["D","E","F"]]], jumperWalls:{"B":true,"E":true}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","ORANGE|CYAN:LEFT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",F:"PURPLE|ORANGE:LEFT",E:"ORANGE|CYAN:LEFT",D:"IN:CYAN"}, hint:"Both jumper walls force the spiral path!" },
  { number:250, name:"Citadel", cells:["A","B","C","D","E","F","G"], layout:[[["A","B","C"],["D",null,"E"],["F",null,"G"]]], jumperWalls:{"B":true}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:DOWN","GREEN|PURPLE:RIGHT:2","PURPLE|ORANGE:UP","ORANGE|CYAN:UP","CYAN|PINK:LEFT","IN:PINK"], solution:{A:"OUT:RED|BLUE:DOWN",D:"BLUE|GREEN:DOWN",F:"GREEN|PURPLE:RIGHT:2",G:"PURPLE|ORANGE:UP",E:"ORANGE|CYAN:UP",C:"CYAN|PINK:LEFT",B:"IN:PINK"}, hint:"Jump the gap at the bottom, not the wall at the top!" },
  { number:251, name:"Garrison", cells:["A","B","C","D","E","F","G"], layout:[[["A","B","C","D"],["E",null,"F","G"]]], jumperWalls:{"C":true}, pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN","ORANGE|CYAN:LEFT","CYAN|PINK:LEFT:2","IN:PINK"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:RIGHT",D:"PURPLE|ORANGE:DOWN",G:"ORANGE|CYAN:LEFT",F:"CYAN|PINK:LEFT:2",E:"IN:PINK"}, hint:"Jump over the gap, not the wall!" },
  { number:252, name:"Iron Gate", cells:["A","B","C","D","E"], layout:[[["A","B","C"],["D",null,"E"]]], jumperWalls:{"B":true}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:RIGHT:2","PIPE:LEFT:GREEN>UP:PURPLE","PURPLE|ORANGE:LEFT","IN:ORANGE"], solution:{A:"OUT:RED|BLUE:DOWN",D:"BLUE|GREEN:RIGHT:2",E:"PIPE:LEFT:GREEN>UP:PURPLE",C:"PURPLE|ORANGE:LEFT",B:"IN:ORANGE"}, hint:"The pipe redirects the jumped signal!" },
  { number:253, name:"Stronghold", cells:["A","B","C","D","E","F","G"], layout:[[["A","B","C"],["D",null,"E"],["F",null,"G"]]], jumperWalls:{"B":true,"E":true}, pieces:["OUT:RED|BLUE:DOWN","BLUE|GREEN:DOWN","GREEN|PURPLE:RIGHT:2","PURPLE|ORANGE:UP","ORANGE|CYAN:UP","CYAN|PINK:LEFT","IN:PINK"], solution:{A:"OUT:RED|BLUE:DOWN",D:"BLUE|GREEN:DOWN",F:"GREEN|PURPLE:RIGHT:2",G:"PURPLE|ORANGE:UP",E:"ORANGE|CYAN:UP",C:"CYAN|PINK:LEFT",B:"IN:PINK"}, hint:"Two jumper walls — find the one gap you CAN jump!" },
{ number: 254, name: "Razor Wire", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R"], layout: [[[null,null,null,null,null],[null,null,null,null,null],[null,null,"G",null,null],[null,null,null,null,null],[null,null,"H",null,null],[null,null,"I",null,"Q"],[null,null,"J","K","R"],[null,null,null,"L",null]],[["C",null,"D",null,null],[null,null,"E",null,null],["B",null,"F",null,null],["A",null,null,null,null],[null,null,null,null,null],[null,null,null,null,"P"],[null,null,null,null,"O"],[null,null,null,"M","N"]]], pieces: ["OUT:RED|PINK:UP","PINK|BLUE:UP:2","BLUE|RED:RIGHT:2","RED|GREEN:DOWN","GREEN|RED:DOWN","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","BLUE|GREEN:DOWN:2","GREEN|RED:DOWN","RED|BLUE:DOWN","BLUE|ORANGE:RIGHT","PIPE:LEFT:ORANGE>DOWN:RED","STAIRS:UP:RED|BLUE:SHELF_UP","PIPE:SHELF_DOWN:BLUE>RIGHT:GREEN","TRIGGER:GREEN:K|RED:UP","PIPE:DOWN:RED>UP:BLUE","STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN","PIPE:SHELF_UP:GREEN>DOWN:RED","IN:RED"], solution: {"A":"OUT:RED|PINK:UP","B":"PINK|BLUE:UP:2","C":"BLUE|RED:RIGHT:2","D":"RED|GREEN:DOWN","E":"GREEN|RED:DOWN","F":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","G":"BLUE|GREEN:DOWN:2","H":"GREEN|RED:DOWN","I":"RED|BLUE:DOWN","J":"BLUE|ORANGE:RIGHT","K":"PIPE:LEFT:ORANGE>DOWN:RED","L":"STAIRS:UP:RED|BLUE:SHELF_UP","M":"PIPE:SHELF_DOWN:BLUE>RIGHT:GREEN","N":"TRIGGER:GREEN:K|RED:UP","O":"PIPE:DOWN:RED>UP:BLUE","P":"STAIRS:DOWN:BLUE|GREEN:SHELF_DOWN","Q":"PIPE:SHELF_UP:GREEN>DOWN:RED","R":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 255, name: "Deadlock", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R"], layout: [[["C",null,null],["D",null,"E"],[null,null,"F"],[null,null,"G"],[null,"I","H"]],[["B","A",null],["R","Q",null],[null,"P",null],[null,"K",null],[null,"J",null]],[[null,null,null],[null,null,null],["N","O",null],["M","L",null],[null,null,null]]], pieces: ["OUT:RED|ORANGE:LEFT","STAIRS:DOWN:ORANGE|RED:SHELF_DOWN","PIPE:SHELF_UP:RED>DOWN:GREEN","GREEN|RED:RIGHT:2","RED|BLUE:DOWN","PIPE:UP:BLUE>DOWN:GREEN","GREEN|RED:DOWN","RED|BLUE:LEFT","STAIRS:UP:BLUE|RED:SHELF_UP","RED|BLUE:UP","STAIRS:UP:BLUE|RED:SHELF_UP","RED|BLUE:LEFT","BLUE|YELLOW:UP","PIPE:DOWN:YELLOW>RIGHT:RED","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","BLUE|GREEN:UP","PIPE:DOWN:GREEN>LEFT:YELLOW","IN:YELLOW"], solution: {"A":"OUT:RED|ORANGE:LEFT","B":"STAIRS:DOWN:ORANGE|RED:SHELF_DOWN","C":"PIPE:SHELF_UP:RED>DOWN:GREEN","D":"GREEN|RED:RIGHT:2","E":"RED|BLUE:DOWN","F":"PIPE:UP:BLUE>DOWN:GREEN","G":"GREEN|RED:DOWN","H":"RED|BLUE:LEFT","I":"STAIRS:UP:BLUE|RED:SHELF_UP","J":"RED|BLUE:UP","K":"STAIRS:UP:BLUE|RED:SHELF_UP","L":"RED|BLUE:LEFT","M":"BLUE|YELLOW:UP","N":"PIPE:DOWN:YELLOW>RIGHT:RED","O":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","P":"BLUE|GREEN:UP","Q":"PIPE:DOWN:GREEN>LEFT:YELLOW","R":"IN:YELLOW"}, hint: "Use all pieces correctly!" },
{ number: 256, name: "Gridlock", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S"], layout: [[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,"P","Q",null,"R"],[null,null,null,null,null],[null,null,null,null,"S"]],[[null,null,"D","C",null],["K",null,"E",null,null],["L",null,"F","B",null],[null,null,null,"A",null],["M","N",null,null,null],[null,"O",null,null,null],[null,null,null,null,null],[null,null,null,null,null]],[[null,null,null,null,null],["J",null,null,null,null],["I","H","G",null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]]], pieces: ["OUT:RED|BLUE:UP","BLUE|GREEN:UP:2","GREEN|YELLOW:LEFT","YELLOW|RED:DOWN","PIPE:UP:RED>DOWN:YELLOW","STAIRS:UP:YELLOW|BLUE:SHELF_UP","BLUE|YELLOW:LEFT","PIPE:RIGHT:YELLOW>LEFT:RED","PIPE:RIGHT:RED>UP:ORANGE","STAIRS:DOWN:ORANGE|RED:SHELF_DOWN","RED|BLUE:DOWN","BLUE|GREEN:DOWN:2","TRIGGER:GREEN:J|RED:RIGHT","TRIGGER:RED:L|CYAN:DOWN","STAIRS:DOWN:CYAN|BLUE:SHELF_DOWN","PIPE:SHELF_UP:BLUE>RIGHT:PURPLE","PURPLE|RED:RIGHT:2","RED|GREEN:DOWN:2","IN:GREEN"], solution: {"A":"OUT:RED|BLUE:UP","B":"BLUE|GREEN:UP:2","C":"GREEN|YELLOW:LEFT","D":"YELLOW|RED:DOWN","E":"PIPE:UP:RED>DOWN:YELLOW","F":"STAIRS:UP:YELLOW|BLUE:SHELF_UP","G":"BLUE|YELLOW:LEFT","H":"PIPE:RIGHT:YELLOW>LEFT:RED","I":"PIPE:RIGHT:RED>UP:ORANGE","J":"STAIRS:DOWN:ORANGE|RED:SHELF_DOWN","K":"RED|BLUE:DOWN","L":"BLUE|GREEN:DOWN:2","M":"TRIGGER:GREEN:J|RED:RIGHT","N":"TRIGGER:RED:L|CYAN:DOWN","O":"STAIRS:DOWN:CYAN|BLUE:SHELF_DOWN","P":"PIPE:SHELF_UP:BLUE>RIGHT:PURPLE","Q":"PURPLE|RED:RIGHT:2","R":"RED|GREEN:DOWN:2","S":"IN:GREEN"}, hint: "Use all pieces correctly!" },
{ number: 257, name: "Iron Web", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S"], layout: [[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],["R","Q",null,null,null],["S",null,null,null,null]],[["C",null,null,null,null],[null,null,null,null,null],["B",null,null,null,null],["A",null,null,null,null],[null,null,null,null,null],[null,null,"N",null,"M"],[null,"P","O",null,"L"],[null,null,null,null,null]],[["D","E",null,null,null],[null,null,null,null,null],[null,"F",null,null,null],[null,"G",null,null,null],[null,null,null,null,null],[null,"H",null,null,null],[null,"I","J",null,"K"],[null,null,null,null,null]]], pieces: ["OUT:RED|YELLOW:UP","YELLOW|GREEN:UP:2","STAIRS:UP:GREEN|RED:SHELF_UP","PIPE:SHELF_DOWN:RED>RIGHT:YELLOW","YELLOW|RED:DOWN:2","TRIGGER:RED:C|CYAN:DOWN","CYAN|PURPLE:DOWN:2","PURPLE|BLUE:DOWN","BLUE|RED:RIGHT","RED|BLUE:RIGHT:2","STAIRS:DOWN:BLUE|RED:SHELF_DOWN","RED|BLUE:UP","BLUE|CYAN:LEFT:2","TRIGGER:CYAN:J|RED:DOWN","RED|BLUE:LEFT","STAIRS:DOWN:BLUE|RED:SHELF_DOWN","RED|GREEN:LEFT","PIPE:RIGHT:GREEN>DOWN:RED","IN:RED"], solution: {"A":"OUT:RED|YELLOW:UP","B":"YELLOW|GREEN:UP:2","C":"STAIRS:UP:GREEN|RED:SHELF_UP","D":"PIPE:SHELF_DOWN:RED>RIGHT:YELLOW","E":"YELLOW|RED:DOWN:2","F":"TRIGGER:RED:C|CYAN:DOWN","G":"CYAN|PURPLE:DOWN:2","H":"PURPLE|BLUE:DOWN","I":"BLUE|RED:RIGHT","J":"RED|BLUE:RIGHT:2","K":"STAIRS:DOWN:BLUE|RED:SHELF_DOWN","L":"RED|BLUE:UP","M":"BLUE|CYAN:LEFT:2","N":"TRIGGER:CYAN:J|RED:DOWN","O":"RED|BLUE:LEFT","P":"STAIRS:DOWN:BLUE|RED:SHELF_DOWN","Q":"RED|GREEN:LEFT","R":"PIPE:RIGHT:GREEN>DOWN:RED","S":"IN:RED"}, hint: "Use all pieces correctly!" },
{ number: 258, name: "Shockwave", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"], layout: [[[null,null,null,null,null,null],[null,null,null,null,null,null],[null,null,null,null,null,null],[null,null,null,null,null,null],[null,"K",null,null,null,null],[null,"J",null,null,null,null],[null,null,null,null,null,"F"],[null,"I",null,"H",null,"G"]],[["T",null,null,null,null,null],["S",null,"R",null,null,null],[null,null,"Q",null,null,null],["N","O","P","A","B","C"],["M","L",null,null,null,null],[null,null,null,null,null,"D"],[null,null,null,null,null,"E"],[null,null,null,null,null,null]]], pieces: ["OUT:RED|BLUE:RIGHT","PIPE:LEFT:BLUE>RIGHT:GREEN","GREEN|YELLOW:DOWN:2","YELLOW|RED:DOWN","STAIRS:DOWN:RED|BLUE:SHELF_DOWN","BLUE|GREEN:DOWN","GREEN|BLUE:LEFT:2","BLUE|RED:LEFT:2","RED|PURPLE:UP:2","TRIGGER:PURPLE:E|GREEN:UP","STAIRS:UP:GREEN|RED:SHELF_UP","PIPE:SHELF_DOWN:RED>LEFT:YELLOW","PIPE:RIGHT:YELLOW>UP:RED","RED|CYAN:RIGHT","CYAN|BLUE:RIGHT","PIPE:LEFT:BLUE>UP:RED","PIPE:DOWN:RED>UP:CYAN","CYAN|RED:LEFT:2","RED|PURPLE:UP","IN:PURPLE"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"PIPE:LEFT:BLUE>RIGHT:GREEN","C":"GREEN|YELLOW:DOWN:2","D":"YELLOW|RED:DOWN","E":"STAIRS:DOWN:RED|BLUE:SHELF_DOWN","F":"BLUE|GREEN:DOWN","G":"GREEN|BLUE:LEFT:2","H":"BLUE|RED:LEFT:2","I":"RED|PURPLE:UP:2","J":"TRIGGER:PURPLE:E|GREEN:UP","K":"STAIRS:UP:GREEN|RED:SHELF_UP","L":"PIPE:SHELF_DOWN:RED>LEFT:YELLOW","M":"PIPE:RIGHT:YELLOW>UP:RED","N":"RED|CYAN:RIGHT","O":"CYAN|BLUE:RIGHT","P":"PIPE:LEFT:BLUE>UP:RED","Q":"PIPE:DOWN:RED>UP:CYAN","R":"CYAN|RED:LEFT:2","S":"RED|PURPLE:UP","T":"IN:PURPLE"}, hint: "Use all pieces correctly!" },
{ number: 259, name: "Final Prism", cells: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"], layout: [[[null,null,null,"I","J"],[null,null,null,null,"K"],[null,null,null,"H",null],["A","B",null,"C","D"],[null,null,null,null,null]],[[null,"P","O","N","M"],[null,"Q",null,null,"L"],[null,null,null,"G","F"],["S","R",null,null,"E"],["T",null,null,null,null]]], pieces: ["OUT:RED|BLUE:RIGHT","BLUE|RED:RIGHT:2","RED|PURPLE:RIGHT","STAIRS:UP:PURPLE|RED:SHELF_UP","PIPE:SHELF_DOWN:RED>UP:BLUE","BLUE|GREEN:LEFT","STAIRS:DOWN:GREEN|RED:SHELF_DOWN","RED|BLUE:UP:2","PIPE:DOWN:BLUE>RIGHT:PURPLE","PURPLE|BLUE:DOWN","STAIRS:UP:BLUE|RED:SHELF_UP","PIPE:SHELF_DOWN:RED>UP:CYAN","PIPE:DOWN:CYAN>LEFT:BLUE","BLUE|GREEN:LEFT","GREEN|RED:LEFT","RED|BLUE:DOWN","BLUE|RED:DOWN:2","RED|YELLOW:LEFT","YELLOW|RED:DOWN","IN:RED"], solution: {"A":"OUT:RED|BLUE:RIGHT","B":"BLUE|RED:RIGHT:2","C":"RED|PURPLE:RIGHT","D":"STAIRS:UP:PURPLE|RED:SHELF_UP","E":"PIPE:SHELF_DOWN:RED>UP:BLUE","F":"BLUE|GREEN:LEFT","G":"STAIRS:DOWN:GREEN|RED:SHELF_DOWN","H":"RED|BLUE:UP:2","I":"PIPE:DOWN:BLUE>RIGHT:PURPLE","J":"PURPLE|BLUE:DOWN","K":"STAIRS:UP:BLUE|RED:SHELF_UP","L":"PIPE:SHELF_DOWN:RED>UP:CYAN","M":"PIPE:DOWN:CYAN>LEFT:BLUE","N":"BLUE|GREEN:LEFT","O":"GREEN|RED:LEFT","P":"RED|BLUE:DOWN","Q":"BLUE|RED:DOWN:2","R":"RED|YELLOW:LEFT","S":"YELLOW|RED:DOWN","T":"IN:RED"}, hint: "Use all pieces correctly!" },
  { number: 260, name: "Poison Relay", cells:["A","B","C","D","E","F","G","H"], layout:[[["A",null,"B"],["C","D","E"],["F","G","H"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:DOWN","PIPE:UP:GREEN>DOWN:PURPLE","PURPLE|ORANGE:LEFT","TRIGGER:ORANGE:D|CYAN:LEFT","CYAN|PINK:UP","PINK|RED:RIGHT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:DOWN",E:"PIPE:UP:GREEN>DOWN:PURPLE",H:"PURPLE|ORANGE:LEFT",G:"TRIGGER:ORANGE:D|CYAN:LEFT",F:"CYAN|PINK:UP",C:"PINK|RED:RIGHT",D:"IN:RED"}, hint:"The trigger locks your destination!" },
  { number: 261, name: "Corrosion", cells:["A","B","C","D","E","F","G","H"], layout:[[["A",null,"B",null,"C"],["D","E","F","G","H"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}},{from:{cell:"B",dir:"RIGHT"},to:{cell:"C",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","PIPE:RIGHT:ORANGE>LEFT:CYAN","CYAN|PINK:LEFT","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",H:"PURPLE|ORANGE:LEFT",G:"PIPE:RIGHT:ORANGE>LEFT:CYAN",F:"CYAN|PINK:LEFT",E:"PINK|RED:LEFT",D:"IN:RED"}, hint:"Two conduits chain across the top!" },
  { number: 262, name: "Hazard Zone", cells:["A","B","C","D","E","F","G","H"], layout:[[["A",null,"B"],["C","D","E"],["F",null,"G"],[null,null,"H"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}},{from:{cell:"F",dir:"RIGHT"},to:{cell:"G",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:LEFT","PIPE:RIGHT:PURPLE>LEFT:ORANGE","ORANGE|CYAN:DOWN","CYAN|PINK:RIGHT","PINK|RED:DOWN","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:DOWN",E:"GREEN|PURPLE:LEFT",D:"PIPE:RIGHT:PURPLE>LEFT:ORANGE",C:"ORANGE|CYAN:DOWN",F:"CYAN|PINK:RIGHT",G:"PINK|RED:DOWN",H:"IN:RED"}, hint:"Two conduits and a pipe!" },
  { number: 263, name: "Shadow Pulse", cells:["A","B","C","D","E","F"], layout:[[["A",null,"B"],["C","D","E"],[null,null,"F"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:DOWN","GREEN|ORANGE:RIGHT","ORANGE|PURPLE:RIGHT","PURPLE|CYAN:DOWN","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:DOWN",C:"GREEN|ORANGE:RIGHT",D:"ORANGE|PURPLE:RIGHT",E:"PURPLE|CYAN:DOWN",F:"IN:CYAN"}, hint:"One conduit, two paths merge!" },
  { number: 264, name: "Nerve Gas", cells:["A","B","C","D","E","F","G","H"], layout:[[["A",null,"B"],["C","D","E"],["F","G","H"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:LEFT","TRIGGER:PURPLE:G|ORANGE:LEFT","ORANGE|CYAN:DOWN","CYAN|PINK:RIGHT","PINK|RED:RIGHT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:DOWN",E:"GREEN|PURPLE:LEFT",D:"TRIGGER:PURPLE:G|ORANGE:LEFT",C:"ORANGE|CYAN:DOWN",F:"CYAN|PINK:RIGHT",G:"PINK|RED:RIGHT",H:"IN:RED"}, hint:"The trigger guards G!" },
  { number: 265, name: "Plague Vector", cells:["A","B","C","D","E","F","G","H"], layout:[[["A",null,"B",null,"C"],["D","E","F","G","H"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}},{from:{cell:"B",dir:"RIGHT"},to:{cell:"C",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN","PURPLE|ORANGE:LEFT","ORANGE|CYAN:LEFT","PIPE:RIGHT:CYAN>LEFT:PINK","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN",H:"PURPLE|ORANGE:LEFT",G:"ORANGE|CYAN:LEFT",F:"PIPE:RIGHT:CYAN>LEFT:PINK",E:"PINK|RED:LEFT",D:"IN:RED"}, hint:"Double conduit gauntlet!" },
  { number: 266, name: "Gravity Well", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP","ORANGE|CYAN:RIGHT","STAIRS:DOWN:CYAN|PINK:SHELF_DOWN:2","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:2",F:"GREEN|PURPLE:LEFT",E:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP",G:"ORANGE|CYAN:RIGHT",H:"STAIRS:DOWN:CYAN|PINK:SHELF_DOWN:2",D:"PINK|RED:LEFT",C:"IN:RED"}, hint:"Zigzag through four shelves!" },
  { number: 267, name: "Black Hole", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP","ORANGE|CYAN:RIGHT","STAIRS:DOWN:CYAN|PINK:SHELF_DOWN:2","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:2",F:"GREEN|PURPLE:LEFT",E:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP",G:"ORANGE|CYAN:RIGHT",H:"STAIRS:DOWN:CYAN|PINK:SHELF_DOWN:2",D:"PINK|RED:LEFT",C:"IN:RED"}, hint:"" },
  { number: 268, name: "Wormhole", cells:["A","B","C","D","E","F"], layout:[[["A","B"]],[[null,null]],[["C","D"]],[[null,null]],[["E","F"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2","ORANGE|CYAN:RIGHT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:2",D:"GREEN|PURPLE:LEFT",C:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2",E:"ORANGE|CYAN:RIGHT",F:"IN:CYAN"}, hint:"" },
  { number: 269, name: "Dark Energy", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2","ORANGE|CYAN:RIGHT","STAIRS:DOWN:CYAN|PINK:SHELF_DOWN","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP",D:"GREEN|PURPLE:LEFT",C:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2",G:"ORANGE|CYAN:RIGHT",H:"STAIRS:DOWN:CYAN|PINK:SHELF_DOWN",F:"PINK|RED:LEFT",E:"IN:RED"}, hint:"" },
  { number: 270, name: "Antimatter", cells:["A","B","C","D","E","F"], layout:[[["A","B"]],[[null,null]],[[null,null]],[["C","D"]],[[null,null]],[["E","F"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:3","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2","ORANGE|CYAN:RIGHT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:3",D:"GREEN|PURPLE:LEFT",C:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2",E:"ORANGE|CYAN:RIGHT",F:"IN:CYAN"}, hint:"Jump three then jump two!" },
  { number: 271, name: "Void Collapse", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN","ORANGE|CYAN:RIGHT","STAIRS:UP:CYAN|PINK:SHELF_UP:2","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:2",F:"GREEN|PURPLE:LEFT",E:"STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN",C:"ORANGE|CYAN:RIGHT",D:"STAIRS:UP:CYAN|PINK:SHELF_UP:2",H:"PINK|RED:LEFT",G:"IN:RED"}, hint:"" },
];

// ─── ARROW VISUALS ──────────────────────────────────────────────────────────

const ARROW_SYM = { UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→", UP_LEFT: "↖", UP_RIGHT: "↗", DOWN_LEFT: "↙", DOWN_RIGHT: "↘" };
const ARROW_POS = {
  UP: { top: 2, left: "50%", transform: "translateX(-50%)" }, DOWN: { bottom: 2, left: "50%", transform: "translateX(-50%)" },
  LEFT: { left: 2, top: "50%", transform: "translateY(-50%)" }, RIGHT: { right: 2, top: "50%", transform: "translateY(-50%)" },
  UP_LEFT: { top: 2, left: 2 }, UP_RIGHT: { top: 2, right: 2 }, DOWN_LEFT: { bottom: 2, left: 2 }, DOWN_RIGHT: { bottom: 2, right: 2 },
};
const CHAPTERS = [
  { name: "Bonus", range: [-6, -1], color: "#94a3b8", bg: "linear-gradient(135deg,#1e293b 0%,#0f172a 100%)", glow: "rgba(148,163,184,0.10)" },
  { name: "Fundamentals", range: [1, 9], color: "#3b82f6", bg: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)", glow: "rgba(59,130,246,0.15)" },
  { name: "Diagonals", range: [10, 17], color: "#f0abfc", bg: "radial-gradient(circle at center,#4a1942 0%,#1a0a18 60%,#0a0a15 100%)", glow: "rgba(240,171,252,0.12)" },
  { name: "Multi-Output", range: [18, 26], color: "#a855f7", bg: "radial-gradient(circle at top right,#2e1065 0%,#0f0a1c 100%)", glow: "rgba(168,85,247,0.15)" },
  { name: "Complex Layouts", range: [27, 38], color: "#22c55e", bg: "linear-gradient(180deg,#064e3b 0%,#022c22 100%)", glow: "rgba(34,197,94,0.15)" },
  { name: "Sources & Sinks", range: [39, 46], color: "#f59e0b", bg: "radial-gradient(ellipse at center,#451a03 0%,#1c1917 100%)", glow: "rgba(245,158,11,0.15)" },
  { name: "Jumper Arrows", range: [47, 54], color: "#ef4444", bg: "linear-gradient(to right bottom,#450a0a 0%,#1a0505 100%)", glow: "rgba(239,68,68,0.15)" },
  { name: "Gaps", range: [55, 62], color: "#14b8a6", bg: "radial-gradient(circle at 50% 50%,#042f2e 0%,#020617 100%)", glow: "rgba(20,184,166,0.15)" },
  { name: "Advanced Combos", range: [63, 70], color: "#06b6d4", bg: "linear-gradient(135deg,#164e63 0%,#082f49 100%)", glow: "rgba(6,182,212,0.15)" },
  { name: "Expert", range: [71, 76], color: "#ec4899", bg: "radial-gradient(circle at top left,#500724 0%,#171717 100%)", glow: "rgba(236,72,153,0.15)" },
  { name: "Pipes", range: [77, 86], color: "#8b5cf6", bg: "linear-gradient(160deg,#2e1065 0%,#09090b 100%)", glow: "rgba(139,92,246,0.15)" },
  { name: "Master I", range: [87, 96], color: "#fbbf24", bg: "radial-gradient(circle at top,#78350f 20%,#0f172a 100%)", glow: "rgba(251,191,36,0.15)" },
  { name: "Master II", range: [97, 106], color: "#f43f5e", bg: "linear-gradient(45deg,#881337 0%,#0f172a 100%)", glow: "rgba(244,63,94,0.15)" },
  { name: "Master III", range: [107, 116], color: "#e11d48", bg: "radial-gradient(ellipse at bottom,#7f1d1d 0%,#030712 100%)", glow: "rgba(225,29,72,0.15)" },
  { name: "Control Flow", range: [117, 122], color: "#8b5cf6", bg: "linear-gradient(135deg,#4c1d95 0%,#171717 100%)", glow: "rgba(139,92,246,0.15)" },
  { name: "Multi-Shelf", range: [123, 128], color: "#10b981", bg: "radial-gradient(circle at bottom,#064e3b 0%,#020617 100%)", glow: "rgba(16,185,129,0.15)" },
  { name: "Ascension", range: [129, 133], color: "#fbbf24", bg: "radial-gradient(circle at top,#78350f 20%,#0f172a 100%)", glow: "rgba(251,191,36,0.15)" },
  { name: "Master IV", range: [134, 138], color: "#a855f7", bg: "radial-gradient(circle at top right,#2e1065 0%,#0f0a1c 100%)", glow: "rgba(168,85,247,0.15)" },
  { name: "Master V", range: [139, 143], color: "#14b8a6", bg: "radial-gradient(circle at 50% 50%,#042f2e 0%,#020617 100%)", glow: "rgba(20,184,166,0.15)" },
  { name: "Master VI", range: [144, 148], color: "#ec4899", bg: "radial-gradient(circle at top left,#500724 0%,#171717 100%)", glow: "rgba(236,72,153,0.15)" },
  { name: "Master VII", range: [149, 153], color: "#f43f5e", bg: "radial-gradient(circle at center,#4c0519 0%,#0f0205 100%)", glow: "rgba(244,63,94,0.18)" },
  { name: "Calm I", range: [154, 163], color: "#67e8f9", bg: "radial-gradient(circle at center,#083344 0%,#0c1424 60%,#0a0a15 100%)", glow: "rgba(103,232,249,0.12)" },
  { name: "Calm II", range: [164, 173], color: "#86efac", bg: "radial-gradient(circle at center,#052e16 0%,#0a1a10 60%,#0a0a15 100%)", glow: "rgba(134,239,172,0.12)" },
  { name: "Calm III", range: [174, 183], color: "#c4b5fd", bg: "radial-gradient(circle at center,#1e1b4b 0%,#0f0d24 60%,#0a0a15 100%)", glow: "rgba(196,181,253,0.12)" },
  { name: "Calm IV", range: [184, 193], color: "#fca5a5", bg: "radial-gradient(circle at center,#450a0a 0%,#1a0808 60%,#0a0a15 100%)", glow: "rgba(252,165,165,0.12)" },
  { name: "Calm V", range: [194, 203], color: "#fdba74", bg: "radial-gradient(circle at center,#431407 0%,#1a0e05 60%,#0a0a15 100%)", glow: "rgba(253,186,116,0.12)" },
  { name: "Conduits", range: [204, 213], color: "#a78bfa", bg: "radial-gradient(circle at center,#312e81 0%,#0f0d24 60%,#0a0a15 100%)", glow: "rgba(167,139,250,0.15)" },
  { name: "Shelves & Conduits", range: [214, 223], color: "#34d399", bg: "radial-gradient(circle at center,#064e3b 0%,#0a1a10 60%,#0a0a15 100%)", glow: "rgba(52,211,153,0.15)" },
  { name: "Shelf Jumpers", range: [224, 233], color: "#fb923c", bg: "radial-gradient(circle at center,#7c2d12 0%,#1a0e05 60%,#0a0a15 100%)", glow: "rgba(251,146,60,0.15)" },
  { name: "Walls", range: [234, 243], color: "#ef4444", bg: "radial-gradient(circle at center,#7f1d1d 0%,#1a0505 60%,#0a0a15 100%)", glow: "rgba(239,68,68,0.15)" },
  { name: "Jumper Walls", range: [244, 253], color: "#f97316", bg: "radial-gradient(circle at center,#7c2d12 0%,#1a0a05 60%,#0a0a15 100%)", glow: "rgba(249,115,22,0.15)" },
  { name: "Insane I", range: [254, 259], color: "#dc2626", bg: "radial-gradient(circle at bottom right,#450a0a 0%,#1a0505 40%,#0a0a0a 100%)", glow: "rgba(220,38,38,0.2)" },
  { name: "Insane II", range: [260, 265], color: "#ef4444", bg: "radial-gradient(circle at center,#7f1d1d 0%,#1a0505 60%,#0a0a15 100%)", glow: "rgba(239,68,68,0.15)" },
  { name: "Insane III", range: [266, 271], color: "#dc2626", bg: "radial-gradient(circle at center,#991b1b 0%,#1a0505 60%,#0a0a15 100%)", glow: "rgba(220,38,38,0.15)" }
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

function GridCell({ cellName, displayLabel, size, tile, hasError, onClick, isTarget, isLockedCell, currentChapter, flashColor, displayLabelMap, walls, isJumperWall }) {
  const wallDirs = walls || [];
  const wallThick = 4;
  const wallColor = "rgba(239,68,68,0.85)";
  const jWallColor = "rgba(251,146,60,0.9)";
  return (<div id={`cell-${cellName}`} onClick={onClick} style={{
    "--flash-color": flashColor || "transparent",
    width: size, height: size, borderRadius: 12,
    background: flashColor ? flashColor : isLockedCell ? "rgba(251,191,36,0.04)" : (tile ? "transparent" : (currentChapter ? `rgba(255,255,255,0.02)` : "rgba(255,255,255,0.04)")),
    border: tile ? "none" : isLockedCell ? "2px solid rgba(251,191,36,0.3)" : isTarget ? `2px dashed ${currentChapter ? currentChapter.color : "rgba(255,255,255,0.5)"}` : "2px dashed rgba(255,255,255,0.15)",
    cursor: isLockedCell ? "not-allowed" : "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s ease", animation: hasError ? "shake 0.4s ease" : "none",
    boxShadow: hasError ? "0 0 16px rgba(239,68,68,0.6)" : isTarget ? `0 0 16px ${currentChapter ? currentChapter.glow : "rgba(255,255,255,0.15)"}` : (tile ? "none" : "inset 0 4px 12px rgba(0,0,0,0.2)")
  }}>
    {/* Wall indicators */}
    {wallDirs.includes("UP") && <div style={{ position:"absolute", top:0, left:4, right:4, height:wallThick, background:wallColor, borderRadius:"2px 2px 0 0", zIndex:5 }} />}
    {wallDirs.includes("DOWN") && <div style={{ position:"absolute", bottom:0, left:4, right:4, height:wallThick, background:wallColor, borderRadius:"0 0 2px 2px", zIndex:5 }} />}
    {wallDirs.includes("LEFT") && <div style={{ position:"absolute", left:0, top:4, bottom:4, width:wallThick, background:wallColor, borderRadius:"2px 0 0 2px", zIndex:5 }} />}
    {wallDirs.includes("RIGHT") && <div style={{ position:"absolute", right:0, top:4, bottom:4, width:wallThick, background:wallColor, borderRadius:"0 2px 2px 0", zIndex:5 }} />}
    {/* Jumper wall indicator: orange border glow */}
    {isJumperWall && <div style={{ position:"absolute", inset:2, borderRadius:10, border:`3px dashed ${jWallColor}`, pointerEvents:"none", zIndex:4 }} />}
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
  const [currentChapterIndex, setCurrentChapterIndex] = useState(1);
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
  const [moveHistory, setMoveHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [screen, setScreen] = useState("menu");
  const [completedLevels, setCompletedLevels] = useState(new Set());
  const [currentShelf, setCurrentShelf] = useState(0);
  const containerRef = useRef(null);

  // ─── SAVE DATA MIGRATION ─────────────────────────────────────────────
  // Bump this when level structure changes (insertions/deletions/reordering)
  const DATA_VERSION = 7; // v1: 215 levels, v2: 225 levels (conduits chapter inserted at index 209)
  useEffect(() => {
    const savedVersion = parseInt(localStorage.getItem("chromatic_data_version") || "1");
    const saved = localStorage.getItem("chromatic_completed");
    if (saved) {
      let indices = new Set(JSON.parse(saved));
      // Migration v1→v2: 10 conduit levels inserted at index 209 (after L203/Calm V)
      // All indices >= 209 need to shift +10
      if (savedVersion < 2) {
        const migrated = new Set();
        for (const idx of indices) {
          if (idx >= 209) migrated.add(idx + 10);
          else migrated.add(idx);
        }
        indices = migrated;
        localStorage.setItem("chromatic_completed", JSON.stringify([...indices]));
      }
      // Migration v2→v3: 10 shelf conduit levels inserted at index 219 (after Conduits)
      if (savedVersion < 3) {
        const migrated3 = new Set();
        for (const idx of indices) {
          if (idx >= 219) migrated3.add(idx + 10);
          else migrated3.add(idx);
        }
        indices = migrated3;
        localStorage.setItem("chromatic_completed", JSON.stringify([...indices]));
      }
      if (savedVersion < 4) {
        const migrated4 = new Set();
        for (const idx of indices) {
          if (idx >= 229) migrated4.add(idx + 10);
          else migrated4.add(idx);
        }
        indices = migrated4;
        localStorage.setItem("chromatic_completed", JSON.stringify([...indices]));
      }
      if (savedVersion < 7) {
        const migrated7 = new Set();
        for (const idx of indices) {
          if (idx >= 244) migrated7.add(idx + 10);
          else migrated7.add(idx);
        }
        indices = migrated7;
        localStorage.setItem("chromatic_completed", JSON.stringify([...indices]));
      }
      if (savedVersion < 6) {
        const migrated6 = new Set();
        for (const idx of indices) {
          if (idx >= 234) migrated6.add(idx + 10);
          else migrated6.add(idx);
        }
        indices = migrated6;
        localStorage.setItem("chromatic_completed", JSON.stringify([...indices]));
      }
      setCompletedLevels(indices);
    }
    localStorage.setItem("chromatic_data_version", String(DATA_VERSION));
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
    setCurrentShelf(0);
    setSelectedTile(null); setSolved(false); setErrors(new Set()); setShowHint(false); setScreen("game");
    setMoveHistory([]);
    setRedoStack([]);
    // Show mechanic intro popup for first level of special chapters
    const lvl = LEVELS[idx];
    const chapter = CHAPTERS.find(ch => lvl.number >= ch.range[0] && lvl.number <= ch.range[1]);
    if (chapter && lvl.number === chapter.range[0] && MECHANIC_INTROS[chapter.name]) {
      setShowMechanicIntro(MECHANIC_INTROS[chapter.name]);
    }
  }, [playSfx]);

  const [showMechanicIntro, setShowMechanicIntro] = useState(null);
  const MECHANIC_INTROS = {
    "Fundamentals": { icon: "🧩", title: "Welcome to Chromatic", color: "#3b82f6",
      lines: [
        "Place pieces on the grid so every arrow points at a matching color.",
        "Each piece has an outer color and inner arrows. An arrow must point at a neighbor whose outer color matches the arrow's color.",
        "Use all pieces to complete the puzzle!"
      ]},
    "Diagonals": { icon: "↗️", title: "New Mechanic: Diagonals", color: "#f0abfc",
      lines: [
        "Arrows can now point diagonally — up-left, up-right, down-left, or down-right.",
        "Diagonal arrows follow the same color-matching rules as cardinal arrows.",
        "Think in eight directions now!"
      ]},
    "Multi-Output": { icon: "🔱", title: "New Mechanic: Multi-Output", color: "#a855f7",
      lines: [
        "Some pieces have multiple arrows pointing in different directions.",
        "Every arrow on a piece must match its target — all of them, not just one!",
        "Plan carefully to satisfy all connections at once."
      ]},
    "Complex Layouts": { icon: "🗺️", title: "Complex Layouts", color: "#22c55e",
      lines: [
        "Grids are no longer simple rectangles — expect gaps, L-shapes, and irregular layouts.",
        "Empty cells block connections. Plan your paths around the holes!"
      ]},
    "Sources & Sinks": { icon: "⚡", title: "New Mechanic: Sources & Sinks", color: "#f59e0b",
      lines: [
        "Source pieces (OUT) emit signals — they only send, never receive.",
        "Sink pieces (IN) absorb signals — they only receive, never send.",
        "Build a path from source to sink!"
      ]},
    "Jumper Arrows": { icon: "🏹", title: "New Mechanic: Jumper Arrows", color: "#ef4444",
      lines: [
        "Some arrows can jump over cells to reach targets 2 or more spaces away.",
        "A jumper arrow skips the intermediate cell entirely.",
        "Look for the ':2' notation — it means the arrow reaches 2 cells away!"
      ]},
    "Gaps": { icon: "🕳️", title: "New Mechanic: Gaps", color: "#14b8a6",
      lines: [
        "Some cells are permanently empty — you can't place pieces there.",
        "Arrows can't connect through gaps. Route your signals around them!"
      ]},
    "Pipes": { icon: "🔀", title: "New Mechanic: Pipes", color: "#8b5cf6",
      lines: [
        "Pipe pieces transform signals — they receive one color and output a different color in a different direction.",
        "Pipes can be rotated! Try different orientations to find the right fit.",
        "Think of pipes as color-changing relay stations."
      ]},
    "Control Flow": { icon: "🔒", title: "New Mechanic: Triggers", color: "#8b5cf6",
      lines: [
        "Trigger pieces lock a specific cell until the trigger is satisfied.",
        "To satisfy a trigger, point the correct color at it.",
        "You must place the trigger before you can place pieces on its locked cell!"
      ]},
    "Multi-Shelf": { icon: "📚", title: "New Mechanic: Shelves", color: "#10b981",
      lines: [
        "The grid now has multiple layers — shelves stacked vertically.",
        "Stairs pieces connect adjacent shelves, sending signals up or down.",
        "Use the shelf tabs to switch between layers!"
      ]},
    "Jumper Walls": { icon: "🛡️", title: "New Mechanic: Jumper Walls", color: "#f97316",
      lines: [
        "Some cells have Jumper Walls (orange dashed border).",
        "Jumper arrows CANNOT jump over these cells!",
        "Normal arrows (distance 1) still work through them."
      ]},
    "Walls": { icon: "🧱", title: "New Mechanic: Walls", color: "#ef4444",
      lines: [
        "Some cells now have walls on specific sides!",
        "A wall blocks signals from entering that cell from that direction.",
        "Look for the red bars — you must route around them!"
      ]},
    "Shelf Jumpers": { icon: "🚀", title: "New Mechanic: Shelf Jumpers", color: "#fb923c",
      lines: [
        "Some pieces can now jump 2 or even 3 shelves at once!",
        "Look for SHELF_UP:2 and SHELF_UP:3 — they skip intermediate shelves entirely.",
        "Combine regular stairs with shelf jumpers to navigate tall towers!"
      ]},
    "Shelves & Conduits": { icon: "🏗️", title: "Shelves & Conduits", color: "#34d399",
      lines: [
        "Now you'll encounter both shelves and conduits in the same puzzle!",
        "Conduits route signals around the grid on the same shelf, while stairs move signals between shelves.",
        "Master both mechanics together to solve these puzzles!"
      ]},
    "Conduits": { icon: "🔗", title: "New Mechanic: Conduits", color: "#a78bfa",
      lines: [
        "Conduits are glowing paths around the grid that route signals between distant cells.",
        "When a piece's arrow points off the grid and into a conduit, the signal travels through the conduit and arrives at the other end.",
        "Look for the purple dashed lines — they show where conduits connect!",
        "When a conduit is active, you'll see an animated dot flowing through it."
      ]},
  };

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
      setMoveHistory(prev => [...prev, { cell: cellName, tile: selectedTile }]);
      setRedoStack([]);
      setBoard(nb); setTray(p => removeFirstMatch(p, selectedTile));
      setSelectedTile(null);
      const errs = getConnectionErrors(level, nb);
      setErrors(errs);
      triggerLinkAnimation(cellName, selectedTile, nb, errs);
      if (checkSolution(level, nb)) markSolved(nb);
    }
  };

  const handleUndo = () => {
    if (solved || moveHistory.length === 0) return;
    const last = moveHistory[moveHistory.length - 1];
    const nb = { ...board };
    delete nb[last.cell];
    setBoard(nb);
    setTray(prev => [...prev, last.tile]);
    setMoveHistory(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
    setSelectedTile(null);
    setErrors(getConnectionErrors(level, nb));
    playSfx('remove');
  };

  const handleRedo = () => {
    if (solved || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const nb = { ...board, [next.cell]: next.tile };
    setBoard(nb);
    setTray(prev => { const idx = prev.indexOf(next.tile); return idx >= 0 ? [...prev.slice(0, idx), ...prev.slice(idx + 1)] : prev; });
    setMoveHistory(prev => [...prev, next]);
    setRedoStack(prev => prev.slice(0, -1));
    setSelectedTile(null);
    setErrors(getConnectionErrors(level, nb));
    playSfx('place');
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
      @keyframes beamFadeIn{0%{opacity:0;stroke-dashoffset:80}40%{opacity:1;stroke-dashoffset:0}100%{opacity:1;stroke-dashoffset:0}}
      @keyframes beamGlowPulse{0%{opacity:0.2}50%{opacity:0.5}100%{opacity:0.2}}
      @keyframes beamFadeOut{0%{opacity:1}100%{opacity:0}}
      .beam-core{animation:beamFadeIn 0.6s ease-out forwards;stroke-dasharray:80;}
      .beam-glow{animation:beamGlowPulse 0.8s ease-in-out infinite;}
      .beam-group-fade{animation:beamFadeOut 0.5s ease-in forwards;}
      @keyframes energyFlow{0%{stroke-dashoffset:20}100%{stroke-dashoffset:0}}
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
    const beamTimestamps = useRef({});
    const fadeTimers = useRef({});

    useEffect(() => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newBeams = [];
      const l3d = getLayout3D(level.layout);
      const now = Date.now();

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

              const beamId = `${cellName}-${neighbor.cell}-${conn.dir}`;
              // Track when this beam first appeared
              if (!beamTimestamps.current[beamId]) {
                beamTimestamps.current[beamId] = now;
              }

              const age = now - beamTimestamps.current[beamId];
              const isFading = age > 1500; // Start fade after 1.5s

              newBeams.push({
                id: beamId,
                x1: sX, y1: sY, x2: tX, y2: tY,
                color1: COLORS[conn.color]?.glow || "#fff",
                color2: COLORS[targetColor]?.glow || "#fff",
                fading: isFading
              });
            }
          }
        }
      }

      // Clean up timestamps for beams that no longer exist
      const activeIds = new Set(newBeams.map(b => b.id));
      for (const id of Object.keys(beamTimestamps.current)) {
        if (!activeIds.has(id)) delete beamTimestamps.current[id];
      }

      setBeams(newBeams);

      // Schedule fade-out: re-render at 1.5s to start fade class, then remove at 2s
      for (const b of newBeams) {
        if (!fadeTimers.current[b.id]) {
          fadeTimers.current[b.id] = true;
          // Trigger fade class at 1.5s
          setTimeout(() => {
            setBeams(prev => prev.map(pb => pb.id === b.id ? { ...pb, fading: true } : pb));
          }, 1500);
          // Remove beam at 2s
          setTimeout(() => {
            setBeams(prev => prev.filter(pb => pb.id !== b.id));
            delete fadeTimers.current[b.id];
            delete beamTimestamps.current[b.id];
          }, 2000);
        }
      }
    }, [board, level.layout, containerRef]);

    if (beams.length === 0) return null;

    return (
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 30, overflow: "visible" }}>
        <defs>
          {beams.map(b => (
            <g key={`defs-${b.id}`}>
              {/* Color gradient: source color → midpoint blend → target color */}
              <linearGradient id={`grad-${b.id}`} gradientUnits="userSpaceOnUse" x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}>
                <stop offset="0%" stopColor={b.color1} />
                <stop offset="35%" stopColor={b.color1} />
                <stop offset="50%" stopColor={b.color2} stopOpacity="0.8" />
                <stop offset="65%" stopColor={b.color2} />
                <stop offset="100%" stopColor={b.color2} />
              </linearGradient>
              {/* Opacity mask gradient: fade in from source, full at center, fade out at target */}
              <linearGradient id={`mask-${b.id}`} gradientUnits="userSpaceOnUse" x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}>
                <stop offset="0%" stopColor="white" stopOpacity="0" />
                <stop offset="15%" stopColor="white" stopOpacity="0.9" />
                <stop offset="50%" stopColor="white" stopOpacity="1" />
                <stop offset="85%" stopColor="white" stopOpacity="0.9" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <mask id={`bmask-${b.id}`}>
                <rect x="0" y="0" width="100%" height="100%" fill={`url(#mask-${b.id})`} />
              </mask>
            </g>
          ))}
          <filter id="beam-glow"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        {beams.map(b => (
          <g key={b.id} className={b.fading ? "beam-group-fade" : ""} mask={`url(#bmask-${b.id})`}>
            {/* Soft outer glow */}
            <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
              stroke={`url(#grad-${b.id})`} strokeWidth="14" filter="url(#beam-glow)"
              className="beam-glow" />
            {/* Core beam line */}
            <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
              stroke={`url(#grad-${b.id})`} strokeWidth="3" strokeLinecap="round"
              className="beam-core" />
          </g>
        ))}
      </svg>
    );
  }

  function ConduitOverlay({ level, board, containerRef }) {
    const [paths, setPaths] = useState([]);
    useEffect(() => {
      if (!level.conduits || !containerRef.current) return;
      // Small delay to ensure DOM has rendered shelf positions
      const timer = setTimeout(() => {
        const cRect = containerRef.current.getBoundingClientRect();
        const newPaths = [];
        for (const conduit of level.conduits) {
          const fromEl = document.getElementById(`cell-${conduit.from.cell}`);
          const toEl = document.getElementById(`cell-${conduit.to.cell}`);
          if (!fromEl || !toEl) continue;
          const fR = fromEl.getBoundingClientRect();
          const tR = toEl.getBoundingClientRect();
          const fCx = fR.left - cRect.left + fR.width / 2;
          const fCy = fR.top - cRect.top + fR.height / 2;
          const tCx = tR.left - cRect.left + tR.width / 2;
          const tCy = tR.top - cRect.top + tR.height / 2;
          const half = fR.width / 2 + 4;
          // Edge points
          const dirOff = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0],
            UP_LEFT: [-0.7, -0.7], UP_RIGHT: [0.7, -0.7], DOWN_LEFT: [-0.7, 0.7], DOWN_RIGHT: [0.7, 0.7],
            SHELF_UP: [0, -1], SHELF_DOWN: [0, 1] };
          const fd = dirOff[conduit.from.dir] || [0, -1];
          const td = dirOff[conduit.to.dir] || [0, -1];
          const fx = fCx + fd[0] * half, fy = fCy + fd[1] * half;
          const tx = tCx + td[0] * half, ty = tCy + td[1] * half;
          // Dynamic control point offset: scale with distance between endpoints
          const dist = Math.hypot(tx - fx, ty - fy);
          const outOff = Math.max(50, dist * 0.5);
          const cpfx = fx + fd[0] * outOff, cpfy = fy + fd[1] * outOff;
          const cptx = tx + td[0] * outOff, cpty = ty + td[1] * outOff;
          const pathD = `M${fx},${fy} C${cpfx},${cpfy} ${cptx},${cpty} ${tx},${ty}`;
          // Check if conduit is active
          let active = false;
          let activeColor = "#6b7280";
          if (board[conduit.from.cell]) {
            const fromTile = parseTile(board[conduit.from.cell]);
            const conn = fromTile.connections.find(c => c.dir === conduit.from.dir);
            if (conn) {
              activeColor = COLORS[conn.color]?.glow || "#a78bfa";
              if (board[conduit.to.cell]) {
                const toTile = parseTile(board[conduit.to.cell]);
                if (toTile.type === "NORMAL" && conn.color === toTile.outer) active = true;
                else if (toTile.type === "INPUT_ONLY" && toTile.acceptColors?.includes(conn.color)) active = true;
                else if (toTile.type === "TRIGGER" && conn.color === toTile.reqColor) active = true;
                else if (toTile.type === "STAIRS" && conn.color === toTile.outer) active = true;
              }
            }
          }
          newPaths.push({ id: `${conduit.from.cell}-${conduit.to.cell}`, pathD, fx, fy, tx, ty, active, activeColor });
        }
        setPaths(newPaths);
      }, 50);
      return () => clearTimeout(timer);
    }, [board, level, containerRef, currentShelf]);
    if (paths.length === 0) return null;
    return (
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 25, overflow: "visible" }}>
        <defs>
          <filter id="conduit-glow"><feGaussianBlur stdDeviation="5" /></filter>
          <marker id="conduit-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,1 L6,4 L0,7" fill="none" stroke="rgba(167,139,250,0.6)" strokeWidth="1.5" />
          </marker>
        </defs>
        {paths.map(p => (
          <g key={p.id}>
            {/* Outer glow */}
            <path d={p.pathD} fill="none" stroke={p.active ? p.activeColor : "rgba(167,139,250,0.2)"} strokeWidth={p.active ? 14 : 8} filter="url(#conduit-glow)" strokeLinecap="round" />
            {/* Main conduit line */}
            <path d={p.pathD} fill="none" stroke={p.active ? p.activeColor : "rgba(167,139,250,0.45)"} strokeWidth={3} strokeLinecap="round" strokeDasharray={p.active ? "none" : "8 5"} markerEnd="url(#conduit-arrow)" style={{ transition: "stroke 0.3s, stroke-dasharray 0.3s" }} />
            {/* Entry port — pulsing ring */}
            <circle cx={p.fx} cy={p.fy} r={6} fill={p.active ? p.activeColor : "rgba(167,139,250,0.6)"} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}>
              {!p.active && <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />}
            </circle>
            {/* Exit port — pulsing ring */}
            <circle cx={p.tx} cy={p.ty} r={6} fill={p.active ? p.activeColor : "rgba(167,139,250,0.6)"} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}>
              {!p.active && <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />}
            </circle>
            {/* Animated flow dots when active */}
            {p.active && (
              <>
                <circle r={3} fill="#fff" opacity={0.9}>
                  <animateMotion dur="1.2s" repeatCount="indefinite" path={p.pathD} />
                </circle>
                <circle r={2} fill="#fff" opacity={0.5}>
                  <animateMotion dur="1.2s" repeatCount="indefinite" path={p.pathD} begin="0.6s" />
                </circle>
              </>
            )}
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
          <button onClick={handleUndo} disabled={solved || moveHistory.length === 0} style={{ background: moveHistory.length > 0 && !solved ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", border: "1px solid " + (moveHistory.length > 0 && !solved ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.05)"), borderRadius: 8, padding: "7px 10px", color: moveHistory.length > 0 && !solved ? "#818cf8" : "rgba(255,255,255,0.2)", fontSize: 13, cursor: moveHistory.length > 0 && !solved ? "pointer" : "not-allowed" }} title="Undo last placement">↩</button>
          <button onClick={handleRedo} disabled={solved || redoStack.length === 0} style={{ background: redoStack.length > 0 && !solved ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)", border: "1px solid " + (redoStack.length > 0 && !solved ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.05)"), borderRadius: 8, padding: "7px 10px", color: redoStack.length > 0 && !solved ? "#4ade80" : "rgba(255,255,255,0.2)", fontSize: 13, cursor: redoStack.length > 0 && !solved ? "pointer" : "not-allowed" }} title="Redo">↪</button>
          <button onClick={handleClear} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }} title="Restart">↺</button>
          <button onClick={handleSkip} disabled={!canSkip || solved} style={{ background: (canSkip && !solved) ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.03)", border: "1px solid " + ((canSkip && !solved) ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.05)"), borderRadius: 8, padding: "7px 10px", color: (canSkip && !solved) ? "#ef4444" : "rgba(255,255,255,0.2)", fontSize: 13, cursor: (canSkip && !solved) ? "pointer" : "not-allowed" }} title={canSkip ? `Skip Level (${2 - skipsInChapter} skips left in chapter)` : "No skips left in chapter"}>⏭</button>
        </div>
      </div>
      {showHint && <div style={{ maxWidth: 520, width: "100%", marginBottom: 12, padding: "9px 14px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", fontSize: 12, lineHeight: 1.5 }}>{level.hint}</div>}
      {(() => {
        const hints = [];
        const hasPipes = level.pieces.some(p => p.startsWith("PIPE:"));
        const hasTriggers = level.pieces.some(p => p.startsWith("TRIGGER:"));
        const hasShelves = Array.isArray(level.layout[0]?.[0]);
        const hasSrc = level.pieces.some(p => p.startsWith("OUT:"));
        const hasSink = level.pieces.some(p => p.startsWith("IN:"));
        const hasJumpers = level.pieces.some(p => /:\d+/.test(p.replace(/^(OUT:\w+\||IN:\w+|\w+\|)/, "")));
        if (hasPipes) hints.push({ icon: "🔄", text: "Tap pipes to rotate! Colors enter one side and exit the other.", color: "rgba(139,92,246,0.7)" });
        if (hasTriggers) hints.push({ icon: "🔒", text: "Trigger blocks unlock locked squares — match the trigger to free its target!", color: "rgba(251,191,36,0.7)" });
        if (hasShelves) hints.push({ icon: "📚", text: "Shelves stack vertically — tiles on different shelves connect up and down!", color: "rgba(34,211,238,0.7)" });
        if (hasSrc || hasSink) hints.push({ icon: "📡", text: `${hasSrc ? "Sources send signals only." : ""}${hasSrc && hasSink ? " " : ""}${hasSink ? "Sinks receive signals only." : ""}`, color: "rgba(248,113,113,0.7)" });
        if (hasJumpers) hints.push({ icon: "🦘", text: "Numbered arrows jump over tiles to reach distant neighbors!", color: "rgba(74,222,128,0.7)" });
        if (hints.length === 0) return null;
        return (
          <div style={{ maxWidth: 520, width: "100%", marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {hints.map((h, i) => (
              <div key={i} style={{ flex: "1 1 auto", padding: "5px 10px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: `1px solid ${h.color}33`, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: h.color, lineHeight: 1.4 }}>
                <span style={{ fontSize: 14 }}>{h.icon}</span>
                <span>{h.text}</span>
              </div>
            ))}
          </div>
        );
      })()}
      {(() => {
        const l3d = getLayout3D(level.layout);
        const numShelves = l3d.length;
        if (numShelves === 1) {
          return (
            <div ref={containerRef} style={{ position: "relative", marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", overflow: "visible" }}>
              <ConnectionBeams board={board} level={level} containerRef={containerRef} />
              {level.conduits && <ConduitOverlay level={level} board={board} containerRef={containerRef} />}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${l3d[0][0].length}, ${cellSize}px)`, gap: 4, position: "relative", zIndex: 1 }}>
                {l3d[0].flatMap((row, r) => row.map((cellName, c) => {
                  if (!cellName) return <div key={`${r}-${c}`} style={{ width: cellSize, height: cellSize }} />;
                  const isErr = Array.from(errors).some(e => e.startsWith(`${cellName}:`));
                  const locked = !board[cellName] && isLocked(level, board, cellName);
                  return <GridCell key={`${r}-${c}`} cellName={cellName} displayLabel={displayLabelMap[cellName]} size={cellSize} tile={board[cellName]} hasError={isErr} onClick={() => handleCellClick(cellName)} isTarget={!solved && selectedTile && !board[cellName] && !locked} isLockedCell={locked} currentChapter={currentChapter} flashColor={flashes[cellName]} displayLabelMap={displayLabelMap} walls={level.walls?.[cellName]} isJumperWall={!!level.jumperWalls?.[cellName]} />;
                }))}
              </div>
            </div>
          );
        }

        const maxCols = Math.max(...l3d.map(layer => Math.max(...layer.map(row => row.length))));
        const maxRows = Math.max(...l3d.map(layer => layer.length));
        const shelfGap = 4;

        return (
          <div ref={containerRef} style={{ position: "relative", marginBottom: 10, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible" }}>
            <ConnectionBeams board={board} level={level} containerRef={containerRef} />
            {level.conduits && <ConduitOverlay level={level} board={board} containerRef={containerRef} />}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {l3d.map((_, z) => (
                <button key={z} onClick={() => setCurrentShelf(z)} style={{ padding: "4px 14px", borderRadius: 8, border: z === currentShelf ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.15)", background: z === currentShelf ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)", color: z === currentShelf ? "#fbbf24" : "rgba(255,255,255,0.5)", cursor: "pointer", transition: "all 0.2s", fontSize: 11, fontFamily: "'Orbitron',sans-serif", letterSpacing: "0.05em" }}>
                  Shelf {z + 1}
                </button>
              ))}
            </div>

            <div style={{ position: "relative", width: maxCols * (cellSize + shelfGap) - shelfGap, height: maxRows * (cellSize + shelfGap) - shelfGap }}>
              {l3d.map((layer, z) => {
                const isFocused = z === currentShelf;
                return (
                  <div key={z} style={{
                    position: z === currentShelf ? "relative" : "absolute",
                    top: 0, left: 0,
                    zIndex: isFocused ? 20 : 10 - Math.abs(z - currentShelf),
                    opacity: isFocused ? 1 : 0.35,
                    pointerEvents: isFocused ? "auto" : "none",
                    transition: "opacity 0.3s ease",
                  }}>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${layer[0].length}, ${cellSize}px)`, gap: shelfGap }}>
                      {layer.flatMap((row, r) => row.map((cellName, c) => {
                        if (!cellName) return <div key={`${z}-${r}-${c}`} style={{ width: cellSize, height: cellSize }} />;
                        if (!isFocused) {
                          // Non-focused shelf: show ghost cells
                          const tile = board[cellName];
                          return <div key={`${z}-${r}-${c}`} style={{ width: cellSize, height: cellSize, borderRadius: 8, background: tile ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }} />;
                        }
                        const isErr = Array.from(errors).some(e => e.startsWith(`${cellName}:`));
                        const locked = !board[cellName] && isLocked(level, board, cellName);
                        return <GridCell key={`${z}-${r}-${c}`} cellName={cellName} displayLabel={displayLabelMap[cellName]} size={cellSize} tile={board[cellName]} hasError={isErr} onClick={() => handleCellClick(cellName)} isTarget={!solved && selectedTile && !board[cellName] && !locked} isLockedCell={locked} currentChapter={currentChapter} flashColor={flashes[cellName]} displayLabelMap={displayLabelMap} walls={level.walls?.[cellName]} isJumperWall={!!level.jumperWalls?.[cellName]} />;
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
      </div>
      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{Object.keys(board).length} / {level.cells.length} placed</div>
      {showMechanicIntro && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)" }}>
          <div style={{ maxWidth:400,width:"90%",background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)",border:`1px solid ${showMechanicIntro.color}44`,borderRadius:16,padding:"28px 24px",textAlign:"center",boxShadow:`0 0 40px ${showMechanicIntro.color}22` }}>
            <div style={{ fontSize:48,marginBottom:12 }}>{showMechanicIntro.icon}</div>
            <div style={{ fontSize:18,fontWeight:700,fontFamily:"'Orbitron',sans-serif",color:showMechanicIntro.color,marginBottom:16,letterSpacing:"0.05em" }}>{showMechanicIntro.title}</div>
            {showMechanicIntro.lines.map((line, i) => (
              <p key={i} style={{ fontSize:13,color:"rgba(255,255,255,0.75)",lineHeight:1.6,marginBottom:10,fontFamily:"'JetBrains Mono',monospace" }}>{line}</p>
            ))}
            <button onClick={() => setShowMechanicIntro(null)} style={{ marginTop:16,padding:"10px 32px",borderRadius:10,border:`1px solid ${showMechanicIntro.color}66`,background:`${showMechanicIntro.color}22`,color:showMechanicIntro.color,fontSize:14,fontWeight:700,fontFamily:"'Orbitron',sans-serif",cursor:"pointer",letterSpacing:"0.1em" }}>GOT IT!</button>
          </div>
        </div>
      )}
      {solved && <FinishOverlay level={level} hasNext={currentLevel < LEVELS.length - 1} onNext={() => initLevel(currentLevel + 1)} onReplay={() => initLevel(currentLevel)} />}
      {showVictory && <VictoryScreen onBack={() => { setShowVictory(false); setScreen("menu"); }} />}
    </div>
  );
}
