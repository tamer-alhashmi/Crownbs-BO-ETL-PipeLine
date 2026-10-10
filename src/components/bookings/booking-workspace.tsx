"use client";

import {
  addBookingCharge,
  deleteBookingCharge,
  loadBookingCard,
  processBookingPayment,
  saveBookingGuestDetails,
  updateBookingCharge,
  updateDirectBookingTotal,
  updateBookingWorkflow,
} from "@/app/actions/booking-card";
import type { BookingCardData } from "@/lib/bookings/card-data";
import { ActionSummaryModal } from "@/components/ui/ActionSummaryModal";
import { useFormDiff, type FormChange } from "@/lib/forms/use-form-diff";
import {
  CalendarDays,
  Check,
  CircleAlert,
  CreditCard,
  Download,
  FileText,
  Mail,
  LoaderCircle,
  MinusCircle,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Decimal from "decimal.js";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type SearchResult = {
  id: string;
  bookingReference: string;
  otaReference: string;
  property: string;
  arrivalDate: string;
  currency: string;
  guestName: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
};

type Toast = { id: number; message: string; error?: boolean };
type BookingOpenRequest = { bookingId: string; bookingReference: string };
type TabName = "Summary" | "Cards" | "Guest" | "Charges & Deductions" | "Payments" | "Bill" | "Comms";
const tabs: TabName[] = ["Summary", "Cards", "Guest", "Charges & Deductions", "Payments", "Bill", "Comms"];
const methods = ["Cash", "Card", "Bank transfer", "Prepaid", "On account", "PayPal", "External Card"] as const;
const relatingOptions = ["Damage Deposit", "Early check-in", "Early check-out", "Room rate"] as const;

const formatMoney = (amount: string, currency: string) => {
  const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };
  const raw = String(amount ?? "").trim();
  const normalized = raw.replace(/[£$€,\s]/g, "");
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return raw || "—";
  return `${symbols[currency] ?? `${currency} `}${new Decimal(normalized).toFixed(2)}`;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function netChargeTotal(booking: BookingCardData) {
  return booking.charges.reduce(
    (sum, charge) =>
      sum.plus(
        new Decimal(charge.amount)
          .times(charge.quantity)
          .times(charge.kind === "DEDUCTION" ? -1 : 1)
          .toDecimalPlaces(2),
      ),
    new Decimal(0),
  );
}

function bookingDayLines(booking: BookingCardData) {
  const nightCount = Number(booking.nights);
  const start = new Date(`${booking.arrivalDate}T00:00:00.000Z`);
  if (!Number.isInteger(nightCount) || nightCount < 1 || nightCount > 366 || Number.isNaN(start.getTime())) {
    return [];
  }
  const baseTotal = new Decimal(booking.totalAmount).minus(netChargeTotal(booking));
  const totalCents = baseTotal.times(100);
  const regularCents = totalCents.dividedToIntegerBy(nightCount);
  const lines: Array<{ date: string; amount: string }> = [];
  for (let index = 0; index < nightCount; index++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const amount = index === nightCount - 1
      ? totalCents.minus(regularCents.times(nightCount - 1)).dividedBy(100)
      : regularCents.dividedBy(100);
    lines.push({ date: date.toISOString().slice(0, 10), amount: amount.toFixed(2) });
  }
  return lines;
}

function printBookingDocument(booking: BookingCardData, title: "Statement" | "Invoice", period: "day-by-day" | "full-period") {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("The browser blocked the print window. Allow pop-ups and try again.");
  }
  printWindow.opener = null;
  printWindow.addEventListener("load", () => printWindow.print(), { once: true });
  const lines = booking.charges.map((charge) => {
    const amount = new Decimal(charge.amount).times(charge.quantity).times(charge.kind === "DEDUCTION" ? -1 : 1);
    return `<tr><td>${escapeHtml(charge.description)}</td><td>${escapeHtml(charge.quantity)}</td><td>${escapeHtml(formatMoney(charge.amount, booking.currency))}</td><td>${escapeHtml(formatMoney(amount.toFixed(2), booking.currency))}</td></tr>`;
  }).join("");
  const baseLines = period === "day-by-day"
    ? bookingDayLines(booking).map((line) => `<tr><td>Room charge · ${escapeHtml(line.date)}</td><td>1 night</td><td>—</td><td>${escapeHtml(formatMoney(line.amount, booking.currency))}</td></tr>`).join("")
    : `<tr><td>Room and booking total</td><td>1</td><td>—</td><td>${escapeHtml(formatMoney(new Decimal(booking.totalAmount).minus(netChargeTotal(booking)).toFixed(2), booking.currency))}</td></tr>`;
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} ${escapeHtml(booking.bookingReference)}</title><style>body{font:14px Arial,sans-serif;color:#18212f;margin:40px}h1{margin-bottom:4px}p{color:#566174}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #d9dee7;text-align:left}th:last-child,td:last-child{text-align:right}.total{margin-top:24px;text-align:right;font-size:18px;font-weight:bold}@media print{body{margin:15mm}}</style></head><body><h1>${title}</h1><p>${escapeHtml(booking.guest.name)} · ${escapeHtml(booking.bookingReference)} · ${escapeHtml(booking.property)}</p><p>Stay: ${escapeHtml(booking.arrivalDate)} – ${escapeHtml(booking.departureDate)} · OTA Ref: ${escapeHtml(booking.otaReference || "—")}</p><table><thead><tr><th>Description</th><th>Quantity</th><th>Unit amount</th><th>Total</th></tr></thead><tbody>${baseLines}${lines}</tbody></table><p class="total">Total: ${escapeHtml(formatMoney(booking.totalAmount, booking.currency))}<br>Paid: ${escapeHtml(formatMoney(booking.paidAmount, booking.currency))} · Balance: ${escapeHtml(formatMoney(booking.dueAmount, booking.currency))}</p></body></html>`);
  printWindow.document.close();
}

