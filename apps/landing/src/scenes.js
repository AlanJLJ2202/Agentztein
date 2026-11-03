/* Themed lab scenes, drawn as SVG so they scale to any width without cropping. One per step of the cycle
   ("how it builds itself") and one per benchmark. They are illustrations of how things work, never results.
   Motion: CSS classes defined in index.html (paused by prefers-reduced-motion) and a few SMIL animations
   that details.js freezes on their final frame when motion is reduced. */

import { sourcesSvg } from "./sources.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const INK = "#1c2b33", MUTED = "#4b5f6d", OK = "#18794e", OKBG = "#ddf3e6", BAD = "#c42d12", BADBG = "#fde6e1", AMBER = "#c98a00", AMBERBG = "#ffefcf", VIOLET = "#6d5ce8";

/** text helper */
function t(x, y, s, o = {}) {
  const { size = 13, weight = 600, fill = INK, anchor = "start", cls = "", delay } = o;
  const st = delay != null ? ` style="animation-delay:${delay}s"` : "";
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${cls ? ` class="${cls}"` : ""}${st}>${esc(s)}</text>`;
}
const rect = (x, y, w, h, fill, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 10}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 2}"` : ""}${o.cls ? ` class="${o.cls}"` : ""}${o.delay != null ? ` style="animation-delay:${o.delay}s"` : ""}/>`;
const d = (s) => ` style="animation-delay:${s}s"`;

/** The room every scene happens in: back wall with a soft grid, a floor and a plaque with the lab's name. */
function room(name, color, body, label) {
  return `<svg viewBox="0 0 640 400" class="lab-svg" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="g-${color.slice(1)}" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#e3eaf1" stroke-width="1"/></pattern>
    <linearGradient id="fl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e9eff5"/><stop offset="1" stop-color="#dfe7ef"/></linearGradient>
  </defs>
  <rect width="640" height="400" fill="#f7fafc"/>
  <rect width="640" height="330" fill="url(#g-${color.slice(1)})"/>
  <rect y="330" width="640" height="70" fill="url(#fl)"/>
  <line x1="0" x2="640" y1="330" y2="330" stroke="#d3dde7" stroke-width="2"/>
  <g transform="translate(18 16)"><rect width="${Math.max(150, name.length * 8.4 + 40)}" height="30" rx="15" fill="#fff" stroke="#e1e7ed"/><circle cx="16" cy="15" r="5" fill="${color}"/>${t(28, 20, name, { size: 13, weight: 700 })}</g>
  ${body}
</svg>`;
}

/* ---------- Small props ---------- */
function flask(x, y, color, { broken = false, label = "", delay = 0 } = {}) {
  const liquid = broken ? BAD : color;
  const bubbles = broken
    ? `<g class="a-smoke"${d(delay)}><circle cx="${x}" cy="${y - 62}" r="7" fill="#c6d0d9"/><circle cx="${x + 8}" cy="${y - 74}" r="5" fill="#d6dee5"/></g>`
    : [0, 1, 2].map((i) => `<circle class="a-rise" cx="${x - 6 + i * 6}" cy="${y - 12}" r="2.5" fill="#fff"${d(delay + i * 0.5)}/>`).join("");
  const crack = broken ? `<path d="M${x - 4} ${y - 40} l5 8 -4 6 6 9" stroke="${BAD}" stroke-width="2" fill="none"/>` : "";
  return `<g>
    <path d="M${x - 9} ${y - 52} v18 l-15 26 a8 8 0 0 0 7 12 h34 a8 8 0 0 0 7 -12 l-15 -26 v-18 z" fill="#ffffff" stroke="#b9c6d2" stroke-width="2"/>
    <path d="M${x - 19} ${y - 18} l-5 8 a8 8 0 0 0 7 12 h34 a8 8 0 0 0 7 -12 l-5 -8 z" fill="${liquid}" opacity=".85"/>
    <rect x="${x - 11}" y="${y - 58}" width="22" height="7" rx="3" fill="#b9c6d2"/>
    ${crack}${bubbles}
    ${label ? t(x, y + 18, label, { size: 11, weight: 700, fill: broken ? BAD : MUTED, anchor: "middle" }) : ""}
  </g>`;
}
function chip(x, y, text, color, o = {}) {
  const w = o.w ?? Math.max(110, text.length * 7.4 + 34);
  return `<g transform="translate(${x} ${y})"><g class="${o.cls ?? ""}"${o.delay != null ? d(o.delay) : ""}>
    <rect width="${w}" height="34" rx="10" fill="${o.fill ?? "#fff"}" stroke="${color}" stroke-width="2.5"/>
    <circle cx="16" cy="17" r="5" fill="${color}"/>
    ${t(28, 22, text, { size: 12.5, weight: 700, fill: o.ink ?? INK })}
  </g></g>`;
}
const check = (x, y, ok = true, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><circle r="10" fill="${ok ? OK : BAD}"/>${ok ? '<path d="M-4.5 0 l3 3 6 -6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>' : '<path d="M-4 -4 l8 8 M4 -4 l-8 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'}</g>`;
const table = (x, w) => `<rect x="${x}" y="300" width="${w}" height="12" rx="4" fill="#cfd9e3"/><rect x="${x + 12}" y="312" width="8" height="30" fill="#c2cdd8"/><rect x="${x + w - 20}" y="312" width="8" height="30" fill="#c2cdd8"/>`;

/* ================= The cycle ================= */

