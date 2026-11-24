# Enterprise Printing — Architecture & Operations

A self-contained, additive printing subsystem for SohojPharma. The legacy Chrome print path is untouched; this module layers a QZ Tray engine, a persistent FIFO queue with retry/fallback, durable history, health monitoring, and a one-click production validator on top.

## Folder layout

```
src/lib/printing/
  manager.ts            PrintManager — chooses Chrome vs QZ engine
  queue.ts              FIFO queue, priority, pause/resume, per-printer concurrency
  queue-persist.ts      LocalStorage persistence + recovery
  events.ts             Pub/sub bus (queued/started/completed/failed/retry/…)
  retry.ts              Exponential backoff for recoverable failures
  health.ts             QZ websocket health monitor
  detect.ts             Heuristic printer → role classifier
  storage.ts            LocalStorage cache for per-store settings
  csv.ts                Tabular CSV export (history)
  validation.ts         One-click production validation
  server.functions.ts   Tenant-scoped RPCs (settings, profiles, jobs, templates, health)
  hooks.ts              React hooks (settings, profiles, jobs)
  index.ts              Public re-exports
  qz/                   QZ Tray services (connection, printer, barcode, receipt, invoice)
  browser/              Chrome print service
  templates/            Token-replacement template engine
```

## Database schema

| Table | Purpose |
|---|---|
| `printing_settings` | Per-tenant/branch defaults (engine, paper width, language, copies, fallback). |
| `printing_printer_profiles` | Named printers with `printer_role`, language, paper, custom width/height. |
| `print_jobs` | Durable history of every print attempt (status, attempts, duration, priority, payload). |
| `print_health_log` | Time-series health snapshots per printer. |
| `printing_label_templates` | DB-driven label bodies with `is_active` toggle. |

All tables are RLS-scoped to `tenant_id` via `is_tenant_member(auth.uid(), tenant_id)`.

## Print flow

```
caller → printQueue.enqueue() ──► print_jobs row (status=pending)
                                         │
                                         ▼
                          tick() picks highest priority,
                          FIFO within priority, one active per printer
                                         │
                                         ▼
                   PrintManager → QZ (retry × N w/ backoff)
                                         │
                          on terminal fail + fallback_enabled
                                         ▼
                                   Chrome print
                                         │
                                         ▼
                    updateJobStatus → print_jobs (completed | failed)
                                         │
                                         ▼
                              printEvents.emit(...)
```

## Event bus

`printEvents.on(fn)` lets UI tabs (Queue, History, Diagnostics) subscribe to:
`queued | started | printing | completed | failed | cancelled | retry | reconnect | printer_changed | settings_changed | template_changed`.

## Queue capabilities

- `enqueue({ priority?, dedupeKey?, fallbackEnabled?, silent? })`
- `pause()` / `resume()` / `isPaused()`
- `cancel(id)` for any pending or failed job
- `retry(id)` for any failed job
- `clearCompleted()`
- Survives page reloads via `localStorage`.

## Retry strategy

`withRetry(fn, maxRetries)` retries with exponential backoff. Chrome fallback engages only after all QZ retries fail **and** `fallback_enabled = true`.

## Health monitor

`health.ts` polls QZ status while the tab is visible, emits `reconnect` events on transitions, and writes snapshots to `print_health_log`.

## Production validation

`runProductionValidation({ hasProfile, fallbackEnabled })` returns a checklist:
QZ websocket, printer discovery, profile configured, queue worker, Chrome fallback. Surfaced as the "Run Production Check" button on the Diagnostics tab.

## Windows / QZ setup

1. Install QZ Tray (https://qz.io/download/).
2. Start QZ Tray; allow the websocket on port 8181 / 8282.
3. (Production) Sign a Digital Certificate per https://qz.io/wiki/2.0-signing-messages to silence the per-print trust dialog.
4. Open **Settings → Printing → Diagnostics**, click **Run Production Check**.

## Rollback

The whole module is additive. To disable QZ entirely, set `printing_settings.engine = 'chrome'` for the tenant; `PrintManager` will route all jobs through the original Chrome path.
