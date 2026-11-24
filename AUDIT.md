# System Audit Report

_Generated automatically — 107 route files across 23 modules._


**Overall production readiness: 31%** — READY: 13 · PARTIAL: 31 · MISSING: 63

## Legend

- **UI**: i18n+loading+error/empty states  
- **DB/API**: supabase client + useQuery wiring + tenant_id scoping  
- **Logic**: mutations + business operations  
- **Security**: tenant scoping present (RLS enforced at DB)  
- **Prod %**: weighted score (0–100)


## Summary by module

| Module | Files | Avg % | READY | PARTIAL | MISSING |
|---|---:|---:|---:|---:|---:|
| **accounts** | 10 | 53% | 1 | 7 | 2 |
| **admin** | 11 | 20% | 0 | 3 | 8 |
| **auth** | 1 | 40% | 0 | 0 | 1 |
| **customers** | 3 | 31% | 1 | 0 | 2 |
| **developer** | 6 | 5% | 0 | 0 | 6 |
| **dues** | 4 | 62% | 2 | 1 | 1 |
| **index** | 1 | 10% | 0 | 0 | 1 |
| **inventory** | 4 | 38% | 1 | 1 | 2 |
| **invoices** | 4 | 38% | 0 | 3 | 1 |
| **mobile** | 1 | 10% | 0 | 0 | 1 |
| **ops** | 10 | 13% | 1 | 0 | 9 |
| **pharmacy** | 6 | 35% | 0 | 4 | 2 |
| **prescriptions** | 3 | 50% | 1 | 1 | 1 |
| **procurement** | 3 | 40% | 1 | 0 | 2 |
| **products** | 4 | 25% | 1 | 0 | 3 |
| **purchases** | 3 | 23% | 0 | 1 | 2 |
| **quotations** | 3 | 55% | 1 | 1 | 1 |
| **reports** | 11 | 46% | 1 | 6 | 4 |
| **sales** | 3 | 33% | 1 | 0 | 2 |
| **settings** | 1 | 5% | 0 | 0 | 1 |
| **staff** | 11 | 20% | 0 | 3 | 8 |
| **store** | 1 | 5% | 0 | 0 | 1 |
| **suppliers** | 3 | 31% | 1 | 0 | 2 |

## Per-page detail


### accounts

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `accounts.audit.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `accounts.banks.tsx` | ❌✅❌ | ❌ | ✅✅ | ❌ | 0 | 60% | PARTIAL |
| `accounts.cashbook.tsx` | ❌✅❌ | ❌ | ✅✅ | ❌ | 0 | 60% | PARTIAL |
| `accounts.chart.tsx` | ❌✅❌ | ❌ | ✅✅ | ❌ | 0 | 55% | PARTIAL |
| `accounts.day-closing.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 70% | PARTIAL |
| `accounts.expenses.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 60% | PARTIAL |
| `accounts.income.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 60% | PARTIAL |
| `accounts.index.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 70% | PARTIAL |
| `accounts.ledger.tsx` | ❌✅❌ | ✅ | ✅✅ | ❌ | 0 | 85% | READY |
| `accounts.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### admin

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `admin.advertisements.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `admin.index.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 65% | PARTIAL |
| `admin.payments.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 10% | MISSING |
| `admin.profile.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `admin.reports.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `admin.roles.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `admin.settings.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `admin.stores.tsx` | ❌✅❌ | ✅ | ✅❌ | ❌ | 0 | 60% | PARTIAL |
| `admin.subscriptions.tsx` | ❌✅❌ | ✅ | ✅❌ | ❌ | 0 | 60% | PARTIAL |
| `admin.support.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `admin.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### auth

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `auth.tsx` | ✅❌❌ | ✅ | ❌❌ | ❌ | 0 | 40% | MISSING |

### customers

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `customers.$id.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `customers.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ✅ | 0 | 85% | READY |
| `customers.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### developer

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `developer.analytics.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `developer.docs.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `developer.index.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `developer.keys.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `developer.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `developer.webhooks.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### dues

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `dues.collections.tsx` | ❌✅❌ | ✅ | ✅✅ | ✅ | 0 | 85% | READY |
| `dues.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ✅ | 0 | 85% | READY |
| `dues.ledger.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 75% | PARTIAL |
| `dues.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### index

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `index.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 10% | MISSING |