function measureBench(L) {
  // 40 answers of a practice exam: 26 right, 14 wrong (an illustration, not a result)
  const wrong = new Set([2, 5, 9, 11, 14, 17, 18, 22, 25, 29, 31, 34, 36, 39]);
  let cells = "";
  for (let i = 0; i < 40; i++) {
    const x = (i % 8) * 34, y = Math.floor(i / 8) * 34;
    const bad = wrong.has(i);
    cells += `<g class="a-pop"${d(0.04 * i)}>${rect(x, y, 28, 28, bad ? BADBG : OKBG, { r: 7 })}${bad ? `<path d="M${x + 9} ${y + 9} l10 10 M${x + 19} ${y + 9} l-10 10" stroke="${BAD}" stroke-width="2.5" stroke-linecap="round"/>` : `<path d="M${x + 7} ${y + 15} l6 6 10 -12" stroke="${OK}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`}</g>`;
  }
  let body = `<g transform="translate(34 66)"><rect x="-10" y="-8" width="292" height="248" rx="16" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>
    ${t(6, 12, L("Practice exam: 40 answers", "Examen de práctica: 40 respuestas"), { size: 13, weight: 800 })}
    <g transform="translate(6 28)">${cells}</g></g>`;
  body += `<g transform="translate(350 66)">
    ${rect(0, 0, 250, 124, "#fff", { r: 16, stroke: "#e1e7ed" })}
    ${t(18, 28, L("Baseline (starting point)", "Línea base (punto de partida)"), { size: 12.5, weight: 800, fill: VIOLET })}
    ${t(18, 82, "26 / 40", { size: 44, weight: 800 })}
    ${t(18, 106, L("correct, with the skills it has today", "correctas, con las habilidades que tiene hoy"), { size: 11.5, weight: 600, fill: MUTED })}
  </g>`;
  body += chip(350, 206, L("Time: 3 min 10 s", "Tiempo: 3 min 10 s"), "#9aa8b5", { cls: "a-pop", delay: 1.4, w: 250 });
  body += chip(350, 248, L("Cost: $0.04 of your budget", "Costo: $0.04 de tu presupuesto"), AMBER, { cls: "a-pop", delay: 1.8, w: 250 });
  body += chip(350, 290, L("Active skills used: 1", "Habilidades activas usadas: 1"), VIOLET, { cls: "a-pop", delay: 2.2, w: 250, fill: "#f6f3ff" });
  return room(L("Measuring bench", "Banco de medición"), VIOLET, body,
    L("Measuring bench: a practice exam of 40 answers, 26 marked correct in green and 14 wrong in red. A card shows the baseline, 26 of 40, plus the time it took, its cost and the number of active skills it used. This is an illustration, not a result.", "Banco de medición: un examen de práctica de 40 respuestas, 26 marcadas como correctas en verde y 14 como incorrectas en rojo. Una tarjeta muestra la línea base, 26 de 40, además del tiempo que tardó, su costo y cuántas habilidades activas usó. Es una ilustración, no un resultado."));
}

function researchDesk(L) {
  const rows = [
    ["Tree search for game-playing agents", L("Experiment", "Experimentar"), VIOLET, "#efeaff"],
    ["New open model tops a leaderboard", L("Watch", "Vigilar"), AMBER, AMBERBG],
    ["Prompt tricks that 10x everything", L("Skip", "Descartar"), "#7d8a96", "#eef2f6"],
    ["Sandboxes for terminal agents", L("Experiment", "Experimentar"), VIOLET, "#efeaff"],
  ];
  let body = `<g transform="translate(30 60)"><rect width="370" height="250" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>
    <line x1="2" x2="368" y1="40" y2="40" stroke="#e6ebf0" stroke-width="2"/>
    ${sourcesSvg(14, 11, 18, 7)}
    ${t(96, 26, L("Trending in AI", "Lo más comentado en IA"), { size: 14, weight: 800 })}
    ${rows.map(([h, v, c, bg], i) => `<g transform="translate(12 ${54 + i * 48})">
      ${rect(0, 0, 346, 40, "#f6f6ef", { r: 8 })}${t(12, 25, `${i + 1}. ${h}`, { size: 12, weight: 700 })}
      <g transform="translate(262 6)"><g class="a-stamp"${d(0.6 + i * 0.7)}>${rect(0, 0, 78, 28, bg, { r: 14, stroke: c, sw: 1.5 })}${t(39, 19, v, { size: 10.5, weight: 800, fill: c, anchor: "middle" })}</g></g>
    </g>`).join("")}
  </g>`;
  body += `<g transform="translate(500 110)">
    <path d="M0 -40 V60 M-60 -20 H60" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <g class="a-tilt">
      <path d="M-60 -20 l-22 40 h44 z M60 -20 l-22 40 h44 z" fill="none" stroke="#9aa8b5" stroke-width="2"/>
      ${rect(-86, 20, 52, 30, OKBG, { r: 8 })}${t(-60, 40, L("gain", "gana"), { size: 11.5, weight: 800, fill: OK, anchor: "middle" })}
      ${rect(34, 20, 52, 30, AMBERBG, { r: 8 })}${t(60, 40, L("cost", "cuesta"), { size: 11.5, weight: 800, fill: AMBER, anchor: "middle" })}
    </g>
    ${rect(-30, 60, 60, 10, "#cfd9e3", { r: 4 })}
    ${t(0, 100, L("Trade-off", "Trade-off"), { size: 13, weight: 800, anchor: "middle" })}
    ${t(0, 118, L("tokens · time · interference", "tokens · tiempo · interferencia"), { size: 11, weight: 600, fill: MUTED, anchor: "middle" })}
  </g>`;
  body += `<path class="a-flow" d="M402 120 C 440 120, 430 250, 470 268" fill="none" stroke="${VIOLET}" stroke-width="2.5" stroke-dasharray="6 6"/>`;
  body += chip(470, 252, L("→ to the lab", "→ al laboratorio"), VIOLET, { cls: "a-pop", delay: 3.4, fill: "#f6f3ff", w: 150 });
  return room(L("Research desk", "Mesa de investigación"), "#ff6600", body,
    L("Research desk: a feed of four AI headlines from the tech community, each stamped with a verdict (experiment, watch or skip). A balance weighs gain against cost, and the ideas worth an experiment go to the lab.", "Mesa de investigación: un feed con cuatro titulares de IA de la comunidad tech, cada uno sellado con un veredicto (experimentar, vigilar o descartar). Una balanza pesa ganancia contra costo y las ideas que valen un experimento van al laboratorio."));
}

