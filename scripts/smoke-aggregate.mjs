import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

async function runCheck(name, url) {
  try {
    const response = await fetch(url);
    const body = await response.text();
    return {
      name,
      url,
      ok: response.ok,
      status: response.status,
      bodySample: body.slice(0, 1000)
    };
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      status: 0,
      bodySample: String(error)
    };
  }
}

function buildMarkdown(report) {
  const lines = [
    "# Smoke Aggregate Report",
    "",
    `Generated: ${report.generatedAt}`,
    ""
  ];
  for (const item of report.results) {
    lines.push(`- ${item.name}: ${item.ok ? "PASS" : "FAIL"} (${item.status})`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const probes = [
    ["connector-healthz", "http://localhost:3013/healthz"],
    ["scheduler-healthz", "http://localhost:3015/healthz"],
    ["scheduler-ntp-status", "http://localhost:3015/api/v1/time-sync/status"]
  ];
  const results = [];
  for (const [name, url] of probes) {
    results.push(await runCheck(name, url));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    results
  };
  const outDir = path.resolve("artifacts");
  mkdirSync(outDir, { recursive: true });
  const stamp = nowStamp();
  const jsonPath = path.join(outDir, `smoke-aggregate-${stamp}.json`);
  const mdPath = path.join(outDir, `smoke-aggregate-${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, buildMarkdown(report), "utf8");
  console.log(`smoke aggregate written: ${jsonPath}`);
  console.log(`smoke aggregate written: ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
