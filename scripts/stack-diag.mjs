import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

function section(title, content) {
  return [
    `## ${title}`,
    "",
    "```",
    content?.trim() || "(no output)",
    "```",
    ""
  ].join("\n");
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function healthChecks() {
  const targets = [
    "http://localhost:3010/healthz",
    "http://localhost:3011/healthz",
    "http://localhost:3012/healthz",
    "http://localhost:3013/healthz",
    "http://localhost:3014/healthz",
    "http://localhost:3015/healthz",
    "http://localhost:3016/healthz"
  ];

  const rows = [];
  for (const url of targets) {
    try {
      const response = await fetch(url);
      const body = await response.text();
      rows.push(`${url} -> ${response.status}\n${body}`);
    } catch (error) {
      rows.push(`${url} -> request failed\n${String(error)}`);
    }
  }
  return rows.join("\n\n");
}

async function main() {
  const artifactsDir = path.resolve("artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  const outFile = path.join(artifactsDir, `stack-diag-${nowStamp()}.txt`);

  const dockerVersion = run("docker", ["--version"]);
  const composeVersion = run("docker", ["compose", "version"]);
  const composePs = run("docker", ["compose", "ps"]);
  const composeLogs = run("docker", ["compose", "logs", "--no-color", "--tail", "200"]);
  const health = await healthChecks();

  const content = [
    `# Stack Diagnostic Report`,
    `Generated at: ${new Date().toISOString()}`,
    "",
    section("Docker Version", `${dockerVersion.stdout}\n${dockerVersion.stderr}`),
    section("Compose Version", `${composeVersion.stdout}\n${composeVersion.stderr}`),
    section("Compose PS", `${composePs.stdout}\n${composePs.stderr}`),
    section("Health Checks", health),
    section("Compose Logs (tail 200)", `${composeLogs.stdout}\n${composeLogs.stderr}`)
  ].join("\n");

  writeFileSync(outFile, content, "utf8");
  console.log(`Diagnostic report written: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
