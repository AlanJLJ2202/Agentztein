// Mounts the 3D lab and talks to the page through two events:
// "lab:select" (the page asks the lab to highlight a jar) and "lab:picked" (a jar was clicked in 3D).
import { createLab } from "./lab.js";

const canvas = document.getElementById("lab");
const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

const start = () => {
  try {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lab = createLab(canvas, {
      reduced,
      onSelect: (id) => document.dispatchEvent(new CustomEvent("lab:picked", { detail: id })),
    });
    document.addEventListener("lab:select", (e) => lab.select(e.detail));
    document.documentElement.classList.add("has-3d");
  } catch (err) {
    console.warn("3D lab unavailable", err);
  }
};

// Start after the page has loaded so the 3D never delays the first paint of the text.
if (canvas && hasWebGL()) {
  const go = () => ("requestIdleCallback" in window ? window.requestIdleCallback(start, { timeout: 800 }) : setTimeout(start, 50));
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
