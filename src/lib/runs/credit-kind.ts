import { LATEST_LARAVEL_MAJOR } from "@/lib/engine/detect/effort";
import type { CreditKind } from "./types";

/** Credit kind a hop costs: to the latest major, to the previous one, everything older is per major. Pure, client safe. */
export const creditKindFor = (hopTo: number): CreditKind => (hopTo >= LATEST_LARAVEL_MAJOR ? "to_latest" : hopTo === LATEST_LARAVEL_MAJOR - 1 ? "to_previous" : "older_hop");
