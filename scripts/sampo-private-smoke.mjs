#!/usr/bin/env node

import net from "node:net";

const HELP = `
SAMPO private protocol smoke checker

Required env:
  SAMPO_PRIVATE_HOST

Optional env:
  SAMPO_PRIVATE_PORT (default: 30000)
  SMOKE_TIMEOUT_MS (default: 5000)
`;

function looksLikePlaceholder(value) {
  return typeof value === "string" && value.includes("<") && value.includes(">");
}

function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (ok, reason) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({ ok, reason, latencyMs: Date.now() - startedAt });
    };

    socket.setTimeout(timeoutMs, () => finish(false, "timeout"));
    socket.once("connect", () => finish(true, "connected"));
    socket.once("error", (error) => finish(false, String(error)));
  });
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP.trim());
    process.exit(0);
  }

  const host = process.env.SAMPO_PRIVATE_HOST;
  const port = Number(process.env.SAMPO_PRIVATE_PORT ?? "30000");
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "5000");

  if (!host) {
    console.error("Missing required env: SAMPO_PRIVATE_HOST");
    console.error(HELP.trim());
    process.exit(1);
  }

  if (looksLikePlaceholder(host)) {
    console.error("SAMPO_PRIVATE_HOST still uses placeholder value.");
    process.exit(1);
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error("Invalid SAMPO_PRIVATE_PORT. Use integer in range 1..65535.");
    process.exit(1);
  }

  const result = await probeTcp(host, port, timeoutMs);
  console.log(`[sampo-private] host=${host} port=${port} ok=${result.ok} latencyMs=${result.latencyMs} reason=${result.reason}`);

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`SAMPO private smoke crashed: ${String(error)}`);
  process.exit(1);
});
