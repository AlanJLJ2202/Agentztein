// The signed-in side of Agentztein: Google sign-in through Supabase Auth, then the user's own lab.
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { api, getConfig, type Api, type Config, type SavedKey } from "./api.js";
import { Agent } from "./Agent.js";
import { Brain } from "./Brain.js";
import { initialLang, LangContext, saveLang, T, useT, type Lang } from "./i18n.js";
import { Overview } from "./Overview.js";
import { Radar } from "./Radar.js";
import { SignIn } from "./SignIn.js";
import { Workshop } from "./Workshop.js";

export type Tab = "overview" | "brain" | "radar" | "agent" | "workshop";
const TABS: Tab[] = ["overview", "brain", "radar", "agent", "workshop"];
const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
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
          <a className="word" href="/"><img src="/img/logo.webp" alt="Agentztein" width={126} height={26} /></a>
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
  const go = (next: Tab) => {
    location.hash = next;
    setTab(next);
    scrollTo({ top: 0 });
  };
  const meta = session.user.user_metadata as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const name = meta.full_name ?? meta.name ?? session.user.email ?? "";
  const avatar = meta.avatar_url ?? meta.picture;

  return (
    <>
      <header className="bar">
        <div className="wrap row">
          <a className="word" href="/" aria-label="Agentztein"><img src="/img/logo.webp" alt="Agentztein" width={126} height={26} /></a>
          <nav className="tabs" aria-label={lang === "es" ? "Secciones" : "Sections"}>
            {TABS.map((id) => (
              <a key={id} href={`#${id}`} aria-current={tab === id ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(id); }}>
                {t(T.tabs[id])}
              </a>
            ))}
          </nav>
          <LangSwitch lang={lang} setLang={setLang} />
          <div className="me">
            {avatar ? <img src={avatar} alt="" width={32} height={32} referrerPolicy="no-referrer" /> : <span className="initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
            <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>{t(T.signOut)}</button>
          </div>
        </div>
      </header>
      <main className="wrap page">
        {!config.ready && (
          <p className="notice" role="status">
            {t(T.setupTitle)}: {config.missing.map((m) => <code key={m}>{m}</code>)}
          </p>
        )}
        {tab === "overview" && <Overview name={name.split(" ")[0] ?? ""} keys={keys} notesCount={notesCount} go={go} client={client} onKeys={setKeys} onNotes={setNotesCount} />}
        {tab === "brain" && <Brain client={client} keys={keys} onKeys={setKeys} go={go} />}
        {tab === "agent" && <Agent client={client} go={go} lang={lang} />}
        {tab === "workshop" && <Workshop client={client} go={go} />}
        {tab === "radar" && <Radar client={client} keys={keys} onKeys={setKeys} onNotes={setNotesCount} go={go} lang={lang} />}
      </main>
    </>
  );
}
