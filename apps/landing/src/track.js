// Visit counting shared by the landing and the app (ADR-034); the app imports it as @landing/track.js.
// The browser keeps a random visitor id (localStorage) and a session that ends after 30 minutes without activity.
// No cookies, no IP, nothing about the person: events are batched and sent with sendBeacon, so they never slow the
// page and still arrive when the tab closes. Nothing is sent with Global Privacy Control or Do Not Track on, or in a
// browser that opted out with ?notrack=1 (the owners' browsers opt out by themselves when they open the app).

const VID = "agz.vid";
const SID = "agz.sid";
const OFF = "agz.notrack";
const IDLE = 30 * 60 * 1000;
const ENDPOINT = "/api/track";

/** @type {{ page: "landing" | "app", v: string, s: string, extra: Record<string, unknown> | null } | null} */
let ctx = null;
/** @type {{ e: string, t?: string, n?: number }[]} */
let queue = [];
let timer = 0;
let shownAt = 0;
let shownMs = 0;

const read = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, v); } catch { /* private mode: the ids live only for this page */ }
};
const rid = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

function optedOut() {
  try {
    const q = new URLSearchParams(location.search).get("notrack");
    if (q === "1") write(OFF, "1");
    if (q === "0") localStorage.removeItem(OFF);
  } catch { /* ignore */ }
  const nav = /** @type {Navigator & { globalPrivacyControl?: boolean }} */ (navigator);
  return read(OFF) === "1" || nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

/** The current session, renewed on every event; a new one starts after 30 idle minutes. */
function session() {
  let s = null;
  try { s = JSON.parse(read(SID) ?? "null"); } catch { s = null; }
  const now = Date.now();
  const id = s && typeof s.id === "string" && now - Number(s.at) < IDLE ? s.id : rid();
  write(SID, JSON.stringify({ id, at: now }));
  return id;
}

function payload(events) {
  if (!ctx) return null;
  const body = { v: ctx.v, s: session(), page: ctx.page, lang: document.documentElement.lang, events, ...(ctx.extra ?? {}) };
  ctx.extra = null; // the referrer and campaign go with the first batch only
  return JSON.stringify(body);
}

/** Sends what is queued. `beacon` when the page may be going away. */
function flush(beacon = false) {
  clearTimeout(timer);
  if (!ctx || !queue.length) return;
  const body = payload(queue);
  queue = [];
  if (!body) return;
  try {
    if (beacon && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  } catch { /* never let counting break the page */ }
}

function reportShown() {
  if (shownAt) shownMs += Date.now() - shownAt;
  shownAt = 0;
  if (shownMs >= 1000) track("leave", undefined, shownMs);
  shownMs = 0;
  flush(true);
}

/**
 * Starts counting this page. Call once. Sends the page view with where the visitor came from.
 * @param {"landing" | "app"} page
 * @param {string} [target] what the view is of (the app's tab)
 */
export function startTracking(page, target) {
  if (ctx || optedOut()) return;
  let v = read(VID);
  if (!v || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) { v = rid(); write(VID, v); }
  const qs = new URLSearchParams(location.search);
  const utm = { source: qs.get("utm_source"), medium: qs.get("utm_medium"), campaign: qs.get("utm_campaign") };
  ctx = { page, v, s: "", extra: { ref: document.referrer || null, ...(utm.source ? { utm } : {}) } };
  track("view", target);
  flush();
  shownAt = document.visibilityState === "visible" ? Date.now() : 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") reportShown();
    else shownAt = Date.now();
  });
  addEventListener("pagehide", reportShown);
}

/**
 * Counts one thing the visitor did. Batched for a moment, then sent.
 * @param {string} event view | section | cta | lab | leave | tab | signin
 * @param {string} [target]
 * @param {number} [value]
 */
export function track(event, target, value) {
  if (!ctx) return;
  queue.push({ e: event, ...(target ? { t: target } : {}), ...(value != null ? { n: value } : {}) });
  if (queue.length >= 20) flush();
  else { clearTimeout(timer); timer = setTimeout(flush, 1500); }
}

/** The app reports a sign-in once per session, with the token, so the server can tie the visit to the account. */
export function trackSignIn(token) {
  if (!ctx) return;
  const key = "agz.signed";
  try { if (sessionStorage.getItem(key) === session()) return; sessionStorage.setItem(key, session()); } catch { /* ignore */ }
  flush();
  const body = payload([{ e: "signed_in" }]);
  if (!body) return;
  void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain", authorization: `Bearer ${token}` } }).catch(() => {});
}

/** This browser stops counting from now on (the owners' own visits shouldn't inflate the numbers). */
export function stopTracking() {
  write(OFF, "1");
  queue = [];
  ctx = null;
}
