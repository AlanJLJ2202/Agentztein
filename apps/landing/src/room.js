/* The walkable lab: a small building. In the middle, the cradle, where the coils bring Agentztein to life;
   around it, one themed room per frontier benchmark, each with three exhibits explained in plain words
   (museum.js). Third person: tap the floor, a door or an exhibit and it walks there (through the doors).
   First person: you see through its eyes; drag to look, WASD / arrows to walk, E to interact.
   The page sends "room:goto" / "room:key" / "room:react"; it hears back arrive, move, guide and view events. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  C, makeAgent, pose, setArms, makeCoil, makeBolt, makeChip, makeBadge, setupRenderer, addLights, paintScreen,
  makeMetaLogo, tr, canvasTex, rr, windowPanel, FONT,
} from "./agent.js";
import { ROOMS } from "./museum.js";

const H = 3; // wall height
const R = 0.42; // agent radius
const HOVER_Y = 0.38;
const EYE = 1.72;
const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25, ...o });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const box = (w, h, d, color, o) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.15), glossy(color, o));
const ease = (k) => 1 - Math.pow(1 - k, 3);

/* ---------- layout: the cradle in the middle, two rooms per side ---------- */
// rot turns the room so its local +z (where the door is) faces the cradle
export const LAYOUT = [
  { id: "cuna", rect: [-6, -6, 6, 6] },
  { id: "swe", center: [-10, -3], rot: Math.PI / 2, door: [-6, -3], normal: [-1, 0] },
  { id: "terminal", center: [-10, 3], rot: Math.PI / 2, door: [-6, 3], normal: [-1, 0] },
  { id: "arc", center: [-3, -10], rot: 0, door: [-3, -6], normal: [0, -1] },
  { id: "web", center: [3, -10], rot: 0, door: [3, -6], normal: [0, -1] },
  { id: "research", center: [10, -3], rot: -Math.PI / 2, door: [6, -3], normal: [1, 0] },
  { id: "horizon", center: [10, 3], rot: -Math.PI / 2, door: [6, 3], normal: [1, 0] },
].map((r) => {
  if (r.rect) return r;
  const side = Math.abs(r.normal[0]) ? [4, 3] : [3, 4]; // half extents in x, z
  return { ...r, rect: [r.center[0] - side[0], r.center[1] - side[1], r.center[0] + side[0], r.center[1] + side[1]] };
});
const BYID = Object.fromEntries(LAYOUT.map((r) => [r.id, r]));
export const STATIONS = LAYOUT.map((r) => ({ id: r.id, name: ROOMS[r.id].bench ?? ROOMS[r.id].name, color: ROOMS[r.id].color }));

// walls as segments [x1, z1, x2, z2], with gaps for the doors
const WALLS = [
  [-6, -6, -6, -4], [-6, -2, -6, 2], [-6, 4, -6, 6], [6, -6, 6, -4], [6, -2, 6, 2], [6, 4, 6, 6],
  [-6, -6, -4, -6], [-2, -6, 2, -6], [4, -6, 6, -6], [-6, 6, 6, 6],
  [-14, -6, -14, 6], [-14, -6, -6, -6], [-14, 6, -6, 6], [-14, 0, -6, 0],
  [-6, -14, 6, -14], [-6, -14, -6, -6], [6, -14, 6, -6], [0, -14, 0, -6],
  [14, -6, 14, 6], [6, -6, 14, -6], [6, 6, 14, 6], [6, 0, 14, 0],
];

export function roomAt(x, z) {
  for (const r of LAYOUT) { const [x1, z1, x2, z2] = r.rect; if (x >= x1 && x <= x2 && z >= z1 && z <= z2) return r.id; }
  return null;
}

/* ---------- canvas helpers ---------- */
function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = test;
  }
  if (line) g.fillText(line, x, y);
  return y;
}
function plane(w, h, pxW, draw, { basic = true, transparent = false } = {}) {
  const pxH = Math.round((pxW * h) / w);
  const t = canvasTex(pxW, pxH, draw);
  t.userData.redraw = () => { const { g, c } = t.userData; g.clearRect(0, 0, c.width, c.height); draw(g, c.width, c.height); t.needsUpdate = true; };
  const mat = basic ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, transparent });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
function sign(text, color, w = 2.6) {
  const draw = (g, W, Hh) => {
    const s = tr(text());
    let size = 64; g.font = `800 ${size}px ${FONT}`;
    while (g.measureText(s).width > W - 150 && size > 34) { size -= 3; g.font = `800 ${size}px ${FONT}`; }
    g.fillStyle = "#ffffff"; rr(g, 4, 4, W - 8, Hh - 8, (Hh - 8) / 2); g.fill();
    g.fillStyle = hex(color); g.beginPath(); g.arc(70, Hh / 2, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1c2b33"; g.textBaseline = "middle"; g.fillText(s, 110, Hh / 2 + 3);
  };
  const m = plane(w, 0.42, 1100, draw, { transparent: true });
  m.renderOrder = 6;
  return m;
}

/* ---------- the building ---------- */
export function buildRoom(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const relabels = [];
  const walls = new THREE.Group();
  root.add(walls);

  // floors: white in the cradle, tinted per room
  LAYOUT.forEach((r) => {
    const [x1, z1, x2, z2] = r.rect;
    const color = r.id === "cuna" ? "#f7f9fb" : `color-mix(in srgb, ${hex(ROOMS[r.id].color)} 9%, #f7f9fb)`;
    const tile = canvasTex(256, 256, (g, w) => {
      g.fillStyle = "#f7f9fb"; g.fillRect(0, 0, w, w);
      g.fillStyle = color; g.fillRect(0, 0, w, w);
      g.strokeStyle = r.id === "cuna" ? "#e3e9ef" : hex(ROOMS[r.id].color) + "33"; g.lineWidth = 6; g.strokeRect(0, 0, w, w);
    });
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set((x2 - x1) / 1.5, (z2 - z1) / 1.5);
    const f = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 0.3, z2 - z1), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.6 }));
    f.position.set((x1 + x2) / 2, -0.15, (z1 + z2) / 2);
    f.receiveShadow = true;
    root.add(f);
  });
  const floorHit = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), new THREE.MeshBasicMaterial({ visible: false }));
  floorHit.rotation.x = -Math.PI / 2; floorHit.position.set(0, 0.01, -4);
  root.add(floorHit);

  // walls (they shrink to a cutaway in third person)
  const wallMat = glossy(0xffffff, { roughness: 0.75, clearcoat: 0.1 });
  WALLS.forEach(([x1, z1, x2, z2]) => {
    const len = Math.hypot(x2 - x1, z2 - z1) + 0.2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(x1 === x2 ? 0.2 : len, H, x1 === x2 ? len : 0.2), wallMat);
    w.geometry.translate(0, H / 2, 0);
    w.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    w.receiveShadow = true;
    walls.add(w);
  });

  // door frames with the room's name on both faces
  const doors = [];
  LAYOUT.filter((r) => r.door).forEach((r) => {
    const room = ROOMS[r.id];
    const g = new THREE.Group();
    g.position.set(r.door[0], 0, r.door[1]);
    g.rotation.y = Math.atan2(r.normal[0], r.normal[1]);
    const mat = std(room.color, { emissive: room.color, emissiveIntensity: 0.2 });
    [-1.05, 1.05].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.34), mat); p.position.set(x, 1.35, 0); g.add(p); });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.2, 0.34), mat); top.position.y = 2.7; g.add(top);
    [1, -1].forEach((s) => {
      const lab = sign(() => (s > 0 ? room.bench ?? room.name : ROOMS.cuna.name), s > 0 ? room.color : ROOMS.cuna.color, 2.4);
      lab.position.set(0, 3.12, s * -0.2); lab.rotation.y = s > 0 ? Math.PI : 0;
      relabels.push(() => lab.material.map.userData.redraw());
      g.add(lab);
    });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.3; g.add(hit);
    root.add(g);
    doors.push({ id: r.id, group: g, mat, hit });
  });

  // rooms and their exhibits
  const exhibits = [];
  const updates = [];
  const obstacles = []; // circles [x, z, r]
  const extra = { pods: {} };
  LAYOUT.forEach((r) => {
    const g = new THREE.Group();
    if (r.id === "cuna") g.position.set(0, 0, 0);
    else { g.position.set(r.center[0], 0, r.center[1]); g.rotation.y = r.rot; }
    root.add(g);
    const built = THEMES[r.id](g, { relabels, room: ROOMS[r.id], extra });
    if (r.id !== "cuna") addPod(g, r.id, built, relabels, extra);
    g.updateMatrixWorld(true);
    built.exhibits.forEach((ex) => {
      const world = g.localToWorld(new THREE.Vector3(ex.at[0], 0, ex.at[1]));
      const stand = g.localToWorld(new THREE.Vector3(ex.stand[0], 0, ex.stand[1]));
      if (ex.solid) obstacles.push([world.x, world.z, ex.solid]);
      (ex.blocks ?? []).forEach(([bx, bz, br]) => { const w = g.localToWorld(new THREE.Vector3(bx, 0, bz)); obstacles.push([w.x, w.z, br]); });
      ex.hits.forEach((h) => { h.userData.exhibit = `${r.id}:${ex.key}`; });
      exhibits.push({ ...ex, room: r.id, id: `${r.id}:${ex.key}`, world, standWorld: stand });
    });
    if (built.update) updates.push(built.update);
    if (built.mural) relabels.push(built.mural);
  });

  return { root, walls, floorHit, doors, exhibits, updates, obstacles, extra, relabel: () => relabels.forEach((f) => f()) };
}


