// The signed-in side of Agentztein: Google sign-in through Supabase Auth, then the user's own lab.
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api, dbText, getConfig, type Api, type Config, type SavedKey } from "./api.js";
import { Agent } from "./Agent.js";
import { Brain } from "./Brain.js";
import { Evolve } from "./Evolve.js";
import { initialLang, LangContext, saveLang, T, useT, type Lang } from "./i18n.js";
import { Overview } from "./Overview.js";
import { Radar } from "./Radar.js";
import { SignIn } from "./SignIn.js";
import { Companion } from "./Companion.js";
import { Lab3D } from "./Lab3D.js";
import { LiveProvider } from "./live.js";
import { Mind } from "./Mind.js";
import { Path, showPath } from "./Path.js";

export type Tab = "overview" | "mind" | "lab" | "agent" | "evolve" | "radar" | "brain";
const TABS: Tab[] = ["overview", "mind", "lab", "agent", "evolve", "radar", "brain"];
// the nav puts what you need to start first, then the places to explore
const ESSENTIAL: Tab[] = ["overview", "agent", "brain"];
const EXPLORE: Tab[] = ["mind", "lab", "radar", "evolve"];
const TAB_HINT: Record<Tab, { en: string; es: string }> = {
  overview: { en: "Your board: how it's doing and what's next", es: "Tu tablero: cómo va y qué sigue" },
  agent: { en: "Put it to practice and see each cycle as a network", es: "Ponlo a practicar y ve cada corrida como red" },
  brain: { en: "Your Meta key, your budget and its voice", es: "Tu llave de Meta, tu presupuesto y su voz" },
  mind: { en: "Everything it learned, as a graph", es: "Todo lo que aprendió, como grafo" },
  lab: { en: "Follow it room by room in 3D", es: "Síguelo cuarto por cuarto en 3D" },
  radar: { en: "AI news it reads for ideas", es: "Noticias de IA que lee para sacar ideas" },
  evolve: { en: "It rewrites its own code, behind a judge", es: "Reescribe su propio código, con un juez" },
};
const tabFromHash = (): Tab => {
  const raw = location.hash.slice(1);
  const h = raw === "workshop" ? "lab" : raw; // the old 2D workshop became the 3D lab
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
      <header className="bar">
        <div className="wrap row">
          <a className="word" href="/" aria-label="Agentztein"><img src="/img/logo.webp" alt="Agentztein" width={155} height={32} /></a>
          <nav className="tabs" aria-label={lang === "es" ? "Secciones" : "Sections"}>
            {[...ESSENTIAL, ...EXPLORE].map((id) => (
              <Fragment key={id}>
                {EXPLORE[0] === id && <span className="tabs-sep" aria-hidden="true">{lang === "es" ? "Explorar" : "Explore"}</span>}
                <a href={`#${id}`} title={t(TAB_HINT[id])} aria-current={tab === id ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(id); }}>
                  {t(T.tabs[id])}
                </a>
              </Fragment>
            ))}
          </nav>
          <button type="button" className="guide-btn" onClick={showPath} title={lang === "es" ? "Mostrar la guía paso a paso" : "Show the step-by-step guide"}>
            ? <span>{lang === "es" ? "Guía" : "Guide"}</span>
          </button>
          <LangSwitch lang={lang} setLang={setLang} />
          <div className="me">
            {avatar ? <img src={avatar} alt="" width={32} height={32} referrerPolicy="no-referrer" /> : <span className="initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
            <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>{t(T.signOut)}</button>
          </div>
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
        {tab === "lab" && <Lab3D go={go} lang={lang} />}
        {tab === "radar" && <Radar client={client} keys={keys} onKeys={setKeys} onNotes={setNotesCount} go={go} lang={lang} />}
      </main>
      <Companion tab={tab} go={go} client={client} lang={lang} />
    </LiveProvider>
  );
}
