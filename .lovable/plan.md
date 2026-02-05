

## Simplify Find Friends Page

### Overview
Streamline the invite flow to be a simple "copy link & share" experience, add iMessage redirect option, and add a "People You May Know" section showing friends of friends.

---

### Current Issues

| Problem | Solution |
|---------|----------|
| Invite code display is confusing | Remove code display, just show simple "Share Link" button |
| Too many steps/elements | Condense to one clear CTA |
| No iMessage integration | Add "Text a Friend" button that opens `sms:?body=...` |
| No friend suggestions | Add "People You May Know" section |
| Refresh button is confusing | Remove it - users don't need to regenerate codes |

---

### Simplified Layout

```text
+------------------------------------------+
| ←  Find Friends                  [Check] |
+------------------------------------------+
|                                          |
|  ┌─────────────────────────────────────┐ |
|  │  ✉️  Invite Friends                 │ |
|  │                                     │ |
|  │  ┌─────────────────────────────────┐│ |
|  │  │      📲 Text a Friend           ││ |
|  │  └─────────────────────────────────┘│ |
|  │                                     │ |
|  │  ┌─────────────────────────────────┐│ |
|  │  │      🔗 Copy Invite Link        ││ |
|  │  └─────────────────────────────────┘│ |
|  │                                     │ |
|  │  👥 3 friends joined via your link  │ |
|  │                                     │ |
|  └─────────────────────────────────────┘ |
|                                          |
|  People You May Know                     |
|  ┌─────────────────────────────────────┐ |
|  │ [Avatar] Sarah M.        [ Add ]    │ |
|  │          🔗 5 mutual friends        │ |
|  ├─────────────────────────────────────┤ |
|  │ [Avatar] Mike T.         [ Add ]    │ |
|  │          🔗 3 mutual friends        │ |
|  └─────────────────────────────────────┘ |
|                                          |
|  ┌─────────────────────────────────────┐ |
|  │ 🔍 Search by username               │ |
|  └─────────────────────────────────────┘ |
|                                          |
|  ┌─────────────────────────────────────┐ |
|  │ 📱 Show QR Code                   → │ |
|  └─────────────────────────────────────┘ |
|                                          |
+------------------------------------------+
```

---

### Technical Implementation

#### 1. Simplified Invite Section

Remove the code display and refresh button. Replace with two clear buttons:

```typescript
// Text a Friend button - opens SMS with pre-filled message
const handleTextFriend = () => {
  const message = encodeURIComponent(
    `Hey! Join me on Spotted to see where friends are going out tonight 🎉 ${getInviteUrl()}`
  );
  window.location.href = `sms:?&body=${message}`;
};

// Copy link button - simple copy to clipboard
const handleCopyLink = async () => {
  await navigator.clipboard.writeText(getInviteUrl());
  haptic.light();
  toast.success('Link copied!');
};
```

#### 2. People You May Know Section

Create a new function to fetch friends of friends who aren't already friends:

```typescript
// New state
const [suggestedFriends, setSuggestedFriends] = useState<SuggestedFriend[]>([]);
const [loadingSuggestions, setLoadingSuggestions] = useState(true);

interface SuggestedFriend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  mutual_count: number;
}

// Fetch friends of friends (client-side logic)
const fetchSuggestedFriends = async () => {
  if (!user?.id) return;
  setLoadingSuggestions(true);
  
  try {
    // 1. Get current user's friend IDs
    const { data: myFriendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    
    const myFriendIds = new Set<string>();
    myFriendships?.forEach(f => {
      myFriendIds.add(f.user_id === user.id ? f.friend_id : f.user_id);
    });
    
    // 2. Get friends of those friends
    if (myFriendIds.size === 0) {
      setSuggestedFriends([]);
      return;
    }
    
    const friendIdArray = [...myFriendIds];
    const { data: friendsOfFriends } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or(friendIdArray.map(id => `user_id.eq.${id},friend_id.eq.${id}`).join(','));
    
    // 3. Count mutual connections and filter out self/existing friends
    const mutualCounts: Record<string, number> = {};
    friendsOfFriends?.forEach(f => {
      const otherId = myFriendIds.has(f.user_id) ? f.friend_id : f.user_id;
      if (otherId !== user.id && !myFriendIds.has(otherId)) {
        mutualCounts[otherId] = (mutualCounts[otherId] || 0) + 1;
      }
    });
    
    // 4. Get profiles for top suggestions (sorted by mutual count)
    const topSuggestionIds = Object.entries(mutualCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    
    if (topSuggestionIds.length === 0) {
      setSuggestedFriends([]);
      return;
    }
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', topSuggestionIds);
    
    const suggestions = profiles?.map(p => ({
      ...p,
      mutual_count: mutualCounts[p.id] || 0
    })).sort((a, b) => b.mutual_count - a.mutual_count) || [];
    
    setSuggestedFriends(suggestions);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
  } finally {
    setLoadingSuggestions(false);
  }
};
```

---

### Changes to Make

#### File: `src/pages/Friends.tsx`

| Section | Change |
|---------|--------|
| Hero section | Keep "Grow Your Squad" badge, simplify text |
| Invite section | Remove code display, add "Text a Friend" + "Copy Link" buttons |
| Remove | Refresh code button, code display box |
| Add | "People You May Know" section before search |
| Search section | Collapse into a single row that expands on tap |
| QR section | Keep as-is |

#### New UI Elements

**Text a Friend Button:**
```tsx
<Button
  onClick={handleTextFriend}
  className="w-full bg-gradient-to-r from-[#a855f7] to-[#7c3aed] ..."
>
  <MessageCircle className="h-4 w-4 mr-2" />
  Text a Friend
</Button>
```

**Copy Link Button:**
```tsx
<Button
  onClick={handleCopyLink}
  variant="outline"
  className="w-full border-[#a855f7]/40 ..."
>
  {justCopied ? <Check /> : <Copy />}
  {justCopied ? 'Copied!' : 'Copy Invite Link'}
</Button>
```

**People You May Know Row:**
```tsx
<div className="flex items-center gap-3 p-3 ...">
  <Avatar className="h-12 w-12">
    <AvatarImage src={friend.avatar_url} />
    <AvatarFallback>{friend.display_name?.[0]}</AvatarFallback>
  </Avatar>
  <div className="flex-1">
    <p className="font-medium text-white">{friend.display_name}</p>
    <p className="text-white/50 text-sm flex items-center gap-1">
      <Users className="h-3 w-3" />
      {friend.mutual_count} mutual friend{friend.mutual_count !== 1 ? 's' : ''}
    </p>
  </div>
  <Button onClick={() => sendFriendRequest(friend.id)} size="sm">
    <UserPlus className="h-4 w-4 mr-1" />
    Add
  </Button>
</div>
```

---

### iMessage / SMS Integration

The `sms:` URL scheme works on both iOS and Android:

```typescript
// iOS & Android compatible
const handleTextFriend = () => {
  const message = encodeURIComponent(
    `Hey! Join me on Spotted to see where friends are going out 🎉 ${getInviteUrl()}`
  );
  // Use ?& for cross-platform compatibility
  window.location.href = `sms:?&body=${message}`;
};
```

On iOS, this opens iMessage. On Android, it opens the default SMS app.

---

### Summary of Changes

| Remove | Add |
|--------|-----|
| Invite code display | "Text a Friend" button (opens SMS) |
| Refresh button | "Copy Link" button |
| Complex card layout | Simple two-button layout |
| - | "People You May Know" section |
| - | Mutual friend counts |

This makes the page much simpler: two obvious ways to invite (text or copy), friend suggestions based on mutual connections, and search/QR as secondary options.

