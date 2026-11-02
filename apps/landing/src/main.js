// Mounts the two 3D scenes and glues them to the page.
// Hero: the "it's alive" intro drives the dim/flash overlays, the headline and the speech bubble.
// Room: loads when it gets close to the screen; the page asks it to move with "room:goto" and hears
// back with "room:arrive".
import { createHero } from "./hero.js";
import { createRoom } from "./room.js";

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function startRoom() {
  if (room) return;
  const canvas = $("#room3d");
  const b = bubble($("#roomBubble"));
  try {
    room = createRoom(canvas, {
      reduced,
      onArrive: (id) => document.dispatchEvent(new CustomEvent("room:arrive", { detail: id })),
      onSay: (t) => b.say(t),
      onFrame: (p) => b.place(p),
      onFlash: () => pulse($("#roomFlash"), "go"),
    });
    root.classList.add("room-3d");
    document.addEventListener("room:goto", (e) => room.goTo(e.detail));
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
