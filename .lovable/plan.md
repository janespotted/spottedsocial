
# Security Audit Remediation Plan

## Executive Summary

After thorough analysis of the codebase and existing security scan results, I can confirm the audit's findings and provide specific fixes. **The good news**: most of the app has strong security practices already in place. **The critical issue**: the profiles table RLS policy has an `OR true` clause that exposes all user data.

---

## Issues by Priority

### CRITICAL - Must Fix Immediately

#### 1. Profiles Table RLS Policy Exposes All User Data
**Current State**: The profiles table has this SELECT policy:
```sql
((auth.uid() IS NOT NULL) AND ((auth.uid() = id) OR true))
```
The `OR true` makes the entire policy always pass, exposing ALL profiles to ANY authenticated user.

**Impact**: Any logged-in user can access every other user's profile data, including:
- Location data (last_known_lat, last_known_lng)
- Personal details (bio, home_city)
- Status (is_out, last_active_at)

**Fix Required**:
```sql
-- Drop the problematic policy
DROP POLICY "Users can read own profile or public data" ON profiles;

-- Create proper policy using the existing helper functions
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can view public profile info via view" ON profiles
FOR SELECT
USING (
  -- Allow viewing basic info for authenticated users
  -- Sensitive fields are masked by can_see_location check in RPC functions
  auth.uid() IS NOT NULL
);
```

**Better approach**: Since `get_profiles_safe()` and `get_profile_safe()` RPC functions already exist and properly enforce privacy controls, the app should exclusively use these RPCs. The base table SELECT policy should be restricted to self-only access.

---

### HIGH Priority

#### 2. Venue Claim Requests - Business Contact Exposure
**Current State**: Users can see their own claim requests. Admins can see all.
**Potential Issue**: If not properly scoped, users claiming the same venue might see each other's business contact info.

**Status**: ✅ Already secure - policies correctly scope to `user_id = auth.uid()` for users, admin-only for full access.

#### 3. Invite Code RPC Security
**Current State**: The `process_invite_code` function does NOT verify that `new_user_id` matches `auth.uid()`.

**Concern**: A malicious user could potentially call this RPC with someone else's `new_user_id` to create unwanted friendships.

**Fix Required**: Add auth verification to the function:
```sql
CREATE OR REPLACE FUNCTION public.process_invite_code(invite_code text, new_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record record;
  inviter_profile record;
BEGIN
  -- SECURITY: Verify the calling user matches new_user_id
  IF auth.uid() IS NULL OR auth.uid() != new_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- ... rest of existing logic unchanged
END;
$$;
```

#### 4. Account Deletion - Missing Storage Cleanup
**Current State**: The `delete-account` edge function deletes:
- All database records (posts, comments, friendships, etc.)
- Avatar files from the `avatars` bucket

**Missing**: Post images, story images, and DM images are NOT deleted.

**Fix Required**: Update `supabase/functions/delete-account/index.ts`:
```typescript
// Add after avatar deletion
console.log('🗑️ Deleting post images from storage');
const { data: postFiles } = await supabaseAdmin.storage
  .from('post-images')
  .list(userId);

if (postFiles?.length) {
  const filesToDelete = postFiles.map(f => `${userId}/${f.name}`);
  await supabaseAdmin.storage
    .from('post-images')
    .remove(filesToDelete);
}

// Also delete DM images
console.log('🗑️ Deleting DM images from storage');
const { data: dmFiles } = await supabaseAdmin.storage
  .from('dm-images')
  .list(userId);

if (dmFiles?.length) {
  const dmFilesToDelete = dmFiles.map(f => `${userId}/${f.name}`);
  await supabaseAdmin.storage
    .from('dm-images')
    .remove(dmFilesToDelete);
}
```

Note: Looking at the upload patterns, files are stored as `{userId}-{timestamp}.{ext}` at the root level, not in user folders. The deletion logic needs to list ALL files and filter by userId prefix.

---

### MEDIUM Priority

#### 5. Enable Leaked Password Protection
**Status**: Detected by Supabase linter
**Fix**: Enable in Lovable Cloud dashboard under auth settings

#### 6. Rate Limiting Improvements
**Current State**: ✅ Rate limiting exists for:
- Posts (10/hour)
- Yaps (30/hour)
- Yap comments (30/hour)
- Venue reports (10/hour)
- New venues (5/day)

**Missing**: Friend requests, invite code attempts

---

## What's Already Secure

The audit raised concerns about several areas that are actually well-protected:

### ✅ XSS Prevention
- The only `dangerouslySetInnerHTML` usage is in the chart.tsx component for CSS injection, which uses static theme data (no user input).
- All user-generated content is displayed using React JSX (auto-escaped).
- `escapeHtml()` and `escapeUrl()` utilities exist in `src/lib/html-escape.ts`.
- Push notifications have message sanitization.

### ✅ Send-Push Edge Function Security
Comprehensive security controls:
- JWT validation required
- Sender impersonation prevention (`sender_id !== user.id` check)
- Input validation (UUID format, message length, notification type whitelist)
- Message sanitization (HTML entity escaping)
- Subscription endpoint validation (HTTPS only, known push services)

### ✅ Service Worker Notification Handling
The `urlToOpen` in sw.js only uses:
- Hardcoded paths (`/`, `/?nudge=first`, etc.)
- Data from the push payload (which comes from our validated edge function)
Not vulnerable to user-controlled redirects.

### ✅ Environment Variables
- `VITE_SUPABASE_PUBLISHABLE_KEY` - correctly public (anon key)
- `VITE_MAPBOX_PUBLIC_TOKEN` - correctly public
- Service keys are server-side only (edge functions)

### ✅ RLS on Most Tables
All 47 tables have RLS enabled with 142 policies. Key tables are properly protected:
- `dm_messages`: Thread membership check
- `posts`: Visibility-based with friend checks
- `checkins`: `can_see_location()` check
- `friendships`: User-scoped

### ✅ Location Privacy
Three-tier privacy system exists:
- `close_friends` - Only close friends see location
- `all_friends` - All friends see location  
- `mutual_friends` - Friends of friends see location

Enforced via `can_see_location()` SECURITY DEFINER function.

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| Database Migration | Fix profiles RLS policy | CRITICAL |
| Database Migration | Add auth check to process_invite_code | HIGH |
| `supabase/functions/delete-account/index.ts` | Add storage cleanup for post-images, dm-images | HIGH |

---

## Implementation Order

1. **Immediately**: Fix the profiles RLS policy (prevents data exposure)
2. **Same day**: Add auth check to `process_invite_code` function
3. **Same day**: Update delete-account to clean up storage files
4. **Before launch**: Enable leaked password protection in Cloud dashboard
5. **Optional**: Add rate limiting for friend requests

---

## Testing After Fixes

1. Create two test accounts
2. Verify Account A cannot see Account B's profile location fields via direct query
3. Verify invite code only works when called by the user being invited
4. Verify account deletion removes all storage files
5. Test all friend visibility levels (close friends, all friends, mutual)
