"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { resolveMonthPeriod } from "@/lib/month-period";
import { computeMonthClosureSummary } from "@/lib/month-closure";
import { sendMonthClosureEmail } from "@/lib/mailer";

const RETURN_TO = "/admin/configuracion/cierre-mes";

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }
  return session.user.id;
}

const emailSchema = z.string().email();

// Separa el texto del campo de destinatarios (comas, punto y coma, saltos de
// linea o espacios) en correos individuales, sin duplicados.
function parseRecipients(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

const generateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mes invalido"),
  recipients: z.string().trim().min(1, "Agrega al menos un correo"),
});

export async function adminGenerateMonthClosureAction(formData: FormData): Promise<void> {
  const generatedById = await requireAdminSession();

  const parsed = generateSchema.safeParse({
    month: formData.get("month"),
    recipients: formData.get("recipients"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Datos invalidos";
    redirect(`${RETURN_TO}?error=${encodeURIComponent(message)}`);
  }

  const recipients = parseRecipients(parsed.data.recipients);
  if (recipients.length === 0) {
    redirect(`${RETURN_TO}?error=${encodeURIComponent("Agrega al menos un correo")}`);
  }

  const invalid = recipients.filter((email) => !emailSchema.safeParse(email).success);
  if (invalid.length > 0) {
    redirect(`${RETURN_TO}?error=${encodeURIComponent(`Correo invalido: ${invalid[0]}`)}`);
  }

  const { period, label, year, month } = resolveMonthPeriod(parsed.data.month);
  const summary = await computeMonthClosureSummary(period);

  let closureId: string;
  try {
    const closure = await prisma.monthClosure.create({
      data: {
        year,
        month,
        periodLabel: label,
        salesCount: summary.salesCount,
        salesTotal: summary.salesTotal,
        supplierCosts: summary.supplierCosts,
        shippingCosts: summary.shippingCosts,
        operatingExpenses: summary.operatingExpenses,
        netProfit: summary.netProfit,
        marginPct: summary.marginPct,
        recipients: JSON.stringify(recipients),
        generatedById,
      },
      select: { id: true },
    });
    closureId = closure.id;
  } catch (error) {
    console.error("Failed to create month closure:", error);
    redirect(`${RETURN_TO}?error=${encodeURIComponent("No se pudo generar el cierre")}`);
  }

  const reportUrl = getSiteUrl(`/admin/configuracion/cierre-mes/${closureId}`);

  let sent = 0;
  let smtpMissing = false;
  for (const to of recipients) {
    try {
      await sendMonthClosureEmail({ to, periodLabel: label, reportUrl });
      sent += 1;
    } catch (error) {
      if (error instanceof Error && error.message === "SMTP no configurado") {
        smtpMissing = true;
        break;
      }
      console.error(`Failed to send month closure email to ${to}:`, error);
    }
  }

  revalidatePath(RETURN_TO);

  if (smtpMissing) {
    redirect(
      `${RETURN_TO}?error=${encodeURIComponent(
        "Cierre guardado, pero el correo no esta configurado (SMTP). Comparte el enlace manualmente.",
      )}`,
    );
  }

  const okMsg =
    sent === recipients.length
      ? `Cierre generado y enviado a ${sent} ${sent === 1 ? "correo" : "correos"}`
      : `Cierre generado. Enviado a ${sent} de ${recipients.length} correos`;
  redirect(`${RETURN_TO}?ok=${encodeURIComponent(okMsg)}`);
}
