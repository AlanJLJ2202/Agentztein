// Everything the landing can ask ElevenLabs to make: sound effects and spoken lines.
// It is a closed list on purpose: /api/audio only generates what is written here, so nobody can use the
// site to spend the ElevenLabs quota on their own text. The 3D scenes (apps/landing) import this same file,
// so the words in the speech bubble and the words that are spoken never drift apart.
// Pure data: no imports, no Node APIs (it is bundled into the browser too).

/** @typedef {{ prompt: string, seconds: number }} Sfx */

/** @type {Record<string, Sfx>} */
export const SFX = {
  zap: { prompt: "Tesla coil electric zap, high voltage crackle and arc discharge, sci-fi laboratory, no music", seconds: 2 },
  awake: { prompt: "Small robot waking up: electronic power-up hum rising in pitch, then a happy two-note chime", seconds: 2 },
  step: { prompt: "A single soft metallic robot footstep on a clean tiled floor, very short, dry, no echo", seconds: 0.5 },
  door: { prompt: "Sci-fi automatic sliding door whoosh, short and smooth", seconds: 1.2 },
  interact: { prompt: "Soft futuristic interface confirmation blip, short and clean", seconds: 0.6 },
  success: { prompt: "Bright positive achievement chime, short rising sci-fi arpeggio", seconds: 1.2 },
  fail: { prompt: "Short low electronic error buzz, two pulses, sci-fi", seconds: 0.8 },
  pickup: { prompt: "Arcade item pickup sparkle, quick bright coin-like chime", seconds: 0.8 },
  chip: { prompt: "A small electronic chip snapping into place with a satisfying click and a soft power-on tone", seconds: 0.9 },
  chirps: { prompt: "Soft futuristic computer data chirps and quiet beeps, a screen processing information, gentle, low volume, no music", seconds: 2 },
  jet: { prompt: "Jetpack ignition: a short powerful whoosh of compressed air and a rising rocket thruster burst, sci-fi", seconds: 1.5 },
  engine: { prompt: "A car engine starting and revving up, then settling to an idle, mechanical, close", seconds: 3 },
  alarm: { prompt: "A soft, calm two-note notification chime, gentle and low volume, warm bell tone, no siren, no buzzer", seconds: 2 },
  shield: { prompt: "Energy force field dome activating, rising electric hum with a shimmering sweep", seconds: 1.5 },
  shieldhit: { prompt: "A soft muted bump of an energy shield, gentle, low volume, no loud zap", seconds: 1 },
};

/** @typedef {{ en: string, es: string }} Line */

