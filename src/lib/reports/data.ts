import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BOOKING_HEADERS,
  PAYMENT_HEADERS,
  buildBookingReportRows,
  buildPaymentReportRows,
  parseDecimalAmount,
  type BookingSource,
  type PaymentSource,
  type SourceRecord,
} from "@/lib/reports/aggregation";

export const REPORT_PAGE_SIZE = 20;

export type ReportFilters = {
  from: string;
  to: string;
  property: string;
  bookingPage: number;
  paymentPage: number;
  bookingColumnFilters: Record<string, string[]>;
  paymentColumnFilters: Record<string, string[]>;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateString(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function parseColumnFilters(params: SearchParams, prefix: string) {
  const filters: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (!key.startsWith(prefix)) continue;
    let id: string;
    try {
      id = decodeURIComponent(key.slice(prefix.length));
    } catch {
      continue;
    }
    const value = first(raw);
    if (!value || value.length > 8000) continue;
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.length <= 100 &&
        parsed.every((entry) => typeof entry === "string" && entry.length <= 200)
      ) {
        filters[id] = parsed;
      }
    } catch {
      continue;
    }
  }
  return filters;
}

export function normalizeReportFilters(params: SearchParams, now = new Date()): ReportFilters {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  let from = first(params.from);
  let to = first(params.to);
  from = isDateString(from) ? from : monthStart;
  to = isDateString(to) ? to : monthEnd;
  if (from > to) [from, to] = [to, from];

  return {
    from,
    to,
    property: first(params.property)?.trim() ?? "",
    bookingPage: parsePage(first(params.bookingPage)),
    paymentPage: parsePage(first(params.paymentPage)),
    bookingColumnFilters: parseColumnFilters(params, "bf."),
    paymentColumnFilters: parseColumnFilters(params, "pf."),
  };
}

function bookingFilterExpression(alias: string, id: string): Prisma.Sql | null {
  if (id === "Guest Name") {
    return Prisma.sql`COALESCE(${Prisma.raw(alias)}.guest_overrides->>'Guest Name', NULLIF(concat_ws(' ', ${Prisma.raw(alias)}.guest_overrides->>'Guest First Name', ${Prisma.raw(alias)}.guest_overrides->>'Guest Last Name'), ''), NULLIF(concat_ws(' ', ${Prisma.raw(alias)}.source_data->>'Guest First Name', ${Prisma.raw(alias)}.source_data->>'Guest Last Name'), ''), '')`;
  }
  if (id === "internal-company") return Prisma.sql`COALESCE(${Prisma.raw(alias)}.internal_company, '')`;
  if (id === "Other Revenue") {
    return Prisma.sql`(
      COALESCE(NULLIF(${Prisma.raw(alias)}.guest_overrides->>'Other Revenue', ''), NULLIF(${Prisma.raw(alias)}.source_data->>'Other Revenue', ''), '0')::numeric
      + COALESCE((
        SELECT SUM(ROUND(c.quantity * c.amount * CASE WHEN c.kind = 'DEDUCTION' THEN -1 ELSE 1 END, 2))
        FROM booking_charges c WHERE c.booking_id = ${Prisma.raw(alias)}.id
      ), 0)
    )::text`;
  }
  if (id === "Total Revenue") {
    return Prisma.sql`(
      COALESCE(${Prisma.raw(alias)}.total_override, ${Prisma.raw(alias)}.total_revenue)
      + COALESCE((
        SELECT SUM(ROUND(c.quantity * c.amount * CASE WHEN c.kind = 'DEDUCTION' THEN -1 ELSE 1 END, 2))
        FROM booking_charges c WHERE c.booking_id = ${Prisma.raw(alias)}.id
      ), 0)
    )::text`;
  }
  if (id === "Paid Amount") {
    return Prisma.sql`(${Prisma.raw(alias)}.paid_amount + ${Prisma.raw(alias)}.manual_paid_amount)::text`;
  }
  if (id === "Booking Status") {
    return Prisma.sql`COALESCE(${Prisma.raw(alias)}.card_overrides->>'status', ${Prisma.raw(alias)}.booking_status, ${Prisma.raw(alias)}.source_data->>'Booking Status', '')`;
  }
  if (id === "transaction-total" || id === "due-amount" || id === "balance-status" || id.startsWith("payment-method:")) {
    let method: string | null = null;
    if (id.startsWith("payment-method:")) {
      try {
        method = decodeURIComponent(id.slice("payment-method:".length));
      } catch {
        return null;
      }
    }
    const paymentTotal = Prisma.sql`COALESCE((
      SELECT SUM(p.direct_1)
      FROM payments p
      WHERE p.deleted_at IS NULL
        AND (p.booking_id = ${Prisma.raw(alias)}.id OR (
          p.booking_id IS NULL
          AND p.booking_reference = ${Prisma.raw(alias)}.booking_reference
          AND p.source_system = ${Prisma.raw(alias)}.source_system
        ))
        ${method ? Prisma.sql`AND COALESCE(NULLIF(BTRIM(p.payment_method), ''), NULLIF(BTRIM(p.source_data->>'PaymentMethod'), ''), 'Unspecified') = ${method}` : Prisma.empty}
    ), 0)`;
    if (method) return Prisma.sql`${paymentTotal}::text`;
    if (id === "transaction-total") return Prisma.sql`${paymentTotal}::text`;
    const total = Prisma.sql`COALESCE(${Prisma.raw(alias)}.total_override, ${Prisma.raw(alias)}.total_revenue) + COALESCE((
      SELECT SUM(ROUND(c.quantity * c.amount * CASE WHEN c.kind = 'DEDUCTION' THEN -1 ELSE 1 END, 2))
      FROM booking_charges c WHERE c.booking_id = ${Prisma.raw(alias)}.id
    ), 0)`;
    const due = Prisma.sql`GREATEST(${total} - ${paymentTotal}, 0)`;
    if (id === "due-amount") return Prisma.sql`${due}::text`;
    return Prisma.sql`CASE WHEN ${due} = 0 THEN 'Prepaid' WHEN ${paymentTotal} = 0 THEN 'Payment on arrival' ELSE 'Partially paid' END`;
  }
  if ((BOOKING_HEADERS as readonly string[]).includes(id)) {
    return Prisma.sql`COALESCE(${Prisma.raw(alias)}.guest_overrides->>${id}, ${Prisma.raw(alias)}.source_data->>${id}, '')`;
  }
  return null;
}

