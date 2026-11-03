/* Dressing for the lab: everything that makes a room feel lived in (props, neon, glow, live screens, dust,
   a ceiling you only see in first person). room.js builds the exhibits; this adds the world around them.
   Everything here is decoration: it never blocks the agent, except a few solid pieces it reports back. Local
   coordinates: side rooms span x ±3, z ±4 with the door at z = +4 and the mural on z = -4; the cradle spans ±6. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { canvasTex, rr, FONT, tr } from "./agent.js";

const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const rnd = (a, b) => a + Math.random() * (b - a);
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, ...o });
const matte = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
const lit = (color, i = 1.1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, roughness: 0.4 });
const box = (w, h, d, color, o) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.15), glossy(color, o));
const slab = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

/* ---------- soft light: halos in the air and pools on the floor ---------- */
const dotCache = new Map();
function dotTex(kind) {
  if (dotCache.has(kind)) return dotCache.get(kind);
  const t = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    if (kind === "dust") { r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)"); }
    else { r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); }
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  dotCache.set(kind, t);
  return t;
}
function halo(color, size, opacity = 0.55) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex("glow"), color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(size); s.renderOrder = 4;
  return s;
}
function pool(color, r, opacity = 0.4) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: dotTex("glow"), color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.025; m.renderOrder = 2;
  return m;
}
function poolAt(color, r, opacity, x, z) { const m = pool(color, r, opacity); m.position.x = x; m.position.z = z; return m; }
function dust(g, color, n, half, height = 3) {
  const pos = new Float32Array(n * 3), seed = [];
  for (let i = 0; i < n; i++) { pos.set([rnd(-half[0], half[0]), rnd(0.2, height), rnd(-half[1], half[1])], i * 3); seed.push(rnd(0, 6.28)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, map: dotTex("dust"), color, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
  pts.frustumCulled = false; g.add(pts);
  return (t, dt) => {
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] += dt * (0.05 + (i % 5) * 0.012);
      pos[i * 3] += Math.sin(t * 0.4 + seed[i]) * dt * 0.06;
      if (pos[i * 3 + 1] > height) pos[i * 3 + 1] = 0.15;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

/* ---------- live screens (a canvas that repaints a few times a second) ---------- */
function screen(w, h, px, draw, { x = 0, y = 0, z = 0, ry = 0, frame = 0x1c2b33 } = {}) {
  const g = new THREE.Group();
  const tex = canvasTex(px, Math.round((px * h) / w), (c, W, H) => draw(c, W, H, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.z = 0.045;
  g.add(slab(w + 0.1, h + 0.1, 0.08, matte(frame, { roughness: 0.4 })), face);
  g.position.set(x, y, z); g.rotation.y = ry;
  let acc = 0;
  g.userData.tick = (t, dt) => { if ((acc += dt) < 0.12) return; acc = 0; const { g: c, c: cv } = tex.userData; draw(c, cv.width, cv.height, t); tex.needsUpdate = true; };
  g.userData.redraw = (t = 0) => { const { g: c, c: cv } = tex.userData; draw(c, cv.width, cv.height, t); tex.needsUpdate = true; };
  return g;
}

/* ---------- props ---------- */
function plant(x, z, scale = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 20), glossy(0xe9d7c2, { roughness: 0.6 })); pot.position.y = 0.16;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 20), matte(0x4a3a2c)); soil.position.y = 0.32;
  g.add(pot, soil);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glossy(i % 2 ? 0x3ccf6e : 0x22b864, { roughness: 0.5 }));
    leaf.scale.set(0.45, 1.9, 0.18);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.09, 0.62, Math.sin(a) * 0.09);
    leaf.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5);
    g.add(leaf);
  }
  g.position.set(x, 0, z); g.scale.setScalar(scale);
  return g;
}
function bench(x, z, ry, color) {
  const g = new THREE.Group();
  g.add(at(box(1.5, 0.12, 0.44, 0xffffff), 0, 0.42, 0));
  [-0.62, 0.62].forEach((lx) => g.add(at(box(0.1, 0.4, 0.38, color), lx, 0.2, 0)));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}
