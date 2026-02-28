

## Make "Share a Plan" feel as smooth as the search modal

### Problem
The CreatePlanDialog uses a `Drawer` (vaul) which slides up from the bottom with a heavier spring animation. The FriendSearchModal is a simple full-screen overlay with `animate-fade-in`, which feels much snappier and smoother.

### Solution
Convert `CreatePlanDialog` from a vaul `Drawer` to a full-screen overlay matching the same pattern as `FriendSearchModal`:
- Remove the `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` wrapper
- Replace with a `fixed inset-0` div with `animate-fade-in` class, same as FriendSearchModal
- Add an `ArrowLeft` back button in the header (same pattern)
- Keep all the internal content (venue search, options, post button) identical
- Return `null` when `!open`, same conditional render pattern

### Files changed
- `src/components/CreatePlanDialog.tsx` — replace Drawer with full-screen overlay

