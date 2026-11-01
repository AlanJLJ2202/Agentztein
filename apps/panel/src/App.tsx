import { GLOSSARY, METRICS, STAGES, STEPS, STRATEGIES } from "./content.js";
import { Scenarios } from "./Scenarios.js";
import data from "./snapshot.json";
import type { Snapshot } from "./snapshot-types.js";
import { About, Section, Term } from "./ui.js";

const snapshot = data as unknown as Snapshot;

const NAV = [
  ["idea", "La idea"],
  ["como", "Cómo aprende"],
  ["estrategias", "Estrategias"],
  ["escenarios", "Escenarios"],
  ["medicion", "Qué medimos"],
  ["bitacora", "Bitácora"],
  ["avance", "Avance"],
  ["glosario", "Glosario"],
] as const;

export function App() {
  return (
    <>
      <nav className="topnav" aria-label="Secciones">
        <span className="brand">skillab</span>
        <div className="navlinks">
          {NAV.map(([id, name]) => (
            <a key={id} href={`#${id}`}>
              {name}
            </a>
          ))}
        </div>
      </nav>
      <main>
        <header className="hero">
          <p className="eyebrow">Investigación aplicada · nombre provisional</p>
          <h1>Agentes de IA que aprenden sin olvidar lo que ya funcionaba</h1>
          <p className="lede">
            Un laboratorio para probar, con evidencia, si un asistente de IA puede mejorar por sí mismo{" "}
            <strong>sin descomponer lo que ya hacía bien</strong>, y si sabe qué conservar cuando cambian las reglas del
            negocio.
          </p>
          <div className="notice" role="note">
            <strong>Estado actual: todavía no hay resultados del agente.</strong> Esta página muestra el diseño del
            experimento y los escenarios de prueba. Los números de abajo vienen de reglas escritas a mano que comprueban
            que cada escenario tiene la trampa que buscamos. Gasto en modelos de IA hasta hoy: USD 0.
          </div>
        </header>

        <Section id="idea" title="La idea en un minuto">
          <About>El problema que queremos resolver, explicado con un ejemplo de la vida diaria.</About>
          <div className="story">
            <p>
              Imagina a una empleada nueva que trabaja en dos sucursales. En la primera aprende un atajo: “si dos
              tickets tienen el mismo monto y la misma fecha, uno está repetido”. Ahí funciona perfecto. En la segunda
              sucursal la gente compra dos cafés iguales el mismo día, y el atajo borra ventas reales.
            </p>
            <p>
              Meses después, la segunda sucursal cambia su sistema de cobro. Lo que aprendió para la primera sigue
              sirviendo; lo de la segunda, no. Una buena empleada sabe <strong>dónde</strong> aplica cada cosa que
              aprendió y <strong>cuándo</strong> hay que volver a revisarla.
            </p>
            <p>
              Con los agentes de IA pasa lo mismo. Muchos sistemas que “se mejoran solos” acumulan trucos o reescriben
              sus instrucciones para todos los casos. Aquí medimos si guardar cada aprendizaje con su{" "}
              <Term>alcance</Term> y su <Term>vigencia</Term> los hace más confiables, y cuánto cuesta.
            </p>
          </div>
          <p className="question">
            <span className="about-tag">Pregunta de investigación</span>
            ¿Las habilidades con alcance y vigencia explícitos permiten adaptarse a cambios de reglas con menos
            interferencia que acumular habilidades o modificar instrucciones globales?
          </p>
        </Section>

        <Section id="como" title="Cómo aprende el sistema">
          <About>
            El ciclo que sigue el agente para mejorar. Nada se activa sin pruebas, y el modelo de IA no se reentrena:
            lo que cambia son las instrucciones que lo rodean.
          </About>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step-n">{i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.body}</p>
                  <Term>{s.term}</Term>
                </div>
              </li>
            ))}
          </ol>
          <p className="reading">
            <strong>El examen final está sellado.</strong> Hay casos reservados que el agente nunca ve mientras aprende,
            con datos distintos a los de práctica. Solo se usan al final, para saber si aprendió de verdad o solo
            memorizó los ejemplos.
          </p>
        </Section>

        <Section id="estrategias" title="Las cuatro estrategias que compararemos">
          <About>
            Para saber si la propuesta sirve, hay que compararla contra las alternativas, con el mismo modelo de IA, los
            mismos casos y el mismo presupuesto.
          </About>
          <div className="cards4">
            {STRATEGIES.map((s) => (
              <div key={s.id} className={s.id === "D" ? "card strategy highlight" : "card strategy"}>
                <span className="pill">Variante {s.id}</span>
                <h3>{s.name}</h3>
                <p className="analogy">{s.analogy}</p>
                <p>{s.detail}</p>
                <Term>{s.term}</Term>
              </div>
            ))}
          </div>
        </Section>

        <Scenarios scenarios={snapshot.scenarios} />

        <Section id="medicion" title="Qué vamos a medir">
          <About>
            Ganar en promedio no basta. Medimos también lo que se rompe, lo que cuesta y qué tan seguros podemos estar
            del resultado.
          </About>
          <div className="metrics">
            {METRICS.map((m) => (
              <div key={m.name} className="metric">
                <strong>{m.name}</strong>
                <p>{m.body}</p>
                <Term>{m.term}</Term>
              </div>
            ))}
          </div>
          <p className="reading">
            <strong>Reglas de honestidad:</strong> se reportan todas las corridas, también las que salen mal; los
            criterios de éxito se congelan antes del experimento; y “cero fallos observados” nunca se presenta como
            “sin fallos”.
          </p>
        </Section>

        <Section id="bitacora" title="Bitácora de decisiones del agente">
          <About>
            Aquí aparecerá cada decisión que tome el sistema: qué observó, qué hipótesis formuló, qué cambio propuso,
            cómo le fue en la prueba y si se aprobó, se restringió o se rechazó, con el motivo.
          </About>
          <div className="empty">
            <strong>Todavía vacía.</strong> El agente empieza a trabajar en la etapa E2 y a proponer mejoras en la E3. No
            mostramos decisiones simuladas como si fueran aprendizaje real.
          </div>
          <div className="card format">
            <p className="fine">Formato de cada entrada (ilustrativo, no es un resultado)</p>
            <dl>
              <div>
                <dt>Observación</dt>
                <dd>Qué errores se repitieron y en qué contexto</dd>
              </div>
              <div>
                <dt>Hipótesis</dt>
                <dd>Por qué cree el agente que pasa</dd>
              </div>
              <div>
                <dt>Cambio propuesto</dt>
                <dd>La ficha nueva, con su alcance y vigencia</dd>
              </div>
              <div>
                <dt>Prueba</dt>
                <dd>Aciertos antes y después, por contexto, con su rango de incertidumbre</dd>
              </div>
              <div>
                <dt>Decisión</dt>
                <dd>Activar, restringir, rechazar o “sin evidencia suficiente”, y el motivo</dd>
              </div>
              <div>
                <dt>Costo</dt>
                <dd>Lo que costó llegar a esa decisión</dd>
              </div>
            </dl>
          </div>
        </Section>

        <Section id="avance" title="Avance del proyecto">
          <About>El proyecto se construye por etapas. No se avanza a la siguiente hasta que la anterior pasa sus pruebas.</About>
          <ol className="stages">
            {STAGES.map(([id, name, state]) => (
              <li key={id} className={`stage ${state}`}>
                <span className="stage-id">{id}</span>
                <span className="stage-name">{name}</span>
                <span className="stage-state">{state === "done" ? "completa" : state === "next" ? "siguiente" : "pendiente"}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="glosario" title="Glosario">
          <About>Los términos técnicos que aparecen en el proyecto, en una línea cada uno.</About>
          <dl className="glossary">
            {GLOSSARY.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="tecnico" title="Detalles técnicos">
          <About>
            Para quien quiera verificar: cada conjunto de datos se genera desde una semilla y tiene una huella digital
            (hash). Si alguien regenera los datos y la huella coincide, son exactamente los mismos.
          </About>
          <details className="card">
            <summary>
              {snapshot.manifest.entries.length} conjuntos de datos · huella general{" "}
              <code title={snapshot.manifest.hash}>{snapshot.manifest.hash.slice(0, 16)}…</code>
            </summary>
            <p className="muted">
              Tres grupos por escenario: práctica (adaptation), selección (validation) y examen sellado (test). Del
              examen solo se publica la huella, nunca los datos.
            </p>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Escenario</th>
                    <th>Grupo</th>
                    <th>Familia</th>
                    <th className="num">Lotes</th>
                    <th className="num">Casos</th>
                    <th>Huella</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.manifest.entries.map((e) => (
                    <tr key={`${e.scenario}${e.split}${e.family}`}>
                      <td>{e.scenario}</td>
                      <td>
                        {e.split} {e.split === "test" && <span className="tag sealed">sellado</span>}
                      </td>
                      <td>{e.family}</td>
                      <td className="num">{e.caseCount}</td>
                      <td className="num">{e.rowCount}</td>
                      <td>
                        <code title={e.hash}>{e.hash.slice(0, 12)}…</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Section>

        <footer>
          <span>{snapshot.manifest.generatorVersion}</span>
          <span>commit {snapshot.commit ? snapshot.commit.slice(0, 7) : "local"}</span>
          <span>actualizado {new Date(snapshot.builtAt).toLocaleString("es-MX")}</span>
        </footer>
      </main>
    </>
  );
}
