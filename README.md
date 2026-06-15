# NeoReader

NeoReader e um leitor de EPUB mobile-first para Android e Web. O app combina
biblioteca local, importacao por arquivo ou pasta, leitura continua, marcadores,
traducao inline, vocabulario salvo, TTS com provedores premium e fallback nativo,
descoberta de livros e fichas bibliograficas enriquecidas.

O projeto e construido em React + Vite, empacotado para Android com Capacitor e
usa IndexedDB/Dexie como armazenamento local principal. A aplicacao e local-first:
livros, progresso, marcadores, vocabulario, preferencias, capas, metadados,
tags, pastas de origem e caches ficam no dispositivo.

## Estado atual

- Plataformas alvo: Web e Android via Capacitor.
- Login: obrigatorio, usando Firebase Auth com Google Sign-In.
- Idiomas da interface: automatico pelo dispositivo, Portugues (BR), Ingles e
  Espanhol.
- Formato de leitura documentado: EPUB.
- NeoReader Pro ainda nao esta a venda. A infraestrutura de RevenueCat existe,
  mas a tela Pro ainda funciona como previa de beneficios e pacotes.
- Ads com AdMob existem nas telas Biblioteca, Descubra e Vocabulario, e sao
  ocultados para usuario Pro quando o entitlement estiver ativo.
- Drive Sync de bookmarks existe via Google Drive `appDataFolder`, bloqueado
  pelo entitlement Pro. Progresso, vocabulario, EPUB e recursos de IA ainda nao
  entram no sync.

## Stack

| Camada | Tecnologia |
|---|---|
| UI | React 19 + TypeScript + Vite 8 |
| Mobile | Capacitor 8 + Android nativo |
| Estilo | Tailwind CSS v4 + tokens em `src/index.css` |
| EPUB | `foliate-js` + `fflate` |
| Storage local | Dexie.js / IndexedDB |
| Estado | Zustand + hooks locais |
| Icones | Lucide React |
| Auth | Firebase Auth + `@capacitor-firebase/authentication` |
| i18n | Provider local em `src/i18n` |
| Traducao | MyMemory API |
| Metadados | EPUB metadata, Google Books, Open Library, YouTube Data API v3 |
| Descoberta | NYT Books API |
| TTS premium | Speechify, ElevenLabs e Fish Audio |
| TTS nativo | `@capacitor-community/text-to-speech` |
| Billing | RevenueCat (`@revenuecat/purchases-capacitor`) |
| Ads | AdMob (`@capacitor-community/admob`) |
| Testes | Vitest + Testing Library + jsdom |

## Funcionalidades

### Acesso, navegacao e app shell

- Fluxo inicial de boas-vindas com flag em `localStorage`.
- Login com Google via Firebase.
- Navegacao em stack local entre Home, Biblioteca, Descubra, Perfil,
  Configuracoes, Paywall, Detalhes, Leitor e Vocabulario.
- Bottom nav nas telas principais.
- Back button Android tratado em telas, sheets, leitor e fluxos de importacao.
- `ErrorBoundary` por tela para isolar falhas.
- Inicializacao pos-login de Billing, Ads e limpeza de cache expirado de vozes TTS.

### Home

- Hero banner para o ultimo livro aberto.
- Secoes "Continue lendo" e "Meus Livros" derivadas de dados locais.
- Botao flutuante para importar EPUB.
- Acoes rapidas por livro: atualizar ficha, reextrair capa, escolher capa manual,
  marcar como lendo/concluido, gerenciar tags e excluir.

### Biblioteca

- Catalogo completo da biblioteca local.
- Busca por titulo, autor, nome do arquivo, formato e tags.
- Filtros: todos, lendo, nao lidos, concluidos, favoritos, sem tag e tags
  criadas pelo usuario.
- Ordenacao por recente, titulo, autor, data de importacao, formato ou nome do
  arquivo. A ordenacao escolhida fica em `localStorage`.
- Favoritos por livro.
- Tags locais com criacao, atribuicao e exclusao.
- Importacao de arquivos `.epub` individuais ou multiplos.
- Importacao por pasta com opcao de subpastas, tag sugerida da pasta e preview
  antes de importar.
- Preview de importacao com contagem de novos arquivos, duplicados e formatos
  ignorados.
