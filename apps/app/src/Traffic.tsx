// The site's traffic, only for the owners in ADMIN_EMAILS (ADR-034): how many people come, how far down the landing
// they get, how many make it into the app and sign in, where they come from and the latest visits one by one.
// Everything comes from /api/visits, which reads app.visit_events.
import { useEffect, useState } from "react";
import type { Api, Traffic as TrafficData } from "./api.js";
import { T, useT, type Lang, type Text } from "./i18n.js";

const E = (en: string, es: string): Text => ({ en, es });
const RANGES = [7, 30, 90] as const;
const CTA: Record<string, Text> = {
  inicio: E("Hero (top of the page)", "Hero (arriba de la página)"),
  bar: E("Top bar", "Barra superior"),
  menu: E("Menu", "Menú"),
  app: E("“In the app” section", "Sección “En la app”"),
  page: E("Elsewhere on the page", "Otro lugar de la página"),
};
const DEVICE: Record<string, Text> = { mobile: E("Phone", "Celular"), tablet: E("Tablet", "Tablet"), desktop: E("Computer", "Computadora") };

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
function duration(s: number, lang: Lang) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60 ? `${s % 60} s` : ""}`.trim();
  return lang === "es" ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
function country(code: string | null, lang: Lang) {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function Traffic({ client, lang }: { client: Api; lang: Lang }) {
  const t = useT();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<TrafficData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(null);
    client
      .visits(days)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [client, days]);

  const top = data?.funnel[0]?.visitors ?? 0;
  const deviceName = (d: string | null) => {
    const name = d ? DEVICE[d] : undefined;
    return name ? t(name) : d || "—";
  };
  const stepName = (id: string | null) => {
    const s = data?.funnel.find((f) => f.id === id);
    return s ? s[lang] : "—";
  };

  return (
    <section className="traffic">
      <h1 className="h1">{t(E("Traffic", "Tráfico"))}</h1>
      <p className="lead">
        {t(E(
          "Who visits Agentztein and how far they get: from opening the landing to running the agent. Only you see this; your own visits from this browser are no longer counted.",
          "Quién visita Agentztein y hasta dónde llega: desde abrir la landing hasta correr el agente. Solo tú ves esto; tus propias visitas desde este navegador ya no se cuentan.",
        ))}
      </p>
      <div className="chips" role="group" aria-label={t(E("Period", "Periodo"))}>
        {RANGES.map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>
            {lang === "es" ? `Últimos ${d} días` : `Last ${d} days`}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">{t(E("Loading…", "Cargando…"))}</p>}
      {data && (
        <div className={`traffic-body${busy ? " loading" : ""}`}>
          <div className="kpis">
            <Kpi title={E("Visitors", "Visitantes")} big={data.totals.visitors} sub={lang === "es" ? `${data.totals.newVisitors} nuevos` : `${data.totals.newVisitors} new`} />
            <Kpi title={E("Visits", "Visitas")} big={data.totals.sessions} sub={t(E("a visit ends after 30 idle minutes", "una visita termina tras 30 min sin actividad"))} />
            <Kpi title={E("Time on the landing", "Tiempo en la landing")} big={duration(data.totals.medianSeconds, lang)} sub={t(E("median per visit, with the page on screen", "mediana por visita, con la página en pantalla"))} />
            <Kpi title={E("Reached the app", "Llegaron a la app")} big={`${pct(data.funnel.find((f) => f.id === "app")?.visitors ?? 0, top)}%`} sub={t(E("of those who opened the landing", "de quienes abrieron la landing"))} />
            <Kpi title={E("Signed in", "Iniciaron sesión")} big={data.funnel.find((f) => f.id === "signed_in")?.visitors ?? 0} sub={t(E("visitors who signed in", "visitantes que entraron"))} />
          </div>

          <div className="traffic-grid">
            <article className="traffic-card wide">
              <h2 className="h3">{t(E("How far they get", "Hasta dónde llegan"))}</h2>
              <p className="small muted">{t(E("Visitors who reached each step at least once in the period, as a share of those who opened the landing.", "Visitantes que llegaron a cada paso al menos una vez en el periodo, como parte de quienes abrieron la landing."))}</p>
              <ol className="funnel">
                {data.funnel.map((s) => (
                  <li key={s.id}>
                    <span className="fname">{s[lang]}</span>
                    <span className="bartrack" aria-hidden="true"><i style={{ width: `${pct(s.visitors, top)}%` }} /></span>
                    <span className="fnum"><b>{s.visitors}</b> <small>{pct(s.visitors, top)}%</small></span>
                  </li>
                ))}
              </ol>
            </article>

            <article className="traffic-card wide">
              <h2 className="h3">{t(E("Visitors per day", "Visitantes por día"))}</h2>
              <Daily rows={data.daily} days={days} lang={lang} />
            </article>

            <List title={E("Where they come from", "De dónde vienen")} rows={data.referrers} total={data.totals.visitors} label={(n) => n || t(E("Direct or unknown", "Directo o desconocido"))} />
            <List title={E("Countries", "Países")} rows={data.countries} total={data.totals.visitors} label={(n) => country(n || null, lang)} />
            <List title={E("Devices", "Dispositivos")} rows={data.devices} total={data.totals.visitors} label={deviceName} />
            <List title={E("Buttons to the app", "Botones hacia la app")} rows={data.ctas} total={data.totals.visitors} label={(n) => (CTA[n] ? t(CTA[n]) : n)} empty={E("No clicks yet", "Sin clics todavía")} />
            <List title={E("Tabs opened in the app", "Pestañas abiertas en la app")} rows={data.tabs} total={data.totals.visitors} label={(n) => { const name = (T.tabs as Record<string, Text>)[n]; return name ? t(name) : n; }} empty={E("Nobody in the app yet", "Nadie en la app todavía")} />
            {data.campaigns.length > 0 && <List title={E("Campaigns (utm)", "Campañas (utm)")} rows={data.campaigns} total={data.totals.visitors} label={(n) => n} />}

            <article className="traffic-card wide">
              <h2 className="h3">{t(E("Latest visits", "Últimas visitas"))}</h2>
              {data.sessions.length === 0 ? (
                <p className="muted">{t(E("No visits in this period yet.", "Todavía no hay visitas en este periodo."))}</p>
              ) : (
                <div className="tscroll">
                  <table className="ttable">
                    <thead>
                      <tr>
                        <th>{t(E("When", "Cuándo"))}</th>
                        <th>{t(E("From", "Desde"))}</th>
                        <th>{t(E("Device", "Dispositivo"))}</th>
                        <th>{t(E("Came from", "Llegó de"))}</th>
                        <th>{t(E("Time", "Tiempo"))}</th>
                        <th>{t(E("Got as far as", "Llegó hasta"))}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{new Date(s.started).toLocaleString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                          <td>{country(s.country, lang)}</td>
                          <td>{deviceName(s.device)}</td>
                          <td>{s.referrer ?? t(E("Direct", "Directo"))}</td>
                          <td>{duration(s.seconds, lang)}</td>
                          <td>
                            {stepName(s.reached)}
                            {s.signedIn && <span className="pill ok">{t(E("signed in", "con sesión"))}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({ title, big, sub }: { title: Text; big: number | string; sub: string }) {
  const t = useT();
  return (
    <div className="kpi">
      <h3>{t(title)}</h3>
      <p className="big">{big}</p>
      <p className="sub">{sub}</p>
    </div>
  );
}

function List({ title, rows, total, label, empty }: { title: Text; rows: { name: string; n: number }[]; total: number; label: (name: string) => string; empty?: Text }) {
  const t = useT();
  return (
    <article className="traffic-card">
      <h2 className="h3">{t(title)}</h2>
      {rows.length === 0 ? (
        <p className="muted small">{t(empty ?? E("Nothing yet", "Nada todavía"))}</p>
      ) : (
        <div className="bars">
          {rows.map((r) => (
            <div className="barrow" key={r.name}>
              <span className="barname" title={label(r.name)}>{label(r.name)}</span>
              <span className="bartrack" aria-hidden="true"><i style={{ width: `${pct(r.n, total)}%` }} /></span>
              <b>{r.n}</b>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

/** One bar per day, empty days included, so a quiet day reads as zero instead of disappearing. */
function Daily({ rows, days, lang }: { rows: { day: string; visitors: number }[]; days: number; lang: Lang }) {
  const by = new Map(rows.map((r) => [r.day, r.visitors]));
  const list: { day: string; n: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    list.push({ day: key, n: by.get(key) ?? 0 });
  }
  const max = Math.max(1, ...list.map((d) => d.n));
  const fmt = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short" });
  return (
    <div className="daily" role="img" aria-label={list.map((d) => `${fmt(d.day)}: ${d.n}`).join(", ")}>
      {list.map((d) => (
        <span key={d.day} className="dbar" title={`${fmt(d.day)}: ${d.n}`}>
          <i style={{ height: `${(d.n / max) * 100}%` }} />
        </span>
      ))}
      <span className="daxis"><small>{fmt(list[0]?.day ?? "")}</small><small>{fmt(list.at(-1)?.day ?? "")}</small></span>
    </div>
  );
}
