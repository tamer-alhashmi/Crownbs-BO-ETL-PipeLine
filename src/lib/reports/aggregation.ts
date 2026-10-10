import Decimal from "decimal.js";

export const BOOKING_HEADERS = [
  "Property",
  "Booking Date",
  "Booking Reference",
  "Order Reference",
  "OTA Reference",
  "Group",
  "Guest First Name",
  "Guest Last Name",
  "Check In",
  "Check Out",
  "Nights",
  "Room/Unit Type",
  "Rate Plan",
  "Room/Unit Name",
  "Beds",
  "Adults",
  "Children",
  "Currency",
  "Total Revenue",
  "Paid Amount",
  "Room/Unit Revenue",
  "Other Revenue",
  "Method",
  "Source",
  "Channel",
  "Payment Method",
  "Booking Status",
  "Arrival",
  "Guest Email",
  "Guest Phone 1",
  "Guest Phone 2",
  "Booking Notes",
  "Extras Booked Online",
  "Promo Name",
  "Promo Code",
  "Promo Discount",
  "Booking Date and Time",
  "CompanyName",
  "MemberId",
  "Tag",
] as const;

export const PAYMENT_HEADERS = [
  "ReceivedDateTime",
  "PaymentID",
  "Forename",
  "GroupReference",
  "Company",
  "business_name",
  "RoomId",
  "OrderReference",
  "BookingReference",
  "transferred",
  "Textbox24",
  "BookedDate",
  "CheckinDatetime",
  "CheckoutDatetime",
  "channel",
  "channelreference",
  "PaymentType2",
  "PaymentMethod",
  "CardType",
  "CardLast4Digits",
  "IsVirtual",
  "Description",
  "UserName",
  "LastUpdatedDateTime",
  "GWStart",
  "GWEnd",
  "GatewayReference",
  "SettledAmount",
  "SettledDate",
  "Card1",
  "Cash1",
  "Vouchers1",
  "Textbox29",
  "OTAPrepaid1",
  "Eviivo",
  "OnAccount",
  "Direct1",
] as const;

export type SourceRecord = Record<string, string>;

export type BookingSource = {
  id?: string;
  source: SourceRecord;
  sourceSystem?: string;
  internalCompany?: string | null;
  totalAmount?: string;
  paidAmount?: string;
  guestOverrides?: Record<string, string>;
};

export type PaymentSource = {
  id?: string;
  bookingId?: string | null;
  source: SourceRecord;
  sourceSystem?: string;
  bookingReference?: string | null;
  paymentMethod?: string | null;
  amount?: string;
};

export type BookingReportRow = {
  id: string;
  source: SourceRecord;
  internalCompany: string;
  paymentTotals: Record<string, string>;
  transactionTotal: string;
  dueAmount: string;
  balanceStatus: "Prepaid" | "Partially paid" | "Payment on arrival";
};

export type PaymentReportRow = {
  id: string;
  bookingId: string | null;
  source: SourceRecord;
};

