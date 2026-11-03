// What's missing for the agent to change its own code, checked for real by the server (/api/evolve → health):
// server setup (whoever runs the deployment fixes it) and your own (your key, your budget, your last run).
// The dashboard shows only what fails; the "Its code" tab shows the whole list.
import { useContext } from "react";
import type { HealthCheck } from "./api.js";
import type { Tab } from "./App.js";
import { LangContext, useT, type Text } from "./i18n.js";
import { Check } from "./Logos.js";

const E = (en: string, es: string): Text => ({ en, es });
const FIX_TAB: Record<string, Tab> = { "meta-key": "brain", budget: "brain", "last-run": "evolve" };

export function SetupAlerts({ checks, go, all = false }: { checks: HealthCheck[]; go: (t: Tab) => void; all?: boolean }) {
  const t = useT();
  const lang = useContext(LangContext);
  const shown = all ? checks : checks.filter((c) => c.ok !== true);
  if (!shown.length) return null;
  const failing = checks.filter((c) => c.ok === false).length;
  return (
    <section className={`dcard setup${failing ? " warn" : ""}`} aria-labelledby="setup-h" role={all ? undefined : "alert"}>
      <h2 id="setup-h" className="h3">
        {failing
          ? t(E(`${failing} thing${failing === 1 ? "" : "s"} missing for your agent to change its code`, `Falta${failing === 1 ? "" : "n"} ${failing} cosa${failing === 1 ? "" : "s"} para que tu agente cambie su código`))
          : t(E("Your agent can change its code", "Tu agente puede cambiar su código"))}
      </h2>
      <ul>
        {shown.map((c) => (
          <li key={c.id} className={c.ok === true ? "ok" : c.ok === false ? "bad" : "unknown"}>
            <span className="mark" aria-hidden="true">{c.ok === true ? <Check size={14} /> : c.ok === false ? "!" : "?"}</span>
            <div>
              <b>{c.title[lang]}</b>
              <span className="who">{c.who === "admin" ? t(E("server setup", "configuración del servidor")) : t(E("yours", "tuyo"))}</span>
              {c.ok !== true && <p>{c.fix[lang]}</p>}
            </div>
            {c.ok === false && FIX_TAB[c.id] && <button type="button" className="btn small" onClick={() => go(FIX_TAB[c.id] as Tab)}>{t(E("Fix", "Arreglar"))}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
