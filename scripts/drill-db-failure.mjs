import { spawnSync } from "node:child_process";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

function check(result, message) {
  if (result.status !== 0) {
    throw new Error(`${message}\n${result.stderr || result.stdout}`);
  }
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function postEvent() {
  const orchestrator = process.env.SMOKE_ORCHESTRATOR_URL ?? "http://localhost:3011";
  const response = await fetch(`${orchestrator}/internal/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteId: "site-a",
      cameraId: "cam-a-1",
      eventType: "offline",
      severity: "critical",
      score: 0.95,
      tsEvent: new Date().toISOString(),
      dedupKey: `drill-db-${Date.now()}`,
      metadata: { scenario: "db-failure-drill" }
    })
  });
  return response;
}

async function main() {
  const confirm = hasFlag("--confirm-stop-db");
  const autoRecover = hasFlag("--auto-recover");

  if (!confirm) {
    throw new Error("Refusing to stop DB without --confirm-stop-db flag.");
  }

  console.log("Stopping postgres to simulate DB failure...");
  check(run("docker", ["compose", "stop", "postgres"]), "failed to stop postgres");

  console.log("Sending orchestrator write request while DB is down...");
  const response = await postEvent();
  const body = await response.text();
  console.log(`response status=${response.status}`);
  console.log(`response body=${body}`);
  if (response.status < 500) {
    throw new Error(`expected DB failure status (5xx), got ${response.status}`);
  }

  if (autoRecover) {
    console.log("Starting postgres back...");
    check(run("docker", ["compose", "start", "postgres"]), "failed to start postgres");
    console.log("DB failure drill completed with auto recovery.");
    return;
  }

  console.log("DB remains stopped. Start manually with: docker compose start postgres");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
