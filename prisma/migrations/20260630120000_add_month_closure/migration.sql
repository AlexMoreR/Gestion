-- CreateTable
CREATE TABLE "MonthClosure" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "salesTotal" DECIMAL(14,2) NOT NULL,
    "supplierCosts" DECIMAL(14,2) NOT NULL,
    "shippingCosts" DECIMAL(14,2) NOT NULL,
    "operatingExpenses" DECIMAL(14,2) NOT NULL,
    "netProfit" DECIMAL(14,2) NOT NULL,
    "marginPct" DECIMAL(6,2) NOT NULL,
    "recipients" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthClosure_year_month_idx" ON "MonthClosure"("year", "month");

-- AddForeignKey
ALTER TABLE "MonthClosure" ADD CONSTRAINT "MonthClosure_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