export function parseDecimalAmount(value: string, fieldName: string) {
  const raw = value.trim();
  if (!raw) return new Decimal(0);

  const negativeParentheses = /^\(.*\)$/.test(raw);
  const normalized = raw.replace(/[\p{Sc},\s()]/gu, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid monetary value in "${fieldName}".`);
  }

  const amount = new Decimal(normalized);
  return negativeParentheses ? amount.abs().negated() : amount;
}

export function cleanBookingRecord(record: SourceRecord) {
  const source = { ...record };
  const bookingStatus = source["Booking Status"]?.trim().toLocaleLowerCase();
  const isGroupPayment = /^(?:See|C)\s*([\w-]+)/i.test(source["Paid Amount"] ?? "");
  const sourcePaid = isGroupPayment
    ? new Decimal(0)
    : parseDecimalAmount(source["Paid Amount"] ?? "", "Paid Amount");
  const roomRevenue = parseDecimalAmount(source["Room/Unit Revenue"] ?? "", "Room/Unit Revenue");
  const hasOtherRevenue = Boolean(source["Other Revenue"]?.trim());
  const otherRevenue = parseDecimalAmount(source["Other Revenue"] ?? "", "Other Revenue");
  const totalRevenue = roomRevenue.plus(otherRevenue);

  if (
    bookingStatus === "canceled" &&
    totalRevenue.isZero() &&
    sourcePaid.isZero() &&
    !isGroupPayment
  ) {
    return { dropped: true as const, source };
  }

  const promoDiscount = source["Promo Discount"]?.trim()
    ? parseDecimalAmount(source["Promo Discount"], "Promo Discount").toFixed(2)
    : "";
  source["Total Revenue"] = totalRevenue.toFixed(2);
  source["Paid Amount"] = sourcePaid.toFixed(2);
  source["Room/Unit Revenue"] = roomRevenue.toFixed(2);
  source["Other Revenue"] = hasOtherRevenue ? otherRevenue.toFixed(2) : "";
  if (promoDiscount) source["Promo Discount"] = promoDiscount;
  return {
    dropped: false as const,
    source,
    totalRevenue: totalRevenue.toFixed(2),
    otherRevenue: hasOtherRevenue ? otherRevenue.toFixed(2) : null,
    roomRevenue: roomRevenue.toFixed(2),
    paidAmount: sourcePaid.toFixed(2),
  };
}

export function allocateGroupPayment(
  collectedAmount: string,
  parentReference: string,
  bookings: Array<{ bookingReference: string; roomRevenue: string }>,
) {
  const parent = bookings.find((booking) => booking.bookingReference === parentReference);
  if (!parent) throw new Error(`Group payment parent "${parentReference}" is missing.`);

  const weights = new Map(
    bookings.map((booking) => [
      booking.bookingReference,
      Decimal.max(new Decimal(booking.roomRevenue), 0),
    ]),
  );
  const totalWeight = [...weights.values()].reduce(
    (sum, weight) => sum.plus(weight),
    new Decimal(0),
  );
  const collected = new Decimal(collectedAmount);
  const allocations = new Map<string, Decimal>();
  let childAllocations = new Decimal(0);

  for (const booking of bookings) {
    if (booking.bookingReference === parentReference) continue;
    const share = totalWeight.isZero()
      ? new Decimal(0)
      : collected
          .times(weights.get(booking.bookingReference) ?? 0)
          .dividedBy(totalWeight)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    allocations.set(booking.bookingReference, share);
    childAllocations = childAllocations.plus(share);
  }

  allocations.set(
    parentReference,
    totalWeight.isZero() ? collected : collected.minus(childAllocations),
  );
  return [...allocations].map(([bookingReference, paidAmount]) => ({
    bookingReference,
    paidAmount: paidAmount.toFixed(2),
  }));
}

export function buildBookingReportRows(
  bookings: BookingSource[],
  payments: PaymentSource[],
): BookingReportRow[] {
  const paymentsByBooking = new Map<string, PaymentSource[]>();

  for (const payment of payments) {
    const bookingReference = (payment.bookingReference ?? payment.source.BookingReference)?.trim();
    if (!bookingReference) continue;
    const key = `${payment.sourceSystem ?? ""}\u0000${bookingReference}`;
    const existing = paymentsByBooking.get(key) ?? [];
    existing.push(payment);
    paymentsByBooking.set(key, existing);
  }

  return bookings.map(({ id, source: originalSource, sourceSystem, internalCompany, totalAmount, paidAmount, guestOverrides }) => {
    const cleaned = cleanBookingRecord(originalSource);
    if (cleaned.dropped) return null;
    const source = cleaned.source;
    const revenue = totalAmount
      ? parseDecimalAmount(totalAmount, "Total Revenue")
      : new Decimal(cleaned.totalRevenue);
    const paid = paidAmount
      ? parseDecimalAmount(paidAmount, "Paid Amount")
      : parseDecimalAmount(source["Paid Amount"] ?? "", "Paid Amount");
    for (const [key, value] of Object.entries(guestOverrides ?? {})) {
      if (key in source) source[key] = value;
    }
    source["Total Revenue"] = revenue.toFixed(2);
    source["Paid Amount"] = paid.toFixed(2);
    const paymentTotals = new Map<string, Decimal>();

    const bookingReference = source["Booking Reference"]?.trim() ?? "";
    const bookingPayments =
      paymentsByBooking.get(`${sourceSystem ?? ""}\u0000${bookingReference}`) ??
      paymentsByBooking.get(`\u0000${bookingReference}`) ??
      [];
    for (const payment of bookingPayments) {
      const method = (payment.paymentMethod ?? payment.source.PaymentMethod ?? "").trim() || "Unspecified";
      const amount = parseDecimalAmount(payment.amount ?? payment.source.Direct1 ?? "", "Direct1");
      paymentTotals.set(method, (paymentTotals.get(method) ?? new Decimal(0)).plus(amount));
    }

    const transactionTotal = [...paymentTotals.values()].reduce(
      (sum, amount) => sum.plus(amount),
      new Decimal(0),
    );
    const dueAmount = Decimal.max(revenue.minus(transactionTotal), 0);

    return {
      id: id ?? source["Booking Reference"] ?? "",
      source,
      internalCompany: internalCompany ?? "",
      paymentTotals: Object.fromEntries(
        [...paymentTotals.entries()].map(([method, amount]) => [method, amount.toFixed(2)]),
      ),
      transactionTotal: transactionTotal.toFixed(2),
      dueAmount: dueAmount.toFixed(2),
      balanceStatus: dueAmount.isZero()
        ? "Prepaid"
        : transactionTotal.isZero()
          ? "Payment on arrival"
          : "Partially paid",
    };
  }).filter((row): row is BookingReportRow => row !== null);
}

export function buildPaymentReportRows(payments: PaymentSource[]): PaymentReportRow[] {
  return payments.map(({ id, bookingId, source }) => ({
    id: id ?? source.PaymentID ?? `${source.BookingReference ?? ""}-${source.ReceivedDateTime ?? ""}`,
    bookingId: bookingId ?? null,
    source,
  }));
}
