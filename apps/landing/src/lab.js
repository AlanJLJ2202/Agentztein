/* The live lab: Agentztein on its pedestal between two Tesla coils. It wakes up with a jolt, follows the
   pointer with its head, and the skills it has built orbit around it. Click it to zap it again, click a
   skill to see it. Also renders the still pictures used on the page. */
import * as THREE from "three";
import { renderRoomStill } from "./room.js";
import {
  SKILLS, C, makeAgent, pose, setArms, makeCoil, makeBolt, makeChip, makePaper, makeBadge, makeBench,
  setupRenderer, addLights, makeFloor, paintScreen, makeMetaLogo, windowPanel, rr, LEG_DROP,
} from "./agent.js";

const COIL_X = 2.35;
const TARGET = new THREE.Vector3(0, 1.65, 0);
/* the skills float in an arc around its head, like a crown of the pieces it has built */
const CROWN = [[-2.15, 2.5], [-1.2, 3.3], [0, 3.55], [1.2, 3.3], [2.15, 2.5]];

function frame(camera, w, h) {
  camera.aspect = w / h;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const half = camera.aspect < 1.1 ? 2.45 : 3.5;
  const dist = Math.max(2.45 / Math.tan(vfov / 2), half / Math.tan(hfov / 2));
  const dir = new THREE.Vector3(0, 0.2, 1).normalize();
  camera.position.copy(TARGET).addScaledVector(dir, dist);
  camera.updateProjectionMatrix();
}

function boltEnds(coil, agent, side) {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  coil.userData.top.getWorldPosition(a);
  agent.userData.bolts[side].userData.tip.getWorldPosition(b);
  return [a, b];
}

/* ---------- stills ---------- */
function awake(agent, mood, t = 2) {
  agent.userData.power = 1;
  for (let i = 0; i < 40; i++) pose(agent, mood, t, 0.05);
  paintScreen(agent.userData.screenTex, "pulse", 0.6);
}

