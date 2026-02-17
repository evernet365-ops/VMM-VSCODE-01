import { spawnSync } from "node:child_process";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

function fail(message, detail) {
  console.error(`[FAIL] ${message}`);
  if (detail) {
    console.error(detail.trim());
  }
  process.exit(1);
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function main() {
  const daemon = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (daemon.status !== 0) {
    fail("Docker daemon is not available.", daemon.stderr || daemon.stdout);
  }
  ok(`Docker daemon running (server ${daemon.stdout.trim()})`);

  const ps = run("docker", ["compose", "ps", "--format", "json"]);
  if (ps.status !== 0) {
    fail("Unable to read docker compose status.", ps.stderr || ps.stdout);
  }

  const raw = ps.stdout.trim();
  if (!raw) {
    console.log("[WARN] Stack has no running containers.");
    process.exit(0);
  }

  const lines = raw.split("\n").filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      fail("Failed to parse docker compose status JSON.", line);
    }
  }

  const mapped = rows.map((item) => ({
    service: item.Service ?? "unknown",
    state: item.State ?? "unknown",
    health: item.Health ?? "n/a",
    ports: item.Publishers?.map((p) => `${p.PublishedPort}->${p.TargetPort}`).join(", ") ?? "-"
  }));

  console.log("");
  console.log("Service Status");
  console.log("--------------");
  for (const row of mapped) {
    const health = row.health === "" ? "n/a" : row.health;
    console.log(`${row.service.padEnd(24)} state=${row.state.padEnd(10)} health=${health.padEnd(10)} ports=${row.ports}`);
  }

  const unhealthy = mapped.filter((row) => row.health !== "n/a" && row.health !== "healthy");
  if (unhealthy.length > 0) {
    console.log("");
    console.log(`[WARN] ${unhealthy.length} service(s) not healthy yet.`);
    process.exit(2);
  }

  console.log("");
  ok("All reported health checks are healthy.");
}

main();
