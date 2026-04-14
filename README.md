# NeoReader

Leitor de EPUB para Android focado em **incentivar a leitura** e **facilitar o aprendizado de inglês**. Interface estilo "Netflix for Books" — dark mode, capas grandes, navegação imersiva.

---

## Funcionalidades

### Biblioteca
- [x] Importar arquivos `.epub` do armazenamento local
- [x] Hero banner com último livro aberto e botão "Continuar"
- [x] Rows horizontais: "Continue lendo" e "Adicionados recentemente"
- [x] Barra de progresso de leitura embaixo de cada capa

### Leitor
- [x] Renderização via [foliate-js](https://github.com/johnfactotum/foliate-js) (paginado)
- [x] Tema escuro, tamanho de fonte ajustável (4 tamanhos)
- [x] Índice (TOC) navegável via sheet deslizante
- [x] Marcadores: adicionar, listar e navegar
- [x] Progresso persistente (restaura posição ao reabrir)
- [x] Gestos: tap nas bordas para virar página, tap central para o chrome

### Aprendizado de inglês
- [x] Tradução inline — detecta a frase exata tocada (via `caretRangeFromPoint`) e traduz só ela
- [x] Highlight apenas da frase selecionada, não do parágrafo inteiro
- [x] Bloco de tradução injetado logo abaixo do parágrafo original
- [x] Salvar par original/tradução no vocabulário com ⭐
- [x] Tela de vocabulário com histórico de frases salvas
- [x] Cache offline de traduções (IndexedDB)

### TTS (Text-to-Speech)
- [x] Audiobook contínuo via botão ▶ no bottom bar
- [x] Leitura de parágrafo individual via botão 🔊 no bloco de tradução
- [x] Karaokê de palavras: palavra atual em negrito + sublinhado durante leitura
- [x] Motor primário: **Speechify API** (vozes neurais, requer `VITE_SPEECHIFY_API_KEY`)
- [x] Fallback automático para TTS nativo do Android quando offline ou sem chave

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 19 + TypeScript + Vite |
| Mobile | Capacitor 6 (Android) |
| Estilo | Tailwind CSS v4 |
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
npx cap sync android     # copia dist/ para o projeto Android
npx cap run android      # builda e instala no device
adb devices              # lista devices conectados
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
├── components/       # UI reutilizável (BookCard, HeroBanner, BookRow...)
│   └── reader/       # Componentes do leitor (EpubViewer, ReaderChrome...)
├── screens/          # Telas completas (LibraryScreen, ReaderScreen, VocabularyScreen)
├── hooks/            # React hooks (useLibraryGroups, useTTS, useReaderProgress...)
├── services/         # Lógica de negócio (SpeechifyService, TranslationService...)
├── db/               # Schema Dexie e queries (books, progress, bookmarks, vocabulary)
├── store/            # Zustand stores (readerStore)
└── types/            # Tipos TypeScript compartilhados
```

---

## Roadmap

### MVP — em aberto
- [ ] **Google Drive sync** — progresso, marcadores e vocabulário sincronizados entre devices (OAuth + Capacitor)

### Próximas features (Fase 2)

#### Tela de configurações
- [ ] **Settings screen** — botão de engrenagem no header da biblioteca
  - [ ] API key da Speechify (input seguro, salvo no IndexedDB)
  - [ ] Seleção de voz Speechify (lista de vozes via `/v1/voices`)
  - [ ] Configurações gerais do leitor (tema, fonte padrão, idioma de tradução)

#### Gerenciamento de livros
- [ ] **Ícone de opções no BookCard** — menu de contexto por livro
  - [ ] Recriar capa (reprocessa o EPUB e extrai novamente)
  - [ ] Escolher capa de arquivo externo (seletor de imagem do device)
  - [ ] Excluir livro

#### Aprendizado
- [ ] **Flashcards SRS** — revisar vocabulário salvo com algoritmo SM-2 (estilo Anki)
- [ ] **Integração Claude API (BYOK)** — resumo de capítulo, quiz de compreensão, tutor conversacional sobre o trecho lido
- [ ] Estatísticas de leitura — streak de dias, tempo por sessão, palavras traduzidas
- [ ] Export CSV do vocabulário