function failureLab(L) {
  const runs = [
    [70, "#3ccf6e", false, L("run 9", "corrida 9")],
    [130, BAD, true, L("run 14", "corrida 14")],
    [190, BAD, true, L("run 15", "corrida 15")],
    [250, "#5b9bff", false, L("run 18", "corrida 18")],
    [310, BAD, true, L("run 21", "corrida 21")],
  ];
  const shelf = `<rect x="40" y="248" width="300" height="10" rx="4" fill="#cfd9e3"/><rect x="40" y="166" width="300" height="10" rx="4" fill="#cfd9e3"/>`;
  const top = [[80, "#ffb53d"], [140, "#8a7dff"], [200, "#2ec4b6"], [260, "#ff8f70"]].map(([x, c], i) => flask(x, 162, c, { delay: i * 0.4 })).join("");
  const bottom = runs.map(([x, c, b, l], i) => flask(x, 244, c, { broken: b, label: l, delay: 0.3 * i })).join("");
  const threads = [130, 190, 310].map((x, i) => `<path class="a-flow" d="M${x} 270 C ${x + 60} 300, 380 300, 410 214" fill="none" stroke="${BAD}" stroke-width="2" stroke-dasharray="5 6"${d(i * 0.2)}/>`).join("");
  const board = `<g transform="translate(392 70)">
    <rect width="220" height="168" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>
    <circle cx="110" cy="0" r="6" fill="${BAD}"/>
    ${t(16, 28, L("Pattern found", "Patrón encontrado"), { size: 12, weight: 800, fill: BAD })}
    ${t(16, 52, L("3 of 3 failures:", "3 de 3 fallas:"), { size: 13, weight: 700 })}
    ${t(16, 72, L("searched the web", "buscó en la web"), { size: 13, weight: 500, fill: MUTED })}
    ${t(16, 90, L("in a brand-new game", "en un juego nuevo"), { size: 13, weight: 500, fill: MUTED })}
    <line x1="16" x2="204" y1="108" y2="108" stroke="#eef2f6" stroke-width="2"/>
    ${t(16, 130, L("Hypothesis:", "Hipótesis:"), { size: 12, weight: 800, fill: VIOLET })}
    ${t(16, 150, L("explore before searching", "explorar antes de buscar"), { size: 13, weight: 600 })}
  </g>`;
  const born = chip(408, 268, L("New skill: explore first", "Nueva: primero explora"), VIOLET, { cls: "a-pop a-glow", delay: 1.2, fill: "#f6f3ff" });
  return room(L("Failure archive", "Archivo de fallas"), "#f0533c", shelf + top + bottom + threads + board + born + `<path d="M500 240 v22" stroke="${VIOLET}" stroke-width="2.5" marker-end="none"/><path d="M494 256 l6 8 6 -8" fill="none" stroke="${VIOLET}" stroke-width="2.5"/>`,
    L("Failure archive: a shelf of experiment flasks, three of them cracked and red (runs 14, 15 and 21). Threads join them to a board: all three searched the web in a brand-new game. From that pattern a new skill is born: explore first.", "Archivo de fallas: un estante de matraces, tres rotos y en rojo (corridas 14, 15 y 21). Hilos los unen a un pizarrón: las tres buscaron en la web en un juego nuevo. De ese patrón nace una habilidad nueva: primero explora."));
}

function testChamber(L) {
  const lanes = [[L("Current", "Actual"), "#9aa8b5", 118], [L("Candidate", "Candidata"), VIOLET, 198]];
  const cols = [L("New games", "Juegos nuevos"), L("Old: web research", "Viejas: búsqueda web")];
  const outcome = [
    [[false, false, true, false], [true, true, true, true]],
    [[true, true, true, false], [true, true, true, true]],
  ];
  let body = `<rect x="30" y="64" width="580" height="236" rx="18" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>`;
  body += t(190, 92, cols[0], { size: 12, weight: 800, fill: MUTED, anchor: "middle" }) + t(384, 92, cols[1], { size: 12, weight: 800, fill: MUTED, anchor: "middle" });
  body += `<line x1="287" x2="287" y1="80" y2="280" stroke="#eef2f6" stroke-width="2"/>`;
  lanes.forEach(([name, c, y], li) => {
    body += t(46, y + 5, name, { size: 13, weight: 800, fill: c === VIOLET ? VIOLET : MUTED });
    outcome[li].forEach((row, ci) => row.forEach((ok, i) => {
      const x = (ci ? 330 : 136) + i * 36;
      body += `<g class="a-pop"${d(0.3 + li * 0.25 + i * 0.18 + ci * 0.9)}>${rect(x - 13, y - 22, 26, 44, ok ? OKBG : BADBG, { r: 8 })}${check(x, y, ok, 0.9)}</g>`;
    }));
  });
  body += t(46, 262, L("Same tasks, never seen before", "Mismas tareas, nunca vistas"), { size: 12, weight: 600, fill: MUTED });
  body += `<g transform="translate(470 104)">
      ${t(0, 0, L("Result", "Resultado"), { size: 12, weight: 800, fill: MUTED })}
      ${t(0, 26, "1/4 → 3/4", { size: 18, weight: 800, fill: OK })}
      ${t(0, 44, L("new games", "juegos nuevos"), { size: 11.5, weight: 600, fill: MUTED })}
      ${t(0, 78, "4/4 = 4/4", { size: 18, weight: 800 })}
      ${t(0, 96, L("nothing broke", "nada se rompió"), { size: 11.5, weight: 600, fill: MUTED })}
      <rect y="112" width="120" height="8" rx="4" fill="#eef2f6"/><rect class="a-grow" y="112" width="84" height="8" rx="4" fill="${OK}"${d(2.2)}/>
      ${t(0, 138, L("range, not one number", "un rango, no un número"), { size: 11, weight: 600, fill: MUTED })}
    </g>`;
  body += `<g transform="translate(482 320)">${rect(-8, -22, 132, 44, "#1c2b33", { r: 12 })}<path d="M10 -6 v-5 a7 7 0 0 1 14 0 v5" stroke="#fff" stroke-width="2.4" fill="none"/>${rect(6, -6, 22, 16, "#fff", { r: 3 })}${t(38, 5, L("Sealed exam", "Examen sellado"), { size: 11.5, weight: 700, fill: "#fff" })}</g>`;
  body += `<path class="a-zap" d="M300 330 l-12 -22 h12 l-10 -20" stroke="#ffd25c" stroke-width="3" fill="none"/>`;
  return room(L("Test chamber", "Cámara de pruebas"), "#0081fb", body,
    L("Test chamber: the current version and the candidate skill solve the same unseen tasks. On new games the candidate goes from 1 of 4 to 3 of 4; on old web research tasks both get 4 of 4, so nothing broke. The final exam stays sealed.", "Cámara de pruebas: la versión actual y la habilidad candidata resuelven las mismas tareas nunca vistas. En juegos nuevos la candidata pasa de 1 de 4 a 3 de 4; en las viejas de búsqueda web ambas sacan 4 de 4, así que nada se rompió. El examen final sigue sellado."));
}

