import { cache } from "react";
import { DEFAULT_SYSTEM_CURRENCY, isSupportedCurrency, type SupportedCurrencyCode } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

const CURRENCY_SETTING_KEY = "currency";

async function ensureAppSettingTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export const getSystemCurrency = cache(async (): Promise<SupportedCurrencyCode> => {
  try {
    await ensureAppSettingTable();

    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT "value"
      FROM "AppSetting"
      WHERE "key" = ${CURRENCY_SETTING_KEY}
      LIMIT 1
    `;

    const value = rows[0]?.value;
    if (value && isSupportedCurrency(value)) {
      return value;
    }

    return DEFAULT_SYSTEM_CURRENCY;
  } catch {
    return DEFAULT_SYSTEM_CURRENCY;
  }
});

export async function setSystemCurrency(currency: SupportedCurrencyCode): Promise<void> {
  await ensureAppSettingTable();
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "createdAt", "updatedAt")
    VALUES (${CURRENCY_SETTING_KEY}, ${currency}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}
