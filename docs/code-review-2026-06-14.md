# Code review completo + plano de ajustes (2026-06-14)

## Contexto

Revisão completa do código (134 arquivos `.ts`/`.tsx` em `src/`) e plano de
ajustes. Para cobrir o código com profundidade, 3 agentes de exploração revisaram em
paralelo: (1) services + db/Dexie + integrações externas, (2) reader/EpubViewer + hooks
+ store, (3) screens + componentes UI + i18n + app shell. Juntos levantaram ~40 itens.

Antes de fechar o plano, os itens classificados como "ALTA" severidade foram
verificados manualmente lendo o código real — vários se mostraram **falsos
positivos** (a IA dos agentes interpretou mal o fluxo ou o tipo). Esses foram
descartados para não gerar retrabalho. O plano abaixo cobre apenas itens confirmados
ou plausíveis o suficiente para valer a pena investigar, organizados em **3 fases por
impacto/risco**, cada fase terminando com `npm run build` (+ `npx tsc --noEmit` e
`npm test` quando relevante).

Itens de UI/i18n mais cosméticos (cores hardcoded, gradientes duplicados, variantes de
Button não usadas além da já confirmada) e o refactor grande do `LibraryScreen`
(1085 linhas) **não** entram nas fases de execução — ficam listados no final como
"backlog para outra rodada", para não inflar o escopo desta.

---

## Itens descartados (verificados e são falso positivo / por design)

Não vamos tocar nestes — documentando para não serem re-levantados:

- **`BookImportService.bookIdentifierValue`** (services agent, ALTA): reportado como
  bug por retornar `{ value: identifier, ... }` (objeto) em vez de
  `identifier.value` (string). Na verdade o tipo `ResolvedBookInfo.isbn10/isbn13` é
  `BookInfoValue<BookIdentifier>`, ou seja `value` deve ser o objeto `BookIdentifier`
  mesmo. Código está correto.
- **Migration v7 do Dexie (`database.ts`)** (services agent, ALTA): reportado como
  "covers perdidas se `bulkPut` falhar depois do `.modify()`". `.upgrade()` do Dexie
  roda dentro de uma transação `versionchange` do IndexedDB, que é atômica — se
  `bulkPut` falhar, a transação inteira (incluindo o `.modify()`) é revertida e o
  `db.open()` rejeita. Não há perda silenciosa de dados.
