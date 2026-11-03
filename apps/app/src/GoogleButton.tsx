// Sign in or sign up with Google. Google Identity Services draws Google's own button and returns a signed
// Google ID token; Supabase Auth verifies it (signature against Google's keys, audience = our client id,
// nonce) and creates the account the first time. Without a client id, or on preview hosts, it falls back to
// Supabase's redirect flow, which works the same for new and returning users.
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "./i18n.js";
import { GoogleG } from "./Logos.js";

type Credential = { credential: string };
type Gis = {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
      prompt: () => void;
      cancel: () => void;
    };
  };
};
declare global {
  interface Window { google?: Gis }
}

let loading: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error("gis")));
    s.onerror = () => { loading = null; reject(new Error("gis")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** A random nonce for Supabase and its SHA-256 (hex) for Google, so the token can't be replayed. */
async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/[+/=]/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

type Props = {
  supabase: SupabaseClient;
  clientId: string | null;
  button: boolean;
  mode: "signin" | "signup";
  lang: Lang;
  label: string;
  disabled?: boolean;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
};

export function GoogleButton({ supabase, clientId, button, mode, lang, label, disabled, onError, onBusy }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(!clientId || !button);
  const redirectTo = `${location.origin}/app/`;

  useEffect(() => {
    if (!clientId || !button) return;
    let gone = false;
    (async () => {
      try {
        const [gis, nonce] = await Promise.all([loadGis(), makeNonce()]);
        if (gone || !slot.current) return;
        gis.accounts.id.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          ux_mode: "popup",
          use_fedcm_for_prompt: true,
          itp_support: true,
          context: mode === "signup" ? "signup" : "signin",
          callback: async ({ credential }: Credential) => {
            onBusy(true);
            const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce: nonce.raw });
            onBusy(false);
            if (error) onError(error.message);
          },
        });
        const width = Math.min(400, Math.max(240, Math.round(slot.current.getBoundingClientRect().width || 320)));
        gis.accounts.id.renderButton(slot.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: mode === "signup" ? "signup_with" : "continue_with",
          logo_alignment: "center",
          locale: lang,
          width,
        });
        setReady(true);
      } catch {
        if (!gone) setFallback(true);
      }
    })();
    return () => { gone = true; window.google?.accounts.id.cancel(); };
  }, [supabase, clientId, button, mode, lang, onError, onBusy]);

  const redirect = async () => {
    onBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { prompt: "select_account" } } });
    if (error) { onBusy(false); onError(error.message); }
  };

  if (fallback) {
    return (
      <button type="button" className="google" onClick={() => void redirect()} disabled={disabled}>
        <GoogleG />
        {label}
      </button>
    );
  }
  return (
    <div className="gis" aria-busy={!ready}>
      <div ref={slot} className="gis-slot" />
      {!ready && <span className="google ghosted" aria-hidden="true"><GoogleG />{label}</span>}
    </div>
  );
}
