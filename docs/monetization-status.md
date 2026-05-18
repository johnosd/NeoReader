# Monetização — Status de Implementação

> Documento de acompanhamento. Estratégia completa em [`docs/monetization-plan.md`](#) (a fazer).
> Última atualização: 2026-05-14.

## 🔴 BUG ABERTO: Google Sign-In falha no AAB Play Store (versionCode 5)

**Sintoma**: ao tocar em "Continuar com Google" no app instalado via Play Store, fica em loading eterno ou erro "no credentials available". Picker não abre visualmente.

**Logs reveladores** (em ordem):
```
W Auth: getToken() -> NEED_REMOTE_CONSENT. Service: oauth2:.../auth/lams
W Auth.Api.Credentials: UserRecoverableAuthException: NeedRemoteConsent
I CredentialManager: Remote provider response timed out (3s)
I CredentialManager: Status changed to CANCELED
```

`lams` é scope interno do Google (Login Account Management Service). Failure dele faz a Credential Manager API timeout e cancelar silenciosamente.

**O que JÁ foi verificado/corrigido** (config está toda certa):
- ✅ App signing key SHA-1 (`7f3e44bac3ef977bbf3901e20ea253cb22223abd`) registrado no Firebase
- ✅ Upload key SHA-1 (`44b4fbaa0dd4049e55e36e44b4c80f1237ea7411`) registrado no Firebase
- ✅ `google-services.json` baixado pós-registro e substituído em `android/app/`
- ✅ Audience em produção (Google Auth Platform)
- ✅ Branding preenchido (App name, support email, developer contact)
- ✅ Web OAuth Client (`631375167814-het24g8s9ksd32dprk421o1l6glee15r`) tem config correta: JS origins ok, redirect URI ok, enabled, sem warnings
- ✅ Device em estado saudável (Gmail/Calendar funcionam normalmente)
- ✅ Conta Google removida e re-adicionada no celular sem resolver
- ✅ Cache do Play Services limpo, dados limpos, reboot — sem resolver

**Hipóteses prováveis** (em ordem de probabilidade):
1. **Anti-abuse do Google na conta `johnscosta2@gmail.com`** após muitas tentativas de auth falhas no mesmo dia. Costuma liberar em 24-48h sozinho.
2. **Bug do Credential Manager API + capacitor-firebase/authentication v8** em alguma combinação específica device/account/SHA-1.
3. **Propagação Google Cloud** ainda incompleta (mudanças em SHA-1 podem demorar).

**Próximos passos quando retomar** (em ordem):
1. **Tentar login direto** — pode ter resolvido sozinho. Se sim, fim do bug.
2. **Tentar com outra conta Google no device** — se funcionar, confirma anti-abuse na conta original (espera mais 24h).
3. **Testar em emulador Android Studio** — se funcionar, problema é device físico.
4. **Implementar email/senha como método de auth principal** (~45 min de código) — fallback definitivo, deixa Google Sign-In como opcional.

---

## ⚠️ Decisão importante: Pro adiado até Drive Sync

Em 2026-05-14 decidimos **não vender o Pro ainda**. Razão: dos 3 benefícios prometidos
(sem ads, Drive Sync, IA), só "sem ads" está implementado. Cobrar por algo que não
existe seria desonesto.

**Estado atual do código:**
- `PaywallScreen` reformulada como "preview do que vem por aí" — sem fetch de offerings,
  sem botões de compra. Cada benefício tem badge `Já disponível` ou `Em breve`.
- `SettingsScreen` Plano section mostra "Em desenvolvimento" como meta.
- `BillingService` mantido intacto — pronto pra ativar quando Drive Sync entrar.
- Store description sem menção a Pro como produto à venda.

**Quando ativar o Pro:**
1. Drive Sync implementado (Sprint 3) e funcionando
2. Criar produtos `pro_monthly`, `pro_annual`, `pro_lifetime` na Play Console
3. Service account Google Cloud → linkar Play ↔ RevenueCat
4. Configurar offering no RevenueCat com os 3 packages
5. Reverter `PaywallScreen` pra versão completa (fetchOfferings + purchase flow)
6. Atualizar Store description e Settings copy
7. Subir AAB com versionCode bumpado

## Estratégia escolhida

**Freemium + Ads, com Pro tier enxuto.** Três tiers:

| Tier | Preço alvo | Entrega |
|------|------------|---------|
| **Free** | R$ 0 | Tudo que já existe + banner em telas não-leitura |
| **Pro Mensal** | R$ 9,90/mês | Sem ads + Google Drive Sync + futuras features IA |
| **Pro Anual** | R$ 79,90/ano | Mesmo do mensal (~33% off) |
| **Apoiador Vitalício** | R$ 149 | Compra única, limitada a 200 unidades nos 3 primeiros meses |

**Princípio**: nenhuma feature gratuita atual vira paga. Pro vende **remoção de ads + features novas**. TTS continua BYOK.

---

## IDs e credenciais

### Privacy Policy
- URL pública: https://johnosd.github.io/neoreader-legal/
- Repo: github.com/johnosd/neoreader-legal
- Gerada via Termly, hospedada via GitHub Pages
- Entidade legal: John Costa (pessoa física, DBA "NeoReader")
- Email de contato: neoreader.app@gmail.com

### AdMob
- App ID Android: `ca-app-pub-7766179998340736~2404866742`
- Banner Ad Unit ID: `ca-app-pub-7766179998340736/4316714218`
- Configurados em `.env` (vars `VITE_ADMOB_*`)

### RevenueCat
- Project ID: `proja07ebd89`
- API Key Android (`goog_`): em `.env` (`VITE_REVENUECAT_ANDROID_API_KEY`)
- Entitlement: `NeoReader Pro` (com espaço, case-sensitive — referenciado como `PRO_ENTITLEMENT_ID` em `src/services/BillingService.ts`)
- Service account credentials JSON: **pendente** (criar quando Play Console liberar)

### Android Signing
- Package name: `com.johnny.neoreader`
- Upload keystore: `C:\Users\johns\.android\neoreader-upload.keystore`
- Alias: `neoreader`
- Validade: 10.000 dias
- Senhas: em `C:\Users\johns\.gradle\gradle.properties` (machine-specific, fora do projeto Git)
- **Importante**: Play App Signing ativo — Google re-assina internamente, então perda do upload key é recuperável

### Play Console
- Conta criada em 2026-05-13
- Status: **em verificação** (pode levar até 48h)
- Email: usado pela conta Google John Costa
- Taxa pagou: US$ 25 (única)

---

## Código implementado

### Sprint 2 — Ads (AdMob)

**Arquivos novos:**
- `src/services/AdsService.ts` — wrapper do plugin `@capacitor-community/admob`
  - `init()`, `showBanner({ marginDp })`, `hideBanner()`, `removeBanner()`, `isAvailable()`
  - Em dev usa test unit oficial do Google (`ca-app-pub-3940256099942544/6300978111`)
  - Checa `BillingService.getCachedStatus().isPro` antes de exibir — Pro nunca vê ad
  - Recria banner ao mudar `marginDp` (necessário pra trocar entre tela com/sem BottomNav)
- `src/components/AdBannerSlot.tsx` — componente que gerencia ciclo de vida do banner
  - Prop `marginAboveBottomDp` (default 0, use 64 em telas com BottomNav)
  - Reserva 60px de altura sempre (mesmo Pro) pra evitar layout shift quando status muda
  - Hide automático em unmount (troca de tela)
  - Aguarda `isLoading: false` antes de mostrar — sem flash de banner no cold start

**Arquivos modificados:**
- `package.json` — adicionado `@capacitor-community/admob@^8.0.0`
- `scripts/patch-capacitor-tts-proguard.mjs` — adicionado AdMob na lista de plugins patcheados
- `android/app/src/main/AndroidManifest.xml` — meta-data `com.google.android.gms.ads.APPLICATION_ID` (obrigatório pro SDK não crashar no `initialize`)
- `src/App.tsx` — init `AdsService` em paralelo com `BillingService` após login
- `src/screens/LibraryScreen.tsx` — `<AdBannerSlot marginAboveBottomDp={64} />` antes do BottomNav
- `src/screens/DiscoverScreen.tsx` — idem
- `src/screens/VocabularyScreen.tsx` — `<AdBannerSlot />` (sem margin, sem BottomNav nessa tela)

**Telas onde NÃO há banner** (intencional):
- ReaderScreen, BookDetailsScreen, HomeScreen, ProfileScreen, SettingsScreen, PaywallScreen, LoginScreen, WelcomeScreen

**Build**: `npm run build` ✅ (sem erros). Plugins reconhecidos: `@capacitor-community/admob@8.0.0` + Capacitor já existentes.

---

### Sprint 1 — Billing infra (sem ads)

**Arquivos novos:**
- `src/services/BillingService.ts` — wrapper do RevenueCat SDK, singleton de módulo
  - Modo "desabilitado" silencioso quando API key vazia ou plataforma não-Android
  - Usa `firebase uid` como `appUserID` (linka identidade entre instalações)
  - API: `init`, `refresh`, `getOffering`, `purchasePackage`, `restore`, `getCachedStatus`, `subscribe`, `isAvailable`
- `src/hooks/useEntitlements.ts` — hook com `useSyncExternalStore`
  - Re-render automático quando RevenueCat emite update
  - Helpers: `useEntitlements()`, `useIsPro()`, `useRefreshEntitlementsOnFocus()`
- `src/screens/PaywallScreen.tsx` — tela de upgrade
  - Lista benefícios + pacotes do RevenueCat (mensal/anual destacado/lifetime)
  - Restore purchases
  - Mensagem clara em dev web (billing indisponível)

**Arquivos modificados:**
- `package.json` — adicionado `@revenuecat/purchases-capacitor@^11.0.0`
- `.env.example` — 3 vars novas (RevenueCat + 2 AdMob)
- `.env` — preenchido com keys reais
- `src/screens/SettingsScreen.tsx` — nova seção "Plano" no topo + helper `getPlanMeta`
- `src/App.tsx` — rota `paywall`, init `BillingService` após login Firebase
- `scripts/patch-capacitor-tts-proguard.mjs` — estendido pra patchear também o RevenueCat (AGP 9 compat)

### Build

- `npm run build` → ✅ TypeScript + Vite passam sem erro
- `npx cap sync android` → ✅ RevenueCat plugin reconhecido
- `./gradlew bundleRelease` → ✅ AAB gerado (13.94 MB)
- Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## Pendências (na ordem)

### Bloqueados por features ainda não implementadas

- **Drive Sync** (Sprint 3) — prerequisito para reativar o Pro
- **Service account Google Cloud + link RevenueCat** — só faz sentido criar quando produtos forem ativados
- **Criar produtos in-app** (`pro_monthly`, `pro_annual`, `pro_lifetime`) — só após Drive Sync
- **Configurar offering no RevenueCat** — depende dos produtos
- **License testing + teste end-to-end de compra** — depende de tudo acima

### Bloqueados pela verificação da Play Console

1. **Criar app draft** na Play Console com package `com.johnny.neoreader`
2. **Subir AAB** pra Internal Testing track
3. **Closed testing** (14 dias / 12 testers ativos — requisito Play pra liberar produção)
4. **Criar 3 produtos in-app**:
   - `pro_monthly` — Subscription R$ 9,90, base plan mensal auto-renovável
   - `pro_annual` — Subscription R$ 79,90, base plan anual auto-renovável
   - `pro_lifetime` — One-time R$ 149
5. **Service account no Google Cloud**:
   - Criar service account no projeto vinculado à Play Console
   - Gerar JSON de credenciais
   - Dar permissão "Finance" + "View app information" na Play Console
   - Subir JSON no RevenueCat (Apps & providers → Configurations → Google Play)
6. **Configurar Offering** no RevenueCat:
   - Criar offering "default"
   - Adicionar 3 packages mapeados ao Entitlement `NeoReader Pro`
7. **Cadastrar conta de teste licenciada**:
   - Play Console → Setup → License testing → adicionar email
8. **Primeiro teste de compra**:
   - Instalar AAB internal testing no celular
   - Comprar Pro mensal com conta licenciada
   - Confirmar no RevenueCat dashboard que entitlement ativou
   - Confirmar no app que `useEntitlements()` retorna `isPro: true`

### Independente da Play Console

- **Sprint 2 — Ads** ✅ **CONCLUÍDO** (ver seção "Sprint 2 — Ads" acima)

- **Sprint 3 — Drive Sync** (depois do primeiro teste de compra):
  - Implementar `src/services/DriveSyncService.ts` real
  - Firebase Functions com webhook RevenueCat (redundância de entitlement)
  - Gate Pro no Drive Sync via `useIsPro()`

- **Sprint 4+ — Falar com livro** (escopo separado quando chegar a hora)

---

## Riscos e mitigações ativas

| Risco | Mitigação atual |
|-------|-----------------|
| Plugins Capacitor com proguard-android.txt legacy | Script `patch-capacitor-tts-proguard.mjs` aplica patch automaticamente no postinstall |
| Senha do keystore perdida | Play App Signing ativo — Google pode regerar upload key se perdermos |
| RevenueCat fora | Sprint 3: webhook → Firestore como fonte redundante de entitlement |
| Banner causa layout shift | `AdBannerSlot` (Sprint 2) reserva 60px sempre |

---

## Comandos úteis

```powershell
# Rebuild web + sync Android
npm run build
npx cap sync android

# Gerar AAB assinado
cd android
.\gradlew bundleRelease
cd ..

# Caminho do AAB
android/app/build/outputs/bundle/release/app-release.aab

# Rodar no device conectado (debug)
npm run android:run

# Patch manual dos plugins (se npm install não rodar postinstall)
node scripts/patch-capacitor-tts-proguard.mjs
```
