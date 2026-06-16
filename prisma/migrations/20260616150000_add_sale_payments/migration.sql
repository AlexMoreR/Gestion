CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "note" TEXT,
    "receiptUrl" TEXT,
    "receiptName" TEXT,
    "receiptType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalePayment_saleId_sortOrder_idx" ON "SalePayment"("saleId", "sortOrder");

ALTER TABLE "SalePayment"
ADD CONSTRAINT "SalePayment_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SalePayment" (
    "id",
    "saleId",
    "amount",
    "paymentMethod",
    "note",
    "receiptUrl",
    "receiptName",
    "receiptType",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('legacy-', s."id", '-', receipt.ordinality),
    s."id",
    COALESCE(NULLIF((receipt.item ->> 'amount')::text, '')::numeric, 0),
    COALESCE(NULLIF(receipt.item ->> 'paymentMethod', ''), 'OTRO'),
    NULLIF(receipt.item ->> 'note', ''),
    NULLIF(receipt.item ->> 'receiptUrl', ''),
    NULLIF(receipt.item ->> 'receiptName', ''),
    NULLIF(receipt.item ->> 'receiptType', ''),
    receipt.ordinality::int - 1,
    s."createdAt",
    s."updatedAt"
FROM "Sale" s
JOIN LATERAL jsonb_array_elements(COALESCE(s."paymentReceipts", '[]'::jsonb)) WITH ORDINALITY AS receipt(item, ordinality)
    ON TRUE;
