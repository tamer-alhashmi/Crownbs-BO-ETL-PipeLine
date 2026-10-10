# Eviivo Backoffice ETL Pipeline

## System Blueprint and Source of Truth

**Document status:** Architecture and implementation details are based on the checked-in application. Environment and migration-state notes are explicitly dated snapshots and must be rechecked for the target deployment.

**Repository:** `TAlhashmi102/Back-Office-ETL-PipeLine`

**Application name in the current UI:** Crown Business Solution Backoffice

**Purpose:** A private backoffice for importing Eviivo-style Booking and Payments CSV reports, inspecting reconciled financial data, and maintaining booking-level operational changes with user-attributed audit history.

> This document records implemented behavior, not a promise that every originally requested integration is complete. In particular, email delivery, payment-gateway processing, and a persisted communications timeline are not configured. Where CSV-source values, UI overlays, and financial transaction facts differ, the distinctions below are intentional.

---

## 1. System Overview and Technology Stack

### 1.1 Product scope

The application currently centers on one authenticated Reports experience, with Settings for account, appearance, and synchronization controls. The Reports dashboard contains:

- A Bookings report with source CSV fields, calculated financial fields, and dynamic payment-method columns.
- A Payments report with source payment columns.
- Date, property, per-column filter, and server-side pagination controls.
- A persistent global booking search and an Eviivo-style multi-tab booking card.
- Per-user, named Saved Views for the Bookings and Payments table layouts.

The system is built around three related but distinct data domains:

1. **Imported facts:** Booking and payment report rows written by the Google Drive ETL.
2. **Operational adjustments:** Guest/status overrides, manual charges and deductions, and manually recorded payments.
3. **Presentation preferences:** User-selected light/dark mode, accent palette, and named table-layout views.

The database is the source of truth for booking/payment facts, manual booking adjustments, audit events, and saved table views. Supabase Auth is the source of truth for authentication and profile metadata; Supabase Storage is the source of truth for profile image files. Theme choices and the active Saved View ID are browser-local preferences.

### 1.2 Technologies

| Area | Technology | Responsibility |
|---|---|---|
| Web framework | Next.js 16.3.8 App Router | Server-rendered pages, route handlers, navigation, Server Actions, and cache/path revalidation |
| Language | TypeScript 5, strict configuration | Application contracts, typed server/client boundaries, and compile-time checking |
| UI | React 19.2.8 | Interactive reports, settings, booking drawer, and table controls |
| Styling | Tailwind CSS 4 | Utility-driven responsive UI and design tokens |
| UI primitives | Base UI, Lucide React, project components | Accessible controls, icons, statuses, cards, and menus |
| Relational database | PostgreSQL hosted on Supabase | Persistent application, ETL, financial, audit, and saved-view data |
| ORM and migrations | Prisma 6.19.3 | Typed database access, schema declaration, and ordered SQL migrations |
| Identity | Supabase Auth, `@supabase/ssr` | Authenticated sessions, Google OAuth / email authentication configuration, and user metadata |
| Object storage | Supabase Storage | Private profile-avatar bucket and per-user object policies |
| Tabular UI | `@tanstack/react-table` 9.2.6 | Filtering, sorting, visibility, and column ordering for reports |
| Financial arithmetic | `decimal.js`, Prisma `Decimal`, PostgreSQL `DECIMAL(10,2)` | Exact base-10 calculations; binary floating-point is not used for money |
| Input validation | Zod 4 | Server Action input parsing and validation |
| CSV / file processing | PapaParse, Google APIs, ExcelJS | CSV parsing and Google Drive access; ExcelJS is available for spreadsheet-related work |

The project scripts are `npm run dev`, `npm run build`, `npm run start`, and `npm run lint`. Prisma workflows are explicit commands such as `npx prisma validate`, `npx prisma generate`, `npx prisma migrate status`, and `npx prisma migrate deploy`.

### 1.3 Core architecture principles

- **Eviivo-inspired operations UX:** Dense report tables open a multi-tab reservation workspace without losing the report context.
- **Single source of truth:** Persisted booking, payment, charge, deduction, workflow, and audit values are read from PostgreSQL; the UI does not invent authoritative financial outcomes.
- **Immutable source snapshots plus overlays:** Imported CSV facts are retained in `source_data`; user edits are stored separately so that an ETL refresh does not silently overwrite those edits.
- **Exact financial math:** Monetary values remain decimal strings/Prisma Decimals/PostgreSQL numerics and are rounded explicitly at line-calculation boundaries.
- **Authenticated access:** Server pages, APIs, and mutations verify the Supabase user on the server. There is no workspace or membership authorization hierarchy.
- **Server-side data reduction:** Date/property filters, global column filters, aggregate calculations, and pagination are applied before records are sent to the report table.
- **Explicit persistence boundaries:** Database state, Supabase identity/storage, and local browser preferences have different owners and lifecycles.

---

## 2. Database Architecture and Schema

The canonical model definitions are in `prisma/schema.prisma`. All model fields are explicitly named in snake_case for the database. Monetary amounts use PostgreSQL numeric/Prisma `Decimal`, generally `DECIMAL(10,2)`.

### 2.1 Entity relationship overview

