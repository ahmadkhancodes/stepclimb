import { compareEntries } from "@/content/compare";
import { guides } from "@/content/guides";
import { docs } from "@/content/docs";
import { legalDocs } from "@/content/legal";
import { product } from "@/config/product";

export const dynamic = "force-static";

export function GET() {
  const u = (path: string) => `${product.url}${path}`;
  const lines = [
    `# ${product.fullName}`,
    "",
    `> ${product.description}`,
    "",
    "## Docs",
    "",
    ...docs.map((d) => `- [${d.title}](${u(`/docs/${d.slug}`)}): ${d.description}`),
    "",
    "## Product",
    "",
    `- [Pricing](${u("/pricing")}): Rate card, plan limits and billing questions`,
    `- [Security and code custody](${u("/security")}): Where your code goes during an upgrade run`,
    `- [Full documentation as one file](${u("/llms-full.txt")}): All docs in markdown`,
    "",
    "## Guides",
    "",
    ...guides.map((g) => `- [${g.title}](${u(g.path)}): ${g.description}`),
    "",
    "## Compare",
    "",
    ...compareEntries.map((c) => `- [${c.title}](${u(`/compare/${c.slug}`)}): ${c.description}`),
    `- [${product.fullName} compared with AI coding agents](${u("/compare/ai-agents")}): Repeatable results, tokens, scheduling and a fleet view`,
    "",
    "## Legal",
    "",
    ...legalDocs.map((d) => `- [${d.title}](${u(`/legal/${d.slug}`)}): ${d.description}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
