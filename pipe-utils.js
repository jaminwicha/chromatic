// Pipe rotation utilities for Chromatic Puzzle

// Rotation mapping: clockwise 90 degrees
const ROTATE_CW = {
  UP: "RIGHT", RIGHT: "DOWN", DOWN: "LEFT", LEFT: "UP",
  UP_RIGHT: "DOWN_RIGHT", DOWN_RIGHT: "DOWN_LEFT", 
  DOWN_LEFT: "UP_LEFT", UP_LEFT: "UP_RIGHT"
};

// Rotate a direction clockwise by 90 degrees
export function rotateDirection(dir) {
  return ROTATE_CW[dir] || dir;
}

// Rotate a pipe tile string clockwise by 90 degrees
export function rotatePipe(pipeStr) {
  if (!pipeStr.startsWith("PIPE:")) return pipeStr;
  
  const rest = pipeStr.slice(5);
  const channels = rest.split(",").map(ch => {
    const [inPart, outPart] = ch.split(">");
    const [inDir, inColor] = inPart.split(":");
    const [outDir, outColor] = outPart.split(":");
    
    return `${rotateDirection(inDir)}:${inColor}>${rotateDirection(outDir)}:${outColor}`;
  });
  
  return `PIPE:${channels.join(",")}`;
}

// Get all 4 rotations of a pipe
export function getAllPipeRotations(pipeStr) {
  if (!pipeStr.startsWith("PIPE:")) return [pipeStr];
  
  const rotations = [pipeStr];
  let current = pipeStr;
  
  for (let i = 0; i < 3; i++) {
    current = rotatePipe(current);
    rotations.push(current);
  }
  
  return rotations;
}

// Randomize pipe orientations in a pieces array
export function randomizePipeOrientations(pieces) {
  return pieces.map(piece => {
    if (!piece.startsWith("PIPE:")) return piece;
    
    const rotations = getAllPipeRotations(piece);
    return rotations[Math.floor(Math.random() * rotations.length)];
  });
}