function sewingBench(L) {
  let body = table(60, 300);
  body += `<g transform="translate(110 150)">
    <rect width="200" height="120" rx="22" fill="#f6f3ff" stroke="${VIOLET}" stroke-width="3" class="a-glow"/>
    <circle cx="34" cy="34" r="10" fill="${VIOLET}"/>
    ${t(54, 40, L("Explore first", "Primero explora"), { size: 16, weight: 800 })}
    <path d="M18 70 h164" stroke="${VIOLET}" stroke-width="2" stroke-dasharray="7 6" class="a-flow"/>
    ${t(18, 98, L("a written skill · v1", "una habilidad escrita · v1"), { size: 12, weight: 600, fill: MUTED })}
  </g>
  <path d="M310 190 C 340 190, 345 150, 368 150" stroke="#9aa8b5" stroke-width="2" fill="none"/>`;
  body += `<g transform="translate(368 92) rotate(4)">
    <rect width="230" height="128" rx="12" fill="#fff" stroke="#d3dde7" stroke-width="2"/>
    <circle cx="16" cy="64" r="6" fill="#fff" stroke="#9aa8b5" stroke-width="2"/>
    ${t(34, 30, L("SCOPE", "ALCANCE"), { size: 11, weight: 800, fill: MUTED })}
    ${t(34, 50, L("new puzzle games only", "solo juegos nuevos"), { size: 13.5, weight: 700 })}
    ${t(34, 82, L("VALIDITY", "VIGENCIA"), { size: 11, weight: 800, fill: MUTED })}
    ${t(34, 102, L("tested with rules v1", "probada con reglas v1"), { size: 13.5, weight: 700 })}
  </g>`;
  body += `<g transform="translate(470 270) rotate(-8)"><g class="a-stamp"><rect x="-82" y="-22" width="164" height="44" rx="10" fill="none" stroke="${OK}" stroke-width="3"/>${t(0, 6, L("APPROVED BY A PERSON", "APROBADA POR UNA PERSONA"), { size: 11, weight: 800, fill: OK, anchor: "middle" })}</g></g>`;
  const lines = [L("10:02 candidate created", "10:02 candidata creada"), L("10:40 passed the lab", "10:40 pasó el laboratorio"), L("11:05 approved, sewn on", "11:05 aprobada, cosida")];
  body += `<g transform="translate(40 60)"><rect width="230" height="78" rx="10" fill="#1c2b33"/>${t(14, 20, L("Log · can't be edited", "Registro · no se edita"), { size: 11, weight: 800, fill: "#9fd3ff" })}${lines.map((s, i) => t(14, 40 + i * 15, s, { size: 11, weight: 500, fill: "#e6edf3", cls: "a-type", delay: 0.6 + i * 0.7 })).join("")}</g>`;
  return room(L("Sewing bench", "Mesa de costura"), "#22b864", body,
    L("Sewing bench: the skill 'Explore first' carries a tag with its scope (new puzzle games only) and its validity (tested with rules v1). A green stamp says approved by a person, and a log that can't be edited records every step.", "Mesa de costura: la habilidad «Primero explora» lleva una etiqueta con su alcance (solo juegos nuevos) y su vigencia (probada con reglas v1). Un sello verde dice aprobada por una persona y un registro que no se edita anota cada paso."));
}

function versionArchive(L) {
  const card = (x, v, net, hl) => `<g transform="translate(${x} 70)">
    <rect width="170" height="132" rx="14" fill="#fff" stroke="${hl ? AMBER : "#e1e7ed"}" stroke-width="2.5"/>
    ${t(16, 28, `Benchmark ${v}`, { size: 14, weight: 800 })}
    ${t(16, 56, L("Tasks", "Tareas"), { size: 12, weight: 600, fill: MUTED })}${t(154, 56, "300", { size: 12, weight: 700, anchor: "end" })}
    ${t(16, 80, L("Time limit", "Límite"), { size: 12, weight: 600, fill: MUTED })}${t(154, 80, "12 h", { size: 12, weight: 700, anchor: "end" })}
    ${hl ? rect(8, 90, 154, 26, AMBERBG, { r: 6, cls: "a-blink" }) : ""}
    ${t(16, 108, "Internet", { size: 12, weight: 600, fill: MUTED })}${t(154, 108, net, { size: 12, weight: 800, fill: hl ? AMBER : INK, anchor: "end" })}
  </g>`;
  let body = card(40, "v1", L("on", "sí"), false) + `<path d="M222 136 h44" stroke="${MUTED}" stroke-width="2.5"/><path d="M258 128 l9 8 -9 8" fill="none" stroke="${MUTED}" stroke-width="2.5"/>` + card(276, "v2", L("off", "no"), true);
  body += `<g transform="translate(474 70)"><rect width="140" height="132" rx="14" fill="#e9eff5"/>${[0, 1, 2].map((i) => rect(12, 14 + i * 38, 116, 30, "#fff", { r: 6 }) + `<circle cx="70" cy="${29 + i * 38}" r="3" fill="#9aa8b5"/>`).join("")}${t(70, 124, L("old versions kept", "versiones guardadas"), { size: 11, weight: 700, fill: MUTED, anchor: "middle" })}</g>`;
  body += chip(40, 236, L("Search the web · Review", "Buscar en web · Revisión"), AMBER, { cls: "a-pulse", fill: AMBERBG, w: 220 });
  body += chip(276, 236, L("Run tests first · intact", "Correr pruebas · intacta"), OK, { w: 178, fill: OKBG });
  body += chip(276, 280, L("Read the error · intact", "Leer el error · intacta"), OK, { w: 178, fill: OKBG });
  body += t(40, 300, L("Only skills whose scope covers", "Solo vuelven a revisión las que"), { size: 12, weight: 600, fill: MUTED }) + t(40, 316, L("the change go back to review.", "cubren el cambio."), { size: 12, weight: 600, fill: MUTED });
  return room(L("Version archive", "Archivo de versiones"), "#ffa928", body,
    L("Version archive: Benchmark v1 had internet on; v2 turns it off. Only the skill that searches the web goes back to review in amber; the code and terminal skills stay green and intact. Old versions are kept in drawers.", "Archivo de versiones: el Benchmark v1 tenía internet; el v2 lo apaga. Solo la habilidad que busca en la web vuelve a revisión en ámbar; las de código y terminal siguen verdes e intactas. Las versiones viejas se guardan en cajones."));
}

