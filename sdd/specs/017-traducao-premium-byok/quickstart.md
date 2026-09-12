# Quickstart: Tradução Premium BYOK (DeepL, OpenAI, Google)

## Pré-requisitos

- `npm install` já rodado.
- Pelo menos 1 chave de API real de teste (DeepL free tier é suficiente
  pra validar a User Story 1 — free tier tem cota, então não gasta nada
  real pra um teste pontual). OpenAI e Google exigem billing habilitado
  na conta pra sequer emitir uma chave funcional — se não houver chave
  disponível pra algum provedor, valide só o fluxo de erro (`invalid`)
  pra ele e documente a limitação no relatório da fase Test.
- Um EPUB de teste já importado na biblioteca.

## Checagens automatizadas

```powershell
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npm test
npm run build
```

## Cenário ponta a ponta (User Story 1 — DeepL)

1. `npm run dev`, abrir o app no browser.
2. Configurações > Tradução > DeepL > colar uma chave DeepL real > "Testar
   chave" — esperado: badge "Conectado", chave salva.
3. Abrir um livro > tela de detalhes > seletor de provedor de tradução >
   selecionar "DeepL".
4. Abrir o livro no leitor, selecionar um trecho, tocar em traduzir —
   esperado: tradução vem da DeepL (comparar com o texto que o MyMemory
   geraria pro mesmo trecho, devem diferir em nuance).
5. Voltar em Configurações > Tradução > invalidar a chave (colar uma
   chave errada e testar, ou apagar e salvar vazio) > voltar pro livro >
   tocar em traduzir de novo — esperado: cai pro MyMemory sem erro visível
   na leitura.
6. Abrir a tela de detalhes do livro de novo — esperado: indicação de que
   o provedor efetivo é MyMemory, mesmo com "DeepL" marcado como
   selecionado (FR-009).

## Cenários de erro a confirmar manualmente (FR-007)

- Timeout (throttle de rede no DevTools pra forçar) → tradução ainda
  aparece, via MyMemory, sem trava perceptível na UI.
- Cancelamento: selecionar um trecho, tocar em traduzir, imediatamente
  selecionar outro trecho antes da resposta voltar — esperado: sem
  travar, sem "vazar" a tradução do trecho anterior pro novo.

## Checklist cross-cutting (constitution)

- [ ] `npm run build` limpo (tipo + bundling) — Princípio IV.
- [ ] Nenhuma chave de API em texto plano em nenhum evento de
      `DiagnosticsLogger` (SC-004) — inspecionar console/`sanitizeDiagnosticsDetails`
      com uma chave de teste.
- [ ] Testado num browser real (não só jsdom) — Fluxo de Desenvolvimento
      da constitution pra mudanças de UI/leitor.
- [ ] Nenhuma dependência nova adicionada sem aprovação prévia (Princípio V) —
      esta feature não deveria precisar de nenhuma (só `fetch` nativo).
