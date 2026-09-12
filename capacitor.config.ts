/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.johnny.neoreader',
  appName: 'NeoReader',
  webDir: 'dist',
  android: {
    // 'production' aqui NÃO significa "logs desligados em produção" — é o
    // nome enganoso da Capacitor pra "sempre logar, inclusive em release"
    // (ver CapConfig.java: LOG_BEHAVIOR_PRODUCTION → loggingEnabled=true
    // incondicional). Com CapacitorHttp habilitado, o bridge loga o
    // methodData completo de cada chamada em V/Capacitor — inclusive o
    // header Authorization com a chave da DeepL/OpenAI em texto puro. 'debug'
    // é o valor certo: loga só quando BuildConfig.DEBUG=true (nosso
    // assembleDebug local), fica mudo em qualquer build de release/Play
    // Store.
    loggingBehavior: 'debug',
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
