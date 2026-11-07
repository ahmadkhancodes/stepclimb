import { z } from "zod";
import { AdminError, adminSetPin } from "@/lib/admin/console";
import { requireFounder } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["recipes", "rules"]), key: z.string().min(1).max(120), disabled: z.boolean().optional(), version: z.string().max(20).optional(), clear: z.boolean().optional() });

/** Founder pinning: switch a recipe or repair rule off, hold it to one version, or clear the pin. Takes effect on the next run. */
export const POST = withApi(async (req) => {
  const { user } = await requireFounder();
  const b = await readJson(req, Body);
  try {
    const pins = await adminSetPin(await getDb(), user.id, b.kind, b.key, b.clear ? null : { ...(b.disabled ? { disabled: true } : {}), ...(b.version ? { version: b.version } : {}) });
    return json({ pins });
  } catch (e) {
    if (e instanceof AdminError) return json({ error: e.code }, e.status);
    throw e;
  }
}, { route: "admin/pins" });
