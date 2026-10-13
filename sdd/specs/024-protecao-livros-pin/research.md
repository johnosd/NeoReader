# Research: Proteção de livros com PIN

**Slug**: `024-protecao-livros-pin` | **Date**: 2026-10-12

Itens com incerteza técnica real. Cada um tem Decisão / Justificativa / Alternativas.
Os itens marcados **PENDENTE DE SPIKE** têm uma task em `tasks.md` (Phase 1) e
uma decisão provisória que o spike pode revisar.

## D-001: Como guardar o PIN

**Decisão**: PBKDF2-SHA-256 via WebCrypto (`crypto.subtle`), salt aleatório de
16 bytes, 100 000 iterações, saída de 256 bits. Guardar `pinHash`, `salt` e
`iterations` (base64) no registro `bookProtection`.

**Justificativa**: não adiciona dependência (Constituição V) e `crypto.subtle`
já é usado no projeto (`BookImportService.ts`, hash do arquivo), então o
ambiente de teste e a WebView já suportam. Guardar `iterations` junto permite
subir o custo no futuro sem invalidar PINs antigos.

**Alternativas consideradas**:
- SHA-256 simples com salt: rejeitado, trivial de varrer (10⁴–10⁶ combinações).
- bcrypt/argon2 em JS ou WASM: rejeitado, exige dependência nova e ganho
  irrelevante para um espaço de 4–6 dígitos (ver limite em D-002).
- Guardar em Capacitor Preferences (SharedPreferences): rejeitado, o banco já é
  por conta (`db.name`) e o PIN precisa viver e morrer junto com os livros.

**Limite assumido** (spec, Assumptions): com ≤ 1,1 milhão de PINs possíveis, quem
extrair o banco consegue varrer o espaço offline mesmo com PBKDF2. A proteção é
contra uso casual do app, não contra análise forense. Não tentar "consertar"
isso aumentando iterações.

## D-002: Custo do PBKDF2 no aparelho — validado qualitativamente (T003)

**Decisão provisória**: 100 000 iterações.

**Justificativa**: ordem de grandeza segura para uma WebView Android intermediária
(dezenas a poucas centenas de ms). O desbloqueio roda uma vez por sessão.

**Resultado (2026-10-13)**: o usuário validou o fluxo no Galaxy SM-S911B (Android 16) sem relatar lentidão. O tempo em ms não foi medido; mantidas as 100 000 iterações.

**Critério do spike**: se medir mais de ~300 ms num aparelho intermediário,
reduzir para 50 000. Registrar o número medido aqui.

## D-003: Onde fica o estado "desbloqueado"

**Decisão**: só em memória, num store Zustand (`src/store/bookLockStore.ts`),
nunca em IndexedDB/localStorage.

**Justificativa**: o spec exige que o app sempre inicie bloqueado (FR-008) e
re-bloqueie ao sair (FR-009). O estado em memória morre sozinho com o
processo/página e na troca de conta (que já faz `window.location.reload()`).

**Alternativas**: persistir um "desbloqueado até" com timestamp. Rejeitado:
contraria o spec (sem tolerância) e cria um estado que sobrevive a crash.

## D-004: Prova de propriedade para "Esqueci o PIN" — validado no aparelho (T059)

**Contexto**: confirmar a conta Google no Android não serve. O plugin do
Firebase (v8.2.0) **não** aceita `customParameters` para Google no Android (a doc
lista só Apple, GitHub, Microsoft, Twitter e Yahoo), então não dá para forçar a
senha: quem está com o aparelho desbloqueado e a conta já adicionada confirma
com um toque no seletor de contas e redefine o PIN. Além disso,
`FirebaseAuthentication.signInWithGoogle` **troca a sessão** se o usuário
escolher outra conta, e `App.tsx` reage à mudança de uid com
`window.location.reload()`. Por isso o usuário escolheu a credencial de
bloqueio de tela do aparelho (spec, Clarifications, revisão de 2026-10-12).

**Decisão**: serviço `DeviceCredentialService.confirm()` com resultado tipado
`'confirmed' | 'cancelled' | 'unsupported'`:
- **Android**: novo método `confirmDeviceCredential` no plugin nativo existente
  `NeoReaderLibraryPlugin.java`, usando `KeyguardManager`:
  1. `isDeviceSecure()` falso, ou `createConfirmDeviceCredentialIntent(...)`
     nulo ⇒ `{ supported: false }` (aparelho sem bloqueio de tela).
  2. Senão, `startActivityForResult` com um request code novo (4703, a incluir em
     `requestCodes` do `@CapacitorPlugin`); `RESULT_OK` ⇒ `{ supported: true,
     confirmed: true }`, qualquer outro ⇒ `confirmed: false`.
  É API da plataforma (minSdk 24 cobre `isDeviceSecure`, API 23), **sem
  dependência nova**, e segue o padrão `saveCall` + `handleOnActivityResult` que o
  plugin já usa para o seletor de arquivos. O lado TS faz o seu próprio
  `registerPlugin('NeoReaderLibrary')`, como `NativeSystemUiService` e
  `OpdsCredentialStore` já fazem, e checa `typeof fn === 'function'` (convenção
  do arquivo para APKs antigos).
- **Aparelho sem bloqueio de tela (`unsupported` no Android)**: a UI avisa que
  não há como confirmar a identidade e exige confirmação explícita. Sem lock de
  tela, qualquer pessoa já abre o aparelho, então a Google não acrescentaria
  proteção real.
- **Web**: `reauthenticateWithPopup(auth.currentUser, provider)` do Firebase JS
  SDK com `prompt: 'login'` (força digitar a senha). Compara o uid do resultado
  com o atual e nunca troca a sessão. Web é alvo secundário do projeto.

