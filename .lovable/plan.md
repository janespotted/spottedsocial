

# Fix Header Icon Spacing + Move Settings Gear

## Current State

Each page has its own inline header with `gap-3` between icons. The Profile page has an extra Settings gear icon in the header that doesn't belong there.

**Current icon order per page:**
- **Home**: Search, Bell, S logo — `gap-3`
- **Leaderboard**: Search, Bell, S logo — `gap-3`
- **Map**: Bell, S logo — `gap-3` (search already removed)
- **Messages**: Search, Bell, S logo — `gap-3`
- **Profile**: Search, **Settings gear**, Bell, S logo — `gap-3`

## Changes

### 1. Increase icon spacing on all pages (`gap-3` → `gap-4`)

Update the right-side icon container `className` on each page:

| File | Line | Change |
|------|------|--------|
| `src/pages/Home.tsx` | 286 | `gap-3` → `gap-4` |
| `src/pages/Leaderboard.tsx` | 486 | `gap-3` → `gap-4` |
| `src/pages/Map.tsx` | 1241 | `gap-3` → `gap-4` |
| `src/pages/Messages.tsx` | 64 | `gap-3` → `gap-4` |
| `src/pages/Profile.tsx` | 381 | `gap-3` → `gap-4` |

### 2. Remove Settings gear from Profile header

**`src/pages/Profile.tsx`** — Delete lines 389-394 (the Settings button in the header):

```tsx
// DELETE THIS:
<button 
  onClick={() => navigate('/settings')}
  className="w-10 h-10 rounded-full bg-[#2d1b4e] border border-[#a855f7]/40 flex items-center justify-center text-white hover:bg-[#a855f7]/20 transition-colors"
>
  <Settings className="h-5 w-5" />
</button>
```

### 3. Add Settings gear to the profile section

**`src/pages/Profile.tsx`** — Add a small gear icon next to the "Edit Profile" button (around line 510-517). Change the Edit Profile button row to include a settings icon button:

```tsx
<div className="flex gap-3">
  <Button
    onClick={() => navigate('/profile/edit')}
    variant="outline"
    className="flex-1 border-white text-white hover:bg-white/10 rounded-full"
  >
    Edit Profile
  </Button>
  <Button
    onClick={() => navigate('/settings')}
    variant="outline"
    className="border-white/40 text-white hover:bg-white/10 rounded-full px-3"
  >
    <Settings className="h-4 w-4" />
  </Button>
  <Button
    onClick={handleShareProfile}
    variant="outline"
    className="flex-1 border-white text-white hover:bg-white/10 rounded-full"
  >
    <Share2 className="h-4 w-4 mr-2" />
    Share Profile
  </Button>
</div>
```

### Result
- All pages: consistent `gap-4` spacing between header icons
- All headers contain only: Spotted title/logo, CityBadge, Search (hidden on Map), Bell, S icon
- Settings gear moved into profile content area next to Edit Profile and Share Profile buttons

