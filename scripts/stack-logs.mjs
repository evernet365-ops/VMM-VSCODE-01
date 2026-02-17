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
  const service = process.argv[2];
  const args = ["compose", "logs", "--no-color", "--tail", "300"];
  if (service) {
    args.push(service);
  }
  await run("docker", args);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
