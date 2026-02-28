

## Migration: Re-apply column-level grants and drop redundant SELECT policy on profiles

Single migration with three steps:

1. Drop the overly broad `"Authenticated users can read basic profile info"` SELECT policy
2. Revoke all grants on `public.profiles` from `authenticated` and `anon`
3. Re-apply precise column-level SELECT grants (excluding `push_subscription` and `apns_device_token`), plus INSERT/UPDATE/DELETE for `authenticated`

The existing `"Users can read own profile"` (auth.uid() = id) policy remains untouched.

