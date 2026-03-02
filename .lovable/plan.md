

## Disable Bootstrap Mode by Default

Two one-line changes in `src/lib/bootstrap-config.ts`:

1. **Line 19**: Change `enabled: true` → `enabled: false` in the `BOOTSTRAP_CONFIG` constant.
2. **Line 43**: Change `return { enabled: true, city }` → `return { enabled: false, city }` in the `getBootstrapMode` fallback.

No other files affected.

