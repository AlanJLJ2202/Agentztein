// GET /api/visits: the site's traffic for the owners listed in ADMIN_EMAILS (ADR-034).
//   ?check=1   { admin }  whether the signed-in person may see it (no queries; the app uses it to show the tab)
//   ?days=30   visitors, how far they got (the funnel), where they came from and the latest visits
import { requireUser } from "./_lib/auth.js";
import { db } from "./_lib/db.js";
import { HttpError, handle, json } from "./_lib/http.js";
import { isAdmin, summary } from "./_lib/visits.js";

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const params = new URL(request.url).searchParams;
  const admin = isAdmin(user.email);
  if (params.get("check")) return json({ admin });
  if (!admin) throw new HttpError(403, "Only the site's owners see its traffic (ADMIN_EMAILS)", { reason: "not-admin" });
  const days = Math.max(1, Math.min(365, Math.round(Number(params.get("days")) || 30)));
  return json(await summary(db(), days));
});
