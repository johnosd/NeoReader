# Quickstart: Renovação Silenciosa do Token do Google Drive e Sincronização Inline pelo Ícone de Bookmark

## Pré-requisitos

- `npm install` já rodado.
- Conta Pro (entitlement `NeoReader Pro` ativo) — sync é recurso Pro.
- Device Android real (`adb devices` conectado) — o comportamento
  silencioso-vs-visível do seletor de conta Google só se comprova de
  verdade no device nativo, `npm run android:run`.

## Checagens automatizadas

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Todos os quatro devem passar sem erro.

## Cenário 1 — Renovação silenciosa (US1) — ⚠️ OBSOLETO

> **Não siga este cenário.** O comportamento que ele manda verificar nunca
> existiu: não há renovação silenciosa do token do Drive nesta versão do
> plugin, e o retry-once que a US1 introduziu foi removido pelo bug
> `sdd/bugs/app-pedindo-login-google-muita-frequencia/` (2026-09-07).
> Hoje o esperado é o oposto: com o token expirado, o sync **falha em
> silêncio** e o status vai para `permission-error`, sem pedir login — só o
> botão "Reconectar" em Configurações abre a tela do Google.
> Ver "Revisão pós-implementação" em `plan.md`. O Cenário 2 (US2) segue válido.


1. Logar como Pro, conectar o Google Drive normalmente uma vez (Configurações
   > Sincronização na Nuvem, ou aceitar o consentimento no próprio login).
2. Forçar o token a expirar: ou esperar ~55min de uso real, ou (mais rápido)
   ajustar manualmente `neoreader:drive-token-expiry` no localStorage do
   WebView pra uma data no passado (via `adb shell` + inspeção remota, ou
   temporariamente reduzindo `DRIVE_TOKEN_TTL_MS` em
   `FirebaseAuthService.ts` só pra este teste local, revertendo depois).
3. Com o token "expirado", criar um bookmark novo, avançar a leitura, ou
   adicionar uma palavra ao vocabulário.
4. **Esperado**: a sincronização completa normalmente (verificável em
   Configurações > Sincronização na Nuvem, status "Conectado"), **sem**
   nenhum toque manual em "Conectar Google Drive" e, na maioria dos casos,
   sem nenhum seletor de conta aparecer na tela (já que o escopo já foi
   concedido antes).

## Cenário 2 — Ícone de bookmark inline (US2)

1. Com o token do Drive já expirado/ausente (ou usando uma conta que nunca
   conectou o Drive), abrir um livro na tela de Detalhes → aba Marcações.
2. Criar um bookmark novo. **Esperado**: o ícone de nuvem aparece cinza
   (pendente).
3. Tocar no ícone de nuvem desse bookmark.
4. **Esperado**: o ícone mostra um estado de "sincronizando" (spinner) por
   um instante; se nunca conectou antes, o seletor de conta Google abre
   nesse momento (mesmo fluxo do botão de Configurações, só que disparado
   daqui). Ao final, o ícone atualiza pra verde (sincronizado) ou vermelho
   (erro real, ex: sem internet).
5. Tocar num ícone já verde (sincronizado): **esperado** nada acontece —
   não é uma ação.

## Cenário 3 — Consistência entre os dois pontos de entrada (US3)

1. Reconectar pelo ícone de um bookmark (Cenário 2).
2. Abrir Configurações > Sincronização na Nuvem.
3. **Esperado**: status já aparece "Conectado", sem precisar tocar em nada
   nessa tela.
4. Repetir o inverso: reconectar pelo botão de Configurações, voltar pra
   tela de Detalhes de um livro com bookmark antes pendente.
5. **Esperado**: o ícone reflete o novo estado na próxima vez que a tela
   carregar/reavaliar aquele bookmark.

## Checklist cross-cutting (constitution)

- [ ] `npm run build` limpo (tipos + bundling).
- [ ] `npm run lint` sem novos warnings/erros.
- [ ] `npm test` verde, incluindo os testes novos de retry/coalescing/ícone.
- [ ] Nenhuma dependência nova em `package.json`.
- [ ] Testado num device Android real (não só testes automatizados) —
      corretude de feature, não só de código, especialmente o
      comportamento do seletor de conta Google.
