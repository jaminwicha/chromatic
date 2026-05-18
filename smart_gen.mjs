import fs from 'fs';

const DIRS = ["UP", "DOWN", "LEFT", "RIGHT"];
const COLORS = ["RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "CYAN", "ORANGE", "PINK"];

function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildPathLevel(number, name, size, useTriggers, useShelves) {
  while (true) {
    let layout = [];
    let cells = [];
    const width = 6, height = 6, depth = useShelves ? 3 : 1;
    
    for (let z=0; z<depth; z++) {
      let layer = [];
      for (let r=0; r<height; r++) {
        let row = [];
        for (let c=0; c<width; c++) row.push(null);
        layer.push(row);
      }
      layout.push(layer);
    }

    let z=0, r=0, c=0;
    if (useShelves) z = Math.floor(depth/2);
    r = Math.floor(height/2);
    c = Math.floor(width/2);
    
    let cellIndex = 0;
    function getCellName(idx) { return String.fromCharCode(65 + idx); }
    
    let currentCell = getCellName(cellIndex++);
    layout[z][r][c] = currentCell;
    cells.push(currentCell);
    
    let nodes = [{ cell: currentCell, z, r, c }];
    
    let stuck = false;
    while (nodes.length < size) {
      let last = nodes[nodes.length - 1];
      
      let possibleDirs = [];
      for (let d of DIRS) {
        let isLastStairs = last.moveFromPrev && (last.moveFromPrev.type === "STAIRS_UP" || last.moveFromPrev.type === "STAIRS_DOWN");
        if (isLastStairs && (d === "UP" || d === "DOWN")) continue;
        
        let dr = d==="DOWN"?1:d==="UP"?-1:0;
        let dc = d==="RIGHT"?1:d==="LEFT"?-1:0;
        let nr = last.r+dr, nc = last.c+dc;
        if (nr>=0 && nr<height && nc>=0 && nc<width && layout[last.z][nr][nc] === null) {
          possibleDirs.push({ dir: d, z: last.z, r: nr, c: nc, type: "NORMAL" });
        }
      }
      if (useShelves) {
        if (last.z < depth-1 && layout[last.z+1][last.r][last.c] === null) {
          possibleDirs.push({ dir: "UP", z: last.z+1, r: last.r, c: last.c, type: "STAIRS_UP" });
        }
        if (last.z > 0 && layout[last.z-1][last.r][last.c] === null) {
          possibleDirs.push({ dir: "DOWN", z: last.z-1, r: last.r, c: last.c, type: "STAIRS_DOWN" });
        }
      }
      
      if (possibleDirs.length === 0) { stuck = true; break; }
      
      let move = randItem(possibleDirs);
      let nextCell = getCellName(cellIndex++);
      layout[move.z][move.r][move.c] = nextCell;
      cells.push(nextCell);
      
      nodes.push({ cell: nextCell, z: move.z, r: move.r, c: move.c, moveFromPrev: move });
    }
    if (stuck) continue; // retry layout

    let pieces = [];
    let solution = {};
    let colorIdx = 0;
    let currentColor = COLORS[0];
    
    let firstMove = nodes[1].moveFromPrev;
    let p0 = "";
    if (firstMove.type === "STAIRS_UP") {
      p0 = `OUT:${currentColor}|${currentColor}:SHELF_UP`;
    } else if (firstMove.type === "STAIRS_DOWN") {
      p0 = `OUT:${currentColor}|${currentColor}:SHELF_DOWN`;
    } else {
      p0 = `OUT:${currentColor}|${currentColor}:${firstMove.dir}`;
    }
    pieces.push(p0);
    solution[nodes[0].cell] = p0;

    let pieceSet = new Set([p0]);
    let unique = true;

    for (let i = 1; i < nodes.length - 1; i++) {
      let node = nodes[i];
      let nextMove = nodes[i+1].moveFromPrev;
      let outDir = nextMove.dir;
      if (nextMove.type === "STAIRS_UP") outDir = "SHELF_UP";
      if (nextMove.type === "STAIRS_DOWN") outDir = "SHELF_DOWN";
      
      let inColor = currentColor;
      // Try to pick an outColor that creates a unique piece
      let outColor = null;
      let p = "";
      let isTrigger = useTriggers && Math.random() < 0.3 && i > 1 && i < nodes.length - 2;
      let isStairs = (node.moveFromPrev.type === "STAIRS_UP" || node.moveFromPrev.type === "STAIRS_DOWN");
      
      let validColors = [...COLORS].sort(() => 0.5 - Math.random());
      let found = false;
      for (let c of validColors) {
        if (c === inColor) continue;
        if (isStairs) {
          let stairsDir = node.moveFromPrev.type === "STAIRS_UP" ? "UP" : "DOWN";
          p = `STAIRS:${stairsDir}:${inColor}|${c}:${outDir}`;
        } else if (isTrigger) {
          let targetCell = nodes[Math.floor(Math.random() * (nodes.length - i - 1)) + i + 1].cell;
          p = `TRIGGER:${inColor}:${targetCell}|${c}:${outDir}`;
        } else {
          p = `${inColor}|${c}:${outDir}`;
        }
        if (!pieceSet.has(p)) {
          outColor = c;
          found = true;
          break;
        }
      }
      
      if (!found) { unique = false; break; }
      currentColor = outColor;
      
      pieces.push(p);
      pieceSet.add(p);
      solution[node.cell] = p;
    }
    
    if (!unique) continue;

    let plast = `IN:${currentColor}`;
    if (pieceSet.has(plast)) continue;
    pieces.push(plast);
    solution[nodes[nodes.length-1].cell] = plast;
    
    // Check if it fits the requirements
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

    return { number, name, cells, layout: trimmedLayout, pieces, solution, hint: "Follow the unique path!" };
  }
}

let allLevels = [];
let num = 109;

for (let i=0; i<6; i++) allLevels.push(buildPathLevel(num++, `Control Flow ${i+1}`, 8, true, false));
for (let i=0; i<6; i++) allLevels.push(buildPathLevel(num++, `Multi-Shelf ${i+1}`, 8, false, true));
for (let i=0; i<5; i++) allLevels.push(buildPathLevel(num++, `Ascension ${i+1}`, 10, true, true));
allLevels.push(buildPathLevel(num++, `The Zenith`, 11, true, true));
for (let i=0; i<5; i++) allLevels.push(buildPathLevel(num++, `Master IV - ${i+1}`, 14, true, false));
for (let i=0; i<5; i++) allLevels.push(buildPathLevel(num++, `Master V - ${i+1}`, 14, false, true));
for (let i=0; i<5; i++) allLevels.push(buildPathLevel(num++, `Master VI - ${i+1}`, 16, true, true));

// Ensure 109 to 140 (32 levels).
// Wait, 6 + 6 + 5 + 1 + 5 + 5 + 5 = 33 levels?
// Let me recount: Control Flow(6) + Multi(6) = 12. Ascension(5). 12+5 = 17. 
// Master IV(5) + V(5) + VI(5) = 15. 17+15 = 32 levels!
// Ah wait! The loop for Ascension is 5 levels (i < 5). Then I manually add "The Zenith". 
// That makes it 6 Ascension levels! 12 + 6 + 15 = 33!
// I'll change Ascension to `i < 4` + `The Zenith`.

allLevels = [];
num = 109;
for (let i=0; i<6; i++) allLevels.push(buildPathLevel(num++, `Control Flow ${i+1}`, 8, true, false));
for (let i=0; i<6; i++) allLevels.push(buildPathLevel(num++, `Multi-Shelf ${i+1}`, 8, false, true));
for (let i=0; i<4; i++) allLevels.push(buildPathLevel(num++, `Ascension ${i+1}`, 10, true, true));
allLevels.push(buildPathLevel(num++, `The Zenith`, 11, true, true));
for (let i=0; i<5; i++) allLevels.push(buildPathLevel(num++, `Master IV - ${i+1}`, 14, true, false));
for (let i=0; i<5; i++) allLevels.push(buildPathLevel(num++, `Master V - ${i+1}`, 14, false, true));
for (let i=0; i<5; i++) allLevels.push(buildPathLevel(num++, `Master VI - ${i+1}`, 16, true, true));

fs.writeFileSync('new_32_levels.json', JSON.stringify(allLevels, null, 2));
console.log("Generated new_32_levels.json");
