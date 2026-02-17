import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "ARCHITECTURE.md",
  "RULES.md",
  "PLANS.md",
  "SKILLS.md",
  "MCP.md",
  "UIUX.md",
  "runbook/RUNBOOK.md",
  "openapi/vmm.yaml",
  "openapi/notification-gateway.yaml"
];

const requiredHeadings = {
  "README.md": ["## Quick Start", "## Local Commands", "## CI"],
  "ARCHITECTURE.md": ["## API Boundaries", "## Observability", "## Deployment & Ops"],
  "RULES.md": ["## System Boundaries", "## Runtime Reliability", "## API Boundary Enforcement"],
  "runbook/RUNBOOK.md": ["## 1. Fault Isolation Workflow", "## 7. Smoke Validation"]
};

function main() {
  const errors = [];

  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      errors.push(`missing required file: ${file}`);
    }
  }

  for (const [file, headings] of Object.entries(requiredHeadings)) {
    if (!existsSync(file)) {
      continue;
    }
    const content = readFileSync(file, "utf8");
    for (const heading of headings) {
      if (!content.includes(heading)) {
        errors.push(`${file} missing heading: ${heading}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("Documentation contract check failed:");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`Documentation contract check passed (${requiredFiles.length} required files).`);
}

main();
