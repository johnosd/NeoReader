# NeoReader — Contexto para Claude Code

## Sobre o projeto
NeoReader é um leitor de EPUB para Android focado em **incentivar a leitura**
e **facilitar o aprendizado de inglês**. Interface estilo "Netflix for Books".
Veja `docs/epub-reader-plan.md` para escopo completo.

## Perfil do dev
- Engenheiro de dados sênior com background Python/SQL
- Não conhece JS/TS/React a fundo — aprende enquanto constrói
- Prefere honestidade sobre politeness — aponte falhas e premissas erradas
- Quer explicações breves inline no código, não aulas longas
- Veja `docs/learning-companion.md` para filosofia de aprendizado

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS v4
- Capacitor 6 (Android only no MVP)
- Dexie.js (IndexedDB wrapper)
- foliate-js (parser EPUB)
- Zustand (estado global)
- Lucide React (ícones)

## Comandos
- `npm run dev` — dev server web (localhost:5173)
- `npm run build` — build produção (gera dist/)
- `npm run lint` — lint do código
- `npx tsc --noEmit` — checagem de tipos sem gerar arquivos
- `npx cap sync android` — sincroniza dist com projeto Android
- `npx cap run android` — builda e roda no device conectado
- `adb devices` — lista celulares conectados

## Convenções de código
- Componentes em PascalCase: `BookCard.tsx`
- Hooks começam com `use`: `useReader.ts`
- Services são classes: `TranslationService.ts`
- Um arquivo = uma responsabilidade
- Imports absolutos a partir de `src/` (configurar alias `@/` quando necessário)

## Estrutura de pastas
- `src/components/` — UI reutilizável
- `src/screens/` — Telas completas
- `src/hooks/` — React hooks customizados
- `src/services/` — Lógica de negócio (Translation, TTS, Sync)
- `src/db/` — Schema Dexie e queries
- `src/types/` — Tipos TypeScript compartilhados
- `src/utils/` — Funções puras
- `src/lib/` — Wrappers de bibliotecas externas
- `docs/` — Documentação do projeto

## Direção visual
"Netflix for Books" — dark mode, capas grandes, rows horizontais scrollable.
Paleta principal:
- bg: #0a0a0a (quase preto)
- elevated: #1a1a1a
- accent: #6366f1 (índigo)
- progress: #22c55e
Veja `docs/epub-reader-plan.md` seção 5 para detalhes.

## Regras de ouro para Claude Code
1. Antes de implementar features grandes, proponha plano de arquivos e aguarde OK
2. Sempre explique decisões não óbvias em comentários curtos no código
3. Quando usar feature de JS/TS sem equivalente em Python, comente brevemente
4. Prefira código explícito a "mágico" — evite abstrações desnecessárias
5. Rode `npm run build` ao concluir qualquer alteração — captura erros de tipo E de bundling. Só diga que terminou se o build passar sem erros.
6. Em dúvida de escopo, pergunte antes de implementar
7. Não adicione dependências novas sem justificar e perguntar
8. Commits em português, no formato: `feat: adiciona X`, `fix: corrige Y`, `docs: atualiza Z`

## Status atual

### Concluído
- [x] Setup inicial: Vite + React + TS + Tailwind + Capacitor Android
- [x] Estrutura de pastas criada
- [x] App rodando no celular
- [x] Biblioteca: hero banner, rows horizontais, import de EPUB, progresso nas capas
- [x] Gerenciamento de livros: recriar capa, escolher imagem, deletar (`BookOptionsSheet`)
- [x] Leitor: foliate-js modo scroll contínuo, tema escuro, fonte ajustável, TOC, marcadores, progresso persistente
- [x] Navegação entre capítulos: banner "Fim do capítulo" + swipe para avançar
- [x] Tradução inline: frase exata tocada detectada via `caretRangeFromPoint`, bloco injetado no iframe
- [x] Vocabulário: salvar, listar, cache offline de traduções
- [x] TTS: audiobook contínuo com mini player (`TtsMiniPlayer`), karaokê via Speechify, fallback nativo, leitura de frase individual
- [x] Configurações: API key Speechify, idioma de tradução, fonte padrão (`SettingsScreen`)

### Próxima feature sugerida
- [ ] Google Drive sync (progresso + marcadores + vocabulário)

## aprendizado de claude code
 - aproveite para ir inserindo o usuario conhecimentos de claude code em nivel intermediario e avançado