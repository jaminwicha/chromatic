import fs from 'fs';

let content = fs.readFileSync('app/ChromaticPuzzle.jsx', 'utf8');

const newChapters = `  { name: "Fundamentals", range: [1, 9], color: "#3b82f6", bg: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)", glow: "rgba(59,130,246,0.15)" },
  { name: "Multi-Output", range: [10, 18], color: "#a855f7", bg: "radial-gradient(circle at top right,#2e1065 0%,#0f0a1c 100%)", glow: "rgba(168,85,247,0.15)" },
  { name: "Complex Layouts", range: [19, 30], color: "#22c55e", bg: "linear-gradient(180deg,#064e3b 0%,#022c22 100%)", glow: "rgba(34,197,94,0.15)" },
  { name: "Sources & Sinks", range: [31, 38], color: "#f59e0b", bg: "radial-gradient(ellipse at center,#451a03 0%,#1c1917 100%)", glow: "rgba(245,158,11,0.15)" },
  { name: "Jumper Arrows", range: [39, 46], color: "#ef4444", bg: "linear-gradient(to right bottom,#450a0a 0%,#1a0505 100%)", glow: "rgba(239,68,68,0.15)" },
  { name: "Gaps", range: [47, 54], color: "#14b8a6", bg: "radial-gradient(circle at 50% 50%,#042f2e 0%,#020617 100%)", glow: "rgba(20,184,166,0.15)" },
  { name: "Advanced Combos", range: [55, 62], color: "#06b6d4", bg: "linear-gradient(135deg,#164e63 0%,#082f49 100%)", glow: "rgba(6,182,212,0.15)" },
  { name: "Expert", range: [63, 68], color: "#ec4899", bg: "radial-gradient(circle at top left,#500724 0%,#171717 100%)", glow: "rgba(236,72,153,0.15)" },
  { name: "Pipes", range: [69, 78], color: "#f97316", bg: "linear-gradient(to bottom right,#7c2d12 0%,#1c1917 100%)", glow: "rgba(249,115,22,0.15)" },
  { name: "Master I", range: [79, 88], color: "#eab308", bg: "radial-gradient(circle at center,#713f12 0%,#020617 100%)", glow: "rgba(234,179,8,0.15)" },
  { name: "Master II", range: [89, 98], color: "#f43f5e", bg: "linear-gradient(135deg,#881337 0%,#171717 100%)", glow: "rgba(244,63,94,0.15)" },
  { name: "Master III", range: [99, 108], color: "#6366f1", bg: "radial-gradient(ellipse at top,#312e81 0%,#0f172a 100%)", glow: "rgba(99,102,241,0.15)" },
  { name: "Control Flow", range: [109, 114], color: "#8b5cf6", bg: "linear-gradient(135deg,#4c1d95 0%,#171717 100%)", glow: "rgba(139,92,246,0.15)" },
  { name: "Multi-Shelf", range: [115, 120], color: "#10b981", bg: "radial-gradient(circle at bottom,#064e3b 0%,#020617 100%)", glow: "rgba(16,185,129,0.15)" },
  { name: "Ascension", range: [121, 125], color: "#fbbf24", bg: "radial-gradient(circle at top,#78350f 20%,#0f172a 100%)", glow: "rgba(251,191,36,0.15)" },
  { name: "Master IV", range: [126, 130], color: "#a855f7", bg: "radial-gradient(circle at top right,#2e1065 0%,#0f0a1c 100%)", glow: "rgba(168,85,247,0.15)" },
  { name: "Master V", range: [131, 135], color: "#14b8a6", bg: "radial-gradient(circle at 50% 50%,#042f2e 0%,#020617 100%)", glow: "rgba(20,184,166,0.15)" },
  { name: "Master VI", range: [136, 140], color: "#ec4899", bg: "radial-gradient(circle at top left,#500724 0%,#171717 100%)", glow: "rgba(236,72,153,0.15)" }`;

const chapterStart = content.indexOf('const CHAPTERS = [');
if (chapterStart !== -1) {
  content = content.slice(0, chapterStart) + `const CHAPTERS = [\n${newChapters}\n];\n`;
  fs.writeFileSync('app/ChromaticPuzzle.jsx', content);
  console.log("Fixed chapters array and EOF");
}