```text
Supabase Auth user
  ├── profile metadata and session (Supabase Auth)
  ├── private profile image objects (Supabase Storage)
  └── public.users row (provisioned when the user first saves a TableView)
       └── TableView[] (per-user, per-report table layouts)

ImportBatch
  └── ImportFile[]
       ├── Booking[]
       ├── Payment[]
       └── ImportIssue[]

Booking
  ├── Payment[] (nullable payment.booking_id; CSV payment may begin unlinked)
  ├── BookingCharge[] (positive unit amount, quantity, CHARGE or DEDUCTION)
  └── BookingCardAuditEvent[]

AuditLog
  └── optional User actor relation; generic audit model
```

The initial schema once contained workspaces and memberships. The `20261006040000_remove_workspace_hierarchy` migration removes those tables and foreign-key assumptions. The current application intentionally has no workspace model and does not require membership records.

### 2.2 `User`

`User` maps to `public.users` and has the Supabase Auth UUID as its primary key. It contains email and optional profile fields (`full_name`, `phone_number`, address components, avatar URL, timestamps, and soft-delete time), plus relations for generic audit logs and `TableView`.

Authentication does **not** use this table. Passwords, OAuth identities, and active sessions live in Supabase Auth. The Settings profile currently reads and writes name, phone, address, and avatar path through Supabase Auth user metadata; it does not mirror every profile field into `public.users`.

The saved-view mutation creates or updates a minimal `public.users` record using the authenticated Supabase user ID and email, in the same transaction as the first `TableView` insert. This provisioning is required because `table_views.user_id` has a foreign key to `users.id`. Therefore a valid Supabase account may exist without a corresponding `public.users` record until it saves a view.

### 2.3 ETL tracking entities

- **`ImportBatch`** represents a synchronization run. It records the authenticated initiating user ID, status, start/completion times, and an optional error summary. `created_by_id` is an Auth UUID but is deliberately not a foreign key to `User`.
- **`ImportFile`** records a CSV’s original name, Drive file/folder IDs, provider, content type, byte size, optional hash, counts, status, errors, and completion time. It belongs to one batch and owns related bookings, payments, and issues.
- **`ImportIssue`** records invalid-row diagnostics by import file, row, optional column, issue code, message, and creation time.
- Status enums track batch lifecycle and per-file validation/import lifecycle; they are mapped to PostgreSQL enum names by Prisma.

### 2.4 `Booking`

`Booking` maps to `bookings`. Important fields include:

- Stable source identity: `source_system` + `booking_reference` (unique).
- Optional import provenance: `import_file_id`, `source_row_number`.
- Report lookup values: property, booking/arrival/departure dates, booking/order/OTA references, status, currency, guest names.
- Decimal amounts: source `total_amount`, source `paid_amount`, room and other revenue, deposit, and `manual_paid_amount`.
- Full imported row snapshot: required JSONB `source_data`.
- User-owned overlays: JSONB `guest_overrides` and `card_overrides`.
- Optional financial override: `total_override`.
- Timestamps and soft deletion.

The unique source-system/reference key makes imported upserts idempotent and prevents different source systems from being conflated when their references overlap. A second unique constraint on import file and source row supports row provenance.

**ETL values versus manual values:**

- `source_data` preserves the source report headers and values as imported.
- Normalized columns are populated for efficient filtering, joins, constraints, and common report calculations.
- `guest_overrides` stores editable guest fields and notes without changing the original source snapshot.
- `card_overrides` stores booking-card workflow status overrides.
- `total_override` stores the editable base booking total for Direct bookings. Imported `total_amount` stays intact.
- `manual_paid_amount` is incremented for manually processed payments as a supplementary persisted amount; linked payment transaction rows remain the transaction-level record used for current report/card payment calculations.

### 2.5 `Payment`

`Payment` maps to `payments` and belongs optionally to one booking and one import file. Important fields include:

- `payment_id` with `source_system` as unique source identity.
- Optional direct `booking_id`; nullable booking references and payment references allow import before reconciliation.
- Payment date/method/status, description, property, currency, and original JSONB `source_data`.
- `direct_1 DECIMAL(10,2)`, the designated monetary source for the Payments report (the ETL maps the exact `Direct1` header here).
- `relating_to TEXT[]` for booking-card categorization such as Room rate or Damage Deposit.
- Optional processor identity and email for manually recorded payments.
- Soft-delete and timestamps.

CSV-imported transactions are joined to bookings by `(source_system, booking_reference)`. The ETL performs a set-based linking update after files have been processed. Report and booking-card reads retain a safe fallback match on reference plus source system for older/unlinked transactions.

### 2.6 Charges and deductions: `BookingCharge`

`BookingCharge` maps to `booking_charges`. Each row represents an ad-hoc line belonging to a booking:

- `description`, positive `amount`, positive `quantity`, and `kind` (`CHARGE` or `DEDUCTION`).
- `created_by_id` / `created_by_email`, creation timestamp.
- `updated_by_id` / `updated_by_email`, update timestamp and last editor.
- A booking foreign key with cascade delete and an index ordered by booking and creation time.

The database migration adds positive-quantity and allowed-kind check constraints. The API treats `amount` as a positive unit amount for either kind; the sign is applied in calculations. Deleting a charge removes the operational line, but the corresponding audit event is retained as the historical record.

**Net line amount** is `round(quantity × amount, 2)` for a charge and its negative for a deduction. The booking total is the overridden or imported base total plus all net active charge lines.

### 2.7 Audit trails

