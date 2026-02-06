

# Fix Z-Index: Map Filters Appearing Above CheckIn Modal

## Problem
On the Map page when you tap the "Are You Out?" button, the CheckIn modal/drawer opens but the map filter elements (search bar, explore bar, venue filter, "4 friends out" pill) appear above it instead of below.

## Root Cause
The Drawer component (used on mobile) has `z-50`, but the Map page filter elements have much higher z-indexes:
- Search bar/input: `z-[200]`
- Search results dropdown: `z-[250]`
- Venue filter dropdown: `z-[300]`
- Explore venues: `z-[200]`
- Layer visibility toggle: `z-[200]`

The Dialog component (used on desktop) already has `z-[500]`, so this is primarily a mobile issue.

## Solution
Increase the Drawer component's z-index to `z-[500]` to match the Dialog component, ensuring both modals appear above all Map page UI elements.

---

## Technical Changes

### File: `src/components/ui/drawer.tsx`

**Line 29** - Update DrawerOverlay z-index:
```typescript
// Before:
"fixed inset-0 z-50 bg-black/80"

// After:
"fixed inset-0 z-[500] bg-black/80"
```

**Line 42** - Update DrawerContent z-index:
```typescript
// Before:
"fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background"

// After:
"fixed inset-x-0 bottom-0 z-[500] mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background"
```

---

## Z-Index Hierarchy After Fix

| Element | Z-Index | Layer |
|---------|---------|-------|
| Map header | `z-20` | Base UI |
| Map filter buttons | `z-[200]` | Floating controls |
| Search results dropdown | `z-[250]` | Dropdowns |
| Venue filter dropdown | `z-[300]` | Dropdowns |
| **Drawer/Dialog** | **`z-[500]`** | **Modals** |
| Select dropdowns inside modals | `z-[600]` | Modal dropdowns |

This creates a clear layering where all modals (including CheckIn) appear above all map UI elements.

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/ui/drawer.tsx` | Update overlay and content z-index from `z-50` to `z-[500]` |

