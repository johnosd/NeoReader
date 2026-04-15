# NeoReader

Leitor de EPUB para Android focado em **incentivar a leitura** e **facilitar o aprendizado de inglês**. Interface estilo "Netflix for Books" com dark mode, capas grandes e navegação imersiva.

---

## Funcionalidades

### Biblioteca
- [x] Importar arquivos `.epub` do armazenamento local
- [x] Hero banner com último livro aberto e botão "Continuar"
- [x] Rows horizontais: "Continue lendo" e "Meus Livros"
- [x] Barra de progresso de leitura embaixo de cada capa
- [x] Menu de opções por livro: recriar capa, escolher imagem externa, deletar

### Leitor
- [x] Renderização via [foliate-js](https://github.com/johnfactotum/foliate-js) em modo scroll contínuo
- [x] Tema escuro e tamanho de fonte ajustável em tempo real
- [x] Índice (TOC) navegável via sheet deslizante
- [x] Marcadores: adicionar, listar e navegar
- [x] Progresso persistente com restauração ao reabrir
- [x] Tap central abre e fecha o chrome do leitor
- [x] Navegação entre capítulos com banner de fim de capítulo + swipe para avançar

### Aprendizado de inglês
- [x] Tradução inline da frase exata tocada via `caretRangeFromPoint`
- [x] Highlight só da frase selecionada, não do parágrafo inteiro
- [x] Bloco de tradução injetado no iframe logo abaixo do trecho tocado
- [x] Salvar par original/tradução no vocabulário com `⭐`
- [x] Tela de vocabulário com histórico de frases salvas
- [x] Cache offline de traduções em IndexedDB

### TTS (Text-to-Speech)
- [x] Audiobook contínuo via botão no chrome do leitor
- [x] Mini player fixo na base da tela durante leitura
- [x] Retomar do ponto pausado
- [x] Tap em parágrafo durante leitura pula direto para ele
- [x] Leitura de frase individual via botão `🔊` no bloco de tradução
- [x] Karaokê de palavras com highlight da palavra atual
- [x] Motor primário: **Speechify API**
- [x] Fallback automático para TTS nativo do Android

### Configurações
- [x] Tela de configurações acessível pelo chrome do leitor
- [x] API key da Speechify com input seguro e persistência local
- [x] Seleção do idioma de tradução
- [x] Tamanho de fonte padrão ao abrir livros

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 19 + TypeScript + Vite |
| Mobile | Capacitor 8 (Android) |
| Estilo | Tailwind CSS v4 |
| EPUB render | foliate-js |
| Storage | Dexie.js (IndexedDB) |
| Estado global | Zustand |
| Ícones | Lucide React |
| Tradução | MyMemory API |
| TTS premium | Speechify API |
| TTS fallback | `@capacitor-community/text-to-speech` |

---

## Rodando localmente

```bash
npm install
npm run dev
npm run build
npx tsc --noEmit
```

### Scripts

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe o dev server do Vite |
| `npm run build` | Executa `tsc -b` e build de produção |
| `npm run preview` | Serve localmente o build gerado em `dist/` |
| `npx tsc --noEmit` | Checagem de tipos sem gerar artefatos |

### Observação sobre Vite

Este projeto usa `vite --configLoader native` nos scripts de `dev`, `build` e `preview`.

Motivo:
- evita falha do loader padrão do Vite ao processar a config com o plugin do Tailwind no ambiente Windows;
- mantém o build estável sem depender do bundling da própria config do Vite.

Além disso, a config restringe `optimizeDeps.entries` ao `index.html` raiz para impedir que o Vite tente escanear arquivos HTML gerados dentro de `android/`.

---

## Build Android

Pré-requisitos: Android Studio instalado e device conectado com USB debugging ativo.

```bash
npm run build
npx cap sync android
npx cap run android
adb devices
```

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `VITE_SPEECHIFY_API_KEY` | API key da [Speechify](https://console.speechify.ai/) para vozes neurais | Não. Sem chave, o app usa TTS nativo |

---

## Estrutura de pastas

```text
src/
├── components/       # UI reutilizável
│   └── reader/       # Componentes do leitor
├── screens/          # Telas completas
├── hooks/            # React hooks customizados
├── services/         # Lógica de negócio
├── db/               # Schema Dexie e queries
├── store/            # Zustand stores
└── types/            # Tipos TypeScript compartilhados
```

---

## Status recente

### Correções aplicadas
- [x] Tradução inline sem race condition entre toques rápidos
- [x] Limpeza correta da seleção anterior no reader
- [x] TTS de frase individual com highlight no parágrafo correto
- [x] Exclusão consistente de livro com remoção de progresso, marcadores e vocabulário associado
- [x] Remoção da aba morta `Progresso` da bottom nav
- [x] Cleanup de `createObjectURL` em capas da biblioteca/home
- [x] Ajuste dos scripts e config do Vite para build/dev estáveis no Windows

### Próximas features
- [ ] Google Drive sync de progresso, marcadores e vocabulário
- [ ] Seleção de voz Speechify
- [ ] Flashcards SRS estilo Anki
- [ ] Integração Claude API (BYOK)
- [ ] Estatísticas de leitura
- [ ] Export CSV do vocabulário

---

## Troubleshooting

### `npm run build` falha ao carregar a config do Vite

Confirme:
- que você está usando os scripts do `package.json`, não `vite build` manual sem flags;
- que a config usada é `vite.config.mjs`;
- que as dependências estão instaladas corretamente com `npm install`.

### Vite tenta escanear arquivos dentro de `android/`

Isso já está mitigado em `vite.config.mjs` via:

```js
optimizeDeps: {
  entries: ['index.html'],
}
```

Se o problema reaparecer, revise a config antes de alterar o código da aplicação.
