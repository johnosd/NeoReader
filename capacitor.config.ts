/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.johnny.neoreader',
  appName: 'NeoReader',
  webDir: 'dist',
  android: {
    loggingBehavior: 'debug',
  },
  plugins: {
    FirebaseAuthentication: {
      providers: ['google.com'],
    },
  },
};

export default config;
