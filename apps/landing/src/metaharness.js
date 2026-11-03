/* Two small interactions: the Meta picture stays pinned while you scroll and follows the model you are
   reading; and the harness demo, where each scenario travels the five checks until one stops it. */
import { sound } from "./sound.js";
const $ = (s, r = document) => r.querySelector(s);
const lang = () => (document.documentElement.lang === "es" ? "es" : "en");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Meta: pinned picture ---------- */
const meta = $("#meta");
const art = $("#metaArt");
if (meta && art) {
  const items = [...meta.querySelectorAll("[data-focus]")];
  const dots = [...art.querySelectorAll(".art-dots li")];
  const chip = $(".art-chip", art);
  let current = null;
  const focus = (el) => {
    if (!el) return;
    current = el;
    items.forEach((x) => x.classList.toggle("focus", x === el));
    dots.forEach((d) => d.classList.toggle("on", d.dataset.k === el.dataset.focus));
    art.style.setProperty("--m", el.style.getPropertyValue("--m"));
    const icon = el.querySelector(".ico");
    $("#artIco").innerHTML = icon ? icon.outerHTML : "";
    $("#artName").textContent = (el.querySelector("b") ?? el.querySelector(".eff-t"))?.textContent ?? "";
    $("#artVerb").textContent = el.dataset[lang() === "es" ? "verbEs" : "verbEn"] ?? "";
    chip.classList.remove("swap"); void chip.offsetWidth; chip.classList.add("swap");
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) focus(e.target); }), { rootMargin: "-45% 0px -45% 0px" });
  items.forEach((x) => io.observe(x));
  focus(items[0]);
  document.addEventListener("lang:change", () => focus(current));
  if (!reduce) {
    const onScroll = () => {
      const r = meta.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)));
      art.style.setProperty("--p", p.toFixed(3));
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
}

/* ---------- The harness demo: a dome of five layers around Agentztein ----------
   A proposed change (the blue orb) travels the route inward, through one layer per check. The first check it
   fails turns the dome red and sounds the alarm; the last one hands it to a person (amber) and, once approved,
   everything stays green. */
