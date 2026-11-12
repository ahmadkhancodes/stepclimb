"use client";
import { ButtonLink } from "@/components/ui/button";
import { sessionCta } from "./session-labels";
import { useSignedIn } from "./use-signed-in";

/** ButtonLink whose label and target follow the session; same box either way. */
export function SessionButtonLink({ href, label, size, signedInLabel }: { href: string; label: string; size?: "sm" | "md" | "lg"; signedInLabel?: string }) {
  const cta = sessionCta(useSignedIn(), { href, label }, signedInLabel);
  return <ButtonLink href={cta.href} size={size}>{cta.label}</ButtonLink>;
}
