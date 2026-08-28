# Quickstart: Biblioteca de Domínio Público (Standard Ebooks)

Verificação manual — a feature é Android-only (`spec.md`), então parte do
fluxo só é testável num device/emulador real, não no browser de dev.

## Pré-requisitos

- Device ou emulador Android conectado (`adb devices` mostra pelo menos um).
- `catalog.json` com pelo menos 1 entrada real e verificada (ver Fase
  Foundational em `tasks.md`).
- Conexão de internet no device (pra baixar de verdade).

## Checagens automatizadas primeiro

```powershell
npm run lint
npm test
npm run build
```

Todos devem passar sem erro antes do teste manual.

## Cenário ponta a ponta (User Story 1 — caminho feliz)

1. `npm run android:run` (build + sync + instala no device).
2. Se a Biblioteca já tiver livros de testes anteriores, esvaziar (ou usar
   um perfil/dispositivo limpo) pra reproduzir o estado "Biblioteca vazia".
3. Abrir o app → tela Biblioteca deve mostrar o atalho pro catálogo de
   domínio público no estado vazio (FR-007).
4. Tocar no atalho → deve abrir Descubra na seção "Clássicos em Inglês",
   com a copy deixando claro que o conteúdo é em inglês (FR-008).
5. Confirmar que o grid aparece **mesmo em modo avião** (FR-009) — desligar
   a rede do device antes deste passo, religar depois.
6. Tocar em "baixar" num título → indicador de progresso aparece no card
   (FR-004).
7. Aguardar a conclusão → voltar pra Biblioteca → o livro aparece na lista
   normal, com capa e metadados extraídos do EPUB (FR-005).
8. Abrir o livro → confirmar que lê normalmente no `EpubViewer`.

## Edge cases a verificar manualmente

- **Download em segundo plano (FR-010)**: iniciar um download, navegar pra
  Biblioteca ou Perfil antes de concluir, voltar pra Descubra — o progresso
  deve continuar/refletir o estado real (não reiniciar, não sumir).
- **Falha de rede (FR-006 / User Story 3)**: ativar modo avião no meio de
  um download, confirmar mensagem de erro clara + botão de tentar
  novamente; desativar modo avião e tocar em tentar novamente.
- **Toque duplo (FR-011)**: tocar duas vezes rápido em "baixar" no mesmo
  título — não deve disparar dois downloads simultâneos nem duplicar o
  livro na Biblioteca.
- **Import concorrente**: iniciar um download da seção de domínio público
  e, antes de concluir, tentar um import manual (Importar arquivo) — o
  segundo deve respeitar o lock de import já existente (`ImportCoordinator`),
  mostrando a mensagem de "importação em andamento" já existente no app.

## Checklist cross-cutting (constitution)

- [ ] `npm run build` limpo (Princípio IV).
- [ ] Nenhuma dependência nova adicionada sem justificar (Princípio V) —
  esta feature não deveria precisar de nenhuma.
- [ ] Comentários curtos nos pontos não óbvios (branch `CapacitorHttp` vs
  `fetch`, decisão de progresso indeterminado) — Princípio II.
