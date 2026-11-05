import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const authentication: DocPage = {
  slug: "authentication",
  title: "Authentication",
  description: `Sign in to ${p.name} with GitHub, add two factor, and call the API with keys.`,
  sections: [
    {
      heading: "GitHub sign in",
      body: [
        "Sign in uses your GitHub account, so there is no password to set. The free tier needs a GitHub account that is at least 30 days old.",
      ],
    },
    {
      heading: "Two factor authentication",
      body: [
        "Turn on two factor in Settings, then Security. Scan the QR code with an authenticator app and enter the six digit code to confirm. Save your recovery codes somewhere safe. Each works once if you lose your device.",
      ],
    },
    {
      heading: "API keys",
      body: [
        "Server to server requests use API keys. Create and revoke them in Settings, then API keys. Send the key in the x-api-key header on every request. Never put a key in browser code or a public repository. If a key leaks, revoke it and create a new one.",
      ],
      code: {
        lang: "bash",
        code: `curl ${p.url}/api/v1/me \\\n  -H "x-api-key: YOUR_API_KEY"`,
      },
    },
  ],
};
