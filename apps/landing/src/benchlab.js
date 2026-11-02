/* Interactive 3D labs, one per benchmark. Agentztein stands in each one while the benchmark's machinery
   plays its three steps ("how it works"). Drag to turn the lab, tap objects to inspect them, and in
   ARC-AGI-3 you can play the level yourself. Everything shown is an illustration, never a result. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  C, makeAgent, pose, setArms, setupRenderer, addLights, makeFloor, paintScreen, makeBadge,
  canvasTex, rr, glossy, std, shadowed, windowPanel, FONT,
} from "./agent.js";

const ease = (k) => 1 - Math.pow(1 - k, 3);
const INK = "#1c2b33", MUTED = "#4b5f6d";

/** A flat label that always faces the camera. */
function label(text, { bg = "#ffffff", fg = INK, h: h0 = 0.22, bold = 700, dot = null } = {}) {
  const px = 96;
  const h = h0 * 1.4;
  const measure = document.createElement("canvas").getContext("2d");
  const draw = (g, W, H, txt, o) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = o.bg; rr(g, 2, 2, W - 4, H - 4, H / 2 - 2); g.fill();
    let x = H * 0.42;
    if (o.dot) { g.fillStyle = o.dot; g.beginPath(); g.arc(x + 10, H / 2, 14, 0, Math.PI * 2); g.fill(); x += 40; }
    g.fillStyle = o.fg; g.font = `${o.bold} ${px * 0.5}px ${FONT}`; g.textBaseline = "middle"; g.fillText(txt, x, H / 2 + 3);
  };
  const widthFor = (txt, o) => { measure.font = `${o.bold} ${px * 0.5}px ${FONT}`; return Math.ceil(measure.measureText(txt).width + px * 0.84 + (o.dot ? 40 : 0)); };
  const opts = { bg, fg, bold, dot };
  let W = widthFor(text, opts);
  const tex = canvasTex(W, px, (g, w, hh) => draw(g, w, hh, text, opts));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((h * W) / px, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  mesh.renderOrder = 10;
  mesh.userData.billboard = true;
  mesh.userData.set = (txt, o = {}) => {
    Object.assign(opts, o);
    W = widthFor(txt, opts);
    const { c, g } = tex.userData;
    c.width = W; c.height = px;
    draw(g, W, px, txt, opts);
    tex.dispose();
    tex.needsUpdate = true;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry((h * W) / px, h);
  };
  return mesh;
}

/** A panel with canvas content that can be redrawn. */
function screen(w, h, dark, draw) {
  const g = windowPanel(w, h, dark, draw);
  const face = g.children[1];
  g.userData.redraw = (fn) => {
    const { g: ctx, c } = face.material.map.userData;
    ctx.fillStyle = dark ? "#17242d" : "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ["#ff6159", "#ffbd2e", "#28c941"].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(30 + i * 26, 28, 9, 0, Math.PI * 2); ctx.fill(); });
    fn(ctx, c.width, c.height);
    face.material.map.needsUpdate = true;
  };
  return shadowed(g);
}

const box = (w, h, d, color, o) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.18), glossy(color, o));

/* ========================================================================================== */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} id benchmark id
 * @param {{ lang?: "en"|"es", reduced?: boolean, onStep?: (i: number) => void, onInfo?: (text: string) => void }} [o]
 */
