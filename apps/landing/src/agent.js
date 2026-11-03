/* Agentztein en 3D: un agente armado por piezas, como Frankenstein, con el cerebro de Meta (Muse Spark)
   bajo una cúpula de vidrio. Tornillos en el cuello, costuras, y dos bobinas de Tesla que lo despiertan.
   Las habilidades que va creando aparecen como fichas hexagonales que orbitan a su alrededor. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const META_PATH =
  "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z";

export const C = {
  meta: 0x0081fb,
  ink: 0x1c2b33,
  white: 0xf5f7fa,
  skin: 0xa6e3c4,
  skin2: 0x8fd6b3,
  metal: 0xc9d2dc,
  ok: 0x22b864,
  amber: 0xffa928,
  red: 0xf0533c,
};

/* Language for the words drawn inside the 3D scenes (English by default). */
let LANG = "en";
export const setLanguage = (l) => { LANG = l === "es" ? "es" : "en"; };
export const tr = (o) => (typeof o === "string" ? o : o[LANG] ?? o.en);

/* The five frontier capabilities it builds skills for. */
export const SKILLS = [
  { id: "codigo", name: { en: "Code", es: "Código" }, color: 0x5b9bff },
  { id: "terminal", name: { en: "Terminal", es: "Terminal" }, color: 0x2ec4b6 },
  { id: "razonamiento", name: { en: "Reasoning", es: "Razonamiento" }, color: 0xff8f70 },
  { id: "web", name: { en: "Web", es: "Web" }, color: 0x3ccf6e },
  { id: "investigacion", name: { en: "Research", es: "Investigación" }, color: 0xff6600 },
];

const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const FONT = "Figtree, 'Helvetica Neue', Arial, sans-serif";
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0, ...o });
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, ...o });
const shadowed = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData = { g, c };
  return t;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* ---------- Meta logo, extruded ---------- */
export function makeMetaLogo(depth = 2.2, color = C.meta) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${META_PATH}"/></svg>`);
  const shapes = data.paths.flatMap((p) => p.toShapes(true));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.22, bevelSegments: 4, curveSegments: 24 });
  geo.center();
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, emissive: color, emissiveIntensity: 0.08 }));
  mesh.scale.set(0.055, -0.055, 0.055);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/* ---------- the chest screen ---------- */
