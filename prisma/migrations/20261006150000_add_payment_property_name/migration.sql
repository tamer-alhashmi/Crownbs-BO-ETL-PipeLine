ALTER TABLE "payments"
ADD COLUMN "property_name" VARCHAR(200);

UPDATE "payments"
SET "property_name" = NULLIF(BTRIM("source_data" ->> 'business_name'), '')
WHERE "source_data" ? 'business_name';
