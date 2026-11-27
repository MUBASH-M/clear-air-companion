import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIST_DIR = path.resolve(import.meta.dirname, "..", "dist", "public");
const INDEX_HTML = path.resolve(DIST_DIR, "index.html");
const ASSETS_DIR = path.resolve(DIST_DIR, "assets");

const INITIAL_JS_BUDGET_KB = 200;
const LARGEST_CHUNK_BUDGET_KB = 250;

function gzipSizeKb(filePath) {
  const raw = fs.readFileSync(filePath);
  const gz = zlib.gzipSync(raw, { level: 9 });
  return Math.round((gz.byteLength / 1024) * 100) / 100;
}

if (!fs.existsSync(INDEX_HTML) || !fs.existsSync(ASSETS_DIR)) {
  console.error("Build output not found. Run `npm run build` before checking bundle budgets.");
  process.exit(1);
}

const html = fs.readFileSync(INDEX_HTML, "utf-8");
const initialJsMatches = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const initialJsFiles = [...new Set(initialJsMatches)];

const allJsFiles = fs
  .readdirSync(ASSETS_DIR)
  .filter((f) => f.endsWith(".js"))
  .map((f) => `assets/${f}`);

const sizes = allJsFiles.map((rel) => ({
  file: rel,
  gzipKb: gzipSizeKb(path.resolve(DIST_DIR, rel)),
  isInitial: initialJsFiles.includes(rel),
}));

const initialTotalKb =
  Math.round(sizes.filter((s) => s.isInitial).reduce((sum, s) => sum + s.gzipKb, 0) * 100) / 100;
const largestChunk = sizes.reduce((best, cur) => (cur.gzipKb > best.gzipKb ? cur : best), {
  file: "none",
  gzipKb: 0,
  isInitial: false,
});

console.log("Bundle gzip report:");
for (const s of sizes.sort((a, b) => b.gzipKb - a.gzipKb)) {
  console.log(`  ${s.isInitial ? "[initial]" : "[lazy]   "} ${s.file}: ${s.gzipKb.toFixed(2)} KB gzip`);
}
console.log(`Initial JS total: ${initialTotalKb.toFixed(2)} KB gzip (budget: <= ${INITIAL_JS_BUDGET_KB} KB)`);
console.log(
  `Largest chunk:    ${largestChunk.file} (${largestChunk.gzipKb.toFixed(2)} KB gzip, budget: <= ${LARGEST_CHUNK_BUDGET_KB} KB)`,
);

let failed = false;
if (initialTotalKb > INITIAL_JS_BUDGET_KB) {
  console.error(`FAIL: Initial JS (${initialTotalKb} KB) exceeds ${INITIAL_JS_BUDGET_KB} KB gzip budget.`);
  failed = true;
}
if (largestChunk.gzipKb > LARGEST_CHUNK_BUDGET_KB) {
  console.error(`FAIL: Largest chunk (${largestChunk.gzipKb} KB) exceeds ${LARGEST_CHUNK_BUDGET_KB} KB gzip budget.`);
  failed = true;
}

if (failed) process.exit(1);
console.log("PASS: All bundle gzip budgets met.");
