

## Plan: Create `push_logs` table and redeploy `send-push` with fixed CORS

### 1. Database migration — Create `push_logs` table

```sql
CREATE TABLE public.push_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  stage text,
  detail jsonb
);

-- Disable RLS so the edge function (service role) can write freely
ALTER TABLE public.push_logs ENABLE ROW LEVEL SECURITY;

-- Permissive policy for service role writes and authenticated reads
CREATE POLICY "Allow all inserts" ON public.push_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can read" ON public.push_logs FOR SELECT TO authenticated USING (true);
```

### 2. Update CORS headers in `send-push`

Change line 5 of `supabase/functions/send-push/index.ts`:

```
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
```
to:
```
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"
```

### 3. Redeploy `send-push` edge function

Deploy after the CORS fix so the updated headers take effect immediately.

| Step | Action |
|------|--------|
| Migration | Create `push_logs` table with permissive insert policy |
| CORS fix | Update `Access-Control-Allow-Headers` in `send-push/index.ts` line 5 |
| Deploy | Redeploy `send-push` edge function |

