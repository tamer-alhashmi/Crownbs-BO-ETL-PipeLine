ALTER TABLE "bookings"
RENAME COLUMN "total_amount" TO "total_revenue";

ALTER TABLE "bookings"
RENAME COLUMN "room_unit_revenue" TO "room_revenue";

ALTER TABLE "bookings"
  ALTER COLUMN "total_revenue" SET DEFAULT 0,
  ALTER COLUMN "other_revenue" SET DEFAULT 0,
  ALTER COLUMN "other_revenue" DROP NOT NULL,
  ADD COLUMN "is_group_payment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "group_payment_parent_ref" VARCHAR(128),
  ADD COLUMN "estimated_arrival_time" VARCHAR(80);

ALTER TABLE "bookings"
DROP COLUMN "deposit_amount";

CREATE INDEX "bookings_source_system_group_payment_parent_ref_idx"
ON "bookings"("source_system", "group_payment_parent_ref");