- **`PaywallScreen` "sem entitlements/fetch de offerings"** (UI agent, ALTA): é uma
  decisão deliberada documentada em `docs/monetization-status.md` ("Pro adiado até
  Drive Sync", 2026-05-14). Não é bug — não tocar até Sprint 3 (Drive Sync).
- **`useTTS.play()` "race condition" entre `++playSessionRef.current` e
  `shouldStopRef.current = false`** (reader agent, ALTA): são duas instruções
  síncronas, sem `await` entre elas — JS não interrompe nesse meio. Não há
  interleaving possível aí.
- **`ElevenLabsService` "chama `.arrayBuffer()` mesmo após detectar JSON"** (services
  agent, MÉDIA): o branch que detecta `application/json` faz `throw` antes de chegar
  no `.arrayBuffer()`. Fluxo está correto.
- **Fallback de API key via `import.meta.env.VITE_*` para TTS premium / Google Books**:
  confirmado como conhecido/aceito por enquanto — fora do plano.

---

## Fase 1 — Correções rápidas e seguras (sem precisar testar no device)

Itens de baixo risco, isolados, fáceis de revisar num único PR.

1. **`src/hooks/useTtsSleepTimer.ts`** — confirmado: não há `useEffect` de cleanup.
   Se o componente desmontar com o sleep timer ativo, `setInterval`/`setTimeout`
   continuam rodando e disparam `onExpire()`/`setState` num hook já desmontado.
   Adicionar:
   ```ts
   useEffect(() => () => clearHandles(), [clearHandles])
   ```

2. **`src/screens/BookDetailsScreen.tsx:218-227`** — confirmado: `languageSettingMeta`
   e `translationTargetLangMeta` são calculados (com strings PT hardcoded:
   "manual", "automatico", "neste livro", "padrao do app") e depois descartados via
   `void`. É código morto/incompleto. Remover as duas variáveis (e o `void`), a menos
   que se queira de fato exibir essa info na tela — nesse caso é uma decisão de
   produto separada, não cabe nesta limpeza.

3. **`src/components/ui/Button.tsx`** — variant `indigo` em `variantClasses()` não é
   usado em nenhum lugar do app (todos usam `tone="purple"`). Remover o variant morto.

4. **`src/services/AdsService.ts:136`** — `catch { /* ignora */ }` em
   `AdMob.removeBanner()`. Trocar por log via `logImportDiagnostic('ads', ...)` para
   não perder visibilidade se o banner ficar "preso".

5. **`src/services/OpenLibraryService.ts:69-90`** — `response.json()` sem try/catch;
   se a API responder algo não-JSON (ex.: HTML de erro/rate-limit), `SyntaxError`
   sobe sem tratamento. Envolver em try/catch e retornar `null`/fallback, como os
   outros providers de `bookInfo/`.

6. **`src/services/AuthorService.ts`** (linhas ~89, ~134) — `void setCachedAuthor(...)`
   sem `.catch()`. Se a escrita no Dexie falhar, erro é engolido silenciosamente.
   Adicionar `.catch((err) => ...)` com log, consistente com o padrão de
   `DiagnosticsLogger` usado em outros services.

7. **Consolidar duplicação pequena entre providers de TTS** (baixo risco, puramente
   mecânico — mover para `src/utils/`):
   - decode base64→Blob/bytes: `ElevenLabsService.decodeBase64ToBlob`,
     `FishAudioService.decodeBase64ToBytes`, `SpeechifyService.decodeBase64ToBlob`,
     `BookImportService.base64ToBlob` → `src/utils/base64.ts`
   - `replaceSpeechControlCharacters` / `normalizeSpeechInput` duplicados entre
     `SpeechifyService` e `FishAudioService` → `src/utils/ttsText.ts`
   - Antes de mover, confirmar que as implementações são de fato equivalentes (ler
     as 4 versões lado a lado) — pequenas diferenças de assinatura podem existir.

Cada item da Fase 1 é independente; podem ser feitos e revisados em sequência rápida.
Ao final: `npm run build`, `npx tsc --noEmit`, `npm test`.

---

## Fase 2 — Reader / TTS (requer teste no device Android)

Área mais sensível — qualquer mudança aqui precisa ser validada com
`npx cap run android`, navegando entre capítulos, usando TTS (audiobook + toque em
parágrafo) e o sleep timer.

1. **`src/components/reader/EpubViewer.tsx` — listeners por seção (`load` do
   `view`, linhas ~2359-2470)**: a cada evento `load`, são registrados
   `touchstart`/`touchmove`/`touchend`/`click` direto no `doc` da seção, sem guardar
   referência para `removeEventListener`. Isso é só um problema real **se** o
   foliate-js reusa o mesmo `doc`/iframe ao recarregar uma seção (ex.: ida-e-volta
   rápida entre capítulos) — nesse caso os handlers se acumulam e ações como
   "salvar no vocabulário"/bookmark/"falar trecho" disparariam múltiplas vezes.
   **Passo 1 (investigação)**: testar no device — abrir um capítulo, voltar e avançar
   repetidamente, tocar numa palavra para traduzir e clicar "salvar" — ver se o
   toast/ação dispara 1x ou N vezes (N = nº de vezes que a seção foi recarregada).
   **Passo 2 (fix, só se confirmado)**: guardar uma função de cleanup por `doc`
   (ex. `Map<Document, () => void>`) e chamá-la antes de registrar os listeners de
   novo para o mesmo `doc`.

2. **`src/hooks/useTTS.ts` — `nativeRangeEventSeenRef` após fallback premium→native**
   (linhas ~568, ~590-596, fallback em `speakChunk`): `nativeRangeEventSeenRef.current`
   só é resetado para `false` no início de `play()`. Se o fallback para `native`
   ocorrer **no meio** de uma sessão (premium falhou em algum chunk), o ref já pode
   estar `true` de uma sessão anterior, e o highlight sincronizado (karaokê) da nova
   sessão nativa pode não disparar corretamente.
   **Fix**: resetar `nativeRangeEventSeenRef.current = false` no ponto em que o
   fallback para `native` é decidido (dentro de `speakChunk`, antes de chamar
   `speakWithNative`/`fallbackToNative`).
   **Teste**: forçar fallback (ex.: configurar API key inválida do provider premium)
   e confirmar que o destaque de palavra (karaokê) continua funcionando após o
   fallback.

3. **`src/components/reader/EpubViewer.tsx:2438-2447` — `setTimeout` do botão "save"
   do bloco de tradução**: após salvar no vocabulário, um `setTimeout(1500ms)` reseta
   o label do botão, com guard `actionBtn.isConnected`. Se a seção for trocada antes
   dos 1.5s, o guard evita erro, mas o timeout fica pendurado até disparar.
   **Fix simples**: guardar o id do timeout numa ref e limpá-lo em
   `finalizePendingSection`/na troca de seção (mesmo padrão já usado para
   `finalizeSectionTimeoutRef`).

4. **`src/screens/ReaderScreen.tsx` — abrir livro cujo arquivo não existe mais**:
   confirmar (lendo o fluxo de abertura) se há alguma validação de que
   `book.fileBlob`/arquivo externo (`storageMode: 'external'`) ainda existe antes de
   passar para `EpubViewer`. Se não houver, ao tentar abrir um livro com
   `missingFile: true` (campo já existe no schema v13!) o usuário pode cair numa tela
   de erro genérica do `ErrorBoundary` em vez de uma mensagem clara ("arquivo não
   encontrado, deseja remover da biblioteca?").
   **Fix**: usar o campo `missingFile` (já existente no banco) para bloquear a
   navegação para o reader e mostrar feedback adequado — reaproveitar
   `EmptyState`/`Toast` já existentes.

Ao final da Fase 2: `npm run build`, depois `npx cap sync android` +
`npx cap run android` para teste manual (item 1, 2 e 3 exigem device real por
envolverem iframe/WebView e TTS nativo).

---

## Fase 3 — Robustez de services/DB

Itens estruturais de cache/erro, menor urgência, mas sem dependência de UI.

1. **`src/db/translations.ts`** — `setCachedTranslation` faz `db.translations.add()`
   sem TTL; tabela cresce indefinidamente. Adicionar `expiresAt` (ou `updatedAt` +
   leitura com verificação de idade, igual ao padrão já usado em
   `src/db/ttsVoiceCaches.ts:20-31`) e limpar entradas antigas no `getCachedTranslation`.

2. **`src/db/ttsVoiceCaches.ts`** — já tem TTL por registro, mas a limpeza só ocorre
   quando alguém pede aquele `cacheKey`. Adicionar uma função
   `cleanupExpiredTtsVoiceCaches()` chamada uma vez no boot do app (ex. em `App.tsx`,
   junto com os outros `init`).

3. **`src/services/BookImportService.ts` — `hashFile` (linhas ~1006-1015)**: catch
   silencioso retorna `undefined` se `crypto.subtle.digest` falhar — importação
   continua sem hash, permitindo duplicatas não detectadas. Logar a falha via
   `logImportDiagnostic`.

4. **`src/services/ImportCoordinator.ts` + `BookImportService.ts` — índice de
   duplicados (`buildDuplicateIndex`, linhas ~248-281)**: o índice é construído uma
   vez no início do import; se dois imports rodarem em sequência rápida (dois taps
   no botão antes do primeiro terminar), pode haver duplicata não detectada.
   `ImportCoordinator` já rejeita import concorrente (`activeImport`) — confirmar que
   esse guard cobre **todos** os pontos de entrada de import (nativo + web +
   "pending file selection" mencionado em `HomeScreen.tsx`). Se cobrir, este item
   pode ser descartado; se não, adicionar o guard no ponto faltante.

5. **`src/services/DiagnosticsLogger.ts:294`** — regex de redação de URLs cobre
   `api_key|key|token|secret|signature|access_token|refresh_token` como query param.
   Adicionar `Authorization` (quando logado em headers) e variações como
   `apikey`, `client_secret`, `Bearer <token>` no corpo de mensagens de erro.

Ao final: `npm run build`, `npx tsc --noEmit`, `npm test`.

---

## Backlog (fora do escopo desta rodada — citar mas não implementar)

- **`src/screens/LibraryScreen.tsx`** (1085 linhas): múltiplas responsabilidades
  (filtro, sort, import, tags, preview). Quando for tocar nessa tela de novo, vale
  extrair `ImportFlowSheet`, `SortSheet` e o action sheet de import para
  `src/components/`. Refactor grande — merece plano próprio.
- **i18n**: algumas strings hardcoded em PT em `BookDetailsScreen.tsx` (ex.:
  `"NYT"` em `DiscoverScreen.tsx:55`) — cobertura é majoritariamente boa, esses são
  casos isolados. Tratar junto de outras mudanças nessas telas.
- **Cores/gradientes inline hardcoded** (`BookCard`, `HeroBanner`, `BottomNav`,
  `NytBooksRow`) — cosmético, não muda comportamento; revisitar quando houver
  trabalho de design system.

---

## Verificação

- Fase 1: `npm run build` (cobre `tsc -b` + Vite), `npx tsc --noEmit`, `npm test`
  (vitest — cobre `TranslationService`, `bookInfo/*`, hooks testados).
- Fase 2: `npm run build` + teste manual no device via `npx cap run android`
  (navegação entre capítulos, TTS audiobook com fallback, toque em parágrafo,
  sleep timer, salvar vocabulário a partir do bloco de tradução).
- Fase 3: `npm run build`, `npx tsc --noEmit`, `npm test`.
- Commits em português por fase, seguindo o padrão `fix:`/`refactor:` do projeto.
