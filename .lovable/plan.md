

# TestFlight Prep: What Lovable Can Fix Now

## What I CAN do (in Lovable):

### 1. Fix the Capacitor config for production
Remove the remote server URL so the app bundles locally instead of loading from a remote preview. This is the #1 blocker.

**File:** `capacitor.config.ts`
- Remove the `server` block entirely
- Keep `appId`, `appName`, and `webDir`

### 2. Add Info.plist permission descriptions
Create an `ios/App/App/Info.plist` configuration via Capacitor config so that when you run `npx cap add ios`, the permission strings are already set.

**File:** `capacitor.config.ts` -- add an `ios` section:
```typescript
ios: {
  contentInset: 'automatic',
  backgroundColor: '#0a0118',
}
```

The actual `Info.plist` entries (NSCameraUsageDescription, NSLocationWhenInUseUsageDescription, NSPhotoLibraryUsageDescription) must be added in Xcode after running `npx cap add ios`, because Lovable cannot create the `ios/` directory -- that requires Xcode on a Mac.

---

## What YOU must do on your Mac (cannot be done in Lovable):

| Step | Command / Action | Time |
|------|-----------------|------|
| 1 | Export project to GitHub, git clone it | 5 min |
| 2 | `npm install` | 2 min |
| 3 | `npm run build` | 1 min |
| 4 | `npx cap add ios` | 1 min |
| 5 | `npx cap sync` | 1 min |
| 6 | Open `ios/App/App/Info.plist` in Xcode and add these keys: | 5 min |
|   | `NSCameraUsageDescription` = "Spotted needs camera access to take photos for check-ins and stories" | |
|   | `NSLocationWhenInUseUsageDescription` = "Spotted uses your location to find nearby venues and show you on the map" | |
|   | `NSPhotoLibraryUsageDescription` = "Spotted needs photo library access to share photos in posts and stories" | |
| 7 | Set your Apple Developer Team in Xcode Signing | 5 min |
| 8 | Archive and upload to TestFlight | 10 min |

**Total: ~30 minutes** if you have a Mac with Xcode and a $99 Apple Developer account.

---

## What Lovable will change (1 file):

**`capacitor.config.ts`** -- Remove the development server block and add iOS config:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.922058387a8543c998041815d203234f',
  appName: 'Spotted',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0a0118',
  }
};

export default config;
```

This is a small but critical change -- without removing the `server` block, the TestFlight build will try to load from a Lovable URL instead of running the bundled app.

---

## Do you have these prerequisites?

Before approving, confirm you have:
- A Mac with Xcode installed (required, no workaround)
- Apple Developer Account ($99/year) -- if not, sign up now at developer.apple.com, approval takes 24-48 hours
- Your GitHub repo connected (check Settings in Lovable)

