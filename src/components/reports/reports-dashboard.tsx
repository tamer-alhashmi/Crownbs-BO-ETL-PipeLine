"use client";

import Decimal from "decimal.js";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileSpreadsheet,
  Menu,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
  createColumnHelper,
  type Row,
  type RowData,
  type TableFeatures,
} from "@tanstack/react-table";
import { StatusBadge } from "@/components/reports/status-badge";
import { SummaryCard } from "@/components/reports/summary-card";
import { ReportTable, reportTableFeatures } from "@/components/reports/report-table";
import { GlobalFilterBar } from "@/components/reports/global-filter-bar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BookingWorkspace, requestBookingCardOpen } from "@/components/bookings/booking-workspace";
import {
  BOOKING_HEADERS,
  PAYMENT_HEADERS,
} from "@/lib/reports/aggregation";
import type { BookingReportRow, PaymentReportRow } from "@/lib/reports/aggregation";
import type { ReportFilters } from "@/lib/reports/data";

type ReportsDashboardProps = {
  user: { email: string; fullName: string | null; avatarUrl: string | null };
  bookings: BookingReportRow[];
  payments: PaymentReportRow[];
  paymentMethods: string[];
  properties: string[];
  filters: ReportFilters;
  bookingTotal: number;
  paymentTotal: number;
  bookingPageCount: number;
  paymentPageCount: number;
  summary: { revenue: string; paid: string; outstanding: string; activeBookings: number };
  dataNotice?: string;
};

const currency = (value: string) => `£${new Decimal(value).toFixed(2)}`;

function displayMoney(value: string, currencyCode = "GBP") {
  const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };
  const symbol = symbols[currencyCode.toUpperCase()] ?? `${currencyCode} `;
  return `${symbol}${new Decimal(value || "0").toFixed(2)}`;
}

function multiSelectFilter<TFeatures extends TableFeatures, TData extends RowData>(
  row: Row<TFeatures, TData>,
  columnId: string,
  filterValue: unknown,
) {
  if (!Array.isArray(filterValue)) return true;
  const value = String(row.getValue(columnId) ?? "");
  const excludedValues = filterValue
    .filter((filter): filter is string => typeof filter === "string" && filter.startsWith("!"))
    .map((filter) => filter.slice(1));
  if (excludedValues.length) return !excludedValues.includes(value);
  return filterValue.some((filter) =>
    typeof filter === "string" && filter.startsWith("~")
      ? value.toLocaleLowerCase().includes(filter.slice(1).toLocaleLowerCase())
      : filter === value,
  );
}

function decimalSort<TFeatures extends TableFeatures, TData extends RowData>(
  rowA: Row<TFeatures, TData>,
  rowB: Row<TFeatures, TData>,
  columnId: string,
) {
  const amount = (value: unknown) => new Decimal(String(value ?? "").trim() || "0");
  return amount(rowA.getValue(columnId)).comparedTo(amount(rowB.getValue(columnId)));
}

const bookingColumn = createColumnHelper<typeof reportTableFeatures, BookingReportRow>();
const paymentColumn = createColumnHelper<typeof reportTableFeatures, PaymentReportRow>();
const bookingMoneyHeaders = new Set([
  "Total Revenue",
  "Paid Amount",
  "Room/Unit Revenue",
  "Other Revenue",
  "Promo Discount",
]);
const paymentMoneyHeaders = new Set(["SettledAmount", "Card1", "Cash1", "Vouchers1", "OTAPrepaid1", "Eviivo", "OnAccount", "Direct1"]);

const bookingSourceColumns = BOOKING_HEADERS.flatMap((header) => {
  if (header === "Guest Last Name") return [];
  if (header === "Guest First Name") {
    return [
      bookingColumn.accessor(
        (row) =>
          [row.source["Guest First Name"], row.source["Guest Last Name"]]
            .map((name) => name?.trim() ?? "")
            .filter(Boolean)
            .join(" "),
        {
          id: "Guest Name",
          header: "Guest Name",
          filterFn: multiSelectFilter,
          sortFn: (rowA, rowB, columnId) =>
            String(rowA.getValue(columnId) ?? "").localeCompare(
              String(rowB.getValue(columnId) ?? ""),
            ),
        },
      ),
    ];
  }
  return [
    bookingColumn.accessor((row) => row.source[header] ?? "", {
      id: header,
      header,
      filterFn: multiSelectFilter,
      ...(bookingMoneyHeaders.has(header) ? { sortFn: decimalSort } : {}),
      cell: (info) => {
        const value = info.getValue();
        if (header === "Booking Status") return <StatusBadge status={value || "Unknown"} />;
        if (!bookingMoneyHeaders.has(header) || !value.trim()) return value || "—";
        return (
          <span className={header === "Total Revenue" ? "font-semibold text-success" : ""}>
            {displayMoney(value, info.row.original.source.Currency)}
          </span>
        );
      },
    }),
  ];
});

