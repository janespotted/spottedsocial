
# Rename and Clarify Feed Sections

## Overview
Update the copy in both sections to make their purposes distinct:
- **"Planning Tonight"** → **"Who's Out Tonight?"** (status signal - friends thinking about going out)
- **"Drop a Plan"** → **"Share Plans"** (content creation - specific plans and events)

---

## Changes

### 1. FriendsPlanning.tsx (Status Signal Section)

**Line 208-209** - Update header:
```tsx
// Before:
<span className="text-lg">🎯</span>
<h3 className="text-white font-semibold text-sm">Planning Tonight</h3>

// After:
<span className="text-lg">👀</span>
<h3 className="text-white font-semibold text-sm">Who's Out Tonight?</h3>
```

**Line 236-238** - Update empty state copy:
```tsx
// Before:
<p className="text-white/40 text-xs text-center py-2">
  No one's started planning yet. Kick things off?
</p>

// After:
<p className="text-white/40 text-xs text-center py-2">
  No friends thinking about tonight yet. Be the first?
</p>
```

**Line 330** - Update friend row subtitle:
```tsx
// Before:
<span className="text-white/50 text-xs">Planning to go out</span>

// After:
<span className="text-white/50 text-xs">Thinking about going out</span>
```

**Line 380** - Same update in expanded view:
```tsx
// Before:
<span className="text-white/50 text-xs">Planning to go out</span>

// After:
<span className="text-white/50 text-xs">Thinking about going out</span>
```

**Line 407-408** - Update CTA button:
```tsx
// Before:
<Plus className="w-4 h-4" />
I'm planning too

// After:
<Plus className="w-4 h-4" />
I'm thinking too
```

---

### 2. PlansFeed.tsx (Content Creation Section)

**Line 584-589** - Update section header and description:
```tsx
// Before:
<span className="text-lg">📝</span>
<h3 className="text-white font-semibold text-base">
  {weekendFilter ? 'Make Weekend Plans' : 'Drop a Plan'}
</h3>
<p className="text-white/50 text-xs mt-1 ml-7">Share a plan your friends can join</p>

// After:
<span className="text-lg">📝</span>
<h3 className="text-white font-semibold text-base">
  {weekendFilter ? 'Make Weekend Plans' : 'Share Plans'}
</h3>
<p className="text-white/50 text-xs mt-1 ml-7">Post a specific plan or event your friends can join</p>
```

**Line 621** - Update empty state fallback:
```tsx
// Before:
: 'Drop a plan and see who\'s down to join.'

// After:
: 'Share a plan and see who\'s down to join.'
```

---

## Summary of Copy Changes

| Location | Before | After |
|----------|--------|-------|
| Status section header | "🎯 Planning Tonight" | "👀 Who's Out Tonight?" |
| Status empty state | "No one's started planning yet" | "No friends thinking about tonight yet" |
| Friend status label | "Planning to go out" | "Thinking about going out" |
| Join button | "I'm planning too" | "I'm thinking too" |
| Content section header | "📝 Drop a Plan" | "📝 Share Plans" |
| Content section subtitle | "Share a plan your friends can join" | "Post a specific plan or event your friends can join" |
| Content empty state | "Drop a plan and see who's down" | "Share a plan and see who's down" |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/components/FriendsPlanning.tsx` | Header, empty state, friend labels, CTA button |
| `src/components/PlansFeed.tsx` | Section header, subtitle, empty state copy |

---

## Result
The two sections will now be clearly differentiated:
- **"Who's Out Tonight?"** - Shows friends signaling intent (status-based)
- **"Share Plans"** - For posting specific plans/events (content-based)