/* A cryo pod with a copy of Agentztein asleep inside. It wakes up to run the room's test (a simulation). */
function addPod(g, id, built, relabels, extra) {
  const room = ROOMS[id];
  const at = id === "arc" ? [2.5, -3.45] : [2.3, -3.2];
  const pod = new THREE.Group(); pod.position.set(at[0], 0, at[1]); g.add(pod);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.14, 40), glossy(0xffffff)); base.position.y = 0.07;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 10, 48), std(room.color, { emissive: room.color, emissiveIntensity: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.9, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.38, roughness: 0.12, side: THREE.DoubleSide, depthWrite: false, emissive: 0x9fd3ff, emissiveIntensity: 0.22 }));
  glass.position.y = 1.1;
  const mist = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.54, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.45, depthWrite: false }));
  mist.position.y = 0.5;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.6, 0.16, 40), glossy(0xffffff)); cap.position.y = 2.12;
  const capRing = ring.clone(); capRing.position.y = 2.02;
  pod.add(base, ring, glass, mist, cap, capRing);
  const sleeper = makeAgent();
  sleeper.scale.setScalar(0.62);
  sleeper.position.set(at[0], 0.14, at[1]);
  const home = new THREE.Vector3(at[0], 0.14, at[1]);
  sleeper.rotation.y = Math.atan2(-at[0], -at[1]); // facing the middle of the room
  sleeper.userData.power = 0.04;
  for (let i = 0; i < 20; i++) pose(sleeper, "sleep", 0, 0.1);
  paintScreen(sleeper.userData.screenTex, "off", 0);
  g.add(sleeper);
  plaque(g, at[0] - 1.05, at[1] + 1.25, built.exhibits.length + 1, room.items.pod.title, room.color, relabels, -0.5);
  const main = built.exhibits[0];
  built.exhibits.push({ key: "pod", at, stand: [at[0] - 1.0, at[1] + 1.7], solid: 0.65, hits: [glass, base, cap], act: () => extra.runExercise?.(id) });
  extra.pods[id] = { pod, glass, mist, sleeper, home, front: new THREE.Vector3(main.stand[0], 0.14, main.stand[1] - 0.4), look: new THREE.Vector3(main.at[0], 0, main.at[1]), mood: "sleep", awake: false, busy: 0 };
}

/* A plaque in front of each exhibit: number + title. */
function plaque(g, x, z, n, title, color, relabels, face = 0) {
  const p = new THREE.Group();
  p.position.set(x, 0, z); p.rotation.y = face;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 10), std(0xc9d2dc)); post.position.y = 0.45;
  const panel = plane(0.95, 0.42, 480, (gg, W, Hh) => {
    gg.fillStyle = "#ffffff"; rr(gg, 0, 0, W, Hh, 24); gg.fill();
    gg.fillStyle = hex(color); gg.beginPath(); gg.arc(48, Hh / 2, 30, 0, Math.PI * 2); gg.fill();
    gg.fillStyle = "#fff"; gg.font = `800 34px ${FONT}`; gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText(String(n), 48, Hh / 2 + 2);
    gg.textAlign = "left"; gg.fillStyle = "#1c2b33"; gg.font = `800 30px ${FONT}`;
    wrapText(gg, tr(title), 96, Hh / 2 - 14, W - 112, 34);
  }, { transparent: true });
  panel.position.set(0, 0.98, 0); panel.rotation.x = -0.5;
  p.add(post, panel);
  relabels.push(() => panel.material.map.userData.redraw());
  g.add(p);
  return p;
}

/* A mural on the back wall of a room: its name, the benchmark and the one-line idea. */
function mural(g, room, draw) {
  const m = plane(5.4, 1.4, 1300, (gg, W, Hh) => {
    gg.fillStyle = "#ffffff"; rr(gg, 0, 0, W, Hh, 40); gg.fill();
    gg.fillStyle = hex(room.color); rr(gg, 0, 0, 24, Hh, 12); gg.fill();
    draw?.(gg, W, Hh);
    gg.fillStyle = hex(room.color); gg.font = `800 34px ${FONT}`; gg.fillText(tr(room.kind).toUpperCase() + (room.bench ? "  ·  " + tr(room.bench) : ""), 60, 70);
    gg.fillStyle = "#1c2b33"; gg.font = `800 64px ${FONT}`; gg.fillText(tr(room.name), 60, 150);
    gg.fillStyle = "#4b5f6d"; gg.font = `500 32px ${FONT}`; wrapText(gg, tr(room.intro), 60, 205, W - 380, 40);
  }, { transparent: true });
  m.position.set(0, 2.2, -3.86);
  g.add(m);
  return () => m.material.map.userData.redraw();
}

/* A tiny animation runner for the exhibits. */
const anims = [];
function anim(dur, fn, delay = 0) { anims.push({ t: -delay, dur, fn }); }
function runAnims(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    a.t += dt;
    if (a.t < 0) continue;
    const k = Math.min(1, a.t / a.dur);
    a.fn(ease(k), k);
    if (k >= 1) anims.splice(i, 1);
  }
}

/* ---------- themes ---------- */
const T = {};
T.cuna = (g, { relabels, room, extra }) => {
  // the cradle against the back wall, between the two north doors
  const cradle = new THREE.Group(); cradle.position.set(0, 0, -4.3); g.add(cradle);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.14, 64), glossy(0xffffff)); plat.position.y = 0.07; plat.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 12, 80), std(room.color, { emissive: room.color, emissiveIntensity: 0.4 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
  const coils = [-1, 1].map((k) => { const c = makeCoil(k * 1.7); c.position.z = -0.2; cradle.add(c); return c; });
  cradle.add(plat, ring);
  extra.coils = coils; extra.cradle = cradle;
  const logo = makeMetaLogo(2.4); logo.scale.setScalar(0.8); logo.position.set(0, 3.5, -5.6); g.add(logo);
  // the brain's kiosk, with the effort levels
  const LEVELS = ["minimal", "low", "medium", "high", "xhigh"];
  let lit = 2;
  const kiosk = new THREE.Group(); kiosk.position.set(-3.6, 0, 2.4); kiosk.rotation.y = 0.55; g.add(kiosk);
  const stand = box(0.3, 1.3, 0.3, 0xe6ebf0); stand.position.y = 0.65;
  const scr = windowPanel(1.9, 1.15, true, () => {});
  const face = scr.children[1];
  const MODELS = [["Muse Wonder", "#a99bff"], ["Muse Spark", "#4aa8ff"], ["Glimmer · Open", "#5fe0d2"]];
  const drawBrain = () => {
    const { g: c, c: cv } = face.material.map.userData;
    c.fillStyle = "#17242d"; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = "#ffffff"; c.font = `800 34px ${FONT}`; c.fillText(tr({ en: "Meta's Muse models", es: "Modelos Muse de Meta" }), 24, 88);
    MODELS.forEach(([n, col], i) => { c.fillStyle = col; rr(c, 24 + i * 158, 106, 148, 36, 18); c.fill(); c.fillStyle = "#0f1d26"; c.font = `700 17px ${FONT}`; c.textAlign = "center"; c.fillText(n, 98 + i * 158, 130); c.textAlign = "left"; });
    c.fillStyle = "#9fb3c2"; c.font = `700 18px ${FONT}`; c.fillText(tr({ en: "MUSE SPARK · REASONING EFFORT", es: "MUSE SPARK · NIVEL DE ESFUERZO" }), 24, 184);
    LEVELS.forEach((l, i) => {
      const x = 24 + i * 94, on = i === lit;
      c.fillStyle = on ? "#4aa8ff" : "#26394a"; rr(c, x, 198, 86, 40, 20); c.fill();
      c.fillStyle = on ? "#0f1d26" : "#c9d3da"; c.font = `700 18px ${FONT}`; c.textAlign = "center"; c.fillText(l, x + 43, 224); c.textAlign = "left";
    });
    c.fillStyle = "#7f93a3"; c.font = `500 17px ${FONT}`;
    c.fillText(tr({ en: "more effort = deeper thinking, more time and cost", es: "más esfuerzo = piensa más a fondo, con más tiempo y costo" }), 24, 274);
    face.material.map.needsUpdate = true;
  };
  drawBrain(); relabels.push(drawBrain);
  scr.position.y = 1.85; scr.rotation.x = -0.12;
  kiosk.add(stand, scr);
  // the map of the building
  const mapG = new THREE.Group(); mapG.position.set(3.6, 0, 2.4); mapG.rotation.y = -0.55; g.add(mapG);
  const mstand = box(0.3, 1.3, 0.3, 0xe6ebf0); mstand.position.y = 0.65;
  const map = plane(1.9, 1.4, 760, (c, W, Hh) => {
    c.fillStyle = "#ffffff"; rr(c, 0, 0, W, Hh, 26); c.fill();
    c.fillStyle = "#1c2b33"; c.font = `800 34px ${FONT}`; c.fillText(tr({ en: "The lab", es: "El laboratorio" }), 26, 50);
    const sx = (x) => 30 + ((x + 14) / 28) * (W - 60), sz = (z) => 74 + ((z + 14) / 20) * (Hh - 100);
    LAYOUT.forEach((r) => {
      const [x1, z1, x2, z2] = r.rect;
      c.fillStyle = r.id === "cuna" ? "#e9f2ff" : hex(ROOMS[r.id].color) + "55";
      c.fillRect(sx(x1) + 2, sz(z1) + 2, sx(x2) - sx(x1) - 4, sz(z2) - sz(z1) - 4);
      c.fillStyle = "#1c2b33"; c.font = `700 17px ${FONT}`; c.textAlign = "center";
      c.fillText(tr(ROOMS[r.id].bench ?? ROOMS[r.id].name).split(" ·")[0].slice(0, 16), (sx(x1) + sx(x2)) / 2, (sz(z1) + sz(z2)) / 2 + 6);
      c.textAlign = "left";
    });
  });
  map.position.y = 1.85; map.rotation.x = -0.12;
  mapG.add(mstand, map);
  relabels.push(() => map.material.map.userData.redraw());
  plaque(g, 0, -2.6, 1, room.items.coils.title, room.color, relabels);
  plaque(g, -2.7, 2.0, 2, room.items.brain.title, room.color, relabels, 0.55);
  plaque(g, 2.7, 2.0, 3, room.items.map.title, room.color, relabels, -0.55);
  const hit = (w, h, d, parent, y = h / 2) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); m.position.y = y; parent.add(m); return m; };
  return {
    exhibits: [
      { key: "coils", at: [0, -4.3], stand: [0, -2.4], hits: [hit(4, 2.6, 1.4, cradle)], act: () => extra.zap?.() },
      { key: "brain", at: [-3.6, 2.4], stand: [-2.6, 1.4], solid: 0.5, hits: [hit(2, 2.5, 0.6, kiosk)], act: () => { for (let i = 0; i < 6; i++) anim(0.01, () => { lit = (lit + 1) % LEVELS.length; drawBrain(); }, i * 0.45); extra.think?.(); } },
      { key: "map", at: [3.6, 2.4], stand: [2.6, 1.4], solid: 0.5, hits: [hit(2, 2.5, 0.6, mapG)], act: () => extra.lightDoors?.() },
    ],
  };
};

