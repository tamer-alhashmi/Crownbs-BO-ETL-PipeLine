"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import Decimal from "decimal.js";
import { getBookingCardData } from "@/lib/bookings/card-data";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const moneySchema = z
  .string()
  .regex(/^\d{1,8}(?:\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places.");
const guestSchema = z.object({
  name: z.string().trim().max(200),
  firstName: z.string().trim().max(120),
  shortName: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(320).email().or(z.literal("")),
  company: z.string().trim().max(200),
  taxVat: z.string().trim().max(120),
  address: z.string().trim().max(500),
  notes: z.string().trim().max(4000),
});
const chargeSchema = z.object({
  bookingId: idSchema,
  description: z.string().trim().min(1).max(200),
  quantity: z.string().regex(/^\d{1,6}(?:\.\d{1,2})?$/).default("1"),
  amount: moneySchema,
  kind: z.enum(["CHARGE", "DEDUCTION"]).default("CHARGE"),
});
const paymentSchema = z.object({
  bookingId: idSchema,
  method: z.enum(["Cash", "Card", "Bank transfer", "Prepaid", "On account", "PayPal", "External Card"]),
  amount: moneySchema,
  description: z.string().trim().max(500).default(""),
  processedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid processed date."),
  relatingTo: z.array(z.enum(["Damage Deposit", "Early check-in", "Early check-out", "Room rate"])).max(4).default([]),
  cardDigits: z.string().regex(/^\d{4}$/, "Enter the card's last four digits.").optional(),
  cardType: z.string().trim().max(40).optional(),
});
const workflowSchema = z.enum(["PARK", "CANCEL", "CHECK_IN", "CHECK_OUT"]);

type Failure = { ok: false; error: string };
type Actor = { id: string; email: string | null };

async function authenticatedUser(): Promise<Actor | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    return { ok: false, error: `Could not verify your session: ${error.message}` };
  }
  return data.user
    ? { id: data.user.id, email: data.user.email ?? null }
    : { ok: false, error: "Sign in to manage booking details." };
}

async function addAuditEvent(
  tx: Prisma.TransactionClient,
  bookingId: string,
  actor: Actor,
  action: string,
  details: Record<string, string>,
) {
  await tx.bookingCardAuditEvent.create({
    data: {
      id: crypto.randomUUID(),
      booking_id: bookingId,
      actor_id: actor.id,
      actor_email: actor.email,
      action,
      details,
    },
  });
}

async function refreshBookingViews() {
  revalidatePath("/");
}

export async function loadBookingCard(id: string) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false as const, error: "Invalid booking identifier." };
  const booking = await getBookingCardData(parsedId.data);
  if (!booking) return { ok: false as const, error: "Booking was not found." };
  return { ok: true as const, booking };
}

export async function saveBookingGuestDetails(
  bookingId: string,
  details: z.input<typeof guestSchema>,
) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const input = guestSchema.safeParse(details);
  const id = idSchema.safeParse(bookingId);
  if (!input.success || !id.success) {
    return { ok: false as const, error: input.error?.issues[0]?.message ?? "Invalid booking details." };
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id.data}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const result = await tx.booking.updateMany({
      where: { id: id.data, deleted_at: null },
      data: {
        guest_overrides: {
          "Guest Name": input.data.name,
          "Guest First Name": input.data.firstName,
          Forename: input.data.firstName,
          "Short Name": input.data.shortName,
          "Guest Phone 1": input.data.phone,
          "Guest Email": input.data.email,
          CompanyName: input.data.company,
          "Tax/VAT": input.data.taxVat,
          Address: input.data.address,
          "Booking Notes": input.data.notes,
        },
      },
    });
    if (result.count) {
      await addAuditEvent(tx, id.data, actor, "GUEST_DETAILS_UPDATED", {
        fields: "Guest details and notes updated",
      });
    }
    return result.count > 0;
  });
  if (!saved) return { ok: false as const, error: "Booking was not found." };
  await refreshBookingViews();
  const booking = await getBookingCardData(id.data);
  if (!booking) return { ok: false as const, error: "Booking no longer exists." };
  return { ok: true as const, booking };
}

