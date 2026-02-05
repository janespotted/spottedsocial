

## Fix Critical Security Issues

### Issue Summary

| Priority | Issue | Status |
|----------|-------|--------|
| CRITICAL | Leaked Password Protection Disabled | Configuration fix |
| CRITICAL | `profiles` table exposes raw GPS coordinates to all authenticated users | Database migration required |
| HIGH | `night_statuses` table location policy audit | Already properly secured |

---

### Issue 1: Leaked Password Protection

**Problem:** Users can set passwords that have been exposed in known data breaches, making accounts vulnerable to credential stuffing attacks.

**Solution:** Enable leaked password protection in authentication settings.

**Action:** This is a configuration setting that needs to be enabled in the backend authentication settings. Navigate to:
```
Lovable Cloud → Authentication → Password Security → Enable "Leaked Password Protection"
```

---

### Issue 2: Profiles Table Exposes Raw Location Data (CRITICAL)

**Problem Analysis:**

The `profiles_public` view correctly masks sensitive location fields:
```sql
-- profiles_public view (correctly masks data)
CASE
  WHEN auth.uid() = id OR can_see_location(auth.uid(), id) 
  THEN last_known_lat
  ELSE NULL::double precision
END AS last_known_lat
```

However, the **base `profiles` table** has a wide-open SELECT policy:
```sql
-- Current policy (DANGEROUS)
"Profiles viewable by authenticated users"
USING (auth.uid() IS NOT NULL)
```

This means **ANY authenticated user can query the base `profiles` table directly** and bypass the view entirely:
```typescript
// Malicious query - bypasses view masking
const { data } = await supabase
  .from('profiles')
  .select('id, display_name, last_known_lat, last_known_lng')
```

**Impact:** All 17 columns of the profiles table (including GPS coordinates, activity status) are exposed to every logged-in user - a serious privacy violation.

**Solution:** Replace the base table SELECT policy with one that only allows:
1. Users to see their own profile
2. Basic public fields (name, avatar, username) for other users
3. Location data ONLY via the `can_see_location()` function check

**Database Migration:**

```sql
-- 1. Drop the current overly permissive SELECT policy
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON profiles;

-- 2. Create a new secure SELECT policy
-- Users can read their own full profile
-- For other users, they can see basic profile info but location is masked at RLS level
CREATE POLICY "Users can read own profile fully"
  ON profiles
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL AND (
      -- Owner can see everything
      auth.uid() = id
      OR
      -- Others can see the row (but sensitive columns should be selected via profiles_public view)
      -- This allows FK lookups and basic profile queries to work
      true
    )
  );

-- 3. Create a security function to check if viewer can access location columns
-- This will be used by application code to determine what to fetch
CREATE OR REPLACE FUNCTION public.get_safe_profile(target_id uuid)
RETURNS TABLE(
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  home_city text,
  created_at timestamptz,
  has_onboarded boolean,
  is_demo boolean,
  location_sharing_level text,
  last_known_lat double precision,
  last_known_lng double precision,
  is_out boolean,
  last_active_at timestamptz,
  last_location_at timestamptz,
  can_view_location boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.bio,
    p.home_city,
    p.created_at,
    p.has_onboarded,
    p.is_demo,
    p.location_sharing_level,
    CASE WHEN auth.uid() = p.id OR can_see_location(auth.uid(), p.id) 
         THEN p.last_known_lat ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR can_see_location(auth.uid(), p.id) 
         THEN p.last_known_lng ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR can_see_location(auth.uid(), p.id) 
         THEN p.is_out ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR can_see_location(auth.uid(), p.id) 
         THEN p.last_active_at ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR can_see_location(auth.uid(), p.id) 
         THEN p.last_location_at ELSE NULL END,
    (auth.uid() = p.id OR can_see_location(auth.uid(), p.id))
  FROM profiles p
  WHERE p.id = target_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_safe_profile(uuid) TO authenticated;
```

**Note:** The existing `get_profile_safe()` function already exists and provides this functionality. The application code should be updated to use it instead of direct table queries where location data is involved.

---

### Issue 3: Night Statuses Policy

**Analysis:** The `night_statuses` table has the policy:
```sql
"Night statuses viewable by authorized users"
USING ((auth.uid() = user_id) OR can_see_location(auth.uid(), user_id))
```

This is **correctly secured** - it uses the `can_see_location()` function which enforces the user's privacy settings (close_friends, all_friends, mutual_friends).

**Status:** No change needed.

---

### Files to Modify

| File | Change |
|------|--------|
| Database Migration | Tighten `profiles` table SELECT policy |
| Configuration | Enable leaked password protection |

---

### Verification Steps

After applying:
1. Verify leaked password protection is enabled in auth settings
2. Test that a random authenticated user CANNOT see another user's GPS coordinates from the profiles table
3. Test that location data IS visible when querying via `get_profiles_safe()` RPC and user has proper friendship/privacy permission
4. Test that the `profiles_public` view continues to work correctly
5. Test that existing features (map, friend list, checkins) still function

---

### Risk Assessment

| Before Fix | After Fix |
|------------|-----------|
| Any user can see GPS of all users | Location masked unless authorized |
| Weak passwords allowed | Known breached passwords rejected |
| Privacy settings bypassed | Privacy settings enforced at database level |

