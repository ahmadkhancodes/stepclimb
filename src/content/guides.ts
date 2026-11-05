import { CHECKED } from "./dates";

export interface GuideEntry {
  /** Absolute path of the page. */
  path: string;
  title: string;
  /** Short label for lists. */
  label: string;
  description: string;
  kind: "Upgrade guide" | "Reference";
  updated: { iso: string; label: string };
}

/** Index of guide pages: /guides, the sitemap and llms.txt read this, so a new guide is one entry. */
export const guides: GuideEntry[] = [
  {
    path: "/guides/laravel-and-php-end-of-life-calendar",
    title: "Laravel and PHP end of life calendar",
    label: "Laravel and PHP end of life calendar",
    description:
      "When security fixes end for Laravel 10, 11, 12 and 13 and for PHP 8.2, with the date each one was checked and the source.",
    kind: "Reference",
    updated: CHECKED,
  },
  {
    path: "/laravel-12-to-13",
    title: "Laravel 12 to 13 upgrade checklist",
    label: "Laravel 12 to 13",
    description:
      "The composer.json changes, the PHP 8.3 minimum, the session and cache config changes and the CSRF middleware rename, each linked to the official upgrade guide.",
    kind: "Upgrade guide",
    updated: CHECKED,
  },
  {
    path: "/laravel-11-to-12",
    title: "Laravel 11 to 12 upgrade checklist",
    label: "Laravel 11 to 12",
    description:
      "The dependency bumps, the PHP 8.2 minimum and what to do about skeleton changes, each linked to the official upgrade guide. Laravel 11 security fixes ended 12 Mar 2026.",
    kind: "Upgrade guide",
    updated: CHECKED,
  },
];