function tableFilterSql(
  filters: Record<string, string[]>,
  table: "booking" | "payment",
) {
  const conditions: Prisma.Sql[] = [];
  for (const [id, values] of Object.entries(filters)) {
    const expression =
      table === "booking"
        ? bookingFilterExpression("b", id)
        : (PAYMENT_HEADERS as readonly string[]).includes(id)
          ? Prisma.sql`COALESCE(p.source_data->>${id}, '')`
          : null;
    if (!expression) continue;
    const excludedValues = values.filter((value) => value.startsWith("!")).map((value) => value.slice(1));
    if (excludedValues.length) {
      conditions.push(Prisma.sql`${expression} <> ALL(${excludedValues}::text[])`);
      continue;
    }
    const exactValues = values.filter((value) => !value.startsWith("~"));
    const searchValues = values.filter((value) => value.startsWith("~")).map((value) => value.slice(1));
    const alternatives: Prisma.Sql[] = [];
    if (exactValues.length) alternatives.push(Prisma.sql`${expression} = ANY(${exactValues}::text[])`);
    for (const search of searchValues) {
      const escaped = search.replace(/[!%_]/g, "!$&");
      alternatives.push(Prisma.sql`${expression} ILIKE ${`%${escaped}%`} ESCAPE '!'`);
    }
    if (alternatives.length) conditions.push(Prisma.sql`(${Prisma.join(alternatives, " OR ")})`);
  }
  return conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

function jsonToSourceRecord(value: Prisma.JsonValue): SourceRecord {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("A stored report row does not contain a JSON object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item === null ? "" : typeof item === "string" ? item : String(item),
    ]),
  );
}

