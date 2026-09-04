# Quickstart: Liberar recursos do leitor EPUB ao trocar de livro

## Pré-requisitos

- `npm install` já rodado.
- Para a verificação manual opcional (SC-004): device Android conectado (`adb devices`) com o app instalado, ou o app rodando em `npm run dev` (web) com DevTools do navegador.

## Checagens automatizadas

```powershell
npm run lint
npm test
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npm run build
```

Todas devem passar sem erro antes de considerar a feature pronta (Constitution IV).

## Cenário ponta a ponta (manual, obrigatório antes de reportar concluído — Constitution: testar UI real)

1. Abrir o app (web `npm run dev` ou device Android via `npm run android:run`).
2. Abrir um livro com imagens (capa + imagens internas, se houver) no leitor.
3. Rolar algumas seções para forçar o carregamento de mais recursos.
4. Sair do leitor (voltar pra tela anterior).
5. Abrir um livro diferente.
6. Confirmar que:
   - A leitura funciona normalmente nos dois livros (navegação, progresso, TTS se aplicável) — nenhuma regressão visível (FR-005).
   - Nenhum erro aparece no console/logcat ao sair do leitor ou trocar de livro.
7. Repetir os passos 2-5 mais 2-3 vezes em sequência (trocando de livro rapidamente) para confirmar que não há erro nem travamento (edge case: trocas rápidas em sequência).

## Verificação de memória (SC-004 — opcional, não bloqueante)

Mesma técnica já usada em `sdd/bugs/alerta-play-console-uso-memoria-acima/test.md` (Round 3):

1. `adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>` (obter PID via `adb shell pidof com.johnny.neoreader`).
2. Conectar via Chrome DevTools (`chrome://inspect`) ou WebSocket direto.
3. Abrir um livro, rolar algumas seções, sair do leitor, abrir outro livro — repetir 3-4 vezes.
4. Inspecionar memória retida (aba Memory do DevTools, heap snapshot) ou consultar blob URLs ativos via `Runtime.evaluate`.
5. Confirmar que a contagem de blob URLs/heap retido não cresce de forma acumulada a cada troca (sinal de que a liberação está funcionando).

Este passo é uma confirmação adicional, não um critério de conclusão da feature — se não houver device disponível na sessão, pular sem bloquear.
