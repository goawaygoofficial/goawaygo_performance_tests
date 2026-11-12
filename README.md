# GoAwayGo performance tests

Performance tests of GoAwayGo (MVP 2, 5.6): the **API** and the **website** with [k6](https://k6.io), the **Android
app's** start-up time and scrolling on an emulator. Each test has limits that fail the run. The product repos run
them after every deployment to dev and test (never against prod), and a version moves up only after they passed.

The scripts are being added (5.6): this is the repository's base.
