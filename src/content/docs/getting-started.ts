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
        `Go to ${p.url} and choose Inspect a repo free. Sign in with GitHub or with a one time link by email, then name your organization. It creates an organization that holds your repos, members and billing.`,
        `New accounts start on the ${p.plans[0]?.name ?? "Free"} plan. You can change plan from Billing in the app sidebar at any time.`,
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
        "Open the inspection and press Start work order. A work order moves one major at a time, for example 11 to 12; start the next hop after you merge. Stepclimb runs the recipes in an isolated sandbox, then composer install, your asset build and your tests. It opens a pull request with one commit per change, a work order in the body and the Verified check. Merging stays with you.",
      ],
    },
    {
      heading: "Next steps",
      body: [
        "Invite teammates in Settings, then Members. Read the authentication guide to add two factor sign in and API keys. See the billing guide for plans and per repo pricing.",
      ],
    },
  ],
};
