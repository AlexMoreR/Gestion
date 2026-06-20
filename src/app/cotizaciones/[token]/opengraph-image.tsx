import { ImageResponse } from "next/og";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemBrandName, getSystemCurrency } from "@/lib/system-settings";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type ImageProps = {
  params: Promise<{ token: string }>;
};

export default async function QuoteOpenGraphImage({ params }: ImageProps) {
  const { token } = await params;

  const [quote, brandName, currency] = await Promise.all([
    prisma.quote.findUnique({
      where: { shareToken: token },
      select: {
        code: true,
        total: true,
        createdAt: true,
        client: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    getSystemBrandName(),
    getSystemCurrency(),
  ]);

  const code = quote?.code ?? "Cotizacion";
  const clientName = quote?.client?.name ?? null;
  const total = quote ? Number(quote.total) : 0;
  const itemCount = quote?._count.items ?? 0;
  const issuedDate = (quote?.createdAt ?? new Date()).toLocaleDateString("es-CO", { dateStyle: "long" });

  return new ImageResponse(
    (
      <div
        style={{
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
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.22), transparent 24%), radial-gradient(circle at 85% 24%, rgba(255,255,255,0.12), transparent 20%), radial-gradient(circle at 72% 88%, rgba(255,255,255,0.08), transparent 22%)",
          }}
        />

        {/* Encabezado: marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
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
            }}
          >
            {brandName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{brandName}</div>
            <div style={{ fontSize: 20, color: "rgba(255,255,255,0.78)" }}>Mobiliario profesional premium</div>
          </div>
        </div>

        {/* Cuerpo: titulo de la cotizacion */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 20px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.2)",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            COTIZACION
          </div>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.05em" }}>
            {code}
          </div>
          {clientName ? (
            <div style={{ fontSize: 30, color: "rgba(255,255,255,0.86)" }}>Para {clientName}</div>
          ) : null}
        </div>

        {/* Pie: total y datos */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 20, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em" }}>TOTAL</div>
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em" }}>
              {formatMoney(total, currency)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ fontSize: 24, color: "rgba(255,255,255,0.86)" }}>
              {itemCount} {itemCount === 1 ? "producto" : "productos"}
            </div>
            <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)" }}>{issuedDate}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
