// Mounts the two 3D scenes and glues them to the page.
// Hero: the "it's alive" intro drives the dim/flash overlays, the headline and the speech bubble.
// Room: loads when it gets close to the screen. The page sends "room:goto" (a station), "room:key"
// (the on-screen pad) and "room:react" (a step of the example exercise); it hears back "room:arrive" and
// "room:move" (the visitor moved it, so a running exercise stops).
import { createHero } from "./hero.js";
import { createRoom } from "./room.js";
import { setLanguage, tr } from "./agent.js";
import { sound } from "./sound.js";
import { music } from "./music.js";
import "./popups.js";
import { ROOMS, UI } from "./museum.js";
import "./details.js";
import "./cycle.js";
import "./metaharness.js";

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
setLanguage(root.lang);
sound.setLanguage(root.lang);
let hero3d = null;
document.addEventListener("lang:change", (e) => {
  setLanguage(e.detail);
  sound.setLanguage(e.detail);
  paintMusic();
  if (hero3d) hero3d.relabel();
  if (room) { room.relabel(); renderGuide(lastGuide); viewLabel(); }
});
const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

function bubble(el) {
  let timer = 0;
  const label = el.firstElementChild || el;
  return {
    say(text, ms = 2600) {
      label.textContent = text;
      el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove("show"), ms);
    },
    place({ x, y }) { el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; },
  };
}
const pulse = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

const STATION_OF = { codigo: "swe", terminal: "terminal", razonamiento: "arc", web: "web", investigacion: "research" };
let room = null;
let roomQueue = null;

/* The card under the lab doubles as the guide: it explains the room or the exhibit in front of Agentztein. */
let lastGuide = null;
const hexColor = (n) => "#" + n.toString(16).padStart(6, "0");
function renderGuide(g) {
  if (!g) return;
  lastGuide = g;
  const r = ROOMS[g.room];
  const it = g.item ? r.items[g.item] : null;
  const card = $("#card");
  $("#cDot").style.setProperty("--c", hexColor(r.color));
  $("#cName").textContent = it ? tr(it.title) : tr(r.name);
  $("#cL1").textContent = it ? tr(r.name) : r.bench ? `${tr(r.kind)} · ${tr(r.bench)}` : tr(r.kind);
  $("#cA").textContent = it ? tr(it.text) : tr(r.intro);
  $("#cL2").parentElement.hidden = true;
  // a few hard facts, like a spec sheet (the engine's parts have them)
  const facts = it?.facts ? it.facts(room?.live?.() ?? { installed: 0, effort: "medium" }) : null;
  const cf = $("#cF");
  cf.hidden = !facts;
  cf.replaceChildren(...(facts ?? []).map(([k, v]) => { const d = document.createElement("div"); const b = document.createElement("b"); const i = document.createElement("span"); i.textContent = tr(k); b.textContent = typeof v === "string" ? v : tr(v); d.append(i, b); return d; }));
  $("#actBtn").hidden = !it || Boolean(room?.auto);
  card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
}
function viewLabel() {
  const fp = Boolean(room?.fp);
  $("#labStage").classList.toggle("watch", Boolean(room?.auto));
  $("#viewTxt").textContent = tr(fp ? UI.tp : UI.fp);
  $("#viewBtn").setAttribute("aria-pressed", String(fp));
  const fine = matchMedia("(pointer: fine)").matches;
  $("#roomHint").textContent = tr(room?.auto ? UI.watchHint : fp ? (room?.locked ? UI.fpHint2 : fine ? UI.fpLock : UI.fpHint) : UI.tpHint);
  const fsTxt = $("#fsTxt");
  if (fsTxt) fsTxt.textContent = tr(document.fullscreenElement ? UI.exitFull : UI.full);
}

const stageEl = $(".stage");

