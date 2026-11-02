// Bring your own key: one card per provider.
import { useEffect, useState } from "react";
import type { Api, ProviderInfo, SavedKey } from "./api.js";
import type { Tab } from "./App.js";
import { T, useT } from "./i18n.js";

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
  const saveModel = async () => {
    setBusy(true);
    setMsg(null);
    try {
      onSaved((await client.setModel(p.id, model)).key);
      setMsg({ kind: "ok", text: "✓" });
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
          <label className="field">
            <span>{t(T.model)}</span>
            <div className="row">
              <input list={listId} value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} autoComplete="off" />
              <datalist id={listId}>{saved.models.map((m) => <option key={m} value={m} />)}</datalist>
              <button type="button" className="btn small ghost" disabled={busy || !model.trim() || model === saved.model} onClick={() => void saveModel()}>{t(T.useModel)}</button>
            </div>
          </label>
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
