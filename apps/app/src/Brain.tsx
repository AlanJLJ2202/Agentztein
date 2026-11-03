// Bring your own key: one card per provider.
import { useEffect, useState } from "react";
import type { Api, Budget, ProviderInfo, SavedKey } from "./api.js";
import type { Tab } from "./App.js";
import { T, useT } from "./i18n.js";
import { MetaMark } from "./Logos.js";
import { familyOf, META_MODELS, pickId } from "@skillab/research";

type Props = { client: Api; keys: SavedKey[] | null; onKeys: (k: SavedKey[]) => void; go: (t: Tab) => void };

export function Brain({ client, keys, onKeys, go }: Props) {
  const t = useT();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    client
      .keys()
      .then((r) => {
        setProviders(r.providers);
        onKeys(r.keys);
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
    try { const r = await client.setLimit(Number(val)); setB(r); setMsg("ok"); } catch (err) { setMsg((err as Error).message); }
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
