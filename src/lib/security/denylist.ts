import { env } from "@/lib/env";

/**
 * Denylists (docs/ARCHITECTURE.md P0-12). One source for the runtime check and the CI script `scripts/deny-deps.ts`.
 * Never an LLM, never ads: banned SDKs and hosts fail the build. Banned repos are refused at the start of a run.
 */
export const BANNED_NPM = ["openai", "@anthropic-ai/sdk", "@google/generative-ai", "@google/genai", "langchain", "@langchain/core", "ai", "@ai-sdk/openai", "@ai-sdk/anthropic", "cohere-ai", "@mistralai/mistralai", "ollama", "react-adsense", "react-google-adsense", "@googleads/publisher-tag"];
export const BANNED_NPM_PREFIXES = ["@ai-sdk/", "@langchain/"];

/** Source patterns that must not appear in app code (hosts of LLM APIs, ad networks). */
export const BANNED_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "llm-host", re: /api\.(anthropic|openai)\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.(ai|com)/i },
  { id: "ad-network", re: /adsbygoogle|googlesyndication\.com|doubleclick\.net/i },
];

/** Repo names (`owner/name`, `*` globs) Stepclimb will not touch: malware, abuse, repos that ask not to be modified. Extend with DENY_REPOS (comma separated). */
export const BANNED_REPOS = ["*/*-malware", "*/*ransomware*", "*/*-botnet", "*/*cryptojack*", "*/*phishing-kit*"];

const globRe = (g: string) => new RegExp(`^${g.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`, "i");

export function matchesRepoPattern(fullName: string, patterns: readonly string[]): string | null {
  return patterns.find((p) => globRe(p).test(fullName)) ?? null;
}

export function bannedRepoPatterns(extra: string | undefined = env().DENY_REPOS): string[] {
  return [...BANNED_REPOS, ...(extra ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
}
export const isRepoDenied = (fullName: string) => matchesRepoPattern(fullName, bannedRepoPatterns()) !== null;

export const isBannedPackage = (name: string) => BANNED_NPM.includes(name) || BANNED_NPM_PREFIXES.some((p) => name.startsWith(p));

/** Dependency names in a package.json that are banned. */
export function bannedDeps(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }): string[] {
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})].filter(isBannedPackage);
}

export function bannedPatternHits(text: string): string[] {
  return BANNED_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
}
