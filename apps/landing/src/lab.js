/* El laboratorio 3D de Agentztein.
   Una mesa con cinco frascos (uno por negocio) conectados por tubos a un frasco grande: el cerebro (Muse
   Spark, de Meta), con el logo de Meta flotando encima. Cada frasco guarda lo que el agente aprendió
   para ese negocio y lleva su etiqueta. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const META_PATH =
  "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z";

const META_BLUE = 0x0081fb;

/* The five jars, in table order (left to right). */
export const JARS = [
  { id: "banco", name: "Banco", color: 0x5b9bff, thing: "coins", pos: [-3.1, 0.55] },
  { id: "fabrica", name: "Fábrica", color: 0x2ec4b6, thing: "gear", pos: [-1.6, 1.45] },
  { id: "tienda", name: "Tienda", color: 0xff8f70, thing: "bag", pos: [0, 1.85] },
  { id: "mensajes", name: "WhatsApp", color: 0x3ccf6e, thing: "chat", pos: [1.6, 1.45] },
  { id: "paqueteria", name: "Paquetería", color: 0xffb53d, thing: "box", pos: [3.1, 0.55] },
];
const BRAIN_POS = [0, -1.1];
const JAR_R = 0.5, JAR_H = 1.25, BRAIN_R = 0.85, BRAIN_H = 1.9;

/* ---------- materials ---------- */
const glassMat = () => new THREE.MeshPhysicalMaterial({
  color: 0xf2f8ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1,
  clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.7, depthWrite: false, side: THREE.DoubleSide,
});
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...o });

/* ---------- pieces ---------- */
function jarProfile(r, h) {
  const p = [[0, 0], [r * 0.9, 0], [r, h * 0.06], [r, h * 0.84], [r * 0.84, h * 0.92], [r * 0.8, h * 0.95], [r * 0.8, h]];
  return p.map(([x, y]) => new THREE.Vector2(x, y));
}

function tagTexture(text, accent) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 224;
  const g = c.getContext("2d");
  const r = 36;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(r + 40, 8); g.lineTo(504 - r, 8); g.quadraticCurveTo(504, 8, 504, 8 + r);
  g.lineTo(504, 216 - r); g.quadraticCurveTo(504, 216, 504 - r, 216); g.lineTo(r + 40, 216);
  g.lineTo(8, 160); g.lineTo(8, 64); g.closePath(); g.fill();
  g.globalCompositeOperation = "destination-out";
  g.beginPath(); g.arc(58, 112, 18, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#" + accent.toString(16).padStart(6, "0");
  g.fillRect(104, 150, 64, 10);
  g.fillStyle = "#1c2b33";
  g.font = "700 76px Figtree, 'Helvetica Neue', Arial, sans-serif";
  g.textBaseline = "middle";
  let size = 76;
  while (g.measureText(text).width > 370 && size > 40) { size -= 4; g.font = `700 ${size}px Figtree, 'Helvetica Neue', Arial, sans-serif`; }
  g.fillText(text, 104, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeThing(kind) {
  const g = new THREE.Group();
  if (kind === "coins") {
    const m = std(0xf4c54d, { metalness: 0.55, roughness: 0.28 });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.055, 40), m);
      c.position.set(Math.sin(i * 1.7) * 0.025, i * 0.06, Math.cos(i * 1.3) * 0.025);
      g.add(c);
    }
    g.position.y = -0.09;
  } else if (kind === "gear") {
    const m = std(0x8d9bab, { metalness: 0.6, roughness: 0.3 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 40), m);
    g.add(hub);
    for (let i = 0; i < 10; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.07), m);
      const a = (i / 10) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19);
      tooth.rotation.y = -a;
      g.add(tooth);
    }
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 24), std(0x56606c));
    g.add(hole);
    g.rotation.x = Math.PI / 2;
  } else if (kind === "bag") {
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.3, 0.16, 3, 0.03), std(0xffd2c2));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 10, 30, Math.PI), std(0xd8664a));
    handle.position.y = 0.15;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.05, 0.165), std(0xff8f70));
    band.position.y = -0.04;
    g.add(body, handle, band);
  } else if (kind === "chat") {
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), std(0xffffff, { roughness: 0.3 }));
    bubble.scale.set(1, 0.78, 0.45);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 16), std(0xffffff, { roughness: 0.3 }));
    tail.position.set(-0.13, -0.15, 0); tail.rotation.z = -2.5;
    g.add(bubble, tail);
    const dot = std(0x1faa52);
    for (let i = -1; i <= 1; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), dot);
      d.position.set(i * 0.075, 0, 0.09);
      g.add(d);
    }
  } else if (kind === "box") {
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.26, 0.3, 2, 0.02), std(0xcd9a63, { roughness: 0.8 }));
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.265, 0.305), std(0xf1d7a8, { roughness: 0.5 }));
    g.add(body, tape);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeBrain() {
  const geo = new THREE.IcosahedronGeometry(0.46, 24);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const folds = Math.sin(n.x * 11 + Math.sin(n.y * 7)) * Math.sin(n.y * 9 + n.z * 4) * Math.sin(n.z * 10 - n.x * 3);
    const split = Math.exp(-Math.pow(n.x * 9, 2)) * 0.09;
    v.copy(n.multiplyScalar(0.46 * (1 + folds * 0.05 - split)));
    pos.setXYZ(i, v.x, v.y * 0.86, v.z * 1.06);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: 0xff8fb3, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 1, sheenColor: new THREE.Color(0xffe1ea),
  }));
  mesh.castShadow = true;
  return mesh;
}