- Deteccao de duplicados por hash SHA-256, URI e par titulo/autor normalizado.
- Em Android, o plugin nativo copia EPUBs selecionados para o armazenamento local
  do app quando possivel; em Web, os arquivos ficam embutidos no IndexedDB.
- Arquivos movidos, removidos ou com permissao perdida sao marcados como
  `missingFile` e o leitor oferece remocao do registro da biblioteca.

### Descubra

- Tela com listas atuais do NYT Best Sellers quando `VITE_NYT_API_KEY` esta
  configurada.
- Secao "Tendencias no Mundo":
  `advice-how-to-and-miscellaneous`, `hardcover-fiction` e `business-books`.
- Secao "O que as criancas estao lendo agora":
  `childrens-middle-grade-hardcover`, `series-books` e
  `graphic-books-and-manga`.
- Cards com capa, ranking, descricao e link externo.
- Cache em `localStorage` por lista por 12h.
- Estado vazio quando a chave NYT nao esta configurada.

### Perfil

- Usa dados do Firebase Auth para nome, email e foto.
- Resumo local com livros finalizados, em leitura, favoritos e termos salvos no
  vocabulario.
- Historico derivado de livros, progresso e metadados editoriais.
- Conquistas locais simples: primeira leitura, primeiro livro concluido,
  biblioteca ativa e vocabulario em crescimento.
- Aba "Seguindo" ainda e um estado vazio.
- Sign out pelo Firebase Auth.

### Detalhes do livro

- Header com capa, autor, ano, rating quando disponivel, progresso e favorito.
- Tabs: Capitulos, Marcacoes, Reviews, Autor, Configuracoes e Detalhes.
- TOC extraido do EPUB e navegacao direta para capitulos.
- Marcadores listados por CFI, com snippet e remocao por soft delete.
- Contagem de vocabulario salvo por livro.
- Atualizacao manual da ficha bibliografica.
- Configuracoes por livro para:
  - idioma original;
  - idioma alvo da traducao;
  - tema, fonte, tamanho, line height e modo de leitura;
  - provedor TTS, voz e velocidade.
- Selecao e preview de vozes compativeis por idioma.
- Avisos quando o provedor TTS escolhido nao tem API key configurada.

### Ficha bibliografica enriquecida

Metadados sao coletados por providers locais e externos:

1. EPUB metadata.
2. Google Books.
3. Open Library.
4. YouTube Data API v3 para reviews em video.

Os campos em `bookInfo` guardam `value`, `source` e `confidence` quando aplicavel:

- categoria/genero;
- rating;
- sinopse;
- numero de paginas;
- data de publicacao;
- editora;
- idioma;
- ISBN-10 e ISBN-13;
- subtitulo;
- serie;
- edicao;
- identificador universal;
- reviews;
- hints de busca.

O schema de metadados usa `metadataSchemaVersion`; registros antigos podem ser
reprocessados quando a tela de detalhes e aberta ou quando o usuario atualiza a
ficha manualmente.

### Aba Autor

- Busca bio, foto e outros livros do autor usando Open Library e Wikipedia.
- Busca entrevistas, TED Talks e palestras via YouTube Data API v3 quando a key
  esta salva nas Configuracoes.
- Cache local por `authorName`.
- `authors.bookIds` vincula autores cacheados aos livros locais que usam o
  registro.
- Ao excluir um livro, o app remove o vinculo do cache de autor sem apagar o
  cache inteiro.

### Leitor EPUB

- Renderizacao com `foliate-js` carregado sob demanda.
- Modo de leitura continua (`flow=scrolled`), sem paginacao lateral.
- Restauracao por CFI salvo.
- Progresso global e progresso do capitulo.
- Barra de progresso persistente na base da tela.
- TOC navegavel dentro do leitor.
- Marcadores por CFI, com snippet, cor, lista navegavel, restauracao de
  soft-delete e remocao.
- Chrome do leitor com auto-hide e tap central para mostrar/esconder controles.
- Flush de progresso ao voltar, ao ocultar a pagina, em `pagehide` e em mudancas
  de estado do app.
- Tela especifica para arquivo ausente, com opcao de remover o livro da
  biblioteca.
- O build endurece o sandbox dos iframes do `foliate-js` removendo
  `allow-scripts` nos renderers suportados.

### Aparencia de leitura

