// Sign in with Google, or with email and password confirmed by a 6-digit code sent by email.
// The code comes from Supabase's email templates ({{ .Token }}); see README → "Login".
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import type { Config } from "./api.js";
import { LangSwitch } from "./App.js";
import { GoogleButton } from "./GoogleButton.js";
import { T, useT, type Lang } from "./i18n.js";
import { Check, HnMark } from "./Logos.js";

type Mode = "signin" | "signup" | "verify" | "forgot" | "reset";
const A = T.auth;

/** Supabase answers in English; these are the cases people actually hit. */
function friendly(message: string, t: (x: { en: string; es: string }) => string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return t(A.errBadLogin);
  if (m.includes("already registered") || m.includes("already been registered")) return t(A.errExists);
  if (m.includes("expired") || (m.includes("invalid") && m.includes("otp"))) return t(A.errCode);
  if (m.includes("rate limit") || m.includes("security purposes")) return t(A.errRate);
  if (m.includes("password") && (m.includes("least") || m.includes("weak"))) return t(A.errWeak);
  if (m.includes("audience")) return t(A.errGoogleAudience);
  if (m.includes("nonce")) return t(A.errGoogleNonce);
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return t(A.errGoogleOff);
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return t(A.errNoSignup);
  return message;
}

export function SignIn({ supabase, google: gconf, lang, setLang }: { supabase: SupabaseClient; google?: Config["google"]; lang: Lang; setLang: (l: Lang) => void }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
    setCode("");
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (e) {
      setError(friendly((e as Error).message, t));
    } finally {
      setBusy(false);
    }
  };
  const redirectTo = `${location.origin}/app/`;

  const onGoogleError = useCallback((message: string) => setError(friendly(message, t)), [t]);
  const googleOff = gconf?.status === "disabled" || gconf?.status === "mismatch";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signin")
      void run(async () => {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err && /not confirmed/i.test(err.message)) {
          await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
          setCooldown(60);
          go("verify");
          setInfo(t(A.notConfirmed));
          return;
        }
        if (err) throw err;
      });
    if (mode === "signup")
      void run(async () => {
        const { data, error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: name.trim() ? { full_name: name.trim() } : {} } });
        if (err) throw err;
        if (data.session) return; // email confirmation is off in this project: already signed in
        setCooldown(60);
        go("verify");
      });
    if (mode === "verify")
      void run(async () => {
        let { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
        if (err) ({ error: err } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" }));
        if (err) throw err;
      });
    if (mode === "forgot")
      void run(async () => {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (err) throw err;
        setCooldown(60);
        go("reset");
      });
    if (mode === "reset")
      void run(async () => {
        const { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
        if (err) throw err;
        const { error: upd } = await supabase.auth.updateUser({ password });
        if (upd) throw upd;
      });
  };

  const resend = () =>
    run(async () => {
      const { error: err } = mode === "reset"
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        : await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
      if (err) throw err;
      setCooldown(60);
      setInfo(t(A.resent));
    });

  const codeStep = mode === "verify" || mode === "reset";
  const pwOk = password.length >= 8;
  const canSubmit =
    mode === "signin" ? email.includes("@") && password.length > 0
    : mode === "signup" ? email.includes("@") && pwOk
    : mode === "forgot" ? email.includes("@")
    : mode === "verify" ? code.length === 6
    : code.length === 6 && pwOk;

  return (
    <main className="signin">
      <section className="signin-art" aria-hidden="true">
        <img src="/img/lab.webp" alt="" width={1600} height={1000} />
      </section>
      <section className="signin-box">
        <div className="row between">
          <a className="word" href="/"><img src="/img/logo.webp" alt="Agentztein" width={126} height={26} /></a>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <div className="signin-copy">
          {!codeStep && mode !== "forgot" ? (
            <>
              <h1>{t(T.signInTitle)}</h1>
              <p className="lead">{t(T.signInLead)}</p>
              <ul className="checks">
                {T.signInBullets[lang].map((b, i) => (
                  <li key={b}>{i === 1 ? <HnMark size={18} /> : <span className="tick" aria-hidden="true"><Check size={11} /></span>}{b}</li>
                ))}
              </ul>
              <GoogleButton
                supabase={supabase}
                clientId={gconf?.clientId ?? null}
                button={Boolean(gconf?.button)}
                mode={mode === "signup" ? "signup" : "signin"}
                lang={lang}
                label={mode === "signup" ? t(A.googleSignup) : t(T.google)}
                disabled={busy}
                onError={onGoogleError}
                onBusy={setBusy}
              />
              {mode === "signup" && <p className="fine">{t(A.googleSignupHint)}</p>}
              {googleOff && <p className="error small">{gconf?.status === "mismatch" ? t(A.errGoogleAudience) : t(A.errGoogleOff)}</p>}
              <p className="or"><span>{t(A.or)}</span></p>
              <div className="seg" role="tablist" aria-label={t(A.or)}>
                <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => go("signin")}>{t(A.signin)}</button>
                <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => go("signup")}>{t(A.signup)}</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="link back" onClick={() => go("signin")}>← {t(A.back)}</button>
              <h1 className="h2">{mode === "forgot" ? t(A.forgotTitle) : mode === "reset" ? t(A.resetTitle) : t(A.verifyTitle)}</h1>
              <p className="lead">
                {mode === "forgot" ? t(A.forgotLead) : <>{t(A.codeSent)} <b>{email}</b>. {t(A.codeHint)}</>}
              </p>
            </>
          )}

          <form className="authform" onSubmit={submit} noValidate>
            {mode === "signup" && (
              <label className="field">
                <span>{t(A.name)}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
            )}
            {!codeStep && (
              <label className="field">
                <span>{t(A.email)}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} autoComplete="email" required />
              </label>
            )}
            {codeStep && (
              <label className="field">
                <span>{t(A.code)}</span>
                <input
                  className="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  autoFocus
                />
              </label>
            )}
            {(mode === "signin" || mode === "signup" || mode === "reset") && (
              <label className="field">
                <span className="row between">
                  {mode === "reset" ? t(A.newPassword) : t(A.password)}
                  {mode === "signin" && <button type="button" className="link small" onClick={() => go("forgot")}>{t(A.forgot)}</button>}
                </span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} />
                {mode !== "signin" && <small className={pwOk ? "okmsg" : "muted"}>{t(A.pwRule)}</small>}
              </label>
            )}
            <button className="btn" disabled={busy || !canSubmit} aria-busy={busy}>
              {busy && <span className="spin light" aria-hidden="true" />}
              {mode === "signin" ? t(A.signin) : mode === "signup" ? t(A.create) : mode === "forgot" ? t(A.sendCode) : mode === "reset" ? t(A.savePassword) : t(A.verify)}
            </button>
            {codeStep && (
              <button type="button" className="link small" disabled={cooldown > 0 || busy} onClick={() => void resend()}>
                {cooldown > 0 ? `${t(A.resendIn)} ${cooldown} s` : t(A.resend)}
              </button>
            )}
          </form>
          {info && <p className="okmsg" role="status">{info}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <p className="fine">{t(T.signInFine)}</p>
        </div>
        <a className="link" href="/">← {t(T.back)}</a>
      </section>
    </main>
  );
}
