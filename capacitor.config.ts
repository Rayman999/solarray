import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.lluminaa.solarray',
  appName: 'Solarray',
  webDir: 'dist/solarray-reminders/browser',
  server: {
    androidScheme: 'https'
  },
  android: {
    useLegacyBridge: true
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#f0c987',
      presentationOptions: ['badge', 'sound', 'banner', 'list']
    }
  }
};

export default config;
