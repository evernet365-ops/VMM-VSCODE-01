const connector = process.env.SMOKE_CONNECTOR_URL ?? "http://localhost:3013";
const durationSec = Number(process.env.DRILL_OBSERVE_SEC ?? "90");
const intervalMs = Number(process.env.DRILL_OBSERVE_INTERVAL_MS ?? "5000");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHealth() {
  const response = await fetch(`${connector}/healthz`);
  if (!response.ok) {
    throw new Error(`connector health request failed (${response.status})`);
  }
  return response.json();
}

async function main() {
  const startedAt = Date.now();
  let openSeen = false;
  let degradedSeen = false;

  while (Date.now() - startedAt < durationSec * 1000) {
    const health = await fetchHealth();
    const breakerState = health?.circuitBreaker?.state ?? "unknown";
    const severity = health?.severity ?? "unknown";
    const loadShed = Boolean(health?.loadShedMode);
    const status = health?.status ?? "unknown";
    if (status === "degraded") {
      degradedSeen = true;
    }
    if (breakerState === "open") {
      openSeen = true;
    }

    console.log(
      `status=${status} severity=${severity} breaker=${breakerState} ` +
      `failures=${health?.consecutiveFailures ?? "n/a"} loadShed=${loadShed}`
    );
    await sleep(intervalMs);
  }

  console.log(`Observation complete: degradedSeen=${degradedSeen}, breakerOpenSeen=${openSeen}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
