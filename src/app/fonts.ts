import { Archivo, IBM_Plex_Mono, Public_Sans } from "next/font/google";

// Stepclimb type system (docs/DESIGN.md section 6): Archivo (semi condensed display), Public Sans (body), IBM Plex Mono (data).
export const display = Archivo({ subsets: ["latin"], variable: "--font-sc-display", axes: ["wdth"], display: "swap" });
export const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sc-sans", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-sc-mono", weight: ["400", "500", "600"], display: "swap" });
