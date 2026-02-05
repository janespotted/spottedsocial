

## Create Dedicated Friends Page

### Overview
Create a new `/friends` page combining friend discovery, username search, invite link sharing, and QR code functionality. This will fix the broken "Invite Friends" button on the Profile page.

---

### Page Structure (Updated Order)

```text
+------------------------------------------+
| ←  Find Friends              [Check-in]  |
+------------------------------------------+
|                                          |
|        ┌─────────────────────┐           |
|        │   Share Your Link   │           |
|        │  ┌───────────────┐  │           |
|        │  │ spotted.../AB │  │           |
|        │  └───────────────┘  │           |
|        │  [  Share Link  🔗 ]│           |
|        │  👥 [X] joined via  │           |
|        │     your link       │           |
|        └─────────────────────┘           |
|                                          |
|        ┌─────────────────────┐           |
|        │  Find on Spotted    │           |
|        │  🔍 Search username │           |
|        │  ┌─────────────────┐│           |
|        │  │ Alex   @alex123 ││           |
|        │  │ Sam    @samm    ││           |
|        │  └─────────────────┘│           |
|        └─────────────────────┘           |
|                                          |
|        ┌─────────────────────┐           |
|        │ 📲 Show My QR Code  │           |
|        └─────────────────────┘           |
|                                          |
+------------------------------------------+
```

---

### Section Order

| Position | Section | Description |
|----------|---------|-------------|
| 1 | **Share Your Link** | Invite URL with copy/share, regenerate, and stats |
| 2 | **Find on Spotted** | Username search with real-time results and add buttons |
| 3 | **Show My QR Code** | Button opens QRCodeModal for in-person adds |

---

### Implementation Details

#### 1. Create New Page: `src/pages/Friends.tsx`

Layout sections in order:
- **Header**: Back navigation + "Find Friends" title + check-in button
- **Share Your Link Card**: Invite URL, share button, regenerate, inline stats
- **Find on Spotted Card**: Search input with results list below
- **QR Code Button**: Full-width button at bottom

#### 2. Add Route in `src/App.tsx`

```typescript
import Friends from "./pages/Friends";

<Route
  path="/friends"
  element={
    <ProtectedRoute>
      <Friends />
    </ProtectedRoute>
  }
/>
```

---

### Component Structure

```text
Friends Page
├── Header (← back, "Find Friends", check-in button)
├── Share Your Link Card
│   ├── URL display with copy button
│   ├── Share Link button (primary CTA)
│   ├── Regenerate button
│   └── Stats: "[X] friends joined via your link"
├── Find on Spotted Card
│   ├── Search input
│   ├── Results list with Add/Pending/Friends buttons
│   └── Empty/loading states
└── Show My QR Code Button
    └── Opens QRCodeModal on tap
```

---

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/Friends.tsx` | **Create** | New friends page with reordered sections |
| `src/App.tsx` | **Modify** | Add `/friends` route |

---

### Technical Notes

1. **Invite Code Logic**: Reuse pattern from `InviteFriendsSection` for fetching/creating invite codes
2. **Search Logic**: Use `get_profiles_safe` RPC like `FindFriendsOnboarding`
3. **Friend Requests**: Insert into `friendships` table with status 'pending'
4. **QR Modal**: Reuse existing `QRCodeModal` component
5. **Styling**: Purple gradients, glass cards, rounded corners matching app aesthetic

