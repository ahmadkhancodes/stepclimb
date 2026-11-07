import { e2eMode } from "@/lib/env";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guardMagicLink } from "@/lib/security/magic-link-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = async (req: Request) => {
  // e2e signs in over and over from one machine: the guard is off only when E2E_OUTBOX=1 (never set on Vercel)
  if (req.method === "POST" && !e2eMode() && new URL(req.url).pathname.endsWith("/sign-in/magic-link")) {
    const blocked = await guardMagicLink(req, await getDb());
    if (blocked) return blocked;
  }
  return (await getAuth()).handler(req);
};
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(handler);
