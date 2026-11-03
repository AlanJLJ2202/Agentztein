/* The hero: Agentztein, big, between two Tesla coils. It starts asleep; the coils fire, the room flashes,
   and it comes alive. It follows the pointer, and a click gives it another jolt. The page drives the
   lights (dim/flash overlays), the headline and the speech bubble through the callbacks. */
import * as THREE from "three";
import { sound } from "./sound.js";
import { LINES as CATALOG } from "../../../api/_data/audio-catalog.js";
import { SKILLS, makeAgent, pose, setArms, makeCoil, makeBolt, makeChip, setupRenderer, addLights, makeFloor, paintScreen, tr } from "./agent.js";

const COIL_X = 2.35;
const CENTER = new THREE.Vector3(0, 1.75, 0);
const CROWN = [[-2.15, 2.5], [-1.2, 3.3], [0, 3.6], [1.2, 3.3], [2.15, 2.5]];
// the agent's catchphrases, in order; the same ids are voiced by ElevenLabs (api/_data/audio-catalog.js)
const LINES = ["alive", "volt", "ready", "thanks", "another"];
const say = (onSay, id) => { onSay(tr(CATALOG[id])); sound.say(id); };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ reduced?: boolean, onPhase?: (p: string) => void, onSay?: (text: string) => void,
 *           onFrame?: (head: { x: number, y: number }) => void, onSkill?: (id: string) => void }} o
 */
