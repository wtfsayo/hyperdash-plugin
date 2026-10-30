# Prove — hyperdash-info 0.3.0

Run `npm test`. It prints the number of checks passed and failed and exits non-zero on any failure. With network access it also calls all 28 tools and every widget type against the live API; offline (or with `SMOKE_OFFLINE=1`) it runs only the protocol, bad-argument and mock checks.

CI (`.github/workflows/smoke.yml`) runs the same command on every push and daily, so upstream schema drift shows up as a failing run.

- Widget note: per-type inline fragments (mega-union fails GraphQL nullability conflicts across types)
- Real use (0.1): ZEC crowded melt-up vs PONS long wipeout — see THESIS.md
