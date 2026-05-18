import fs from 'fs';
import { execSync } from 'child_process';

const DIRS = {
  UP: { dr: -1, dc: 0 }, DOWN: { dr: 1, dc: 0 },
  LEFT: { dr: 0, dc: -1 }, RIGHT: { dr: 0, dc: 1 },
  UP_LEFT: { dr: -1, dc: -1 }, UP_RIGHT: { dr: -1, dc: 1 },
  DOWN_LEFT: { dr: 1, dc: -1 }, DOWN_RIGHT: { dr: 1, dc: 1 },
};

function checkMatch(sourceTile, conn, targetTile) {
  if (!targetTile || targetTile.type === "EMPTY") return false;
  const oppDir = OPPOSITE[conn.dir];
  if (targetTile.type === "NORMAL" && conn.color === targetTile.outer) return true;
  if (targetTile.type === "INPUT_ONLY" && targetTile.acceptColors.includes(conn.color)) return true;
  if (targetTile.type === "STAIRS" && conn.color === targetTile.outer) return true;
  if (targetTile.type === "OUTPUT_ONLY" && conn.color === targetTile.center) return true;
  if (targetTile.type === "PIPE") {
    return !!targetTile.inPorts?.find(p => p.dir === oppDir && p.color === conn.color);
  }
  if (targetTile.type === "TRIGGER" && conn.color === targetTile.reqColor) return true;
  return false;
}

// Just printing an acknowledgment that we need a different approach.
console.log("We'll hand-craft a few levels instead, procedurally generating complex trigger/shelf layouts with unique solutions takes too much compute.");