export async function updateDirectBookingTotal(bookingId: string, amount: string) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const id = idSchema.safeParse(bookingId);
  const value = moneySchema.safeParse(amount);
  if (!id.success || !value.success) {
    return {
      ok: false as const,
      error: value.error?.issues[0]?.message ?? "Invalid booking amount.",
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id.data}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const booking = await tx.booking.findFirst({
      where: { id: id.data, deleted_at: null },
      select: {
        id: true,
        source_data: true,
        charges: { select: { amount: true, quantity: true, kind: true } },
      },
    });
    if (!booking) return "missing" as const;
    const source =
      booking.source_data && typeof booking.source_data === "object" && !Array.isArray(booking.source_data)
        ? booking.source_data
        : {};
    const sourceName = String(source["Source"] ?? source["Method"] ?? "").trim();
    if (!/^(direct|direct booking)$/i.test(sourceName)) return "locked" as const;
    const chargesTotal = booking.charges.reduce(
      (sum, charge) =>
        sum.plus(
          new Decimal(charge.quantity.toString())
            .times(charge.amount.toString())
            .times(charge.kind === "DEDUCTION" ? -1 : 1)
            .toDecimalPlaces(2),
        ),
      new Decimal(0),
    );
    const baseTotal = new Decimal(value.data).minus(chargesTotal);
    if (baseTotal.isNegative()) return "below-charges" as const;
    await tx.booking.update({
      where: { id: booking.id },
      data: { total_override: baseTotal.toFixed(2) },
    });
    await addAuditEvent(tx, booking.id, actor, "TOTAL_UPDATED", { amount: value.data });
    return "updated" as const;
  });

  if (updated === "missing") return { ok: false as const, error: "Booking was not found." };
  if (updated === "locked") {
    return { ok: false as const, error: "Total amount is locked for OTA bookings; add a charge instead." };
  }
  if (updated === "below-charges") {
    return { ok: false as const, error: "Total booking amount cannot be less than its active charges." };
  }
  await refreshBookingViews();
  const booking = await getBookingCardData(id.data);
  if (!booking) return { ok: false as const, error: "Booking no longer exists." };
  return { ok: true as const, booking };
}

export async function addBookingCharge(input: z.input<typeof chargeSchema>) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid charge." };
  if (!new Decimal(parsed.data.amount).isPositive()) {
    return { ok: false as const, error: "Charge amount must be greater than zero." };
  }
  if (!new Decimal(parsed.data.quantity).isPositive()) {
    return { ok: false as const, error: "Charge quantity must be greater than zero." };
  }

  const added = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${parsed.data.bookingId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const booking = await tx.booking.findFirst({
      where: { id: parsed.data.bookingId, deleted_at: null },
      select: { id: true },
    });
    if (!booking) return false;
    await tx.bookingCharge.create({
      data: {
        id: crypto.randomUUID(),
        booking_id: booking.id,
        description: parsed.data.description,
        quantity: parsed.data.quantity,
        amount: parsed.data.amount,
        kind: parsed.data.kind,
        created_by_id: actor.id,
        created_by_email: actor.email,
      },
    });
    await addAuditEvent(tx, booking.id, actor, parsed.data.kind === "DEDUCTION" ? "DEDUCTION_ADDED" : "CHARGE_ADDED", {
      description: parsed.data.description,
      amount: parsed.data.amount,
      quantity: parsed.data.quantity,
    });
    return true;
  });
  if (!added) return { ok: false as const, error: "Booking was not found." };
  await refreshBookingViews();
  const updatedBooking = await getBookingCardData(parsed.data.bookingId);
  if (!updatedBooking) return { ok: false as const, error: "Booking no longer exists." };
  return { ok: true as const, booking: updatedBooking };
}