/* ================= Benchmarks ================= */

function sweLab(L) {
  const files = ["src/", "  dates/", "    parse.ts", "    zone.ts", "  api/", "tests/"];
  let body = `<g transform="translate(30 64)"><rect width="150" height="190" rx="12" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>${t(14, 24, "repo @ 3f2c1a", { size: 11.5, weight: 800, fill: MUTED })}${files.map((f, i) => (i === 3 ? rect(8, 38 + i * 24, 134, 22, "#e9f2ff", { r: 6 }) : "") + t(16, 54 + i * 24, f, { size: 12, weight: i === 3 ? 800 : 500, fill: i === 3 ? "#0064e0" : INK })).join("")}</g>`;
  body += `<g transform="translate(196 64)"><rect width="200" height="64" rx="12" fill="${BADBG}"/>${t(14, 24, L("Issue #4127", "Issue #4127"), { size: 11.5, weight: 800, fill: BAD })}${t(14, 46, L("Dates shift a day in UTC", "Las fechas se corren un día"), { size: 12.5, weight: 700 })}</g>`;
  const diff = [["-", "return local(d)", BAD], ["+", "return toUTC(d, zone)", OK], ["+", "if (!zone) zone = 'UTC'", OK]];
  body += `<g transform="translate(196 140)"><rect width="200" height="114" rx="12" fill="#1c2b33"/>${t(14, 22, "zone.ts", { size: 11, weight: 800, fill: "#9fd3ff" })}${diff.map(([s, code, c], i) => t(14, 48 + i * 22, `${s} ${code}`, { size: 11.5, weight: 600, fill: c === OK ? "#7ee2a8" : "#ff9b87", cls: "a-type", delay: 0.4 + i * 0.6 })).join("")}</g>`;
  const f2p = [0, 1, 2], p2p = [0, 1, 2, 3, 4, 5];
  body += `<g transform="translate(414 64)"><rect width="200" height="190" rx="12" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>
    ${t(14, 24, L("Hidden tests", "Pruebas ocultas"), { size: 11.5, weight: 800, fill: MUTED })}
    ${t(14, 50, "FAIL → PASS", { size: 12, weight: 800 })}
    ${f2p.map((i) => `<g transform="translate(${26 + i * 34} 74)"><circle r="11" fill="${BAD}"/><circle r="11" fill="${OK}" class="a-fadein"${d(2.2 + i * 0.3)}/></g>`).join("")}
    ${t(14, 118, "PASS → PASS", { size: 12, weight: 800 })}
    ${p2p.map((i) => `<circle cx="${26 + i * 30}" cy="142" r="10" fill="${OK}"/>`).join("")}
    ${t(14, 176, L("a fix must not break others", "arreglar sin romper lo demás"), { size: 11, weight: 600, fill: MUTED })}
  </g>`;
  body += `<g transform="translate(504 300) rotate(-6)"><g class="a-stamp"><rect x="-64" y="-20" width="128" height="40" rx="10" fill="#fff" stroke="${OK}" stroke-width="3"/>${t(0, 6, L("RESOLVED", "RESUELTO"), { size: 14, weight: 800, fill: OK, anchor: "middle" })}</g></g>`;
  body += t(30, 300, L("Real repo, real issue, a patch, then tests decide.", "Repo real, issue real, un parche y las pruebas deciden."), { size: 12.5, weight: 600, fill: MUTED });
  return room("SWE-bench Pro", "#5b9bff", body, L("SWE-bench Pro lab: a real repository at a fixed commit, an issue saying dates shift a day in UTC, a patch to zone.ts, and hidden tests: three failing tests must turn green and six passing tests must stay green. Then it counts as resolved.", "Laboratorio de SWE-bench Pro: un repositorio real en un commit fijo, un issue que dice que las fechas se corren un día en UTC, un parche a zone.ts y pruebas ocultas: tres que fallaban deben pasar y seis que pasaban deben seguir pasando. Entonces cuenta como resuelto."));
}

