# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sobre o projeto
NeoReader é um leitor de EPUB mobile-first (Android via Capacitor + Web) focado
em **incentivar a leitura**, **com integrações tts realistas** e **facilitar o aprendizado de inglês**. Interface
estilo "Netflix for Books": dark mode, capas grandes, rows horizontais
scrollable. A aplicação é **local-first** — livros, progresso, marcadores,
vocabulário, preferências e caches ficam no dispositivo (Dexie/IndexedDB).
Veja `README.md` para o inventário completo de funcionalidades, variáveis de
ambiente e estado atual do produto (auth, monetização Pro, ads, Word Lens etc.)
— não duplique esse conteúdo aqui, mantenha este arquivo focado em como
trabalhar no código.

## Perfil do dev
- Engenheiro de dados sênior com background Python/SQL/AI/APIs
- Não conhece JS/TS/React a fundo — aprende enquanto constrói
- Prefere honestidade sobre politeness — aponte falhas e premissas erradas
- Quer explicações breves inline no código, não aulas longas

## Stack
React 19 + TypeScript + Vite 8 · Tailwind CSS v4 · Capacitor 8 (Android +
Web) · Dexie.js (IndexedDB) · foliate-js (parser EPUB) · Zustand · Lucide
React · Firebase Auth · RevenueCat · AdMob · Vitest + Testing Library.
Tabela completa em `README.md` (seção "Stack").

## Comandos
- `npm run dev` — dev server web (localhost:5173)
- `npm run build` — `tsc -b` + build produção (gera `dist/`)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — checagem de tipos sem gerar arquivos
- `npm test` — roda a suite Vitest uma vez
- `npm run test:watch` — Vitest em watch mode
- `npx vitest run <caminho-do-arquivo>` — roda um único arquivo de teste
- `npx vitest run -t "nome do teste"` — roda testes por nome (`describe`/`it`)
- `npm run test:debug-epubs` — testes de corpus EPUB (modo debug); `:full` roda o corpus completo
- `npm run android:run` — build + `cap sync android` + `cap run android` (atalho completo)
- `npx cap sync android` / `npx cap run android` — passos manuais equivalentes
- `adb devices` — lista celulares conectados
- `npm run android:logs:diagnostics:run` — captura logs/diagnostics Android e inicia o app (veja skill `android-debug`)
- `npm run word-lens:build` / `:check` / `:test` — pipeline Python do data pack de Word Lens (`scripts/word-lens/`)

Antes de abrir PR: `npm run lint && npm test && npm run build`.

## Arquitetura
- `src/App.tsx` controla a stack de rotas em estado React (`useState<Route[]>`), sem router externo (react-router etc). Navegação = push/pop nesse array.
- `src/main.tsx` instala handlers globais de diagnóstico, desliga logging de payloads do bridge Capacitor e monta `I18nProvider`.
- Import de livro: `src/services/BookImportService.ts` coordena hash/dedupe/metadados/capa/source folder; `src/services/NativeLibraryImportService.ts` fala com o plugin nativo Android (`android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`) para picker de arquivo/pasta e cópia local.
- Antes de abrir um livro, `src/services/BookFileResolver.ts` resolve o `storageMode` (`embedded` no IndexedDB, `local` copiado pelo plugin Android, `external` por URI que pode virar `missingFile`).
- `src/components/reader/EpubViewer.tsx` carrega `foliate-js` sob demanda, roda em modo scroll contínuo (`flow=scrolled`) e injeta os recursos NeoReader (tradução inline, highlights de Word Lens, TTS) dentro do iframe do EPUB — cuidado com sandbox/CSP ao mexer aqui.
- Persistência: Dexie DB `NeoReaderDB` em `src/db/database.ts`, schema versionado (`this.version(N).stores(...)`, atualmente v16); cada tabela tem seu próprio módulo em `src/db/` (`books.ts`, `progress.ts`, `bookmarks.ts`, `vocabulary.ts`, `bookInfo.ts` etc). Ao mudar schema, sempre adicione uma nova `version()` — nunca edite uma existente.
- Estado do leitor (tema, fonte, TOC, progresso em memória) fica em `src/store/readerStore.ts` (Zustand); estado de navegação/telas fica local em `App.tsx`.
- `vite.config.ts` copia assets do PDF.js exigidos pelo `foliate-js`, endurece o sandbox de iframe (remove `allow-scripts` nos renderers suportados) e configura proxy dev para Fish Audio.
- i18n: provider local em `src/i18n/` (pt-BR, en, es), sem lib externa (ex: `react-i18next`).
- Word Lens: data pack offline distribuído em `public/word-lens/`, carregado no leitor sem rede.

