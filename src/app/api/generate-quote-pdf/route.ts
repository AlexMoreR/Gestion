import { NextRequest, NextResponse } from "next/server";
import { generateQuotePdf } from "./pdf-generator";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
        return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    try {
        // Construimos la URL absoluta de la cotización para que Puppeteer la visite
        const protocol = req.nextUrl.protocol;
        const host = req.headers.get("host");
        // Se recomienda usar una variable de entorno NEXT_PUBLIC_APP_URL para producción
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}//${host}`;
        const targetUrl = `${baseUrl}/cotizaciones/${token}?pdf=true`;

        const pdfBuffer = await generateQuotePdf(targetUrl);
        const arrayBuffer = new Uint8Array(pdfBuffer).buffer;

        // Retornamos el buffer como un archivo binario PDF
        return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="cotizacion-${token}.pdf"`,
            },
        });
    } catch (error) {
        console.error("API Route Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}