function terminalLab(L) {
  const lines = [
    ["$ make", "#e6edf3"], ["fatal: openssl/ssl.h: No such file", "#ff9b87"], ["$ apt-get install -y libssl-dev", "#e6edf3"],
    ["$ make && ./server --port 8080", "#e6edf3"], ["listening on :8080", "#7ee2a8"], ["$ bash tests.sh", "#e6edf3"], ["PASS 5/5 checks", "#7ee2a8"],
  ];
  let body = `<g transform="translate(40 58)"><rect width="430" height="250" rx="16" fill="none" stroke="#2ec4b6" stroke-width="3" stroke-dasharray="10 8"/>${t(16, -8, L("Isolated container", "Contenedor aislado"), { size: 12, weight: 800, fill: "#1a8f84" })}
    <rect x="18" y="18" width="394" height="214" rx="12" fill="#1c2b33"/>
    <circle cx="36" cy="34" r="5" fill="#ff6b5b"/><circle cx="52" cy="34" r="5" fill="#ffc94a"/><circle cx="68" cy="34" r="5" fill="#3ccf6e"/>
    ${lines.map(([s, c], i) => t(34, 66 + i * 23, s, { size: 12.5, weight: 600, fill: c, cls: "a-type", delay: 0.3 + i * 0.75 })).join("")}
    <rect class="a-blink" x="34" y="${66 + 7 * 23 - 12}" width="9" height="15" fill="#e6edf3"/>
  </g>`;
  body += `<g transform="translate(494 70)"><rect width="122" height="96" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>${t(14, 26, L("Instruction", "Instrucción"), { size: 11.5, weight: 800, fill: MUTED })}${t(14, 50, L("Build and", "Compila y"), { size: 12.5, weight: 700 })}${t(14, 68, L("serve on", "sirve en"), { size: 12.5, weight: 700 })}${t(14, 86, ":8080", { size: 12.5, weight: 700 })}</g>`;
  body += `<g transform="translate(555 232)"><circle r="38" fill="#fff" stroke="#e1e7ed" stroke-width="2"/><circle r="30" fill="none" stroke="#eef2f6" stroke-width="6"/><circle r="30" fill="none" stroke="#2ec4b6" stroke-width="6" stroke-dasharray="188" stroke-dashoffset="188" transform="rotate(-90)" class="a-timer"/>${t(0, 5, L("limit", "límite"), { size: 11, weight: 800, fill: MUTED, anchor: "middle" })}</g>`;
  return room("Terminal-Bench", "#2ec4b6", body, L("Terminal-Bench lab: inside an isolated container the agent gets an instruction (build and serve on port 8080). It runs make, reads a missing-library error, installs it, builds, starts the server and a test script confirms 5 of 5 checks, all against a time limit.", "Laboratorio de Terminal-Bench: dentro de un contenedor aislado el agente recibe una instrucción (compila y sirve en el puerto 8080). Corre make, lee el error de una librería faltante, la instala, compila, levanta el servidor y un script de pruebas confirma 5 de 5, todo contra un límite de tiempo."));
}

function arcLab(L) {
  const N = 8, S = 30, ox = 40, oy = 62;
  const walls = new Set(["2,1", "2,2", "2,3", "5,4", "5,5", "5,6", "1,5", "3,6"]);
  let grid = "";
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const w = walls.has(`${x},${y}`);
    grid += `<rect x="${ox + x * S}" y="${oy + y * S}" width="${S - 3}" height="${S - 3}" rx="5" fill="${w ? "#4b5f6d" : "#eef2f6"}"/>`;
  }
  const goal = `<rect x="${ox + 7 * S}" y="${oy + 7 * S}" width="${S - 3}" height="${S - 3}" rx="5" fill="#3ccf6e" class="a-blink"/>`;
  const key = `<rect x="${ox + 6 * S + 6}" y="${oy + 1 * S + 6}" width="${S - 15}" height="${S - 15}" rx="3" fill="#ffd25c"/>`;
  const path = [[0, 0], [1, 0], [3, 0], [4, 0], [6, 0], [6, 1], [6, 3], [7, 4], [7, 7]];
  const pts = path.map(([x, y]) => `${x * S},${y * S}`).join(";");
  const agent = `<g transform="translate(${ox} ${oy})"><rect width="${S - 3}" height="${S - 3}" rx="6" fill="#ff8f70" stroke="#c4553a" stroke-width="2"><animateTransform attributeName="transform" type="translate" values="${pts}" dur="7s" repeatCount="indefinite" calcMode="discrete"/></rect></g>`;
  let body = `<rect x="${ox - 10}" y="${oy - 10}" width="${N * S + 17}" height="${N * S + 17}" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>` + grid + goal + key + agent;
  body += `<g transform="translate(330 64)">
    ${t(0, 14, L("No instructions. Discover:", "Sin instrucciones. Descubre:"), { size: 13, weight: 800 })}
    ${[L("what you control", "qué controlas"), L("the rules", "las reglas"), L("the goal", "la meta")].map((s, i) => `<g class="a-fadein"${d(0.6 + i * 0.8)}>${check(10, 40 + i * 26, true, 0.75)}${t(28, 45 + i * 26, s, { size: 13, weight: 600 })}</g>`).join("")}
    <rect y="124" width="280" height="96" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>
    ${t(16, 150, L("Actions: agent 14 · human 12", "Acciones: agente 14 · humano 12"), { size: 12.5, weight: 700 })}
    ${t(16, 178, L("Level score = (12 / 14)² ≈ 0.73", "Puntaje del nivel = (12 / 14)² ≈ 0.73"), { size: 13, weight: 800, fill: "#c4553a" })}
    ${t(16, 204, L("fewer actions, higher score", "menos acciones, más puntaje"), { size: 11.5, weight: 600, fill: MUTED })}
    ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${12 + i * 22}" cy="248" r="8" fill="${i < 2 ? "#ff8f70" : "#e1e7ed"}"/>`).join("")}${t(124, 253, L("levels", "niveles"), { size: 11.5, weight: 700, fill: MUTED })}
  </g>`;
  return room("ARC-AGI-3", "#ff8f70", body, L("ARC-AGI-3 lab: an 8 by 8 game board with walls, a yellow key and a green goal. The orange piece moves step by step with no instructions: it has to discover what it controls, the rules and the goal. The agent used 14 actions where a human used 12, so the level scores (12/14) squared, about 0.73.", "Laboratorio de ARC-AGI-3: un tablero de 8 por 8 con muros, una llave amarilla y una meta verde. La pieza naranja avanza paso a paso sin instrucciones: tiene que descubrir qué controla, las reglas y la meta. El agente usó 14 acciones donde una persona usó 12, así que el nivel puntúa (12/14) al cuadrado, cerca de 0.73."));
}

function webLab(L) {
  let body = `<g transform="translate(30 58)"><rect width="250" height="94" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>${t(14, 24, L("Question", "Pregunta"), { size: 11.5, weight: 800, fill: MUTED })}${t(14, 46, L("A dataset released at a 1990s", "Un dataset presentado en una"), { size: 12.5, weight: 600 })}${t(14, 64, L("workshop by a team of three…", "conferencia de los 90 por tres…"), { size: 12.5, weight: 600 })}${t(14, 82, L("In what year?", "¿En qué año?"), { size: 12.5, weight: 800 })}</g>`;
  const nodes = [[340, 70, 0], [340, 130, 0], [340, 190, 1], [340, 250, 0], [450, 100, 0], [450, 160, 0], [450, 220, 1], [450, 280, 0], [560, 200, 2]];
  const edges = [[0, 4], [1, 4], [1, 5], [2, 5], [2, 6], [3, 7], [6, 8]];
  const src = [155, 152];
  body += [0, 1, 2, 3].map((i) => `<path d="M${src[0]} ${src[1]} C 230 200, 280 ${nodes[i][1]}, ${nodes[i][0] - 24} ${nodes[i][1]}" fill="none" stroke="${nodes[i][2] ? "#3ccf6e" : "#cfd9e3"}" stroke-width="${nodes[i][2] ? 3 : 2}"/>`).join("");
  body += edges.map(([a, b]) => { const A = nodes[a], B = nodes[b]; const good = A[2] && B[2]; return `<path d="M${A[0] + 24} ${A[1]} L${B[0] - 24} ${B[1]}" stroke="${good ? "#3ccf6e" : "#cfd9e3"}" stroke-width="${good ? 3 : 2}" ${good ? 'class="a-flow" stroke-dasharray="6 5"' : ""}/>`; }).join("");
  body += nodes.map(([x, y, k], i) => k === 2 ? "" : `<g class="a-fadein"${d(0.2 + i * 0.25)}>${rect(x - 24, y - 16, 48, 32, k ? "#e3f8ea" : "#fff", { r: 7, stroke: k ? "#3ccf6e" : "#d3dde7" })}${k ? check(x, y, true, 0.7) : `<path d="M${x - 5} ${y - 5} l10 10 M${x + 5} ${y - 5} l-10 10" stroke="#b9c6d2" stroke-width="2"/>`}</g>`).join("");
  body += `<g transform="translate(560 200)"><g class="a-pop"${d(2.8)}><circle r="40" fill="#3ccf6e"/>${t(0, 4, "1987", { size: 18, weight: 800, fill: "#fff", anchor: "middle" })}${t(0, 22, L("verified", "verificado"), { size: 10.5, weight: 700, fill: "#fff", anchor: "middle" })}</g></g>`;
  body += t(30, 196, L("Hard to find:", "Difícil de hallar:"), { size: 13, weight: 800 }) + t(30, 216, L("dozens of pages, most dead ends", "decenas de páginas, casi todas sin salida"), { size: 12, weight: 600, fill: MUTED });
  body += t(30, 256, L("Easy to check:", "Fácil de verificar:"), { size: 13, weight: 800 }) + t(30, 276, L("one short answer", "una respuesta corta"), { size: 12, weight: 600, fill: MUTED });
  return room("BrowseComp", "#3ccf6e", body, L("BrowseComp lab: a question with many clues (a dataset released at a 1990s workshop by a team of three; in what year?). The agent opens many pages; most are dead ends marked with an X and one green path leads to a short, verifiable answer: 1987.", "Laboratorio de BrowseComp: una pregunta con muchas pistas (un dataset presentado en una conferencia de los 90 por tres personas; ¿en qué año?). El agente abre muchas páginas; casi todas son callejones sin salida marcados con una X y un camino verde lleva a una respuesta corta y verificable: 1987."));
}

