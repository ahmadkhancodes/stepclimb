"use client";
import { useSyncExternalStore } from "react";

// One cheap same-origin check per page load, shared by every marketing component.
// Server and first client render say "signed out" (the cached HTML); after hydration the label swaps once.
// Documented trade-off: a signed-in visitor sees the signed-out labels for about one frame, no layout shift.
let state = false;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: { user?: unknown } | null) => {
      const next = !!s?.user;
      if (next !== state) {
        state = next;
        listeners.forEach((l) => l());
      }
    })
    .catch(() => {});
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => void listeners.delete(cb);
}

export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribe, () => state, () => false);
}