const SCREENS = {
  off: () => {},
  pulse: (g, w, h, t = 0) => {
    g.strokeStyle = "#4aa8ff"; g.lineWidth = 7; g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    const mid = h / 2;
    for (let x = 24; x <= w - 24; x += 4) {
      const k = ((x + t * 160) % 120) / 120;
      const y = k > 0.42 && k < 0.5 ? mid - 38 : k > 0.5 && k < 0.58 ? mid + 26 : mid + Math.sin(x * 0.05) * 3;
      if (x === 24) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  },
  alert: (g, w, h) => {
    g.fillStyle = hex(C.amber);
    g.beginPath(); g.moveTo(w / 2, 28); g.lineTo(w / 2 + 62, h - 30); g.lineTo(w / 2 - 62, h - 30); g.closePath(); g.fill();
    g.fillStyle = "#1c2b33"; g.font = `800 64px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", w / 2, h / 2 + 18);
  },
  test: (g, w) => {
    for (let i = 0; i < 3; i++) {
      const y = 36 + i * 38;
      g.fillStyle = i < 2 ? hex(C.ok) : "#3a4b57"; rr(g, 30, y - 12, 24, 24, 6); g.fill();
      g.fillStyle = "#3a4b57"; rr(g, 66, y - 6, w - 110 - i * 30, 12, 6); g.fill();
    }
  },
  ok: (g, w, h) => {
    g.strokeStyle = hex(C.ok); g.lineWidth = 16; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(w / 2 - 48, h / 2); g.lineTo(w / 2 - 12, h / 2 + 34); g.lineTo(w / 2 + 54, h / 2 - 36); g.stroke();
  },
  sync: (g, w, h) => {
    g.strokeStyle = hex(C.amber); g.lineWidth = 12; g.lineCap = "round";
    g.beginPath(); g.arc(w / 2, h / 2, 44, 0.3, Math.PI - 0.3); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 44, Math.PI + 0.3, Math.PI * 2 - 0.3); g.stroke();
    g.fillStyle = hex(C.amber);
    g.beginPath(); g.moveTo(w / 2 - 62, h / 2 - 4); g.lineTo(w / 2 - 30, h / 2 - 4); g.lineTo(w / 2 - 46, h / 2 + 18); g.fill();
    g.beginPath(); g.moveTo(w / 2 + 62, h / 2 + 4); g.lineTo(w / 2 + 30, h / 2 + 4); g.lineTo(w / 2 + 46, h / 2 - 18); g.fill();
  },
};
function paintScreen(tex, kind, t) {
  const { g, c } = tex.userData;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "#0f1d26"; rr(g, 0, 0, c.width, c.height, 28); g.fill();
  (SCREENS[kind] || SCREENS.off)(g, c.width, c.height, t);
  tex.needsUpdate = true;
}

/* ---------- the creature ---------- */
function stitches(n, len, gap, mat) {
  const g = new THREE.Group();
  const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.018, 0.018), mat);
  g.add(line);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.022), mat);
    s.position.x = -len / 2 + gap / 2 + i * gap;
    s.rotation.z = 0.25;
    g.add(s);
  }
  return g;
}

export function makeAgent({ hover = false } = {}) {
  const A = new THREE.Group();
  const ink = std(C.ink, { roughness: 0.5 });
  const white = glossy(C.white);
  const skin = glossy(C.skin, { roughness: 0.5, clearcoat: 0.3 });
  const metal = std(C.metal, { metalness: 0.7, roughness: 0.25 });

  let thruster = null;
  if (hover) {
    // a levitation base, so it can move around the lab
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.22, 48), white);
    base.position.y = 0.0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 12, 64), std(C.meta, { emissive: C.meta, emissiveIntensity: 0.8 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.06;
    thruster = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.7, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7cc2ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    thruster.rotation.x = Math.PI; thruster.position.y = -0.48;
    A.add(base, ring, thruster);
  } else {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.36, 64), white);
    ped.position.y = -0.12;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.035, 12, 96), std(C.meta, { emissive: C.meta, emissiveIntensity: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.04;
    A.add(ped, ring);
  }

  // torso: two pieces sewn together
  const torso = new THREE.Group();
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.78, 0.9, 5, 0.22), white);
  top.position.y = 1.0;
  const bottom = new THREE.Mesh(new RoundedBoxGeometry(1.32, 0.6, 0.82, 5, 0.2), glossy(0xe3ebf3));
  bottom.position.y = 0.42;
  const waist = stitches(7, 1.2, 0.17, ink); waist.position.set(0, 0.69, 0.43);
  torso.add(top, bottom, waist);
  const screenTex = canvasTex(256, 160, () => {});
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, toneMapped: false }));
  screen.position.set(0, 1.0, 0.452);
  torso.add(screen);
  A.add(torso);

  // arms (pivot at the shoulder); the left one is a different piece, sewn on
  const arm = (side, mat) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.86, 1.22, 0);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 8, 16), mat);
    up.position.y = -0.33;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), skin);
    hand.position.y = -0.74;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 10, 32), metal);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.58;
    const sh = stitches(4, 0.32, 0.08, ink); sh.position.set(0, -0.06, 0.16); sh.rotation.z = Math.PI / 2;
    pivot.add(up, hand, cuff);
    if (side < 0) pivot.add(sh);
    pivot.userData.hand = hand;
    return pivot;
  };
  const armL = arm(-1, glossy(0xdbe9ff)), armR = arm(1, white);
  armL.rotation.z = -0.12; armR.rotation.z = 0.12;
  A.add(armL, armR);

  // neck + bolts
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.32, 32), skin);
  neck.position.y = 1.52;
  A.add(neck);
  const bolts = [-1, 1].map((s) => {
    const b = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 16), metal);
    shaft.rotation.z = Math.PI / 2; shaft.position.x = s * 0.17;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), metal);
    nut.rotation.z = Math.PI / 2; nut.position.x = s * 0.3;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), std(C.meta, { emissive: C.meta, emissiveIntensity: 0.3 }));
    tip.position.x = s * 0.38;
    b.add(shaft, nut, tip);
    b.position.set(s * 0.2, 1.5, 0);
    b.userData.tip = tip;
    A.add(b);
    return b;
  });

  // head
  const head = new THREE.Group();
  head.position.y = 1.68;
  A.add(head);
  const skull = new THREE.Mesh(new RoundedBoxGeometry(1.24, 1.08, 1.04, 6, 0.26), skin);
  skull.position.y = 0.54;
  const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.22, 0.06, 3, 0.03), glossy(C.skin2, { roughness: 0.5, clearcoat: 0.3 }));
  cheek.position.set(0.36, 0.16, 0.5);
  const scar = stitches(4, 0.4, 0.1, ink); scar.position.set(-0.47, 0.42, 0.5); scar.rotation.z = 1.25;
  const seam = stitches(3, 0.26, 0.085, ink); seam.position.set(0.5, 0.66, 0.49); seam.rotation.z = Math.PI / 2;
  head.add(skull, cheek, scar, seam);

  // forehead band with the Meta logo, and the glass dome with the brain
  const logo = makeMetaLogo(2.4);
  logo.scale.setScalar(0.24); logo.position.set(0, 1.14, 0.5);
  head.add(logo);
  const brain = makeBrain();
  brain.position.y = 1.2;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide }),
  );
  dome.position.y = 1.08; dome.renderOrder = 5;
  const domeRim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 10, 48), metal);
  domeRim.rotation.x = Math.PI / 2; domeRim.position.y = 1.09;
  head.add(brain, dome, domeRim);

  // face
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), std(0xffffff, { roughness: 0.2 }));
    white.scale.z = 0.5;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), std(C.ink, { emissive: C.meta, emissiveIntensity: 0 }));
    pupil.position.z = 0.065; pupil.scale.z = 0.5;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(0.03, 0.03, 0.11);
    e.add(white, pupil, glint);
    e.position.set(s * 0.26, 0.62, 0.5);
    e.userData = { pupil, glint };
    head.add(e);
    return e;
  });
  const brows = [-1, 1].map((s) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.08, 0.08, 2, 0.03), ink);
    b.position.set(s * 0.26, 0.84, 0.53);
    head.add(b);
    return b;
  });
  const mouth = new THREE.Group();
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.026, 8, 40, Math.PI * 0.55), ink);
  lip.rotation.z = Math.PI + Math.PI * 0.225;
  lip.position.y = 0.22;
  mouth.add(lip);
  const flat = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.035, 0.03, 2, 0.012), ink);
  mouth.add(flat);
  for (let i = -2; i <= 2; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.02), ink);
    s.position.set(i * 0.075, 0.0, 0);
    mouth.add(s);
  }
  mouth.position.set(0, 0.28, 0.52);
  head.add(mouth);
  mouth.userData = { lip };

  shadowed(A);
  if (thruster) thruster.castShadow = false;
  dome.castShadow = false;
  screen.castShadow = false;

  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.2, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.4;
  A.add(hit);

  A.userData = { head, eyes, brows, mouth, armL, armR, bolts, brain, screenTex, hit, thruster, power: 0, mood: "idle", look: new THREE.Vector2() };
  return A;
}

function makeBrain() {
  const geo = new THREE.IcosahedronGeometry(0.36, 20);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const folds = Math.sin(n.x * 12 + Math.sin(n.y * 7)) * Math.sin(n.y * 10 + n.z * 4) * Math.sin(n.z * 11 - n.x * 3);
    const split = Math.exp(-Math.pow(n.x * 9, 2)) * 0.1;
    v.copy(n.multiplyScalar(0.36 * (1 + folds * 0.06 - split)));
    pos.setXYZ(i, v.x * 1.05, Math.max(v.y * 0.8, -0.05), v.z * 1.1);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x8cc4ff, roughness: 0.3, clearcoat: 0.8, emissive: C.meta, emissiveIntensity: 0.15 }));
}

/* expressions: sleep, idle, think, alert, happy */
export function pose(agent, mood, t = 0, dt = 1) {
  const u = agent.userData;
  const k = Math.min(1, dt * 6);
  const lerp = (o, key, v) => { o[key] += (v - o[key]) * k; };
  const on = u.power;
  // eyes: half-closed when asleep, blink when awake
  const blink = on > 0.9 && Math.sin(t * 0.9) > 0.985 ? 0.1 : 1;
  const open = mood === "sleep" ? 0.12 : mood === "happy" ? 0.75 : blink;
  u.eyes.forEach((e, i) => {
    lerp(e.scale, "y", open);
    e.userData.pupil.material.emissiveIntensity = on * (mood === "alert" ? 0.2 : 0.55);
    e.userData.pupil.material.emissive.setHex(mood === "alert" ? C.amber : C.meta);
    e.userData.pupil.position.x = THREE.MathUtils.clamp(u.look.x * 0.04, -0.04, 0.04);
    e.userData.pupil.position.y = THREE.MathUtils.clamp(u.look.y * 0.035, -0.03, 0.035);
    const tilt = mood === "think" ? (i ? -0.25 : 0.08) : mood === "alert" ? (i ? -0.3 : 0.3) : mood === "happy" ? (i ? 0.12 : -0.12) : 0;
    lerp(u.brows[i].rotation, "z", tilt);
    lerp(u.brows[i].position, "y", mood === "think" && i ? 0.9 : mood === "happy" ? 0.88 : 0.84);
  });
  u.mouth.userData.lip.visible = mood === "happy";
  u.mouth.children.slice(1).forEach((s) => { s.visible = mood !== "happy"; });
  u.brain.material.emissiveIntensity = 0.1 + on * (0.45 + Math.sin(t * 3) * 0.12);
  u.bolts.forEach((b) => { b.userData.tip.material.emissiveIntensity = 0.2 + on * 0.9; });
  // head follows the look target, tilts a little with the mood
  lerp(u.head.rotation, "y", u.look.x * 0.35);
  lerp(u.head.rotation, "x", -u.look.y * 0.18 + (mood === "sleep" ? 0.28 : 0));
  lerp(u.head.rotation, "z", mood === "think" ? 0.12 : mood === "alert" ? -0.06 : 0);
  u.head.position.y = 1.68 + (mood === "sleep" ? -0.04 : Math.sin(t * 1.6) * 0.012 * on);
}

export function setArms(agent, l = -0.12, r = 0.12, lx = 0, rx = 0) {
  const u = agent.userData;
  u.armL.rotation.set(lx, 0, l);
  u.armR.rotation.set(rx, 0, r);
}

/* ---------- lab props ---------- */
export function makeCoil(x) {
  const g = new THREE.Group();
  const white = glossy(C.white);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 40), white);
  base.position.y = 0.0;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 24), std(0xe3ebf3));
  col.position.y = 1.1;
  g.add(base, col);
  for (let i = 0; i < 9; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 10, 32), std(i % 2 ? C.meta : 0xb7d8ff, { roughness: 0.3 }));
    r.rotation.x = Math.PI / 2; r.position.y = 0.4 + i * 0.17;
    g.add(r);
  }
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 16, 48), std(C.metal, { metalness: 0.75, roughness: 0.2 }));
  torus.rotation.x = Math.PI / 2; torus.position.y = 2.1;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), std(C.meta, { emissive: C.meta, emissiveIntensity: 0.5 }));
  ball.position.y = 2.24;
  g.add(torus, ball);
  g.position.x = x;
  g.userData.top = ball;
  return shadowed(g);
}

/* A jagged bolt of light between two points; call update() to re-jag it. */
export function makeBolt(color = 0x7cc2ff) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.MeshBasicMaterial({ color: C.meta, transparent: true, opacity: 0.25, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  const halo = new THREE.Mesh(new THREE.BufferGeometry(), glow);
  g.add(halo, core);
  g.renderOrder = 6;
  g.update = (a, b, jag = 0.18) => {
    const pts = [a.clone()];
    const n = 9;
    for (let i = 1; i < n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.x += (Math.random() - 0.5) * jag; p.y += (Math.random() - 0.5) * jag; p.z += (Math.random() - 0.5) * jag;
      pts.push(p);
    }
    pts.push(b.clone());
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1);
    core.geometry.dispose(); halo.geometry.dispose();
    core.geometry = new THREE.TubeGeometry(curve, 40, 0.018, 5, false);
    halo.geometry = new THREE.TubeGeometry(curve, 40, 0.06, 6, false);
  };
  return g;
}

export function makeChip(skill, { label = true } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 6), glossy(skill.color, { emissive: skill.color, emissiveIntensity: 0.12 }));
  body.rotation.x = Math.PI / 2;
  body.rotation.y = Math.PI / 6;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.25, 6), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h);
      c.fillStyle = hex(skill.color);
      // a little circuit: the "skill"
      c.fillRect(70, 98, 116, 10); c.fillRect(70, 124, 80, 10); c.fillRect(70, 150, 100, 10);
      c.beginPath(); c.arc(190, 129, 14, 0, Math.PI * 2); c.fill();
    }),
    toneMapped: false,
  }));
  face.position.z = 0.047;
  face.rotation.z = Math.PI / 6;
  g.add(body, face);
  if (label) {
    const draw = (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const text = tr(skill.name);
      let size = 64;
      c.font = `700 ${size}px ${FONT}`;
      while (c.measureText(text).width > w - 110 && size > 36) { size -= 4; c.font = `700 ${size}px ${FONT}`; }
      c.fillStyle = "rgba(255,255,255,0.94)"; rr(c, 0, 0, w, h, 70); c.fill();
      c.fillStyle = hex(skill.color); c.beginPath(); c.arc(56, h / 2, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#1c2b33"; c.textBaseline = "middle"; c.fillText(text, 92, h / 2 + 4);
    };
    const map = canvasTex(512, 140, draw);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.17), new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthWrite: false }));
    tag.position.set(0, -0.4, 0);
    g.add(tag);
    g.userData.tag = tag;
    g.userData.relabel = () => { draw(map.userData.g, 512, 140); map.needsUpdate = true; };
  }
  g.userData.body = body;
  return shadowed(g);
}

export function makePaper(rows, { title = "", bad = -1, warn = -1, w = 0.95, h = 1.2 } = {}) {
  const tex = canvasTex(380, 480, (c, W, H) => {
    c.fillStyle = "#ffffff"; rr(c, 0, 0, W, H, 26); c.fill();
    c.fillStyle = "#1c2b33"; c.font = `700 34px ${FONT}`; c.fillText(title, 30, 58);
    rows.forEach((r, i) => {
      const y = 96 + i * 72;
      const isBad = i === bad, isWarn = i === warn;
      c.fillStyle = isBad ? "#fde6e1" : isWarn ? "#ffefcf" : "#f1f4f7"; rr(c, 22, y, W - 44, 58, 14); c.fill();
      c.fillStyle = "#1c2b33"; c.font = `600 24px ${FONT}`; c.fillText(r[0], 40, y + 37);
      c.textAlign = "right"; c.fillText(r[1], W - 40, y + 37); c.textAlign = "left";
      if (isBad) { c.strokeStyle = "#c42d12"; c.lineWidth = 4; c.beginPath(); c.moveTo(36, y + 30); c.lineTo(W - 36, y + 30); c.stroke(); }
    });
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

export function makeBadge(kind) {
  const color = kind === "ok" ? C.ok : kind === "x" ? C.red : C.amber;
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 40), glossy(color));
  disc.rotation.x = Math.PI / 2;
  const sym = new THREE.Mesh(new THREE.CircleGeometry(0.22, 40), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, (c, w, h) => {
      c.strokeStyle = "#fff"; c.lineWidth = 30; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
      if (kind === "ok") { c.moveTo(70, 132); c.lineTo(112, 174); c.lineTo(188, 90); }
      else if (kind === "x") { c.moveTo(84, 84); c.lineTo(172, 172); c.moveTo(172, 84); c.lineTo(84, 172); }
      else { c.arc(w / 2, h / 2, 62, 0.4, Math.PI * 1.6); }
      c.stroke();
      if (kind === "sync") { c.fillStyle = "#fff"; c.beginPath(); c.moveTo(150, 52); c.lineTo(190, 72); c.lineTo(150, 98); c.fill(); }
    }),
    transparent: true, toneMapped: false,
  }));
  sym.position.z = 0.045;
  g.add(disc, sym);
  return shadowed(g);
}

/* ---------- benchmark props (one picture per benchmark) ---------- */
function windowPanel(w, h, dark, draw) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.1, 4, 0.06), glossy(dark ? 0x17242d : 0xffffff));
  const tex = canvasTex(512, Math.round((512 * h) / w), (c, W, H) => {
    c.fillStyle = dark ? "#17242d" : "#ffffff"; c.fillRect(0, 0, W, H);
    ["#ff6159", "#ffbd2e", "#28c941"].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(30 + i * 26, 28, 9, 0, Math.PI * 2); c.fill(); });
    draw(c, W, H);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.z = 0.052;
  g.add(body, face);
  return g;
}
export function makeBench(id) {
  const g = new THREE.Group();
  if (id === "swe") {
    const win = windowPanel(1.5, 1.05, false, (c, W) => {
      const rows = [["#1c2b33", 0.5], ["#1c2b33", 0.7], ["#f0533c", 0.62, "#fde6e1"], ["#18794e", 0.66, "#ddf3e6"], ["#1c2b33", 0.4], ["#1c2b33", 0.55]];
      rows.forEach(([col, len, bg], i) => {
        const y = 62 + i * 46;
        if (bg) { c.fillStyle = bg; c.fillRect(0, y - 8, W, 40); }
        c.fillStyle = "#9aa7b2"; c.font = "600 20px monospace"; c.fillText(String(41 + i), 18, y + 19);
        c.fillStyle = col; rr(c, 64, y + 4, (W - 90) * len, 16, 8); c.fill();
      });
    });
    win.position.set(0, 0.75, 0); win.rotation.set(-0.08, -0.25, 0);
    const badge = makeBadge("ok"); badge.position.set(0.72, 1.25, 0.25); badge.scale.setScalar(0.9);
    g.add(win, badge);
  } else if (id === "terminal") {
    const win = windowPanel(1.5, 1.05, true, (c) => {
      c.font = "600 24px monospace";
      [["$ ", "make build", "#e7eef3"], ["ok ", "compiló sin errores", "#3ccf6e"], ["$ ", "pytest -q", "#e7eef3"], ["ok ", "128 pruebas pasan", "#3ccf6e"], ["$ ", "", "#e7eef3"]].forEach(([p, t, col], i) => {
        const y = 92 + i * 52;
        c.fillStyle = "#4aa8ff"; c.fillText(p, 24, y); c.fillStyle = col; c.fillText(t, 58, y);
      });
      c.fillStyle = "#e7eef3"; c.fillRect(60, 92 + 4 * 52 - 22, 14, 28);
    });
    win.position.set(0, 0.75, 0); win.rotation.set(-0.08, 0.25, 0);
    g.add(win);
  } else if (id === "arc") {
    const pal = [0x1c2b33, 0x0081fb, 0xf0533c, 0x22b864, 0xffc83d, 0xb7c2ce, 0xff6fb5];
    const pattern = ["0000000", "0111110", "0122210", "0123210", "0122210", "0111110", "0000000"];
    const tray = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.08, 1.6, 3, 0.04), glossy(0xffffff));
    tray.position.y = 0.04;
    g.add(tray);
    pattern.forEach((row, z) => [...row].forEach((v, x) => {
      const k = Number(v);
      const h = k === 3 ? 0.42 : k === 2 ? 0.22 : 0.1;
      const cube = new THREE.Mesh(new RoundedBoxGeometry(0.19, h, 0.19, 2, 0.03), glossy(pal[k === 0 ? 5 : k === 1 ? 1 : k === 2 ? 4 : 2]));
      cube.position.set((x - 3) * 0.21, 0.08 + h / 2, (z - 3) * 0.21);
      g.add(cube);
    }));
    const q = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.19, 0.19, 2, 0.03), glossy(pal[6]));
    q.position.set(0.45, 0.85, 0.2);
    g.add(q);
    g.rotation.y = 0.5;
  } else if (id === "web") {
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 32), glossy(0xdff0ff, { roughness: 0.3 }));
    globe.position.y = 0.75;
    g.add(globe);
    const lineMat = std(C.meta);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.555, 0.014, 8, 64), lineMat);
      m.position.y = 0.75; m.rotation.y = (i * Math.PI) / 4;
      g.add(m);
    }
    [-0.3, 0, 0.3].forEach((y) => {
      const r = Math.sqrt(0.555 * 0.555 - y * y);
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 64), lineMat);
      m.rotation.x = Math.PI / 2; m.position.y = 0.75 + y;
      g.add(m);
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 12, 40), std(C.ink, { roughness: 0.3 }));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.23, 32), new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.4, roughness: 0 }));
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 12), std(C.ink));
    handle.position.y = -0.45;
    const mag = new THREE.Group(); mag.add(ring, lens, handle);
    mag.position.set(0.55, 0.62, 0.45); mag.rotation.set(0, -0.4, 0.7);
    g.add(mag);
  } else if (id === "research") {
    const pts = [[0, 0], [0.42, 0], [0.45, 0.04], [0.45, 0.12], [0.16, 0.62], [0.13, 0.66], [0.13, 0.9], [0.16, 0.93]].map(([x, y]) => new THREE.Vector2(x, y));
    const flask = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.03, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    const liq = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.01], [0.41, 0.01], [0.43, 0.05], [0.43, 0.12], [0.3, 0.33], [0, 0.33]].map(([x, y]) => new THREE.Vector2(x, y)), 48), std(0xffb53d, { emissive: 0xffb53d, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }));
    const fl = new THREE.Group(); fl.add(liq, flask); fl.position.set(-0.4, 0, 0.1);
    g.add(fl);
    [0.35, 0.6, 0.95].forEach((h, i) => {
      const bar = new THREE.Mesh(new RoundedBoxGeometry(0.2, h, 0.2, 2, 0.03), glossy(i === 2 ? C.meta : 0xb7d8ff));
      bar.position.set(0.25 + i * 0.26, h / 2, -0.05);
      g.add(bar);
    });
  } else if (id === "horizon") {
    const frameMat = std(C.metal, { metalness: 0.6, roughness: 0.25 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 40), frameMat); top.position.y = 1.36;
    const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 40), frameMat); bot.position.y = 0.04;
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.03, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
    const prof = [[0.04, 0], [0.34, 0.08], [0.36, 0.25], [0.2, 0.5], [0.05, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
    const lower = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), glassMat); lower.position.y = 0.08;
    const upper = lower.clone(); upper.rotation.x = Math.PI; upper.position.y = 1.32;
    const sand = std(0xffc83d, { roughness: 0.8 });
    const pile = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 32), sand); pile.position.y = 0.2;
    const rest = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 32), sand); rest.position.y = 1.02; rest.rotation.x = Math.PI;
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), sand); stream.position.y = 0.58;
    g.add(top, bot, lower, upper, pile, rest, stream);
    [[-0.38, -0.38], [0.38, -0.38], [0, 0.42]].forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.32, 12), frameMat);
      post.position.set(x, 0.7, z); g.add(post);
    });
  }
  return shadowed(g);
}

/* ---------- renderer + lights ---------- */
export function setupRenderer(canvas, preserve = false) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}
export function addLights(scene, renderer, { extent = 5, mapSize = 2048 } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe8f2, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mapSize, mapSize);
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xbfdcff, 0.8);
  rim.position.set(-4, 4, -4);
  scene.add(rim);
  return sun;
}
export function makeFloor(r = 3.8) {
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 96), glossy(0xffffff, { roughness: 0.6, clearcoat: 0.2 }));
  floor.position.y = -0.45;
  floor.receiveShadow = true;
  return floor;
}
export { paintScreen, canvasTex, rr, glossy, std, shadowed, hex, FONT, windowPanel };
