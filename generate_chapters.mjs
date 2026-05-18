import fs from 'fs';

let content = fs.readFileSync('app/ChromaticPuzzle.jsx', 'utf8');

const chaptersReplacement = `
  { name: "Master IV", range: [126, 128], color: "#a855f7", bg: "radial-gradient(circle at top right,#2e1065 0%,#0f0a1c 100%)", glow: "rgba(168,85,247,0.15)" },
  { name: "Master V", range: [129, 131], color: "#14b8a6", bg: "radial-gradient(circle at 50% 50%,#042f2e 0%,#020617 100%)", glow: "rgba(20,184,166,0.15)" },
  { name: "Master VI", range: [132, 134], color: "#ec4899", bg: "radial-gradient(circle at top left,#500724 0%,#171717 100%)", glow: "rgba(236,72,153,0.15)" },
`;

// Insert the new chapters
content = content.replace(
  /{ name: "Ascension", range: \[121, 125\], color: "#fbbf24", bg: "radial-gradient\(circle at top,#78350f 20%,#0f172a 100%\)", glow: "rgba\(251,191,36,0\.15\)" },/,
  `{ name: "Ascension", range: [121, 125], color: "#fbbf24", bg: "radial-gradient(circle at top,#78350f 20%,#0f172a 100%)", glow: "rgba(251,191,36,0.15)" },${chaptersReplacement}`
);

fs.writeFileSync('app/ChromaticPuzzle.jsx', content);
