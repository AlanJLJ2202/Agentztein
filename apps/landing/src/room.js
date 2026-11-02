/* The walkable lab: a room with one station per frontier benchmark and "the cradle", where the coils bring
   Agentztein to life. Click the floor (or use the arrows / WASD) to move it; click a station to send it
   there. When it arrives it switches the station on, and the page shows what that benchmark measures. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { C, makeAgent, pose, setArms, makeCoil, makeBolt, makeBench, setupRenderer, addLights, paintScreen, makeMetaLogo } from "./agent.js";

export const STATIONS = [
  { id: "cuna", name: "La cuna", color: C.meta, pos: [0, -3.5], screen: "pulse", say: "¡Estoy vivo!" },
  { id: "swe", name: "SWE-bench Pro", color: 0x5b9bff, pos: [-5.0, -2.4], screen: "ok", say: "Errores reales, arreglos reales." },
  { id: "terminal", name: "Terminal-Bench", color: 0x2ec4b6, pos: [-5.3, 1.7], screen: "test", say: "Solo yo y la terminal." },
  { id: "arc", name: "ARC-AGI-3", color: 0xff8f70, pos: [-2.6, -4.0], screen: "alert", say: "Reglas nuevas… déjame pensar." },
  { id: "web", name: "BrowseComp", color: 0x3ccf6e, pos: [2.6, -4.0], screen: "pulse", say: "Lo encuentro, esté donde esté." },
  { id: "research", name: "MLE-bench · PaperBench", color: 0xffb53d, pos: [5.0, -2.4], screen: "test", say: "Investigar IA… con IA." },
  { id: "horizon", name: "Horizonte de METR", color: 0x8a7dff, pos: [5.3, 1.7], screen: "sync", say: "¿Cuántas horas aguanto solo?" },
];
const BENCH = { swe: "swe", terminal: "terminal", arc: "arc", web: "web", research: "research", horizon: "horizon" };
const BOUNDS = { x: 6.7, zMin: -4.7, zMax: 4.9 };
const HOVER_Y = 0.38;

const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25, ...o });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const FONT = "Figtree, 'Helvetica Neue', Arial, sans-serif";

function tex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function pill(g, x, y, w, h) {
  const r = h / 2;
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function makeSign(text, color) {
  const map = tex(1024, 160, (g, w, h) => {
    let size = 70;
    g.font = `700 ${size}px ${FONT}`;
    while (g.measureText(text).width > w - 190 && size > 40) { size -= 4; g.font = `700 ${size}px ${FONT}`; }
    const tw = Math.min(w - 20, g.measureText(text).width + 150);
    const x = (w - tw) / 2;
    g.fillStyle = "rgba(255,255,255,0.96)"; pill(g, x, 10, tw, h - 20); g.fill();
    g.fillStyle = hex(color); g.beginPath(); g.arc(x + 62, h / 2, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1c2b33"; g.textBaseline = "middle"; g.fillText(text, x + 100, h / 2 + 4);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.56, 0.4), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
  m.renderOrder = 8;
  return m;
}

/** Builds the room into a scene. Shared by the live lab and the still picture. */
export function buildRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);

  // floor with soft tiles
  const tiles = tex(512, 512, (g, w) => {
    g.fillStyle = "#f7f9fb"; g.fillRect(0, 0, w, w);
    g.strokeStyle = "#e3e9ef"; g.lineWidth = 6; g.strokeRect(0, 0, w, w);
  });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(10, 7.5);
  const floor = new THREE.Mesh(new RoundedBoxGeometry(15.2, 0.3, 11.4, 3, 0.1), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.55 }));
  floor.position.y = -0.15;
  floor.receiveShadow = true;
  room.add(floor);
  const floorHit = new THREE.Mesh(new THREE.PlaneGeometry(15, 11), new THREE.MeshBasicMaterial({ visible: false }));
  floorHit.rotation.x = -Math.PI / 2; floorHit.position.y = 0.01;
  room.add(floorHit);

  // walls: back, and the back halves of the sides
  const wallMat = glossy(0xffffff, { roughness: 0.7, clearcoat: 0.1 });
  const trimMat = std(C.meta, { emissive: C.meta, emissiveIntensity: 0.25 });
  const back = new THREE.Mesh(new RoundedBoxGeometry(15.2, 3.6, 0.3, 2, 0.08), wallMat);
  back.position.set(0, 1.8, -5.55); back.receiveShadow = true;
  const backTrim = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.1, 0.32), trimMat);
  backTrim.position.set(0, 0.12, -5.55);
  room.add(back, backTrim);
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new RoundedBoxGeometry(0.3, 3.6, 6.2, 2, 0.08), wallMat);
    side.position.set(s * 7.45, 1.8, -2.6); side.receiveShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 6.2), trimMat);
    trim.position.set(s * 7.45, 0.12, -2.6);
    room.add(side, trim);
  });

  // Meta logo on the back wall, over the cradle
  const logo = makeMetaLogo(2.4);
  logo.scale.setScalar(1.1); logo.position.set(0, 3.12, -5.3);
  room.add(logo);

  // whiteboard with the benchmarks, and the brain's screen
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.9), new THREE.MeshStandardMaterial({
    roughness: 0.4,
    map: tex(1020, 570, (g, w, h) => {
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#dfe6ed"; g.lineWidth = 16; g.strokeRect(0, 0, w, h);
      g.fillStyle = "#1c2b33"; g.font = `800 58px ${FONT}`; g.fillText("Benchmarks de frontera", 50, 100);
      g.font = `600 40px ${FONT}`;
      ["SWE-bench Pro", "Terminal-Bench", "ARC-AGI-3", "BrowseComp", "MLE-bench · PaperBench", "Horizonte de METR"].forEach((t, i) => {
        const x = 50 + (i % 2) * 470, y = 190 + Math.floor(i / 2) * 110;
        g.fillStyle = hex(STATIONS[i + 1].color); g.beginPath(); g.arc(x + 14, y - 13, 13, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#1c2b33"; g.fillText(t, x + 44, y);
      });
    }),
  }));
  board.position.set(-4.3, 2.0, -5.38);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.7), new THREE.MeshBasicMaterial({
    toneMapped: false,
    map: tex(900, 510, (g, w, h) => {
      g.fillStyle = "#0f1d26"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#4aa8ff"; g.font = `800 64px ${FONT}`; g.fillText("Muse Spark", 50, 120);
      g.fillStyle = "#c9d3da"; g.font = `500 36px ${FONT}`; g.fillText("El cerebro de Agentztein · de Meta", 50, 180);
      g.strokeStyle = "#4aa8ff"; g.lineWidth = 8; g.lineJoin = "round"; g.beginPath();
      for (let x = 50; x <= w - 50; x += 6) {
        const k = (x % 180) / 180;
        const y = 360 + (k > 0.42 && k < 0.5 ? -80 : k > 0.5 && k < 0.58 ? 60 : Math.sin(x * 0.04) * 6);
        if (x === 50) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }),
  }));
  screen.position.set(4.3, 2.0, -5.38);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(3.2, 1.9, 0.12, 3, 0.06), glossy(0x1c2b33));
  bezel.position.set(4.3, 2.0, -5.46);
  room.add(board, bezel, screen);

  // stations
  const stations = STATIONS.map((s) => {
    const g = new THREE.Group();
    g.position.set(s.pos[0], 0, s.pos[1]);
    const toCenter = new THREE.Vector3(-s.pos[0] * 0.6, 0, 6 - s.pos[1]).normalize();
    g.rotation.y = Math.atan2(toCenter.x, toCenter.z);
    room.add(g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 12, 80), new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.15 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
    g.add(ring);
    let prop, coils = null;
    if (s.id === "cuna") {
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.14, 64), glossy(0xffffff));
      plat.position.y = 0.07; plat.receiveShadow = true; plat.castShadow = true;
      g.add(plat);
      coils = [-1, 1].map((k) => { const c = makeCoil(k * 1.7); c.position.z = -0.3; g.add(c); return c; });
      prop = plat;
    } else {
      const table = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.86, 1.2, 3, 0.08), glossy(0xffffff));
      table.position.y = 0.43; table.castShadow = true; table.receiveShadow = true;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.07, 1.22), std(s.color, { emissive: s.color, emissiveIntensity: 0.2 }));
      strip.position.y = 0.8;
      g.add(table, strip);
      prop = makeBench(BENCH[s.id]);
      prop.scale.setScalar(0.64); prop.position.y = 0.87;
      g.add(prop);
    }
    const sign = makeSign(s.name, s.color);
    sign.position.set(0, s.id === "cuna" ? 2.55 : 2.0, 0);
    g.add(sign);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(s.id === "cuna" ? 2.4 : 2.0, 2.4, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.2;
    g.add(hit);
    const stand = new THREE.Vector3(s.pos[0], 0, s.pos[1]).addScaledVector(toCenter, s.id === "cuna" ? 0 : 1.55);
    return { ...s, group: g, ring, prop, sign, hit, coils, stand, center: new THREE.Vector3(s.pos[0], 0, s.pos[1]), baseY: prop.position.y };
  });

  return { room, floorHit, stations };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ reduced?: boolean, onArrive?: (id: string) => void, onSay?: (text: string) => void,
 *           onFrame?: (head: { x: number, y: number }) => void, onFlash?: () => void }} o
 */
