

# Fix: Biggest Mover Card Cutoff + "Are You Out?" on Every App Open (10-min cooldown)

## Issue 1: Biggest Mover Card Cut Off in PWA Mode

The Biggest Mover card uses `fixed bottom-24` positioning, which doesn't account for the bottom safe area inset in PWA mode. The bottom nav already accounts for it, pushing up, but the card stays at a fixed offset and gets clipped.

### File: `src/pages/Leaderboard.tsx` (~line 742)

Change the positioning to include safe area padding:

```
- <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 w-full max-w-[430px] px-4">
+ <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-20 w-full max-w-[430px] px-4">
```

This mirrors how the bottom nav handles safe area and keeps the card above it.

---

## Issue 2: "Are You Out?" Should Pop Up Every App Open (10-min cooldown)

Currently, `useCheckInPrompt` uses an in-memory `useRef` flag -- it only prompts once per page session and checks if the user has already set a status tonight. The user wants: every time the app is opened (or foregrounded), show the prompt, unless it was shown in the last 10 minutes.

### File: `src/hooks/useCheckInPrompt.ts`

Replace the in-memory ref approach with a localStorage timestamp approach:

1. Remove `hasPromptedRef`
2. On mount, check `localStorage` for a key like `checkin_prompt_last_shown`
3. If the timestamp is less than 10 minutes ago, skip
4. Otherwise, show the prompt and save `Date.now()` to localStorage
5. Keep the nightlife hours check
6. Remove the night status DB check (user wants it every open, not just when they haven't checked in)

```typescript
const PROMPT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const STORAGE_KEY = 'checkin_prompt_last_shown';

export function useCheckInPrompt() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();

  const checkAndPrompt = useCallback(() => {
    if (!user?.id) return;
    if (!isNightlifeHours()) return;

    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown && Date.now() - Number(lastShown) < PROMPT_COOLDOWN_MS) return;

    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    openCheckIn();
  }, [user?.id, openCheckIn]);

  useEffect(() => {
    if (user?.id) {
      const timer = setTimeout(checkAndPrompt, 500);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkAndPrompt]);

  return { checkAndPrompt };
}
```

This removes the DB call (simpler/faster), persists across page reloads and app re-opens, and respects the 10-minute cooldown.

---

| File | Change |
|------|--------|
| `src/pages/Leaderboard.tsx` | Update Biggest Mover card bottom positioning to include safe area inset |
| `src/hooks/useCheckInPrompt.ts` | Replace in-memory ref with localStorage-based 10-minute cooldown |
