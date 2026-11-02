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
    en: "Create your account, connect Muse Spark, Meta's model, with your own key and let it read what's new in AI every day.",
    es: "Crea tu cuenta, conéctale Muse Spark, el modelo de Meta, con tu propia llave y deja que lea a diario lo nuevo en IA.",
  },
  signInBullets: {
    en: ["Your own Meta API key, encrypted on our server", "A research radar that reads Hacker News", "Every decision with its trade-off, saved for you"],
    es: ["Tu propia llave de Meta, cifrada en nuestro servidor", "Un radar de investigación que lee Hacker News", "Cada decisión con su trade-off, guardada para ti"],
  },
  google: { en: "Continue with Google", es: "Continuar con Google" },
  signInFine: {
    en: "With Google we only use your name, email and photo. Buying AI credits comes in phase 2.",
    es: "Con Google solo usamos tu nombre, correo y foto. Comprar créditos de IA llega en la fase 2.",
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
    { t: { en: "Account created", es: "Cuenta creada" }, d: { en: "Your notes and keys are yours only.", es: "Tus notas y llaves son solo tuyas." } },
    { t: { en: "Connect its brain", es: "Conéctale el cerebro" }, d: { en: "Add your Meta Model API key: Muse Spark does the thinking.", es: "Agrega tu llave de la Meta Model API: Muse Spark es quien piensa." } },
    { t: { en: "Run the research radar", es: "Corre el radar de investigación" }, d: { en: "It reads Hacker News and decides what deserves an experiment.", es: "Lee Hacker News y decide qué merece un experimento." } },
    { t: { en: "Run it on a benchmark", es: "Córrelo en un benchmark" }, d: { en: "Coming with the next stage of the lab.", es: "Llega con la siguiente etapa del laboratorio." } },
    { t: { en: "Buy AI credits", es: "Compra créditos de IA" }, d: { en: "Phase 2: use Agentztein without your own key.", es: "Fase 2: usa Agentztein sin tu propia llave." } },
  ],
  done: { en: "Done", es: "Listo" },
  go: { en: "Start", es: "Empezar" },
  soon: { en: "Soon", es: "Pronto" },
  phase2: { en: "Phase 2", es: "Fase 2" },
  brainTitle: { en: "Its brain is Meta's; the key is yours", es: "El cerebro es de Meta; la llave, tuya" },
  brainLead: {
    en: "Agentztein's brain is Muse Spark, Meta's model. Paste your Meta Model API key: we check it with Meta, encrypt it (AES-256-GCM) and only use it for the runs you start. We never show it again.",
    es: "El cerebro de Agentztein es Muse Spark, el modelo de Meta. Pega tu llave de la Meta Model API: la verificamos con Meta, la ciframos (AES-256-GCM) y solo la usamos en las corridas que tú inicies. Nunca la volvemos a mostrar.",
  },
  metaNote: {
    en: "The radar asks Muse Spark for a low effort level (it goes from minimal to xhigh): sorting headlines is light work. Meta Model API is in public preview for developers in the US. Prefer the standard models: Meta may train on what you send to “-contributor” ones.",
    es: "El radar le pide a Muse Spark un nivel de esfuerzo bajo (va de minimal a xhigh): ordenar titulares es trabajo ligero. La Meta Model API está en vista previa para desarrolladores en EE. UU. Prefiere los modelos estándar: Meta puede entrenar con lo que mandes a los «-contributor».",
  },
  pasteKey: { en: "Paste your API key", es: "Pega tu API key" },
  saveKey: { en: "Save and verify", es: "Guardar y verificar" },
  saving: { en: "Checking…", es: "Verificando…" },
  getKey: { en: "Get a key", es: "Consigue una llave" },
  verified: { en: "Verified", es: "Verificada" },
  unverified: { en: "Not verified: Meta didn't answer", es: "Sin verificar: Meta no respondió" },
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
  auth: {
    or: { en: "or with your email", es: "o con tu correo" },
    signin: { en: "Sign in", es: "Entrar" },
    signup: { en: "Create account", es: "Crear cuenta" },
    create: { en: "Create account", es: "Crear cuenta" },
    name: { en: "Name", es: "Nombre" },
    email: { en: "Email", es: "Correo" },
    password: { en: "Password", es: "Contraseña" },
    newPassword: { en: "New password", es: "Nueva contraseña" },
    pwRule: { en: "At least 8 characters", es: "Mínimo 8 caracteres" },
    forgot: { en: "Forgot it?", es: "¿La olvidaste?" },
    back: { en: "Back", es: "Volver" },
    verifyTitle: { en: "Check your email", es: "Revisa tu correo" },
    forgotTitle: { en: "Reset your password", es: "Cambia tu contraseña" },
    resetTitle: { en: "Choose a new password", es: "Elige una nueva contraseña" },
    forgotLead: { en: "We'll email you a 6-digit code.", es: "Te enviaremos un código de 6 dígitos." },
    codeSent: { en: "We sent a 6-digit code to", es: "Enviamos un código de 6 dígitos a" },
    codeHint: { en: "It expires soon; check spam if you don't see it.", es: "Caduca pronto; revisa spam si no lo ves." },
    code: { en: "Verification code", es: "Código de verificación" },
    verify: { en: "Verify and enter", es: "Verificar y entrar" },
    sendCode: { en: "Send code", es: "Enviar código" },
    savePassword: { en: "Save and enter", es: "Guardar y entrar" },
    resend: { en: "Send the code again", es: "Reenviar el código" },
    resendIn: { en: "Resend in", es: "Reenviar en" },
    resent: { en: "Code sent again.", es: "Código reenviado." },
    notConfirmed: { en: "Your email isn't confirmed yet: we sent you a new code.", es: "Tu correo aún no está confirmado: te enviamos un código nuevo." },
    errBadLogin: { en: "Wrong email or password.", es: "Correo o contraseña incorrectos." },
    errExists: { en: "That email already has an account. Sign in instead.", es: "Ese correo ya tiene cuenta. Mejor entra." },
    errCode: { en: "That code is wrong or expired. Ask for a new one.", es: "Ese código es incorrecto o caducó. Pide uno nuevo." },
    errRate: { en: "Too many attempts. Wait a minute and try again.", es: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." },
    errWeak: { en: "That password is too weak.", es: "Esa contraseña es muy débil." },
  },
  hnNote: { en: "Not affiliated with Y Combinator or Hacker News.", es: "Sin afiliación con Y Combinator ni con Hacker News." },
} as const;
