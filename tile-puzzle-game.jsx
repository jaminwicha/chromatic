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
  const [outer, innerPart] = str.split("|");
  const connections = innerPart.split(",").map(p => {
    const [color, dir] = p.split(":");
    return { color, dir };
  });
  return { outer, connections, id: str };
}

function findCellPos(layout, cellName) {
  for (let r = 0; r < layout.length; r++)
    for (let c = 0; c < layout[r].length; c++)
      if (layout[r][c] === cellName) return { row: r, col: c };
  return null;
}

function getNeighborInDir(layout, row, col, dir) {
  const { dr, dc } = DIRS[dir];
  const nr = row + dr, nc = col + dc;
  if (nr >= 0 && nr < layout.length && nc >= 0 && nc < layout[0].length && layout[nr][nc])
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
        const neighbor = getNeighborInDir(level.layout, r, c, conn.dir);
        if (!neighbor || !board[neighbor.cell]) continue;
        if (conn.color !== parseTile(board[neighbor.cell]).outer)
          errors.add(`${cellName}:${conn.dir}`);
      }
    }
  }
  return errors;
}

function checkSolution(level, board) {
  for (const cell of level.cells)
    if (!board[cell] || board[cell] !== level.solution[cell]) return false;
  return true;
}

// ─── ALL 30 LEVELS ──────────────────────────────────────────────────────────

