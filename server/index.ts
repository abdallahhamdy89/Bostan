import { loadEnvFile } from "node:process";
import express from "express";
import multer from "multer";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { importBuildingWorkbook, HISTORICAL_PERIOD } from "./importExcel";

// Only load .env locally — hosting platforms (Render, etc.) inject env vars directly
// and don't provide a .env file, so loadEnvFile would throw and crash startup there.
try { loadEnvFile(".env"); } catch { /* no .env file — rely on platform-injected env vars */ }
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Copy .env.example to .env first.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const amount = (value: unknown) => Number(value ?? 0);

// Aggregates SpecialFee rows by type, applying the dynamic فروق صيانة 4-2024 calculation
// (months since April 2024 × 150) so every consumer stays in sync.
function aggregateSpecialFees(specialFees: any[]) {
  const byType = new Map<string, any>();
  specialFees.forEach((sf) => {
    const key = sf.specialFeeTypeId;
    if (!byType.has(key)) {
      byType.set(key, { feeName: sf.specialFeeType.name, totalCollectionAmount: 0, totalCollectedAmount: 0, entries: [], status: "OPEN" as const });
    }
    const group = byType.get(key);
    group.totalCollectionAmount += amount(sf.collectionAmount);
    if (sf.collectedAmount) group.totalCollectedAmount += amount(sf.collectedAmount);
    group.entries.push({
      id: sf.id,
      collectionAmount: amount(sf.collectionAmount),
      collectedAmount: sf.collectedAmount ? amount(sf.collectedAmount) : null,
      receiptNumber: sf.receiptNumber,
      status: sf.status,
      paidDate: sf.paidDate,
      notes: sf.notes,
    });
    if (group.totalCollectedAmount === group.totalCollectionAmount) group.status = "PAID";
  });

  // فروق صيانة 4-2024 accrues monthly for every apartment regardless of payment history —
  // ensure a group exists even when zero SpecialFee rows were imported (nothing paid yet).
  const MAINTENANCE_DIFFERENCES_NAME = "فروق صيانة 4-2024";
  const hasMaintenanceDifferences = Array.from(byType.values()).some((group) => group.feeName === MAINTENANCE_DIFFERENCES_NAME);
  if (!hasMaintenanceDifferences) {
    byType.set("__maintenance_differences_synthetic__", { feeName: MAINTENANCE_DIFFERENCES_NAME, totalCollectionAmount: 0, totalCollectedAmount: 0, entries: [], status: "OPEN" as const });
  }

  for (const group of byType.values()) {
    if (group.feeName !== MAINTENANCE_DIFFERENCES_NAME) continue;
    const startDate = new Date(2024, 3, 1); // April 2024 (month is 0-indexed)
    const today = new Date();
    const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
    const calculatedRequired = (monthsDiff + 1) * 150;
    group.totalCollectionAmount = calculatedRequired;
    group.status = group.totalCollectedAmount >= calculatedRequired ? "PAID" : "OPEN";
  }

  return Array.from(byType.values()).map((group) => ({
    feeName: group.feeName,
    totalCollectionAmount: group.totalCollectionAmount,
    totalCollectedAmount: group.totalCollectedAmount,
    remainingBalance: group.totalCollectionAmount - group.totalCollectedAmount,
    status: group.status,
    entries: group.entries,
  }));
}

const specialFeesBalance = (aggregated: Array<{ totalCollectionAmount: number; totalCollectedAmount: number }>) =>
  aggregated.reduce((sum, group) => sum + (group.totalCollectionAmount - group.totalCollectedAmount), 0);
const specialFeesRequired = (aggregated: Array<{ totalCollectionAmount: number }>) =>
  aggregated.reduce((sum, group) => sum + group.totalCollectionAmount, 0);
const specialFeesCollected = (aggregated: Array<{ totalCollectedAmount: number }>) =>
  aggregated.reduce((sum, group) => sum + group.totalCollectedAmount, 0);

// FeeCharge rows imported from the "مجمع" summary sheet (periodLabel = HISTORICAL_PERIOD) are
// still-outstanding dues: the sheet only carries a value when the owner hasn't paid it yet
// (a paid item is left blank/0 and skipped on import), so they're never linked to a PaymentAllocation.
// فروق صيانة is excluded here since it already has its own dynamic (months-since-April-2024) tracking —
// counting the "مجمع" column too would double it.
const LEGACY_DEBT_EXCLUDED_NAMES = new Set(["فروق صيانة 4 - 2024", "فروق صيانة 4-2024"]);
const isLegacyDebtCharge = (charge: any) => charge.periodLabel === HISTORICAL_PERIOD && !LEGACY_DEBT_EXCLUDED_NAMES.has(charge.feeType.name);
const legacyDebtEntries = (charges: any[]) =>
  charges.filter(isLegacyDebtCharge).map((charge) => ({ id: charge.id, feeName: charge.feeType.name, amount: amount(charge.amount) }));
