/**
 * Demo-content visibility. SOW §15: demo content must never reach the
 * launched app — `__DEV__` is compiled to false in release builds, so demo
 * data is only ever visible in dev (simulator / dev client) sessions.
 *
 * Seed/clear demo data with the `seed-demo-data` edge function
 * (see web DemoSettings page or src/lib/demo-data.ts in the web app).
 */
export const DEMO_MODE = __DEV__;
