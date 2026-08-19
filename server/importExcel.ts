import ExcelJS from "exceljs";
import type { PrismaClient } from "../prisma/generated/client/client";

type Db = PrismaClient;
type ImportResult = {
  buildingName: string;
  apartments: number;
  owners: number;
  charges: number;
  payments: number;
  warnings: string[];
};

export const HISTORICAL_PERIOD = "رصيد تاريخي مستورد من Excel";

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text ?? "");
  }
  return String(value);
}

function normalize(value: string): string {
  return value.replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/[ً-ْ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function numberValue(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(cellText(value).replace(/[٬,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

// Detects a sheet's own "total" cell for a receipted-payments column, so it can be excluded
// from the individual payment rows instead of being counted as an extra payment. Sheets in this
// workbook express totals two ways: a SUM(...) formula, or a same-column addition chain like
// "K2+K3+...+K9". We never infer "this must be the total" from a value coincidentally matching
// the running sum — a real payment can legitimately equal the running total of prior rows
// (e.g. 600 + 900 = 1500, and the next real receipt also happens to be 1500), and that heuristic
// silently drops the receipt.
function isTotalRowFormula(cellValue: ExcelJS.CellValue, column: string): boolean {
  if (typeof cellValue !== "object" || cellValue === null || !("formula" in cellValue)) return false;
  const formula = String((cellValue as { formula: unknown }).formula).trim();
  if (/^sum\(/i.test(formula)) return true;
  const parts = formula.split("+").map((part) => part.trim());
  if (parts.length < 2) return false;
  const cellRefPattern = new RegExp(`^${column}\\d+$`, "i");
  return parts.every((part) => cellRefPattern.test(part));
}

// Reads every individual payment row (amount + receipt) in a column starting at startRow,
// skipping blank rows in between, and stopping as soon as the sheet's own total row is reached
// (or maxRow, as an absolute safety cap). Each apartment's sheet can have a different number of
// rows for the same fee type, so this scans rather than assuming a fixed range.
function readReceiptedRows(ledger: ExcelJS.Worksheet, amountCol: string, receiptCol: string, startRow: number, maxRow: number) {
  const rows: Array<{ amount: number; receipt: string; rowNumber: number }> = [];
  for (let rowNumber = startRow; rowNumber <= maxRow; rowNumber += 1) {
    const row = ledger.getRow(rowNumber);
    const cellValue = row.getCell(amountCol).value;
    if (isTotalRowFormula(cellValue, amountCol)) break;
    const amount = numberValue(cellValue);
    const receipt = cellText(row.getCell(receiptCol).value).trim();
    if (amount === null || amount <= 0) continue;
    rows.push({ amount, receipt, rowNumber });
  }
  return rows;
}

// Finds-or-creates the SpecialFeeType, then replaces its SpecialFee rows for this apartment with
// one record per individual payment row found (each fully paid, carrying its own receipt number).
async function importReceiptedFeeType(
  tx: Db,
  apartmentId: string,
  ledger: ExcelJS.Worksheet,
  fileName: string,
  config: { name: string; description: string; amountCol: string; receiptCol: string; startRow: number; maxRow: number; noteSuffix?: string }
) {
  const type = await (async () => {
    const existing = await tx.specialFeeType.findUnique({ where: { name: config.name } });
    if (existing) return existing;
    return tx.specialFeeType.create({
      data: {
        name: config.name,
        description: config.description,
        cellMapping: JSON.stringify({
          amountRange: `${config.amountCol}${config.startRow}:${config.amountCol}*`,
          receiptRange: `${config.receiptCol}${config.startRow}:${config.receiptCol}*`,
          calculationNote: "Auto-detects range by stopping at the sheet's own total row (SUM formula or same-column addition chain).",
        }),
      },
    });
  })();

  const rows = readReceiptedRows(ledger, config.amountCol, config.receiptCol, config.startRow, config.maxRow);

  await tx.specialFee.deleteMany({ where: { apartmentId, specialFeeTypeId: type.id } });

  for (const row of rows) {
    await tx.specialFee.create({
      data: {
        apartmentId,
        specialFeeTypeId: type.id,
        collectionAmount: row.amount,
        collectedAmount: row.amount,
        receiptNumber: row.receipt || null,
        status: "PAID",
        paidDate: new Date(),
        notes: `Row ${row.rowNumber} من ${fileName}${config.noteSuffix ? " - " + config.noteSuffix : ""}`,
      },
    });
  }
}

function floorFromApartment(number: string): number {
  const value = Number(number);
  return value < 10 ? 0 : Math.floor(value / 10);
}

function phoneValue(value: ExcelJS.CellValue): string | null {
  const digits = cellText(value).replace(/\D/g, "");
  if (!digits || digits === "0") return null;
  return digits.length === 10 && digits.startsWith("1") ? `0${digits}` : digits;
}

function receiptNumber(buildingNumber: string, apartmentNumber: string, feeName: string, receipt: string): string {
  const safeFee = normalize(feeName).replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40);
  const safeReceipt = receipt.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 45);
  return `XLSX-${buildingNumber}-${apartmentNumber}-${safeFee}-${safeReceipt}`;
}

async function feeTypeId(db: Db, name: string) {
  return (await db.feeType.upsert({ where: { name }, create: { name }, update: {} })).id;
}

export async function importBuildingWorkbook(db: Db, fileName: string, buffer: Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const summary = workbook.getWorksheet("مجمع");
  if (!summary) throw new Error("لم يتم العثور على ورقة «مجمع» في الملف.");

  const phones = new Map<string, string>();
  const ownerList = workbook.getWorksheet("0");
  if (ownerList) {
    const ownerHeaders = new Map<string, number>();
    ownerList.getRow(2).eachCell((cell, column) => ownerHeaders.set(normalize(cellText(cell.value)), column));
    const apartment = ownerHeaders.get(normalize("شقة"));
    const phone = ownerHeaders.get(normalize("التليفون"));
    if (apartment && phone) {
      for (let rowNumber = 3; rowNumber <= ownerList.rowCount; rowNumber += 1) {
        const row = ownerList.getRow(rowNumber);
        const number = numberValue(row.getCell(apartment).value);
        const contact = phoneValue(row.getCell(phone).value);
        if (number && contact) phones.set(String(number), contact);
      }
    }
  }

  const headerRow = summary.getRow(3);
  const headers = new Map<string, number>();
  headerRow.eachCell((cell, column) => headers.set(normalize(cellText(cell.value)), column));
  const apartmentColumn = headers.get(normalize("رقم الشقه"));
  const ownerColumn = headers.get(normalize("اسم المالك"));
  const statusColumn = headers.get(normalize("الحاله"));
  const areaColumn = headers.get(normalize("المساحه"));
  const buildingColumn = headers.get(normalize("رقم العمارة"));
  const paidDepositColumn = headers.get(normalize("المسدد من الوديعه"));
  if (!apartmentColumn || !ownerColumn || !buildingColumn) throw new Error("لا تتوافق أعمدة ورقة «مجمع» مع قالب الاستيراد المتوقع.");

  const rows: Array<{ apartmentNumber: string; ownerName: string; resident: boolean | null; area: number | null; paidDeposit: number | null; fees: Array<{ name: string; amount: number }> }> = [];
  let buildingNumber = "";
  for (let rowNumber = 4; rowNumber <= summary.rowCount; rowNumber += 1) {
    const row = summary.getRow(rowNumber);
    const apartmentRaw = numberValue(row.getCell(apartmentColumn).value);
    const ownerName = cellText(row.getCell(ownerColumn).value).trim();
    const currentBuildingNumber = numberValue(row.getCell(buildingColumn).value);
    if (!apartmentRaw || !ownerName || !currentBuildingNumber) continue;
    buildingNumber = String(currentBuildingNumber);
    const fees: Array<{ name: string; amount: number }> = [];
    for (const [header, column] of headers.entries()) {
      const excluded = ["رقم العمارة", "رقم الشقه", "اسم المالك", "الحاله", "المساحه", "الاجمالي", "المبالغ المطلوب سدادها", "المسدد من الوديعه", "نسبة السداد", "المتبقي من الوديعه"];
      if (excluded.includes(header)) continue;
      const amount = numberValue(row.getCell(column).value);
      if (amount === null || amount === 0) continue;
      fees.push({ name: cellText(headerRow.getCell(column).value).trim(), amount });
    }
    const status = statusColumn ? numberValue(row.getCell(statusColumn).value) : null;
    rows.push({ apartmentNumber: String(apartmentRaw), ownerName, resident: status === null ? null : status === 1, area: areaColumn ? numberValue(row.getCell(areaColumn).value) : null, paidDeposit: paidDepositColumn ? numberValue(row.getCell(paidDepositColumn).value) : null, fees });
  }
  if (!rows.length) throw new Error("لم يتم العثور على شقق قابلة للاستيراد في ورقة «مجمع».");

  const title = cellText(summary.getCell("H2").value);
  const buildingName = title.match(/عمارة\s*\d+/)?.[0] ?? `عمارة ${buildingNumber || "مستوردة"}`;
  const batch = await db.importBatch.create({ data: { fileName, status: "PROCESSING" } });
  const warnings: string[] = [];
  let owners = 0, charges = 0, payments = 0;

  try {
    await db.$transaction(async (tx) => {
      const maxFloor = Math.max(...rows.map((item) => floorFromApartment(item.apartmentNumber)));
      const building = await tx.building.findFirst({ where: { name: buildingName } }) ?? await tx.building.create({ data: { name: buildingName, floors: maxFloor + 1 } });
      await tx.importBatch.update({ where: { id: batch.id }, data: { buildingId: building.id } });

      for (const item of rows) {
        const previous = await tx.apartment.findUnique({ where: { buildingId_number: { buildingId: building.id, number: item.apartmentNumber } }, include: { currentOwner: true } });
        let owner = previous?.currentOwner;
        if (!owner || normalize(owner.fullName) !== normalize(item.ownerName)) {
          const phone = phones.get(item.apartmentNumber);
          owner = await tx.owner.create({
            data: {
              fullName: item.ownerName,
              residenceStatus: item.resident === null ? "UNKNOWN" : item.resident ? "RESIDENT" : "NON_RESIDENT",
              contacts: phone ? { create: { type: "PHONE", value: phone, isPrimary: true } } : undefined,
            },
          });
          owners += 1;
        }
        const apartment = await tx.apartment.upsert({
          where: { buildingId_number: { buildingId: building.id, number: item.apartmentNumber } },
          create: { buildingId: building.id, number: item.apartmentNumber, floor: floorFromApartment(item.apartmentNumber), areaM2: item.area, currentOwnerId: owner.id },
          update: { floor: floorFromApartment(item.apartmentNumber), areaM2: item.area, currentOwnerId: owner.id },
        });
        const active = await tx.ownership.findFirst({ where: { apartmentId: apartment.id, endsOn: null } });
        if (!active || active.ownerId !== owner.id) {
          if (active) await tx.ownership.update({ where: { id: active.id }, data: { endsOn: new Date() } });
          await tx.ownership.create({ data: { apartmentId: apartment.id, ownerId: owner.id, startsOn: new Date() } });
        }

        for (const fee of item.fees) {
          const id = await feeTypeId(tx, fee.name);
          const found = await tx.feeCharge.findFirst({ where: { apartmentId: apartment.id, feeTypeId: id, periodLabel: HISTORICAL_PERIOD } });
          if (found) await tx.feeCharge.update({ where: { id: found.id }, data: { amount: fee.amount, notes: `تم الاستيراد من ${fileName}` } });
          else await tx.feeCharge.create({ data: { apartmentId: apartment.id, feeTypeId: id, amount: fee.amount, periodLabel: HISTORICAL_PERIOD, notes: `رصيد تاريخي مستورد من ${fileName}` } });
          charges += 1;
        }

        // وديعه صيانه: required = المساحة × 100 (من ورقة «مجمع»)، المسدد = عمود "المسدد من الوديعه".
        // أي فرق (غير مسدد) يُحسب كدين على الشقة عبر نفس آلية الرسوم الخاصة.
        if (item.area !== null && item.area > 0) {
          const maintenanceDepositType = await (async () => {
            const existing = await tx.specialFeeType.findUnique({ where: { name: "وديعه صيانه" } });
            if (existing) return existing;
            return tx.specialFeeType.create({
              data: {
                name: "وديعه صيانه",
                description: "وديعة الصيانة - المساحة × 100، من ورقة «مجمع»",
                cellMapping: JSON.stringify({ requiredFormula: "المساحة × 100", paidColumn: "المسدد من الوديعه" })
              }
            });
          })();
          const requiredDeposit = item.area * 100;
          const paidDeposit = item.paidDeposit ?? 0;
          await tx.specialFee.deleteMany({ where: { apartmentId: apartment.id, specialFeeTypeId: maintenanceDepositType.id } });
          await tx.specialFee.create({
            data: {
              apartmentId: apartment.id,
              specialFeeTypeId: maintenanceDepositType.id,
              collectionAmount: requiredDeposit,
              collectedAmount: paidDeposit,
              receiptNumber: null,
              status: paidDeposit >= requiredDeposit ? "PAID" : "OPEN",
              paidDate: paidDeposit >= requiredDeposit ? new Date() : null,
              notes: `مستورد من ${fileName} - المطلوب = ${item.area} × 100 = ${requiredDeposit}, المسدد = ${paidDeposit}`
            }
          });
        }

        const ledger = workbook.getWorksheet(item.apartmentNumber);
        if (!ledger) { warnings.push(`لم تُعثر ورقة تفاصيل للشقة ${item.apartmentNumber}؛ استورد الرصيد الحالي فقط.`); continue; }

        // Extract تاسيس from fixed cells: B18 (collection), C20 (validation), D18 (receipt)
        const taasisCollectionAmount = numberValue(ledger.getCell("B18").value);
        const taasisValidationAmount = numberValue(ledger.getCell("C20").value);
        const taasisReceipt = cellText(ledger.getCell("D18").value).trim();
        if (taasisCollectionAmount !== null && taasisCollectionAmount > 0) {
          const taasisType = await (async () => {
            const existing = await tx.specialFeeType.findUnique({ where: { name: "تاسيس" } });
            if (existing) return existing;
            return tx.specialFeeType.create({
              data: {
                name: "تاسيس",
                description: "رسم التأسيس - مصاريف التأسيس للشقة",
                cellMapping: JSON.stringify({ collectionAmount: "B18", validationAmount: "C20", receiptCell: "D18" })
              }
            });
          })();
          const status = taasisValidationAmount === taasisCollectionAmount ? "PAID" : "OPEN";
          // Delete existing تاسيس fees for this apartment (should only be one)
          await tx.specialFee.deleteMany({
            where: { apartmentId: apartment.id, specialFeeTypeId: taasisType.id }
          });
          // Create new تاسيس fee record
          await tx.specialFee.create({
            data: {
              apartmentId: apartment.id,
              specialFeeTypeId: taasisType.id,
              collectionAmount: taasisCollectionAmount,
              collectedAmount: taasisValidationAmount,
              receiptNumber: taasisReceipt || null,
              status,
              paidDate: status === "PAID" ? new Date() : null,
              notes: `مستورد من ${fileName}`
            }
          });
        }

        // Receipted, multi-row special fee types: each reads every individual payment row and
        // stops at the sheet's own total row (see importReceiptedFeeType / readReceiptedRows above).
        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "لاند سكيب",
          description: "رسوم لاند سكيب - تنسيق الحدائق والمناطق الخضراء",
          amountCol: "M", receiptCol: "N", startRow: 2, maxRow: ledger.rowCount,
        });

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "الأنترلوك",
          description: "رسوم الأنترلوك - تكاليف أرضيات وتغطية الأرضيات",
          amountCol: "I", receiptCol: "J", startRow: 16, maxRow: ledger.rowCount,
        });

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "مستحقات وديعه 2016",
          description: "مستحقات الوديعة لسنة 2016 - التزامات الودائع",
          amountCol: "A", receiptCol: "B", startRow: 2, maxRow: ledger.rowCount,
        });

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "مستحقات وديعه 2017",
          description: "مستحقات الوديعة لسنة 2017 - التزامات الودائع",
          amountCol: "C", receiptCol: "D", startRow: 2, maxRow: ledger.rowCount,
        });

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "مستحقات وديعه 2018",
          description: "مستحقات الوديعة لسنة 2018 - التزامات الودائع",
          amountCol: "E", receiptCol: "F", startRow: 2, maxRow: ledger.rowCount,
        });

        // Extract الوديعه اول المده from cell H2 (single value)
        const depositBeginningType = await (async () => {
          const existing = await tx.specialFeeType.findUnique({ where: { name: "الوديعه اول المده" } });
          if (existing) return existing;
          return tx.specialFeeType.create({
            data: {
              name: "الوديعه اول المده",
              description: "الوديعة في أول المدة - رصيد الوديعة الابتدائي",
              cellMapping: JSON.stringify({ cell: "H2" })
            }
          });
        })();
        const depositBeginningAmount = numberValue(ledger.getCell("H2").value);
        if (depositBeginningAmount !== null && depositBeginningAmount > 0) {
          // Delete existing deposit beginning for this apartment
          await tx.specialFee.deleteMany({
            where: { apartmentId: apartment.id, specialFeeTypeId: depositBeginningType.id }
          });
          // Create deposit beginning fee record
          await tx.specialFee.create({
            data: {
              apartmentId: apartment.id,
              specialFeeTypeId: depositBeginningType.id,
              collectionAmount: depositBeginningAmount,
              collectedAmount: depositBeginningAmount,
              receiptNumber: null,
              status: "PAID",
              paidDate: new Date(),
              notes: `مستورد من ${fileName}`
            }
          });
        }

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "وديعه مدفوعه للاتحاد السابق",
          description: "وديعة مدفوعة للاتحاد السابق - التزامات الودائع السابقة",
          // Capped at row 15 — column I is reused below (rows 16-17) for الأنترلوك, a different
          // fee type entirely, so this must not scan past the boundary between the two.
          amountCol: "I", receiptCol: "J", startRow: 2, maxRow: 15,
        });

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "وديعه مدفوعه للاتحاد الحالى",
          description: "وديعة مدفوعة للاتحاد الحالي - التزامات الودائع الحالية",
          amountCol: "K", receiptCol: "L", startRow: 2, maxRow: ledger.rowCount,
        });

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "م .ص لتغطية نقص موارد ادارة الاتحاد من 11-2020",
          description: "مصاريف تغطية نقص موارد إدارة الاتحاد من 11-2020",
          amountCol: "Q", receiptCol: "R", startRow: 2, maxRow: ledger.rowCount,
        });

        await importReceiptedFeeType(tx, apartment.id, ledger, fileName, {
          name: "فروق صيانة 4-2024",
          description: "فروق صيانة 4-2024 - الفروقات في مصاريف الصيانة",
          amountCol: "S", receiptCol: "T", startRow: 2, maxRow: ledger.rowCount,
          noteSuffix: "الرسم المطلوب يحسب ديناميكياً: (الأشهر من 4/2024 إلى تاريخ اليوم) × 150",
        });

        const ledgerHeaders = ledger.getRow(1);
        for (let column = 1; column < ledger.columnCount; column += 1) {
          const feeName = cellText(ledgerHeaders.getCell(column).value).trim();
          const receiptHeader = normalize(cellText(ledgerHeaders.getCell(column + 1).value));
          if (!feeName || !receiptHeader.includes("ايصال")) continue;
          const id = await feeTypeId(tx, feeName);
          for (let rowNumber = 2; rowNumber <= ledger.rowCount; rowNumber += 1) {
            const row = ledger.getRow(rowNumber);
            const amount = numberValue(row.getCell(column).value);
            const receipt = cellText(row.getCell(column + 1).value).trim();
            if (amount === null || amount <= 0 || !receipt) continue;
            const importedReceipt = receiptNumber(buildingNumber, item.apartmentNumber, feeName, receipt);
            if (await tx.payment.findUnique({ where: { receiptNumber: importedReceipt } })) continue;
            const historicalCharge = await tx.feeCharge.create({ data: { apartmentId: apartment.id, feeTypeId: id, amount, periodLabel: `دفعة تاريخية — ${receipt}`, status: "PAID", notes: `قيد مقابل لدفعة مستوردة من ${fileName}` } });
            const payment = await tx.payment.create({ data: { apartmentId: apartment.id, ownerId: owner.id, amount, paidOn: new Date(), receiptNumber: importedReceipt, notes: `إيصال Excel الأصلي: ${receipt}` } });
            await tx.paymentAllocation.create({ data: { paymentId: payment.id, feeChargeId: historicalCharge.id, amount } });
            await tx.receipt.create({ data: { paymentId: payment.id, receiptNumber: importedReceipt } });
            payments += 1;
          }
        }
      }
    }, { timeout: 60000 });
    await db.importBatch.update({ where: { id: batch.id }, data: { status: warnings.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED", importedAt: new Date(), errorLog: warnings.length ? warnings.join("\n") : null } });
    return { buildingName, apartments: rows.length, owners, charges, payments, warnings };
  } catch (error) {
    await db.importBatch.update({ where: { id: batch.id }, data: { status: "FAILED", errorLog: error instanceof Error ? error.message : "خطأ غير معروف" } });
    throw error;
  }
}
