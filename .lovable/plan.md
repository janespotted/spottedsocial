

# Reduce Messages Empty State Text

## Current Copy
- **Title:** "Your inbox is ready"
- **Description:** "When you message friends or they message you, conversations live here."
- **Tip:** "Message close friends, friends, and mutuals anytime"

## Proposed Copy (More Concise)
- **Title:** "Your inbox is ready"
- **Description:** "Start a conversation with friends"
- **Tip:** Remove completely (redundant with button)

---

## Technical Changes

### File: `src/components/messages/MessagesTab.tsx`

**Lines 291-305** - Shorten the description and remove the redundant tip:

```typescript
// Before:
<h3 className="text-xl font-semibold text-white mb-2">
  Your inbox is ready
</h3>
<p className="text-white/50 text-sm max-w-xs mb-4">
  When you message friends or they message you, conversations live here.
</p>
<button ... >
  Start a Chat
</button>
<p className="text-white/30 text-xs">
  💡 Message close friends, friends, and mutuals anytime
</p>

// After:
<h3 className="text-xl font-semibold text-white mb-2">
  Your inbox is ready
</h3>
<p className="text-white/50 text-sm max-w-xs mb-6">
  Start a conversation with friends
</p>
<button ... >
  Start a Chat
</button>
```

---

## Result

| Element | Before | After |
|---------|--------|-------|
| Description | 12 words | 5 words |
| Tip line | 7 words | Removed |

The empty state becomes cleaner and more focused on the action.

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/messages/MessagesTab.tsx` | Shorten description, remove tip text |

