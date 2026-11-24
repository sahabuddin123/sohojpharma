# SohojPharma — Pilot Operations Checklist

## Daily Monitoring (per pharmacy)
| Metric | Source | Threshold | Action |
|---|---|---|---|
| Sales / day | `sales` table | > 0 | Investigate if 0 mid-day |
| Invoice failures | `error_logs` cat=`checkout` | < 1% | Open ticket if > 5 |
| Journal failures | `job_failures` | 0 | Run `backfill_supplier_journals` |
| Stock variances | `batch_adjust` reasons=`shrinkage` | < 0.5% | Audit batch |
| Expired alerts | `notifications` cat=`expiry` | reviewed daily | Block sale at POS |
| Recall events | `batch_recalls` | logged + ack'd | Customer notification |
| Support tickets | `support_tickets` open | < 5 | Triage within 4 h |
| User issues | feedback channel | | Daily standup |

## Pre-Go-Live Checklist
- [ ] Tenant provisioned + branches/warehouses configured
- [ ] Chart of Accounts seeded (1200, 2000, 3000, 4000, etc.)
- [ ] Opening balances posted (`backfill_supplier_journals`)
- [ ] Initial stock imported (Import Module) — FEFO indexes confirmed
- [ ] Staff users + roles assigned (owner, manager, pharmacist, cashier)
- [ ] POS device tested with barcode scanner + thermal printer
- [ ] Cash register opening balance set
- [ ] Backup verified (test restore done in past 7 days)
- [ ] Healthcheck monitor configured (UptimeRobot / BetterStack)
- [ ] Sentry DSN set in `VITE_SENTRY_DSN`
- [ ] Owner trained on recall + expiry workflow

## Rollout Phases
| Phase | Pharmacies | Duration | Exit Criteria |
|---|---|---|---|
| Pilot-1 | 1 | 2 weeks | 0 P1 bugs, daily reconciliation = 0 |
| Pilot-3 | 3 | 3 weeks | Multi-tenant isolation verified, support < 5 tickets/day |
| Rollout-10 | 10 | 4 weeks | p95 stable, NPS > 7, churn = 0 |
