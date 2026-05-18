const fs=require('fs');
let jsx=fs.readFileSync('./app/ChromaticPuzzle.jsx','utf-8');

// Insane II: 6 levels with conduits (L240-245)
// Insane III: 6 levels with shelf jumpers (L246-251)
const newLevels = [
// === INSANE II (conduits) ===
// L240: 6 cells, conduit
`{ number:240, name:"Venom Circuit", cells:["A","B","C","D","E","F"], layout:[[["A",null,"B"],["C","D",null],[null,"E","F"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}},{from:{cell:"D",dir:"RIGHT"},to:{cell:"F",dir:"UP"}}], pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:DOWN","GREEN|ORANGE:RIGHT","ORANGE|CYAN:RIGHT","PURPLE|CYAN:DOWN","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:DOWN",C:"GREEN|ORANGE:RIGHT",D:"ORANGE|CYAN:RIGHT",F:"PURPLE|CYAN:DOWN",E:"IN:CYAN"}, hint:"Two conduits route signals around gaps!" }`,
// L241
`{ number:241, name:"Acid Rain", cells:["A","B","C","D","E","F","G"], layout:[[["A","B","C",null],["D",null,null,null],[null,"E",null,"F"],[null,null,null,"G"]]], conduits:[{from:{cell:"A",dir:"DOWN"},to:{cell:"E",dir:"UP"}},{from:{cell:"C",dir:"RIGHT"},to:{cell:"F",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:RIGHT","PURPLE|ORANGE:RIGHT","GREEN|CYAN:DOWN","CYAN|PINK:RIGHT:2","ORANGE|RED:DOWN","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:RIGHT",C:"PURPLE|ORANGE:RIGHT",D:"GREEN|CYAN:DOWN",E:"CYAN|PINK:RIGHT:2",F:"ORANGE|RED:DOWN",G:"IN:RED"}, hint:"Conduits reroute multi-output!" }`,
// L242
`{ number:242, name:"Toxic Maze", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B",null,"C"],["D",null,null,null],["E",null,null,"F"],["G","H",null,null]]], conduits:[{from:{cell:"B",dir:"RIGHT"},to:{cell:"C",dir:"LEFT"}},{from:{cell:"E",dir:"RIGHT"},to:{cell:"F",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:RIGHT","GREEN|PURPLE:DOWN:2","PURPLE|ORANGE:RIGHT","OUT:RED|ORANGE:DOWN","ORANGE|CYAN:LEFT","CYAN|PINK:DOWN","IN:PINK"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:RIGHT",C:"GREEN|PURPLE:DOWN:2",F:"PURPLE|ORANGE:RIGHT",D:"OUT:RED|ORANGE:DOWN",E:"ORANGE|CYAN:LEFT",G:"CYAN|PINK:DOWN",H:"IN:PINK"}, hint:"Two conduits cross the maze!" }`,
// L243
`{ number:243, name:"Dark Pulse", cells:["A","B","C","D","E","F"], layout:[[["A",null,"B"],["C","D","E"],[null,null,"F"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}}], pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:DOWN","GREEN|ORANGE:RIGHT","ORANGE|PURPLE:RIGHT","PURPLE|CYAN:DOWN","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:DOWN",C:"GREEN|ORANGE:RIGHT",D:"ORANGE|PURPLE:RIGHT",E:"PURPLE|CYAN:DOWN",F:"IN:CYAN"}, hint:"One conduit, two paths merge!" }`,
// L244
`{ number:244, name:"Nerve Gas", cells:["A","B","C","D","E","F","G"], layout:[[["A","B"],["C",null],["D",null],["E","F"],[null,"G"]]], conduits:[{from:{cell:"C",dir:"RIGHT"},to:{cell:"F",dir:"UP"}}], pieces:["OUT:RED|BLUE:RIGHT","BLUE|GREEN:DOWN","GREEN|PURPLE:RIGHT","PURPLE|ORANGE:DOWN","ORANGE|CYAN:RIGHT","CYAN|PINK:DOWN","IN:PINK"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"BLUE|GREEN:DOWN",C:"GREEN|PURPLE:RIGHT",D:"PURPLE|ORANGE:DOWN",E:"ORANGE|CYAN:RIGHT",F:"CYAN|PINK:DOWN",G:"IN:PINK"}, hint:"The conduit shortcuts a long path!" }`,
// L245
`{ number:245, name:"Plague Vector", cells:["A","B","C","D","E","F","G","H"], layout:[[["A",null,"B","C"],["D","E",null,null],[null,"F",null,"G"],[null,null,null,"H"]]], conduits:[{from:{cell:"A",dir:"RIGHT"},to:{cell:"B",dir:"LEFT"}},{from:{cell:"E",dir:"RIGHT"},to:{cell:"G",dir:"UP"}}], pieces:["OUT:RED|BLUE:RIGHT,GREEN:DOWN","BLUE|PURPLE:RIGHT","PURPLE|ORANGE:DOWN:2","GREEN|CYAN:RIGHT","CYAN|PINK:RIGHT","ORANGE|RED:DOWN","PINK|RED:RIGHT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT,GREEN:DOWN",B:"BLUE|PURPLE:RIGHT",C:"PURPLE|ORANGE:DOWN:2",D:"GREEN|CYAN:RIGHT",E:"CYAN|PINK:RIGHT",G:"ORANGE|RED:DOWN",H:"IN:RED",F:"PINK|RED:RIGHT"}, hint:"Complex conduit routing!" }`,

// === INSANE III (shelf jumpers) ===
// L246
`{ number:246, name:"Gravity Well", cells:["A","B","C","D","E","F"], layout:[[["A","B"]],[["C","D"]],[[null,"E"]],[["F",null]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP","STAIRS:DOWN:ORANGE|CYAN:SHELF_DOWN:2","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:2",E:"GREEN|PURPLE:LEFT",D:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP",F:"STAIRS:DOWN:ORANGE|CYAN:SHELF_DOWN:2",C:"IN:CYAN"}, hint:"Jump up two, climb one, drop two!" }`,
// L247
`{ number:247, name:"Event Horizon", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:3","STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN","STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN","ORANGE|CYAN:RIGHT","STAIRS:UP:CYAN|PINK:SHELF_UP:2","PINK|RED:LEFT","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:3",H:"STAIRS:DOWN:GREEN|PURPLE:SHELF_DOWN",F:"STAIRS:DOWN:PURPLE|ORANGE:SHELF_DOWN",E:"ORANGE|CYAN:RIGHT",C:"STAIRS:UP:CYAN|PINK:SHELF_UP:2",D:"PINK|RED:LEFT",G:"IN:RED"}, hint:"Zigzag through four shelves!" }`,
// L248
`{ number:248, name:"Wormhole", cells:["A","B","C","D","E","F"], layout:[[["A","B"]],[[null,null]],[["C","D"]],[[null,null]],[["E","F"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:RIGHT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2","ORANGE|CYAN:LEFT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:2",D:"GREEN|PURPLE:RIGHT",C:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2",F:"ORANGE|CYAN:LEFT",E:"IN:CYAN"}, hint:"Jump two shelves twice!" }`,
// L249
`{ number:249, name:"Dark Energy", cells:["A","B","C","D","E","F","G","H"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2","STAIRS:DOWN:ORANGE|CYAN:SHELF_DOWN","CYAN|PINK:RIGHT","STAIRS:UP:PINK|RED:SHELF_UP","IN:RED"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP",D:"GREEN|PURPLE:LEFT",C:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2",F:"STAIRS:DOWN:ORANGE|CYAN:SHELF_DOWN",E:"CYAN|PINK:RIGHT",D:"STAIRS:UP:PINK|RED:SHELF_UP",H:"IN:RED"}, hint:"Mixed shelf jumps!" }`,
// L250
`{ number:250, name:"Antimatter", cells:["A","B","C","D","E","F"], layout:[[["A","B"]],[[null,null]],[[null,null]],[["C","D"]],[[null,null]],[["E","F"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:3","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2","ORANGE|CYAN:RIGHT","IN:CYAN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:3",D:"GREEN|PURPLE:LEFT",C:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2",E:"ORANGE|CYAN:RIGHT",F:"IN:CYAN"}, hint:"Jump three then jump two!" }`,
// L251
`{ number:251, name:"Void Collapse", cells:["A","B","C","D","E","F","G","H","I","J"], layout:[[["A","B"]],[["C","D"]],[["E","F"]],[["G","H"]],[["I","J"]]], pieces:["OUT:RED|BLUE:RIGHT","STAIRS:UP:BLUE|GREEN:SHELF_UP:2","GREEN|PURPLE:LEFT","STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2","STAIRS:DOWN:ORANGE|CYAN:SHELF_DOWN","CYAN|PINK:RIGHT","STAIRS:UP:PINK|RED:SHELF_UP","STAIRS:DOWN:RED|YELLOW:SHELF_DOWN:2","YELLOW|GREEN:LEFT","IN:GREEN"], solution:{A:"OUT:RED|BLUE:RIGHT",B:"STAIRS:UP:BLUE|GREEN:SHELF_UP:2",D:"GREEN|PURPLE:LEFT",C:"STAIRS:UP:PURPLE|ORANGE:SHELF_UP:2",G:"STAIRS:DOWN:ORANGE|CYAN:SHELF_DOWN",F:"CYAN|PINK:RIGHT",E:"STAIRS:UP:PINK|RED:SHELF_UP",H:"STAIRS:DOWN:RED|YELLOW:SHELF_DOWN:2",J:"YELLOW|GREEN:LEFT",I:"IN:GREEN"}, hint:"Five shelves of chaos!" }`,
];

