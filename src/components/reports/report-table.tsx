"use client";

import {
  columnFilteringFeature,
  createCoreRowModel,
  createFilteredRowModel,
  createSortedRowModel,
  columnOrderingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnVisibilityState,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { ArrowDown, ArrowDownUp, ArrowUp, Bookmark, Check, ChevronDown, ChevronUp, Columns3, Filter, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { createTableView, getTableView, listTableViews } from "@/app/actions/table-views";
import { BookingRow } from "@/components/bookings/booking-row";
import { PaymentRow } from "@/components/payments/payment-row";
import { ReportTableRow } from "@/components/reports/report-table-row";
import type { ReportTableRowProps } from "@/components/reports/report-table-row";

export const reportTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  coreRowModel: createCoreRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});

type ReportTableProps<TData extends object> = {
  title: string;
  description: string;
  icon: ReactNode;
  rows: TData[];
  // TanStack uses a shared TValue slot for heterogeneous columns in useTable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<typeof reportTableFeatures, TData, any>[];
  pageSize?: number;
  rowKind?: "booking" | "payment";
  currentPage: number;
  totalRecords: number;
  pageCount: number;
  pageParam: "bookingPage" | "paymentPage";
  tableName: "BookingsReport" | "PaymentsReport";
  paginationParams: Record<string, string>;
  activeColumnFilters: Record<string, string[]>;
  onRowClick?: (row: TData) => void;
  getRowBookingReference?: (row: TData) => string | null;
};