/* The sound buttons float over the page; while the lab fills the screen they move inside it, next to the
   other controls, so they never sit on top of the guide card. */
{
  const dock = $(".snddock"), wrap = $("#labStage");
  if (dock && wrap) new IntersectionObserver(([e]) => {
    const inside = e.intersectionRatio >= 0.45;
    if (inside && dock.parentElement !== stageEl) { stageEl.append(dock); dock.classList.add("in-stage"); }
    if (!inside && dock.parentElement === stageEl) { document.body.append(dock); dock.classList.remove("in-stage"); }
  }, { threshold: [0, 0.45, 0.7] }).observe(wrap);
}

/* A small caption over the room's agent while it works: what it is doing right now. */
let workEl = null;
function workCaption(w) {
  if (!workEl) { workEl = document.createElement("div"); workEl.className = "workcap"; workEl.setAttribute("aria-hidden", "true"); stageEl.append(workEl); }
  if (!w) { workEl.classList.remove("on"); return; }
  if (workEl.textContent !== w.text) workEl.textContent = w.text;
  workEl.classList.add("on");
  workEl.style.transform = `translate(${w.x}px, ${w.y}px) translate(-50%, -100%)`;
}

/* The keys live in a thin strip over the lab, not in the card: it shows when you take control and fades after a while. */
let keysTimer = 0;
function showKeys() {
  const k = $("#labKeys");
  if (!k) return;
  k.classList.add("on");
  clearTimeout(keysTimer);
  keysTimer = setTimeout(() => k.classList.remove("on"), 9000);
}

function startRoom() {
  if (room) return;
  const canvas = $("#room3d");
  const b = bubble($("#roomBubble"));
  try {
    room = createRoom(canvas, {
      reduced,
      minimap: $("#miniMap"),
      onArrive: (id) => document.dispatchEvent(new CustomEvent("room:arrive", { detail: id })),
      onSay: (t) => b.say(t),
      onFrame: (p) => b.place(p),
      onFlash: () => pulse($("#roomFlash"), "go"),
      onMove: () => document.dispatchEvent(new CustomEvent("room:move")),
      onGuide: renderGuide,
      onView: (fp) => { $(".stage").classList.toggle("fp", fp); if (!reduced) pulse($(".stage"), fp ? "dive" : "rise"); viewLabel(); showKeys(); },
      onMode: (m) => { viewLabel(); if (lastGuide) renderGuide(lastGuide); if (m === "play") showKeys(); },
      onRun: () => document.dispatchEvent(new CustomEvent("room:run")),
      onWorker: workCaption,
      onTour: (id) => { if (tourOn) sound.narrate(id === "taller" ? "tour-workshop" : `tour-${id}`); },
    });
    root.classList.add("room-3d");
    viewLabel();
    renderGuide(lastGuide ?? { room: "cuna" });
    $("#viewBtn").addEventListener("click", () => { room.setView(!room.fp); room.focusCanvas(); });
    $("#actBtn").addEventListener("click", () => room.interact());
    $("#takeBtn").addEventListener("click", () => room.takeControl());
    // full screen for the whole lab (stage + guide card), where the browser allows it
    const wrap = $("#labStage"), fsBtn = $("#fsBtn");
    if (document.fullscreenEnabled && wrap.requestFullscreen) {
      fsBtn.hidden = false;
      fsBtn.addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen().catch(() => {}); room.focusCanvas(); });
      document.addEventListener("fullscreenchange", viewLabel);
    }
    document.addEventListener("room:hint", viewLabel);
    document.addEventListener("room:goto", (e) => room.goTo(e.detail));
    document.addEventListener("room:react", (e) => room.react(e.detail));
    document.addEventListener("room:key", (e) => room.press(e.detail.k, e.detail.down));
    if (roomQueue) { room.goTo(roomQueue); roomQueue = null; }
  } catch (err) {
    console.warn("3D room unavailable", err);
  }
}

