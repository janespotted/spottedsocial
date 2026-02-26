

# UI Polish Pass — Icons, Cards, and Color Consistency

This is a large visual consistency pass across ~25 files. No database changes needed.

---

## 1. Replace UI Emojis with Lucide Icons

### `src/pages/Home.tsx` (line 427)
- `🎯` → `<Target className="h-4 w-4 text-[#a855f7] inline" />` in planning friends teaser

### `src/components/messages/VenueYapThread.tsx`
- Line 625: `🔥` → `<Flame className="h-4 w-4 text-[#d4ff00] inline" />`
- Line 732: `📍 Head here to post` → remove 📍 (MapPin icon already present next to it)
- Line 754: `💀 buried by the crowd` → `<EyeOff className="h-4 w-4 text-white/50 inline mr-1" />` + text
- Line 883: `📍 Head here to comment` → remove 📍 (MapPin icon already present)
- Line 397: `📹` / `📸` fallback text → `<Video />` / `<Camera />` icon (these are in message text for media-only posts — keep as-is, it's user content)

### `src/components/messages/YapTab.tsx`
- Line 217: `📍 You're at` → `<MapPin className="h-4 w-4 text-[#d4ff00] inline mr-1" />`
- Line 267: `📍` venue header → `<MapPin className="h-3.5 w-3.5 text-[#d4ff00] inline mr-0.5" />`
- Lines 272, 307-308: `📌` pinned updates → `<Pin className="h-3.5 w-3.5 text-[#d4ff00] inline mr-0.5" />`
- Line 303: `📍` venue line → `<MapPin className="h-3.5 w-3.5 text-[#d4ff00] inline mr-0.5" />`
- Line 318: `🔥` hot yap → `<Flame className="h-3.5 w-3.5 text-[#d4ff00] inline mr-0.5" />`

### `src/components/messages/ActivityTab.tsx`
- Line 631: `🎯` planning header → `<Target className="h-4 w-4 text-[#a855f7]" />`
- Line 770: `⚡` trending → `<TrendingUp className="h-4 w-4 text-[#d4ff00]" />`
- Line 783: `❤️ liked your post` → `<Heart className="h-3.5 w-3.5 text-red-400 inline mr-0.5" />`
- Lines 813, 832: `I'm down! 🎉` → `I'm down!` (remove emoji from button)
- Line 824: `Say hi! 👋` → `Say hi!` (remove emoji from button)

### `src/components/PrivatePartyInviteModal.tsx`
- Line 246: `🔥` Friends Planning → `<Flame className="h-4 w-4 text-[#d4ff00]" />`
- Line 248: `🎯` → `<Target className="h-4 w-4 text-[#a855f7]" />`
- Line 270: `🎉` Friends Out → `<MapPin className="h-4 w-4 text-[#d4ff00]" />`

### `src/components/OnboardingCarousel.tsx`
- Line 13: `Welcome to Spotted 🎉` → `Welcome to Spotted` (clean title)

### `src/components/PlanningReadyBanner.tsx`
- Line 12: `Ready to go? 🎉` → `Ready to go?`

### `src/pages/NotFound.tsx`
- Line 18: `🔍` emoji → `<Search className="h-10 w-10 text-[#a855f7]/60" />`

### `src/pages/Notifications.tsx`
- Line 49: `🔔` emoji → `<Bell className="h-10 w-10 text-[#a855f7]/60" />`

### `src/pages/Profile.tsx`
- Line 731: `❤️` → `<Heart className="h-3.5 w-3.5 text-red-400 inline mr-0.5" />`
- Line 732: `💬` → `<MessageCircle className="h-3.5 w-3.5 text-white/40 inline mr-0.5" />`

### `src/components/QuickStatusSheet.tsx`
- Line 270: `🎯 Planning on it` → `<Target>` icon + text
- Line 271: `🏠 Staying in` → `<Home>` icon + text
- Line 278: `📍 You're near` → MapPin icon already via button context; remove emoji
- Line 288: `Yes, I'm out 🎉` → `Yes, I'm out`
- Line 298: `Planning on it 🎯` → `Planning on it` (icon already present via `<Target>`)
- Line 308: `No — staying in 🏠` → `No — staying in` (icon already present via `<Home>`)

### `src/components/CheckInModal.tsx`
- Line 949: `I'm at a Private Party 🏠` → `I'm at a Private Party` (icon already present)

### `src/components/FriendSearchModal.tsx`
- Line 269: `🏠 Staying In` → `<Home className="h-3.5 w-3.5 text-white/50 inline mr-0.5" />`

### `src/pages/Map.tsx`
- Lines 1693-1697: venue filter emojis (`🗺️`, `🎵`, `🍸`, `🍺`, `🌃`) → Lucide icons: `MapIcon`, `Music`, `Wine`, `Beer`, `Building`
- Line 1207-1211: `venueTypeEmoji` function → return Lucide icon JSX

### `src/components/VenueIdCard.tsx` & `src/components/UpdateSpotSheet.tsx`
- Venue type emoji maps → Lucide icons (same mapping as Map.tsx)

### `src/components/ReviewCard.tsx`
- Lines 147-153: Rating emojis are stylistic UI labels → replace with lucide: `Flame` (5), `Sparkles` (4), `Wine` (3), `Music` (2), `Star` (1)

### Files with toast/notification emojis (keep as-is — these are transient messages, not persistent UI)
- `toast.success("🎉")` patterns in AuthContext, VenueEventsSection, Settings — **keep**
- `PrivatePartyInviteModal` notification messages with `🏠` — **keep** (user-facing notification text)
- `PrivatePartyCard` notification message — **keep**

---

## 2. Remove Purple Border Outlines from Cards

Replace `border border-[#a855f7]/XX` on cards with `bg-white/[0.06] backdrop-blur-sm rounded-2xl` (borderless). This applies to:

- **Cards and containers** (NOT inputs, dialogs, avatars, or dividers)

Files to update:
- `src/components/ReviewCard.tsx` — line 97
- `src/components/messages/NewChatDialog.tsx` — lines 190, 233
- `src/components/messages/VenueYapThread.tsx` — line 730
- `src/pages/CloseFriends.tsx` — lines 150, 165, 186
- `src/components/FindFriendsOnboarding.tsx` — lines 283, 300, 315, 341, 375, 421
- `src/pages/Notifications.tsx` — lines 48, 69
- `src/components/LeaderboardSkeleton.tsx` — line 10
- `src/pages/Home.tsx` — line 404 (empty state icon circle)
- `src/components/EmptyState.tsx` — line 19
- `src/components/VenueMoveBanner.tsx` — line 24
- `src/components/PlanningReadyBanner.tsx` — line 10

**Keep borders on**: Dialog/sheet borders, input fields, avatar rings, section dividers (`border-t border-white/10`), and interactive/focus states.

---

## 3. Dial Back `#d4ff00` Usage

Remove `#d4ff00` from non-interactive/non-status uses:

- `src/pages/NotFound.tsx` line 20: `text-[#d4ff00]` on "404" → `text-white`
- `src/components/QuickStatusSheet.tsx` line 277-279: yellow-green border/bg suggested venue box → `border-white/20 bg-white/[0.06]` with `text-white/70`
- `src/components/QuickStatusSheet.tsx` line 278: `text-[#d4ff00]` on venue name → `text-white`

**Keep `#d4ff00` on**: CTA buttons, active tab underlines, status dots, MapPin/icon accents, venue @-mentions, and the "View" badge.

---

## 4. Spotted Logo

No changes to letter spacing or font treatment on "S p o t t e d" title.

---

## Technical Notes

- Approximately 25 files modified, no new files
- All icon imports come from `lucide-react` (already installed)
- Icons sized with `h-3.5 w-3.5` for small text contexts, `h-4 w-4` for normal, `h-5 w-5` for larger
- The `venueTypeEmoji` function in Map.tsx and the typeMap objects in VenueIdCard/UpdateSpotSheet need to return JSX instead of strings — this requires changing the type from `string` to `ReactNode` and updating how they're rendered

