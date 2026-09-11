import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.diegoyuyas.pogorankings',
  appName: 'Comparador Liga Super',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0f1115'
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f1115'
    }
  }
};

export default config;
