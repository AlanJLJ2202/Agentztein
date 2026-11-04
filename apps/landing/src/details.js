/* The page's detail layer: the themed lab inside each step sheet, the benchmark sheets (lab + breakdown +
   how to improve + uses) and the live Hacker News feed of the research section. Works with or without WebGL. */
import { CAPABILITIES, fetchLiveFeed, SOURCE_STYLE } from "@skillab/research";
import { BENCHES } from "./benchmarks.js";
import { benchScene, stepScene } from "./scenes.js";
import { createBenchLab } from "./benchlab.js";

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lang = () => (root.lang === "es" ? "es" : "en");
const L = (o) => (o == null ? "" : typeof o === "string" || typeof o === "number" ? String(o) : (o[lang()] ?? o.en));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => new Intl.NumberFormat(lang() === "es" ? "es-MX" : "en-US").format(n);

/** With reduced motion, SMIL animations jump to their last frame and stop (CSS ones are already off). */
function settle(host) {
  if (!reduce) return;
  host.querySelectorAll("svg").forEach((svg) => {
    try { svg.setCurrentTime(30); svg.pauseAnimations(); } catch { /* not an SVG document */ }
  });
}

const W = {
  how: { en: "How it works", es: "Cómo funciona" },
  parts: { en: "What it's made of", es: "De qué está hecho" },
  score: { en: "How it's scored", es: "Cómo se califica" },
  improve: { en: "How Agentztein could improve here", es: "Cómo podría mejorar Agentztein aquí" },
  improveNote: { en: "Candidate skills, each with its trade-off. None is kept until it passes the lab without breaking another benchmark.", es: "Habilidades candidatas, cada una con su trade-off. Ninguna se queda hasta pasar el laboratorio sin romper otro benchmark." },
  gain: { en: "Gain", es: "Gana" },
  cost: { en: "Trade-off", es: "A cambio" },
  uses: { en: "Where it matters", es: "Dónde importa" },
  sources: { en: "Sources", es: "Fuentes" },
  nores: { en: "Agentztein result: not measured yet", es: "Resultado de Agentztein: aún sin medir" },
  lab: { en: "Lab", es: "Laboratorio" },
  tasks: { en: "tasks", es: "tareas" },
  prev: { en: "Previous", es: "Anterior" },
  next: { en: "Next", es: "Siguiente" },
  explore: { en: "Explore the lab", es: "Explora el laboratorio" },
  runAll: { en: "Run it all", es: "Correr todo" },
  hint3d: { en: "Drag to turn · tap objects to inspect", es: "Arrastra para girar · toca objetos para inspeccionarlos" },
  lab3d: { en: "Interactive 3D lab", es: "Laboratorio 3D interactivo" },
  illus: { en: "Illustration of how it works, not a result.", es: "Ilustración de cómo funciona, no un resultado." },
  points: { en: "points", es: "puntos" },
  comments: { en: "comments", es: "comentarios" },
  liveErr: { en: "The sources didn't answer right now. Open one directly:", es: "Las fuentes no respondieron ahora. Abre una directo:" },
  liveEmpty: { en: "Quiet week: no AI story above the threshold yet.", es: "Semana tranquila: aún no hay historias de IA sobre el umbral." },
  updated: { en: "Updated", es: "Actualizado" },
};

/* ---------- Step sheets: a themed lab instead of a cropped picture ---------- */
const stepHost = $("#dlgLab");
let stepShown = -1;
document.addEventListener("step:open", (e) => {
  if (!stepHost) return;
  stepShown = e.detail;
  stepHost.innerHTML = stepScene(stepShown, lang());
  settle(stepHost);
});

/* ---------- Benchmark sheets ---------- */
const dlg = $("#benchDlg");
let benchIx = 0;

function bars(part) {
  const max = Math.max(...part.bars.map((b) => b[1]));
  const total = part.bars.reduce((a, b) => a + b[1], 0);
  return `<ul class="bars">${part.bars.map(([label, v, extra]) => {
    const unit = typeof extra === "string" ? extra : "";
    const note = extra && typeof extra === "object" ? L(extra) : "";
    const share = unit ? "" : ` · ${Math.round((v / total) * 100)}%`;
    return `<li><span class="bl">${esc(L(label))}${note ? `<small>${esc(note)}</small>` : ""}</span><span class="bt"><i style="--w:${((v / max) * 100).toFixed(1)}%"></i></span><b>${esc(unit ? `${fmt(v)}${unit}` : fmt(v))}<small>${unit ? "" : esc(share)}</small></b></li>`;
  }).join("")}</ul>`;
}


