/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.johnny.neoreader',
  appName: 'NeoReader',
  webDir: 'dist',
  android: {
    loggingBehavior: 'production',
  },
  plugins: {
    FirebaseAuthentication: {
      providers: ['google.com'],
    },
    // Provedores de tradução premium (DeepL, OpenAI) bloqueiam CORS de
    // propósito e não podem ser chamados do WebView normal — CapacitorHttp
    // troca fetch/XMLHttpRequest por rede nativa (Java/Kotlin) só no app
    // Android empacotado, sem esse bloqueio. Não afeta o build Web (lá
    // continua sendo o fetch do browser, então esses provedores ficam
    // indisponíveis ali — ver requiresNativePlatform em
    // TranslationProviderRegistry.ts).
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
