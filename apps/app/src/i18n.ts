// English by default with Spanish next to it, sharing the landing's saved choice (same site, same key).
import { createContext, useContext } from "react";

export type Lang = "en" | "es";
export type Text = { en: string; es: string };

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("agz-lang");
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* private mode */
  }
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function saveLang(l: Lang) {
  try {
    localStorage.setItem("agz-lang", l);
  } catch {
    /* private mode */
  }
  document.documentElement.lang = l;
}

export const LangContext = createContext<Lang>("en");
export const useT = () => {
  const lang = useContext(LangContext);
  return (t: Text) => t[lang];
};

export const T = {
  appTitle: { en: "Your lab", es: "Tu laboratorio" },
  signInTitle: { en: "Wake up your own Agentztein", es: "Despierta a tu propio Agentztein" },
  signInLead: {
    en: "Sign in with Google, connect the brain you want with your own API key and let it read what's new in AI every day.",
    es: "Entra con Google, conéctale el cerebro que quieras con tu propia API key y deja que lea a diario lo nuevo en IA.",
  },
  signInBullets: {
    en: ["Your own API key, encrypted on our server", "A research radar that reads Hacker News", "Every decision with its trade-off, saved for you"],
    es: ["Tu propia API key, cifrada en nuestro servidor", "Un radar de investigación que lee Hacker News", "Cada decisión con su trade-off, guardada para ti"],
  },
  google: { en: "Continue with Google", es: "Continuar con Google" },
  signInFine: {
    en: "We only use your name, email and photo from Google. Buying AI credits comes in phase 2.",
    es: "De Google solo usamos tu nombre, correo y foto. Comprar créditos de IA llega en la fase 2.",
  },
  back: { en: "Back to the site", es: "Volver al sitio" },
  setupTitle: { en: "Sign-in isn't set up yet", es: "El inicio de sesión aún no está configurado" },
  setupLead: {
    en: "Whoever runs this deployment needs to add these environment variables in Vercel (the README explains each one):",
    es: "Quien administra este despliegue debe agregar estas variables de entorno en Vercel (el README explica cada una):",
  },
  loading: { en: "Loading…", es: "Cargando…" },
  signOut: { en: "Sign out", es: "Salir" },
  tabs: {
    overview: { en: "Overview", es: "Resumen" },
    brain: { en: "Brain", es: "Cerebro" },
    radar: { en: "Research radar", es: "Radar de investigación" },
  },
  hello: { en: "Hi", es: "Hola" },
  overviewLead: {
    en: "This is your Agentztein. Get it ready in three steps; the rest arrives as the lab grows.",
    es: "Este es tu Agentztein. Déjalo listo en tres pasos; lo demás llega conforme crece el laboratorio.",
  },
  steps: [
    { t: { en: "Signed in with Google", es: "Entraste con Google" }, d: { en: "Your notes and keys are yours only.", es: "Tus notas y llaves son solo tuyas." } },
    { t: { en: "Connect its brain", es: "Conéctale el cerebro" }, d: { en: "Add an API key from the provider you prefer.", es: "Agrega una API key del proveedor que prefieras." } },
    { t: { en: "Run the research radar", es: "Corre el radar de investigación" }, d: { en: "It reads Hacker News and decides what deserves an experiment.", es: "Lee Hacker News y decide qué merece un experimento." } },
    { t: { en: "Run it on a benchmark", es: "Córrelo en un benchmark" }, d: { en: "Coming with the next stage of the lab.", es: "Llega con la siguiente etapa del laboratorio." } },
    { t: { en: "Buy AI credits", es: "Compra créditos de IA" }, d: { en: "Phase 2: use Agentztein without your own key.", es: "Fase 2: usa Agentztein sin tu propia llave." } },
  ],
  done: { en: "Done", es: "Listo" },
  go: { en: "Start", es: "Empezar" },
  soon: { en: "Soon", es: "Pronto" },
  phase2: { en: "Phase 2", es: "Fase 2" },
  brainTitle: { en: "Its brain, your key", es: "Su cerebro, tu llave" },
  brainLead: {
    en: "Agentztein thinks with the model you connect. Your key is checked with the provider, encrypted (AES-256-GCM) and only used for the runs you start. We never show it again.",
    es: "Agentztein piensa con el modelo que conectes. Tu llave se verifica con el proveedor, se cifra (AES-256-GCM) y solo se usa en las corridas que tú inicies. Nunca la volvemos a mostrar.",
  },
  pasteKey: { en: "Paste your API key", es: "Pega tu API key" },
  saveKey: { en: "Save and verify", es: "Guardar y verificar" },
  saving: { en: "Checking…", es: "Verificando…" },
  getKey: { en: "Get a key", es: "Consigue una llave" },
  verified: { en: "Verified", es: "Verificada" },
  unverified: { en: "Not verified: the provider didn't answer", es: "Sin verificar: el proveedor no respondió" },
  model: { en: "Model", es: "Modelo" },
  useModel: { en: "Use this model", es: "Usar este modelo" },
  replace: { en: "Replace key", es: "Cambiar llave" },
  remove: { en: "Remove", es: "Quitar" },
  confirmRemove: { en: "Remove this key? Agentztein will stop using it.", es: "¿Quitar esta llave? Agentztein dejará de usarla." },
  creditsTitle: { en: "AI credits", es: "Créditos de IA" },
  creditsLead: { en: "Buy credits and use Agentztein without your own key. Coming in phase 2.", es: "Compra créditos y usa Agentztein sin tu propia llave. Llega en la fase 2." },
  radarTitle: { en: "Research radar", es: "Radar de investigación" },
  radarLead: {
    en: "Agentztein reads the most discussed AI stories on Hacker News this week. With your model it decides which deserve an experiment, which to watch and which to skip, and writes down the trade-off. Nothing is adopted without passing the lab.",
    es: "Agentztein lee las historias de IA más comentadas de la semana en Hacker News. Con tu modelo decide cuáles merecen un experimento, cuáles vigilar y cuáles descartar, y anota el trade-off. Nada se adopta sin pasar por el laboratorio.",
  },
  triage: { en: "Triage with my model", es: "Clasificar con mi modelo" },
  triaging: { en: "Reading and deciding…", es: "Leyendo y decidiendo…" },
  needKey: { en: "Connect a key first to let it decide.", es: "Conecta una llave primero para que pueda decidir." },
  liveTitle: { en: "On Hacker News this week", es: "En Hacker News esta semana" },
  liveNote: { en: "Tags are a keyword guess from the headline, not the agent's verdict.", es: "Las etiquetas son una suposición por palabras del titular, no el veredicto del agente." },
  liveError: { en: "Hacker News didn't answer. Try again in a moment.", es: "Hacker News no respondió. Intenta en un momento." },
  notesTitle: { en: "What it decided", es: "Lo que decidió" },
  notesEmpty: { en: "No decisions yet. Run the radar to see the first ones.", es: "Aún no hay decisiones. Corre el radar para ver las primeras." },
  all: { en: "All", es: "Todo" },
  verdict: {
    experiment: { en: "Experiment", es: "Experimentar" },
    watch: { en: "Watch", es: "Vigilar" },
    skip: { en: "Skip", es: "Descartar" },
  },
  gain: { en: "Gain", es: "Ganancia" },
  cost: { en: "Cost", es: "Costo" },
  why: { en: "Why", es: "Por qué" },
  discussion: { en: "discussion", es: "discusión" },
  comments: { en: "comments", es: "comentarios" },
  points: { en: "points", es: "puntos" },
  judgedBy: { en: "Judged from the headline by", es: "Juzgado por el titular con" },
  read: { en: "stories read", es: "historias leídas" },
  hnNote: { en: "Not affiliated with Y Combinator or Hacker News.", es: "Sin afiliación con Y Combinator ni con Hacker News." },
} as const;
