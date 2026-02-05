

## Reorganize Find Friends Page Layout

### Overview
Move the search functionality to the top of the page and make it clearer, with the invite section below it.

---

### New Layout Order

```text
+------------------------------------------+
| ←  Find Friends                          |
+------------------------------------------+
|                                          |
|  ┌─────────────────────────────────────┐ |
|  │  🔍  Find Friends on Spotted        │ |
|  │      Search users already on app    │ |
|  │  ┌─────────────────────────────────┐│ |
|  │  │ 🔍 Search by name or username   ││ |
|  │  └─────────────────────────────────┘│ |
|  │      [Search results appear here]   │ |
|  └─────────────────────────────────────┘ |
|                                          |
|  People You May Know                     |
|  ┌─────────────────────────────────────┐ |
|  │ [Avatar] Sarah M.        [ Add ]    │ |
|  └─────────────────────────────────────┘ |
|                                          |
|  ┌─────────────────────────────────────┐ |
|  │  🔗 Invite Friends                  │ |
|  │      Share your link                │ |
|  │  ┌─────────────────────────────────┐│ |
|  │  │      📲 Text a Friend           ││ |
|  │  └─────────────────────────────────┘│ |
|  │  ┌─────────────────────────────────┐│ |
|  │  │      🔗 Copy Invite Link        ││ |
|  │  └─────────────────────────────────┘│ |
|  └─────────────────────────────────────┘ |
|                                          |
|  ┌─────────────────────────────────────┐ |
|  │ 📱 Show QR Code                   → │ |
|  └─────────────────────────────────────┘ |
|                                          |
+------------------------------------------+
```

---

### Changes to Make

#### File: `src/pages/Friends.tsx`

| Change | Description |
|--------|-------------|
| Move search section | Relocate from bottom to top of content area |
| Add header to search | Add icon + title like "Find Friends on Spotted" |
| Add subtitle | "Search for friends already using the app" |
| Reorder sections | Search → People You May Know → Invite → QR |

---

### Updated Search Section

Add a clear header with icon, matching the style of the invite section:

```tsx
{/* Find on Spotted Section - NOW FIRST */}
<div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 space-y-4">
  <div className="flex items-center gap-4 mb-2">
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center">
      <Search className="h-6 w-6 text-white" />
    </div>
    <div>
      <h3 className="font-semibold text-white text-lg">Find on Spotted</h3>
      <p className="text-white/50 text-sm">Search for friends already on the app</p>
    </div>
  </div>
  
  <div className="relative">
    <Search className="absolute left-4 top-1/2 ..." />
    <Input placeholder="Search by name or username..." ... />
  </div>
  
  {/* Search results */}
</div>
```

---

### Section Order After Changes

1. **Find on Spotted** (search) - Top priority, find existing users
2. **People You May Know** - Friend suggestions based on mutuals
3. **Invite Friends** - For friends not on the app yet
4. **Show QR Code** - Secondary option for in-person adds

This order makes logical sense: first try to find friends already on the app, then invite new ones.

