// Bring your own key: one card per provider.
import { useContext, useEffect, useState } from "react";
import type { Api, Budget, ProviderInfo, SavedKey, VoiceKey } from "./api.js";
import type { Tab } from "./App.js";
import { LangContext, T, useT, type Text } from "./i18n.js";
import { markPath } from "./Path.js";
import { browserCanListen, hush, playAudio, speakBrowser, useBrowserVoices, useVoicePrefs } from "./voice.js";
import { MetaMark } from "./Logos.js";
import { familyOf, META_MODELS, pickId } from "@skillab/research";

type Props = { client: Api; keys: SavedKey[] | null; onKeys: (k: SavedKey[]) => void; go: (t: Tab) => void };

export function Brain({ client, keys, onKeys, go }: Props) {
  const t = useT();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState("");
  const [voiceKey, setVoiceKey] = useState<VoiceKey | null>(null);
  useEffect(() => {
    client
      .keys()
      .then((r) => {
        setProviders(r.providers);
        onKeys(r.keys);
        setVoiceKey(r.voice ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [client, onKeys]);

  const replace = (k: SavedKey) => onKeys([k, ...(keys ?? []).filter((x) => x.provider !== k.provider)]);
  return (
    <section>
      <h1 className="h1">{t(T.brainTitle)}</h1>
      <p className="lead">{t(T.brainLead)}</p>
      <p className="meta-note"><MetaMark />{t(T.metaNote)}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!providers.length && !error && <p className="muted">{t(T.loading)}</p>}
      <div className="providers">
        {providers.map((p) => (
          <ProviderCard
            key={p.id}
            p={p}
            saved={keys?.find((k) => k.provider === p.id) ?? null}
            client={client}
            onSaved={replace}
            onRemoved={() => onKeys((keys ?? []).filter((k) => k.provider !== p.id))}
          />
        ))}
        <Limits client={client} />
        <VoiceCard client={client} saved={voiceKey} onSaved={setVoiceKey} />
        <article className="prov credits">
          <header><h2>{t(T.creditsTitle)}</h2><span className="pill amber">{t(T.phase2)}</span></header>
          <p className="muted">{t(T.creditsLead)}</p>
        </article>
      </div>
      {keys && keys.length > 0 && (
        <button type="button" className="btn" onClick={() => go("radar")}>{t(T.tabs.radar)} →</button>
      )}
    </section>
  );
}

function ProviderCard({ p, saved, client, onSaved, onRemoved }: { p: ProviderInfo; saved: SavedKey | null; client: Api; onSaved: (k: SavedKey) => void; onRemoved: () => void }) {
  const t = useT();
  const [editing, setEditing] = useState(!saved);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(saved?.model ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useEffect(() => {
    setModel(saved?.model ?? "");
    setEditing(!saved);
  }, [saved]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await client.saveKey(p.id, key);
      setKey("");
      onSaved(r.key);
      setMsg({ kind: "ok", text: r.verified ? t(T.verified) : t(T.unverified) });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const saveModel = async (id = model) => {
    setBusy(true);
    setMsg(null);
    try {
      setModel(id);
      onSaved((await client.setModel(p.id, id)).key);
      setMsg({ kind: "ok", text: t(T.harness.saved) });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(t(T.confirmRemove))) return;
    setBusy(true);
    try {
      await client.removeKey(p.id);
      onRemoved();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const listId = `models-${p.id}`;
  return (
    <article className={`prov${saved ? " on" : ""}`}>
      <header>
        <h2>{p.label}</h2>
        {saved && <span className={`pill ${saved.verifiedAt ? "ok" : "amber"}`}>{saved.verifiedAt ? t(T.verified) : "?"}</span>}
      </header>
      {saved && (
        <>
          <p className="keyline"><code>{saved.hint}</code>{!saved.verifiedAt && <span className="muted"> · {t(T.unverified)}</span>}</p>
          <fieldset className="models">
            <legend>{t(T.chooseModel)}</legend>
            {META_MODELS.map((fam) => {
              const id = pickId(fam, saved.models);
              const on = familyOf(saved.model)?.family === fam.family;
              return (
                <label key={fam.family} className={`mopt${on ? " on" : ""}${id ? "" : " off"}`}>
                  <input type="radio" name={`model-${p.id}`} checked={on} disabled={!id || busy} onChange={() => id && void saveModel(id)} />
                  <span className="mtop"><b>{fam.name}</b><em>{fam.price}{fam.unconfirmed ? " *" : ""}</em></span>
                  <span className="mrole">{t(fam.role)}</span>
                  <span className="mtags">
                    {fam.sees && <i>{t(T.sees)}</i>}
                    {fam.effort ? <i>{t(T.hasEffort)}</i> : <i>{t(T.noEffort)}</i>}
                    {!id && <i className="na">{t(T.notWithKey)}</i>}
                    {on && saved.model && <i className="cur">{saved.model}</i>}
                  </span>
                </label>
              );
            })}
            <p className="fine">{t(T.priceNote)}</p>
          </fieldset>
          <details className="other">
            <summary>{t(T.otherModel)}</summary>
            <div className="row">
              <input list={listId} value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} autoComplete="off" aria-label={t(T.model)} />
              <datalist id={listId}>{saved.models.map((m) => <option key={m} value={m} />)}</datalist>
              <button type="button" className="btn small ghost" disabled={busy || !model.trim() || model === saved.model} onClick={() => void saveModel()}>{t(T.useModel)}</button>
            </div>
          </details>
        </>
      )}
      {editing ? (
        <form onSubmit={(e) => void save(e)} className="field">
          <span className="sr">{t(T.pasteKey)}</span>
          <div className="row">
            <input type="password" placeholder={t(T.pasteKey)} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} aria-label={`${t(T.pasteKey)} · ${p.label}`} />
            <button className="btn small" disabled={busy || key.trim().length < 16}>{busy ? t(T.saving) : t(T.saveKey)}</button>
          </div>
        </form>
      ) : (
        <div className="row gap">
          <button type="button" className="link" onClick={() => setEditing(true)}>{t(T.replace)}</button>
          <button type="button" className="link danger" onClick={() => void remove()} disabled={busy}>{t(T.remove)}</button>
        </div>
      )}
      {msg && <p className={msg.kind === "ok" ? "okmsg" : "error"} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      <a className="link small" href={p.keysUrl} target="_blank" rel="noreferrer">{t(T.getKey)} ↗</a>
    </article>
  );
}

function Limits({ client }: { client: Api }) {
  const t = useT();
  const [b, setB] = useState<Budget | null>(null);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    client.limits().then((r) => { setB(r); setVal(String(r.monthly)); }).catch(() => undefined);
  }, [client]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try { const r = await client.setLimit(Number(val)); setB(r); setMsg("ok"); markPath("budget"); } catch (err) { setMsg((err as Error).message); }
  };
  const pct = b ? Math.min(100, (b.spent / Math.max(b.monthly, 0.01)) * 100) : 0;
  return (
    <article className="prov on harness-card">
      <header><h2>{t(T.harness.title)}</h2></header>
      <p className="muted small">{t(T.harness.lead)}</p>
      {b && (
        <div className="spend">
          <div className="spend-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} className={pct > 85 ? "hot" : ""} /></div>
          <p className="small"><b>${b.spent.toFixed(4)}</b> / ${b.monthly.toFixed(2)} {t(T.harness.spent)} · {b.runs} {t(T.harness.runs)}</p>
        </div>
      )}
      <form className="field" onSubmit={(e) => void save(e)}>
        <span>{t(T.harness.monthly)}</span>
        <div className="row">
          <input type="number" min={0.5} max={1000} step={0.5} value={val} onChange={(e) => setVal(e.target.value)} />
          <button className="btn small ghost">{t(T.harness.save)}</button>
        </div>
      </form>
      {msg && <p className={msg === "ok" ? "okmsg" : "error"} role="status">{msg === "ok" ? t(T.harness.saved) : msg}</p>}
      <p className="fine">{t(T.harness.log)}</p>
    </article>
  );
}

const V = (en: string, es: string): Text => ({ en, es });

/** How it hears you and how it answers out loud. Meta (Muse) can listen but has no voice model of its own. */
function VoiceCard({ client, saved, onSaved }: { client: Api; saved: VoiceKey | null; onSaved: (v: VoiceKey | null) => void }) {
  const t = useT();
  const lang = useContext(LangContext);
  const [prefs, setPrefs] = useVoicePrefs();
  const voices = useBrowserVoices(lang);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const sample = t(V("Hi! I'm Agentztein. This is how I'll answer you.", "¡Hola! Soy Agentztein. Así te voy a contestar."));
  const canListen = browserCanListen();

  const test = async () => {
    setMsg(null);
    hush();
    if (prefs.out === "eleven") {
      setBusy(true);
      try { await playAudio(await client.speak(sample, saved?.voice ?? undefined)); } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); } finally { setBusy(false); }
      return;
    }
    await speakBrowser(sample, lang, prefs);
  };
  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await client.saveVoiceKey(key.trim());
      setKey("");
      onSaved(r.voice);
      setPrefs({ out: "eleven" });
      setMsg({ kind: "ok", text: r.verified ? t(T.verified) : t(T.unverified) });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const pickVoice = async (id: string) => {
    setBusy(true);
    try { onSaved((await client.setVoice(id)).voice); } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); } finally { setBusy(false); }
  };
  const removeKey = async () => {
    if (!confirm(t(T.confirmRemove))) return;
    setBusy(true);
    try { await client.removeKey("elevenlabs"); onSaved(null); if (prefs.out === "eleven") setPrefs({ out: "browser" }); } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); } finally { setBusy(false); }
  };

  return (
    <article className="prov on voice-card">
      <header><h2>{t(V("Its voice and its ears", "Su voz y sus oídos"))}</h2></header>
      <p className="muted small">{t(V(
        "When you talk to it out loud, something has to listen to you and something has to answer with a voice. Choose here. Meta's Muse models can listen (Muse Voice Transcribe) but don't make voices yet, so the voice comes from your browser or from ElevenLabs.",
        "Cuando le hablas en voz alta, algo te tiene que escuchar y algo te tiene que contestar con voz. Elígelo aquí. Los modelos Muse de Meta pueden escuchar (Muse Voice Transcribe) pero aún no generan voz, así que la voz sale de tu navegador o de ElevenLabs.",
      ))}</p>

      <fieldset className="vopts">
        <legend>{t(V("1. Who listens to you", "1. Quién te escucha"))}</legend>
        <label className={`mopt${prefs.ear === "meta" ? " on" : ""}`}>
          <input type="radio" name="ear" checked={prefs.ear === "meta"} onChange={() => setPrefs({ ear: "meta" })} />
          <span className="mtop"><b>Muse Voice Transcribe</b><em>~$0.18 / h</em></span>
          <span className="mrole">{t(V("Meta's model, with your Meta key and budget. Good with accents and noise.", "El modelo de Meta, con tu llave y tu presupuesto de Meta. Bueno con acentos y ruido."))}</span>
        </label>
        <label className={`mopt${prefs.ear === "browser" ? " on" : ""}${canListen ? "" : " off"}`}>
          <input type="radio" name="ear" checked={prefs.ear === "browser"} disabled={!canListen} onChange={() => setPrefs({ ear: "browser" })} />
          <span className="mtop"><b>{t(V("Your browser", "Tu navegador"))}</b><em>{t(V("free", "gratis"))}</em></span>
          <span className="mrole">{canListen ? t(V("Chrome, Edge and Safari listen on their own. Costs nothing.", "Chrome, Edge y Safari escuchan por su cuenta. No cuesta nada.")) : t(V("This browser can't listen on its own.", "Este navegador no puede escuchar por su cuenta."))}</span>
        </label>
      </fieldset>

      <fieldset className="vopts">
        <legend>{t(V("2. Which voice answers you", "2. Con qué voz te contesta"))}</legend>
        <label className={`mopt${prefs.out === "browser" ? " on" : ""}`}>
          <input type="radio" name="vout" checked={prefs.out === "browser"} onChange={() => setPrefs({ out: "browser" })} />
          <span className="mtop"><b>{t(V("Your browser's voice", "La voz de tu navegador"))}</b><em>{t(V("free", "gratis"))}</em></span>
          <span className="mrole">{t(V("Made on your device. You pick which voice and how fast.", "Se hace en tu dispositivo. Tú eliges cuál voz y qué tan rápido."))}</span>
        </label>
        <label className={`mopt${prefs.out === "eleven" ? " on" : ""}`}>
          <input type="radio" name="vout" checked={prefs.out === "eleven"} onChange={() => setPrefs({ out: "eleven" })} />
          <span className="mtop"><b>ElevenLabs</b><em>{t(V("your key", "tu llave"))}</em></span>
          <span className="mrole">{t(V("A much more natural voice. Billed to your ElevenLabs account, not to your Meta budget.", "Una voz mucho más natural. Se cobra en tu cuenta de ElevenLabs, no en tu presupuesto de Meta."))}</span>
        </label>
        <label className={`mopt${prefs.out === "off" ? " on" : ""}`}>
          <input type="radio" name="vout" checked={prefs.out === "off"} onChange={() => setPrefs({ out: "off" })} />
          <span className="mtop"><b>{t(V("Silent", "En silencio"))}</b></span>
          <span className="mrole">{t(V("It only answers in writing.", "Solo contesta por escrito."))}</span>
        </label>
      </fieldset>

      {prefs.out === "browser" && (
        <div className="field">
          <span>{t(V("Voice", "Voz"))}</span>
          <select value={prefs.browserVoice} onChange={(e) => setPrefs({ browserVoice: e.target.value })}>
            <option value="">{t(V("Automatic (best for the language)", "Automática (la mejor para el idioma)"))}</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
          </select>
          <span>{t(V("Speed", "Velocidad"))} · {prefs.rate.toFixed(1)}×</span>
          <input type="range" min={0.7} max={1.4} step={0.1} value={prefs.rate} onChange={(e) => setPrefs({ rate: Number(e.target.value) })} />
        </div>
      )}

      {prefs.out === "eleven" && (
        saved ? (
          <div className="field">
            <p className="keyline"><code>{saved.hint}</code>{!saved.verifiedAt && <span className="muted"> · {t(T.unverified)}</span>}</p>
            {saved.voices.length > 0 && (
              <>
                <span>{t(V("Voice", "Voz"))}</span>
                <select value={saved.voice ?? ""} onChange={(e) => void pickVoice(e.target.value)} disabled={busy}>
                  {saved.voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </>
            )}
            <button type="button" className="link danger" onClick={() => void removeKey()} disabled={busy}>{t(T.remove)}</button>
          </div>
        ) : (
          <form className="field" onSubmit={(e) => void saveKey(e)}>
            <span>{t(V("Paste your ElevenLabs key (it's saved encrypted)", "Pega tu llave de ElevenLabs (se guarda cifrada)"))}</span>
            <div className="row">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} aria-label="ElevenLabs key" />
              <button className="btn small" disabled={busy || key.trim().length < 16}>{busy ? t(T.saving) : t(T.saveKey)}</button>
            </div>
            <a className="link small" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">{t(T.getKey)} ↗</a>
          </form>
        )
      )}

      {prefs.out !== "off" && (
        <button type="button" className="btn small ghost" onClick={() => void test()} disabled={busy || (prefs.out === "eleven" && !saved)}>
          ▶ {t(V("Try the voice", "Probar la voz"))}
        </button>
      )}
      {msg && <p className={msg.kind === "ok" ? "okmsg" : "error"} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      <p className="fine">{t(V("These choices are saved on this device.", "Estas elecciones se guardan en este dispositivo."))}</p>
    </article>
  );
}
