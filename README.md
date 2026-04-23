# NeoReader

Leitor de EPUB para Android focado em **incentivar a leitura** e **facilitar o aprendizado de inglês**. Interface estilo "Netflix for Books" — dark mode, capas grandes, navegação imersiva.

---

## Funcionalidades

### Biblioteca
- [x] Importar arquivos `.epub` via FAB flutuante (canto inferior direito)
- [x] **Hero banner full-bleed** — imagem de capa ocupa a tela toda, gradiente cinemático, header NeoReader flutuante sobre a capa
- [x] Tags de autor e progresso estilo gênero (uppercase · separador ·)
- [x] Título grande serif, descrição contextual e badge de status (Em leitura / Concluído / Destaque)
- [x] Botões "Retomar" (roxo) e "Opções" (glass) no rodapé do hero
- [x] Barra de progresso roxa de 3 px abaixo da descrição
- [x] **"Continue lendo"** — cards horizontais com capa, barra de progresso e percentual (`ProgressCard`)
- [x] **"Meus Livros"** — cards verticais com barra de progresso roxa e botão de opções (`BookCard`)
- [x] Header de seção com título e botão "Ver tudo ›" em roxo
- [x] Menu de opções por livro: recriar capa, escolher imagem externa, deletar (`BookOptionsSheet`)

