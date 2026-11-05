import { product } from "@/config/product";
import { hmacHex } from "@/lib/crypto";
import { safeEqual } from "@/lib/ids";

/** Permissions and events from docs/ARCHITECTURE.md section 3 (least privilege). */
export const APP_PERMISSIONS = { contents: "write", pull_requests: "write", checks: "write", metadata: "read" } as const;
export const APP_EVENTS = ["pull_request", "push", "issue_comment", "check_run"] as const;

export interface GithubManifest {
  name: string;
  url: string;
  description: string;
  hook_attributes: { url: string; active: boolean };
  redirect_url: string;
  callback_urls: string[];
  setup_url: string;
  setup_on_update: boolean;
  public: boolean;
  request_oauth_on_install: boolean;
  default_permissions: Record<string, string>;
  default_events: string[];
}

/** `origin` is where the app runs (webhook URL and callbacks); `product.url` is the public homepage. */
export function buildManifest(origin: string): GithubManifest {
  const o = origin.replace(/\/$/, "");
  return {
    name: product.fullName,
    url: product.url,
    description: "Verified Laravel upgrade pull requests. One commit per change, composer install and your tests run before the PR opens.",
    hook_attributes: { url: `${o}/api/github/webhook`, active: true },
    redirect_url: `${o}/api/github/manifest/callback`,
    callback_urls: [`${o}/api/auth/callback/github`],
    setup_url: `${o}/api/github/setup`,
    setup_on_update: true,
    public: true,
    request_oauth_on_install: false,
    default_permissions: { ...APP_PERMISSIONS },
    default_events: [...APP_EVENTS],
  };
}

/** Form target: personal account by default, or an organisation. */
export function manifestFormAction(state: string, org?: string): string {
  const base = org && /^[A-Za-z0-9-]{1,39}$/.test(org) ? `https://github.com/organizations/${org}/settings/apps/new` : "https://github.com/settings/apps/new";
  return `${base}?state=${encodeURIComponent(state)}`;
}

const STATE_TTL_MS = 30 * 60_000;

/** Signed, expiring `state` for the manifest round trip (CSRF). */
export async function makeState(secret: string, now = Date.now()): Promise<string> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => x.toString(16).padStart(2, "0")).join("");
  const body = `${now}.${nonce}`;
  return `${body}.${(await hmacHex(secret, body)).slice(0, 32)}`;
}

export async function verifyState(secret: string, state: string | null, now = Date.now()): Promise<boolean> {
  if (!state) return false;
  const [ts, nonce, sig] = state.split(".");
  if (!ts || !nonce || !sig) return false;
  const age = now - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return false;
  return safeEqual(sig, (await hmacHex(secret, `${ts}.${nonce}`)).slice(0, 32));
}
