import { writeFileSync } from 'node:fs';

const levels = [];
let id = 126;

// MASTER IV: Triggers (12-18 pieces)
levels.push({
  number: id++, name: "Trigger Cascade",
  cells: ["A","B","C","D","E","F","G","H","I","J","K","L"],
  layout: [
    [["A","B","C","D"]],
    [["E","F","G","H"]],
    [["I","J","K","L"]]
  ],
  pieces: [
    "OUT:RED|RED:RIGHT,BLUE:DOWN", "TRIGGER:RED:C|GREEN:RIGHT", "IN:GREEN", "TRIGGER:GREEN:G",
    "BLUE|PINK:RIGHT,YELLOW:DOWN", "PINK|CYAN:RIGHT", "TRIGGER:CYAN:K|ORANGE:RIGHT", "IN:ORANGE",
    "YELLOW|PURPLE:RIGHT", "TRIGGER:PURPLE:H", "TRIGGER:ORANGE:D", "IN:PURPLE"
  ],
  solution: {
    A: "OUT:RED|RED:RIGHT,BLUE:DOWN", B: "TRIGGER:RED:C|GREEN:RIGHT", C: "IN:GREEN", D: "TRIGGER:GREEN:G",
    E: "BLUE|PINK:RIGHT,YELLOW:DOWN", F: "PINK|CYAN:RIGHT", G: "TRIGGER:CYAN:K|ORANGE:RIGHT", H: "IN:ORANGE",
    I: "YELLOW|PURPLE:RIGHT", J: "TRIGGER:PURPLE:H", K: "TRIGGER:ORANGE:D", L: "IN:PURPLE"
  },
  hint: "Triggers unlock the path forward."
});

// Write to a temporary JSON file to test with solver
writeFileSync('test_levels.json', JSON.stringify(levels, null, 2));
console.log("Wrote test_levels.json");