/** The agent's spoken lines. Ids are what the pages send; the text is what gets voiced. @type {Record<string, Line>} */
export const LINES = {
  alive: { en: "I'm alive!", es: "¡Estoy vivo!" },
  volt: { en: "More voltage!", es: "¡Más voltaje!" },
  ready: { en: "Ready for the next benchmark.", es: "Listo para el siguiente benchmark." },
  thanks: { en: "Bzzzt! Thanks.", es: "¡Bzzzt! Gracias." },
  another: { en: "Another test? Bring it on!", es: "¿Otra prueba? ¡Venga!" },
  think: { en: "Thinking harder costs more time.", es: "Pensar más a fondo cuesta más tiempo." },
  key: { en: "A key! Something must open.", es: "¡Una llave! Algo debe abrirse." },
  start: { en: "Start on the pink tile. Go!", es: "Empieza en la casilla rosa. ¡Ve!" },
  cleared: { en: "Level cleared!", es: "¡Nivel superado!" },
  piece1: { en: "New piece!", es: "¡Pieza nueva!" },
  piece2: { en: "New piece! That's 2.", es: "¡Pieza nueva! Ya van 2." },
  piece3: { en: "New piece! That's 3.", es: "¡Pieza nueva! Ya van 3." },
  piece4: { en: "New piece! That's 4.", es: "¡Pieza nueva! Ya van 4." },
  piece5: { en: "New piece! That's 5.", es: "¡Pieza nueva! Ya van 5." },
  piece6: { en: "New piece! That's 6.", es: "¡Pieza nueva! Ya van 6." },
  "welcome-swe": { en: "Welcome to the software repair shop.", es: "Bienvenido al taller de reparación de software." },
  "welcome-terminal": { en: "Welcome to the machine room.", es: "Bienvenido a la sala de máquinas." },
  "welcome-arc": { en: "Welcome to the game room with no instructions.", es: "Bienvenido a la sala de juegos sin instrucciones." },
  "welcome-web": { en: "Welcome to the detective's library.", es: "Bienvenido a la biblioteca del detective." },
  "welcome-research": { en: "Welcome to the science lab.", es: "Bienvenido al laboratorio científico." },
  "welcome-horizon": { en: "Welcome to the time horizon room.", es: "Bienvenido a la sala del horizonte de tiempo." },
  "tour-cuna": { en: "Welcome to the reception. This is where I wake up. Each door leads to a benchmark room, and the door to the south leads to my workshop.", es: "Bienvenido a la recepción. Aquí despierto yo. Cada puerta lleva a un cuarto de benchmark, y la puerta del sur lleva a mi taller." },
  "tour-taller": { en: "This is the central workshop. Every tool I can reach for is here, and the engine shows my anatomy: each cylinder lights up only when I really have that skill installed.", es: "Este es el taller central. Aquí están todas las herramientas a mi alcance, y el motor muestra mi anatomía: cada cilindro se enciende solo cuando de verdad tengo esa habilidad instalada." },
  "tour-swe": { en: "Software repair shop. I get a real bug report, find the file, write the fix, and hidden tests tell me whether it worked.", es: "Taller de reparación de software. Recibo un reporte real de un error, encuentro el archivo, escribo el arreglo y unas pruebas ocultas me dicen si funcionó." },
  "tour-terminal": { en: "Machine room. I type commands inside an isolated container, and at the end a script checks the machine ended up as asked, within a time limit.", es: "Sala de máquinas. Escribo comandos dentro de un contenedor aislado y al final un script revisa que la máquina quedó como se pidió, dentro de un límite de tiempo." },
  "tour-arc": { en: "Game room with no instructions. I have to discover the rules by moving and watching. The fewer steps compared with a person, the better my score.", es: "Sala de juegos sin instrucciones. Tengo que descubrir las reglas moviéndome y observando. Mientras menos pasos que una persona, mejor mi puntaje." },
  "tour-web": { en: "Detective's library. I follow clues across web pages to find one answer that is very hard to find but easy to check.", es: "Biblioteca del detective. Sigo pistas por páginas web para encontrar una respuesta muy difícil de hallar, pero fácil de comprobar." },
  "tour-research": { en: "Science lab. Here I do AI research: I compete in machine learning contests and try to reproduce scientific papers.", es: "Laboratorio científico. Aquí hago investigación de IA: compito en concursos de machine learning e intento reproducir artículos científicos." },
  "tour-horizon": { en: "Time observatory. This measures how long a task I can finish on my own before I start to fail.", es: "Observatorio del tiempo. Aquí se mide qué tan larga puede ser una tarea que termine solo antes de empezar a fallar." },
  "welcome-taller": { en: "Welcome to the central workshop.", es: "Bienvenido al taller central." },
  "h-blocked": { en: "Blocked. Nothing gets past the harness.", es: "Bloqueado. Nada pasa del arnés." },
  "h-wait": { en: "Four checks passed. Now a person decides.", es: "Cuatro controles superados. Ahora decide una persona." },
  "h-ok": { en: "Approved by a person. Safe to learn.", es: "Aprobado por una persona. Seguro para aprender." },
};

export const SFX_IDS = Object.keys(SFX);
export const LINE_IDS = Object.keys(LINES);
