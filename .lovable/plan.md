

# Fix Glitchy Text Field in Check-In Flow

## Problem Identified

When checking in and no venue is detected, the venue Select dropdown and neighborhood Select dropdowns appear glitchy. This is a **known Radix UI Select limitation** - it doesn't handle empty string (`''`) values properly.

**Root Cause:** Multiple Select components in `CheckInModal.tsx` use empty string `''` as the default/unselected value:
- Line 811: `value={selectedVenueId || ''}` 
- Line 903: `value={planningNeighborhood}` (initialized as `''`)
- Line 1185: `value={privatePartyNeighborhood}` (initialized as `''`)

---

## Solution

Convert all empty string values to `undefined` for Select components. Radix Select handles `undefined` correctly as "no selection."

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/CheckInModal.tsx` | Fix Select value handling |

---

## Implementation Details

### 1. Change State Initialization

```typescript
// BEFORE
const [planningNeighborhood, setPlanningNeighborhood] = useState<string>('');
const [privatePartyNeighborhood, setPrivatePartyNeighborhood] = useState<string>('');

// AFTER
const [planningNeighborhood, setPlanningNeighborhood] = useState<string | undefined>(undefined);
const [privatePartyNeighborhood, setPrivatePartyNeighborhood] = useState<string | undefined>(undefined);
```

### 2. Fix Venue Select Value

```typescript
// BEFORE (Line 811)
<Select value={selectedVenueId || ''} onValueChange={handleVenueSelect}>

// AFTER
<Select value={selectedVenueId ?? undefined} onValueChange={handleVenueSelect}>
```

### 3. Fix State Reset Logic

When resetting states (e.g., when privacy flow starts), use `undefined` instead of `''`:

```typescript
// BEFORE
setPlanningNeighborhood('');
setPrivatePartyNeighborhood('');

// AFTER  
setPlanningNeighborhood(undefined);
setPrivatePartyNeighborhood(undefined);
```

### 4. Update Condition Checks

```typescript
// BEFORE
disabled={!planningNeighborhood}
disabled={!privatePartyNeighborhood}

// AFTER (no change needed - undefined is falsy too)
disabled={!planningNeighborhood}
disabled={!privatePartyNeighborhood}
```

---

## Changes Summary

1. **State types**: Change `useState<string>('')` to `useState<string | undefined>(undefined)` for:
   - `planningNeighborhood`
   - `privatePartyNeighborhood`

2. **Select value prop**: Change `value={selectedVenueId || ''}` to `value={selectedVenueId ?? undefined}`

3. **State resets**: Change all `setState('')` to `setState(undefined)` for these fields

---

## Why This Works

Radix UI Select component:
- Empty string `''` is treated as a valid value, causing the component to try to find a matching SelectItem
- `undefined` is treated as "no selection," which properly shows the placeholder and doesn't cause rendering glitches

This is a documented Radix limitation and using `undefined` for optional selections is the recommended pattern.

