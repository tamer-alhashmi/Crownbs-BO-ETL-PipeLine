import "server-only";
import Papa from "papaparse";
import { parseReportDate } from "@/lib/etl/date";
import {
  BOOKING_HEADERS,
  PAYMENT_HEADERS,
  cleanBookingRecord,
  parseDecimalAmount,
  type SourceRecord,
} from "@/lib/reports/aggregation";

export type ImportIssueInput = {
  row_number: number;
  column_name: string | null;
  issue_code: string;
  message: string;
};

export type ParsedBookings = {
  rows: Array<{
    rowNumber: number;
    source: SourceRecord;
    internalCompany: string;
    total: string;
    paid: string;
    room: string;
    other: string | null;
  }>;
  issues: ImportIssueInput[];
  droppedRows: number;
  totalRows: number;
};

export type ParsedPayments = {
  rows: Array<{ rowNumber: number; source: SourceRecord; amount: string }>;
  issues: ImportIssueInput[];
  totalRows: number;
};

function parseGrid(csv: string) {
  const result = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  if (result.errors.length) {
    const firstError = result.errors[0];
    throw new Error(
      `CSV parsing failed near row ${(firstError.row ?? 0) + 1}: ${firstError.message}`,
    );
  }
  return result.data;
}

function makeRecord(headers: string[], values: string[]): SourceRecord {
  return Object.fromEntries(
    headers.map((header, index) => [header.trim(), (values[index] ?? "").trim()]),
  );
}

function normalizeHeader(header: string) {
  return header
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function canonicalizeHeaders(headers: string[], expected: readonly string[]) {
  const expectedHeaders = new Map(expected.map((header) => [normalizeHeader(header), header]));
  return headers.map((header) => {
    const cleaned = header.replace(/^\uFEFF/, "").trim();
    return expectedHeaders.get(normalizeHeader(cleaned)) ?? cleaned;
  });
}

function validateHeaders(headers: string[], required: readonly string[], reportName: string) {
  const available = new Set(headers.map(normalizeHeader));
  const missing = required.filter((header) => !available.has(normalizeHeader(header)));
  if (missing.length) {
    throw new Error(`${reportName} CSV is missing required columns: ${missing.join(", ")}.`);
  }
}

function hasValidDate(value: string) {
  return !value.trim() || parseReportDate(value) !== null;
}

export function parseBookingsCsv(csv: string, internalCompany: string): ParsedBookings {
  if (!internalCompany.trim()) throw new Error("Bookings CSV requires a filename-derived Crown BS Company.");
  const grid = parseGrid(csv);
  if (grid.length < 2) throw new Error("Bookings CSV must contain a metadata row and a header row.");

  // Row 1 contains report metadata (for example, "Sep"); CSV headers begin on row 2.
  const headers = canonicalizeHeaders(grid[1], BOOKING_HEADERS);
  validateHeaders(headers, BOOKING_HEADERS, "Bookings");

  const rows: ParsedBookings["rows"] = [];
  const issues: ImportIssueInput[] = [];
  let droppedRows = 0;
  const inputRows = grid.slice(2);

  inputRows.forEach((values, index) => {
    const rowNumber = index + 3;
    const source = makeRecord(headers, values);
    if (!source["Booking Reference"]) {
      issues.push({
        row_number: rowNumber,
        column_name: "Booking Reference",
        issue_code: "MISSING_BOOKING_REFERENCE",
        message: "Booking row has no booking reference and was skipped.",
      });
      return;
    }
    const invalidDateColumn = ["Booking Date", "Check In", "Check Out", "Booking Date and Time", "Arrival"]
      .find((column) => !hasValidDate(source[column] ?? ""));
    if (invalidDateColumn) {
      issues.push({
        row_number: rowNumber,
        column_name: invalidDateColumn,
        issue_code: "INVALID_BOOKING_DATE",
        message: `Invalid date value in "${invalidDateColumn}".`,
      });
      return;
    }

    try {
      const cleaned = cleanBookingRecord(source);
      if (cleaned.dropped) {
        droppedRows++;
        return;
      }
      rows.push({
        rowNumber,
        source: cleaned.source,
        internalCompany,
        total: cleaned.totalRevenue,
        paid: cleaned.paidAmount,
        room: cleaned.roomRevenue,
        other: cleaned.otherRevenue,
      });
    } catch (error) {
      issues.push({
        row_number: rowNumber,
        column_name: null,
        issue_code: "INVALID_BOOKING_AMOUNT",
        message: error instanceof Error ? error.message : "Booking row has invalid monetary data.",
      });
    }
  });

  return { rows, issues, droppedRows, totalRows: inputRows.length };
}

export function parsePaymentsCsv(csv: string): ParsedPayments {
  const grid = parseGrid(csv);
  if (!grid.length) throw new Error("Payments CSV is empty.");

  const originalHeaders = canonicalizeHeaders(grid[0], PAYMENT_HEADERS);
  const headerOffset = originalHeaders.findIndex((header) => header === PAYMENT_HEADERS[0]);
  const start = headerOffset >= 0 ? headerOffset : originalHeaders.length >= 73 ? 36 : 0;
  const headers = originalHeaders.slice(start, start + PAYMENT_HEADERS.length);
  validateHeaders(headers, PAYMENT_HEADERS, "Payments");

  const rows: ParsedPayments["rows"] = [];
  const issues: ImportIssueInput[] = [];
  const inputRows = grid.slice(1);

  inputRows.forEach((values, index) => {
    const rowNumber = index + 2;
    const source = makeRecord(headers, values.slice(start, start + PAYMENT_HEADERS.length));
    if (!source.PaymentID) {
      issues.push({
        row_number: rowNumber,
        column_name: "PaymentID",
        issue_code: "MISSING_PAYMENT_ID",
        message: "Payment row has no PaymentID and was skipped.",
      });
      return;
    }
    if (!source.Direct1.trim()) {
      issues.push({
        row_number: rowNumber,
        column_name: "Direct1",
        issue_code: "MISSING_PAYMENT_AMOUNT",
        message: "Payment row has no Direct1 amount and was skipped.",
      });
      return;
    }
    if (!hasValidDate(source.ReceivedDateTime ?? "")) {
      issues.push({
        row_number: rowNumber,
        column_name: "ReceivedDateTime",
        issue_code: "INVALID_PAYMENT_DATE",
        message: "Payment row has an invalid ReceivedDateTime and was skipped.",
      });
      return;
    }

    try {
      const normalizedSource = { ...source };
      for (const column of [
        "SettledAmount",
        "Card1",
        "Cash1",
        "Vouchers1",
        "OTAPrepaid1",
        "Eviivo",
        "OnAccount",
        "Direct1",
      ]) {
        if (normalizedSource[column]) {
          normalizedSource[column] = parseDecimalAmount(normalizedSource[column], column).toFixed(2);
        }
      }
      rows.push({
        rowNumber,
        source: normalizedSource,
        amount: normalizedSource.Direct1,
      });
    } catch (error) {
      issues.push({
        row_number: rowNumber,
        column_name: "Direct1",
        issue_code: "INVALID_PAYMENT_AMOUNT",
        message: error instanceof Error ? error.message : "Payment row has an invalid Direct1 amount.",
      });
    }
  });

  return { rows, issues, totalRows: inputRows.length };
}
