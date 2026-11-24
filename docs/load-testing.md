# SohojPharma — Load Testing Package (k6)

## Install
```bash
brew install k6   # or: docker run -i grafana/k6 run - < script.js
```

## Environment
```bash
export BASE_URL=https://cloudpharama.lovable.app
export AUTH_TOKEN="<supabase access token>"
export TENANT_ID="<tenant uuid>"
```

## Profiles
| Stage | VUs | Duration |
|---|---|---|
| Smoke | 10 | 2 min |
| Pilot | 25 | 5 min |
| Growth | 50 | 10 min |
| Scale | 100 | 15 min |

## Scripts

### 1. POS Checkout (`k6/pos-checkout.js`)
```js
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: __ENV.VUS || 25, duration: __ENV.DURATION || '5m' };
const URL = __ENV.BASE_URL;
const TOKEN = __ENV.AUTH_TOKEN;
export default function () {
  const r = http.post(`${URL}/api/pos/checkout`, JSON.stringify({
    items: [{ product_id: 'demo', qty: 1 }], payment_method: 'cash', amount: 100,
  }), { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } });
  check(r, { '200': (x) => x.status === 200, 'p95<500ms': (x) => x.timings.duration < 500 });
  sleep(1);
}
```

### 2. Product Search (`k6/product-search.js`)
```js
import http from 'k6/http'; import { check } from 'k6';
export const options = { vus: __ENV.VUS || 25, duration: '5m' };
export default function () {
  const r = http.get(`${__ENV.BASE_URL}/api/products?q=para`, {
    headers: { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` },
  });
  check(r, { '200': (x) => x.status === 200 });
}
```

### 3. Inventory Lookup (`k6/inventory.js`) & 4. Invoice Load (`k6/invoice.js`) — same shape.

## Expected Thresholds
| Endpoint | 10 VU p95 | 25 VU p95 | 50 VU p95 | 100 VU p95 | p99 (100) | Pass |
|---|---|---|---|---|---|---|
| POS Checkout | 180 ms | 240 ms | 380 ms | 720 ms | 1200 ms | p95 < 800ms |
| Product Search | 90 | 110 | 180 | 310 | 480 | p95 < 400ms |
| Inventory Lookup | 60 | 80 | 130 | 240 | 380 | p95 < 300ms |
| Invoice Load | 120 | 160 | 250 | 460 | 780 | p95 < 600ms |

**Pass criteria:** error rate < 1%, p95 within target, p99 < 2× target. Failures at 100 VU → upgrade Cloud instance.
