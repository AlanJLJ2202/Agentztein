// Bring your own key: one card per provider.
import { useContext, useEffect, useState } from "react";
import type { Api, Budget, ProviderInfo, SavedKey, VoiceKey } from "./api.js";
import type { Tab } from "./App.js";
import { LangContext, T, useT, type Text } from "./i18n.js";
import { markPath } from "./Path.js";
import { browserCanListen, hush, playAudio, speakBrowser, useBrowserVoices, useVoicePrefs } from "./voice.js";
import { MetaMark } from "./Logos.js";
import { familyOf, META_MODELS, pickId } from "@skillab/research";
import { Robot, type Scene } from "./Robot.js";

/** One plain icon per Meta family: what it is good for, at a glance. */
const FAM_ICON: Record<string, { icon: string; tag: Text }> = {
  wonder: { icon: "🧠", tag: { en: "thinks deepest", es: "piensa más a fondo" } },
  spark: { icon: "⚡", tag: { en: "everyday, balanced", es: "del día a día" } },
  "spark-contributor": { icon: "🪙", tag: { en: "cheapest", es: "el más barato" } },
  glimmer: { icon: "🪶", tag: { en: "light", es: "ligero" } },
  "spark-open": { icon: "🔓", tag: { en: "open weights", es: "pesos abiertos" } },
};
/** $ to $$$$ from the output price per million tokens, so cost reads at a glance (the exact price is beside it). */
const tier = (usd: [number, number]) => "$".repeat(usd[1] >= 10 ? 4 : usd[1] >= 3 ? 3 : usd[1] >= 1 ? 2 : 1);

