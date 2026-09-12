/**
 * Demo-content visibility. SOW §15: demo content must never reach the
 * launched app — `__DEV__` is compiled to false in release builds, so demo
 * data is only ever visible in dev (simulator / dev client) sessions.
 *
 * Dev opt-out: set EXPO_PUBLIC_DEMO_MODE=0 in mobile/.env to hide demo
 * content in dev too (e.g. for two-account testing against real data).
 * The `__DEV__` anchor means release builds stay demo-free regardless of
 * any env value.
 *
 * Seed/clear demo data with the `seed-demo-data` edge function
 * (see web DemoSettings page or src/lib/demo-data.ts in the web app).
 */
export const DEMO_MODE = __DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE !== '0';
