import { ImageResponse } from "next/og";
import { product } from "@/config/product";

export const alt = `${product.fullName}: ${product.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#e8eef3",
          color: "#0d2236",
          padding: 80,
          border: "2px solid #0d2236",
          borderTop: "12px solid #f26a1b",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 0,
              background: "#0d2236",
              color: "#e8eef3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            {product.name.charAt(0)}
          </div>
          <div style={{ fontSize: 36, fontWeight: 600 }}>{product.fullName}</div>
        </div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.0, letterSpacing: -1, textTransform: "uppercase", maxWidth: 1000 }}>
          {product.tagline}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #0d2236", paddingTop: 20, fontSize: 28, color: "#2c4660", fontFamily: "monospace" }}>
          <div style={{ display: "flex" }}>{product.host}</div>
          <div style={{ display: "flex" }}>WORK ORDER · CHECKLIST · VERIFIED</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
