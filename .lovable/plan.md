

## Plan: Remove Yap prompt from check-in confirmation

Remove the "What's [venue] like tonight? → Yap about it" phase that appears after the confetti celebration. The check-in confirmation will just show the confetti celebration card and dismiss on tap, same as it does for planning check-ins.

### Changes in `src/components/CheckInConfirmation.tsx`

1. **Remove the `phase` state** and all references to `'yap_prompt'`
2. **Remove the yap prompt timeout** (lines 95-98) — the confetti effect for venue check-ins will just run without transitioning to a second screen
3. **Remove the entire yap prompt render block** (the `if (phase === 'yap_prompt' ...)` section ~lines 145-185)
4. **Remove `handleShareClick`** function and related imports (`MessageCircle`)
5. Keep confetti + tap-to-dismiss celebration card as the only confirmation UI for all check-in types

