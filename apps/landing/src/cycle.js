/* The self-development cycle: five phases on a ring around Agentztein, with equal weight. It advances on its own while it
   is on screen; the dot travels from one phase to the next in step with the timer. It only stops with the pause button,
   when the page is hidden or with reduced motion.
   Tabs, arrows, swipe and the arrow keys move between phases. No auto-advance with reduced motion. */
const cyc = document.getElementById("cycle");

if (cyc) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tabs = [...cyc.querySelectorAll(".ctab")];
  const vis = [...cyc.querySelectorAll(".pv")];
  const txt = [...cyc.querySelectorAll(".pt")];
  const says = [...cyc.querySelectorAll(".say")];
  const playBtn = cyc.querySelector("#cPlay");
  const DUR = 7000;
  let i = 0, timer = 0, playing = !reduce, inView = false;
  const runner = cyc.querySelector(".runner");

  const label = () => {
    const es = document.documentElement.lang === "es";
    playBtn.setAttribute("aria-label", playing ? (es ? "Pausar" : "Pause") : (es ? "Reproducir" : "Play"));
    playBtn.setAttribute("aria-pressed", String(!playing));
  };

  function schedule() {
    clearTimeout(timer);
    const running = playing && inView && !document.hidden;
    cyc.classList.toggle("running", running);
    if (running) timer = setTimeout(() => show(i + 1), DUR);
  }

  function show(n, focus = false) {
    i = (n + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.remove("on");
    });
    void cyc.offsetWidth; // restart the progress bar and the phase's animation
    tabs[i].classList.add("on");
    vis.forEach((v, k) => v.classList.toggle("on", k === i));
    txt.forEach((v, k) => v.classList.toggle("on", k === i));
    says.forEach((v, k) => v.classList.toggle("on", k === i));
    cyc.style.setProperty("--c", tabs[i].style.getPropertyValue("--c"));
    if (runner) {
      runner.style.setProperty("--from", `${i * 72}deg`);
      runner.style.animation = "none"; void runner.getBoundingClientRect(); runner.style.animation = "";
    }
    if (focus) tabs[i].focus();
    schedule();
  }

  tabs.forEach((t, k) => {
    t.addEventListener("click", () => show(k));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); show(i + 1, true); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); show(i - 1, true); }
      if (e.key === "Home") { e.preventDefault(); show(0, true); }
      if (e.key === "End") { e.preventDefault(); show(tabs.length - 1, true); }
    });
  });
  cyc.querySelector("#cPrev").addEventListener("click", () => show(i - 1));
  cyc.querySelector("#cNext").addEventListener("click", () => show(i + 1));
  playBtn.addEventListener("click", () => { playing = !playing; label(); schedule(); });

  // swipe on the picture
  let x0 = null;
  const stage = cyc.querySelector(".core");
  stage.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  stage.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
  });

  document.addEventListener("visibilitychange", schedule);
  document.addEventListener("lang:change", label);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; schedule(); }, { threshold: 0.35 }).observe(cyc);
  // the hero badge ("watches Hacker News") lands on the research phase
  document.querySelector(".hn-pill")?.addEventListener("click", () => show(0));
  label();
  show(0);
}
