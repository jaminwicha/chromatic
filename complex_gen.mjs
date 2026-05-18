import fs from 'fs';

const DIRS = ["UP", "DOWN", "LEFT", "RIGHT"];
const OPPOSITE = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT", UP_LEFT: "DOWN_RIGHT", DOWN_RIGHT: "UP_LEFT", UP_RIGHT: "DOWN_LEFT", DOWN_LEFT: "UP_RIGHT", SHELF_UP: "SHELF_DOWN", SHELF_DOWN: "SHELF_UP" };
const ROTATE_CW = { UP: "RIGHT", RIGHT: "DOWN", DOWN: "LEFT", LEFT: "UP" };
const COLORS = ["RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "CYAN", "ORANGE", "PINK"];

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
  const d = DIRS.includes(dir) ? { UP: { dr: -1, dc: 0 }, DOWN: { dr: 1, dc: 0 }, LEFT: { dr: 0, dc: -1 }, RIGHT: { dr: 0, dc: 1 } }[dir] : null;
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

function isLocked(level, board, cellName, remaining) {
  const satisfied = getSatisfiedTriggers(level, board);
  for (const [cell, str] of Object.entries(board)) {
    const t = parseTile(str);
    if (t.type === "TRIGGER" && t.targetCell === cellName && !satisfied.has(cell)) {
      return true;
    }
  }
  // Also check unplaced triggers in the remaining pieces (tray)
  if (remaining) {
    for (const pieceStr of remaining) {
      const t = parseTile(pieceStr);
      if (t.type === "TRIGGER" && t.targetCell === cellName) {
        return true;
      }
    }
  }
  return false;
}

function solvePuzzle(level) {
  const cells = level.cells;
  const solutions = [];

  function isValidPartial(board, cellName, tileStr, remaining) {
    const tile = parseTile(tileStr);
    if (isLocked(level, board, cellName, remaining)) {
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

  let iterations = 0;
  function solve(board, remaining) {
    if (iterations++ > 10000) return; // timeout
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
      if (!board[c] && !isLocked(level, board, c, remaining)) { targetCell = c; break; }
    }
    if (!targetCell) return;

    for (let i = 0; i < remaining.length; i++) {
      const piece = remaining[i];
      if (i > 0 && piece === remaining[i-1]) continue; // Deduplicate
      const variants = getAllPipeRotations(piece);
      const newRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
      for (const variant of variants) {
        if (isValidPartial(board, targetCell, variant, newRemaining)) {
          solve({ ...board, [targetCell]: variant }, newRemaining);
          if (solutions.length >= 2 || iterations > 10000) return;
        }
      }
    }
  }

  solve({}, [...level.pieces].sort());
  return solutions;
}

function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildComplexLevel(number, name, targetSize, useTriggers, useShelves) {
  while (true) {
    let layout = [];
    const width = 8, height = 8, depth = useShelves ? 3 : 1;
    for (let z=0; z<depth; z++) {
      let layer = [];
      for (let r=0; r<height; r++) {
        let row = [];
        for (let c=0; c<width; c++) row.push(null);
        layer.push(row);
      }
      layout.push(layer);
    }

    let cellIndex = 0;
    function getCellName(idx) { return String.fromCharCode(65 + idx); }
    
    // We maintain a list of active frontier paths that need connecting.
    // Each frontier has { cell, z, r, c, inColor, moveFromPrev, parentNode }
    let startZ = useShelves ? 1 : 0;
    let startCell = getCellName(cellIndex++);
    layout[startZ][3][3] = startCell;
    
    let cells = [startCell];
    let pieces = [];
    let solution = {};
    let pieceSet = new Set();
    
    let startColor = COLORS[0];
    let p0 = `OUT:${startColor}`;
    let frontier = [];
    
    let branchDirs = [...DIRS].sort(() => 0.5 - Math.random()).slice(0, 1);
    let outParts = [];
    
    let canBranch = true;
    
    for (let d of branchDirs) {
      let nr = 3 + (d === "DOWN" ? 1 : d === "UP" ? -1 : 0);
      let nc = 3 + (d === "RIGHT" ? 1 : d === "LEFT" ? -1 : 0);
      let nextCell = getCellName(cellIndex++);
      layout[startZ][nr][nc] = nextCell;
      cells.push(nextCell);
      
      let color = COLORS[Math.floor(Math.random() * COLORS.length)];
      outParts.push(`${color}:${d}`);
      
      frontier.push({ cell: nextCell, z: startZ, r: nr, c: nc, inColor: color, inDir: d, parentNode: startCell });
    }
    
    p0 += "|" + outParts.join(",");
    pieces.push(p0);
    solution[startCell] = p0;
    pieceSet.add(p0);
    
    let stuck = false;
    
    while (frontier.length > 0) {
      let front = frontier.shift();
      
      // If we've reached target size (or over it), turn this frontier into a SINK.
      if (cells.length >= targetSize) {
        let p = `IN:${front.inColor}`;
        if (!pieceSet.has(p)) {
          pieces.push(p);
          solution[front.cell] = p;
          pieceSet.add(p);
          continue;
        } else {
          // duplicate IN port logic (usually fine but if we want unique tiles, this is bad).
          // We can allow duplicate IN blocks. We'll append it anyway.
          pieces.push(p);
          solution[front.cell] = p;
          continue;
        }
      }
      
      // What can we do here?
      // Options:
      // 1. NORMAL move (dist 1)
      // 2. JUMP move (dist 2)
      // 3. PIPE transform
      // 4. BRANCH (split into 2)
      // 5. STAIRS (if useShelves)
      // 6. TRIGGER (if useTriggers and cells.length > 3)
      
      let options = [];
      
      // Check available neighbors
      for (let d of DIRS) {
        if (d === OPPOSITE[front.inDir]) continue; // Don't go back
        
        let dr = d==="DOWN"?1:d==="UP"?-1:0;
        let dc = d==="RIGHT"?1:d==="LEFT"?-1:0;
        
        // Dist 1
        let n1r = front.r+dr, n1c = front.c+dc;
        if (n1r>=0 && n1r<height && n1c>=0 && n1c<width && layout[front.z][n1r][n1c] === null) {
          options.push({ type: "NORMAL", dir: d, dist: 1, z: front.z, r: n1r, c: n1c });
          options.push({ type: "PIPE", dir: d, dist: 1, z: front.z, r: n1r, c: n1c });
          
          if (useTriggers && cells.length > 3) {
            options.push({ type: "TRIGGER", dir: d, dist: 1, z: front.z, r: n1r, c: n1c });
          }
        }
        
        // Dist 2 (Jump)
        let n2r = front.r+dr*2, n2c = front.c+dc*2;
        if (n2r>=0 && n2r<height && n2c>=0 && n2c<width && layout[front.z][n2r][n2c] === null && layout[front.z][n1r][n1c] === null) {
          options.push({ type: "JUMP", dir: d, dist: 2, z: front.z, r: n2r, c: n2c });
        }
      }
      
      // Stairs
      if (useShelves) {
        if (front.z < depth-1 && layout[front.z+1][front.r][front.c] === null) {
          options.push({ type: "STAIRS_UP", z: front.z+1, r: front.r, c: front.c });
        }
        if (front.z > 0 && layout[front.z-1][front.r][front.c] === null) {
          options.push({ type: "STAIRS_DOWN", z: front.z-1, r: front.r, c: front.c });
        }
      }
      
      // Branching removed for performance.
      canBranch = false;
      
      if (options.length === 0) {
        // Can't move anywhere, turn into SINK
        let p = `IN:${front.inColor}`;
        pieces.push(p);
        solution[front.cell] = p;
        continue;
      }
      
      // Weight the options to make it interesting
      let weights = { "NORMAL": 30, "PIPE": 20, "JUMP": 10, "STAIRS_UP": 15, "STAIRS_DOWN": 15, "BRANCH": 5, "TRIGGER": 15 };
      let pool = [];
      for (let o of options) {
        for (let i=0; i<(weights[o.type]||10); i++) pool.push(o);
      }
      
      let move = randItem(pool);
      let p = "";
      
      if (move.type === "BRANCH") {
        let c1 = COLORS[Math.floor(Math.random() * COLORS.length)];
        let c2 = COLORS[Math.floor(Math.random() * COLORS.length)];
        p = `${front.inColor}|${c1}:${move.moves[0].dir},${c2}:${move.moves[1].dir}`;
        
        let nextCell1 = getCellName(cellIndex++);
        layout[front.z][move.moves[0].r][move.moves[0].c] = nextCell1;
        cells.push(nextCell1);
        frontier.push({ cell: nextCell1, z: front.z, r: move.moves[0].r, c: move.moves[0].c, inColor: c1, inDir: move.moves[0].dir, parentNode: front.cell });
        
        let nextCell2 = getCellName(cellIndex++);
        layout[front.z][move.moves[1].r][move.moves[1].c] = nextCell2;
        cells.push(nextCell2);
        frontier.push({ cell: nextCell2, z: front.z, r: move.moves[1].r, c: move.moves[1].c, inColor: c2, inDir: move.moves[1].dir, parentNode: front.cell });
        
        canBranch = false; // Prevent too many branches
      } else if (move.type === "PIPE") {
        let outColor = COLORS.find(c => c !== front.inColor && Math.random() > 0.5) || COLORS[1];
        p = `PIPE:${OPPOSITE[front.inDir]}:${front.inColor}>${move.dir}:${outColor}`;
        
        let nextCell = getCellName(cellIndex++);
        layout[move.z][move.r][move.c] = nextCell;
        cells.push(nextCell);
        frontier.push({ cell: nextCell, z: move.z, r: move.r, c: move.c, inColor: outColor, inDir: move.dir, parentNode: front.cell });
      } else if (move.type === "STAIRS_UP" || move.type === "STAIRS_DOWN") {
        let outColor = COLORS.find(c => c !== front.inColor && Math.random() > 0.5) || COLORS[0];
        let stairsDir = move.type === "STAIRS_UP" ? "UP" : "DOWN";
        let outDir = move.type === "STAIRS_UP" ? "SHELF_UP" : "SHELF_DOWN";
        p = `STAIRS:${stairsDir}:${front.inColor}|${outColor}:${outDir}`;
        
        let nextCell = getCellName(cellIndex++);
        layout[move.z][move.r][move.c] = nextCell;
        cells.push(nextCell);
        frontier.push({ cell: nextCell, z: move.z, r: move.r, c: move.c, inColor: outColor, inDir: outDir, parentNode: front.cell });
      } else if (move.type === "TRIGGER") {
        let outColor = COLORS.find(c => c !== front.inColor && Math.random() > 0.5) || COLORS[0];
        let nextCell = getCellName(cellIndex++);
        // Pick a target cell that is NOT the trigger's own cell or its parent
        // Only pick from latter half of cells for safer ordering
        const candidates = cells.filter(c => c !== nextCell && c !== front.cell);
        const laterCandidates = candidates.slice(Math.max(0, Math.floor(candidates.length / 2)));
        let futureTarget = laterCandidates.length > 0 ? randItem(laterCandidates) : (candidates.length > 0 ? randItem(candidates) : cells[0]);
        p = `TRIGGER:${front.inColor}:${futureTarget}|${outColor}:${move.dir}`;
        
        layout[move.z][move.r][move.c] = nextCell;
        cells.push(nextCell);
        frontier.push({ cell: nextCell, z: move.z, r: move.r, c: move.c, inColor: outColor, inDir: move.dir, parentNode: front.cell });
      } else {
        // NORMAL or JUMP
        let outColor = COLORS.find(c => c !== front.inColor && Math.random() > 0.5) || COLORS[0];
        p = `${front.inColor}|${outColor}:${move.dir}${move.dist > 1 ? ":" + move.dist : ""}`;
        
        let nextCell = getCellName(cellIndex++);
        layout[move.z][move.r][move.c] = nextCell;
        cells.push(nextCell);
        frontier.push({ cell: nextCell, z: move.z, r: move.r, c: move.c, inColor: outColor, inDir: move.dir, parentNode: front.cell });
      }
      
      pieces.push(p);
      solution[front.cell] = p;
      pieceSet.add(p);
    }
    
    // Trim Layout
    let minR = height, maxR = 0, minC = width, maxC = 0, minZ = depth, maxZ = 0;
    for (let z=0; z<depth; z++) {
      for (let r=0; r<height; r++) {
        for (let c=0; c<width; c++) {
          if (layout[z][r][c]) {
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
          }
        }
      }
    }
    
    let trimmedLayout = [];
    for (let z=minZ; z<=maxZ; z++) {
      let layer = [];
      for (let r=minR; r<=maxR; r++) {
        let row = [];
        for (let c=minC; c<=maxC; c++) {
          row.push(layout[z][r][c]);
        }
        layer.push(row);
      }
      trimmedLayout.push(layer);
    }
    if (trimmedLayout.length === 1) trimmedLayout = trimmedLayout[0];

    const level = { number, name, cells, layout: trimmedLayout, pieces, solution, hint: "Use all pieces correctly!" };
    
    // Validate shelf count (relax for small levels)
    if (useShelves) {
      const is3d = Array.isArray(trimmedLayout[0]?.[0]);
      const shelfCount = is3d ? trimmedLayout.length : 1;
      const minShelves = targetSize >= 12 ? 3 : 2;
      if (shelfCount < minShelves) continue;
    }
    
    // Validate trigger count (relax for small levels)
    if (useTriggers) {
      const triggerCount = pieces.filter(p => p.startsWith("TRIGGER:")).length;
      const minTriggers = targetSize >= 12 ? 2 : 1;
      if (triggerCount < minTriggers) continue;
    }
    
    // Validate uniqueness!
    const sols = solvePuzzle(level);
    if (sols.length === 1) {
      return level;
    }
  }
}

let allLevels = [];

const CALM4_NAMES = ["Lantern Glow", "Coral Reef", "Paper Crane", "Bamboo Wind", "River Stone", "Cloud Garden", "Honey Light", "Pebble Shore", "Candle Flame", "Silk Thread"];
const CALM5_NAMES = ["Crystal Cave", "Painted Sky", "Fern Hollow", "Opal Stream", "Raindrop", "Cedar Shade", "Glass Bloom", "Copper Moon", "Snow Blossom", "Jade Mirror"];

console.log("=== Generating Calm IV (8-10 tiles, easier) ===");
for (let i = 0; i < 10; i++) {
  const targetSize = i < 3 ? 8 : i < 7 ? 9 : 10;
  console.log(`  Calm IV ${i+1}: ${CALM4_NAMES[i]} (${targetSize} tiles)`);
  allLevels.push(buildComplexLevel(176 + i, CALM4_NAMES[i], targetSize, true, true));
}

console.log("=== Generating Calm V (9-11 tiles, easier) ===");
for (let i = 0; i < 10; i++) {
  const targetSize = i < 3 ? 9 : i < 7 ? 10 : 11;
  console.log(`  Calm V ${i+1}: ${CALM5_NAMES[i]} (${targetSize} tiles)`);
  allLevels.push(buildComplexLevel(186 + i, CALM5_NAMES[i], targetSize, true, true));
}

fs.writeFileSync('new_levels.json', JSON.stringify(allLevels, null, 2));
console.log(`Done. Generated ${allLevels.length} levels.`);
