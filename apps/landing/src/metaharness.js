/* Two small interactions: the Meta picture stays pinned while you scroll and follows the model you are
   reading; and the harness demo, where each scenario travels the five checks until one stops it. */
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

/* ---------- The harness demo ---------- */
const box = $(".hbox");
if (box) {
  const gates = [...box.querySelectorAll(".gate")];
  const ticks = [...box.querySelectorAll(".track .tick")];
  const end = $(".track .end", box);
  const token = $(".track .token", box);
  const verdict = $("#hVerdict");
  const approve = $("#hApprove");
  const btns = [...box.querySelectorAll(".scn")];
  const POS = ticks.map((t) => parseFloat(t.style.left));
  const MSG = [
    { en: "<b>Stopped at “Validated tests”.</b> Improving on tests it had already seen doesn't count: it is measured on a sealed exam it never sees.", es: "<b>Detenido en «Pruebas validadas».</b> Mejorar en pruebas que ya había visto no cuenta: se mide con un examen sellado que nunca ve." },
    { en: "<b>Stopped at “Stays on track”.</b> That skill's scope is web research; in a brand-new game it doesn't switch on.", es: "<b>Detenido en «No se sale del camino».</b> El alcance de esa habilidad es la investigación web; en un juego nuevo no se activa." },
    { en: "<b>Stopped at “Doesn't overspend”.</b> The worst case is above your monthly budget, so it never even calls the model. This already works in the app.", es: "<b>Detenido en «No gasta de más».</b> El peor caso supera tu presupuesto mensual, así que ni siquiera llama al modelo. Esto ya funciona en la app." },
    { en: "<b>Stopped at “No risky moves”.</b> What a page says is data, not an order, and everything runs in an isolated container that can be undone.", es: "<b>Detenido en «Nada riesgoso».</b> Lo que dice una página es un dato, no una orden, y todo corre en un contenedor aislado que se puede deshacer." },
    { en: "<b>It passed the first four.</b> Now it waits for a person: no piece is sewn on without approval.", es: "<b>Pasó las primeras cuatro.</b> Ahora espera a una persona: ninguna pieza se cose sin aprobación." },
  ];
  const DONE = { en: "<b>Approved.</b> It is sewn on with its scope and validity, and the decision stays in a log that can't be edited.", es: "<b>Aprobada.</b> Se cose con su alcance y vigencia, y la decisión queda en un registro que no se edita." };
  let timers = [], stop = -1, approved = false;
  const L = (o) => o[lang()];
  const reset = () => {
    timers.forEach(clearTimeout); timers = [];
    gates.forEach((g) => g.classList.remove("stop", "wait", "pass"));
    ticks.forEach((t) => t.classList.remove("stop", "wait", "pass"));
    end.classList.remove("pass");
    token.style.left = "0%";
    approve.hidden = true;
  };
  const step = reduce ? 0 : 450;
  const run = (n) => {
    reset(); stop = n; approved = false;
    btns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.stop) === n)));
    verdict.innerHTML = "…";
    for (let i = 0; i <= n; i++) {
      timers.push(setTimeout(() => {
        token.style.left = `calc(${POS[i]}% - 9px)`;
        if (i < n) { ticks[i].classList.add("pass"); gates[i].classList.add("pass"); return; }
        const kind = n === 4 ? "wait" : "stop";
        ticks[i].classList.add(kind); gates[i].classList.add(kind);
        verdict.innerHTML = L(MSG[n]);
        approve.hidden = n !== 4;
      }, 200 + i * step));
    }
  };
  btns.forEach((b) => b.addEventListener("click", () => run(Number(b.dataset.stop))));
  approve.addEventListener("click", () => {
    approved = true;
    approve.hidden = true;
    ticks[4].classList.replace("wait", "pass"); gates[4].classList.replace("wait", "pass");
    token.style.left = "calc(100% - 27px)";
    timers.push(setTimeout(() => { end.classList.add("pass"); verdict.innerHTML = L(DONE); }, step + 100));
  });
  document.addEventListener("lang:change", () => { if (stop >= 0) verdict.innerHTML = approved ? L(DONE) : L(MSG[stop]); });
}
