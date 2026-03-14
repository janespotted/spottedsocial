

## Plan: Fix build error and redeploy send-push

### 1. Fix TypeScript build error in `src/lib/push-notifications.ts`

The `.insert()` call on line 8 needs the object wrapped in an array to satisfy the TypeScript overload:

```typescript
await supabase.from('push_logs').insert([{ stage, detail }]);
```

### 2. Redeploy `send-push` edge function

Use `supabase--deploy_edge_functions` to redeploy `send-push` with the updated CORS headers.

| Step | Action |
|------|--------|
| Fix build | Wrap `.insert()` argument in array in `push-notifications.ts` |
| Deploy | Redeploy `send-push` edge function |

