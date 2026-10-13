# Implementation Plan: Proteção de livros com PIN e grupo "Protegidos" na Biblioteca

**Slug**: `024-protecao-livros-pin` | **Date**: 2026-10-12 | **Spec**: `sdd/specs/024-protecao-livros-pin/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Permitir marcar livros como protegidos por um PIN único do app (4 a 6 dígitos).
Livros protegidos continuam visíveis com cadeado, mas qualquer interação além de
vê-los exige o PIN; um PIN correto libera todos até o app ir para segundo plano.
Biblioteca ganha o filtro fixo "Protegidos". Esqueceu o PIN: confirma a
credencial de tela do aparelho e define outro.

Entrega em duas releases: **R1** = bloqueio (US1) + recuperação do PIN; **R2** =
Alterar/Desativar em Configurações e o filtro "Protegidos" (depende da 023).

Abordagem: um registro `bookProtection` (PIN com PBKDF2 + controle de espera) e
um campo `Book.isProtected`; estado "desbloqueado" só em memória (Zustand); um
**gate por rota** (`BookLockGate`) em `App.tsx` garante que nenhuma via abre ou
mostra um livro protegido sem PIN, e um **guard por ação** cobre sheets, tags e
seleção múltipla. Nenhum código novo dentro de `ReaderScreen`, `EpubViewer` ou do
iframe do EPUB. Nenhuma dependência nova.

## Technical Context

**Language/Version**: TypeScript (strict, `tsc -b`) + React 19, Vite 8

**Primary Dependencies**: já existentes: Zustand (store), Dexie + `dexie-react-hooks`,
`@capacitor/app` (ciclo de vida), Firebase JS SDK (só a reautenticação na web),
Lucide React (ícones), Tailwind v4. **Nenhuma nova.** `crypto.subtle` (WebCrypto)
e, no Android, `KeyguardManager` (credencial de tela) vêm da plataforma; o
método nativo novo entra no plugin `NeoReaderLibraryPlugin.java` que já existe,
sem Gradle novo.

**Storage**: Dexie `NeoReaderDB` (um banco por uid). Nova tabela `bookProtection`
(`version(20)`) e campo não indexado `Book.isProtected`. Ver `data-model.md`.

**Testing**: Vitest + Testing Library (jsdom). Testes de DB mockam `@/db/database`
(padrão de `settings.test.ts`/`books.bulk.test.ts`). Sem `globals`.

**Target Platform**: Android (Capacitor 8) e Web. Sem iOS.

**Performance Goals**: desbloquear em < 1 s depois do último dígito (SC-002);
PBKDF2 ≤ ~300 ms no aparelho (D-002, spike T003).

**Constraints**: local-first; schema Dexie append-only; iframe do EPUB não muda;
re-bloqueio não pode interromper o TTS (FR-010); PIN nunca em texto/log (FR-012);
login Google obrigatório, banco por conta.

**Scale/Scope**: biblioteca de centenas a poucos milhares de livros; ~12 arquivos
novos e ~15 editados (ver Project Structure), incluindo 1 método Java no plugin nativo existente.

## Decisões Invariantes

- **D-01**: PIN guardado com PBKDF2-SHA-256 (WebCrypto), salt aleatório de 16 B,
  100 000 iterações (revisável só pelo spike T003). Nunca persistir nem logar o PIN.
- **D-02**: o estado "desbloqueado" vive **só em memória** (Zustand). App sempre
  inicia bloqueado. Nada de "desbloqueado até" persistido.
- **D-03**: a marcação é `Book.isProtected` **sem índice**; filtros em memória
  (precedente: feature 022).
- **D-04**: o registro do PIN é um singleton `id: 1` na tabela nova `bookProtection`
  (Dexie v20), por conta (um banco por uid).
- **D-05**: a garantia de bloqueio é o `BookLockGate` nas rotas `book-details` e
  `reader`; ações inline usam `guard()`. **Nenhuma** checagem de PIN dentro de
  `ReaderScreen`, `EpubViewer` ou `BookDetailsScreen` (além do botão de proteger).
- **D-06**: re-bloquear com o leitor aberto **não desmonta** o leitor (preserva
  TTS): cobre com overlay opaco e `inert`. Sem desbloqueio, os filhos nem montam.
- **D-07**: "Protegidos" é o valor `'protected'` do `LibraryFilter`, filtro fixo.
  Não é tag, nem coleção, e não é editável.
- **D-08**: espera por erros: 5 erros → 30 s × 2^(rodada−1), teto de 1 h, com base
  em `Date.now()` e persistida em `lockedUntil`. Tentativa durante a espera não é
  nem verificada.
- **D-09**: "Esqueci o PIN" prova propriedade pela **credencial de bloqueio de tela
  do Android** (`KeyguardManager`, método novo `confirmDeviceCredential` no plugin
  `NeoReaderLibrary`). Aparelho sem bloqueio de tela: aviso e confirmação
  explícita. Web: `reauthenticateWithPopup` com `prompt: 'login'`. A recuperação
  **nunca** chama `signInWithGoogle` (trocaria a sessão e recarregaria o app).
- **D-10**: proteger **não** pede PIN; remover proteção e toda ação sobre livro
  protegido exigem `requestUnlock()`.
- **D-11**: existe **um** prompt de PIN global, montado uma vez em `App.tsx`;
  `requestUnlock()` é reentrante e compartilha a Promise.
- **D-12**: um PIN correto (em qualquer fluxo, inclusive "Alterar PIN") desbloqueia
  todos os livros protegidos. "Alterar PIN" e "Desativar proteção" pedem o PIN
  **sempre**, mesmo com o app desbloqueado (`requestUnlock({ force: true })`).
- **D-15**: o re-bloqueio **nunca** toca no TTS: `lock()` só altera o flag e o leitor
  segue montado, então o `TtsPlaybackService` nativo (foreground + MediaSession)
  continua e os eventos `playbackControl` seguem tratados pelo leitor. Os controles da
  notificação/tela de bloqueio **não** passam por PIN (decisão do usuário). Tela
  apagando = sair do app = re-bloqueia, sem tolerância.
- **D-13**: "bloqueado" esconde o conteúdo do cartão/linha (autor, progresso,
  status, tags, favorito, formato, arquivo ausente) via `isConcealed(book)`. Filtros
  e busca continuam funcionando sobre os dados reais (FR-018): a pertinência a uma
  tag, coleção ou "Protegidos" não é escondida.
- **D-14**: a dedupe do import **rejeita** duplicata (erro "Este livro já está na
  biblioteca") e não reabre o livro existente; por isso "abrir com" nunca leva a
  um livro protegido. O gate é só a garantia caso isso mude.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | PASS | PASS | Este plano (arquivos afetados + tasks) precisa de OK do usuário antes do `sdd-execute`. R-001 foi decidido pelo usuário (credencial do aparelho) e está refletido aqui. |
| II. Comentários só onde o "porquê" não é óbvio | PASS | PASS | Comentar: escolha PBKDF2 e limite do PIN curto; `inert` + overlay em vez de desmontar (D-06); fechar o prompt no próximo macrotask (D-08 da research); snapshot de `Book` na rota vs registro vivo. Perfil Python: comentar `useLiveQuery`/`inert`. |
| III. Explícito antes de mágico | PASS | PASS | Um store, um gate, um hook. Sem "framework de bloqueio" genérico, sem HOC por tela, sem interface de provedor de recuperação (só a implementação pedida). |
| IV. Build limpo é a definição de "pronto" | PASS | PASS | Cada checkpoint de fase em `tasks.md` exige `npm run build` + testes da fase; a Polish roda `lint`, `test` e `build`. |
| V. Dependências novas exigem justificativa | PASS | PASS | Zero dependências novas. A credencial do aparelho usa `KeyguardManager` (API da plataforma) em vez de `androidx.biometric`, justamente para não precisar de Gradle novo. Biometria como funcionalidade do app ficou fora do escopo. |
| Restrição: schema append-only | PASS | PASS | Só `version(20)` adicionando tabela; `isProtected` é campo não indexado (precedente 022). T001 confere que a v19 ainda é a última. |
| Restrição: iframe do EPUB / sandbox | PASS | PASS | Nada injetado no iframe. O bloqueio é overlay do host e `inert` fora do iframe. |
| Restrição: local-first / plataformas | PASS | PASS | PIN e estado locais; Android e Web cobertos (D-009, research). |
| Fluxo: testar UI em browser real/aparelho | PASS | PASS | `quickstart.md` + task de verificação no aparelho (T054). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/024-protecao-livros-pin/
├── spec.md              # Saída do sdd-specify
├── plan.md              # Este arquivo (saída do sdd-plan)
├── research.md          # Fase 0 (decisões e spikes pendentes)
├── data-model.md        # Fase 1 (Book.isProtected, bookProtection, lockout)
├── quickstart.md        # Fase 1 (verificação manual)
├── tasks.md             # Saída do sdd-plan (fase de tasks)
└── history.md           # Condicional, criado pelo sdd-execute quando arquiva
```