// Find insertion point: after L239
const lines=jsx.split('\n');
let insertIdx=-1;
for(let i=0;i<lines.length;i++){
  if(lines[i].match(/number:\s*239[,}]/)){insertIdx=i+1;break;}
}
if(insertIdx>0){
  lines.splice(insertIdx,0,...newLevels.map(l=>'  '+l+','));
  console.log('Inserted 12 levels after L239');
}

let result=lines.join('\n');

// Update CHAPTERS: add Insane II and III
result=result.replace(
  /\{ name: "Insane I", range: \[234, 239\]([^}]+)\}/,
  '{ name: "Insane I", range: [234, 239]$1},\n  { name: "Insane II", range: [240, 245], color: "#ef4444", bg: "radial-gradient(circle at center,#7f1d1d 0%,#1a0505 60%,#0a0a15 100%)", glow: "rgba(239,68,68,0.15)" },\n  { name: "Insane III", range: [246, 251], color: "#dc2626", bg: "radial-gradient(circle at center,#991b1b 0%,#1a0505 60%,#0a0a15 100%)", glow: "rgba(220,38,38,0.15)" }'
);

// Bump DATA_VERSION 4→5
result=result.replace('const DATA_VERSION = 4;','const DATA_VERSION = 5;');

// No migration needed since new levels are at the end (after 239)

fs.writeFileSync('./app/ChromaticPuzzle.jsx',result);
console.log('Done');
