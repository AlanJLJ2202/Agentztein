// Renders the page's pictures from the same 3D models the live lab uses, and saves them to img/.
// Run with: pnpm --filter @skillab/landing stills  (needs a local Chromium with WebGL).
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const here = new URL("..", import.meta.url).pathname;
const tmp = here + ".stills/";
mkdirSync(tmp, { recursive: true });
await build({ entryPoints: [here + "src/stills.js"], outfile: tmp + "stills.js", bundle: true, format: "esm" });
writeFileSync(tmp + "index.html", `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Figtree;src:url(figtree.woff2)}body{margin:0;font-family:Figtree}</style><p>.</p><script type="module" src="stills.js"></script>`);
writeFileSync(tmp + "figtree.woff2", readFileSync(here + "node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2"));

const types = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const f = req.url === "/" ? "index.html" : req.url.slice(1);
  try {
    res.writeHead(200, { "content-type": types[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream" });
    res.end(readFileSync(tmp + f));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.renderStill && document.fonts.ready);
await page.evaluate(() => document.fonts.load("700 40px Figtree"));

const shots = {
  lab: 1000, room: 1000, muse: 900, step0: 900, step1: 900, step2: 900, step3: 900, step4: 900, step5: 900,
  "bench-swe": 700, "bench-terminal": 700, "bench-arc": 700, "bench-web": 700, "bench-research": 700, "bench-horizon": 700,
};
const only = process.argv.slice(2);
for (const [name, size] of Object.entries(shots).filter(([n]) => !only.length || only.includes(n))) {
  const url = await page.evaluate(([n, s]) => window.renderStill(n, s), [name, size]);
  writeFileSync(here + `img/${name}.webp`, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote img/" + name + ".webp");
}
await browser.close();
server.close();
