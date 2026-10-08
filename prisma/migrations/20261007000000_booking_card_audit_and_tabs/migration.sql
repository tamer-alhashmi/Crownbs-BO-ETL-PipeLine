ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "card_overrides" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "booking_charges"
ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "kind" VARCHAR(16) NOT NULL DEFAULT 'CHARGE',
ADD COLUMN IF NOT EXISTS "created_by_email" VARCHAR(320),
ADD COLUMN IF NOT EXISTS "updated_by_id" UUID,
ADD COLUMN IF NOT EXISTS "updated_by_email" VARCHAR(320);

ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "relating_to" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "processed_by_id" UUID,
ADD COLUMN IF NOT EXISTS "processed_by_email" VARCHAR(320);

CREATE TABLE IF NOT EXISTS "booking_card_audit_events" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "actor_email" VARCHAR(320),
  "action" VARCHAR(80) NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_card_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_card_audit_events_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "booking_card_audit_events_booking_id_created_at_idx"
ON "booking_card_audit_events"("booking_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_charges_quantity_positive_check'
      AND conrelid = 'booking_charges'::regclass
  ) THEN
    ALTER TABLE "booking_charges"
    ADD CONSTRAINT "booking_charges_quantity_positive_check" CHECK ("quantity" > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_charges_kind_check'
      AND conrelid = 'booking_charges'::regclass
  ) THEN
    ALTER TABLE "booking_charges"
    ADD CONSTRAINT "booking_charges_kind_check" CHECK ("kind" IN ('CHARGE', 'DEDUCTION'));
  END IF;
END $$;