function buildBookingColumns(paymentMethods: string[]) {
  return [
    ...bookingSourceColumns,
    bookingColumn.accessor((row) => row.internalCompany, {
      id: "internal-company",
      header: "Crown BS Company",
      filterFn: multiSelectFilter,
    }),
    ...paymentMethods.map((method) =>
      bookingColumn.accessor((row) => row.paymentTotals[method] ?? "0.00", {
        id: `payment-method:${encodeURIComponent(method)}`,
        header: method,
        filterFn: multiSelectFilter,
        sortFn: decimalSort,
        cell: (info) => displayMoney(info.getValue(), info.row.original.source.Currency),
      }),
    ),
    bookingColumn.accessor((row) => row.transactionTotal, {
      id: "transaction-total",
      header: "Payment Total",
      filterFn: multiSelectFilter,
      sortFn: decimalSort,
      cell: (info) => (
        <span className="font-semibold text-success">
          {displayMoney(info.getValue(), info.row.original.source.Currency)}
        </span>
      ),
    }),
    bookingColumn.accessor((row) => row.dueAmount, {
      id: "due-amount",
      header: "Due Amount",
      filterFn: multiSelectFilter,
      sortFn: decimalSort,
      cell: (info) => (
        <strong className={new Decimal(info.getValue()).isZero() ? "text-success" : "text-warning"}>
          {displayMoney(info.getValue(), info.row.original.source.Currency)}
        </strong>
      ),
    }),
    bookingColumn.accessor((row) => row.balanceStatus, {
      id: "balance-status",
      header: "Payment Status",
      filterFn: multiSelectFilter,
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
  ];
}

const paymentColumns = PAYMENT_HEADERS.map((header) =>
  paymentColumn.accessor((row) => row.source[header] ?? "", {
    id: header,
    header,
    filterFn: multiSelectFilter,
    ...(paymentMoneyHeaders.has(header) ? { sortFn: decimalSort } : {}),
    cell: (info) => {
      const value = info.getValue();
      if (!paymentMoneyHeaders.has(header) || !value.trim()) return value || "—";
      return <strong className="font-semibold text-success">{displayMoney(value)}</strong>;
    },
  }),
);

export function ReportsDashboard({
  user,
  bookings,
  payments,
  paymentMethods,
  properties,
  filters,
  bookingTotal,
  paymentTotal,
  bookingPageCount,
  paymentPageCount,
  summary,
  dataNotice,
}: ReportsDashboardProps) {
  const firstName = user.fullName?.trim().split(/\s+/)[0] || "there";
  const paginationParams = {
    from: filters.from,
    to: filters.to,
    ...(filters.property ? { property: filters.property } : {}),
    bookingPage: String(filters.bookingPage),
    paymentPage: String(filters.paymentPage),
    ...Object.fromEntries(
      Object.entries(filters.bookingColumnFilters).map(([id, values]) => [`bf.${id}`, JSON.stringify(values)]),
    ),
    ...Object.fromEntries(
      Object.entries(filters.paymentColumnFilters).map(([id, values]) => [`pf.${id}`, JSON.stringify(values)]),
    ),
  };
  const bookingColumns = buildBookingColumns(paymentMethods);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <AppSidebar active="reports" />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border bg-card/95 px-4 text-card-foreground backdrop-blur sm:px-7 lg:px-9">
            <div className="flex items-center gap-3">
              <div className="lg:hidden"><Brand compact /></div>
              <Link href="/settings" className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden">
                Settings
              </Link>
              <div className="hidden lg:block">
                <p className="text-[11px] font-medium text-muted-foreground">Crown Business Solution / Reports</p>
                <p className="mt-0.5 text-sm font-semibold">Crown Business Solution</p>
              </div>
              <button type="button" aria-label="Open menu" className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden">
                <Menu className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <BookingWorkspace />
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div className="hidden text-right sm:block">
                <p className="max-w-40 truncate text-xs font-semibold">{user.fullName || user.email}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Team member</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-border">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={`${user.fullName || user.email} profile picture`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (user.fullName || user.email).slice(0, 1).toUpperCase()
                )}
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] px-4 pb-12 pt-7 sm:px-7 lg:px-9">
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Reports overview</p>
                <h1 className="text-[27px] font-semibold tracking-[-0.04em] sm:text-[32px]">
                  Good to see you, {firstName}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Booking and payment activity across your property portfolio.
                </p>
              </div>
            </div>
            {dataNotice && (
              <p className="mb-5 rounded-lg border border-border bg-card/70 px-3.5 py-2.5 text-xs text-muted-foreground">
                {dataNotice}
              </p>
            )}

            <GlobalFilterBar
              key={`${filters.from}-${filters.to}-${filters.property}`}
              from={filters.from}
              to={filters.to}
              property={filters.property}
              properties={properties}
            />
            <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Booking revenue"
                value={currency(summary.revenue)}
                change="Room rate + actual additions"
                icon={<CircleDollarSign className="h-[18px] w-[18px]" />}
                accent="green"
              />
              <SummaryCard
                label="Payments received"
                value={currency(summary.paid)}
                change="Sum of linked payment transactions"
                icon={<CreditCard className="h-[18px] w-[18px]" />}
                accent="blue"
              />
              <SummaryCard
                label="Outstanding balance"
                value={currency(summary.outstanding)}
                change="Revenue less linked payments"
                icon={<ArrowUpRight className="h-[18px] w-[18px]" />}
                accent="amber"
              />
              <SummaryCard
                label="Active bookings"
                value={String(summary.activeBookings)}
                change="Non-canceled check-ins in the selected range"
                icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
                accent="violet"
              />
            </div>

            <div id="reports" className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.025em]">Reports</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Column filters search the full server-side result set; date, hotel, and pagination are server-side.
                </p>
              </div>
              <div className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary sm:flex">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Spreadsheet view
              </div>
            </div>

            <div className="space-y-5">
              <ReportTable
                key={`bookings-${filters.from}-${filters.to}-${filters.property}-${filters.bookingPage}-${JSON.stringify(filters.bookingColumnFilters)}`}
                title="Bookings report"
                description="Payment methods, transaction totals, due, and payment status are aggregated from linked Payments"
                icon={<FileSpreadsheet className="h-[18px] w-[18px]" />}
                rows={bookings}
                columns={bookingColumns}
                pageSize={20}
                rowKind="booking"
                getRowBookingReference={(row) => row.source["Booking Reference"]?.trim() || null}
                onRowClick={(row) => {
                  const bookingReference = row.source["Booking Reference"]?.trim();
                  if (bookingReference) {
                    requestBookingCardOpen({ bookingId: row.id, bookingReference });
                  }
                }}
                currentPage={filters.bookingPage}
                totalRecords={bookingTotal}
                pageCount={bookingPageCount}
                pageParam="bookingPage"
                tableName="BookingsReport"
                paginationParams={paginationParams}
                activeColumnFilters={filters.bookingColumnFilters}
              />
              <ReportTable
                key={`payments-${filters.from}-${filters.to}-${filters.property}-${filters.paymentPage}-${JSON.stringify(filters.paymentColumnFilters)}`}
                title="Payments report"
                description="Transaction-level payment records and source amounts"
                icon={<CreditCard className="h-[18px] w-[18px]" />}
                rows={payments}
                columns={paymentColumns}
                rowKind="payment"
                getRowBookingReference={(row) =>
                  row.bookingId ? row.source["Booking Reference"]?.trim() || null : null
                }
                onRowClick={(row) => {
                  const bookingReference = row.source["Booking Reference"]?.trim();
                  if (row.bookingId && bookingReference) {
                    requestBookingCardOpen({ bookingId: row.bookingId, bookingReference });
                  }
                }}
                pageSize={20}
                currentPage={filters.paymentPage}
                totalRecords={paymentTotal}
                pageCount={paymentPageCount}
                pageParam="paymentPage"
                tableName="PaymentsReport"
                paginationParams={paginationParams}
                activeColumnFilters={filters.paymentColumnFilters}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Financial values are aggregated using decimal arithmetic.
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownToLine className="h-3.5 w-3.5" />
                {dataNotice?.startsWith("Live") ? "Live imported report data" : "Preview data"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <FileSpreadsheet className="h-[18px] w-[18px]" />
      </div>
      {!compact && (
        <div>
          <p className="text-sm font-semibold tracking-[-0.015em] text-foreground">Crown Business Solution</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Backoffice</p>
        </div>
      )}
    </div>
  );
}
