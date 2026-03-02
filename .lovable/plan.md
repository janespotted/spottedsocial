

## Plan: Clean Up Notification Copy, Thread Header, and Anonymous Yap Notifications

Three issues to fix across 3 files.

---

### 1. Fix "Invites to You" copy — venue_invite should say "inviting you to"

**`src/components/messages/ActivityTab.tsx`** — line 906-913

Currently the venue_invite card shows:
> **Jane**  
> @The Victorian

Change to:
> **Jane**  
> is inviting you to The Victorian

```tsx
{activity.type === 'venue_invite' && (
  <div className="text-white text-sm">
    <div className="flex items-center gap-2">
      <span className="font-semibold">{activity.display_name}</span>
      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
    </div>
    <span className="text-[#d4ff00] block text-xs mt-0.5">inviting you to {activity.subtitle}</span>
  </div>
)}
```

---

### 2. Make "Yaps at Your Spot" anonymous — no username

**`src/components/messages/ActivityTab.tsx`** — line 987-995

Currently shows "Jane" with avatar. Change to anonymous: hide the avatar, don't show the display name, just show "New yap @ [venue]".

```tsx
{activity.type === 'venue_yap' && (
  <div className="text-white text-sm">
    <div className="flex items-center gap-2">
      <span className="font-semibold">New yap</span>
      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
    </div>
    <span className="text-amber-400 block text-xs mt-0.5 line-clamp-1">{activity.subtitle || 'at your spot'}</span>
  </div>
)}
```

Also update the avatar/icon section in `renderActivityCard` (~line 866-892): for `venue_yap` type, show a generic chat icon instead of the sender's avatar. And update `useYapNotifications.ts` line 95 to remove the yapper's name from the notification message.

**`src/hooks/useYapNotifications.ts`** — line 80-101

Change the banner message from `"💬 Jane yapped at The Victorian: ..."` to `"💬 New yap at The Victorian: ..."`. Remove the profile fetch since we no longer need the name, and don't pass `sender_profile` to the banner.

---

### 3. Fix Thread header getting cut off

**`src/pages/Thread.tsx`** — line 357-358

The header `pt-[max(env(safe-area-inset-top),12px)]` with `p-4` inside works, but the content gets visually cramped. Add more top padding to the inner container:

```tsx
<div className="flex items-center justify-between px-4 py-3">
```

And for the 1:1 chat header (line 486-499), the venue name badge is pushed to the far right and can overflow. Move it below the username instead of inline:

```tsx
<div className="flex-1 min-w-0 text-left">
  <h2 className="font-semibold text-white truncate">{otherMember?.display_name}</h2>
  <div className="flex items-center gap-2">
    <p className="text-white/60 text-sm truncate">@{otherMember?.username}</p>
    {otherMember?.venue_name && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleVenueClick(otherMember.venue_name!, otherMember.venue_id);
        }}
        className="text-[#d4ff00] text-xs font-medium hover:text-[#d4ff00]/80 transition-colors truncate max-w-[140px]"
      >
        @{otherMember.venue_name}
      </button>
    )}
  </div>
</div>
```

Remove the separate venue button that was outside the text container (line 490-499).

---

### Summary

| File | Change |
|------|--------|
| `src/components/messages/ActivityTab.tsx` | venue_invite copy → "inviting you to"; venue_yap → anonymous with icon |
| `src/hooks/useYapNotifications.ts` | Remove username from yap banner message |
| `src/pages/Thread.tsx` | Clean up header layout, move venue badge inline with username |

