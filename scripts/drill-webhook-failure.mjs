/*
  Simulate notification delivery failure without mutating gateway config.
  It sends an internal notify request with a non-configured channel route.
*/

const gateway = process.env.SMOKE_GATEWAY_URL ?? "http://localhost:3010";

async function main() {
  const response = await fetch(`${gateway}/internal/notify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteId: "site-a",
      severity: "critical",
      title: "Runbook Drill - Webhook Failure",
      message: "Intentional missing route channel to validate failed notification handling.",
      channels: ["non-existent-channel"],
      sourceService: "runbook-drill"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`notify request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const failed = (payload.results ?? []).filter((item) => item.status === "failed");
  console.log(`notify resultCount=${payload.resultCount}, failed=${failed.length}`);
  if (failed.length === 0) {
    throw new Error("expected at least one failed notification result");
  }
  console.log("Webhook failure drill completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