function shelf(books) {
  const g = new THREE.Group();
  g.add(at(box(2.0, 1.9, 0.4, 0xf1e6d6), 0, 0.95, 0));
  const palette = books ?? [0x5b9bff, 0x3ccf6e, 0xff6600, 0xff8f70, 0x8a7dff];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
    const b = box(0.15, 0.4 + ((i * 5 + row * 3) % 4) * 0.05, 0.28, palette[(i + row * 2) % palette.length]);
    g.add(at(b, -0.8 + i * 0.2, 0.3 + row * 0.58, 0.1));
  }
  return g;
}
function rack(leds) {
  const g = new THREE.Group();
  g.add(at(box(0.7, 1.9, 0.6, 0x1c2b33), 0, 0.95, 0));
  for (let i = 0; i < 10; i++) {
    g.add(at(box(0.56, 0.08, 0.02, 0x2a3d4c), 0, 0.3 + i * 0.16, 0.31));
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), lit(0x2ec4b6, 0.9));
    led.position.set(-0.2 + (i % 3) * 0.08, 0.3 + i * 0.16, 0.325); g.add(led); leds.push(led);
  }
  return g;
}
function arcade(color, ry) {
  const g = new THREE.Group();
  g.add(at(box(0.8, 1.7, 0.7, 0x1c2b33), 0, 0.85, 0));
  const top = at(box(0.8, 0.28, 0.5, color, { emissive: color, emissiveIntensity: 0.7 }), 0, 1.78, 0.04); g.add(top);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshBasicMaterial({ color: 0x0f1d26, toneMapped: false }));
  scr.position.set(0, 1.25, 0.355); scr.rotation.x = -0.12; g.add(scr);
  const ctl = at(box(0.7, 0.1, 0.3, 0x2a3d4c), 0, 0.82, 0.4); ctl.rotation.x = 0.2; g.add(ctl);
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), lit(0xff6a3d, 0.8)), -0.15, 0.9, 0.42));
  [0.05, 0.17].forEach((bx, i) => g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), lit(i ? 0xffc83d : 0x3ccf6e, 0.8)), bx, 0.89, 0.42)));
  g.userData.scr = scr; g.rotation.y = ry;
  return g;
}
function pendant(color, y = 2.2) {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 3.0 - y, 6), matte(0x1c2b33)), 0, y + (3.0 - y) / 2, 0));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 24, 1, true), glossy(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 })); shade.position.y = y;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), lit(0xfff1c2, 1.6)); bulb.position.y = y - 0.04;
  const h = halo(0xffe7a8, 1.1, 0.5); h.position.y = y - 0.15;
  g.add(shade, bulb, h);
  return g;
}
function floorLamp(x, z, color) {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 20), matte(0x1c2b33)), 0, 0.02, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8), matte(0x1c2b33)), 0, 0.77, 0));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), lit(color, 1.3)), 0, 1.58, 0));
  const h = halo(color, 1.5, 0.5); h.position.y = 1.58; g.add(h);
  g.position.set(x, 0, z);
  return g;
}
function neonLine(pts, color, thick = 0.035) {
  const g = new THREE.Group();
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1, z1] = pts[i], [x2, y2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick, len, 8), lit(color, 1.5));
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).normalize());
    g.add(m);
    const h = halo(color, 0.7, 0.35); h.position.copy(m.position); g.add(h);
  }
  return g;
}

