

## Make Email/Password Section Collapsible

### Overview
Transform the email/password form into a collapsible section, making the OAuth buttons (Google, Apple) the primary focus. Users can click to expand the email form if they prefer traditional login. This follows modern auth UX patterns.

### Design
The "or" divider will become a clickable trigger that expands/collapses the email form:

```
┌────────────────────────────────────┐
│             [S Logo]               │
│             Spotted                │
│                                    │
│    [  Continue with Google  ]      │
│    [  Continue with Apple   ]      │
│                                    │
│    ─── or use email ▼ ───          │  ← Clickable trigger
│                                    │
│   (collapsed by default)           │
│                                    │
│   Own a venue? Sign in for Business │
└────────────────────────────────────┘
```

When expanded:
```
│    ─── or use email ▲ ───          │  ← Shows chevron up
│                                    │
│   Email: [________________]        │
│   Password: [_____________]        │
│                  Forgot password?  │
│         [ Sign In ]                │
│   Don't have an account? Sign up   │
```

### Implementation

**File: `src/pages/Auth.tsx`**

1. **Add imports:**
   - Import `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@/components/ui/collapsible`
   - Import `ChevronDown` from `lucide-react`

2. **Add state:**
   ```tsx
   const [emailFormOpen, setEmailFormOpen] = useState(false);
   ```

3. **Wrap the email form section:**
   - Replace the static "or" divider with a `CollapsibleTrigger`
   - Wrap the `<form>` inside `CollapsibleContent`
   - The trigger will show "or use email" with a rotating chevron icon

4. **Styling:**
   - Clickable divider with hover effect
   - Smooth animation for expand/collapse (already built into Collapsible component)
   - ChevronDown rotates 180° when open

### Technical Details

```tsx
<Collapsible open={emailFormOpen} onOpenChange={setEmailFormOpen}>
  {/* Clickable Divider */}
  <CollapsibleTrigger asChild>
    <button className="flex items-center gap-4 py-3 w-full group cursor-pointer">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <span className="text-muted-foreground text-sm font-medium px-2 flex items-center gap-1 group-hover:text-primary transition-colors">
        or use email
        <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
    </button>
  </CollapsibleTrigger>

  <CollapsibleContent>
    <form onSubmit={handleAuth} className="space-y-4 pt-2">
      {/* ... existing form fields ... */}
    </form>
  </CollapsibleContent>
</Collapsible>
```

### Files Changed
- `src/pages/Auth.tsx` - Add collapsible wrapper around email form

