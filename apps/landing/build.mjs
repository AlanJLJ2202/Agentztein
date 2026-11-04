// Builds the landing into dist/: the page, its pictures, the font and the 3D lab bundled with three.js.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const here = new URL(".", import.meta.url).pathname;
const out = here + "dist/";
rmSync(out, { recursive: true, force: true });
mkdirSync(out + "fonts", { recursive: true });

await build({
  entryPoints: [here + "src/main.js"],
  outfile: out + "lab.js",
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  legalComments: "none",
});
// visit counting (ADR-034): tiny and separate, so a visit counts before the 3D lab has downloaded
await build({
  entryPoints: [here + "src/visits.js"],
  outfile: out + "visits.js",
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  legalComments: "none",
});

cpSync(here + "index.html", out + "index.html");
cpSync(here + "img", out + "img", { recursive: true });
cpSync(
  here + "node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  out + "fonts/figtree.woff2",
);
console.log("landing built in", out);
