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
  console.log("==> Preparing pnpm");
  await run("corepack", ["prepare", "pnpm@10.4.1", "--activate"]);

  console.log("==> Enabling git hooks path (.githooks)");
  try {
    await run("git", ["config", "core.hooksPath", ".githooks"]);
  } catch (error) {
    console.warn("Skipping hooksPath setup (git not available?):", error.message);
  }

  console.log("==> Installing workspace dependencies");
  await run("corepack", ["pnpm", "install"]);

  console.log("==> Running baseline verification");
  await run("node", ["scripts/verify.mjs"]);

  console.log("Bootstrap complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
