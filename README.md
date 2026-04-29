# NeoReader

Leitor de EPUB mobile-first para Android e Web, com biblioteca visual, leitura em scroll continuo, traducao inline, vocabulario salvo, TTS com provedores premium e fallback nativo, e uma aba de apoio para conhecer melhor os autores.

O app e construido em React + Vite, empacotado para Android via Capacitor e persiste livros, capas, progresso, marcadores, preferencias, vocabulario e caches em IndexedDB.

---

## Funcionalidades

### Biblioteca

- Importacao de arquivos `.epub` pela tela principal.
- Biblioteca visual com hero banner, secoes "Continue lendo" e "Meus Livros".
- Cards com capa, autor, progresso e estado de leitura.
- Capa extraida do EPUB no import, com fallback gerado quando o arquivo nao traz capa utilizavel.
- Acoes por livro para recriar a capa a partir do EPUB, escolher imagem manualmente ou deletar o livro.
- Delecao com limpeza dos dados relacionados: capa, progresso, marcadores, vocabulario e configuracoes do livro.
- Navegacao local em stack entre biblioteca, detalhes, leitor, vocabulario e configuracoes.

### Detalhes do livro

- Tela dedicada com tabs de `Capitulos`, `Marcacoes`, `Configuracoes`, `Detalhes` e `Autor`.
- TOC extraido de EPUB3 `nav.xhtml` ou EPUB2 `toc.ncx`, com fallback sintetico pela ordem de leitura.
- Abertura do leitor a partir de capitulos especificos.
- Estatisticas de progresso, marcadores e vocabulario salvo.
- Favoritos por livro.
- Descricao, idioma, data de adicao, ultimo acesso e tamanho do arquivo quando disponiveis.
- Preferencias por livro para idioma original, idioma alvo da traducao, fonte, tamanho, line height, tema, modo de leitura, provedor TTS, voz e velocidade.
- Preview visual das preferencias antes de abrir o livro.

### Aba Autor

- Busca dados do autor usando Open Library e Wikipedia.
- Exibe bio, foto e outros livros quando encontrados.
- Videos de entrevistas, TED Talks e palestras via YouTube Data API v3 quando a chave esta configurada.
- Cache local dos dados do autor em IndexedDB para reduzir chamadas repetidas.

### Leitor EPUB

- Renderizacao via `foliate-js` em WebView/iframe.
- Leitura em scroll continuo com restauracao da ultima posicao por CFI.
- Barra de progresso persistente e indicador discreto de troca de secao.
- TOC navegavel dentro do leitor.
- Marcadores por CFI, com snippet, cor, lista navegavel, remocao e soft delete.
- Chrome do leitor com auto-hide e tap central para mostrar ou esconder controles.
- Suporte a abertura em um capitulo/href especifico vindo da tela de detalhes.
- Flush de progresso ao voltar, ao ocultar a pagina e em mudancas de estado do app.

### Aparencia de leitura

- Modo `Confortavel`, que aplica fontes e cores do NeoReader.
- Modo `Original`, que preserva fonte e cores do EPUB quando possivel.
- Tamanhos de fonte: `sm`, `md`, `lg`, `xl`.
- Line height: `compact`, `comfortable`, `relaxed`.
- Temas: `dark`, `black`, `paper`, `warm`, `sepia`, `sage` e `contrast`.
- Fontes: `publisher`, `classic`, `modern`, `readable` e `mono`.
- Defaults globais e overrides por livro.
- Diagnosticos simples de estilo do EPUB para detectar fonte pequena, line height apertado e cores fixas.

### Traducao e vocabulario

- Traducao inline da frase ou trecho tocado no leitor.
- Highlight restrito ao texto selecionado.
- Bloco de traducao injetado diretamente no iframe do EPUB.
- Cache offline de traducoes com hash por texto e par de idiomas.
- Servico de traducao usando MyMemory API, com timeout e truncamento para respeitar limites do plano gratuito.
- Idioma original detectado pelo EPUB, com fallback por `lang` do HTML e inferencia simples por texto.
- Idioma alvo configuravel globalmente e por livro.
- Idiomas expostos na UI: ingles, portugues (BR), espanhol, frances, alemao, italiano e japones.
- Vocabulario salvo com texto original, traducao, livro, idioma de origem e idioma alvo.
- Tela de vocabulario com busca por texto original, traducao ou titulo do livro e exclusao manual.

### TTS

- Audiobook continuo a partir do leitor.
- Provedores: Speechify, ElevenLabs e TTS nativo do dispositivo.
- Fallback automatico para TTS nativo quando o provedor premium nao esta configurado ou falha.
- API keys configuraveis pela tela de configuracoes ou por variaveis de ambiente.
- Validacao de chaves Speechify e ElevenLabs na UI.
- Listagem de vozes compativeis por idioma, com cache local para Speechify.
- Busca e preview de vozes na tela de detalhes.
- Velocidade por livro: `0.8x`, `0.9x`, `1.0x`, `1.1x`, `1.2x`.
- Mini player com play/pause, stop, frase anterior/proxima, paragrafo anterior/proximo e botao de voltar ao ponto do audio.
- Timer de desligamento: sem timer, 1 min, 5 min, 15 min, 30 min e 1 h.
- Destaque de palavra durante a leitura quando o provider fornece alinhamento; fallback sintetico quando necessario.
- Acao inline para ouvir apenas a frase selecionada.

