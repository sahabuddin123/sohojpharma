# SohojPharma Public API v1

Versioned REST API for mobile apps, AI agents, and third-party integrations.

- **Base URL:** `https://<your-app>.lovable.app/api/public/v1`
- **OpenAPI spec:** `GET /api/public/v1/openapi`
- **Gateway info:** `GET /api/public/v1/`
- **Health:** `GET /api/public/health`

## Auth

Every request (except `/auth/login`, `/auth/refresh`, `/auth/logout`,
`/openapi`, `/`) requires an API key:

```
X-API-Key: pk_<prefix>.<secret>
```

Create keys at **/developer/keys**. Keys are tenant-scoped and have a `scope`:
- `read` — GET only
- `read_write` — GET + POST
- `full` — reserved for future privileged ops

Revoke keys at any time; revoked keys are rejected immediately.

### HMAC signing (write endpoints, optional but recommended)

For POSTs you may additionally sign the request:

```
X-Timestamp: <unix-seconds>
X-Signature: hex(hmac_sha256(secret, `${ts}.${METHOD}.${path}.${body}`))
```

The timestamp must be within ±5 minutes of server time.

## Rate limits

120 requests per minute per API key by default (60/min for write endpoints).
Exceeding the limit returns `429` with `retry_after_ms`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Email/password login → tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidate session |
| GET  | `/auth/profile` | Authed key info |
| GET  | `/auth/tenant` | Current tenant |
| GET  | `/products` | List/search products, barcode lookup |
| GET  | `/customers` | List customers |
| GET  | `/sales` | List sales |
| POST | `/sales` | Create sale (POS checkout) |
| GET  | `/sales/held` | List held carts |
| POST | `/sales/held` | Park a cart |
| POST | `/sales/held/{id}/resume` | Resume a held cart |
| GET  | `/purchases` `/purchase-orders` `/grn` `/suppliers` | List |
| GET  | `/prescriptions` | List prescriptions |
| POST | `/prescriptions` | Upload (multipart) |
| GET  | `/prescriptions/{id}` | Detail + signed image URL |
| GET  | `/reports/summary` | Dashboard metrics |

## Webhooks

Configure at **/developer/webhooks**. Each event POSTs JSON:

```json
{ "event": "sale.created", "tenant_id": "...", "data": { ... }, "at": "..." }
```

Signed with HMAC SHA256 in `X-SohojPharma-Signature` using your webhook secret.

Events: `sale.created`, `purchase.created`, `stock.low`, `subscription.expired`, `payment.received`.

## SDKs

- TypeScript / React Native: [`sdk/typescript/sohojpharma-client.ts`](../sdk/typescript/sohojpharma-client.ts)
- Flutter / Dart: [`sdk/flutter/sohojpharma_client.dart`](../sdk/flutter/sohojpharma_client.dart)

## Errors

```json
{ "error": { "code": "unauthorized", "message": "Invalid API key" } }
```

Codes: `unauthorized` `forbidden` `invalid_request` `not_found` `rate_limited` `method_not_allowed` `server_error`.