Two audit mechanisms coexist:

1. **`BookingCardAuditEvent` / `booking_card_audit_events`:** Booking-specific immutable events with booking ID, actor Auth UUID, actor email, action code, optional JSON details, and timestamp. This is the main audit trail for card mutations.
2. **`AuditLog` / `audit_logs`:** Generic entity/action audit model with optional user actor relation and JSON metadata. It is available as a general audit facility; booking-card mutations currently write `BookingCardAuditEvent`.

Booking-card event examples include guest detail updates, total updates, charge/deduction add/update/delete, payment processing, parking, cancellation, and check-in/check-out. Mutations use a database transaction; the business update and its audit event are written atomically. Charge rows also retain creator/updater identity and timestamps, while payment rows retain processor identity, creation/update timestamps, method, amount, and relation categories.

### 2.8 Saved report layouts: `TableView`

The `TableView` model maps to `table_views` and stores:

| Field | Meaning |
|---|---|
| `id` | UUID primary key |
| `name` | User-supplied label, max 80 characters |
| `table_name` | Logical report ID; current allowlist is `BookingsReport` or `PaymentsReport` |
| `column_visibility` | JSONB map of TanStack column IDs to visibility booleans |
| `column_order` | JSONB array of TanStack column IDs in display order |
| `user_id` | Foreign key to `users.id` |
| `created_at`, `updated_at` | Persistence timestamps |

The composite unique key `(user_id, table_name, name)` prevents duplicate names for the same table by the same user while permitting the same name on the other report. The lookup index begins with user and table. Deleting a user row cascades to their saved views.

The migration is `20261007030000_saved_table_views`. It is additive and does not modify booking/payment rows. **Historical snapshot:** This migration was applied to the configured Supabase database by October 7, 2026; at that time Prisma reported seven migrations applied and an empty schema diff. Check current environment state with `npx prisma migrate status` rather than relying on this historical note.

### 2.9 Migration history

Checked-in migrations, in order:

1. `20261006000000_initial_schema` — baseline application tables and initial workspace-era schema.
2. `20261006040000_remove_workspace_hierarchy` — removes workspace and membership structures and their relational dependencies.
3. `20261006150000_add_payment_property_name` — adds and backfills payment property values from `source_data.business_name`.
4. `20261006220000_profile_avatar_storage` — provisions the private avatar bucket and per-user Supabase Storage policies.
5. `20261006230000_booking_card_mutations` — adds booking guest/total/manual-payment overlays and booking charges.
6. `20261007000000_booking_card_audit_and_tabs` — adds card status, charge quantity/kind/editor fields, payment categorization/processor fields, booking-card audit events, and constraints.
7. `20261007030000_saved_table_views` — adds user-owned named report layouts.

Use `npx prisma migrate deploy` to apply checked-in pending migrations to the configured database. Do not use `migrate reset` against a non-disposable database. `migrate resolve --applied` changes migration bookkeeping and must only be used after verifying the schema already exists; it does not execute the migration SQL.

---

## 3. Core Components and UI/UX Engineering

### 3.1 App Router and authentication

- `src/app/page.tsx` is the Reports entry page. It reads Supabase Auth on the server; signed-out visitors get the authentication screen. It normalizes URL filters, redirects to explicit default date parameters when needed, obtains the profile avatar URL, fetches report data, and renders the client dashboard.
- `src/app/settings/page.tsx` is authenticated Settings. It reads profile metadata and avatar state, then renders Profile, Appearance, Data synchronization, and Account management sections.
- `src/lib/supabase/server.ts` creates the server Supabase client from Next.js cookies. `src/lib/supabase/client.ts` is used for browser-auth operations such as updating user metadata and uploading an avatar.
- Server Actions re-check the authenticated Supabase user before mutations. The browser does not supply a trusted actor identity.
- `/api/bookings/search` independently verifies authentication and returns a limited search result set.

Supabase Auth supports the configured sign-in providers and methods. Availability of Google OAuth, email/password, and any email/PIN option depends on Supabase project configuration; the app does not implement its own password store.

### 3.2 Reports dashboard

The dashboard is assembled by `src/components/reports/reports-dashboard.tsx`. It provides:

- Summary cards for booking revenue, payments received, outstanding balance, and active bookings.
- A URL-backed global filter bar with From, To, and Property/Hotel.
- Bookings and Payments report tables, both configured for 20 rows per page.
- The booking-card workspace/global search in the header.
- Current filter, pagination, and table-action controls.

The default report date window is the current calendar month. The URL encodes `from`, `to`, `property`, `bookingPage`, and `paymentPage`. Booking and payment column-filter values use `bf.<column-id>` and `pf.<column-id>` respectively.

### 3.3 TanStack table architecture and global filtering

`src/components/reports/report-table.tsx` defines shared TanStack table features for column filtering, column ordering, column visibility, sorting, and row models. Each report table provides:

- A column header sort control.
- Per-column search and multi-select value menu.
- Server-wide text search for a column.
- Column visibility and explicit column ordering controls.
- Server pagination links and result counts.
- Clickable rows when the row can resolve to a booking.

Column filter state is serialized into the URL and parsed on the server. `src/lib/reports/data.ts` maps a whitelist of known source or computed column IDs to safe SQL expressions, binds all user-supplied filter values, and filters the complete matching server-side dataset **before** applying pagination. Unknown column IDs are ignored rather than interpolated as SQL identifiers. Exact selections, exclusions, and search text are represented distinctly in filter values.

