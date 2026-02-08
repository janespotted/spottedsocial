
# Fix Find Friends Skip Flow Bug

## Problem
When users try to skip the Find Friends onboarding step, clicking "Skip anyway" on the confirmation dialog sends them backwards or shows a login form instead of completing onboarding and entering the main app.

## Root Cause
The skip confirmation flow has a race condition:
1. `handleConfirmSkip()` closes the Dialog and calls `onSkip()` without waiting
2. `onSkip()` → `completeOnboarding()` is async but not awaited
3. The Dialog's close animation/state change can cause re-renders before the database update completes
4. This can trigger the onboarding check to run again, finding `has_onboarded` still false

## Solution
Fix the async handling and ensure the onboarding state is updated before closing the dialog.

---

## Technical Changes

### File: `src/components/FindFriendsOnboarding.tsx`

**1. Prevent Dialog from interfering with the skip flow (line 447)**

Change the Dialog's `onOpenChange` to prevent closing during the skip action:

```typescript
// Add state to track skip in progress
const [skipInProgress, setSkipInProgress] = useState(false);
```

**2. Update `handleConfirmSkip` to be async and set loading state (lines 229-233)**

```typescript
const handleConfirmSkip = async () => {
  setSkipInProgress(true);
  haptic.light();
  
  // Complete onboarding FIRST, then close dialog
  await onSkip();
  
  setShowSkipConfirmation(false);
  setSkipInProgress(false);
};
```

**3. Update Dialog onOpenChange to prevent close during skip (line 447)**

```typescript
<Dialog 
  open={showSkipConfirmation} 
  onOpenChange={(open) => {
    // Don't allow closing if skip is in progress
    if (!skipInProgress) {
      setShowSkipConfirmation(open);
    }
  }}
>
```

**4. Disable buttons during skip to prevent double-clicks (lines 467-478)**

```typescript
<Button
  onClick={() => setShowSkipConfirmation(false)}
  disabled={skipInProgress}
  className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold rounded-full py-5"
>
  Add Friends First
</Button>
<button
  onClick={handleConfirmSkip}
  disabled={skipInProgress}
  className="w-full text-white/50 hover:text-white py-2 transition-colors text-sm disabled:opacity-50"
>
  {skipInProgress ? 'Please wait...' : 'Skip anyway'}
</button>
```

---

### File: `src/hooks/useOnboarding.ts`

**5. Make `completeOnboarding` return a Promise that resolves after state update (lines 35-46)**

```typescript
const completeOnboarding = async () => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ has_onboarded: true })
      .eq('id', user?.id);

    if (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }

    setShowOnboarding(false);
  } catch (error) {
    console.error('Error completing onboarding:', error);
    // Still hide onboarding on error to prevent user from being stuck
    setShowOnboarding(false);
    throw error;
  }
};
```

---

## Flow After Fix

```text
User clicks "Skip anyway"
        |
        v
setSkipInProgress(true)
        |
        v
await onSkip() (completeOnboarding)
   - Updates database
   - Sets showOnboarding = false
        |
        v
setShowSkipConfirmation(false)
        |
        v
Main app renders (onboarding complete)
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/FindFriendsOnboarding.tsx` | Add async handling, loading state, prevent dialog close during skip |
| `src/hooks/useOnboarding.ts` | Improve error handling in completeOnboarding |
