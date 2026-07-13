import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.janereynolds.spotted',
  appName: 'Spotted',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#110a24',
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
    // Disable the native webview's own scrolling. The app manages all
    // scrolling in CSS overflow containers (html/body are overflow:hidden),
    // so the only thing native scrolling did was iOS auto-panning the whole
    // page when an input focused — fighting the keyboard resize and causing
    // a double-jump. Revert to true if any plugin webview content stops
    // scrolling.
    scrollEnabled: false,
  },
  server: {
    iosScheme: 'capacitor',
  },
  plugins: {
    Keyboard: {
      resize: 'native',
      style: 'dark',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
