// Turns a database failure into a cause a person can fix, without exposing the URL or the password.
// Vercel's logs keep the full error; the app gets a short code and what to change.

/**
 * @typedef {"missing" | "url" | "ssl" | "unreachable" | "auth" | "schema"} DbProblem
 */

/** @type {Record<DbProblem, string>} */
export const DB_HINTS = {
  missing: "DATABASE_URL is not set in Vercel.",
  url: "DATABASE_URL is malformed. If the password has symbols (@, #, /, ?), URL-encode them or reset it to letters and digits.",
  ssl: "Vercel doesn't trust Supabase's certificate: set DATABASE_SSL_CA in Vercel to the full contents of Supabase's CA certificate (Database Settings → SSL), including the BEGIN/END lines.",
  unreachable: "Vercel can't reach the database. Use the Transaction pooler connection string (…pooler.supabase.com:6543), not the direct connection.",
  auth: "The database rejected the user or password in DATABASE_URL. With the pooler the user is postgres.<project-ref>.",
  schema: "The database has no app tables. Run GitHub → Actions → db-migrate against the same database Vercel uses.",
};

/** @param {unknown} err @returns {DbProblem | null} */
export function dbProblem(err) {
  if (!err || typeof err !== "object") return null;
  const e = /** @type {{ code?: string, message?: string, cause?: unknown }} */ (err);
  const code = String(e.code ?? "");
  const msg = String(e.message ?? "").toLowerCase();
  if (msg.includes("database_url is not set")) return "missing";
  if (code === "ERR_INVALID_URL" || msg.includes("invalid url")) return "url";
  if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code)
    || msg.includes("self-signed certificate") || msg.includes("self signed certificate") || msg.includes("certificate")
    || msg.includes("no pem data") || msg.includes("pem routines") || msg.includes("the server does not support ssl")) return "ssl";
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET"].includes(code)
    || msg.includes("connection terminated") || msg.includes("timeout exceeded when trying to connect")) return "unreachable";
  if (code === "28P01" || code === "28000" || msg.includes("password authentication failed") || msg.includes("tenant or user not found")) return "auth";
  if (code === "42P01" || code === "3F000" || (msg.includes("relation") && msg.includes("does not exist"))) return "schema";
  return e.cause ? dbProblem(e.cause) : null;
}
