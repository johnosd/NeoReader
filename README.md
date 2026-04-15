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

#### TTS
- [ ] Seleção de voz Speechify (lista de vozes via `/v1/voices`)

#### Aprendizado
- [ ] **Flashcards SRS** — revisar vocabulário salvo com algoritmo SM-2 (estilo Anki)
- [ ] **Integração Claude API (BYOK)** — resumo de capítulo, quiz de compreensão, tutor conversacional sobre o trecho lido
- [ ] Estatísticas de leitura — streak de dias, tempo por sessão, palavras traduzidas
- [ ] Export CSV do vocabulário
