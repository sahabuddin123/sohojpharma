# SohojPharma — Disaster Recovery Runbook

**Version:** 1.0 | **Audience:** Ops / On-call | **RTO:** ≤ 1 h | **RPO:** ≤ 24 h

## 1. Backup Source
- **Primary:** Lovable Cloud managed Postgres — automated daily snapshots retained 7 days.
- **Storage buckets:** versioned object storage, 30-day soft delete.
- **Schema migrations:** version-controlled under `supabase/migrations/`.

## 2. Restore Process
1. Open project → **Backend → Database → Backups**.
2. Select snapshot closest to incident time (before corruption).
3. Click **Restore** → confirm. Provisioning ~5–15 min.
4. Update `.env` only if URL/keys changed (managed Cloud retains keys).
5. Re-deploy app: `Publish` to push latest code against restored DB.
6. Storage: restore objects from versioned bucket via Storage UI.

## 3. Verification Checklist
- [ ] `/api/public/hooks/healthcheck` returns `status: healthy`.
- [ ] Login flow works (email + Google).
- [ ] POS checkout completes with FEFO batch pick.
- [ ] `SELECT COUNT(*) FROM sales WHERE created_at > now() - interval '7 day';` matches expectations.
- [ ] `SELECT COUNT(*) FROM journal_entries WHERE created_at > now() - interval '7 day';`.
- [ ] Expired-batch trigger blocks test sale.

## 4. Reconciliation Validation
Run after restore:
```sql
-- AP vs GL variance must be 0
SELECT
  (SELECT COALESCE(SUM(closing_balance),0) FROM v_supplier_ledger)
  -
  (SELECT COALESCE(SUM(credit-debit),0) FROM journal_lines WHERE account_code='2000')
  AS ap_gl_variance;

-- Inventory vs GL 1200
SELECT
  (SELECT COALESCE(SUM(qty_on_hand * unit_cost),0) FROM batches WHERE status='active')
  -
  (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE account_code='1200')
  AS inv_gl_variance;
```
Both must equal 0. If non-zero → run `backfill_supplier_journals(tenant_id)`.

## 5. RTO / RPO
| Metric | Target | Notes |
|---|---|---|
| RTO (Recovery Time) | ≤ 1 hour | Includes restore + verification |
| RPO (Recovery Point) | ≤ 24 hours | Daily snapshot frequency |
| MTTR | ≤ 30 min | For app-level (non-DB) incidents |

## 6. Escalation
- L1: Pharmacy admin → Reset cache, retry.
- L2: Workspace admin → Check healthcheck, restart Cloud instance.
- L3: Lovable support → Snapshot restore required.