T.swe = (g, { relabels, room }) => {
  const m = mural(g, room, (c, W) => { c.strokeStyle = hex(room.color); c.lineWidth = 18; c.lineCap = "round"; c.beginPath(); c.moveTo(W - 260, 210); c.lineTo(W - 120, 70); c.stroke(); c.beginPath(); c.arc(W - 110, 62, 34, 0.6, 5.4); c.stroke(); });
  // tests: a rack of tubes
  const rack = new THREE.Group(); rack.position.set(0, 0, -2.6); g.add(rack);
  const bench = box(2.4, 0.8, 0.8, 0xffffff); bench.position.y = 0.4; rack.add(bench);
  const tube = (x, z, red) => {
    const t = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 6, 14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
    const liq = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 6, 14), std(red ? C.red : C.ok, { emissive: red ? C.red : C.ok, emissiveIntensity: 0.4 }));
    liq.position.y = -0.06; t.add(glass, liq); t.position.set(x, 1.15, z); t.userData.liq = liq;
    rack.add(t); return t;
  };
  const red = [-0.6, 0, 0.6].map((x) => tube(x, -0.15, true));
  [-0.9, -0.54, -0.18, 0.18, 0.54, 0.9].forEach((x) => tube(x, 0.22, false).scale.setScalar(0.7));
  const ok = makeBadge("ok"); ok.position.set(0, 1.95, 0); ok.scale.setScalar(0.001); rack.add(ok);
  const setC = (t, c) => { t.userData.liq.material.color.setHex(c); t.userData.liq.material.emissive.setHex(c); };
  // the report: a ticket printer
  const kiosk = new THREE.Group(); kiosk.position.set(-2.0, 0, -0.2); kiosk.rotation.y = 0.6; g.add(kiosk);
  const body = box(0.9, 1.3, 0.6, 0xe9f2ff); body.position.y = 0.65; kiosk.add(body);
  const ticket = plane(0.7, 0.9, 360, (c, W, Hh) => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#c42d12"; c.font = `800 34px ${FONT}`; c.fillText("Issue #4127", 22, 52);
    c.fillStyle = "#1c2b33"; c.font = `600 26px ${FONT}`; wrapText(c, tr({ en: "Dates shift a day when the user is in another time zone.", es: "Las fechas se corren un día cuando el usuario está en otra zona horaria." }), 22, 100, W - 44, 34);
  }, { basic: false });
  ticket.position.set(0, 1.0, 0.31); ticket.scale.y = 0.05; kiosk.add(ticket);
  relabels.push(() => ticket.material.map.userData.redraw());
  // the fix: a drawer cabinet of files
  const cab = new THREE.Group(); cab.position.set(2.0, 0, -0.2); cab.rotation.y = -0.6; g.add(cab);
  const shell = box(1.1, 1.5, 0.7, 0xffffff); shell.position.y = 0.75; cab.add(shell);
  const files = ["parse.ts", "zone.ts", "api.ts"];
  const drawers = files.map((f, i) => {
    const d = new THREE.Group(); d.position.set(0, 1.18 - i * 0.42, 0.28);
    const front = box(0.95, 0.34, 0.2, i === 1 ? 0x5b9bff : 0xe6ebf0); d.add(front);
    const tag = plane(0.6, 0.14, 300, (c, W, Hh) => { c.fillStyle = "#ffffff"; rr(c, 0, 0, W, Hh, Hh / 2); c.fill(); c.fillStyle = "#1c2b33"; c.font = `700 40px monospace`; c.textBaseline = "middle"; c.fillText(f, 24, Hh / 2 + 2); }, { transparent: true });
    tag.position.z = 0.11; d.add(tag); cab.add(d); return d;
  });
  const patch = windowPanel(1.1, 0.6, true, (c) => {
    c.font = `600 26px monospace`;
    [["- return local(d)", "#ff9b87"], ["+ return toUTC(d, zone)", "#7ee2a8"]].forEach(([s, col], i) => { c.fillStyle = col; c.fillText(s, 20, 90 + i * 44); });
  });
  patch.position.set(0, 2.1, 0.1); patch.scale.setScalar(0.001); cab.add(patch);
  plaque(g, 0, -1.3, 1, room.items.tests.title, room.color, relabels);
  plaque(g, -1.3, 0.8, 2, room.items.ticket.title, room.color, relabels, 0.6);
  plaque(g, 1.3, 0.8, 3, room.items.toolbox.title, room.color, relabels, -0.6);
  return {
    mural: m,
    exhibits: [
      { key: "tests", at: [0, -2.6], stand: [0, -0.9], solid: 1.0, hits: [bench], act: () => { red.forEach((t) => setC(t, C.red)); ok.scale.setScalar(0.001); red.forEach((t, i) => anim(0.01, () => setC(t, C.ok), 0.4 + i * 0.45)); anim(0.5, (k) => ok.scale.setScalar(Math.max(0.001, k)), 1.9); } },
      { key: "ticket", at: [-2.0, -0.2], stand: [-1.0, 1.0], solid: 0.55, hits: [body], act: () => { ticket.scale.y = 0.05; anim(1.2, (k) => { ticket.scale.y = 0.05 + k * 0.95; ticket.position.y = 1.0 + k * 0.45; }); } },
      { key: "toolbox", at: [2.0, -0.2], stand: [1.0, 1.0], solid: 0.6, hits: [shell], act: () => { drawers[1].position.z = 0.28; patch.scale.setScalar(0.001); anim(0.6, (k) => { drawers[1].position.z = 0.28 + k * 0.35; }); anim(0.6, (k) => patch.scale.setScalar(Math.max(0.001, k)), 0.6); } },
    ],
  };
};

T.terminal = (g, { relabels, room }) => {
  const m = mural(g, room, (c, W) => { c.fillStyle = "#1c2b33"; rr(c, W - 300, 50, 240, 150, 18); c.fill(); c.fillStyle = "#3ccf6e"; c.font = `700 40px monospace`; c.fillText("$ _", W - 270, 140); });
  const LINES = [["$ make", "#e6edf3"], ["fatal: openssl/ssl.h: no such file", "#ff9b87"], ["$ apt-get install -y libssl-dev", "#e6edf3"], ["$ make && ./server --port 8080", "#e6edf3"], ["listening on :8080", "#7ee2a8"], ["$ bash tests.sh  PASS 5/5", "#7ee2a8"]];
  let shown = 1;
  const term = windowPanel(2.6, 1.4, true, () => {});
  const tf = term.children[1];
  const drawTerm = () => { const { g: c, c: cv } = tf.material.map.userData; c.fillStyle = "#17242d"; c.fillRect(0, 0, cv.width, cv.height); c.font = `600 22px monospace`; LINES.slice(0, shown).forEach(([s, col], i) => { c.fillStyle = col; c.fillText(s, 22, 86 + i * 32); }); c.fillStyle = "#e6edf3"; c.fillRect(22, 86 + shown * 32 - 20, 12, 24); tf.material.map.needsUpdate = true; };
  drawTerm();
  term.position.set(0, 1.55, -3.0); g.add(term);
  const desk = box(2.2, 0.75, 0.7, 0xffffff); desk.position.set(0, 0.38, -2.5); g.add(desk);
  // the sealed box: a server rack inside a glass container
  const rackG = new THREE.Group(); rackG.position.set(-2.0, 0, -0.4); g.add(rackG);
  const rack = box(0.8, 1.9, 0.6, 0x1c2b33); rack.position.y = 0.95; rackG.add(rack);
  const leds = [];
  for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), std(0x2ec4b6, { emissive: 0x2ec4b6, emissiveIntensity: 0.8 })); l.position.set(-0.25 + (i % 4) * 0.16, 0.4 + Math.floor(i / 4) * 0.5, 0.31); rackG.add(l); leds.push(l); }
  const glassBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 2.3, 1.1)), new THREE.LineBasicMaterial({ color: 0x2ec4b6 }));
  glassBox.position.y = 1.15; rackG.add(glassBox);
  // the clock
  const clockG = new THREE.Group(); clockG.position.set(2.0, 0, -0.4); g.add(clockG);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 10), std(0xc9d2dc)); post.position.y = 0.7;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 48), glossy(0xffffff)); dial.rotation.x = Math.PI / 2; dial.position.y = 1.85;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 10, 48), std(0x2ec4b6)); rim.position.y = 1.85;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.03), std(0x1c2b33)); hand.geometry.translate(0, 0.2, 0); hand.position.set(0, 1.85, 0.07);
  const ok = makeBadge("ok"); ok.position.set(0.7, 2.4, 0); ok.scale.setScalar(0.001);
  clockG.add(post, dial, rim, hand, ok);
  plaque(g, 0, -1.4, 1, room.items.term.title, room.color, relabels);
  plaque(g, -1.2, 1.0, 2, room.items.rack.title, room.color, relabels, 0.5);
  plaque(g, 1.2, 1.0, 3, room.items.clock.title, room.color, relabels, -0.5);
  let fast = 0;
  return {
    mural: m,
    exhibits: [
      { key: "term", at: [0, -2.6], stand: [0, -1.0], solid: 1.0, hits: [term, desk], act: () => { shown = 0; drawTerm(); for (let i = 1; i <= LINES.length; i++) anim(0.01, () => { shown = i; drawTerm(); }, i * 0.55); } },
      { key: "rack", at: [-2.0, -0.4], stand: [-1.0, 0.9], solid: 0.7, hits: [rack], act: () => { fast = 3; } },
      { key: "clock", at: [2.0, -0.4], stand: [1.0, 0.9], solid: 0.6, hits: [dial], act: () => { ok.scale.setScalar(0.001); anim(1.6, (k) => { hand.rotation.z = -k * Math.PI * 2; }); anim(0.5, (k) => ok.scale.setScalar(Math.max(0.001, k)), 1.6); } },
    ],
    update(t, dt) { fast = Math.max(0, fast - dt); leds.forEach((l, i) => { l.material.emissiveIntensity = Math.sin(t * (fast ? 22 : 3) + i * 1.7) > 0 ? 1.2 : 0.15; }); glassBox.material.color.setHex(fast ? 0x7ee2a8 : 0x2ec4b6); },
  };
};

