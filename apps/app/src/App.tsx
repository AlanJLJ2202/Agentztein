// The signed-in side of Agentztein: Google sign-in through Supabase Auth, then the user's own lab.
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, dbText, getConfig, type Api, type Config, type SavedKey } from "./api.js";
import { Agent } from "./Agent.js";
import { Brain } from "./Brain.js";
import { Evolve } from "./Evolve.js";
import { initialLang, LangContext, saveLang, T, useT, type Lang } from "./i18n.js";
import { Overview } from "./Overview.js";
import { Radar } from "./Radar.js";
import { SignIn } from "./SignIn.js";
import { Companion } from "./Companion.js";
import { Process } from "./Process.js";
import { LiveProvider } from "./live.js";
import { TranslateProvider } from "./translate.js";
import { Mind } from "./Mind.js";
import { Path, showPath } from "./Path.js";
import { Traffic } from "./Traffic.js";
import { startTracking, stopTracking, track, trackSignIn } from "@landing/track.js";

export type Tab = "overview" | "mind" | "lab" | "agent" | "evolve" | "radar" | "brain" | "traffic";
const TABS: Tab[] = ["overview", "mind", "lab", "agent", "evolve", "radar", "brain", "traffic"];
// the nav puts what you need to start first, then the places to explore
const ESSENTIAL: Tab[] = ["overview", "agent", "lab", "brain"];
const EXPLORE: Tab[] = ["mind", "radar", "evolve"];
const TAB_HINT: Record<Tab, { en: string; es: string }> = {
  overview: { en: "Your board: how it's doing and what's next", es: "Tu tablero: cómo va y qué sigue" },
  agent: { en: "Put it to practice and see each cycle as a network", es: "Ponlo a practicar y ve cada corrida como red" },
  brain: { en: "Your Meta key, your budget and its voice", es: "Tu llave de Meta, tu presupuesto y su voz" },
  mind: { en: "Everything it learned, as a graph", es: "Todo lo que aprendió, como grafo" },
  lab: { en: "Watch it think: what it did, what it decided and what it asks you to approve (or in 3D)", es: "Míralo pensar: qué hizo, qué decidió y qué te pide aprobar (o en 3D)" },
  radar: { en: "AI news it reads for ideas", es: "Noticias de IA que lee para sacar ideas" },
  evolve: { en: "It rewrites its own code, behind a judge", es: "Reescribe su propio código, con un juez" },
  traffic: { en: "Who visits the site and how far they get (only the owners see it)", es: "Quién visita el sitio y hasta dónde llega (solo lo ven los dueños)" },
};
const tabFromHash = (): Tab => {
  const raw = location.hash.slice(1);
  const h = raw === "workshop" || raw === "lab3d" ? "lab" : raw; // the old 2D workshop and the 3D lab live in the process tab
  return (TABS as string[]).includes(h) ? (h as Tab) : "overview";
};

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    saveLang(lang);
    document.title = `Agentztein · ${T.appTitle[lang]}`;
  }, [lang]);
  useEffect(() => {
    void getConfig().then(setConfig);
    startTracking("app"); // visit counting (ADR-034); a no-op in browsers that opted out
  }, []);

  const supabase = useMemo(
    () =>
      config?.supabaseUrl && config.supabaseAnonKey
        ? createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } })
        : null,
    [config],
  );

  return (
    <LangContext.Provider value={lang}>
      {!config ? (
        <Splash />
      ) : !supabase ? (
        <Setup missing={config.missing} lang={lang} setLang={setLang} />
      ) : (
        <Authed supabase={supabase} config={config} lang={lang} setLang={setLang} />
      )}
    </LangContext.Provider>
  );
}

