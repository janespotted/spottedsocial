

# Action Items from Audit

## 1. Google OAuth — Already Correctly Configured

The Google OAuth implementation uses `lovable.auth.signInWithOAuth("google")` from `@lovable.dev/cloud-auth-js`, which is the **Lovable Cloud managed solution**. This means:

- Google Client ID and Client Secret are **automatically managed** — there is no manual dashboard configuration needed
- Redirect URLs are handled by the Cloud auth layer via the `redirect_uri` parameter passed in `Auth.tsx`
- The `getRedirectOrigin()` helper correctly returns `window.location.origin` on web and the published `APP_BASE_URL` on native iOS

**No code or configuration changes are needed for Google OAuth.** If sign-in fails for a specific user, it would be a transient issue or a browser/network problem, not a misconfiguration. The Claude audit flagged this based on a generic Supabase pattern, but this project uses Lovable Cloud's managed OAuth which bypasses that concern entirely.

To confirm it works, I'd recommend testing the Google sign-in flow in the preview.

## 2. Database Indexes — Partially Done, One Migration Needed

Current state of indexes on these tables:

| Requested Index | Status |
|---|---|
| `idx_close_friends_user(user_id, close_friend_id)` | Already exists as unique constraint `close_friends_user_id_close_friend_id_key` |
| `idx_friendships_user_status(user_id, status)` | Missing — only single-column indexes on `user_id` and `status` exist separately |
| `idx_friendships_friend_status(friend_id, status)` | Missing — only single-column index on `friend_id` exists |

The composite indexes `(user_id, status)` and `(friend_id, status)` are more efficient than separate single-column indexes for the `can_see_location()` function which filters on both columns simultaneously.

**Migration to run:**
```sql
CREATE INDEX IF NOT EXISTS idx_friendships_user_status 
  ON friendships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_status 
  ON friendships(friend_id, status);
```

No code changes needed — just the migration.

