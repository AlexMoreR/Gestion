import { ImageResponse } from "next/og";
import { getSystemBrandName } from "@/lib/system-settings";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Imagen de vista previa (Open Graph) para /cobertura, la que se ve al compartir
// el enlace en WhatsApp, redes, etc.
export default async function CoberturaOpenGraphImage() {
  const brandName = await getSystemBrandName();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background:
            "linear-gradient(135deg, #200033 0%, #4b0071 42%, #5e0080 72%, #7b14a7 100%)",
          color: "white",
          fontFamily: "Arial, sans-serif",
          overflow: "hidden",
          padding: "64px 72px",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.22), transparent 22%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.12), transparent 20%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              width: 78,
              height: 78,
              borderRadius: 22,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            {brandName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1 }}>{brandName}</div>
            <div style={{ fontSize: 22, color: "rgba(255,255,255,0.78)" }}>Cobertura de envío</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgba(52,211,153,0.22)",
              border: "1px solid rgba(52,211,153,0.5)",
              fontSize: 26,
              fontWeight: 700,
              color: "#a7f3d0",
            }}
          >
            🚚 Envío gratis
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 0.98,
              letterSpacing: "-0.05em",
              maxWidth: 900,
            }}
          >
            ¿Tienes envío gratis?
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.3, color: "rgba(255,255,255,0.85)", maxWidth: 820 }}>
            Consulta tu ciudad o corregimiento y descubre al instante si te enviamos gratis.
          </div>
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
          magilus.com/cobertura
        </div>
      </div>
    ),
    size,
  );
}
