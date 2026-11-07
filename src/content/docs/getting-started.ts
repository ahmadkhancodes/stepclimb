import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const gettingStarted: DocPage = {
  slug: "getting-started",
  title: "Getting started",
  description: `Sign in to ${p.name}, connect a repository and read your first inspection report.`,
  sections: [
    {
      heading: "Sign in with GitHub",
      body: [
        `Go to ${p.url} and choose Inspect a repo free. You sign in with GitHub. Your first sign in creates an organization that holds your repos, members and billing.`,
        `New accounts start on the ${p.plans[0]?.name ?? "Free"} plan. You can change plan from Settings, then Billing, at any time.`,
      ],
    },
    {
      heading: "Install the GitHub App",
      body: [
        "Install the Stepclimb GitHub App on the repositories you choose. If you are not an organization admin, send the approval request to an admin. The app asks for the least access it needs.",
      ],
    },
    {
      heading: "Read the inspection report",
      body: [
        "Each repo gets a free inspection from composer.json, composer.lock and package.json only. No code is cloned. The report shows the Laravel version, the PHP constraint, how many majors behind the repo is, when support ends, the recipes that apply and an effort band from S to XL.",
      ],
    },
    {
      heading: "Open a work order",
      body: [
        "Pick the hop, for example 11 to 13. Stepclimb runs the recipes in an isolated sandbox, then composer install, your asset build and your tests. It opens a pull request with one commit per change, a work order in the body and the Verified check. Merging stays with you.",
      ],
    },
    {
      heading: "Next steps",
      body: [
        "Read the authentication guide to add two factor sign in and API keys. See the billing guide for plans and per repo pricing.",
      ],
    },
  ],
};
