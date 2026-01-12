import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.922058387a8543c998041815d203234f',
  appName: 'Spotted',
  webDir: 'dist',
  server: {
    // For development - connects to Lovable preview
    // Remove this block for production TestFlight builds
    url: 'https://92205838-7a85-43c9-9804-1815d203234f.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