/* The benchmark's lab: interactive 3D when WebGL works, the drawing otherwise. */
let lab3d = null;
const hasGL = (() => { try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
function dropLab() { lab3d?.dispose(); lab3d = null; }
function mountLab(b) {
  dropLab();
  const host = $("#bLab");
  if (!hasGL) { host.innerHTML = benchScene(b.id, lang()); settle(host); return; }
  host.innerHTML = `<div class="lab3d">
    <canvas tabindex="0" aria-label="${esc(L(W.lab3d))}: ${esc(L(b.name))}"></canvas>
    <span class="l3-tag"><i></i>${L(W.lab3d)}</span>
    <span class="l3-hint">${L(W.hint3d)}</span>
    <p class="l3-info" aria-live="polite"></p>
  </div>
  <div class="l3-bar" role="group" aria-label="${esc(L(W.how))}">
    ${b.steps.map((st, i) => `<button type="button" class="l3-step" data-i="${i}"><b>${i + 1}</b>${esc(L(st))}</button>`).join("")}
    <button type="button" class="btn l3-run"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor"/></svg>${L(W.runAll)}</button>
    <span class="l3-note">${L(W.illus)}</span>
  </div>`;
  const info = host.querySelector(".l3-info");
  const btns = [...host.querySelectorAll(".l3-step")];
  try {
    lab3d = createBenchLab(host.querySelector("canvas"), b.id, {
      lang: lang(),
      reduced: reduce,
      onStep: (i) => {
        btns.forEach((x, k) => x.setAttribute("aria-pressed", String(k === i)));
        document.querySelectorAll("#bBody .howl li").forEach((li, k) => li.classList.toggle("on", k === i));
        info.textContent = L(b.how[i]); info.classList.remove("show"); void info.offsetWidth; info.classList.add("show");
      },
      onInfo: (text) => { info.textContent = text; info.classList.remove("show"); void info.offsetWidth; info.classList.add("show"); },
    });
  } catch (err) {
    console.warn("3D lab unavailable", err);
    host.innerHTML = benchScene(b.id, lang()); settle(host); return;
  }
  btns.forEach((x) => x.addEventListener("click", () => lab3d?.setStep(Number(x.dataset.i))));
  host.querySelector(".l3-run").addEventListener("click", () => lab3d?.play());
  setTimeout(() => lab3d?.setStep(0), 60);
}

function fillBench(i) {
  benchIx = (i + BENCHES.length) % BENCHES.length;
  const b = BENCHES[benchIx];
  dlg.style.setProperty("--c", b.color);
  $("#bKicker").textContent = L(b.cap);
  $("#bTitle").textContent = L(b.name);
  $("#bTag").textContent = L(b.tagline);
  $("#bNores").textContent = L(W.nores);
  mountLab(b);
  $("#bBody").innerHTML = `
    <section class="bsec"><h4>${L(W.how)}</h4><ol class="howl">${b.how.map((h) => `<li>${esc(L(h))}</li>`).join("")}</ol></section>
    <section class="bsec"><h4>${L(W.parts)}</h4>${b.parts.map((p) => `<div class="part"><h5>${esc(L(p.title))}</h5>${p.bars ? bars(p) : `<ul class="chips">${p.chips.map((c) => `<li>${esc(L(c))}</li>`).join("")}</ul>`}</div>`).join("")}</section>
    <section class="bsec"><h4>${L(W.score)}</h4><p>${esc(L(b.score))}</p><p class="bnote">${esc(L(b.note))}</p></section>
    <section class="bsec wide"><h4>${L(W.improve)}</h4><p class="muted">${L(W.improveNote)}</p><ul class="cands">${b.skills.map((s) => `<li><b>${esc(L(s.s))}</b><span class="g"><em>${L(W.gain)}</em>${esc(L(s.gain))}</span><span class="c"><em>${L(W.cost)}</em>${esc(L(s.cost))}</span></li>`).join("")}</ul></section>
    <section class="bsec"><h4>${L(W.uses)}</h4><ul class="chips uses">${b.uses.map((u) => `<li>${esc(L(u))}</li>`).join("")}</ul></section>
    <section class="bsec"><h4>${L(W.sources)}</h4><ul class="srcs">${b.sources.map(([n, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(n)} ↗</a></li>`).join("")}</ul></section>`;
  $("#bPrev").textContent = `← ${L(BENCHES[(benchIx + BENCHES.length - 1) % BENCHES.length].name)}`;
  $("#bNext").textContent = `${L(BENCHES[(benchIx + 1) % BENCHES.length].name)} →`;
  dlg.querySelector(".bsheet-in").scrollTop = 0;
}

if (dlg) {
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-bench]");
    if (!opener) return;
    const i = BENCHES.findIndex((b) => b.id === opener.dataset.bench);
    if (i < 0) return;
    fillBench(i);
    if (!dlg.open) dlg.showModal();
  });
  $("#bPrev").addEventListener("click", () => fillBench(benchIx - 1));
  $("#bNext").addEventListener("click", () => fillBench(benchIx + 1));
  $("#bClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", dropLab);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", (e) => {
    if (e.target.tagName === "CANVAS") return; // the arrows play ARC-AGI-3 inside the lab
    if (e.key === "ArrowRight") fillBench(benchIx + 1);
    if (e.key === "ArrowLeft") fillBench(benchIx - 1);
  });
}

/* ---------- Research: live feed from its four sources (Hacker News, arXiv, Hugging Face, GitHub) ---------- */
const live = $("#hnLive");
let stories = null, failed = false, fetchedAt = null;

function ago(iso) {
  const h = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: "auto" });
  return h < 48 ? rtf.format(-h, "hour") : rtf.format(-Math.round(h / 24), "day");
}

function renderLive() {
  if (!live) return;
  live.setAttribute("aria-busy", String(!stories && !failed));
  const stamp = $("#hnStamp");
  if (failed) {
    live.innerHTML = `<li class="hn-msg">${L(W.liveErr)} <a href="https://news.ycombinator.com/" target="_blank" rel="noreferrer">news.ycombinator.com ↗</a></li>`;
    return;
  }
  if (!stories) return;
  if (!stories.length) { live.innerHTML = `<li class="hn-msg">${L(W.liveEmpty)}</li>`; return; }
  live.innerHTML = stories.map((s, i) => {
    const c = s.hint ? CAPABILITIES[s.hint] : null;
    const src = SOURCE_STYLE[s.source] ?? SOURCE_STYLE.hackernews;
    const hn = !s.source || s.source === "hackernews";
    return `<li style="--i:${i}"><a class="hn-t" href="${esc(s.url ?? s.hnUrl)}" target="_blank" rel="noreferrer">${esc(s.title)}</a>
      <p class="hn-m"><span class="src" style="--c:${src.color}">${esc(src.short)}</span>${c ? `<span class="cap" style="--c:${c.color}"><i></i>${esc(c[lang()])}</span>` : ""}${s.points ? `<span>${fmt(s.points)} ${L(W.points)}</span>·` : ""}${hn ? `<a href="${esc(s.hnUrl)}" target="_blank" rel="noreferrer">${fmt(s.comments)} ${L(W.comments)}</a>·` : ""}<span>${esc(ago(s.postedAt))}</span></p></li>`;
  }).join("");
  if (stamp && fetchedAt) stamp.textContent = `${L(W.updated)} ${fetchedAt.toLocaleTimeString(lang() === "es" ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" })}`;
}

// The live feed lives in the "Researches" phase detail; it loads the first time that detail opens.
let requested = false;
document.addEventListener("step:open", (e) => {
  if (!live || e.detail !== 2 || requested) return;
  requested = true;
  fetchLiveFeed({ limit: 6, signal: AbortSignal.timeout(9000) })
    .then((r) => { stories = r.items; fetchedAt = new Date(); })
    .catch(() => { failed = true; })
    .finally(renderLive);
});

document.addEventListener("lang:change", () => {
  renderLive();
  if (dlg?.open) fillBench(benchIx);
});
