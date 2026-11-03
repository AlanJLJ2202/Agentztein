/* What the building teaches. One room per benchmark around the cradle, each with three exhibits explained in
   plain words and an everyday analogy, so anyone can follow. The 3D lives in room.js; this is the text. */
const E = (en, es) => ({ en, es });

export const ROOMS = {
  cuna: {
    name: E("The cradle", "La cuna"), color: 0x0081fb, kind: E("Where Agentztein is born", "Donde nace Agentztein"),
    intro: E("Agentztein wakes up here. Each door leads to a benchmark: every room explains, with an example, what is measured and why it matters.",
      "Aquí despierta Agentztein. Cada puerta lleva a un benchmark: cada cuarto explica con un ejemplo qué se mide y por qué importa."),
    items: {
      coils: { title: E("The coils", "Las bobinas"), text: E("They give it the jolt that switches it on. Interact to bring it back to life.", "Le dan la descarga que lo enciende. Interactúa para revivirlo.") },
      brain: { title: E("The brain: Meta's Muse", "El cerebro: Muse de Meta"), text: E("You choose which Meta model thinks for it: Muse Wonder for the hardest work, Muse Spark for every day (with effort levels from minimal to xhigh) or a lighter open one.", "Tú eliges qué modelo de Meta piensa por él: Muse Wonder para lo más difícil, Muse Spark para el día a día (con niveles de esfuerzo de minimal a xhigh) o uno abierto más ligero.") },
      map: { title: E("Map of the lab", "Mapa del laboratorio"), text: E("Six rooms, six abilities: code, terminal, reasoning, web, research and autonomy. Walk through any door.", "Seis cuartos, seis capacidades: código, terminal, razonamiento, web, investigación y autonomía. Entra por cualquier puerta.") },
    },
  },
  swe: {
    name: E("Software repair shop", "Taller de reparación de software"), bench: "SWE-bench Pro", color: 0x5b9bff, kind: E("Code", "Código"),
    intro: E("Like a garage: a real program arrives with a reported fault, and it has to be fixed without breaking anything else.",
      "Como un taller mecánico: llega un programa real con una falla reportada y hay que arreglarlo sin descomponer nada más."),
    items: {
      ticket: { title: E("The report", "El reporte"), text: E("A person describes the problem in their own words, like a customer saying “the car makes a weird noise”.", "Una persona describe el problema con sus palabras, como un cliente que dice «el coche hace un ruido raro».") },
      toolbox: { title: E("The fix", "El arreglo"), text: E("The agent finds the file where the fault lives and fixes it. Sometimes several files must change.", "El agente encuentra el archivo donde está la falla y la corrige. A veces hay que tocar varios archivos.") },
      tests: { title: E("The hidden tests", "Las pruebas ocultas"), text: E("Lights the agent never sees in advance: red ones must turn green, and green ones must stay on.", "Luces que el agente no ve antes: las rojas deben ponerse verdes y las verdes no deben apagarse.") },
    },
  },
  terminal: {
    name: E("Machine room", "Sala de máquinas"), bench: "Terminal-Bench", color: 0x2ec4b6, kind: E("Terminal", "Terminal"),
    intro: E("No buttons, no mouse: only a terminal where you type orders. Like running a computer by chat.",
      "Aquí no hay botones ni mouse: solo una terminal donde se escriben órdenes. Como manejar una computadora por chat."),
    items: {
      term: { title: E("The terminal", "La terminal"), text: E("The agent types a command, reads what the machine answers and decides the next step.", "El agente escribe un comando, lee lo que responde la máquina y decide el siguiente paso.") },
      rack: { title: E("The sealed box", "La caja sellada"), text: E("Each task runs inside an isolated container: if something breaks, nothing outside is touched.", "Cada tarea corre en un contenedor aislado: si algo se rompe, nada de afuera se toca.") },
      clock: { title: E("The clock", "El reloj"), text: E("Every task has a time limit. At the end, a script checks the machine ended up as asked.", "Cada tarea tiene límite de tiempo. Al final, un script revisa que la máquina quedó como se pidió.") },
    },
  },
  arc: {
    name: E("Game room with no instructions", "Sala de juegos sin instrucciones"), bench: "ARC-AGI-3", color: 0xff8f70, kind: E("Reasoning", "Razonamiento"),
    intro: E("Like playing a brand-new video game that nobody explains: you try, watch and work out the rules. People manage; AIs still struggle.",
      "Como jugar un videojuego nuevo que nadie te explica: pruebas, observas y deduces las reglas. Las personas lo logran; las IA aún batallan."),
    items: {
      board: { title: E("The board (play it!)", "El tablero (¡juégalo!)"), text: E("Walk on the tiles: find the key, then the exit. Every step counts. Interact to start over.", "Camina sobre las casillas: encuentra la llave y luego la salida. Cada paso cuenta. Interactúa para empezar de nuevo.") },
      score: { title: E("The scoreboard", "El marcador"), text: E("Fewer actions win. Take twice as many steps as a person and your score drops to a quarter.", "Gana quien usa menos acciones. Si das el doble de pasos que una persona, tu puntaje baja a una cuarta parte.") },
      rules: { title: E("The hidden rules", "Las reglas ocultas"), text: E("Nobody says them: the agent must discover what it controls, what changes and what winning means.", "Nadie las dice: el agente debe descubrir qué controla, qué cambia y qué significa ganar.") },
    },
  },
  web: {
    name: E("Detective's library", "Biblioteca del detective"), bench: "BrowseComp", color: 0x3ccf6e, kind: E("Web", "Web"),
    intro: E("Questions with a short answer hidden deep in the internet. Like finding a needle in a haystack… of web pages.",
      "Preguntas con una respuesta corta escondida en lo profundo de internet. Como buscar una aguja en un pajar… de páginas web."),
    items: {
      clues: { title: E("The clue board", "El tablero de pistas"), text: E("Each question stacks several clues. They are linked with strings until they point to one answer.", "Cada pregunta junta varias pistas. Se unen con hilos hasta señalar una sola respuesta.") },
      shelves: { title: E("The shelves", "Las estanterías"), text: E("Each book is a web page. Most are useless; the skill is knowing when to change the search.", "Cada libro es una página web. Casi todas no sirven; el truco es saber cuándo cambiar de búsqueda.") },
      answer: { title: E("The answer", "La respuesta"), text: E("Hard to find, easy to check: a single word or number, like “1987”.", "Difícil de encontrar, fácil de comprobar: una sola palabra o número, como «1987».") },
    },
  },
  research: {
    name: E("Science lab", "Laboratorio científico"), bench: "MLE-bench · PaperBench", color: 0xff6600, kind: E("AI research", "Investigación de IA"),
    intro: E("Here the agent does AI research itself: it competes in machine-learning contests and repeats scientific papers to see if they come out the same.",
      "Aquí el agente hace investigación de IA: compite en concursos de machine learning y repite artículos científicos para ver si salen igual."),
    items: {
      podium: { title: E("The contest", "El concurso"), text: E("75 real Kaggle contests. If its result would win a medal among real people, it counts.", "75 concursos reales de Kaggle. Si su resultado ganaría medalla entre personas reales, cuenta.") },
      paper: { title: E("The paper", "El artículo"), text: E("It reads a paper and rebuilds its code from scratch, like cooking a recipe only from the book.", "Lee un artículo y reconstruye su código desde cero, como cocinar una receta solo leyendo el libro.") },
      rubric: { title: E("The rubric", "La rúbrica"), text: E("A tree of checkpoints: did it write the code? did it run? did it give the same result?", "Un árbol de puntos a revisar: ¿escribió el código?, ¿corrió?, ¿dio el mismo resultado?") },
    },
  },
  horizon: {
    name: E("Time observatory", "Observatorio del tiempo"), bench: E("METR time horizon", "Horizonte de METR"), color: 0x8a7dff, kind: E("Autonomy", "Autonomía"),
    intro: E("How long can a task be before the AI can't finish it alone? Like an intern: first you trust them with minutes, then with hours.",
      "¿Qué tan larga puede ser una tarea que la IA termina sola? Como con un practicante: primero le confías minutos, luego horas."),
    items: {
      sand: { title: E("The hourglasses", "Los relojes de arena"), text: E("Each one is a longer task, timed on skilled people: one minute, fifteen minutes, an hour, a day.", "Cada uno es una tarea más larga, cronometrada con personas expertas: un minuto, quince minutos, una hora, un día.") },
      line: { title: E("The 50% line", "La línea del 50%"), text: E("The horizon is the task length the AI completes half of the time.", "El horizonte es la duración de tarea que la IA completa la mitad de las veces.") },
      trend: { title: E("The trend", "La tendencia"), text: E("That horizon has doubled every few months. Measuring it tells us how much we can trust it alone.", "Ese horizonte se ha duplicado cada pocos meses. Medirlo dice cuánto podemos confiarle trabajo solo.") },
    },
  },
  taller: {
    name: E("The central workshop", "El taller central"), color: 0xf2b01e, kind: E("Every tool it can reach for", "Todas las herramientas a su alcance"),
    intro: E("The workshop. Here you see every tool the agent can reach for, and its anatomy like an engine: the brain, one cylinder per skill, the harness and the tools. Walk up to anything and use it.",
      "El taller. Aquí se ven todas las herramientas que tiene a su alcance y su anatomía como un motor: el cerebro, un cilindro por habilidad, el arnés y las herramientas. Acércate a lo que quieras y úsalo."),
    items: {
      engine: { title: E("Its anatomy: the engine", "Su anatomía: el motor"), text: E("The brain (a Muse model) drives six cylinders, one per skill room. A cylinder only lights up when the agent really has that skill installed right now. The green ring is the harness and the wheel is its tools. Interact to rev it.", "El cerebro (un modelo Muse) mueve seis cilindros, uno por cuarto de habilidad. Un cilindro solo se enciende cuando el agente de verdad tiene esa habilidad instalada ahora. El anillo verde es el arnés y el volante son sus herramientas. Interactúa para acelerarlo.") },
      terminal: { title: E("Tool: terminal", "Herramienta: terminal"), text: E("Runs commands inside an isolated container and reads what the machine answers. Used in Terminal-Bench. A goal: not running in the app yet.", "Ejecuta comandos dentro de un contenedor aislado y lee lo que responde la máquina. Se usa en Terminal-Bench. Es una meta: aún no corre en la app.") },
      editor: { title: E("Tool: code editor", "Herramienta: editor de código"), text: E("Opens a file, changes the line that fails and re-runs the tests. Used in SWE-bench. A goal: not running in the app yet.", "Abre un archivo, cambia la línea que falla y vuelve a correr las pruebas. Se usa en SWE-bench. Es una meta: aún no corre en la app.") },
      browser: { title: E("Tool: web browser", "Herramienta: navegador web"), text: E("Searches, opens results and reads pages to find a hard-to-find fact. Used in BrowseComp. A goal: not running in the app yet.", "Busca, abre resultados y lee páginas para encontrar un dato difícil de hallar. Se usa en BrowseComp. Es una meta: aún no corre en la app.") },
      radar: { title: E("Tool: Hacker News radar", "Herramienta: radar de Hacker News"), text: E("Reads the most discussed AI stories every day and judges each: experiment, watch or skip. Live in the app with your own Meta key.", "Lee a diario las historias de IA más comentadas y juzga cada una: experimentar, vigilar o descartar. Funciona hoy en la app con tu propia llave de Meta.") },
      exams: { title: E("Tool: exam runner", "Herramienta: ejecutor de exámenes"), text: E("Answers the practice and validation exams with its active skills and saves every answer, time and cost. Live in the app.", "Contesta los exámenes de práctica y validación con sus habilidades activas y guarda cada respuesta, tiempo y costo. Funciona hoy en la app.") },
      skills: { title: E("Tool: skill library", "Herramienta: biblioteca de habilidades"), text: E("Where approved skills live, each with a version, a scope and a validity. The one that applies is added to the prompt. Live in the app.", "Donde viven las habilidades aprobadas, cada una con versión, alcance y vigencia. La que aplica se suma al prompt. Funciona hoy en la app.") },
      harness: { title: E("Tool: harness", "Herramienta: arnés"), text: E("Checks the budget before every call, blocks risky moves and waits for a person to approve. Everything goes into a log that can't be edited. Live in the app.", "Revisa el presupuesto antes de cada llamada, bloquea lo riesgoso y espera la aprobación de una persona. Todo queda en un registro que no se edita. Funciona hoy en la app.") },
      voice: { title: E("Tool: Muse Voice", "Herramienta: Voz de Muse"), text: E("You tell it by voice what to focus on; Muse Voice transcribes it and the text reaches the planner. Live in the app with your Meta key, if it has access.", "Le dices por voz en qué enfocarse; Muse Voice lo transcribe y el texto llega al planificador. Funciona en la app con tu llave de Meta, si tiene acceso.") },
      image: { title: E("Tool: Muse Image", "Herramienta: Imagen de Muse"), text: E("Paints an emblem for every skill it writes, so you can tell them apart. Live in the app with your Meta key, if it has access.", "Pinta un emblema para cada habilidad que escribe, para distinguirlas. Funciona en la app con tu llave de Meta, si tiene acceso.") },
    },
  },
};