const bookingCardOpenEvent = "booking-card:open";

export function requestBookingCardOpen(request: BookingOpenRequest) {
  window.dispatchEvent(new CustomEvent(bookingCardOpenEvent, { detail: request }));
}

export function BookingWorkspace() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/bookings/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const body: { results?: SearchResult[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(body.error || "Booking search failed.");
        setResults(body.results ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSearchError(error instanceof Error ? error.message : "Booking search failed.");
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function notify(message: string, error = false) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, error }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }

  function openBooking(id: string) {
    setOpenIds((current) => (current.includes(id) ? current : [...current, id]));
  }

  useEffect(() => {
    function handleOpenRequest(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const request = event.detail as Partial<BookingOpenRequest> | null;
      if (
        !request ||
        typeof request.bookingId !== "string" ||
        !request.bookingId ||
        typeof request.bookingReference !== "string" ||
        !request.bookingReference.trim()
      ) {
        return;
      }
      setOpenIds((current) =>
        current.includes(request.bookingId!) ? current : [...current, request.bookingId!],
      );
    }

    window.addEventListener(bookingCardOpenEvent, handleOpenRequest);
    return () => window.removeEventListener(bookingCardOpenEvent, handleOpenRequest);
  }, []);

  return (
    <>
      <div className="relative hidden w-full max-w-[380px] md:block">
        <label htmlFor="global-booking-search" className="sr-only">
          Search bookings by guest name, booking reference, or OTA reference
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="global-booking-search"
          value={query}
          onFocus={() => setSearchOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults([]);
            setSearching(false);
            setSearchError("");
            setSearchOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearchOpen(false);
          }}
          placeholder="Search guests or booking refs..."
          className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-xs text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear booking search"
            onClick={() => {
              setQuery("");
              setSearchOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {searchOpen && query.trim().length >= 2 && (
          <>
            <button
              type="button"
              aria-label="Close search results"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setSearchOpen(false)}
            />
            <div className="absolute left-0 right-0 top-12 z-40 max-h-[min(70vh,32rem)] overflow-y-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
              {searching && (
                <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Searching bookings...
                </p>
              )}
              {!searching && searchError && (
                <p role="alert" className="px-3 py-3 text-xs text-danger">{searchError}</p>
              )}
              {!searching && !searchError && results.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground">No matching bookings.</p>
              )}
              {!searching && results.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => openBooking(booking.id)}
                  className="flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition hover:bg-muted"
                >
                  <span className="flex w-full items-center justify-between gap-3 text-xs font-semibold">
                    <span className="truncate">{booking.guestName || "(Guest name unavailable)"}</span>
                    <span className="shrink-0 text-primary">{booking.bookingReference}</span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {booking.property}
                    {booking.otaReference && <span>OTA: {booking.otaReference}</span>}
                    {booking.arrivalDate && <span>Check-in: {booking.arrivalDate}</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Total {formatMoney(booking.totalAmount, booking.currency)} · Due {formatMoney(booking.dueAmount, booking.currency)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div aria-live="polite" className="sr-only">
        {toasts.map((toast) => toast.message).join(" ")}
      </div>
      {mounted && createPortal(
        <>
          {openIds.length > 0 && (
            <div className="fixed inset-0 z-[70] flex justify-end bg-black/35">
              <div className="flex h-full max-w-full flex-row-reverse overflow-x-auto">
                {openIds.map((id) => (
                  <BookingCardPanel
                    key={id}
                    bookingId={id}
                    onClose={() => setOpenIds((current) => current.filter((entry) => entry !== id))}
                    onSwitchBooking={(nextId) =>
                      setOpenIds((current) =>
                        current.includes(nextId)
                          ? current.filter((entry) => entry !== id)
                          : current.map((entry) => entry === id ? nextId : entry),
                      )
                    }
                    notify={notify}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role={toast.error ? "alert" : "status"}
                className={`pointer-events-auto flex items-start gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-card-foreground shadow-xl ${
                  toast.error ? "border-danger/40" : "border-success/40"
                }`}
              >
                {toast.error ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                )}
                <span>{toast.message}</span>
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
      <div className="md:hidden">
        <BookingSearchCompact onOpen={openBooking} />
      </div>
    </>
  );
}

function BookingSearchCompact({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/bookings/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        const body: { results?: SearchResult[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(body.error || "Booking search failed.");
        setError("");
        setResults(body.results ?? []);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Booking search failed.");
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="absolute left-0 right-0 top-[68px] z-20 border-b border-border bg-card p-3 md:hidden">
      <label htmlFor="global-booking-search-mobile" className="sr-only">Search bookings</label>
      <input
        id="global-booking-search-mobile"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setResults([]);
          setError("");
        }}
        placeholder="Search guests or booking refs..."
        className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {query.trim().length >= 2 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1">
          {error && <p role="alert" className="p-2 text-xs text-danger">{error}</p>}
          {!error && results.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => onOpen(booking.id)}
              className="block w-full rounded-md p-2 text-left text-xs hover:bg-muted"
            >
              <span className="font-semibold">{booking.guestName || "(Guest name unavailable)"}</span>
              <span className="ml-2 text-primary">{booking.bookingReference}</span>
            </button>
          ))}
          {!error && results.length === 0 && <p className="p-2 text-xs text-muted-foreground">No matching bookings.</p>}
        </div>
      )}
    </div>
  );
}

function BookingCardPanel({
  bookingId,
  onClose,
  onSwitchBooking,
  notify,
}: {
  bookingId: string;
  onClose: () => void;
  onSwitchBooking: (id: string) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const router = useRouter();
  const [booking, setBooking] = useState<BookingCardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<TabName>("Summary");
  const [busy, setBusy] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [chargeKind, setChargeKind] = useState<"CHARGE" | "DEDUCTION">("CHARGE");
  const [chargeQuantity, setChargeQuantity] = useState("1");
  const [guest, setGuest] = useState({
    name: "",
    firstName: "",
    shortName: "",
    phone: "",
    email: "",
    company: "",
    taxVat: "",
    address: "",
    notes: "",
  });
  const [guestBaseline, setGuestBaseline] = useState<typeof guest | null>(null);
  const [pendingGuest, setPendingGuest] = useState<typeof guest | null>(null);
  const [guestSummaryChanges, setGuestSummaryChanges] = useState<FormChange[]>([]);
  const getChanges = useFormDiff();
  const [directTotal, setDirectTotal] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [editingCharge, setEditingCharge] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [method, setMethod] = useState<(typeof methods)[number]>("Card");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [relatingTo, setRelatingTo] = useState<Array<(typeof relatingOptions)[number]>>([]);
  const [processedDate, setProcessedDate] = useState(new Date().toISOString().slice(0, 10));
  const [cardDigits, setCardDigits] = useState("");
  const [cardType, setCardType] = useState("Visa");
  const [billPeriod, setBillPeriod] = useState<"day-by-day" | "full-period">("full-period");
  const [statementVisible, setStatementVisible] = useState(false);

  useEffect(() => {
    let active = true;
    void loadBookingCard(bookingId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setBooking(result.booking);
      setDirectTotal(result.booking.totalAmount);
      setGuest({
        name: result.booking.guest.name,
        firstName: result.booking.guest.firstName,
        shortName: result.booking.guest.shortName,
        phone: result.booking.guest.phone,
        email: result.booking.guest.email,
        company: result.booking.guest.company,
        taxVat: result.booking.guest.taxVat,
        address: result.booking.guest.address,
        notes: result.booking.guest.notes,
      });
      setGuestBaseline({
        name: result.booking.guest.name,
        firstName: result.booking.guest.firstName,
        shortName: result.booking.guest.shortName,
        phone: result.booking.guest.phone,
        email: result.booking.guest.email,
        company: result.booking.guest.company,
        taxVat: result.booking.guest.taxVat,
        address: result.booking.guest.address,
        notes: result.booking.guest.notes,
      });
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Could not load booking.");
    });
    return () => {
      active = false;
    };
  }, [bookingId]);

  async function runMutation(
    action: () => Promise<{ ok: true; booking: BookingCardData } | { ok: false; error: string }>,
    successMessage: string,
  ) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) {
        notify(result.error, true);
        return false;
      }
      setBooking(result.booking);
      setDirectTotal(result.booking.totalAmount);
      setGuest({
        name: result.booking.guest.name,
        firstName: result.booking.guest.firstName,
        shortName: result.booking.guest.shortName,
        phone: result.booking.guest.phone,
        email: result.booking.guest.email,
        company: result.booking.guest.company,
        taxVat: result.booking.guest.taxVat,
        address: result.booking.guest.address,
        notes: result.booking.guest.notes,
      });
      setGuestBaseline({
        name: result.booking.guest.name,
        firstName: result.booking.guest.firstName,
        shortName: result.booking.guest.shortName,
        phone: result.booking.guest.phone,
        email: result.booking.guest.email,
        company: result.booking.guest.company,
        taxVat: result.booking.guest.taxVat,
        address: result.booking.guest.address,
        notes: result.booking.guest.notes,
      });
      router.refresh();
      notify(successMessage);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save booking changes.", true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function stageGuestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guestBaseline) return;
    const labels = {
      name: "Guest name",
      firstName: "Forename",
      shortName: "Short name",
      phone: "Phone",
      email: "Email",
      company: "Company name",
      taxVat: "Tax/VAT number",
      address: "Address",
      notes: "Guest notes",
    } satisfies Record<keyof typeof guest, string>;
    const changes = getChanges(guestBaseline, guest, labels);
    if (!changes.length) {
      notify("There are no guest detail changes to save.");
      return;
    }
    setPendingGuest({ ...guest });
    setGuestSummaryChanges(changes);
  }

  async function confirmGuestSave() {
    if (!pendingGuest || !booking) return;
    const submittedGuest = pendingGuest;
    const saved = await runMutation(
      () => saveBookingGuestDetails(booking.id, submittedGuest),
      "Guest details updated.",
    );
    if (saved) {
      setGuestBaseline(submittedGuest);
      setPendingGuest(null);
      setGuestSummaryChanges([]);
    }
  }

  if (loadError) {
    return (
      <aside className="flex h-full w-[min(680px,92vw)] shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-2xl">
        <PanelHeader title="Booking card" onClose={onClose} />
        <p role="alert" className="m-5 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {loadError}
        </p>
      </aside>
    );
  }
  if (!booking) {
    return (
      <aside className="flex h-full w-[min(680px,92vw)] shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-2xl">
        <PanelHeader title="Booking card" onClose={onClose} />
        <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading booking...
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[min(680px,92vw)] shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-2xl">
      <PanelHeader
        title={booking.guest.name || "Booking card"}
        subtitle={`${booking.bookingReference} · OTA ${booking.otaReference || "—"} · ${booking.property}`}
        status={booking.status}
        onClose={onClose}
      />
      <div className="flex overflow-x-auto border-b border-border px-1">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-3 text-[10px] font-medium transition sm:px-3 sm:text-xs ${
              tab === name ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "Summary" && (
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financials</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric label="Group Total" value={formatMoney(booking.groupTotalAmount, booking.currency)} />
                <Metric label="Paid Amount" value={formatMoney(booking.paidAmount, booking.currency)} />
                <Metric label="Balance" value={formatMoney(new Decimal(booking.totalAmount).minus(booking.paidAmount).toFixed(2), booking.currency)} />
                <Metric label="Due Amount" value={formatMoney(booking.dueAmount, booking.currency)} emphasis />
                <Metric label="Due Now" value={formatMoney(booking.dueNow || booking.dueAmount, booking.currency)} />
                <Metric label="Damage Deposit" value={booking.damageDeposit ? formatMoney(booking.damageDeposit, booking.currency) : "—"} />
              </div>
            </section>
            <section className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking details</h3>
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Check-in" value={booking.arrivalDate || "—"} />
                <Detail label="Check-out" value={booking.departureDate || "—"} />
                <Detail label="Nights" value={booking.nights || "—"} />
                <Detail label="Source" value={booking.bookingSource || "Not specified"} />
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Pax</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium">
                    <UserRound className="h-3.5 w-3.5 text-primary" /> {booking.pax || "—"}
                  </p>
                </div>
                {booking.arrivalDate === new Date().toISOString().slice(0, 10) && (
                  <span className="col-span-2 inline-flex w-fit items-center rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                    Check-in Today
                  </span>
                )}
              </div>
            </section>
            <section className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room information</h3>
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Property Name" value={booking.property || "—"} />
                <Detail label="Rate Plan" value={booking.ratePlan || "—"} />
                <Detail label="Room/Unit Type" value={booking.roomType || "—"} />
                <Detail label="Room/Unit Name" value={booking.roomName || "—"} />
                <Detail label="Beds" value={booking.beds || "—"} />
              </div>
            </section>
            <section className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4">
              <Detail label="OTA Ref" value={booking.otaReference || "—"} />
              <Detail label="Order" value={booking.orderReference || "—"} />
              <Detail label="Received Date" value={booking.receivedDate || "—"} />
              <Detail label="Cancellation Date" value={booking.cancellationDate || "—"} />
              <Detail label="Deposit" value={booking.depositAmount ? formatMoney(booking.depositAmount, booking.currency) : "—"} />
            </section>
            <label className="grid gap-1.5 text-xs font-medium">
              Booking Notes
              <textarea
                value={booking.bookingNotes || ""}
                readOnly
                rows={4}
                className="max-h-40 min-h-24 resize-y overflow-y-auto rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm font-normal"
              />
            </label>
            {booking.direct ? (
              <form
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void runMutation(
                    () => updateDirectBookingTotal(booking.id, directTotal),
                    `Total amount updated to ${formatMoney(directTotal, booking.currency)}.`,
                  );
                }}
                className="rounded-xl border border-border p-4"
              >
                <label className="block text-sm font-semibold" htmlFor={`booking-total-${booking.id}`}>
                  Total Booking Amount
                </label>
                <p className="mt-1 text-xs text-muted-foreground">Editable for Direct bookings only.</p>
                <div className="mt-3 flex gap-2">
                  <input
                    id={`booking-total-${booking.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={directTotal}
                    onChange={(event) => setDirectTotal(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button disabled={busy} className="rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                    Save total
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-xl border border-border bg-muted p-4">
                <p className="text-sm font-semibold">Total Booking Amount</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatMoney(booking.totalAmount, booking.currency)} · Locked because this booking is not Direct. Adjust revenue using Charges.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "Cards" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Payment cards</h3>
            {booking.cards.length ? booking.cards.map((card) => (
              <article key={card.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{card.cardType || "Payment card"}</p>
                    <p className="text-xs text-muted-foreground">
                      {card.digits ? `•••• •••• •••• ${card.digits}` : "Card digits not available"}
                    </p>
                    {card.description && <p className="mt-1 text-xs">{card.description}</p>}
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">Only masked card details are displayed. Full card numbers are never stored.</p>
              </article>
            )) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No card details saved</p>
                <p className="mt-1 text-xs text-muted-foreground">Card type and masked digits will appear here after a card payment is recorded.</p>
              </div>
            )}
          </div>
        )}

        {tab === "Guest" && (
          <form
            onSubmit={stageGuestSave}
            className="space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Guest details</h3>
              {booking.group && (
                <label className="flex min-w-0 items-center gap-2">
                  <UsersRound className="h-4 w-4 shrink-0 text-primary" aria-label="Group bookings" />
                  <select
                    aria-label="Switch to another booking in this group"
                    value={booking.id}
                    onChange={(event) => onSwitchBooking(event.target.value)}
                    className="h-9 max-w-56 rounded-lg border border-input bg-background px-2 text-xs"
                  >
                    {booking.groupBookings.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {`${entry.bookingReference} | ${entry.guestName || "Guest"} | Pax ${entry.pax || "—"} | ${entry.roomName || "Room"}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <FormInput label="Forename" value={guest.firstName} onChange={(value) => setGuest({ ...guest, firstName: value, name: `${value} ${guest.name.split(/\s+/).slice(1).join(" ")}`.trim() })} />
            <FormInput label="Short Name" value={guest.shortName} onChange={(value) => setGuest({ ...guest, shortName: value })} />
            <FormInput label="Phone" value={guest.phone} onChange={(value) => setGuest({ ...guest, phone: value })} />
            <FormInput label="Email" type="email" value={guest.email} onChange={(value) => setGuest({ ...guest, email: value })} />
            <FormInput label="Company Name" value={guest.company} onChange={(value) => setGuest({ ...guest, company: value })} />
            <FormInput label="Tax/VAT Number" value={guest.taxVat} onChange={(value) => setGuest({ ...guest, taxVat: value })} />
            <FormInput label="Address" value={guest.address} onChange={(value) => setGuest({ ...guest, address: value })} />
            <label className="grid gap-1.5 text-xs font-medium">
              Guest notes
              <textarea
                rows={5}
                value={guest.notes}
                onChange={(event) => setGuest({ ...guest, notes: event.target.value })}
                className="max-h-40 min-h-24 resize-y overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <button disabled={busy} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              Review guest changes
            </button>
          </form>
        )}

        {tab === "Charges & Deductions" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Charges &amp; Deductions</h3>
              <p className="mt-1 text-xs text-muted-foreground">Bill adjustments update Other Revenue and immediately recalculate the balance.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Description</th>
                    <th className="px-3 py-2.5 font-semibold">Amount</th>
                    <th className="px-3 py-2.5 font-semibold">Date/Time added</th>
                    <th className="px-3 py-2.5 font-semibold">User</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
              {booking.charges.map((charge) => (
                <tr key={charge.id}>
                  <td className="px-3 py-3">
                  {editingCharge === charge.id ? (
                    <input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs" aria-label="Edit charge description" />
                  ) : (
                    <span className="font-medium">{charge.kind === "DEDUCTION" ? "Deduction: " : ""}{charge.description}</span>
                  )}
                  </td>
                  <td className="px-3 py-3">
                    {editingCharge === charge.id ? (
                      <input type="number" min="0.01" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} className="h-9 w-28 rounded-lg border border-input bg-background px-2 text-xs" aria-label="Edit charge amount" />
                    ) : (
                      <strong className={charge.kind === "DEDUCTION" ? "text-danger" : ""}>
                        {charge.kind === "DEDUCTION" ? "−" : ""}{formatMoney(new Decimal(charge.amount).times(charge.quantity).toFixed(2), booking.currency)}
                      </strong>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{new Date(charge.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-3 text-muted-foreground">{charge.createdBy}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      {editingCharge === charge.id ? (
                        <>
                          <button type="button" disabled={busy} onClick={() => void runMutation(
                            () => updateBookingCharge(booking.id, charge.id, editDescription, editAmount),
                            `${formatMoney(new Decimal(editAmount || "0").times(charge.quantity).toFixed(2), booking.currency)} ${editDescription} ${charge.kind === "DEDUCTION" ? "deduction" : "charge"} updated.`,
                          ).then((saved) => { if (saved) setEditingCharge(null); })} className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60">Save</button>
                          <button type="button" onClick={() => setEditingCharge(null)} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px]">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" aria-label={`Edit ${charge.description}`} onClick={() => { setEditingCharge(charge.id); setEditDescription(charge.description); setEditAmount(charge.amount); }} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] hover:bg-muted">Edit</button>
                          <button type="button" aria-label={`Delete ${charge.description}`} title="Delete charge" disabled={busy} onClick={() => void runMutation(() => deleteBookingCharge(booking.id, charge.id), `${charge.description} ${charge.kind === "DEDUCTION" ? "deduction" : "charge"} deleted.`)} className="rounded-md p-1.5 text-danger hover:bg-danger/10 disabled:opacity-60"><Trash2 className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {booking.charges.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No charges or deductions have been added.</td></tr>}
                </tbody>
              </table>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation(
                  () => addBookingCharge({ bookingId: booking.id, description: chargeDescription, quantity: chargeQuantity, amount: chargeAmount, kind: chargeKind }),
                  `${formatMoney(new Decimal(chargeAmount || "0").times(chargeQuantity || "0").toFixed(2), booking.currency)} ${chargeDescription} ${chargeKind === "DEDUCTION" ? "deduction" : "charge"} added.`,
                ).then((saved) => {
                  if (saved) {
                    setChargeDescription("");
                    setChargeAmount("");
                    setChargeQuantity("1");
                  }
                });
              }}
              className="rounded-xl border border-border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Add bill adjustment</h4>
                <div className="inline-flex rounded-lg border border-border p-1">
                  <button type="button" aria-pressed={chargeKind === "CHARGE"} onClick={() => setChargeKind("CHARGE")} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${chargeKind === "CHARGE" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Charge</button>
                  <button type="button" aria-pressed={chargeKind === "DEDUCTION"} onClick={() => setChargeKind("DEDUCTION")} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${chargeKind === "DEDUCTION" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Deduction</button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_130px]">
                <label className="grid gap-1 text-[11px] font-medium">
                  Description to appear on the bill
                  <input value={chargeDescription} onChange={(event) => setChargeDescription(event.target.value)} maxLength={200} required placeholder="Parking" className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </label>
                <label className="grid gap-1 text-[11px] font-medium">Quantity
                  <input type="number" min="0.01" step="0.01" value={chargeQuantity} onChange={(event) => setChargeQuantity(event.target.value)} required className="h-10 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </label>
                <label className="grid gap-1 text-[11px] font-medium">Amount ({booking.currency})
                  <input type="number" min="0.01" step="0.01" value={chargeAmount} onChange={(event) => setChargeAmount(event.target.value)} required placeholder="10.00" className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </label>
              </div>
              <button disabled={busy} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                {chargeKind === "DEDUCTION" ? <MinusCircle className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                Add {chargeKind === "DEDUCTION" ? "deduction" : "charge"}
              </button>
            </form>
            <section className="rounded-xl border border-border p-4">
              <h4 className="text-xs font-semibold">Charge audit trail</h4>
              {booking.auditEvents.filter((event) => /CHARGE|DEDUCTION/.test(event.action)).length ? (
                <ul className="mt-3 space-y-2">
                  {booking.auditEvents
                    .filter((event) => /CHARGE|DEDUCTION/.test(event.action))
                    .map((event) => (
                      <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px]">
                        <span className="font-medium">{event.action.replaceAll("_", " ")}</span>
                        <span className="text-muted-foreground">{event.details}</span>
                        <span className="text-muted-foreground">{event.actor} · {new Date(event.createdAt).toLocaleString()}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No charge changes have been logged.</p>
              )}
            </section>
          </div>
        )}

        {tab === "Payments" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold">Payment history</h3>
              <p className="mt-1 text-xs text-muted-foreground">Hover over a payment to see who processed it and when it was last updated.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Processed</th>
                    <th className="px-3 py-2.5 font-semibold">Method / Relating to</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
              {booking.payments.map((payment) => (
                <tr
                  key={payment.id}
                  title={`User who processed it: ${payment.processedBy} | Last update: ${new Date(payment.updatedAt).toLocaleString()} | Method: ${payment.method} | Amount: ${formatMoney(payment.amount, payment.currency)}`}
                  aria-label={`Payment processed by ${payment.processedBy}, last updated ${new Date(payment.updatedAt).toLocaleString()}, ${payment.method}, ${formatMoney(payment.amount, payment.currency)}`}
                  className="hover:bg-muted/40"
                >
                  <td className="px-3 py-3">
                    <p className="font-medium">{payment.description || payment.method}</p>
                    <p className="mt-1 text-muted-foreground">{payment.processedDate || "Date unavailable"}{payment.cardDigits ? ` · •••• ${payment.cardDigits}` : ""}{payment.cardType ? ` · ${payment.cardType}` : ""}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p>{payment.method}</p>
                    {payment.relatingTo.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{payment.relatingTo.join(", ")}</p>}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{formatMoney(payment.amount, payment.currency)}</td>
                </tr>
              ))}
              {booking.payments.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">No payment transactions recorded.</td></tr>}
                </tbody>
              </table>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation(
                  () => processBookingPayment({
                    bookingId: booking.id,
                    method,
                    amount: paymentAmount,
                    description: paymentDescription,
                    processedDate,
                    relatingTo,
                    ...(method === "Card" ? { cardDigits, cardType } : {}),
                  }),
                  `Payment of ${formatMoney(paymentAmount, booking.currency)} processed.`,
                ).then((saved) => {
                  if (saved) {
                    setPaymentAmount("");
                    setPaymentDescription("");
                    setCardDigits("");
                    setRelatingTo([]);
                  }
                });
              }}
              className="rounded-xl border border-border p-4"
            >
              <h4 className="text-sm font-semibold">Process payment</h4>
              <label className="mt-3 grid gap-1.5 text-xs font-medium">
                Payment method
                <select value={method} onChange={(event) => setMethod(event.target.value as (typeof methods)[number])} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                  {methods.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <FormInput label={`Amount (${booking.currency})`} type="number" value={paymentAmount} onChange={setPaymentAmount} required />
                <label className="grid gap-1.5 text-xs font-medium">
                  Processed date
                  <span className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="date" value={processedDate} onChange={(event) => setProcessedDate(event.target.value)} required className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-2 text-sm" />
                  </span>
                </label>
              </div>
              <fieldset className="mt-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-xs font-semibold">Relating to</legend>
                <div className="grid grid-cols-2 gap-2">
                  {relatingOptions.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={relatingTo.includes(option)}
                        onChange={(event) =>
                          setRelatingTo((current) =>
                            event.target.checked
                              ? [...current, option]
                              : current.filter((item) => item !== option),
                          )
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
              {method === "Card" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Card type
                    <select value={cardType} onChange={(event) => setCardType(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                      {["Visa", "Mastercard", "American Express", "Other"].map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <FormInput label="Card digits (last four only)" value={cardDigits} onChange={(value) => setCardDigits(value.replace(/\D/g, "").slice(0, 4))} required />
                  <div className="sm:col-span-2">
                    <FormInput label="Description" value={paymentDescription} onChange={setPaymentDescription} required />
                  </div>
                </div>
              )}
              {method !== "Card" && <FormInput label="Description (optional)" value={paymentDescription} onChange={setPaymentDescription} />}
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" /> Only the last four card digits are stored; full card details are never collected.
              </p>
              <button disabled={busy || new Decimal(booking.dueAmount).lessThanOrEqualTo(0)} className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                Process payment
              </button>
            </form>
          </div>
        )}

        {tab === "Bill" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold">Booking bill</h3>
              <p className="mt-1 text-xs text-muted-foreground">Review the statement, prepare an invoice, or print to PDF.</p>
            </div>
            <fieldset className="rounded-xl border border-border p-4">
              <legend className="px-1 text-xs font-semibold">View options</legend>
              <div className="flex flex-wrap gap-5">
                {([
                  ["day-by-day", "Day-by-day"],
                  ["full-period", "Full period"],
                ] as const).map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`bill-period-${booking.id}`}
                      value={value}
                      checked={billPeriod === value}
                      onChange={() => setBillPeriod(value)}
                      className="h-4 w-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStatementVisible((visible) => !visible)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                <ReceiptText className="h-4 w-4" /> View statement
              </button>
              <button type="button" onClick={() => {
                try {
                  printBookingDocument(booking, "Statement", billPeriod);
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not open the PDF print view.", true);
                }
              }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                <Download className="h-4 w-4" /> Download PDF
              </button>
              <button type="button" onClick={() => {
                if (!booking.guest.email) {
                  notify("Add a guest email address before preparing an email.", true);
                  return;
                }
                const subject = encodeURIComponent(`Booking statement ${booking.bookingReference}`);
                const body = encodeURIComponent(`Hello ${booking.guest.name},\n\nYour ${billPeriod === "day-by-day" ? "day-by-day" : "full-period"} booking statement for ${booking.bookingReference} is ready.\nTotal: ${formatMoney(booking.totalAmount, booking.currency)}\nPaid: ${formatMoney(booking.paidAmount, booking.currency)}\nBalance: ${formatMoney(booking.dueAmount, booking.currency)}\n\n`);
                window.location.href = `mailto:${encodeURIComponent(booking.guest.email)}?subject=${subject}&body=${body}`;
                notify("Email draft opened in your mail application.");
              }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                <Mail className="h-4 w-4" /> Send to email
              </button>
              <button type="button" onClick={() => {
                try {
                  printBookingDocument(booking, "Invoice", billPeriod);
                  notify("Invoice prepared. Choose Save as PDF in the print dialog.");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not generate the invoice.", true);
                }
              }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                <FileText className="h-4 w-4" /> Generate invoice
              </button>
            </div>
            {statementVisible && (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Statement · {billPeriod === "day-by-day" ? "Day-by-day" : "Full period"}</h4>
                  <button type="button" onClick={() => setStatementVisible(false)} aria-label="Close statement" className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{booking.guest.name} · {booking.bookingReference} · {booking.arrivalDate} – {booking.departureDate}</p>
                <div className="mt-4 space-y-2 text-xs">
                  {billPeriod === "day-by-day" && bookingDayLines(booking).length ? (
                    bookingDayLines(booking).map((line) => (
                      <div key={line.date} className="flex justify-between gap-2">
                        <span>Room charge · {line.date}</span><span>{formatMoney(line.amount, booking.currency)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between gap-2">
                      <span>Room and booking total</span>
                      <strong>{formatMoney(new Decimal(booking.totalAmount).minus(netChargeTotal(booking)).toFixed(2), booking.currency)}</strong>
                    </div>
                  )}
                  {booking.charges.map((charge) => (
                    <div key={charge.id} className="flex justify-between gap-2">
                      <span>{charge.kind === "DEDUCTION" ? "Deduction: " : ""}{charge.description} × {charge.quantity}</span>
                      <span>{charge.kind === "DEDUCTION" ? "−" : ""}{formatMoney(new Decimal(charge.amount).times(charge.quantity).toFixed(2), booking.currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2 border-t border-border pt-2"><span>Paid</span><span>{formatMoney(booking.paidAmount, booking.currency)}</span></div>
                  <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold"><span>Booking total</span><span>{formatMoney(booking.totalAmount, booking.currency)}</span></div>
                  <div className="flex justify-between gap-2"><span>Balance due</span><span>{formatMoney(booking.dueAmount, booking.currency)}</span></div>
                </div>
              </section>
            )}
            {billPeriod === "day-by-day" && (
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                Day-by-day view is based on the stay dates {booking.arrivalDate || "—"} through {booking.departureDate || "—"}.
              </p>
            )}
          </div>
        )}

        {tab === "Comms" && (
          <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
            <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold">No communication history</h3>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">Email and message history for this booking will appear here when communications are connected.</p>
          </div>
        )}
      </div>
      <footer className="sticky bottom-0 border-t border-border bg-card px-3 py-3 shadow-[0_-8px_16px_-16px_rgba(0,0,0,0.5)] sm:px-4">
        <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{busy ? "Saving to database…" : "Changes synchronize immediately after saving."}</span>
          <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {booking.bookingSource || "Booking"}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" disabled={busy} onClick={() => void runMutation(
            () => saveBookingGuestDetails(booking.id, guest),
            "Booking changes saved.",
          )} className="h-9 rounded-lg bg-primary px-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60">Save</button>
          <button type="button" disabled={busy} onClick={() => void runMutation(
            () => updateBookingWorkflow(booking.id, "PARK"),
            "Booking parked.",
          )} className="h-9 rounded-lg border border-border px-1 text-[11px] font-semibold hover:bg-muted disabled:opacity-60">Park</button>
          <button type="button" disabled={busy} onClick={() => {
            setModifying((value) => !value);
            setTab("Guest");
          }} className={`h-9 rounded-lg border border-border px-1 text-[11px] font-semibold hover:bg-muted ${modifying ? "bg-primary/10 text-primary" : ""}`}>Modify</button>
          <button type="button" disabled={busy} onClick={() => void runMutation(
            () => updateBookingWorkflow(booking.id, "CANCEL"),
            "Booking cancelled.",
          )} className="h-9 rounded-lg border border-danger/30 px-1 text-[11px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-60">Cancel</button>
          <button type="button" disabled={busy} onClick={() => {
            const checkedIn = /checked in/i.test(booking.status);
            void runMutation(
              () => updateBookingWorkflow(booking.id, checkedIn ? "CHECK_OUT" : "CHECK_IN"),
              checkedIn ? "Guest checked out." : "Guest checked in.",
            );
          }} className="h-9 rounded-lg border border-border px-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-60 sm:text-[11px]">
            {/checked in/i.test(booking.status) ? "Check Out" : "Check In"}
          </button>
        </div>
      </footer>
      <ActionSummaryModal
        open={pendingGuest !== null}
        title="Review guest detail changes"
        description={`Confirm the changes for booking ${booking.bookingReference}.`}
        changes={guestSummaryChanges}
        isPending={busy}
        onCancel={() => {
          if (busy) return;
          setPendingGuest(null);
          setGuestSummaryChanges([]);
        }}
        onConfirm={() => void confirmGuestSave()}
      />
    </aside>
  );
}

function PanelHeader({
  title,
  subtitle,
  status,
  onClose,
}: {
  title: string;
  subtitle?: string;
  status?: string;
  onClose: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>}
        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${
          /cancel/i.test(status ?? "") ? "bg-danger/10 text-danger" :
          /checked/i.test(status ?? "") ? "bg-success/10 text-success" :
          /confirm/i.test(status ?? "") ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}>{status || "Unknown status"}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close booking card"
        title="Close"
        className="shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border border-border p-3 ${emphasis ? "bg-primary/5" : "bg-muted/50"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${emphasis ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-xs font-medium">{value}</p>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="mt-3 grid gap-1.5 text-xs font-medium">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