const legacyDebtTotal = (charges: any[]) =>
  charges.filter((charge) => charge.periodLabel === HISTORICAL_PERIOD && !LEGACY_DEBT_EXCLUDED_NAMES.has(charge.feeType?.name)).reduce((sum, charge) => sum + amount(charge.amount), 0);

const apartmentSummary = (apartment: any) => {
  const owed = apartment.charges.reduce((sum: number, charge: any) => sum + amount(charge.amount), 0);
  const paid = apartment.charges.reduce((sum: number, charge: any) => sum + charge.allocations.reduce((inner: number, allocation: any) => inner + amount(allocation.amount), 0), 0);
  const lastPayment = apartment.payments[0];
  const phone = apartment.currentOwner?.contacts?.find((contact: any) => contact.isPrimary)?.value ?? apartment.currentOwner?.contacts?.[0]?.value ?? null;
  const aggregatedSpecialFees = aggregateSpecialFees(apartment.specialFees ?? []);
  const legacyOwed = legacyDebtTotal(apartment.charges ?? []);
  return {
    id: apartment.id,
    number: apartment.number,
    floor: apartment.floor,
    area: apartment.areaM2 === null ? null : amount(apartment.areaM2),
    ownerName: apartment.currentOwner?.fullName ?? "بدون مالك",
    phone,
    owed,
    paid,
    balance: owed - paid,
    // Special-fees + legacy-debt figures — the same basis "المبلغ المستحق" uses per apartment.
    specialFeesOwed: specialFeesRequired(aggregatedSpecialFees) + legacyOwed,
    specialFeesCollected: specialFeesCollected(aggregatedSpecialFees),
    specialFeesBalance: specialFeesBalance(aggregatedSpecialFees) + legacyOwed,
    lastPaymentDate: lastPayment?.paidOn ?? null,
  };
};

