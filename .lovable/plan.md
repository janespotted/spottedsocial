

# Secure Demo Settings Access

## Current State
- Triple-tap on the profile header navigates to `/demo-settings` unconditionally (Profile.tsx, line 87)
- The `/demo-settings` route is wrapped in `ProtectedRoute` (requires login) but has no admin check
- Only `jane.reynolds752@gmail.com` is currently an admin in `user_roles`
- `janecreynolds752@gmail.com` exists (id: `3ff01fb3-64ba-4747-84da-de108d96acfe`) but is not an admin
- `jane@jointspottedapp.com` does not have an account yet — will need to be added once they sign up

## Changes

### 1. Add admin check to triple-tap gesture (Profile.tsx)
In `handleHeaderTripleTap`, before navigating to `/demo-settings`, call `supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })`. Only navigate if the result is `true`. For non-admins or logged-out users, the triple-tap does nothing.

This requires fetching admin status — to keep it snappy, pre-fetch admin status on mount (similar to AdminRoute) and store in a ref/state, so the triple-tap check is instant.

### 2. Protect the /demo-settings route (App.tsx)
Wrap the `/demo-settings` route in `AdminRoute` (which already exists and checks `has_role` RPC):
```
<ProtectedRoute>
  <AdminRoute>
    <DemoSettings />
  </AdminRoute>
</ProtectedRoute>
```

### 3. Add missing admin roles (data insert)
Insert admin role for `janecreynolds752@gmail.com` (`3ff01fb3-64ba-4747-84da-de108d96acfe`).

For `jane@jointspottedapp.com` — this account doesn't exist yet. Will insert the role once the account is created. A note will be added about this.

## Files Modified
- `src/pages/Profile.tsx` — admin check on triple-tap
- `src/App.tsx` — wrap `/demo-settings` route in `AdminRoute`
- Data insert for admin role

