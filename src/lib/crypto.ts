// Secret encryption at rest: AES-256-GCM via WebCrypto, key derived from APP_ENCRYPTION_KEY (SHA-256).
// Format: "v1." + base64url(iv(12) | ciphertext+tag). Never log inputs or outputs.
import { env } from "@/lib/env";

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

async function keyFrom(secret: string | undefined): Promise<CryptoKey> {
  if (!secret || secret.length < 16) throw new Error("APP_ENCRYPTION_KEY is not set (min 16 chars)");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string, secret: string | undefined = env().APP_ENCRYPTION_KEY): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(secret), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1.${b64(out)}`;
}

export async function decryptSecret(token: string, secret: string | undefined = env().APP_ENCRYPTION_KEY): Promise<string> {
  if (!token.startsWith("v1.")) throw new Error("unknown ciphertext format");
  const raw = unb64(token.slice(3));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await keyFrom(secret), raw.slice(12));
  return new TextDecoder().decode(plain);
}

/** HMAC-SHA256 hex, used for the manifest `state` and webhook checks. */
export async function hmacHex(secret: string, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf as BufferSource));
  return Array.from(sig, (x) => x.toString(16).padStart(2, "0")).join("");
}
