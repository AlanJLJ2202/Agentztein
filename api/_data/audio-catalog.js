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
  alarm: { prompt: "Sci-fi security alarm, two urgent siren pulses, short, no voice", seconds: 2 },
  shield: { prompt: "Energy force field dome activating, rising electric hum with a shimmering sweep", seconds: 1.5 },
  shieldhit: { prompt: "Energy shield deflecting an impact, electric zap with a low thud", seconds: 1 },
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
  "h-blocked": { en: "Blocked. Nothing gets past the harness.", es: "Bloqueado. Nada pasa del arnés." },
  "h-wait": { en: "Four checks passed. Now a person decides.", es: "Cuatro controles superados. Ahora decide una persona." },
  "h-ok": { en: "Approved by a person. Safe to learn.", es: "Aprobado por una persona. Seguro para aprender." },
};

export const SFX_IDS = Object.keys(SFX);
export const LINE_IDS = Object.keys(LINES);
