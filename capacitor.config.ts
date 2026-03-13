import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spotted.app',
  appName: 'Spotted',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a0118',
  },
  plugins: {
    Keyboard: {
      resize: 'none',
      scroll: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
