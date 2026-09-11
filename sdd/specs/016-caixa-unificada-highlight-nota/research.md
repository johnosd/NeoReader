# Research: Caixa unificada de cor, estilo e nota

Decisões técnicas com incerteza genuína o bastante pra justificar alternativas
documentadas (Fase 0). Decisões triviais/diretas já viraram `## Decisões
Invariantes` em `plan.md` sem passar por aqui.

## D-001: A caixa unificada vive FORA do iframe do EPUB (React normal), não dentro do menu de seleção sandboxado

**Decisão**: `HighlightComposerSheet` (novo, substitui `HighlightNoteSheet`) é
um componente React de verdade, renderizado em `ReaderScreen.tsx` via
`BottomSheet` — igual `HighlightNoteSheet` já é hoje. `EpubViewer.tsx` só
dispara um callback com o payload necessário (`onRequestCreateHighlight`
pra criar, `onEditHighlight` pra editar); nunca desenha a caixa dentro do
`doc.body` do iframe.

**Justificativa**: A feature `013-anotacoes-highlights` já tomou essa mesma
decisão pro campo de nota (documentado em `014/plan.md`: "diferente da 013,
que precisou de `onAnnotateHighlight` pra abrir UI fora do iframe"). O motivo
implícito é usabilidade de teclado: o iframe do EPUB roda com `sandbox` SEM
`allow-scripts` (`vite.config.ts`, endurecimento de CSP citado no
CLAUDE.md) — um `<textarea>` real dentro dele ainda aceitaria digitação
nativa do navegador (isso não depende de scripts), mas um popup pequeno
posicionado por `range.getBoundingClientRect()` (mesmo mecanismo do menu de
seleção hoje) fica sujeito ao teclado virtual do Android cobrindo/empurrando
a caixa de forma imprevisível, sem nenhum controle de layout responsivo real
— exatamente o tipo de problema que uma `BottomSheet` ancorada na tela (não
no texto) resolve de graça.

**Alternativas consideradas**:
- Manter a caixa dentro do menu de seleção/gerenciamento sandboxado
  (`#nr-selection-menu`/`#nr-highlight-menu`), com um `<textarea>` raw HTML
  adicionado ao HTML já existente. Rejeitada: reabriria exatamente o
  problema que a 013 já evitou, e exigiria posicionamento dinâmico
  considerando teclado virtual — complexidade desnecessária quando já existe
  um padrão comprovado (`BottomSheet`) pra isso.

## D-002: "Último highlight usado" (cor + estilo) persiste em `ReaderDefaults`, global entre livros

**Decisão**: `src/types/settings.ts` → `ReaderDefaults` ganha
`lastHighlightColor: string` e `lastHighlightStyle: HighlightStyle`
(defaults `'indigo'`/`'background'`, mesmo padrão hoje hardcoded em
`renderHighlightMenuActionsHtml`'s valor default). `src/db/settings.ts` já
tem `updateReaderDefaults(patch)` — só passa a incluir esses dois campos.
Nenhuma nova `version()` do Dexie: `readerDefaults` já é um objeto opaco
dentro do registro `settings`, não indexado (mesmo raciocínio já documentado
pra `Highlight.style?`/`Highlight.note?` em `types/highlight.ts`).

**Justificativa**: A spec (FR-002) exige que o default sobreviva entre
sessões e valha pra qualquer livro — exatamente o escopo de
`ReaderDefaults` (global, já usado pra tema/fonte/tamanho). `getSettings()`/
`updateReaderDefaults()` já existem e já são consumidos por
`useReaderAppearance` — só que ESSE hook já carrega bastante responsabilidade
(aparência + TTS + Word Lens); carregar/gravar o último highlight usado
direto em `ReaderScreen.tsx` (um `useEffect` pequeno on mount +
`updateReaderDefaults` no confirm) evita inchar ainda mais um hook que já é
grande, sem duplicar a função de persistência em si.

**Alternativas consideradas**:
- Novo campo em `Highlight` (ex: marcar o mais recente) — rejeitada: a spec
  precisa do default ANTES de qualquer highlight existir na sessão atual
  (inclusive vindo de outro livro), então tem que ser uma preferência
  separada, não algo derivado da tabela de highlights.
- Persistir só em memória (variável de módulo em `EpubViewer.tsx`, como
  `pendingHighlightStyle` já é hoje) — rejeitada explicitamente pela
  Assumption da spec: precisa sobreviver a fechar/reabrir o app.

## D-003: Pintura do highlight (SVG overlay) continua 100% reativa — nenhum novo método imperativo de paint

**Decisão**: Depois de `addHighlight`/`updateHighlightAppearance`/
`updateHighlightNote` gravarem no Dexie, a pintura acontece só pelo
mecanismo já existente: `useLiveQuery` reage à escrita → `highlights` prop
de `ReaderScreen` muda → o `useEffect(() => {...}, [highlights])` que já
existe em `EpubViewer.tsx` repinta as seções carregadas. Nenhum método novo
tipo `viewerRef.current.paintHighlightNow(...)` é adicionado.

**Justificativa**: Hoje, criar/editar aparência chama
`onCreateHighlight`/`onChangeHighlightAppearance` E `void paintHighlight(...)`
juntos, no MESMO clique — pintura otimista, sem esperar o round-trip do
Dexie. Isso só é possível porque a confirmação acontece DENTRO do closure do
`EpubViewer` (o clique no swatch de cor é um evento do próprio iframe). Com
a caixa unificada fora do iframe (D-001), a confirmação acontece em
`ReaderScreen`, que não tem acesso direto às funções internas de
`EpubViewer` — só ao "highlights" reativo. Tentar expor um método
imperativo pra recuperar a pintura instantânea reintroduziria exatamente o
tipo de dualidade (pintura otimista + pintura reativa desencontradas) que
causou o bug real já investigado nesta sessão
(`sdd/bugs/highlight-some-ao-tocar-no-mesmo/`) — width o histórico mostrou
que múltiplos caminhos de pintura pro MESMO highlight são uma fonte real de
bug, não uma otimização segura por padrão.

**Alternativas consideradas**:
- Expor `viewerRef.current.paintHighlight(cfi, color, style)` como método
  imperativo, chamado pelo confirm da caixa ANTES do `addHighlight` resolver.
  Rejeitada por padrão (ver justificativa acima) — mantida como opção de
  fallback SE a latência reativa (Dexie write → useLiveQuery → re-render →
  efeito de repaint) se mostrar perceptível na validação manual (`R-00X` em
  `plan.md`), não implementada preventivamente.