Global date/property filters are also applied in PostgreSQL. Bookings are bounded by arrival/check-in date; Payments are bounded by transaction/received date. Property filtering uses normalized property columns. Summary totals are SQL aggregates based on the booking dataset and its active booking filters.

### 3.4 Dynamic payment-method columns and financial aggregation

`src/lib/reports/data.ts` fetches booking and payment data with separate server-side pages. It retrieves linked payment transactions for the current booking set, including legacy fallback-linked rows, and computes the set of methods across the date/property/booking-filtered booking dataset. `src/lib/reports/aggregation.ts` totals `direct_1` by exact trimmed payment-method name (or `source_data.PaymentMethod`; empty values become `Unspecified`) using Decimal arithmetic.

The Bookings table builds one column per discovered payment method rather than hardcoding method names. Zero-total methods are excluded from the method list. An additional Payment Total column, Due Amount, and Payment Status are computed from linked payment transactions and booking totals.

The separate First Name and Last Name source headers remain in the database/source snapshot; the UI hides those two columns and supplies a computed Guest Name column which concatenates them and tolerates missing parts.

**Important distinction:** The imported Booking CSV `Paid Amount` remains a source-field value and is displayed as that source/report field. Current table/card transaction totals and due/status calculations use linked Payment rows (`direct_1`), together with charges and booking total overrides where applicable. The README contains older narrative that describes Paid Amount as the authority for status; the current report/card implementation is transaction-based, and this blueprint reflects the implementation.

### 3.5 Persistent Booking Card drawer

The global Booking Card UI is in `src/components/bookings/booking-workspace.tsx`, with server-side data assembly in `src/lib/bookings/card-data.ts` and mutations in `src/app/actions/booking-card.ts`.

**Opening a card:**

- Selecting a global-search result opens the card by booking ID.
- Clicking a booking report row opens the card for that booking.
- Clicking a payment row opens the associated booking when its `booking_id` or source-system/reference fallback resolves.
- `requestBookingCardOpen` dispatches a typed custom browser event consumed by the workspace.
- `openIds` holds the currently open booking IDs. Several panels can be displayed side-by-side. A panel remains open after save/mutation; explicit close is performed with its top-right X. Switching to another group booking updates/switches the active card according to the group-selection logic.

**Seven tabs:**

1. **Summary:** Financial totals, balance/due amounts, booking and room details, source/OTA/order metadata, deposit values, status, and booking notes.
2. **Cards:** Card-related payment metadata and masked digits. Only the last four digits are shown/collected for manual card entries; full PAN/card numbers are not stored.
3. **Guest:** Editable guest identity/contact/company/tax/address and notes. Values are stored in `guest_overrides`, not written into imported JSON.
4. **Charges & Deductions:** Add/edit/delete charge lines, choose charge or deduction type, specify quantity and unit amount, and inspect line history including creator/timestamps.
5. **Payments:** Record manual payments with one of the configured methods, positive amount, relating-to categories, processed date (including backdating), and conditional card description/type/last four fields. History includes transaction and processor metadata; the UI provides audit details.
6. **Bill:** Full-period or day-by-day statement/invoice presentation with print/download, email-draft, and invoice actions.
7. **Comms:** Placeholder/history surface; a communications-delivery service is not configured, so there is no persisted message history.

The fixed footer exposes Save, Park, Modify, Cancel, and a status-dependent Check In / Check Out action. These controls are booking-card workflow controls; “Modify” toggles the card’s modification UI rather than invoking an external Eviivo/PMS API.

### 3.6 Global search

The header search is debounced by 250 ms and starts querying at two characters. It calls `GET /api/bookings/search?q=...`, limits input length, escapes SQL LIKE metacharacters, and searches booking reference, OTA reference, guest name, and source/overridden name fields. The server uses a bound Prisma SQL query, limits results to ten, and includes booking/property/date and calculated totals. Selecting a result opens the existing drawer without changing the URL or closing other open cards.

### 3.7 Saved Table Views persistence

The Saved Views menu is implemented in `report-table.tsx`; authenticated persistence is in `src/app/actions/table-views.ts`.

- Each table has its own allowed logical name (`BookingsReport` or `PaymentsReport`).
- A saved view contains the current TanStack `columnVisibility` map and `columnOrder` array. Filters and sort state are not part of the saved-view model.
- “Save Current View As...” opens a name dialog. Names are trimmed, limited to 80 characters, and unique per authenticated user/table.
- A successful save makes the new view active and stores its ID in `localStorage` under `active_view_<tableName>`.
- On mount, the component fetches the authenticated user’s list of saved views. If an active local ID exists, the server action fetches that view with owner and table constraints, then applies visibility/order without a full page navigation.
- Applying a saved view writes the active ID locally and shows a toast. “Default View” clears the active ID and resets TanStack visibility/order to `{}` and `[]`.
- Saved view ownership is enforced by server-side `user_id` predicates, not by trusting an ID sent by the browser. Zod validates names, table allowlist, JSON shape, map size, and duplicate order entries.

`localStorage` stores only the currently selected view ID per report, not the saved layout itself. This means the browser preference survives reload, while the actual view layout follows the user across sessions/devices through PostgreSQL.

### 3.8 Themes and profile settings

