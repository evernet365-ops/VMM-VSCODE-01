import { existsSync } from "node:fs";

const requiredFiles = [
  "AGENTS.md",
  "RULES.md",
  "SKILLS.md",
  ".cursor/rules.md"
];

function main() {
  const missing = requiredFiles.filter((file) => !existsSync(file));

  if (missing.length > 0) {
    console.error("Governance file check failed:");
    for (const file of missing) {
      console.error(`- missing required file: ${file}`);
    }
    process.exit(1);
  }

  console.log(`Governance file check passed (${requiredFiles.length} required files).`);
}

main();
