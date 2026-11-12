import { ImageResponse } from "next/og";
import { product } from "@/config/product";

export const size = { width: 180, height: 180 };
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
          background: "#1c1a16",
          color: "#f4f1ea",
          borderBottom: "3px solid #b23c0e",
          fontSize: 120,
          fontWeight: 700,
          borderRadius: 0,
        }}
      >
        {product.name.charAt(0)}
      </div>
    ),
    { ...size },
  );
}
