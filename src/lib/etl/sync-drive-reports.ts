import "server-only";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import {
  downloadCsv,
  listReportFiles,
  markDriveFileProcessed,
  type DriveReportFile,
} from "@/lib/etl/google-drive";
import {
  parseBookingsCsv,
  parsePaymentsCsv,
  type ImportIssueInput,
} from "@/lib/etl/csv";
import { parseReportDate } from "@/lib/etl/date";
import { prisma } from "@/lib/prisma";

const sourceSystem = "eviivo";
const upsertChunkSize = 250;
const issueChunkSize = 500;

export type DriveSyncSummary = {
  processedFiles: number;
  importedBookings: number;
  importedPayments: number;
  droppedBookings: number;
  rejectedRows: number;
  errors: string[];
};

function identifyReport(file: DriveReportFile) {
  if (!/\.csv$/i.test(file.name) || /_processed(?:\.csv)?$/i.test(file.name)) return null;
  const name = file.name.toLocaleLowerCase();

  if (/payments?\s+received/.test(name)) return "payments" as const;
  if (
    name.includes("h&h") ||
    /(^|[^a-z])hh([^a-z]|$)/.test(name) ||
    /harbou?r/.test(name) ||
    name.includes("orlando")
  ) {
    return "bookings" as const;
  }
  return null;
}

export function internalCompanyFromBookingFilename(fileName: string) {
  const name = fileName.toLocaleLowerCase();
  if (name.includes("h&h") || /(^|[^a-z])hh([^a-z]|$)/.test(name)) return "Crown H&H";
  if (/harbou?r/.test(name)) return "Crown Harbor";
  if (name.includes("orlando")) return "Crown Orlando";
  throw new Error(`Cannot determine Crown BS Company from bookings filename "${fileName}".`);
}

function nullableDate(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = parseReportDate(value);
  if (!parsed) throw new Error("A report date is invalid.");
  return parsed;
}