(Sem `contracts/`: a feature não expõe nem altera API externa.)

### Source Code (repository root)

```text
NeoReader/                                  # raiz do repo (projeto único React + Capacitor)
├── src/
│   ├── App.tsx                             # EDITA: BookLockGate nas rotas, BookLockHost, rota settings-book-protection
│   ├── types/
│   │   ├── book.ts                         # EDITA: Book.isProtected
│   │   └── bookProtection.ts               # NOVO: BookProtectionRecord
│   ├── db/
│   │   ├── database.ts                     # EDITA: tabela + version(20)
│   │   ├── books.ts                        # EDITA: setBookProtected, clearAllBooksProtected
│   │   └── bookProtection.ts               # NOVO: get/save/clear do singleton
│   ├── utils/
│   │   ├── pinCrypto.ts                    # NOVO: formato do PIN + hash/verify PBKDF2
│   │   └── pinLockout.ts                   # NOVO: máquina de estados da espera (pura)
│   ├── services/
│   │   ├── BookProtectionService.ts        # NOVO: criar/verificar/substituir/desativar PIN
│   │   ├── DeviceCredentialService.ts      # NOVO: confirm() via plugin nativo (Android) → confirmed | cancelled | unsupported
│   │   └── FirebaseAuthService.ts          # EDITA: reauthenticateGoogleOnWeb() (só web; sem trocar sessão)
│   ├── store/
│   │   └── bookLockStore.ts                # NOVO: unlocked + prompt (Zustand)
│   ├── hooks/
│   │   ├── useBookLock.ts                  # NOVO: unlocked, guard(), lockNow()
│   │   ├── useCapacitorAppListener.ts      # EDITA: ignora backButton com prompt aberto
│   │   └── useLibraryCatalog.ts            # EDITA: filtro 'protected'
│   ├── components/
│   │   ├── PinPad.tsx                      # NOVO: teclado numérico + pontos
│   │   ├── PinVerifySheet.tsx              # NOVO: pedir PIN (+ espera, + Esqueci)
│   │   ├── PinSetupSheet.tsx               # NOVO: criar/alterar/redefinir (digitar 2x)
│   │   ├── BookLockHost.tsx                # NOVO: monta o prompt global + re-bloqueio
│   │   ├── BookLockGate.tsx                # NOVO: guarda das rotas book-details e reader
│   │   ├── BookLockBadge.tsx               # NOVO: cadeado fechado/aberto
│   │   ├── BookCard.tsx                    # EDITA: badge
│   │   ├── HeroBanner.tsx                  # EDITA: badge
│   │   ├── LibraryGridView.tsx             # EDITA: badge
│   │   └── QuickBookActionsSheet.tsx       # EDITA: Proteger/Remover proteção/Bloquear agora
│   ├── screens/
│   │   ├── LibraryScreen.tsx               # EDITA: chip + faixa, guard de sheets/tags/seleção, badge na linha da lista
│   │   ├── HomeScreen.tsx                  # EDITA: guard do menu "⋯"
│   │   ├── BookDetailsScreen.tsx           # EDITA: Proteger/Remover/Bloquear agora
│   │   ├── SettingsScreen.tsx              # EDITA: entrada "Livros protegidos"
│   │   └── SettingsBookProtectionScreen.tsx# NOVO: Alterar PIN / Desativar proteção
│   ├── i18n/messages.ts                    # EDITA: chaves bookLock.* em pt-BR, en, es
│   └── __tests__/                          # NOVO/EDITA: espelha src/ (ver tasks.md)
├── android/app/src/main/java/com/johnny/neoreader/
│   └── NeoReaderLibraryPlugin.java         # EDITA: confirmDeviceCredential + request code 4703
└── sdd/specs/024-protecao-livros-pin/      # documentação desta feature
```