- `ThemeProvider` persists mode and palette under `crown-backoffice-theme` in browser `localStorage` and dispatches a custom event so mounted consumers update instantly.
- Available accent palettes are Forest, Ocean, Plum, and Terracotta, with light/dark color values. The provider computes a foreground color from primary-color luminance for accessible contrast.
- Profile name, phone, and address are saved to Supabase Auth `user_metadata`. The email is read-only.
- Avatar objects are stored in the private `profile-avatars` bucket under a user-UUID-prefixed path. Authenticated storage policies constrain users to their own prefix. Avatar files have a 5 MB UI limit and accepted JPEG/PNG/WebP/GIF types. The server obtains a signed/private display URL through `src/lib/supabase/profile-avatar.ts`.
- The profile form previews selected images locally and reports persistence/cleanup failures instead of silently showing success.

---

## 4. Business Logic and Financial Rules

### 4.1 Decimal handling

- All database financial columns use Decimal/numeric fields, not floating-point.
- UI/server calculations use `decimal.js` or Prisma Decimal.
- CSV values are normalized and validated before persistence.
- Charge quantities and unit amounts are multiplied in decimal arithmetic; each charge line is rounded to two decimal places before summing.
- Currency display currently renders GBP with a pound sign and supports USD/EUR symbols; other codes are displayed as a code prefix.

### 4.2 Booking totals and charges

For booking `b`:

```text
base_total = total_override if present, otherwise imported total_amount
net_charge_total = Σ round(quantity × amount, 2) × (+1 for CHARGE, −1 for DEDUCTION)
booking_total = base_total + net_charge_total
linked_paid = Σ active linked Payment.direct_1
due = max(booking_total − linked_paid, 0)
```

Payment linkage prefers `booking_id`; if null, calculations use `(booking_reference, source_system)`. Soft-deleted payments are excluded.

Adding a charge increases the booking total and therefore increases due, subject to payments already recorded. A deduction reduces the total and due. The charge line itself is stored with a positive amount; its `kind` determines the sign. When a charge is deleted its amount ceases to affect the total, and the deletion event remains in the audit trail.

ETL cleaning also recomputes imported base booking revenue as Room/Unit Revenue plus remaining Other Revenue, drops canceled bookings whose total and paid amount are both zero, and clears the known dummy Other Revenue value of exactly 100. This cleaning happens at import normalization, before source values are stored.

### 4.3 Direct versus OTA total editability

The total override mutation inspects the immutable imported `source_data` value `Source` (falling back to `Method`):

- `Direct` or `Direct Booking` (case-insensitive) bookings may set a total override.
- OTA bookings are rejected by the server even if a client bypasses the disabled UI field. For OTA bookings, revenue changes must be represented as charge/deduction lines.
- The entered total represents the final total inclusive of current ad-hoc charge effects. The mutation stores a base override by subtracting the existing net charge total, preventing charges from being counted twice.
- The stored base override may not become negative after accounting for current lines.

### 4.4 Payment processing and backdating

Manual payment processing is a booking-card mutation, not a gateway charge. Accepted methods are exactly:

`Cash`, `Card`, `Bank transfer`, `Prepaid`, `On account`, `PayPal`, `External Card`.

Required input includes amount, method, and processed date. Relating-to categories are selectable from Damage Deposit, Early check-in, Early check-out, and Room rate. Card method additionally requires a description, card type, and exactly four card digits. Those digits are the masked suffix only.

Dates are accepted in `YYYY-MM-DD` format and validated as actual dates. The date may be in the past. The API checks amount is positive and does not exceed the current remaining booking balance, using a transaction and booking row lock to reduce conflicting edits. It inserts a payment row with `source_system = "manual"`, updates `manual_paid_amount`, and creates a `PAYMENT_PROCESSED` audit event in the same transaction.

### 4.5 Booking statuses and immutable ETL attributes

Workflow status changes update the booking status and `card_overrides.status`, and create an audit event recording prior/new status. The report status expression prefers the UI override and otherwise falls back to normalized/imported values.

Imported OTA reference and received/booking date are display-only source fields in the booking card; this application does not write changes back to Eviivo. Guest changes are overlays. Booking status changes affect this application’s state only and do not call a PMS API.

### 4.6 Financial status and the imported Paid Amount distinction

The Booking CSV’s `Paid Amount` is retained as an imported source field and can be shown in its own table column. For transaction-level aggregation, payment method columns, report payment total, payment-derived payment status, and booking-card paid/due amounts, the application uses linked `Payment.direct_1` transactions. Thus source Paid Amount and transaction paid amount are related but not interchangeable fields.

### 4.7 ETL behavior

The Drive sync Server Action requires an authenticated Supabase user; it does not require a workspace or membership. Google credentials and folder ID are configured server-side.

