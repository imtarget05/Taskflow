import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // ramp up to 10 users
    { duration: '1m', target: 20 },    // stay at 20 users
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% requests under 2s
    http_req_failed: ['rate<0.1'],     // error rate under 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  const payload = JSON.stringify({
    messages: [{ role: 'user', content: 'Tạo board Test Load' }],
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.API_TOKEN || ''}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/agent/chat`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