export function renderStill(canvas, which, size = 900) {
  const renderer = setupRenderer(canvas, true);
  renderer.setPixelRatio(1);
  const wide = which === "lab" || which === "room";
  renderer.setSize(wide ? size * 1.6 : size, size, false);
  const scene = new THREE.Scene();
  addLights(scene, renderer, { extent: which === "room" ? 9 : 5 });
  const camera = new THREE.PerspectiveCamera(30, wide ? 1.6 : 1, 0.1, 100);
  const look = (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); };

  if (which === "room") {
    renderer.setSize(size * 1.6, size, false);
    camera.aspect = 1.6;
    renderRoomStill(renderer, scene, camera);
  } else if (which.startsWith("bench-")) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 0.2, 80), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, clearcoat: 0.3 }));
    ped.position.y = -0.1; ped.receiveShadow = true;
    scene.add(ped, makeBench(which.slice(6)));
    look(0, 1.7, 4.3, 0, 0.6, 0);
  } else if (which.startsWith("agent-")) {
    // Agentztein in one pose, alone on a transparent background: the app's guide in every screen. Each still is then
    // cropped to its outline and scaled to 563 px tall (like agent-ok.webp) before it goes in img/.
    const P = {
      sleep: { mood: "sleep", power: 0.18, arms: [-0.05, 0.05, 0, 0], screen: "off", look: [0, -0.4] },
      think: { mood: "think", arms: [-0.12, 0.45, 0, -1.25], screen: "sync", look: [0.35, 0.4] },
      happy: { mood: "happy", arms: [-2.5, 2.5, 0, 0], screen: "ok", look: [0, 0.15] },
      wave: { mood: "happy", arms: [-0.12, 2.6, 0, 0], screen: "pulse", look: [0.2, 0.1] },
      read: { mood: "think", arms: [-0.55, 0.55, -1.05, -1.05], screen: "pulse", look: [0, -0.45], paper: true },
    }[which.slice(6)] ?? { mood: "idle", arms: [-0.12, 0.12, 0, 0], screen: "pulse", look: [0, 0] };
    const agent = makeAgent({ legs: true });
    const u = agent.userData;
    u.power = P.power ?? 1;
    u.look.set(P.look[0], P.look[1]);
    for (let i = 0; i < 40; i++) pose(agent, P.mood, 2, 0.05);
    setArms(agent, ...P.arms);
    paintScreen(u.screenTex, P.screen, 0.6);
    agent.position.y = LEG_DROP;
    scene.add(agent);
    if (P.paper) {
      const paper = makePaper([["#1", "✓"], ["#2", "?"], ["#3", "✓"]], { title: "arXiv", w: 0.9, h: 1.1 });
      paper.position.set(0, 1.45, 0.75); paper.rotation.x = -0.35;
      scene.add(paper);
    }
    look(0.4, 2.1, 11, 0, 1.55, 0);
  } else if (which === "muse") {
    const agent = makeAgent();
    agent.userData.look.set(0.25, 0.1);
    awake(agent, "idle");
    scene.add(agent);
    const logo = makeMetaLogo(2.4);
    logo.position.set(0, 3.55, -0.1); logo.scale.setScalar(0.55); logo.rotation.y = -0.2;
    scene.add(logo);
    look(0.7, 2.9, 5.3, 0, 2.55, 0);
  } else {
    scene.add(makeFloor(which === "lab" ? 3.8 : 2.6));
    const agent = makeAgent();
    scene.add(agent);
    const u = agent.userData;
    if (which === "lab") {
      awake(agent, "happy");
      setArms(agent, -0.14, 2.6);
      const coils = [makeCoil(-COIL_X), makeCoil(COIL_X)];
      coils.forEach((c) => { c.position.y = -0.3; c.position.z = -0.4; scene.add(c); });
      scene.updateMatrixWorld(true);
      coils.forEach((c, i) => { const b = makeBolt(); const [a, e] = boltEnds(c, agent, i); b.update(a, e, 0.35); scene.add(b); });
      SKILLS.forEach((s, i) => {
        const ch = makeChip(s);
        ch.position.set(CROWN[i][0], CROWN[i][1], -0.25);
        scene.add(ch);
      });
      frame(camera, 1.6, 1);
      camera.lookAt(TARGET);
      scene.updateMatrixWorld(true);
      scene.children.filter((o) => o.userData.body).forEach((ch) => ch.lookAt(camera.position.x, ch.position.y, camera.position.z));
    } else if (which === "stepD") {
      // decides: with the plan in its hand (exam, model, effort, cap) and the Meta models it could pick floating by
      u.look.set(0.75, 0.2);
      awake(agent, "think");
      setArms(agent, -0.14, 1.25, -0.2, 0);
      paintScreen(u.screenTex, "pulse", 0.6);
      const paper = makePaper([["Exam", "Code"], ["Model", "Spark"], ["Effort", "medium"], ["Cap", "$0.50"]], { title: "Today's plan" });
      paper.position.set(1.35, 1.8, 0.6); paper.rotation.set(0, -0.45, -0.03);
      const picks = [[0x6d5ce8, -1.55, 2.75], [C.meta, -1.75, 1.95], [0x9b5de5, -1.4, 1.2]];
      picks.forEach(([color, x, y], i) => {
        const ch = makeChip({ ...SKILLS[i % SKILLS.length], color, name: "" }, { label: false });
        ch.position.set(x, y, 0.55); ch.rotation.y = 0.35;
        scene.add(ch);
      });
      const logo = makeMetaLogo(1.6);
      logo.scale.setScalar(0.3); logo.position.set(-1.45, 3.4, 0.4); logo.rotation.y = 0.3;
      const ok = makeBadge("ok"); ok.position.set(1.5, 3.1, 0.85); ok.rotation.y = -0.3;
      scene.add(paper, logo, ok);
      look(0, 2.1, 8.4, 0, 1.6, 0);
    } else if (which === "step0") {
      // measures itself: reads the sheet of its practice exam, with a stopwatch
      u.look.set(-0.85, 0.15);
      awake(agent, "think");
      setArms(agent, -1.25, 0.2, 0.15, 0);
      paintScreen(u.screenTex, "pulse", 0.6);
      const paper = makePaper([["Q1", "✓"], ["Q2", "✓"], ["Q3", "✗"], ["Q4", "✓"], ["Q5", "✓"]], { title: "Practice exam", bad: -1 });
      paper.position.set(-1.35, 1.75, 0.6); paper.rotation.set(0, 0.45, 0.04);
      const watch = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
      face.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.045, 12, 48), new THREE.MeshStandardMaterial({ color: C.meta, roughness: 0.3 }));
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.03), new THREE.MeshStandardMaterial({ color: C.ink }));
      hand.geometry.translate(0, 0.12, 0); hand.position.z = 0.07; hand.rotation.z = -0.9;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), new THREE.MeshStandardMaterial({ color: C.ink }));
      knob.position.y = 0.42;
      watch.add(face, rim, hand, knob);
      watch.position.set(1.35, 2.0, 0.5); watch.rotation.y = -0.35; watch.scale.setScalar(1.2);
      scene.add(paper, watch);
      look(0, 2.1, 8.4, 0, 1.6, 0);
    } else if (which === "step1") {
      // researches: reads the week's AI news on Hacker News and sorts each idea
      u.look.set(-0.85, 0.2);
      awake(agent, "think");
      setArms(agent, -1.25, 0.2, 0.15, 0);
      paintScreen(u.screenTex, "pulse", 0.6);
      const heads = ["Tree search for agents", "New open model tops a board", "Prompt tricks that 10x it all", "Sandboxes for terminal agents"];
      const news = windowPanel(1.3, 1.4, false, (c, W) => {
        c.fillStyle = "#ff6600"; c.fillRect(0, 50, W, 64);
        c.fillStyle = "#ffffff"; c.fillRect(22, 62, 40, 40);
        c.fillStyle = "#ff6600"; c.font = "800 34px Figtree, Arial"; c.fillText("Y", 31, 95);
        c.fillStyle = "#ffffff"; c.font = "800 30px Figtree, Arial"; c.fillText("Hacker News", 78, 93);
        heads.forEach((h, i) => {
          const y = 150 + i * 92;
          c.fillStyle = "#f6f6ef"; rr(c, 18, y, W - 36, 76, 12); c.fill();
          c.fillStyle = "#828282"; c.font = "600 22px Figtree, Arial"; c.fillText(`${i + 1}.`, 32, y + 46);
          c.fillStyle = "#1c2b33"; c.font = "700 24px Figtree, Arial"; c.fillText(h, 66, y + 46);
        });
      });
      news.position.set(-1.35, 1.8, 0.5); news.rotation.set(0, 0.45, 0.02);
      const tags = [
        [{ ...SKILLS[0], color: 0x6d5ce8, name: "Try it" }, 1.3, 2.7],
        [{ ...SKILLS[0], color: 0xffa928, name: "Watch" }, 1.5, 2.05],
        [{ ...SKILLS[0], color: 0x9aa8b5, name: "Skip" }, 1.3, 1.4],
      ].map(([s, x, y]) => { const ch = makeChip(s); ch.position.set(x, y, 0.4); ch.rotation.y = -0.35; ch.scale.setScalar(0.85); return ch; });
      tags[0].userData.body.material.emissiveIntensity = 0.5;
      scene.add(news, ...tags);
      look(0, 2.1, 8.4, 0, 1.6, 0);
    } else if (which === "step2") {
      // learns from its mistakes: a page of results with one wrong row
      u.look.set(-0.9, 0.1);
      awake(agent, "think");
      setArms(agent, -1.3, 0.14, 0.2, 0);
      paintScreen(u.screenTex, "alert");
      const paper = makePaper([["Code", "✓"], ["Terminal", "✓"], ["Puzzle", "✗"], ["Web", "✓"], ["Paper", "✓"]], { title: "My tests", bad: 2 });
      paper.position.set(-1.3, 1.75, 0.6); paper.rotation.set(0, 0.45, 0.04);
      const x = makeBadge("x"); x.position.set(-1.55, 2.55, 0.85); x.rotation.y = 0.35;
      const glass = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 12, 40), new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.3 }));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.19, 32), new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.35, roughness: 0 }));
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 12), new THREE.MeshStandardMaterial({ color: C.ink }));
      handle.position.y = -0.36;
      glass.add(ring, lens, handle);
      glass.position.set(-1.3, 1.58, 0.8); glass.rotation.set(0, 0.45, 0.5);
      scene.add(paper, x, glass);
      look(-0.45, 2.1, 7.0, -0.45, 1.5, 0);
    } else if (which === "step3") {
      // tests the new skill in the lab: a coil fires through it
      u.look.set(0.9, 0.25);
      awake(agent, "idle");
      setArms(agent, -0.14, 1.5, 0, -0.3);
      paintScreen(u.screenTex, "test");
      const coil = makeCoil(1.85); coil.position.set(1.85, -0.3, -0.7); scene.add(coil);
      const chip = makeChip({ ...SKILLS[0], name: "New" });
      chip.position.set(1.1, 2.15, 0.6); chip.rotation.y = -0.3; chip.scale.setScalar(1.2);
      chip.userData.body.material.emissiveIntensity = 0.5;
      scene.add(chip);
      scene.updateMatrixWorld(true);
      const top = new THREE.Vector3(); coil.userData.top.getWorldPosition(top);
      [0.3, 0.38].forEach((j) => { const b = makeBolt(); b.update(top, chip.position.clone().add(new THREE.Vector3(0.1, 0.05, 0)), j); scene.add(b); });
      look(0.3, 2.1, 7.0, 0.3, 1.5, 0);
    } else if (which === "step4") {
      // keeps it: the new piece is sewn on and it lights up
      u.look.set(0.15, 0.3);
      awake(agent, "happy");
      setArms(agent, -2.5, 2.5);
      paintScreen(u.screenTex, "ok");
      const chip = makeChip(SKILLS[0], { label: false });
      chip.position.set(-0.48, 0.42, 0.45); chip.scale.setScalar(0.62);
      chip.userData.body.material.emissiveIntensity = 0.6;
      const ok = makeBadge("ok"); ok.position.set(1.05, 3.05, 0.4); ok.scale.setScalar(1.3); ok.rotation.y = -0.25;
      scene.add(chip, ok);
      for (let i = 0; i < 14; i++) {
        const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: [C.meta, C.ok, 0xffd25c][i % 3], toneMapped: false }));
        const a = (i / 14) * Math.PI * 2;
        spark.position.set(Math.cos(a) * (1.3 + (i % 3) * 0.2), 2.0 + Math.sin(a) * 1.1, 0.4);
        spark.rotation.set(i, i * 0.5, 0);
        scene.add(spark);
      }
      look(0, 2.0, 6.8, 0, 1.55, 0);
    } else if (which === "step5") {
      // keeps up to date: the rules changed, so that skill goes back to the lab
      u.look.set(-0.85, 0.15);
      awake(agent, "think");
      setArms(agent, -0.14, 1.2, 0, -0.2);
      paintScreen(u.screenTex, "sync");
      const paper = makePaper([["Tasks", "v2"], ["Time", "12 h"], ["Internet", "off"], ["Judge", "new"]], { title: "Benchmark v2", warn: 2 });
      paper.position.set(-1.3, 1.8, 0.6); paper.rotation.set(0, 0.45, -0.03);
      const chip = makeChip({ ...SKILLS[4], color: C.amber, name: "Review" });
      chip.position.set(1.35, 1.95, 0.6); chip.rotation.y = -0.35;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.03, 10, 64, Math.PI * 1.6), new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.3 }));
      ring.position.copy(chip.position); ring.rotation.y = -0.35;
      const sync = makeBadge("sync"); sync.position.set(-1.55, 2.65, 0.85); sync.rotation.y = 0.3;
      scene.add(paper, chip, ring, sync);
      look(-0.2, 2.1, 7.2, -0.2, 1.5, 0);
    }
  }
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  return renderer;
}