export function ReportTable<TData extends object>({
  title,
  description,
  icon,
  rows,
  columns,
  pageSize = 20,
  rowKind,
  currentPage,
  totalRecords,
  pageCount,
  pageParam,
  tableName,
  paginationParams,
  activeColumnFilters,
  onRowClick,
  getRowBookingReference,
}: ReportTableProps<TData>) {
  const router = useRouter();
  const filterPrefix = rowKind === "payment" ? "pf." : "bf.";
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    Object.entries(activeColumnFilters).map(([id, value]) => ({ id, value })),
  );
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const updateColumnVisibility = useCallback((
    updater: ColumnVisibilityState | ((current: ColumnVisibilityState) => ColumnVisibilityState),
  ) => {
    setColumnVisibility((current) =>
      typeof updater === "function" ? updater(current) : updater,
    );
  }, []);
  function updateColumnFilters(updater: ColumnFiltersState | ((current: ColumnFiltersState) => ColumnFiltersState)) {
    const next = typeof updater === "function" ? updater(columnFilters) : updater;
    setColumnFilters(next);
    const params = new URLSearchParams(window.location.search);
    for (const key of [...params.keys()]) {
      if (key.startsWith(filterPrefix)) params.delete(key);
    }
    for (const filter of next) {
      if (Array.isArray(filter.value) && filter.value.length) {
        params.set(`${filterPrefix}${filter.id}`, JSON.stringify(filter.value));
      }
    }
    params.set(pageParam, "1");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }
  const table = useTable({
    features: reportTableFeatures,
    columns,
    data: rows,
    state: { columnFilters, columnOrder, columnVisibility, sorting },
    onColumnFiltersChange: updateColumnFilters,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: updateColumnVisibility,
    onSortingChange: setSorting,
  });
  const visibleRows = table.getRowModel().rows;
  const RowComponent: ComponentType<ReportTableRowProps> =
    rowKind === "booking"
      ? BookingRow
      : rowKind === "payment"
        ? PaymentRow
        : ReportTableRow;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em]">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SavedViewsMenu
            tableName={tableName}
            columnVisibility={columnVisibility}
            columnOrder={columnOrder}
            setColumnVisibility={updateColumnVisibility}
            setColumnOrder={setColumnOrder}
          />
          <ColumnVisibilityMenu
            table={table}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
          />
          <span className="rounded-full border border-border bg-muted px-2.5 py-1.5 text-foreground">
            {totalRecords} records
          </span>
          {columnFilters.length > 0 && (
            <button
              type="button"
              onClick={() => table.resetColumnFilters(true)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 font-medium text-primary hover:bg-primary/10"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-muted">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={`relative border-b border-r border-border px-3 py-2.5 font-semibold text-muted-foreground last:border-r-0 ${
                      header.column.id === "balance-status"
                        ? "w-[100px] min-w-[100px] max-w-[100px] whitespace-normal"
                        : header.column.id === "Booking Notes" || header.column.id === "Notes"
                          ? "w-[130px] max-w-[130px] whitespace-nowrap"
                          : "whitespace-nowrap"
                    }`}
                  >
                    {!header.isPlaceholder && (
                      <div className={`flex items-center gap-1.5 ${header.column.id === "balance-status" ? "flex-wrap" : ""}`}>
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={`inline-flex items-center gap-1.5 rounded px-0.5 py-1 text-left hover:text-primary ${
                            header.column.id === "balance-status" ? "max-w-[66px] whitespace-normal leading-tight" : ""
                          }`}
                          aria-label={`Sort by ${header.column.id}`}
                        >
                          <table.FlexRender header={header} />
                          {header.column.getIsSorted() === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-primary" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <ArrowDownUp className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                        <ColumnFilterMenu
                          column={header.column}
                          values={table.getCoreRowModel().rows.map((row) => String(row.getValue(header.column.id) ?? ""))}
                        />
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row, rowIndex) => (
                <RowComponent
                  key={row.id}
                  rowId={row.id}
                  index={rowIndex}
                  onClick={getRowBookingReference?.(row.original) && onRowClick
                    ? () => onRowClick(row.original)
                    : undefined}
                  ariaLabel={
                    getRowBookingReference?.(row.original)
                      ? `Open booking card for ${getRowBookingReference(row.original)}`
                      : undefined
                  }
                  cells={row.getVisibleCells().map((cell) => ({
                    id: cell.id,
                    columnId: cell.column.id,
                    content: table.FlexRender({ cell }),
                  }))}
                />
              ))
            ) : (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No records match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} records
          </p>
          <nav className="flex items-center gap-1" aria-label={`${title} pagination`}>
            <PaginationLink
              currentPage={currentPage}
              page={currentPage - 1}
              pageCount={pageCount}
              pageParam={pageParam}
              params={paginationParams}
              label="Previous"
            />
            {paginationPages(currentPage, pageCount).map((page, index) =>
              page === null ? (
                <span key={`ellipsis-${index}`} className="px-1.5 text-xs text-muted-foreground">
                  …
                </span>
              ) : (
                <PaginationLink
                  key={page}
                  currentPage={currentPage}
                  page={page}
                  pageCount={pageCount}
                  pageParam={pageParam}
                  params={paginationParams}
                  label={String(page)}
                />
              ),
            )}
            <PaginationLink
              currentPage={currentPage}
              page={currentPage + 1}
              pageCount={pageCount}
              pageParam={pageParam}
              params={paginationParams}
              label="Next"
            />
          </nav>
        </div>
      )}
    </section>
  );
}

type SavedView = {
  id: string;
  name: string;
  tableName: string;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
};

