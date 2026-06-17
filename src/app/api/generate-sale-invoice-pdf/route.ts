import { NextRequest, NextResponse } from "next/server";
import { invoicePdfFileName } from "@/lib/document-names";
import { prisma } from "@/lib/prisma";
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

    const sale = await prisma.sale.findUnique({
      where: { invoiceToken: token },
      select: { code: true },
    });
    const fileName = sale ? invoicePdfFileName(sale.code) : `invoice-${token}.pdf`;

    const pdfBuffer = await generateSaleInvoicePdf(targetUrl);
    const arrayBuffer = new Uint8Array(pdfBuffer).buffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
