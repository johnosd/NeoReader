# EPUB Reader — Plano do Projeto

> App Android para leitura de EPUBs em inglês, focado em **incentivar a leitura** e **facilitar o aprendizado do idioma**.

---

## 1. Stack Técnica

| Camada | Escolha | Justificativa |
|---|---|---|
| UI | **React + TypeScript + Vite** | Seu stack atual, dev rápido no browser |
| Mobile wrapper | **Capacitor** | Empacota web app como APK nativo; plugins prontos pra TTS, filesystem, share |
| Estilo | **Tailwind CSS** | Mobile-first, produtividade |
| Parser EPUB | **epub.js** ou **foliate-js** | foliate-js é mais moderno e leve |
| Storage local | **IndexedDB** (via Dexie.js) | Armazena livros, progresso, vocabulário offline |
| Sync | **Google Drive API** (appDataFolder) | Pasta oculta só do app, sem poluir Drive do usuário |
| Tradução | **Google Translate API v3** | Pago por uso; cache agressivo no IndexedDB |
| TTS nativo | **@capacitor-community/text-to-speech** | Offline, grátis |
| TTS premium | **Speechify API** | Via fetch direto (fase 2) |

---

## 2. Arquitetura em camadas

```
┌─────────────────────────────────────┐
│  UI (React components)              │
├─────────────────────────────────────┤
│  Hooks (useReader, useTTS, useDict) │
├─────────────────────────────────────┤
│  Services                           │
│  ├── EpubService (parse/render)     │
│  ├── TTSService (nativo | speechify)│
│  ├── TranslationService (+ cache)   │
│  ├── VocabService (SRS algorithm)   │
│  └── SyncService (Google Drive)     │
├─────────────────────────────────────┤
│  Storage (Dexie/IndexedDB)          │
└─────────────────────────────────────┘
```

Padrão de provider abstrato pra TTS e Tradução — facilita trocar/adicionar engines.

---

## 3. Modelo de dados (IndexedDB)

```ts
books:         { id, title, author, coverBlob, fileBlob, addedAt, lastOpenedAt }
progress:      { bookId, cfi, percentage, updatedAt }  // cfi = EPUB Canonical Fragment Identifier
bookmarks:     { id, bookId, cfi, label, createdAt }
highlights:    { id, bookId, cfi, text, color, note, createdAt }
vocabulary:    { id, word, context, translation, bookId, srsLevel, nextReview, createdAt }
translations:  { hash, sourceText, translatedText, cachedAt }  // cache
settings:      { key, value }
syncQueue:     { id, entity, op, payload, status }  // offline-first sync
```

---

## 4. Features — escopo MVP vs Fase 2

### MVP (2-4 semanas)
- [x] Importar EPUB do armazenamento local
- [x] Biblioteca (lista de livros, capa, progresso)
- [x] Leitor com paginação, tema claro/escuro, tamanho de fonte
- [x] Índice (TOC) navegável
- [x] Marcadores (adicionar/listar/ir para)
- [x] Progresso de leitura persistente
- [x] Seleção de parágrafo → bolha com tradução (Google Translate)
- [x] Tradução em lote: 1 ou 10 parágrafos
- [x] Salvar palavra/frase no vocabulário
- [x] TTS nativo Android com destaque de parágrafo + karaokê
- [x] Sync com Google Drive (progresso + marcadores + highlights + vocab)
- [x] Cache offline de traduções recentes

### Fase 2
- [ ] Integração Speechify (vozes premium)
- [ ] Flashcards SRS estilo Anki (algoritmo SM-2)
- [ ] Export CSV do vocabulário
- [ ] Estatísticas de leitura (streak, palavras/dia)
- [ ] **Experiência "Netflix for Books" completa**:
  - Capítulos como episódios: tempo estimado de leitura, preview da próxima frase
  - Auto-advance opcional entre capítulos (countdown 5s, pulável)
  - Card "Você parou em..." com último parágrafo + botões Continuar / Recapitular
  - Rows inteligentes por comportamento: "Continue lendo", "Comece hoje" (livros parados >7 dias), "Curtos" (<200 pág), "Porque você leu X" (mesmo autor/gênero)
  - "Trailer": primeira página como preview antes de abrir
  - Streak de dias consecutivos lendo (sutil, não agressivo — leitura não é Duolingo)
