import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.janereynolds.spotted',
  appName: 'Spotted',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a0118',
  },
  plugins: {
    Keyboard: {
      resize: 'native',
      scrollAssist: false,
      scrollPadding: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