- CSV files are classified by filename: payment reports containing “Payment(s) Received”; booking reports for H&H/HH, Harbor/Harbour, or Orlando.
- Booking CSV parsing skips the first metadata row; the next header row is validated against the expected booking headers. `Check In` and `Check Out` are the only arrival/departure date sources; `Arrival` is retained as estimated-arrival-time text.
- Booking financial columns preserve `Room/Unit Revenue` as pure room revenue and `Other Revenue` as add-ons/deposits; stored total revenue is their sum. `See <parentRef>` / `C <parentRef>` paid-amount markers are stored as group links and resolved by allocating the parent's collected amount proportionally by room revenue. Payment transaction rows are not modified during this allocation.
- Crown BS Company is derived from the booking report filename and stored separately from the Property and CompanyName source fields.
- The payment source amount is the exact `Direct1` column.
- Rows are deduplicated in memory and written with PostgreSQL JSONB recordset bulk upserts in chunks of 250. Import issues are inserted in chunks of 500.
- Source upsert keys are `(source_system, booking_reference)` and `(source_system, payment_id)`.
- Payments are linked to bookings after imported files are handled, then group-booking paid amounts are reconciled without changing Payment CSV transactions.
- Import batch/file statuses and row counts/errors are persisted. Processed Drive files are renamed/suffixed so they are skipped on later syncs.
- The ETL action revalidates the Reports route after processing.

---

## 5. Development Milestones and History

This timeline is reconstructed from the repository history and the requirements implemented across the project. The earliest command/schema-approval conversation predates the currently visible short Git commit history; do not infer that every milestone is represented by an individual commit.

### Milestone 1 — Project foundation and normalized data model

- Established a Next.js App Router + TypeScript project with Prisma and Supabase.
- Created normalized Booking and Payment models while retaining source CSV payloads as JSONB for header fidelity.
- Kept first and last names separate in the database.
- Set monetary fields to Decimal/numeric types.
- Established the exact payment source mapping: `Direct1` is the amount of record for imported Payments.

### Milestone 2 — Authentication, profile, and Settings

- Added Supabase-backed authentication and protected Reports/Settings entry points.
- Implemented editable profile metadata for name, phone, and address; email remains read-only.
- Added private avatar upload/preview and user-scoped Supabase Storage policy migration.
- Moved account sign-out and Google Drive synchronization into Settings.
- Added accessible light/dark mode and global palette choices, with browser persistence.

### Milestone 3 — ETL and report import resilience

- Added Drive file discovery/download, CSV classification and validation, import batch/file/issue tracking, and idempotent upserts.
- Corrected booking CSV handling for the first metadata row and headers beginning on row 2.
- Corrected validation behavior for payment report CSVs versus booking reports.
- Added company derivation from filenames while preserving the CSV Property and CompanyName values.
- Replaced per-row DB writes with chunked bulk SQL upserts and set-based payment reconciliation.
- Normalized canceled-zero-value rows, the known dummy Other Revenue value, and booking revenue arithmetic.

### Milestone 4 — Reports performance and table controls

- Added date and property filters backed by URL search parameters.
- Set the initial date range to the current calendar month.
- Expanded the property list to include distinct booking Property and payment `business_name`/property data.
- Added SQL summaries, server pagination, and server-side filtering so the browser does not need all historical rows.
- Built sorting, per-column filtering/search, visibility toggles, and explicit column ordering.
- Replaced separate visible guest first/last columns with a computed, filterable and sortable Guest Name column.
- Added transaction-linked payment-method aggregation and generated columns from methods present in the filtered dataset.
- Removed zero-total payment method columns.
- Resolved server-wide filter semantics so filters are applied to matching IDs before pagination rather than only to currently visible page rows.

### Milestone 5 — Booking card and cross-report linking

- Added a global debounced search by guest name, booking reference, and OTA reference.
- Added a multi-window Booking Card drawer with Summary, Cards, Guest, Charges & Deductions, Payments, Bill, and Comms tabs.
- Added group booking switching, fixed workflow/footer actions, editable guest overlays, Direct-only total overrides, charge/deduction management, and manual payments with backdating.
- Added user/time history for charge/payment actions and booking-card audit events.
- Linked clickable booking and resolvable payment rows to their Booking Card.
- Ensured post-mutation behavior remains in the drawer, refreshes server data, and uses descriptive success/error notifications.
- Kept full card PAN out of the application; only masked last-four details are collected or displayed.
- Implemented print-ready billing and mailto draft behavior as available local actions, with explicit limitations on actual delivery.

### Milestone 6 — Migration application and stale Prisma Client incident

- Reconciled an existing configured Supabase schema with checked-in migration history only after inspecting live tables/columns and the actual Prisma diff. Existing schema migrations were marked applied rather than replaying destructive baseline/workspace SQL.
- Applied the additive Booking Card audit migration and verified schema parity.
- Diagnosed a local dashboard server error caused by a stale generated Prisma Client that did not include the newly migrated `BookingCharge.quantity` and `kind` fields.
- Regenerated Prisma Client, stopped the identified local server process, cleared the generated Next.js development cache, and verified the authenticated dashboard returned report data.

### Milestone 7 — Per-user Saved Table Views

- Added `TableView` schema and a composite unique constraint scoped to user, table, and name.
- Added authenticated list/get/create Server Actions with user ownership checks and Zod validation.
- Provisioned the minimal Prisma `User` row when first creating a saved layout to satisfy the relational foreign key without coupling Supabase Auth itself to the local profile model.
- Added separate Saved Views controls for Bookings and Payments, a Default View option, a save-name dialog, and success/error toast feedback.
- Stored active view IDs in `active_view_BookingsReport` and `active_view_PaymentsReport` localStorage keys; layouts themselves are fetched from PostgreSQL.
- Applied `20261007030000_saved_table_views` to the configured Supabase database and verified migration status plus an empty schema diff.
- Ran a browser smoke test of save, fetch, apply, and reload restoration; deleted the temporary test view afterward.

