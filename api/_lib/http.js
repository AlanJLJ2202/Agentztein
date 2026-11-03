import { DB_HINTS, dbProblem } from "./dberror.js";

// Small helpers for the Web-standard handlers Vercel runs from /api (files under _lib are not routes).

export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {Record<string, unknown>} [extra] */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** @param {unknown} body @param {number} [status] */
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** @param {Request} request @returns {Promise<Record<string, unknown>>} */
export async function readJson(request) {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return /** @type {Record<string, unknown>} */ (body);
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "Expected a JSON object");
}

/**
 * Wraps a handler so thrown HttpErrors become JSON responses and anything else a generic 500.
 * @param {(request: Request) => Promise<Response>} fn
 */
export const handle = (fn) => async (/** @type {Request} */ request) => {
  try {
    return await fn(request);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
    console.error(err);
    const problem = dbProblem(err);
    if (problem) return json({ error: DB_HINTS[problem], reason: "database", detail: problem }, 503);
    return json({ error: "Something went wrong on our side" }, 500);
  }
};
