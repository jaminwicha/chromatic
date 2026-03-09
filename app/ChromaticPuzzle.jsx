import { useState, useEffect, useCallback, useRef } from "react";

// ─── ENGINE ─────────────────────────────────────────────────────────────────

const COLORS = {
  BLUE:   { bg: "#2563eb", glow: "#3b82f6" },
  RED:    { bg: "#dc2626", glow: "#ef4444" },
  YELLOW: { bg: "#ca8a04", glow: "#eab308" },
  GREEN:  { bg: "#16a34a", glow: "#22c55e" },
  PURPLE: { bg: "#9333ea", glow: "#a855f7" },
  ORANGE: { bg: "#ea580c", glow: "#f97316" },
  CYAN:   { bg: "#0891b2", glow: "#06b6d4" },
  PINK:   { bg: "#db2777", glow: "#ec4899" },
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
};

function parseTile(str) {
  if (str.startsWith("IN:")) {
    return { type: "INPUT_ONLY", acceptColors: str.slice(3).split(","), outer: null, connections: [], id: str };
  }
  if (str.startsWith("OUT:")) {
    const rest = str.slice(4);
    const [center, innerPart] = rest.split("|");
    const connections = innerPart.split(",").map(p => {
      const parts = p.split(":");
      return { color: parts[0], dir: parts[1], distance: parts[2] ? parseInt(parts[2]) : 1 };
    });
    return { type: "OUTPUT_ONLY", center, outer: null, connections, id: str };
  }
  const [outer, innerPart] = str.split("|");
  const connections = innerPart.split(",").map(p => {
    const parts = p.split(":");
    return { color: parts[0], dir: parts[1], distance: parts[2] ? parseInt(parts[2]) : 1 };
  });
  return { type: "NORMAL", outer, connections, id: str };
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

function getConnectionErrors(level, board) {
  const errors = new Set();
  for (let r = 0; r < level.layout.length; r++) {
    for (let c = 0; c < level.layout[r].length; c++) {
      const cellName = level.layout[r][c];
      if (!cellName || !board[cellName]) continue;
      const tile = parseTile(board[cellName]);
      for (const conn of tile.connections) {
        const dist = conn.distance || 1;
        const neighbor = getNeighborAtDist(level.layout, r, c, conn.dir, dist);
        if (!neighbor || !board[neighbor.cell]) continue;
        const nTile = parseTile(board[neighbor.cell]);
        let isErr = false;
        if (nTile.type === "NORMAL" && conn.color !== nTile.outer) isErr = true;
        if (nTile.type === "INPUT_ONLY" && !nTile.acceptColors.includes(conn.color)) isErr = true;
        if (nTile.type === "OUTPUT_ONLY") isErr = true;
        if (isErr) errors.add(`${cellName}:${conn.dir}`);
      }
    }
  }
  return errors;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function checkSolution(level, board) {
  for (const cell of level.cells)
    if (!board[cell] || board[cell] !== level.solution[cell]) return false;
  return true;
}

// ─── ALL 60 LEVELS ──────────────────────────────────────────────────────────

const LEVELS = [
  // === CH1: FUNDAMENTALS (1-9) ===
  {number:1,name:"First Link",cells:["A","B"],layout:[["A","B"]],pieces:["BLUE|RED:RIGHT","RED|BLUE:LEFT"],solution:{A:"BLUE|RED:RIGHT",B:"RED|BLUE:LEFT"},hint:"A's inner RED arrow points right. B's outer must be RED."},
  {number:2,name:"Three Chain",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|GREEN:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|BLUE:RIGHT",C:"BLUE|GREEN:LEFT"},hint:"A→B→C flows right. C points back left to B."},
  {number:3,name:"Corner Turn",cells:["A","B","C"],layout:[["A",null],["B","C"]],pieces:["GREEN|BLUE:DOWN","BLUE|RED:RIGHT","RED|BLUE:LEFT"],solution:{A:"GREEN|BLUE:DOWN",B:"BLUE|RED:RIGHT",C:"RED|BLUE:LEFT"},hint:"A sends down to B. B sends right to C. C sends back to B."},
  {number:4,name:"Split Signal",cells:["A","B","C"],layout:[["A","B"],["C",null]],pieces:["PURPLE|GREEN:RIGHT,RED:DOWN","GREEN|PURPLE:LEFT","RED|PURPLE:UP"],solution:{A:"PURPLE|GREEN:RIGHT,RED:DOWN",B:"GREEN|PURPLE:LEFT",C:"RED|PURPLE:UP"},hint:"A has TWO arrows! GREEN right, RED down."},
  {number:5,name:"Hub",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT","GREEN|RED:UP","ORANGE|GREEN:LEFT"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"ORANGE|GREEN:LEFT"},hint:"A is the hub — BLUE right, GREEN down."},
  {number:6,name:"Diagonal",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["BLUE|RED:DOWN_RIGHT","GREEN|RED:DOWN","PURPLE|RED:RIGHT","RED|GREEN:UP"],solution:{A:"BLUE|RED:DOWN_RIGHT",B:"GREEN|RED:DOWN",C:"PURPLE|RED:RIGHT",D:"RED|GREEN:UP"},hint:"A goes DIAGONAL to D!"},
  {number:7,name:"X Marks It",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["RED|GREEN:DOWN_RIGHT","BLUE|RED:DOWN_LEFT","RED|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"],solution:{A:"RED|GREEN:DOWN_RIGHT",B:"BLUE|RED:DOWN_LEFT",C:"RED|BLUE:UP_RIGHT",D:"GREEN|RED:UP_LEFT"},hint:"All arrows are diagonal — forming an X."},
  {number:8,name:"Star Node",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["PURPLE|ORANGE:DOWN","ORANGE|ORANGE:RIGHT","ORANGE|PURPLE:UP,ORANGE:LEFT","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"],solution:{A:"PURPLE|ORANGE:DOWN",B:"ORANGE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,ORANGE:LEFT",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"},hint:"C is the star center with 2 arrows."},
  {number:9,name:"Full Grid",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT","BLUE|GREEN:RIGHT,RED:DOWN_LEFT","GREEN|BLUE:DOWN","RED|GREEN:RIGHT","GREEN|BLUE:UP","BLUE|GREEN:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT,RED:DOWN_LEFT",C:"GREEN|BLUE:DOWN",D:"RED|GREEN:RIGHT",E:"GREEN|BLUE:UP",F:"BLUE|GREEN:LEFT"},hint:"B has 2 arrows at different angles."},
  // === CH2: MULTI-OUTPUT (10-18) ===
  {number:10,name:"Triple Threat",cells:["A","B","C","D"],layout:[[null,"A",null],["B","C","D"]],pieces:["PURPLE|ORANGE:DOWN","ORANGE|ORANGE:RIGHT","ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT","GREEN|ORANGE:LEFT"],solution:{A:"PURPLE|ORANGE:DOWN",B:"ORANGE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT",D:"GREEN|ORANGE:LEFT"},hint:"C has THREE arrows — one to each neighbor!"},
  {number:11,name:"Broadcast",cells:["A","B","C","D","E"],layout:[["A","B"],["C","D"],["E",null]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","CYAN|GREEN:UP"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"PURPLE|GREEN:LEFT",E:"CYAN|GREEN:UP"},hint:"A broadcasts 3 signals!"},
  {number:12,name:"Quad Core",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["RED|ORANGE:DOWN","BLUE|ORANGE:RIGHT","ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"],solution:{A:"RED|ORANGE:DOWN",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"},hint:"C has FOUR arrows — one to each cardinal!"},
  {number:13,name:"Relay",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","ORANGE|BLUE:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","PINK|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"ORANGE|BLUE:LEFT",D:"GREEN|RED:UP",E:"PURPLE|GREEN:LEFT",F:"PINK|PURPLE:LEFT"},hint:"A relays 3 signals across the grid."},
  {number:14,name:"Crossfire",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["BLUE|RED:DOWN,GREEN:DOWN_LEFT","GREEN|RED:RIGHT","RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN","PURPLE|RED:LEFT","ORANGE|RED:UP"],solution:{A:"BLUE|RED:DOWN,GREEN:DOWN_LEFT",B:"GREEN|RED:RIGHT",C:"RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN",D:"PURPLE|RED:LEFT",E:"ORANGE|RED:UP"},hint:"A and C both have multiple outputs."},
  {number:15,name:"Pinwheel",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["RED|GREEN:DOWN_RIGHT,BLUE:RIGHT","BLUE|RED:DOWN_LEFT","RED|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"],solution:{A:"RED|GREEN:DOWN_RIGHT,BLUE:RIGHT",B:"BLUE|RED:DOWN_LEFT",C:"RED|BLUE:UP_RIGHT",D:"GREEN|RED:UP_LEFT"},hint:"A spins two arrows: diagonal and cardinal."},
  {number:16,name:"Cascade",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:RIGHT","PURPLE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|BLUE:RIGHT",C:"BLUE|PURPLE:RIGHT",D:"PURPLE|BLUE:LEFT"},hint:"A waterfall of arrows flows right."},
  {number:17,name:"Trident",cells:["A","B","C","D","E"],layout:[["A","B","C"],[null,"D",null],[null,"E",null]],pieces:["RED|PURPLE:RIGHT","PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN","GREEN|PURPLE:LEFT","BLUE|ORANGE:DOWN","ORANGE|BLUE:UP"],solution:{A:"RED|PURPLE:RIGHT",B:"PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN",C:"GREEN|PURPLE:LEFT",D:"BLUE|ORANGE:DOWN",E:"ORANGE|BLUE:UP"},hint:"B is the trident head — 3 prongs."},
  {number:18,name:"Mirror",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["GREEN|BLUE:DOWN","RED|GREEN:LEFT,PURPLE:RIGHT","PURPLE|RED:LEFT","BLUE|GREEN:UP","ORANGE|BLUE:LEFT,CYAN:RIGHT","CYAN|ORANGE:LEFT"],solution:{A:"GREEN|BLUE:DOWN",B:"RED|GREEN:LEFT,PURPLE:RIGHT",C:"PURPLE|RED:LEFT",D:"BLUE|GREEN:UP",E:"ORANGE|BLUE:LEFT,CYAN:RIGHT",F:"CYAN|ORANGE:LEFT"},hint:"B and E mirror each other."},
  // === CH3: COMPLEX LAYOUTS (19-30) ===
  {number:19,name:"Diamond",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT","GREEN|CYAN:UP_RIGHT","RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT","PURPLE|CYAN:UP_LEFT","ORANGE|RED:UP"],solution:{A:"CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT",B:"GREEN|CYAN:UP_RIGHT",C:"RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT",D:"PURPLE|CYAN:UP_LEFT",E:"ORANGE|RED:UP"},hint:"A shoots diagonals. C controls the center."},
  {number:20,name:"Web",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["CYAN|BLUE:RIGHT","BLUE|ORANGE:DOWN","PINK|BLUE:LEFT","RED|ORANGE:RIGHT","ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT","GREEN|ORANGE:LEFT"],solution:{A:"CYAN|BLUE:RIGHT",B:"BLUE|ORANGE:DOWN",C:"PINK|BLUE:LEFT",D:"RED|ORANGE:RIGHT",E:"ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT",F:"GREEN|ORANGE:LEFT"},hint:"E is the web center with 4 arrows!"},
  {number:21,name:"Zigzag",cells:["A","B","C","D"],layout:[["A","B",null],[null,"C","D"]],pieces:["RED|GREEN:RIGHT","GREEN|RED:DOWN,BLUE:DOWN_RIGHT","RED|GREEN:UP","BLUE|RED:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|RED:DOWN,BLUE:DOWN_RIGHT",C:"RED|GREEN:UP",D:"BLUE|RED:LEFT"},hint:"B sends two arrows down."},
  {number:22,name:"Fortress",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT","PURPLE|ORANGE:DOWN","GREEN|RED:UP","GREEN|ORANGE:RIGHT","ORANGE|PURPLE:UP,GREEN:LEFT"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT",C:"PURPLE|ORANGE:DOWN",D:"GREEN|RED:UP",E:"GREEN|ORANGE:RIGHT",F:"ORANGE|PURPLE:UP,GREEN:LEFT"},hint:"A and F are the twin towers."},
  {number:23,name:"Helix",cells:["A","B","C","D","E","F","G","H"],layout:[["A","B","C","D"],["E","F","G","H"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|BLUE:RIGHT","BLUE|GREEN:LEFT","CYAN|PURPLE:RIGHT","PURPLE|BLUE:UP","ORANGE|GREEN:UP,PURPLE:LEFT","PINK|ORANGE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",C:"GREEN|BLUE:RIGHT",D:"BLUE|GREEN:LEFT",E:"CYAN|PURPLE:RIGHT",F:"PURPLE|BLUE:UP",G:"ORANGE|GREEN:UP,PURPLE:LEFT",H:"PINK|ORANGE:LEFT"},hint:"The helix winds through 8 tiles."},
  {number:24,name:"Compass",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["RED|ORANGE:DOWN,BLUE:DOWN_LEFT","BLUE|ORANGE:RIGHT","ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"],solution:{A:"RED|ORANGE:DOWN,BLUE:DOWN_LEFT",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"},hint:"C is a 4-way compass."},
  {number:25,name:"River",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["RED|GREEN:RIGHT","GREEN|RED:LEFT","PURPLE|GREEN:LEFT,BLUE:RIGHT","BLUE|PURPLE:LEFT","ORANGE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT",B:"GREEN|RED:LEFT",C:"PURPLE|GREEN:LEFT,BLUE:RIGHT",D:"BLUE|PURPLE:LEFT",E:"ORANGE|BLUE:LEFT"},hint:"C splits the river."},
  {number:26,name:"Spiral",cells:["A","B","C","D","E"],layout:[["A","B"],["C","D"],["E",null]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","ORANGE|GREEN:UP"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"PURPLE|GREEN:LEFT",E:"ORANGE|GREEN:UP"},hint:"A spirals outward with 3 arrows."},
  {number:27,name:"Nexus",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|BLUE:LEFT","RED|PURPLE:RIGHT","PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT","GREEN|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",C:"GREEN|BLUE:LEFT",D:"RED|PURPLE:RIGHT",E:"PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT",F:"GREEN|PURPLE:LEFT"},hint:"B and E are twin nexus points!"},
  {number:28,name:"Galaxy",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT","BLUE|ORANGE:RIGHT","ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN","GREEN|ORANGE:LEFT","RED|ORANGE:UP"],solution:{A:"PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN",D:"GREEN|ORANGE:LEFT",E:"RED|ORANGE:UP"},hint:"C is a galaxy core with 4 outputs."},
  {number:29,name:"Labyrinth",cells:["A","B","C","D","E","F","G"],layout:[[null,"A",null],["B","C","D"],["E","F","G"]],pieces:["RED|BLUE:DOWN","CYAN|BLUE:RIGHT","BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT","PURPLE|BLUE:LEFT","ORANGE|GREEN:RIGHT","GREEN|ORANGE:LEFT,PINK:RIGHT","PINK|GREEN:LEFT"],solution:{A:"RED|BLUE:DOWN",B:"CYAN|BLUE:RIGHT",C:"BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT",D:"PURPLE|BLUE:LEFT",E:"ORANGE|GREEN:RIGHT",F:"GREEN|ORANGE:LEFT,PINK:RIGHT",G:"PINK|GREEN:LEFT"},hint:"C and F are dual hubs."},
  {number:30,name:"Chromatic Finale",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,CYAN:RIGHT","CYAN|BLUE:LEFT","RED|ORANGE:RIGHT","ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","YELLOW|PURPLE:RIGHT","PURPLE|YELLOW:LEFT,PINK:RIGHT","PINK|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,CYAN:RIGHT",C:"CYAN|BLUE:LEFT",D:"RED|ORANGE:RIGHT",E:"ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",F:"GREEN|ORANGE:LEFT",G:"YELLOW|PURPLE:RIGHT",H:"PURPLE|YELLOW:LEFT,PINK:RIGHT",I:"PINK|PURPLE:LEFT"},hint:"E has 4 outputs. 9 tiles!"},
  // === CH4: SOURCES & SINKS (31-38) ===
  {number:31,name:"Source & Sink",cells:["A","B"],layout:[["A","B"]],pieces:["OUT:RED|RED:RIGHT","IN:RED"],solution:{A:"OUT:RED|RED:RIGHT",B:"IN:RED"},hint:"SRC (gold) sends arrows out. SINK (blue) is the destination — arrows point INTO it."},
  {number:32,name:"Relay Station",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["OUT:GREEN|GREEN:RIGHT","GREEN|RED:RIGHT","IN:RED"],solution:{A:"OUT:GREEN|GREEN:RIGHT",B:"GREEN|RED:RIGHT",C:"IN:RED"},hint:"Source→relay→sink. Colors shift at each tile."},
  {number:33,name:"Broadcaster",cells:["A","B","C"],layout:[["A","B"],[null,"C"]],pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT","BLUE|GREEN:DOWN","IN:GREEN"],solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN_RIGHT",B:"BLUE|GREEN:DOWN",C:"IN:GREEN"},hint:"Source sends two signals. Both reach the sink!"},
  {number:34,name:"Funnel",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["OUT:RED|RED:RIGHT","RED|BLUE:RIGHT","IN:BLUE"],solution:{A:"OUT:RED|RED:RIGHT",B:"RED|BLUE:RIGHT",C:"IN:BLUE"},hint:"RED→BLUE transformation through the relay."},
  {number:35,name:"Twin Sinks",cells:["A","B","C","D"],layout:[["A","B"],["C","D"]],pieces:["OUT:RED|GREEN:RIGHT,PURPLE:DOWN","IN:GREEN","PURPLE|BLUE:RIGHT","IN:BLUE"],solution:{A:"OUT:RED|GREEN:RIGHT,PURPLE:DOWN",B:"IN:GREEN",C:"PURPLE|BLUE:RIGHT",D:"IN:BLUE"},hint:"Source splits to two paths, each ending at a sink."},
  {number:36,name:"Distribution",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["OUT:CYAN|CYAN:DOWN","ORANGE|CYAN:RIGHT","CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN","IN:GREEN","IN:PURPLE"],solution:{A:"OUT:CYAN|CYAN:DOWN",B:"ORANGE|CYAN:RIGHT",C:"CYAN|ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"IN:GREEN",E:"IN:PURPLE"},hint:"Source feeds C. C distributes to two sinks."},
  {number:37,name:"Pipeline",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["OUT:RED|RED:RIGHT","RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:RIGHT","IN:PURPLE"],solution:{A:"OUT:RED|RED:RIGHT",B:"RED|GREEN:RIGHT",C:"GREEN|BLUE:RIGHT",D:"BLUE|PURPLE:RIGHT",E:"IN:PURPLE"},hint:"Long pipeline: each tile shifts the color once."},
  {number:38,name:"Crossroads",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:RIGHT","IN:PURPLE","GREEN|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","IN:CYAN"],solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:RIGHT",C:"IN:PURPLE",D:"GREEN|ORANGE:RIGHT",E:"ORANGE|CYAN:RIGHT",F:"IN:CYAN"},hint:"Two lanes from one source to two sinks."},
  // === CH5: JUMPER ARROWS (39-46) ===
  {number:39,name:"Leap",cells:["A","B","C"],layout:[["A","B","C"]],pieces:["RED|BLUE:RIGHT:2","PURPLE|RED:LEFT","BLUE|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT:2",B:"PURPLE|RED:LEFT",C:"BLUE|PURPLE:LEFT"},hint:"A jumps OVER B to reach C! Distance-2 arrow."},
  {number:40,name:"Hop Skip",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|GREEN:RIGHT,BLUE:RIGHT:2","GREEN|RED:LEFT","BLUE|GREEN:LEFT","ORANGE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT,BLUE:RIGHT:2",B:"GREEN|RED:LEFT",C:"BLUE|GREEN:LEFT",D:"ORANGE|BLUE:LEFT"},hint:"A sends nearby AND jumps. Two distances from one tile."},
  {number:41,name:"Long Shot",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|BLUE:RIGHT:3","GREEN|RED:LEFT","PURPLE|GREEN:LEFT","BLUE|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT:3",B:"GREEN|RED:LEFT",C:"PURPLE|GREEN:LEFT",D:"BLUE|PURPLE:LEFT"},hint:"A fires all the way to D — distance 3!"},
  {number:42,name:"Spectrum",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3","GREEN|RED:LEFT","BLUE|GREEN:LEFT","PURPLE|BLUE:LEFT"],solution:{A:"RED|GREEN:RIGHT,BLUE:RIGHT:2,PURPLE:RIGHT:3",B:"GREEN|RED:LEFT",C:"BLUE|GREEN:LEFT",D:"PURPLE|BLUE:LEFT"},hint:"A sends 3 arrows at distances 1, 2, and 3!"},
  {number:43,name:"Vault",cells:["A","B","C","D","E","F"],layout:[["A","B"],["C","D"],["E","F"]],pieces:["RED|BLUE:DOWN:2","GREEN|RED:DOWN","PURPLE|RED:RIGHT","RED|GREEN:UP,PURPLE:LEFT","BLUE|PURPLE:RIGHT","PURPLE|BLUE:LEFT"],solution:{A:"RED|BLUE:DOWN:2",B:"GREEN|RED:DOWN",C:"PURPLE|RED:RIGHT",D:"RED|GREEN:UP,PURPLE:LEFT",E:"BLUE|PURPLE:RIGHT",F:"PURPLE|BLUE:LEFT"},hint:"A vaults over row 2 to reach row 3!"},
  {number:44,name:"Sniper",cells:["A","B","C","D"],layout:[["A","B","C","D"]],pieces:["OUT:RED|BLUE:RIGHT:3","GREEN|RED:RIGHT","RED|GREEN:LEFT","BLUE|RED:LEFT"],solution:{A:"OUT:RED|BLUE:RIGHT:3",B:"GREEN|RED:RIGHT",C:"RED|GREEN:LEFT",D:"BLUE|RED:LEFT"},hint:"Source snipes distance 3 to the far end."},
  {number:45,name:"Catapult",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["OUT:RED|RED:RIGHT,GREEN:RIGHT:3","RED|BLUE:RIGHT","BLUE|ORANGE:RIGHT:2","GREEN|PURPLE:RIGHT","IN:ORANGE,PURPLE"],solution:{A:"OUT:RED|RED:RIGHT,GREEN:RIGHT:3",B:"RED|BLUE:RIGHT",C:"BLUE|ORANGE:RIGHT:2",D:"GREEN|PURPLE:RIGHT",E:"IN:ORANGE,PURPLE"},hint:"Source fires short and long. C catapults over D."},
  {number:46,name:"Vertical Snipe",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|GREEN:RIGHT,BLUE:DOWN:2","GREEN|ORANGE:RIGHT","IN:ORANGE","IN:PURPLE","CYAN|PURPLE:LEFT,PINK:RIGHT","PINK|CYAN:LEFT","BLUE|RED:RIGHT","RED|CYAN:RIGHT","IN:CYAN"],solution:{A:"RED|GREEN:RIGHT,BLUE:DOWN:2",B:"GREEN|ORANGE:RIGHT",C:"IN:ORANGE",D:"IN:PURPLE",E:"CYAN|PURPLE:LEFT,PINK:RIGHT",F:"PINK|CYAN:LEFT",G:"BLUE|RED:RIGHT",H:"RED|CYAN:RIGHT",I:"IN:CYAN"},hint:"A snipes vertically down 2 rows to G!"},
  // === CH6: ADVANCED COMBOS (47-54) ===
  {number:47,name:"Network",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:RIGHT","IN:PURPLE","GREEN|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","IN:CYAN"],solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:RIGHT",C:"IN:PURPLE",D:"GREEN|ORANGE:RIGHT",E:"ORANGE|CYAN:RIGHT",F:"IN:CYAN"},hint:"Two pipelines from one source to two sinks."},
  {number:48,name:"Jump Hub",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["OUT:ORANGE|ORANGE:DOWN","RED|ORANGE:RIGHT","ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN","IN:GREEN","IN:BLUE"],solution:{A:"OUT:ORANGE|ORANGE:DOWN",B:"RED|ORANGE:RIGHT",C:"ORANGE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN",D:"IN:GREEN",E:"IN:BLUE"},hint:"Source feeds the central hub. Hub distributes to sinks."},
  {number:49,name:"Skip Chain",cells:["A","B","C","D","E"],layout:[["A","B","C","D","E"]],pieces:["RED|GREEN:RIGHT:2","BLUE|RED:LEFT","GREEN|BLUE:RIGHT:2","PURPLE|GREEN:LEFT","IN:BLUE"],solution:{A:"RED|GREEN:RIGHT:2",B:"BLUE|RED:LEFT",C:"GREEN|BLUE:RIGHT:2",D:"PURPLE|GREEN:LEFT",E:"IN:BLUE"},hint:"Two distance-2 jumps form a skip chain!"},
  {number:50,name:"Triple Strike",cells:["A","B","C","D"],layout:[[null,"A",null],["B","C","D"]],pieces:["OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT","IN:GREEN","IN:BLUE","IN:PURPLE"],solution:{A:"OUT:RED|GREEN:DOWN_LEFT,BLUE:DOWN,PURPLE:DOWN_RIGHT",B:"IN:GREEN",C:"IN:BLUE",D:"IN:PURPLE"},hint:"Source fires 3 arrows: diagonal, down, diagonal!"},
  {number:51,name:"Leapfrog",cells:["A","B","C","D","E","F"],layout:[["A","B","C","D","E","F"]],pieces:["RED|GREEN:RIGHT:2","ORANGE|RED:LEFT","GREEN|BLUE:RIGHT:2","PURPLE|GREEN:LEFT","BLUE|PURPLE:RIGHT","IN:PURPLE"],solution:{A:"RED|GREEN:RIGHT:2",B:"ORANGE|RED:LEFT",C:"GREEN|BLUE:RIGHT:2",D:"PURPLE|GREEN:LEFT",E:"BLUE|PURPLE:RIGHT",F:"IN:PURPLE"},hint:"Leapfrog: A→C, C→E, E walks to the sink."},
  {number:52,name:"Reverse Flow",cells:["A","B","C","D","E"],layout:[["A","B","C","D"],["E",null,null,null]],pieces:["IN:RED","RED|GREEN:RIGHT,BLUE:DOWN","GREEN|RED:LEFT","OUT:BLUE|RED:LEFT:3","BLUE|RED:UP"],solution:{A:"RED|GREEN:RIGHT,BLUE:DOWN",B:"GREEN|RED:LEFT",C:"IN:RED",D:"OUT:BLUE|RED:LEFT:3",E:"BLUE|RED:UP"},hint:"Source fires BACKWARD with a distance-3 shot!"},
  {number:53,name:"Pincer",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["OUT:RED|RED:DOWN","IN:BLUE","RED|BLUE:LEFT,GREEN:RIGHT","IN:GREEN","OUT:CYAN|RED:UP"],solution:{A:"OUT:RED|RED:DOWN",B:"IN:BLUE",C:"RED|BLUE:LEFT,GREEN:RIGHT",D:"IN:GREEN",E:"OUT:CYAN|RED:UP"},hint:"Two sources pinch the center. Hub feeds two sinks."},
  {number:54,name:"Double Leap",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|GREEN:RIGHT:2,BLUE:DOWN","GREEN|RED:LEFT","IN:GREEN","BLUE|ORANGE:RIGHT:2","ORANGE|BLUE:LEFT","IN:ORANGE"],solution:{A:"RED|GREEN:RIGHT:2,BLUE:DOWN",B:"GREEN|RED:LEFT",C:"IN:GREEN",D:"BLUE|ORANGE:RIGHT:2",E:"ORANGE|BLUE:LEFT",F:"IN:ORANGE"},hint:"Two rows, each with a distance-2 jump to its sink."},
  // === CH7: EXPERT (55-60) ===
  {number:55,name:"Grand Pipeline",cells:["A","B","C","D","E","F","G"],layout:[["A","B","C","D","E","F","G"]],pieces:["OUT:RED|RED:RIGHT","RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:RIGHT","PURPLE|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","IN:CYAN"],solution:{A:"OUT:RED|RED:RIGHT",B:"RED|GREEN:RIGHT",C:"GREEN|BLUE:RIGHT",D:"BLUE|PURPLE:RIGHT",E:"PURPLE|ORANGE:RIGHT",F:"ORANGE|CYAN:RIGHT",G:"IN:CYAN"},hint:"7 tiles, 6 color shifts. The longest pipeline!"},
  {number:56,name:"Star Burst",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|BLUE:RIGHT","BLUE|RED:DOWN","PINK|BLUE:LEFT","ORANGE|RED:RIGHT","RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|RED:LEFT","CYAN|ORANGE:UP","PURPLE|RED:UP","YELLOW|PURPLE:LEFT"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:DOWN",C:"PINK|BLUE:LEFT",D:"ORANGE|RED:RIGHT",E:"RED|BLUE:UP,ORANGE:LEFT,GREEN:RIGHT,PURPLE:DOWN",F:"GREEN|RED:LEFT",G:"CYAN|ORANGE:UP",H:"PURPLE|RED:UP",I:"YELLOW|PURPLE:LEFT"},hint:"E is a 4-output star in a 3x3 grid!"},
  {number:57,name:"Highway",cells:["A","B","C","D","E","F","G","H"],layout:[["A","B","C","D"],["E","F","G","H"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT,PURPLE:DOWN","IN:ORANGE","BLUE|CYAN:RIGHT","CYAN|BLUE:LEFT","PURPLE|PINK:RIGHT","IN:PINK"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT,PURPLE:DOWN",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT",F:"CYAN|BLUE:LEFT",G:"PURPLE|PINK:RIGHT",H:"IN:PINK"},hint:"Two highway lanes with exits and sinks."},
  {number:58,name:"Sniper Nest",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2","GREEN|RED:LEFT,GREEN:RIGHT","IN:GREEN","BLUE|GREEN:RIGHT","GREEN|ORANGE:RIGHT","IN:ORANGE","PURPLE|CYAN:RIGHT","CYAN|PINK:RIGHT","IN:PINK"],solution:{A:"RED|GREEN:RIGHT,BLUE:DOWN,PURPLE:DOWN:2",B:"GREEN|RED:LEFT,GREEN:RIGHT",C:"IN:GREEN",D:"BLUE|GREEN:RIGHT",E:"GREEN|ORANGE:RIGHT",F:"IN:ORANGE",G:"PURPLE|CYAN:RIGHT",H:"CYAN|PINK:RIGHT",I:"IN:PINK"},hint:"A fires 3 levels deep including a distance-2 snipe!"},
  {number:59,name:"Grand Cross",cells:["A","B","C","D","E","F","G"],layout:[[null,"A",null],[null,"B",null],["C","D","E"],[null,"F",null],[null,"G",null]],pieces:["OUT:RED|RED:DOWN","RED|BLUE:DOWN","IN:RED","BLUE|RED:LEFT,GREEN:RIGHT,RED:UP,ORANGE:DOWN","IN:GREEN","ORANGE|PURPLE:DOWN","IN:PURPLE"],solution:{A:"OUT:RED|RED:DOWN",B:"RED|BLUE:DOWN",C:"IN:RED",D:"BLUE|RED:LEFT,GREEN:RIGHT,RED:UP,ORANGE:DOWN",E:"IN:GREEN",F:"ORANGE|PURPLE:DOWN",G:"IN:PURPLE"},hint:"Grand cross: center hub sends to all 4 arms."},
  {number:60,name:"Chromatic Omega",cells:["A","B","C","D","E","F","G","H","I","J","K","L"],layout:[["A","B","C","D"],["E","F","G","H"],["I","J","K","L"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT,PURPLE:DOWN","IN:ORANGE","BLUE|CYAN:RIGHT,RED:DOWN","CYAN|BLUE:LEFT","PURPLE|PINK:RIGHT","PINK|PURPLE:LEFT","RED|YELLOW:RIGHT","YELLOW|BLUE:RIGHT","BLUE|GREEN:RIGHT","IN:GREEN"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT,PURPLE:DOWN",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT,RED:DOWN",F:"CYAN|BLUE:LEFT",G:"PURPLE|PINK:RIGHT",H:"PINK|PURPLE:LEFT",I:"RED|YELLOW:RIGHT",J:"YELLOW|BLUE:RIGHT",K:"BLUE|GREEN:RIGHT",L:"IN:GREEN"},hint:"12 tiles, 3 connected rows. The omega!"},
  // === CHAPTER 8: MASTER (61-80) ===
  {number:61,name:"Supernova",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["OUT:RED|RED:RIGHT,GREEN:DOWN","RED|BLUE:RIGHT","IN:BLUE","GREEN|ORANGE:RIGHT,CYAN:DOWN","ORANGE|GREEN:LEFT,PURPLE:DOWN","PURPLE|ORANGE:LEFT","IN:CYAN","IN:PURPLE","IN:ORANGE"],solution:{A:"OUT:RED|RED:RIGHT,GREEN:DOWN",B:"RED|BLUE:RIGHT",C:"IN:BLUE",D:"GREEN|ORANGE:RIGHT,CYAN:DOWN",E:"ORANGE|GREEN:LEFT,PURPLE:DOWN",F:"PURPLE|ORANGE:LEFT",G:"IN:CYAN",H:"IN:PURPLE",I:"IN:ORANGE"},hint:"Source powers the grid. Two hubs distribute to 4 sinks."},
  {number:62,name:"Pulse Grid",cells:["A","B","C","D","E","F","G","H"],layout:[["A","B","C","D"],["E","F","G","H"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT,ORANGE:RIGHT","ORANGE|BLUE:LEFT,PURPLE:DOWN","IN:BLUE","GREEN|RED:UP,CYAN:RIGHT","CYAN|GREEN:LEFT","PURPLE|CYAN:LEFT,PINK:RIGHT","IN:PINK"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT,ORANGE:RIGHT",C:"ORANGE|BLUE:LEFT,PURPLE:DOWN",D:"IN:BLUE",E:"GREEN|RED:UP,CYAN:RIGHT",F:"CYAN|GREEN:LEFT",G:"PURPLE|CYAN:LEFT,PINK:RIGHT",H:"IN:PINK"},hint:"Cross-connected 2x4 grid. Every tile matters."},
  {number:63,name:"Convergence",cells:["A","B","C","D","E","F","G","H"],layout:[["A","B","C","D"],["E","F","G","H"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT","IN:ORANGE","BLUE|CYAN:RIGHT","CYAN|PINK:RIGHT","PINK|YELLOW:RIGHT","IN:YELLOW"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT",F:"CYAN|PINK:RIGHT",G:"PINK|YELLOW:RIGHT",H:"IN:YELLOW"},hint:"Source splits into two parallel pipelines."},
  {number:64,name:"Command Center",cells:["A","B","C","D","E"],layout:[[null,"A",null],["B","C","D"],[null,"E",null]],pieces:["OUT:RED|RED:DOWN","IN:BLUE","RED|BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN","IN:GREEN","IN:PURPLE"],solution:{A:"OUT:RED|RED:DOWN",B:"IN:BLUE",C:"RED|BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"IN:GREEN",E:"IN:PURPLE"},hint:"Source feeds hub. Hub sends to 3 sinks."},
  {number:65,name:"Vertical Leap",cells:["A","B","C","D","E"],layout:[["A"],["B"],["C"],["D"],["E"]],pieces:["RED|GREEN:DOWN,BLUE:DOWN:2","GREEN|RED:UP","BLUE|PURPLE:DOWN,ORANGE:DOWN:2","PURPLE|BLUE:UP","IN:ORANGE"],solution:{A:"RED|GREEN:DOWN,BLUE:DOWN:2",B:"GREEN|RED:UP",C:"BLUE|PURPLE:DOWN,ORANGE:DOWN:2",D:"PURPLE|BLUE:UP",E:"IN:ORANGE"},hint:"Vertical strip with distance-2 jumps!"},
  {number:66,name:"Serpentine",cells:["A","B","C","D","E","F","G","H","I","J","K","L"],layout:[["A","B","C","D"],["E","F","G","H"],["I","J","K","L"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT","IN:ORANGE","BLUE|CYAN:RIGHT,PURPLE:DOWN","CYAN|BLUE:LEFT","PINK|CYAN:LEFT,YELLOW:DOWN","YELLOW|PINK:LEFT","PURPLE|RED:RIGHT","RED|YELLOW:RIGHT","YELLOW|BLUE:RIGHT","IN:BLUE"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT,PURPLE:DOWN",F:"CYAN|BLUE:LEFT",G:"PINK|CYAN:LEFT,YELLOW:DOWN",H:"YELLOW|PINK:LEFT",I:"PURPLE|RED:RIGHT",J:"RED|YELLOW:RIGHT",K:"YELLOW|BLUE:RIGHT",L:"IN:BLUE"},hint:"12 tiles. Three connected serpentine lanes."},
  {number:67,name:"Quantum Link",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT,ORANGE:DOWN_RIGHT","CYAN|BLUE:LEFT","GREEN|RED:UP,PURPLE:RIGHT","PURPLE|GREEN:LEFT","ORANGE|CYAN:UP"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT,ORANGE:DOWN_RIGHT",C:"CYAN|BLUE:LEFT",D:"GREEN|RED:UP,PURPLE:RIGHT",E:"PURPLE|GREEN:LEFT",F:"ORANGE|CYAN:UP"},hint:"Diagonal arrow from B reaches F!"},
  {number:68,name:"Twin Stars",cells:["A","B","C","D","E","F","G"],layout:[[null,"A",null],[null,"B",null],["C","D","E"],[null,"F",null],[null,"G",null]],pieces:["OUT:RED|RED:DOWN","RED|BLUE:DOWN","IN:RED","BLUE|RED:LEFT,GREEN:RIGHT,ORANGE:DOWN","IN:GREEN","ORANGE|PURPLE:DOWN","IN:PURPLE"],solution:{A:"OUT:RED|RED:DOWN",B:"RED|BLUE:DOWN",C:"IN:RED",D:"BLUE|RED:LEFT,GREEN:RIGHT,ORANGE:DOWN",E:"IN:GREEN",F:"ORANGE|PURPLE:DOWN",G:"IN:PURPLE"},hint:"Tall cross. Hub distributes to all arms."},
  {number:69,name:"Matrix",cells:["A","B","C","D","E","F","G","H","I","J","K","L"],layout:[["A","B","C","D"],["E","F","G","H"],["I","J","K","L"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT","IN:ORANGE","BLUE|CYAN:RIGHT,PURPLE:DOWN","CYAN|BLUE:LEFT","PINK|CYAN:LEFT,YELLOW:DOWN","YELLOW|PINK:LEFT","PURPLE|RED:RIGHT","RED|YELLOW:RIGHT","YELLOW|BLUE:RIGHT","IN:BLUE"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT,PURPLE:DOWN",F:"CYAN|BLUE:LEFT",G:"PINK|CYAN:LEFT,YELLOW:DOWN",H:"YELLOW|PINK:LEFT",I:"PURPLE|RED:RIGHT",J:"RED|YELLOW:RIGHT",K:"YELLOW|BLUE:RIGHT",L:"IN:BLUE"},hint:"12-tile matrix with vertical cross-links."},
  {number:70,name:"Ouroboros",cells:["A","B","C","D","E","F","G","H"],layout:[["A","B","C"],["D",null,"E"],["F","G","H"]],pieces:["RED|BLUE:RIGHT","BLUE|ORANGE:RIGHT","ORANGE|PURPLE:DOWN","GREEN|RED:UP","PURPLE|PINK:DOWN","IN:GREEN","PINK|GREEN:LEFT","IN:PINK"],solution:{A:"RED|BLUE:RIGHT",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|PURPLE:DOWN",D:"GREEN|RED:UP",E:"PURPLE|PINK:DOWN",F:"IN:GREEN",G:"PINK|GREEN:LEFT",H:"IN:PINK"},hint:"Ring around empty center. Perimeter flow."},
  {number:71,name:"Railgun",cells:["A","B","C","D","E","F"],layout:[["A","B","C","D","E","F"]],pieces:["RED|GREEN:RIGHT,BLUE:RIGHT:3","GREEN|RED:LEFT,ORANGE:RIGHT","ORANGE|GREEN:LEFT","BLUE|PURPLE:RIGHT","PURPLE|BLUE:LEFT,CYAN:RIGHT","IN:CYAN"],solution:{A:"RED|GREEN:RIGHT,BLUE:RIGHT:3",B:"GREEN|RED:LEFT,ORANGE:RIGHT",C:"ORANGE|GREEN:LEFT",D:"BLUE|PURPLE:RIGHT",E:"PURPLE|BLUE:LEFT,CYAN:RIGHT",F:"IN:CYAN"},hint:"Normal and jump arrows interleave across 6 tiles."},
  {number:72,name:"Crossfire",cells:["A","B","C","D","E","F","G","H","I"],layout:[["A","B","C"],["D","E","F"],["G","H","I"]],pieces:["OUT:RED|RED:RIGHT,GREEN:DOWN","RED|BLUE:RIGHT","IN:BLUE","GREEN|ORANGE:RIGHT","ORANGE|PURPLE:DOWN","OUT:CYAN|CYAN:DOWN","IN:ORANGE","PURPLE|ORANGE:LEFT","CYAN|PURPLE:LEFT"],solution:{A:"OUT:RED|RED:RIGHT,GREEN:DOWN",B:"RED|BLUE:RIGHT",C:"IN:BLUE",D:"GREEN|ORANGE:RIGHT",E:"ORANGE|PURPLE:DOWN",F:"OUT:CYAN|CYAN:DOWN",G:"IN:ORANGE",H:"PURPLE|ORANGE:LEFT",I:"CYAN|PURPLE:LEFT"},hint:"Two sources create overlapping signal zones."},
  {number:73,name:"Grand Highway",cells:["A","B","C","D","E","F","G","H","I","J"],layout:[["A","B","C","D","E"],["F","G","H","I","J"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT,ORANGE:DOWN_RIGHT","GREEN|PURPLE:RIGHT","PURPLE|CYAN:RIGHT","IN:CYAN","BLUE|YELLOW:RIGHT","YELLOW|BLUE:LEFT","ORANGE|YELLOW:LEFT,PINK:RIGHT","PINK|RED:RIGHT","IN:RED"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT,ORANGE:DOWN_RIGHT",C:"GREEN|PURPLE:RIGHT",D:"PURPLE|CYAN:RIGHT",E:"IN:CYAN",F:"BLUE|YELLOW:RIGHT",G:"YELLOW|BLUE:LEFT",H:"ORANGE|YELLOW:LEFT,PINK:RIGHT",I:"PINK|RED:RIGHT",J:"IN:RED"},hint:"10-tile highway with diagonal cross-link."},
  {number:74,name:"Hyperdense",cells:["A","B","C","D","E","F","G","H"],layout:[[null,"A",null],["B","C","D"],["E","F","G"],[null,"H",null]],pieces:["OUT:RED|RED:DOWN","IN:BLUE","RED|BLUE:LEFT,GREEN:RIGHT,ORANGE:DOWN","IN:GREEN","IN:CYAN","ORANGE|CYAN:LEFT,PURPLE:RIGHT,ORANGE:DOWN","IN:PURPLE","IN:ORANGE"],solution:{A:"OUT:RED|RED:DOWN",B:"IN:BLUE",C:"RED|BLUE:LEFT,GREEN:RIGHT,ORANGE:DOWN",D:"IN:GREEN",E:"IN:CYAN",F:"ORANGE|CYAN:LEFT,PURPLE:RIGHT,ORANGE:DOWN",G:"IN:PURPLE",H:"IN:ORANGE"},hint:"Two hubs cascade signals to 5 sinks."},
  {number:75,name:"L-Block",cells:["A","B","C","D","E","F","G","H","I","J"],layout:[["A","B","C","D"],["E",null,null,null],["F",null,null,null],["G","H","I","J"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT","IN:ORANGE","BLUE|CYAN:DOWN","CYAN|PURPLE:DOWN","PURPLE|PINK:RIGHT","PINK|YELLOW:RIGHT","YELLOW|RED:RIGHT","IN:RED"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT",D:"IN:ORANGE",E:"BLUE|CYAN:DOWN",F:"CYAN|PURPLE:DOWN",G:"PURPLE|PINK:RIGHT",H:"PINK|YELLOW:RIGHT",I:"YELLOW|RED:RIGHT",J:"IN:RED"},hint:"L-shaped layout. Signal snakes right, down, then right again."},
  {number:76,name:"Broadcast Tower",cells:["A","B","C","D","E","F","G"],layout:[[null,"A",null],["B","C","D"],["E","F","G"]],pieces:["OUT:RED|RED:DOWN","IN:BLUE","RED|BLUE:LEFT,GREEN:RIGHT,ORANGE:DOWN","IN:GREEN","IN:CYAN","ORANGE|CYAN:LEFT,PURPLE:RIGHT","IN:PURPLE"],solution:{A:"OUT:RED|RED:DOWN",B:"IN:BLUE",C:"RED|BLUE:LEFT,GREEN:RIGHT,ORANGE:DOWN",D:"IN:GREEN",E:"IN:CYAN",F:"ORANGE|CYAN:LEFT,PURPLE:RIGHT",G:"IN:PURPLE"},hint:"T-shape tower. Hub distributes down and sideways."},
  {number:77,name:"Grand Tour",cells:["A","B","C","D","E","F","G","H","I"],layout:[[null,null,"A",null,null],[null,null,"B",null,null],["C","D","E","F","G"],[null,null,"H",null,null],[null,null,"I",null,null]],pieces:["OUT:RED|RED:DOWN","RED|BLUE:DOWN","IN:GREEN","IN:RED","BLUE|RED:LEFT,GREEN:LEFT:2,ORANGE:RIGHT,PURPLE:RIGHT:2,CYAN:DOWN","IN:ORANGE","IN:PURPLE","CYAN|PINK:DOWN","IN:PINK"],solution:{A:"OUT:RED|RED:DOWN",B:"RED|BLUE:DOWN",C:"IN:GREEN",D:"IN:RED",E:"BLUE|RED:LEFT,GREEN:LEFT:2,ORANGE:RIGHT,PURPLE:RIGHT:2,CYAN:DOWN",F:"IN:ORANGE",G:"IN:PURPLE",H:"CYAN|PINK:DOWN",I:"IN:PINK"},hint:"5-output hub with distance-2 jumps! Grand cross layout."},
  {number:78,name:"Full Spectrum",cells:["A","B","C","D","E","F"],layout:[["A","B","C"],["D","E","F"]],pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|ORANGE:DOWN_RIGHT","CYAN|BLUE:LEFT","GREEN|CYAN:RIGHT","CYAN|GREEN:LEFT","ORANGE|CYAN:LEFT"],solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|ORANGE:DOWN_RIGHT",C:"CYAN|BLUE:LEFT",D:"GREEN|CYAN:RIGHT",E:"CYAN|GREEN:LEFT",F:"ORANGE|CYAN:LEFT"},hint:"6 tiles using 7 colors with a diagonal arrow."},
  {number:79,name:"Labyrinth Prime",cells:["A","B","C","D","E","F","G","H","I","J"],layout:[["A","B","C","D","E"],["F","G","H","I","J"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT","ORANGE|PURPLE:RIGHT","IN:PURPLE","BLUE|CYAN:RIGHT","CYAN|PINK:RIGHT","PINK|YELLOW:RIGHT","YELLOW|RED:RIGHT","IN:RED"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT",D:"ORANGE|PURPLE:RIGHT",E:"IN:PURPLE",F:"BLUE|CYAN:RIGHT",G:"CYAN|PINK:RIGHT",H:"PINK|YELLOW:RIGHT",I:"YELLOW|RED:RIGHT",J:"IN:RED"},hint:"Two 5-wide lanes. Source powers both."},
  {number:80,name:"Chromatic Apex",cells:["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"],layout:[["A","B","C","D"],["E","F","G","H"],["I","J","K","L"],["M","N","O","P"]],pieces:["OUT:RED|RED:RIGHT,BLUE:DOWN","RED|GREEN:RIGHT","GREEN|ORANGE:RIGHT","IN:ORANGE","BLUE|CYAN:RIGHT,PURPLE:DOWN","CYAN|BLUE:LEFT","PINK|CYAN:LEFT,YELLOW:DOWN","YELLOW|PINK:LEFT","PURPLE|RED:RIGHT,RED:DOWN","RED|YELLOW:RIGHT,YELLOW:DOWN","YELLOW|GREEN:RIGHT,BLUE:DOWN","IN:GREEN","IN:RED","IN:YELLOW","BLUE|PURPLE:RIGHT","IN:PURPLE"],solution:{A:"OUT:RED|RED:RIGHT,BLUE:DOWN",B:"RED|GREEN:RIGHT",C:"GREEN|ORANGE:RIGHT",D:"IN:ORANGE",E:"BLUE|CYAN:RIGHT,PURPLE:DOWN",F:"CYAN|BLUE:LEFT",G:"PINK|CYAN:LEFT,YELLOW:DOWN",H:"YELLOW|PINK:LEFT",I:"PURPLE|RED:RIGHT,RED:DOWN",J:"RED|YELLOW:RIGHT,YELLOW:DOWN",K:"YELLOW|GREEN:RIGHT,BLUE:DOWN",L:"IN:GREEN",M:"IN:RED",N:"IN:YELLOW",O:"BLUE|PURPLE:RIGHT",P:"IN:PURPLE"},hint:"16 tiles across 4 rows. The ultimate Chromatic puzzle!"},
];

// ─── ARROW VISUALS ──────────────────────────────────────────────────────────

const ARROW_SYM = { UP:"↑",DOWN:"↓",LEFT:"←",RIGHT:"→",UP_LEFT:"↖",UP_RIGHT:"↗",DOWN_LEFT:"↙",DOWN_RIGHT:"↘" };
const ARROW_POS = {
  UP:{top:2,left:"50%",transform:"translateX(-50%)"},DOWN:{bottom:2,left:"50%",transform:"translateX(-50%)"},
  LEFT:{left:2,top:"50%",transform:"translateY(-50%)"},RIGHT:{right:2,top:"50%",transform:"translateY(-50%)"},
  UP_LEFT:{top:2,left:2},UP_RIGHT:{top:2,right:2},DOWN_LEFT:{bottom:2,left:2},DOWN_RIGHT:{bottom:2,right:2},
};
const CHAPTERS = [
  {name:"Fundamentals",range:[1,9],color:"#3b82f6"},{name:"Multi-Output",range:[10,18],color:"#a855f7"},
  {name:"Complex Layouts",range:[19,30],color:"#22c55e"},{name:"Sources & Sinks",range:[31,38],color:"#f59e0b"},
  {name:"Jumper Arrows",range:[39,46],color:"#ef4444"},{name:"Advanced Combos",range:[47,54],color:"#06b6d4"},
  {name:"Expert",range:[55,60],color:"#ec4899"},
  {name:"Master",range:[61,80],color:"#fbbf24"},
];

// ─── TILE COMPONENT ─────────────────────────────────────────────────────────

function TilePiece({ tileStr, size=80, onClick, isDragging, isPlaced }) {
  const tile = parseTile(tileStr);
  const isIn = tile.type==="INPUT_ONLY", isOut = tile.type==="OUTPUT_ONLY";

  // INPUT_ONLY: simple colored slab, no circle, no arrows
  if (isIn) {
    const cols = tile.acceptColors.map(c=>COLORS[c]?.bg||"#888");
    const bg = cols.length===1 ? cols[0] : `linear-gradient(135deg,${cols.join(",")})`;
    return (
      <div onClick={onClick} style={{width:size,height:size,borderRadius:12,background:bg,opacity:0.85,
        boxShadow:isDragging?`0 0 24px ${cols[0]}, 0 8px 32px rgba(0,0,0,0.4)`:`0 ${isPlaced?2:4}px ${isPlaced?8:16}px rgba(0,0,0,0.3)`,
        cursor:"pointer",transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)",transform:isDragging?"scale(1.1)":"scale(1)",
        position:"relative",display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none",
        border:"2px dashed rgba(255,255,255,0.35)"}} />
    );
  }

  const bgColor = isOut ? "rgba(251,191,36,0.15)" : COLORS[tile.outer]?.bg||"#444";
  const glowC = isOut ? "#fbbf24" : COLORS[tile.outer]?.glow||"#666";
  const innerCols = tile.connections.map(c => COLORS[c.color]);
  const centerGrad = innerCols.length===0 ? "#555"
    : innerCols.length===1 ? innerCols[0].bg
    : `conic-gradient(${innerCols.map((c,i)=>`${c.bg} ${(i/innerCols.length)*360}deg ${((i+1)/innerCols.length)*360}deg`).join(",")})`;
  return (
    <div onClick={onClick} style={{width:size,height:size,borderRadius:12,background:bgColor,
      boxShadow:isDragging?`0 0 24px ${glowC}, 0 8px 32px rgba(0,0,0,0.4)`:`0 ${isPlaced?2:4}px ${isPlaced?8:16}px rgba(0,0,0,0.3)`,
      cursor:"pointer",transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)",transform:isDragging?"scale(1.1)":"scale(1)",
      position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none",
      border:isOut?"2px solid rgba(251,191,36,0.5)":"2px solid rgba(255,255,255,0.18)"}}>
      <div style={{width:size*0.36,height:size*0.36,borderRadius:"50%",background:centerGrad,
        border:"2px solid rgba(255,255,255,0.3)",
        display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 10px rgba(255,255,255,0.15)",zIndex:2}} />
      {tile.connections.map((conn,i) => {
        const c=COLORS[conn.color],pos=ARROW_POS[conn.dir],sz=size>60?18:14,dist=conn.distance||1;
        return (<div key={i} style={{position:"absolute",...pos,zIndex:3,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",
          background:c?.bg||"#888",borderRadius:"50%",width:sz,height:sz,
          border:dist>1?"2px solid rgba(255,255,0,0.6)":"1.5px solid rgba(255,255,255,0.4)",
          boxShadow:dist>1?"0 0 8px rgba(255,255,0,0.4)":`0 0 6px ${c?.glow||"#888"}60`}}>
          <span style={{fontSize:sz>14?11:9,color:"rgba(255,255,255,0.95)",lineHeight:1,fontWeight:700}}>{ARROW_SYM[conn.dir]}</span>
          {dist>1&&<span style={{fontSize:6,color:"rgba(255,255,0,0.9)",lineHeight:1,fontWeight:900,marginTop:-1}}>{dist}</span>}
        </div>);
      })}
    </div>
  );
}

function GridCell({cellName,size,tile,hasError,onClick,isTarget}) {
  return (<div onClick={onClick} style={{width:size,height:size,borderRadius:12,
    background:tile?"transparent":"rgba(255,255,255,0.04)",
    border:tile?"none":isTarget?"2px dashed rgba(255,255,255,0.5)":"2px dashed rgba(255,255,255,0.12)",
    cursor:"pointer",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",
    transition:"all 0.2s ease",animation:hasError?"shake 0.4s ease":"none",
    boxShadow:hasError?"0 0 16px rgba(239,68,68,0.4)":isTarget?"0 0 12px rgba(255,255,255,0.08)":"none"}}>
    {tile?<TilePiece tileStr={tile} size={size-4} isPlaced/>:
      <span style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.2)",fontFamily:"'JetBrains Mono',monospace"}}>{cellName}</span>}
  </div>);
}

function Confetti(){const ref=useRef(null);useEffect(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext("2d");cv.width=window.innerWidth;cv.height=window.innerHeight;const cols=["#fbbf24","#f59e0b","#ef4444","#3b82f6","#22c55e","#a855f7","#ec4899","#06b6d4"];const ps=Array.from({length:150},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height-cv.height,w:Math.random()*10+4,h:Math.random()*6+2,color:cols[Math.floor(Math.random()*cols.length)],vy:Math.random()*3+2,vx:(Math.random()-0.5)*2,rot:Math.random()*360,vr:(Math.random()-0.5)*8,opacity:1}));let raf;function draw(){ctx.clearRect(0,0,cv.width,cv.height);let alive=false;for(const p of ps){p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;if(p.y>cv.height+20)p.opacity-=0.02;if(p.opacity<=0)continue;alive=true;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);ctx.globalAlpha=Math.max(0,p.opacity);ctx.fillStyle=p.color;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore()}if(alive)raf=requestAnimationFrame(draw)}draw();return()=>cancelAnimationFrame(raf)},[]);return <canvas ref={ref} style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:200}}/>;}

function VictoryScreen({onBack}){const[show,setShow]=useState(false);useEffect(()=>{setTimeout(()=>setShow(true),100)},[]);return(
<div style={{position:"fixed",inset:0,background:"radial-gradient(ellipse at center,#1a1a2e 0%,#0f0f1a 100%)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,opacity:show?1:0,transition:"opacity 0.8s ease"}}>
<Confetti/><div style={{textAlign:"center",zIndex:201,transform:show?"scale(1)":"scale(0.7)",transition:"transform 0.8s cubic-bezier(0.34,1.56,0.64,1)"}}>
<div style={{fontSize:60,fontWeight:900,fontFamily:"'Orbitron',sans-serif",background:"linear-gradient(135deg,#fbbf24,#f59e0b,#ef4444,#a855f7,#3b82f6,#22c55e)",backgroundSize:"300% 300%",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 3s linear infinite",filter:"drop-shadow(0 4px 20px rgba(251,191,36,0.5))",marginBottom:8}}>CHROMATIC</div>
<div style={{fontSize:28,fontWeight:700,fontFamily:"'Orbitron',sans-serif",color:"#fbbf24",marginBottom:8,letterSpacing:"0.2em"}}>GRANDMASTER</div>
<p style={{color:"rgba(255,255,255,0.5)",fontSize:14,fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>All 80 levels complete</p>
<p style={{color:"rgba(255,255,255,0.3)",fontSize:12,fontFamily:"'JetBrains Mono',monospace",marginBottom:40,maxWidth:300,margin:"0 auto 40px"}}>Sources, sinks, jumpers, chains, and master puzzles — you've conquered Chromatic.</p>
<button onClick={onBack} style={{padding:"14px 36px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#1a1a2e",fontSize:15,fontWeight:700,fontFamily:"'Orbitron',sans-serif",cursor:"pointer",boxShadow:"0 4px 20px rgba(251,191,36,0.4)",letterSpacing:"0.1em"}}>RETURN TO LEVELS</button>
</div></div>);}

function FinishOverlay({level,onNext,onReplay,hasNext}){const[show,setShow]=useState(false);useEffect(()=>{setTimeout(()=>setShow(true),100)},[]);return(
<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,opacity:show?1:0,transition:"opacity 0.5s ease"}}>
<div style={{textAlign:"center",transform:show?"scale(1)":"scale(0.8)",transition:"transform 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>
<div style={{fontSize:56,fontWeight:900,fontFamily:"'Orbitron',sans-serif",background:"linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"0.1em",marginBottom:8,filter:"drop-shadow(0 4px 12px rgba(251,191,36,0.4))"}}>FINISH!</div>
<p style={{color:"rgba(255,255,255,0.6)",fontSize:15,fontFamily:"'JetBrains Mono',monospace",marginBottom:32}}>Level {level.number} — {level.name}</p>
<div style={{display:"flex",gap:16,justifyContent:"center"}}>
<button onClick={onReplay} style={{padding:"12px 28px",borderRadius:10,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.8)",fontSize:14,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}>Replay</button>
{hasNext&&<button onClick={onNext} style={{padding:"12px 28px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#1a1a2e",fontSize:14,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",boxShadow:"0 4px 16px rgba(245,158,11,0.3)"}}>Next Level →</button>}
</div></div></div>);}

// ─── MAIN GAME ──────────────────────────────────────────────────────────────

export default function ChromaticPuzzle() {
  const [currentLevel, setCurrentLevel] = useState(0);
  const [board, setBoard] = useState({});
  const [tray, setTray] = useState([]);
  const [selectedTile, setSelectedTile] = useState(null);
  const [solved, setSolved] = useState(false);
  const [errors, setErrors] = useState(new Set());
  const [showHint, setShowHint] = useState(false);
  const [screen, setScreen] = useState("menu");
  const [completedLevels, setCompletedLevels] = useState(new Set());
  const [showVictory, setShowVictory] = useState(false);
  const level = LEVELS[currentLevel];
  const allComplete = completedLevels.size === LEVELS.length;

  const initLevel = useCallback((idx) => {
    setCurrentLevel(idx); setBoard({}); setTray(shuffleArray(LEVELS[idx].pieces));
    setSelectedTile(null); setSolved(false); setErrors(new Set()); setShowHint(false); setScreen("game");
  }, []);

  const markSolved = (newBoard) => {
    setSolved(true);
    const next = new Set([...completedLevels, currentLevel]);
    setCompletedLevels(next);
    if (next.size === LEVELS.length) setTimeout(() => setShowVictory(true), 1500);
  };

  const handleCellClick = (cellName) => {
    if (solved) return;
    if (board[cellName] && !selectedTile) {
      const tile = board[cellName]; const nb = { ...board }; delete nb[cellName];
      setBoard(nb); setTray(p => [...p, tile]); setSelectedTile(tile);
      setErrors(getConnectionErrors(level, nb)); return;
    }
    if (board[cellName] && selectedTile) {
      const existing = board[cellName]; const nb = { ...board, [cellName]: selectedTile };
      setBoard(nb); setTray(p => p.filter(t => t !== selectedTile).concat(existing));
      setSelectedTile(existing); setErrors(getConnectionErrors(level, nb));
      if (checkSolution(level, nb)) markSolved(nb);
      return;
    }
    if (selectedTile && !board[cellName]) {
      const nb = { ...board, [cellName]: selectedTile };
      setBoard(nb); setTray(p => p.filter(t => t !== selectedTile));
      setSelectedTile(null); setErrors(getConnectionErrors(level, nb));
      if (checkSolution(level, nb)) markSolved(nb);
    }
  };

  const handleTrayClick = (tileStr) => {
    if (solved) return;
    setSelectedTile(selectedTile === tileStr ? null : tileStr);
  };

  const handleClear = () => {
    setBoard({}); setTray(shuffleArray(level.pieces)); setSelectedTile(null); setErrors(new Set());
  };

  const cellSize = (() => {
    if (!level) return 80;
    const cols = Math.max(...level.layout.map(r => r.length));
    const rows = level.layout.length;
    if (cols >= 7) return 52;
    if (cols >= 5) return 60;
    if (cols >= 4) return 68;
    if (rows >= 4) return 72;
    if (rows >= 3 && cols >= 3) return 76;
    return 86;
  })();

  const sharedHead = (<>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet"/>
    <style>{`
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
      @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
      @keyframes pulseGlow{0%,100%{box-shadow:0 0 8px rgba(251,191,36,0.2)}50%{box-shadow:0 0 20px rgba(251,191,36,0.5)}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      *::-webkit-scrollbar{width:6px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
    `}</style>
  </>);

  if (showVictory) return <>{sharedHead}<VictoryScreen onBack={() => { setShowVictory(false); setScreen("menu"); }}/></>;

  // ─── MENU ─────────────────────────────────────────────────────────────────
  if (screen === "menu") {
    const progress = completedLevels.size;
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0f0f1a 0%,#1a1a2e 40%,#16213e 100%)",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'JetBrains Mono',monospace",padding:"24px 16px"}}>
        {sharedHead}
        <div style={{animation:"float 4s ease-in-out infinite",marginBottom:16,marginTop:16}}>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            {["RED","BLUE","GREEN"].map(c=>(<div key={c} style={{width:40,height:40,borderRadius:10,background:`radial-gradient(circle,${COLORS[c].glow},${COLORS[c].bg})`,boxShadow:`0 0 20px ${COLORS[c].glow}40`}}/>))}
          </div>
        </div>
        <h1 style={{fontSize:36,fontWeight:900,fontFamily:"'Orbitron',sans-serif",background:"linear-gradient(90deg,#60a5fa,#a78bfa,#f472b6,#60a5fa)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 4s linear infinite",marginBottom:4,textAlign:"center"}}>CHROMATIC</h1>
        <p style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginBottom:8,letterSpacing:"0.3em"}}>TILE · ARROW · CHAIN</p>
        <p style={{color:"rgba(255,255,255,0.22)",fontSize:11,marginBottom:20,maxWidth:300,textAlign:"center",lineHeight:1.6}}>Place tiles so each arrow points at a neighbor whose outer color matches.</p>
        {progress>0&&(<div style={{marginBottom:16,padding:"6px 16px",borderRadius:8,background:allComplete?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.03)",border:`1px solid ${allComplete?"rgba(251,191,36,0.3)":"rgba(255,255,255,0.06)"}`}}>
          <span style={{color:allComplete?"#fbbf24":"rgba(255,255,255,0.4)",fontSize:11}}>{allComplete?"★ ALL COMPLETE ★":`${progress} / ${LEVELS.length}`}</span>
          {allComplete&&<button onClick={()=>setShowVictory(true)} style={{marginLeft:12,background:"none",border:"none",color:"#fbbf24",fontSize:11,cursor:"pointer",textDecoration:"underline"}}>View Victory</button>}
        </div>)}
        <div style={{width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:4,maxHeight:"60vh",overflowY:"auto",padding:"0 4px"}}>
          {CHAPTERS.map(ch=>{
            const chLevels=LEVELS.filter(l=>l.number>=ch.range[0]&&l.number<=ch.range[1]);
            return(<div key={ch.name}>
              <div style={{padding:"8px 12px",fontSize:10,fontWeight:700,letterSpacing:"0.15em",color:ch.color,opacity:0.6,display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:12,height:2,background:ch.color,borderRadius:1}}/>{ch.name.toUpperCase()}
              </div>
              {chLevels.map(lvl=>{
                const idx=LEVELS.indexOf(lvl);const done=completedLevels.has(idx);
                const maxOut=Math.max(...lvl.pieces.map(p=>{const t=parseTile(p);return t.connections.length}));
                const hasJump=lvl.pieces.some(p=>/:\d+/.test(p.replace(/^(OUT:\w+\||IN:\w+|\w+\|)/,"")));
                const hasIO=lvl.pieces.some(p=>p.startsWith("IN:")||p.startsWith("OUT:"));
                const tags=[];if(maxOut>=4)tags.push("4×");else if(maxOut>=3)tags.push("3×");if(hasJump)tags.push("jump");if(hasIO)tags.push("io");
                return(<button key={idx} onClick={()=>initLevel(idx)} style={{width:"100%",padding:"10px 14px",borderRadius:9,
                  border:`1px solid ${done?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)"}`,
                  background:done?"rgba(34,197,94,0.04)":"rgba(255,255,255,0.02)",
                  color:"rgba(255,255,255,0.85)",fontSize:12,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",
                  cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",
                  transition:"all 0.15s",textAlign:"left",marginBottom:2,animation:`fadeIn 0.2s ease ${(idx%10)*0.02}s both`}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)"}}
                  onMouseLeave={e=>{e.currentTarget.style.background=done?"rgba(34,197,94,0.04)":"rgba(255,255,255,0.02)"}}>
                  <span style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:"rgba(255,255,255,0.22)",fontSize:10,minWidth:20}}>{String(lvl.number).padStart(2,"0")}</span>
                    <span>{lvl.name}</span>
                    {tags.length>0&&<span style={{fontSize:8,color:`${ch.color}80`,whiteSpace:"nowrap"}}>{tags.join("·")}</span>}
                  </span>
                  <span style={{fontSize:10,color:done?"rgba(34,197,94,0.6)":"rgba(255,255,255,0.18)",minWidth:18,textAlign:"right"}}>{done?"✓":`${lvl.cells.length}t`}</span>
                </button>);
              })}
            </div>);
          })}
        </div>
      </div>
    );
  }

  // ─── GAME ─────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0f0f1a 0%,#1a1a2e 40%,#16213e 100%)",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'JetBrains Mono',monospace",padding:"16px 12px"}}>
      {sharedHead}
      <div style={{width:"100%",maxWidth:520,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <button onClick={()=>setScreen("menu")} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"7px 12px",color:"rgba(255,255,255,0.6)",fontSize:12,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}>← Levels</button>
        <div style={{textAlign:"center"}}>
          <span style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:"0.2em",display:"block"}}>LEVEL {level.number}</span>
          <span style={{fontSize:16,fontWeight:700,fontFamily:"'Orbitron',sans-serif",color:"rgba(255,255,255,0.9)"}}>{level.name}</span>
        </div>
        <div style={{display:"flex",gap:5}}>
          <button onClick={()=>setShowHint(!showHint)} style={{background:showHint?"rgba(251,191,36,0.15)":"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"7px 10px",color:showHint?"#fbbf24":"rgba(255,255,255,0.6)",fontSize:13,cursor:"pointer"}}>?</button>
          <button onClick={handleClear} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"7px 10px",color:"rgba(255,255,255,0.6)",fontSize:13,cursor:"pointer"}}>↺</button>
        </div>
      </div>
      {showHint&&<div style={{maxWidth:520,width:"100%",marginBottom:12,padding:"9px 14px",borderRadius:10,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.2)",color:"#fbbf24",fontSize:12,lineHeight:1.5}}>{level.hint}</div>}
      <div style={{maxWidth:520,width:"100%",marginBottom:14,padding:"6px 12px",borderRadius:8,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.3)",fontSize:10,textAlign:"center"}}>
        Each arrow must point at a tile whose outer color matches{level.pieces.some(p=>/:\d+/.test(p.replace(/^(OUT:\w+\||IN:\w+|\w+\|)/,"")))?" · numbered arrows jump over tiles!":""}{level.pieces.some(p=>p.startsWith("OUT:"))?" · SRC = source (sends only)":""}{level.pieces.some(p=>p.startsWith("IN:"))?" · SINK = destination":""}
      </div>
      <div style={{marginBottom:20,padding:14,borderRadius:14,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)"}}>
        {level.layout.map((row,r)=>(<div key={r} style={{display:"flex",gap:6,marginBottom:r<level.layout.length-1?6:0}}>
          {row.map((cell,c)=>{
            if(!cell)return<div key={c} style={{width:cellSize,height:cellSize}}/>;
            const hasErr=[...errors].some(e=>e.startsWith(cell+":"));
            return<GridCell key={c} cellName={cell} size={cellSize} tile={board[cell]||null} hasError={hasErr} isTarget={!!selectedTile&&!board[cell]} onClick={()=>handleCellClick(cell)}/>;
          })}
        </div>))}
      </div>
      {selectedTile&&(<div style={{marginBottom:10,display:"flex",alignItems:"center",gap:10,padding:"7px 14px",borderRadius:10,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.2)"}}>
        <span style={{color:"#fbbf24",fontSize:11}}>Selected:</span>
        <TilePiece tileStr={selectedTile} size={40}/>
        <button onClick={()=>setSelectedTile(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:15,cursor:"pointer",padding:"2px 5px"}}>✕</button>
      </div>)}
      <div style={{marginBottom:12}}>
        <span style={{display:"block",textAlign:"center",color:"rgba(255,255,255,0.2)",fontSize:10,letterSpacing:"0.2em",marginBottom:8}}>PIECES</span>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",maxWidth:520}}>
          {tray.map((tile,idx)=>(<div key={idx} style={{borderRadius:12,padding:2,transition:"all 0.2s",border:selectedTile===tile?"2px solid #fbbf24":"2px solid transparent",animation:selectedTile===tile?"pulseGlow 1.5s ease infinite":"none"}}>
            <TilePiece tileStr={tile} size={60} onClick={()=>handleTrayClick(tile)} isDragging={selectedTile===tile}/>
          </div>))}
        </div>
      </div>
      <div style={{color:"rgba(255,255,255,0.2)",fontSize:10}}>{Object.keys(board).length} / {level.cells.length} placed</div>
      {solved&&<FinishOverlay level={level} hasNext={currentLevel<LEVELS.length-1} onNext={()=>initLevel(currentLevel+1)} onReplay={()=>initLevel(currentLevel)}/>}
    </div>
  );
}