function SavedViewsMenu({
  tableName,
  columnVisibility,
  columnOrder,
  setColumnVisibility,
  setColumnOrder,
}: {
  tableName: "BookingsReport" | "PaymentsReport";
  columnVisibility: ColumnVisibilityState;
  columnOrder: ColumnOrderState;
  setColumnVisibility: (
    updater: ColumnVisibilityState | ((current: ColumnVisibilityState) => ColumnVisibilityState),
  ) => void;
  setColumnOrder: Dispatch<SetStateAction<ColumnOrderState>>;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const storageKey = `active_view_${tableName}`;

  const notify = useCallback((message: string, isError = false) => {
    setNotice(message);
    setNoticeIsError(isError);
    window.setTimeout(() => {
      setNotice((current) => (current === message ? "" : current));
    }, 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreActiveView() {
      setLoading(true);
      try {
        const result = await listTableViews(tableName);
        if (!result.ok) throw new Error(result.error);
        if (cancelled) return;
        setViews(result.views);

        let savedId: string | null;
        try {
          savedId = window.localStorage.getItem(storageKey);
        } catch {
          notify("Saved views are available, but browser storage could not be accessed.", true);
          return;
        }
        if (!savedId) return;
        if (!result.views.some((view) => view.id === savedId)) {
          window.localStorage.removeItem(storageKey);
          return;
        }

        const activeResult = await getTableView(savedId, tableName);
        if (cancelled) return;
        if (!activeResult.ok) {
          window.localStorage.removeItem(storageKey);
          notify(activeResult.error, true);
          return;
        }
        setColumnVisibility(activeResult.view.columnVisibility);
        setColumnOrder(activeResult.view.columnOrder);
        setActiveViewId(activeResult.view.id);
      } catch (error) {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : "Could not load saved views.", true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restoreActiveView();
    return () => {
      cancelled = true;
    };
  }, [notify, setColumnOrder, setColumnVisibility, storageKey, tableName]);

  async function applyView(id: string) {
    try {
      const result = await getTableView(id, tableName);
      if (!result.ok) throw new Error(result.error);
      setColumnVisibility(result.view.columnVisibility);
      setColumnOrder(result.view.columnOrder);
      setActiveViewId(result.view.id);
      setMenuOpen(false);
      try {
        window.localStorage.setItem(storageKey, result.view.id);
        notify(`Applied "${result.view.name}".`);
      } catch {
        notify(`Applied "${result.view.name}", but this browser could not remember it as active.`, true);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not apply this saved view.", true);
    }
  }

  function applyDefaultView() {
    setColumnVisibility({});
    setColumnOrder([]);
    setActiveViewId(null);
    setMenuOpen(false);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      notify("Default view applied, but this browser could not forget the active saved view.", true);
      return;
    }
    notify("Default view applied.");
  }

  async function saveView(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await createTableView({
        name: viewName,
        tableName,
        columnVisibility,
        columnOrder,
      });
      if (!result.ok) throw new Error(result.error);
      const savedView: SavedView = {
        ...result.view,
        columnVisibility,
        columnOrder,
      };
      setViews((current) => [...current, savedView].sort((left, right) => left.name.localeCompare(right.name)));
      setActiveViewId(savedView.id);
      setViewName("");
      setDialogOpen(false);
      try {
        window.localStorage.setItem(storageKey, savedView.id);
        notify(`Saved "${savedView.name}".`);
      } catch {
        notify(`Saved "${savedView.name}", but this browser could not remember it as active.`, true);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save this view.", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground hover:bg-muted"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Saved Views
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close saved views menu"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {tableName === "BookingsReport" ? "Bookings" : "Payments"} views
              </p>
              <button
                type="button"
                onClick={applyDefaultView}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs hover:bg-muted"
              >
                <span>Default View</span>
                {!activeViewId && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
              {loading ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Loading saved views...</p>
              ) : views.length ? (
                views.map((view) => (
                  <button
                    type="button"
                    key={view.id}
                    onClick={() => void applyView(view.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs hover:bg-muted"
                  >
                    <span className="truncate">{view.name}</span>
                    {activeViewId === view.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                ))
              ) : (
                <p className="px-2 py-2 text-xs text-muted-foreground">No saved views yet.</p>
              )}
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setDialogOpen(true);
                }}
                className="w-full rounded-md px-2 py-2 text-left text-xs font-medium text-primary hover:bg-primary/10"
              >
                Save Current View As...
              </button>
            </div>
          </>
        )}
      </div>
      {dialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={`save-view-title-${tableName}`}
            onSubmit={(event) => void saveView(event)}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <h2 id={`save-view-title-${tableName}`} className="text-base font-semibold">
              Save current view
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Name this {tableName === "BookingsReport" ? "bookings" : "payments"} table layout.
            </p>
            <label className="mt-4 grid gap-1.5 text-sm font-medium">
              View name
              <input
                autoFocus
                required
                maxLength={80}
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                placeholder="e.g. My finance view"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className="h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !viewName.trim()}
                className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save view"}
              </button>
            </div>
          </form>
        </div>
      )}
      {notice && (
        <div
          role={noticeIsError ? "alert" : "status"}
          className={`fixed bottom-5 right-5 z-[110] max-w-sm rounded-xl border bg-card px-4 py-3 text-sm text-card-foreground shadow-xl ${
            noticeIsError ? "border-danger/40" : "border-success/40"
          }`}
        >
          {notice}
        </div>
      )}
    </>
  );
}

function paginationPages(currentPage: number, pageCount: number) {
  const pages = new Set([1, pageCount]);
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(pageCount, currentPage + 2); page++) {
    pages.add(page);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    if (index === 0) return [page];
    return [sorted[index - 1] + 1 < page ? null : undefined, page].filter(
      (entry): entry is number | null => entry !== undefined,
    );
  });
}

function PaginationLink({
  currentPage,
  page,
  pageCount,
  pageParam,
  params,
  label,
}: {
  currentPage: number;
  page: number;
  pageCount: number;
  pageParam: "bookingPage" | "paymentPage";
  params: Record<string, string>;
  label: string;
}) {
  const disabled = page < 1 || page > pageCount;
  const query = new URLSearchParams(params);
  query.set(pageParam, String(Math.max(1, Math.min(pageCount, page))));
  const href = `/?${query.toString()}`;
  const selected = page === currentPage;

  if (disabled) {
    return (
      <span className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground opacity-50" aria-disabled="true">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        selected
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </Link>
  );
}

type FilterableColumn = {
  id: string;
  getFilterValue: () => unknown;
  getIsFiltered: () => boolean;
  setFilterValue: (value: unknown) => void;
  clearSorting: () => void;
  toggleSorting: (desc?: boolean) => void;
};

type VisibilityTable = {
  getAllLeafColumns: () => Array<{
    id: string;
    getCanHide: () => boolean;
    getIsVisible: () => boolean;
    getToggleVisibilityHandler: () => (event: React.ChangeEvent<HTMLInputElement>) => void;
    getIndex: () => number;
  }>;
  getIsAllColumnsVisible: () => boolean;
  toggleAllColumnsVisible: (value: boolean) => void;
}

function ColumnVisibilityMenu({
  table,
  columnOrder,
  setColumnOrder,
}: {
  table: VisibilityTable;
  columnOrder: ColumnOrderState;
  setColumnOrder: (updater: (order: ColumnOrderState) => ColumnOrderState) => void;
}) {
  const [open, setOpen] = useState(false);
  const columns = table.getAllLeafColumns().filter((column) => column.getCanHide());

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground hover:bg-muted"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columns
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close column visibility menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-40 max-h-[min(70vh,32rem)] w-64 overflow-y-auto rounded-xl border border-border bg-popover p-2 text-left text-popover-foreground shadow-xl">
            <button
              type="button"
              onClick={() => table.toggleAllColumnsVisible(!table.getIsAllColumnsVisible())}
              className="flex w-full items-center gap-2 rounded-md border-b border-border px-2 py-2 text-left text-xs font-semibold hover:bg-muted"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${table.getIsAllColumnsVisible() ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
                {table.getIsAllColumnsVisible() && <Check className="h-3 w-3" />}
              </span>
              Toggle all columns
            </button>
            {columns.map((column) => {
              const currentOrder = columnOrder.length
                ? columnOrder
                : table.getAllLeafColumns().map((entry) => entry.id);
              const orderedIndex = currentOrder.indexOf(column.id);
              return (
                <div
                  key={column.id}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="truncate">{column.id}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Move ${column.id} up`}
                    disabled={orderedIndex <= 0}
                    onClick={() =>
                      setColumnOrder((order) => {
                        const next = order.length ? [...order] : currentOrder;
                        const position = next.indexOf(column.id);
                        if (position <= 0) return next;
                        [next[position - 1], next[position]] = [next[position], next[position - 1]];
                        return next;
                      })
                    }
                    className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${column.id} down`}
                    disabled={orderedIndex < 0 || orderedIndex >= currentOrder.length - 1}
                    onClick={() =>
                      setColumnOrder((order) => {
                        const next = order.length ? [...order] : currentOrder;
                        const position = next.indexOf(column.id);
                        if (position < 0 || position >= next.length - 1) return next;
                        [next[position + 1], next[position]] = [next[position], next[position + 1]];
                        return next;
                      })
                    }
                    className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ColumnFilterMenu({
  column,
  values,
}: {
  column: FilterableColumn;
  values: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const initialFilter = column.getFilterValue();
  const [searchAll, setSearchAll] = useState(
    Array.isArray(initialFilter)
      ? (initialFilter.find((value) => typeof value === "string" && value.startsWith("~")) as string | undefined)?.slice(1) ?? ""
      : "",
  );
  const uniqueValues = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const excluded = Array.isArray(column.getFilterValue())
    ? (column.getFilterValue() as string[])
        .filter((value) => value.startsWith("!"))
        .map((value) => value.slice(1))
    : [];
  const selected = uniqueValues.filter((value) => !excluded.includes(value));
  const filteredValues = uniqueValues.filter((value) =>
    value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  function toggleValue(value: string) {
    const nextExcluded = selected.includes(value)
      ? [...excluded, value]
      : excluded.filter((item) => item !== value);
    column.setFilterValue(nextExcluded.length ? nextExcluded.map((item) => `!${item}`) : undefined);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Filter ${column.id}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition ${column.getIsFiltered() ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
      >
        {column.getIsFiltered() ? <Filter className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close filter menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-9 z-40 w-64 rounded-xl border border-border bg-popover p-3 text-left font-normal text-popover-foreground shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold">Filter: {column.id}</p>
              <button
                type="button"
                onClick={() => column.setFilterValue(undefined)}
                className="shrink-0 text-[11px] font-medium text-primary hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search values"
                className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <form
              className="mb-2 flex gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                column.setFilterValue(searchAll.trim() ? [`~${searchAll.trim()}`] : undefined);
              }}
            >
              <input
                value={searchAll}
                onChange={(event) => setSearchAll(event.target.value)}
                placeholder="Search all records"
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="submit" className="rounded-lg bg-primary px-2 text-[11px] font-semibold text-primary-foreground">
                Apply
              </button>
            </form>
            <div className="mb-2 flex gap-2 border-b border-border pb-2">
              <button
                type="button"
                onClick={() => column.setFilterValue(undefined)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => column.setFilterValue(uniqueValues.map((value) => `!${value}`))}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Deselect visible values
              </button>
            </div>
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {filteredValues.map((value) => {
                const checked = selected.includes(value);
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => toggleValue(value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{value || "(blank)"}</span>
                  </button>
                );
              })}
              {!filteredValues.length && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">No values found.</p>
              )}
            </div>
            <div className="mt-2 flex border-t border-border pt-2">
              <button
                type="button"
                onClick={() => {
                  column.clearSorting();
                  setOpen(false);
                }}
                className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                Reset sort
              </button>
              <button
                type="button"
                onClick={() => {
                  column.toggleSorting(false);
                  setOpen(false);
                }}
                className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                Sort A → Z
              </button>
              <button
                type="button"
                onClick={() => {
                  column.toggleSorting(true);
                  setOpen(false);
                }}
                className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                Sort Z → A
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
