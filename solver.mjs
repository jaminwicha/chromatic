// Chromatic Puzzle Solver with Pipe Support
import { readFileSync } from 'fs';

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
};

function parseTile(str) {
  if (str.startsWith("IN:")) {
    return { type: "INPUT_ONLY", acceptColors: str.slice(3).split(","), outer: null, connections: [], inPorts: [], id: str };
  }
  if (str.startsWith("OUT:")) {
    const rest = str.slice(4);
    const [center, innerPart] = rest.split("|");
    const connections = innerPart.split(",").map(p => {
      const parts = p.split(":");
      return { color: parts[0], dir: parts[1], distance: parts[2] ? parseInt(parts[2]) : 1 };
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
    return { color: parts[0], dir: parts[1], distance: parts[2] ? parseInt(parts[2]) : 1 };
  });
  return { type: "NORMAL", outer, connections, inPorts: [], id: str };
}

function getNeighborAtDist(layout, row, col, dir, dist) {
  const { dr, dc } = DIRS[dir];
  const nr = row + dr * dist, nc = col + dc * dist;
  if (nr >= 0 && nr < layout.length && nc >= 0 && nc < layout[0].length && layout[nr][nc])
    return { cell: layout[nr][nc], row: nr, col: nc };
  return null;
}

function findCellPos(layout, cellName) {
  for (let r = 0; r < layout.length; r++)
    for (let c = 0; c < layout[r].length; c++)
      if (layout[r][c] === cellName) return { row: r, col: c };
  return null;
}

function validateBoard(level, board) {
  // Check all cells are filled
  for (const cell of level.cells) {
    if (!board[cell]) return { valid: false, error: `Cell ${cell} is empty` };
  }
  
  // Check all connections
  for (let r = 0; r < level.layout.length; r++) {
    for (let c = 0; c < level.layout[r].length; c++) {
      const cellName = level.layout[r][c];
      if (!cellName || !board[cellName]) continue;
      
      const tile = parseTile(board[cellName]);
      
      // Check each outgoing connection
      for (const conn of tile.connections) {
        const dist = conn.distance || 1;
        const neighbor = getNeighborAtDist(level.layout, r, c, conn.dir, dist);
        
        if (!neighbor) {
          return { valid: false, error: `${cellName} arrow ${conn.dir} points to nothing` };
        }
        
        if (!board[neighbor.cell]) {
          return { valid: false, error: `${cellName} arrow ${conn.dir} points to empty cell ${neighbor.cell}` };
        }
        
        const nTile = parseTile(board[neighbor.cell]);
        
        // Validate connection based on neighbor type
        if (nTile.type === "NORMAL") {
          if (conn.color !== nTile.outer) {
            return { valid: false, error: `${cellName} sends ${conn.color} to ${neighbor.cell} but it expects ${nTile.outer}` };
          }
        } else if (nTile.type === "INPUT_ONLY") {
          if (!nTile.acceptColors.includes(conn.color)) {
            return { valid: false, error: `${cellName} sends ${conn.color} to sink ${neighbor.cell} but it only accepts ${nTile.acceptColors.join(",")}` };
          }
        } else if (nTile.type === "OUTPUT_ONLY") {
          return { valid: false, error: `${cellName} arrow points to source ${neighbor.cell} (sources can't receive)` };
        } else if (nTile.type === "PIPE") {
          const oppDir = OPPOSITE[conn.dir];
          const matchingPort = nTile.inPorts?.find(p => p.dir === oppDir && p.color === conn.color);
          if (!matchingPort) {
            return { valid: false, error: `${cellName} sends ${conn.color} ${conn.dir} to pipe ${neighbor.cell} but pipe has no matching input port` };
          }
        }
      }
    }
  }
  
  return { valid: true };
}

// Extract levels from the JSX file
function extractLevels() {
  const content = readFileSync('./app/ChromaticPuzzle.jsx', 'utf-8');
  const levelsMatch = content.match(/const LEVELS = \[([\s\S]*?)\];/);
  if (!levelsMatch) throw new Error("Could not find LEVELS array");
  
  const levelsStr = '[' + levelsMatch[1] + ']';
  // Use eval carefully - only on our own code
  const levels = eval(levelsStr);
  return levels;
}

// Test all levels
function testAllLevels() {
  const levels = extractLevels();
  let passed = 0;
  let failed = 0;
  
  console.log(`Testing ${levels.length} levels...\n`);
  
  for (const level of levels) {
    const result = validateBoard(level, level.solution);
    if (result.valid) {
      passed++;
      console.log(`✓ Level ${level.number}: ${level.name}`);
    } else {
      failed++;
      console.log(`✗ Level ${level.number}: ${level.name}`);
      console.log(`  Error: ${result.error}`);
    }
  }
  
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Negative tests - things that should NOT work
function negativeTests() {
  console.log("\n=== Running Negative Tests ===\n");
  
  const tests = [
    {
      name: "Wrong color to normal tile",
      level: {
        cells: ["A", "B"],
        layout: [["A", "B"]],
        pieces: ["RED|BLUE:RIGHT", "GREEN|RED:LEFT"],
      },
      board: { A: "RED|BLUE:RIGHT", B: "GREEN|RED:LEFT" },
      shouldFail: true
    },
    {
      name: "Arrow to source (should fail)",
      level: {
        cells: ["A", "B"],
        layout: [["A", "B"]],
        pieces: ["RED|BLUE:RIGHT", "OUT:RED|RED:LEFT"],
      },
      board: { A: "RED|BLUE:RIGHT", B: "OUT:RED|RED:LEFT" },
      shouldFail: true
    },
    {
      name: "Wrong color to sink",
      level: {
        cells: ["A", "B"],
        layout: [["A", "B"]],
        pieces: ["RED|BLUE:RIGHT", "IN:RED"],
      },
      board: { A: "RED|BLUE:RIGHT", B: "IN:RED" },
      shouldFail: true
    },
    {
      name: "Pipe wrong input color",
      level: {
        cells: ["A", "B", "C"],
        layout: [["A", "B", "C"]],
        pieces: ["RED|BLUE:RIGHT", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN"],
      },
      board: { A: "RED|BLUE:RIGHT", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN" },
      shouldFail: true
    },
    {
      name: "Correct pipe usage (should pass)",
      level: {
        cells: ["A", "B", "C"],
        layout: [["A", "B", "C"]],
        pieces: ["RED|RED:RIGHT", "PIPE:LEFT:RED>RIGHT:GREEN", "IN:GREEN"],
      },
      board: { A: "RED|RED:RIGHT", B: "PIPE:LEFT:RED>RIGHT:GREEN", C: "IN:GREEN" },
      shouldFail: false
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = validateBoard(test.level, test.board);
    const testPassed = test.shouldFail ? !result.valid : result.valid;
    
    if (testPassed) {
      passed++;
      console.log(`✓ ${test.name}`);
      if (test.shouldFail && !result.valid) {
        console.log(`  Correctly rejected: ${result.error}`);
      }
    } else {
      failed++;
      console.log(`✗ ${test.name}`);
      if (test.shouldFail) {
        console.log(`  Should have failed but passed!`);
      } else {
        console.log(`  Should have passed but failed: ${result.error}`);
      }
    }
  }
  
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Run all tests
const allLevelsPass = testAllLevels();
const negativeTestsPass = negativeTests();

if (allLevelsPass && negativeTestsPass) {
  console.log("\n✓ All tests passed!");
  process.exit(0);
} else {
  console.log("\n✗ Some tests failed!");
  process.exit(1);
}
