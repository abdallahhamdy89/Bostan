-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentTypeId" TEXT;

-- CreateTable
CREATE TABLE "PaymentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialFeeType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cellMapping" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialFeeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialFee" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "specialFeeTypeId" TEXT NOT NULL,
    "collectionAmount" DECIMAL(12,2) NOT NULL,
    "collectedAmount" DECIMAL(12,2),
    "receiptNumber" TEXT,
    "status" "ChargeStatus" NOT NULL DEFAULT 'OPEN',
    "paidDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentType_name_key" ON "PaymentType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialFeeType_name_key" ON "SpecialFeeType"("name");

-- CreateIndex
CREATE INDEX "SpecialFee_apartmentId_specialFeeTypeId_idx" ON "SpecialFee"("apartmentId", "specialFeeTypeId");

-- CreateIndex
CREATE INDEX "SpecialFee_apartmentId_idx" ON "SpecialFee"("apartmentId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentTypeId_fkey" FOREIGN KEY ("paymentTypeId") REFERENCES "PaymentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialFee" ADD CONSTRAINT "SpecialFee_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialFee" ADD CONSTRAINT "SpecialFee_specialFeeTypeId_fkey" FOREIGN KEY ("specialFeeTypeId") REFERENCES "SpecialFeeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