export function createRoom(canvas, { reduced = false, onArrive = () => {}, onSay = () => {}, onFrame = () => {}, onFlash = () => {} } = {}) {
  const renderer = setupRenderer(canvas);
  const scene = new THREE.Scene();
  addLights(scene, renderer, { extent: 9 });
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const { floorHit, stations } = buildRoom(scene);

  const agent = makeAgent({ hover: true });
  agent.scale.setScalar(0.85);
  agent.rotation.order = "YXZ";
  agent.position.set(0, HOVER_Y, 0.9);
  scene.add(agent);
  const u = agent.userData;
  u.power = 1;
  const bolts = [makeBolt(), makeBolt()];
  bolts.forEach((b) => { b.visible = false; scene.add(b); });

  const follow = new THREE.Vector3(0, 0.8, 0.2);
  camera.position.set(0, 8.6, 12.8);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(follow);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.5, minPolarAngle: 0.55, maxPolarAngle: 1.2, minAzimuthAngle: -0.75, maxAzimuthAngle: 0.75 });
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) { controls.enabled = false; canvas.style.touchAction = "pan-y"; }
  controls.update();

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 56 : 38;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---- moving -------------------------------------------------------------------------------------
  const target = agent.position.clone();
  let pending = null, active = null, t = 0, zap = 0, armsUp = 0, thinkUntil = 0, happyUntil = 0;
  const keys = new Set();
  const clampToRoom = (v) => {
    v.x = THREE.MathUtils.clamp(v.x, -BOUNDS.x, BOUNDS.x);
    v.z = THREE.MathUtils.clamp(v.z, BOUNDS.zMin, BOUNDS.zMax);
    stations.forEach((s) => {
      if (s.id === "cuna") return;
      const d = new THREE.Vector2(v.x - s.center.x, v.z - s.center.z);
      if (d.length() < 1.3) { d.setLength(1.3); v.x = s.center.x + d.x; v.z = s.center.z + d.y; }
    });
    return v;
  };
  function goTo(id) {
    const s = stations.find((x) => x.id === id);
    if (!s) return;
    pending = s;
    target.set(s.stand.x, HOVER_Y, s.stand.z);
    if (active && active !== s) deactivate();
  }
  function moveTo(point) {
    pending = null;
    if (active) deactivate();
    target.copy(clampToRoom(point.clone())).setY(HOVER_Y);
  }
  function deactivate() { active = null; }
  function arrive(s) {
    active = s; pending = null;
    onArrive(s.id);
    paintScreen(u.screenTex, s.screen, t);
    if (s.id === "cuna") {
      zap = reduced ? 0.01 : 1.4;
      u.power = reduced ? 1 : 0.2;
    } else {
      thinkUntil = t + 0.9; happyUntil = t + 2.4;
      onSay(s.say);
    }
  }

  // ---- input --------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener("pointerdown", (ev) => { down = [ev.clientX, ev.clientY]; });
  canvas.addEventListener("pointerup", (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const sHit = ray.intersectObjects(stations.map((s) => s.hit), false)[0];
    if (sHit) { goTo(stations.find((s) => s.hit === sHit.object).id); return; }
    const fHit = ray.intersectObject(floorHit, false)[0];
    if (fHit) moveTo(fHit.point);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (ev.pointerType !== "mouse") return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    canvas.style.cursor = ray.intersectObjects(stations.map((s) => s.hit), false).length ? "pointer" : "crosshair";
  });
  const KEYMAP = { ArrowUp: "f", KeyW: "f", ArrowDown: "b", KeyS: "b", ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r" };
  canvas.addEventListener("keydown", (ev) => {
    const k = KEYMAP[ev.code];
    if (!k) return;
    keys.add(k); ev.preventDefault();
  });
  canvas.addEventListener("keyup", (ev) => { const k = KEYMAP[ev.code]; if (k) keys.delete(k); });
  canvas.addEventListener("blur", () => keys.clear());

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  let last = performance.now(), screenTick = 0, boltTick = 0;
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || document.hidden) return;
    t += dt;
    const tt = reduced ? 2 : t;

    // keyboard: move relative to the camera
    if (keys.size) {
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      right.crossVectors(fwd, up).normalize();
      tmp.set(0, 0, 0);
      if (keys.has("f")) tmp.add(fwd);
      if (keys.has("b")) tmp.sub(fwd);
      if (keys.has("r")) tmp.add(right);
      if (keys.has("l")) tmp.sub(right);
      if (tmp.lengthSq() > 0) { moveTo(agent.position.clone().addScaledVector(tmp.normalize(), 0.8)); }
    }

    // glide towards the target
    const dx = target.x - agent.position.x, dz = target.z - agent.position.z;
    const dist = Math.hypot(dx, dz);
    const moving = dist > 0.04;
    if (moving) {
      const speed = Math.min(3.2, dist * 3 + 0.4);
      const step = Math.min(dist, speed * dt);
      agent.position.x += (dx / dist) * step;
      agent.position.z += (dz / dist) * step;
      clampToRoom(agent.position);
      const yaw = Math.atan2(dx, dz);
      let d = yaw - agent.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      agent.rotation.y += d * Math.min(1, dt * 8);
    } else if (pending) {
      arrive(pending);
    } else if (active && active.id !== "cuna") {
      const yaw = Math.atan2(active.center.x - agent.position.x, active.center.z - agent.position.z);
      let d = yaw - agent.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      agent.rotation.y += d * Math.min(1, dt * 6);
    } else if (active && active.id === "cuna") {
      let d = 0 - agent.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      agent.rotation.y += d * Math.min(1, dt * 6);
    }
    const lean = moving ? Math.min(0.18, dist * 0.2) : 0;
    agent.rotation.x += (lean - agent.rotation.x) * Math.min(1, dt * 6);
    agent.position.y = HOVER_Y + Math.sin(tt * 2.2) * 0.05;
    if (u.thruster) { u.thruster.material.opacity = 0.2 + (moving ? 0.25 : 0.08) + Math.sin(tt * 20) * 0.04; u.thruster.scale.y = moving ? 1.3 : 1; }

    // the cradle: the coils fire and it comes alive again
    if (zap > 0) {
      zap -= dt;
      const cuna = stations[0];
      if ((boltTick += dt) > 0.05) {
        boltTick = 0;
        bolts.forEach((b, i) => {
          const a = new THREE.Vector3(), c = new THREE.Vector3();
          cuna.coils[i].userData.top.getWorldPosition(a);
          u.bolts[i].userData.tip.getWorldPosition(c);
          b.update(a, c, 0.3 + Math.random() * 0.2);
          b.visible = Math.random() > 0.2;
        });
      }
      u.power = Math.min(1, u.power + dt * 0.7);
      if (zap <= 0) {
        bolts.forEach((b) => { b.visible = false; });
        u.power = 1; armsUp = t + 2; happyUntil = t + 2.6;
        onFlash();
        onSay(stations[0].say);
      }
    }

    const mood = u.power < 0.5 ? "sleep" : t < thinkUntil ? "think" : t < happyUntil ? "happy" : "idle";
    // look at the station it is working on, otherwise ahead
    if (active && active.id !== "cuna") u.look.set(0, -0.25);
    else u.look.set(0, 0);
    pose(agent, mood, tt, dt);
    const swing = moving ? Math.sin(tt * 9) * 0.35 : 0;
    const raised = t < armsUp;
    setArms(agent, raised ? -2.5 : -0.16 - Math.abs(swing) * 0.2, raised ? 2.5 : 0.16 + Math.abs(swing) * 0.2, swing, -swing);

    if ((screenTick += dt) > 0.06) { screenTick = 0; paintScreen(u.screenTex, active ? active.screen : "pulse", tt); }

    stations.forEach((s) => {
      const on = s === active;
      s.ring.material.emissiveIntensity += ((on ? 1.1 : s === pending ? 0.6 : 0.15) - s.ring.material.emissiveIntensity) * Math.min(1, dt * 6);
      if (s.id !== "cuna") {
        s.prop.position.y = s.baseY + (on ? 0.12 + Math.sin(tt * 2) * 0.04 : 0);
        s.prop.rotation.y += ((on ? Math.sin(tt * 0.9) * 0.4 : 0) - s.prop.rotation.y) * Math.min(1, dt * 4);
      }
      s.sign.quaternion.copy(camera.quaternion);
      s.group.updateMatrixWorld();
      s.sign.quaternion.premultiply(s.group.getWorldQuaternion(new THREE.Quaternion()).invert());
    });

    // the camera follows it, keeping whatever angle the visitor chose
    tmp.set(agent.position.x * 0.55, 0.8, agent.position.z * 0.45 + 0.2);
    const delta = tmp.sub(follow).multiplyScalar(Math.min(1, dt * 2.5));
    follow.add(delta); controls.target.add(delta); camera.position.add(delta);
    // dolly in while it works at a station, back out when it walks
    const off = camera.position.clone().sub(controls.target);
    const want = active && !moving ? 9.5 : 15.6;
    off.setLength(off.length() + (want - off.length()) * Math.min(1, dt * 1.6));
    camera.position.copy(controls.target).add(off);
    controls.update();
    renderer.render(scene, camera);

    u.head.getWorldPosition(tmp);
    tmp.y += 1.0;
    tmp.project(camera);
    onFrame({ x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight });
  };
  tick();

  return { goTo };
}

/** A still picture of the room (fallback without WebGL). */
export function renderRoomStill(renderer, scene, camera) {
  const { stations } = buildRoom(scene);
  const agent = makeAgent({ hover: true });
  agent.scale.setScalar(0.7);
  agent.position.set(0, HOVER_Y, 0.6);
  agent.userData.power = 1;
  for (let i = 0; i < 30; i++) pose(agent, "happy", 2, 0.05);
  setArms(agent, -0.16, 2.4);
  paintScreen(agent.userData.screenTex, "pulse", 0.5);
  scene.add(agent);
  camera.fov = 38;
  camera.position.set(0, 8.6, 12.8);
  camera.lookAt(0, 0.8, -0.4);
  camera.updateMatrixWorld();
  stations.forEach((st) => {
    st.sign.quaternion.copy(camera.quaternion);
    st.group.updateMatrixWorld();
    st.sign.quaternion.premultiply(st.group.getWorldQuaternion(new THREE.Quaternion()).invert());
  });
}
