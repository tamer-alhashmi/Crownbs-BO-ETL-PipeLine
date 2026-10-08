CREATE TABLE "table_views" (
  "id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "table_name" VARCHAR(80) NOT NULL,
  "column_visibility" JSONB NOT NULL,
  "column_order" JSONB NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "table_views_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "table_views_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "table_views_user_id_table_name_name_key"
ON "table_views"("user_id", "table_name", "name");

CREATE INDEX "table_views_user_id_table_name_created_at_idx"
ON "table_views"("user_id", "table_name", "created_at");
