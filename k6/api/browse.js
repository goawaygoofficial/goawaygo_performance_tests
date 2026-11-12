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
    // Fast reads, each on its own so a slow one is named in the report. Measured from GitHub's runners, far from
    // Singapore: about 0.25 s of every request is the distance.
    'http_req_duration{name:health}': ['p(95)<800'],
    'http_req_duration{name:ideas}': ['p(95)<800'],
    'http_req_duration{name:places}': ['p(95)<800'],
    'http_req_duration{name:airports}': ['p(95)<800'],
    'http_req_duration{name:regions}': ['p(95)<800'],
    // A destination page does several things in parallel (AI cards, spots, photos).
    'http_req_duration{kind:page}': ['p(95)<2500'],
    // Flight prices and partner links.
    'http_req_duration{kind:book}': ['p(95)<1500'],
  },
  // Each request's own tag, not one per URL (place ids differ).
  tags: { suite: 'api' },
};

// Wakes the service before measuring: a cold start (up to ~20 s after idle) is not what this test is about. Then each
// endpoint once: the first request after a deploy loads what that endpoint keeps in memory (e.g. the idea list from
// the database) while the others wait, which is part of the cold start too.
export function setup() {
  let awake = false;
  for (let attempt = 0; attempt < 12 && !awake; attempt++) {
    awake = http.get(`${apiUrl}/actuator/health`, { tags: { kind: 'warmup' }, timeout: '60s' }).status === 200;
    if (!awake) sleep(5);
  }
  if (!awake) throw new Error(`${apiUrl} did not wake up`);
  const warm = { headers, tags: { kind: 'warmup' }, timeout: '60s' };
  for (const path of [
    '/api/discover/ideas?count=6',
    '/api/discover/places?q=test',
    '/api/book/airports?q=del',
    '/api/regions',
  ]) {
    http.get(`${apiUrl}${path}`, warm);
  }
  http.get(`${apiUrl}/api/book/flights?from=DEL&to=BOM&depart=${DEPART}&currency=INR`, warm);
}

// Compressed answers, as the website and the app always ask for (k6 doesn't by default). Without it the ideas answer
// (3.9 KB) took ~1 s from GitHub's runners although the server answered in 13 ms (Cloud Run's request logs).
const headers = { ...apiHeaders, 'Accept-Encoding': 'gzip' };

// name: one per endpoint (not per URL: place ids and dates differ).
function get(path, kind, name) {
  return http.get(`${apiUrl}${path}`, { headers, tags: { kind, name } });
}

export default function () {
  group('home', () => {
    check(get('/actuator/health', 'read', 'health'), { 'health 200': (r) => r.status === 200 });
    check(get('/api/discover/ideas?count=6', 'read', 'ideas'), { 'ideas 200': (r) => r.status === 200 });
  });
  sleep(1);

  let placeId;
  group('search a place', () => {
    const places = get('/api/discover/places?q=test', 'read', 'places');
    check(places, { 'places 200': (r) => r.status === 200 });
    placeId = places.status === 200 ? places.json('0.id') : undefined;
  });
  sleep(1);

  if (placeId) {
    group('destination page', () => {
      const page = get(`/api/discover/destination?placeId=${encodeURIComponent(placeId)}`, 'page', 'destination');
      check(page, { 'destination ok': (r) => r.status === 200 && r.json('status') === 'ok' });
    });
    sleep(2);
  }

  group('book', () => {
    check(get('/api/book/airports?q=del', 'read', 'airports'), { 'airports 200': (r) => r.status === 200 });
    const flights = get(`/api/book/flights?from=DEL&to=BOM&depart=${DEPART}&currency=INR`, 'book', 'flights');
    check(flights, { 'flights 200': (r) => r.status === 200 });
  });
  sleep(1);

  check(get('/api/regions', 'read', 'regions'), { 'regions 200': (r) => r.status === 200 });
  sleep(1);
}
