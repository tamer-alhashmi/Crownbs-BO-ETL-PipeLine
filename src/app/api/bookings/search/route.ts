import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    return NextResponse.json({ error: "Unable to verify your session." }, { status: 401 });
  }
  if (!data.user) return NextResponse.json({ error: "Sign in to search bookings." }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });
  if (query.length > 100) {
    return NextResponse.json({ error: "Search text must be 100 characters or fewer." }, { status: 400 });
  }

  const escaped = query.replace(/[!%_]/g, "!$&");
  const pattern = `%${escaped}%`;
  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      booking_reference: string;
      ota_reference: string | null;
      property_name: string | null;
      arrival_date: Date | null;
      currency_code: string | null;
      guest_name: string;
      total_amount: string;
      paid_amount: string;
      due_amount: string;
    }>
  >(Prisma.sql`
    SELECT
      b.id,
      b.booking_reference,
      b.ota_reference,
      b.property_name,
      b.arrival_date,
      b.currency_code,
      COALESCE(
        b.guest_overrides->>'Guest Name',
        NULLIF(concat_ws(' ', b.guest_overrides->>'Guest First Name', b.guest_overrides->>'Guest Last Name'), ''),
        NULLIF(concat_ws(' ', b.source_data->>'Guest First Name', b.source_data->>'Guest Last Name'), ''),
        ''
      ) AS guest_name,
      (COALESCE(b.total_override, b.total_revenue) + COALESCE((SELECT SUM(ROUND(c.quantity * c.amount * CASE WHEN c.kind = 'DEDUCTION' THEN -1 ELSE 1 END, 2)) FROM booking_charges c WHERE c.booking_id = b.id), 0))::text AS total_amount,
      COALESCE((
        SELECT SUM(p.direct_1)
        FROM payments p
        WHERE p.deleted_at IS NULL
          AND (p.booking_id = b.id OR (
            p.booking_id IS NULL
            AND p.booking_reference = b.booking_reference
            AND p.source_system = b.source_system
          ))
      ), 0)::text AS paid_amount,
      GREATEST(
        COALESCE(b.total_override, b.total_revenue) + COALESCE((SELECT SUM(ROUND(c.quantity * c.amount * CASE WHEN c.kind = 'DEDUCTION' THEN -1 ELSE 1 END, 2)) FROM booking_charges c WHERE c.booking_id = b.id), 0) - COALESCE((
          SELECT SUM(p.direct_1)
          FROM payments p
          WHERE p.deleted_at IS NULL
            AND (p.booking_id = b.id OR (
              p.booking_id IS NULL
              AND p.booking_reference = b.booking_reference
              AND p.source_system = b.source_system
            ))
        ), 0),
        0
      )::text AS due_amount
    FROM bookings b
    WHERE b.deleted_at IS NULL
      AND (
        b.booking_reference ILIKE ${pattern} ESCAPE '!'
        OR COALESCE(b.ota_reference, b.source_data->>'OTA Reference', '') ILIKE ${pattern} ESCAPE '!'
        OR COALESCE(b.guest_overrides->>'Guest Name', '') ILIKE ${pattern} ESCAPE '!'
        OR concat_ws(' ', b.guest_overrides->>'Guest First Name', b.guest_overrides->>'Guest Last Name') ILIKE ${pattern} ESCAPE '!'
        OR concat_ws(' ', b.source_data->>'Guest First Name', b.source_data->>'Guest Last Name') ILIKE ${pattern} ESCAPE '!'
      )
    ORDER BY b.arrival_date DESC NULLS LAST, b.booking_reference ASC
    LIMIT 10
  `);

  return NextResponse.json({
    results: results.map((booking) => ({
      id: booking.id,
      bookingReference: booking.booking_reference,
      otaReference: booking.ota_reference ?? "",
      property: booking.property_name ?? "",
      arrivalDate: booking.arrival_date?.toISOString().slice(0, 10) ?? "",
      currency: booking.currency_code ?? "GBP",
      guestName: booking.guest_name,
      totalAmount: booking.total_amount,
      paidAmount: booking.paid_amount,
      dueAmount: booking.due_amount,
    })),
  });
}
