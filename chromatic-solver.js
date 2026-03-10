#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// CHROMATIC — Backtracking Puzzle Solver
// Verifies all levels have unique solutions
// Usage: node chromatic-solver.js
// ═══════════════════════════════════════════════════════════════════════

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
    return { type: "INPUT_ONLY", acceptColors: str.slice(3).split(","), outer: null, connections: [], id: str };
  }
  // OUTPUT_ONLY: "OUT:CENTER|COLOR:DIR[:DIST],..."
  if (str.startsWith("OUT:")) {
    const rest = str.slice(4);
    const [center, innerPart] = rest.split("|");
    const connections = innerPart.split(",").map(p => {
      const parts = p.split(":");
      return { color: parts[0], dir: parts[1], distance: parts[2] ? parseInt(parts[2]) : 1 };
    });
    return { type: "OUTPUT_ONLY", center, outer: null, connections, id: str };
  }
  // NORMAL: "OUTER|INNER:DIR[:DIST],..."
  const [outer, innerPart] = str.split("|");
  const connections = innerPart.split(",").map(p => {
    const parts = p.split(":");
    return { color: parts[0], dir: parts[1], distance: parts[2] ? parseInt(parts[2]) : 1 };
  });
  return { type: "NORMAL", outer, connections, id: str };
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

    // Check outgoing arrows (NORMAL and OUTPUT_ONLY tiles)
    if (tile.type !== "INPUT_ONLY") {
      for (const conn of tile.connections) {
        const n = getNeighborAtDist(level.layout, pos.row, pos.col, conn.dir, conn.distance || 1);
        if (!n) return false; // arrow points off-grid or to null cell
        if (board[n.cell]) {
          const nt = parseTile(board[n.cell]);
          if (nt.type === "NORMAL" && conn.color !== nt.outer) return false;
          if (nt.type === "INPUT_ONLY" && !nt.acceptColors.includes(conn.color)) return false;
          if (nt.type === "OUTPUT_ONLY") return false; // can't point at a source
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

// ─── ALL 60 LEVELS ──────────────────────────────────────────────────────

const LEVELS = [
  // === CHAPTER 1: FUNDAMENTALS (1-9) ===
  {number:1,name:"First Link",cells:["A","B"],layout:[["A","B"]],pieces:["BLUE|RED:RIGHT","RED|BLUE:LEFT"],solution:{A:"BLUE|RED:RIGHT",B:"RED|BLUE:LEFT"}},
  {number:2,name:"Three Chain",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|GREEN:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|BLUE:RIGHT",C:"BLUE|GREEN:LEFT"}},
  {number:3,name:"Corner Turn",cells:["A","B","C"],layout:[["A",null],["B","C"]],pieces:["GREEN|BLUE:DOWN","BLUE|RED:RIGHT","RED|BLUE:LEFT"],solution:{A:"GREEN|BLUE:DOWN",B:"BLUE|RED:RIGHT",C:"RED|BLUE:LEFT"}},
  {number:4,name:"Split Signal",cells:["A","B","C"],layout:[["A","B"],["C",null]],pieces:["PURPLE|GREEN:RIGHT,RED:DOWN","GREEN|PURPLE:LEFT","RED|PURPLE:UP"],solution:{A:"PURPLE|GREEN:RIGHT,RED:DOWN",B:"GREEN|PURPLE:LEFT",C:"RED|PURPLE:UP"}},
  {number:5,name:"Hub",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT","GREEN|RED:UP","ORANGE|GREEN:LEFT"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"ORANGE|GREEN:LEFT"}},
  {number:6,name:"Diagonal",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["BLUE|RED:DOWN_RIGHT","GREEN|RED:DOWN","PURPLE|RED:RIGHT","RED|GREEN:UP"],solution:{A:"BLUE|RED:DOWN_RIGHT",B:"GREEN|RED:DOWN",C:"PURPLE|RED:RIGHT",D:"RED|GREEN:UP"}},
  {number:7,name:"X Marks It",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["RED|GREEN:DOWN_RIGHT","BLUE|RED:DOWN_LEFT","RED|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"],solution:{A:"RED|GREEN:DOWN_RIGHT",B:"BLUE|RED:DOWN_LEFT",C:"RED|BLUE:UP_RIGHT",D:"GREEN|RED:UP_LEFT"}},
  {number:8,name:"Star Node",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["PURPLE|ORANGE:DOWN","ORANGE|ORANGE:RIGHT","ORANGE|PURPLE:UP,ORANGE:LEFT","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"],solution:{A:"PURPLE|ORANGE:DOWN",B:"ORANGE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,ORANGE:LEFT",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"}},
  {number:9,name:"Full Grid",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT","BLUE|GREEN:RIGHT,RED:DOWN_LEFT","GREEN|BLUE:DOWN","RED|GREEN:RIGHT","GREEN|BLUE:UP","BLUE|GREEN:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT,RED:DOWN_LEFT",C:"GREEN|BLUE:DOWN",D:"RED|GREEN:RIGHT",E:"GREEN|BLUE:UP",F:"BLUE|GREEN:LEFT"}},

  // === CHAPTER 2: MULTI-OUTPUT (10-18) ===
  {number:10,name:"Triple Threat",cells:["A","B","C","D"],layout:[[null,"A",null],["B","C","D"]],pieces:["PURPLE|ORANGE:DOWN","ORANGE|ORANGE:RIGHT","ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT","GREEN|ORANGE:LEFT"],solution:{A:"PURPLE|ORANGE:DOWN",B:"ORANGE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT",D:"GREEN|ORANGE:LEFT"}},
  {number:11,name:"Broadcast",cells:["A","B","C","D","E"],layout:[["A","B"],["C","D"],["E",null]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","CYAN|GREEN:UP"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"PURPLE|GREEN:LEFT",E:"CYAN|GREEN:UP"}},
  {number:12,name:"Quad Core",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["RED|ORANGE:DOWN","BLUE|ORANGE:RIGHT","ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"],solution:{A:"RED|ORANGE:DOWN",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"}},
  {number:13,name:"Relay",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","ORANGE|BLUE:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","PINK|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"ORANGE|BLUE:LEFT",D:"GREEN|RED:UP",E:"PURPLE|GREEN:LEFT",F:"PINK|PURPLE:LEFT"}},
  {number:14,name:"Crossfire",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["BLUE|RED:DOWN,GREEN:DOWN_LEFT","GREEN|RED:RIGHT","RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN","PURPLE|RED:LEFT","ORANGE|RED:UP"],solution:{A:"BLUE|RED:DOWN,GREEN:DOWN_LEFT",B:"GREEN|RED:RIGHT",C:"RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN",D:"PURPLE|RED:LEFT",E:"ORANGE|RED:UP"}},
  {number:15,name:"Pinwheel",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["RED|GREEN:DOWN_RIGHT,BLUE:RIGHT","BLUE|RED:DOWN_LEFT","RED|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"],solution:{A:"RED|GREEN:DOWN_RIGHT,BLUE:RIGHT",B:"BLUE|RED:DOWN_LEFT",C:"RED|BLUE:UP_RIGHT",D:"GREEN|RED:UP_LEFT"}},
  {number:16,name:"Cascade",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:RIGHT","PURPLE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|BLUE:RIGHT",C:"BLUE|PURPLE:RIGHT",D:"PURPLE|BLUE:LEFT"}},
  {number:17,name:"Trident",cells:["A","B","C","D","E"],layout:[["A","B","C"],[null,"D",null],[null,"E",null]],pieces:["RED|PURPLE:RIGHT","PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN","GREEN|PURPLE:LEFT","BLUE|ORANGE:DOWN","ORANGE|BLUE:UP"],solution:{A:"RED|PURPLE:RIGHT",B:"PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN",C:"GREEN|PURPLE:LEFT",D:"BLUE|ORANGE:DOWN",E:"ORANGE|BLUE:UP"}},
  {number:18,name:"Mirror",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["GREEN|BLUE:DOWN","RED|GREEN:LEFT,PURPLE:RIGHT","PURPLE|RED:LEFT","BLUE|GREEN:UP","ORANGE|BLUE:LEFT,CYAN:RIGHT","CYAN|ORANGE:LEFT"],solution:{A:"GREEN|BLUE:DOWN",B:"RED|GREEN:LEFT,PURPLE:RIGHT",C:"PURPLE|RED:LEFT",D:"BLUE|GREEN:UP",E:"ORANGE|BLUE:LEFT,CYAN:RIGHT",F:"CYAN|ORANGE:LEFT"}},

  // === CHAPTER 3: COMPLEX LAYOUTS (19-30) ===
  {number:19,name:"Diamond",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT","GREEN|CYAN:UP_RIGHT","RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT","PURPLE|CYAN:UP_LEFT","ORANGE|RED:UP"],solution:{A:"CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT",B:"GREEN|CYAN:UP_RIGHT",C:"RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT",D:"PURPLE|CYAN:UP_LEFT",E:"ORANGE|RED:UP"}},
  {number:20,name:"Web",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["CYAN|BLUE:RIGHT","BLUE|ORANGE:DOWN","PINK|BLUE:LEFT","RED|ORANGE:RIGHT","ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT","GREEN|ORANGE:LEFT"],solution:{A:"CYAN|BLUE:RIGHT",B:"BLUE|ORANGE:DOWN",C:"PINK|BLUE:LEFT",D:"RED|ORANGE:RIGHT",E:"ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT",F:"GREEN|ORANGE:LEFT"}},
  {number:21,name:"Zigzag",cells:["A","B","C","D"],layout:[["A","B",null],[null,"C","D"]],pieces:["RED|GREEN:RIGHT","GREEN|RED:DOWN,BLUE:DOWN_RIGHT","RED|GREEN:UP","BLUE|RED:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|RED:DOWN,BLUE:DOWN_RIGHT",C:"RED|GREEN:UP",D:"BLUE|RED:LEFT"}},
  {number:22,name:"Fortress",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT","PURPLE|ORANGE:DOWN","GREEN|RED:UP","GREEN|ORANGE:RIGHT","ORANGE|PURPLE:UP,GREEN:LEFT"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT",C:"PURPLE|ORANGE:DOWN",D:"GREEN|RED:UP",E:"GREEN|ORANGE:RIGHT",F:"ORANGE|PURPLE:UP,GREEN:LEFT"}},
  {number:23,name:"Helix",cells:["A","B","C","D","E","F","G","H"],layout:[["A","B","C","D"],["E","F","G","H"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|BLUE:RIGHT","BLUE|GREEN:LEFT","CYAN|PURPLE:RIGHT","PURPLE|BLUE:UP","ORANGE|GREEN:UP,PURPLE:LEFT","PINK|ORANGE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",C:"GREEN|BLUE:RIGHT",D:"BLUE|GREEN:LEFT",E:"CYAN|PURPLE:RIGHT",F:"PURPLE|BLUE:UP",G:"ORANGE|GREEN:UP,PURPLE:LEFT",H:"PINK|ORANGE:LEFT"}},
  {number:24,name:"Compass",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["RED|ORANGE:DOWN,BLUE:DOWN_LEFT","BLUE|ORANGE:RIGHT","ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"],solution:{A:"RED|ORANGE:DOWN,BLUE:DOWN_LEFT",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"}},
  {number:25,name:"River",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["RED|GREEN:RIGHT","GREEN|RED:LEFT","PURPLE|GREEN:LEFT,BLUE:RIGHT","BLUE|PURPLE:LEFT","ORANGE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|RED:LEFT",C:"PURPLE|GREEN:LEFT,BLUE:RIGHT",D:"BLUE|PURPLE:LEFT",E:"ORANGE|BLUE:LEFT"}},
  {number:26,name:"Spiral",cells:["A","B","C","D","E"],layout:[["A","B"],["C","D"],["E",null]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","ORANGE|GREEN:UP"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"PURPLE|GREEN:LEFT",E:"ORANGE|GREEN:UP"}},
  {number:27,name:"Nexus",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|BLUE:LEFT","RED|PURPLE:RIGHT","PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT","GREEN|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",C:"GREEN|BLUE:LEFT",D:"RED|PURPLE:RIGHT",E:"PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT",F:"GREEN|PURPLE:LEFT"}},
  {number:28,name:"Galaxy",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT","BLUE|ORANGE:RIGHT","ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN","GREEN|ORANGE:LEFT","RED|ORANGE:UP"],solution:{A:"PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN",D:"GREEN|ORANGE:LEFT",E:"RED|ORANGE:UP"}},
  {number:29,name:"Labyrinth",cells:["A","B","C","D","E","F","G"],layout:[[null,"A",null],["B","C","D"],["E","F","G"]],pieces:["RED|BLUE:DOWN","CYAN|BLUE:RIGHT","BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT","PURPLE|BLUE:LEFT","ORANGE|GREEN:RIGHT","GREEN|ORANGE:LEFT,PINK:RIGHT","PINK|GREEN:LEFT"],solution:{A:"RED|BLUE:DOWN",B:"CYAN|BLUE:RIGHT",C:"BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT",D:"PURPLE|BLUE:LEFT",E:"ORANGE|GREEN:RIGHT",F:"GREEN|ORANGE:LEFT,PINK:RIGHT",G:"PINK|GREEN:LEFT"}},
  {number:30,name:"Chromatic Finale",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,CYAN:RIGHT","CYAN|BLUE:LEFT","RED|ORANGE:RIGHT","ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","YELLOW|PURPLE:RIGHT","PURPLE|YELLOW:LEFT,PINK:RIGHT","PINK|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,CYAN:RIGHT",C:"CYAN|BLUE:LEFT",D:"RED|ORANGE:RIGHT",E:"ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",F:"GREEN|ORANGE:LEFT",G:"YELLOW|PURPLE:RIGHT",H:"PURPLE|YELLOW:LEFT,PINK:RIGHT",I:"PINK|PURPLE:LEFT"}},

  // === CHAPTER 4: SOURCES & SINKS (31-38) ===
  {number:31,name:"Source & Sink",cells:["A","B"],layout:[["A","B"]],pieces:["OUT:RED|RED:RIGHT","IN:RED"],solution:{A:"OUT:RED|RED:RIGHT",B:"IN:RED"}},
  {number:32,name:"Relay Station",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["OUT:GREEN|GREEN:RIGHT","GREEN|RED:RIGHT","IN:RED"],solution:{A:"OUT:GREEN|GREEN:RIGHT",B:"GREEN|RED:RIGHT",C:"IN:RED"}},
  {number:33,name:"Broadcaster",cells:["A","B","C"],layout:[["A","B"],[null,"C"]],pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT","BLUE|GREEN:DOWN","IN:GREEN"],solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT",B:"BLUE|GREEN:DOWN",C:"IN:GREEN"}},
  {number:34,name:"Funnel",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["OUT:RED|RED:RIGHT","RED|BLUE:RIGHT","IN:BLUE"],solution:{A:"OUT:RED|RED:RIGHT",B:"RED|BLUE:RIGHT",C:"IN:BLUE"}},
  {number:35,name:"Twin Sinks",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["OUT:RED|GREEN:RIGHT,PURPLE:DOWN","IN:GREEN","PURPLE|BLUE:RIGHT","IN:BLUE"],solution:{A:"OUT:RED|GREEN:RIGHT,PURPLE:DOWN",B:"IN:GREEN",C:"PURPLE|BLUE:RIGHT",D:"IN:BLUE"}},
  {number:36,name:"Distribution",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["OUT:CYAN|CYAN:DOWN","ORANGE|CYAN:RIGHT","CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN","IN:GREEN","IN:PURPLE"],solution:{A:"OUT:CYAN|CYAN:DOWN",B:"ORANGE|CYAN:RIGHT",C:"CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"IN:GREEN",E:"IN:PURPLE"}},
  {number:37,name:"Pipeline",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["OUT:RED|RED:RIGHT","RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:RIGHT","IN:PURPLE"],solution:{A:"OUT:RED|RED:RIGHT",B:"RED|GREEN:RIGHT",C:"GREEN|BLUE:RIGHT",D:"BLUE|PURPLE:RIGHT",E:"IN:PURPLE"}},
  {number:38,name:"Crossroads",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:RIGHT","IN:PURPLE","GREEN|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","IN:CYAN"],solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:RIGHT",C:"IN:PURPLE",D:"GREEN|ORANGE:RIGHT",E:"ORANGE|CYAN:RIGHT",F:"IN:CYAN"}},

  // === CHAPTER 5: JUMPER ARROWS (39-46) ===
  {number:39,name:"Leap",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["RED|BLUE:RIGHT:2","PURPLE|RED:LEFT","BLUE|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT:2",B:"PURPLE|RED:LEFT",C:"BLUE|PURPLE:LEFT"}},
  {number:40,name:"Hop Skip",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|GREEN:RIGHT,BLUE:RIGHT:2","GREEN|RED:LEFT","BLUE|GREEN:LEFT","ORANGE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT,BLUE:RIGHT:2",B:"GREEN|RED:LEFT",C:"BLUE|GREEN:LEFT",D:"ORANGE|BLUE:LEFT"}},
  {number:41,name:"Long Shot",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|BLUE:RIGHT:3","GREEN|RED:LEFT","PURPLE|GREEN:LEFT","BLUE|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT:3",B:"GREEN|RED:LEFT",C:"PURPLE|GREEN:LEFT",D:"BLUE|PURPLE:LEFT"}},
  {number:42,name:"Spectrum",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3","GREEN|RED:LEFT","BLUE|GREEN:LEFT","PURPLE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3",B:"GREEN|RED:LEFT",C:"BLUE|GREEN:LEFT",D:"PURPLE|BLUE:LEFT"}},
  {number:43,name:"Vault",cells:["A","B","C","D","E","F"],layout:[["A","B"],["C","D"],["E","F"]],pieces:["RED|BLUE:DOWN:2","GREEN|RED:DOWN","PURPLE|RED:RIGHT","RED|GREEN:UP,PURPLE:LEFT","BLUE|PURPLE:RIGHT","PURPLE|BLUE:LEFT"],solution:{A:"RED|BLUE:DOWN:2",B:"GREEN|RED:DOWN",C:"PURPLE|RED:RIGHT",D:"RED|GREEN:UP,PURPLE:LEFT",E:"BLUE|PURPLE:RIGHT",F:"PURPLE|BLUE:LEFT"}},
  {number:44,name:"Sniper",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["OUT:RED|BLUE:RIGHT:3","GREEN|RED:RIGHT","RED|GREEN:LEFT","BLUE|RED:LEFT"],solution:{A:"OUT:RED|BLUE:RIGHT:3",B:"GREEN|RED:RIGHT",C:"RED|GREEN:LEFT",D:"BLUE|RED:LEFT"}},
  {number:45,name:"Catapult",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["OUT:RED|RED:RIGHT,GREEN:RIGHT:3","RED|BLUE:RIGHT","BLUE|ORANGE:RIGHT:2","GREEN|PURPLE:RIGHT","IN:ORANGE,PURPLE"],solution:{A:"OUT:RED|RED:RIGHT,GREEN:RIGHT:3",B:"RED|BLUE:RIGHT",C:"BLUE|ORANGE:RIGHT:2",D:"GREEN|PURPLE:RIGHT",E:"IN:ORANGE,PURPLE"}},
  {number:46,name:"Vertical Snipe",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|GREEN:RIGHT,BLUE:DOWN:2","GREEN|ORANGE:RIGHT","IN:ORANGE","IN:PURPLE","CYAN|PURPLE:LEFT,PINK:RIGHT","PINK|CYAN:LEFT","BLUE|RED:RIGHT","RED|CYAN:RIGHT","IN:CYAN"],solution:{A:"RED|GREEN:RIGHT,BLUE:DOWN:2",B:"GREEN|ORANGE:RIGHT",C:"IN:ORANGE",D:"IN:PURPLE",E:"CYAN|PURPLE:LEFT,PINK:RIGHT",F:"PINK|CYAN:LEFT",G:"BLUE|RED:RIGHT",H:"RED|CYAN:RIGHT",I:"IN:CYAN"}},

  // === CHAPTER 6: ADVANCED COMBOS (47-54) ===
  {number:47,name:"Network",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:RIGHT","IN:PURPLE","GREEN|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","IN:CYAN"],solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:RIGHT",C:"IN:PURPLE",D:"GREEN|ORANGE:RIGHT",E:"ORANGE|CYAN:RIGHT",F:"IN:CYAN"}},
  {number:48,name:"Jump Hub",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["OUT:ORANGE|ORANGE:DOWN","RED|ORANGE:RIGHT","ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN","IN:GREEN","IN:BLUE"],solution:{A:"OUT:ORANGE|ORANGE:DOWN",B:"RED|ORANGE:RIGHT",C:"ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN",D:"IN:GREEN",E:"IN:BLUE"}},
  {number:49,name:"Skip Chain",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["RED|GREEN:RIGHT:2","BLUE|RED:LEFT","GREEN|BLUE:RIGHT:2","PURPLE|GREEN:LEFT","IN:BLUE"],solution:{A:"RED|GREEN:RIGHT:2",B:"BLUE|RED:LEFT",C:"GREEN|BLUE:RIGHT:2",D:"PURPLE|GREEN:LEFT",E:"IN:BLUE"}},
  {number:50,name:"Triple Strike",cells:["A","B","C","D"],layout:[[null,"A",null],["B","C","D"]],pieces:["OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT","IN:GREEN","IN:BLUE","IN:PURPLE"],solution:{A:"OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT",B:"IN:GREEN",C:"IN:BLUE",D:"IN:PURPLE"}},
  {number:51,name:"Leapfrog",cells:["A","B","C","D","E","F"],layout:[["A","B","C","D","E","F"]],pieces:["RED|GREEN:RIGHT:2","ORANGE|RED:LEFT","GREEN|BLUE:RIGHT:2","PURPLE|GREEN:LEFT","BLUE|PURPLE:RIGHT","IN:PURPLE"],solution:{A:"RED|GREEN:RIGHT:2",B:"ORANGE|RED:LEFT",C:"GREEN|BLUE:RIGHT:2",D:"PURPLE|GREEN:LEFT",E:"BLUE|PURPLE:RIGHT",F:"IN:PURPLE"}},
  {number:52,name:"Reverse Flow",cells:["A","B","C","D","E"],layout:[["A","B","C","D"],["E",null,null,null]],pieces:["IN:RED","RED|GREEN:RIGHT,BLUE:DOWN","GREEN|RED:LEFT","OUT:BLUE|RED:LEFT:3","BLUE|RED:UP"],solution:{A:"RED|GREEN:RIGHT,BLUE:DOWN",B:"GREEN|RED:LEFT",C:"IN:RED",D:"OUT:BLUE|RED:LEFT:3",E:"BLUE|RED:UP"}},
  {number:53,name:"Pincer",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["OUT:RED|RED:DOWN","IN:BLUE","RED|BLUE:LEFT,GREEN:RIGHT","IN:GREEN","OUT:CYAN|RED:UP"],solution:{A:"OUT:RED|RED:DOWN",B:"IN:BLUE",C:"RED|BLUE:LEFT,GREEN:RIGHT",D:"IN:GREEN",E:"OUT:CYAN|RED:UP"}},
  {number:54,name:"Double Leap",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|GREEN:RIGHT:2,BLUE:DOWN","GREEN|RED:LEFT","IN:GREEN","BLUE|ORANGE:RIGHT:2","ORANGE|BLUE:LEFT","IN:ORANGE"],solution:{A:"RED|GREEN:RIGHT:2,BLUE:DOWN",B:"GREEN|RED:LEFT",C:"IN:GREEN",D:"BLUE|ORANGE:RIGHT:2",E:"ORANGE|BLUE:LEFT",F:"IN:ORANGE"}},

  // === CHAPTER 7: EXPERT (55-60) ===
  {number:55,name:"Grand Pipeline",cells:["A","B","C","D","E","F","G"],layout:[["A","B","C","D","E","F","G"]],pieces:["OUT:RED|RED:RIGHT","RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:RIGHT","PURPLE|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","IN:CYAN"],solution:{A:"OUT:RED|RED:RIGHT",B:"RED|GREEN:RIGHT",C:"GREEN|BLUE:RIGHT",D:"BLUE|PURPLE:RIGHT",E:"PURPLE|ORANGE:RIGHT",F:"ORANGE|CYAN:RIGHT",G:"IN:CYAN"}},
  {number:56,name:"Star Burst",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:DOWN","PINK|BLUE:LEFT","ORANGE|RED:RIGHT","RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|RED:LEFT","CYAN|ORANGE:UP","PURPLE|RED:UP","YELLOW|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:DOWN",C:"PINK|BLUE:LEFT",D:"ORANGE|RED:RIGHT",E:"RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN",F:"GREEN|RED:LEFT",G:"CYAN|ORANGE:UP",H:"PURPLE|RED:UP",I:"YELLOW|PURPLE:LEFT"}},
  {number:57,name:"Highway",cells:["A","B","C","D","E","F","G","H"],layout:[["A","B","C","D"],["E","F","G","H"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT,PURPLE:DOWN","IN:ORANGE","BLUE|CYAN:RIGHT","CYAN|BLUE:LEFT","PURPLE|PINK:RIGHT","IN:PINK"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT,PURPLE:DOWN",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT",F:"CYAN|BLUE:LEFT",G:"PURPLE|PINK:RIGHT",H:"IN:PINK"}},
  {number:58,name:"Sniper Nest",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2","GREEN|RED:LEFT,GREEN:RIGHT","IN:GREEN","BLUE|GREEN:RIGHT","GREEN|ORANGE:RIGHT","IN:ORANGE","PURPLE|CYAN:RIGHT","CYAN|PINK:RIGHT","IN:PINK"],solution:{A:"RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2",B:"GREEN|RED:LEFT,GREEN:RIGHT",C:"IN:GREEN",D:"BLUE|GREEN:RIGHT",E:"GREEN|ORANGE:RIGHT",F:"IN:ORANGE",G:"PURPLE|CYAN:RIGHT",H:"CYAN|PINK:RIGHT",I:"IN:PINK"}},
  {number:59,name:"Grand Cross",cells:["A","B","C","D","E","F","G"],layout:[[null,"A",null],[null,"B",null],["C","D","E"],[null,"F",null],[null,"G",null]],pieces:["OUT:RED|RED:DOWN","RED|BLUE:DOWN","IN:RED","BLUE|RED:LEFT,GREEN:RIGHT,RED:UP,ORANGE:DOWN","IN:GREEN","ORANGE|PURPLE:DOWN","IN:PURPLE"],solution:{A:"OUT:RED|RED:DOWN",B:"RED|BLUE:DOWN",C:"IN:RED",D:"BLUE|RED:LEFT,GREEN:RIGHT,RED:UP,ORANGE:DOWN",E:"IN:GREEN",F:"ORANGE|PURPLE:DOWN",G:"IN:PURPLE"}},
  {number:60,name:"Chromatic Omega",cells:["A","B","C","D","E","F","G","H","I","J","K","L"],layout:[["A","B","C","D"],["E","F","G","H"],["I","J","K","L"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT,PURPLE:DOWN","IN:ORANGE","BLUE|CYAN:RIGHT,RED:DOWN","CYAN|BLUE:LEFT","PURPLE|PINK:RIGHT","PINK|PURPLE:LEFT","RED|YELLOW:RIGHT","YELLOW|BLUE:RIGHT","BLUE|GREEN:RIGHT","IN:GREEN"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT,PURPLE:DOWN",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT,RED:DOWN",F:"CYAN|BLUE:LEFT",G:"PURPLE|PINK:RIGHT",H:"PINK|PURPLE:LEFT",I:"RED|YELLOW:RIGHT",J:"YELLOW|BLUE:RIGHT",K:"BLUE|GREEN:RIGHT",L:"IN:GREEN"}},
];

// ─── VERIFY ALL ─────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════");
console.log("  CHROMATIC SOLVER — Verifying all 60 levels");
console.log("═══════════════════════════════════════════════════\n");

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
