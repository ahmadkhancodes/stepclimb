import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const howVerificationWorks: DocPage = {
  slug: "how-verification-works",
  title: "How verification works",
  description: `What the Verified check on a ${p.name} pull request means and what happens when it is missing.`,
  sections: [
    {
      heading: "What runs",
      body: [
        "Every upgrade run happens in a fresh sandbox. The recipes apply as one commit each. Then composer install, your asset build and your test suite run, and the result becomes a check on the pull request.",
      ],
    },
    {
      heading: "Verified",
      body: [
        "Verified means composer install, the asset build and your tests ran in the sandbox and passed. The check shows the test counts, for example how many tests passed.",
      ],
    },
    {
      heading: "Repair pass",
      body: [
        "If a step fails, repair rules match the failure output against known failures and apply a known fix as a separate Repair commit, then verify again. This repeats up to 3 times. Nothing is sent to an AI service.",
      ],
    },
    {
      heading: "Unverified",
      body: [
        "If your repo has no tests, the pull request still opens and carries an amber Unverified stamp. If a run hits the 25 minute limit, we open a draft pull request with the recipes applied so far.",
      ],
    },
    {
      heading: "Extended verification",
      body: [
        "Extended verification is an add on. It runs a matrix on PHP 8.3, 8.4 and 8.5, with a 60 minute limit and 5 repair loops instead of 3. It is included on every run on the Agency plan.",
      ],
    },
  ],
};

export const squawks: DocPage = {
  slug: "squawks-and-severities",
  title: "Squawks and severities",
  description: `How ${p.name} lists the things a person still has to look at, and the ready prompt each one carries.`,
  sections: [
    {
      heading: "What a squawk is",
      body: [
        "A squawk is a comment on the exact line that needs a person. Recipes and repair rules make the known changes, and what is left is listed instead of guessed.",
      ],
    },
    {
      heading: "Severities",
      body: [
        "Must fix is a square. The change cannot be finished without you. Review is a triangle. The change was made or skipped and you should look at it. Note is a circle. It is information, for example a package the upgrade guide does not mention.",
      ],
    },
    {
      heading: "Prompts for your own agent",
      body: [
        "Every unresolved squawk carries a templated prompt with file paths, the failing output and a link to the upgrade guide. You can paste it into your own agent. The prompt is a template, and no AI service is called on our side.",
      ],
    },
    {
      heading: "What to expect",
      body: [
        "With no AI step, expect a few more squawks than a pass by a person plus an AI agent would leave.",
      ],
    },
  ],
};
