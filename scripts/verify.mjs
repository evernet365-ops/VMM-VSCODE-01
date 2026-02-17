import { spawn } from "node:child_process";

function resolveCommand(command) {
  return process.platform === "win32" ? "cmd.exe" : command;
}

function resolveArgs(command, args) {
  return process.platform === "win32" ? ["/c", command, ...args] : args;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), resolveArgs(command, args), { stdio: "inherit" });
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
  const checks = [
    ["node", ["scripts/check-doc-contract.mjs"]],
    ["node", ["scripts/check-env-contract.mjs"]],
    ["node", ["scripts/check-openapi-access-class.mjs"]],
    ["corepack", ["pnpm", "run", "typecheck"]],
    ["corepack", ["pnpm", "run", "build"]],
    ["corepack", ["pnpm", "run", "test"]],
    ["corepack", ["pnpm", "run", "lint"]]
  ];

  for (const [command, args] of checks) {
    console.log(`==> ${command} ${args.join(" ")}`);
    await run(command, args);
  }

  console.log("Verification complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