// every benchmark room keeps a copy of Agentztein frozen in a cryo pod: it wakes up to run the room's test
for (const [id, room] of Object.entries(ROOMS)) {
  if (id === "cuna") continue;
  room.items.pod = {
    title: E("The frozen test subject", "El sujeto de prueba congelado"),
    text: E("A copy of Agentztein waits in cryosleep. Interact to wake it: it runs this room's test (a simulation), and if the new skill works, it gets sewn onto the real Agentztein.",
      "Una copia de Agentztein espera en criogenia. Interactúa para despertarla: hace la prueba de este cuarto (una simulación) y, si la habilidad nueva funciona, se la cosen al Agentztein de verdad."),
  };
}

export const UI = {
  interact: E("Interact", "Interactuar"),
  keyHint: E("E or click", "E o clic"),
  openLab: E("Open its interactive lab", "Abrir su laboratorio interactivo"),
  fp: E("First person", "Primera persona"),
  tp: E("Third person", "Tercera persona"),
  fpHint: E("Drag to look · W A S D or arrows to walk · E to interact", "Arrastra para mirar · W A S D o flechas para caminar · E para interactuar"),
  tpHint: E("Tap the floor or a door · arrows to walk · Space: jetpack · V for first person", "Toca el piso o una puerta · flechas para caminar · Espacio: jetpack · V para primera persona"),
  fpHint2: E("Move the mouse to look · W A S D to walk · Shift to run · Space: jetpack · click or E to interact · Esc to release", "Mueve el mouse para mirar · W A S D para caminar · Shift para correr · Espacio: jetpack · clic o E para interactuar · Esc para soltar"),
  fpLock: E("Click the view to capture the mouse and look around like in a game", "Haz clic en la vista para capturar el mouse y mirar como en un videojuego"),
  full: E("Full screen", "Pantalla completa"),
  exitFull: E("Exit full screen", "Salir de pantalla completa"),
};
