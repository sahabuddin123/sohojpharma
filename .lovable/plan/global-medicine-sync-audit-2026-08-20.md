# Global Medicine Sync Audit

## Findings
- **Auto-Provisioning Works on Registration**: The trigger `trg_auto_catalog_on_branch` successfully calls `provision_catalog_for_tenant` when the first branch is created.
- **Approval Filter**: `provision_catalog_for_tenant` ONLY imports medicines where `approved = true`.
- **Sync Gap**: If 32k+ medicines exist but only 160 are showing in new stores, it's highly likely that only 160 medicines are marked as `approved = true` in `public.global_medicines`.
- **The "32608" Count**: The Admin UI count likely reflects *total* medicines (including those pending review or auto-contributed but not yet approved).

## Plan
1. **Verify Approved Count**: Run a query to see how many medicines are actually approved.
2. **Bulk Approval (If requested/needed)**: If the user expects all 32k to be available, they need to be approved.
3. **Manual Provisioning**: Provide a way to re-run provisioning for existing stores that missed the initial batch or were created before the catalog was populated.
4. **Fix UI Stats**: Ensure the Admin Dashboard clearly distinguishes between "Total Medicines" and "Approved/Live Medicines".
