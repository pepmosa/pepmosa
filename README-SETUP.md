# PEPMOSA NEW — Vercel + Supabase

This is the NEW architecture. The old Apps Script/Google Sheet files are reference only.

## 1. Supabase
1. Create a new Supabase project.
2. Open SQL Editor.
3. Run `supabase-schema.sql`.
4. Create your admin user under Authentication > Users.
5. Insert that user's id into `profiles` and set `is_admin=true`.
6. Copy the Project URL and anon/public key into `config.js`.

## 2. GitHub
Upload the files in this package to the root of the new `pepmosa/pepmosa` repository.

Do NOT upload any service_role key.

## 3. Vercel
Import the GitHub repository.
Framework: Other.
Root: ./.
No build command is required.

## 4. GB minimum quantity
In Supabase table `gb_minimum_quantities`, create one row for every GB + product + variant.
Example:
GB-001 | TIRZ | TIRZ-15 | 2
GB-001 | TIRZ | TIRZ-30 | 1

The storefront reads this value and uses it as the minimum for that exact variant.

## 5. Kit Completion
Kit Completion is separate from the GB minimum. `kit_inventory.remaining_qty` may be 1.
The RPC `reserve_kit_units()` uses a row lock (`FOR UPDATE`) so two simultaneous customers cannot reserve the same remaining vial.

IMPORTANT: the current package includes the secure atomic reservation function and the admin stock UI. The final customer-facing Kit Completion purchase flow should call that RPC immediately before creating the corresponding paid/checkout record.

## 6. Existing old site
The old site had a separate customer storefront, admin control center, calculator, protocols, tracking and COA pages. This new package keeps that page structure while replacing the Google Apps Script backend with Supabase.
