import { existsSync, readFileSync } from "node:fs";

const requiredFiles = ["SKILL.md", "SKILLS.md", "skills.md"];
const requiredSkillKeywords = [
  "Feature Flag",
  "Fail-Soft",
  "Observability",
  "Camera Health",
  "Playback Fallback",
  "Contract Safety"
];
const requiredSkillsOwnership = [
  "connector-vss",
  "ai-orchestrator",
  "reporting-engine",
  "notification-gateway",
  "web-dashboard",
  "shared"
];

function main() {
  const errors = [];

  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      errors.push(`missing required skill file: ${file}`);
    }
  }

  if (existsSync("SKILL.md")) {
    const skill = readFileSync("SKILL.md", "utf8");
    for (const keyword of requiredSkillKeywords) {
      if (!skill.includes(keyword)) {
        errors.push(`SKILL.md missing keyword: ${keyword}`);
      }
    }
  }

  if (existsSync("SKILLS.md")) {
    const skills = readFileSync("SKILLS.md", "utf8");
    for (const owner of requiredSkillsOwnership) {
      if (!skills.includes(owner)) {
        errors.push(`SKILLS.md missing ownership entry: ${owner}`);
      }
    }
  }

  if (existsSync("SKILLS.md") && existsSync("skills.md")) {
    const upper = readFileSync("SKILLS.md", "utf8").replace(/\r\n/g, "\n").trimEnd();
    const lower = readFileSync("skills.md", "utf8").replace(/\r\n/g, "\n").trimEnd();
    if (upper !== lower) {
      errors.push("SKILLS.md and skills.md are out of sync");
    }
  }

  if (errors.length > 0) {
    console.error("Skill contract check failed:");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log("Skill contract check passed.");
}

main();