**Structure Decision**: projeto único (React + Capacitor), sem backend. Seguimos
as convenções existentes: services como classes, store Zustand por assunto,
hooks `use*`, um arquivo = uma responsabilidade, repositório de DB por tabela em
`src/db/`, testes espelhando `src/`. `BookProtectionService` fica separado de
`src/db/bookProtection.ts` porque mistura persistência, hash e a regra de espera
(o repositório fica burro, como os demais módulos de `src/db/`).

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| (nenhuma) | | |

Nota (não é violação): mexer em `useCapacitorAppListener.ts` altera um hook
compartilhado por ~15 telas. Está isolado por teste próprio (T017, implementação em T011) e justificado
em D-008 da `research.md`.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Unitário (maior parte)**: `pinLockout`, `pinCrypto`, `bookLockStore`,
  `BookProtectionService` (com `@/db/database` mockado).
- **Componente**: `PinPad`, `PinVerifySheet`, `PinSetupSheet`, `BookLockGate`
  (nunca monta filhos bloqueado; re-bloqueio mantém montado e `inert`),
  `QuickBookActionsSheet`, `LibraryScreen` (chip, seleção).
- **Integração**: `App.test.tsx` — abrir livro protegido pede PIN, cancelar
  volta, PIN correto abre.
- **Regressão (FR-020)**: livros não protegidos renderizam e abrem como antes
  (testes existentes de `BookCard`, `LibraryGridView`, `QuickBookActionsSheet`
  devem seguir verdes sem edição).