### inventory

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `inventory.control.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 60% | PARTIAL |
| `inventory.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ❌ | 0 | 85% | READY |
| `inventory.reports.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `inventory.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### invoices

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `invoices.$id.tsx` | ❌❌❌ | ❌ | ✅✅ | ❌ | 0 | 45% | PARTIAL |
| `invoices.index.tsx` | ❌✅❌ | ❌ | ✅✅ | ❌ | 0 | 60% | PARTIAL |
| `invoices.settings.tsx` | ❌❌❌ | ❌ | ✅✅ | ❌ | 0 | 45% | PARTIAL |
| `invoices.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### mobile

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `mobile.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 10% | MISSING |

### ops

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `ops.audit.tsx` | ❌✅❌ | ✅ | ✅✅ | ❌ | 0 | 85% | READY |
| `ops.automation.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `ops.backup.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 1 | 0% | MISSING |
| `ops.health.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `ops.index.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `ops.offline.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 10% | MISSING |
| `ops.reminders.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 10% | MISSING |
| `ops.security.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 1 | 0% | MISSING |
| `ops.sharing.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `ops.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### pharmacy

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `pharmacy.bonus.tsx` | ❌❌❌ | ❌ | ✅✅ | ❌ | 0 | 50% | PARTIAL |
| `pharmacy.index.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `pharmacy.tax-reports.tsx` | ❌❌❌ | ❌ | ✅✅ | ❌ | 0 | 45% | PARTIAL |
| `pharmacy.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `pharmacy.units.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 55% | PARTIAL |
| `pharmacy.vat.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 55% | PARTIAL |

### prescriptions

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `prescriptions.$id.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 60% | PARTIAL |
| `prescriptions.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ❌ | 0 | 85% | READY |
| `prescriptions.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### procurement

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `procurement.$id.tsx` | ❌✅❌ | ❌ | ✅❌ | ✅ | 0 | 30% | MISSING |
| `procurement.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ✅ | 0 | 85% | READY |
| `procurement.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### products

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `products.$id.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `products.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ❌ | 0 | 85% | READY |
| `products.new.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `products.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### purchases

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `purchases.index.tsx` | ❌✅❌ | ❌ | ✅✅ | ❌ | 0 | 60% | PARTIAL |
| `purchases.new.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `purchases.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### quotations

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `quotations.$id.tsx` | ❌❌❌ | ✅ | ✅✅ | ✅ | 0 | 75% | PARTIAL |
| `quotations.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ✅ | 0 | 85% | READY |
| `quotations.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### reports

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `reports.analytics.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `reports.cashflow.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 70% | PARTIAL |
| `reports.customers.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 75% | PARTIAL |
| `reports.health.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `reports.index.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 70% | PARTIAL |
| `reports.insights.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `reports.payments.tsx` | ❌❌❌ | ❌ | ✅✅ | ❌ | 0 | 50% | PARTIAL |
| `reports.pnl.tsx` | ❌✅❌ | ✅ | ✅✅ | ❌ | 0 | 80% | READY |
| `reports.products.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 75% | PARTIAL |
| `reports.suppliers.tsx` | ❌❌❌ | ✅ | ✅✅ | ❌ | 0 | 75% | PARTIAL |
| `reports.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### sales

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `sales.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ❌ | 0 | 85% | READY |
| `sales.pos.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 10% | MISSING |
| `sales.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### settings

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `settings.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### staff

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `staff.activity.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `staff.attendance.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 60% | PARTIAL |
| `staff.index.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `staff.leave.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `staff.list.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 60% | PARTIAL |
| `staff.payroll.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `staff.performance.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `staff.roles.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `staff.security.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `staff.shifts.tsx` | ❌✅❌ | ❌ | ✅✅ | ✅ | 0 | 60% | PARTIAL |
| `staff.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### store

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `store.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

### suppliers

| Page | UI (i18n/load/err) | DB (sb) | API (qry/tenant) | Logic (mut) | Mock | Prod % | Status |
|---|---|---|---|---|---:|---:|---|
| `suppliers.$id.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |
| `suppliers.index.tsx` | ❌✅❌ | ✅ | ✅✅ | ✅ | 0 | 85% | READY |
| `suppliers.tsx` | ❌❌❌ | ❌ | ❌❌ | ❌ | 0 | 5% | MISSING |

## Cross-cutting findings

