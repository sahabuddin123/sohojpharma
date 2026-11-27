// Post-build script: builds the exact dependency closure of core offline PWA assets
// (mobile + desktop POS, sales, customers, purchases, products, invoice chunks, styles, fonts)
// while skipping ~1,300 unused Shiki/Mermaid language chunks, writes `.output/public/sw-precache.json`,
// and stamps a build hash version into `.output/public/sw.js`.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PUBLIC_DIR = path.resolve(process.cwd(), ".output/public");
const ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
const SW_PATH = path.join(PUBLIC_DIR, "sw.js");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "sw-precache.json");

if (!fs.existsSync(PUBLIC_DIR) || !fs.existsSync(ASSETS_DIR)) {
  console.warn("[gen-sw-precache] .output/public/assets not found — skipping.");
  process.exit(0);
}

const files = fs.readdirSync(ASSETS_DIR);

// Root entry & core route chunk prefixes needed for offline Desktop + Mobile PWA
const SEED_RE =
  /^(?:main-|client-|router-|__root|m(?:\.|-[A-Za-z0-9_-]+\.js$)|sales(?:\.|-[A-Za-z0-9_-]+\.js$)|products(?:\.|-[A-Za-z0-9_-]+\.js$)|customers(?:\.|-[A-Za-z0-9_-]+\.js$)|purchases(?:\.|-[A-Za-z0-9_-]+\.js$)|procurement|store-|dashboard-|auth-|phone-shell|app-shell|offline|styles-)/i;

// Heavy non-operational documentation/markdown/mermaid highlighter chunks to exclude
const SKIP_CHUNK_RE =
  /(?:shiki|mermaid|cytoscape|katex|flowchart|sequenceDiagram|classDiagram|erDiagram|stateDiagram|gitGraph|c4Diagram|mindmap|sankey|timeline|xychart|blockDiagram|packet|kanban|architecture|quadrant|radar|treemap|venn|ishikawa|wardley|requirementDiagram|pieDiagram|journey|gantt|infoDiagram|@streamdown|prosemirror|tiptap)/i;

const visited = new Set();
const queue = [];

for (const f of files) {
  if (f.endsWith(".css") || /\.(?:woff2?|png|jpe?g|svg|webp)$/i.test(f)) {
    visited.add(f);
    continue;
  }
  if (f.endsWith(".js") && SEED_RE.test(f) && !SKIP_CHUNK_RE.test(f)) {
    queue.push(f);
  }
}

const IMPORT_RE = /(?:from\s*["'](\.[^"']+\.js)["']|import\s*\(\s*["'](\.[^"']+\.js)["']\s*\)|import\s*["'](\.[^"']+\.js)["'])/g;

while (queue.length > 0) {
  const file = queue.pop();
  if (!file || visited.has(file)) continue;
  const fullPath = path.join(ASSETS_DIR, file);
  if (!fs.existsSync(fullPath)) continue;
  visited.add(file);

  const src = fs.readFileSync(fullPath, "utf8");
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const rel = m[1] || m[2] || m[3];
    if (!rel) continue;
    const base = path.posix.basename(rel);
    if (!visited.has(base) && !SKIP_CHUNK_RE.test(base) && fs.existsSync(path.join(ASSETS_DIR, base))) {
      queue.push(base);
    }
  }
}

const assetUrls = Array.from(visited)
  .sort()
  .map((f) => `/assets/${f}`);

const staticPublicFiles = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
].filter((p) => fs.existsSync(path.join(PUBLIC_DIR, p.slice(1))));

const appRoutes = [
  "/m",
  "/m/sale",
  "/m/sales",
  "/m/products",
  "/m/customers",
  "/m/purchase",
  "/m/purchases",
  "/m/inventory",
  "/m/collect",
  "/m/sync",
  "/store",
  "/sales/pos",
  "/sales",
  "/customers",
  "/products",
  "/purchases",
  "/purchases/new",
];

const version = crypto
  .createHash("sha256")
  .update(assetUrls.join("\n"))
  .digest("hex")
  .slice(0, 12);

fs.writeFileSync(
  MANIFEST_PATH,
  JSON.stringify(
    {
      version,
      generatedAt: new Date().toISOString(),
      assets: [...staticPublicFiles, ...assetUrls],
      routes: appRoutes,
    },
    null,
    2,
  ),
);

if (fs.existsSync(SW_PATH)) {
  const swSrc = fs.readFileSync(SW_PATH, "utf8");
  fs.writeFileSync(SW_PATH, swSrc.replace(/__SW_CACHE_VERSION__/g, version));
}

console.log(
  `[gen-sw-precache] v=${version} | ${assetUrls.length} core assets + ${appRoutes.length} routes ready for offline PWA.`,
);
