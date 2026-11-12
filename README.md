# GoAwayGo performance tests

Performance tests of GoAwayGo (MVP 2, 5.6): the **API** and the **website** with [k6](https://k6.io), the **Android
app's** start-up time and scrolling on an emulator. Every test has limits that fail the run. The product repos run them
after every deployment to dev and test (never prod: real users and real quotas live there) and record the result in
the version's GitHub Release; a version moves up only after they passed in the environment below.

| Script             | What                                                                                  | Limits (fail the run)                                                        |
| ------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `k6/api/browse.js` | 5 visitors browsing for 2 minutes: ideas, place search, destination pages, flights    | errors < 1 %; p95: reads < 800 ms, destination page < 2.5 s, flights < 1.5 s |
| `k6/web/pages.js`  | Home, sign-in and privacy pages in Chromium, Core Web Vitals                          | p75: LCP < 2.5 s, FCP < 1.8 s, CLS < 0.1, Home search usable < 3 s           |
| `app/startup.sh`   | the app's cold start-up, 5 times                                                      | median < 4 s (CI emulator; a phone is several times faster)                  |
| `app/scroll.sh`    | scrolling Home (`open-home.yaml`, then `scroll.yaml` measured with `dumpsys gfxinfo`) | janky frames < 30 %, p90 frame < 48 ms (software-drawn emulator)             |

The limits catch regressions; change one only with the reason in the pull request.

## How a run works

- **Environments:** `GOAWAYGO_ENV=dev|test` (`k6/lib/env.js`); `API_URL` / `WEB_URL` override the addresses.
- **Fake outside services and no rate limits:** every request to our API carries `X-GoAwayGo-Test:
<TEST_FAKES_TOKEN>`; the backend then answers AI, places, photos and flights from memory and skips its rate limits.
  So a run measures our backend, website and database, uses no free quota, and isn't cut short by our own limits.
  Without the token the scripts refuse to start.
- **Cold starts:** dev and test scale to zero; each script wakes the API first, so a cold start isn't measured.
- **Load:** dev and test run one small Cloud Run instance (1 CPU) and the free Neon database. The load is a busy hour
  for a young product, not a stress test.
- **Reports:** `reports/` (k6 HTML dashboard and JSON summary; app timings and frame statistics). The product repos
  keep them as run artifacts for 90 days.

## Running locally

Install k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/), then, with the token in your shell (never in a
file; the owner reads it from Secret Manager):

```bash
TEST_FAKES_TOKEN="$(gcloud secrets versions access latest --secret goawaygo-test-fakes-token --project goawaygo-staging)" \
  GOAWAYGO_ENV=dev k6 run k6/api/browse.js
```

The app scripts need an emulator with a test build and Maestro (the app repo's `tests.yml` shows how).

## Changing the tests

Same path as every GoAwayGo repo: `feature/<name>` or `fix/<name>` → `develop` → `test` → `main` (CONTRIBUTING.md).
