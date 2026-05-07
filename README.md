# NeoReader

NeoReader e um leitor de EPUB mobile-first para Android e Web. O app combina
biblioteca local, leitura em scroll continuo, traducao inline, vocabulario salvo,
TTS com provedores premium e fallback nativo, descoberta de livros e uma ficha
editorial enriquecida para cada obra.

O projeto e construido em React + Vite, empacotado para Android via Capacitor e
usa IndexedDB/Dexie para persistir livros, capas, progresso, marcadores,
preferencias, vocabulario, metadados, autores e caches locais.

---

## Funcionalidades

### Acesso e navegacao

- Login com Google via Firebase Auth.
- Fluxo inicial de boas-vindas com flag persistida em `localStorage`.
- Navegacao local em stack entre biblioteca, descoberta, perfil, detalhes, leitor,
  vocabulario e configuracoes.
- Bottom nav com Biblioteca, Descubra, botao de adicionar livro e Perfil.
- Tratamento do back button Android nas telas principais, sheets e leitor.

### Biblioteca

- Importacao de arquivos `.epub` pela tela principal.
- Biblioteca visual com hero banner, secoes "Continue lendo" e "Meus Livros".
- Cards com capa, autor, progresso e estado de leitura.
- Capa extraida do EPUB no import, com fallback gerado quando o arquivo nao traz
  capa utilizavel.
- Acoes por livro para recriar a capa a partir do EPUB, escolher imagem manual ou
  deletar o livro.
- Delecao transacional do livro e dados relacionados: capa, progresso,
  marcadores, vocabulario, preferencias do livro, metadados editoriais e vinculo
  com autores.

### Descubra

- Tela "Descubra" com listas atuais do NYT Best Sellers quando
  `VITE_NYT_API_KEY` esta configurada.
- Secoes gerais: `advice-how-to-and-miscellaneous`, `hardcover-fiction` e
  `business-books`.
- Secao infantil: `childrens-middle-grade-hardcover`, `series-books` e
  `graphic-books-and-manga`.
- Cache em `localStorage` por lista por 12h para reduzir chamadas repetidas.
- Cards NYT com capa, ranking, descricao e link externo.

### Perfil

- Resumo local de leitura baseado nos dados persistidos.
- Historico derivado de livros, progresso e metadados editoriais.
- Estatisticas de livros finalizados, em leitura, favoritos e vocabulario salvo.
- Conquistas locais simples, calculadas a partir da biblioteca.
- Sign out pelo Firebase Auth.

### Detalhes do livro

- Tela dedicada com tabs: `Capitulo`, `Marcacoes`, `Reviews`, `Autor`,
  `Configuracoes` e `Detalhes`.
- TOC extraido de EPUB3 `nav.xhtml` ou EPUB2 `toc.ncx`, com fallback sintetico
  pela ordem de leitura.
- Abertura do leitor a partir de capitulos especificos.
- Estatisticas de progresso, marcadores e vocabulario salvo.
- Favoritos por livro.
- Descricao, idioma detectado, data de adicao, ultimo acesso e tamanho do arquivo
  quando disponiveis.
- Preferencias por livro para idioma original, idioma alvo da traducao, fonte,
  tamanho, line height, tema, modo de leitura, provedor TTS, voz e velocidade.
- Preview visual das preferencias antes de abrir o livro.

### Ficha bibliografica enriquecida

Metadados do livro sao coletados de forma incremental por providers locais e
externos:

1. EPUB metadata.
2. Google Books.
3. Open Library.
4. YouTube Data API v3 para reviews em video.

Campos persistidos em `bookInfo`, sempre com `value`, `source` e `confidence`
quando aplicavel:

- Categoria / genero.
- Rating.
- Sinopse.
- Numero de paginas.
- Data da publicacao.
- Editora.
- Idioma.
- ISBN-10.
- ISBN-13.
- Subtitulo.
- Serie.
- Edicao.
- Identificador universal.
- Reviews.
- Hints de busca: titulo, autor e identificadores.

