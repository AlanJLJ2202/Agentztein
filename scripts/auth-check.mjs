// pnpm auth:check — checks the Google sign-in setup with the same variables Vercel uses:
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… GOOGLE_CLIENT_ID=… pnpm auth:check
import { googleClientId, googleSetup } from "../api/_lib/google.js";

const HELP = {
  ok: "Listo: Supabase y el botón de Google usan el mismo Client ID.",
  "not-configured": "Faltan SUPABASE_URL o SUPABASE_ANON_KEY.",
  disabled: "Supabase → Authentication → Sign In / Providers → Google: actívalo con el Client ID y el Client Secret.",
  mismatch: "El Client ID de Supabase no es el de GOOGLE_CLIENT_ID. Usa el mismo cliente web en ambos.",
  "no-client-id": "Falta GOOGLE_CLIENT_ID (o no tiene la forma 123…-abc.apps.googleusercontent.com). Sin él, la app usa el flujo con redirección.",
  unknown: "No se pudo comprobar (sin red o Supabase no respondió). Inténtalo de nuevo.",
};
const r = await googleSetup(fetch, { fresh: true });
console.log(`GOOGLE_CLIENT_ID      ${googleClientId() || "(falta)"}`);
console.log(`Google en Supabase    ${r.enabled === null ? "?" : r.enabled ? "activado" : "apagado"}`);
console.log(`Client ID de Supabase ${r.supabaseClientId ?? "?"}`);
console.log(`\n${r.status.toUpperCase()}: ${HELP[r.status]}`);
process.exit(r.status === "ok" ? 0 : 1);
