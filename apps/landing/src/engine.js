/* The engine in the middle of the workshop: Agentztein's anatomy laid out on a dark circuit board.
   Six parts, wired to the brain by glowing traces where light pulses travel:
     brain    the Muse model that reasons (its effort level comes from the cradle's kiosk)
     prompt   what it reads on every call, layer by layer (the executor prompt in api/_lib/agent.js)
     tools    one cube per station of this workshop: blue ones run in the app today, orange ones are goals
     loop     the improvement cycle: measure, propose, validate, verdict
     memory   one disc per benchmark room, lit only when that skill is really installed in this visit
     harness  its limits: monthly budget, a cap per answer and a person's approval
   Each part is an exhibit of its own: walk up to it (or look at it) and the guide card explains it;
   interact and it shows what it does. Local coordinates = the workshop's. */

const TOP = 0.54; // the board's surface

export function buildEngine(g, H) {
  const { THREE, canvasTex, rr, FONT, tr, sound, anim, relabels } = H;
  const exhibits = [], updates = [];
  const eng = new THREE.Group(); eng.position.set(0, 0, 0.5); g.add(eng);
  const OZ = 0.5; // eng's offset inside the workshop
  let installedNow = new Set(), lastKey = "";
  const flash = { brain: 0, prompt: 0, tools: 0, loop: 0, memory: 0, harness: 0 };
  const boost = { prompt: 0, tools: 0, loop: 0, memory: 0, harness: 0 };
  const mono = (c, w, px) => { c.font = `${w} ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`; };
  const glow = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.35, metalness: 0.1 });
  const ROOM_IDS = ["swe", "terminal", "arc", "web", "research", "horizon"];
  const ROOM_COL = [0x5b9bff, 0x2ec4b6, 0xff8f70, 0x3ccf6e, 0xff6600, 0x8a7dff];

  // a soft round glow, used for pulses and for the light pooled under each part
  const haloTex = canvasTex(128, 128, (c, W) => {
    const gr = c.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gr; c.fillRect(0, 0, W, W);
  });
  const add = (color, opacity) => ({ map: haloTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pool = (x, z, color, size, opacity = 0.55) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial(add(color, opacity)));
    m.rotation.x = -Math.PI / 2; m.position.set(x, TOP + 0.004, z); m.renderOrder = 2; eng.add(m); return m;
  };

  /* ---------- the board ---------- */
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.5, TOP - 0.1, 2.9), new THREE.MeshStandardMaterial({ color: 0x0c1525, roughness: 0.5, metalness: 0.3 }));
  plinth.position.y = (TOP - 0.1) / 2; plinth.castShadow = true; plinth.receiveShadow = true; eng.add(plinth);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 3.0), new THREE.MeshStandardMaterial({ color: 0x0a1322, roughness: 0.45, metalness: 0.3 }));
  slab.position.y = TOP - 0.05; slab.receiveShadow = true; eng.add(slab);
  const boardTex = canvasTex(2048, 1336, (c, W, Hh) => {
    const bg = c.createLinearGradient(0, 0, W, Hh); bg.addColorStop(0, "#0b1628"); bg.addColorStop(1, "#08101d");
    c.fillStyle = bg; c.fillRect(0, 0, W, Hh);
    c.strokeStyle = "rgba(60,110,190,.10)"; c.lineWidth = 2;
    for (let x = 0; x < W; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, Hh); c.stroke(); }
    for (let y = 0; y < Hh; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    // faint printed traces with vias, like a real board (seeded so it never changes)
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    c.lineCap = "round"; c.lineJoin = "round";
    for (let i = 0; i < 90; i++) {
      let x = Math.round(rnd() * W / 32) * 32, y = Math.round(rnd() * Hh / 32) * 32;
      c.strokeStyle = rnd() > 0.8 ? "rgba(90,160,255,.30)" : "rgba(60,120,210,.18)"; c.lineWidth = rnd() > 0.7 ? 5 : 3;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 3; k++) { const len = 64 + rnd() * 260; const dir = Math.floor(rnd() * 4); if (dir === 0) x += len; else if (dir === 1) x -= len; else if (dir === 2) y += len; else y -= len; c.lineTo(x, y); if (rnd() > 0.5) { x += len * 0.4; y += (rnd() > 0.5 ? 1 : -1) * len * 0.4; c.lineTo(x, y); } }
      c.stroke();
      c.fillStyle = "rgba(110,170,255,.35)"; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
    }
    c.setLineDash([22, 16]); c.strokeStyle = "rgba(140,190,255,.45)"; c.lineWidth = 4; rr(c, 30, 30, W - 60, Hh - 60, 26); c.stroke(); c.setLineDash([]);
    mono(c, 700, 30); c.fillStyle = "rgba(140,190,255,.55)"; c.fillText("AGENTZTEIN · ANATOMY v1", 64, Hh - 56);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.0), new THREE.MeshStandardMaterial({ map: boardTex, emissiveMap: boardTex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.2 }));
  face.rotation.x = -Math.PI / 2; face.position.y = TOP + 0.001; face.receiveShadow = true; eng.add(face);
  // a glowing rim around the board
  const rimMat = glow(0x3a9bff, 1.4);
  [[4.6, 0.03, 0, -1.5], [4.6, 0.03, 0, 1.5], [0.03, 3.0, -2.3, 0], [0.03, 3.0, 2.3, 0]].forEach(([w, d, x, z]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), rimMat); b.position.set(x, TOP - 0.01, z); eng.add(b); });

  /* ---------- small labels printed on the board, in front of each part ---------- */
  const tags = [];
  function tag(text, color, x, z, w = 1.05) {
    const draw = (c, W, Hh) => {
      c.clearRect(0, 0, W, Hh);
      c.fillStyle = "rgba(6,12,24,.92)"; rr(c, 2, 2, W - 4, Hh - 4, 14); c.fill();
      c.strokeStyle = "#" + color.toString(16).padStart(6, "0"); c.globalAlpha = 0.65; c.lineWidth = 3; rr(c, 2, 2, W - 4, Hh - 4, 14); c.stroke(); c.globalAlpha = 1;
      const [a, b] = text();
      c.fillStyle = "#" + color.toString(16).padStart(6, "0"); mono(c, 800, 34); c.textBaseline = "middle"; c.fillText(a, 22, Hh / 2 + 2);
      const aw = c.measureText(a).width;
      c.fillStyle = "#c8d6ea"; mono(c, 600, 30); c.fillText(b, 22 + aw + 18, Hh / 2 + 2);
    };
    const t = canvasTex(640, 84, draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 84 / 640), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false }));
    m.rotation.x = -Math.PI / 2 + 0.6; m.position.set(x, TOP + 0.08, z); m.renderOrder = 4; eng.add(m);
    const redraw = () => { draw(t.userData.g, t.userData.c.width, t.userData.c.height); t.needsUpdate = true; };
    relabels.push(redraw); tags.push(redraw);
    return redraw;
  }

  /* ---------- traces: from the brain to each part, with pulses of light ---------- */
  const hit = (w, h, d, x, z, y = TOP + h / 2) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y, z); eng.add(m); return m; };
  const BR = new THREE.Vector3(0, TOP + 0.014, -0.25);
  const traces = {};
  function trace(key, to, color, out) {
    const a = BR.clone().add(new THREE.Vector3(out[0], 0, out[1]));
    const d = new THREE.Vector3(to[0], TOP + 0.014, to[1]);
    const mid1 = a.clone().add(new THREE.Vector3((d.x - a.x) * 0.45, 0, (d.z - a.z) * 0.1));
    const mid2 = d.clone().add(new THREE.Vector3((a.x - d.x) * 0.2, 0, (a.z - d.z) * 0.6));
    const curve = new THREE.CatmullRomCurve3([a, mid1, mid2, d], false, "centripetal");
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.011, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.04, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    eng.add(core, halo);
    const pulses = [0, 1, 2].map((i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial(add(color, 0.95))); s.scale.setScalar(0.17); s.userData.o = i / 3; s.renderOrder = 5; eng.add(s); return s; });
    traces[key] = { curve, pulses, halo, ph: 0 };
  }

  /* ---------- 1. the brain: a chip with the model's name ---------- */
  let brainTop, fan, brainPool, effortNow = "";
  {
    const x = 0, z = -0.25;
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.9), new THREE.MeshPhysicalMaterial({ color: 0x2b2275, roughness: 0.35, metalness: 0.4, clearcoat: 0.8 }));
    chip.position.set(x, TOP + 0.1, z); chip.castShadow = true; eng.add(chip);
    const sub = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 1.02), new THREE.MeshStandardMaterial({ color: 0x141a3a, roughness: 0.5 })); sub.position.set(x, TOP + 0.02, z); eng.add(sub);
    const pinM = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.9, roughness: 0.25, emissive: 0x6b4a10, emissiveIntensity: 0.4 });
    for (let side = 0; side < 4; side++) for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.11), pinM); const off = -0.4 + i * 0.1;
      if (side < 2) { p.position.set(x + off, TOP + 0.03, z + (side ? 0.56 : -0.56)); } else { p.rotation.y = Math.PI / 2; p.position.set(x + (side === 2 ? 0.56 : -0.56), TOP + 0.03, z + off); }
      eng.add(p);
    }
    const drawTop = (c, W, Hh) => {
      const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, "#3a2d9c"); gr.addColorStop(1, "#21195e");
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 10; c.beginPath(); c.arc(W / 2, Hh * 0.4, W * 0.27, 0, 7); c.stroke();
      c.fillStyle = "#ffffff"; c.textAlign = "center"; c.font = `800 74px ${FONT}`; c.fillText("Muse Spark", W / 2, Hh * 0.83);
      mono(c, 700, 34); c.fillStyle = "#b9b0ff"; c.fillText(tr({ en: `effort · ${effortNow}`, es: `esfuerzo · ${effortNow}` }), W / 2, Hh * 0.93); c.textAlign = "left";
    };
    const topTex = canvasTex(512, 512, drawTop);
    brainTop = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), new THREE.MeshStandardMaterial({ map: topTex, emissiveMap: topTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.35 }));
    brainTop.rotation.x = -Math.PI / 2; brainTop.position.set(x, TOP + 0.181, z); eng.add(brainTop);
    brainTop.userData.redraw = () => { drawTop(topTex.userData.g, 512, 512); topTex.needsUpdate = true; };
    relabels.push(() => brainTop.userData.redraw());
    // the fan inside the ring: eight blades that turn faster when it thinks
    const fanTex = canvasTex(256, 256, (c, W) => {
      c.translate(W / 2, W / 2);
      for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillStyle = i % 2 ? "#d9d3ff" : "#ffffff"; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(W * 0.2, -W * 0.08, W * 0.42, -W * 0.03); c.lineTo(W * 0.42, W * 0.05); c.quadraticCurveTo(W * 0.2, W * 0.02, 0, 0); c.fill(); }
      c.fillStyle = "#ffffff"; c.beginPath(); c.arc(0, 0, W * 0.07, 0, 7); c.fill();
    });
    fan = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshBasicMaterial({ map: fanTex, transparent: true, toneMapped: false, depthWrite: false }));
    fan.rotation.x = -Math.PI / 2; fan.position.set(x, TOP + 0.186, z - 0.084); fan.renderOrder = 3; eng.add(fan);
    brainPool = pool(x, z, 0x7a5cff, 2.0, 0.6);
    tag(() => [tr({ en: "BRAIN", es: "CEREBRO" }), "Muse Spark"], 0xa99bff, x, z + 0.68, 0.95);
    exhibits.push({ key: "brain", at: [x, z + OZ], stand: [0, -1.95 + OZ], solid: 0.35, hits: [chip, brainTop, hit(1.0, 0.3, 1.0, x, z)], act: () => fullRun() });
  }

  /* ---------- 2. the prompt: six layers, read bottom to top on every call ---------- */
  let layers = [], skillSlices = [], beam;
  {
    const x = -1.6, z = -0.75;
    const LAYER = [
      [0x8a7dff, 0.085], [0x5b9bff, 0.085], [0x2ec4b6, 0.085], [null, 0.13], [0xffb020, 0.085], [0xff5d8f, 0.06],
    ];
    const grp = new THREE.Group(); grp.position.set(x, TOP, z); eng.add(grp);
    let y = 0.02;
    LAYER.forEach(([col, h]) => {
      if (col === null) {
        // the active skills layer: one slice per benchmark room, lit only when that skill is installed
        const holder = new THREE.Group(); holder.position.y = y; holder.userData.base = y; grp.add(holder); layers.push(holder);
        for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.58, h / 6 - 0.002, 0.58), glow(0x2a3546, 0.05)); m.position.y = h / 12 + (i * h) / 6; holder.add(m); skillSlices.push(m); }
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, h - 0.012, 0.6), glow(col, 0.55)); m.position.y = y + h / 2; m.userData.base = y + h / 2; m.castShadow = true; grp.add(m); layers.push(m);
      }
      y += h + 0.012;
    });
    const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7, y + 0.06, 0.7)), new THREE.LineBasicMaterial({ color: 0x9ccaff, transparent: true, opacity: 0.6 }));
    shell.position.y = (y + 0.06) / 2; grp.add(shell);
    beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ce4ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    beam.position.set(0.36, 0.8, 0.36); grp.add(beam);
    pool(x, z, 0x4fb3ff, 1.5, 0.5);
    tag(() => [tr({ en: "PROMPT", es: "PROMPT" }), tr({ en: `6 layers · ${installedNow.size} skills`, es: `6 capas · ${installedNow.size} hab.` })], 0x6fc2ff, x, z + 0.55, 0.95);
    trace("prompt", [x + 0.38, z], 0x4fb3ff, [-0.46, -0.2]);
    exhibits.push({ key: "prompt", at: [x, z + OZ], stand: [-2.85, z + OZ], solid: 0.3, hits: [...layers.filter((l) => l.isMesh), hit(0.72, 0.8, 0.72, x, z)], act: () => { flash.prompt = 1; boost.prompt = 2; sound.sfx("chirps"); anim(0.6, (k) => spread(k)); anim(0.7, (k) => spread(1 - k), 1.8); } });
    function spread(k) { layers.forEach((l, i) => { l.position.y = l.userData.base + i * 0.07 * k; }); }
  }

  /* ---------- 3. the tools: one cube per station of this workshop ---------- */
  const cubes = [];
  {
    const x = 1.55, z = -0.75;
    // live in the app today: radar, exams, skill library, harness, voice, image. Goals: terminal, editor, browser
    const ORDER = [["radar", 1], ["exams", 1], ["skills", 1], ["harness", 1], ["voice", 1], ["image", 1], ["terminal", 0], ["editor", 0], ["browser", 0]];
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.95), new THREE.MeshStandardMaterial({ color: 0x101c30, roughness: 0.5 })); tray.position.set(x, TOP + 0.02, z); eng.add(tray);
    const trayRim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.95, 0.04, 0.95)), new THREE.LineBasicMaterial({ color: 0x39c6f4 })); trayRim.position.copy(tray.position); eng.add(trayRim);
    ORDER.forEach(([, live], i) => {
      const h = live ? 0.24 : 0.15, col = live ? 0x39c6f4 : 0xff8a3d;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), glow(col, live ? 0.6 : 0.4));
      m.position.set(x - 0.29 + (i % 3) * 0.29, TOP + 0.04 + h / 2, z - 0.29 + Math.floor(i / 3) * 0.29); m.castShadow = true; m.userData.base = m.position.y; m.userData.live = live; eng.add(m); cubes.push(m);
    });
    pool(x, z, 0x39c6f4, 1.5, 0.5);
    tag(() => [tr({ en: "TOOLS", es: "HERRAMIENTAS" }), tr({ en: "6 live · 3 goals", es: "6 en vivo · 3 metas" })], 0x39c6f4, x, z + 0.62, 1.05);
    trace("tools", [x - 0.5, z], 0x39c6f4, [0.46, -0.2]);
    exhibits.push({ key: "tools", at: [x, z + OZ], stand: [2.85, z + OZ], solid: 0.3, hits: [tray, ...cubes, hit(0.95, 0.35, 0.95, x, z)], act: () => { flash.tools = 1; boost.tools = 2; sound.sfx("chip"); cubes.forEach((c, i) => anim(0.45, (k) => { c.position.y = c.userData.base + Math.sin(k * Math.PI) * 0.22; }, i * 0.08)); } });
  }

  /* ---------- 4. the loop: a gear with its four phases ---------- */
  let gear, phases = [];
  {
    const x = -1.6, z = 0.75;
    const shape = new THREE.Shape(); const N = 12, ro = 0.42, ri = 0.34;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / N * 0.18, a2 = a0 + (Math.PI * 2) / N * 0.32, a3 = a0 + (Math.PI * 2) / N * 0.68, a4 = a0 + (Math.PI * 2) / N * 0.82;
      const P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
      if (i === 0) shape.moveTo(...P(ri, a0)); else shape.lineTo(...P(ri, a0));
      shape.lineTo(...P(ri, a1)); shape.lineTo(...P(ro, a2)); shape.lineTo(...P(ro, a3)); shape.lineTo(...P(ri, a4));
    }
    shape.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.2, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2);
    gear = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x2fd38a, emissive: 0x1fa86a, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.3, clearcoat: 0.6 }));
    gear.position.set(x, TOP + 0.03, z); gear.castShadow = true; eng.add(gear);
    const hubTex = canvasTex(256, 256, (c, W) => { c.fillStyle = "#0b1b17"; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, 7); c.fill(); c.fillStyle = "#7ff5c3"; c.textAlign = "center"; c.font = `800 120px ${FONT}`; c.fillText("4", W / 2, W * 0.6); mono(c, 700, 30); c.fillText(tr({ en: "PHASES", es: "FASES" }), W / 2, W * 0.8); });
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshBasicMaterial({ map: hubTex, toneMapped: false }));
    hub.rotation.x = -Math.PI / 2; hub.position.set(x, TOP + 0.14, z); eng.add(hub);
    relabels.push(() => { const { g: c } = hubTex.userData; c.clearRect(0, 0, 256, 256); c.fillStyle = "#0b1b17"; c.beginPath(); c.arc(128, 128, 128, 0, 7); c.fill(); c.fillStyle = "#7ff5c3"; c.textAlign = "center"; c.font = `800 120px ${FONT}`; c.fillText("4", 128, 154); mono(c, 700, 30); c.fillText(tr({ en: "PHASES", es: "FASES" }), 128, 205); hubTex.needsUpdate = true; });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.012, 8, 72), new THREE.MeshBasicMaterial({ color: 0x5cf2b0, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.set(x, TOP + 0.02, z); eng.add(ring);
    // measure · propose · validate · verdict
    [0x5b9bff, 0xffb020, 0x2ec4b6, 0xff5d8f].forEach((col, i) => {
      const a = -Math.PI / 2 + (i / 4) * Math.PI * 2; const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      m.position.set(x + Math.cos(a) * 0.56, TOP + 0.05, z + Math.sin(a) * 0.56); eng.add(m);
      const h = new THREE.Sprite(new THREE.SpriteMaterial(add(col, 0.8))); h.scale.setScalar(0.3); h.position.copy(m.position); eng.add(h); phases.push({ m, h });
    });
    pool(x, z, 0x3cf0a0, 1.7, 0.55);
    tag(() => [tr({ en: "LOOP", es: "CICLO" }), tr({ en: "measure→propose→validate→verdict", es: "mide→propone→valida→veredicto" })], 0x5cf2b0, x + 0.1, z + 0.73, 1.35);
    trace("loop", [x + 0.48, z - 0.05], 0x3cf0a0, [-0.46, 0.2]);
    exhibits.push({ key: "loop", at: [x, z + OZ], stand: [-2.85, z + OZ], solid: 0.35, hits: [gear, hub, hit(1.0, 0.25, 1.0, x, z)], act: () => { flash.loop = 1; boost.loop = 2.6; sound.sfx("interact"); } });
  }

  /* ---------- 5. memory: one disc per benchmark room ---------- */
  let discs = [], memRings = [];
  {
    const x = 1.65, z = 0.75;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.72, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set(x, TOP + 0.38, z); eng.add(glass);
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.075, 40), glow(0x2a3546, 0.05)); d.position.set(x, TOP + 0.07 + i * 0.105, z); d.userData.base = d.position.y; d.castShadow = true; eng.add(d); discs.push(d); }
    [0.03, 0.74].forEach((yy) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.016, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffc23d, toneMapped: false })); r.rotation.x = Math.PI / 2; r.position.set(x, TOP + yy, z); eng.add(r); memRings.push(r); });
    pool(x, z, 0xffb020, 1.5, 0.55);
    tag(() => [tr({ en: "MEMORY", es: "MEMORIA" }), tr({ en: `${installedNow.size}/6 skills`, es: `${installedNow.size}/6 habilidades` })], 0xffc23d, x - 0.05, z + 0.55, 1.0);
    trace("memory", [x - 0.36, z], 0xffc23d, [0.46, 0.2]);
    exhibits.push({ key: "memory", at: [x, z + OZ], stand: [2.85, z + OZ], solid: 0.3, hits: [glass, ...discs, hit(0.7, 0.8, 0.7, x, z)], act: () => { flash.memory = 1; boost.memory = 2; sound.sfx("pickup"); discs.forEach((d, i) => anim(0.5, (k) => { d.position.y = d.userData.base + Math.sin(k * Math.PI) * 0.06; d.rotation.y = k * Math.PI; }, i * 0.1)); } });
  }

  /* ---------- 6. the harness: three gates and the risk lights ---------- */
  let gates = [], leds = [];
  {
    const x = 0, z = 1.0;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.5), new THREE.MeshStandardMaterial({ color: 0x35101f, roughness: 0.45, metalness: 0.2 }));
    base.position.set(x, TOP + 0.035, z); base.castShadow = true; eng.add(base);
    // budget · cap per answer · a person's approval
    [-0.5, 0, 0.5].forEach((dx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.2), glow(0xff6f9c, 0.45)); m.position.set(x + dx, TOP + 0.15, z - 0.08); m.castShadow = true; eng.add(m); gates.push(m); });
    // risk lights: low (green), medium (amber), high (red)
    const RISK = [0x3ccf6e, 0x3ccf6e, 0x3ccf6e, 0x3ccf6e, 0xffc23d, 0xffc23d, 0xffc23d, 0xffc23d, 0xff4d5e, 0xff4d5e, 0xff4d5e, 0xff4d5e];
    RISK.forEach((col, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.05, 0.07), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); m.position.set(x - 0.66 + i * 0.12, TOP + 0.095, z + 0.15); m.userData.col = new THREE.Color(col); eng.add(m); leds.push(m); });
    pool(x, z, 0xff5d8f, 1.6, 0.45);
    tag(() => [tr({ en: "HARNESS", es: "ARNÉS" }), tr({ en: "US$5/mo · 6k tk · approval", es: "US$5/mes · 6k tk · aprobación" })], 0xff7aa8, x, z + 0.42, 1.3);
    trace("harness", [x, z - 0.27], 0xff5d8f, [0, 0.46]);
    exhibits.push({ key: "limits", at: [x, z + OZ], stand: [0, 2.0 + OZ], solid: 0.3, hits: [base, ...gates, hit(1.6, 0.3, 0.5, x, z)], act: () => { flash.harness = 1; boost.harness = 2; sound.sfx("shield"); gates.forEach((m, i) => anim(0.01, () => { m.userData.hot = 1; sound.sfx("interact", { rate: 1 + i * 0.15 }); }, 0.3 + i * 0.45)); } });
  }

  // the whole board blocks walking, as one rectangle
  exhibits[0].rect = [-2.3, -1.5 + OZ, 2.3, 1.5 + OZ];

  /* One full turn of the engine: what happens on a real call, part by part. */
  function fullRun() {
    flash.brain = 1; sound.sfx("engine", { gain: 0.6 });
    ["prompt", "tools", "loop", "harness", "memory"].forEach((k, i) => anim(0.01, () => { boost[k] = 1.6; flash[k] = 1; sound.sfx("interact", { gain: 0.6, rate: 0.9 + i * 0.1 }); }, 0.4 + i * 0.6));
    anim(0.01, () => sound.sfx("success", { gain: 0.6 }), 3.6);
  }

  /* ---------- live state and animation ---------- */
  const tmpC = new THREE.Color(), OFF = new THREE.Color(0x24324a);
  updates.push((t, dt) => {
    const inst = H.getInstalled ? H.getInstalled() : new Set();
    const effort = H.getEffort ? H.getEffort() : "medium";
    const key = [...inst].sort().join(",") + "|" + effort;
    if (key !== lastKey) {
      lastKey = key; installedNow = inst; effortNow = effort;
      brainTop.userData.redraw(); tags.forEach((f) => f());
      // a skill not installed yet keeps its room's color, dim; installed, it lights up
      ROOM_IDS.forEach((id, i) => {
        const on = inst.has(id);
        tmpC.setHex(ROOM_COL[i]); if (!on) tmpC.lerp(OFF, 0.8);
        [skillSlices[i], discs[i]].forEach((m) => { m.material.color.copy(tmpC); m.material.emissive.setHex(ROOM_COL[i]); m.material.emissiveIntensity = on ? 0.9 : 0.08; });
      });
    }
    for (const k in flash) flash[k] = Math.max(0, flash[k] - dt * 0.8);
    for (const k in boost) boost[k] = Math.max(0, boost[k] - dt);
    // pulses travel out of the brain; a part being used gets more, faster
    for (const [k, tr_] of Object.entries(traces)) {
      tr_.ph += dt * (0.22 + boost[k] * 0.55);
      tr_.pulses.forEach((s) => { const u = (tr_.ph + s.userData.o) % 1; s.position.copy(tr_.curve.getPointAt(u)); s.position.y += 0.02; s.material.opacity = Math.sin(u * Math.PI) * (0.7 + Math.min(1, boost[k]) * 0.3); s.scale.setScalar(0.15 + Math.min(1, boost[k]) * 0.08); });
      tr_.halo.material.opacity = 0.16 + Math.min(1, boost[k]) * 0.3 + Math.sin(t * 2 + tr_.ph) * 0.03;
    }
    // brain: the fan turns; it glows with each skill and when it thinks
    fan.rotation.z -= dt * (0.8 + flash.brain * 7 + boost.loop * 0.5);
    brainTop.material.emissiveIntensity = 0.5 + flash.brain * 0.6 + Math.sin(t * 2.2) * 0.05;
    brainPool.material.opacity = 0.5 + flash.brain * 0.4 + Math.sin(t * 1.6) * 0.08;
    // prompt beam shimmer
    beam.material.opacity = 0.35 + Math.sin(t * 3) * 0.12 + flash.prompt * 0.4;
    layers.forEach((l) => { if (l.isMesh) l.material.emissiveIntensity = 0.55 + flash.prompt * 0.6; });
    // tools: live ones breathe
    cubes.forEach((c, i) => { c.material.emissiveIntensity = (c.userData.live ? 0.55 : 0.35) + Math.max(0, Math.sin(t * 2 - i * 0.6)) * 0.25 + flash.tools * 0.6; });
    // loop: the gear turns and the four phases light up one after another
    gear.rotation.y -= dt * (0.35 + boost.loop * 2.2);
    const cur = Math.floor(t / (boost.loop > 0 ? 0.35 : 1.4)) % 4;
    phases.forEach((p, i) => { const on = i === cur; p.h.material.opacity = on ? 0.95 : 0.15; p.m.scale.setScalar(on ? 1.35 : 1); });
    gear.material.emissiveIntensity = 0.5 + flash.loop * 0.6;
    // memory: rings shimmer, lit discs pulse
    memRings.forEach((r, i) => { tmpC.setHex(0xffc23d).multiplyScalar(0.8 + Math.sin(t * 3 + i * 2) * 0.2 + flash.memory * 0.6); r.material.color.copy(tmpC); });
    discs.forEach((d, i) => { if (installedNow.has(ROOM_IDS[i])) d.material.emissiveIntensity = 0.75 + Math.sin(t * 2.5 + i) * 0.2 + flash.memory * 0.5; });
    // harness: a light runs across the risk strip; the gates glow as a call goes through them
    const sweep = (t * (1.2 + boost.harness * 3)) % 1.6;
    leds.forEach((m, i) => { const k = Math.max(0, 1 - Math.abs(sweep * 9 - i) / 2); tmpC.copy(m.userData.col).multiplyScalar(0.45 + k * 0.9); m.material.color.copy(tmpC); });
    gates.forEach((m) => { m.userData.hot = Math.max(0, (m.userData.hot ?? 0) - dt * 0.8); m.material.emissiveIntensity = 0.4 + m.userData.hot * 1.1; });
  });

  return { exhibits, update: (t, dt) => updates.forEach((f) => f(t, dt)) };
}
