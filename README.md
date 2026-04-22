# NeoReader

Leitor de EPUB para Android focado em **incentivar a leitura** e **facilitar o aprendizado de inglês**. Interface estilo "Netflix for Books" — dark mode, capas grandes, navegação imersiva.

---

## Funcionalidades

### Biblioteca
- [x] Importar arquivos `.epub` do armazenamento local
- [x] Hero banner com último livro aberto e botão "Continuar"
- [x] Rows horizontais: "Continue lendo" e "Adicionados recentemente"
- [x] Barra de progresso de leitura embaixo de cada capa
- [x] Menu de opções por livro (pressão longa no card): recriar capa, escolher imagem externa, deletar

### Leitor
- [x] Renderização via [foliate-js](https://github.com/johnfactotum/foliate-js) — modo scroll contínuo
- [x] Tema escuro, tamanho de fonte ajustável (4 tamanhos) em tempo real
- [x] Índice (TOC) navegável via sheet deslizante
- [x] Marcadores: adicionar, listar e navegar
- [x] Progresso persistente (restaura posição ao reabrir)
- [x] Tap central abre/fecha o chrome (barras de título e controles)
- [x] Navegação entre capítulos: banner "Fim do capítulo" ao atingir o fundo + swipe para avançar

### Aprendizado de inglês
- [x] Tradução inline — detecta a frase exata tocada (via `caretRangeFromPoint`) e traduz só ela
- [x] Highlight apenas da frase selecionada dentro do parágrafo (não o parágrafo inteiro)
- [x] Bloco de tradução injetado diretamente no iframe logo abaixo do parágrafo
- [x] Salvar par original/tradução no vocabulário com ⭐
- [x] Tela de vocabulário com histórico de frases salvas
- [x] Cache offline de traduções (IndexedDB)

### TTS (Text-to-Speech)
- [x] Audiobook contínuo via botão ▶ no chrome do leitor
- [x] Mini player fixo na base da tela durante leitura: ⏮ parágrafo anterior, ▶/⏸, ⏭ próximo, ⏹ encerrar
- [x] Retomar de onde parou ao pausar e tocar novamente
- [x] Tap em parágrafo durante leitura pula direto para ele
- [x] Leitura de frase individual via botão 🔊 no bloco de tradução
- [x] Karaokê de palavras: palavra atual em negrito + sublinhado durante leitura
- [x] Motor primário: **Speechify API** (vozes neurais, requer `VITE_SPEECHIFY_API_KEY`)
- [x] Fallback automático para TTS nativo do Android quando offline ou sem chave

### Configurações
- [x] Tela de configurações acessível pelo chrome do leitor
- [x] API key da Speechify (input seguro com show/hide, salvo no IndexedDB)
- [x] Seleção do idioma de tradução (PT-BR, ES, FR, DE, IT, JA)
- [x] Tamanho de fonte padrão ao abrir livros (preview ao vivo)

---

## Design System

Paleta híbrida — dois acentos com propósito distinto:

- **Roxo** (`#7b2cbf` / `#9d4edd`) — biblioteca, nav, FAB e todos os elementos fora do leitor
- **Índigo** (`#6366f1`) — leitor (tom mais frio, distrai menos durante a leitura)

Tokens definidos via `@theme` em `src/index.css`; Tailwind v4 gera utilities automaticamente (`bg-bg-surface`, `text-text-muted`, `shadow-purple-glow`, `font-serif`, etc.).

Fontes carregadas via `@fontsource` (offline-first, necessário no Capacitor):
- **Inter** 400/500/600/700/900 — UI geral
- **Playfair Display** 600/700/800 — títulos e citações (serif)
- **JetBrains Mono** 400/700 — valores técnicos

Especificações completas em `docs/design-system/design-system-mobile-v2.html` (mobile) e `docs/design-system/design_system.html` (desktop).

### Componentes UI (`src/components/ui/`)

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
npx tsc --noEmit     # checagem de tipos
```

---

## Build Android

Pré-requisitos: Android Studio instalado, device conectado com USB debugging ativo.

```bash
npm run build
c                   # copia dist/ para o projeto Android
npx cap run android                     # builda e instala no device
adb devices                             # lista devices conectados

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
│   ├── ui/           # Primitivos do design system (Button, Input, BottomSheet...)
│   ├── reader/       # Componentes do leitor (EpubViewer, ReaderChrome, TocDrawer...)
│   └── ...           # BookCard, HeroBanner, BookRow, BottomNav, BookOptionsSheet...
├── screens/          # LibraryScreen · ReaderScreen · SettingsScreen · VocabularyScreen
├── hooks/            # useLibraryGroups · useTTS · useReaderProgress...
├── services/         # SpeechifyService · TranslationService · EpubService
├── db/               # Schema Dexie e queries (books · progress · bookmarks · vocabulary · settings)
├── store/            # Zustand (readerStore)
├── types/            # Tipos TypeScript compartilhados
└── utils/            # Funções puras (cn...)
docs/
├── design-system/    # Specs visuais mobile-v2 e desktop
└── epub-reader-plan.md
```

---

## Roadmap

### MVP — em aberto
- [ ] **Google Drive sync** — progresso, marcadores e vocabulário sincronizados entre devices (OAuth + Capacitor)

### Próximas features (Fase 2)

#### TTS
- [ ] Seleção de voz Speechify (lista de vozes via `/v1/voices`)

#### Aprendizado
- [ ] **Flashcards SRS** — revisar vocabulário salvo com algoritmo SM-2 (estilo Anki)
- [ ] **Integração Claude API (BYOK)** — resumo de capítulo, quiz de compreensão, tutor conversacional sobre o trecho lido
- [ ] Estatísticas de leitura — streak de dias, tempo por sessão, palavras traduzidas
- [ ] Export CSV do vocabulário
