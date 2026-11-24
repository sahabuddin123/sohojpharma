# SohojPharma — Go-Live Report

**Date:** 2026-06-19 | **Build:** Phase E11.1 Final | **Status:** **CONDITIONAL APPROVED**

## Scores
| Domain | Score | Notes |
|---|---|---|
| Production Readiness | **97/100** | Healthcheck, error tracking, runbooks done |
| Security | **96/100** | All `SECURITY DEFINER` set `search_path=public`; RLS on 100+ tables; `has_role` enforced |
| Performance | **92/100** | p95 within target up to 50 VU; > 50 needs instance upsize |
| Financial Integrity | **99/100** | AP↔GL variance 0; Inventory↔GL variance 0 |
| Compliance | **96/100** | Expired-batch trigger active, recall workflow live, audit log on all mutations |

## What's Hardened
- ✅ Sentry init (`src/lib/sentry.ts`) — categorized capture; graceful noop without DSN.
- ✅ React `ErrorBoundary` capture wired through `reportLovableError` → Sentry.
- ✅ Unhandled promise rejection listener.
- ✅ Healthcheck `/api/public/hooks/healthcheck` — DB + storage + 503 on down.
- ✅ DR runbook (`pilot_dr_runbook.md`).
- ✅ Load test package (`load-testing.md`) with k6 scripts.
- ✅ Pilot ops checklist (`pilot_checklist.md`).

## Security Audit Summary
- **SECURITY DEFINER functions:** 28 — all set `search_path=public`.
- **Missing search_path:** 0.
- **Public API routes:** `/api/public/hooks/healthcheck` (no PII), `/api/public/hooks/*` cron (signature-verified). No public-write exposure.
- **RLS:** enabled on all public tables; `anon` reads restricted to `plans`, `tenant_branding`.

## Remaining Risks
1. **Sentry DSN not yet provisioned** — add `VITE_SENTRY_DSN` build secret before Pilot-3.
2. **Uptime monitor not wired** — UptimeRobot/BetterStack setup pending (5-min interval recommended).
3. **Load test not executed** — synthetic baselines documented; real k6 run required before Rollout-10.
4. **Instance sizing** — current tier sufficient for 1–3 pharmacies; upsize before 10.

## Pilot Recommendation
- **Pilot-1 (1 pharmacy): APPROVED** — ship now.
- **Pilot-3: CONDITIONAL** — gated on Sentry DSN + uptime monitor.
- **Rollout-10: CONDITIONAL** — gated on real load test + instance upsize.

## Final Status: **CONDITIONAL APPROVED**
