import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/fonts", () => ({ display: { variable: "" }, sans: { variable: "" }, mono: { variable: "" } }));
import nextConfig from "../../next.config";
import { metadata as rootMeta } from "@/app/layout";
import { pageMetadata } from "@/lib/seo";

describe("page head", () => {
  it("emits og:image and twitter:image for pages with openGraph", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/docs/billing" });
    const og = m.openGraph?.images as string[];
    const tw = m.twitter?.images as string[];
    expect(og[0]).toMatch(/^https?:\/\/.+\/opengraph-image$/);
    expect(tw[0]).toMatch(/^https?:\/\/.+\/opengraph-image$/);
  });
  it("root layout emits both images", () => {
    expect(rootMeta.openGraph?.images).toBeTruthy();
    expect(rootMeta.twitter?.images).toBeTruthy();
  });
  it("redirects /favicon.ico to /icon", async () => {
    const r = await nextConfig.redirects!();
    expect(r).toContainEqual(expect.objectContaining({ source: "/favicon.ico", destination: "/icon" }));
  });
});
