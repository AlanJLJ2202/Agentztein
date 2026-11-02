// /api/keys: the signed-in user's own model-provider keys (bring your own key).
//   GET     list (never returns a key, only its last characters)
//   POST    { provider, key }   verify with the provider, encrypt and save
//   PATCH   { provider, model } choose the model to use
//   DELETE  ?provider=...       forget the key
import { requireUser } from "./_lib/auth.js";
import { hintOf, seal } from "./_lib/crypto.js";
import { db } from "./_lib/db.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";
import { PROVIDERS, defaultModel, isProvider, verifyKey } from "./_lib/providers.js";

const catalog = Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, keysUrl: p.keysUrl }));

/** @param {any} r */
const view = (r) => ({
  provider: r.provider,
  hint: r.hint,
  model: r.model,
  models: r.models ?? [],
  verifiedAt: r.verified_at,
  updatedAt: r.updated_at,
});

const COLS = "provider, hint, model, models, verified_at, updated_at";

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const { rows } = await db().query(`SELECT ${COLS} FROM app.provider_keys WHERE user_id = $1 ORDER BY updated_at DESC`, [user.id]);
  return json({ providers: catalog, keys: rows.map(view) });
});

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const provider = body.provider;
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!isProvider(provider)) throw new HttpError(400, "Choose a provider");
  if (key.length < 16 || key.length > 400 || /\s/.test(key)) throw new HttpError(400, "That doesn't look like an API key");

  const check = await verifyKey(provider, key);
  if (check.status === "invalid") throw new HttpError(400, "The provider rejected this key", { reason: "invalid" });
  const models = check.status === "valid" ? check.models : [];
  const verifiedAt = check.status === "valid" ? new Date() : null;
  const { rows } = await db().query(
    `INSERT INTO app.provider_keys (user_id, provider, secret, hint, model, models, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (user_id, provider) DO UPDATE SET secret = EXCLUDED.secret, hint = EXCLUDED.hint,
       model = COALESCE(EXCLUDED.model, app.provider_keys.model), models = EXCLUDED.models,
       verified_at = EXCLUDED.verified_at, updated_at = now()
     RETURNING ${COLS}`,
    [user.id, provider, seal(key, { userId: user.id, provider }), hintOf(key), defaultModel(provider, models), JSON.stringify(models), verifiedAt],
  );
  return json({ key: view(rows[0]), verified: check.status === "valid" }, 201);
});

export const PATCH = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!isProvider(body.provider)) throw new HttpError(400, "Choose a provider");
  if (!model || model.length > 200 || /\s/.test(model)) throw new HttpError(400, "Choose a model");
  const { rows } = await db().query(
    `UPDATE app.provider_keys SET model = $3, updated_at = now() WHERE user_id = $1 AND provider = $2 RETURNING ${COLS}`,
    [user.id, body.provider, model],
  );
  if (!rows[0]) throw new HttpError(404, "Save a key for this provider first");
  return json({ key: view(rows[0]) });
});

export const DELETE = handle(async (request) => {
  const user = await requireUser(request);
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isProvider(provider)) throw new HttpError(400, "Choose a provider");
  await db().query("DELETE FROM app.provider_keys WHERE user_id = $1 AND provider = $2", [user.id, provider]);
  return json({ ok: true });
});
