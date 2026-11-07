import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminEmails, isProd, e2eMode } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { getAuth } from "./index";
import { can, type OrgRole } from "./roles";
import type { statements } from "./roles";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
  twoFactorEnabled?: boolean | null;
}

export interface OrgContext {
  user: SessionUser;
  sessionId: string;
  org: { id: string; name: string; slug: string };
  role: OrgRole;
}

/** Server components / actions / route handlers: current session or null. */
export async function getSession(h?: Headers) {
  const auth = await getAuth();
  const s = await auth.api.getSession({ headers: h ?? (await headers()) });
  return s ? { user: s.user as unknown as SessionUser, session: s.session as { id: string; activeOrganizationId?: string | null } } : null;
}

export async function requireUser(opts: { redirectTo?: string } = {}) {
  const s = await getSession();
  if (!s) {
    if (opts.redirectTo !== undefined) redirect(`/sign-in?next=${encodeURIComponent(opts.redirectTo)}`);
    throw new HttpError(401, "unauthorized");
  }
  return s;
}

/** Active org (session.activeOrganizationId, else the first membership). Pages redirect; APIs throw. */
export async function getOrgContext(h?: Headers): Promise<OrgContext | null> {
  const hh = h ?? (await headers());
  const s = await getSession(hh);
  if (!s) return null;
  const auth = await getAuth();
  const orgs = (await auth.api.listOrganizations({ headers: hh })) as { id: string; name: string; slug: string }[];
  if (!orgs.length) return null;
  const org = orgs.find((o) => o.id === s.session.activeOrganizationId) ?? orgs[0]!;
  const member = (await auth.api.getActiveMember({ headers: hh }).catch(() => null)) as { role?: string; organizationId?: string } | null;
  let role = member && member.organizationId === org.id ? member.role : undefined;
  if (!role) {
    const full = (await auth.api.getFullOrganization({ headers: hh, query: { organizationId: org.id } })) as {
      members?: { userId: string; role: string }[];
    } | null;
    role = full?.members?.find((m) => m.userId === s.user.id)?.role;
  }
  return { user: s.user, sessionId: s.session.id, org: { id: org.id, name: org.name, slug: org.slug }, role: ((role?.split(",")[0] ?? "viewer") as OrgRole) };
}

export async function requireOrg(opts: { page?: boolean } = {}): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) {
    if (opts.page) {
      const s = await getSession();
      redirect(s ? "/onboarding" : "/sign-in");
    }
    throw new HttpError(401, "unauthorized");
  }
  return ctx;
}

/** Throws 403 forbidden unless the member's role grants `resource:action`. */
export function requirePermission(ctx: OrgContext, resource: keyof typeof statements, action: string) {
  if (!can(ctx.role, resource, action)) throw new HttpError(403, "forbidden");
}

export const isFounderAdmin = (email: string | null | undefined) => !!email && adminEmails().includes(email.toLowerCase());

/** Founder console needs TOTP in production (off only for the e2e suite, which sets E2E_OUTBOX=1 and never runs on Vercel). */
export const founderNeeds2fa = (u: { twoFactorEnabled?: boolean | null }) => isProd() && !e2eMode() && !u.twoFactorEnabled;

/** Founder only API guard: 404 for everyone else (the console does not exist for them), 403 until TOTP is on. */
export async function requireFounder() {
  const s = await requireUser();
  if (!isFounderAdmin(s.user.email)) throw new HttpError(404, "not_found");
  if (founderNeeds2fa(s.user)) throw new HttpError(403, "two_factor_required");
  return s;
}

/**
 * Founder only page guard. Every admin PAGE calls it itself: a layout check alone is not enough, because Next renders only the
 * changed segments on client navigation (a crafted router state header can ask for the page segment without the layout).
 * Same rules as the layout: 404 for everyone else, and in production the page body needs TOTP.
 */
export async function requireFounderPage(path = "/admin") {
  const s = await requireUser({ redirectTo: path });
  if (!isFounderAdmin(s.user.email) || founderNeeds2fa(s.user)) notFound();
  return s;
}

/** API key auth for /api/v1/* (x-api-key or Bearer). Returns the owning org id. */
export async function authApiKey(req: Request): Promise<{ orgId: string; keyId: string }> {
  const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!raw) throw new HttpError(401, "missing_api_key");
  const auth = await getAuth();
  const r = (await auth.api.verifyApiKey({ body: { key: raw } })) as { valid: boolean; key?: { id: string; referenceId?: string; userId?: string } | null };
  if (!r.valid || !r.key) throw new HttpError(401, "invalid_api_key");
  return { orgId: r.key.referenceId ?? r.key.userId ?? "", keyId: r.key.id };
}
