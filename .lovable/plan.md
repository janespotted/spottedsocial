

## Fix: Confetti renders behind venue cards

**Problem**: `canvas-confetti` creates a canvas element on `<body>` with a default z-index of `10`. The VenueInviteConfirmation overlay uses `z-[600]`, so confetti appears behind it.

**Fix**: Pass `zIndex: 9999` to every `confetti()` call in `src/components/VenueInviteConfirmation.tsx`.

### Changes

**`src/components/VenueInviteConfirmation.tsx`** — Add `zIndex: 9999` to both confetti calls inside the `frame()` function (~lines 29-40):

```typescript
confetti({
  particleCount: 3,
  angle: 60,
  spread: 55,
  origin: { x: 0, y: 0.6 },
  colors: ['#a855f7', '#d4ff00', '#ffffff'],
  zIndex: 9999
});
confetti({
  particleCount: 3,
  angle: 120,
  spread: 55,
  origin: { x: 1, y: 0.6 },
  colors: ['#a855f7', '#d4ff00', '#ffffff'],
  zIndex: 9999
});
```

Single file, two-line addition.

