// API performance (MVP 2, 5.6): visitors browsing GoAwayGo at the same time, with the fake outside services, so the
// numbers are our backend and database only. Dev and test run one small Cloud Run instance each (1 CPU, scales to
// zero): the load is a busy hour for a young product, not a stress test.
//
// Limits (thresholds) fail the run. Change them only with a reason in the pull request.
import http from 'k6/http';
import { check, group, sleep } from 'k6';

import { apiHeaders, apiUrl } from '../lib/env.js';

const DEPART = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 5 },
        { duration: '90s', target: 5 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Almost nothing may fail.
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // Fast reads: health, suggestions, airports, regions, ideas.
    'http_req_duration{kind:read}': ['p(95)<800', 'p(99)<1500'],
    // A destination page does several things in parallel (AI cards, spots, photos).
    'http_req_duration{kind:page}': ['p(95)<2500'],
    // Flight prices and partner links.
    'http_req_duration{kind:book}': ['p(95)<1500'],
  },
  // Each request's own tag, not one per URL (place ids differ).
  tags: { suite: 'api' },
};

// Wakes the service before measuring: a cold start (up to ~20 s after idle) is not what this test is about.
export function setup() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = http.get(`${apiUrl}/actuator/health`, { tags: { kind: 'warmup' }, timeout: '60s' });
    if (response.status === 200) {
      return;
    }
    sleep(5);
  }
  throw new Error(`${apiUrl} did not wake up`);
}

function get(path, kind, params = {}) {
  return http.get(`${apiUrl}${path}`, { headers: apiHeaders, tags: { kind, name: path }, ...params });
}

export default function () {
  group('home', () => {
    check(get('/actuator/health', 'read'), { 'health 200': (r) => r.status === 200 });
    check(get('/api/discover/ideas?count=6', 'read'), { 'ideas 200': (r) => r.status === 200 });
  });
  sleep(1);

  let placeId;
  group('search a place', () => {
    const places = get('/api/discover/places?q=test', 'read');
    check(places, { 'places 200': (r) => r.status === 200 });
    placeId = places.status === 200 ? places.json('0.id') : undefined;
  });
  sleep(1);

  if (placeId) {
    group('destination page', () => {
      const page = get(`/api/discover/destination?placeId=${encodeURIComponent(placeId)}`, 'page');
      check(page, { 'destination ok': (r) => r.status === 200 && r.json('status') === 'ok' });
    });
    sleep(2);
  }

  group('book', () => {
    check(get('/api/book/airports?q=del', 'read'), { 'airports 200': (r) => r.status === 200 });
    const flights = get(`/api/book/flights?from=DEL&to=BOM&depart=${DEPART}&currency=INR`, 'book');
    check(flights, { 'flights 200': (r) => r.status === 200 });
  });
  sleep(1);

  check(get('/api/regions', 'read'), { 'regions 200': (r) => r.status === 200 });
  sleep(1);
}
