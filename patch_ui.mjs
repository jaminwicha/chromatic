import fs from 'fs';

let content = fs.readFileSync('app/ChromaticPuzzle.jsx', 'utf8');

// 1. Add currentShelf and containerRef state
const statePattern = /const \[currentLevel, setCurrentLevel\] = useState\(0\);/;
if (content.match(statePattern)) {
  content = content.replace(statePattern, \`const [currentLevel, setCurrentLevel] = useState(0);\\n  const [currentShelf, setCurrentShelf] = useState(0);\\n  const containerRef = useRef(null);\`);
}

// 2. Add currentShelf reset to initLevel
const initLevelPattern = /setCurrentLevel\\(levelIdx\\);\\n    setBoard\\(\\{\\}\\);/;
if (content.match(initLevelPattern)) {
  content = content.replace(initLevelPattern, \`setCurrentLevel(levelIdx);\\n    setBoard({});\\n    setCurrentShelf(Math.floor((getLayout3D(LEVELS[levelIdx].layout).length) / 2));\`);
}

// 3. Add ConnectionBeams component before // ─── GAME
const beamsComponent = \`
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
            
            const sourceEl = document.getElementById(\\\`cell-\${cellName}\\\`);
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

              const targetEl = document.getElementById(\\\`cell-\${neighbor.cell}\\\`);
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
                id: \\\`\${cellName}-\${neighbor.cell}-\${conn.dir}\\\`,
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
            <linearGradient key={\\\`grad-\${b.id}\\\`} id={\\\`grad-\${b.id}\\\`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={b.color1} />
              <stop offset="100%" stopColor={b.color2} />
            </linearGradient>
          ))}
          <filter id="crackle">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        {beams.map(b => {
          const cx = (b.x1 + b.x2) / 2 + (Math.random() * 40 - 20);
          const cy = (b.y1 + b.y2) / 2 + (Math.random() * 40 - 20);
          const path = \\\`M \${b.x1} \${b.y1} Q \${cx} \${cy} \${b.x2} \${b.y2}\\\`;
          
          return (
            <g key={b.id}>
              <path d={path} fill="none" stroke={\\\`url(#grad-\${b.id})\\\`} strokeWidth="4" filter="url(#crackle)" opacity="0.6" style={{ animation: "dash 1.5s linear infinite" }} />
              <path d={path} fill="none" stroke={\\\`url(#grad-\${b.id})\\\`} strokeWidth="2" opacity="0.9" strokeDasharray="10 5" style={{ animation: "dash 0.8s linear infinite" }} />
            </g>
          );
        })}
      </svg>
    );
  }

  // ─── GAME ─────────────────────────────────────────────────────────────────\`;

content = content.replace('// ─── GAME ─────────────────────────────────────────────────────────────────', beamsComponent);

// 4. Replace the layout render block
const layoutRenderStart = '<div style={{ marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>';
const layoutRenderEnd = '      {selectedTile && (<div style={{ marginBottom: 10, display: "flex",';

const newLayoutRender = \`
      {(() => {
        const l3d = getLayout3D(level.layout);
        const numShelves = l3d.length;
        if (numShelves === 1) {
          return (
            <div ref={containerRef} style={{ position: "relative", marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <ConnectionBeams board={board} level={level} containerRef={containerRef} />
              {l3d[0].map((row, r) => (<div key={r} style={{ display: "flex", gap: 6, marginBottom: r < l3d[0].length - 1 ? 6 : 0 }}>
                {row.map((cellName, c) => {
                  if (!cellName) return <div key={c} style={{ width: cellSize, height: cellSize }} />;
                  const isErr = Array.from(errors).some(e => e.startsWith(\\\`\${cellName}:\\\`));
                  return <GridCell key={c} cellName={cellName} size={cellSize} tile={board[cellName]} hasError={isErr} onClick={() => handleCellClick(cellName)} isTarget={!solved && selectedTile && !board[cellName]} currentChapter={currentChapter} flashColor={flashes[cellName]} />;
                })}
              </div>))}
            </div>
          );
        }

        const maxRows = Math.max(...l3d.map(layer => layer.length));
        const maxCols = Math.max(...l3d.map(layer => layer[0].length));
        const shelfGap = 6;
        const offsetAmount = cellSize * 0.7; // 70% diagonal spread
        
        const baseWidth = maxCols * cellSize + (maxCols - 1) * shelfGap;
        const baseHeight = maxRows * cellSize + (maxRows - 1) * shelfGap;
        
        const maxDelta = Math.max(currentShelf, numShelves - 1 - currentShelf);
        const totalWidth = baseWidth + maxDelta * offsetAmount * 2;
        const totalHeight = baseHeight + maxDelta * offsetAmount * 2;

        return (
          <div ref={containerRef} style={{ position: "relative", marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <ConnectionBeams board={board} level={level} containerRef={containerRef} />
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {l3d.map((_, z) => (
                <button key={z} onClick={() => setCurrentShelf(z)} style={{ padding: "4px 12px", borderRadius: 8, border: z === currentShelf ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.2)", background: z === currentShelf ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)", color: z === currentShelf ? "#fbbf24" : "white", cursor: "pointer", transition: "all 0.2s" }}>
                  Shelf {z + 1}
                </button>
              ))}
            </div>
            
            <div style={{ position: "relative", width: totalWidth, height: totalHeight }}>
              {l3d.map((layer, z) => {
                const zDelta = z - currentShelf;
                const offsetX = zDelta * offsetAmount;
                const offsetY = -zDelta * offsetAmount;
                
                const isFocused = z === currentShelf;
                
                return (
                  <div key={z} style={{ 
                    position: "absolute", 
                    left: "50%", top: "50%",
                    transform: \`translate(calc(-50% + \${offsetX}px), calc(-50% + \${offsetY}px))\`,
                    zIndex: isFocused ? 20 : 10 + z,
                    opacity: isFocused ? 1 : 0.25,
                    pointerEvents: isFocused ? "auto" : "none",
                    transition: "all 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
                    filter: isFocused ? "none" : "blur(2px) grayscale(50%)"
                  }}>
                    {layer.map((row, r) => (
                      <div key={r} style={{ display: "flex", gap: shelfGap, marginBottom: r < layer.length - 1 ? shelfGap : 0 }}>
                        {row.map((cellName, c) => {
                          if (!cellName) return <div key={c} style={{ width: cellSize, height: cellSize }} />;
                          const isErr = Array.from(errors).some(e => e.startsWith(\\\`\${cellName}:\\\`));
                          return <GridCell key={c} cellName={cellName} size={cellSize} tile={board[cellName]} hasError={isErr} onClick={() => handleCellClick(cellName)} isTarget={!solved && selectedTile && !board[cellName]} currentChapter={currentChapter} flashColor={flashes[cellName]} />;
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
\`;

let parts = content.split(layoutRenderStart);
if (parts.length === 2) {
  let endParts = parts[1].split(layoutRenderEnd);
  if (endParts.length === 2) {
    content = parts[0] + newLayoutRender + layoutRenderEnd + endParts[1];
  } else {
    console.log("Failed to find layoutRenderEnd");
  }
} else {
  console.log("Failed to find layoutRenderStart");
}

// 5. Add GridCell id
content = content.replace('function GridCell({ cellName, size, tile, hasError, onClick, isTarget, currentChapter, flashColor }) {\\n  return (<div onClick={onClick} style={{', 'function GridCell({ cellName, size, tile, hasError, onClick, isTarget, currentChapter, flashColor }) {\\n  return (<div id={\`cell-\${cellName}\`} onClick={onClick} style={{');

// 6. Add animation keyframes
content = content.replace('@keyframes glintSweep{0%{transform:translateX(-100%) skewX(-15deg)}100%{transform:translateX(200%) skewX(-15deg)}}', '@keyframes glintSweep{0%{transform:translateX(-100%) skewX(-15deg)}100%{transform:translateX(200%) skewX(-15deg)}}\\n      @keyframes dash{0%{stroke-dashoffset:150}100%{stroke-dashoffset:0}}');

fs.writeFileSync('app/ChromaticPuzzle.jsx', content);
console.log("Patched UI with everything!");
