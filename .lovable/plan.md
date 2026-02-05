

## Add "Business Sign In" Link to Auth Page

### Overview
Add a subtle link at the bottom of the Auth page for venue owners/managers to access the business portal. This keeps the consumer flow clean while providing a discoverable entry point for businesses.

### Design Approach
Based on the current Auth page design (glassmorphism card, purple gradients, neon accents), add a simple text link below the main card that says "Own a venue? Sign in for Business" - matching the existing muted text styling.

### Changes

**File: `src/pages/Auth.tsx`**

Add a link at the bottom of the Card component (after line 411, before the closing `</Card>`):

```tsx
{/* Business Portal Link */}
<div className="text-center pb-4">
  <Link 
    to="/business/auth" 
    className="text-sm text-muted-foreground hover:text-primary transition-colors"
  >
    Own a venue?{' '}
    <span className="text-primary hover:underline">Sign in for Business</span>
  </Link>
</div>
```

### Visual Placement
```
┌────────────────────────────────────┐
│             [S Logo]               │
│             Spotted                │
│   Welcome back! Sign in to...      │
│                                    │
│    [  Continue with Google  ]      │
│           ─── or ───               │
│                                    │
│   Email: [________________]        │
│   Password: [_____________]        │
│                  Forgot password?  │
│                                    │
│         [ Sign In ]                │
│   Don't have an account? Sign up   │
│                                    │
│   Own a venue? Sign in for Business │  ← NEW
└────────────────────────────────────┘
```

### Styling Notes
- Uses existing `text-muted-foreground` for the question
- "Sign in for Business" highlighted in `text-primary` 
- Subtle hover transition to maintain the premium feel
- Positioned inside the card but at the very bottom for discoverability without being intrusive

