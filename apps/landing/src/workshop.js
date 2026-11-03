/* The central workshop: every tool the agent can reach for, as a station you can walk up to and use.
   Wall stations (terminal, code editor, browser, Hacker News radar) and a bench row along the south wall
   (exam runner, skill library, harness, voice, image). Each one has a small animation when you interact.
   room.js passes in its helpers so this file stays about the tools themselves. Local coordinates = the hall's. */

import { buildEngine } from "./engine.js";

export function buildWorkshop(g, H) {
  const { THREE, box, glossy, std, plane, sign, anim, canvasTex, rr, FONT, tr, makeChip, SKILLS, sound, relabels } = H;
  const exhibits = [], updates = [];
  const place = (o, x, y, z) => { o.position.set(x, y, z); return o; };

  /** A station: a group placed on the floor, turned so its front (+z) faces `ry`, with a floating name sign. */
  function station(key, x, z, ry, color, label, build, { solid = 0.75, stand }) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; g.add(grp);
    const built = build(grp);
    const lab = sign(() => label, color, 1.55, { billboard: true, room: "taller" }); lab.position.set(0, 2.3, 0.1); grp.add(lab);
    relabels.push(() => lab.material.map.userData.redraw());
    const sx = x + Math.sin(ry) * stand, sz = z + Math.cos(ry) * stand;
    exhibits.push({ key, at: [x, z], stand: [sx, sz], solid, hits: built.hits, act: built.act });
    if (built.update) updates.push(built.update);
    return grp;
  }
  /** A desk with a live screen. draw(c, W, H, state) repaints it. */
  function desk(grp, draw, color) {
    grp.add(place(box(1.5, 0.8, 0.65, 0xffffff), 0, 0.4, 0));
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 10), std(0xc9d2dc)); stalk.position.set(0, 1.0, -0.1); grp.add(stalk);
    const tex = canvasTex(512, 320, (c, W, Hh) => draw(c, W, Hh, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.875), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(0, 1.62, -0.05);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.98, 0.06), std(0x1c2b33)); frame.position.set(0, 1.62, -0.1);
    grp.add(frame, scr);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.04), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 })); edge.position.set(0, 1.12, -0.06); grp.add(edge);
    const paint = (s) => { const { g: c, c: cv } = tex.userData; draw(c, cv.width, cv.height, s); tex.needsUpdate = true; };
    relabels.push(() => paint(state.s));
    const state = { s: 0 };
    return { paint, hits: [scr, frame, grp.children[0]], state };
  }
  const font = (c, w, px, mono) => { c.font = `${w} ${px}px ${mono ? "ui-monospace, monospace" : FONT}`; };

  // 1. Terminal: types commands, reads what the machine answers
  {
    const LINES = [["$ ls", "#e6edf3"], ["tests/  src/  Makefile", "#9fb3c2"], ["$ make test", "#e6edf3"], ["FAILED  3 of 12", "#ff9b87"], ["$ patch -p1 < fix.diff", "#e6edf3"], ["PASS  12 of 12", "#7ee2a8"]];
    let d;
    const draw = (c, W, Hh, n) => { c.fillStyle = "#0f1d26"; c.fillRect(0, 0, W, Hh); font(c, 600, 24, true); LINES.slice(0, Math.max(1, n)).forEach(([s, col], i) => { c.fillStyle = col; c.fillText(s, 24, 50 + i * 40); }); c.fillStyle = "#e6edf3"; c.fillRect(24 + Math.min(1, n) * 0, 50 + Math.max(1, n) * 40 - 24, 14, 28); };
    station("terminal", -5.15, -1.6, Math.PI / 2, 0x2ec4b6, { en: "Terminal", es: "Terminal" }, (grp) => {
      d = desk(grp, draw, 0x2ec4b6); d.state.s = 1; d.paint(1);
      return { hits: d.hits, act: () => { sound.sfx("chirps"); for (let i = 1; i <= LINES.length; i++) anim(0.01, () => { d.state.s = i; d.paint(i); }, i * 0.5); } };
    }, { stand: 1.7 });
  }
  // 2. Code editor: reads a file, changes a line
  {
    const draw = (c, W, Hh, n) => {
      c.fillStyle = "#13222c"; c.fillRect(0, 0, W, Hh); c.fillStyle = "#1e3342"; c.fillRect(0, 0, W, 38); font(c, 700, 20); c.fillStyle = "#9fb3c2"; c.fillText("zone.ts", 18, 26);
      const code = [["export function toUTC(d, zone) {", "#8fc2ff"], ["  const off = offsetOf(zone)", "#cfe3f5"], ["  return new Date(d - off)", n ? "#7ee2a8" : "#ff9b87"], ["}", "#8fc2ff"]];
      font(c, 600, 22, true); code.forEach(([s, col], i) => { if (i === 2 && n) { c.fillStyle = "rgba(60,207,110,.18)"; c.fillRect(0, 56 + i * 44, W, 40); } c.fillStyle = col; c.fillText(s, 24, 86 + i * 44); });
      font(c, 700, 20); c.fillStyle = n ? "#7ee2a8" : "#ff9b87"; c.fillText(n ? tr({ en: "✓ tests pass", es: "✓ las pruebas pasan" }) : tr({ en: "✗ 3 tests fail", es: "✗ 3 pruebas fallan" }), 24, 290);
    };
    station("editor", -5.15, 1.6, Math.PI / 2, 0x5b9bff, { en: "Code editor", es: "Editor de código" }, (grp) => {
      const d = desk(grp, draw, 0x5b9bff);
      return { hits: d.hits, act: () => { sound.sfx("chirps"); d.state.s = 0; d.paint(0); anim(0.01, () => { sound.sfx("interact"); d.state.s = 1; d.paint(1); }, 1.4); } };
    }, { stand: 1.7 });
  }
  // 3. Web browser: searches, opens a result
  {
    const draw = (c, W, Hh, n) => {
      c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, Hh); c.fillStyle = "#eef2f6"; c.fillRect(0, 0, W, 50); c.fillStyle = "#fff"; rr(c, 16, 9, W - 32, 32, 16); c.fill();
      font(c, 600, 18); c.fillStyle = "#4b5f6d"; c.fillText(n ? "browse.example/1987-paper" : tr({ en: "search: workshop 3 authors 1990s", es: "buscar: taller 3 autores años 90" }), 32, 31);
      for (let i = 0; i < 4; i++) { const hi = n && i === 1; c.fillStyle = hi ? "#e3f7ea" : "#f6f8fa"; rr(c, 20, 66 + i * 58, W - 40, 48, 10); c.fill(); c.fillStyle = hi ? "#18794e" : "#1c2b33"; font(c, 700, 20); c.fillText(["Workshop proceedings", "Paper: three authors, 1987", "Archive index", "Forum thread"][i], 36, 98 + i * 58); }
      if (n) { c.fillStyle = "#3ccf6e"; c.beginPath(); c.arc(W - 50, 124, 14, 0, 7); c.fill(); }
    };
    station("browser", 5.15, -1.6, -Math.PI / 2, 0x3ccf6e, { en: "Web browser", es: "Navegador web" }, (grp) => {
      const d = desk(grp, draw, 0x3ccf6e);
      return { hits: d.hits, act: () => { sound.sfx("chirps"); d.state.s = 0; d.paint(0); anim(0.01, () => { sound.sfx("pickup"); d.state.s = 1; d.paint(1); }, 1.3); } };
    }, { stand: 1.7 });
  }
  // 4. Hacker News radar: a dish that sweeps and a front page
  {
    let dish, rows;
    station("radar", 5.15, 1.6, -Math.PI / 2, 0xff6600, { en: "Hacker News radar", es: "Radar de Hacker News" }, (grp) => {
      grp.add(place(box(1.5, 0.8, 0.65, 0xffffff), 0, 0.4, 0));
      const board = plane(1.4, 0.9, 512, (c, W, Hh) => {
        c.fillStyle = "#f6f6ef"; c.fillRect(0, 0, W, Hh); c.fillStyle = "#ff6600"; c.fillRect(0, 0, W, 60); c.fillStyle = "#fff"; c.fillRect(14, 12, 36, 36); c.fillStyle = "#ff6600"; font(c, 800, 30); c.fillText("Y", 23, 42);
        c.fillStyle = "#fff"; font(c, 800, 28); c.fillText("Hacker News", 64, 42);
        ["Agents that improve themselves", "Show HN: tiny lab for benchmarks", "Why sealed exams beat boards"].forEach((s, i) => { c.fillStyle = "#828282"; font(c, 600, 20); c.fillText(`${i + 1}.`, 16, 106 + i * 56); c.fillStyle = "#1c2b33"; font(c, 700, 22); c.fillText(s, 46, 104 + i * 56); });
      }, { basic: true });
      board.position.set(0, 1.55, -0.05); grp.add(board);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 10), std(0xc9d2dc)); post.position.set(0, 2.25, -0.1); grp.add(post);
      dish = new THREE.Group(); dish.position.set(0, 2.5, -0.1);
      dish.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), glossy(0xff6600, { side: THREE.DoubleSide })));
      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), std(0x1c2b33)); feed.position.y = 0.15; dish.add(feed);
      dish.children[0].rotation.x = Math.PI - 0.5; grp.add(dish);
      rows = { boost: 0 };
      return { hits: [board, grp.children[0]], act: () => { sound.sfx("chirps"); rows.boost = 3; }, update: (t, dt) => { rows.boost = Math.max(0, rows.boost - dt); dish.rotation.y = t * (0.6 + rows.boost * 5); } };
    }, { stand: 1.7 });
  }
  // south row: five benches facing north
  const Z = -4.2, face = 0; // the bench row stands against the back wall, facing the door
  // 5. Exam runner: three tubes that go from red to green
  {
    let tubes, ok;
    station("exams", -4.5, Z, face, 0x0081fb, { en: "Exam runner", es: "Ejecutor de exámenes" }, (grp) => {
      const bench = box(1.7, 0.8, 0.7, 0xffffff); bench.position.y = 0.4; grp.add(bench);
      tubes = [-0.5, 0, 0.5].map((x) => {
        const t = new THREE.Group(); t.position.set(x, 1.15, 0);
        t.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 6, 14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false })));
        const liq = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.34, 6, 14), new THREE.MeshStandardMaterial({ color: 0xf0533c, emissive: 0xf0533c, emissiveIntensity: 0.5 })); liq.position.y = -0.06; t.add(liq); t.userData.liq = liq; grp.add(t); return t;
      });
      const board = plane(1.5, 0.45, 512, (c, W, Hh) => { c.fillStyle = "#13222c"; rr(c, 0, 0, W, Hh, 24); c.fill(); c.fillStyle = "#9fb3c2"; font(c, 700, 26); c.fillText(tr({ en: "practice · validation · sealed", es: "práctica · validación · sellado" }), 26, 56); c.fillStyle = "#7ee2a8"; font(c, 800, 30); c.fillText(tr({ en: "answers · time · cost", es: "respuestas · tiempo · costo" }), 26, 104); });
      board.position.set(0, 1.95, -0.2); grp.add(board); relabels.push(() => board.material.map.userData.redraw());
      return { hits: [bench, ...tubes.map((t) => t.children[0])], act: () => { sound.sfx("chirps"); tubes.forEach((t) => { t.userData.liq.material.color.setHex(0xf0533c); t.userData.liq.material.emissive.setHex(0xf0533c); }); tubes.forEach((t, i) => anim(0.01, () => { sound.sfx("interact", { rate: 1 + i * 0.15 }); t.userData.liq.material.color.setHex(0x22b864); t.userData.liq.material.emissive.setHex(0x22b864); }, 0.5 + i * 0.5)); } };
    }, { stand: 1.7, solid: 0.9 });
    void ok;
  }
  // 6. Skill library: a case of skill chips; the one you use lifts out
  {
    let chips;
    station("skills", -2.25, Z, face, 0x6d5ce8, { en: "Skill library", es: "Biblioteca de habilidades" }, (grp) => {
      const cab = box(1.6, 1.7, 0.5, 0xf1e6d6); cab.position.y = 0.85; grp.add(cab);
      chips = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const ch = makeChip(SKILLS[(r * 3 + c) % SKILLS.length], { label: false }); ch.scale.setScalar(0.3); ch.position.set(-0.45 + c * 0.45, 0.4 + r * 0.5, 0.28); ch.userData.home = ch.position.clone(); grp.add(ch); chips.push(ch);
      }
      return { hits: [cab, ...chips], act: () => { sound.sfx("chip"); const ch = chips[Math.floor(Math.random() * chips.length)]; anim(0.5, (k) => { ch.position.z = 0.28 + k * 0.6; ch.position.y = ch.userData.home.y + k * 0.25; ch.rotation.y = k * 6; ch.scale.setScalar(0.3 + k * 0.25); }); anim(0.6, (k) => { ch.position.z = 0.88 - k * 0.6; ch.position.y = ch.userData.home.y + 0.25 - k * 0.25; ch.scale.setScalar(0.55 - k * 0.25); ch.rotation.y = 0; }, 1.8); } };
    }, { stand: 1.6, solid: 0.9 });
  }
  // 7. Harness: a little dome that goes red when something is blocked
  {
    let dome, ring, state = { red: 0 };
    station("harness", 0, Z, face, 0x22b864, { en: "Harness", es: "Arnés" }, (grp) => {
      const ped = box(1.1, 0.8, 0.8, 0xffffff); ped.position.y = 0.4; grp.add(ped);
      const mat = new THREE.MeshPhysicalMaterial({ color: 0x3ccf6e, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false, emissive: 0x3ccf6e, emissiveIntensity: 0.4 });
      dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat); dome.position.y = 0.82; grp.add(dome);
      ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 40), new THREE.MeshStandardMaterial({ color: 0x3ccf6e, emissive: 0x3ccf6e, emissiveIntensity: 0.8 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.83; grp.add(ring);
      const core = makeChip(SKILLS[0], { label: false }); core.scale.setScalar(0.28); core.position.y = 1.0; grp.add(core);
      return { hits: [ped, dome], act: () => { state.red = 1; sound.sfx("shieldhit"); anim(0.01, () => sound.sfx("alarm"), 0.3); anim(0.01, () => { state.red = 0; sound.sfx("shield"); }, 2.6); }, update: (t, dt) => { const c = state.red ? 0xd6513f : 0x3ccf6e; mat.color.setHex(c); mat.emissive.setHex(c); ring.material.color.setHex(c); ring.material.emissive.setHex(c); mat.emissiveIntensity = state.red ? 0.5 + Math.sin(t * 5) * 0.15 : 0.4 + Math.sin(t * 2) * 0.08; void dt; } };
    }, { stand: 1.6, solid: 0.85 });
  }
  // 8. Voice: a microphone and its waves
  {
    let waves, ph = { k: 0 };
    station("voice", 2.25, Z, face, 0x3ccf6e, { en: "Muse Voice", es: "Voz de Muse" }, (grp) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 24), glossy(0xffffff)); base.position.y = 0.05; grp.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 10), std(0xc9d2dc)); pole.position.y = 0.65; grp.add(pole);
      const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.28, 8, 16), glossy(0x1c2b33)); mic.position.y = 1.5; grp.add(mic);
      const grill = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc9d2dc, wireframe: true })); grill.position.y = 1.62; grp.add(grill);
      waves = [0, 1, 2].map(() => { const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 40), new THREE.MeshBasicMaterial({ color: 0x3ccf6e, transparent: true, opacity: 0, toneMapped: false })); w.position.y = 1.55; grp.add(w); return w; });
      return { hits: [mic, pole, base], act: () => { ph.k = 2.4; sound.sfx("interact"); }, update: (t, dt) => { ph.k = Math.max(0, ph.k - dt); waves.forEach((w, i) => { const k = ((t * 0.9 + i / 3) % 1); const on = ph.k > 0 ? 1 : 0; w.scale.setScalar(1 + k * 3.2); w.material.opacity = on * 0.8 * (1 - k); }); } };
    }, { stand: 1.5, solid: 0.5 });
  }
  // 9. Image: an easel where it paints the emblem of a skill
  {
    let tex, seed = 1;
    const draw = (c, W, Hh) => {
      c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, Hh);
      const cols = ["#5b9bff", "#ff8f70", "#3ccf6e", "#8a7dff", "#ffb020"]; const col = cols[seed % cols.length], col2 = cols[(seed + 2) % cols.length];
      c.fillStyle = col2 + "33"; c.beginPath(); c.arc(W / 2, Hh / 2, 150, 0, 7); c.fill();
      c.fillStyle = col; c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + seed; c.lineTo(W / 2 + Math.cos(a) * 110, Hh / 2 + Math.sin(a) * 110); } c.closePath(); c.fill();
      c.strokeStyle = "#1c2b33"; c.lineWidth = 8; c.lineCap = "round"; c.beginPath(); c.moveTo(W / 2 - 50, Hh / 2 + 10); c.lineTo(W / 2 - 10, Hh / 2 + 50); c.lineTo(W / 2 + 60, Hh / 2 - 40); c.stroke();
    };
    station("image", 4.5, Z, face, 0xff8f70, { en: "Muse Image", es: "Imagen de Muse" }, (grp) => {
      tex = canvasTex(384, 384, draw);
      const canvasM = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); canvasM.position.set(0, 1.45, 0.05); grp.add(canvasM);
      grp.add(place(new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.22, 0.05), std(0xe8d9b5)), 0, 1.45, 0));
      [[-0.5, 1], [0.5, 1], [0, -1]].forEach(([x, dir]) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8), std(0x8a5a2b)); leg.position.set(x * 0.9, 0.9, dir > 0 ? 0.0 : -0.5); leg.rotation.x = dir > 0 ? 0 : 0.25; grp.add(leg); });
      return { hits: [canvasM], act: () => { sound.sfx("chirps"); anim(0.01, () => { seed += 1; const { g: c, c: cv } = tex.userData; draw(c, cv.width, cv.height); tex.needsUpdate = true; sound.sfx("pickup"); }, 1.0); } };
    }, { stand: 1.5, solid: 0.7 });
  }

  // 10. The engine: the agent's anatomy on a circuit board (engine.js), one exhibit per part.
  {
    const E = buildEngine(g, H);
    exhibits.push(...E.exhibits);
    updates.push(E.update);
  }

  return { exhibits, update: (t, dt) => updates.forEach((f) => f(t, dt)) };
}