- **Manual (inevitável)**: re-bloqueio em segundo plano com TTS tocando,
  botão voltar com prompt aberto, credencial de tela do aparelho real — em
  `quickstart.md`.

Comandos-base:

```powershell
npx tsc --noEmit                         # checagem de tipos
npm run lint
npm test                                 # suíte Vitest completa
npx vitest run src/__tests__/utils/pinLockout.test.ts   # um arquivo
npx vitest run -t "BookLockGate"         # por nome
npm run build                            # tsc -b + bundle (definição de pronto)
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fundação (Dexie v20, utils, service, store, i18n) | Concluída e testada |
| US1: bloqueio, gate por rota, cadeado, ocultação | Concluída (código, testes e validação no aparelho) |
| US2A: Esqueci o PIN (credencial do aparelho / Google na web) | Concluída (validada no aparelho) |
| US2B: Alterar PIN e Desativar proteção | Concluída |
| US3: filtro "Protegidos" e seleção múltipla | Concluída |
| Gates | lint limpo, 176 arquivos / 1855 testes passando, build ok, sem dependência nova |
| Convergência (Fase 7) | Concluída: ProgressCard e Perfil ocultam dados de livro bloqueado; pluralização do teclado; chaves i18n sem uso removidas |
| Pendências manuais | Nenhuma. Ressalva: o tempo do PBKDF2 não foi medido em ms (T003 validada de forma qualitativa) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Resolvido: a confirmação por conta Google no Android era fraca (o plugin não aceita `customParameters` para Google, então bastava um toque no seletor de contas). | Era ALTO. | Resolvido: o usuário escolheu a **credencial de bloqueio de tela do aparelho** (D-09, spec revisada). **Risco residual**: quem conhece a senha de tela redefine o PIN (aceito na spec). **Risco novo**: `KeyguardManager.createConfirmDeviceCredentialIntent` em `targetSdk 36` e na variedade de OEMs; coberto pelo spike T059 no aparelho. |
| R-002 | Re-bloqueio ao ir para segundo plano dispara também com o seletor de arquivos (importar livro) e com a tela do sistema da credencial do aparelho. | MÉDIO: usuário digita o PIN de novo depois de importar. | Aceito (spec: sem tolerância). Se incomodar, avaliar tolerância curta em outra feature. O prompt aberto sobrevive ao re-bloqueio (data-model). |
| R-003 | `backButton` dispara em todos os listeners: prompt aberto sobre uma tela faria a tela navegar. | MÉDIO | Resolvido: D-008 da research: guarda em `useCapacitorAppListener` + fechamento adiado do prompt; teste T017 e passo manual no `quickstart.md`. |
| R-004 | Rota guarda **snapshot** de `Book`; proteger depois deixaria o gate desatualizado. | ALTO se ignorado (livro "protegido" abre sem PIN pela rota antiga) | Resolvido: gate lê o registro vivo por `id` (`useLiveQuery`). Teste explícito em T033. |
| R-005 | Feature 023 (seleção múltipla) ainda em execução e toca os mesmos arquivos: `LibraryScreen.tsx`, `useLibrarySelection.ts`, `BulkBookActionsSheet`. | MÉDIO: conflito de merge e regra FR-017 sobre código em mudança. | Resolvido: o código da 023 já estava commitado (restam só validações manuais dela), então a US3 foi implementada sem conflito. Estado em 2026-10-12: 023 `Em Execução` (31/42) e `version(19)` ainda é a última do Dexie. T055 também toca `LibraryScreen.tsx`/`LibraryGridView.tsx`: alinhar com a 023 antes. |
| R-006 | PBKDF2 pode ser lento em Android antigo. | BAIXO | Resolvido: T003 validada no aparelho de forma qualitativa (sem lentidão relatada; tempo em ms não medido). Fallback para 50 000 iterações segue disponível; `iterations` fica salvo por registro. |
| R-007 | Vocabulário e notificação de mídia do TTS expõem título/frases de livro protegido. | BAIXO (aceito) | Spec: fora de escopo (Assumptions). Não "consertar" sem nova decisão. |
| R-008 | Perda do IndexedDB pela WebView leva a proteção embora junto com os livros. | BAIXO | Aceito: PIN e livros vivem no mesmo banco, então não há livro protegido sem registro. |
| R-009 | Relógio do aparelho alterado encurta a espera. | BAIXO | Aceito (spec, Assumptions). |
| R-010 | Espera dobrando sem teto chegaria a horas. | BAIXO | Resolvido: teto de 1 h (D-08), registrado no spec (FR-011 e Assumptions). |
| R-011 | PIN de 4 a 6 dígitos é fraco contra quem extrair o banco. | BAIXO (aceito) | Limite assumido pelo spec (privacidade casual). Documentado em D-001 da research. |
| R-012 | Controles de mídia (notificação/tela de bloqueio) funcionam sem PIN com o livro re-bloqueado: quem está com o aparelho pode retomar ou pular o áudio; a notificação mostra título, capa e capítulo. Com a tela apagando a cada uso, o PIN é pedido toda vez que o app reabre. | MÉDIO (aceito) | Decisão do usuário (D-15). Se a fricção do PIN ao voltar incomodar, a alternativa já avaliada é uma tolerância curta, que muda a spec (FR-009). "Não pausa o TTS" coberto por teste em T034. |
| R-013 | O store de bloqueio ganhou `setup` e `requestPinSetup` (o plano só previa `prompt`). | BAIXO | Resolvido: decisão registrada e confirmada no código: a criação do PIN passa pelo store para a guarda do voltar tratar os dois prompts do mesmo jeito (`isBookLockOverlayOpen`). |
| R-014 | FR-017 (recusar seleção de livro bloqueado) estava marcada como Release 2 em tasks.md, mas sem ela a ação em lote exclui/move livro bloqueado sem PIN. | MÉDIO (corrigido) | Resolvido: implementada junto com a US1 (Fase 3). A marca (R2) das tasks T047 ficou só histórica. |
| R-015 | Hook `useBookLock` é importado por várias telas e puxava plugins nativos no import (quebrou HomeScreen.test). | BAIXO | Resolvido: registro preguiçoso do plugin e import dinâmico do Firebase. |
| R-016 | O mapeamento inicial de superfícies que listam livros deixou de fora o `ProgressCard` ("Continuar lendo") e o histórico do Perfil, e o teste manual no aparelho não pegou. | MÉDIO (corrigido) | Resolvido na Fase 7 (T060, T061). Lição: ao ocultar dados num componente, buscar todos os usos de `useBookCoverUrl(` e de `book.author`/`percentage` antes de dar a cobertura por completa. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-12 | Fase 1 (Setup) | T001/T002 por leitura: v19 era a última, 023 commitada, minSdk 24, request code 4703 livre | T003 (aparelho) |
| 2026-10-12 | Fase 2 (Foundational) | v20, repositório, pinLockout, pinCrypto, service, store (com setup), i18n, guarda do voltar | nenhuma |
| 2026-10-12 | Fase 3 (US1) | Gate por rota, prompts, cadeado, ocultação de dados extras, ações; FR-017 antecipado | T054 no aparelho |
| 2026-10-12 | Fase 4 (US2) | Método nativo, DeviceCredentialService, reautenticação web, Esqueci o PIN, tela de Configurações | T059 no aparelho |
| 2026-10-12 | Fase 5 (US3) | Filtro Protegidos, chip, faixa, reset do filtro | nenhuma |
| 2026-10-12 | Fase 6 (Polish) | FR-019 e FR-012 verificados; lint + 1848 testes + build verdes; Java compila | T003, T054, T059 |
| 2026-10-13 | Fase 7 (Convergence) | T060–T066: ProgressCard e HistoryRow do Perfil ocultam dados de livro bloqueado; `pad.status` pluralizado; 4 chaves i18n removidas; 1855 testes e build verdes | rodar `sdd-converge` |
| 2026-10-13 | Validação no aparelho | APK instalado no Galaxy SM-S911B; T054 e T059 executadas pelo usuário com sucesso; T003 qualitativa | nenhuma |

**PRÓXIMO**: rodar `sdd-converge` outra vez (a Fase 7 fechou os achados CF-01 a CF-04). Se convergir limpo, ele marca `Convergida` e sincroniza o `README.md`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- Bloqueio: `src/store/bookLockStore.ts`, `src/hooks/useBookLock.ts`, `src/components/BookLockGate.tsx`, `src/components/BookLockHost.tsx`
- Prompts: `src/components/PinVerifySheet.tsx`, `src/components/PinSetupSheet.tsx`, `src/components/PinPad.tsx`
- Regras e dados: `src/services/BookProtectionService.ts`, `src/utils/pinCrypto.ts`, `src/utils/pinLockout.ts`, `src/db/bookProtection.ts`, `src/db/database.ts` (v20)
- Recuperação: `src/services/DeviceCredentialService.ts`, `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java` (`confirmDeviceCredential`), `src/services/FirebaseAuthService.ts` (`reauthenticateGoogleOnWeb`)
- Convergência: `src/components/ProgressCard.tsx`, `src/screens/ProfileScreen.tsx` (`HistoryRow`), `src/i18n/messages.ts` (`bookLock.pad.status.one/.many`)
- Integração: `src/App.tsx`, `src/screens/LibraryScreen.tsx`, `src/screens/HomeScreen.tsx`, `src/components/QuickBookActionsSheet.tsx`, `src/screens/BookDetailsScreen.tsx`, `src/screens/SettingsBookProtectionScreen.tsx`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- A Promise do prompt de PIN vive FORA do estado do Zustand (`pendingPrompt`/`pendingSetup`). Todo teste que abre prompt precisa chamar `settlePrompt(false)`/`settleSetup(false)` no `beforeEach`; só `setState` deixa a Promise do teste anterior pendurada e o próximo `requestUnlock` nem abre o prompt.
- Testes que renderizam o `App` mockam `@/components/ui`: o mock precisa exportar `Button` (o `BookLockHost` monta os prompts) e mockar `dexie-react-hooks`/`BookProtectionService`.
- `BookLockGate` mantém SEMPRE o wrapper `<div className="contents">`. Trocar por fragmento quando o livro não é protegido remontaria o leitor e interromperia o TTS.
- `DeviceCredentialService` registra o plugin preguiçosamente e `BookProtectionService` importa o Firebase dinamicamente. Voltar a fazer isso no import quebra testes que mockam `@capacitor/core` sem `registerPlugin` (ex.: HomeScreen.test).
- O método nativo `confirmDeviceCredential` só existe depois de reconstruir o APK (`npm run android:run`). APK antigo cai em `unsupported`.
- PinVerifySheet: a leitura da espera ao montar usa `Math.max` com a espera já registrada, para não sobrescrever um bloqueio recém-aplicado pela verificação.


## Resultado Final

**Convergida em 2026-10-13** (`sdd-converge`, 2ª passada, sem achados). Seção anexada pelo skill; o restante deste arquivo não foi reescrito.

### O que foi construído

Proteção de livros por PIN único do app (4 a 6 dígitos), com:

- **Bloqueio por rota**: `BookLockGate` em `book-details` e `reader`; re-bloqueio ao ir para segundo plano sem desmontar o leitor, então o TTS segue e os controles da notificação continuam funcionando.
- **Livro bloqueado mostra só capa, título e cadeado** em cartão, hero, "Continuar lendo", grade, lista e histórico do Perfil.
- **Espera por PIN errado**: 5 erros → 30 s, dobrando, teto de 1 h, persistida.
- **Esqueci o PIN** pela credencial de tela do Android (`KeyguardManager`, método nativo `confirmDeviceCredential`); aviso e confirmação explícita sem bloqueio de tela; Google com senha na web.
- **Configurações > Livros protegidos**: alterar e desativar, pedindo o PIN atual sempre.
- **Biblioteca**: filtro fixo "Protegidos" com Desbloquear / Bloquear agora; seleção múltipla recusa livro bloqueado.
- Dexie `version(20)` (só adiciona `bookProtection`), `Book.isProtected` sem índice, nenhuma dependência nova, PIN só no dispositivo.

### Desvios em relação ao plano original

- **Recuperação**: a spec original pedia confirmar a conta Google; foi trocada, por decisão do usuário após o plano, pela credencial de tela do aparelho (a confirmação Google no Android é um toque no seletor de contas). R-001.
- **Store**: ganhou `setup`/`requestPinSetup` e `requestUnlock({ force })`, que o plano não previa (R-013, D-12).
- **FR-017** (recusar seleção de livro bloqueado) foi antecipado da Release 2 para a Fase 3 (R-014).
- **Registro preguiçoso do plugin e import dinâmico do Firebase** em `DeviceCredentialService`/`BookProtectionService`, para o hook não puxar plugins nativos em todas as telas (R-015).
- **Ocultação ampliada na convergência**: `ProgressCard` e histórico do Perfil não estavam no mapeamento inicial (R-016); a Fase 7 também pluralizou `bookLock.pad.status` e removeu 4 chaves i18n sem uso.
- **"Abrir com"** não reabre livro protegido: o import rejeita duplicata (D-14), então a premissa original da spec foi corrigida.

### Limites conhecidos (aceitos)

- Tela apagando conta como sair do app e o PIN é pedido ao voltar, sem tolerância (R-002, R-012).
- Vocabulário e título/capa/capítulo na notificação do TTS continuam visíveis (R-007).
- Quem conhece a senha de tela do aparelho redefine o PIN (R-001); o PIN curto é fraco contra quem extrair o banco (R-011).
- O custo do PBKDF2 foi validado só qualitativamente; o tempo em ms não foi medido (R-006).

### Verificação final

`npm run lint`, `npx tsc --noEmit` e `npm run build` limpos; 176 arquivos / 1855 testes passando; `quickstart.md` e a recuperação validados no aparelho (Galaxy SM-S911B, Android 16). `README.md` sincronizado (filtros, proteção por PIN, Configurações, schema v20 e tabela `bookProtection`).