type MenuItem = { key: string; title: string; sub?: string; on?: boolean; act: () => void };
/** A button that opens a short list: the places to explore, or your account. Closes on a pick, a click outside or Esc. */
function Menu({ label, items, current, face, head, className = "", align = "left" }: { label: string; items: MenuItem[]; current?: string | null; face?: ReactNode; head?: string; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("mousedown", out);
    addEventListener("keydown", esc);
    return () => { removeEventListener("mousedown", out); removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={`menu ${className}`} ref={box}>
      <button type="button" className={`menu-btn${current ? " on" : ""}${face ? " face" : ""}`} aria-haspopup="true" aria-expanded={open} aria-label={face ? label : undefined} title={face ? label : undefined} onClick={() => setOpen((o) => !o)}>
        {face ?? (current ?? label)}
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className={`menu-pop ${align}`} role="menu">
          {head && <p className="menu-head">{head}</p>}
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitem" aria-current={it.on ? "page" : undefined} onClick={() => { setOpen(false); it.act(); }}>
              <b>{it.title}</b>
              {it.sub && <small>{it.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Splash() {
  const t = useT();
  return (
    <div className="splash" role="status">
      <img className="splash-logo" src="/img/logo.webp" alt="Agentztein" width={213} height={44} />
      <span className="spin" aria-hidden="true" />
      {t(T.loading)}
    </div>
  );
}

export function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="lang" role="group" aria-label={lang === "es" ? "Idioma" : "Language"}>
      {(["en", "es"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Setup({ missing, lang, setLang }: { missing: string[]; lang: Lang; setLang: (l: Lang) => void }) {
  const t = useT();
  return (
    <main className="center">
      <div className="panel narrow">
        <div className="row between">
          <a className="word" href="/"><img src="/img/logo.webp" alt="Agentztein" width={155} height={32} /></a>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <h1 className="h2">{t(T.setupTitle)}</h1>
        <p className="muted">{t(T.setupLead)}</p>
        <ul className="codes">{missing.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
        <a className="btn ghost" href="/">{t(T.back)}</a>
      </div>
    </main>
  );
}

function Authed({ supabase, config, lang, setLang }: { supabase: SupabaseClient; config: Config; lang: Lang; setLang: (l: Lang) => void }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (session === null) track("signin");
  }, [session]);

  if (session === undefined) return <Splash />;
  if (!session) return <SignIn supabase={supabase} google={config.google} lang={lang} setLang={setLang} />;
  return <Shell supabase={supabase} session={session} config={config} lang={lang} setLang={setLang} />;
}

function Shell({ supabase, session, config, lang, setLang }: { supabase: SupabaseClient; session: Session; config: Config; lang: Lang; setLang: (l: Lang) => void }) {
  const t = useT();
  const client: Api = useMemo(() => api(supabase), [supabase]);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [keys, setKeys] = useState<SavedKey[] | null>(null);
  const [notesCount, setNotesCount] = useState(0);
  // the owners see the site's traffic; their own browser stops counting itself
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    trackSignIn(session.access_token);
    void client.isAdmin().then((yes) => {
      setAdmin(yes);
      if (yes) stopTracking();
    });
  }, [client]); // once per signed-in session: the token only ties the visit to the account
  useEffect(() => {
    track("tab", tab);
  }, [tab]);
  useEffect(() => {
    const on = () => setTab(tabFromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  // A fresh sign-in lands with ?code=… in the URL; leave a clean address behind.
  useEffect(() => {
    if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
  }, []);
  const go = (next: Tab, anchor?: string) => {
    location.hash = next;
    setTab(next);
    if (anchor) {
      // wait for the tab to render, then bring the anchor into view
      let tries = 0;
      const find = () => {
        const el = document.getElementById(anchor);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else if (tries++ < 20) setTimeout(find, 150);
      };
      setTimeout(find, 80);
    } else scrollTo({ top: 0 });
  };
  const meta = session.user.user_metadata as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const name = meta.full_name ?? meta.name ?? session.user.email ?? "";
  const avatar = meta.avatar_url ?? meta.picture;

  return (
    <LiveProvider client={client}>
      <TranslateProvider client={client} lang={lang}>
      <header className="bar">
        <div className="wrap row">
          <a className="word" href="/" aria-label="Agentztein"><img src="/img/logo.webp" alt="Agentztein" width={155} height={32} /></a>
          <nav className="tabs" aria-label={lang === "es" ? "Secciones" : "Sections"}>
            {ESSENTIAL.filter((id) => id !== "brain").map((id) => (
              <a key={id} href={`#${id}`} title={t(TAB_HINT[id])} aria-current={tab === id ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(id); }}>
                {t(T.tabs[id])}
              </a>
            ))}
            <Menu
              label={lang === "es" ? "Explorar" : "Explore"}
              current={[...EXPLORE, "traffic"].includes(tab) ? t(T.tabs[tab]) : null}
              items={[...EXPLORE, ...(admin ? (["traffic"] as Tab[]) : [])].map((id) => ({ key: id, title: t(T.tabs[id]), sub: t(TAB_HINT[id]), on: tab === id, act: () => go(id) }))}
            />
          </nav>
          <LangSwitch lang={lang} setLang={setLang} />
          <Menu
            className="me"
            align="right"
            label={lang === "es" ? "Tu cuenta" : "Your account"}
            face={avatar ? <img src={avatar} alt="" width={32} height={32} referrerPolicy="no-referrer" /> : <span className="initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
            head={name}
            items={[
              { key: "brain", title: t(T.tabs.brain), sub: t(TAB_HINT.brain), on: tab === "brain", act: () => go("brain") },
              { key: "guide", title: lang === "es" ? "Guía paso a paso" : "Step-by-step guide", sub: lang === "es" ? "Qué sigue y por qué" : "What's next and why", act: showPath },
              { key: "out", title: t(T.signOut), act: () => void supabase.auth.signOut() },
            ]}
          />
        </div>
      </header>
      <Path tab={tab} go={go} keys={keys} />
      <main className="wrap page">
        {config.missing.length > 0 && (
          <p className="notice" role="status">
            {t(T.setupTitle)}: {config.missing.map((m) => <code key={m}>{m}</code>)}
          </p>
        )}
        {config.database && config.database.status !== "ok" && config.database.status !== "missing" && (
          <p className="notice" role="alert">
            <b>{t(T.db.title)}.</b> {dbText(config.database.status)}
          </p>
        )}
        {tab === "overview" && <Overview name={name.split(" ")[0] ?? ""} keys={keys} notesCount={notesCount} go={go} client={client} onKeys={setKeys} onNotes={setNotesCount} />}
        {tab === "brain" && <Brain client={client} keys={keys} onKeys={setKeys} go={go} />}
        {tab === "agent" && <Agent client={client} go={go} lang={lang} />}
        {tab === "evolve" && <Evolve client={client} go={go} />}
        {tab === "mind" && <Mind go={go} />}
        {tab === "lab" && <Process client={client} go={go} lang={lang} />}
        {tab === "traffic" && (admin ? <Traffic client={client} lang={lang} /> : <p className="muted">{admin === null ? t(T.loading) : lang === "es" ? "Solo los dueños del sitio ven su tráfico (ADMIN_EMAILS)." : "Only the site's owners see its traffic (ADMIN_EMAILS)."}</p>)}
        {tab === "radar" && <Radar client={client} keys={keys} onKeys={setKeys} onNotes={setNotesCount} go={go} lang={lang} />}
      </main>
      <Companion tab={tab} go={go} client={client} lang={lang} />
      </TranslateProvider>
    </LiveProvider>
  );
}