T.arc = (g, { relabels, room, extra }) => {
  const m = mural(g, room);
  // a playable floor board: 6 x 6 tiles. Find the key, then the exit.
  const N = 6, S = 0.72, oz = -0.8;
  const walls = new Set(["1,1", "1,2", "1,3", "3,2", "3,3", "3,4", "3,5", "4,1"]);
  const start = [0, 5], key = [5, 0], exit = [4, 5];
  const pos = (c, r) => [(c - (N - 1) / 2) * S, oz + (r - (N - 1) / 2) * S];
  const tiles = [];
  const blocks = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const [x, z] = pos(c, r);
    if (walls.has(`${c},${r}`)) { const b = box(S * 0.9, 0.6, S * 0.9, 0x4b5f6d); b.position.set(x, 0.3, z); g.add(b); blocks.push([x, z, 0.42]); continue; }
    const t = new THREE.Mesh(new THREE.BoxGeometry(S * 0.94, 0.04, S * 0.94), std(0xffffff)); t.position.set(x, 0.02, z); t.userData.cell = [c, r]; g.add(t); tiles.push(t);
  }
  const tileAt = (c, r) => tiles.find((t) => t.userData.cell[0] === c && t.userData.cell[1] === r);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), glossy(0xffc83d, { emissive: 0xffc83d, emissiveIntensity: 0.5 }));
  const [kx, kz] = pos(...key); gem.position.set(kx, 0.6, kz); g.add(gem);
  const exitT = tileAt(...exit); exitT.material = std(0x9aa8b5);
  const startT = tileAt(...start); startT.material = std(0xffd8cc);
  // breadth-first search gives the shortest route a person could take
  const bfs = (a, b) => { const q = [[...a, 0]], seen = new Set([a.join()]); while (q.length) { const [x, y, d] = q.shift(); if (x === b[0] && y === b[1]) return d; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = `${nx},${ny}`; if (nx < 0 || ny < 0 || nx >= N || ny >= N || walls.has(k) || seen.has(k)) continue; seen.add(k); q.push([nx, ny, d + 1]); } } return 99; };
  const BASE = bfs(start, key) + bfs(key, exit);
  // scoreboard on the back wall
  const board = plane(2.4, 0.9, 900, () => {}, {});
  const drawBoard = () => {
    const { g: c, c: cv } = board.material.map.userData; const W = cv.width, Hh = cv.height;
    c.fillStyle = "#1c2b33"; rr(c, 0, 0, W, Hh, 30); c.fill();
    c.fillStyle = "#ff8f70"; c.font = `800 40px ${FONT}`; c.fillText(tr({ en: "SCOREBOARD", es: "MARCADOR" }), 40, 70);
    c.fillStyle = "#ffffff"; c.font = `700 48px ${FONT}`;
    c.fillText(tr({ en: `Steps ${game.steps} · person ${BASE}`, es: `Pasos ${game.steps} · persona ${BASE}` }), 40, 150);
    c.fillStyle = game.won ? "#7ee2a8" : "#9fb3c2"; c.font = `700 36px ${FONT}`;
    c.fillText(game.won ? tr({ en: `Exit! score (${BASE}/${game.steps})² = ${Math.min(1, (BASE / game.steps) ** 2).toFixed(2)}`, es: `¡Salida! puntaje (${BASE}/${game.steps})² = ${Math.min(1, (BASE / game.steps) ** 2).toFixed(2)}` })
      : game.key ? tr({ en: "Key found: the exit is open", es: "Llave encontrada: la salida se abrió" }) : tr({ en: "Find the key, then the exit", es: "Encuentra la llave y luego la salida" }), 40, 215);
    board.material.map.needsUpdate = true;
  };
  const game = { steps: 0, key: false, won: false, cell: null };
  board.position.set(0, 0.95, -3.55); board.scale.setScalar(0.85); g.add(board);
  const bpost = box(2.2, 0.12, 0.2, 0xe6ebf0); bpost.position.set(0, 0.45, -3.6); g.add(bpost);
  drawBoard(); relabels.push(drawBoard);
  // the hidden rules: three cubes with question marks
  const rulesG = new THREE.Group(); rulesG.position.set(2.35, 0, 2.6); g.add(rulesG);
  const ped = box(0.9, 0.7, 0.9, 0xffffff); ped.position.y = 0.35; rulesG.add(ped);
  const cubes = ["?", "?", "?"].map((q, i) => {
    const drawCube = (shown) => (c, W, Hh) => { c.fillStyle = shown ? "#ff8f70" : "#ffffff"; c.fillRect(0, 0, W, Hh); c.fillStyle = shown ? "#ffffff" : "#ff8f70"; c.font = `800 ${shown ? 64 : 120}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(shown ? [tr({ en: "me", es: "yo" }), tr({ en: "key", es: "llave" }), tr({ en: "exit", es: "salida" })][i] : "?", W / 2, Hh / 2 + 4); };
    const mats = [false, true].map((s) => new THREE.MeshBasicMaterial({ map: canvasTex(200, 200, drawCube(s)), toneMapped: false }));
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), mats[0]);
    cube.position.set(-0.3 + i * 0.3, 0.86, 0); cube.userData.mats = mats; rulesG.add(cube); return cube;
  });
  plaque(g, -2.4, 2.2, 1, room.items.board.title, room.color, relabels, 0.4);
  plaque(g, -1.9, -3.2, 2, room.items.score.title, room.color, relabels, 0.3);
  plaque(g, 1.5, 2.9, 3, room.items.rules.title, room.color, relabels, -0.4);
  const reset = () => { game.steps = 0; game.key = false; game.won = false; game.cell = null; gem.visible = true; exitT.material = std(0x9aa8b5); drawBoard(); };
  // the room tells the board where the agent stands (local coords)
  extra.arcStep = (lx, lz) => {
    const c = Math.round(lx / S + (N - 1) / 2), r = Math.round((lz - oz) / S + (N - 1) / 2);
    const inside = c >= 0 && r >= 0 && c < N && r < N && Math.abs(lx - pos(c, r)[0]) < S / 2 && Math.abs(lz - pos(c, r)[1]) < S / 2;
    if (!inside) return;
    const k = `${c},${r}`;
    if (game.cell === k) return;
    if (game.cell === null && !(c === start[0] && r === start[1])) { game.cell = k; return; }
    game.cell = k;
    if (game.won) return;
    game.steps++;
    if (!game.key && c === key[0] && r === key[1]) { game.key = true; gem.visible = false; exitT.material = std(C.ok, { emissive: C.ok, emissiveIntensity: 0.4 }); extra.say?.({ en: "A key! Something must open.", es: "¡Una llave! Algo debe abrirse." }); }
    if (game.key && c === exit[0] && r === exit[1]) { game.won = true; extra.say?.({ en: "Level cleared!", es: "¡Nivel superado!" }); extra.cheer?.(); }
    drawBoard();
  };
  return {
    mural: m,
    exhibits: [
      { key: "board", at: [-2.4, 2.2], stand: [-1.6, 2.9], hits: [startT, ...tiles.slice(0, 3)], blocks, act: () => { reset(); extra.say?.({ en: "Start on the pink tile. Go!", es: "Empieza en la casilla rosa. ¡Ve!" }); } },
      { key: "score", at: [0, -3.6], stand: [-1.2, -2.6], hits: [board], act: () => { anim(0.8, (k) => board.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.08)); } },
      { key: "rules", at: [2.35, 2.6], stand: [1.4, 2.1], solid: 0.6, hits: [ped, ...cubes], act: () => { cubes.forEach((cb, i) => { cb.material = cb.userData.mats[0]; anim(0.5, (k, raw) => { cb.rotation.y = k * Math.PI; if (raw > 0.5) cb.material = cb.userData.mats[1]; }, i * 0.4); }); } },
    ],
    update(t) { gem.rotation.y = t * 1.5; gem.position.y = 0.6 + Math.sin(t * 2) * 0.06; },
  };
};

T.web = (g, { relabels, room }) => {
  const m = mural(g, room);
  // the clue board, low on the back wall
  const cork = box(2.6, 1.3, 0.08, 0xc9a27a); cork.position.set(0, 1.0, -3.7); g.add(cork);
  const cards = [[-1.0, 1.35], [-0.2, 0.75], [0.9, 1.25], [0.3, 0.5]].map(([x, y], i) => {
    const cdx = plane(0.46, 0.3, 230, (c, W, Hh) => { c.fillStyle = i === 3 ? "#3ccf6e" : "#fffbe6"; c.fillRect(0, 0, W, Hh); c.fillStyle = "#1c2b33"; c.font = `700 30px ${FONT}`; c.fillText(i === 3 ? "1987" : [tr({ en: "workshop", es: "taller" }), tr({ en: "3 authors", es: "3 autores" }), tr({ en: "1990s", es: "años 90" })][i], 16, 56); }, { basic: false });
    cdx.position.set(x, y, -3.64); g.add(cdx); relabels.push(() => cdx.material.map.userData.redraw()); return cdx;
  });
  const strings = [[0, 3], [1, 3], [2, 3]].map(([a, b]) => {
    const A = cards[a].position, B = cards[b].position;
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([A.clone().setZ(-3.62), B.clone().setZ(-3.62)]), new THREE.LineBasicMaterial({ color: 0xc42d12 }));
    g.add(l); return l;
  });
  // the shelves: each book is a web page
  const shelf = new THREE.Group(); shelf.position.set(-2.55, 0, -0.6); shelf.rotation.y = Math.PI / 2; g.add(shelf);
  const frame = box(2.2, 2.0, 0.45, 0xf1e6d6); frame.position.y = 1.0; shelf.add(frame);
  const books = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
    const b = box(0.16, 0.42 + ((i * 7 + row) % 3) * 0.06, 0.3, [0x5b9bff, 0x3ccf6e, 0xffb53d, 0xff8f70, 0x8a7dff][(i + row) % 5]);
    b.position.set(-0.9 + i * 0.22, 0.32 + row * 0.62, 0.12); shelf.add(b); books.push(b);
  }
  // the answer, in a glass case
  const caseG = new THREE.Group(); caseG.position.set(2.2, 0, -0.4); g.add(caseG);
  const ped = box(0.7, 1.0, 0.7, 0xffffff); ped.position.y = 0.5; caseG.add(ped);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.62), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0, depthWrite: false })); glass.position.y = 1.36; caseG.add(glass);
  const ans = plane(0.42, 0.26, 220, (c, W, Hh) => { c.fillStyle = "#3ccf6e"; rr(c, 0, 0, W, Hh, 20); c.fill(); c.fillStyle = "#fff"; c.font = `800 64px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("1987", W / 2, Hh / 2 + 4); }, { transparent: true });
  ans.position.set(0, 1.2, 0); caseG.add(ans);
  const check = makeBadge("ok"); check.position.set(0, 2.0, 0); check.scale.setScalar(0.001); caseG.add(check);
  plaque(g, 0, -2.4, 1, room.items.clues.title, room.color, relabels);
  plaque(g, -1.5, 0.9, 2, room.items.shelves.title, room.color, relabels, 0.6);
  plaque(g, 1.3, 0.9, 3, room.items.answer.title, room.color, relabels, -0.6);
  return {
    mural: m,
    exhibits: [
      { key: "clues", at: [0, -3.4], stand: [0, -2.0], hits: [cork], act: () => strings.forEach((s, i) => { s.material.color.setHex(0xc42d12); anim(0.01, () => s.material.color.setHex(0x22b864), 0.4 + i * 0.5); }) },
      { key: "shelves", at: [-2.55, -0.6], stand: [-1.3, -0.2], solid: 0.5, blocks: [[-2.55, -1.4, 0.45], [-2.55, 0.2, 0.45]], hits: [frame, ...books], act: () => books.forEach((b, i) => { const c = b.material.color.getHex(); anim(0.01, () => b.material.color.setHex([4, 13, 22].includes(i) ? 0xffd25c : 0xc9d2dc), i * 0.06); anim(0.01, () => b.material.color.setHex(c), 3 + i * 0.02); }) },
      { key: "answer", at: [2.2, -0.4], stand: [1.2, 0.6], solid: 0.5, hits: [ped, glass], act: () => { check.scale.setScalar(0.001); anim(0.9, (k) => { ans.position.y = 1.2 + k * 0.35; ans.rotation.y = k * Math.PI * 2; }); anim(0.5, (k) => check.scale.setScalar(Math.max(0.001, k)), 0.9); anim(0.6, (k) => { ans.position.y = 1.55 - k * 0.35; }, 2.6); } },
    ],
  };
};

