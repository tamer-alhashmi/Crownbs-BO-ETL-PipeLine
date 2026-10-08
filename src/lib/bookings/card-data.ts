import "server-only";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { SourceRecord } from "@/lib/reports/aggregation";

function sourceRecord(value: Prisma.JsonValue): SourceRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item === null ? "" : typeof item === "string" ? item : String(item),
    ]),
  );
}

function text(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function textArray(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const field = value[key];
  return Array.isArray(field) ? field.filter((entry): entry is string => typeof entry === "string") : [];
}

export async function getBookingCardData(id: string) {
  const booking = await prisma.booking.findFirst({
    where: { id, deleted_at: null },
    select: {
      id: true,
      booking_reference: true,
      source_system: true,
      ota_reference: true,
      property_name: true,
      arrival_date: true,
      departure_date: true,
      total_amount: true,
      total_override: true,
      paid_amount: true,
      manual_paid_amount: true,
      currency_code: true,
      booking_status: true,
      source_data: true,
      guest_overrides: true,
      card_overrides: true,
      charges: {
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: {
          id: true,
          description: true,
          quantity: true,
          amount: true,
          kind: true,
          created_by_email: true,
          updated_by_email: true,
          created_at: true,
          updated_at: true,
        },
      },
      card_audit_events: {
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: { id: true, actor_email: true, action: true, details: true, created_at: true },
      },
    },
  });
  if (!booking) return null;

  const payments = await prisma.payment.findMany({
    where: {
      deleted_at: null,
      OR: [
        { booking_id: booking.id },
        {
          booking_id: null,
          booking_reference: booking.booking_reference,
          source_system: booking.source_system,
        },
      ],
    },
    orderBy: [{ payment_date: "desc" }, { id: "desc" }],
    select: {
      id: true,
      payment_date: true,
      payment_method: true,
      direct_1: true,
      description: true,
      source_data: true,
      currency_code: true,
      relating_to: true,
      processed_by_id: true,
      processed_by_email: true,
      created_at: true,
      updated_at: true,
    },
  });

  const source = sourceRecord(booking.source_data);
  const overrides =
    booking.guest_overrides &&
    typeof booking.guest_overrides === "object" &&
    !Array.isArray(booking.guest_overrides)
      ? Object.fromEntries(
          Object.entries(booking.guest_overrides).map(([key, value]) => [
            key,
            typeof value === "string" ? value : "",
          ]),
        )
      : {};
  const firstName = text(booking.source_data, "Guest First Name");
  const lastName = text(booking.source_data, "Guest Last Name");
  const baseName = [firstName, lastName].filter(Boolean).join(" ");
  const total = booking.charges.reduce(
    (sum, charge) =>
      sum.plus(
        new Decimal(charge.quantity.toString())
          .times(charge.amount.toString())
          .times(charge.kind === "DEDUCTION" ? -1 : 1)
          .toDecimalPlaces(2),
      ),
    new Decimal((booking.total_override ?? booking.total_amount).toString()),
  );
  const paid = payments.reduce(
    (sum, payment) => sum.plus(payment.direct_1.toString()),
    new Decimal(0),
  );
  const cardOverrides = sourceRecord(booking.card_overrides);
  const groupName = overrides.Group ?? source.Group ?? "";
  const groupBookings = groupName
    ? await prisma.booking.findMany({
        where: {
          deleted_at: null,
          source_system: booking.source_system,
          source_data: { path: ["Group"], equals: groupName },
        },
        orderBy: [{ arrival_date: "asc" }, { booking_reference: "asc" }],
        select: {
          id: true,
          booking_reference: true,
          source_data: true,
          guest_overrides: true,
          property_name: true,
          total_amount: true,
          total_override: true,
          charges: {
            select: { amount: true, quantity: true, kind: true },
          },
        },
      })
    : [];
  const groupTotal = groupBookings.reduce((sum, groupBooking) => {
    const chargesTotal = groupBooking.charges.reduce(
      (chargeSum, charge) =>
        chargeSum.plus(
          new Decimal(charge.quantity.toString())
            .times(charge.amount.toString())
            .times(charge.kind === "DEDUCTION" ? -1 : 1)
            .toDecimalPlaces(2),
        ),
      new Decimal(0),
    );
    return sum.plus(groupBooking.total_override ?? groupBooking.total_amount).plus(chargesTotal);
  }, new Decimal(0));

  return {
    id: booking.id,
    bookingReference: booking.booking_reference,
    otaReference: booking.ota_reference ?? source["OTA Reference"] ?? "",
    property: booking.property_name ?? source.Property ?? "",
    arrivalDate: booking.arrival_date?.toISOString().slice(0, 10) ?? "",
    departureDate: booking.departure_date?.toISOString().slice(0, 10) ?? "",
    currency: booking.currency_code ?? source.Currency ?? "GBP",
    bookingSource: (source.Source || source.Method || "").trim(),
    direct: /^(direct|direct booking)$/i.test((source.Source || source.Method || "").trim()),
    orderReference: text(booking.source_data, "Order Reference"),
    receivedDate: text(booking.source_data, "Booking Date and Time") || text(booking.source_data, "Booking Date"),
    cancellationDate: text(booking.source_data, "Cancellation Date"),
    depositAmount: text(booking.source_data, "Deposit") || text(booking.source_data, "Deposit Amount"),
    damageDeposit: text(booking.source_data, "Damage Deposit"),
    dueNow: text(booking.source_data, "Due Now"),
    nights: text(booking.source_data, "Nights"),
    pax: text(booking.source_data, "Adults") && text(booking.source_data, "Children")
      ? String(Number(text(booking.source_data, "Adults")) + Number(text(booking.source_data, "Children")))
      : text(booking.source_data, "Adults") || text(booking.source_data, "Children") || "",
    ratePlan: text(booking.source_data, "Rate Plan"),
    roomType: text(booking.source_data, "Room/Unit Type"),
    roomName: text(booking.source_data, "Room/Unit Name"),
    beds: text(booking.source_data, "Beds"),
    group: groupName,
    status: cardOverrides.status || booking.booking_status || source["Booking Status"] || "",
    bookingNotes: overrides["Booking Notes"] ?? text(booking.source_data, "Booking Notes"),
    bookingAddress: overrides.Address ?? text(booking.source_data, "Address"),
    guestFirstName: overrides.Forename ?? overrides["Guest First Name"] ?? firstName,
    guestShortName: overrides["Short Name"] ?? text(booking.source_data, "Short Name"),
    totalAmount: total.toFixed(2),
    groupTotalAmount: (groupBookings.length ? groupTotal : total).toFixed(2),
    paidAmount: paid.toFixed(2),
    dueAmount: Decimal.max(total.minus(paid), 0).toFixed(2),
    guest: {
      name: overrides["Guest Name"] ?? baseName,
      firstName: overrides.Forename ?? overrides["Guest First Name"] ?? firstName,
      shortName: overrides["Short Name"] ?? text(booking.source_data, "Short Name"),
      phone: overrides["Guest Phone 1"] ?? text(booking.source_data, "Guest Phone 1"),
      email: overrides["Guest Email"] ?? text(booking.source_data, "Guest Email"),
      company: overrides.CompanyName ?? text(booking.source_data, "CompanyName"),
      taxVat: overrides["Tax/VAT"] ?? "",
      address: overrides.Address ?? text(booking.source_data, "Address"),
      notes: overrides["Booking Notes"] ?? text(booking.source_data, "Booking Notes"),
    },
    charges: booking.charges.map((charge) => ({
      id: charge.id,
      description: charge.description,
      quantity: charge.quantity.toFixed(2),
      amount: charge.amount.toFixed(2),
      kind: charge.kind,
      createdBy: charge.created_by_email ?? "Unknown user",
      updatedBy: charge.updated_by_email ?? charge.created_by_email ?? "Unknown user",
      createdAt: charge.created_at.toISOString(),
      updatedAt: charge.updated_at.toISOString(),
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.payment_method ?? text(payment.source_data, "PaymentMethod") ?? "",
      amount: payment.direct_1.toFixed(2),
      description: payment.description ?? text(payment.source_data, "Description") ?? "",
      processedDate:
        payment.payment_date?.toISOString().slice(0, 10) ??
        text(payment.source_data, "ReceivedDateTime").slice(0, 10),
      cardDigits: text(payment.source_data, "CardLast4Digits"),
      cardType: text(payment.source_data, "CardType"),
      relatingTo: payment.relating_to.length ? payment.relating_to : textArray(payment.source_data, "RelatingTo"),
      currency: payment.currency_code ?? booking.currency_code ?? "GBP",
      processedBy: payment.processed_by_email ?? (text(payment.source_data, "UserName") || "Imported by Eviivo"),
      processedById: payment.processed_by_id,
      createdAt: payment.created_at.toISOString(),
      updatedAt: payment.updated_at.toISOString(),
    })),
    cards: payments
      .filter((payment) =>
        (payment.payment_method ?? text(payment.source_data, "PaymentMethod")).toLocaleLowerCase().includes("card") ||
        Boolean(text(payment.source_data, "CardType") || text(payment.source_data, "CardLast4Digits")),
      )
      .map((payment) => ({
        id: payment.id,
        description: payment.description ?? text(payment.source_data, "Description"),
        digits: text(payment.source_data, "CardLast4Digits").replace(/\D/g, "").slice(-4),
        cardType: text(payment.source_data, "CardType"),
      })),
    groupBookings: groupBookings.map((groupBooking) => {
      const itemSource = sourceRecord(groupBooking.source_data);
      const guestOverride =
        groupBooking.guest_overrides &&
        typeof groupBooking.guest_overrides === "object" &&
        !Array.isArray(groupBooking.guest_overrides)
          ? (groupBooking.guest_overrides as Prisma.JsonObject)
          : {};
      return {
        id: groupBooking.id,
        bookingReference: groupBooking.booking_reference,
        guestName:
          typeof guestOverride["Guest Name"] === "string"
            ? guestOverride["Guest Name"]
            : [itemSource["Guest First Name"], itemSource["Guest Last Name"]].filter(Boolean).join(" "),
        pax: itemSource.Adults && itemSource.Children
          ? String(Number(itemSource.Adults) + Number(itemSource.Children))
          : itemSource.Adults || itemSource.Children || "",
        roomName: itemSource["Room/Unit Name"] ?? "",
        property: groupBooking.property_name ?? "",
      };
    }),
    auditEvents: booking.card_audit_events.map((event) => ({
      id: event.id,
      actor: event.actor_email ?? "Unknown user",
      action: event.action,
      details:
        event.details && typeof event.details === "object" && !Array.isArray(event.details)
          ? Object.values(event.details).filter((value) => typeof value === "string").join(" · ")
          : "",
      createdAt: event.created_at.toISOString(),
    })),
  };
}

export type BookingCardData = NonNullable<Awaited<ReturnType<typeof getBookingCardData>>>;
