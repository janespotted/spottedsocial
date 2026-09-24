# Privacy regressions

Run `authorization.cjs` with PGlite 0.3.14. It uses a synthetic database and never connects to Supabase. `audited-schema.sql` is captured metadata from the audit at `edd09659d1a78b2ad5678826913043b79074a983`; `audited-storage.sql` reproduces its three bucket settings and Storage policies. Neither is a migration or a production restore script.

The original notification migrations are loaded in both modes. The corrected mode additionally loads the two V1 privacy migrations. Each case rolls back its changes. Old exploit cases must demonstrate the old exposure, and corrected cases must deny it; positive controls keep legitimate audiences/mutations working. The original location SQL is also executed unchanged against the complete corrected schema.

```sh
SPOTTED_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node tests/privacy/authorization.cjs
npm --prefix mobile run test:location
deno test --no-lock supabase/functions/_shared/private-media.test.ts
```

The Storage fixture tests real PostgreSQL RLS/grants plus the captured public-bucket contract, not Storage's HTTP server or CDN. Gateway tests execute the real gateway/crypto/conversion/cleanup code with mocked authorization and provider transport. SQL tests independently exercise the real authorization functions. Staging must join those boundaries with real Auth, PostgREST, Storage, Realtime and Mux. Native account tests execute transpiled source with real TanStack Query, while native UI/reset dependencies are mocked. See `docs/V1-PRIVACY-REMEDIATION.md` for required rollout and device evidence.
