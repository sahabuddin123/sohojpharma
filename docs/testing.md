# SohojPharma Testing & QA

Sprint **B5** establishes the testing baseline. This doc tracks the rolling status of each B5 sub-task across multi-turn implementation.

## Stack

| Layer | Tool | Config |
|---|---|---|
| Unit / component | Vitest + React Testing Library + jsdom | `vitest.config.ts`, setup in `tests/setup.ts` |
| Integration (DB / RPC) | Vitest, hitting Postgres functions via `supabase-js` | `tests/integration/**` |
| E2E | Playwright (Chromium) | `playwright.config.ts`, specs in `e2e/**` |
| Coverage | `@vitest/coverage-v8` (text + html + lcov + json-summary) | `coverage/` |
| CI | GitHub Actions | `.github/workflows/ci.yml` |

## Commands

```bash
bun run test            # vitest run (unit + integration)
bun run test:watch      # interactive
bun run test:coverage   # writes ./coverage
bun run test:e2e        # Playwright (needs dev server up)
bun run ci              # lint + typecheck + unit
```

## Layout

```text
tests/
  setup.ts              jsdom + jest-dom + polyfills
  unit/                 pure functions, single components
  integration/          DB / RPC / multi-tenant isolation
e2e/
  smoke.spec.ts         app boots
  ...                   critical user flows (B5.11)
```

## Sprint B5 Status

| Sub-task | Status | Notes |
|---|---|---|
| B5.1 Architecture | **Implemented** | Vitest, RTL, Playwright, coverage, CI yaml |
| B5.2 Multi-tenant | Pending | wraps `public.test_tenant_isolation()` |
| B5.3 POS | Pending | `pos_checkout`, `pos_return`, FEFO, idempotency |
| B5.4 Inventory | Pending | `inventory_adjust`, expiry, physical count |
| B5.5 Purchase | Pending | `grn_receive`, supplier ledger |
| B5.6 Accounting | Pending | `post_journal`, ledger, VAT |
| B5.7 Subscription | **Partially blocked** | Stripe test keys required for webhook tests |
| B5.8 Security | Pending | RLS, role gates, tenant isolation harness |
| B5.9 API | Pending | server fn happy/error paths |
| B5.10 Reports | Pending | views + RPCs |
| B5.11 Playwright flows | Pending | login, sale, invoice (smoke only today) |
| B5.12 CI/CD gate | **Implemented** (yaml) | activate by enabling Actions on the GitHub repo |
| B5.13 Coverage 80% | **Partially blocked** | threshold starts at 5%, ratcheted up per sprint |
| B5.14 Regression suite | Pending | composed of B5.2 → B5.6 outputs |

## CI/CD Notes

The pipeline (`.github/workflows/ci.yml`) runs three jobs:

1. `quality` — install, lint, typecheck, unit + integration with coverage
2. `build` — runs after `quality` passes
3. `e2e` — Playwright against `bun run dev`

Coverage thresholds in `vitest.config.ts` start at **5%** to give a green
baseline. Raise the numbers as each sub-task lands tests; the spec target
is 80% lines/branches.

## Environment Limits (be honest)

- GitHub Actions yaml is committed but only runs once Actions are enabled on the GitHub mirror of the repo (Lovable agent can't toggle that).
- Playwright E2E runs locally / in CI; the Lovable preview sandbox is not a long-running test harness.
- Stripe webhook tests (B5.7) need `STRIPE_SECRET_KEY` (test mode) in CI secrets.