### Leitor
- [x] Renderização via [foliate-js](https://github.com/johnfactotum/foliate-js) — modo scroll contínuo
- [x] Tema escuro, tamanho de fonte ajustável (4 tamanhos) em tempo real
- [x] Índice (TOC) navegável via sheet deslizante
- [x] Marcadores: adicionar, listar e navegar
- [x] Progresso persistente (restaura posição ao reabrir)
- [x] Tap central abre/fecha o chrome (barras de título e controles)
- [x] Navegação entre capítulos: banner "Fim do capítulo" ao atingir o fundo + swipe para avançar

### Aprendizado de inglês
- [x] Tradução inline — detecta a frase exata tocada via `caretRangeFromPoint` e traduz só ela
- [x] Highlight apenas da frase selecionada dentro do parágrafo
- [x] Bloco de tradução injetado diretamente no iframe logo abaixo do parágrafo
- [x] Salvar par original/tradução no vocabulário com ⭐
- [x] Tela de vocabulário com histórico de frases salvas
- [x] Cache offline de traduções (IndexedDB)

### TTS (Text-to-Speech)
- [x] Audiobook contínuo via botão ▶ no chrome do leitor
- [x] Mini player fixo na base da tela: ⏮ parágrafo anterior, ▶/⏸, ⏭ próximo, ⏹ encerrar
- [x] Retomar de onde parou ao pausar e tocar novamente
- [x] Tap em parágrafo durante leitura pula direto para ele
- [x] Leitura de frase individual via botão 🔊 no bloco de tradução
- [x] Karaokê de palavras: palavra atual em negrito + sublinhado durante leitura
- [x] Motor primário: **Speechify API** (vozes neurais, requer `VITE_SPEECHIFY_API_KEY`)
- [x] Fallback automático para TTS nativo do Android quando offline ou sem chave

### Configurações
- [x] API key da Speechify (input seguro com show/hide, salvo no IndexedDB)
- [x] Seleção do idioma de tradução (PT-BR, ES, FR, DE, IT, JA)
- [x] Tamanho de fonte padrão ao abrir livros (preview ao vivo)

---

## Interface — Design System

### Paleta

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-bg-base` | `#07030c` | Fundo global |
| `--color-bg-surface` | `#12091a` | Cards, sheets |
| `--color-purple-primary` | `#7b2cbf` | Ativo, FAB, botões primários |
| `--color-purple-light` | `#a855f7` | Labels ativos, links, badges |
| `--color-purple-dark` | `#5a189a` | Gradiente profundo |
| `--color-indigo` | `#6366f1` | Leitor (acento frio, menos distração) |
| `--color-text-primary` | `#f8fafc` | Texto principal |
| `--color-text-secondary` | `#cbd5e1` | Descrições |
| `--color-text-muted` | `#94a3b8` | Meta, placeholders |

Tokens definidos via `@theme` em `src/index.css`; Tailwind v4 gera utilities automaticamente (`bg-bg-surface`, `text-text-muted`, `shadow-purple-glow`, `font-serif`, etc.).

### Fontes

Carregadas via `@fontsource` (offline-first, necessário no Capacitor):

| Família | Pesos | Uso |
|---------|-------|-----|
| **Inter** | 400/500/600/700/900 | UI geral |
| **Playfair Display** | 600/700/800 | Títulos hero, citações (serif) |
| **JetBrains Mono** | 400/700 | Valores técnicos |

Specs completas em `docs/design-system/design-system-mobile-v2.html` (mobile) e `docs/design-system/design_system.html` (desktop).

### Componentes da Biblioteca

| Componente | Descrição |
|---|---|
| `HeroBanner` | Full-bleed Netflix-style: capa como background, gradiente cinemático, header flutuante, tags de gênero, botões pill |
| `ProgressCard` | Card horizontal para "Continue lendo": capa 72px + barra de progresso roxa + percentual |
| `BookCard` | Card vertical para "Meus Livros": capa 2:3, barra roxa, botão de opções |
| `BookRow` | Seção scrollável com header "Ver tudo"; variante `progress` usa `ProgressCard`, `default` usa `BookCard` |
| `BottomNav` | 4 itens (Início · Vocab · Biblioteca · Perfil), glass `blur(20px)`, ativo em roxo `#7b2cbf` |
| `BookOptionsSheet` | Sheet de ações: recriar capa, importar imagem, deletar |

### Componentes UI Primitivos (`src/components/ui/`)

| Componente | Descrição |
|---|---|
| `Button` | 5 variantes (primary / secondary / ghost / danger / outline) × 2 tons (purple / indigo) |
| `Input` | Label + hint + error + leftIcon + rightSlot, acessível via `useId` |
| `Switch` | Toggle Material 3 (48×28), `role="switch"` |
| `Checkbox` | 20×20, Check icon, input oculto acessível |
| `Badge` | 6 tons (success / warning / error / purple / indigo / neutral) |
| `ListItem` | Leading / title / meta / trailing, press state, teclado acessível |
| `BottomSheet` | Backdrop + handle + sticky header + safe-area-inset-bottom + ESC fecha |
| `Toast` | 4 tons com ícones Lucide, auto-dismiss configurável |
| `EmptyState` | Ícone + título + descrição + slot de ação |
| `Skeleton` | Variantes block / card / text com `animate-pulse` |
| `Spinner` | Tamanho e tom configuráveis, label opcional |

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 18 + TypeScript + Vite |
| Mobile | Capacitor 6 (Android) |
| Estilo | Tailwind CSS v4 + `@theme` tokens |
| Fontes | Inter · Playfair Display · JetBrains Mono (`@fontsource`) |
| EPUB render | foliate-js |
| Storage | Dexie.js (IndexedDB) |
| Estado global | Zustand |
| Ícones | Lucide React |
| Tradução | MyMemory API (gratuita) |
| TTS premium | Speechify API |
| TTS fallback | @capacitor-community/text-to-speech |

---

## Rodando localmente

```bash
npm install
npm run dev          # dev server em http://localhost:5173
npm run build        # build de produção (gera dist/)
npm run lint         # lint
npx tsc --noEmit     # checagem de tipos sem gerar arquivos
```

---

## Build Android

Pré-requisitos: Android Studio instalado, device conectado com USB debugging ativo.

```bash
npm run build
npx cap sync android        # copia dist/ para o projeto Android
npx cap run android         # builda e instala no device
adb devices                 # lista devices conectados

# Atualizar ícones do app (coloque icon-only.png e icon-foreground.png em assets/)
npx @capacitor/assets generate --android
cd android && ./gradlew clean && cd ..
npx cap run android
```

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `VITE_SPEECHIFY_API_KEY` | API key da [Speechify](https://console.speechify.ai/) para vozes neurais | Não — usa TTS nativo como fallback |

---

## Estrutura de pastas

```
src/
├── components/
│   ├── ui/             # Primitivos do design system (Button, Input, BottomSheet...)
│   ├── reader/         # Componentes do leitor (EpubViewer, ReaderChrome, TocDrawer...)
│   ├── HeroBanner.tsx  # Hero full-bleed Netflix-style
│   ├── ProgressCard.tsx# Card horizontal "Continue lendo"
│   ├── BookCard.tsx    # Card vertical "Meus Livros"
│   ├── BookRow.tsx     # Seção scrollável com variante progress/default
│   ├── BottomNav.tsx   # Nav 4 itens glass
│   └── BookOptionsSheet.tsx
├── screens/
│   ├── LibraryScreen.tsx     # Biblioteca principal + FAB de import
│   ├── ReaderScreen.tsx      # Leitor EPUB
│   ├── VocabularyScreen.tsx  # Histórico de traduções
│   ├── SettingsScreen.tsx    # Configurações
│   └── BookDetailsScreen.tsx
├── hooks/              # useLibraryGroups · useTTS · useReaderProgress...
├── services/           # SpeechifyService · TranslationService · EpubService
├── db/                 # Schema Dexie (books · progress · bookmarks · vocabulary · settings)
├── store/              # Zustand (readerStore)
├── types/              # Tipos TypeScript compartilhados
└── utils/              # Funções puras
docs/
├── design-system/
│   ├── design-system-mobile-v1.html  # DS mobile v1 (seção 7: telas de referência)
│   ├── design-system-mobile-v2.html  # DS mobile v2 (tokens, componentes, nav)
│   ├── design_system.html            # DS desktop
│   └── logo/                         # Assets do logo NeoReader
└── epub-reader-plan.md
```

---

## Roadmap

### MVP — em aberto
- [ ] **Google Drive sync** — progresso, marcadores e vocabulário sincronizados entre devices (OAuth + Capacitor)

### Fase 2

#### Leitor
- [ ] Configurar idioma base por livro na tela de detalhes, usado por tradução, vocabulário e fallback de TTS nativo

#### TTS
- [ ] Seleção de voz Speechify (lista de vozes via `/v1/voices`)

#### Aprendizado
- [ ] **Flashcards SRS** — revisar vocabulário com algoritmo SM-2 (estilo Anki)
- [ ] **Integração Claude API (BYOK)** — resumo de capítulo, quiz de compreensão, tutor conversacional
- [ ] Estatísticas de leitura — streak de dias, tempo por sessão, palavras traduzidas
- [ ] Export CSV do vocabulário
