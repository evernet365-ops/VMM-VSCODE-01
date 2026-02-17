import { existsSync, readFileSync } from "node:fs";

const requiredSnippets = [
  "## Hard Rules",
  "### STEP 0 - Context",
  "### STEP 1 - Read",
  "### STEP 2 - Plan",
  "### STEP 3 - Change",
  "### STEP 4 - Verify",
  "### STEP 5 - Rollback",
  "### STEP 6 - Observability",
  "Feature flag required for new features",
  "default OFF",
  "No crash policy"
];

function main() {
  const target = "AGENTS.md";

  if (!existsSync(target)) {
    console.error(`Governance contract check failed: missing ${target}`);
    process.exit(1);
  }

  const content = readFileSync(target, "utf8");
  const missing = requiredSnippets.filter((snippet) => !content.includes(snippet));

  if (missing.length > 0) {
    console.error("Governance contract check failed:");
    for (const snippet of missing) {
      console.error(`- AGENTS.md missing snippet: ${snippet}`);
    }
    process.exit(1);
  }

  console.log(`Governance contract check passed (${requiredSnippets.length} checks).`);
}

main();
