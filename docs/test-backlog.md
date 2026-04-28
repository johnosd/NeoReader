# Backlog de Testes — NeoReader

> Continuação da sessão de 2026-04-27/28.
> #1 (getSentenceAt) e #2 (chunking PT/ES) foram implementados. Itens abaixo são o que falta.

---

## Contexto atual

| Suite | Arquivo | Testes | Status |
|---|---|---|---|
| Corpus estático (parsing) | `realEpubCorpus.test.ts` | 66 | 19 falhas de EPUB (não são bugs do app) |
| Interação com componente | `realEpubInteraction.test.tsx` | 990 | ✅ todos passando |
| Texto real (invariantes) | `realEpubText.test.ts` | 330 | ✅ todos passando |
| Utils unitários | `readerUtils.test.ts` + `ttsChunking.test.ts` | 31 | ✅ todos passando |

---

## #3 — Detecção de stub + auto-skip no viewer

**Problema:** o viewer faz auto-skip de páginas stub (só TOC, sem conteúdo real), mas nenhum
teste verifica que isso acontece com conteúdo real de EPUBs.

**O que testar:**
- Carregar uma seção stub real (ex: extraída de `12-Regras-para-a-Vida`, que tem stubs)
- Verificar que `renderer.goTo` é chamado automaticamente com o próximo índice
- Verificar que `onLoad` **não** dispara para seções stub

**Arquivo alvo:** `realEpubInteraction.test.tsx` — nova suite por EPUB.

**Helper necessário:** função que detecta se um documento HTML do EPUB é stub
(replicar `isChapterStub` do `EpubService` no contexto do teste).

---

## #4 — Vocabulário: fluxo completo

**Problema:** `TranslationService.test.ts` existe, mas não há teste end-to-end do fluxo:
selecionar parágrafo → traduzir → clicar "Salvar" → verificar entrada no Dexie.

**O que testar em `ReaderScreen.test.tsx`:**
- Simular clique em parágrafo → `onTranslate` → chamar `injectTranslation`
- Clicar no botão `[data-nr-action="save"]` do bloco inline
- Verificar que `onSaveVocab(sourceText, translatedText)` foi chamado com os textos corretos
- Verificar que a tela de vocabulário (`VocabScreen`) exibe a entrada salva

**Observação:** `onSaveVocab` já é mockado em `defaultProps` — basta exercitar o fluxo completo.

---

## #5 — Progresso de leitura: salvar e restaurar posição

**Problema:** `useReaderProgress.test.tsx` testa o hook isolado. Não existe teste que simule
o ciclo completo: abrir livro → ler → fechar → reabrir na posição salva.

**O que testar:**
- Renderizar `ReaderScreen` com `savedCfi = null`
- Disparar evento `relocate` com um CFI real
- Verificar que `db.books.update(id, { lastCfi: cfi })` foi chamado (mock do Dexie)
- Re-renderizar com `savedCfi = cfi` salvo
- Verificar que `EpubViewer` recebe `savedCfi` correto via props

**Arquivo alvo:** `ReaderScreen.test.tsx` — novo `describe('ciclo de progresso')`.

---

## #6 — Import de EPUB corrompido / malformado

**Problema:** `BookImportService.test.ts` só testa o happy path. Nenhum teste cobre falhas
reais de import que usuários enfrentam com arquivos baixados corrompidos.

**Casos a testar:**
- EPUB com ZIP inválido (bytes aleatórios) → deve chamar `onError`, não travar
- EPUB com `container.xml` ausente → erro claro
- EPUB com OPF sem `<spine>` → importa sem crash, `toc` vazio
- EPUB com imagem de capa referenciada mas ausente no ZIP → importa sem crash, capa nula

**Estratégia:** criar blobs sintéticos mínimos para cada caso (sem precisar de arquivos reais).

---

## #7 — CSS diagnostics com CSS real dos EPUBs

**Problema:** `detectStyleDiagnostics` é testado com strings sintéticas. Os 66 EPUBs têm
CSS problemático real — vale verificar que os diagnósticos retornados batem com o esperado.

**O que testar em `realEpubCorpus.test.ts` (ou novo arquivo):**
- Para EPUBs que já sabemos ter problemas (ex: `Quem Pensa Enriquece`): verificar que
  `styleDiagnostics` contém `hardcoded-text-color`
- Para EPUBs limpos: verificar que não há diagnósticos falsos positivos

**Helper necessário:** mapa estático `{ epubFileName → expectedIssues[] }` para os casos conhecidos.

---

## #8 — Manga/EPUB sem `<p>`: degradação graciosa

**Problema:** `The_Life-Changing_Manga_of_Tidying_Up` não tem parágrafos de texto.
Nenhum teste verifica que o viewer **abre sem crash** e que cliques não disparam `onTranslate`.

**O que testar em `realEpubInteraction.test.tsx`:**
- Carregar capítulo do manga (sem `<p>` com texto real)
- Verificar que `onLoad` dispara normalmente
- Clicar no body → `onTranslate` **não** deve ser chamado
- `onCenterTap` pode ser chamado (toggle do chrome) — mas sem crash

---

## #9 — Múltiplos bookmarks em seções diferentes

**Problema:** testes de bookmark cobrem apenas 1 bookmark. Nenhum teste cobre
o caso de 10+ bookmarks em seções diferentes.

**O que testar:**
- Criar viewer com 5 bookmarks em CFIs diferentes (seções 0, 1, 2)
- Carregar seção 0 → verificar que apenas os parágrafos da seção 0 têm `data-nr-bookmark`
- Carregar seção 1 → verificar que apenas os parágrafos da seção 1 têm `data-nr-bookmark`
- Deletar um bookmark (prop atualizada) → verificar que o atributo some do parágrafo

---

## #10 — TOC com hrefs com fragmento (`chapter.xhtml#section-2`)

**Problema:** `buildHrefNavigationTarget` tem lógica para âncoras internas, mas os testes
de navegação não cobrem esse caso — comum em livros técnicos (DDIA, LLM Handbook).

**O que testar:**
- Populat `foliateEl.book.sections` com hrefs reais que contêm `#fragmento`
- Chamar `viewerRef.current.goTo('chapter-2.xhtml#section-3')`
- Verificar que `renderer.goTo` recebe `{ index: N, anchor: expect.any(Function) }`
- A função `anchor` deve retornar o elemento com `id="section-3"` quando chamada com o doc correto

**EPUBs com fragmentos no TOC:** `Designing_Data-Intensive_Applications`, `LLM_Engineers_Handbook`.

---

## Ordem sugerida de implementação

```
#6 → mais risco real (crashes no import)
#4 → fluxo de vocabulário (feature core do app)
#5 → progresso/posição (regressão silenciosa comum)
#3 → stub skip (edge case de navegação)
#8 → manga (edge case de conteúdo)
#9 → múltiplos bookmarks (cobertura de prop)
#10 → TOC com fragmento (edge case de navegação)
#7 → CSS diagnostics (mais diagnóstico que risco)
```

---

## Comandos úteis

```bash
# Suite rápida (sem debug-books)
npm run test

# Só interação com livros reais
npm run test:debug-epubs:interaction

# Corpus completo (os 3 arquivos debug)
npm run test:debug-epubs

# Checar tipos
npx tsc --noEmit
```
