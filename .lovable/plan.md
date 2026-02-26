

# Improve Newsfeed Empty State

## Changes — `src/pages/Home.tsx`

Replace the empty state block (lines 403-440) with a streamlined version:

### 1. Time-aware headline
Replace both the daytime and nightlife branches with a single time-aware headline function:
- Before 12pm: "Who's up?"
- 12pm–5pm: "What's the move?"
- 5pm–9pm: "Night's young"
- After 9pm: "Be the first"

No subtitle text at all.

### 2. Single CTA
Keep only the neon yellow "Share what you're up to" button that opens `setShowCreatePost(true)`. Remove the purple "Set Your Status" button entirely.

### 3. Planning friends teaser
Below the CTA, if `planningFriends.length > 0`, render:
```
🎯 {planningFriends.length} friends are making plans
```
As a subtle `text-white/40 text-sm` line. Make it a tappable button that switches to `setFeedMode('plans')`.

### Implementation

Add a helper function at the top of the component:
```typescript
const getEmptyHeadline = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Who's up?";
  if (hour < 17) return "What's the move?";
  if (hour < 21) return "Night's young";
  return "Be the first";
};
```

Replace lines 403-440 (the entire empty state `<div>`) with:
```tsx
<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
  <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6 border border-[#a855f7]/20">
    <MessageCircle className="h-10 w-10 text-[#a855f7]/60" />
  </div>
  <h3 className="text-xl font-semibold text-white mb-6">
    {getEmptyHeadline()}
  </h3>
  <button
    onClick={() => setShowCreatePost(true)}
    className="bg-[#d4ff00] hover:bg-[#d4ff00]/90 text-[#1a0f2e] rounded-full px-6 py-2.5 font-medium transition-colors"
  >
    Share what you're up to
  </button>
  {planningFriends.length > 0 && (
    <button
      onClick={() => setFeedMode('plans')}
      className="mt-4 text-white/40 text-sm hover:text-white/60 transition-colors"
    >
      🎯 {planningFriends.length} {planningFriends.length === 1 ? 'friend is' : 'friends are'} making plans
    </button>
  )}
</div>
```

Remove the `isNightlifeHours()` import if it's no longer used elsewhere (it is — used for `feedMode` default), so keep it.

No other files affected.