export async function updateBookingCharge(
  bookingId: string,
  chargeId: string,
  description: string,
  amount: string,
) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const input = chargeSchema.safeParse({ bookingId, description, amount });
  const parsedChargeId = idSchema.safeParse(chargeId);
  if (!input.success || !parsedChargeId.success) {
    return { ok: false as const, error: input.error?.issues[0]?.message ?? "Invalid charge." };
  }
  if (!new Decimal(input.data.amount).isPositive()) {
    return { ok: false as const, error: "Charge amount must be greater than zero." };
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${input.data.bookingId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const result = await tx.bookingCharge.updateMany({
      where: { id: parsedChargeId.data, booking_id: input.data.bookingId },
      data: {
        description: input.data.description,
        amount: input.data.amount,
        updated_by_id: actor.id,
        updated_by_email: actor.email,
      },
    });
    if (result.count) {
      await addAuditEvent(tx, input.data.bookingId, actor, "CHARGE_UPDATED", {
        description: input.data.description,
        amount: input.data.amount,
      });
    }
    return result.count > 0;
  });
  if (!updated) return { ok: false as const, error: "Charge was not found." };
  await refreshBookingViews();
  const booking = await getBookingCardData(input.data.bookingId);
  if (!booking) return { ok: false as const, error: "Booking no longer exists." };
  return { ok: true as const, booking };
}

export async function deleteBookingCharge(bookingId: string, chargeId: string) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const id = idSchema.safeParse(bookingId);
  const charge = idSchema.safeParse(chargeId);
  if (!id.success || !charge.success) return { ok: false as const, error: "Invalid charge identifier." };
  const deleted = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id.data}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const existing = await tx.bookingCharge.findFirst({
      where: { id: charge.data, booking_id: id.data },
      select: { description: true, amount: true },
    });
    if (!existing) return false;
    const result = await tx.bookingCharge.deleteMany({
      where: { id: charge.data, booking_id: id.data },
    });
    if (result.count) {
      await addAuditEvent(tx, id.data, actor, "CHARGE_DELETED", {
        description: existing.description,
        amount: existing.amount.toFixed(2),
      });
    }
    return result.count > 0;
  });
  if (!deleted) return { ok: false as const, error: "Charge was not found." };
  await refreshBookingViews();
  const booking = await getBookingCardData(id.data);
  if (!booking) return { ok: false as const, error: "Booking no longer exists." };
  return { ok: true as const, booking };
}

