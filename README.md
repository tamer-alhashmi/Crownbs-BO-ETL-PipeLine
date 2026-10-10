# Crown Business Solution Backoffice

Next.js App Router backoffice for Supabase-authenticated team members. The Reports dashboard presents the source booking and payment columns, with Decimal-based payment-method pivots. Google Drive CSV imports are tracked in Prisma and are idempotent by booking/payment source identifiers.

## Local setup

1. Install dependencies with `npm install` and configure `.env` with `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, and `GOOGLE_DRIVE_FOLDER_ID`. The Supabase URL and publishable key must belong to the same project as the database URLs.
2. Review `prisma/schema.prisma` and the checked-in migrations.
3. Apply the migration to the intended database with `npx prisma migrate deploy`. This repository does not apply migrations automatically.
4. Create team accounts in Supabase Auth. Any authenticated user can run the Drive import; no workspace hierarchy, membership, or local `public.users` row is required.
5. Share the configured Google Drive folder with the service-account email and place report CSVs there.
6. Start the app with `npm run dev`.

## User profile settings

Profile name, phone, and address are saved to the authenticated Supabase user's metadata. Profile pictures are stored privately in the `profile-avatars` Supabase Storage bucket and are scoped to each user's UUID. The Prisma migration creates the bucket and authenticated-user Storage policies; apply it with the migration command above before using profile-picture uploads.

## Vercel deployment

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Vercel Production environment to values from the same Supabase project used by `DATABASE_URL` and `DIRECT_URL`, then redeploy so the public variables are included in the client build. Vercel does not apply Prisma migrations automatically. Before using profile photos or saved table views in Production, verify the Production database is migrated and that the matching Supabase project's Storage dashboard contains the private `profile-avatars` bucket. If local uploads work but Production reports “Bucket not found,” check the Production project's URL and bucket rather than changing the upload flow.

Profile pictures and saved table views are scoped to the signed-in Supabase user. To see the same profile and saved view names locally and in Production, sign in with the same Supabase account in both. The selected view is remembered separately in each browser.

## Google Drive reports

The server-side **Sync Google Drive** action reads `.csv` files from `GOOGLE_DRIVE_FOLDER_ID`. Names containing `Payment Received` or `Payments Received` are treated as payment reports. Other reports may contain `H&H` or `HH`, `Harbor` or `Harbour`, or `Orlando` in the filename. Already processed files are skipped; after database upserts, the Drive filename is suffixed with `_processed.csv`.

Booking files skip the first metadata row and validate their row-2 headers against the booking report schema. The `Crown BS Company` value is derived from the booking filename and stored separately from source CSV fields: `H&H` → `Crown H&H`, `Harbor` → `Crown Harbor`, and `Orlando` → `Crown Orlando`. The CSV `Property` and `CompanyName` values are retained unchanged. Payment files use the 37 headers from columns AK through BU; the `Direct1` amount is read from BU, while `business_name` is retained from its source column (AP). Each file records import status and invalid-row issues. Booking/payment upserts use source-system identifiers, and payment-to-booking links are reconciled after each sync.

Booking revenue is stored as `total_revenue = room_revenue + other_revenue`; CSV `Room/Unit Revenue` is retained as the pure room-rate baseline, and `Other Revenue` includes add-ons and deposits. `Arrival` is stored as an estimated-arrival-time string, while check-in and check-out dates come only from their respective CSV columns. Group-payment markers in `Paid Amount` are persisted as group references and initially imported with zero paid amount; after all files are imported, the parent collection is proportionally allocated across the parent and its connected rooms by `room_revenue`. Payment CSV transactions remain unchanged for auditability. Booking/payment rows are deduplicated in memory and bulk-upserted in 250-row PostgreSQL `INSERT ... ON CONFLICT` batches. Payment transaction rows are metadata: their method pivots and transaction total are informative only and never determine a booking's paid amount. Payment pivots and financial totals use `decimal.js`; persisted amounts use Prisma `Decimal` / PostgreSQL `DECIMAL(10,2)`.

## Reports performance and filters

The Reports page defaults to the current calendar month. Date bounds and the selected hotel are stored in the URL as `from`, `to`, and `property` search parameters. Booking check-ins and booking-based summary totals use the selected arrival-date range; payment transactions use the same range on received date. Each table is fetched independently with server-side `skip`/`take` pagination at 20 rows per page, and summary totals are calculated in PostgreSQL. Both report tables support client-side column visibility toggles. The hotel selector combines distinct `Property` values from bookings and `business_name` values from payments so it includes hotels even before their booking CSV has been imported. Payment `property_name` is copied from the report's `business_name` field for exact hotel filtering; the additive migration also backfills existing imported payment rows.

## Validation

```bash
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
```
