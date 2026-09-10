# Quickstart: Controle de toque na tela de leitura

Passos de verificação manual — complementam (não substituem) os testes
automatizados de `tasks.md`. A constitution exige testar UI/leitor num
browser real ou no device Android antes de reportar concluído.

## Pré-requisitos

- `npm run build` e `npm test` passando (ver `## Estratégia de Testes` em `plan.md`).
- Device Android conectado (`adb devices` mostrando `device`, não `unauthorized`) — ver `feedback_debugging_workflow` nas memórias da sessão pra troubleshooting.
- Um livro EPUB com índice (TOC) definido carregado na biblioteca.

## Checagens automatizadas

```powershell
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npx vitest run src/__tests__/screens/SettingsAppearanceScreen.test.tsx
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Cenário ponta a ponta (device real)

1. Abrir um livro, navegar pra qualquer ponto do meio do texto.
2. Tocar na borda esquerda da tela, na faixa central (não nos cantos superior/inferior) → deve abrir o painel de índice (TOC) diretamente.
3. Fechar o índice e repetir em outros pontos do livro (início, fim) → mesmo resultado em qualquer lugar.
4. Tocar num parágrafo de texto perto da borda esquerda → deve abrir a tradução inline normalmente, **nunca** abrir o índice.
5. Tocar no canto superior-esquerdo e no canto inferior-esquerdo da tela → deve continuar abrindo/fechando o menu (chrome), **não** abrir o índice.
6. Iniciar o TTS (narração), deixar tocando, e tocar na faixa esquerda → deve abrir o índice normalmente, mesmo com áudio ativo.
7. Repetir os passos 2-6 com a tela em paisagem (se o app suportar rotação) — a faixa deve recalcular a posição corretamente.

## Cenário: mapa de zonas

8. Abrir Settings > Aparência.
9. Conferir que existe uma seção com o diagrama read-only das zonas de toque, com legenda descrevendo: topo/rodapé/direita = menu, centro (texto) = tradução, borda esquerda = abrir índice.
10. Tocar em qualquer parte do diagrama → nada deve acontecer (sem navegação, sem gravação de preferência).
11. Trocar o idioma do app (Settings > Idioma) pra `en` e depois `es` → reabrir Aparência e confirmar que a legenda do diagrama está traduzida nos dois idiomas.

## Critério de aceite do quickstart

Todos os 11 passos acima se comportam conforme descrito, sem nenhuma
regressão perceptível nas zonas de chrome, tradução inline, highlight,
bookmark ou navegação por TTS já existentes.

**Passos 1-6 já validados no device real (SM-S911B) em 2026-09-10,
confirmados pelo usuário.**
