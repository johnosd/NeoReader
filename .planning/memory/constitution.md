<!--
Relatório de Impacto de Sincronização
- Mudança de versão: (inexistente) -> 1.0.0
- Princípios modificados: nenhum (criação inicial)
- Seções adicionadas: Princípios Fundamentais, Restrições do Projeto, Fluxo de Desenvolvimento, Governança
- Seções removidas: nenhuma
- Pendências: nenhuma
-->

# Constitution do NeoReader

## Princípios Fundamentais

### I. Plano antes de feature grande

Antes de implementar uma feature grande, o plano de arquivos afetados DEVE ser
proposto e aprovado pelo usuário antes de começar a escrever código. Escopo
ambíguo NUNCA é resolvido por suposição — o assistente DEVE perguntar antes de
implementar.

### II. Comentários só onde o "porquê" não é óbvio

Decisões não óbvias DEVEM ter um comentário curto explicando o motivo (não o
"o quê" — isso já vem dos nomes). Quando o código usa uma feature de JS/TS sem
equivalente direto em Python, DEVE ter um comentário breve explicando —
o desenvolvedor principal tem background em Python/SQL/AI/APIs e está
aprendendo JS/TS/React construindo este projeto.

### III. Explícito antes de mágico

Código explícito é preferível a abstrações "mágicas" evitáveis. Não introduzir
abstrações, camadas ou generalizações além do que a tarefa atual exige — sem
desenhar para requisitos hipotéticos futuros.

### IV. Build limpo é a definição de "pronto"

`npm run build` (checagem de tipos via `tsc -b` + build de produção) DEVE
passar sem erros antes de qualquer alteração ser reportada como concluída —
ele captura tanto erros de tipo quanto de bundling que testes sozinhos não
pegam.

### V. Dependências novas exigem justificativa

Nenhuma dependência nova DEVE ser adicionada ao projeto sem justificar a
necessidade e obter aprovação explícita do usuário antes de instalar.

## Restrições do Projeto

- **Produto**: leitor de EPUB mobile-first (Android via Capacitor + Web),
  local-first — livros, progresso, marcadores, vocabulário, preferências e
  caches ficam no dispositivo (Dexie/IndexedDB), sem backend próprio de dados
  de leitura.
- **Stack travada**: React 19 + TypeScript + Vite 8, Tailwind CSS v4,
  Capacitor 8 (Android + Web), Dexie.js (IndexedDB), foliate-js (parser
  EPUB), Zustand, Lucide React, Firebase Auth, RevenueCat, AdMob, Vitest +
  Testing Library. Trocar qualquer peça dessa stack é decisão de projeto, não
  de feature individual.
- **Plataformas alvo**: Android nativo (build Capacitor) e Web. Não há build
  iOS neste momento.
- **Modelo de uso**: single-user por dispositivo, com isolamento de dados por
  usuário autenticado (Firebase Auth); sem multi-tenancy.
- **Monetização já implementada**: modelo freemium + Ads (AdMob) + assinatura
  Pro (RevenueCat) — mudanças que tocam paywall/entitlements devem respeitar
  esse modelo existente, não redesenhá-lo por conta própria.
- **Cuidado com o iframe do EPUB**: `EpubViewer.tsx` injeta recursos
  (tradução inline, highlights, TTS) dentro do sandbox do iframe do
  foliate-js — mudanças ali exigem atenção a sandbox/CSP.
- **Schema do banco é append-only**: mudanças em `src/db/database.ts` sempre
  adicionam uma nova `version()` no Dexie — nunca editam uma versão
  existente.

## Fluxo de Desenvolvimento

- Antes de abrir PR: `npm run lint && npm test && npm run build` devem
  passar.
- Testes vivem em `src/__tests__/`, espelhando a estrutura de `src/`
  (`components/`, `hooks/`, `services/`, `db/`, `store/`, `utils/`, `i18n/`,
  `screens/`); importam `describe`/`it`/`expect` explicitamente de `'vitest'`
  (sem usar `globals`).
- Um arquivo = uma responsabilidade. Componentes em PascalCase, hooks
  começam com `use`, services são classes.
- Imports absolutos a partir de `src/` via alias `@/`.
- Commits em português, formato Conventional Commits: `feat: adiciona X`,
  `fix: corrige Y`, `docs: atualiza Z`.
- Para UI/frontend, testar o fluxo principal e edge cases num browser real
  (ou no device Android) antes de reportar a tarefa como concluída — testes
  automatizados verificam corretude de código, não corretude de feature.

## Governança

Esta constitution rege como o código do NeoReader é construído e revisado.
Mudanças nela exigem consciência explícita de que estão alterando regras do
projeto, não só de uma feature.

A constitution usa versionamento semântico. Uma versão MAJOR denota remoção
ou redefinição incompatível de um princípio. Uma versão MINOR denota um novo
princípio ou expansão material da governança. Uma versão PATCH denota
esclarecimentos, correções ou mudanças de texto não semânticas.

**Versão**: 1.0.0 | **Ratificada**: 2026-08-26 | **Última Emenda**: 2026-08-26
