import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function main() {
  console.log("==> Stack up");
  await run("corepack", ["pnpm", "run", "stack:up"]);

  console.log("==> Wait for service readiness");
  await run("corepack", ["pnpm", "run", "stack:wait"]);

  console.log("==> Stack status");
  await run("corepack", ["pnpm", "run", "stack:status"]);

  console.log("==> Smoke test");
  await run("corepack", ["pnpm", "run", "smoke"]);

  console.log("==> Connector smoke test");
  await run("corepack", ["pnpm", "run", "smoke:connector"]);

  console.log("Stack smoke completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
