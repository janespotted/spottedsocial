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
    scrollEnabled: true,
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
