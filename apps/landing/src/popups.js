/* Floating popups: any element with data-pop-en / data-pop-es (and data-pop-title-en / -es) shows a small card
   right next to it on hover, focus or tap, so the explanation appears where the question is. */
const pop = document.createElement("div");
pop.className = "pop"; pop.id = "pop"; pop.setAttribute("role", "tooltip");
document.body.append(pop);
let cur = null;
const lang = () => (document.documentElement.lang === "es" ? "Es" : "En");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function place(el) {
  const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const below = r.top - h - 14 < 8;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? r.bottom + 14 : r.top - h - 14}px`;
  pop.style.setProperty("--ax", `${Math.min(Math.max(18, r.left + r.width / 2 - left), w - 18)}px`);
  pop.classList.toggle("below", below);
}
function show(el) {
  if (!el.dataset[`pop${lang()}`]) return;
  cur = el;
  pop.innerHTML = `<b>${esc(el.dataset[`popTitle${lang()}`])}</b>${esc(el.dataset[`pop${lang()}`])}`;
  pop.style.setProperty("--c", getComputedStyle(el).getPropertyValue("--c"));
  place(el);
  pop.classList.add("on");
  el.setAttribute("aria-describedby", "pop");
  el.setAttribute("aria-expanded", "true");
}
function hide() {
  if (cur) { cur.removeAttribute("aria-describedby"); cur.setAttribute("aria-expanded", "false"); }
  cur = null; pop.classList.remove("on");
}
const target = (e) => e.target.closest?.("[data-pop-en]");
document.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse") { const t = target(e); if (t && t !== cur) show(t); } });
document.addEventListener("pointerout", (e) => { if (cur && e.pointerType === "mouse" && target(e) === cur && !cur.contains(e.relatedTarget)) hide(); });
document.addEventListener("focusin", (e) => { const t = target(e); if (t) show(t); });
document.addEventListener("focusout", (e) => { if (target(e) === cur) hide(); });
document.addEventListener("click", (e) => { const t = target(e); if (!t) return hide(); if (t === cur && e.detail > 0 && pop.classList.contains("on") && e.pointerType !== "mouse") hide(); else show(t); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
addEventListener("scroll", () => { if (cur) hide(); }, { passive: true });
document.addEventListener("lang:change", () => { if (cur) show(cur); });
