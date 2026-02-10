

# Register the Service Worker

## Problem

The service worker (`public/sw.js`) exists but is never registered in the app entry point, so push notifications and PWA install prompts don't work.

**Note:** The `usePushNotifications` hook does register the SW, but only after the user is logged in and the hook mounts. Registering it early in `main.tsx` ensures it's active immediately on page load for all users.

## Change

### File: `src/main.tsx`

Add service worker registration before the React render call:

```typescript
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

createRoot(document.getElementById("root")!).render(<App />);
```

Single file, 5 lines added. No other changes needed.