T.research = (g, { relabels, room }) => {
  const m = mural(g, room);
  // the contest: a leaderboard with medal lines
  const lb = new THREE.Group(); lb.position.set(0, 0, -2.8); g.add(lb);
  [1.6, 1.45, 1.3, 1.1, 0.9, 0.7].forEach((h, i) => { const b = box(0.24, h, 0.24, 0xdfe7ef); b.position.set(-1.0 + i * 0.32, h / 2, 0); lb.add(b); });
  [[0xe3b41b, 1.35], [0xa9b4be, 1.1], [0xc98a5a, 0.85]].forEach(([c, y]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.02, 0.5), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })); p.position.set(0, y, 0); lb.add(p); });
  const mine = box(0.26, 1, 0.26, 0xffb53d, { emissive: 0xffb53d, emissiveIntensity: 0.3 }); mine.position.set(1.0 + 0.32, 0.05, 0.1); mine.scale.y = 0.1; lb.add(mine);
  const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 32), glossy(0xa9b4be, { metalness: 0.6 })); medal.rotation.x = Math.PI / 2; medal.position.set(1.32, 1.6, 0.2); medal.scale.setScalar(0.001); lb.add(medal);
  // the paper on a lectern
  const lec = new THREE.Group(); lec.position.set(-2.0, 0, -0.2); lec.rotation.y = 0.6; g.add(lec);
  const lpost = box(0.3, 1.1, 0.3, 0xffffff); lpost.position.y = 0.55; lec.add(lpost);
  const top = box(0.9, 0.06, 0.6, 0xf1e6d6); top.position.y = 1.12; top.rotation.x = -0.35; lec.add(top);
  const pages = [0, 1].map((i) => {
    const p = plane(0.38, 0.5, 200, (c, W, Hh) => { c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, Hh); c.fillStyle = "#1c2b33"; c.font = `800 22px ${FONT}`; c.fillText(i ? "Results" : "Method", 14, 34); c.fillStyle = "#c9d2dc"; for (let k = 0; k < 8; k++) c.fillRect(14, 56 + k * 26, W - 28 - (k % 3) * 30, 10); }, { basic: false });
    p.material.side = THREE.DoubleSide;
    const pivot = new THREE.Group(); pivot.position.set(0, 1.17, 0); pivot.rotation.x = -0.35 - Math.PI / 2; lec.add(pivot);
    p.position.set(i ? 0.2 : -0.2, 0, 0); p.rotation.x = 0; pivot.add(p); pivot.userData.page = p; return pivot;
  });
  // the rubric tree
  const tree = new THREE.Group(); tree.position.set(2.1, 0, -0.4); g.add(tree);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.2, 10), std(0x9aa8b5)); trunk.position.y = 0.6; tree.add(trunk);
  const leaves = [];
  const KIND = [0x5b9bff, 0x2ec4b6, 0xffb53d];
  [-0.45, 0, 0.45].forEach((x, i) => KIND.forEach((c, j) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), glossy(0xe6ebf0)); l.position.set(x + (j - 1) * 0.14, 1.35 + j * 0.12 + Math.abs(x) * -0.2, (j - 1) * 0.08); l.userData.c = i === 2 && j === 2 ? C.red : c; tree.add(l); leaves.push(l); }));
  plaque(g, 0, -1.4, 1, room.items.podium.title, room.color, relabels);
  plaque(g, -1.2, 1.0, 2, room.items.paper.title, room.color, relabels, 0.6);
  plaque(g, 1.2, 1.0, 3, room.items.rubric.title, room.color, relabels, -0.6);
  return {
    mural: m,
    exhibits: [
      { key: "podium", at: [0, -2.8], stand: [0, -1.1], solid: 1.0, hits: lb.children.filter((c) => c.isMesh), act: () => { medal.scale.setScalar(0.001); anim(1.5, (k) => { const h = 0.1 + k * 1.15; mine.scale.y = h; mine.position.y = h / 2; }); anim(0.5, (k) => medal.scale.setScalar(Math.max(0.001, k)), 1.5); } },
      { key: "paper", at: [-2.0, -0.2], stand: [-1.0, 0.9], solid: 0.5, hits: [lpost, top], act: () => { anim(0.8, (k) => { pages[1].rotation.z = k * Math.PI * 0.95; }); anim(0.8, (k) => { pages[1].rotation.z = (1 - k) * Math.PI * 0.95; }, 1.4); } },
      { key: "rubric", at: [2.1, -0.4], stand: [1.1, 0.8], solid: 0.5, hits: [trunk, ...leaves], act: () => leaves.forEach((l, i) => { l.material.color.setHex(0xe6ebf0); anim(0.01, () => { l.material.color.setHex(l.userData.c); l.material.emissive = new THREE.Color(l.userData.c); l.material.emissiveIntensity = 0.3; }, 0.2 + i * 0.22); }) },
    ],
  };
};

