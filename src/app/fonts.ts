import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// Stepclimb "work order" type system (docs/design-brief.md section 4):
// Barlow Condensed (hangar signage display, 600 only), IBM Plex Sans (text), IBM Plex Mono (versions, dates, money).
export const display = Barlow_Condensed({ subsets: ["latin"], variable: "--font-sc-display", weight: ["600"], style: ["normal"], display: "swap" });
export const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sc-sans", weight: ["400", "500", "600"], style: ["normal"], display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-sc-mono", weight: ["400", "600"], style: ["normal"], display: "swap", preload: false });
