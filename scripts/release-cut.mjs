import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertCleanGit() {
  const status = run("git", ["status", "--porcelain"]);
  if (status.status !== 0) {
    fail(status.stderr || status.stdout || "unable to read git status");
  }
  if (status.stdout.trim().length > 0) {
    fail("working tree is not clean; commit or stash changes before cutting a release");
  }
}

function assertTagDoesNotExist(tag) {
  const check = run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
  if (check.status === 0) {
    fail(`tag ${tag} already exists`);
  }
}

function updateChangelog(tag) {
  const version = tag.slice(1);
  const today = new Date().toISOString().slice(0, 10);
  const changelogPath = "CHANGELOG.md";
  const source = readFileSync(changelogPath, "utf8");
  const marker = "\n## [";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    fail("CHANGELOG.md format is unexpected; missing version section marker");
  }

  const section = [
    `## [${version}] - ${today}`,
    "",
    "### Added",
    "",
    "-",
    "",
    "### Changed",
    "",
    "-",
    "",
    "### Fixed",
    "",
    "-",
    ""
  ].join("\n");

  const next = `${source.slice(0, markerIndex + 1)}${section}${source.slice(markerIndex + 1)}`;
  writeFileSync(changelogPath, next, "utf8");
}

function commitAndTag(tag) {
  const add = run("git", ["add", "CHANGELOG.md"]);
  if (add.status !== 0) {
    fail(add.stderr || add.stdout || "git add failed");
  }

  const commit = run("git", ["commit", "-m", `chore(release): cut ${tag}`]);
  if (commit.status !== 0) {
    fail(commit.stderr || commit.stdout || "git commit failed");
  }

  const releaseTag = run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
  if (releaseTag.status !== 0) {
    fail(releaseTag.stderr || releaseTag.stdout || "git tag failed");
  }
}

function main() {
  const tag = process.argv[2];
  if (!tag) {
    fail("usage: corepack pnpm run release:cut -- vX.Y.Z");
  }
  if (!/^v\\d+\\.\\d+\\.\\d+$/.test(tag)) {
    fail("invalid tag format; expected vX.Y.Z");
  }

  assertCleanGit();
  assertTagDoesNotExist(tag);
  updateChangelog(tag);
  commitAndTag(tag);

  console.log(`release cut complete: ${tag}`);
  console.log("next steps:");
  console.log("  git push origin main");
  console.log(`  git push origin ${tag}`);
}

main();
