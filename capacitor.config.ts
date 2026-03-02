import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spotted.app',
  appName: 'Spotted',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0a0118',
  }
};

export default config;
