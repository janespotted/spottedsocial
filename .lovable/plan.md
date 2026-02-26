

# Add "Staying In" Section to Find Friends

## What's happening now
The home/staying-in friends **are already rendered** in the modal (lines 264-272), but they have no section header — just a thin border separator. So they appear as unlabeled rows at the bottom, easy to miss.

## Fix (1 file)

### `src/components/FriendSearchModal.tsx` (lines 264-272)

Replace the headerless home section with a proper "Staying In" group header matching the other sections:

```typescript
{/* Staying In */}
{homeFriends.length > 0 && (
  <>
    <div className="px-3 py-2 bg-[#1a0f2e]/50 border-y border-[#a855f7]/20">
      <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider">
        🏠 Staying In
        <span className="text-white/50 normal-case tracking-normal">({homeFriends.length})</span>
      </p>
    </div>
    {homeFriends.map(renderFriendRow)}
  </>
)}
```

This adds a "🏠 Staying In (N)" header with the same divider bar styling as the "Friends Planning" section, making all three groups visually consistent and ensuring home friends are clearly visible at the bottom.

