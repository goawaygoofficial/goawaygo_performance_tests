# GoAwayGo performance tests

Performance tests of GoAwayGo (MVP 2, 5.6): the **API** and the **website** with [k6](https://k6.io), the **Android
app's** start-up time and scrolling on an emulator. Every test has limits that fail the run. The product repos run them
after every deployment to dev and test (never prod: real users and real quotas live there) and record the result in
the version's GitHub Release; a version moves up only after they passed in the environment below.

| Script             | What                                                                                               | Limits (fail the run)                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `k6/api/browse.js` | 5 visitors browsing for 2 minutes: ideas, place search, destination pages, flights                 | server time (Server-Timing) p95: reads < 300 ms, flights < 800 ms, destination page < 1.5 s; end to end p95: reads < 1.5 s, flights < 2 s, page < 3 s; errors < 1 % |
| `k6/web/pages.js`  | Home, sign-in and privacy pages in Chromium, Core Web Vitals                                       | p75: LCP < 2.5 s, FCP < 1.8 s, CLS < 0.1, Home search usable < 3 s; all 10 visits complete                                                                          |
| `app/startup.sh`   | the app's cold start-up, 5 times                                                                   | median < 4 s (CI emulator; a phone is several times faster)                                                                                                         |
| `app/scroll.sh`    | scrolling Home, frames as they reach the screen (SurfaceFlinger: Flutter draws on its own surface) | janky frames < 60 %, p90 between frames < 66 ms; at least 20 frames measured                                                                                        |

The limits catch regressions; change one only with the reason in the pull request. The API limits that matter are on the
backend's own time (its `Server-Timing` header on test runs); end-to-end times from GitHub's runners, far from
Singapore, have looser limits. The app limits are for a
software-drawn CI emulator and were calibrated on its first runs.

## Documents in this repo

| File          | What it holds                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `README.md`   | Everything about this repo: features, how it works, setup, deployment, how we work, resources, roadmap, history |
| `LINKS.md`    | Every link for dev, test and prod, and the shared consoles                                                      |
| `RELEASES.md` | What each version brought and where it runs                                                                     |

These are the only Markdown files. Every change updates them in the same pull request (new feature, new service,
new setting, a release reaching prod).

## Contents

- [How a run works](#how-a-run-works)
- [Running locally](#running-locally)
- [Changing the tests](#changing-the-tests)
- [How we work](#how-we-work)

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
# tr: on Windows gcloud ends its output with "\r"
TEST_FAKES_TOKEN="$(gcloud secrets versions access latest --secret goawaygo-test-fakes-token --project goawaygo-staging | tr -d '\r')" \
  GOAWAYGO_ENV=dev k6 run k6/api/browse.js
```

The app scripts need an emulator with a test build and Maestro (the app repo's `tests.yml` shows how).

## Changing the tests

Same path as every GoAwayGo repo: `feature/<name>` or `fix/<name>` → `develop` → `test` → `main` (the product repos' README → **How we work**).

## How we work

Same path as every GoAwayGo repo (MVP 2, 5.1): `feature/<name>` or `fix/<name>` → `develop` (squash, no approval) →
`test` → `main` (merge commits, the owner's approval). Any other branch name is rejected by GitHub, and the
`pre-push` hook says so locally: `git config core.hooksPath .githooks` once per clone.

Each environment runs the tests from its own branch: **dev** from `develop`, **test** from `test`, **prod** from
`main`. So a test change reaches test and prod only when it is promoted, like the product code.

Before a pull request: `npm ci`, `npm run check`, and run the changed tests against dev (README.md). Never commit a
password or token: they come from GitHub secrets (`TEST_FAKES_TOKEN`, `AT_ACCOUNT_PASSWORD`) at run time.

### Pull request description

Every pull request description follows this outline:

```markdown
## What

<!-- What does this PR change? Keep it short. -->

## Why

<!-- The problem it solves or the test it adds. -->

## Evidence

<!-- The CI run of this PR runs the changed tests against dev: link its report, or explain why not. -->

- [ ] Checks pass (`npm run check`)
- [ ] The changed tests pass against dev (CI report or local run)

## Checklist

- [ ] PR into `develop` from `feature/...` or `fix/...`
- [ ] Title follows Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`)
- [ ] No secrets, passwords or tokens committed (they come from GitHub secrets at run time)
```
