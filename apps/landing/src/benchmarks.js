/* What each frontier benchmark is, what it's made of, how it's scored, how Agentztein could improve on it
   and where that matters in the real world. Figures come from the official pages listed under `sources`
   (checked 2 Nov 2026); versions change, so each sheet says which one it describes. No Agentztein results:
   it hasn't run any of these yet. */

const E = (en, es) => ({ en, es });

export const BENCHES = [
  {
    id: "swe", name: "SWE-bench Pro", color: "#5b9bff", cap: E("Code", "Código"),
    tagline: E("Fix real bugs and ship real features in real repositories, then let hidden tests decide.", "Arreglar errores reales y entregar funciones reales en repositorios reales; después deciden pruebas ocultas."),
    steps: [E("The issue", "El issue"), E("The patch", "El parche"), E("Hidden tests", "Pruebas ocultas")],
    how: [
      E("It receives a repository at a fixed commit and an issue written by a person.", "Recibe un repositorio en un commit fijo y un issue escrito por una persona."),
      E("It explores the code, edits as many files as it needs and submits one patch.", "Explora el código, edita los archivos que necesite y entrega un parche."),
      E("Hidden tests run: the ones that failed must pass now (fail → pass) and the rest must keep passing (pass → pass).", "Corren pruebas ocultas: las que fallaban deben pasar (falla → pasa) y las demás deben seguir pasando (pasa → pasa)."),
    ],
    parts: [
      { title: E("Three sets (1,865 tasks, 41 repositories)", "Tres conjuntos (1,865 tareas, 41 repositorios)"), bars: [[E("Public", "Público"), 731, E("11 repos, open leaderboard", "11 repos, tabla abierta")], [E("Held-out", "Reservado"), 858, E("12 repos, results not published", "12 repos, resultados no publicados")], [E("Commercial", "Comercial"), 276, E("18 private startup repos", "18 repos privados de startups")]] },
      { title: E("Languages", "Lenguajes"), chips: ["Python", "Go", "TypeScript", "JavaScript"] },
      { title: E("Kinds of task", "Tipos de tarea"), chips: [E("Bug fixes", "Errores"), E("Feature requests", "Funciones nuevas"), E("Optimizations", "Optimización"), E("Security updates", "Seguridad"), E("UI/UX changes", "Cambios de UI/UX")] },
    ],
    score: E("Resolve rate: the share of tasks where every fail → pass and pass → pass test is green. Public and held-out repos use copyleft licenses to make memorization less likely.", "Tasa de resolución: el porcentaje de tareas donde todas las pruebas falla → pasa y pasa → pasa salen en verde. Los repos públicos y reservados usan licencias copyleft para que sea menos probable que los modelos los hayan memorizado."),
    note: E("Scores move a lot with the agent's scaffold; compare only within the same harness.", "Los puntajes cambian mucho según el andamiaje del agente; compara solo dentro del mismo arnés."),
    skills: [
      { s: E("Reproduce first: write a failing test before touching the code", "Reproduce primero: escribe una prueba que falle antes de tocar el código"), gain: E("Fewer patches that miss the real bug", "Menos parches que no atinan al error real"), cost: E("More steps and tokens per task", "Más pasos y tokens por tarea") },
      { s: E("Run the whole test suite before shipping", "Corre todas las pruebas antes de entregar"), gain: E("Catches pass → pass breakages", "Detecta lo que rompe pasa → pasa"), cost: E("Slower on large repos", "Más lento en repos grandes") },
      { s: E("Find every caller before changing a function", "Encuentra a todos los que llaman una función antes de cambiarla"), gain: E("Safer multi-file changes", "Cambios en varios archivos más seguros"), cost: E("Little; scoped to code tasks", "Poco; limitada a tareas de código") },
    ],
    uses: [E("Clearing a bug backlog", "Bajar el rezago de errores"), E("Security patches", "Parches de seguridad"), E("Upgrading legacy code", "Actualizar código heredado"), E("Small features from a ticket", "Funciones pequeñas desde un ticket")],
    sources: [["Scale AI · SWE-bench Pro", "https://scale.com/blog/swe-bench-pro"], ["Leaderboard (public set)", "https://scale.com/leaderboard/swe_bench_pro_public"], ["Paper", "https://labs.scale.com/papers/swe-bench-pro"]],
  },
  {
    id: "terminal", name: "Terminal-Bench", color: "#2ec4b6", cap: E("Terminal", "Terminal"),
    tagline: E("Hard, realistic jobs done only through a terminal inside a container: build, configure, debug, secure, train.", "Trabajos difíciles y realistas hechos solo desde una terminal dentro de un contenedor: compilar, configurar, depurar, asegurar, entrenar."),
    steps: [E("The task", "La tarea"), E("Commands", "Comandos"), E("Tests", "Pruebas")],
    how: [
      E("Each task is a container plus an instruction, like “build this project and serve it on port 8080”.", "Cada tarea es un contenedor con una instrucción, como «compila este proyecto y sírvelo en el puerto 8080»."),
      E("The agent types commands, reads the output and decides the next step, against a time limit.", "El agente teclea comandos, lee la salida y decide el siguiente paso, contra un límite de tiempo."),
      E("A test script checks the final state of the machine. Every task ships with a human-written solution that proves it can be done.", "Un script revisa el estado final de la máquina. Cada tarea trae una solución escrita por personas que prueba que sí se puede."),
    ],
    parts: [
      { title: E("Version 2.0: 89 tasks by difficulty", "Versión 2.0: 89 tareas por dificultad"), bars: [[E("Easy", "Fáciles"), 4], [E("Medium", "Medias"), 55], [E("Hard", "Difíciles"), 30]] },
      { title: E("Domains", "Áreas"), chips: [E("Software engineering (largest: 26)", "Ingeniería de software (la mayor: 26)"), E("System administration", "Administración de sistemas"), E("Security", "Seguridad"), E("Scientific computing", "Cómputo científico"), E("Data science", "Ciencia de datos"), E("Model training", "Entrenar modelos"), E("Debugging", "Depuración"), E("Games", "Juegos")] },
      { title: E("Versions", "Versiones"), chips: [E("2.0: 89 tasks", "2.0: 89 tareas"), E("2.1: fixes 28 tasks, continuous validation", "2.1: corrige 28 tareas, validación continua")] },
    ],
    score: E("Share of tasks whose tests pass. Several versions are in use at once and leaderboards mix them: compare only within one version.", "Porcentaje de tareas cuyas pruebas pasan. Hay varias versiones vigentes y las tablas las mezclan: compara solo dentro de una misma versión."),
    note: E("Top scores on 2.0 are now in the 70s–80s depending on the source, so newer versions matter more.", "Los mejores puntajes en 2.0 ya rondan 70–80 según la fuente, así que pesan más las versiones nuevas."),
    skills: [
      { s: E("Read the whole error before retrying", "Lee el error completo antes de reintentar"), gain: E("Fewer blind retries", "Menos reintentos a ciegas"), cost: E("A few more tokens per step", "Unos tokens más por paso") },
      { s: E("Check what's installed before installing", "Revisa qué hay instalado antes de instalar"), gain: E("Avoids version conflicts", "Evita choques de versiones"), cost: E("One extra command", "Un comando extra") },
      { s: E("Keep a scratch log of commands that worked", "Lleva una bitácora de los comandos que funcionaron"), gain: E("Recovers after a dead end", "Se recupera tras un callejón"), cost: E("Context space on long tasks", "Espacio de contexto en tareas largas") },
    ],
    uses: [E("DevOps automation", "Automatizar DevOps"), E("Fixing broken CI", "Arreglar el CI roto"), E("Setting up environments", "Montar ambientes"), E("Data pipelines", "Pipelines de datos")],
    sources: [["tbench.ai", "https://www.tbench.ai/"], ["Snorkel · Terminal-Bench 2.0", "https://www.snorkel.ai/blog/terminal-bench-2-0/"]],
  },
  {
    id: "arc", name: "ARC-AGI-3", color: "#ff8f70", cap: E("Reasoning", "Razonamiento"),
    tagline: E("Interactive games with no instructions: work out the controls, the rules and the goal, and win efficiently.", "Juegos interactivos sin instrucciones: descubrir los controles, las reglas y la meta, y ganar con eficiencia."),
    steps: [E("Look", "Observa"), E("Your turn: play", "Tu turno: juega"), E("Efficient route", "Ruta eficiente")],
    how: [
      E("The agent sees a grid frame and can act: move, click, interact.", "El agente ve un cuadro de cuadrícula y puede actuar: mover, hacer clic, interactuar."),
      E("Each action changes the game; from that it has to infer what it controls and what winning means.", "Cada acción cambia el juego; con eso debe deducir qué controla y qué significa ganar."),
      E("Games have several levels; every action it takes is counted against people who played the same level.", "Los juegos tienen varios niveles; cada acción cuenta y se compara con personas que jugaron el mismo nivel."),
    ],
    parts: [
      { title: E("What it probes", "Qué pone a prueba"), chips: [E("Exploration", "Exploración"), E("Perception", "Percepción"), E("Memory", "Memoria"), E("Goal discovery", "Descubrir la meta"), E("Planning", "Planeación"), E("Efficiency", "Eficiencia")] },
      { title: E("At launch (25 Mar 2026)", "Al lanzarse (25 mar 2026)"), chips: [E("People solved every environment", "Las personas resolvieron todos los entornos"), E("Every frontier model scored below 1%", "Todos los modelos de frontera sacaron menos de 1%")] },
    ],
    score: E("Relative Human Action Efficiency: each level scores (human actions ÷ AI actions)², capped at 100%, and the final score averages the games. Wandering costs points even if it eventually wins.", "Eficiencia relativa a acciones humanas: cada nivel vale (acciones humanas ÷ acciones de la IA)², con tope de 100%, y el puntaje final promedia los juegos. Dar vueltas cuesta puntos aunque al final gane."),
    note: E("The human baseline was revised in 2026 to be less sensitive to one unusually fast player; check the methodology page.", "La línea base humana se ajustó en 2026 para no depender de un jugador inusualmente rápido; revisa la página de metodología."),
    skills: [
      { s: E("Explore first: probe with cheap actions and watch", "Primero explora: prueba con acciones baratas y observa"), gain: E("Finds the rules sooner", "Descubre las reglas antes"), cost: E("Exploring spends actions, and actions lower the score", "Explorar gasta acciones, y las acciones bajan el puntaje") },
      { s: E("Write the rule you believe in and test it", "Escribe la regla que crees y ponla a prueba"), gain: E("Less repeating of failed ideas", "Menos repetir ideas fallidas"), cost: E("Tokens to keep the hypothesis", "Tokens para mantener la hipótesis") },
      { s: E("Never search the web in a new game", "Nunca busques en la web en un juego nuevo"), gain: E("No wasted time", "Nada de tiempo perdido"), cost: E("Must be scoped: on BrowseComp searching is the job", "Debe tener alcance: en BrowseComp buscar es el trabajo") },
    ],
    uses: [E("Software with no manual", "Software sin manual"), E("Robots in new places", "Robots en lugares nuevos"), E("Lab experiments", "Experimentos de laboratorio"), E("Learning a new game or tool", "Aprender un juego o herramienta nueva")],
    sources: [["ARC Prize · results", "https://arcprize.org/results"], ["Methodology", "https://docs.arcprize.org/methodology"], ["Human performance data", "https://arcprize.org/blog/arc-agi-3-human-dataset"]],
  },
  {
    id: "web", name: "BrowseComp", color: "#3ccf6e", cap: E("Web", "Web"),
    tagline: E("1,266 questions whose answers are short and easy to check, but buried deep in the web.", "1,266 preguntas cuya respuesta es corta y fácil de comprobar, pero está enterrada en lo profundo de la web."),
    steps: [E("The question", "La pregunta"), E("Search", "Búsqueda"), E("The answer", "La respuesta")],
    how: [
      E("Each question stacks several clues about one thing: a person, a paper, an event.", "Cada pregunta junta varias pistas sobre una sola cosa: una persona, un artículo, un evento."),
      E("The agent searches, opens pages, rewrites its queries and combines what it finds.", "El agente busca, abre páginas, reescribe sus búsquedas y combina lo que encuentra."),
      E("It answers in a few words with a confidence level; a grader compares it with the reference.", "Responde en pocas palabras con su nivel de confianza; un calificador lo compara con la respuesta de referencia."),
    ],
    parts: [
      { title: E("Topics (share of questions)", "Temas (porcentaje de preguntas)"), bars: [[E("TV and movies", "Series y películas"), 16.2, "%"], [E("Science and tech", "Ciencia y tecnología"), 13.7, "%"], [E("Art", "Arte"), 10.0, "%"], [E("History", "Historia"), 9.9, "%"], [E("Sports", "Deportes"), 9.7, "%"], [E("Music", "Música"), 9.2, "%"], [E("Video games", "Videojuegos"), 5.6, "%"], [E("Geography", "Geografía"), 5.5, "%"], [E("Politics", "Política"), 4.7, "%"], [E("Other", "Otros"), 15.5, "%"]] },
      { title: E("How hard", "Qué tan difícil"), chips: [E("Unsolved by people in 10 minutes", "Personas no las resolvían en 10 minutos"), E("Unsolved by the models of 2025 when written", "Los modelos de 2025 no las resolvían al escribirse"), E("BrowseComp-Plus: same idea on a fixed set of pages", "BrowseComp-Plus: la misma idea con páginas fijas")] },
    ],
    score: E("Accuracy of the short answer. The paper also checks calibration: whether its stated confidence matches how often it is right.", "Exactitud de la respuesta corta. El artículo también revisa la calibración: si la confianza que declara coincide con qué tan seguido acierta."),
    note: E("Started with 1,287 questions; 21 with bad labels were removed.", "Empezó con 1,287 preguntas; se quitaron 21 con etiquetas incorrectas."),
    skills: [
      { s: E("Confirm every fact in two sources", "Confirma cada dato en dos fuentes"), gain: E("Fewer confident wrong answers", "Menos respuestas equivocadas con seguridad"), cost: E("More searches per question", "Más búsquedas por pregunta") },
      { s: E("Start from the rarest clue", "Empieza por la pista más rara"), gain: E("Shorter search paths", "Rutas de búsqueda más cortas"), cost: E("Needs a step to rank the clues", "Necesita un paso para ordenar las pistas") },
      { s: E("Keep a list of queries already tried", "Guarda la lista de búsquedas ya hechas"), gain: E("No loops", "Sin ciclos"), cost: E("Context space", "Espacio de contexto") },
    ],
    uses: [E("Due diligence", "Due diligence"), E("Fact-checking", "Verificar datos"), E("Literature search", "Buscar literatura"), E("Market intelligence", "Inteligencia de mercado")],
    sources: [["OpenAI · BrowseComp", "https://openai.com/index/browsecomp/"], ["Paper (arXiv 2504.12516)", "https://arxiv.org/abs/2504.12516"]],
  },
  {
    id: "research", name: E("MLE-bench & PaperBench", "MLE-bench y PaperBench"), color: "#ff6600", cap: E("AI research", "Investigación de IA"),
    tagline: E("Doing AI research itself: win machine-learning competitions and replicate scientific papers from scratch.", "Hacer investigación de IA: ganar competencias de machine learning y replicar artículos científicos desde cero."),
    steps: [E("Two benches", "Dos bancos"), E("A medal", "Una medalla"), E("Rubric", "Rúbrica")],
    how: [
      E("MLE-bench: 75 Kaggle competitions offline. It gets the data and description, trains models and submits predictions.", "MLE-bench: 75 competencias de Kaggle sin conexión. Recibe los datos y la descripción, entrena modelos y envía predicciones."),
      E("PaperBench: 20 ICML 2024 papers (Spotlight and Oral). It rebuilds each one's code from the paper alone and runs it.", "PaperBench: 20 artículos de ICML 2024 (Spotlight y Oral). Reconstruye el código de cada uno solo con el artículo y lo corre."),
      E("RE-Bench (METR) adds 7 open-ended research engineering tasks with 8-hour human expert baselines.", "RE-Bench (METR) suma 7 tareas abiertas de ingeniería de investigación con líneas base de expertos de 8 horas."),
    ],
    parts: [
      { title: E("MLE-bench: 75 competitions by complexity", "MLE-bench: 75 competencias por complejidad"), bars: [[E("Low", "Baja"), 22], [E("Medium", "Media"), 38], [E("High", "Alta"), 15]] },
      { title: E("PaperBench: 8,316 gradable leaves of three kinds", "PaperBench: 8,316 hojas calificables de tres tipos"), chips: [E("Code development", "Desarrollo de código"), E("Execution", "Ejecución"), E("Result match", "Coincidencia de resultados")] },
      { title: E("Data types in MLE-bench", "Tipos de datos en MLE-bench"), chips: [E("Tabular", "Tabulares"), E("Images", "Imágenes"), E("Text", "Texto"), E("Audio", "Audio"), E("Sequences", "Secuencias")] },
    ],
    score: E("MLE-bench: share of competitions where the submission would earn a medal (bronze or better) on the real leaderboard. PaperBench: a replication score from rubrics written with the papers' authors, graded by a judge model.", "MLE-bench: porcentaje de competencias donde el envío ganaría medalla (bronce o mejor) en la tabla real. PaperBench: un puntaje de réplica según rúbricas escritas con los autores de cada artículo, calificado por un modelo juez."),
    note: E("Both cost real compute (GPU hours); runs are expensive and must be budgeted.", "Ambos gastan cómputo real (horas de GPU); las corridas son caras y hay que presupuestarlas."),
    skills: [
      { s: E("Fix and log the random seed on every run", "Fija y anota la semilla en cada corrida"), gain: E("Results that reproduce", "Resultados que se reproducen"), cost: E("Almost none", "Casi nada") },
      { s: E("Start from a strong, simple baseline", "Empieza con una línea base simple y fuerte"), gain: E("A medal sooner", "Medalla más pronto"), cost: E("May cap the best score", "Puede limitar el mejor puntaje") },
      { s: E("Stop runs that can't reach a medal", "Detén corridas que no alcanzan medalla"), gain: E("Saves GPU hours", "Ahorra horas de GPU"), cost: E("Might kill a late bloomer", "Podría matar una que mejoraba tarde") },
    ],
    uses: [E("AutoML on business data", "AutoML con datos del negocio"), E("Reproducing papers for a team", "Reproducir artículos para un equipo"), E("Speeding up R&D", "Acelerar I+D"), E("Model evaluation", "Evaluar modelos")],
    sources: [["MLE-bench (arXiv 2410.07095)", "https://arxiv.org/abs/2410.07095"], ["PaperBench (arXiv 2504.01848)", "https://arxiv.org/abs/2504.01848"], ["RE-Bench · METR", "https://metr.org/blog/2024-11-22-evaluating-r-d-capabilities-of-llms"]],
  },
  {
    id: "horizon", name: E("METR time horizon", "Horizonte de METR"), color: "#8a7dff", cap: E("Autonomy", "Autonomía"),
    tagline: E("Not one test but a measure: how long a task (in expert time) it completes on its own half of the time.", "No es una prueba sino una medida: qué tan larga es la tarea (en tiempo de un experto) que completa solo la mitad de las veces."),
    steps: [E("Timed tasks", "Tareas cronometradas"), E("50% horizon", "Horizonte al 50%"), E("Newer model", "Modelo nuevo")],
    how: [
      E("Skilled people are timed on hundreds of tasks, from seconds to many hours.", "Se cronometra a personas expertas en cientos de tareas, de segundos a muchas horas."),
      E("The model tries each task about 8 times.", "El modelo intenta cada tarea unas 8 veces."),
      E("A curve of success against task length is fitted; where it crosses 50% is the time horizon (80% is reported too).", "Se ajusta una curva de éxito contra duración; donde cruza el 50% está el horizonte de tiempo (también se reporta el 80%)."),
    ],
    parts: [
      { title: E("Task suites (Time Horizon 1.1, Jan 2026)", "Conjuntos de tareas (Time Horizon 1.1, ene 2026)"), bars: [["HCAST", 97, E("software, cyber, ML, reasoning", "software, ciberseguridad, ML, razonamiento")], ["SWAA", 66, E("very short software actions", "acciones de software muy cortas")], ["RE-Bench", 7, E("long ML research tasks", "tareas largas de investigación de ML")]] },
      { title: E("Trend", "Tendencia"), chips: [E("Doubled about every 7 months (2019–2024)", "Se duplicó cada ~7 meses (2019–2024)"), E("Faster since 2024", "Más rápido desde 2024"), E("Top models now near the suite's ceiling", "Los mejores modelos ya rozan el techo del conjunto")] },
    ],
    score: E("The 50% time horizon, in hours of expert work. METR warns that recent estimates depend on modeling choices and that the suite has few very long tasks.", "El horizonte al 50%, en horas de trabajo experto. METR advierte que las estimaciones recientes dependen de supuestos de modelado y que el conjunto tiene pocas tareas muy largas."),
    note: E("Check metr.org for the current figures: the dashboard updates after new models are evaluated.", "Revisa metr.org para las cifras actuales: el tablero se actualiza después de evaluar modelos nuevos."),
    skills: [
      { s: E("Keep a log and review it every hour", "Lleva una bitácora y revísala cada hora"), gain: E("Doesn't lose the thread", "No pierde el hilo"), cost: E("Overhead on short tasks: scope it to long ones", "Sobrecarga en tareas cortas: limitarla a las largas") },
      { s: E("Save checkpoints of progress", "Guarda puntos de control del avance"), gain: E("Recovers from crashes", "Se recupera de caídas"), cost: E("Disk and time", "Disco y tiempo") },
      { s: E("Detect when it's going in circles", "Detecta cuando da vueltas en círculo"), gain: E("Stops wasted hours", "Corta horas perdidas"), cost: E("Might stop a slow but valid path", "Podría cortar un camino lento pero válido") },
    ],
    uses: [E("Overnight jobs", "Trabajos de toda la noche"), E("Long migrations", "Migraciones largas"), E("Research sprints", "Sprints de investigación"), E("Unattended operations", "Operación sin supervisión")],
    sources: [["METR · time horizons", "https://metr.org/time-horizons/"], ["Modeling assumptions note", "https://metr.org/notes/2026-03-20-impact-of-modelling-assumptions-on-time-horizon-results/"]],
  },
];