const LEVELS = [
  // --- L1-9: Original levels (locked) ---
  { number:1, name:"First Link", cells:["A","B"], layout:[["A","B"]], pieces:["BLUE|RED:RIGHT","RED|BLUE:LEFT"], solution:{A:"BLUE|RED:RIGHT",B:"RED|BLUE:LEFT"}, hint:"A's inner RED arrow points right. B's outer must be RED." },
  { number:2, name:"Three Chain", cells:["A","B","C"], layout:[["A","B","C"]], pieces:["RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|GREEN:LEFT"], solution:{A:"RED|GREEN:RIGHT",B:"GREEN|BLUE:RIGHT",C:"BLUE|GREEN:LEFT"}, hint:"A→B→C flows right. C points back left to B." },
  { number:3, name:"Corner Turn", cells:["A","B","C"], layout:[["A",null],["B","C"]], pieces:["GREEN|BLUE:DOWN","BLUE|RED:RIGHT","RED|BLUE:LEFT"], solution:{A:"GREEN|BLUE:DOWN",B:"BLUE|RED:RIGHT",C:"RED|BLUE:LEFT"}, hint:"A sends down to B. B sends right to C. C sends back to B." },
  { number:4, name:"Split Signal", cells:["A","B","C"], layout:[["A","B"],["C",null]], pieces:["PURPLE|GREEN:RIGHT,RED:DOWN","GREEN|PURPLE:LEFT","RED|PURPLE:UP"], solution:{A:"PURPLE|GREEN:RIGHT,RED:DOWN",B:"GREEN|PURPLE:LEFT",C:"RED|PURPLE:UP"}, hint:"A has TWO arrows! GREEN goes right to B, RED goes down to C." },
  { number:5, name:"Hub", cells:["A","B","C","D"], layout:[["A","B"],["C","D"]], pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT","GREEN|RED:UP","ORANGE|GREEN:LEFT"], solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"ORANGE|GREEN:LEFT"}, hint:"A is the hub — BLUE goes right to B, GREEN goes down to C." },
  { number:6, name:"Diagonal", cells:["A","B","C","D"], layout:[["A","B"],["C","D"]], pieces:["BLUE|RED:DOWN_RIGHT","GREEN|RED:DOWN","PURPLE|RED:RIGHT","RED|GREEN:UP"], solution:{A:"BLUE|RED:DOWN_RIGHT",B:"GREEN|RED:DOWN",C:"PURPLE|RED:RIGHT",D:"RED|GREEN:UP"}, hint:"A goes DIAGONAL to D! B and C also point to D. D points up to B." },
  { number:7, name:"X Marks It", cells:["A","B","C","D"], layout:[["A","B"],["C","D"]], pieces:["RED|GREEN:DOWN_RIGHT","BLUE|RED:DOWN_LEFT","RED|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"], solution:{A:"RED|GREEN:DOWN_RIGHT",B:"BLUE|RED:DOWN_LEFT",C:"RED|BLUE:UP_RIGHT",D:"GREEN|RED:UP_LEFT"}, hint:"All arrows are diagonal — forming an X across the grid." },
  { number:8, name:"Star Node", cells:["A","B","C","D","E"], layout:[[null,"A",null],["B","C","D"],[null,"E",null]], pieces:["PURPLE|ORANGE:DOWN","ORANGE|ORANGE:RIGHT","ORANGE|PURPLE:UP,ORANGE:LEFT","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"], solution:{A:"PURPLE|ORANGE:DOWN",B:"ORANGE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,ORANGE:LEFT",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"}, hint:"C is the star center with 2 arrows. Everything flows through C." },
  { number:9, name:"Full Grid", cells:["A","B","C","D","E","F"], layout:[["A","B","C"],["D","E","F"]], pieces:["RED|BLUE:RIGHT","BLUE|GREEN:RIGHT,RED:DOWN_LEFT","GREEN|BLUE:DOWN","RED|GREEN:RIGHT","GREEN|BLUE:UP","BLUE|GREEN:LEFT"], solution:{A:"RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT,RED:DOWN_LEFT",C:"GREEN|BLUE:DOWN",D:"RED|GREEN:RIGHT",E:"GREEN|BLUE:UP",F:"BLUE|GREEN:LEFT"}, hint:"B has 2 arrows: GREEN→right to C, RED→diagonal down-left to D." },

  // --- L10-12: Introduce 3-output and 4-output ---
  { number:10, name:"Triple Threat", cells:["A","B","C","D"], layout:[[null,"A",null],["B","C","D"]], pieces:["PURPLE|ORANGE:DOWN","ORANGE|ORANGE:RIGHT","ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT","GREEN|ORANGE:LEFT"], solution:{A:"PURPLE|ORANGE:DOWN",B:"ORANGE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,ORANGE:LEFT,GREEN:RIGHT",D:"GREEN|ORANGE:LEFT"}, hint:"C has THREE arrows — one to each neighbor!" },
  { number:11, name:"Broadcast", cells:["A","B","C","D","E"], layout:[["A","B"],["C","D"],["E",null]], pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","CYAN|GREEN:UP"], solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"PURPLE|GREEN:LEFT",E:"CYAN|GREEN:UP"}, hint:"A broadcasts 3 signals: right, down, and diagonal!" },
  { number:12, name:"Quad Core", cells:["A","B","C","D","E"], layout:[[null,"A",null],["B","C","D"],[null,"E",null]], pieces:["RED|ORANGE:DOWN","BLUE|ORANGE:RIGHT","ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"], solution:{A:"RED|ORANGE:DOWN",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"}, hint:"C has FOUR arrows — one to each cardinal neighbor!" },

  // --- L13-18: Mixed complexity ---
  { number:13, name:"Relay", cells:["A","B","C","D","E","F"], layout:[["A","B","C"],["D","E","F"]], pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","ORANGE|BLUE:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","PINK|PURPLE:LEFT"], solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"ORANGE|BLUE:LEFT",D:"GREEN|RED:UP",E:"PURPLE|GREEN:LEFT",F:"PINK|PURPLE:LEFT"}, hint:"A relays 3 signals across the grid. Follow each chain." },
  { number:14, name:"Crossfire", cells:["A","B","C","D","E"], layout:[[null,"A",null],["B","C","D"],[null,"E",null]], pieces:["BLUE|RED:DOWN,GREEN:DOWN_LEFT","GREEN|RED:RIGHT","RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN","PURPLE|RED:LEFT","ORANGE|RED:UP"], solution:{A:"BLUE|RED:DOWN,GREEN:DOWN_LEFT",B:"GREEN|RED:RIGHT",C:"RED|BLUE:UP,PURPLE:RIGHT,ORANGE:DOWN",D:"PURPLE|RED:LEFT",E:"ORANGE|RED:UP"}, hint:"A and C both have multiple outputs. Arrows cross paths!" },
  { number:15, name:"Pinwheel", cells:["A","B","C","D"], layout:[["A","B"],["C","D"]], pieces:["RED|GREEN:DOWN_RIGHT,BLUE:RIGHT","BLUE|RED:DOWN_LEFT","RED|BLUE:UP_RIGHT","GREEN|RED:UP_LEFT"], solution:{A:"RED|GREEN:DOWN_RIGHT,BLUE:RIGHT",B:"BLUE|RED:DOWN_LEFT",C:"RED|BLUE:UP_RIGHT",D:"GREEN|RED:UP_LEFT"}, hint:"A spins two arrows: diagonal and cardinal. Others go diagonal." },
  { number:16, name:"Cascade", cells:["A","B","C","D"], layout:[["A","B","C","D"]], pieces:["RED|GREEN:RIGHT","GREEN|BLUE:RIGHT","BLUE|PURPLE:RIGHT","PURPLE|BLUE:LEFT"], solution:{A:"RED|GREEN:RIGHT",B:"GREEN|BLUE:RIGHT",C:"BLUE|PURPLE:RIGHT",D:"PURPLE|BLUE:LEFT"}, hint:"A waterfall of arrows flows right. D sends one back." },
  { number:17, name:"Trident", cells:["A","B","C","D","E"], layout:[["A","B","C"],[null,"D",null],[null,"E",null]], pieces:["RED|PURPLE:RIGHT","PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN","GREEN|PURPLE:LEFT","BLUE|ORANGE:DOWN","ORANGE|BLUE:UP"], solution:{A:"RED|PURPLE:RIGHT",B:"PURPLE|RED:LEFT,GREEN:RIGHT,BLUE:DOWN",C:"GREEN|PURPLE:LEFT",D:"BLUE|ORANGE:DOWN",E:"ORANGE|BLUE:UP"}, hint:"B is the trident head — 3 prongs: left, right, and down." },
  { number:18, name:"Mirror", cells:["A","B","C","D","E","F"], layout:[["A","B","C"],["D","E","F"]], pieces:["GREEN|BLUE:DOWN","RED|GREEN:LEFT,PURPLE:RIGHT","PURPLE|RED:LEFT","BLUE|GREEN:UP","ORANGE|BLUE:LEFT,CYAN:RIGHT","CYAN|ORANGE:LEFT"], solution:{A:"GREEN|BLUE:DOWN",B:"RED|GREEN:LEFT,PURPLE:RIGHT",C:"PURPLE|RED:LEFT",D:"BLUE|GREEN:UP",E:"ORANGE|BLUE:LEFT,CYAN:RIGHT",F:"CYAN|ORANGE:LEFT"}, hint:"B and E mirror each other — both split signals left and right." },

  // --- L19-24: Harder combos ---
  { number:19, name:"Diamond", cells:["A","B","C","D","E"], layout:[[null,"A",null],["B","C","D"],[null,"E",null]], pieces:["CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT","GREEN|CYAN:UP_RIGHT","RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT","PURPLE|CYAN:UP_LEFT","ORANGE|RED:UP"], solution:{A:"CYAN|GREEN:DOWN_LEFT,PURPLE:DOWN_RIGHT",B:"GREEN|CYAN:UP_RIGHT",C:"RED|CYAN:UP,GREEN:LEFT,PURPLE:RIGHT",D:"PURPLE|CYAN:UP_LEFT",E:"ORANGE|RED:UP"}, hint:"A shoots diagonals to B and D. C controls the center with 3 arrows." },
  { number:20, name:"Web", cells:["A","B","C","D","E","F"], layout:[["A","B","C"],["D","E","F"]], pieces:["CYAN|BLUE:RIGHT","BLUE|ORANGE:DOWN","PINK|BLUE:LEFT","RED|ORANGE:RIGHT","ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT","GREEN|ORANGE:LEFT"], solution:{A:"CYAN|BLUE:RIGHT",B:"BLUE|ORANGE:DOWN",C:"PINK|BLUE:LEFT",D:"RED|ORANGE:RIGHT",E:"ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,CYAN:UP_LEFT",F:"GREEN|ORANGE:LEFT"}, hint:"E is the web center with 4 arrows — cardinal and diagonal!" },
  { number:21, name:"Zigzag", cells:["A","B","C","D"], layout:[["A","B",null],[null,"C","D"]], pieces:["RED|GREEN:RIGHT","GREEN|RED:DOWN,BLUE:DOWN_RIGHT","RED|GREEN:UP","BLUE|RED:LEFT"], solution:{A:"RED|GREEN:RIGHT",B:"GREEN|RED:DOWN,BLUE:DOWN_RIGHT",C:"RED|GREEN:UP",D:"BLUE|RED:LEFT"}, hint:"B sends two arrows diagonally down — one to C, one to D." },
  { number:22, name:"Fortress", cells:["A","B","C","D","E","F"], layout:[["A","B","C"],["D","E","F"]], pieces:["RED|BLUE:RIGHT,GREEN:DOWN","BLUE|RED:LEFT","PURPLE|ORANGE:DOWN","GREEN|RED:UP","GREEN|ORANGE:RIGHT","ORANGE|PURPLE:UP,GREEN:LEFT"], solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|RED:LEFT",C:"PURPLE|ORANGE:DOWN",D:"GREEN|RED:UP",E:"GREEN|ORANGE:RIGHT",F:"ORANGE|PURPLE:UP,GREEN:LEFT"}, hint:"A and F are the twin towers — each with 2 outputs." },
  { number:23, name:"Helix", cells:["A","B","C","D","E","F","G","H"], layout:[["A","B","C","D"],["E","F","G","H"]], pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|BLUE:RIGHT","BLUE|GREEN:LEFT","CYAN|PURPLE:RIGHT","PURPLE|BLUE:UP","ORANGE|GREEN:UP,PURPLE:LEFT","PINK|ORANGE:LEFT"], solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",C:"GREEN|BLUE:RIGHT",D:"BLUE|GREEN:LEFT",E:"CYAN|PURPLE:RIGHT",F:"PURPLE|BLUE:UP",G:"ORANGE|GREEN:UP,PURPLE:LEFT",H:"PINK|ORANGE:LEFT"}, hint:"B has 3 arrows. G has 2. The helix winds through 8 tiles." },
  { number:24, name:"Compass", cells:["A","B","C","D","E"], layout:[[null,"A",null],["B","C","D"],[null,"E",null]], pieces:["RED|ORANGE:DOWN,BLUE:DOWN_LEFT","BLUE|ORANGE:RIGHT","ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","PURPLE|ORANGE:UP"], solution:{A:"RED|ORANGE:DOWN,BLUE:DOWN_LEFT",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|RED:UP,BLUE:LEFT,GREEN:RIGHT,PURPLE:DOWN",D:"GREEN|ORANGE:LEFT",E:"PURPLE|ORANGE:UP"}, hint:"C is a 4-way compass. A adds a diagonal twist." },

  // --- L25-30: Expert levels ---
  { number:25, name:"River", cells:["A","B","C","D","E"], layout:[["A","B","C","D","E"]], pieces:["RED|GREEN:RIGHT","GREEN|RED:LEFT","PURPLE|GREEN:LEFT,BLUE:RIGHT","BLUE|PURPLE:LEFT","ORANGE|BLUE:LEFT"], solution:{A:"RED|GREEN:RIGHT",B:"GREEN|RED:LEFT",C:"PURPLE|GREEN:LEFT,BLUE:RIGHT",D:"BLUE|PURPLE:LEFT",E:"ORANGE|BLUE:LEFT"}, hint:"C splits the river — one stream left, one right." },
  { number:26, name:"Spiral", cells:["A","B","C","D","E"], layout:[["A","B"],["C","D"],["E",null]], pieces:["RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT","BLUE|RED:LEFT","GREEN|RED:UP","PURPLE|GREEN:LEFT","ORANGE|GREEN:UP"], solution:{A:"RED|BLUE:RIGHT,GREEN:DOWN,PURPLE:DOWN_RIGHT",B:"BLUE|RED:LEFT",C:"GREEN|RED:UP",D:"PURPLE|GREEN:LEFT",E:"ORANGE|GREEN:UP"}, hint:"A spirals outward with 3 arrows: right, down, diagonal." },
  { number:27, name:"Nexus", cells:["A","B","C","D","E","F"], layout:[["A","B","C"],["D","E","F"]], pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|BLUE:LEFT","RED|PURPLE:RIGHT","PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT","GREEN|PURPLE:LEFT"], solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",C:"GREEN|BLUE:LEFT",D:"RED|PURPLE:RIGHT",E:"PURPLE|BLUE:UP,RED:LEFT,GREEN:RIGHT",F:"GREEN|PURPLE:LEFT"}, hint:"B and E are twin nexus points — each with 3 outputs!" },
  { number:28, name:"Galaxy", cells:["A","B","C","D","E"], layout:[[null,"A",null],["B","C","D"],[null,"E",null]], pieces:["PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT","BLUE|ORANGE:RIGHT","ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN","GREEN|ORANGE:LEFT","RED|ORANGE:UP"], solution:{A:"PURPLE|ORANGE:DOWN,GREEN:DOWN_RIGHT",B:"BLUE|ORANGE:RIGHT",C:"ORANGE|PURPLE:UP,BLUE:LEFT,GREEN:RIGHT,RED:DOWN",D:"GREEN|ORANGE:LEFT",E:"RED|ORANGE:UP"}, hint:"C is a galaxy core with 4 outputs. A adds a diagonal arm." },
  { number:29, name:"Labyrinth", cells:["A","B","C","D","E","F","G"], layout:[[null,"A",null],["B","C","D"],["E","F","G"]], pieces:["RED|BLUE:DOWN","CYAN|BLUE:RIGHT","BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT","PURPLE|BLUE:LEFT","ORANGE|GREEN:RIGHT","GREEN|ORANGE:LEFT,PINK:RIGHT","PINK|GREEN:LEFT"], solution:{A:"RED|BLUE:DOWN",B:"CYAN|BLUE:RIGHT",C:"BLUE|RED:UP,GREEN:DOWN,PURPLE:RIGHT",D:"PURPLE|BLUE:LEFT",E:"ORANGE|GREEN:RIGHT",F:"GREEN|ORANGE:LEFT,PINK:RIGHT",G:"PINK|GREEN:LEFT"}, hint:"C and F are dual hubs. Navigate 7 tiles through the labyrinth." },
  { number:30, name:"Chromatic Finale", cells:["A","B","C","D","E","F","G","H","I"], layout:[["A","B","C"],["D","E","F"],["G","H","I"]], pieces:["RED|BLUE:RIGHT","BLUE|RED:LEFT,CYAN:RIGHT","CYAN|BLUE:LEFT","RED|ORANGE:RIGHT","ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN","GREEN|ORANGE:LEFT","YELLOW|PURPLE:RIGHT","PURPLE|YELLOW:LEFT,PINK:RIGHT","PINK|PURPLE:LEFT"], solution:{A:"RED|BLUE:RIGHT",B:"BLUE|RED:LEFT,CYAN:RIGHT",C:"CYAN|BLUE:LEFT",D:"RED|ORANGE:RIGHT",E:"ORANGE|BLUE:UP,RED:LEFT,GREEN:RIGHT,PURPLE:DOWN",F:"GREEN|ORANGE:LEFT",G:"YELLOW|PURPLE:RIGHT",H:"PURPLE|YELLOW:LEFT,PINK:RIGHT",I:"PINK|PURPLE:LEFT"}, hint:"The ultimate grid. E has 4 outputs. B and H split signals. 9 tiles!" },
];

// ─── ARROW VISUALS ──────────────────────────────────────────────────────────

const ARROW_SYM = {
  UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→",
  UP_LEFT: "↖", UP_RIGHT: "↗", DOWN_LEFT: "↙", DOWN_RIGHT: "↘",
};
const ARROW_POS = {
  UP:    { top: 2, left: "50%", transform: "translateX(-50%)" },
  DOWN:  { bottom: 2, left: "50%", transform: "translateX(-50%)" },
  LEFT:  { left: 2, top: "50%", transform: "translateY(-50%)" },
  RIGHT: { right: 2, top: "50%", transform: "translateY(-50%)" },
  UP_LEFT: { top: 2, left: 2 }, UP_RIGHT: { top: 2, right: 2 },
  DOWN_LEFT: { bottom: 2, left: 2 }, DOWN_RIGHT: { bottom: 2, right: 2 },
};

// ─── TILE COMPONENT ─────────────────────────────────────────────────────────

function TilePiece({ tileStr, size = 80, onClick, isDragging, isPlaced }) {
  const tile = parseTile(tileStr);
  const outerC = COLORS[tile.outer];
  const innerColors = tile.connections.map(c => COLORS[c.color]);
  const centerGrad = innerColors.length === 1
    ? innerColors[0].bg
    : `conic-gradient(${innerColors.map((c, i) =>
        `${c.bg} ${(i / innerColors.length) * 360}deg ${((i + 1) / innerColors.length) * 360}deg`
      ).join(", ")})`;

  return (
    <div onClick={onClick} style={{
      width: size, height: size, borderRadius: 12, background: outerC.bg,
      boxShadow: isDragging ? `0 0 24px ${outerC.glow}, 0 8px 32px rgba(0,0,0,0.4)` : `0 ${isPlaced?2:4}px ${isPlaced?8:16}px rgba(0,0,0,0.3)`,
      cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      transform: isDragging ? "scale(1.1)" : "scale(1)",
      position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      userSelect: "none", border: "2px solid rgba(255,255,255,0.18)",
    }}>
      <span style={{
        position: "absolute", top: size > 60 ? 4 : 2, left: "50%", transform: "translateX(-50%)",
        fontSize: Math.max(size * 0.1, 7), fontWeight: 700, color: "rgba(255,255,255,0.7)",
        fontFamily: "'JetBrains Mono', monospace", textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        zIndex: 3, whiteSpace: "nowrap",
      }}>{tile.outer}</span>
      <div style={{
        width: size * 0.36, height: size * 0.36, borderRadius: "50%", background: centerGrad,
        border: "2px solid rgba(255,255,255,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 10px rgba(255,255,255,0.15)", zIndex: 2,
      }}>
        {tile.connections.length === 1 ? (
          <span style={{ fontSize: Math.max(size * 0.08, 6), fontWeight: 700, color: "rgba(255,255,255,0.95)", fontFamily: "'JetBrains Mono', monospace", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{tile.connections[0].color.slice(0,3)}</span>
        ) : (
          <span style={{ fontSize: Math.max(size * 0.09, 7), fontWeight: 900, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>{tile.connections.length}</span>
        )}
      </div>
      {tile.connections.map((conn, i) => {
        const c = COLORS[conn.color]; const pos = ARROW_POS[conn.dir]; const sz = size > 60 ? 18 : 14;
        return (
          <div key={i} style={{
            position: "absolute", ...pos, zIndex: 3,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: c.bg, borderRadius: "50%", width: sz, height: sz,
            border: "1.5px solid rgba(255,255,255,0.4)", boxShadow: `0 0 6px ${c.glow}60`,
          }}>
            <span style={{ fontSize: sz > 14 ? 11 : 9, color: "rgba(255,255,255,0.95)", lineHeight: 1, fontWeight: 700 }}>{ARROW_SYM[conn.dir]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── GRID CELL ──────────────────────────────────────────────────────────────

function GridCell({ cellName, size, tile, hasError, onClick, isTarget }) {
  return (
    <div onClick={onClick} style={{
      width: size, height: size, borderRadius: 12,
      background: tile ? "transparent" : "rgba(255,255,255,0.04)",
      border: tile ? "none" : isTarget ? "2px dashed rgba(255,255,255,0.5)" : "2px dashed rgba(255,255,255,0.12)",
      cursor: "pointer", position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.2s ease",
      animation: hasError ? "shake 0.4s ease" : "none",
      boxShadow: hasError ? "0 0 16px rgba(239,68,68,0.4)" : isTarget ? "0 0 12px rgba(255,255,255,0.08)" : "none",
    }}>
      {tile ? <TilePiece tileStr={tile} size={size - 4} isPlaced /> : (
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>{cellName}</span>
      )}
    </div>
  );
}

// ─── CONFETTI ───────────────────────────────────────────────────────────────

function Confetti() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const colors = ["#fbbf24","#f59e0b","#ef4444","#3b82f6","#22c55e","#a855f7","#ec4899","#06b6d4"];
    const particles = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 4, h: Math.random() * 6 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: Math.random() * 3 + 2, vx: (Math.random() - 0.5) * 2,
      rot: Math.random() * 360, vr: (Math.random() - 0.5) * 8,
      opacity: 1,
    }));
    let raf;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y > canvas.height + 20) { p.opacity -= 0.02; }
        if (p.opacity <= 0) continue;
        alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 200 }} />;
}

// ─── VICTORY SCREEN ─────────────────────────────────────────────────────────

function VictoryScreen({ onBack }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f1a 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150,
      opacity: show ? 1 : 0, transition: "opacity 0.8s ease",
    }}>
      <Confetti />
      <div style={{
        textAlign: "center", zIndex: 201,
        transform: show ? "scale(1)" : "scale(0.7)",
        transition: "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        <div style={{
          fontSize: 60, fontWeight: 900, fontFamily: "'Orbitron', sans-serif",
          background: "linear-gradient(135deg, #fbbf24, #f59e0b, #ef4444, #a855f7, #3b82f6, #22c55e)",
          backgroundSize: "300% 300%",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "shimmer 3s linear infinite",
          filter: "drop-shadow(0 4px 20px rgba(251,191,36,0.5))",
          marginBottom: 8,
        }}>CHROMATIC</div>
        <div style={{
          fontSize: 28, fontWeight: 700, fontFamily: "'Orbitron', sans-serif",
          color: "#fbbf24", marginBottom: 8, letterSpacing: "0.2em",
          textShadow: "0 0 30px rgba(251,191,36,0.4)",
        }}>MASTER</div>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
          All 30 levels complete
        </p>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 40, maxWidth: 300, margin: "0 auto 40px" }}>
          Every arrow aligned. Every chain connected. You've mastered the chromatic puzzle.
        </p>
        <button onClick={onBack} style={{
          padding: "14px 36px", borderRadius: 12, border: "none",
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#1a1a2e",
          fontSize: 15, fontWeight: 700, fontFamily: "'Orbitron', sans-serif",
          cursor: "pointer", boxShadow: "0 4px 20px rgba(251,191,36,0.4)",
          letterSpacing: "0.1em",
        }}>RETURN TO LEVELS</button>
      </div>
    </div>
  );
}

// ─── LEVEL FINISH OVERLAY ───────────────────────────────────────────────────

function FinishOverlay({ level, onNext, onReplay, hasNext }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      opacity: show ? 1 : 0, transition: "opacity 0.5s ease",
    }}>
      <div style={{ textAlign: "center", transform: show ? "scale(1)" : "scale(0.8)", transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
        <div style={{
          fontSize: 56, fontWeight: 900, fontFamily: "'Orbitron', sans-serif",
          background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          letterSpacing: "0.1em", marginBottom: 8,
          filter: "drop-shadow(0 4px 12px rgba(251,191,36,0.4))",
        }}>FINISH!</div>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "'JetBrains Mono', monospace", marginBottom: 32 }}>
          Level {level.number} — {level.name}
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button onClick={onReplay} style={{
            padding: "12px 28px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)",
            fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
          }}>Replay</button>
          {hasNext && (
            <button onClick={onNext} style={{
              padding: "12px 28px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#1a1a2e",
              fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer", boxShadow: "0 4px 16px rgba(245,158,11,0.3)",
            }}>Next Level →</button>
          )}
        </div>
      </div>
    </div>
  );
}

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
    setCurrentLevel(idx); setBoard({}); setTray([...LEVELS[idx].pieces]);
    setSelectedTile(null); setSolved(false); setErrors(new Set());
    setShowHint(false); setScreen("game");
  }, []);

  const handleCellClick = (cellName) => {
    if (solved) return;
    if (board[cellName] && !selectedTile) {
      const tile = board[cellName]; const newBoard = { ...board }; delete newBoard[cellName];
      setBoard(newBoard); setTray(prev => [...prev, tile]); setSelectedTile(tile);
      setErrors(getConnectionErrors(level, newBoard)); return;
    }
    if (board[cellName] && selectedTile) {
      const existing = board[cellName]; const newBoard = { ...board, [cellName]: selectedTile };
      setBoard(newBoard); setTray(prev => prev.filter(t => t !== selectedTile).concat(existing));
      setSelectedTile(existing); setErrors(getConnectionErrors(level, newBoard));
      if (checkSolution(level, newBoard)) {
        setSolved(true);
        const next = new Set([...completedLevels, currentLevel]);
        setCompletedLevels(next);
        if (next.size === LEVELS.length) setTimeout(() => setShowVictory(true), 1500);
      }
      return;
    }
    if (selectedTile && !board[cellName]) {
      const newBoard = { ...board, [cellName]: selectedTile };
      setBoard(newBoard); setTray(prev => prev.filter(t => t !== selectedTile));
      setSelectedTile(null); setErrors(getConnectionErrors(level, newBoard));
      if (checkSolution(level, newBoard)) {
        setSolved(true);
        const next = new Set([...completedLevels, currentLevel]);
        setCompletedLevels(next);
        if (next.size === LEVELS.length) setTimeout(() => setShowVictory(true), 1500);
      }
    }
  };

  const handleTrayClick = (tileStr) => {
    if (solved) return;
    setSelectedTile(selectedTile === tileStr ? null : tileStr);
  };

  const handleClear = () => {
    setBoard({}); setTray([...level.pieces]); setSelectedTile(null); setErrors(new Set());
  };

  const cellSize = (() => {
    if (!level) return 80;
    const cols = Math.max(...level.layout.map(r => r.length));
    const rows = level.layout.length;
    if (cols >= 4) return 70;
    if (rows >= 3 && cols >= 3) return 78;
    return 88;
  })();

  const sharedHead = (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 8px rgba(251,191,36,0.2)}50%{box-shadow:0 0 20px rgba(251,191,36,0.5)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *::-webkit-scrollbar{width:6px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
      `}</style>
    </>
  );

  // ─── VICTORY ──────────────────────────────────────────────────────────────

  if (showVictory) {
    return <>{sharedHead}<VictoryScreen onBack={() => { setShowVictory(false); setScreen("menu"); }} /></>;
  }

  // ─── MENU ─────────────────────────────────────────────────────────────────

  if (screen === "menu") {
    const progress = completedLevels.size;
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)",
        display: "flex", flexDirection: "column", alignItems: "center",
        fontFamily: "'JetBrains Mono', monospace", padding: "24px 16px",
      }}>
        {sharedHead}
        <div style={{ animation: "float 4s ease-in-out infinite", marginBottom: 16, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {["RED", "BLUE", "GREEN"].map(c => (
              <div key={c} style={{
                width: 40, height: 40, borderRadius: 10,
                background: `radial-gradient(circle, ${COLORS[c].glow}, ${COLORS[c].bg})`,
                boxShadow: `0 0 20px ${COLORS[c].glow}40`,
              }} />
            ))}
          </div>
        </div>
        <h1 style={{
          fontSize: 36, fontWeight: 900, fontFamily: "'Orbitron', sans-serif",
          background: "linear-gradient(90deg, #60a5fa, #a78bfa, #f472b6, #60a5fa)",
          backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "shimmer 4s linear infinite", marginBottom: 4, textAlign: "center",
        }}>CHROMATIC</h1>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 8, letterSpacing: "0.3em" }}>
          TILE · ARROW · CHAIN
        </p>
        <p style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, marginBottom: 20, maxWidth: 300, textAlign: "center", lineHeight: 1.6 }}>
          Each tile's inner arrow points to a neighbor whose outer color must match.
        </p>

        {progress > 0 && (
          <div style={{
            marginBottom: 16, padding: "6px 16px", borderRadius: 8,
            background: allComplete ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${allComplete ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.06)"}`,
          }}>
            <span style={{ color: allComplete ? "#fbbf24" : "rgba(255,255,255,0.4)", fontSize: 11 }}>
              {allComplete ? "★ ALL COMPLETE ★" : `${progress} / ${LEVELS.length}`}
            </span>
            {allComplete && (
              <button onClick={() => setShowVictory(true)} style={{
                marginLeft: 12, background: "none", border: "none", color: "#fbbf24",
                fontSize: 11, cursor: "pointer", textDecoration: "underline",
              }}>View Victory</button>
            )}
          </div>
        )}

        <div style={{
          width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 6,
          maxHeight: "60vh", overflowY: "auto", padding: "0 4px",
        }}>
          {LEVELS.map((lvl, idx) => {
            const done = completedLevels.has(idx);
            const maxOut = Math.max(...lvl.pieces.map(p => p.split("|")[1].split(",").length));
            const hasDiag = lvl.pieces.some(p => /_LEFT|_RIGHT/.test(p.split("|")[1]));
            const tags = [];
            if (maxOut >= 4) tags.push("4×out");
            else if (maxOut >= 3) tags.push("3×out");
            else if (maxOut >= 2) tags.push("multi");
            if (hasDiag) tags.push("diag");
            return (
              <button key={idx} onClick={() => initLevel(idx)} style={{
                padding: "11px 16px", borderRadius: 10,
                border: `1px solid ${done ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                background: done ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.02)",
                color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 0.15s", textAlign: "left",
                animation: `fadeIn 0.3s ease ${idx * 0.03}s both`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = done ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.02)"; }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, minWidth: 22 }}>
                    {String(lvl.number).padStart(2, "0")}
                  </span>
                  <span>{lvl.name}</span>
                  {tags.length > 0 && (
                    <span style={{ fontSize: 9, color: "rgba(168,85,247,0.5)", whiteSpace: "nowrap" }}>
                      {tags.join(" · ")}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: done ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.2)", minWidth: 20, textAlign: "right" }}>
                  {done ? "✓" : `${lvl.cells.length}t`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── GAME ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'JetBrains Mono', monospace", padding: "16px 12px",
    }}>
      {sharedHead}
      <div style={{ width: "100%", maxWidth: 520, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => setScreen("menu")} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, padding: "7px 12px", color: "rgba(255,255,255,0.6)",
          fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
        }}>← Levels</button>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.2em", display: "block" }}>
            LEVEL {level.number}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Orbitron', sans-serif", color: "rgba(255,255,255,0.9)" }}>
            {level.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => setShowHint(!showHint)} style={{
            background: showHint ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px",
            color: showHint ? "#fbbf24" : "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer",
          }}>?</button>
          <button onClick={handleClear} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "7px 10px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer",
          }}>↺</button>
        </div>
      </div>

      {showHint && (
        <div style={{
          maxWidth: 520, width: "100%", marginBottom: 12, padding: "9px 14px", borderRadius: 10,
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
          color: "#fbbf24", fontSize: 12, lineHeight: 1.5,
        }}>{level.hint}</div>
      )}

      <div style={{
        maxWidth: 520, width: "100%", marginBottom: 14, padding: "6px 12px", borderRadius: 8,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.3)", fontSize: 10, textAlign: "center",
      }}>
        Inner arrow → neighbor's outer color must match
      </div>

      <div style={{ marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {level.layout.map((row, r) => (
          <div key={r} style={{ display: "flex", gap: 6, marginBottom: r < level.layout.length - 1 ? 6 : 0 }}>
            {row.map((cell, c) => {
              if (!cell) return <div key={c} style={{ width: cellSize, height: cellSize }} />;
              const hasErr = [...errors].some(e => e.startsWith(cell + ":"));
              return (
                <GridCell key={c} cellName={cell} size={cellSize} tile={board[cell] || null}
                  hasError={hasErr} isTarget={!!selectedTile && !board[cell]}
                  onClick={() => handleCellClick(cell)} />
              );
            })}
          </div>
        ))}
      </div>

      {selectedTile && (
        <div style={{
          marginBottom: 10, display: "flex", alignItems: "center", gap: 10,
          padding: "7px 14px", borderRadius: 10,
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
        }}>
          <span style={{ color: "#fbbf24", fontSize: 11 }}>Selected:</span>
          <TilePiece tileStr={selectedTile} size={40} />
          <button onClick={() => setSelectedTile(null)} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.4)",
            fontSize: 15, cursor: "pointer", padding: "2px 5px",
          }}>✕</button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <span style={{ display: "block", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 10, letterSpacing: "0.2em", marginBottom: 8 }}>PIECES</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 520 }}>
          {tray.map((tile, idx) => (
            <div key={idx} style={{
              borderRadius: 12, padding: 2, transition: "all 0.2s",
              border: selectedTile === tile ? "2px solid #fbbf24" : "2px solid transparent",
              animation: selectedTile === tile ? "pulseGlow 1.5s ease infinite" : "none",
            }}>
              <TilePiece tileStr={tile} size={62} onClick={() => handleTrayClick(tile)} isDragging={selectedTile === tile} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
        {Object.keys(board).length} / {level.cells.length} placed
      </div>

      {solved && (
        <FinishOverlay level={level} hasNext={currentLevel < LEVELS.length - 1}
          onNext={() => initLevel(currentLevel + 1)} onReplay={() => initLevel(currentLevel)} />
      )}
    </div>
  );
}
