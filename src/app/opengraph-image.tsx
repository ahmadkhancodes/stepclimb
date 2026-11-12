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
          background: "#f4f1ea",
          color: "#1c1a16",
          padding: 80,
          borderTop: "12px solid #b23c0e",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 0,
              background: "#1c1a16",
              color: "#f4f1ea",
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
        <div style={{ display: "flex", fontSize: 76, fontWeight: 500, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>
          {product.tagline}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#4f4a40", fontFamily: "monospace" }}>{product.host}</div>
      </div>
    ),
    { ...size },
  );
}
