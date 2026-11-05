import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const dpa: LegalDoc = {
  slug: "dpa",
  title: "Data processing addendum",
  description: `The terms under which ${p.name} processes personal data on your behalf.`,
  sections: [
    {
      id: "scope",
      title: "Scope and roles",
      body: [
        `This addendum applies when ${p.legal.entity} processes personal data contained in your repositories on your behalf, for example author names and email addresses in commit history and code, while running an upgrade. You are the controller and we are the processor. It forms part of the terms of service.`,
      ],
    },
    {
      id: "details",
      title: "Details of processing",
      body: [
        {
          list: [
            "Subject matter: reading repository contents in an isolated sandbox to apply and verify upgrade changes, and opening pull requests on your repository. Customer code is not retained after a run.",
            "Duration: while your account is open, plus the deletion period in the privacy policy.",
            "Data subjects: people whose personal data appears in your repositories, such as developers and, if present in code or test fixtures, your users.",
            "Data types: whatever your repositories contain. A free inspection reads only composer.json and composer.lock. Run logs are kept for 30 days with secrets redacted.",
          ],
        },
      ],
    },
    {
      id: "instructions",
      title: "Our obligations",
      body: [
        {
          list: [
            "We process personal data only on your documented instructions, which are these terms and your use of the service.",
            "Everyone with access is bound by confidentiality.",
            "We apply the security measures described on the security page.",
            "We help you answer data subject requests and meet your security and breach duties, taking into account the nature of processing.",
            "We notify you without undue delay, and within 72 hours where we can, after becoming aware of a personal data breach.",
            "On termination we delete or return the data as described in the privacy policy, unless the law requires us to keep it.",
            "We give you the information you reasonably need to show compliance and allow audits through a written questionnaire once a year.",
          ],
        },
      ],
    },
    {
      id: "subprocessors",
      title: "Subprocessors",
      body: ["You authorize the subprocessors on our subprocessors page. We will give you at least 14 days notice before adding or replacing one, and you may object on reasonable grounds."],
    },
    {
      id: "transfers",
      title: "International transfers",
      body: ["Where personal data moves from the EEA, UK or Switzerland to a country without an adequacy decision, the Standard Contractual Clauses (module two, controller to processor) and the UK addendum apply and are incorporated here."],
    },
    {
      id: "contact",
      title: "Contact and signed copy",
      body: [`To request a countersigned copy, email ${p.legalEmail}. Our address is ${p.legal.address}.`],
    },
  ],
};