const card = $("#hCard");
if (card) {
  const gates = [...document.querySelectorAll(".hbox .gate")];
  const nodes = [...card.querySelectorAll(".dnode")];
  const layers = [...card.querySelectorAll(".layer")];
  const orb = $("#hOrb", card), burst = $("#hBurst", card), burstRing = $(".burst", burst), tag = $("#hTag", card);
  const pill = $("#hPillTxt", card), count = $("#hCount", card);
  const verdict = $("#hVerdict");
  const approve = $("#hApprove");
  const btns = [...card.querySelectorAll(".scn")];
  const pos = nodes.map((n) => n.getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/).slice(1).map(Number));
  const START = [360, 40], AGENT = [360, 330];
  const at = (el, [x, y]) => { el.style.transform = `translate(${x}px, ${y}px)`; };
  const MSG = [
    { en: "<b>Stopped at “Validated tests”.</b> Improving on tests it had already seen doesn't count: it is measured on a sealed exam it never sees.", es: "<b>Detenido en «Pruebas validadas».</b> Mejorar en pruebas que ya había visto no cuenta: se mide con un examen sellado que nunca ve." },
    { en: "<b>Stopped at “Stays on track”.</b> That skill's scope is web research; in a brand-new game it doesn't switch on.", es: "<b>Detenido en «No se sale del camino».</b> El alcance de esa habilidad es la investigación web; en un juego nuevo no se activa." },
    { en: "<b>Stopped at “Doesn't overspend”.</b> The worst case is above your monthly budget, so it never even calls the model. This already works in the app.", es: "<b>Detenido en «No gasta de más».</b> El peor caso supera tu presupuesto mensual, así que ni siquiera llama al modelo. Esto ya funciona en la app." },
    { en: "<b>Stopped at “No risky moves”.</b> What a page says is data, not an order, and everything runs in an isolated container that can be undone.", es: "<b>Detenido en «Nada riesgoso».</b> Lo que dice una página es un dato, no una orden, y todo corre en un contenedor aislado que se puede deshacer." },
    { en: "<b>It passed the first four.</b> Now it waits for a person: no piece is sewn on without approval.", es: "<b>Pasó las primeras cuatro.</b> Ahora espera a una persona: ninguna pieza se cose sin aprobación." },
  ];
  const DONE = { en: "<b>Approved.</b> It is sewn on with its scope and validity, and the decision stays in a log that can't be edited.", es: "<b>Aprobada.</b> Se cose con su alcance y vigencia, y la decisión queda en un registro que no se edita." };
  const NAMES = [{ en: "Validated tests", es: "Pruebas validadas" }, { en: "Stays on track", es: "No se sale del camino" }, { en: "Doesn't overspend", es: "No gasta de más" }, { en: "No risky moves", es: "Nada riesgoso" }, { en: "A person decides", es: "Lo crítico, por el humano" }];
  const PILL = {
    ok: { en: "SECURE", es: "PROTEGIDO" }, alert: { en: "ALERT · BLOCKED", es: "ALERTA · BLOQUEADO" },
    wait: { en: "WAITING FOR A PERSON", es: "ESPERANDO A UNA PERSONA" }, run: { en: "SCANNING…", es: "ANALIZANDO…" },
  };
  const IDLE = { en: "5-layer dome", es: "Cúpula de 5 capas" };
  let timers = [], stop = -1, approved = false, state = "ok";
  const L = (o) => o[lang()];
  const setState = (st, extra) => {
    state = st;
    card.dataset.state = st === "run" ? "ok" : st;
    pill.textContent = L(PILL[st]);
    count.textContent = extra ? L(extra) : L(IDLE);
  };
  const reset = () => {
    timers.forEach(clearTimeout); timers = [];
    [...gates, ...nodes, ...layers].forEach((g) => g.classList.remove("stop", "wait", "pass"));
    orb.classList.remove("on", "bad", "good");
    burstRing.classList.remove("go");
    tag.classList.remove("on");
    at(orb, START);
    approve.hidden = true;
    setState("ok");
  };
  const mark = (i, kind) => { [gates[i], nodes[i], layers[i]].forEach((e) => e.classList.add(kind)); };
  const step = reduce ? 0 : 520;
  const run = (n) => {
    reset(); stop = n; approved = false;
    btns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.stop) === n)));
    verdict.innerHTML = "…";
    setState("run");
    sound.sfx("shield");
    orb.classList.add("on");
    for (let i = 0; i <= n; i++) {
      timers.push(setTimeout(() => {
        at(orb, pos[i]);
        if (i < n) { timers.push(setTimeout(() => { mark(i, "pass"); sound.sfx("interact", { rate: 1 + i * 0.12 }); }, step * 0.55)); return; }
        // the last layer it reached
        timers.push(setTimeout(() => {
          const wait = n === 4;
          mark(i, wait ? "wait" : "stop");
          verdict.innerHTML = L(MSG[n]);
          approve.hidden = !wait;
          tag.textContent = (wait ? "⏸ " : "✕ ") + L(NAMES[n]);
          tag.classList.add("on");
          if (wait) { orb.classList.add("good"); setState("wait", { en: `Layer ${n + 1} of 5`, es: `Capa ${n + 1} de 5` }); sound.sfx("shield"); sound.say("h-wait"); return; }
          orb.classList.add("bad");
          at(burst, pos[i]); void burstRing.getBBox?.(); burstRing.classList.add("go");
          setState("alert", { en: `Blocked at layer ${n + 1} of 5`, es: `Bloqueado en la capa ${n + 1} de 5` });
          sound.sfx("shieldhit"); timers.push(setTimeout(() => sound.sfx("alarm"), 350)); sound.say("h-blocked");
        }, step * 0.55));
      }, 200 + i * step));
    }
  };
  at(orb, START); at(burst, START);
  btns.forEach((b) => b.addEventListener("click", () => run(Number(b.dataset.stop))));
  approve.addEventListener("click", () => {
    approved = true;
    approve.hidden = true;
    [gates[4], nodes[4], layers[4]].forEach((e) => { e.classList.remove("wait"); e.classList.add("pass"); });
    at(orb, AGENT);
    tag.classList.remove("on");
    timers.push(setTimeout(() => {
      setState("ok", { en: "Approved · safe to learn", es: "Aprobada · segura para aprender" });
      orb.classList.add("good");
      verdict.innerHTML = L(DONE);
      sound.sfx("success"); sound.say("h-ok");
    }, step + 100));
  });
  document.addEventListener("lang:change", () => {
    pill.textContent = L(PILL[state]);
    if (stop < 0) count.textContent = L(IDLE);
    if (stop >= 0) verdict.innerHTML = approved ? L(DONE) : L(MSG[stop]);
  });
}
