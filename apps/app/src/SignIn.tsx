import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { LangSwitch } from "./App.js";
import { T, useT, type Lang } from "./i18n.js";
import { GoogleG, HnMark } from "./Logos.js";

export function SignIn({ supabase, lang, setLang }: { supabase: SupabaseClient; lang: Lang; setLang: (l: Lang) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const google = async () => {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/app/`, queryParams: { prompt: "select_account" } },
    });
    if (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <main className="signin">
      <section className="signin-art" aria-hidden="true">
        <img src="/img/lab.webp" alt="" width={1600} height={1000} />
      </section>
      <section className="signin-box">
        <div className="row between">
          <a className="word" href="/"><i aria-hidden="true" />Agentztein</a>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <div className="signin-copy">
          <h1>{t(T.signInTitle)}</h1>
          <p className="lead">{t(T.signInLead)}</p>
          <ul className="checks">
            {T.signInBullets[lang].map((b, i) => (
              <li key={b}>{i === 1 ? <HnMark size={18} /> : <span className="tick" aria-hidden="true">✓</span>}{b}</li>
            ))}
          </ul>
          <button type="button" className="google" onClick={() => void google()} disabled={busy} aria-busy={busy}>
            <GoogleG />
            {t(T.google)}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
          <p className="fine">{t(T.signInFine)}</p>
        </div>
        <a className="link" href="/">← {t(T.back)}</a>
      </section>
    </main>
  );
}