O schema de metadados usa `metadataSchemaVersion`. Livros antigos sao
reprocessados sob demanda quando a tela de detalhes e aberta e o schema salvo
esta desatualizado.

### Aba Autor

- Busca dados do autor usando Open Library e Wikipedia.
- Exibe bio, foto e outros livros quando encontrados.
- Videos de entrevistas, TED Talks e palestras via YouTube Data API v3 quando a
  chave esta configurada.
- Cache local em IndexedDB por `authorName`.
- Cada autor cacheado mantem `bookIds`, vinculando o autor aos livros locais que
  consultaram/usam aquele registro.
- Ao excluir um livro, o app remove o `bookId` do cache do autor sem apagar o
  cache inteiro.

### Leitor EPUB

- Renderizacao via `foliate-js` em WebView/iframe.
- Leitura em scroll continuo com restauracao da ultima posicao por CFI.
- Barra de progresso persistente e indicador discreto de troca de secao.
- TOC navegavel dentro do leitor.
- Marcadores por CFI, com snippet, cor, lista navegavel, remocao e soft delete.
- Chrome do leitor com auto-hide e tap central para mostrar ou esconder controles.
- Suporte a abertura em um capitulo/href especifico vindo da tela de detalhes.
- Flush de progresso ao voltar, ao ocultar a pagina e em mudancas de estado do
  app.

### Aparencia de leitura

- Modo `Confortavel`, que aplica fontes e cores do NeoReader.
- Modo `Original`, que preserva fonte e cores do EPUB quando possivel.
- Tamanhos de fonte: `sm`, `md`, `lg`, `xl`.
- Line height: `compact`, `comfortable`, `relaxed`.
- Temas: `dark`, `black`, `paper`, `warm`, `sepia`, `sage` e `contrast`.
- Fontes: `publisher`, `classic`, `modern`, `readable` e `mono`.
- Defaults globais e overrides por livro.
- Diagnosticos simples de estilo do EPUB para detectar fonte pequena, line height
  apertado e cores fixas.

### Traducao e vocabulario

- Traducao inline da frase ou trecho tocado no leitor.
- Highlight restrito ao texto selecionado.
- Bloco de traducao injetado diretamente no iframe do EPUB.
- Cache offline de traducoes com hash por texto e par de idiomas.
- Servico de traducao usando MyMemory API, com timeout e truncamento para
  respeitar limites do plano gratuito.
- Idioma original detectado pelo EPUB, com fallback por `lang` do HTML e
  inferencia simples por texto.
- Idioma alvo configuravel globalmente e por livro.
- Idiomas expostos na UI: ingles, portugues (BR), espanhol, frances, alemao,
  italiano e japones.
- Vocabulario salvo com texto original, traducao, livro, idioma de origem e
  idioma alvo.
- Tela de vocabulario com busca por texto original, traducao ou titulo do livro e
  exclusao manual.

### TTS

- Audiobook continuo a partir do leitor.
- Provedores: Speechify, ElevenLabs e TTS nativo do dispositivo.
- Fallback automatico para TTS nativo quando o provedor premium nao esta
  configurado ou falha.
- API keys Speechify e ElevenLabs configuraveis pela tela de configuracoes ou por
  variaveis de ambiente.
- YouTube API key configuravel pela tela de configuracoes.
- Validacao de chaves Speechify e ElevenLabs na UI.
- Listagem de vozes compativeis por idioma, com cache local.
- Busca e preview de vozes na tela de detalhes.
- Velocidade por livro: `0.8x`, `0.9x`, `1.0x`, `1.1x`, `1.2x`.
- Mini player com play/pause, stop, frase anterior/proxima, paragrafo
  anterior/proximo e botao de voltar ao ponto do audio.
- Timer de desligamento: sem timer, 1 min, 5 min, 15 min, 30 min e 1 h.
- Destaque de palavra durante a leitura quando o provider fornece alinhamento;
  fallback sintetico quando necessario.
- Acao inline para ouvir apenas a frase selecionada.

### Configuracoes globais

