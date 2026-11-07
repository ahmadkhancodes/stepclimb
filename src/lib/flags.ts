import { product } from "@/config/product";
import { getDb, type Db } from "@/lib/db";
import { envFlags } from "@/lib/env";

/** Remote flags: product defaults < Mongo `config` < APP_FLAGS env (ported trayo /config, D45). */
export async function getFlags(db?: Db): Promise<Record<string, string>> {
  let fromDb: Record<string, string> = {};
  try {
    fromDb = await (db ?? (await getDb())).getConfig();
  } catch {
    fromDb = {};
  }
  return { ...product.flags, ...fromDb, ...envFlags() };
}

export const flagOn = (flags: Record<string, string>, name: string) => flags[name] === "on" || flags[name] === "true";