- Modo `Confortavel`: aplica estilo NeoReader.
- Modo `Original`: preserva fontes e cores do EPUB quando possivel.
- Temas: `dark`, `black`, `paper`, `warm`, `sepia`, `sage` e `contrast`.
- Fontes: `publisher`, `classic`, `modern`, `readable` e `mono`.
- Tamanhos: `sm`, `md`, `lg`, `xl`.
- Line height: `compact`, `comfortable`, `relaxed`.
- Defaults globais e overrides por livro.
- Preview visual nas Configuracoes e nos Detalhes do livro.
- Diagnosticos simples de estilo do EPUB para detectar cores fixas, fonte pequena
  e line height apertado.

### Traducao e vocabulario

- Tap em frase/paragrafo no leitor abre traducao inline.
- Highlight restrito ao texto tocado.
- Bloco de traducao injetado dentro do iframe do EPUB.
- Acoes inline: proxima frase, ouvir, marcar/remover marcador e salvar no
  vocabulario.
- Servico de traducao via MyMemory API, com timeout, truncamento para 500
  caracteres e cache local por hash + par de idiomas.
- Idioma do livro detectado pelo EPUB ou inferido.
- Idioma alvo configuravel globalmente e por livro.
- Idiomas expostos na UI: Ingles, Portugues (BR), Espanhol, Frances, Alemao,
  Italiano e Japones.
- Vocabulario salvo com texto original, traducao, livro, idioma de origem,
  idioma alvo e data.
- Tela de vocabulario com busca e exclusao manual.

### TTS

- Audiobook continuo a partir do texto do leitor.
- Provedores: Speechify, ElevenLabs, Fish Audio e TTS nativo do dispositivo.
- Fallback automatico para TTS nativo quando o provedor premium nao esta
  configurado ou falha.
- API keys premium podem vir de variaveis `VITE_` ou das Configuracoes do app.
- Keys salvas nas Configuracoes ficam no IndexedDB local do dispositivo.
- Validacao de keys na UI para provedores premium.
- Listagem de vozes compativeis por idioma, com cache persistido por 24h.
- Cache em memoria de audio premium por ate 6h e 64 entradas.
- Mini player com play/pause, stop, frase anterior/proxima, paragrafo
  anterior/proximo, escolha de provider, velocidade e voltar ao ponto do audio.
- Velocidade TTS e normalizada entre `0.7x` e `1.2x`.
- Timer de desligamento no leitor.
- Destaque de palavra quando o provider retorna alinhamento; fallback sintetico
  quando necessario.
- Acao inline para ouvir apenas a frase selecionada.

### Configuracoes

- Status do plano NeoReader Pro.
- Status de backup/restauracao de bookmarks na nuvem.
- Idioma do app.
- Defaults globais de aparencia do leitor.
- Idioma padrao das traducoes.
- Painel de narracao indicando fallback nativo.
- API keys locais para Speechify, ElevenLabs, Fish Audio e YouTube Data API.
- Aviso de que variaveis `VITE_` ficam embutidas no bundle.

### Monetizacao

- `BillingService` integra RevenueCat apenas em Android nativo com
  `VITE_REVENUECAT_ANDROID_API_KEY`.
- Entitlement esperado: `NeoReader Pro`.
- `useEntitlements` expoe `isPro`, expiracao e produto ativo.
- A tela Pro hoje e uma previa geral. Backup/restauracao de bookmarks aparece
  em Planned benefits e o status operacional fica na secao Cloud bookmarks em
  Configuracoes; recursos de IA continuam como "em breve".
- `AdsService` integra AdMob em Android quando `VITE_ADMOB_APP_ID_ANDROID` esta
  configurado.
- Em dev, banners usam ad unit de teste oficial do Google.
- Banners sao suspensos durante importacao e ocultados para usuario Pro.

## Rodando localmente

Pre-requisitos:

- Node.js compativel com Vite 8.
- npm.
- Para Android: Android Studio, SDK instalado e device/emulador disponivel.

Instalacao:

```bash
npm install
npm run dev
```

O login Google exige variaveis Firebase preenchidas. Sem elas, a tela de login
mostra aviso de configuracao.

## Scripts