function researchLab(L) {
  let body = `<g transform="translate(30 56)"><rect width="270" height="250" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>${t(16, 26, L("MLE-bench · a Kaggle board", "MLE-bench · tablero de Kaggle"), { size: 12, weight: 800, fill: MUTED })}`;
  const tiers = [["Gold", "#e3b41b", 52], ["Silver", "#a9b4be", 92], ["Bronze", "#c98a5a", 132]];
  body += tiers.map(([n, c, y]) => `<line x1="16" x2="254" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2" stroke-dasharray="6 5"/>${t(254, y - 6, L(n, { Gold: "Oro", Silver: "Plata", Bronze: "Bronce" }[n]), { size: 11, weight: 800, fill: c, anchor: "end" })}`).join("");
  body += [60, 98, 124, 150, 172, 196, 214].map((y, i) => `<rect x="24" y="${y}" width="${150 - i * 12}" height="9" rx="4" fill="#e6ebf0"/>`).join("");
  body += `<g><rect x="24" y="222" width="120" height="12" rx="5" fill="#ffb53d"><animate attributeName="y" values="222;222;140;126" keyTimes="0;.3;.8;1" dur="4s" fill="freeze"/></rect>${t(150, 233, L("agent", "agente"), { size: 11, weight: 800, fill: "#b37400" })}</g>`;
  body += `</g>`;
  body += `<g transform="translate(320 56)"><rect width="290" height="250" rx="14" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>${t(16, 26, L("PaperBench · replication rubric", "PaperBench · rúbrica de réplica"), { size: 12, weight: 800, fill: MUTED })}
    ${rect(95, 40, 100, 30, "#1c2b33", { r: 8 })}${t(145, 60, L("The paper", "El artículo"), { size: 12, weight: 700, fill: "#fff", anchor: "middle" })}`;
  const mids = [55, 145, 235], leaves = [["Code", "#5b9bff"], ["Run", "#2ec4b6"], ["Result", "#ffb53d"]];
  body += mids.map((x, i) => `<path d="M145 70 L${x} 104" stroke="#cfd9e3" stroke-width="2"/>${rect(x - 34, 104, 68, 26, "#f1f4f7", { r: 7 })}${t(x, 121, L(`Part ${i + 1}`, `Parte ${i + 1}`), { size: 11, weight: 700, anchor: "middle" })}` +
    leaves.map(([, c], j) => { const lx = x - 26 + j * 26; return `<path d="M${x} 130 L${lx} 160" stroke="#e1e7ed" stroke-width="1.5"/><g class="a-pop"${d(0.6 + i * 0.5 + j * 0.2)}><circle cx="${lx}" cy="170" r="10" fill="${c}"/>${(i + j) % 4 === 3 ? `<path d="M${lx - 4} 166 l8 8 M${lx + 4} 166 l-8 8" stroke="#fff" stroke-width="2"/>` : `<path d="M${lx - 4.5} 170 l3 3 6 -6" stroke="#fff" stroke-width="2.2" fill="none"/>`}</g>`; }).join("")).join("");
  body += leaves.map(([n, c], i) => `<circle cx="${30 + i * 86}" cy="210" r="6" fill="${c}"/>${t(42 + i * 86, 214, L(n === "Run" ? "Execution" : n === "Result" ? "Result match" : "Code dev.", n === "Run" ? "Ejecución" : n === "Result" ? "Resultado" : "Código"), { size: 11, weight: 700 })}`).join("");
  body += t(16, 238, L("a judge model grades every leaf", "un modelo juez califica cada hoja"), { size: 11, weight: 600, fill: MUTED }) + `</g>`;
  return room(L("AI research desk", "Escritorio de investigación"), "#ff6600", body, L("AI research lab: on the left, an MLE-bench board where the agent's submission climbs past the bronze line toward silver; on the right, a PaperBench rubric tree that splits a paper into parts and leaves of three kinds (code development, execution and result match), each graded by a judge model.", "Laboratorio de investigación: a la izquierda, un tablero de MLE-bench donde el envío del agente sube más allá de la línea de bronce rumbo a plata; a la derecha, el árbol de rúbrica de PaperBench que divide un artículo en partes y hojas de tres tipos (código, ejecución y coincidencia de resultados), cada una calificada por un modelo juez."));
}