- [ ] **Integração Claude API (showcase agentic AI) — modelo BYOK (Bring Your Own Key)**:
  - Usuário conecta sua própria conta Anthropic (cola API key em settings, validada e armazenada criptografada no device)
  - **Botão "Resumir capítulo"** no início de cada capítulo → chama Claude com o texto do capítulo e exibe resumo em bolha/painel
  - Quiz de compreensão gerado por capítulo
  - Explicação contextual de expressões idiomáticas e phrasal verbs
  - "Tutor" conversacional: usuário pergunta sobre o trecho, Claude responde com contexto do livro
  - Geração de frases-exemplo adicionais para palavras no vocabulário
  - Cache de resumos no IndexedDB (evita re-gerar e re-cobrar)

---

## 5. Direção visual — "Netflix for Books"

**Referência**: Netflix mobile. Moderno, escuro, capas grandes, scroll horizontal, foco em continuidade.

### Tela Home (Biblioteca)

```
┌─────────────────────────────┐
│  ☰  EPUB Reader        🔍   │  ← header mínimo
├─────────────────────────────┤
│                             │
│    ┌─────────────────┐      │
│    │                 │      │  ← HERO: livro em leitura
│    │  [CAPA GRANDE]  │      │     (banner grande, gradient)
│    │                 │      │
│    │  Continue  ▶    │      │
│    │  "72% lido"     │      │
│    └─────────────────┘      │
│                             │
│  Continue lendo             │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐   │  ← row horizontal scrollable
│  │📖 │ │📖 │ │📖 │ │📖 │   │
│  └───┘ └───┘ └───┘ └───┘   │
│                             │
│  Recém-adicionados          │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐   │
│  │📖 │ │📖 │ │📖 │ │📖 │   │
│  └───┘ └───┘ └───┘ └───┘   │
│                             │
│  Por autor: Stephen King    │
│  ┌───┐ ┌───┐ ┌───┐          │
│  │📖 │ │📖 │ │📖 │          │
│  └───┘ └───┘ └───┘          │
│                             │
│  Meu vocabulário            │  ← card destaque
│  ┌─────────────────────┐    │
│  │ 127 palavras salvas │    │
│  │ Revisar agora  →    │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

### Paleta de cores

| Token | Valor | Uso |
|---|---|---|
| `bg-primary` | `#0a0a0a` | Fundo principal (quase preto) |
| `bg-elevated` | `#1a1a1a` | Cards, modais |
| `bg-hover` | `#2a2a2a` | Hover/pressed |
| `text-primary` | `#ffffff` | Títulos |
| `text-secondary` | `#a0a0a0` | Subtítulos, metadata |
| `accent` | `#e50914` ou `#6366f1` | CTAs (vermelho Netflix ou índigo moderno) |
| `progress` | `#22c55e` | Barras de progresso |

**Sugestão**: não copia vermelho Netflix exato (problema de marca). Use índigo/violeta (`#6366f1`) ou verde esmeralda — moderno e distintivo.

### Princípios de design

1. **Capas são os heróis** — ocupam a maior parte da tela. Biblioteca sem capas é tela morta.
2. **Gradient overlay** em hero banner: preto transparente sobre a capa pra texto ficar legível.
3. **Scroll horizontal liso** — `scroll-snap-type: x mandatory` no CSS, momentum nativo.
4. **Skeleton loaders** com shimmer — nunca tela branca vazia carregando.
5. **Animações sutis** — fade in 200ms em cards, scale 0.95 no press. Nada exagerado.
6. **Barra de progresso** embaixo da capa (linha fina vermelha/índigo) — identidade Netflix.

### Telas principais

