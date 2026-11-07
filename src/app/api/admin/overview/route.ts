import { usageOverview } from "@/lib/admin/console";
import { requireFounder } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  await requireFounder();
  const { adminOverview } = await import("@/lib/admin");
  return json({ ...(await adminOverview()), usage: await usageOverview(await getDb()) });
});
