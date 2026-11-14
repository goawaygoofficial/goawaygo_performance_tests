# GoAwayGo performance tests — releases

This repo has no version numbers: the product repos run its tests from the branch that matches the
environment (`develop` → dev, `test` → test, `main` → prod). Each change below is a pull request into
`develop`; "on test" and "on main" show whether it has been promoted there. Newest first; update this file
in the PR that promotes changes.

- 2026-11-12 · feat: limit the backend's own time, looser end-to-end limits (#6) (on test, on main)
- 2026-11-12 · fix: ask for compressed answers like real clients (#5) (on test, on main)
- 2026-11-12 · fix: warm each API endpoint once before measuring (#4) (on test, on main)
- 2026-11-12 · fix: calibration after the first runs in CI (#3) (on test, on main)
- 2026-11-12 · fix: mark the app scripts executable (#2) (on test, on main)
- 2026-11-12 · feat: API, website and app performance tests with limits (#1) (on test, on main)
- 2026-11-12 · chore: repository base (rules, scans, tooling) (on test, on main)