/* ---------- shared dressing ---------- */
function stripAround(g, color, hx, hz, gaps) {
  const m = lit(color, 1.1), t = 0.045, y = 0.07;
  const add = (x1, z1, x2, z2) => { const w = Math.abs(x2 - x1) || t, d = Math.abs(z2 - z1) || t; g.add(at(slab(w, t, d, m), (x1 + x2) / 2, y, (z1 + z2) / 2)); };
  const segs = (a, b, cuts) => { const out = []; let s = a; cuts.forEach(([c1, c2]) => { out.push([s, c1]); s = c2; }); out.push([s, b]); return out; };
  segs(-hx, hx, gaps.n).forEach(([a, b]) => add(a, -hz, b, -hz));
  segs(-hx, hx, gaps.s).forEach(([a, b]) => add(a, hz, b, hz));
  segs(-hz, hz, gaps.w).forEach(([a, b]) => add(-hx, a, -hx, b));
  segs(-hz, hz, gaps.e).forEach(([a, b]) => add(hx, a, hx, b));
}
function ceiling(w, d, color, { dark = false } = {}) {
  const tex = canvasTex(512, Math.round((512 * d) / w), (c, W, H) => {
    c.fillStyle = dark ? "#0f1d33" : "#e9eff6"; c.fillRect(0, 0, W, H);
    if (dark) {
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,255,255,${rnd(0.3, 1)})`; c.beginPath(); c.arc(rnd(0, W), rnd(0, H), rnd(0.6, 2), 0, 7); c.fill(); }
    } else {
      const cols = Math.max(2, Math.round(w / 2)), rows = Math.max(2, Math.round(d / 2));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = ((i + 0.5) / cols) * W, y = ((j + 0.5) / rows) * H;
        c.fillStyle = "#ffffff"; rr(c, x - 46, y - 18, 92, 36, 8); c.fill();
        c.strokeStyle = hex(color) + "99"; c.lineWidth = 3; rr(c, x - 46, y - 18, 92, 36, 8); c.stroke();
      }
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
  m.rotation.x = Math.PI / 2; m.position.y = 2.99;
  return m;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---------- one dresser per room ---------- */
const DRESS = {};

DRESS.cuna = (g, { color, ceil, updates }) => {
  const blue = 0x4aa8ff;
  // the floor emblem and the holo rings that wake up around the cradle
  [[2.0, 0.04], [3.4, 0.03], [5.0, 0.025]].forEach(([r, w]) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, w, 8, 96), lit(color, 0.9)); t.rotation.x = Math.PI / 2; t.position.set(0, 0.04, -1.2); g.add(t); });
  g.add(poolAt(blue, 3.2, 0.3, 0, -3.6));
  const rings = [0.7, 1.35, 2.0].map((y, i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.4 - i * 0.12, 0.018, 8, 80), lit(blue, 1.6)); r.position.set(0, y, -4.3); g.add(r); return r; });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.8, 32, 1, true), new THREE.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  beam.position.set(0, 1.45, -4.3); g.add(beam);
  const logoHalo = halo(blue, 5.2, 0.35); logoHalo.position.set(0, 3.5, -5.5); g.add(logoHalo);
  // benches and plants
  g.add(bench(-2.4, 5.3, 0, color), bench(2.4, 5.3, 0, color));
  [[-5.2, 5.2], [5.2, 5.2], [-5.3, -0.2], [5.3, -0.2], [-1.9, -5.3], [1.9, -5.3]].forEach(([x, z], i) => g.add(plant(x, z, i < 4 ? 1.4 : 1.1)));
  // the dashboards on the south wall: bars, a line and the harness status
  const dash = (x, title, kind) => screen(1.9, 1.1, 512, (c, W, H, t) => {
    c.fillStyle = "#0f1d26"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#9fb3c2"; c.font = `700 26px ${FONT}`; c.fillText(title, 24, 40);
    if (kind === "bars") for (let i = 0; i < 10; i++) { const h = (0.25 + 0.7 * Math.abs(Math.sin(t * 1.3 + i * 0.7))) * (H - 120); c.fillStyle = i % 3 ? "#4aa8ff" : "#7ee2a8"; rr(c, 30 + i * 46, H - 30 - h, 30, h, 8); c.fill(); }
    if (kind === "line") { c.strokeStyle = "#ff8f70"; c.lineWidth = 5; c.beginPath(); for (let i = 0; i <= 40; i++) { const y = H / 2 + 20 + Math.sin(i * 0.4 + t * 2) * 36 + Math.sin(i * 0.9 - t) * 18; if (i) c.lineTo(30 + i * 11.5, y); else c.moveTo(30, y); } c.stroke(); }
    if (kind === "status") ["tests", "scope", "budget", "risk", "human"].forEach((s, i) => { c.fillStyle = "#7ee2a8"; c.beginPath(); c.arc(44, 84 + i * 50, 11, 0, 7); c.fill(); c.fillStyle = "#e6edf3"; c.font = `600 26px ${FONT}`; c.fillText(s, 70, 93 + i * 50); });
  }, { x, y: 1.9, z: 5.86, ry: Math.PI });
  [dash(-3.2, "SKILLS / WEEK", "bars"), dash(0, "SCORE", "line"), dash(3.2, "HARNESS", "status")].forEach((s) => { g.add(s); updates.push(s.userData.tick); });
  // east and west walls: tall light panels
  [-5.86, 5.86].forEach((x) => [-1.0, 0, 1.0].forEach((z, i) => g.add(at(slab(0.05, 1.6 + (i === 1 ? 0.5 : 0), 0.1, lit(blue, 1.2)), x, 1.5, z))));
  // the ceiling you see from inside
  [[-3, 0], [3, 0], [0, 3], [0, -3]].forEach(([x, z]) => { const p = pendant(0xdff0ff, 2.5); p.position.set(x, 0, z); ceil.add(p); });
  updates.push((t) => { rings.forEach((r, i) => { r.rotation.x = t * (0.6 + i * 0.25) + i; r.rotation.y = t * (0.4 - i * 0.2); r.position.y = [0.7, 1.35, 2.0][i] + Math.sin(t * 1.4 + i) * 0.06; }); beam.material.opacity = 0.08 + Math.sin(t * 2) * 0.03; });
};

DRESS.swe = (g, { color, updates }) => {
  // a wall of monitors with scrolling code, on the left
  const code = ["const d = parse(input)", "if (zone) d = toUTC(d, zone)", "return fmt(d)", "// fixes #4127", "test('shift', () => {", "  expect(day(d)).toBe(5)", "})", "PASS  12 tests"];
  [[-1.0, 1.85], [0.4, 1.85]].forEach(([zz, y], i) => {
    const s = screen(1.1, 0.7, 384, (c, W, H, t) => {
      c.fillStyle = "#13222c"; c.fillRect(0, 0, W, H); c.font = `600 17px monospace`;
      for (let k = 0; k < 9; k++) { const line = code[(k + Math.floor(t * 1.5) + i * 3) % code.length]; c.fillStyle = line.startsWith("PASS") ? "#7ee2a8" : line.startsWith("//") ? "#6f8798" : k % 3 ? "#cfe3f5" : "#8fc2ff"; c.fillText(line, 14, 28 + k * 30); }
    }, { x: -2.86, y, z: zz - 1.8, ry: Math.PI / 2 });
    g.add(s); updates.push(s.userData.tick);
  });
  g.add(at(box(0.5, 0.9, 2.6, 0xffffff), -2.55, 0.45, -1.4));
  // a whiteboard: bug → fix → test
  const wb = screen(1.9, 1.1, 512, (c, W, H) => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H); c.lineWidth = 6; c.lineCap = "round";
    [["#c42d12", "bug", 60], ["#5b9bff", "fix", 256], ["#22b864", "test", 452]].forEach(([col, s, x]) => { c.strokeStyle = col; c.fillStyle = col; rr(c, x - 52, 120, 104, 70, 18); c.stroke(); c.font = `800 30px ${FONT}`; c.textAlign = "center"; c.fillText(s, x, 166); });
    c.strokeStyle = "#1c2b33"; [[116, 156, 200, 156], [312, 156, 396, 156]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineTo(d - 14, e - 10); c.moveTo(d, e); c.lineTo(d - 14, e + 10); c.stroke(); });
    c.fillStyle = "#4b5f6d"; c.font = `600 24px ${FONT}`; c.textAlign = "left"; c.fillText(tr({ en: "report → patch → hidden tests", es: "reporte → parche → pruebas ocultas" }), 70, 60);
  }, { x: 2.86, y: 1.6, z: 2.0, ry: -Math.PI / 2, frame: 0xc9d2dc });
  g.add(wb);
  // the toolboard
  const tb = new THREE.Group(); tb.position.set(-2.88, 1.5, 2.3); tb.rotation.y = Math.PI / 2; g.add(tb);
  tb.add(slab(1.5, 1.1, 0.05, matte(0xe6ebf0)));
  [0x5b9bff, 0xff8f70, 0xffc83d, 0x3ccf6e].forEach((col, i) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6 + i * 0.08, 10), glossy(col)); w.rotation.z = Math.PI / 2 - 0.3 + i * 0.2; w.position.set(-0.5 + i * 0.33, 0.1 - (i % 2) * 0.2, 0.06); tb.add(w); });
  // the status lamps and the repair-shop beacon
  const bcn = new THREE.Group(); bcn.position.set(-2.4, 0, 3.3); g.add(bcn);
  bcn.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.5, 16), glossy(0x1c2b33)), 0, 0.25, 0));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), lit(0xffa928, 1)); lamp.position.y = 0.62; bcn.add(lamp);
  const lh = halo(0xffa928, 1.4, 0.5); lh.position.y = 0.62; bcn.add(lh);
  g.add(plant(2.5, 3.3), poolAt(color, 1.9, 0.35, 0, -2.2));
  const sweep = poolAt(0xffa928, 1.2, 0.25, -2.4, 3.3); g.add(sweep);
  updates.push((t) => { const k = clamp01(0.5 + Math.sin(t * 4) * 0.5); lamp.material.emissiveIntensity = 0.3 + k * 1.6; lh.material.opacity = 0.15 + k * 0.5; sweep.material.opacity = 0.05 + k * 0.3; });
};

DRESS.terminal = (g, { color, updates }) => {
  const leds = [];
  [[2.55, 1.6, -Math.PI / 2], [2.55, 2.5, -Math.PI / 2], [2.55, 3.4, -Math.PI / 2]].forEach(([x, z, ry]) => { const r = rack(leds); r.position.set(x, 0, z); r.rotation.y = ry; r.scale.setScalar(0.85); g.add(r); });
  const rain = Array.from({ length: 22 }, () => ({ y: rnd(0, 1), s: rnd(0.2, 0.7) }));
  const matrix = screen(1.8, 1.1, 384, (c, W, H, t) => {
    c.fillStyle = "rgba(6,18,16,.35)"; c.fillRect(0, 0, W, H); c.font = `700 18px monospace`;
    rain.forEach((d, i) => { const y = ((d.y + t * d.s) % 1) * H; c.fillStyle = "#7ee2a8"; c.fillText(String.fromCharCode(0x30a0 + ((i * 7 + Math.floor(t * 8 + i)) % 90)), 8 + i * 17, y); c.fillStyle = "rgba(46,196,182,.55)"; c.fillText(String.fromCharCode(0x30a0 + ((i * 11 + Math.floor(t * 8)) % 90)), 8 + i * 17, y - 22); });
  }, { x: -2.86, y: 1.55, z: 1.7, ry: Math.PI / 2 });
  matrix.userData.redraw(0); g.add(matrix); updates.push(matrix.userData.tick);
  // cables glowing along the floor from the racks to the terminal
  [[[2.2, 0.05, 1.9], [1.2, 0.05, 0.4], [0.6, 0.05, -1.7]], [[2.2, 0.05, 3.0], [0.9, 0.05, 2.2], [-0.5, 0.05, 0.8], [-1.6, 0.05, -0.2]]].forEach((p, i) => g.add(neonLine(p, i ? 0x2ec4b6 : 0x7ee2a8, 0.022)));
  g.add(plant(-2.5, 3.3), poolAt(color, 2.2, 0.3, 0, -1.2));
  // a coffee-cup-sized UPS with a heartbeat light
  const ups = new THREE.Group(); ups.position.set(-2.4, 0, 3.1); g.add(ups); ups.add(at(box(0.5, 0.5, 0.4, 0x1c2b33), 0, 0.25, 0));
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), lit(0x7ee2a8, 1)); hb.position.set(0.15, 0.4, 0.21); ups.add(hb);
  updates.push((t) => { hb.material.emissiveIntensity = 0.3 + (Math.sin(t * 3) > 0.6 ? 1.5 : 0); leds.forEach((l, i) => { l.material.emissiveIntensity = Math.sin(t * (2 + (i % 5)) + i) > 0.1 ? 1.1 : 0.12; }); });
};

DRESS.arc = (g, { color, ceil, updates }) => {
  const a1 = arcade(0xff8f70, Math.PI / 2), a2 = arcade(0x8a7dff, Math.PI / 2);
  a1.position.set(-2.55, 0, -1.6); a2.position.set(-2.55, 0, -0.5); g.add(a1, a2);
  const play = (c, W, H, t, col) => { c.fillStyle = "#0f1d26"; c.fillRect(0, 0, W, H); for (let i = 0; i < 6; i++) { c.fillStyle = col; c.fillRect(((i * 53 + t * 40 * (1 + i % 2)) % (W - 30)), 20 + i * 30, 26, 18); } c.fillStyle = "#ffc83d"; c.fillRect(W / 2 - 14 + Math.sin(t * 3) * 60, H - 40, 28, 18); };
  [a1, a2].forEach((a, i) => { const tex = canvasTex(160, 120, (c, W, H) => play(c, W, H, 0, i ? "#8a7dff" : "#ff8f70")); a.userData.scr.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); a.userData.tex = tex; a.userData.col = i ? "#8a7dff" : "#ff8f70"; });
  let acc = 0;
  updates.push((t, dt) => { if ((acc += dt) < 0.12) return; acc = 0; [a1, a2].forEach((a) => { const { g: c, c: cv } = a.userData.tex.userData; play(c, cv.width, cv.height, t, a.userData.col); a.userData.tex.needsUpdate = true; }); });
  g.add(poolAt(0xff8f70, 1.3, 0.4, -2.1, -1.1));
  // neon zigzag on the right wall and a frame around the door
  g.add(neonLine([[2.88, 0.7, -2.8], [2.88, 2.2, -2.0], [2.88, 0.8, -1.0], [2.88, 2.3, 0.0], [2.88, 0.9, 1.0]], 0x8a7dff));
  g.add(neonLine([[-1.15, 2.75, 3.86], [1.15, 2.75, 3.86]], 0xff8f70, 0.03));
  // floating blocks above the board
  const blocks = [[0xff8f70, [[0, 0], [1, 0], [2, 0], [1, 1]]], [0x5b9bff, [[0, 0], [1, 0], [0, 1], [1, 1]]], [0xffc83d, [[0, 0], [0, 1], [0, 2], [1, 2]]]].map(([col, cells], i) => {
    const b = new THREE.Group();
    cells.forEach(([x, y]) => b.add(at(box(0.16, 0.16, 0.16, col, { emissive: col, emissiveIntensity: 0.45 }), x * 0.17, y * 0.17, 0)));
    b.position.set(-1.8 + i * 1.8, 2.3, -1.4); g.add(b); return b;
  });
  g.add(plant(2.5, 3.3));
  updates.push((t) => blocks.forEach((b, i) => { b.rotation.y = t * (0.7 + i * 0.2); b.rotation.x = Math.sin(t + i) * 0.4; b.position.y = 2.3 + Math.sin(t * 1.3 + i * 2) * 0.14; }));
  for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), lit([0xff8f70, 0x8a7dff, 0x5b9bff, 0xffc83d, 0x3ccf6e][i], 1)); p.position.set(-2 + i, 2.65, 0.4); ceil.add(p); p.position.y = 2.6; p.userData.i = i; }
  updates.push((t) => ceil.children.forEach((p) => { if (p.userData.i !== undefined) { p.rotation.y = t * 2 + p.userData.i; p.position.y = 2.55 + Math.sin(t * 2 + p.userData.i) * 0.08; } }));
  void color;
};

DRESS.web = (g, { color, ceil, updates }) => {
  const s2 = shelf(); s2.position.set(2.72, 0, 2.2); s2.rotation.y = -Math.PI / 2; g.add(s2);
  const s3 = shelf([0x3ccf6e, 0x5b9bff, 0xffb53d, 0xff6600]); s3.position.set(-2.72, 0, 2.2); s3.rotation.y = Math.PI / 2; g.add(s3);
  // a globe on a stand
  const gl = new THREE.Group(); gl.position.set(-1.7, 0, 3.0); g.add(gl);
  gl.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 20), glossy(0x8a5a2b)), 0, 0.03, 0));
  gl.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), glossy(0x8a5a2b)), 0, 0.38, 0));
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 20), glossy(0x5b9bff, { roughness: 0.4 })); globe.position.y = 0.95; gl.add(globe);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.305, 12, 8)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); wire.position.y = 0.95; gl.add(wire);
  [[0.1, 0.05, 0.28], [-0.2, -0.1, 0.2], [0.2, 0.2, -0.2]].forEach(([x, y, z]) => { const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glossy(0x3ccf6e)); c.position.set(x, y + 0.95, z); c.scale.set(1.4, 1, 0.5); globe.add(c); c.position.set(x, y, z); });
  // a warm reading rug and lamps
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.02, 48), matte(0xc0453a, { roughness: 0.9 })); rug.position.set(0, 0.012, 1.5); g.add(rug);
  const rug2 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 6, 64), matte(0xf1e6d6)); rug2.rotation.x = Math.PI / 2; rug2.position.set(0, 0.03, 1.5); g.add(rug2);
  g.add(floorLamp(2.4, 3.3, 0xffd27a), poolAt(0xffd27a, 1.3, 0.35, 2.4, 3.3), plant(-2.5, 3.5));
  [[-1.1, 0.5], [1.1, 0.5]].forEach(([x, z]) => { const p = pendant(0x3ccf6e, 2.2); p.position.set(x, 0, z); ceil.add(p); });
  // a magnifying glass floating over the answer
  const mag = new THREE.Group(); mag.position.set(2.2, 1.9, -0.4); g.add(mag);
  mag.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 32), glossy(0x1c2b33)));
  mag.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), glossy(0x1c2b33)), 0.2, -0.28, 0).rotateZ(0.6));
  mag.add(new THREE.Mesh(new THREE.CircleGeometry(0.19, 28), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })));
  updates.push((t) => { globe.rotation.y = t * 0.6; wire.rotation.y = t * 0.6; mag.position.y = 1.9 + Math.sin(t * 1.5) * 0.06; mag.rotation.z = Math.sin(t) * 0.25; });
  void color;
};

DRESS.research = (g, { color, ceil, updates }) => {
  // a Hacker News front page on the left wall, in its own orange
  const rows = ["Agents that improve themselves, safely", "Show HN: a tiny lab for AI benchmarks", "Why sealed exams beat leaderboards", "METR: the doubling time of task length", "A gentle intro to rubric grading"];
  const hn = screen(2.3, 1.45, 640, (c, W, H) => {
    c.fillStyle = "#f6f6ef"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#ff6600"; c.fillRect(0, 0, W, 70);
    c.fillStyle = "#fff"; c.fillRect(16, 14, 42, 42); c.fillStyle = "#ff6600"; c.font = `800 34px ${FONT}`; c.textAlign = "center"; c.fillText("Y", 37, 48);
    c.textAlign = "left"; c.fillStyle = "#1c2b33"; c.font = `800 30px ${FONT}`; c.fillText("Hacker News", 74, 46);
    rows.forEach((r, i) => { c.fillStyle = "#828282"; c.font = `600 22px ${FONT}`; c.fillText(`${i + 1}.`, 18, 118 + i * 62); c.fillStyle = "#1c2b33"; c.font = `700 25px ${FONT}`; c.fillText(r, 52, 116 + i * 62); c.fillStyle = "#828282"; c.font = `500 18px ${FONT}`; c.fillText(`${312 - i * 41} points · ${64 - i * 9} comments`, 52, 140 + i * 62); });
  }, { x: -2.86, y: 1.55, z: 1.9, ry: Math.PI / 2, frame: 0xff6600 });
  g.add(hn); hn.userData.redraw(0);
  // a microscope and a rack of flasks with bubbling liquid
  const ms = new THREE.Group(); ms.position.set(-2.2, 0, 3.0); g.add(ms);
  ms.add(at(box(0.9, 0.7, 0.6, 0xffffff), 0, 0.35, 0));
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 20, Math.PI), glossy(0x1c2b33)); arm.position.set(0.05, 0.9, 0); arm.rotation.z = -Math.PI / 2 + 0.2; ms.add(arm);
  ms.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4, 14), glossy(0xc9d2dc, { metalness: 0.6 })), -0.12, 1.05, 0).rotateZ(-0.35));
  const table = new THREE.Group(); table.position.set(2.45, 0, 2.5); g.add(table);
  table.add(at(box(0.7, 0.8, 1.7, 0xffffff), 0, 0.4, 0));
  const bubbles = [];
  [0xff6600, 0x2ec4b6, 0x8a7dff, 0xffc83d].forEach((col, i) => {
    const f = new THREE.Group(); f.position.set(0, 0.8, -0.65 + i * 0.43); table.add(f);
    f.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.15, 0.28, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false })), 0, 0.14, 0));
    f.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.13, 0.18, 16), lit(col, 0.7)), 0, 0.1, 0));
    f.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false })), 0, 0.35, 0));
    for (let b = 0; b < 3; b++) { const bb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, toneMapped: false })); bb.userData = { seed: rnd(0, 3), f }; f.add(bb); bubbles.push(bb); }
    const h = halo(col, 0.7, 0.35); h.position.set(0, 0.15, 0); f.add(h);
  });
  // orange light: sconces and a glow pool, like the front page itself
  g.add(floorLamp(-2.5, 0.3, 0xff8a33), poolAt(0xff6600, 1.6, 0.3, -2.3, 0.3), plant(2.5, 3.6));
  [[-1.1, 0.6], [1.1, 0.6]].forEach(([x, z]) => { const p = pendant(0xff6600, 2.25); p.position.set(x, 0, z); ceil.add(p); });
  updates.push((t) => bubbles.forEach((b) => { const k = (t * 0.6 + b.userData.seed) % 1; b.position.set(Math.sin(k * 9 + b.userData.seed) * 0.03, 0.12 + k * 0.4, Math.cos(k * 7) * 0.03); b.material.opacity = 0.9 * (1 - k); }));
  void color;
};

DRESS.horizon = (g, { color, ceil, updates }) => {
  // an orrery floating over the room: a sun, rings and planets that stand for longer and longer tasks
  const or = new THREE.Group(); or.position.set(0, 2.35, 0.9); g.add(or);
  or.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), lit(0xffc83d, 1.4)));
  const sunH = halo(0xffc83d, 1.1, 0.5); or.add(sunH);
  const planets = [[0.42, 0x8a7dff, 0.07, 1.4], [0.7, 0x5b9bff, 0.09, 0.9], [1.0, 0x3ccf6e, 0.11, 0.6], [1.3, 0xff8f70, 0.08, 0.4]].map(([r, col, s, sp]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 6, 64), lit(col, 0.6)); ring.rotation.x = Math.PI / 2; or.add(ring);
    const p = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 12), glossy(col, { emissive: col, emissiveIntensity: 0.25 })); p.userData = { r, sp, a: rnd(0, 6) }; or.add(p); return p;
  });
  // a timeline on the floor, from the door to the tubes
  const tl = slab(0.05, 0.02, 6.2, lit(color, 0.8)); tl.position.set(0, 0.035, 0.6); g.add(tl);
  const ticks = [];
  for (let i = 0; i < 11; i++) { const tk = slab(0.5, 0.02, 0.04, lit(i % 5 === 0 ? color : 0xc9d2dc, 0.5)); tk.position.set(0, 0.034, 3.6 - i * 0.62); g.add(tk); ticks.push(tk); }
  const pulse = halo(color, 0.9, 0.7); pulse.position.set(0, 0.2, 3.6); g.add(pulse);
  // a big wall clock that really ticks
  const clock = screen(1.5, 1.5, 384, (c, W, H) => {
    const d = new Date(), cx = W / 2, cy = H / 2, R = W * 0.44;
    c.fillStyle = "#13203a"; c.fillRect(0, 0, W, H); c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
    c.strokeStyle = hex(color); c.lineWidth = 10; c.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; c.strokeStyle = "#1c2b33"; c.lineWidth = i % 3 ? 3 : 7; c.beginPath(); c.moveTo(cx + Math.sin(a) * R * 0.84, cy - Math.cos(a) * R * 0.84); c.lineTo(cx + Math.sin(a) * R * 0.95, cy - Math.cos(a) * R * 0.95); c.stroke(); }
    const hand = (ang, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round"; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(ang) * R * len, cy - Math.cos(ang) * R * len); c.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12 * 6.283, 0.5, 9, "#1c2b33"); hand((d.getMinutes() + d.getSeconds() / 60) / 60 * 6.283, 0.75, 6, "#1c2b33"); hand(d.getSeconds() / 60 * 6.283, 0.85, 3, hex(color));
  }, { x: 2.86, y: 1.8, z: 1.9, ry: -Math.PI / 2, frame: 0x1c2b33 });
  g.add(clock); clock.userData.redraw(0);
  updates.push((t, dt) => { clock.userData.tick(t, dt); or.rotation.y = t * 0.15; planets.forEach((p) => { const a = p.userData.a + t * p.userData.sp; p.position.set(Math.cos(a) * p.userData.r, 0, Math.sin(a) * p.userData.r); }); sunH.material.opacity = 0.4 + Math.sin(t * 2) * 0.1; const k = (t * 0.35) % 1; pulse.position.z = 3.6 - k * 6.2; pulse.material.opacity = 0.7 * Math.sin(k * Math.PI); });
  g.add(plant(-2.5, 3.4), plant(2.5, 3.4));
  // the ceiling here is a night sky
  ceil.userData.dark = true;
};

/** Dresses one room. `g` is the room's group; returns the per-frame update and the ceiling group (first person only). */
export function decorate(id, g, room) {
  const updates = [];
  const ceil = new THREE.Group();
  const cuna = id === "cuna";
  const hx = cuna ? 6 : 3, hz = cuna ? 6 : 4;
  const gaps = cuna
    ? { n: [[-4.15, -1.85], [1.85, 4.15]], s: [], w: [[-4.15, -1.85], [1.85, 4.15]], e: [[-4.15, -1.85], [1.85, 4.15]] }
    : { n: [], s: [[-1.2, 1.2]], w: [], e: [] };
  stripAround(g, room.color, hx - 0.14, hz - 0.14, gaps);
  const parts = { color: room.color, ceil, updates };
  DRESS[id](g, parts);
  // light shared by every room: dust in the air and two wall sconces by the door
  if (!cuna) {
    [-1.7, 1.7].forEach((x) => { const sc = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), lit(room.color, 1.3)); sc.position.set(x, 2.1, 3.86); g.add(sc); const h = halo(room.color, 1.1, 0.45); h.position.copy(sc.position); g.add(h); });
  }
  updates.push(dust(g, room.color, cuna ? 70 : 38, [hx - 0.3, hz - 0.3]));
  const dark = ceil.userData.dark;
  const c = ceiling(hx * 2, hz * 2, room.color, { dark });
  ceil.add(c);
  g.add(ceil);
  ceil.visible = false;
  return { ceil, update: (t, dt) => updates.forEach((f) => f(t, dt)) };
}
