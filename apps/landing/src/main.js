// Mounts the two 3D scenes and glues them to the page.
// Hero: the "it's alive" intro drives the dim/flash overlays, the headline and the speech bubble.
// Room: loads when it gets close to the screen. The page sends "room:goto" (a station), "room:key"
// (the on-screen pad) and "room:react" (a step of the example exercise); it hears back "room:arrive" and
// "room:move" (the visitor moved it, so a running exercise stops).
import { createHero } from "./hero.js";
import { createRoom } from "./room.js";
import { setLanguage, tr } from "./agent.js";
import { ROOMS, UI } from "./museum.js";
import "./details.js";
import "./cycle.js";

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
setLanguage(root.lang);
let hero3d = null;
document.addEventListener("lang:change", (e) => {
  setLanguage(e.detail);
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
  $("#actBtn").hidden = !it;
  card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
}
function viewLabel() {
  const fp = Boolean(room?.fp);
  $("#viewTxt").textContent = tr(fp ? UI.tp : UI.fp);
  $("#viewBtn").setAttribute("aria-pressed", String(fp));
  $("#roomHint").textContent = tr(fp ? UI.fpHint : UI.tpHint);
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
      onView: (fp) => { $(".stage").classList.toggle("fp", fp); viewLabel(); },
    });
    root.classList.add("room-3d");
    viewLabel();
    renderGuide(lastGuide ?? { room: "cuna" });
    $("#viewBtn").addEventListener("click", () => { room.setView(!room.fp); room.focusCanvas(); });
    $("#actBtn").addEventListener("click", () => room.interact());
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
