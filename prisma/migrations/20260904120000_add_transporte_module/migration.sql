-- CreateTable
CREATE TABLE "TransportDepartment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportLocality" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportLocality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportDepartment_code_key" ON "TransportDepartment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCity_code_key" ON "TransportCity"("code");

-- CreateIndex
CREATE INDEX "TransportCity_departmentId_idx" ON "TransportCity"("departmentId");

-- CreateIndex
CREATE INDEX "TransportCity_name_idx" ON "TransportCity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TransportLocality_code_key" ON "TransportLocality"("code");

-- CreateIndex
CREATE INDEX "TransportLocality_cityId_idx" ON "TransportLocality"("cityId");

-- CreateIndex
CREATE INDEX "TransportLocality_name_idx" ON "TransportLocality"("name");

-- AddForeignKey
ALTER TABLE "TransportCity" ADD CONSTRAINT "TransportCity_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "TransportDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLocality" ADD CONSTRAINT "TransportLocality_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "TransportCity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
