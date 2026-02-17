import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim()
  };
}

function printResult(name, ok, detail) {
  const prefix = ok ? "[OK]" : "[FAIL]";
  console.log(`${prefix} ${name}${detail ? `: ${detail}` : ""}`);
}

function requireCheck(name, command, args) {
  const result = run(command, args);
  if (!result.ok) {
    printResult(name, false, result.stderr || result.stdout || `exit ${result.status}`);
    return false;
  }
  printResult(name, true, result.stdout.split("\n")[0]);
  return true;
}

function main() {
  let pass = true;

  pass = requireCheck("Node.js", "node", ["--version"]) && pass;
  pass = requireCheck("Corepack", "corepack", ["--version"]) && pass;
  pass = requireCheck("pnpm", "corepack", ["pnpm", "--version"]) && pass;
  pass = requireCheck("Docker", "docker", ["--version"]) && pass;
  pass = requireCheck("Docker Compose", "docker", ["compose", "version"]) && pass;

  const daemon = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (daemon.ok) {
    printResult("Docker daemon", true, `server ${daemon.stdout}`);
  } else {
    printResult("Docker daemon", false, daemon.stderr || daemon.stdout || `exit ${daemon.status}`);
    pass = false;
  }

  const composeConfig = run("docker", ["compose", "config"], { stdio: "pipe" });
  if (composeConfig.ok) {
    printResult("Compose config", true, "valid");
  } else {
    printResult("Compose config", false, composeConfig.stderr || composeConfig.stdout || `exit ${composeConfig.status}`);
    pass = false;
  }

  if (!pass) {
    console.error("Doctor checks failed. Fix the failed items and rerun `corepack pnpm run doctor`.");
    process.exit(1);
  }

  console.log("Doctor checks passed.");
}

main();