### Configuracoes globais

- Chaves locais para Speechify, ElevenLabs e YouTube Data API v3.
- Idioma alvo padrao das traducoes.
- Defaults globais de fonte, tamanho, line height, tema e modo de leitura.
- Preview ao vivo dos defaults do leitor.

### Android

- App Capacitor com `appId` `com.johnny.neoreader`.
- Back button fisico tratado nas telas principais, sheets e leitor.
- TTS nativo via `@capacitor-community/text-to-speech`.
- Assets e icones Android mantidos em `assets/` e `android/app/src/main/res/`.

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
| Traducao | MyMemory API |
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
| `npm run preview` | Serve o build local |
| `npm run lint` | Roda ESLint |
| `npm run test` | Roda a suite Vitest uma vez |
| `npm run test:watch` | Roda Vitest em watch mode |
| `npm run test:debug-epubs` | Roda testes de corpus EPUB em modo debug |
| `npm run test:debug-epubs:full` | Roda o corpus EPUB completo |

---

## Variaveis de ambiente

O app tambem permite salvar as chaves pela tela de configuracoes. Para usar variaveis em desenvolvimento, crie um `.env` local na raiz do projeto.

```env
VITE_SPEECHIFY_API_KEY=
VITE_ELEVENLABS_API_KEY=
```

| Variavel | Uso | Obrigatorio |
|---|---|---|
| `VITE_SPEECHIFY_API_KEY` | Vozes neurais e speech marks da Speechify | Nao |
| `VITE_ELEVENLABS_API_KEY` | Vozes premium e alinhamento temporal da ElevenLabs | Nao |

A chave do YouTube e persistida pela tela de configuracoes do app; o codigo atual nao le uma variavel `VITE_` para ela.

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
npm run build && npx cap sync android && npx cap run android
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

Para atualizar icones Android, coloque `icon-only.png` e `icon-foreground.png` em `assets/` e rode:

```bash
npx @capacitor/assets generate --android
```

---

## Persistencia local

O banco local usa Dexie em `NeoReaderDB`.

| Tabela | Conteudo |
|---|---|
| `books` | Metadados e blob do EPUB |
| `bookCovers` | Capas extraidas, manuais ou migradas |
| `progress` | CFI, percentual, fracao e secao atual |
| `bookmarks` | Marcadores por CFI, snippet, cor e soft delete |
| `vocabulary` | Pares original/traducao salvos pelo usuario |
| `translations` | Cache de traducoes por hash |
| `settings` | Preferencias globais e API keys |
| `bookSettings` | Overrides por livro |
| `ttsVoiceCaches` | Cache de vozes TTS compativeis |
| `authors` | Cache de dados de autores |

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
|   `-- ProgressCard.tsx
|-- db/                     # Dexie, schema e repositorios locais
|-- hooks/                  # Hooks de biblioteca, leitor, TTS e UI
|-- screens/                # Telas principais
|-- services/               # EPUB, importacao, traducao, TTS e autor
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
|-- epub-reader-plan.md
|-- learning-companion.md
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

A suite cobre componentes, telas, hooks, services, utilitarios, store e repositorios Dexie.

Areas com cobertura relevante:

- `EpubViewer`: loading, traducao inline, action bar, marcadores, TOC e navegacao.
- `EpubService` e `BookImportService`: parsing de EPUB, metadados, TOC e capas.
- `TranslationService`: cache e hash por idioma.
- `useTTS` e `useTtsSleepTimer`: fluxo de audio, pausa, resume, fallback e timer.
- `readerStore`, `readingState`, `cfi`, `toc`, `progress` e preferencias.
- Telas de leitor e detalhes do livro.

Comandos recomendados antes de abrir PR:

```bash
npm run lint
npm run test
npm run build
```

---

## Docs de apoio

- `docs/00-setup-environment.md`: bootstrap do ambiente.
- `docs/epub-reader-plan.md`: visao geral do leitor EPUB.
- `docs/learning-companion.md`: direcao de produto para aprendizado.
- `docs/qa-manual.md`: checklist de QA manual.
- `docs/test-backlog.md`: backlog de testes.

---

## Proximos passos sugeridos

- Criar `.env.example` sem segredos para documentar as chaves opcionais.
- Completar navegacao real dos itens inativos do bottom nav ou ajustar os labels para refletir apenas os destinos implementados.
- Evoluir a aba Autor com tratamento mais explicito de erros de rede e quota do YouTube.
- Adicionar exportacao CSV do vocabulario.
- Planejar sincronizacao de progresso, marcadores e vocabulario entre devices.
- Adicionar SRS/flashcards para revisao do vocabulario salvo.
