/* Props that tell the situation at a glance, next to Agentztein in the app's stills (render-stills "scene-*"):
   a key for the API key, coins for the budget, a moon and z's for dreaming, a microphone for its voice, a magnifying
   glass for the radar, a code tile for its own code, a clipboard for exams, a card for credits.
   Plain three.js shapes in the creature's palette; offline only (they are photographed, never shipped live). */
import * as THREE from "three";
import { C } from "./agent.js";

const GOLD = 0xffc23d;
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15, ...o });
const metal = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.22 });
const glow = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4 });
const shade = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };

function tex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const FONT = "Figtree, 'Helvetica Neue', Arial, sans-serif";

/** A flat shape extruded with soft edges. */
const extrude = (shape, depth, mat, bevel = 0.03) =>
  new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 32 }), mat);

/** The API key: a big golden key with a Meta-blue bow. */
export function makeKey() {
  const g = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 24, 64), glossy(C.meta));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.25, 24), metal(GOLD));
  shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.95;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), metal(GOLD)); t1.position.set(1.36, -0.15, 0);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), metal(GOLD)); t2.position.set(1.16, -0.11, 0);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), metal(GOLD)); cap.position.x = 1.58;
  g.add(bow, shaft, t1, t2, cap);
  return shade(g);
}

/** The budget: a stack of coins with a $ on top. */
export function makeCoins(n = 4) {
  const g = new THREE.Group();
  const face = tex(256, 256, (c, w, h) => {
    c.fillStyle = "#ffc23d"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#e09a00"; c.lineWidth = 14; c.beginPath(); c.arc(w / 2, h / 2, 104, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#9a6400"; c.font = `800 150px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", w / 2, h / 2 + 8);
  });
  for (let i = 0; i < n; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.11, 48), [metal(GOLD), new THREE.MeshStandardMaterial({ map: face, metalness: 0.5, roughness: 0.3 }), metal(GOLD)]);
    coin.position.set((i % 2 ? 0.03 : -0.02), i * 0.12, (i % 3) * 0.015);
    coin.rotation.y = i * 0.6;
    g.add(coin);
  }
  return shade(g);
}

