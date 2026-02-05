

## Unify Friends & Friend Requests Pages

### Problem
The `/friends` and `/friend-requests` pages feel disconnected:
- Duplicate "Suggested for you" sections on both pages
- Different visual styles and headers
- Confusing navigation (Profile has two buttons going to different places)
- No easy way to navigate between them

### Solution
Merge functionality into a **single unified page** using tabs to organize content clearly.

---

### Proposed Layout

```text
+------------------------------------------+
| ←  Friends                               |
+------------------------------------------+
|  ┌─────────────────────────────────────┐ |
|  │ [Requests (2)]  [Find]  [Invite]   │ |
|  └─────────────────────────────────────┘ |
|                                          |
|  [Tab content based on selection]        |
|                                          |
+------------------------------------------+
```

**Tab 1 - Requests**: Pending friend requests with badge count
**Tab 2 - Find**: Search + "People You May Know" 
**Tab 3 - Invite**: Share link + QR code

---

### Changes Summary

| Action | Description |
|--------|-------------|
| Merge pages | Combine `/friends` and `/friend-requests` into single `/friends` page |
| Add tabs | Use tab-based UI for Requests / Find / Invite |
| Update routes | Remove `/friend-requests` route, update all navigation |
| Unified header | Consistent header style matching app design |
| Remove duplicates | Single "People You May Know" section (in Find tab) |

---

### Technical Implementation

#### 1. Restructure `/friends` with Tabs

```tsx
// New tab state
const [activeTab, setActiveTab] = useState<'requests' | 'find' | 'invite'>('requests');

// Fetch pending count for badge
const pendingCount = requests.length;

<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
  <TabsList className="...">
    <TabsTrigger value="requests">
      Requests {pendingCount > 0 && <Badge>{pendingCount}</Badge>}
    </TabsTrigger>
    <TabsTrigger value="find">Find</TabsTrigger>
    <TabsTrigger value="invite">Invite</TabsTrigger>
  </TabsList>
  
  <TabsContent value="requests">
    {/* Pending friend requests */}
    {/* Accept/Decline buttons */}
  </TabsContent>
  
  <TabsContent value="find">
    {/* Search by username */}
    {/* People You May Know */}
  </TabsContent>
  
  <TabsContent value="invite">
    {/* Text a Friend button */}
    {/* Copy Link button */}
    {/* QR Code option */}
  </TabsContent>
</Tabs>
```

#### 2. Update Navigation

| Location | Current | New |
|----------|---------|-----|
| Profile "Invite Friends" button | `/friends` | `/friends` (Invite tab) |
| Profile UserPlus icon | `/friend-requests` | `/friends` (Requests tab) |
| Settings "Find Friends" | `/friends` | `/friends` |
| FriendRequests back button | `/profile` | N/A (page removed) |

Pass tab selection via navigation state:
```tsx
navigate('/friends', { state: { tab: 'requests' } });
```

#### 3. Route Cleanup

Remove the `/friend-requests` route from `App.tsx` and delete `FriendRequests.tsx` (functionality merged into `Friends.tsx`).

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Friends.tsx` | Add tabs, merge friend request handling logic |
| `src/pages/Profile.tsx` | Update UserPlus button to navigate to `/friends` with tab state |
| `src/App.tsx` | Remove `/friend-requests` route |
| `src/pages/FriendRequests.tsx` | Delete (merged into Friends.tsx) |

---

### Benefits

- Single place for all friend management
- No duplicate sections
- Clear tab-based navigation
- Consistent visual style
- Pending requests badge visible at all times
- Easier to discover all friend features

