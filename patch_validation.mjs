import fs from 'fs';

let content = fs.readFileSync('app/ChromaticPuzzle.jsx', 'utf8');

const engineCode = `// ─── ENGINE ─────────────────────────────────────────────────────────────────

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
    return \`\${rotateDirection(inDir)}:\${inColor}>\${rotateDirection(outDir)}:\${outColor}\`;
  });
  return \`PIPE:\${channels.join(",")}\`;
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
  const satisfied = getSatisfiedTriggers(level, board);
  for (const [cell, str] of Object.entries(board)) {
    const t = parseTile(str);
    if (t.type === "TRIGGER" && t.targetCell === cellName && !satisfied.has(cell)) {
      return true;
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
             errors.add(\`\${cellName}:\${conn.dir}\`);
             continue;
          }
          const nTile = parseTile(board[neighbor.cell]);
          if (!checkMatch(tile, conn, nTile)) {
             errors.add(\`\${cellName}:\${conn.dir}\`);
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

// ─── ALL`;

const startIdx = content.indexOf('// ─── ENGINE');
const endIdx = content.indexOf('// ─── ALL');

if (startIdx !== -1 && endIdx !== -1) {
  content = content.slice(0, startIdx) + engineCode + content.slice(endIdx + 10);
  fs.writeFileSync('app/ChromaticPuzzle.jsx', content);
  console.log("Patched validation engine!");
} else {
  console.log("Could not find ENGINE or ALL sections.");
}