function dateBounds(filters: ReportFilters) {
  const start = new Date(`${filters.from}T00:00:00.000Z`);
  const endExclusive = new Date(`${filters.to}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
}

const emptyResult = (filters: ReportFilters, notice: string) => ({
  bookings: [],
  payments: [],
  paymentMethods: [],
  properties: [],
  filters: { ...filters, bookingPage: 1, paymentPage: 1 },
  bookingTotal: 0,
  paymentTotal: 0,
  bookingPageCount: 1,
  paymentPageCount: 1,
  summary: { revenue: "0.00", paid: "0.00", outstanding: "0.00", activeBookings: 0 },
  notice,
});

export async function getReports(filters: ReportFilters) {
  const { start, endExclusive } = dateBounds(filters);
  const bookingColumnFilter = tableFilterSql(filters.bookingColumnFilters, "booking");
  const paymentColumnFilter = tableFilterSql(filters.paymentColumnFilters, "payment");
  const bookingWhere: Prisma.BookingWhereInput = {
    deleted_at: null,
    arrival_date: { gte: start, lt: endExclusive },
    ...(filters.property ? { property_name: filters.property } : {}),
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    deleted_at: null,
    payment_date: { gte: start, lt: endExclusive },
    ...(filters.property ? { property_name: filters.property } : {}),
  };

  try {
    const [
      bookingFilteredRows,
      paymentFilteredRows,
      bookingStats,
      bookingPropertyGroups,
      paymentPropertyGroups,
      paymentMethodGroups,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT b.id
        FROM bookings b
        WHERE b.deleted_at IS NULL
          AND b.arrival_date >= ${start}
          AND b.arrival_date < ${endExclusive}
          ${filters.property ? Prisma.sql`AND b.property_name = ${filters.property}` : Prisma.empty}
          ${bookingColumnFilter}
      `),
      prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p.id
        FROM payments p
        WHERE p.deleted_at IS NULL
          AND p.payment_date >= ${start}
          AND p.payment_date < ${endExclusive}
          ${filters.property ? Prisma.sql`AND p.property_name = ${filters.property}` : Prisma.empty}
          ${paymentColumnFilter}
      `),
      prisma.$queryRaw<
        Array<{
          booking_total: number;
          revenue: string;
          paid: string;
          outstanding: string;
          active_bookings: number;
        }>
      >(Prisma.sql`
        SELECT
          COUNT(*)::int AS booking_total,
          COALESCE(SUM(COALESCE(b.total_override, b.total_revenue) + COALESCE((
            SELECT SUM(ROUND(charges.quantity * charges.amount * CASE WHEN charges.kind = 'DEDUCTION' THEN -1 ELSE 1 END, 2))
            FROM booking_charges charges
            WHERE charges.booking_id = b.id
          ), 0)), 0)::text AS revenue,
          COALESCE(SUM(COALESCE((
            SELECT SUM(p.direct_1)
            FROM payments p
            WHERE p.deleted_at IS NULL
              AND (p.booking_id = b.id OR (
                p.booking_id IS NULL
                AND p.booking_reference = b.booking_reference
                AND p.source_system = b.source_system
              ))
          ), 0)), 0)::text AS paid,
          COALESCE(SUM(GREATEST(COALESCE(b.total_override, b.total_revenue) + COALESCE((
            SELECT SUM(ROUND(charges.quantity * charges.amount * CASE WHEN charges.kind = 'DEDUCTION' THEN -1 ELSE 1 END, 2))
            FROM booking_charges charges
            WHERE charges.booking_id = b.id
          ), 0) - COALESCE((
            SELECT SUM(p.direct_1)
            FROM payments p
            WHERE p.deleted_at IS NULL
              AND (p.booking_id = b.id OR (
                p.booking_id IS NULL
                AND p.booking_reference = b.booking_reference
                AND p.source_system = b.source_system
              ))
          ), 0), 0)), 0)::text AS outstanding,
          COUNT(*) FILTER (
            WHERE b.booking_status IS NULL
              OR LOWER(COALESCE(b.card_overrides->>'status', b.booking_status)) NOT IN ('canceled', 'cancelled')
          )::int AS active_bookings
        FROM bookings b
        WHERE b.deleted_at IS NULL
          AND b.arrival_date >= ${start}
          AND b.arrival_date < ${endExclusive}
          ${filters.property ? Prisma.sql`AND b.property_name = ${filters.property}` : Prisma.empty}
          ${bookingColumnFilter}
      `),
      prisma.booking.groupBy({
        by: ["property_name"],
        where: { deleted_at: null, property_name: { not: null } },
        orderBy: { property_name: "asc" },
      }),
      prisma.payment.groupBy({
        by: ["property_name"],
        where: { deleted_at: null, property_name: { not: null } },
        orderBy: { property_name: "asc" },
      }),
      prisma.$queryRaw<Array<{ method: string; amount: string }>>(Prisma.sql`
        SELECT
          COALESCE(
            NULLIF(BTRIM(payment.payment_method), ''),
            NULLIF(BTRIM(payment.source_data->>'PaymentMethod'), ''),
            'Unspecified'
          ) AS method,
          SUM(payment.direct_1)::text AS amount
        FROM bookings AS b
        JOIN payments AS payment
          ON payment.booking_id = b.id
          OR (
            payment.booking_id IS NULL
            AND payment.booking_reference = b.booking_reference
            AND payment.source_system = b.source_system
          )
        WHERE b.deleted_at IS NULL
          AND payment.deleted_at IS NULL
          AND b.arrival_date >= ${start}
          AND b.arrival_date < ${endExclusive}
          ${filters.property ? Prisma.sql`AND b.property_name = ${filters.property}` : Prisma.empty}
          ${bookingColumnFilter}
        GROUP BY 1
        HAVING SUM(payment.direct_1) <> 0
        ORDER BY 1
      `),
    ]);

    const bookingIds = bookingFilteredRows.map(({ id }) => id);
    const paymentIds = paymentFilteredRows.map(({ id }) => id);
    const bookingTotal = bookingIds.length;
    const paymentTotal = paymentIds.length;
    const bookingPageCount = pageCount(bookingTotal);
    const paymentPageCount = pageCount(paymentTotal);
    const bookingPage = Math.min(filters.bookingPage, bookingPageCount);
    const paymentPage = Math.min(filters.paymentPage, paymentPageCount);

    const [bookingRecords, paymentRecords] = await Promise.all([
      prisma.booking.findMany({
        where: { ...bookingWhere, id: { in: bookingIds } },
        orderBy: [{ arrival_date: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        skip: (bookingPage - 1) * REPORT_PAGE_SIZE,
        take: REPORT_PAGE_SIZE,
      }),
      prisma.payment.findMany({
        where: { ...paymentWhere, id: { in: paymentIds } },
        orderBy: [{ payment_date: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        skip: (paymentPage - 1) * REPORT_PAGE_SIZE,
        take: REPORT_PAGE_SIZE,
      }),
    ]);

    const relatedPayments = bookingRecords.length
      ? await prisma.payment.findMany({
          where: {
            deleted_at: null,
            OR: bookingRecords.flatMap((booking) => [
              { booking_id: booking.id },
              {
                booking_id: null,
                booking_reference: booking.booking_reference,
                source_system: booking.source_system,
              },
            ]),
          },
          select: {
            source_data: true,
            source_system: true,
            booking_id: true,
            booking_reference: true,
            payment_method: true,
            direct_1: true,
          },
        })
      : [];

    const bookingSources: BookingSource[] = bookingRecords.map((booking) => {
      const source = jsonToSourceRecord(booking.source_data);
      const cardOverrides =
        booking.card_overrides &&
        typeof booking.card_overrides === "object" &&
        !Array.isArray(booking.card_overrides)
          ? booking.card_overrides
          : {};
      if (typeof cardOverrides.status === "string") source["Booking Status"] = cardOverrides.status;
      return {
      id: booking.id,
      source,
      sourceSystem: booking.source_system,
      internalCompany: booking.internal_company,
      totalAmount: undefined,
      paidAmount: booking.paid_amount.plus(booking.manual_paid_amount).toFixed(2),
      guestOverrides:
        booking.guest_overrides &&
        typeof booking.guest_overrides === "object" &&
        !Array.isArray(booking.guest_overrides)
          ? Object.fromEntries(
              Object.entries(booking.guest_overrides).map(([key, value]) => [
                key,
                typeof value === "string" ? value : "",
              ]),
            )
          : {},
    };
    });
    const bookingCharges = bookingRecords.length
      ? await prisma.bookingCharge.findMany({
          where: { booking_id: { in: bookingRecords.map((booking) => booking.id) } },
          select: { booking_id: true, amount: true, quantity: true, kind: true },
        })
      : [];
    const chargeTotals = new Map<string, Prisma.Decimal>();
    for (const charge of bookingCharges) {
      const amount = charge.quantity
        .mul(charge.amount)
        .mul(charge.kind === "DEDUCTION" ? -1 : 1)
        .toDecimalPlaces(2);
      chargeTotals.set(
        charge.booking_id,
        (chargeTotals.get(charge.booking_id) ?? new Prisma.Decimal(0)).plus(amount),
      );
    }
    for (const [index, record] of bookingRecords.entries()) {
      const source = bookingSources[index];
      if (!source) continue;
      const chargeTotal = chargeTotals.get(record.id) ?? new Prisma.Decimal(0);
      source.totalAmount = (record.total_override ?? record.total_revenue)
        .plus(chargeTotal)
        .toFixed(2);
      source.source["Other Revenue"] = parseDecimalAmount(
        source.source["Other Revenue"] ?? "",
        "Other Revenue",
      ).plus(chargeTotal).toFixed(2);
    }
    const bookingById = new Map(bookingRecords.map((booking) => [booking.id, booking]));
    const paymentSources: PaymentSource[] = relatedPayments.map((payment) => ({
      source: jsonToSourceRecord(payment.source_data),
      sourceSystem: payment.booking_id
        ? bookingById.get(payment.booking_id)?.source_system ?? payment.source_system
        : payment.source_system,
      bookingReference:
        payment.booking_reference ??
        (payment.booking_id ? bookingById.get(payment.booking_id)?.booking_reference : null),
      paymentMethod: payment.payment_method,
      amount: payment.direct_1.toFixed(2),
    }));
    const paymentBookingSelectors = paymentRecords.flatMap(
      (payment): Prisma.BookingWhereInput[] => {
      if (payment.booking_id) return [{ id: payment.booking_id }];
      const source = jsonToSourceRecord(payment.source_data);
      const bookingReference =
        payment.booking_reference ?? source.BookingReference ?? source["Booking Reference"] ?? "";
      return bookingReference.trim()
        ? [{ source_system: payment.source_system, booking_reference: bookingReference.trim() }]
        : [];
      },
    );
    const paymentBookings = paymentBookingSelectors.length
      ? await prisma.booking.findMany({
          where: { deleted_at: null, OR: paymentBookingSelectors },
          select: { id: true, source_system: true, booking_reference: true },
        })
      : [];
    const paymentBookingsById = new Map(paymentBookings.map((booking) => [booking.id, booking]));
    const paymentBookingsByReference = new Map(
      paymentBookings.map((booking) => [
        `${booking.source_system}\u0000${booking.booking_reference}`,
        booking,
      ]),
    );
    const pagePaymentSources: PaymentSource[] = paymentRecords.map((payment) => {
      const source = jsonToSourceRecord(payment.source_data);
      const linkedBooking =
        (payment.booking_id ? paymentBookingsById.get(payment.booking_id) : undefined) ??
        paymentBookingsByReference.get(
          `${payment.source_system}\u0000${(
            payment.booking_reference ??
            source.BookingReference ??
            source["Booking Reference"] ??
            ""
          ).trim()}`,
        );
      const bookingReference =
        payment.booking_reference ??
        source.BookingReference ??
        source["Booking Reference"] ??
        linkedBooking?.booking_reference ??
        "";
      if (bookingReference && !source["Booking Reference"]) {
        source["Booking Reference"] = bookingReference;
      }
      return {
        id: payment.id,
        bookingId: payment.booking_id ?? linkedBooking?.id ?? null,
        source,
      };
    });
    const stats = bookingStats[0];

    const properties = [
      ...new Set(
        [...bookingPropertyGroups, ...paymentPropertyGroups]
          .map((group) => group.property_name?.trim())
          .filter((property): property is string => Boolean(property)),
      ),
    ].sort((left, right) => left.localeCompare(right));

    return {
      bookings: buildBookingReportRows(bookingSources, paymentSources),
      paymentMethods: paymentMethodGroups.map(({ method }) => method),
      payments: buildPaymentReportRows(pagePaymentSources),
      properties,
      filters: { ...filters, bookingPage, paymentPage },
      bookingTotal,
      paymentTotal,
      bookingPageCount,
      paymentPageCount,
      summary: {
        revenue: stats?.revenue ?? "0.00",
        paid: stats?.paid ?? "0.00",
        outstanding: stats?.outstanding ?? "0.00",
        activeBookings: stats?.active_bookings ?? 0,
      },
      notice: "Live report data",
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return emptyResult(filters, "Database schema is not ready; no report data is being displayed.");
    }
    throw error;
  }
}