- Chaves locais para Speechify, ElevenLabs e YouTube Data API v3.
- Idioma alvo padrao das traducoes.
- Defaults globais de fonte, tamanho, line height, tema e modo de leitura.
- Preview ao vivo dos defaults do leitor.
- Aviso sobre chaves `VITE_` embutidas no bundle.

### Android

- App Capacitor com `appId` `com.johnny.neoreader`.
- TTS nativo via `@capacitor-community/text-to-speech`.
- Login Google nativo via `@capacitor-firebase/authentication`.
- Assets e icones Android mantidos em `assets/` e `android/app/src/main/res/`.
- Release com backup Android desativado para evitar backup automatico de livros,
  vocabulario, preferencias e API keys locais.

---

## Stack

| Camada | Tecnologia |
|---|---|
| UI | React 19 + TypeScript + Vite 8 |
| Mobile | Capacitor 8 (Android) |
| Estilo | Tailwind CSS v4 + tokens em `src/index.css` |
| EPUB | `foliate-js` + `fflate` |
| Storage | Dexie.js / IndexedDB |
| Estado | Zustand + hooks locais |
| Icones | Lucide React |
| Auth | Firebase Auth + `@capacitor-firebase/authentication` |
| Traducao | MyMemory API |
| Metadados | EPUB metadata, Google Books, Open Library, YouTube Data API v3 |
| Descoberta | NYT Books API |
| Autor | Open Library, Wikipedia e YouTube Data API v3 |
| TTS premium | Speechify API + ElevenLabs API |
| TTS nativo | `@capacitor-community/text-to-speech` |
| Testes | Vitest + Testing Library + jsdom |

---

## Rodando localmente

Pre-requisitos:

- Node.js compativel com Vite 8.
- npm.

```bash
npm install
npm run dev
```

Scripts disponiveis:

| Script | Descricao |
|---|---|
| `npm run dev` | Inicia o servidor Vite |
| `npm run build` | Roda `tsc -b` e gera `dist/` |
| `npm run android:run` | Builda, sincroniza Capacitor e roda no Android |
| `npm run preview` | Serve o build local |
| `npm run lint` | Roda ESLint |
| `npm test` | Roda a suite Vitest uma vez |
| `npm run test:watch` | Roda Vitest em watch mode |
| `npm run test:debug-epubs` | Roda testes de corpus EPUB em modo debug |
| `npm run test:debug-epubs:full` | Roda o corpus EPUB completo |

