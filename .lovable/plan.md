

# Magic URL for YC Demo Mode

## Overview

Create a special URL that automatically activates demo mode and seeds the app with sample data when YC partners visit. They'll sign up normally, and the app will auto-populate with nightlife activity.

**Magic URL Format:**
```
https://spottedsocial.lovable.app?demo=yc&city=nyc
```

---

## How It Works

```text
1. YC partner clicks your link
   ↓
2. They land on /auth (login/signup page)
   ↓
3. URL params are stored in localStorage
   ↓
4. They sign up/login normally
   ↓
5. After auth, DemoActivator component detects stored params
   ↓
6. Auto-enables demo mode + seeds city data
   ↓
7. Shows toast: "Welcome! Demo mode activated with NYC nightlife data"
   ↓
8. App feels alive with venues, posts, users, and activity
```

---

## Implementation Details

### New Component: DemoActivator

This component will:
1. Check for `?demo=yc` (or `?demo=true`) on first load
2. Store the intent in localStorage (survives auth redirect)
3. After user authenticates, trigger demo seeding
4. Clear URL params after activation

### Files to Create/Modify

| File | Change |
|------|--------|
| `src/components/DemoActivator.tsx` | **NEW** - Handles magic URL detection and activation |
| `src/App.tsx` | Add DemoActivator inside AuthProvider |

---

## DemoActivator Logic

```typescript
// On mount (even before auth):
const params = new URLSearchParams(window.location.search);
const demoParam = params.get('demo');
const cityParam = params.get('city') as SupportedCity;

if (demoParam === 'yc' || demoParam === 'true') {
  // Store intent - survives auth redirect
  localStorage.setItem('pending_demo_activation', JSON.stringify({
    city: cityParam || 'nyc',
    timestamp: Date.now()
  }));
  
  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);
}

// After user authenticates:
if (user && pendingActivation) {
  // Check not expired (24 hours)
  if (Date.now() - pendingActivation.timestamp < 24 * 60 * 60 * 1000) {
    setDemoMode(true);
    cacheCity(pendingActivation.city);
    
    // Seed data via edge function
    await supabase.functions.invoke('seed-demo-data', {
      body: { action: 'seed', city: pendingActivation.city, userId: user.id }
    });
    
    toast.success('Welcome! Demo mode activated with sample nightlife data');
  }
  
  localStorage.removeItem('pending_demo_activation');
}
```

---

## URL Options

You can share different URLs for different cities:

| URL | Effect |
|-----|--------|
| `?demo=yc` | Activates demo with NYC data (default) |
| `?demo=yc&city=nyc` | Activates demo with NYC data |
| `?demo=yc&city=la` | Activates demo with LA data |

---

## What YC Will See

After signing up with the magic link:

- **Leaderboard**: 20+ trending venues with energy rankings
- **Map**: Demo users "out" at various venues
- **Feed**: Recent posts from demo users at nightlife spots
- **Plans**: Weekend plans from demo users they can browse
- **Yap Board**: Anonymous messages at venues
- **Messages**: Activity and notifications (if enabled)

---

## Security Considerations

- The `?demo=yc` parameter only activates demo mode - it doesn't bypass auth
- Users still need to sign up with a real email
- Demo data is clearly marked with `is_demo: true` in the database
- No sensitive data is exposed

---

## What to Send YC

**Email/Application text:**

> **Try the full experience:**
> Visit [spottedsocial.lovable.app?demo=yc&city=nyc](https://spottedsocial.lovable.app?demo=yc&city=nyc) and sign up. The app will auto-populate with sample NYC nightlife data so you can explore all features.
>
> **Demo controls:**
> After signing up, triple-tap the "PROFILE" header on your profile page to access demo settings where you can switch cities (NYC/LA), re-seed data, or disable demo mode.

---

## Files Changed Summary

1. **`src/components/DemoActivator.tsx`** (NEW)
   - Detects `?demo=yc` or `?demo=true` URL params
   - Stores activation intent in localStorage
   - After auth: enables demo mode, seeds data, shows confirmation toast

2. **`src/App.tsx`**
   - Import and add `<DemoActivator />` inside `AppContent` component
   - Place it after `<AutoTracker />` so it has access to auth state

