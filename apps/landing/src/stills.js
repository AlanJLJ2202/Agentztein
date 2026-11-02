// Offline only: exposes renderStill so tools/render-stills.mjs can photograph the 3D pieces.
import { renderStill } from "./lab.js";

window.renderStill = (which, size) => {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  renderStill(canvas, which, size);
  const url = canvas.toDataURL("image/webp", 0.92);
  canvas.remove();
  return url;
};