### Current exact repository state

- The Saved Table Views implementation was committed as `9d8a8cb` (`feat: add persistent table views and system blueprint`); its additive migration is `20261007030000_saved_table_views`.
- The hydration-warning suppression was subsequently committed as `11b0a3c` (`fix: suppress browser extension hydration warning`).
- The booking-card implementation was delivered in PR #3, and Saved Table Views and this blueprint were delivered in PR #4. Those pull requests were merged into `main`.
- At the time of the Saved Views change, Prisma validation, TypeScript, ESLint, the production build, diff checks, migration status, database schema parity, and a browser save/apply/reload smoke test passed.
- Git commit and pull-request status are snapshots, not deployment health indicators. Check the repository and Vercel deployment before using this section as a statement of current release state.

---

## 6. Developer Quickstart and Workflow Runbook

### 6.1 Local development setup

From PowerShell, clone the repository and install dependencies:

```powershell
git clone https://github.com/TAlhashmi102/Back-Office-ETL-PipeLine.git
Set-Location Back-Office-ETL-PipeLine
npm install
Copy-Item .env.example .env
```

Edit `.env` with credentials for the intended development Supabase project. The application expects:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooler connection for Prisma application queries |
| `DIRECT_URL` | Direct Supabase PostgreSQL connection used by Prisma schema/migration operations |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key used by the current Auth client |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Drive integration service-account identity |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Matching private key; keep it server-only and encode newlines as `\n` if needed |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive folder containing the report CSV files |

The checked-in `.env.example` provides placeholder formats for the two PostgreSQL URLs. Obtain Supabase and Google credentials from their respective project settings; do not copy production secrets into a local development environment unless explicitly authorized. Never commit `.env`.

Generate the Prisma Client and start the development server:

```powershell
npx prisma migrate deploy
npx prisma generate
npm run dev
```

`npx prisma migrate deploy` applies checked-in migrations that are pending on the configured development database. Confirm both database URLs target the intended development project before running it. Open `http://localhost:3000` and sign in with a Supabase Auth account provisioned for the project. The Reports dashboard is currently served at `/`; there is no separate `/reports` route.

### 6.2 Schema-change workflow

Use a development database, not Production, when authoring a migration:

1. Update `prisma/schema.prisma` and review all affected relations, Decimal precision, indexes, and constraints.
2. Validate the schema and generate/apply a named migration:

   ```powershell
   npx prisma validate
   npx prisma migrate dev --name descriptive_change_name
   npx prisma generate
   ```

   `prisma migrate dev` creates and applies the migration against the configured development database. Verify `DATABASE_URL` and `DIRECT_URL` point to the intended non-production project before running it. Inspect the generated SQL under `prisma/migrations/`; do not edit migration history by marking migrations applied unless the live schema has independently been verified.
3. Update related Server Actions, queries, UI, and documentation. Keep money in Prisma `Decimal`/PostgreSQL numeric types and write audit records in the same transaction as the mutation they describe.
4. Verify the migration status and run the project checks:

   ```powershell
   npx prisma migrate status
   npx tsc --noEmit
   npm run lint
   npm run build
   git diff --check
   ```

5. Smoke-test the changed behavior locally, including database reads/writes when relevant. Remove temporary test data.
6. Commit and push the reviewed branch, then open or update a pull request. Apply Production migrations through the approved release workflow using `npx prisma migrate deploy`; never use `migrate dev` or `migrate reset` against Production.

### 6.3 Code review and release path

Push feature work to its branch and use a pull request for review and merge into `main`. The Vercel project must be connected to this GitHub repository with `main` configured as its Production Branch and automatic deployments enabled. Under that configuration, a push to `main`—normally the merge commit from an approved pull request—triggers a Production deployment. Confirm the Vercel deployment reached Ready and run the Production smoke checks in Section 7; a successful Git push alone does not prove the deployment or database is healthy.

## 7. Production Deployment Checklist (Vercel)

### 7.1 Environment variables and database connections

Configure variables in Vercel **Project Settings → Environment Variables** for the correct targets. Production values must be present in the Production environment; Preview values should be configured separately if Preview deployments are expected to connect to a database.

- **`DATABASE_URL`**: Supabase pooler hostname, normally port **6543**, for application queries. Use the pooler connection string and its required connection parameters (the repository example includes `pgbouncer=true` and `connection_limit=1`).
- **`DIRECT_URL`**: Supabase direct database hostname, port **5432**, for Prisma migration/administrative connections. Keep direct connectivity server-side.
- **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**: Values from the matching Supabase project. The publishable key is intentionally public; do not put a Supabase service-role key in a `NEXT_PUBLIC_` variable or expose it to the browser.
- **`GOOGLE_SERVICE_ACCOUNT_EMAIL`**, **`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`**, and **`GOOGLE_DRIVE_FOLDER_ID`**: Server-only Drive credentials and folder configuration. Share the intended Drive folder with that service account. Never expose the private key using a `NEXT_PUBLIC_` variable.

Do not paste secrets into commits, issue comments, or logs. Check that the database URLs and Supabase keys all refer to the same intended Supabase project and environment.

**A change to a Vercel environment variable does not update an already-built deployment.** After adding or changing variables, trigger a manual **Redeploy** of the relevant deployment (or push a new commit that creates a deployment). Verify the new deployment is Ready before testing; redeploying an old build uses the current configured environment values.