| Tela | Estilo |
|---|---|
| **Home / Biblioteca** | Rows horizontais ao estilo Netflix |
| **Leitor** | Fullscreen imersivo, fundo off-white/sepia ou preto (configurável), tipografia serif grande. Chrome some ao tocar na página. |
| **Detalhes do livro** | Capa grande em hero, sinopse, progresso, botões (continuar, marcadores, ajustes) |
| **Vocabulário** | Cards tipo flashcard com flip animation |
| **Settings** | Lista minimalista, dark por padrão |

### Fontes

- **UI**: Inter ou system font (SF Pro no iOS-like, Roboto no Android)
- **Leitor (corpo do livro)**: configurável — Charter, Georgia, Merriweather (serif padrão), ou Inter (sans) como alternativa
- **Capas e títulos em destaque**: peso bold (700-800)

### Bibliotecas que ajudam

- **Tailwind CSS** — já no stack, tem utilitários pra dark mode e scroll
- **Framer Motion** (leve) — animações declarativas
- **Lucide Icons** — ícones consistentes, estilo moderno
- **react-virtual** — listas longas (catálogo grande) sem travamento

---

## 6. Decisões de UX importantes

**Bolha de tradução**: ao tocar num parágrafo, uma bolha aparece logo acima com a tradução. Botões na bolha: `[📖 +1] [📖 +10] [⭐ salvar] [🔊 ouvir]`. Tap-and-hold numa palavra específica = traduz só a palavra.

**TTS**: botão flutuante na parte inferior. Durante reprodução, parágrafo atual com background leve, palavra atual em bold+underline. Controles: play/pause, velocidade, próximo parágrafo.

**Mobile-first real**: gestos swipe pra virar página, tap central abre/fecha chrome (barras), tap lateral vira página. Tudo com 48dp mínimo de área tocável.

---

## 7. Riscos e pontos de atenção

1. **Custo do Google Translate API** — cache agressivo é obrigatório. Hash do texto como chave. Considerar LibreTranslate self-hosted como fallback futuro.
2. **Permissão de arquivos no Android 13+** — Scoped Storage mudou tudo. Use o Capacitor Filesystem plugin com `Directory.Documents` e seletor nativo.
3. **OAuth do Google Drive no Capacitor** — use `@capacitor/google-auth` ou fluxo via in-app browser. Não é trivial, reserve tempo.
4. **EPUBs malformados** — muitos EPUBs "de graça" têm CSS quebrado. Sandbox o CSS do livro.
5. **Publicação na Play Store** — conta dev ($25 uma vez), política de conteúdo, content rating, screenshots. ~1 semana de burocracia.
6. **Highlight de palavra durante TTS** — nem todo engine TTS nativo emite eventos por palavra (`onBoundary`). Testar cedo; fallback é highlight por parágrafo.

---

## 8. Roadmap sugerido (4 semanas)

**Semana 1 — Fundação**
- Setup projeto Vite + Capacitor + Tailwind
- Build Android funcionando no device
- Parser EPUB + renderer básico
- Biblioteca + import de arquivo

**Semana 2 — Leitor completo**
- TOC, marcadores, progresso, temas
- Persistência IndexedDB via Dexie
- Gestos e UX mobile

**Semana 3 — Aprendizado**
- Integração Google Translate + bolha
- Vocabulário (salvar + listar)
- TTS nativo com highlight

**Semana 4 — Sync + polish**
- OAuth Google + sync Drive
- Ícone, splash, ajustes finais
- Build release, assinatura, upload Play Store (interna)

---

## 9. Próximos passos concretos

1. Criar repo no GitHub (`epub-reader` ou nome melhor)
2. `npm create vite@latest` + instalar Capacitor
3. Testar pipeline: rodar Hello World no seu Android
4. Provisionar: Google Cloud project (Translate API + Drive API + OAuth credentials)
5. Conta Google Play Console ($25)

---

## Perguntas ainda em aberto

- Nome do app?
- Quer landing page/site pro app (ligado ao teu portfólio)?
- Vai usar este projeto como artefato pra certificação Claude Architect também? (se sim, dá pra integrar Claude API pra geração de quiz/exercícios de compreensão na Fase 2 — vira showcase de agentic AI)