**O que deixou de ser necessário**: o spike do `skipNativeAuth` do plugin do
Firebase e o código que decodificava `idToken`. A recuperação **não** chama mais
`signInWithGoogle` no Android.

**Spike (T059) no aparelho** (a T002 é só a checagem estática de request code e minSdk): (a) com bloqueio de tela configurado, o intent não
é nulo e a tela do sistema abre; (b) credencial correta devolve `RESULT_OK`;
(c) voltar/errar devolve cancelado; (d) sem bloqueio de tela, devolve
`supported: false`; (e) o app ir para segundo plano durante a tela do sistema
não derruba o fluxo (ver D-003 e data-model: `lock()` não toca no prompt).

**Resultado (2026-10-13)**: validado pelo usuário no Galaxy SM-S911B (Android 16) com o APK reconstruído; `KeyguardManager.createConfirmDeviceCredentialIntent` funcionou com `targetSdk 36`.

**Limite assumido** (spec, Assumptions): quem conhece a senha de tela do
aparelho redefine o PIN. Protege contra quem pegou o celular desbloqueado.

**Alternativas**:
- Código de recuperação mostrado na criação do PIN: fator real fora do aparelho,
  sem dependência, mas exige o usuário guardar o código. Rejeitado pelo usuário.
- `BiometricPrompt` com `DEVICE_CREDENTIAL` (androidx.biometric): exigiria
  dependência Gradle nova (Constituição V); `KeyguardManager` dispensa.
- Confirmar conta Google: ver Contexto, rejeitado.

## D-005: Arquitetura do bloqueio (onde a checagem acontece)

**Decisão**: duas peças, nenhuma dentro de `ReaderScreen`/`EpubViewer`/`BookDetailsScreen`:
1. **`BookLockGate`** em `App.tsx`, envolvendo as rotas `book-details` e `reader`.
   É a garantia: toda abertura de livro passa por uma dessas duas rotas.
   Conferido em `BookImportService.ts`: importar arquivo duplicado **lança**
   "Este livro ja esta na biblioteca" e não devolve o livro existente, então o
   intent "abrir com" nunca reabre um livro protegido; o gate cobre o caso de
   isso mudar.
2. **`guard(book)`** (hook `useBookLock`) nos pontos de ação que não navegam:
   folha de ações rápidas, atalho de tags, seleção múltipla.

**Justificativa**: `App.tsx` é um switch sobre `stack[last]` e toda abertura
cai em `book-details` ou `reader` (confirmado na leitura). Uma checagem por
rota dá cobertura total com 2 pontos de integração, em vez de espalhar o PIN em
telas de 2 000+ linhas.

**Detalhe importante**: a rota carrega um **snapshot** de `Book` (`current.book`),
que fica velho se o usuário protege o livro depois. O gate consulta o registro
vivo por `id` (`useLiveQuery`), nunca o snapshot.

**Alternativas**: interceptar no `push()` antes de navegar. Rejeitado como
mecanismo principal: não cobre re-bloqueio com a tela já aberta (FR-010) e
duplicaria a lógica. Cancelar o PIN no gate faz `pop()`, que volta para a tela
anterior, o que satisfaz "permanece onde estava".

## D-006: Re-bloquear sem desmontar o leitor

**Decisão**: ao re-bloquear com um livro já revelado, o gate **mantém os filhos
montados**, cobre com um fundo opaco (`fixed inset-0`, acima do `BottomSheet`
que usa `z-[2000]`/`z-[2001]`) e aplica `inert` + `aria-hidden` aos filhos.

**Justificativa**: desmontar `ReaderScreen` interromperia o áudio TTS, o que o
FR-010 proíbe. `inert` já é usado no projeto (`BottomSheet`, `LibraryScreen`).

**Regra**: o gate só monta os filhos **depois** do primeiro desbloqueio da
montagem. Com o app bloqueado, `ReaderScreen` nem chega a carregar o livro.

## D-007: Disparo do re-bloqueio

**Decisão**: `useCapacitorAppStateChange` chamando `lock()` quando
`isActive === false`. Re-bloqueia na ida para segundo plano, não na volta, para
não haver quadro de conteúdo exposto ao retornar.

**Justificativa**: o `@capacitor/app` na web também dispara `appStateChange`
via `visibilitychange` (conferido em `node_modules/@capacitor/app/dist/esm/web.js`),
então Android e Web ficam cobertos pelo mesmo hook.

## D-008: Botão voltar com o PIN aberto

**Contexto**: no Capacitor, **todos** os listeners de `backButton` disparam. As
telas tratam seus sheets locais no próprio handler (ex.: `LibraryScreen`,
linhas ~166-176). Um prompt global aberto sobre a Biblioteca faria o voltar
cancelar o prompt **e** o handler da tela navegar para a Home.

**Decisão**: `useCapacitorAppListener('backButton')` passa a ignorar o evento
enquanto o prompt de PIN estiver aberto (consulta o store). O prompt usa um
caminho próprio que não é ignorado e **fecha adiando para o próximo macrotask**
(`setTimeout(0)`), para que os outros listeners do mesmo evento ainda vejam o
prompt aberto. Comentar o porquê no código (Constituição II).

**Alternativas**: cada tela consultar o store no próprio handler. Rejeitado:
espalha a regra por ~15 telas e é fácil esquecer.

## D-009: Onde guardar a marcação por livro

**Decisão**: campo `isProtected?: boolean` em `Book`, **sem índice**, filtrado em
memória.

**Justificativa**: precedente direto na feature 022 (campos de PDF em `Book`,
"não indexados, sem novo Dexie version()"). `useLibraryCatalog` e as telas da
Home já carregam a lista inteira com `toArray()`, então um índice não ganha
nada.
