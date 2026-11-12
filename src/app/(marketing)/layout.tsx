import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Dateline } from "@/components/marketing/dateline";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <Dateline />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
