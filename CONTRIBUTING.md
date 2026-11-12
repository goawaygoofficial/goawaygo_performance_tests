# Contributing

Same path as every GoAwayGo repo (MVP 2, 5.1): `feature/<name>` or `fix/<name>` → `develop` (squash, no approval) →
`test` → `main` (merge commits, the owner's approval). Any other branch name is rejected by GitHub, and the
`pre-push` hook says so locally: `git config core.hooksPath .githooks` once per clone.

Each environment runs the tests from its own branch: **dev** from `develop`, **test** from `test`, **prod** from
`main`. So a test change reaches test and prod only when it is promoted, like the product code.

Before a pull request: `npm ci`, `npm run check`, and run the changed tests against dev (README.md). Never commit a
password or token: they come from GitHub secrets (`TEST_FAKES_TOKEN`, `AT_ACCOUNT_PASSWORD`) at run time.
