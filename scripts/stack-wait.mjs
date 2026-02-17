const timeoutSec = Number(process.env.STACK_WAIT_TIMEOUT_SEC ?? "180");
const intervalMs = Number(process.env.STACK_WAIT_INTERVAL_MS ?? "3000");

const targets = [
  "http://localhost:3010/healthz",
  "http://localhost:3011/healthz",
  "http://localhost:3012/healthz",
  "http://localhost:3013/healthz",
  "http://localhost:3014/healthz",
  "http://localhost:3015/healthz",
  "http://localhost:3016/healthz"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTarget(url) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for ${url} within ${timeoutSec}s`);
}

async function main() {
  for (const target of targets) {
    process.stdout.write(`waiting ${target} ... `);
    await waitForTarget(target);
    process.stdout.write("ok\n");
  }
  console.log("All service health endpoints are ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
