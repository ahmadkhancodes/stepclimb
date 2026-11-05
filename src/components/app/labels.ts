import type { MeterId } from "@/config/product";

/** Product-facing names for each meter. A new product edits this map. */
export const METER_LABELS: Record<MeterId, { singular: string; plural: string; period: string }> = {
  repos: { singular: "repo", plural: "repos", period: "" },
  seats: { singular: "seat", plural: "seats", period: "" },
  extended_verify: { singular: "extended verification run", plural: "extended verification runs", period: "this month" },
  public_prs: { singular: "public repo PR", plural: "public repo PRs", period: "this month" },
};

export const METERS_SHOWN: MeterId[] = ["repos", "seats", "public_prs"];
export const fmt = (n: number) => new Intl.NumberFormat("en").format(n);