/** A warning disc (the budget is close to its limit). */
export function makeWarn() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.42); shape.lineTo(0.4, -0.28); shape.lineTo(-0.4, -0.28); shape.closePath();
  const tri = extrude(shape, 0.06, glossy(C.amber), 0.04);
  const bang = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({
    map: tex(128, 128, (c, w, h) => { c.fillStyle = "#1c2b33"; c.font = `900 96px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("!", w / 2, h / 2 + 6); }),
    transparent: true, toneMapped: false,
  }));
  bang.position.set(0, -0.02, 0.11);
  g.add(tri, bang);
  return shade(g);
}

/** Dreaming: a crescent moon, three z's and a few stars. */
export function makeDream() {
  const g = new THREE.Group();
  const moon = new THREE.Shape();
  moon.absarc(0, 0, 0.5, Math.PI * 0.35, Math.PI * 1.65, false);
  moon.absarc(0.22, 0, 0.4, Math.PI * 1.55, Math.PI * 0.45, true);
  const m = extrude(moon, 0.12, glow(0xffe08a), 0.05);
  m.rotation.z = -0.35;
  g.add(m);
  const zShape = (s) => {
    const z = new THREE.Shape();
    z.moveTo(-s, s); z.lineTo(s, s); z.lineTo(s, s * 0.6); z.lineTo(-s * 0.35, -s * 0.6); z.lineTo(s, -s * 0.6); z.lineTo(s, -s);
    z.lineTo(-s, -s); z.lineTo(-s, -s * 0.6); z.lineTo(s * 0.35, s * 0.6); z.lineTo(-s, s * 0.6); z.closePath();
    return z;
  };
  [[0.62, 0.42, 0.11], [0.88, 0.74, 0.15], [1.18, 1.12, 0.2]].forEach(([x, y, s]) => {
    const z = extrude(zShape(s), 0.05, glossy(0x8a7dff), 0.02);
    z.position.set(x, y, 0); z.rotation.z = 0.15;
    g.add(z);
  });
  [[-0.55, 0.62], [-0.2, 0.95], [0.3, 0.75], [-0.7, -0.2]].forEach(([x, y], i) => {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.06 + (i % 2) * 0.03), glow(0xfff3c4));
    st.position.set(x, y, 0.05);
    g.add(st);
  });
  return shade(g);
}

/** Its voice: a microphone with sound waves. */
export function makeMic() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.28, 8, 24), glossy(C.ink, { roughness: 0.5 }));
  head.position.y = 0.42;
  const grill = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.025, 12, 40), metal(C.metal));
  grill.rotation.x = Math.PI / 2; grill.position.y = 0.36;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 16), metal(C.metal));
  stem.position.y = -0.05;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 32), metal(C.metal));
  base.position.y = -0.3;
  g.add(head, grill, stem, base);
  [0.42, 0.62, 0.82].forEach((r, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 10, 40, Math.PI * 0.55), glossy(0x3ccf6e));
    arc.position.set(0.05, 0.42, 0); arc.rotation.z = -Math.PI * 0.27;
    arc.material.opacity = 1 - i * 0.22; arc.material.transparent = true;
    g.add(arc);
  });
  return shade(g);
}

/** The radar: a magnifying glass. */
export function makeLens() {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.07, 20, 64), glossy(0xff6600));
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 48), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, transmission: 0.6, transparent: true, opacity: 0.45, roughness: 0.05 }));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.62, 20), glossy(C.ink, { roughness: 0.5 }));
  handle.position.set(0.5, -0.5, 0); handle.rotation.z = Math.PI / 4;
  g.add(rim, glass, handle);
  return shade(g);
}

/** Its own code: a floating tile with </> . */
export function makeCodeTile() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.72, 0.1), glossy(C.ink, { roughness: 0.45 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.64), new THREE.MeshBasicMaterial({
    map: tex(512, 360, (c, w, h) => {
      c.fillStyle = "#14222b"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#4aa8ff"; c.font = `800 150px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("</>", w / 2, h / 2 - 20);
      c.fillStyle = "#22b864"; c.fillRect(70, h - 70, 160, 18); c.fillStyle = "#3a4b57"; c.fillRect(250, h - 70, 190, 18);
    }),
    toneMapped: false,
  }));
  face.position.z = 0.056;
  g.add(box, face);
  return shade(g);
}

/** Exams: a clipboard with ticked rows. */
export function makeClipboard() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.0, 0.06), glossy(0xb07a46, { roughness: 0.5 }));
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.84), new THREE.MeshBasicMaterial({
    map: tex(330, 420, (c, w) => {
      c.fillStyle = "#fff"; c.fillRect(0, 0, w, 420);
      for (let i = 0; i < 4; i++) {
        const y = 70 + i * 86;
        c.fillStyle = i < 3 ? "#22b864" : "#f0533c";
        c.font = `900 54px ${FONT}`; c.fillText(i < 3 ? "✓" : "✕", 26, y + 20);
        c.fillStyle = "#c9d2dc"; c.fillRect(96, y - 4, w - 130, 16);
      }
    }),
    toneMapped: false,
  }));
  sheet.position.set(0, -0.04, 0.035);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.08), metal(C.metal));
  clip.position.set(0, 0.48, 0.04);
  g.add(board, sheet, clip);
  return shade(g);
}

/** AI credits: a bank card. */
export function makeCard() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.64, 0.035), new THREE.MeshPhysicalMaterial({
    map: tex(500, 320, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#0081fb"); gr.addColorStop(1, "#6d5ce8");
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffd76a"; c.fillRect(40, 110, 70, 54);
      c.fillStyle = "rgba(255,255,255,.85)"; c.font = `700 34px ${FONT}`; c.fillText("•••• 2026", 40, 250);
    }),
    clearcoat: 1, roughness: 0.3,
  }));
  g.add(card);
  return shade(g);
}
