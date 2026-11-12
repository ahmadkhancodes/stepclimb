import { ImageResponse } from "next/og";
import { product } from "@/config/product";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d2236",
          color: "#e8eef3",
          borderBottom: "3px solid #f26a1b",
          fontSize: 22,
          fontWeight: 700,
          borderRadius: 4,
        }}
      >
        {product.name.charAt(0)}
      </div>
    ),
    { ...size },
  );
}
