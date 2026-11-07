"use client";
import { solveChallenge, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";

/** Fetches a challenge from /api/altcha and solves it in the browser (proof of work, no third party). Returns the payload for the `x-altcha` header. */
export async function solveAltchaPayload(): Promise<string | null> {
  try {
    const res = await fetch("/api/altcha", { cache: "no-store" });
    if (!res.ok) return null;
    const challenge = (await res.json()) as Challenge;
    const solution = await solveChallenge({ challenge, deriveKey } as never);
    return solution ? btoa(JSON.stringify({ challenge, solution })) : null;
  } catch {
    return null;
  }
}
