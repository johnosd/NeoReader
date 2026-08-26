---
name: sdd-execute
description: Implementa uma feature já planejada, seguindo tasks.md fase por fase, com a documentação viva atualizada a cada checkpoint (não só no fim). Use quando o usuário pedir para implementar, construir, retomar ou continuar uma feature já especificada e planejada. Exige que specs/<NNN-slug>/plan.md e tasks.md já existam (rode sdd-plan antes, se não existirem). NÃO use para criar spec ou plano do zero.
---

# sdd-execute

Terceiro estágio do sistema SDD. `tasks.md` é a fonte da verdade; este skill
implementa story por story, mantendo `plan.md` e `tasks.md` sincronizados com
a realidade do código a cada checkpoint — isso é o que resolve a documentação
ficar pra trás durante a execução.

Este skill é agnóstico de projeto: os comandos de build/teste a rodar vêm da
seção `## Estratégia de Testes` de `plan.md` (preenchida pelo `sdd-plan` com o
que é real neste repositório), nunca de um comando memorizado de outro
projeto.

## Fluxo

### 1. Gate de pré-requisito

```powershell
.\.planning\scripts\powershell\check-prerequisites.ps1 -Stage execute -Slug <NNN-slug> -Json
```

Bloqueia se `spec.md`, `plan.md` ou `tasks.md` faltarem, com instrução do que
rodar antes.

### 2. Carrega contexto

Leia `tasks.md` (fonte da verdade), `plan.md` (arquitetura, Decisões
Invariantes, Estratégia de Testes, Execution Notes acumuladas), `spec.md`
(critérios de aceite), `.planning/memory/constitution.md`, e os
`AVAILABLE_DOCS` que o script do passo 1 reportou (`research.md`,
`data-model.md`, `contracts/`, `quickstart.md`, `history.md` se existir).

Se `history.md` existir, não precisa reler por inteiro — é arquivo, não
contexto ativo; consulte só se precisar entender uma decisão antiga que sumiu
de `plan.md`.

### 3. Primeira execução desta feature

Se `## Estado Atual` em `plan.md` ainda estiver vazio (primeira vez rodando
`sdd-execute` nesta feature):

```powershell
.\.planning\scripts\powershell\update-feature-status.ps1 -Slug <NNN-slug> -Status "Em Execução"
```

### 4. Identifica a próxima task

Respeite a ordem de fase: Setup → Foundational (bloqueante) → user stories em
ordem de prioridade (ou paralelismo `[P]` dentro de uma fase) → Polish.
Continue de onde `tasks.md` mostrar o último `[X]`.

### 5. Implementa

Story por story. Rode os comandos de build/teste da Estratégia de Testes
(comandos exatos, copy-paste-prontos no relatório — nunca só "rodei os
testes"). Marque `[X]` **imediatamente por task concluída**, não em lote —
progresso precisa sobreviver a uma interrupção.

### 6. Bugs encontrados durante implementação/teste

Cerimônia proporcional ao tamanho do bug — nunca o ciclo completo de
`sdd-specify` pra correções pequenas:

- **Bloqueia a task atual** (o teste da própria task não passa por causa
  dele): corrija inline, dentro da mesma task, sem task nova. Registre em
  prosa no `Registro da Fase` (`Testes executados:` menciona quantas
  iterações precisou).
- **Dentro do escopo desta feature, mas não previsto em nenhuma task**:
  adicione uma task ad-hoc em `tasks.md`, na mesma fase, seguindo a
  numeração (`T00X`, `T00X+1`...), marcada como descoberta durante outra
  task; execute e marque `[X]` normalmente. Se revelar uma decisão técnica
  (não só um typo), anexe também em `## Riscos e Decisões` de `plan.md`.
- **Fora do escopo desta feature** (bug pré-existente, achado por acaso):
  **nunca corrija calado** — a constitution deste projeto provavelmente já
  proíbe expansão de feature não solicitada, e mesmo que não proíba
  explicitamente, isso quebra a confiança no escopo do plano. Pare, reporte
  o achado com severidade, e pergunte ao usuário: corrigir agora (vira um
  desvio pequeno registrado, igual ao caso anterior) ou logar pra depois. Se
  for logar: adicione entrada em `.planning/backlog.md` → `## Ideias
  Futuras`, prefixada `[Bug]`, com a origem (feature + data). Um fix de
  poucas linhas pode ser corrigido depois sem cerimônia, direto, quando
  alguém pegar a entrada — só bugs que exigem decisão de design de verdade
  merecem um `sdd-specify` próprio.

### 7. Ao fechar cada checkpoint de fase/story

Atualização **obrigatória, não condicional** — isso é o mecanismo estrutural
que substitui "lembrar de atualizar a doc":

- Em `tasks.md`: escreva/atualize o bloco **Registro da Fase** da fase/story
  recém-fechada (`Status:` / `Feito:` / `Testes executados:` / `Pendências:`).
  Se a fase fechou como concluída, marque também o item correspondente no
  Checklist de Release (fase Polish).
- Em `plan.md`:
  - **Sobrescreva** `## Estado Atual` (tabela Área/Estado — reflete o estado
    real agora, não histórico).
  - **Sobrescreva** `## Arquivos Principais` (lista curta, foco da etapa
    atual — não a árvore inteira do projeto).
  - **Anexe** uma linha na tabela de `## Execution Notes` (Data | Fase/Story
    | Resumo | Pendência Principal).
  - **Sobrescreva** a linha `PRÓXIMO:` logo abaixo da tabela.
  - Se surgiu risco/decisão técnica novo, **anexe** em `## Riscos e
    Decisões` com ID novo (`R-00X`); se um risco existente foi resolvido,
    prefixe a célula de Mitigação com `Resolvido:` em vez de apagar a linha.
  - Se descobriu uma armadilha operacional específica, **anexe** em
    `## Cuidados para Retomada`.

### 8. Arquivamento

Se a tabela de `## Execution Notes` já tiver mais de ~40 linhas, mova todas
exceto as ~10 mais recentes para `specs/<slug>/history.md` (crie o arquivo se
não existir, sempre por anexação — nunca reescreva o que já está lá),
substituindo-as em `plan.md` por uma linha de resumo consolidado. Cheque isso
a cada checkpoint, não só quando o arquivo já estiver enorme.

### 9. Atualiza progresso no backlog

```powershell
.\.planning\scripts\powershell\update-feature-status.ps1 -Slug <NNN-slug> -Json
```

Sem `-Status` — só recalcula Progresso a partir dos checkboxes de `tasks.md`.
Chame isso a cada checkpoint.

### 10. Reporta progresso

A cada checkpoint: o que foi feito, testes rodados (comandos + resultado),
próximo passo.

### 11. Sugere commits

Pontos de commit estratégicos agrupados por fase/story, com mensagem de
exemplo. **Nunca commite sozinho**, a menos que o usuário peça.

### 12. Conflito com critério de aceite

Se um critério de aceite da spec conflitar com o que já existe no código,
**pare e pergunte** em vez de adivinhar qual dos dois está certo.

### 13. Ao marcar a última task

Quando o último checkbox de `tasks.md` (incluindo Polish/Checklist de
Release) é marcado:

```powershell
.\.planning\scripts\powershell\update-feature-status.ps1 -Slug <NNN-slug> -Status Implementada
```

## Handoff

`sdd-converge` pode rodar depois de pelo menos uma passada do `sdd-execute`
(não precisa de 100% das tasks marcadas, mas funciona melhor depois que a
maioria estiver feita).