---

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha somente as chaves que for usar.

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=neoreader-f728d.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=neoreader-f728d
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_STORAGE_BUCKET=neoreader-f728d.firebasestorage.app
VITE_SPEECHIFY_API_KEY=
VITE_ELEVENLABS_API_KEY=
VITE_GOOGLE_BOOKS_API_KEY=
VITE_NYT_API_KEY=
```

| Variavel | Uso | Obrigatorio |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Auth para login Google | Sim |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio de auth do projeto Firebase | Sim |
| `VITE_FIREBASE_PROJECT_ID` | Projeto Firebase usado pelo app | Sim |
| `VITE_FIREBASE_APP_ID` | App web do Firebase usado pelo bundle Vite | Sim |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Identificador do Firebase usado pela config web | Nao |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket do projeto Firebase, se habilitado | Nao |
| `VITE_SPEECHIFY_API_KEY` | Vozes neurais e speech marks da Speechify | Nao |
| `VITE_ELEVENLABS_API_KEY` | Vozes premium e alinhamento temporal da ElevenLabs | Nao |
| `VITE_GOOGLE_BOOKS_API_KEY` | Metadados editoriais via Google Books com menor risco de quota publica | Nao |
| `VITE_NYT_API_KEY` | Listas atuais do NYT Best Sellers na tela Descubra | Nao |

A chave do YouTube e persistida pela tela de configuracoes do app; o codigo atual
nao le uma variavel `VITE_` para ela.

Toda variavel `VITE_` fica embutida no bundle web/Android. Restrinja essas chaves
no provedor por API, pacote/app, origem e cota. Nao use `VITE_` para segredos de
servidor.

Para Android, mantenha `android/app/google-services.json` apenas localmente. No
Firebase Console, habilite Google como provedor de login e cadastre o SHA
fingerprint do certificado usado para debug/release.

---

## Build Android

Pre-requisitos:

- Android Studio instalado.
- Device ou emulador Android disponivel.
- USB debugging ativo quando usar device fisico.

```bash
npm run build
npx cap sync android
npx cap run android
```

Atalho:

```bash
npm run android:run
```

No PowerShell, para limpar o projeto Android:

```powershell
cd android
.\gradlew.bat clean
cd ..
```

Para verificar devices:

```bash
adb devices
```

Para atualizar icones Android, coloque `icon-only.png` e `icon-foreground.png` em
`assets/` e rode:

```bash
npx @capacitor/assets generate --android
```

Para gerar um bundle release local sem commitar segredos, defina as propriedades
abaixo em `android/gradle.properties` local, em `~/.gradle/gradle.properties` ou
como variaveis de ambiente:

```properties
NEOREADER_RELEASE_STORE_FILE=C:\\caminho\\release.keystore
NEOREADER_RELEASE_STORE_PASSWORD=
NEOREADER_RELEASE_KEY_ALIAS=
NEOREADER_RELEASE_KEY_PASSWORD=
```

Depois rode:

```bash
npm run build
npx cap sync android
cd android
./gradlew :app:bundleRelease
```

---

## Persistencia local

O banco local usa Dexie em `NeoReaderDB`. O schema atual e versionado; a versao
12 separa o TTL dos videos de autores e persiste extras estaveis do EPUB.

| Tabela | Conteudo |
|---|---|
| `books` | Metadados basicos e blob completo do EPUB |
| `bookCovers` | Capas extraidas, manuais ou migradas |
| `progress` | CFI, percentual, fracao e secao atual |
| `bookmarks` | Marcadores por CFI, snippet, cor e soft delete |
| `vocabulary` | Pares original/traducao salvos pelo usuario |
| `translations` | Cache de traducoes por hash |
| `settings` | Preferencias globais e API keys locais |
| `bookSettings` | Overrides por livro, incluindo leitura e TTS |
| `ttsVoiceCaches` | Cache de vozes TTS compativeis |
| `authors` | Cache de dados de autores, com `bookIds` vinculados |
| `bookInfo` | Ficha bibliografica enriquecida por livro |
| `epubExtras` | Descricao, idioma, TOC, preview e diagnosticos extraidos do EPUB |

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

authors.bookIds[] -> books.id
```

Politica de TTL:

- Autores: bio, foto e outros livros persistem sem TTL automatico; videos do
  YouTube expiram em 7 dias.
- Vozes compativeis Speechify e ElevenLabs expiram em 24h.
- Listas NYT em `localStorage` expiram em 12h.
- `bookInfo`, traducoes cacheadas e `epubExtras` nao expiram automaticamente.

Tambem existem valores persistidos fora do Dexie:

- `localStorage`: `neoreader:welcome-seen`.
- `localStorage`: cache das listas NYT.
- Firebase/Auth SDK: sessao autenticada.

Estados de UI, leitor e TTS continuam temporarios por design. A lista completa
fica em `docs/persistence-audit.md`.

---

## Estrutura de pastas

