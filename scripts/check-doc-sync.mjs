import { existsSync, readFileSync } from "node:fs";

const pairs = [
  ["RULES.md", "rules.md"],
  ["SKILLS.md", "skills.md"]
];

function normalize(text) {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

function main() {
  const errors = [];

  for (const [source, mirror] of pairs) {
    if (!existsSync(source)) {
      errors.push(`missing source file: ${source}`);
      continue;
    }

    if (!existsSync(mirror)) {
      errors.push(`missing mirror file: ${mirror}`);
      continue;
    }

    const sourceText = normalize(readFileSync(source, "utf8"));
    const mirrorText = normalize(readFileSync(mirror, "utf8"));

    if (sourceText !== mirrorText) {
      errors.push(`content mismatch: ${source} <> ${mirror}`);
    }
  }

  if (errors.length > 0) {
    console.error("Doc sync check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Doc sync check passed (${pairs.length} mirrored pairs).`);
}

main();
