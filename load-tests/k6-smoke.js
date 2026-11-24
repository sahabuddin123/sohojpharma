// SohojPharma — P1.1 Load Test (k6)
// Usage:
//   k6 run -e BASE_URL=https://cloudpharama.lovable.app load-tests/k6-smoke.js
//   k6 run -e BASE_URL=... -e VUS=100 -e DURATION=2m load-tests/k6-smoke.js
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE_URL || 'https://cloudpharama.lovable.app'
const VUS = parseInt(__ENV.VUS || '50', 10)
const DURATION = __ENV.DURATION || '1m'

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.min(10, VUS) },
        { duration: '30s', target: Math.min(25, VUS) },
        { duration: '1m', target: Math.min(50, VUS) },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // P1 targets
    'http_req_duration{name:healthcheck}': ['p(95)<300'],
    'http_req_duration{name:home}': ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
}

export default function () {
  const h = http.get(`${BASE}/api/public/hooks/healthcheck`, { tags: { name: 'healthcheck' } })
  check(h, { 'healthcheck 200': (r) => r.status === 200 })

  const home = http.get(`${BASE}/`, { tags: { name: 'home' } })
  check(home, { 'home 200': (r) => r.status === 200 })

  sleep(1)
}