```text
src/
|-- assets/                 # Imagens e icones usados pela UI
|-- components/
|   |-- reader/             # Viewer EPUB, chrome, TOC, marcador, TTS e aparencia
|   |-- ui/                 # Primitives compartilhadas
|   |-- AuthorTab.tsx
|   |-- BottomNav.tsx
|   |-- BookCard.tsx
|   |-- BookOptionsSheet.tsx
|   |-- BookRow.tsx
|   |-- HeroBanner.tsx
|   |-- NytBookCard.tsx
|   |-- NytBooksRow.tsx
|   `-- ProgressCard.tsx
|-- db/                     # Dexie, schema e repositorios locais
|-- hooks/                  # Hooks de biblioteca, leitor, TTS, auth e UI
|-- screens/                # Telas principais
|-- services/               # EPUB, importacao, auth, metadados, traducao, TTS e autor
|-- store/                  # Estado global do leitor
|-- types/                  # Tipos de dominio
|-- utils/                  # CFI, TOC, progresso, preferencias e idiomas
|-- __tests__/              # Testes unitarios e de integracao
|-- App.tsx
|-- index.css
`-- main.tsx

docs/
|-- design-system/
|-- 00-setup-environment.md
|-- book-info-architecture.md
|-- epub-reader-plan.md
|-- learning-companion.md
|-- persistence-audit.md
|-- qa-manual.md
`-- test-backlog.md
```

---

## Interface e design system

Os specs visuais usados como referencia vivem em:

- `docs/design-system/design-system-mobile-v2.html`
- `docs/design-system/design-system-mobile-v1.html`
- `docs/design-system/design_system.html`

Tokens principais sao definidos via `@theme` em `src/index.css`.

| Token | Valor | Uso |
|---|---|---|
| `--color-bg-base` | `#07030c` | Fundo global |
| `--color-bg-surface` | `#12091a` | Cards e sheets |
| `--color-purple-primary` | `#7b2cbf` | CTA e estados ativos |
| `--color-purple-light` | `#a855f7` | Labels, links e badges |
| `--color-indigo` | `#6366f1` | Acento frio do leitor |
| `--color-text-primary` | `#f8fafc` | Texto principal |
| `--color-text-secondary` | `#cbd5e1` | Texto secundario |
| `--color-text-muted` | `#94a3b8` | Meta e placeholders |

Fontes carregadas via `@fontsource`:

| Familia | Uso |
|---|---|
| `Inter` | UI geral |
| `Playfair Display` | Titulos e trechos serifados |
| `JetBrains Mono` | Valores tecnicos |

---

## Testes e qualidade

A suite cobre componentes, telas, hooks, services, utilitarios, store e
repositorios Dexie.

Areas com cobertura relevante:

- `EpubViewer`: loading, traducao inline, action bar, marcadores, TOC e navegacao.
- `EpubService` e `BookImportService`: parsing de EPUB, metadados, TOC e capas.
- Providers de `bookInfo`: EPUB, Google Books, Open Library e YouTube Reviews.
- Repositorios Dexie: livros, metadados, preferencias, settings e autores.
- `TranslationService`: cache e hash por idioma.
- `useTTS` e `useTtsSleepTimer`: fluxo de audio, pausa, resume, fallback e timer.
- `readerStore`, `readingState`, `cfi`, `toc`, `progress` e preferencias.
- Telas de leitor, detalhes do livro, configuracoes, perfil e login.

Comandos recomendados antes de abrir PR:

```bash
npm run lint
npm test
npm run build
```

---

## Docs de apoio

- `docs/00-setup-environment.md`: bootstrap do ambiente.
- `docs/book-info-architecture.md`: arquitetura de metadados bibliograficos.
- `docs/epub-reader-plan.md`: visao geral do leitor EPUB.
- `docs/learning-companion.md`: direcao de produto para aprendizado.
- `docs/persistence-audit.md`: o que e persistido e o que permanece temporario.
- `docs/qa-manual.md`: checklist de QA manual.
- `docs/test-backlog.md`: backlog de testes.

---

## Proximos passos sugeridos

- Separar o `fileBlob` de `books` em uma tabela dedicada para deixar listagens
  mais leves com bibliotecas grandes.
- Tornar unicidade de relacoes 1:1 explicita no schema para `progress` e
  `bookSettings`.
- Adicionar limpeza periodica para caches globais antigos.
- Evoluir a aba Autor com diagnosticos mais claros de rede/quota.
- Adicionar exportacao CSV do vocabulario.
- Planejar sincronizacao de progresso, marcadores, vocabulario e metadados entre
  devices.
- Adicionar SRS/flashcards para revisao do vocabulario salvo.