export function makeMetaLogo(depth = 2.2) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${META_PATH}"/></svg>`);
  const shapes = data.paths.flatMap((p) => p.toShapes(true));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.22, bevelSegments: 4, curveSegments: 24 });
  geo.center();
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: META_BLUE, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 }));
  mesh.scale.set(0.055, -0.055, 0.055);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function makeJar({ r, h, color, label, thing }) {
  const jar = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.LatheGeometry(jarProfile(r, h), 64), glassMat());
  glass.renderOrder = 3;
  const isBrain = thing === "brain";
  const liquidH = h * (isBrain ? 0.62 : 0.42);
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.93, r * 0.93, liquidH, 64),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, transparent: true, opacity: isBrain ? 0.4 : 0.72, clearcoat: 0.4, depthWrite: false, emissive: color, emissiveIntensity: 0.1 }),
  );
  liquid.position.y = liquidH / 2 + 0.02;
  liquid.renderOrder = 2;
  const surface = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 64), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: isBrain ? 0.45 : 0.8, roughness: 0.1, depthWrite: false }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = liquidH + 0.021;
  surface.renderOrder = 2;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.14, 48), std(color, { roughness: 0.35 }));
  lid.position.y = h + 0.05;
  lid.castShadow = true;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 24), std(0xffffff));
  knob.position.y = h + 0.16;
  jar.add(liquid, surface, glass, lid, knob);

  const inner = isBrain ? makeBrain() : makeThing(thing);
  inner.position.y += isBrain ? liquidH * 0.55 : liquidH + (thing === "chat" ? 0.16 : 0.09);
  jar.add(inner);

  const bubbles = [];
  const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.018 + (i % 3) * 0.008, 10, 8), bm);
    b.userData = { a: i * 1.3, rr: r * (0.3 + (i % 3) * 0.2), speed: 0.12 + i * 0.03, off: i / 5 };
    b.renderOrder = 2;
    jar.add(b);
    bubbles.push(b);
  }

  let tag = null;
  if (label) {
    tag = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.27), new THREE.MeshStandardMaterial({ map: tagTexture(label, color), transparent: true, roughness: 0.7, side: THREE.DoubleSide, alphaTest: 0.05 }));
    plane.position.set(0.27, 0, 0);
    plane.castShadow = true;
    tag.add(plane);
    tag.position.set(r * 0.45, h * 0.3, r * 0.95);
    tag.rotation.order = "YXZ";
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, h * 0.42, 6), std(0xb7c2ce));
    string.position.set(r * 0.45, h * 0.62, r * 0.9);
    jar.add(string, tag);
  }

  const hit = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.1, h + 0.4, 16), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = h / 2;
  jar.add(hit);

  jar.userData = { seed: Math.random() * 6, inner, bubbles, liquid, tag, hit, liquidH, r, h, baseY: inner.position.y, lift: 0 };
  return jar;
}