| Script | Descricao |
|---|---|
| `npm run dev` | Inicia o servidor Vite |
| `npm run build` | Roda `tsc -b` e gera `dist/` |
| `npm run preview` | Serve o build local |
| `npm run lint` | Roda ESLint |
| `npm test` | Roda a suite Vitest uma vez |
| `npm run test:watch` | Roda Vitest em watch mode |
| `npm run test:debug-epubs` | Roda testes de corpus EPUB em modo debug |
| `npm run test:debug-epubs:full` | Roda o corpus EPUB completo |
| `npm run android:run` | Builda, sincroniza Capacitor e roda no Android |
| `npm run android:logs:import` | Captura logs Android do fluxo de importacao |
| `npm run android:logs:import:run` | Captura logs de importacao e inicia o app |
| `npm run android:logs:import:run:dump` | Captura logs de importacao com thread dump |
| `npm run android:logs:diagnostics` | Captura diagnosticos Android |
| `npm run android:logs:diagnostics:run` | Captura diagnosticos Android e inicia o app |
| `npm run diagnostics:analyze` | Analisa logs/diagnosticos capturados |
| `npm run postinstall` | Aplica patch de ProGuard em plugins Capacitor |

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha apenas o que for usar.

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=neoreader-f728d.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=neoreader-f728d
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_STORAGE_BUCKET=neoreader-f728d.firebasestorage.app

VITE_SPEECHIFY_API_KEY=
VITE_ELEVENLABS_API_KEY=
VITE_FISH_AUDIO_API_KEY=
VITE_GOOGLE_BOOKS_API_KEY=
VITE_NYT_API_KEY=
VITE_REVENUECAT_ANDROID_API_KEY=
VITE_ADMOB_APP_ID_ANDROID=
VITE_ADMOB_BANNER_UNIT_ID_ANDROID=
```

| Variavel | Uso | Obrigatorio |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Auth | Sim |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio Firebase Auth | Sim |
| `VITE_FIREBASE_PROJECT_ID` | Projeto Firebase | Sim |
| `VITE_FIREBASE_APP_ID` | App web Firebase usado pelo bundle | Sim |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Config web Firebase | Nao |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket Firebase, se usado | Nao |
| `VITE_SPEECHIFY_API_KEY` | TTS premium Speechify | Nao |
| `VITE_ELEVENLABS_API_KEY` | TTS premium ElevenLabs | Nao |
| `VITE_FISH_AUDIO_API_KEY` | TTS premium Fish Audio | Nao |
| `VITE_GOOGLE_BOOKS_API_KEY` | Metadados Google Books com menor risco de quota publica | Nao |
| `VITE_NYT_API_KEY` | Listas NYT Best Sellers na tela Descubra | Nao |
| `VITE_REVENUECAT_ANDROID_API_KEY` | RevenueCat em Android nativo | Nao |
| `VITE_ADMOB_APP_ID_ANDROID` | Habilita inicializacao AdMob no JS | Nao |
| `VITE_ADMOB_BANNER_UNIT_ID_ANDROID` | Banner Ad Unit de producao | Nao |

A chave do YouTube Data API v3 nao e lida por variavel `VITE_` no codigo atual;
ela e salva localmente pela tela Configuracoes.

Toda variavel `VITE_` entra no bundle Web/Android. Restrinja chaves por API,
pacote/app, origem e cota no provedor. Nao use `VITE_` para segredos de servidor.

Para Android, mantenha `android/app/google-services.json` localmente. No Firebase
Console, habilite Google como provedor de login e cadastre o SHA fingerprint do
certificado de debug/release.

## Build Android

Atalho para debug em device/emulador:

```bash
npm run android:run
```

Fluxo manual:

```bash
npm run build
npx cap sync android
npx cap run android
```

Dados atuais do projeto Android:

| Campo | Valor |
|---|---|
| `appId` / package | `com.johnny.neoreader` |
| `versionName` | `1.0.10` |
| `versionCode` | `12` |
| `minSdk` | `24` |
| `compileSdk` / `targetSdk` | `36` |
| Backup Android | desativado (`allowBackup=false`) |

Release local usa propriedades fora do Git:

```properties
NEOREADER_RELEASE_STORE_FILE=C:\\caminho\\release.keystore
NEOREADER_RELEASE_STORE_PASSWORD=
NEOREADER_RELEASE_KEY_ALIAS=
NEOREADER_RELEASE_KEY_PASSWORD=
```

Gerar bundle release:

```bash
npm run build
npx cap sync android
cd android
./gradlew :app:bundleRelease
```

No PowerShell:

```powershell
cd android
.\gradlew.bat :app:bundleRelease
cd ..
```

Para atualizar icones Android, coloque os assets em `assets/` e rode:

```bash
npx @capacitor/assets generate --android
```

## Persistencia local

O banco local usa Dexie em `NeoReaderDB`. O schema atual esta na versao 14.

| Tabela | Conteudo |
|---|---|
| `books` | Metadados do livro, estado de leitura, favorito, tags, arquivo ou URI |
| `bookCovers` | Capas extraidas, manuais ou migradas |
| `progress` | CFI, percentual, fracao e secao atual |
| `bookmarks` | Marcadores por CFI, snippet, cor e soft delete |
| `vocabulary` | Pares original/traducao salvos pelo usuario |
| `translations` | Cache de traducoes por hash |
| `settings` | Preferencias globais e API keys locais |
| `bookSettings` | Overrides por livro, incluindo leitura e TTS |
| `ttsVoiceCaches` | Cache de vozes TTS compativeis |
| `authors` | Cache de autores com `bookIds` vinculados |
| `bookInfo` | Ficha bibliografica enriquecida por livro |
| `epubExtras` | Descricao, idioma, TOC, preview e diagnosticos extraidos do EPUB |
| `tags` | Tags criadas pelo usuario |
| `sourceFolders` | Pastas usadas como origem de importacao |

Modos de armazenamento de livros:

- `embedded`: EPUB salvo como `fileBlob` no IndexedDB.
- `local`: EPUB copiado pelo plugin Android para a area privada do app, com URI
  local.
- `external`: registro aponta para URI externa/legada e pode virar
  `missingFile` se o acesso for perdido.

Relacionamentos principais:

```text
books.id
  -> bookCovers.bookId
  -> progress.bookId
  -> bookmarks.bookId
  -> vocabulary.bookId
  -> bookSettings.bookId
  -> bookInfo.bookId
  -> epubExtras.bookId

