import { NextRequest, NextResponse } from "next/server";
import { generateSaleInvoicePdf } from "./pdf-generator";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  try {
    const protocol = req.nextUrl.protocol;
    const host = req.headers.get("host");
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}//${host}`;
    const targetUrl = `${baseUrl}/sales/${token}?pdf=true`;

    const pdfBuffer = await generateSaleInvoicePdf(targetUrl);
    const arrayBuffer = new Uint8Array(pdfBuffer).buffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${token}.pdf"`,
      },
    });
  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