function startHero() {
  const canvas = $("#hero3d");
  const hero = $(".hero");
  const b = bubble($("#heroBubble"));
  root.classList.add("hero-3d");
  try {
    const h = createHero(canvas, {
      reduced,
      onPhase: (p) => {
        if (p === "flicker") { hero.style.setProperty("--zap", String(0.15 + Math.random() * 0.35)); pulse($("#heroFlash"), "blip"); }
        if (p === "alive") { pulse($("#heroFlash"), "go"); root.classList.remove("intro"); root.classList.add("alive"); }
        if (p === "awake") { root.classList.remove("intro"); root.classList.add("alive"); }
      },
      onSay: (t) => b.say(t),
      onFrame: (p) => b.place(p),
      onSkill: (id) => {
        $("#laboratorio").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
        if (room) room.goTo(STATION_OF[id]); else roomQueue = STATION_OF[id];
      },
    });
    hero3d = h;
    // scrolling the hero away turns the stage a little
    const onScroll = () => {
      const r = hero.getBoundingClientRect();
      h.setScroll(Math.min(1, Math.max(0, -r.top / r.height)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  } catch (err) {
    console.warn("3D hero unavailable", err);
    root.classList.remove("intro", "hero-3d"); root.classList.add("alive");
  }
}

/* The speaker button: sound switches on at the first tap anywhere; this turns it off and on again. */
const snd = $("#sndBtn");
if (snd) {
  const paint = (on) => { snd.setAttribute("aria-pressed", String(on)); snd.classList.remove("nudge"); };
  sound.onChange(paint);
  paint(sound.on);
  try { if (!localStorage.getItem("agz-sound")) snd.classList.add("nudge"); } catch { /* private window */ }
  snd.addEventListener("click", async () => {
    const wasOff = !sound.on;
    await sound.toggle();
    if (wasOff && sound.on) hero3d?.poke(); // let them hear it right away: another jolt and a line
  });
}

/* R runs the example exercise and L opens the room's 3D lab, when the card offers them. */
document.addEventListener("keydown", (e) => {
  if (!room?.active || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "")) return;
  const btn = e.code === "KeyR" ? $("#runBtn") : e.code === "KeyL" ? $("#benchBtn") : null;
  if (btn && !btn.hidden && !btn.disabled) { e.preventDefault(); btn.click(); }
});

/* The voice tour: off by default; when on, the agent says a few words about each room as you reach its main exhibit. */
const tourBtn = $("#tourBtn");
let tourOn = false;
try { tourOn = localStorage.getItem("agz-tour") === "on"; } catch { /* private window */ }
function paintTour() { if (tourBtn) tourBtn.setAttribute("aria-pressed", String(tourOn)); }
if (tourBtn) {
  paintTour();
  tourBtn.addEventListener("click", async () => {
    if (!sound.on) await sound.toggle();
    tourOn = !tourOn; paintTour();
    try { localStorage.setItem("agz-tour", tourOn ? "on" : "off"); } catch { /* private window */ }
    if (!tourOn) sound.stopNarration();
    else if (room) sound.narrate("tour-cuna");
  });
}

/* Music: its own switch, and a button that cycles through the three beats. */
const musBtn = $("#musBtn"), beatBtn = $("#beatBtn");
function paintMusic() {
  if (!musBtn) return;
  musBtn.setAttribute("aria-pressed", String(music.on && sound.on));
  beatBtn.hidden = !(music.on && sound.on);
  $("#beatTxt").textContent = music.beat.name[root.lang === "es" ? "es" : "en"];
}
if (musBtn) {
  music.onChange(paintMusic); sound.onChange(paintMusic); paintMusic();
  musBtn.addEventListener("click", async () => { if (!sound.on) { await sound.toggle(); if (!music.on) music.toggle(); } else music.toggle(); paintMusic(); });
  beatBtn.addEventListener("click", () => { music.next(); paintMusic(); });
}

if (hasWebGL()) {
  // the hero starts right away (the room waits for the page to load and to come near the screen)
  requestAnimationFrame(startHero);
  const go = () => {
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { startRoom(); near.disconnect(); } }, { rootMargin: "600px 0px" });
    near.observe($("#room3d"));
    document.addEventListener("room:goto", (e) => { if (!room) { roomQueue = e.detail; startRoom(); } }, { once: true });
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
} else {
  root.classList.remove("intro"); root.classList.add("alive");
}