function asJson(value: Record<string, string>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

async function writeIssues(importFileId: string, issues: ImportIssueInput[]) {
  for (let offset = 0; offset < issues.length; offset += issueChunkSize) {
    await prisma.importIssue.createMany({
      data: issues.slice(offset, offset + issueChunkSize).map((issue) => ({
        import_file_id: importFileId,
        row_number: issue.row_number,
        column_name: issue.column_name,
        issue_code: issue.issue_code,
        message: issue.message,
      })),
    });
  }
}

export async function upsertBookings(
  database: Pick<Prisma.TransactionClient, "$executeRaw">,
  importFileId: string,
  rows: ReturnType<typeof parseBookingsCsv>["rows"],
) {
  const recordsByReference = new Map<
    string,
    {
      id: string;
      import_file_id: string;
      source_row_number: number;
      source_system: string;
      internal_company: string;
      property_name: string | null;
      booking_date: string | null;
      booking_reference: string;
      order_reference: string | null;
      ota_reference: string | null;
      guest_name: string | null;
      guest_first_name: string | null;
      guest_last_name: string | null;
      arrival_date: string | null;
      departure_date: string | null;
      booking_status: string | null;
      total_amount: string;
      paid_amount: string;
      room_unit_revenue: string;
      other_revenue: string | null;
      deposit_amount: string | null;
      currency_code: string | null;
      source_data: Prisma.InputJsonObject;
      created_at: string;
      updated_at: string;
    }
  >();
  const now = new Date().toISOString();

  for (const { rowNumber, source, internalCompany, total, paid, room, other } of rows) {
    const bookingReference = source["Booking Reference"].trim();
    const guestFirstName = source["Guest First Name"] || null;
    const guestLastName = source["Guest Last Name"] || null;
    const asDateOnly = (value: string | undefined) =>
      nullableDate(value)?.toISOString().slice(0, 10) ?? null;
    recordsByReference.set(bookingReference, {
      id: randomUUID(),
      import_file_id: importFileId,
      source_row_number: rowNumber,
      source_system: sourceSystem,
      internal_company: internalCompany,
      property_name: source.Property || null,
      booking_date: asDateOnly(source["Booking Date"]),
      booking_reference: bookingReference,
      order_reference: source["Order Reference"] || null,
      ota_reference: source["OTA Reference"] || null,
      guest_name: [guestFirstName, guestLastName].filter(Boolean).join(" ") || null,
      guest_first_name: guestFirstName,
      guest_last_name: guestLastName,
      arrival_date: asDateOnly(source["Check In"] || source.Arrival),
      departure_date: asDateOnly(source["Check Out"]),
      booking_status: source["Booking Status"] || null,
      total_amount: new Decimal(total).toFixed(2),
      paid_amount: new Decimal(paid).toFixed(2),
      room_unit_revenue: new Decimal(room).toFixed(2),
      other_revenue: other,
      deposit_amount: other,
      currency_code: source.Currency?.trim().toUpperCase() || null,
      source_data: asJson(source),
      created_at: now,
      updated_at: now,
    });
  }

  const records = [...recordsByReference.values()];
  for (let offset = 0; offset < records.length; offset += upsertChunkSize) {
    const chunk = records.slice(offset, offset + upsertChunkSize);
    await database.$executeRaw(Prisma.sql`
      INSERT INTO "bookings" (
        "id", "import_file_id", "source_row_number", "source_system",
        "internal_company", "property_name", "booking_date", "booking_reference",
        "order_reference", "ota_reference", "guest_name", "guest_first_name",
        "guest_last_name", "arrival_date", "departure_date", "booking_status",
        "total_amount", "paid_amount", "room_unit_revenue", "other_revenue",
        "deposit_amount", "currency_code", "source_data", "created_at", "updated_at"
      )
      SELECT
        row_data.id, row_data.import_file_id, row_data.source_row_number, row_data.source_system,
        row_data.internal_company, row_data.property_name, row_data.booking_date, row_data.booking_reference,
        row_data.order_reference, row_data.ota_reference, row_data.guest_name, row_data.guest_first_name,
        row_data.guest_last_name, row_data.arrival_date, row_data.departure_date, row_data.booking_status,
        row_data.total_amount, row_data.paid_amount, row_data.room_unit_revenue, row_data.other_revenue,
        row_data.deposit_amount, row_data.currency_code, row_data.source_data, row_data.created_at, row_data.updated_at
      FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS row_data(
        "id" UUID, "import_file_id" UUID, "source_row_number" INTEGER, "source_system" VARCHAR(64),
        "internal_company" VARCHAR(80), "property_name" VARCHAR(200), "booking_date" DATE,
        "booking_reference" VARCHAR(128), "order_reference" VARCHAR(128), "ota_reference" VARCHAR(128),
        "guest_name" VARCHAR(200), "guest_first_name" VARCHAR(120), "guest_last_name" VARCHAR(120),
        "arrival_date" DATE, "departure_date" DATE, "booking_status" VARCHAR(80),
        "total_amount" DECIMAL(10,2), "paid_amount" DECIMAL(10,2), "room_unit_revenue" DECIMAL(10,2),
        "other_revenue" DECIMAL(10,2), "deposit_amount" DECIMAL(10,2), "currency_code" CHAR(3),
        "source_data" JSONB, "created_at" TIMESTAMPTZ(6), "updated_at" TIMESTAMPTZ(6)
      )
      ON CONFLICT ("source_system", "booking_reference") DO UPDATE SET
        "import_file_id" = EXCLUDED."import_file_id",
        "source_row_number" = EXCLUDED."source_row_number",
        "internal_company" = EXCLUDED."internal_company",
        "property_name" = EXCLUDED."property_name",
        "booking_date" = EXCLUDED."booking_date",
        "order_reference" = EXCLUDED."order_reference",
        "ota_reference" = EXCLUDED."ota_reference",
        "guest_name" = EXCLUDED."guest_name",
        "guest_first_name" = EXCLUDED."guest_first_name",
        "guest_last_name" = EXCLUDED."guest_last_name",
        "arrival_date" = EXCLUDED."arrival_date",
        "departure_date" = EXCLUDED."departure_date",
        "booking_status" = EXCLUDED."booking_status",
        "total_amount" = EXCLUDED."total_amount",
        "paid_amount" = EXCLUDED."paid_amount",
        "room_unit_revenue" = EXCLUDED."room_unit_revenue",
        "other_revenue" = EXCLUDED."other_revenue",
        "deposit_amount" = EXCLUDED."deposit_amount",
        "currency_code" = EXCLUDED."currency_code",
        "source_data" = EXCLUDED."source_data",
        "updated_at" = EXCLUDED."updated_at"
    `);
  }
}

export async function upsertPayments(
  database: Pick<Prisma.TransactionClient, "$executeRaw">,
  importFileId: string,
  rows: ReturnType<typeof parsePaymentsCsv>["rows"],
) {
  const recordsByPaymentId = new Map<
    string,
    {
      id: string;
      import_file_id: string;
      source_row_number: number;
      source_system: string;
      payment_id: string;
      booking_reference: string | null;
      payment_reference: string;
      payment_date: string | null;
      payment_method: string | null;
      payment_status: string | null;
      description: string | null;
      property_name: string | null;
      direct_1: string;
      source_data: Prisma.InputJsonObject;
      created_at: string;
      updated_at: string;
    }
  >();
  const now = new Date().toISOString();

  for (const { rowNumber, source, amount } of rows) {
    const paymentId = source.PaymentID.trim();
    const bookingReference = source.BookingReference?.trim() || null;
    recordsByPaymentId.set(paymentId, {
      id: randomUUID(),
      import_file_id: importFileId,
      source_row_number: rowNumber,
      source_system: sourceSystem,
      payment_id: paymentId,
      booking_reference: bookingReference,
      payment_reference: source.GatewayReference || paymentId,
      payment_date: nullableDate(source.ReceivedDateTime)?.toISOString() ?? null,
      payment_method: source.PaymentMethod || null,
      payment_status: source.transferred || null,
      description: source.Description || null,
      property_name: source.business_name || null,
      direct_1: new Decimal(amount).toFixed(2),
      source_data: asJson(source),
      created_at: now,
      updated_at: now,
    });
  }

  const records = [...recordsByPaymentId.values()];
  for (let offset = 0; offset < records.length; offset += upsertChunkSize) {
    const chunk = records.slice(offset, offset + upsertChunkSize);
    await database.$executeRaw(Prisma.sql`
      INSERT INTO "payments" (
        "id", "import_file_id", "source_row_number", "source_system", "payment_id",
        "booking_id", "booking_reference", "payment_reference", "payment_date",
        "payment_method", "payment_status", "description", "property_name",
        "direct_1", "source_data", "created_at", "updated_at"
      )
      SELECT
        row_data.id, row_data.import_file_id, row_data.source_row_number, row_data.source_system,
        row_data.payment_id, booking.id, row_data.booking_reference, row_data.payment_reference,
        row_data.payment_date, row_data.payment_method, row_data.payment_status, row_data.description,
        row_data.property_name, row_data.direct_1, row_data.source_data, row_data.created_at, row_data.updated_at
      FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS row_data(
        "id" UUID, "import_file_id" UUID, "source_row_number" INTEGER, "source_system" VARCHAR(64),
        "payment_id" VARCHAR(128), "booking_reference" VARCHAR(128), "payment_reference" VARCHAR(128),
        "payment_date" TIMESTAMPTZ(6), "payment_method" VARCHAR(80), "payment_status" VARCHAR(80),
        "description" TEXT, "property_name" VARCHAR(200), "direct_1" DECIMAL(10,2),
        "source_data" JSONB, "created_at" TIMESTAMPTZ(6), "updated_at" TIMESTAMPTZ(6)
      )
      LEFT JOIN "bookings" AS booking
        ON booking."source_system" = row_data.source_system
        AND booking."booking_reference" = row_data.booking_reference
        AND booking."deleted_at" IS NULL
      ON CONFLICT ("source_system", "payment_id") DO UPDATE SET
        "import_file_id" = EXCLUDED."import_file_id",
        "source_row_number" = EXCLUDED."source_row_number",
        "booking_id" = EXCLUDED."booking_id",
        "booking_reference" = EXCLUDED."booking_reference",
        "payment_reference" = EXCLUDED."payment_reference",
        "payment_date" = EXCLUDED."payment_date",
        "payment_method" = EXCLUDED."payment_method",
        "payment_status" = EXCLUDED."payment_status",
        "description" = EXCLUDED."description",
        "property_name" = EXCLUDED."property_name",
        "direct_1" = EXCLUDED."direct_1",
        "source_data" = EXCLUDED."source_data",
        "updated_at" = EXCLUDED."updated_at"
    `);
  }
}

async function linkPaymentsToBookings() {
  await prisma.$executeRaw`
    UPDATE "payments" AS payment
    SET "booking_id" = booking."id"
    FROM "bookings" AS booking
    WHERE payment."booking_id" IS NULL
      AND payment."booking_reference" = booking."booking_reference"
      AND payment."source_system" = booking."source_system"
      AND payment."deleted_at" IS NULL
      AND booking."deleted_at" IS NULL
  `;
}

export async function syncDriveReports(
  userId: string,
): Promise<DriveSyncSummary> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");

  const files = (await listReportFiles(folderId))
    .map((file) => ({ file, reportType: identifyReport(file) }))
    .filter(
      (entry): entry is { file: DriveReportFile; reportType: "bookings" | "payments" } =>
        entry.reportType !== null,
    );

  if (!files.length) {
    return {
      processedFiles: 0,
      importedBookings: 0,
      importedPayments: 0,
      droppedBookings: 0,
      rejectedRows: 0,
      errors: [],
    };
  }

  const batch = await prisma.importBatch.create({
    data: {
      created_by_id: userId,
      status: "PROCESSING",
      started_at: new Date(),
    },
  });
  const summary: DriveSyncSummary = {
    processedFiles: 0,
    importedBookings: 0,
    importedPayments: 0,
    droppedBookings: 0,
    rejectedRows: 0,
    errors: [],
  };

  for (const { file, reportType } of files) {
    let importFileId: string | undefined;
    try {
      const importFile = await prisma.importFile.create({
        data: {
          import_batch_id: batch.id,
          original_file_name: file.name,
          storage_provider: "GOOGLE_DRIVE",
          google_drive_file_id: file.id,
          google_drive_folder_id: folderId,
          content_type: file.mimeType,
          byte_size: file.size ? BigInt(file.size) : null,
          status: "VALIDATING",
        },
      });
      importFileId = importFile.id;

      const csv = await downloadCsv(file.id);
      if (reportType === "bookings") {
        const parsed = parseBookingsCsv(csv, internalCompanyFromBookingFilename(file.name));
        await prisma.importFile.update({
          where: { id: importFile.id },
          data: {
            status: "IMPORTING",
            total_rows: parsed.totalRows,
            imported_rows: parsed.rows.length,
            rejected_rows: parsed.issues.length,
          },
        });
        await upsertBookings(prisma, importFile.id, parsed.rows);
        await writeIssues(importFile.id, parsed.issues);
        summary.importedBookings += parsed.rows.length;
        summary.droppedBookings += parsed.droppedRows;
        summary.rejectedRows += parsed.issues.length;
        await prisma.importFile.update({
          where: { id: importFile.id },
          data: {
            status: parsed.issues.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
            completed_at: new Date(),
          },
        });
      } else {
        const parsed = parsePaymentsCsv(csv);
        await prisma.importFile.update({
          where: { id: importFile.id },
          data: {
            status: "IMPORTING",
            total_rows: parsed.totalRows,
            imported_rows: parsed.rows.length,
            rejected_rows: parsed.issues.length,
          },
        });
        await upsertPayments(prisma, importFile.id, parsed.rows);
        await writeIssues(importFile.id, parsed.issues);
        summary.importedPayments += parsed.rows.length;
        summary.rejectedRows += parsed.issues.length;
        await prisma.importFile.update({
          where: { id: importFile.id },
          data: {
            status: parsed.issues.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
            completed_at: new Date(),
          },
        });
      }
      await markDriveFileProcessed(file);
      summary.processedFiles++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import failure.";
      summary.errors.push(`${file.name}: ${message}`);
      if (importFileId) {
        await prisma.importFile.update({
          where: { id: importFileId },
          data: { status: "FAILED", error_message: message },
        });
      }
    }
  }

  try {
    await linkPaymentsToBookings();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to link payments to bookings.";
    summary.errors.push(`Payment-to-booking reconciliation: ${message}`);
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: summary.errors.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      completed_at: new Date(),
      error_message: summary.errors.length ? summary.errors.join("\n") : null,
    },
  });

  return summary;
}

export function classifyDriveReportFile(file: DriveReportFile) {
  return identifyReport(file);
}
