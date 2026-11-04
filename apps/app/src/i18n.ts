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
    en: "Create your account, connect Meta's Muse models with your own key and watch it practice on exams in the style of the frontier benchmarks, read what's new in AI and improve itself, with your approval.",
    es: "Crea tu cuenta, conéctale los modelos Muse de Meta con tu propia llave y míralo practicar en exámenes al estilo de los benchmarks de frontera, leer lo nuevo en IA y mejorarse solo, con tu aprobación.",
  },
  signInBullets: {
    en: ["Your own Meta API key, encrypted, with a spending cap per cycle", "A research radar over Hacker News, arXiv, Hugging Face and GitHub", "Exams in the style of SWE-bench, Terminal-Bench, ARC-AGI, BrowseComp and MLE-bench"],
    es: ["Tu propia llave de Meta, cifrada, con tope de gasto por ciclo", "Un radar de investigación sobre Hacker News, arXiv, Hugging Face y GitHub", "Exámenes al estilo de SWE-bench, Terminal-Bench, ARC-AGI, BrowseComp y MLE-bench"],
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
    overview: { en: "Home", es: "Inicio" },
    mind: { en: "Brain", es: "Cerebro" },
    lab: { en: "Process", es: "Proceso" },
    agent: { en: "Agent", es: "Agente" },
    evolve: { en: "Its code", es: "Su código" },
    radar: { en: "Radar", es: "Radar" },
    brain: { en: "Settings", es: "Ajustes" },
    traffic: { en: "Traffic", es: "Tráfico" },
  },

  hello: { en: "Hi", es: "Hola" },
  overviewLead: {
    en: "This is your Agentztein. Get it ready in three steps; the rest arrives as the lab grows.",
    es: "Este es tu Agentztein. Déjalo listo en tres pasos; lo demás llega conforme crece el laboratorio.",
  },
  steps: [
    { t: { en: "Account created", es: "Cuenta creada" }, d: { en: "Your notes and keys are yours only.", es: "Tus notas y llaves son solo tuyas." } },
    { t: { en: "Connect its brain", es: "Conéctale el cerebro" }, d: { en: "Add your Meta Model API key: Muse Spark does the thinking.", es: "Agrega tu llave de la Meta Model API: Muse Spark es quien piensa." } },
    { t: { en: "Run the research radar", es: "Corre el radar de investigación" }, d: { en: "It reads Hacker News, arXiv, Hugging Face and GitHub and decides what deserves an experiment.", es: "Lee Hacker News, arXiv, Hugging Face y GitHub y decide qué merece un experimento." } },
    { t: { en: "Let it improve itself", es: "Deja que se mejore solo" }, d: { en: "It takes a real exam, writes itself a skill and asks for your approval.", es: "Presenta un examen real, se escribe una habilidad y te pide aprobación." } },
    { t: { en: "Buy AI credits", es: "Compra créditos de IA" }, d: { en: "Phase 2: use Agentztein without your own key.", es: "Fase 2: usa Agentztein sin tu propia llave." } },
  ],
  done: { en: "Done", es: "Listo" },
  go: { en: "Start", es: "Empezar" },
  soon: { en: "Soon", es: "Pronto" },
  phase2: { en: "Phase 2", es: "Fase 2" },
  brainTitle: { en: "Its brain is Meta's; the key is yours", es: "El cerebro es de Meta; la llave, tuya" },
  brainLead: {
    en: "Agentztein's brain comes from Meta's Muse models. Paste your Meta Model API key: we check it with Meta, encrypt it (AES-256-GCM) and only use it for the runs you start. We never show it again.",
    es: "El cerebro de Agentztein viene de los modelos Muse de Meta. Pega tu llave de la Meta Model API: la verificamos con Meta, la ciframos (AES-256-GCM) y solo la usamos en las corridas que tú inicies. Nunca la volvemos a mostrar.",
  },
  metaNote: {
    en: "Choose which Meta model thinks for it: Muse Wonder for the hardest work, Muse Spark for every day, or a lighter one. Meta Model API is in public preview for developers in the US.",
    es: "Elige qué modelo de Meta piensa por él: Muse Wonder para lo más difícil, Muse Spark para el día a día o uno más ligero. La Meta Model API está en vista previa para desarrolladores en EE. UU.",
  },
  pasteKey: { en: "Paste your API key", es: "Pega tu API key" },
  saveKey: { en: "Save and verify", es: "Guardar y verificar" },
  saving: { en: "Checking…", es: "Verificando…" },
  getKey: { en: "Get a key", es: "Consigue una llave" },
  verified: { en: "Verified", es: "Verificada" },
  unverified: { en: "Not verified: Meta didn't answer", es: "Sin verificar: Meta no respondió" },
  model: { en: "Model", es: "Modelo" },
  useModel: { en: "Use this model", es: "Usar este modelo" },
  chooseModel: { en: "Which Meta model thinks for it", es: "Qué modelo de Meta piensa por él" },
  sees: { en: "sees images, video, PDF", es: "ve imágenes, video, PDF" },
  hasEffort: { en: "effort levels", es: "niveles de esfuerzo" },
  noEffort: { en: "no effort levels", es: "sin niveles de esfuerzo" },
  notWithKey: { en: "not available with your key", es: "no disponible con tu llave" },
  priceNote: { en: "USD per million tokens, input / output. * Only in third-party listings; check Meta's page.", es: "USD por millón de tokens, entrada / salida. * Solo en listados de terceros; confírmalo con Meta." },
  otherModel: { en: "Another model id", es: "Otro id de modelo" },
  effort: { en: "Effort", es: "Esfuerzo" },
  effortHelp: { en: "More effort: deeper thinking, more time and cost.", es: "Más esfuerzo: piensa más a fondo, con más tiempo y costo." },
  replace: { en: "Replace key", es: "Cambiar llave" },
  remove: { en: "Remove", es: "Quitar" },
  confirmRemove: { en: "Remove this key? Agentztein will stop using it.", es: "¿Quitar esta llave? Agentztein dejará de usarla." },
  creditsTitle: { en: "AI credits", es: "Créditos de IA" },
  creditsLead: { en: "Buy credits and use Agentztein without your own key. Coming in phase 2.", es: "Compra créditos y usa Agentztein sin tu propia llave. Llega en la fase 2." },
  radarTitle: { en: "Research radar", es: "Radar de investigación" },
  radarLead: {
    en: "Every week Agentztein reads four sources: the most discussed AI stories on Hacker News, new papers on arXiv, the papers the community upvotes on Hugging Face and the AI repositories rising on GitHub. With your model it decides which deserve an experiment, which to watch and which to skip, and writes down the trade-off. Nothing is adopted without passing the lab.",
    es: "Cada semana Agentztein lee cuatro fuentes: las historias de IA más comentadas en Hacker News, los papers nuevos de arXiv, los papers que la comunidad vota en Hugging Face y los repositorios de IA que van subiendo en GitHub. Con tu modelo decide cuáles merecen un experimento, cuáles vigilar y cuáles descartar, y anota el trade-off. Nada se adopta sin pasar por el laboratorio.",
  },
  triage: { en: "Triage with my model", es: "Clasificar con mi modelo" },
  triaging: { en: "Reading and deciding…", es: "Leyendo y decidiendo…" },
  needKey: { en: "Connect a key first to let it decide.", es: "Conecta una llave primero para que pueda decidir." },
  liveTitle: { en: "New this week in its sources", es: "Lo nuevo de la semana en sus fuentes" },
  liveNote: { en: "Tags are a keyword guess from the title, not the agent's verdict.", es: "Las etiquetas son una suposición por palabras del título, no el veredicto del agente." },
  liveError: { en: "The sources didn't answer. Try again in a moment.", es: "Las fuentes no respondieron. Intenta en un momento." },
  sourceDown: { en: "didn't answer this time", es: "no respondió esta vez" },
  sourceStale: { en: "didn't answer this time: you see what it had a few hours ago", es: "no respondió esta vez: ves lo que tenía hace unas horas" },
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
  judgedBy: { en: "Judged from the title and summary by", es: "Juzgado por el título y el resumen con" },
  read: { en: "items read", es: "publicaciones leídas" },
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
    googleSignup: { en: "Sign up with Google", es: "Registrarse con Google" },
    googleSignupHint: { en: "With Google your account is created at once: no password and no code.", es: "Con Google tu cuenta se crea al momento: sin contraseña y sin código." },
    errGoogleAudience: { en: "Google sign-in isn't set up right: Supabase and the Google button use different client IDs.", es: "El acceso con Google está mal configurado: Supabase y el botón de Google usan Client IDs distintos." },
    errGoogleNonce: { en: "Google's answer couldn't be verified. Try again.", es: "No se pudo verificar la respuesta de Google. Inténtalo de nuevo." },
    errGoogleOff: { en: "Google sign-in isn't turned on yet. Use email for now.", es: "El acceso con Google aún no está activado. Por ahora usa tu correo." },
    errNoSignup: { en: "New accounts are closed right now.", es: "Por ahora no se aceptan cuentas nuevas." },
  },
  harness: {
    title: { en: "Harness: your limits", es: "Arnés: tus límites" },
    lead: { en: "Agentztein never spends more than this in a calendar month. Before each run it checks the worst case; if it could go over, it doesn't call Meta.", es: "Agentztein nunca gasta más que esto en un mes. Antes de cada corrida revisa el peor caso; si podría pasarse, no llama a Meta." },
    monthly: { en: "Monthly budget (USD)", es: "Presupuesto mensual (USD)" },
    save: { en: "Save limit", es: "Guardar límite" },
    saved: { en: "Saved", es: "Guardado" },
    spent: { en: "spent this month", es: "gastado este mes" },
    runs: { en: "runs", es: "corridas" },
    log: { en: "Every call is written to a log that can't be edited.", es: "Cada llamada queda en un registro que no se puede editar." },
    approve: { en: "Approve for the lab", es: "Aprobar para el laboratorio" },
    reject: { en: "Reject", es: "Rechazar" },
    approved: { en: "Approved by you", es: "Aprobada por ti" },
    rejected: { en: "Rejected by you", es: "Rechazada por ti" },
    needsYou: { en: "Needs your approval before going to the lab.", es: "Necesita tu aprobación antes de ir al laboratorio." },
    overBudget: { en: "Stopped by the harness: this run could go over your monthly budget.", es: "Detenido por el arnés: esta corrida podría pasarse de tu presupuesto mensual." },
  },
  db: {
    title: { en: "The database isn't reachable", es: "No se puede usar la base de datos" },
    missing: { en: "DATABASE_URL is not set in Vercel.", es: "Falta DATABASE_URL en Vercel." },
    url: { en: "DATABASE_URL is malformed. If the password has symbols (@, #, /, ?), URL-encode them or reset it to letters and digits.", es: "DATABASE_URL está mal formada. Si la contraseña tiene símbolos (@, #, /, ?), codifícalos o cámbiala por letras y números." },
    ssl: { en: "Vercel doesn't trust Supabase's certificate: set DATABASE_SSL_CA in Vercel to the full contents of Supabase's CA certificate (Database Settings → SSL), with the BEGIN/END lines, and redeploy.", es: "Vercel no confía en el certificado de Supabase: pon en Vercel DATABASE_SSL_CA con el contenido completo del certificado CA de Supabase (Database Settings → SSL), con las líneas BEGIN/END, y vuelve a desplegar." },
    unreachable: { en: "Vercel can't reach the database. Use the Transaction pooler string (…pooler.supabase.com:6543), not the direct connection, and redeploy.", es: "Vercel no alcanza la base de datos. Usa la cadena del Transaction pooler (…pooler.supabase.com:6543), no la conexión directa, y vuelve a desplegar." },
    auth: { en: "The database rejected the user or password in DATABASE_URL. With the pooler the user is postgres.<project-ref>.", es: "La base rechazó el usuario o la contraseña de DATABASE_URL. Con el pooler el usuario es postgres.<ref-del-proyecto>." },
    schema: { en: "The database has no app tables: run GitHub → Actions → db-migrate against the same database Vercel uses.", es: "La base no tiene las tablas de la app: corre GitHub → Actions → db-migrate contra la misma base que usa Vercel." },
  },
  hnNote: { en: "Public data from each source; not affiliated with Y Combinator, arXiv, Hugging Face or GitHub.", es: "Datos públicos de cada fuente; sin afiliación con Y Combinator, arXiv, Hugging Face ni GitHub." },
} as const;
