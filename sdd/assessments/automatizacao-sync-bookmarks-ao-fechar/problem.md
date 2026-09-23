# Assessment Problem: Automatização do sync de bookmarks ao fechar

- **Slug**: automatizacao-sync-bookmarks-ao-fechar
- **Criado**: 2026-09-23
- **Explora**: não rodada (a evidência relevante já estava documentada em 2
  bugfixes anteriores e na revisão da feature 005 — resumida abaixo)

## Contexto já existente (não é uma ideia nova)

Este fluxo já passou por **dois ciclos de bugfix** em setembro:

1. `sdd/bugs/sincronizar-bookmarks-automaticamente-ao-fechar-livro/`
   (2026-09-10, `verified`) — `handleBack` do `ReaderScreen` passou a
   chamar `scheduleBookmarkDriveSync` quando há bookmark com
   `syncedAt == null`. **O sync automático e invisível ao fechar já existe**
   para o caso em que o token do Drive está válido.
2. `sdd/bugs/sync-bookmarks-nao-acontece-ao-fechar/` (2026-09-11,
   `partial`) — quando o status global está em `permission-error`,
   `scheduleBookmarkDriveSync` é no-op silencioso
   (`BookmarkDriveSyncService.ts:46`). Por decisão do usuário, o
   `handleBack` passou a mostrar o toast
   `reader.bookmarkSyncPendingNotice` ("Bookmark salvo localmente.
   Reconecte o Google Drive em Configurações para sincronizar.") via
   `App.tsx` (`ReaderScreen.tsx:1150-1151`). **Esse é o "aviso de erro"
   que a ideia quer remover.**

Ou seja: o aviso só aparece exatamente no cenário em que um sync
automático **não consegue** acontecer.

## A restrição técnica que define o problema

`permission-error` = token do Drive ausente/expirado. Fatos do código:

- O token de acesso do Drive vive ~55 min (`DRIVE_TOKEN_TTL_MS`,
  `FirebaseAuthService.ts:43`), sem refresh token.
- **Não há renovação silenciosa no Android**: `@capacitor-firebase/authentication`
  usa `requestOfflineAccess(clientId, forceCodeForRefreshToken=true)`
  hardcoded, e toda renovação abre seletor de conta + tela de
  consentimento (`FirebaseAuthService.ts:198-205`; revisão da feature 005,
  `sdd/specs/005-sync-drive-inline/plan.md:322-366`).
- Tentar renovar a partir de background já causou o bug
  `app-pedindo-login-google-muita-frequencia` — por isso
  `GoogleDriveAppDataService` nunca renova sozinho e
  `refreshDriveToken({ userInitiated: true })` só é chamado por ação
  explícita (Settings > Sync e ícone de nuvem em `BookDetailsScreen`).
- Consequência prática (inferência do código, **ASSUMPTION** não medida
  em device): qualquer sessão de leitura que comece mais de ~1h depois do
  último login/reconexão cai em `permission-error` no primeiro sync —
  logo, o toast tende a aparecer com frequência, não como exceção.

## Problem Statement

O sync de bookmarks no Android depende de um token do Drive que expira em
~1h e não pode ser renovado sem uma tela de consentimento do Google; por
isso, na maior parte das sessões, o bookmark não sincroniza sozinho e o
usuário recebe um aviso que o obriga a reconectar manualmente. O problema
real não é o aviso — é a falta de um caminho de sync que funcione sem
interação depois que o token expira.

## Usuários / Partes Afetadas

- **Usuário Pro com sync de Drive** — vê um toast de "erro" ao fechar o
  livro com frequência, precisa ir em Configurações/Marcações reconectar;
  percepção de que o sync "não funciona".
- **Usuário Pro que ignora o aviso** — bookmarks ficam só locais; perde-os
  se trocar de aparelho/reinstalar sem reconectar antes.
- **Outros syncs com Drive (progresso, vocabulário)** — mesma restrição de
  token (ASSUMPTION: mesmo `GoogleDriveAppDataService`), então qualquer
  solução de raiz beneficia todos.

## Goals

- Fechar o livro não mostra aviso de erro no fluxo normal de uso.
- Bookmark pendente sincroniza sem o usuário ter que ir a Marcações ou
  Configurações tocar em nada.
- Nenhuma tela de consentimento/login do Google aparece sem ação explícita
  do usuário (invariante herdado do bug `app-pedindo-login-google-muita-frequencia`).

## Non-Goals

- Mudar o formato/protocolo do sync de bookmarks no Drive
  (`BookmarkDriveSyncModel`).
- Sync em background com app fechado (WorkManager etc.).
- Mexer no sync de highlights/progresso/vocabulário **nesta** ideia — a
  menos que a solução de raiz (token silencioso) seja escolhida, e aí vira
  outra feature maior.
- Abrir `refreshDriveToken({ userInitiated: true })` a partir do
  fechamento do leitor.

## Success Metrics

- % de fechamentos de leitor com bookmark pendente que terminam em
  `bookmark.sync.success` (via `DiagnosticsLogger`) sem nenhum toque do
  usuário — hoje desconhecido; alvo depende da abordagem (≈100% só com
  token silencioso).
- Zero ocorrências de `drive.token.refresh.*` disparadas sem ação do
  usuário (não regredir o bug de login frequente).
- Toast `reader.bookmarkSyncPendingNotice` deixa de aparecer no uso
  normal (ou deixa de existir).

## Cost of Inaction

Baixo em dados (o bookmark nunca se perde localmente; reconectar resolve),
médio em percepção: o usuário Pro paga por um sync que, na prática,
precisa de reconexão manual a cada sessão longa, e é lembrado disso com um
aviso de erro toda vez que fecha um livro. Risco real de perda só em troca
de aparelho sem reconectar.
