import { promises as fs } from "node:fs";
import path from "node:path";

const INPUT_DIR = "openapi";
const OUTPUT_DIR = path.join("artifacts", "api-docs");
const HTML_FILE = path.join(OUTPUT_DIR, "index.html");
const PDF_FILE = path.join(OUTPUT_DIR, "api-docs.pdf");

function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function parseYamlEndpoints(content) {
  const lines = content.split(/\r?\n/);
  let title = "API";
  let version = "n/a";
  const endpoints = [];
  let inPaths = false;
  let currentPath = null;
  let currentMethod = null;
  let currentSummary = "";
  let currentAccess = "";

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith("title:") && title === "API") {
      title = t.slice("title:".length).trim();
    }
    if (t.startsWith("version:") && version === "n/a") {
      version = t.slice("version:".length).trim();
    }

    if (t === "paths:") {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;

    const pathMatch = /^(\s{2})\/[^:]+:\s*$/.exec(line);
    if (pathMatch) {
      if (currentPath && currentMethod) {
        endpoints.push({
          path: currentPath,
          method: currentMethod.toUpperCase(),
          summary: currentSummary || "(no summary)",
          access: currentAccess || "n/a"
        });
      }
      currentPath = t.slice(0, -1);
      currentMethod = null;
      currentSummary = "";
      currentAccess = "";
      continue;
    }

    const methodMatch = /^(\s{4})(get|post|put|delete|patch):\s*$/.exec(line);
    if (methodMatch) {
      if (currentPath && currentMethod) {
        endpoints.push({
          path: currentPath,
          method: currentMethod.toUpperCase(),
          summary: currentSummary || "(no summary)",
          access: currentAccess || "n/a"
        });
      }
      currentMethod = methodMatch[2];
      currentSummary = "";
      currentAccess = "";
      continue;
    }

    if (currentPath && currentMethod && t.startsWith("summary:")) {
      currentSummary = t.slice("summary:".length).trim();
    }
    if (currentPath && currentMethod && t.startsWith("x-access-class:")) {
      currentAccess = t.slice("x-access-class:".length).trim();
    }
  }

  if (currentPath && currentMethod) {
    endpoints.push({
      path: currentPath,
      method: currentMethod.toUpperCase(),
      summary: currentSummary || "(no summary)",
      access: currentAccess || "n/a"
    });
  }

  return { title, version, endpoints };
}

function renderHtml(specs) {
  const sections = specs
    .map((spec) => {
      const rows = spec.endpoints
        .map(
          (ep) =>
            `<tr><td><code>${esc(ep.method)}</code></td><td><code>${esc(ep.path)}</code></td><td>${esc(ep.access)}</td><td>${esc(ep.summary)}</td></tr>`
        )
        .join("");
      return `
        <section class="card">
          <h2>${esc(spec.title)} <small>v${esc(spec.version)}</small></h2>
          <table>
            <thead><tr><th>Method</th><th>Path</th><th>Access</th><th>Summary</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EverNet API Docs</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 24px; color: #10212c; background: #f4f8fa; }
    h1 { margin: 0 0 16px; }
    .meta { margin: 0 0 20px; color: #4f6675; }
    .card { background: #fff; border: 1px solid #d8e2e8; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
    h2 { margin: 0 0 10px; font-size: 1.1rem; }
    h2 small { color: #5b7381; font-weight: 500; margin-left: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e6edf2; vertical-align: top; }
    th { color: #4d6270; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    code { background: #f1f5f8; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>EverNet API Handbook</h1>
  <p class="meta">Generated from <code>openapi/*.yaml</code> at ${new Date().toISOString()}</p>
  ${sections}
</body>
</html>`;
}

function createMinimalPdf(textLines) {
  const lines = textLines.map((line) => line.replace(/[()\\]/g, "\\$&"));
  const content = [
    "BT",
    "/F1 10 Tf",
    "50 790 Td",
    ...lines.flatMap((line, idx) => (idx === 0 ? [`(${line}) Tj`] : ["0 -14 Td", `(${line}) Tj`])),
    "ET"
  ].join("\n");

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontObj = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const contentObj = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const pageObj = add(
    `<< /Type /Page /Parent 4 0 R /MediaBox [0 0 595 842] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>`
  );
  const pagesObj = add(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`);
  const catalogObj = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

async function main() {
  const entries = (await fs.readdir(INPUT_DIR)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
  const specs = [];
  for (const entry of entries) {
    const content = await fs.readFile(path.join(INPUT_DIR, entry), "utf8");
    const parsed = parseYamlEndpoints(content);
    specs.push({ file: entry, ...parsed });
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const html = renderHtml(specs);
  await fs.writeFile(HTML_FILE, html, "utf8");

  const textLines = [
    `EverNet API Handbook (${new Date().toISOString()})`,
    ...specs.flatMap((spec) => [
      "",
      `${spec.title} v${spec.version} [${spec.file}]`,
      ...spec.endpoints.map((ep) => `${ep.method} ${ep.path} | ${ep.access} | ${ep.summary}`)
    ])
  ];
  await fs.writeFile(PDF_FILE, createMinimalPdf(textLines));

  console.log(`Generated: ${HTML_FILE}`);
  console.log(`Generated: ${PDF_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
