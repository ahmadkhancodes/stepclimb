import type { Metadata } from "next";
import { product } from "@/config/product";

export const metadata: Metadata = {
  title: { absolute: `${product.fullName}: ${product.tagline}` },
  description: product.description,
  alternates: { canonical: "/" },
};

// Placeholder: replaced by the landing build (docs/SECTION_PLAN.md).
export default function Home() {
  return (
    <main id="main" className="p-8">
      <h1 className="heading-3">{product.tagline}</h1>
    </main>
  );
}