function setupRenderer(canvas, { alpha = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function lights(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe8f2, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(3.5, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}

function animateJar(jar, t, sel) {
  const u = jar.userData;
  u.lift += ((sel ? 0.18 : 0) - u.lift) * 0.12;
  jar.position.y = u.lift;
  u.inner.position.y = u.baseY + Math.sin(t * 1.4 + u.seed) * 0.035;
  u.inner.rotation.y = t * (sel ? 0.9 : 0.35) + u.seed;
  u.liquid.material.emissiveIntensity = sel ? 0.35 : 0.1;
  u.bubbles.forEach((b) => {
    const d = b.userData, k = (t * d.speed + d.off) % 1;
    b.position.set(Math.cos(d.a + t * 0.6) * d.rr, 0.06 + k * (u.liquidH - 0.08), Math.sin(d.a + t * 0.6) * d.rr);
    b.scale.setScalar(0.6 + k * 0.6);
  });
  if (u.tag) u.tag.rotation.z = Math.sin(t * 1.1 + u.seed) * 0.05;
}

/* ---------- the whole lab ---------- */
function buildLab(scene) {
  const table = new THREE.Mesh(new RoundedBoxGeometry(10, 0.36, 5.6, 4, 0.16), std(0xffffff, { roughness: 0.55 }));
  table.position.set(0, -0.18, 0.3);
  table.receiveShadow = true;
  scene.add(table);
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(10.02, 0.08, 5.62, 2, 0.04), std(META_BLUE, { roughness: 0.4 }));
  stripe.position.set(0, -0.3, 0.3);
  scene.add(stripe);

  const brain = makeJar({ r: BRAIN_R, h: BRAIN_H, color: 0x7fb6ff, thing: "brain" });
  brain.position.set(BRAIN_POS[0], 0, BRAIN_POS[1]);
  brain.name = "muse";
  scene.add(brain);

  const logo = makeMetaLogo();
  logo.position.set(BRAIN_POS[0], BRAIN_H + 1.15, BRAIN_POS[1]);
  scene.add(logo);

  const jars = JARS.map((d) => {
    const j = makeJar({ r: JAR_R, h: JAR_H, color: d.color, label: d.name, thing: d.thing });
    j.position.set(d.pos[0], 0, d.pos[1]);
    j.rotation.y = -Math.atan2(d.pos[0], 6) * 0.9;
    j.name = d.id;
    scene.add(j);
    return j;
  });

  /* tubes from each jar to the brain, with bubbles travelling along them */
  const tubeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.05, clearcoat: 1, depthWrite: false });
  const tubes = jars.map((j, i) => {
    const s = new THREE.Vector3(j.position.x, JAR_H + 0.2, j.position.z);
    const c = new THREE.Vector3(BRAIN_POS[0], 0, BRAIN_POS[1]);
    const dir = (i === 2 ? new THREE.Vector3(0.75, 0, 1) : new THREE.Vector3(s.x - c.x, 0, s.z - c.z)).normalize();
    const e = c.clone().addScaledVector(dir, BRAIN_R * 0.55); e.y = BRAIN_H + 0.12;
    const near = c.clone().addScaledVector(dir, BRAIN_R * 1.25); near.y = BRAIN_H + 0.55;
    const m = s.clone().lerp(near, 0.5); m.y = Math.max(s.y, near.y) + 0.55;
    if (i === 2) m.x += 1.3;
    const curve = i === 2
      ? new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, j.position.z - JAR_R * 0.6), new THREE.Vector3(0, 0.1, BRAIN_POS[1] + BRAIN_R * 0.6)])
      : new THREE.CatmullRomCurve3([s, new THREE.Vector3(s.x, s.y + 0.35, s.z), m, near, e]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.035, 12, false), tubeMat);
    tube.renderOrder = 4;
    scene.add(tube);
    const dots = [];
    const dm = new THREE.MeshStandardMaterial({ color: JARS[i].color, emissive: JARS[i].color, emissiveIntensity: 0.5, roughness: 0.3 });
    for (let k = 0; k < 4; k++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), dm);
      d.userData.off = k / 4;
      scene.add(d);
      dots.push(d);
    }
    return { curve, dots };
  });

  return { brain, logo, jars, tubes };
}

function frame(camera, width, height) {
  camera.aspect = width / height;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const half = camera.aspect < 1.2 ? 3.75 : 5.6;
  const dist = Math.max(9.4, half / Math.tan(hfov / 2));
  const dir = new THREE.Vector3(0, 0.42, 1).normalize();
  camera.position.copy(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, 1.1, 0));
  camera.updateProjectionMatrix();
}