export function createBenchLab(canvas, id, { lang = "en", reduced = false, onStep = () => {}, onInfo = () => {} } = {}) {
  const L = (en, es) => (lang === "es" ? es : en);
  const renderer = setupRenderer(canvas);
  const scene = new THREE.Scene();
  addLights(scene, renderer, { extent: 5, mapSize: 1024 });
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const world = new THREE.Group();
  scene.add(world);
  world.add(makeFloor(3.6));

  const agent = makeAgent();
  agent.scale.setScalar(0.62);
  agent.position.set(-2.15, -0.3, 0.6);
  agent.rotation.y = 0.55;
  agent.userData.power = 1;
  world.add(shadowed(agent));
  const u = agent.userData;
  let mood = "idle";
  paintScreen(u.screenTex, "pulse", 0);

  // ---- motion: tweens that can be cancelled when the step changes ----
  let tweens = [];
  const tween = (dur, fn, delay = 0) => new Promise((res) => {
    if (reduced || dur === 0) { fn(1); res(); return; }
    tweens.push({ t: -delay, dur, fn, res });
  });
  const wait = (s) => tween(s, () => {});
  const clearTweens = () => { tweens.forEach((tw) => { tw.fn(1); tw.res(); }); tweens = []; };

  // ---- camera: drag to turn, eases to each step's focus ----
  const cam = { yaw: 0.25, yawGoal: 0.25, target: new THREE.Vector3(0.2, 0.75, 0), goal: new THREE.Vector3(0.2, 0.75, 0), dist: 9.8 };
  const clickables = [];
  const bills = [];
  const track = (o) => { o.traverse((m) => { if (m.userData?.billboard) bills.push(m); }); return o; };

  // ---------------------------------------------------------------- the labs
  const labs = {
    swe() {
      const files = ["src/", "dates/", "parse.ts", "zone.ts", "api/", "tests/"];
      const desk = box(1.7, 0.12, 1.1, 0xffffff); desk.position.set(-0.55, 0.3, 0);
      const legs = [[-1.3, -0.38], [0.2, -0.38], [-1.3, 0.38], [0.2, 0.38]].map(([x, z]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 10), std(C.metal)); l.position.set(x, -0.08, z); return l; });
      world.add(desk, ...legs);
      const blocks = files.map((f, i) => {
        const b = box(0.46, 0.16, 0.3, i === 3 ? 0x5b9bff : 0xe6ebf0);
        b.position.set(-1.1 + (i % 3) * 0.55, 0.45, -0.25 + Math.floor(i / 3) * 0.5);
        const tag = track(label(f, { h: 0.13, bg: "rgba(255,255,255,.95)" }));
        tag.position.set(0, 0.2, 0); b.add(tag);
        b.userData.click = () => { lift(b); onInfo(i === 3 ? L("zone.ts: where the bug lives.", "zone.ts: aquí vive el error.") : L(`${f} — not involved in this issue.`, `${f}: no tiene que ver con este issue.`)); };
        clickables.push(b);
        world.add(b);
        return b;
      });
      const lift = (b) => tween(0.5, (k) => { b.position.y = 0.45 + Math.sin(k * Math.PI) * 0.18; });
      const issue = screen(1.15, 0.6, false, () => {});
      issue.userData.redraw((g, W) => {
        g.fillStyle = "#fde6e1"; rr(g, 16, 54, W - 32, 190, 18); g.fill();
        g.fillStyle = "#c42d12"; g.font = `800 34px ${FONT}`; g.fillText("Issue #4127", 36, 104);
        g.fillStyle = INK; g.font = `700 32px ${FONT}`; g.fillText(L("Dates shift a day in UTC", "Las fechas se corren un día"), 36, 160);
        g.fillStyle = MUTED; g.font = `600 24px ${FONT}`; g.fillText(L("reported by a user · repo @ 3f2c1a", "reportado por un usuario · repo @ 3f2c1a"), 36, 206);
      });
      issue.position.set(-0.55, 1.45, -0.2); issue.scale.setScalar(0.001);
      issue.userData.click = () => onInfo(L("The issue: written by a person, the agent must understand it from the text.", "El issue: lo escribió una persona; el agente debe entenderlo por el texto."));
      clickables.push(issue);
      const patch = screen(1.2, 0.72, true, () => {});
      const drawPatch = (n) => patch.userData.redraw((g) => {
        g.font = `600 28px monospace`; g.fillStyle = "#9fd3ff"; g.fillText("zone.ts", 24, 92);
        [["- return local(d)", "#ff9b87"], ["+ return toUTC(d, zone)", "#7ee2a8"], ["+ if (!zone) zone = 'UTC'", "#7ee2a8"]].slice(0, n).forEach(([s, c], i) => { g.fillStyle = c; g.fillText(s, 24, 150 + i * 48); });
      });
      drawPatch(0);
      patch.position.set(-0.55, 1.45, 0.05); patch.rotation.y = 0.1; patch.visible = false;
      world.add(issue, patch);
      // test rack
      const rack = box(1.5, 0.1, 0.5, 0xffffff); rack.position.set(1.55, 0.25, 0); world.add(rack);
      const tube = (x, z, red) => {
        const g = new THREE.Group();
        const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.36, 6, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false }));
        const liq = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 6, 16), std(red ? C.red : C.ok, { emissive: red ? C.red : C.ok, emissiveIntensity: 0.35 }));
        liq.position.y = -0.05;
        g.add(glass, liq); g.position.set(x, 0.55, z);
        g.userData.liq = liq;
        g.userData.click = () => onInfo(z < 0 ? L("Fail → pass: this test failed before the fix; it must pass now.", "Falla → pasa: esta prueba fallaba; ahora debe pasar.") : L("Pass → pass: it already passed; the fix must not break it.", "Pasa → pasa: ya pasaba; el arreglo no debe romperla."));
        clickables.push(g);
        world.add(g);
        return g;
      };
      const f2p = [0, 1, 2].map((i) => tube(1.15 + i * 0.3, -0.12, true));
      const p2p = [0, 1, 2, 3, 4, 5].map((i) => tube(0.95 + i * 0.2, 0.17, false));
      p2p.forEach((p) => p.scale.setScalar(0.75));
      const t1 = track(label("FAIL → PASS", { h: 0.15, dot: "#f0533c" })); t1.position.set(1.45, 1.05, -0.12);
      const t2 = track(label("PASS → PASS", { h: 0.15, dot: "#22b864" })); t2.position.set(1.45, 0.88, 0.3);
      const ok = makeBadge("ok"); ok.position.set(1.55, 1.45, 0); ok.scale.setScalar(0.001);
      world.add(t1, t2, ok);
      const setRed = (t, red) => { const c = red ? C.red : C.ok; t.userData.liq.material.color.setHex(c); t.userData.liq.material.emissive.setHex(c); };
      return {
        reset() { issue.scale.setScalar(0.001); patch.visible = false; drawPatch(0); blocks[3].material.emissiveIntensity = 0; f2p.forEach((t) => setRed(t, true)); ok.scale.setScalar(0.001); },
        focus: [[-0.3, 0.95, 0, 0.3], [-0.2, 0.95, 0, 0.1], [0.5, 0.85, 0, -0.25]],
        moods: ["think", "think", "happy"],
        steps: [
          async () => { await tween(0.6, (k) => issue.scale.setScalar(Math.max(0.001, ease(k)))); },
          async () => {
            blocks[3].material.emissive = new THREE.Color(0x5b9bff); blocks[3].material.emissiveIntensity = 0.5;
            await lift(blocks[3]);
            await tween(0.4, (k) => issue.position.y = 1.45 + k * 0.5);
            patch.visible = true;
            for (let n = 1; n <= 3; n++) { drawPatch(n); await wait(0.5); }
          },
          async () => {
            for (const t of f2p) { await wait(0.45); setRed(t, false); }
            await tween(0.6, (k) => ok.scale.setScalar(Math.max(0.001, ease(k) * 1.2)));
            onInfo(L("Resolved: 3 tests fixed, 6 still green.", "Resuelto: 3 pruebas arregladas, 6 siguen en verde."));
          },
        ],
        after() { issue.position.y = 1.45; },
      };
    },

    terminal() {
      const shell = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.4), new THREE.MeshPhysicalMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.08, roughness: 0.2, depthWrite: false }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry), new THREE.LineBasicMaterial({ color: 0x2ec4b6 }));
      const cont = new THREE.Group(); cont.add(shell, edges); cont.position.set(0.55, 0.55, 0);
      const tag = track(label(L("Isolated container", "Contenedor aislado"), { h: 0.16, dot: "#2ec4b6" })); tag.position.set(0.55, 1.5, 0.7);
      const mon = screen(1.9, 1.15, true, () => {});
      mon.position.set(0.55, 0.6, 0.05);
      const LINES = [
        ["$ make", "#e6edf3"], [L("fatal: openssl/ssl.h: no such file", "fatal: openssl/ssl.h: no existe"), "#ff9b87"],
        ["$ apt-get install -y libssl-dev", "#e6edf3"], ["$ make && ./server --port 8080", "#e6edf3"], ["listening on :8080", "#7ee2a8"],
        ["$ bash tests.sh", "#e6edf3"], [L("✓ 5/5 checks passed", "✓ 5/5 revisiones pasan"), "#7ee2a8"],
      ];
      let shown = 0;
      const drawTerm = () => mon.userData.redraw((g, W) => {
        g.font = `600 22px monospace`;
        if (!shown) { g.fillStyle = "#9fd3ff"; g.fillText(L("> task: build it and serve on :8080", "> tarea: compílalo y sírvelo en :8080"), 22, 90); }
        LINES.slice(0, shown).forEach(([s, c], i) => { g.fillStyle = c; g.fillText(s, 22, 90 + i * 34); });
        g.fillStyle = "#e6edf3"; g.fillRect(22, 90 + Math.max(shown, 1) * 34 - 20, 12, 24);
        g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, 0, W, 4);
      });
      drawTerm();
      mon.userData.click = () => onInfo(L("Only a terminal: no buttons, no help. Tests check the final state of the machine.", "Solo una terminal: sin botones ni ayuda. Las pruebas revisan el estado final de la máquina."));
      clickables.push(mon);
      // timer: 24 segments that go out one by one
      const timer = new THREE.Group();
      const segs = Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.04), std(0x2ec4b6, { emissive: 0x2ec4b6, emissiveIntensity: 0.6 }));
        s.position.set(Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0); s.rotation.z = -a;
        timer.add(s); return s;
      });
      timer.position.set(2.15, 1.55, 0.2);
      timer.userData.click = () => onInfo(L("Every task has a time limit.", "Cada tarea tiene límite de tiempo."));
      clickables.push(timer);
      const ok = makeBadge("ok"); ok.position.set(2.15, 0.9, 0.3); ok.scale.setScalar(0.001);
      world.add(cont, tag, mon, timer, ok);
      const burn = (to) => tween(1.4, (k) => segs.forEach((s, i) => { s.visible = i >= Math.round(k * to); }));
      return {
        reset() { shown = 0; drawTerm(); segs.forEach((s) => { s.visible = true; }); ok.scale.setScalar(0.001); },
        focus: [[0.3, 0.9, 0, 0.25], [0.4, 0.8, 0, 0], [0.6, 0.9, 0, -0.25]],
        moods: ["think", "alert", "happy"],
        steps: [
          async () => { onInfo(L("The instruction arrives; the clock starts.", "Llega la instrucción; empieza el reloj.")); },
          async () => { for (let n = 1; n <= 5; n++) { shown = n; drawTerm(); if (n === 2) { mood = "alert"; await wait(0.9); mood = "think"; } await wait(0.6); } await burn(10); },
          async () => { for (let n = 6; n <= 7; n++) { shown = n; drawTerm(); await wait(0.6); } await tween(0.6, (k) => ok.scale.setScalar(Math.max(0.001, ease(k) * 1.2))); },
        ],
      };
    },

    arc() {
      const N = 8, S = 0.3;
      const walls = new Set(["2,1", "2,2", "2,3", "2,4", "5,3", "5,4", "5,5", "5,6", "1,6", "3,6", "6,1", "7,3"]);
      const start = [0, 7], key = [3, 1], goal = [7, 0];
      const board = new THREE.Group(); board.position.set(0.45, 0.15, 0);
      const tray = box(N * S + 0.2, 0.1, N * S + 0.2, 0xffffff); tray.position.y = -0.05; board.add(tray);
      const pos = (x, z) => new THREE.Vector3((x - (N - 1) / 2) * S, 0, (z - (N - 1) / 2) * S);
      const tiles = [];
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const w = walls.has(`${x},${z}`);
        const t = box(S * 0.9, w ? 0.3 : 0.06, S * 0.9, w ? 0x4b5f6d : 0xeef2f6);
        t.position.copy(pos(x, z)); t.position.y = w ? 0.15 : 0.03;
        t.userData.cell = [x, z]; t.userData.wall = w;
        if (!w) { t.userData.click = () => tryMove(x, z); clickables.push(t); }
        tiles.push(t); board.add(t);
      }
      const goalT = tiles[goal[1] * N + goal[0]]; goalT.material = glossy(0x9aa8b5);
      const keyM = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), glossy(0xffc83d, { emissive: 0xffc83d, emissiveIntensity: 0.4 }));
      keyM.position.copy(pos(...key)); keyM.position.y = 0.25; board.add(keyM);
      const player = box(S * 0.7, S * 0.7, S * 0.7, 0xff8f70); board.add(player);
      const counter = track(label("", { h: 0.2 })); counter.position.set(0.45, 1.75, 0);
      const hint = track(label(L("Tap a tile next to the orange piece", "Toca una casilla junto a la pieza naranja"), { h: 0.15, bg: "#fff1e6", fg: "#b34700" }));
      hint.position.set(0.45, 1.5, 0.2); hint.visible = false;
      world.add(board, counter, hint);
      // shortest route (the "human baseline" here) through the key, by breadth-first search
      const bfs = (a, b) => {
        const q = [[...a, 0]], seen = new Set([a.join()]);
        while (q.length) {
          const [x, z, d] = q.shift();
          if (x === b[0] && z === b[1]) return d;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz, k = `${nx},${nz}`;
            if (nx < 0 || nz < 0 || nx >= N || nz >= N || walls.has(k) || seen.has(k)) continue;
            seen.add(k); q.push([nx, nz, d + 1]);
          }
        }
        return Infinity;
      };
      const BASE = bfs(start, key) + bfs(key, goal);
      let at = [...start], moves = 0, hasKey = false, won = false, playable = false;
      const place = () => { const p = pos(...at); player.position.set(p.x, 0.17, p.z); };
      const writeCounter = () => counter.userData.set(won
        ? L(`Cleared in ${moves} · human ${BASE} · score ${Math.min(1, (BASE / moves) ** 2).toFixed(2)}`, `Superado en ${moves} · humano ${BASE} · puntaje ${Math.min(1, (BASE / moves) ** 2).toFixed(2)}`)
        : L(`Actions: ${moves} · human baseline: ${BASE}`, `Acciones: ${moves} · línea humana: ${BASE}`));
      const step = async (nx, nz) => {
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || walls.has(`${nx},${nz}`)) { onInfo(L("A wall: that move does nothing (but it still counts).", "Un muro: ese movimiento no hace nada (pero sí cuenta).")); moves++; writeCounter(); return; }
        const from = player.position.clone(); at = [nx, nz]; moves++;
        const p = pos(nx, nz);
        await tween(0.16, (k) => { player.position.lerpVectors(from, new THREE.Vector3(p.x, 0.17, p.z), k); player.position.y = 0.17 + Math.sin(k * Math.PI) * 0.12; });
        if (!hasKey && nx === key[0] && nz === key[1]) { hasKey = true; keyM.visible = false; goalT.material = glossy(C.ok, { emissive: C.ok, emissiveIntensity: 0.3 }); onInfo(L("Rule found: the key unlocks the green exit.", "Regla descubierta: la llave abre la salida verde.")); mood = "happy"; }
        if (hasKey && nx === goal[0] && nz === goal[1]) { won = true; mood = "happy"; onInfo(L("Level cleared. Fewer actions, higher score.", "Nivel superado. Menos acciones, más puntaje.")); }
        else if (!hasKey && nx === goal[0] && nz === goal[1]) onInfo(L("The exit is locked… something must open it.", "La salida está cerrada… algo debe abrirla."));
        writeCounter();
      };
      let busy = false;
      const tryMove = async (x, z) => {
        if (!playable || won || busy) return;
        const dx = Math.sign(x - at[0]), dz = Math.sign(z - at[1]);
        if (!dx && !dz) return;
        busy = true;
        await (Math.abs(x - at[0]) >= Math.abs(z - at[1]) ? step(at[0] + dx, at[1]) : step(at[0], at[1] + dz));
        busy = false;
      };
      const keys = (e) => {
        const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
        if (!m || !playable || won || busy) return;
        e.preventDefault();
        busy = true; step(at[0] + m[0], at[1] + m[1]).then(() => { busy = false; });
      };
      canvas.addEventListener("keydown", keys);
      // the efficient route, for the demo
      const route = (() => {
        const path = (a, b) => {
          const prev = new Map([[a.join(), null]]), q = [a];
          while (q.length) {
            const c = q.shift();
            if (c[0] === b[0] && c[1] === b[1]) break;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const n = [c[0] + dx, c[1] + dz], k = n.join();
              if (n[0] < 0 || n[1] < 0 || n[0] >= N || n[1] >= N || walls.has(k) || prev.has(k)) continue;
              prev.set(k, c); q.push(n);
            }
          }
          const out = []; let c = b;
          while (c && c.join() !== a.join()) { out.unshift(c); c = prev.get(c.join()); }
          return out;
        };
        return [...path(start, key), ...path(key, goal)];
      })();
      const restart = () => { at = [...start]; moves = 0; hasKey = false; won = false; keyM.visible = true; goalT.material = glossy(0x9aa8b5); place(); writeCounter(); };
      restart();
      return {
        reset() { playable = false; hint.visible = false; restart(); },
        focus: [[0.45, 0.6, 0, 0.0], [0.45, 0.5, 0, 0.0], [0.45, 0.6, 0, 0.0]],
        pitch: 0.75,
        moods: ["think", "think", "happy"],
        steps: [
          async () => { onInfo(L("No instructions: what do you control? What is the goal?", "Sin instrucciones: ¿qué controlas? ¿cuál es la meta?")); },
          async () => { playable = true; hint.visible = true; canvas.focus({ preventScroll: true }); onInfo(L("Your turn: move the orange piece (tap tiles or use the arrows).", "Tu turno: mueve la pieza naranja (toca casillas o usa las flechas).")); },
          async () => { restart(); hint.visible = false; playable = false; for (const [x, z] of route) await step(x, z); },
        ],
        dispose() { canvas.removeEventListener("keydown", keys); },
      };
    },

    web() {
      const q = screen(1.6, 0.62, false, () => {});
      q.userData.redraw((g) => {
        g.fillStyle = MUTED; g.font = `800 24px ${FONT}`; g.fillText(L("QUESTION", "PREGUNTA"), 24, 90);
        g.fillStyle = INK; g.font = `700 30px ${FONT}`;
        g.fillText(L("A dataset shown at a 1990s workshop", "Un dataset presentado en un taller de los 90"), 24, 140);
        g.fillText(L("by a team of three. In what year?", "por un equipo de tres. ¿En qué año?"), 24, 184);
      });
      q.position.set(0.3, 1.85, -0.4);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), glossy(0x3ccf6e, { emissive: 0x3ccf6e, emissiveIntensity: 0.4 }));
      hub.position.set(-0.6, 0.85, 0.2);
      world.add(q, hub);
      const clues = { 2: L("clue: “workshop, 1987”", "pista: «taller, 1987»"), 6: L("clue: “three authors”", "pista: «tres autores»"), 9: L("clue: the dataset's page", "pista: la página del dataset") };
      const pages = [];
      for (let i = 0; i < 11; i++) {
        const ring = i < 5 ? 0 : 1;
        const a = ring ? (i - 5) / 6 : i / 5;
        const g = box(0.34, 0.26, 0.04, 0xffffff);
        g.position.set(-0.2 + ring * 1.0 + Math.cos(a * Math.PI - Math.PI / 2) * 0.25, 0.35 + a * 1.1, -0.2 + Math.sin(a * 6) * 0.35);
        g.rotation.y = -0.2;
        const isClue = i in clues;
        g.userData.state = 0;
        g.userData.click = () => { onInfo(isClue ? clues[i] : L("Dead end: nothing useful here.", "Callejón sin salida: nada útil aquí.")); flip(g, isClue); };
        clickables.push(g);
        pages.push(g); world.add(g);
      }
      const lineMat = new THREE.LineBasicMaterial({ color: 0xcfd9e3 });
      const lines = pages.map((p) => { const geo = new THREE.BufferGeometry().setFromPoints([hub.position, p.position]); const l = new THREE.Line(geo, lineMat.clone()); world.add(l); return l; });
      const answer = box(0.62, 0.42, 0.08, 0x3ccf6e, { emissive: 0x3ccf6e, emissiveIntensity: 0.25 });
      answer.position.set(2.05, 1.3, 0.1); answer.scale.setScalar(0.001);
      const ansTag = track(label(L("1987 · verified", "1987 · verificado"), { h: 0.2, bg: "#3ccf6e", fg: "#ffffff" })); ansTag.position.set(2.05, 1.72, 0.2); ansTag.visible = false;
      world.add(answer, ansTag);
      const flip = (g, good) => tween(0.4, (k) => { g.rotation.y = -0.2 + k * Math.PI * 2; if (k > 0.5) g.material.color.setHex(good ? 0xffd25c : 0xb7c2ce); });
      return {
        reset() { pages.forEach((p, i) => { p.material.color.setHex(0xffffff); p.rotation.y = -0.2; lines[i].material.color.setHex(0xcfd9e3); }); answer.scale.setScalar(0.001); ansTag.visible = false; },
        focus: [[0.2, 1.1, 0, 0.2], [0.2, 0.95, 0, 0.12], [0.5, 1.0, 0, -0.2]],
        moods: ["think", "think", "happy"],
        steps: [
          async () => { onInfo(L("Many clues about one thing: hard to find, easy to check.", "Muchas pistas sobre una sola cosa: difícil de hallar, fácil de comprobar.")); },
          async () => { for (let i = 0; i < pages.length; i++) { const good = i in clues; lines[i].material.color.setHex(good ? 0xffc83d : 0x9aa8b5); await flip(pages[i], good); } },
          async () => {
            for (const i of [2, 6, 9]) { lines[i].material.color.setHex(0x22b864); pages[i].material.color.setHex(0x3ccf6e); await wait(0.35); }
            await tween(0.6, (k) => answer.scale.setScalar(Math.max(0.001, ease(k))));
            ansTag.visible = true;
          },
        ],
      };
    },

    research() {
      // MLE-bench: a leaderboard with medal lines
      const lb = new THREE.Group(); lb.position.set(-0.95, 0, -0.1);
      const heights = [1.55, 1.42, 1.3, 1.12, 0.95, 0.8, 0.6];
      heights.forEach((h, i) => { const b = box(0.16, h, 0.16, 0xdfe7ef); b.position.set(i * 0.22, h / 2 - 0.3, 0); lb.add(b); });
      [["Gold", "Oro", 0xe3b41b, 1.3], ["Silver", "Plata", 0xa9b4be, 1.0], ["Bronze", "Bronce", 0xc98a5a, 0.75]].map(([en, es, c, y]) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.015, 0.4), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 }));
        p.position.set(0.66, y - 0.3, 0);
        const t = track(label(L(en, es), { h: 0.12, dot: "#" + c.toString(16) })); t.position.set(-0.6, y - 0.22, 0.25);
        lb.add(p, t); return p;
      });
      const mine = box(0.18, 1, 0.18, 0xffb53d, { emissive: 0xffb53d, emissiveIntensity: 0.3 });
      mine.position.set(1.65, -0.3, 0.25); mine.scale.y = 0.05; lb.add(mine);
      const mtag = track(label(L("Agent", "Agente"), { h: 0.12, bg: "#fff1e6", fg: "#b37400" })); mtag.position.set(1.65, 0.1, 0.35); lb.add(mtag);
      const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 32), glossy(0xa9b4be, { metalness: 0.6 })); medal.rotation.x = Math.PI / 2; medal.position.set(1.65, 1.25, 0.3); medal.scale.setScalar(0.001);
      lb.add(medal);
      lb.children.forEach((c) => { if (c.isMesh && c !== medal) { c.userData.click = () => onInfo(L("MLE-bench: 75 Kaggle competitions; a medal means beating most real entries.", "MLE-bench: 75 competencias de Kaggle; una medalla es superar a la mayoría de los participantes reales.")); clickables.push(c); } });
      world.add(lb);
      // PaperBench: a rubric tree
      const tree = new THREE.Group(); tree.position.set(2.05, 0.05, 0);
      const node = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), glossy(c));
      const root = node(0.12, 0x1c2b33); root.position.set(0, 1.55, 0); tree.add(root);
      const KINDS = [[0x5b9bff, L("Code development", "Desarrollo de código")], [0x2ec4b6, L("Execution", "Ejecución")], [0xffb53d, L("Result match", "Coincidencia de resultados")]];
      const leaves = [];
      const seg = (a, b) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xb7c2ce }));
      [-0.55, 0, 0.55].forEach((x, i) => {
        const m = node(0.08, 0x9aa8b5); m.position.set(x, 1.05, 0); tree.add(m, seg(root.position, m.position));
        KINDS.forEach(([c, name], j) => {
          const lf = node(0.065, 0xe6ebf0); lf.position.set(x - 0.18 + j * 0.18, 0.55, (j - 1) * 0.08);
          lf.userData.kind = c; lf.userData.fail = i === 2 && j === 2;
          lf.userData.click = () => onInfo(`${name}${lf.userData.fail ? L(" · this one didn't match", " · esta no coincidió") : ""}`);
          clickables.push(lf);
          tree.add(lf, seg(m.position, lf.position)); leaves.push(lf);
        });
      });
      const score = track(label(L("Replication score: —", "Puntaje de réplica: —"), { h: 0.15 })); score.position.set(2.05, 1.95, 0);
      world.add(tree, score);
      return {
        reset() { mine.scale.y = 0.05; mine.position.y = -0.3; medal.scale.setScalar(0.001); leaves.forEach((l) => { l.material.color.setHex(0xe6ebf0); l.material.emissiveIntensity = 0; }); score.userData.set(L("Replication score: —", "Puntaje de réplica: —")); },
        focus: [[0.4, 0.8, 0, 0.15], [-0.1, 0.75, 0, 0.25], [1.1, 0.9, 0, -0.25]],
        moods: ["think", "happy", "happy"],
        steps: [
          async () => { onInfo(L("Two kinds of AI research: competitions and replicating papers.", "Dos tipos de investigación de IA: competencias y replicar artículos.")); },
          async () => { await tween(1.6, (k) => { const h = 0.05 + ease(k) * 1.38; mine.scale.y = h; mine.position.y = -0.3 + h / 2; mtag.position.y = -0.2 + h + 0.12; }); await tween(0.5, (k) => medal.scale.setScalar(Math.max(0.001, ease(k)))); onInfo(L("Above the bronze and silver lines: that's a medal.", "Arriba de las líneas de bronce y plata: eso es medalla.")); },
          async () => { let okN = 0; for (const l of leaves) { await wait(0.25); const c = l.userData.fail ? C.red : l.userData.kind; l.material.color.setHex(c); l.material.emissive = new THREE.Color(c); l.material.emissiveIntensity = 0.3; if (!l.userData.fail) okN++; score.userData.set(L(`Replication score (example): ${okN}/${leaves.length}`, `Puntaje de réplica (ejemplo): ${okN}/${leaves.length}`)); } },
        ],
      };
    },

    horizon() {
      const LEN = ["1 min", "4 min", "15 min", "1 h", "4 h", "16 h", L("1 wk", "1 sem")];
      const pillars = LEN.map((s, i) => {
        const g = new THREE.Group(); g.position.set(-1.15 + i * 0.5, -0.3, 0);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
        glass.position.y = 0.9;
        const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 24), std(0x8a7dff, { emissive: 0x8a7dff, emissiveIntensity: 0.25 }));
        fill.scale.y = 0.001; fill.position.y = 0;
        const base = box(0.4, 0.08, 0.4, 0xffffff); base.position.y = 0.02;
        const tag = track(label(s, { h: 0.13 })); tag.position.set(0, -0.15, 0.3);
        g.add(glass, fill, base, tag);
        g.userData.fill = fill; g.userData.rate = 0;
        glass.userData.click = () => onInfo(L(`${s} tasks: ${Math.round(g.userData.rate * 100)}% success`, `Tareas de ${s}: ${Math.round(g.userData.rate * 100)}% de éxito`));
        clickables.push(glass);
        world.add(g); return g;
      });
      const half = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.01, 0.7), new THREE.MeshBasicMaterial({ color: 0x8a7dff, transparent: true, opacity: 0.25, depthWrite: false }));
      half.position.set(0.35, 0.6, 0);
      const ht = track(label(L("50% success", "50% de éxito"), { h: 0.14, dot: "#8a7dff" })); ht.position.set(2.15, 0.75, 0.2);
      const marker = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 10, 40), std(0x1c2b33)); marker.rotation.x = Math.PI / 2; marker.visible = false;
      const mt = track(label("", { h: 0.15, bg: "#1c2b33", fg: "#ffffff" })); mt.visible = false;
      world.add(half, ht, marker, mt);
      const rates = (c) => LEN.map((_, i) => 1 / (1 + Math.exp((i / 6 - c) * 9)));
      const fillTo = (c, dur) => { const to = rates(c); const from = pillars.map((p) => p.userData.rate); return tween(dur, (k) => pillars.forEach((p, i) => { const r = from[i] + (to[i] - from[i]) * ease(k); p.userData.rate = r; p.userData.fill.scale.y = Math.max(0.001, r * 1.8); p.userData.fill.position.y = (r * 1.8) / 2; })); };
      const mark = (c, text) => { const x = -1.15 + c * 6 * 0.5; marker.position.set(x, 0.6, 0); marker.visible = true; mt.userData.set(text); mt.position.set(x, 1.85, 0.2); mt.visible = true; };
      return {
        reset() { pillars.forEach((p) => { p.userData.rate = 0; p.userData.fill.scale.y = 0.001; }); marker.visible = false; mt.visible = false; },
        focus: [[0.2, 0.8, 0, 0.1], [0.2, 0.8, 0, 0.1], [0.35, 0.8, 0, -0.12]],
        moods: ["think", "think", "happy"],
        steps: [
          async () => { onInfo(L("Each tube is a task length, timed on skilled people.", "Cada tubo es una duración de tarea, cronometrada con personas expertas.")); },
          async () => { await fillTo(0.38, 1.4); mark(0.38, L("horizon ≈ 15 min–1 h", "horizonte ≈ 15 min–1 h")); },
          async () => { await fillTo(0.38, 0); mark(0.38, L("older model", "modelo anterior")); await wait(0.6); await fillTo(0.6, 1.6); mark(0.6, L("newer model: the 50% line moves right", "modelo nuevo: el 50% se recorre a la derecha")); },
        ],
      };
    },
  };

  const lab = labs[id]();
  scene.updateMatrixWorld(true);

  // ---- steps ----
  let current = -1, gen = 0;
  async function setStep(i) {
    const my = ++gen;
    clearTweens();
    lab.reset();
    lab.after?.();
    const instant = reduced;
    for (let j = 0; j < i; j++) { const saved = reduced; reduced = true; await lab.steps[j](); reduced = saved; }
    if (my !== gen) return;
    current = i;
    const f = lab.focus[i];
    cam.goal.set(f[0], f[1], f[2]); cam.yawGoal = f[3];
    mood = lab.moods[i];
    paintScreen(u.screenTex, i === 2 ? "ok" : i === 1 ? "test" : "pulse", 0);
    onStep(i);
    if (!instant) await lab.steps[i]();
    else { reduced = true; await lab.steps[i](); reduced = instant; }
  }
  async function play() {
    for (let i = 0; i < lab.steps.length; i++) {
      const my = gen + 1;
      await setStep(i);
      if (gen !== my) return;
      if (id === "arc" && i === 1) { await wait(1.2); if (gen !== my) return; }
      await wait(1.2);
      if (gen !== my) return;
    }
  }

  // ---- input: drag to turn, tap to inspect ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null, dragged = false;
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(clickables, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.click) o = o.parent; if (o) return o; }
    const a = ray.intersectObject(agent, true)[0];
    return a ? agent : null;
  };
  agent.userData.click = () => { mood = "happy"; onInfo(L("Agentztein runs the benchmark with Muse Spark as its brain.", "Agentztein corre el benchmark con Muse Spark como cerebro.")); setTimeout(() => { mood = lab.moods[Math.max(0, current)]; }, 1200); };
  canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, yaw: cam.yawGoal }; dragged = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (down) {
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 4) dragged = true;
      cam.yawGoal = THREE.MathUtils.clamp(down.yaw - dx * 0.006, -1.1, 1.1);
    } else if (e.pointerType === "mouse") canvas.style.cursor = pick(e) ? "pointer" : "grab";
  });
  canvas.addEventListener("pointerup", (e) => {
    if (down && !dragged) { const o = pick(e); if (o) o.userData.click(); }
    down = null;
  });
  canvas.addEventListener("pointercancel", () => { down = null; });

  // ---- size and loop ----
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    cam.dist = w / h < 1.2 ? 12 : 9.8;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  let raf = 0, last = performance.now(), t = 0;
  const v = new THREE.Vector3();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    for (const tw of [...tweens]) {
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { tweens.splice(tweens.indexOf(tw), 1); tw.res(); }
    }
    const kk = Math.min(1, dt * 3);
    cam.target.lerp(cam.goal, kk);
    cam.yaw += (cam.yawGoal - cam.yaw) * kk;
    const pitch = lab.pitch ?? 0.32;
    camera.position.set(cam.target.x + Math.sin(cam.yaw) * cam.dist * Math.cos(pitch), cam.target.y + Math.sin(pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cam.dist * Math.cos(pitch));
    camera.lookAt(cam.target);
    v.copy(camera.position).sub(agent.position);
    u.look.set(THREE.MathUtils.clamp(-0.4 + Math.sin(t * 0.7) * 0.15, -1, 1), 0.1);
    setArms(agent, mood === "happy" ? -2.4 + Math.sin(t * 6) * 0.15 : -0.14, mood === "happy" ? 2.4 - Math.sin(t * 6) * 0.15 : mood === "think" ? 1.1 : 0.14, 0, mood === "think" ? -0.3 : 0);
    pose(agent, mood, t, dt);
    bills.forEach((b) => { b.quaternion.copy(camera.quaternion); });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    setStep,
    play,
    get step() { return current; },
    steps: lab.steps.length,
    dispose() {
      gen++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      lab.dispose?.();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => { mm.map?.dispose?.(); mm.dispose?.(); }); });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