function horizonLab(L) {
  const x0 = 70, x1 = 590, y0 = 290, y1 = 70;
  const ticks = [["1 min", 0], ["15 min", 0.25], ["1 h", 0.45], ["4 h", 0.65], [L("1 day", "1 día"), 0.85]];
  let body = `<rect x="40" y="52" width="576" height="276" rx="16" fill="#fff" stroke="#e1e7ed" stroke-width="2"/>`;
  body += `<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" stroke="#cfd9e3" stroke-width="2"/><line x1="${x0}" x2="${x0}" y1="${y0}" y2="${y1}" stroke="#cfd9e3" stroke-width="2"/>`;
  body += ticks.map(([s, f]) => `<line x1="${x0 + f * (x1 - x0)}" x2="${x0 + f * (x1 - x0)}" y1="${y0}" y2="${y0 + 6}" stroke="#9aa8b5"/>${t(x0 + f * (x1 - x0), y0 + 22, s, { size: 11.5, weight: 700, fill: MUTED, anchor: "middle" })}`).join("");
  body += t(x0 - 8, y1 + 4, "100%", { size: 11, weight: 700, fill: MUTED, anchor: "end" }) + t(x0 - 8, y0 + 4, "0%", { size: 11, weight: 700, fill: MUTED, anchor: "end" });
  const ym = (y0 + y1) / 2;
  body += `<line x1="${x0}" x2="${x1}" y1="${ym}" y2="${ym}" stroke="#8a7dff" stroke-width="1.5" stroke-dasharray="5 5"/>${t(x1, ym - 8, "50%", { size: 11.5, weight: 800, fill: "#8a7dff", anchor: "end" })}`;
  const curve = (shift) => { let p = ""; for (let i = 0; i <= 40; i++) { const f = i / 40; const s = 1 / (1 + Math.exp((f - shift) * 12)); p += `${i ? "L" : "M"}${(x0 + f * (x1 - x0)).toFixed(1)} ${(y0 - s * (y0 - y1) * 0.92).toFixed(1)}`; } return p; };
  body += `<path d="${curve(0.32)}" fill="none" stroke="#c9c3ff" stroke-width="3"/>`;
  body += `<path d="${curve(0.48)}" pathLength="1" fill="none" stroke="#8a7dff" stroke-width="3.5" class="a-draw"/>`;
  const xa = x0 + 0.32 * (x1 - x0), xb = x0 + 0.48 * (x1 - x0);
  body += `<circle cx="${xb}" cy="${ym}" r="7" fill="#8a7dff" class="a-pop"${d(1.6)}/><line x1="${xb}" x2="${xb}" y1="${ym}" y2="${y0}" stroke="#8a7dff" stroke-dasharray="3 4"/>`;
  body += `<path d="M${xa + 6} ${ym - 22} H ${xb - 8}" stroke="${INK}" stroke-width="2"/><path d="M${xb - 14} ${ym - 28} l7 6 -7 6" fill="none" stroke="${INK}" stroke-width="2"/>`;
  body += t((xa + xb) / 2, ym - 32, L("newer model", "modelo más nuevo"), { size: 11.5, weight: 800, anchor: "middle" });
  body += t(330, 100, L("Each dot is a task timed on skilled people.", "Cada tarea se cronometra con personas expertas."), { size: 12.5, weight: 600, fill: MUTED });
  body += t(330, 120, L("The horizon: task length it finishes 50% of the time.", "El horizonte: la duración que termina el 50% de las veces."), { size: 12.5, weight: 700 });
  body += t(x0, y0 + 46 - 4, L("Time a skilled person needs (log scale)", "Tiempo que necesita una persona experta (escala log)"), { size: 11.5, weight: 700, fill: MUTED });
  return room(L("Time-horizon observatory", "Observatorio del horizonte"), "#8a7dff", body, L("METR time-horizon lab: a chart with task length for a skilled person on a log scale (1 minute to 1 day) and success rate from 0 to 100%. A newer model's S-shaped curve sits to the right of an older one; where it crosses 50% is its time horizon.", "Laboratorio del horizonte de METR: una gráfica con la duración de la tarea para una persona experta en escala logarítmica (de 1 minuto a 1 día) y la tasa de éxito de 0 a 100%. La curva en S de un modelo más nuevo queda a la derecha de una vieja; donde cruza el 50% es su horizonte de tiempo."));
}

const STEP_SCENES = [measureBench, researchDesk, failureLab, testChamber, sewingBench, versionArchive];
const BENCH_SCENES = { swe: sweLab, terminal: terminalLab, arc: arcLab, web: webLab, research: researchLab, horizon: horizonLab };

/** @param {number} i @param {"en"|"es"} lang */
export function stepScene(i, lang) {
  const L = (en, es) => (lang === "es" ? es : en);
  return STEP_SCENES[i]?.(L) ?? "";
}
/** @param {string} id @param {"en"|"es"} lang */
export function benchScene(id, lang) {
  const L = (en, es) => (typeof es === "string" ? (lang === "es" ? es : en) : en);
  return BENCH_SCENES[id]?.(L) ?? "";
}