export async function processBookingPayment(input: z.input<typeof paymentSchema>) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  if (!new Decimal(parsed.data.amount).isPositive()) {
    return { ok: false as const, error: "Payment amount must be greater than zero." };
  }
  if (parsed.data.method === "Card" && (!parsed.data.cardDigits || !parsed.data.cardType || !parsed.data.description)) {
    return { ok: false as const, error: "Enter a card description, card type, and the last four digits." };
  }
  const date = new Date(`${parsed.data.processedDate}T12:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== parsed.data.processedDate
  ) {
    return { ok: false as const, error: "Choose a valid processed date." };
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${parsed.data.bookingId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const booking = await tx.booking.findFirst({
      where: { id: parsed.data.bookingId, deleted_at: null },
      select: {
        id: true,
        booking_reference: true,
        source_system: true,
        property_name: true,
        currency_code: true,
        total_amount: true,
        total_override: true,
        source_data: true,
        charges: { select: { amount: true, quantity: true, kind: true } },
      },
    });
    if (!booking) return { error: "Booking was not found." } as const;

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
    const recordedPayments = await tx.payment.findMany({
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
      select: { direct_1: true },
    });
    const paid = recordedPayments.reduce(
      (sum, payment) => sum.plus(payment.direct_1.toString()),
      new Decimal(0),
    );
    const amount = new Decimal(parsed.data.amount);
    if (amount.greaterThan(total.minus(paid))) {
      return { error: "Payment exceeds the remaining booking balance." } as const;
    }

    const paymentId = crypto.randomUUID();
    const receivedAt = date.toISOString();
    const sourceData = {
      ReceivedDateTime: receivedAt,
      PaymentID: paymentId,
      Forename: "",
      GroupReference: "",
      Company: "",
      business_name: booking.property_name ?? "",
      RoomId: "",
      OrderReference: "",
      BookingReference: booking.booking_reference,
      transferred: "",
      Textbox24: "",
      BookedDate: "",
      CheckinDatetime: "",
      CheckoutDatetime: "",
      channel: "",
      channelreference: "",
      PaymentType2: "",
      PaymentMethod: parsed.data.method,
      CardType: parsed.data.method === "Card" ? parsed.data.cardType ?? "" : "",
      CardLast4Digits: parsed.data.method === "Card" ? parsed.data.cardDigits ?? "" : "",
      IsVirtual: "",
      Description: parsed.data.description,
      UserName: actor.email ?? "Authenticated user",
      LastUpdatedDateTime: new Date().toISOString(),
      GWStart: "",
      GWEnd: "",
      GatewayReference: "",
      SettledAmount: parsed.data.amount,
      SettledDate: receivedAt,
      Card1: parsed.data.method === "Card" ? parsed.data.amount : "",
      Cash1: parsed.data.method === "Cash" ? parsed.data.amount : "",
      Vouchers1: "",
      Textbox29: "",
      OTAPrepaid1: "",
      Eviivo: "",
      OnAccount: parsed.data.method === "On account" ? parsed.data.amount : "",
      Direct1: parsed.data.amount,
      RelatingTo: parsed.data.relatingTo,
    };
    await tx.payment.create({
      data: {
        id: paymentId,
        booking_id: booking.id,
        source_system: "manual",
        payment_id: paymentId,
        booking_reference: booking.booking_reference,
        payment_reference: paymentId,
        payment_date: date,
        payment_method: parsed.data.method,
        payment_status: "Completed",
        description: parsed.data.description || parsed.data.method,
        property_name: booking.property_name,
        direct_1: parsed.data.amount,
        currency_code: booking.currency_code,
        relating_to: parsed.data.relatingTo,
        processed_by_id: actor.id,
        processed_by_email: actor.email,
        source_data: sourceData,
      },
    });
    await tx.booking.update({
      where: { id: booking.id },
      data: { manual_paid_amount: { increment: parsed.data.amount } },
    });
    await addAuditEvent(tx, booking.id, actor, "PAYMENT_PROCESSED", {
      method: parsed.data.method,
      amount: parsed.data.amount,
      relatingTo: parsed.data.relatingTo.join(", "),
    });
    return { error: null } as const;
  });
  if (result.error) return { ok: false as const, error: result.error };
  await refreshBookingViews();
  const booking = await getBookingCardData(parsed.data.bookingId);
  if (!booking) return { ok: false as const, error: "Booking no longer exists." };
  return { ok: true as const, booking };
}

export async function updateBookingWorkflow(bookingId: string, action: string) {
  const actor = await authenticatedUser();
  if ("ok" in actor) return actor;
  const id = idSchema.safeParse(bookingId);
  const workflow = workflowSchema.safeParse(action);
  if (!id.success || !workflow.success) {
    return { ok: false as const, error: "Invalid booking status action." };
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id.data}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const booking = await tx.booking.findFirst({
      where: { id: id.data, deleted_at: null },
      select: { id: true, booking_status: true, card_overrides: true },
    });
    if (!booking) return null;
    const status =
      workflow.data === "PARK"
        ? "Parked"
        : workflow.data === "CANCEL"
          ? "Cancelled"
          : workflow.data === "CHECK_IN"
            ? "Checked in"
            : "Checked out";
    const overrides =
      booking.card_overrides &&
      typeof booking.card_overrides === "object" &&
      !Array.isArray(booking.card_overrides)
        ? booking.card_overrides
        : {};
    await tx.booking.update({
      where: { id: booking.id },
      data: { booking_status: status, card_overrides: { ...overrides, status } },
    });
    await addAuditEvent(tx, booking.id, actor, `STATUS_${workflow.data}`, {
      previousStatus: booking.booking_status ?? "Unknown",
      status,
    });
    return status;
  });
  if (!result) return { ok: false as const, error: "Booking was not found." };
  await refreshBookingViews();
  const booking = await getBookingCardData(id.data);
  if (!booking) return { ok: false as const, error: "Booking no longer exists." };
  return { ok: true as const, booking, status: result };
}