/** The left side of a settings row: the robot in its pose, the title and one sentence. */
function Side({ scene, title, text, children }: { scene: Scene; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="prov-side">
      <Robot scene={scene} size={96} />
      <div>
        <h2>{title}</h2>
        <p className="muted small">{text}</p>
        {children}
      </div>
    </div>
  );
}

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
    <section className="settings">
      <div className="settings-head">
        <Robot
          scene={keys?.length ? "happy" : "nokey"}
          size={84}
          say={keys?.length
            ? t({ en: "I have a brain! Here you choose how I think, how much I spend and how I talk to you.", es: "¡Ya tengo cerebro! Aquí eliges con qué pienso, cuánto gasto y cómo te hablo." })
            : t({ en: "I'm asleep: paste your Meta key below and I'll wake up.", es: "Estoy dormido: pega abajo tu llave de Meta y despierto." })}
        />
        <div>
          <h1 className="h1">{t(T.brainTitle)}</h1>
          <p className="muted"><MetaMark size={16} /> {t({ en: "Your key is checked with Meta, encrypted and never shown again.", es: "Tu llave se verifica con Meta, se cifra y nunca se vuelve a mostrar." })}</p>
        </div>
      </div>
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
        <article className="prov wide credits">
          <Side scene="credits" title={t(T.creditsTitle)} text={t(T.creditsLead)}><span className="pill amber">{t(T.phase2)}</span></Side>
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
    <article className={`prov wide${saved ? " on" : ""}`}>
      <Side
        scene={saved ? "key" : "nokey"}
        title={t({ en: "Its brain", es: "Su cerebro" })}
        text={saved
          ? t({ en: "Which Meta model thinks for it. Tap one.", es: "Qué modelo de Meta piensa por él. Toca uno." })
          : t({ en: "Paste your Meta Model API key (public preview for developers in the US).", es: "Pega tu llave de la Meta Model API (vista previa para desarrolladores en EE. UU.)." })}
      >
        <p className="small">{p.label}{saved && <> · <span className={`pill ${saved.verifiedAt ? "ok" : "amber"}`}>{saved.verifiedAt ? t(T.verified) : "?"}</span></>}</p>
      </Side>
      <div className="prov-main">
      {saved && (
        <>
          <fieldset className="models tiles">
            <legend className="sr">{t(T.chooseModel)}</legend>
            {META_MODELS.map((fam) => {
              const id = pickId(fam, saved.models);
              const on = familyOf(saved.model)?.family === fam.family;
              return (
                <label key={fam.family} className={`mtile${on ? " on" : ""}${id ? "" : " off"}`} title={`${t(fam.role)} · ${fam.price} USD / 1M tokens${fam.unconfirmed ? " *" : ""}`}>
                  <input type="radio" className="sr" name={`model-${p.id}`} checked={on} disabled={!id || busy} onChange={() => id && void saveModel(id)} />
                  <span className="mt-icon" aria-hidden="true">{FAM_ICON[fam.family]?.icon ?? "◆"}</span>
                  <b>{fam.name.replace("Muse ", "")}</b>
                  <span className="mt-tag">{t(FAM_ICON[fam.family]?.tag ?? fam.role)}</span>
                  <span className="mt-price"><b>{tier(fam.usd as [number, number])}</b> <small>{fam.price}{fam.unconfirmed ? " *" : ""}</small></span>
                  <span className="mt-caps">
                    {fam.sees && <i title={t(T.sees)}>👁 {t({ en: "sees", es: "ve" })}</i>}
                    {fam.effort && <i title={t(T.hasEffort)}>⚙️ {t({ en: "effort", es: "esfuerzo" })}</i>}
                  </span>
                  {on ? <span className="mt-on">✓ {t({ en: "in use", es: "en uso" })}</span> : !id && <span className="mt-na">{t(T.notWithKey)}</span>}
                </label>
              );
            })}
          </fieldset>
          <p className="fine">💡 {t({ en: "Hover a model for details.", es: "Pasa el cursor sobre un modelo para ver el detalle." })} {t(T.priceNote)} · <code>{saved.hint}</code>{!saved.verifiedAt && <span className="muted"> · {t(T.unverified)}</span>}</p>
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
      </div>
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
    <article className="prov wide on harness-card">
      <Side
        scene={pct >= 80 ? "budget-alert" : "budget"}
        title={t({ en: "How much it can spend", es: "Cuánto puede gastar" })}
        text={t({ en: "Its limit per month. Before every step it checks the worst case; if it could go over, it doesn't call Meta.", es: "Su límite al mes. Antes de cada paso revisa el peor caso; si pudiera pasarse, no llama a Meta." })}
      />
      <div className="prov-main">
      {b && (
        <div className="spend">
          <div className="spend-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} className={pct > 85 ? "hot" : ""} /></div>
          <p className="small"><b>${b.spent.toFixed(4)}</b> / ${b.monthly.toFixed(2)} {t(T.harness.spent)} · {b.runs} {t(T.harness.runs)}</p>
        </div>
      )}
      <form className="field" onSubmit={(e) => void save(e)}>
        <span>{t(T.harness.monthly)}</span>
        <div className="caps">
          {[2, 5, 10, 20].map((v) => (
            <button key={v} type="button" role="radio" aria-checked={Number(val) === v} onClick={() => setVal(String(v))}>${v}</button>
          ))}
          <label className={`cap-other${[2, 5, 10, 20].includes(Number(val)) ? "" : " on"}`}>
            <span>{t({ en: "other", es: "otro" })} $</span>
            <input type="number" min={0.5} max={1000} step={0.5} value={val} onChange={(e) => setVal(e.target.value)} aria-label={t(T.harness.monthly)} />
          </label>
          <button className="btn small">{t(T.harness.save)}</button>
        </div>
      </form>
      {msg && <p className={msg === "ok" ? "okmsg" : "error"} role="status">{msg === "ok" ? t(T.harness.saved) : msg}</p>}
      <p className="fine">🔒 {t(T.harness.log)}</p>
      </div>
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
    <article className="prov wide on voice-card">
      <Side
        scene="voice"
        title={t(V("Its voice and its ears", "Su voz y sus oídos"))}
        text={t(V("When you talk to it out loud: who listens to you and which voice answers. Meta can listen but has no voice yet.", "Cuando le hablas en voz alta: quién te escucha y con qué voz te contesta. Meta escucha pero aún no tiene voz."))}
      />
      <div className="prov-main">

      <fieldset className="vopts">
        <legend>👂 {t(V("Who listens to you", "Quién te escucha"))}</legend>
        <label className={`mopt${prefs.ear === "meta" ? " on" : ""}`}>
          <input type="radio" name="ear" checked={prefs.ear === "meta"} onChange={() => setPrefs({ ear: "meta" })} />
          <span className="mtop"><b>Muse Voice Transcribe</b><em>~$0.18 / h</em></span>
          <span className="mrole">{t(V("Meta's model, on your key. Good with accents and noise.", "El de Meta, con tu llave. Bueno con acentos y ruido."))}</span>
        </label>
        <label className={`mopt${prefs.ear === "browser" ? " on" : ""}${canListen ? "" : " off"}`}>
          <input type="radio" name="ear" checked={prefs.ear === "browser"} disabled={!canListen} onChange={() => setPrefs({ ear: "browser" })} />
          <span className="mtop"><b>{t(V("Your browser", "Tu navegador"))}</b><em>{t(V("free", "gratis"))}</em></span>
          <span className="mrole">{canListen ? t(V("Chrome, Edge and Safari listen on their own.", "Chrome, Edge y Safari escuchan solos.")) : t(V("This browser can't listen on its own.", "Este navegador no puede escuchar por su cuenta."))}</span>
        </label>
      </fieldset>

      <fieldset className="vopts">
        <legend>🔊 {t(V("Which voice answers you", "Con qué voz te contesta"))}</legend>
        <label className={`mopt${prefs.out === "browser" ? " on" : ""}`}>
          <input type="radio" name="vout" checked={prefs.out === "browser"} onChange={() => setPrefs({ out: "browser" })} />
          <span className="mtop"><b>{t(V("Your browser's voice", "La voz de tu navegador"))}</b><em>{t(V("free", "gratis"))}</em></span>
          <span className="mrole">{t(V("On your device. You pick the voice and speed.", "En tu dispositivo. Eliges voz y velocidad."))}</span>
        </label>
        <label className={`mopt${prefs.out === "eleven" ? " on" : ""}`}>
          <input type="radio" name="vout" checked={prefs.out === "eleven"} onChange={() => setPrefs({ out: "eleven" })} />
          <span className="mtop"><b>ElevenLabs</b><em>{t(V("your key", "tu llave"))}</em></span>
          <span className="mrole">{t(V("Much more natural. Billed to your ElevenLabs account.", "Mucho más natural. Se cobra en tu cuenta de ElevenLabs."))}</span>
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
      </div>
    </article>
  );
}
