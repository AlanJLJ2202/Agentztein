import { useEffect } from "react";
import type { Api, SavedKey } from "./api.js";
import type { Tab } from "./App.js";
import { T, useT } from "./i18n.js";
import { Check } from "./Logos.js";

type Props = {
  name: string;
  keys: SavedKey[] | null;
  notesCount: number;
  go: (t: Tab) => void;
  client: Api;
  onKeys: (k: SavedKey[]) => void;
  onNotes: (n: number) => void;
};

export function Overview({ name, keys, notesCount, go, client, onKeys, onNotes }: Props) {
  const t = useT();
  useEffect(() => {
    client.keys().then((r) => onKeys(r.keys)).catch(() => onKeys([]));
    client.notes().then((r) => onNotes(r.notes.length)).catch(() => undefined);
  }, [client, onKeys, onNotes]);

  const state: Array<"done" | "todo" | "soon" | "phase2"> = [
    "done",
    keys?.length ? "done" : "todo",
    notesCount > 0 ? "done" : "todo",
    "soon",
    "phase2",
  ];
  const target: Array<Tab | null> = [null, "brain", "radar", null, null];
  return (
    <section>
      <h1 className="h1">{t(T.hello)}{name ? `, ${name}` : ""}.</h1>
      <p className="lead">{t(T.overviewLead)}</p>
      <ol className="journey">
        {T.steps.map((s, i) => {
          const st = state[i] ?? "todo";
          const to = target[i];
          return (
            <li key={i} className={st}>
              <span className="num" aria-hidden="true">{st === "done" ? <Check size={16} /> : i + 1}</span>
              <div>
                <h2>{t(s.t)}</h2>
                <p>{t(s.d)}</p>
              </div>
              {st === "done" && <span className="pill ok">{t(T.done)}</span>}
              {st === "todo" && to && <button type="button" className="btn small" onClick={() => go(to)}>{t(T.go)}</button>}
              {st === "soon" && <span className="pill">{t(T.soon)}</span>}
              {st === "phase2" && <span className="pill amber">{t(T.phase2)}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
