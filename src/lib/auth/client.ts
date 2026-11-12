"use client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { apiKeyClient } from "@better-auth/api-key/client";
import { ac, roles } from "./roles";

/** Browser auth client. Same-origin, cookies only (no tokens in JS). */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    twoFactorClient({ onTwoFactorRedirect: () => { // full reload on purpose: the session cookie just changed
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/sign-in/two-factor"; } }),
    passkeyClient(),
    organizationClient({ ac, roles }),
    apiKeyClient(),
  ],
});