books.tags[] -> tags.id
books.sourceFolderId -> sourceFolders.id
authors.bookIds[] -> books.id
```

TTL e caches:

- Listas NYT: `localStorage`, 12h por lista.
- Vozes TTS compativeis: IndexedDB, 24h.
- Audio TTS premium: cache em memoria, 6h ou 64 entradas.
- Videos de autores via YouTube: 7 dias.
- Dados estaveis de autores, `bookInfo`, traducoes e `epubExtras`: sem TTL
  automatico.

Persistido fora do Dexie:

- `localStorage`: `neoreader:welcome-seen`.
- `localStorage`: `neoreader:library-sort`.
- `localStorage`: caches `nyt_cache_*`.
- Firebase/Auth SDK: sessao autenticada.

## Estrutura de pastas

```text
src/
|-- assets/                 # Imagens, logos e icones de provedores TTS
|-- components/
|   |-- reader/             # Viewer EPUB, chrome, TOC, marcadores, TTS e aparencia
|   |-- ui/                 # Primitives compartilhadas
|   |-- AdBannerSlot.tsx
|   |-- BottomNav.tsx
|   |-- BookCard.tsx
|   |-- BookRow.tsx
|   |-- HeroBanner.tsx
|   |-- NytBookCard.tsx
|   |-- NytBooksRow.tsx
|   `-- QuickBookActionsSheet.tsx
|-- db/                     # Dexie, schema e repositorios locais
|-- hooks/                  # Hooks de auth, biblioteca, leitor, TTS, billing e UI
|-- i18n/                   # Locales, provider e mensagens
|-- screens/                # Telas principais
|-- services/               # EPUB, importacao, auth, metadados, traducao, TTS, ads e billing
|-- store/                  # Estado global do leitor
|-- types/                  # Tipos de dominio
|-- utils/                  # CFI, TOC, progresso, preferencias, idiomas e busca
|-- __tests__/              # Testes unitarios e de integracao
|-- App.tsx
|-- index.css
`-- main.tsx

android/
|-- app/src/main/java/com/johnny/neoreader/
|   |-- MainActivity.java
|   `-- NeoReaderLibraryPlugin.java
`-- app/src/main/res/

docs/
|-- design-system/
|-- 00-setup-environment.md
|-- android-log-qa-checklist.md
|-- book-info-architecture.md
|-- code-review-2026-06-14.md
|-- monetization-status.md
|-- persistence-audit.md
|-- qa-manual.md
`-- test-backlog.md
```

