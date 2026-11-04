// The landing's own counting (ADR-034), loaded as a small separate script so a visit counts even before the 3D lab
// finishes downloading. What it reports: the view, each section the visitor scrolled to, the clicks that lead to the
// app, the first time they play with the 3D lab, and how long the page was on screen.
import { startTracking, track } from "./track.js";

const root = document.documentElement;
if (!root.classList.contains("embed")) {
  startTracking("landing");

  // a section counts once its top passes 60% of the screen (tall sections never fit whole)
  const seen = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const id = en.target.id || "fin";
        io.unobserve(en.target);
        if (seen.has(id)) continue;
        seen.add(id);
        track("section", id);
      }
    },
    { rootMargin: "0px 0px -40% 0px" },
  );
  for (const el of document.querySelectorAll("main > section[id]:not(#inicio), body > footer")) io.observe(el);

  // the buttons that take people to the app, named after where they are on the page
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href^="/app"]') : null;
      if (!a) return;
      const where = a.closest("section[id]")?.id ?? (a.closest(".links, .menu-cta") ? "menu" : a.closest("header") ? "bar" : "page");
      track("cta", where);
    },
    { capture: true },
  );

  // the first touch, click or key on the 3D lab
  const room = document.getElementById("room3d");
  if (room) {
    const once = () => {
      track("lab");
      for (const t of ["pointerdown", "keydown"]) room.removeEventListener(t, once);
    };
    for (const t of ["pointerdown", "keydown"]) room.addEventListener(t, once);
  }
}