T.horizon = (g, { relabels, room }) => {
  const m = mural(g, room);
  // the 50% line across five tubes
  const LEN = ["1 min", "15 min", "1 h", "4 h", tr({ en: "1 day", es: "1 día" })];
  const tubes = LEN.map((s, i) => {
    const tg = new THREE.Group(); tg.position.set(-1.2 + i * 0.6, 0, -2.9); g.add(tg);
    const glassT = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.8, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })); glassT.position.y = 0.95;
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 20), std(0x8a7dff, { emissive: 0x8a7dff, emissiveIntensity: 0.3 })); fill.scale.y = 0.001;
    const base = box(0.44, 0.08, 0.44, 0xffffff); base.position.y = 0.04;
    tg.add(glassT, fill, base); tg.userData.fill = fill; tg.userData.glass = glassT; return tg;
  });
  const half = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.01, 0.6), new THREE.MeshBasicMaterial({ color: 0x8a7dff, transparent: true, opacity: 0.3, depthWrite: false })); half.position.set(0, 0.95, -2.9); g.add(half);
  const setRates = (c) => tubes.map((_tb, i) => 1 / (1 + Math.exp((i / 4 - c) * 8)));
  // hourglasses of growing size
  const sandG = new THREE.Group(); sandG.position.set(-2.1, 0, 0.2); sandG.rotation.y = 0.5; g.add(sandG);
  const sands = [0.6, 0.8, 1.0, 1.25].map((s, i) => {
    const hg = new THREE.Group(); hg.position.set(-0.75 + i * 0.5, 0, 0); hg.scale.setScalar(s * 0.5);
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0, side: THREE.DoubleSide, depthWrite: false });
    const prof = [[0.04, 0], [0.34, 0.08], [0.36, 0.25], [0.2, 0.5], [0.05, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
    const lo = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), glassM); lo.position.y = 0.08;
    const hi = lo.clone(); hi.rotation.x = Math.PI; hi.position.y = 1.32;
    const sand = std(0xffc83d);
    const topS = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 20), sand); topS.position.y = 1.0; topS.rotation.x = Math.PI;
    const botS = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 20), sand); botS.position.y = 0.2; botS.scale.setScalar(0.2);
    hg.add(lo, hi, topS, botS); hg.userData = { topS, botS }; sandG.add(hg); return hg;
  });
  // the doubling staircase
  const trendG = new THREE.Group(); trendG.position.set(2.1, 0, 0.2); trendG.rotation.y = -0.5; g.add(trendG);
  const steps = [0.15, 0.3, 0.6, 1.2].map((h, i) => { const b = box(0.32, h, 0.4, 0xe6ebf0); b.position.set(-0.55 + i * 0.37, h / 2, 0); trendG.add(b); return b; });
  plaque(g, 0, -1.5, 1, room.items.line.title, room.color, relabels);
  plaque(g, -1.0, 1.4, 2, room.items.sand.title, room.color, relabels, 0.5);
  plaque(g, 1.0, 1.4, 3, room.items.trend.title, room.color, relabels, -0.5);
  return {
    mural: m,
    exhibits: [
      { key: "line", at: [0, -2.9], stand: [0, -1.3], solid: 1.0, hits: tubes.map((tb) => tb.userData.glass), act: () => { const a = setRates(0.35), b = setRates(0.6); anim(1.2, (k) => tubes.forEach((tb, i) => { const r = a[i] * k; tb.userData.fill.scale.y = Math.max(0.001, r * 1.8); tb.userData.fill.position.y = (r * 1.8) / 2; })); anim(1.4, (k) => tubes.forEach((tb, i) => { const r = a[i] + (b[i] - a[i]) * k; tb.userData.fill.scale.y = r * 1.8; tb.userData.fill.position.y = (r * 1.8) / 2; }), 2.0); } },
      { key: "sand", at: [-2.1, 0.2], stand: [-1.1, 1.2], solid: 0.7, hits: sands.flatMap((s) => s.children), act: () => sands.forEach((s, i) => anim(1 + i * 0.6, (k) => { s.userData.topS.scale.setScalar(Math.max(0.05, 1 - k)); s.userData.botS.scale.setScalar(0.2 + k * 0.8); })) },
      { key: "trend", at: [2.1, 0.2], stand: [1.1, 1.2], solid: 0.7, hits: steps, act: () => steps.forEach((b, i) => { b.material.color.setHex(0xe6ebf0); anim(0.01, () => { b.material.color.setHex(0x8a7dff); b.material.emissive = new THREE.Color(0x8a7dff); b.material.emissiveIntensity = 0.25; }, 0.3 + i * 0.45); }) },
    ],
  };
};
const THEMES = T;

/* ================================================================================================== */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ reduced?: boolean, minimap?: HTMLCanvasElement | null, onArrive?: (id: string) => void, onSay?: (text: string) => void,
 *   onFrame?: (head: { x: number, y: number }) => void, onFlash?: () => void, onMove?: () => void,
 *   onGuide?: (g: { room: string, item?: string } | null) => void, onView?: (fp: boolean) => void, onRun?: (room: string) => void }} o
 */
