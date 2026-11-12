import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/security/headers";

describe("CSP form-action", () => {
  const csp = securityHeaders().find((h) => h.key === "Content-Security-Policy")!.value;
  const formAction = csp.split("; ").find((d) => d.startsWith("form-action"))!;
  it("lets the GitHub App manifest form post to github.com (otherwise the setup button silently does nothing)", () => {
    expect(formAction).toContain("https://github.com");
  });
  it("still allows Stripe and nothing broader", () => {
    expect(formAction).toContain("https://checkout.stripe.com");
    expect(formAction).not.toContain("*");
  });
});
