import fs from 'fs';

let content = fs.readFileSync('app/ChromaticPuzzle.jsx', 'utf8');

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

            // Determine target color based on connection match
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
\`;

if (!content.includes('function ConnectionBeams')) {
  content = content.replace('// ─── GAME ─────────────────────────────────────────────────────────────────', beamsComponent + '\\n// ─── GAME ─────────────────────────────────────────────────────────────────');
}

// 4. Update the render container to include the containerRef and <ConnectionBeams />
const renderSearch = '<div style={{ marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center" }}>';
if (content.includes(renderSearch)) {
  const replacement = '<div ref={containerRef} style={{ position: "relative", marginBottom: 20, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center" }}>\\n            <ConnectionBeams board={board} level={level} containerRef={containerRef} />';
  content = content.replace(renderSearch, replacement);
}

// 5. Add containerRef state
const stateSearch = 'const [currentShelf, setCurrentShelf] = useState(0);';
if (content.includes(stateSearch) && !content.includes('const containerRef = useRef(null);')) {
  content = content.replace(stateSearch, stateSearch + '\\n  const containerRef = useRef(null);');
}

fs.writeFileSync('app/ChromaticPuzzle.jsx', content);
console.log("Patched ConnectionBeams UI!");
