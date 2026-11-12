// Where the performance tests run (MVP 2, 5.6), from the variables the product repos' workflows set:
//   GOAWAYGO_ENV      dev (default) or test. Never prod: real users and real quotas live there.
//   API_URL, WEB_URL  override the addresses.
//   TEST_FAKES_TOKEN  the backend answers with fake outside services and skips its rate limits for these requests,
//                     so a run measures our own code, uses no free quota, and isn't cut short by our limits.
const ADDRESSES = {
  dev: { api: 'https://api-dev.goawaygo.com', web: 'https://dev.goawaygo.com' },
  test: { api: 'https://api-test.goawaygo.com', web: 'https://test.goawaygo.com' },
};

export const environment = (__ENV.GOAWAYGO_ENV || 'dev').toLowerCase();
if (!ADDRESSES[environment]) {
  throw new Error(`GOAWAYGO_ENV must be dev or test (never prod), not "${environment}"`);
}

function trimmed(value, fallback) {
  return (value || fallback).replace(/\/+$/, '');
}

export const apiUrl = trimmed(__ENV.API_URL, ADDRESSES[environment].api);
export const webUrl = trimmed(__ENV.WEB_URL, ADDRESSES[environment].web);

const token = (__ENV.TEST_FAKES_TOKEN || '').trim();
if (!token) {
  throw new Error('TEST_FAKES_TOKEN is required: without it the run would use real outside services and quotas');
}

/** Headers for requests to our API. */
export const apiHeaders = { 'X-GoAwayGo-Test': token };
