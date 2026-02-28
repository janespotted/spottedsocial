

## Fix: Add top padding to Messages page header

The header uses `pt-[env(safe-area-inset-top)]` for the outer container and `pt-4` for the inner content div. On devices without a safe-area-inset (or in web preview), `env(safe-area-inset-top)` resolves to `0`, so the content sits flush at the top.

### Change

**`src/pages/Messages.tsx` (line 65-66)**:
- Change the outer header div's padding from `pt-[env(safe-area-inset-top)]` to include a minimum fallback: `pt-[max(env(safe-area-inset-top),12px)]`
- Increase the inner content div's top padding from `pt-4` to `pt-6`

This ensures at least 12px of top padding even when safe-area-inset is 0, plus more breathing room for the title and location badge.

### Files changed
- `src/pages/Messages.tsx` — increase header top padding

