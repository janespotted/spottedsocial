

## Fix Messages Empty State Copy

### Issue
The empty state on the Messages tab has a misleading tip at the bottom: "When you're both at the same spot, start a conversation!" 

This implies messaging is only for users at the same venue, but DMs work with all friend types:
- Close friends
- Friends  
- Mutual friends

### Solution
Update the helper text to better reflect the social messaging purpose.

---

### Current vs New Copy

| Element | Current | New |
|---------|---------|-----|
| Hint text | "💡 When you're both at the same spot, start a conversation!" | "💡 Message close friends, friends, and mutuals anytime" |

---

### File to Modify

**`src/components/messages/MessagesTab.tsx`** (line 303-305)

Change:
```tsx
<p className="text-white/30 text-xs">
  💡 When you're both at the same spot, start a conversation!
</p>
```

To:
```tsx
<p className="text-white/30 text-xs">
  💡 Message close friends, friends, and mutuals anytime
</p>
```

---

### Impact
- Single line text change
- No functionality changes
- Correctly communicates that DMs work across all friend relationship types

