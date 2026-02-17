import { existsSync, rmSync } from "node:fs";
import path from "node:path";

function removeIfExists(target) {
  if (!existsSync(target)) {
    return;
  }
  rmSync(target, { recursive: true, force: true });
  console.log(`removed: ${target}`);
}

function main() {
  const artifactsDir = path.resolve("artifacts");
  removeIfExists(artifactsDir);
  console.log("Stack artifacts cleanup completed.");
}

main();
