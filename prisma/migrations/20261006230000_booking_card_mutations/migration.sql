ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "guest_overrides" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "total_override" DECIMAL(10,2);
ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "manual_paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "booking_charges" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "booking_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_charges_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "booking_charges_booking_id_fkey"
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "booking_charges_booking_id_created_at_idx"
ON "booking_charges"("booking_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_charges_amount_positive_check'
      AND conrelid = 'booking_charges'::regclass
  ) THEN
    ALTER TABLE "booking_charges"
    ADD CONSTRAINT "booking_charges_amount_positive_check" CHECK ("amount" > 0);
  END IF;
END $$;
