import { NextRequest, NextResponse } from "next/server";
import { quotePdfFileName } from "@/lib/document-names";
import { prisma } from "@/lib/prisma";
import { generateQuotePdf } from "./pdf-generator";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
        return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    let targetUrl: string | undefined;

    try {
        // Construimos la URL absoluta de la cotización para que Puppeteer la visite
        const protocol = req.nextUrl.protocol;
        const host = req.headers.get("host");
        // Se recomienda usar una variable de entorno NEXT_PUBLIC_APP_URL para producción
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}//${host}`;
        targetUrl = `${baseUrl}/cotizaciones/${token}?pdf=true`;

        console.log("generate-quote-pdf: targetUrl=", targetUrl, "baseUrl=", baseUrl, "token=", token);

        const quote = await prisma.quote.findUnique({
            where: { shareToken: token },
            select: { code: true },
        });
        const fileName = quote ? quotePdfFileName(quote.code) : `cotizacion-${token}.pdf`;

        const pdfBuffer = await generateQuotePdf(targetUrl);
        const arrayBuffer = new Uint8Array(pdfBuffer).buffer;

        // Retornamos el buffer como un archivo binario PDF
        return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${fileName}"`,
            },
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error("API Route Error generate-quote-pdf:", {
            token,
            targetUrl,
            errorMessage,
            errorStack,
            error,
        });
        return NextResponse.json(
            { error: "Internal Server Error", detail: errorMessage },
            { status: 500 }
        );
    }
}