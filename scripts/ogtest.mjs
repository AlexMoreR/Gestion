import React from "react";
import { ImageResponse } from "next/og";
import { writeFileSync } from "node:fs";

const e = (style, ...children) => React.createElement("div", { style }, ...children);

const brandName = "Magilus";
const code = "COT-00036";
const clientName = "Carlos Alberto Valencia Bustamante";
const total = "$ 849.000,00";
const itemCount = 3;
const issuedDate = "19 de junio de 2026";

const element = React.createElement(
  "div",
  {
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      background: "linear-gradient(135deg, #200033 0%, #4b0071 42%, #5e0080 72%, #7b14a7 100%)",
      color: "white",
      fontFamily: "Arial, sans-serif",
      overflow: "hidden",
      padding: "56px 64px",
      justifyContent: "space-between",
    },
  },
  e({
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.22), transparent 24%)",
  }),
  e(
    { display: "flex", alignItems: "center", gap: 18 },
    e(
      {
        display: "flex",
        width: 84,
        height: 84,
        borderRadius: 24,
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 38,
        fontWeight: 800,
        letterSpacing: "-0.04em",
      },
      brandName.slice(0, 1).toUpperCase(),
    ),
    e(
      { display: "flex", flexDirection: "column", gap: 4 },
      e({ fontSize: 40, fontWeight: 800, lineHeight: 1 }, brandName),
      e({ fontSize: 20, color: "rgba(255,255,255,0.78)" }, "Mobiliario profesional premium"),
    ),
  ),
  e(
    { display: "flex", flexDirection: "column", gap: 14 },
    e(
      {
        display: "flex",
        alignSelf: "flex-start",
        padding: "8px 20px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.14)",
        border: "1px solid rgba(255,255,255,0.2)",
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: "0.08em",
      },
      "COTIZACION",
    ),
    e({ fontSize: 96, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.05em" }, code),
    clientName ? e({ fontSize: 30, color: "rgba(255,255,255,0.86)" }, `Para ${clientName}`) : null,
  ),
  e(
    { display: "flex", alignItems: "flex-end", justifyContent: "space-between" },
    e(
      { display: "flex", flexDirection: "column", gap: 4 },
      e({ fontSize: 20, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em" }, "TOTAL"),
      e({ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em" }, total),
    ),
    e(
      { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 },
      e({ fontSize: 24, color: "rgba(255,255,255,0.86)" }, `${itemCount} productos`),
      e({ fontSize: 22, color: "rgba(255,255,255,0.7)" }, issuedDate),
    ),
  ),
);

try {
  const img = new ImageResponse(element, { width: 1200, height: 630 });
  const buf = Buffer.from(await img.arrayBuffer());
  writeFileSync("scripts/ogtest-out.png", buf);
  console.log("OK", buf.length, "bytes");
} catch (error) {
  console.error("SATORI_ERROR:", error);
}
