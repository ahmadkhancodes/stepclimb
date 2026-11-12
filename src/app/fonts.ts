import { JetBrains_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";

// Stepclimb "logbook" type system (docs/design-brief.md section 4):
// Newsreader (editorial serif display, never italic), Schibsted Grotesk (text), JetBrains Mono (versions, dates, money).
export const display = Newsreader({ subsets: ["latin"], variable: "--font-sc-display", weight: ["500"], style: ["normal"], display: "swap" });
export const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sc-sans", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-sc-mono", weight: ["400", "600"], display: "swap", preload: false });
