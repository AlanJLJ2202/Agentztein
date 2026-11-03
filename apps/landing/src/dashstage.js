/* Agentztein on its pedestal for the signed-in dashboard: the same creature as the landing, with the user's real skills
   orbiting it as hexagonal chips (one per skill, in its scenario's color; candidates pulse). Its face and chest screen
   follow what the lab is doing (asleep without a brain, thinking while a cycle runs, alert when a skill waits for a
   decision, happy after an approval). It looks at the pointer and a tap makes it jump.
   The app imports this through the @landing alias, so three.js and the creature are shared with the landing. */
import * as THREE from "three";
import { makeAgent, pose, setArms, makeChip, setupRenderer, addLights, makeFloor, paintScreen } from "./agent.js";

const CENTER = new THREE.Vector3(0, 1.62, 0);
const ARMS = {
  sleep: [-0.05, 0.05, 0, 0],
  idle: [-0.12, 0.12, 0, 0],
  think: [-0.12, 0.45, 0, -1.25],
  alert: [-0.42, 0.42, -0.25, -0.25],
  happy: [-2.5, 2.5, 0, 0],
};

/**
 * @param {HTMLElement} host an empty element; the canvas is created inside it and removed on dispose
 * @param {{ reduced?: boolean }} [o]
 */
export function createDashStage(host, { reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  let renderer;
  try {
    renderer = setupRenderer(canvas);
  } catch {
    canvas.remove();
    return null; // no WebGL: the page keeps its picture
  }
  const scene = new THREE.Scene();
  addLights(scene, renderer, { extent: 4, mapSize: 1024 });
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const world = new THREE.Group();
  scene.add(world);
  world.add(makeFloor(2.5));
  const agent = makeAgent();
  world.add(agent);
  const u = agent.userData;
  u.power = 1;

  /** @type {THREE.Group[]} */
  let chips = [];
  let mood = "idle", screen = "pulse", joltUntil = 0, t = 0, last = performance.now(), frame = 0, raf = 0;
  let visible = true, dirty = 4;
  const arms = [...ARMS.idle];
  const look = new THREE.Vector2();

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    // fit the creature (pedestal to dome, about 4 units tall, plus the floor in perspective) and the chips' orbit
    // (about 5 units across). On wide stages it stands a little to the right, leaving the speech bubble room.
    const shift = w > 520 ? w * 0.1 : 0;
    const dist = Math.max(2.55 / vt, 2.9 / (vt * camera.aspect) + (shift / w) * 6);
    // on narrow stages the bubble sits above its head, so the creature stands a little lower
    camera.setViewOffset(w, h, -shift, w <= 520 ? -h * 0.09 : 0, w, h);
    camera.position.set(0, CENTER.y + dist * 0.12, dist);
    camera.lookAt(CENTER);
    camera.updateProjectionMatrix();
    dirty = 2;
    kick();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const io = new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); kick(); });
  io.observe(host);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  const onMove = (/** @type {PointerEvent} */ e) => {
    const r = host.getBoundingClientRect();
    look.set(
      THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.4, 1.4),
      THREE.MathUtils.clamp(-(((e.clientY - r.top) / r.height) * 2 - 1) + 0.3, -1, 1),
    );
    kick();
  };
  addEventListener("pointermove", onMove, { passive: true });

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) t += dt;
    const jolting = now < joltUntil;
    const m = jolting ? "happy" : mood;
    u.power += ((mood === "sleep" && !jolting ? 0.18 : 1) - u.power) * Math.min(1, dt * 3);
    u.look.lerp(mood === "sleep" && !jolting ? new THREE.Vector2(0, -0.4) : look, Math.min(1, dt * 4));
    pose(agent, m, t, reduced ? 1 : dt);
    const goal = ARMS[m] ?? ARMS.idle;
    for (let i = 0; i < 4; i++) arms[i] += ((goal[i] ?? 0) - (arms[i] ?? 0)) * Math.min(1, (reduced ? 1 : dt * 7));
    setArms(agent, arms[0], arms[1], arms[2], arms[3]);
    agent.position.y = jolting ? Math.abs(Math.sin((joltUntil - now) / 1400 * Math.PI * 2)) * 0.32 : 0;
    agent.rotation.y = reduced ? 0 : Math.sin(t * 0.35) * 0.08;

    const n = chips.length;
    chips.forEach((c, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + t * 0.22;
      const r = 2.05 + (n > 8 ? (i % 2) * 0.3 : 0);
      c.position.set(Math.cos(a) * r, 1.95 + Math.sin(t * 1.3 + i) * 0.09 + (n > 8 ? (i % 2) * 0.35 : 0), Math.sin(a) * r * 0.55 - 0.15);
      c.lookAt(camera.position);
      const body = c.userData.body;
      if (c.userData.candidate && body) body.material.emissiveIntensity = 0.15 + (Math.sin(t * 4) * 0.5 + 0.5) * 0.6;
    });

    if (frame++ % 3 === 0 || dirty > 0) paintScreen(u.screenTex, jolting ? "ok" : screen, t);
    renderer.render(scene, camera);
    if (dirty > 0) dirty--;
    kick();
  }

  function kick() {
    if (raf) return;
    const animate = !reduced || dirty > 0 || performance.now() < joltUntil;
    if (!visible || document.hidden || !animate) return;
    raf = requestAnimationFrame(tick);
  }

  resize();

  return {
    /** @param {string} m @param {string} s */
    set(m, s) {
      mood = m in ARMS ? m : "idle";
      screen = s;
      dirty = reduced ? 30 : 2;
      kick();
    },
    /** @param {{ color: number, candidate?: boolean }[]} list */
    setChips(list) {
      chips.forEach((c) => { world.remove(c); c.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } }); });
      chips = list.slice(0, 16).map((s) => {
        const c = makeChip({ name: "", color: s.color }, { label: false });
        c.scale.setScalar(0.85);
        c.userData.candidate = Boolean(s.candidate);
        world.add(c);
        return c;
      });
      dirty = 2;
      kick();
    },
    jolt() {
      joltUntil = performance.now() + 1400;
      kick();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pointermove", onMove);
      scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach((mt) => { mt.map?.dispose(); mt.dispose(); }); } });
      scene.environment?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