export function createHero(canvas, { reduced = false, onPhase = () => {}, onSay = () => {}, onFrame = () => {}, onSkill = () => {} } = {}) {
  const renderer = setupRenderer(canvas);
  const scene = new THREE.Scene();
  addLights(scene, renderer, { extent: 6 });
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const world = new THREE.Group();
  scene.add(world);

  world.add(makeFloor(4.6));
  const agent = makeAgent();
  world.add(agent);
  const coils = [makeCoil(-COIL_X), makeCoil(COIL_X)];
  coils.forEach((c) => { c.position.y = -0.3; c.position.z = -0.4; world.add(c); });
  const bolts = [makeBolt(), makeBolt(), makeBolt(), makeBolt()];
  bolts.forEach((b) => { b.visible = false; world.add(b); });
  const chips = SKILLS.map((s, i) => {
    const ch = makeChip(s);
    ch.userData.skill = s; ch.userData.i = i;
    ch.position.set(CROWN[i][0], CROWN[i][1], -0.25);
    ch.userData.hit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    ch.add(ch.userData.hit);
    ch.scale.setScalar(reduced ? 1 : 0.001);
    world.add(ch);
    return ch;
  });

  const u = agent.userData;
  u.power = reduced ? 1 : 0;
  const lookGoal = new THREE.Vector2();
  let scroll = 0, shift = 0;

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let dist = 2.35 / vt;
    if (w > 900) {
      // Wide screens: the copy sits on the left. Centre the lab in the free space to its right and step
      // back until the coils and every skill chip (about 6.4 units across) fit inside that space.
      const copy = canvas.closest(".hero")?.querySelector(".hero-copy");
      const copyRight = copy ? copy.getBoundingClientRect().right - canvas.getBoundingClientRect().left : w * 0.45;
      const free = Math.max(w - copyRight - 24, w * 0.42);
      dist = Math.max(dist, (6.4 * h) / (2 * vt * free));
      shift = copyRight + free / 2 - w / 2;
    } else {
      shift = 0;
      dist = Math.max(dist, 2.3 / (vt * camera.aspect));
    }
    camera.setViewOffset(w, h, -shift, 0, w, h);
    camera.position.set(0, CENTER.y + dist * 0.16, dist);
    camera.lookAt(CENTER);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---- the jolt -------------------------------------------------------------------------------------
  let zap = 0, zapTotal = 0, boltTick = 0, happyUntil = 0, armsUp = 0, t = 0, intro = !reduced, lineIx = 0;
  const jolt = (seconds, big) => {
    zap = zapTotal = seconds;
    sound.sfx("zap");
    if (big) onPhase("zap");
  };
  const boltEnds = (coil, side) => {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    coil.userData.top.getWorldPosition(a);
    u.bolts[side].userData.tip.getWorldPosition(b);
    return [a, b];
  };

  // ---- input ----------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([u.hit, ...chips.map((c) => c.userData.hit)], false)[0];
    if (!hit) return null;
    return hit.object === u.hit ? "agent" : chips.find((c) => c.userData.hit === hit.object).userData.skill.id;
  };
  window.addEventListener("pointermove", (ev) => {
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2 + shift;
    lookGoal.set(THREE.MathUtils.clamp((ev.clientX - cx) / (r.width * 0.45), -1, 1), THREE.MathUtils.clamp(-((ev.clientY - r.top) / r.height) * 2 + 0.9, -1, 1));
    if (ev.target === canvas && ev.pointerType === "mouse") canvas.style.cursor = pick(ev) ? "pointer" : "default";
  }, { passive: true });
  canvas.addEventListener("click", (ev) => {
    const id = pick(ev);
    if (id === "agent") poke();
    else if (id) onSkill(id);
  });
  function poke() {
    if (intro) return;
    if (!reduced) jolt(0.7, false);
    happyUntil = t + 2.2; armsUp = t + 1.6;
    lineIx = (lineIx + 1) % LINES.length;
    say(onSay, LINES[lineIx]);
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  let last = performance.now(), screenTick = 0;
  const tmp = new THREE.Vector3(), one = new THREE.Vector3();
  if (intro) {
    // asleep, then the coils fire, then the flash
    setTimeout(() => jolt(1.6, true), 700);
  } else {
    onPhase("awake");
  }

  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || document.hidden) return;
    t += dt;
    const tt = reduced ? 2 : t;

    if (zap > 0) {
      zap -= dt;
      if ((boltTick += dt) > 0.05) {
        boltTick = 0;
        bolts.forEach((b, i) => {
          const side = i % 2;
          const [a, c] = boltEnds(coils[side], side);
          b.update(a, c, 0.32 + Math.random() * 0.2);
          b.visible = Math.random() > 0.25;
        });
        if (intro) onPhase("flicker");
      }
      const k = 1 - zap / zapTotal;
      if (k > 0.55) u.power = Math.min(1, u.power + dt * 2.2);
      if (zap <= 0) {
        bolts.forEach((b) => { b.visible = false; });
        u.power = 1;
        if (intro) {
          intro = false;
          happyUntil = t + 2.8; armsUp = t + 2.2;
          onPhase("alive");
          sound.sfx("awake");
          say(onSay, LINES[0]);
        }
      }
    }

    const mood = u.power < 0.5 ? "sleep" : t < happyUntil ? "happy" : "idle";
    u.look.lerp(mood === "sleep" ? tmp.set(0, -0.3, 0) : lookGoal, Math.min(1, dt * 4));
    pose(agent, mood, tt, dt);
    const up = t < armsUp;
    const wave = Math.sin(tt * 10) * 0.18;
    setArms(agent, up ? -2.5 - wave : -0.14 - Math.sin(tt * 1.3) * 0.03, up ? 2.5 + wave : 0.14 + Math.sin(tt * 1.3) * 0.03);

    if ((screenTick += dt) > 0.05) { screenTick = 0; paintScreen(u.screenTex, u.power > 0.3 ? "pulse" : "off", tt); }

    chips.forEach((c) => {
      const d = c.userData;
      const target = u.power > 0.9 ? 1 : 0.001;
      c.scale.lerp(one.set(target, target, target), Math.min(1, dt * 3.5));
      c.position.y = CROWN[d.i][1] + Math.sin(tt * 1.3 + d.i) * 0.07;
      c.lookAt(camera.position.x, c.position.y, camera.position.z);
      c.rotateY(Math.sin(tt * 0.8 + d.i) * 0.2);
    });

    // scrolling the hero away turns the stage a little
    world.rotation.y += ((scroll * 0.7) - world.rotation.y) * Math.min(1, dt * 6);

    renderer.render(scene, camera);
    agent.userData.brain.getWorldPosition(tmp);
    tmp.y += 0.1;
    tmp.project(camera);
    onFrame({ x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight });
  };
  tick();

  return {
    poke,
    setScroll: (p) => { scroll = p; },
    relabel: () => chips.forEach((c) => c.userData.relabel && c.userData.relabel()),
  };
}