/**
 * Mounts the interactive lab on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ onSelect?: (id: string) => void, reduced?: boolean, interactive?: boolean }} opts
 */
export function createLab(canvas, { onSelect = () => {}, reduced = false, interactive = true } = {}) {
  const renderer = setupRenderer(canvas);
  const scene = new THREE.Scene();
  lights(scene, renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const lab = buildLab(scene);
  const target = new THREE.Vector3(0, 1.1, 0);
  camera.lookAt(target);

  let controls = null;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (interactive) {
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.minPolarAngle = 0.95; controls.maxPolarAngle = 1.38;
    controls.minAzimuthAngle = -0.75; controls.maxAzimuthAngle = 0.75;
    if (coarse) { controls.enabled = false; canvas.style.touchAction = "pan-y"; }
  }

  let selected = "muse", hovered = null;
  const all = [lab.brain, ...lab.jars];
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(all.map((j) => j.userData.hit), false)[0];
    return hit ? all.find((j) => j.userData.hit === hit.object) : null;
  };
  let down = null;
  if (interactive) {
    canvas.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse") { hovered = pick(ev); canvas.style.cursor = hovered ? "pointer" : "grab"; } });
    canvas.addEventListener("pointerdown", (ev) => { down = [ev.clientX, ev.clientY]; });
    canvas.addEventListener("pointerup", (ev) => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return;
      const j = pick(ev);
      if (j) { select(j.name); onSelect(j.name); }
    });
  }
  function select(id) { selected = id; }

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    frame(camera, w, h);
    camera.lookAt(target);
    if (controls) controls.update();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let running = true, visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  let last = performance.now();
  let t = 2;
  const tick = () => {
    if (!running) return;
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || document.hidden) return;
    if (!reduced) t += dt;
    all.forEach((j) => { animateJar(j, t, j.name === selected || j === hovered); });
    lab.logo.rotation.y = Math.sin(t * 0.6) * 0.5;
    lab.logo.position.y = BRAIN_H + 1.15 + Math.sin(t * 1.2) * 0.06;
    lab.tubes.forEach(({ curve, dots }, i) => {
      const on = JARS[i].id === selected;
      dots.forEach((d) => {
        const k = (t * (on ? 0.32 : 0.12) + d.userData.off) % 1;
        d.position.copy(curve.getPointAt(k));
        d.scale.setScalar(on ? 1.35 : 0.85);
      });
    });
    if (controls) controls.update();
    renderer.render(scene, camera);
  };
  tick();

  return { select, dispose: () => { running = false; renderer.dispose(); } };
}

/** Renders one still picture (used offline to make the page's images). */
export function renderStill(canvas, which, size = 900) {
  const renderer = setupRenderer(canvas);
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  lights(scene, renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  if (which === "lab") {
    renderer.setSize(size * 1.6, size, false);
    camera.aspect = 1.6;
    buildLab(scene);
    frame(camera, 1.6, 1);
    camera.lookAt(0, 1.1, 0);
  } else {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(which === "muse" ? 1.25 : 0.9, which === "muse" ? 1.25 : 0.9, 0.16, 96), std(0xffffff, { roughness: 0.55 }));
    disc.position.y = -0.08; disc.receiveShadow = true;
    scene.add(disc);
    let h;
    if (which === "muse") {
      const j = makeJar({ r: BRAIN_R, h: BRAIN_H, color: 0x7fb6ff, thing: "brain" });
      animateJar(j, 2, false);
      scene.add(j);
      const logo = makeMetaLogo();
      logo.position.y = BRAIN_H + 0.75; logo.rotation.y = -0.3;
      scene.add(logo);
      h = BRAIN_H + 1.2;
    } else {
      const d = JARS.find((x) => x.id === which);
      const j = makeJar({ r: JAR_R, h: JAR_H, color: d.color, label: d.name, thing: d.thing });
      j.rotation.y = -0.35;
      animateJar(j, 2.4, true);
      j.position.y = 0;
      scene.add(j);
      h = JAR_H + 0.3;
    }
    const far = which === "muse" ? h * 2.1 + 1.1 : h * 1.55 + 0.75;
    camera.position.set(0, h * 0.9, far);
    camera.lookAt(0, h * 0.4, 0);
  }
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return renderer;
}