## Convenções de código
- Componentes em PascalCase: `BookCard.tsx`
- Hooks começam com `use`: `useReader.ts`
- Services são classes: `TranslationService.ts`
- Um arquivo = uma responsabilidade
- Testes em `src/__tests__/`, espelhando a estrutura de `src/` (`components/`, `hooks/`, `services/`, `db/`, `store/`, `utils/`, `i18n/`, `screens/`)
- Testes não usam `globals` do Vitest — importe `describe`/`it`/`expect` explicitamente de `'vitest'` em cada arquivo
- Imports absolutos a partir de `src/` via alias `@/` (configurado em `vite.config.ts`/`vitest.config.ts`)

## Estrutura de pastas
Árvore completa e atualizada em `README.md` (seção "Estrutura de pastas").
Resumo:
- `src/components/` — UI reutilizável (`reader/` = viewer EPUB, chrome, TOC, marcadores, TTS, aparência)
- `src/screens/` — Telas completas
- `src/hooks/` — Hooks de auth, biblioteca, leitor, TTS, billing e UI
- `src/services/` — Lógica de negócio (EPUB, importação, auth, metadados, tradução, TTS, ads, billing)
- `src/db/` — Schema Dexie e repositórios locais
- `src/store/` — Estado global (Zustand)
- `src/types/` — Tipos de domínio compartilhados
- `src/utils/` — Funções puras (CFI, TOC, progresso, preferências, idiomas, busca)
- `src/i18n/` — Locales e provider de tradução da UI
- `android/app/src/main/java/com/johnny/neoreader/` — plugin nativo (`NeoReaderLibraryPlugin.java`)
- `docs/` — Documentação do projeto (`docs/design-system/`, `docs/features/`, `docs/backlog.md`)

## Direção visual
"Netflix for Books" — dark mode, capas grandes, rows horizontais scrollable.
Tokens vivem em `src/index.css` via `@theme` (cada token vira utility
Tailwind, ex: `--color-bg-surface` → `bg-bg-surface`):
- `--color-bg-base: #07030c` — fundo global
- `--color-bg-surface: #12091a` — cards e sheets
- `--color-purple-primary: #7b2cbf` — CTA e estados ativos fora do leitor
- `--color-purple-light: #9d4edd` — labels, links, badges
- `--color-indigo-primary: #6366f1` — acento do leitor/TTS
- `--color-text-primary: #f8fafc` / `--color-text-secondary: #cbd5e1` / `--color-text-muted: #94a3b8`

Não hardcode cores — use os tokens. Specs visuais completas em
`docs/design-system/` (ver seção "Design System" abaixo).

## Regras de ouro para Claude Code
1. Antes de implementar features grandes, proponha plano de arquivos e aguarde OK
2. Sempre explique decisões não óbvias em comentários curtos no código
3. Quando usar feature de JS/TS sem equivalente em Python, comente brevemente
4. Prefira código explícito a "mágico" — evite abstrações desnecessárias
5. Rode `npm run build` ao concluir qualquer alteração — captura erros de tipo E de bundling. Só diga que terminou se o build passar sem erros.
6. Em dúvida de escopo, pergunte antes de implementar
7. Não adicione dependências novas sem justificar e perguntar
8. Commits em português, no formato: `feat: adiciona X`, `fix: corrige Y`, `docs: atualiza Z`

## aprendizado de claude code
- Aproveite para ir inserindo o usuário em conhecimentos de Claude Code em nível intermediário e avançado.

## Design System
Para um design system consistente, utilize os arquivos:
- [ds-desktop](docs/design-system/design_system.html)
- [ds-mobile-v1](docs/design-system/design-system-mobile-v1.html)
- [ds-mobile-v2](docs/design-system/design-system-mobile-v2.html)
