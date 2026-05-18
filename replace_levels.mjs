import fs from 'fs';

let content = fs.readFileSync('app/ChromaticPuzzle.jsx', 'utf8');
const newLevels = JSON.parse(fs.readFileSync('new_32_complex_levels.json', 'utf8'));

let levelsStr = '';
for (const l of newLevels) {
  let layoutStr = JSON.stringify(l.layout).replace(/"/g, '"');
  levelsStr += `  { number: ${l.number}, name: "${l.name}", cells: ${JSON.stringify(l.cells)}, layout: ${layoutStr}, pieces: ${JSON.stringify(l.pieces)}, solution: ${JSON.stringify(l.solution)}, hint: "${l.hint}" },\n`;
}

// Find where level 109 starts
const match = content.indexOf('  { number: 109, name:');
if (match !== -1) {
  const startIdx = match;
  // Find where LEVELS array ends
  const endIdx = content.indexOf('];\n\n// ─── ARROW VISUALS');
  if (endIdx !== -1) {
    content = content.slice(0, startIdx) + levelsStr + content.slice(endIdx);
    fs.writeFileSync('app/ChromaticPuzzle.jsx', content);
    console.log("Replaced levels 109-140 successfully.");
  } else {
    console.log("Could not find end of LEVELS array.");
  }
} else {
  console.log("Could not find level 109.");
}
