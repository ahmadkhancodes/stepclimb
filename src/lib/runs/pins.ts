import type { Db } from "@/lib/db";

/** Founder pins (admin console): a recipe or rule can be switched off, or held to one version. Stored in `pins/global`. */
export interface Pin { disabled?: boolean; version?: string }
export interface Pins { recipes: Record<string, Pin>; rules: Record<string, Pin> }
export const EMPTY_PINS: Pins = { recipes: {}, rules: {} };

export async function loadPins(db: Db): Promise<Pins> {
  const d = await db.docs.get<Pins>("pins", "global");
  return { recipes: d?.recipes ?? {}, rules: d?.rules ?? {} };
}

export async function setPin(db: Db, kind: "recipes" | "rules", key: string, pin: Pin | null): Promise<Pins> {
  const cur = await loadPins(db);
  const next = { ...cur, [kind]: { ...cur[kind] } };
  if (!pin || (!pin.disabled && !pin.version)) delete next[kind][key];
  else next[kind][key] = { ...(pin.disabled ? { disabled: true } : {}), ...(pin.version ? { version: pin.version } : {}) };
  await db.docs.put("pins", "global", next as unknown as Record<string, unknown>);
  return next;
}

/** Keeps items that are not disabled and, when a version is pinned, match it. Recipes pin `version`; rules pin their Laravel major (`version`). */
export function applyPins<T extends { key: string; version: string }>(items: T[], pins: Record<string, Pin> | undefined): T[] {
  if (!pins) return items;
  return items.filter((i) => {
    const p = pins[i.key];
    return !p || (!p.disabled && (!p.version || p.version === i.version));
  });
}