app.use((_request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("/{*path}", (_request, response) => response.sendStatus(204));

app.use((request, _response, next) => {
  console.log(`[API] ${request.method} ${request.path}`);
  next();
});

app.get("/api/ping", (_request, response) => response.json({ ok: true, service: "bostan-api" }));

app.get("/api/health", async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  response.json({ ok: true });
});

app.get("/api/dashboard", async (_request, response) => {
  try {
    const buildings = await prisma.building.findMany({
      orderBy: { name: "asc" },
      include: {
        apartments: {
          orderBy: [{ floor: "asc" }, { number: "asc" }],
          include: {
            currentOwner: { include: { contacts: true } },
            charges: { include: { allocations: true, feeType: true } },
            specialFees: { include: { specialFeeType: true } },
            payments: { orderBy: { paidOn: "desc" }, take: 1 },
          },
        },
      },
    });
    const buildingData = buildings.map((building) => {
      const apartments = building.apartments.map(apartmentSummary);
      return {
        id: building.id, name: building.name, address: building.address, floors: building.floors, apartmentCount: apartments.length,
        owed: apartments.reduce((sum, apartment) => sum + apartment.owed, 0),
        paid: apartments.reduce((sum, apartment) => sum + apartment.paid, 0),
        balance: apartments.reduce((sum, apartment) => sum + apartment.balance, 0),
        specialFeesOwed: apartments.reduce((sum, apartment) => sum + apartment.specialFeesOwed, 0),
        specialFeesCollected: apartments.reduce((sum, apartment) => sum + apartment.specialFeesCollected, 0),
        specialFeesBalance: apartments.reduce((sum, apartment) => sum + apartment.specialFeesBalance, 0),
        apartments,
      };
    });
    const recentPayments = await prisma.payment.findMany({
      orderBy: { paidOn: "desc" }, take: 5,
      include: { owner: true, apartment: { include: { building: true } }, allocations: { include: { feeCharge: { include: { feeType: true } } } } },
    });
    const allApartments = buildingData.flatMap((building) => building.apartments);
    response.json({
      totals: {
        buildings: buildingData.length,
        apartments: allApartments.length,
        owed: buildingData.reduce((sum, building) => sum + building.owed, 0),
        paid: buildingData.reduce((sum, building) => sum + building.paid, 0),
        balance: buildingData.reduce((sum, building) => sum + building.balance, 0),
        overdue: allApartments.filter((apartment) => apartment.balance > 0).length,
        specialFeesOwed: buildingData.reduce((sum, building) => sum + building.specialFeesOwed, 0),
        specialFeesCollected: buildingData.reduce((sum, building) => sum + building.specialFeesCollected, 0),
        specialFeesBalance: buildingData.reduce((sum, building) => sum + building.specialFeesBalance, 0),
        specialFeesOverdue: allApartments.filter((apartment) => apartment.specialFeesBalance > 0).length,
      },
      buildings: buildingData,
      recentPayments: recentPayments.map((payment) => ({
        id: payment.id, ownerName: payment.owner.fullName, apartmentNumber: payment.apartment.number, buildingName: payment.apartment.building.name,
        amount: amount(payment.amount), paidOn: payment.paidOn, feeNames: payment.allocations.map((allocation) => allocation.feeCharge.feeType.name),
      })),
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر تحميل بيانات لوحة التحكم." });
  }
});

app.get("/api/owners", async (_request, response) => {
  try {
    const owners = await prisma.owner.findMany({
      orderBy: { fullName: "asc" },
      include: {
        contacts: true,
        currentApartments: {
          include: {
            building: true,
            charges: { include: { feeType: true } },
            specialFees: { include: { specialFeeType: true } },
          },
        },
      },
    });
    const rows = owners.flatMap((owner) => {
      const phone = owner.contacts.find((contact) => contact.isPrimary)?.value ?? owner.contacts[0]?.value ?? null;
      const base = { ownerId: owner.id, ownerName: owner.fullName, phone, residenceStatus: owner.residenceStatus, nationalId: owner.nationalId };
      if (owner.currentApartments.length === 0) {
        return [{ ...base, buildingName: null, apartmentNumber: null, floor: null, area: null, specialFeesBalance: 0 }];
      }
      return owner.currentApartments.map((apartment) => {
        const aggregatedSpecialFees = aggregateSpecialFees(apartment.specialFees ?? []);
        return {
          ...base,
          buildingName: apartment.building.name,
          apartmentNumber: apartment.number,
          floor: apartment.floor,
          area: apartment.areaM2 === null ? null : amount(apartment.areaM2),
          specialFeesBalance: specialFeesBalance(aggregatedSpecialFees) + legacyDebtTotal(apartment.charges ?? []),
        };
      });
    });
    response.json(rows);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر تحميل بيانات الملاك." });
  }
});

app.get("/api/payment-types", async (_request, response) => {
  try {
    const types = await prisma.paymentType.findMany({ orderBy: { name: "asc" } });
    response.json(types);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر تحميل أنواع المدفوعات." });
  }
});

app.get("/api/special-fee-types", async (_request, response) => {
  try {
    const types = await prisma.specialFeeType.findMany({ orderBy: { name: "asc" } });
    response.json(types);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر تحميل أنواع الرسوم الخاصة." });
  }
});

app.post("/api/payment-types", express.json(), async (request, response) => {
  try {
    const { name } = request.body;
    if (!name) return response.status(400).json({ error: "الاسم مطلوب." });
    const type = await prisma.paymentType.create({ data: { name } });
    response.status(201).json(type);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر إضافة نوع المدفوعات." });
  }
});

app.delete("/api/payment-types/:id", async (request, response) => {
  try {
    await prisma.paymentType.delete({ where: { id: request.params.id } });
    response.json({ ok: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر حذف نوع المدفوعات." });
  }
});

app.get("/api/apartments/:id/ledger", async (request, response) => {
  try {
    const [apartment, payments, specialFees] = await Promise.all([
      prisma.apartment.findUnique({
        where: { id: request.params.id },
        include: {
          building: true,
          currentOwner: { include: { contacts: true } },
          charges: { orderBy: { createdAt: "desc" }, include: { feeType: true, allocations: { include: { payment: { include: { paymentType: true } } } } } },
        },
      }),
      prisma.payment.findMany({
        where: { apartmentId: request.params.id },
        include: { paymentType: true },
        orderBy: { paidOn: "desc" },
      }),
      prisma.specialFee.findMany({
        where: { apartmentId: request.params.id },
        include: { specialFeeType: true },
        orderBy: { createdAt: "desc" },
      })
    ]);
    if (!apartment) return response.status(404).json({ error: "الشقة غير موجودة." });
    const owed = apartment.charges.reduce((sum, charge) => sum + amount(charge.amount), 0);
    const paid = apartment.charges.reduce((sum, charge) => sum + charge.allocations.reduce((inner, allocation) => inner + amount(allocation.amount), 0), 0);
    const phone = apartment.currentOwner?.contacts.find((contact) => contact.isPrimary)?.value ?? apartment.currentOwner?.contacts[0]?.value ?? null;

    const aggregatedSpecialFees = aggregateSpecialFees(specialFees);
    const legacyDebts = legacyDebtEntries(apartment.charges);
    const otherCharges = apartment.charges.filter((charge) => charge.periodLabel !== HISTORICAL_PERIOD);

    response.json({
      id: apartment.id, number: apartment.number, floor: apartment.floor, buildingName: apartment.building.name,
      ownerName: apartment.currentOwner?.fullName ?? "بدون مالك", phone, owed, paid, balance: owed - paid,
      charges: otherCharges.map((charge) => ({ id: charge.id, feeName: charge.feeType.name, amount: amount(charge.amount), dueDate: charge.dueDate, periodLabel: charge.periodLabel, status: charge.status, allocations: charge.allocations.map((allocation) => ({ amount: amount(allocation.amount), receiptNumber: allocation.payment.receiptNumber, paidOn: allocation.payment.paidOn, paymentType: allocation.payment.paymentType?.name })) })),
      payments: payments.map((p) => ({ id: p.id, amount: amount(p.amount), paidOn: p.paidOn, receiptNumber: p.receiptNumber, paymentType: p.paymentType?.name || "دفعة عامة" })),
      specialFees: aggregatedSpecialFees,
      legacyDebts,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر تحميل كشف حساب الشقة." });
  }
});

app.post("/api/payments", express.json(), async (request, response) => {
  try {
    const { apartmentId, amount: paymentAmount, paidOn, chargeIds, paymentTypeId, specialFeeTypeId } = request.body;
    if (!apartmentId || !paymentAmount || !paidOn) {
      return response.status(400).json({ error: "بيانات الدفعة غير كاملة." });
    }
    const apartment = await prisma.apartment.findUnique({ where: { id: apartmentId }, include: { currentOwner: true } });
    if (!apartment) return response.status(404).json({ error: "الشقة غير موجودة." });
    if (!apartment.currentOwnerId) return response.status(400).json({ error: "الشقة لا تملك مالك حالي." });
    const receiptNumber = `R-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    // For special fees, create a SpecialFee record with collectionAmount=0 to indicate manual payment
    // This adds to collectedAmount without changing the required amount
    if (specialFeeTypeId) {
      await prisma.specialFee.create({
        data: {
          apartmentId,
          specialFeeTypeId,
          collectionAmount: 0,
          collectedAmount: paymentAmount,
          receiptNumber,
          status: "PAID",
          paidDate: new Date(paidOn),
          notes: `دفعة مسجلة يدويًا على ${new Date(paidOn).toLocaleDateString('ar-EG')}`
        }
      });
      response.status(201).json({ ok: true, receiptNumber, paymentId: null });
    } else {
      // For generic payment types
      const payment = await prisma.payment.create({
        data: {
          apartmentId,
          ownerId: apartment.currentOwnerId,
          paymentTypeId: paymentTypeId || null,
          amount: paymentAmount,
          paidOn: new Date(paidOn),
          receiptNumber,
          allocations: {
            create: (chargeIds || []).map((chargeId: string) => ({
              feeChargeId: chargeId,
              amount: paymentAmount / (chargeIds?.length || 1),
            })),
          },
        },
        include: { allocations: true },
      });
      response.status(201).json({ ok: true, receiptNumber: payment.receiptNumber, paymentId: payment.id });
    }
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر تسجيل الدفعة." });
  }
});

app.post("/api/cleanup-legacy-charges", async (_request, response) => {
  try {
    const legacyChargeNames = ["مصاريف صيانه 5/2018", "مصاريف صيانه5/2018", "م صيانه من 4-2016", "صيانه حتى 3-2016", "صيانه حتى 3 - 2016", "فروق صيانة 4 - 2024", "فروق صيانة 4-2024"];
    const feeTypesWithNames = await prisma.feeType.findMany({
      where: { name: { in: legacyChargeNames } },
      select: { id: true }
    });
    const feeTypeIds = feeTypesWithNames.map(ft => ft.id);
    // First delete PaymentAllocations that reference these charges
    await prisma.paymentAllocation.deleteMany({
      where: { feeCharge: { feeTypeId: { in: feeTypeIds } } }
    });
    // Then delete the charges
    const deleted = await prisma.feeCharge.deleteMany({
      where: { feeTypeId: { in: feeTypeIds } }
    });
    response.json({ ok: true, deletedCount: deleted.count, message: `تم حذف ${deleted.count} رسم قديم من قاعدة البيانات` });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "تعذر حذف الرسوم القديمة." });
  }
});

app.post("/api/imports/excel", upload.single("file"), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: "اختر ملف Excel أولًا." });
  if (!/\.xlsx$/i.test(request.file.originalname)) return response.status(400).json({ error: "الملف يجب أن يكون بصيغة .xlsx" });
  try {
    return response.status(201).json(await importBuildingWorkbook(prisma, request.file.originalname, request.file.buffer));
  } catch (error) {
    console.error(error);
    return response.status(422).json({ error: error instanceof Error ? error.message : "تعذر استيراد الملف." });
  }
});

app.use((_request, response) => response.status(404).json({ error: "مسار API غير موجود." }));

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Bostan API is running on http://localhost:${port}`));