## Arquitetura tecnica

- `src/App.tsx` controla a stack de rotas em estado React, sem router externo.
- `src/main.tsx` instala handlers globais de diagnostico, desabilita logging de
  payloads do bridge Capacitor e monta `I18nProvider`.
- `src/services/BookImportService.ts` coordena importacao, hash, dedupe,
  metadados, capa, source folder e persistencia.
- `src/services/NativeLibraryImportService.ts` encapsula o plugin Android para
  escolher arquivos/pastas, ler chunks e preparar importacao local.
- `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`
  implementa o lado nativo do picker e da copia/inspecao de EPUBs.
- `src/services/BookFileResolver.ts` resolve `embedded`, `local` e `external`
  antes de abrir o livro.
- `src/components/reader/EpubViewer.tsx` carrega `foliate-js` sob demanda,
  configura o renderer em scroll continuo e injeta recursos NeoReader no iframe.
- `vite.config.ts` copia assets PDF.js exigidos pelo `foliate-js`, endurece
  sandbox de iframe e configura proxy dev para Fish Audio.

## Design system

Tokens principais ficam em `src/index.css` via `@theme`.

| Token | Valor | Uso |
|---|---|---|
| `--color-bg-base` | `#07030c` | Fundo global |
| `--color-bg-surface` | `#12091a` | Cards e sheets |
| `--color-purple-primary` | `#7b2cbf` | CTA e estados ativos fora do leitor |
| `--color-purple-light` | `#9d4edd` | Labels, links e badges |
| `--color-indigo-primary` | `#6366f1` | Acento do leitor/TTS |
| `--color-text-primary` | `#f8fafc` | Texto principal |
| `--color-text-secondary` | `#cbd5e1` | Texto secundario |
| `--color-text-muted` | `#94a3b8` | Meta e placeholders |

Fontes via `@fontsource`:

| Familia | Uso |
|---|---|
| `Inter` | UI geral |
| `Playfair Display` | Titulos e elementos editoriais |
| `JetBrains Mono` | Valores tecnicos |

Specs e referencias visuais vivem em `docs/design-system/`.

## Testes e qualidade

A suite em `src/__tests__` cobre telas, componentes, hooks, services, repositorios
Dexie, utilitarios, i18n e store.

Areas com cobertura relevante:

- importacao EPUB, parsing de metadados, TOC e capas;
- `BookFileResolver` e fluxos de importacao nativa;
- providers de `bookInfo`;
- repositorios Dexie;
- traducao e cache;
- TTS, fallback e timer;
- leitor, bookmarks, TOC, progresso e aparencia;
- telas de login, boas-vindas, biblioteca, descoberta, detalhes, leitor,
  configuracoes e perfil.

Comandos recomendados antes de abrir PR:

```bash
npm run lint
npm test
npm run build
```

Backlog de testes conhecido fica em `docs/test-backlog.md`.

## Docs de apoio

- `docs/00-setup-environment.md`: bootstrap do ambiente.
- `docs/android-log-qa-checklist.md`: checklist de logs Android.
- `docs/book-info-architecture.md`: arquitetura de metadados bibliograficos.
- `docs/code-review-2026-06-14.md`: revisao tecnica completa recente.
- `docs/monetization-status.md`: estado de Ads, RevenueCat e Pro.
- `docs/persistence-audit.md`: auditoria de persistencia.
- `docs/qa-manual.md`: roteiro manual de QA.
- `docs/test-backlog.md`: backlog de testes.

## Proximos passos sugeridos

- Atualizar docs auxiliares que ficaram desatualizadas, especialmente
  `docs/persistence-audit.md` (schema v14) e `docs/qa-manual.md` (Capacitor 8).
- Separar `LibraryScreen.tsx` em componentes menores para importacao, sort e tags.
- Reativar compras Pro/ofertas no RevenueCat para liberar o Drive Sync de
  bookmarks fora de entitlements manuais.
- Adicionar cleanup do arquivo local Android ao excluir livros `storageMode=local`.
- Criar testes para EPUB corrompido, fluxo completo de vocabulario e restauracao
  end-to-end de progresso.
- Avaliar mover chamadas externas sensiveis para um backend se as chaves `VITE_`
  passarem a precisar de protecao real.
- Adicionar exportacao CSV do vocabulario e, depois, SRS/flashcards.
