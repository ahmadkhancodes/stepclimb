/** Pure label logic for session-aware marketing links. Signed out is the default (what the static HTML ships). */
export const APP_HOME = "/app";

export type Cta = { href: string; label: string };

/** A CTA that points at sign-in when signed out and at the app when signed in. */
export function sessionCta(signedIn: boolean, signedOut: Cta, signedInLabel = "Open Stepclimb"): Cta {
  return signedIn ? { href: APP_HOME, label: signedInLabel } : signedOut;
}

/** Pricing row button. Signed-in paid plans go straight to billing with the plan preselected. */
export function planCta(
  signedIn: boolean,
  plan: { id: string; name: string; cta: string },
  price: { interval: string } | null,
): Cta {
  if (!price) {
    return signedIn ? { href: APP_HOME, label: "Open Stepclimb" } : { href: "/sign-in?plan=free", label: plan.cta };
  }
  return signedIn
    ? { href: `/app/billing?plan=${plan.id}&interval=${price.interval}`, label: `Choose ${plan.name}` }
    : { href: `/sign-in?plan=${plan.id}&interval=${price.interval}`, label: plan.cta };
}