### 7.2 Post-deployment smoke test

After the Production deployment is Ready:

1. Open the Vercel Production URL in a fresh browser session. Confirm the sign-in screen loads without a server error.
2. Sign in with a valid Supabase Auth account. The current authenticated Reports dashboard route is `/` (for example, `/?from=YYYY-MM-DD&to=YYYY-MM-DD`); `/reports` is not a route in the current App Router. Confirm the dashboard loads and displays report rows/summary values, which exercises the server-side Prisma `DATABASE_URL` connection and report queries.
3. Open Settings and confirm the authenticated settings/profile page loads.
4. Verify Google Drive configuration safely: confirm the folder is shared with the configured service-account email and that the Drive API is enabled. To test an actual synchronization, use a designated test folder or first verify which CSVs will be processed. A successful sync imports rows and renames processed Drive files with `_processed.csv`; do not trigger it against production files unless that import and rename behavior is intended.
5. If any step returns a server error, inspect the matching Vercel Production Runtime Logs and deployment ID. Check the timestamp, route, request ID, missing-variable messages, and Prisma/Google API exception before changing data or retrying a sync.

Successful sign-in alone is not sufficient verification: the authenticated report route performs database work that the signed-out screen does not.

## 8. Operational Guide and Known Limitations

### 8.1 Required configuration

Use `.env` locally and do not commit its contents. The application requires the variables listed in Section 6.1. Keep Google service-account credentials server-only.

### 8.2 Safe schema workflow

1. Inspect `prisma/schema.prisma` and the next migration directory.
2. Run `npx prisma validate`.
3. Compare schema and live datasource when appropriate with `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`.
4. Apply reviewed additive migrations with `npx prisma migrate deploy`.
5. Verify using `npx prisma migrate status` and an empty schema diff.
6. Regenerate the Prisma Client after schema changes with `npx prisma generate`. If Windows reports `EPERM` renaming the engine DLL, stop only an identified process holding it; do not kill processes by executable name.

**Historical migration snapshot:** Seven migrations were recorded as applied to the configured Supabase database as of **October 7, 2026**, with schema parity reported at that time. This is not a claim about the current Production database or any later environment. Always run `npx prisma migrate status` with the intended environment's connection variables to check current status, and confirm the target Supabase project before any migration command.

### 8.3 Important implementation limits

- There is no workspace/membership authorization system. Any authenticated account can use the Drive sync and current booking actions, subject to the implemented authentication checks.
- The application is not wired to Eviivo write APIs. Booking workflow status, guest details, totals, charges, and payments update this database only.
- Manual payment creation records a transaction in the database; it does not capture funds or call a card processor.
- The Card tab retains at most masked last-four metadata, not full card numbers.
- “Download PDF” uses the browser print flow / Save as PDF; no PDF-generation service is configured.
- “Send to email” opens a `mailto:` draft; it does not send mail from the server.
- Comms has no configured provider or persisted communication timeline and is an empty placeholder.
- Table Saved Views currently persist visibility/order only. They do not preserve column filters, sorting, global date/property filters, or pagination.
- Profile metadata and avatar storage are sourced from Supabase Auth/Storage, not automatically synchronized into every column of `public.users`.
- Browser-local theme preferences and the active Saved View ID are per-browser storage. A database layout may be shared across a user’s devices, but the choice of which view is active is local to each browser.
- The UI's report date ranges are independent by report domain: bookings use arrival/check-in; payment report rows use payment/received date. Booking financial summaries roll up linked transactions for bookings in the active booking window, including linked transactions outside the payment table's selected received-date page window.
- The original README's statement that imported Booking `Paid Amount` determines due/status is older than the current code. For current reports and the booking card, linked `Payment.direct_1` records determine transaction paid and due values.
- Client view application loads the saved layout through an authenticated server action after the component reads localStorage; it is an in-place table update, not a full route navigation.

### 8.4 Validation checklist

Run the smallest relevant checks after changes, and use the full set before a release:

```powershell
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
git diff --check
npx prisma migrate status
```

For any feature that affects persistence, also smoke-test against a known authenticated session and verify the database write/read behavior. Remove temporary test data afterward.

---

## 9. Architecture Invariants for Future Work

1. Do not add a workspace or membership dependency unless the product explicitly reverses its current no-workspace requirement.
2. Keep ETL source payloads immutable under manual edits; use typed normalized fields and/or explicit JSON overlay columns.
3. Never use JavaScript `number` arithmetic as the authoritative calculation for currency.
4. Treat a booking reference as source-scoped; joins must include `source_system` unless a stable booking ID is available.
5. Authenticate and validate every server action/API input server-side. Never trust `user_id`, actor email, or ownership supplied by the browser.
6. Keep edits, financial calculations, audit writes, and transaction insertion atomic where they form one business mutation.
7. Keep server-side pagination and global filtering in the database as report volumes grow.
8. Add new table-layout persistence by logical table name and user scope; validate stored JSON against current column IDs when applying future schema changes.
9. Do not claim a downstream integration (payment gateway, Eviivo writeback, email, PDF service, or communications history) is implemented until it is actually configured and verified.
10. Update this blueprint and any affected operational docs when schema, authentication, source mappings, financial rules, migrations, or persistence ownership changes.