- Files with `// TODO` or `// FIXME`: **0** 
- Files with inline mock arrays (`const mock`): **0** 
- Files using Supabase client: **33** 
- Files using `useAuth`: **45** 
- Files using `useTranslation`: **3** 

## Database & Security (snapshot)

- 55 public tables, all with RLS policies present (per project schema snapshot).
- Tenant isolation enforced via `is_tenant_member(auth.uid(), tenant_id)` + per-table policies; verified by `test_tenant_isolation()` SQL harness.
- Sensitive flows go through SECURITY DEFINER functions: `pos_checkout`, `pos_return`, `grn_receive`, `post_journal`, `post_ledger_entry`, `inventory_adjust`.
- Auth: email/password + Google (via Lovable broker). No anonymous sign-ups.
- Storage: `prescriptions` bucket is private.
- Outstanding security to-dos picked up by the per-page scan above (tenant filter missing, mock data, no i18n) are listed per row.

## Auto-fix queue (driven by status)

- **Slice J — accounts**: `accounts.audit.tsx`, `accounts.banks.tsx`, `accounts.cashbook.tsx`, `accounts.chart.tsx`, `accounts.day-closing.tsx`, `accounts.expenses.tsx`, `accounts.income.tsx`, `accounts.index.tsx`, `accounts.tsx`
- **Slice K — admin**: `admin.advertisements.tsx`, `admin.index.tsx`, `admin.payments.tsx`, `admin.profile.tsx`, `admin.reports.tsx`, `admin.roles.tsx`, `admin.settings.tsx`, `admin.stores.tsx`, `admin.subscriptions.tsx`, `admin.support.tsx`, `admin.tsx`
- **Slice L — auth**: `auth.tsx`
- **Slice M — customers**: `customers.$id.tsx`, `customers.tsx`
- **Slice N — developer**: `developer.analytics.tsx`, `developer.docs.tsx`, `developer.index.tsx`, `developer.keys.tsx`, `developer.tsx`, `developer.webhooks.tsx`
- **Slice O — dues**: `dues.ledger.tsx`, `dues.tsx`
- **Slice P — index**: `index.tsx`
- **Slice Q — inventory**: `inventory.control.tsx`, `inventory.reports.tsx`, `inventory.tsx`
- **Slice R — invoices**: `invoices.$id.tsx`, `invoices.index.tsx`, `invoices.settings.tsx`, `invoices.tsx`
- **Slice S — mobile**: `mobile.tsx`
- **Slice T — ops**: `ops.automation.tsx`, `ops.backup.tsx`, `ops.health.tsx`, `ops.index.tsx`, `ops.offline.tsx`, `ops.reminders.tsx`, `ops.security.tsx`, `ops.sharing.tsx`, `ops.tsx`
- **Slice U — pharmacy**: `pharmacy.bonus.tsx`, `pharmacy.index.tsx`, `pharmacy.tax-reports.tsx`, `pharmacy.tsx`, `pharmacy.units.tsx`, `pharmacy.vat.tsx`
- **Slice V — prescriptions**: `prescriptions.$id.tsx`, `prescriptions.tsx`
- **Slice W — procurement**: `procurement.$id.tsx`, `procurement.tsx`
- **Slice X — products**: `products.$id.tsx`, `products.new.tsx`, `products.tsx`
- **Slice Y — purchases**: `purchases.index.tsx`, `purchases.new.tsx`, `purchases.tsx`
- **Slice Z — quotations**: `quotations.$id.tsx`, `quotations.tsx`
- **Slice [ — reports**: `reports.analytics.tsx`, `reports.cashflow.tsx`, `reports.customers.tsx`, `reports.health.tsx`, `reports.index.tsx`, `reports.insights.tsx`, `reports.payments.tsx`, `reports.products.tsx`, `reports.suppliers.tsx`, `reports.tsx`
- **Slice \ — sales**: `sales.pos.tsx`, `sales.tsx`
- **Slice ] — settings**: `settings.tsx`
- **Slice ^ — staff**: `staff.activity.tsx`, `staff.attendance.tsx`, `staff.index.tsx`, `staff.leave.tsx`, `staff.list.tsx`, `staff.payroll.tsx`, `staff.performance.tsx`, `staff.roles.tsx`, `staff.security.tsx`, `staff.shifts.tsx`, `staff.tsx`
- **Slice _ — store**: `store.tsx`
- **Slice ` — suppliers**: `suppliers.$id.tsx`, `suppliers.tsx`