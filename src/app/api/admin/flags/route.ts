import { z } from "zod";
import { AdminError, adminSetPathFlag } from "@/lib/admin/console";
import { requireFounder } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ flag: z.string().min(1).max(60), on: z.boolean() });

/** Founder switch for one upgrade path (`path_laravel_11_to_12`). Off answers 503 path_disabled on new runs. */
export const POST = withApi(async (req) => {
  const { user } = await requireFounder();
  const b = await readJson(req, Body);
  try {
    await adminSetPathFlag(await getDb(), user.id, b.flag, b.on);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AdminError) return json({ error: e.code }, e.status);
    throw e;
  }
}, { route: "admin/flags" });