export function createRoom(canvas, { reduced = false, minimap = null, onArrive = () => {}, onSay = () => {}, onFrame = () => {}, onFlash = () => {}, onMove = () => {}, onGuide = () => {}, onView = () => {}, onRun = () => {} } = {}) {
  const renderer = setupRenderer(canvas);
  const scene = new THREE.Scene();
  addLights(scene, renderer, { extent: 16, mapSize: 2048 });
  const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 120);
  const B = buildRoom(scene);
  const { walls, floorHit, doors, exhibits, updates, obstacles, extra } = B;

  const agent = makeAgent({ hover: true });
  agent.scale.setScalar(0.85);
  agent.rotation.order = "YXZ";
  agent.position.set(0, HOVER_Y, 0.4);
  agent.rotation.y = Math.PI;
  scene.add(agent);
  const u = agent.userData;
  u.power = 1;
  const bolts = [makeBolt(), makeBolt()];
  bolts.forEach((b) => { b.visible = false; scene.add(b); });

  // ---- state ----
  let fp = false, t = 0, zap = 0, armsUp = 0, thinkUntil = 0, happyUntil = 0, alertUntil = 0, screenMode = null;
  let path = [], pendingRoom = null, pendingExhibit = null, currentRoom = "cuna", guideKey = "", engaged = false, visible = true;
  let yaw = Math.PI, pitch = -0.05, camAz = 0, wallK = 0.32, stuck = 0;
  const keys = new Set();
  const say = (o) => onSay(tr(o));
  extra.say = say;
  extra.cheer = () => { armsUp = t + 1.8; happyUntil = t + 2.4; onFlash(); };
  extra.think = () => { thinkUntil = t + 2.5; say({ en: "Thinking harder costs more time.", es: "Pensar más a fondo cuesta más tiempo." }); };
  extra.zap = () => { if (!reduced) { zap = 1.4; u.power = 0.2; } else { onFlash(); say(ROOMS.cuna.items.coils.title); } };
  extra.runExercise = (id) => onRun(id);
  extra.lightDoors = () => doors.forEach((d, i) => { anim(0.01, () => { d.mat.emissiveIntensity = 1.4; }, i * 0.35); anim(0.01, () => { d.mat.emissiveIntensity = 0.2; }, i * 0.35 + 0.6); });

  // ---- size ----
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---- collisions and routes ----
  function collide(p) {
    for (let pass = 0; pass < 2; pass++) {
      for (const [x1, z1, x2, z2] of WALLS) {
        const cx = THREE.MathUtils.clamp(p.x, Math.min(x1, x2), Math.max(x1, x2));
        const cz = THREE.MathUtils.clamp(p.z, Math.min(z1, z2), Math.max(z1, z2));
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d < R + 0.1 && d > 1e-6) { p.x = cx + (dx / d) * (R + 0.1); p.z = cz + (dz / d) * (R + 0.1); }
        else if (d <= 1e-6) { if (x1 === x2) p.x += p.x < x1 ? -(R + 0.1) : R + 0.1; else p.z += p.z < z1 ? -(R + 0.1) : R + 0.1; }
      }
      for (const [ox, oz, or] of obstacles) {
        const dx = p.x - ox, dz = p.z - oz, d = Math.hypot(dx, dz), m = or + R * 0.8;
        if (d < m && d > 1e-6) { p.x = ox + (dx / d) * m; p.z = oz + (dz / d) * m; }
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, -13.5, 13.5); p.z = THREE.MathUtils.clamp(p.z, -13.5, 5.5);
    return p;
  }
  const doorPoint = (id, side) => { const r = BYID[id]; return new THREE.Vector3(r.door[0] + r.normal[0] * side, HOVER_Y, r.door[1] + r.normal[1] * side); };
  function route(to) {
    const from = roomAt(agent.position.x, agent.position.z) ?? currentRoom;
    const dest = roomAt(to.x, to.z) ?? from;
    const pts = [];
    if (from !== dest) {
      if (from !== "cuna") pts.push(doorPoint(from, 1.1), doorPoint(from, -1.1));
      if (dest !== "cuna") pts.push(doorPoint(dest, -1.1), doorPoint(dest, 1.1));
    }
    pts.push(to.clone().setY(HOVER_Y));
    return pts;
  }
  function walkTo(p, { roomId = null, exhibit = null } = {}) {
    onMove(); clearExercise();
    path = route(p);
    pendingRoom = roomId; pendingExhibit = exhibit;
  }
  function goTo(id) {
    const r = BYID[id];
    if (!r) return;
    const at = id === "cuna" ? new THREE.Vector3(0, HOVER_Y, -2.2) : new THREE.Vector3(r.center[0] + r.normal[0] * -1.2, HOVER_Y, r.center[1] + r.normal[1] * -1.2);
    walkTo(at, { roomId: id });
  }
  function goToExhibit(ex) { walkTo(ex.standWorld.clone(), { roomId: ex.room, exhibit: ex }); }

  // ---- guide: the nearest exhibit (or the one you look at) ----
  const center = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  const exHits = exhibits.flatMap((e) => e.hits);
  function exhibitById(id) { return exhibits.find((e) => e.id === id); }
  function aimed() {
    ray.setFromCamera(center, camera);
    ray.far = 4.5;
    const h = ray.intersectObjects(exHits, false)[0];
    ray.far = Infinity;
    return h ? exhibitById(h.object.userData.exhibit) : null;
  }
  function nearest() {
    let best = null, bd = 2.6;
    for (const e of exhibits) { if (e.room !== currentRoom) continue; const d = Math.hypot(e.world.x - agent.position.x, e.world.z - agent.position.z) - (e.solid ?? 0.4); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  let focus = null;
  function updateGuide() {
    focus = (fp ? aimed() : null) ?? nearest();
    const key = focus ? focus.id : currentRoom;
    if (key === guideKey) return;
    guideKey = key;
    onGuide(focus ? { room: focus.room, item: focus.key } : { room: currentRoom });
  }
  function interact(e = focus) {
    if (!e) return;
    engaged = true;
    e.act();
    thinkUntil = t + 0.8; happyUntil = t + 2;
  }

  // ---- view ----
  function setView(next) {
    fp = next;
    agent.visible = !fp;
    if (fp) { yaw = agent.rotation.y; pitch = -0.05; }
    else camAz = yaw + Math.PI;
    canvas.style.cursor = fp ? "crosshair" : "";
    guideKey = "";
    onView(fp);
  }

  // ---- input ----
  const ndc = new THREE.Vector2();
  const aim = (ev) => { const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
  let down = null;
  canvas.addEventListener("pointerdown", (ev) => { engaged = true; down = { x: ev.clientX, y: ev.clientY, yaw, pitch, camAz, moved: false, id: ev.pointerId, type: ev.pointerType }; });
  canvas.addEventListener("pointermove", (ev) => {
    if (down) {
      const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) > 6) { down.moved = true; try { canvas.setPointerCapture(down.id); } catch { /* gone */ } }
      if (down.moved) {
        // like Street View: you drag the scene, so dragging right turns the view left
        if (fp) { path = []; pendingExhibit = null; yaw = down.yaw + dx * 0.005; if (down.type === "mouse") pitch = THREE.MathUtils.clamp(down.pitch + dy * 0.004, -0.9, 0.7); }
        else camAz = down.camAz - dx * 0.006;
      }
      return;
    }
    if (ev.pointerType !== "mouse" || fp) return;
    aim(ev);
    canvas.style.cursor = ray.intersectObjects(exHits, false).length || ray.intersectObjects(doors.map((d) => d.hit), false).length ? "pointer" : "crosshair";
  });
  const endPointer = (ev) => {
    if (!down) return;
    const wasDrag = down.moved;
    down = null;
    if (wasDrag) return;
    aim(ev);
    const eh = ray.intersectObjects(exHits, false)[0];
    if (eh) {
      const e = exhibitById(eh.object.userData.exhibit);
      const close = fp ? eh.distance < 4.5 : Math.hypot(e.standWorld.x - agent.position.x, e.standWorld.z - agent.position.z) < 0.8;
      if (close) interact(e); else goToExhibit(e);
      return;
    }
    const dh = ray.intersectObjects(doors.map((d) => d.hit), false)[0];
    if (dh) { const d = doors.find((x) => x.hit === dh.object); goTo(roomAt(agent.position.x, agent.position.z) === d.id ? "cuna" : d.id); return; }
    const fh = ray.intersectObject(floorHit, false)[0];
    if (fh && roomAt(fh.point.x, fh.point.z)) walkTo(fh.point);
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", () => { down = null; });

  const KEYMAP = { ArrowUp: "f", KeyW: "f", ArrowDown: "b", KeyS: "b", ArrowLeft: "l", KeyA: "sl", ArrowRight: "r", KeyD: "sr" };
  const active = () => document.activeElement === canvas || (engaged && visible);
  const onKey = (isDown) => (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName || "")) return;
    if (!active()) return;
    if (isDown && ev.code === "KeyV") { setView(!fp); ev.preventDefault(); return; }
    if (isDown && (ev.code === "KeyE" || (ev.code === "Enter" && document.activeElement === canvas))) { interact(); ev.preventDefault(); return; }
    const k = KEYMAP[ev.code];
    if (!k) return;
    if (isDown) keys.add(k); else keys.delete(k);
    ev.preventDefault();
  };
  window.addEventListener("keydown", onKey(true));
  window.addEventListener("keyup", onKey(false));
  window.addEventListener("blur", () => keys.clear());
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) { engaged = false; keys.clear(); } }).observe(canvas);

  // ---- the example exercise: the room's frozen copy wakes up and acts it out at the main experiment ----
  const SLOTS = [[-0.52, 1.02], [0.52, 1.02], [-0.42, 0.42], [0.42, 0.42], [0, 0.42], [0, 1.3]];
  const installed = new Map();
  const pods = extra.pods;
  let fresh = null, flight = null;
  const mainOf = (id) => exhibits.find((e) => e.room === id);
  const step = (P, a, b, dur, delay) => anim(dur, (k) => { P.sleeper.position.lerpVectors(a, b, k); P.sleeper.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); }, delay);
  function setPod(P, mood, screen) { if (P.walking) P.pending = [mood, screen]; else { P.mood = mood; P.screen = screen; } }
  function wakePod(id) {
    const P = pods[id];
    if (!P || P.awake) return;
    P.awake = true; P.walking = true; P.mood = "sleep"; P.screen = "pulse"; P.last = t;
    const corner = new THREE.Vector3(P.home.x - 0.2, P.home.y, P.front.z);
    const d = reduced ? 0 : 1;
    anim(0.6 * d || 0.01, (k) => { P.glass.scale.y = Math.max(0.02, 1 - k); P.glass.position.y = 0.15 + 0.95 * (1 - k); P.mist.material.opacity = 0.45 * (1 - k); });
    anim(0.7 * d || 0.01, (k) => { P.sleeper.userData.power = 0.04 + k * 0.96; }, 0.3 * d);
    anim(0.01, () => { P.mood = "happy"; }, 0.9 * d);
    step(P, P.home.clone(), corner, 0.7 * d || 0.01, 1.0 * d);
    step(P, corner, P.front.clone(), 0.7 * d || 0.01, 1.7 * d);
    anim(0.01, () => {
      P.walking = false;
      P.sleeper.rotation.y = Math.atan2(P.look.x - P.front.x, P.look.z - P.front.z);
      const [m, sc] = P.pending ?? ["think", "pulse"]; P.pending = null; P.mood = m; P.screen = sc;
    }, 2.45 * d);
  }
  function sleepPod(id) {
    const P = pods[id];
    if (!P || !P.awake || P.walking) return;
    P.walking = true; P.mood = "idle";
    const corner = new THREE.Vector3(P.home.x - 0.2, P.home.y, P.front.z);
    const d = reduced ? 0 : 1;
    step(P, P.sleeper.position.clone(), corner, 0.7 * d || 0.01, 0);
    step(P, corner, P.home.clone(), 0.7 * d || 0.01, 0.7 * d);
    anim(0.01, () => { P.sleeper.rotation.y = Math.atan2(-P.home.x, -P.home.z); P.mood = "sleep"; }, 1.45 * d);
    anim(0.7 * d || 0.01, (k) => { P.sleeper.userData.power = 1 - k * 0.96; }, 1.5 * d);
    anim(0.6 * d || 0.01, (k) => { P.glass.scale.y = Math.max(0.02, k); P.glass.position.y = 0.15 + 0.95 * k; P.mist.material.opacity = 0.45 * k; }, 1.6 * d);
    anim(0.01, () => { P.awake = false; P.walking = false; P.screen = "off"; paintScreen(P.sleeper.userData.screenTex, "off", 0); }, 2.3 * d);
  }
  function clearExercise() { if (fresh && !flight) fresh.removeFromParent(); if (!flight) fresh = null; screenMode = null; alertUntil = 0; }
  function react(kind) {
    if (currentRoom === "cuna") return;
    engaged = true;
    const main = mainOf(currentRoom);
    const P = pods[currentRoom];
    if (P) P.last = t;
    if (kind === "run") { if (P?.awake && !P.walking) setPod(P, "think", "pulse"); else wakePod(currentRoom); }
    if (kind === "fail" && P) setPod(P, "alert", "alert");
    if (kind === "think" && P) setPod(P, "think", "sync");
    if (kind === "new") {
      if (P) setPod(P, "think", "test");
      if (fresh) fresh.removeFromParent();
      fresh = makeChip({ id: currentRoom, name: { en: "New", es: "Nueva" }, color: ROOMS[currentRoom].color });
      fresh.position.set(main.world.x, 2.4, main.world.z); fresh.scale.setScalar(0.001); fresh.userData.grow = 0;
      scene.add(fresh);
    }
    if (kind === "ok") { if (P) setPod(P, "happy", "ok"); main.act(); }
    if (kind === "install" && fresh) {
      if (P) { setPod(P, "happy", "ok"); P.cheer = t + 1.6; P.last = t - 7.5; } // back to sleep a few seconds later
      flight = { chip: fresh, from: fresh.position.clone(), t0: t, slot: installed.has(currentRoom) ? null : SLOTS[installed.size % SLOTS.length], id: currentRoom };
      fresh = null;
    }
  }
  let podPaint = 0;
  function tickPods(tt, dt) {
    podPaint += dt;
    for (const [id, P] of Object.entries(pods)) {
      if (P.awake && !P.walking && t - P.last > 10) sleepPod(id);
      if (!P.awake && P.mood === "sleep" && P.sleeper.userData.power < 0.05) continue; // asleep: nothing to animate
      pose(P.sleeper, P.mood, tt, dt);
      const up = t < (P.cheer ?? 0);
      const sw = P.walking ? Math.sin(tt * 9) * 0.35 : 0;
      setArms(P.sleeper, up ? -2.5 : -0.16, up ? 2.5 : P.mood === "think" ? 1.1 : 0.16, sw, -sw);
      if (podPaint > 0.08 && P.awake) paintScreen(P.sleeper.userData.screenTex, P.screen, tt);
    }
    if (podPaint > 0.08) podPaint = 0;
  }

  // ---- mini map ----
  const mm = minimap?.getContext("2d");
  function drawMap() {
    if (!mm) return;
    const W = minimap.width, Hh = minimap.height;
    mm.clearRect(0, 0, W, Hh);
    const sx = (x) => 6 + ((x + 14) / 28) * (W - 12), sz = (z) => 6 + ((z + 14) / 20) * (Hh - 12);
    LAYOUT.forEach((r) => {
      const [x1, z1, x2, z2] = r.rect;
      mm.fillStyle = r.id === currentRoom ? hex(ROOMS[r.id].color) : r.id === "cuna" ? "#e9f2ff" : hex(ROOMS[r.id].color) + "44";
      mm.fillRect(sx(x1) + 1, sz(z1) + 1, sx(x2) - sx(x1) - 2, sz(z2) - sz(z1) - 2);
    });
    const ax = sx(agent.position.x), az = sz(agent.position.z), hd = fp ? yaw : agent.rotation.y;
    mm.fillStyle = "#1c2b33"; mm.beginPath(); mm.moveTo(ax + Math.sin(hd) * 7, az + Math.cos(hd) * 7); mm.lineTo(ax + Math.sin(hd + 2.4) * 5, az + Math.cos(hd + 2.4) * 5); mm.lineTo(ax + Math.sin(hd - 2.4) * 5, az + Math.cos(hd - 2.4) * 5); mm.closePath(); mm.fill();
  }

  // ---- loop ----
  let last = performance.now(), screenTick = 0, boltTick = 0, mapTick = 0;
  const v = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const camTarget = new THREE.Vector3(0, 0.8, 0);
  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || document.hidden) return;
    t += dt;
    const tt = reduced ? 2 : t;
    runAnims(dt);
    updates.forEach((f) => f(tt, dt));
    tickPods(tt, dt);

    // movement
    let moving = false;
    if (fp) {
      if (keys.has("l")) yaw += dt * 2.2;
      if (keys.has("r")) yaw -= dt * 2.2;
      fwd.set(Math.sin(yaw), 0, Math.cos(yaw)); right.set(-Math.cos(yaw), 0, Math.sin(yaw));
      v.set(0, 0, 0);
      if (keys.has("f")) v.add(fwd);
      if (keys.has("b")) v.sub(fwd);
      if (keys.has("sr")) v.add(right);
      if (keys.has("sl")) v.sub(right);
      if (v.lengthSq() > 0) { path = []; pendingRoom = null; pendingExhibit = null; v.normalize().multiplyScalar(3 * dt); agent.position.add(v); collide(agent.position); moving = true; onMove(); }
    } else {
      if (keys.size) {
        camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, up).normalize();
        v.set(0, 0, 0);
        if (keys.has("f")) v.add(fwd);
        if (keys.has("b")) v.sub(fwd);
        if (keys.has("r") || keys.has("sr")) v.add(right);
        if (keys.has("l") || keys.has("sl")) v.sub(right);
        if (v.lengthSq() > 0) { path = []; pendingRoom = null; pendingExhibit = null; v.normalize(); agent.position.addScaledVector(v, 3 * dt); collide(agent.position); moving = true; turnTo(Math.atan2(v.x, v.z), dt); onMove(); }
      }
    }
    {
      if (path.length) {
        const p = path[0];
        const dx = p.x - agent.position.x, dz = p.z - agent.position.z, dist = Math.hypot(dx, dz);
        if (dist < 0.08 || stuck > 0.8) { path.shift(); stuck = 0; }
        else {
          const step = Math.min(dist, Math.min(3.4, dist * 3 + 0.6) * dt);
          agent.position.x += (dx / dist) * step; agent.position.z += (dz / dist) * step;
          collide(agent.position); moving = true;
          turnTo(Math.atan2(dx, dz), dt);
          const after = Math.hypot(p.x - agent.position.x, p.z - agent.position.z);
          stuck = after > dist - 0.002 ? stuck + dt : 0; // blocked by a wall or an exhibit: give up on this point
        }
        if (!path.length) arrive();
      } else if (pendingExhibit) {
        turnTo(Math.atan2(pendingExhibit.world.x - agent.position.x, pendingExhibit.world.z - agent.position.z), dt);
      }
      // a guided walk turns the view with it; otherwise, in first person, the view turns the body
      if (!fp || path.length || pendingExhibit) yaw = agent.rotation.y;
      else agent.rotation.y = yaw;
    }
    const lean = moving && !fp ? 0.14 : 0;
    agent.rotation.x += (lean - agent.rotation.x) * Math.min(1, dt * 6);
    agent.position.y = HOVER_Y + (fp ? 0 : Math.sin(tt * 2.2) * 0.05);

    // which room are we in
    const here = roomAt(agent.position.x, agent.position.z);
    if (here && here !== currentRoom) {
      currentRoom = here;
      onArrive(here);
      if (here !== "cuna") say({ en: `Welcome to the ${tr(ROOMS[here].name).toLowerCase()}.`, es: `Bienvenido a: ${tr(ROOMS[here].name).toLowerCase()}.` });
      guideKey = "";
    }
    if (currentRoom === "arc" && extra.arcStep) {
      const g = BYID.arc; const lx = agent.position.x - g.center[0], lz = agent.position.z - g.center[1];
      extra.arcStep(lx, lz);
    }

    // the coils: a jolt brings it back to life
    if (zap > 0) {
      zap -= dt;
      if ((boltTick += dt) > 0.05) {
        boltTick = 0;
        bolts.forEach((b, i) => {
          const a = new THREE.Vector3(), c = new THREE.Vector3();
          extra.coils[i].userData.top.getWorldPosition(a);
          if (fp) c.copy(camera.position).add(new THREE.Vector3(i ? 0.4 : -0.4, -0.4, 0));
          else u.bolts[i].userData.tip.getWorldPosition(c);
          b.update(a, c, 0.3 + Math.random() * 0.2); b.visible = Math.random() > 0.2;
        });
      }
      u.power = Math.min(1, u.power + dt * 0.7);
      if (zap <= 0) { bolts.forEach((b) => { b.visible = false; }); u.power = 1; armsUp = t + 2; happyUntil = t + 2.6; onFlash(); say({ en: "I'm alive!", es: "¡Estoy vivo!" }); }
    }

    // a new skill flies to its body
    if (fresh && fresh.userData.grow < 1) { fresh.userData.grow = Math.min(1, fresh.userData.grow + dt * 2.2); fresh.scale.setScalar(0.001 + fresh.userData.grow * 1.1); }
    if (fresh) { fresh.rotation.y += dt * 2; fresh.position.y = 2.4 + Math.sin(tt * 3) * 0.06; }
    if (flight) {
      const k = Math.min(1, (t - flight.t0) / 0.9), e = k * k * (3 - 2 * k);
      const slot = flight.slot || SLOTS[0];
      const to = agent.localToWorld(new THREE.Vector3(slot[0], slot[1], 0.5));
      flight.chip.position.lerpVectors(flight.from, to, e); flight.chip.position.y += Math.sin(e * Math.PI) * 0.8;
      flight.chip.scale.setScalar(1.1 - e * 0.75); flight.chip.rotation.y += dt * 8;
      if (k >= 1) {
        if (flight.slot) { agent.add(flight.chip); flight.chip.position.set(flight.slot[0], flight.slot[1], 0.47); flight.chip.rotation.set(0, 0, 0); flight.chip.scale.setScalar(0.42); if (flight.chip.userData.tag) flight.chip.userData.tag.visible = false; installed.set(flight.id, flight.chip); }
        else flight.chip.removeFromParent();
        flight = null; armsUp = t + 1.6; happyUntil = t + 2.2; onFlash();
        say(installed.size > 1 ? { en: `New piece! That's ${installed.size}.`, es: `¡Pieza nueva! Ya van ${installed.size}.` } : { en: "New piece!", es: "¡Pieza nueva!" });
      }
    }

    // pose
    const mood = u.power < 0.5 ? "sleep" : t < alertUntil ? "alert" : t < thinkUntil ? "think" : t < happyUntil ? "happy" : "idle";
    u.look.set(0, pendingExhibit && !path.length ? -0.2 : 0);
    pose(agent, mood, tt, dt);
    const swing = moving ? Math.sin(tt * 9) * 0.35 : 0, raised = t < armsUp;
    setArms(agent, raised ? -2.5 : -0.16 - Math.abs(swing) * 0.2, raised ? 2.5 : 0.16 + Math.abs(swing) * 0.2, swing, -swing);
    if ((screenTick += dt) > 0.06) { screenTick = 0; paintScreen(u.screenTex, screenMode || (currentRoom === "cuna" ? "pulse" : "test"), tt); }

    // walls: full height in first person, a cutaway in third person
    const wk = fp ? 1 : 0.32;
    wallK += (wk - wallK) * Math.min(1, dt * 5);
    walls.scale.y = wallK;

    // camera
    if (fp) {
      camera.fov += (72 - camera.fov) * Math.min(1, dt * 6);
      camera.position.set(agent.position.x, HOVER_Y + EYE - 0.38 + Math.sin(tt * 7) * (moving ? 0.025 : 0), agent.position.z);
      tmp.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).add(camera.position);
      camera.lookAt(tmp);
    } else {
      camera.fov += ((camera.aspect < 1 ? 56 : 40) - camera.fov) * Math.min(1, dt * 6);
      tmp.set(agent.position.x, 0.8, agent.position.z);
      camTarget.lerp(tmp, Math.min(1, dt * 3));
      const dist = camera.aspect < 1 ? 15 : 12.5, el = 0.85;
      camera.position.set(camTarget.x + Math.sin(camAz) * Math.cos(el) * dist, camTarget.y + Math.sin(el) * dist, camTarget.z + Math.cos(camAz) * Math.cos(el) * dist);
      camera.lookAt(camTarget);
    }
    camera.updateProjectionMatrix();

    // signs and plaques face whoever is looking only through their own rotation (they're fixed); render
    renderer.render(scene, camera);
    updateGuide();
    if ((mapTick += dt) > 0.1) { mapTick = 0; drawMap(); }

    if (fp) onFrame({ x: canvas.clientWidth / 2, y: canvas.clientHeight * 0.32 });
    else { u.brain.getWorldPosition(tmp); tmp.y += 0.05; tmp.project(camera); onFrame({ x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight }); }
  };
  function turnTo(target, dt) { let d = target - agent.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); agent.rotation.y += d * Math.min(1, dt * 8); }
  function arrive() {
    if (pendingExhibit) { const e = pendingExhibit; interact(e); pendingExhibit = null; }
    if (pendingRoom) { const id = pendingRoom; pendingRoom = null; onArrive(id); if (id === "cuna" && !reduced) extra.zap(); }
  }
  tick();
  onArrive("cuna");
  onGuide({ room: "cuna" });

  return {
    goTo,
    react,
    relabel: B.relabel,
    press: (k, isDown) => { engaged = true; if (isDown) keys.add(k); else keys.delete(k); },
    setView,
    get fp() { return fp; },
    interact: () => interact(),
    exhibit: (room, key) => exhibits.find((e) => e.room === room && e.key === key),
    focusCanvas: () => { engaged = true; canvas.focus({ preventScroll: true }); },
  };
}

/** A still picture of the building (fallback without WebGL). */
export function renderRoomStill(renderer, scene, camera) {
  const B = buildRoom(scene);
  B.walls.scale.y = 0.32;
  const agent = makeAgent({ hover: true });
  agent.scale.setScalar(0.85);
  agent.position.set(0, HOVER_Y, 0.4);
  agent.userData.power = 1;
  for (let i = 0; i < 30; i++) pose(agent, "happy", 2, 0.05);
  setArms(agent, -0.16, 2.4);
  paintScreen(agent.userData.screenTex, "pulse", 0.5);
  scene.add(agent);
  camera.fov = 40;
  camera.position.set(0, 21, 14);
  camera.lookAt(0, 0, -4.2);
  camera.updateMatrixWorld();
}
