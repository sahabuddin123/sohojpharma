# Global Medicine Network Synchronization Plan

The goal is to ensure that whenever a unique medicine is added to any store (tenant), it is automatically synchronized to the Admin/Global Catalog. This includes the product name, generic name, manufacturer, strength, dosage form, and price.

## User Interface (Admin Dashboard)
- **Global Catalog Admin Page**: Add a "Sync & Push All" button to the Backfill tab.
- This button will:
    1. Run the backfill chunked loop (captures all tenant products into global metadata).
    2. Trigger a new `push_global_medicines_to_tenants` RPC that links products across all stores.

## Backend Logic (Supabase)
### 1. Auto-Contribution Trigger
- Create a trigger `trg_auto_contribute_global` on the `products` table.
- When a new product is inserted, if it doesn't have a `global_medicine_id`, it will call `public.contribute_global_medicine` automatically.
- This ensures every new product is at least queued or matched in the global catalog immediately.

### 2. Global Sync & Push RPC
- Create `public.sync_and_push_global_catalog()`:
    - Runs a comprehensive backfill (like the existing chunked one but optimized for a single-shot if possible, or we continue using the client-side loop for safety).
    - Links all products in all tenants that match the new global medicines.

## Technical Details

### Database Migration
1. **Trigger Function**: `public.auto_contribute_product_to_global()`
    - Checks if `global_medicine_id` is null.
    - Extracts brand, generic, manufacturer, strength, form.
    - Calls `contribute_global_medicine`.
2. **Trigger**: `trg_auto_contribute_on_product` ON `products` FOR EACH ROW.
3. **RPC**: `public.push_global_catalog_to_all_tenants()`
    - A simple procedure to re-run the linking logic for all products across all tenants.

### Frontend Integration
- Update `src/routes/admin.global-catalog.tsx`:
    - Add a "Sync & Push to All Stores" action.
    - This will provide the "one click" experience requested.
