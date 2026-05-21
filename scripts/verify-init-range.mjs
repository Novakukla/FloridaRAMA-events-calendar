import path from "node:path";
import http from "node:http";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "fixture";

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function withServer(fn) {
  const server = http.createServer(async (req, res) => {
    try {
      const requested = new URL(req.url || "/", "http://127.0.0.1").pathname;
      const relativePath = requested === "/" ? "init.html" : requested.replace(/^\/+/, "");
      const filePath = path.resolve(repoRoot, relativePath);

      if (!filePath.startsWith(repoRoot)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const body = await fs.readFile(filePath);
      res.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function checkSegments(result) {
  const segments = result.events;
  if (segments.length !== 2) return false;

  const [first, second] = segments;
  const firstSpansFriSat =
    first.left >= result.day22.left - 4 &&
    first.left <= result.day22.left + 8 &&
    first.right >= result.day23.right - 8;

  const secondSpansSunMon =
    second.left >= result.day24.left - 4 &&
    second.left <= result.day24.left + 8 &&
    second.right >= result.day25.right - 8;

  return firstSpansFriSat && secondSpansSunMon;
}

async function verifyPage(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".fc-daygrid-event", { timeout: 15000 });

  return await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    };

    const eventEls = Array.from(document.querySelectorAll(".fc-daygrid-event"))
      .filter((el) => el.textContent.includes("Celebrate Memorial Day Weekend"))
      .map(rect)
      .sort((a, b) => a.top - b.top || a.left - b.left);

    return {
      eventCount: eventEls.length,
      events: eventEls,
      day22: rect(document.querySelector('[data-date="2026-05-22"]')),
      day23: rect(document.querySelector('[data-date="2026-05-23"]')),
      day24: rect(document.querySelector('[data-date="2026-05-24"]')),
      day25: rect(document.querySelector('[data-date="2026-05-25"]')),
    };
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const result = mode === "init"
    ? await withServer((baseUrl) => verifyPage(page, `${baseUrl}/init.html`))
    : await verifyPage(page, pathToFileURL(path.join(repoRoot, "test-init-range.html")).toString());

  const rangeLooksRight = checkSegments(result);
  console.log(JSON.stringify({ mode, ...result, rangeLooksRight }, null, 2));

  if (!rangeLooksRight) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
