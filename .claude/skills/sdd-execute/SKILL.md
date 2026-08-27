---
name: sdd-execute
description: Implementa uma feature já planejada, seguindo tasks.md fase por fase, com a documentação viva atualizada a cada checkpoint (não só no fim). Por padrão pausa ao final de cada fase pra confirmação (peça "sem parar"/"modo contínuo" pra desativar). Use quando o usuário pedir para implementar, construir, retomar ou continuar uma feature já especificada e planejada. Exige que specs/<NNN-slug>/plan.md e tasks.md já existam (rode sdd-plan antes, se não existirem). NÃO use para criar spec ou plano do zero.
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

## Modo de execução: pausado (padrão) ou contínuo

Este skill não tem parâmetros de linha de comando — é invocado em linguagem
natural. O "parâmetro" de modo é só como o usuário pede:

- **Pausado (padrão)**: ao final de **cada fase** de `tasks.md` (Setup,
  Foundational, cada User Story, Polish), pare e pergunte se deve continuar
  pra próxima, depois de reportar o checkpoint. Dá um ponto natural de
  revisão a cada fatia de trabalho.
- **Contínuo**: se o usuário pedir explicitamente algo como "implementa tudo
  sem parar", "roda até o fim", "não precisa perguntar a cada fase" ou
  "modo contínuo", não pause entre fases — só reporte o checkpoint no chat e
  siga direto pra próxima.

Se não estiver claro qual o usuário quer, assuma o padrão (pausado) e avise
que vai pausar a cada fase, mencionando que dá pra pedir modo contínuo.

**Importante**: os 3 gatilhos de parada obrigatória (bug fora de escopo —
passo 6; conflito com critério de aceite — passo 13; todas as tasks
concluídas) **continuam valendo mesmo em modo contínuo**. Eles não são pausas
de revisão opcionais, são bloqueios reais que exigem decisão do usuário.

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
  Futuras`, prefixada `[Bug]`, com a origem (feature + data). Quando alguém
  pegar a entrada depois, o `sdd-bugfix` é o caminho normal (avalia, corrige
  e verifica com disciplina de teste de regressão, sem exigir uma spec
  completa) — só bugs que exigem decisão de design de verdade merecem um
  `sdd-specify` próprio.

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

### 11. Pausa entre fases (padrão) ou segue (modo contínuo)

Se a fase que acabou de fechar **não** for a última de `tasks.md`: no modo
padrão, **pare aqui** e pergunte se deve continuar pra próxima fase (nomeie
qual é). Só prossiga pro passo 4 da próxima fase depois de confirmação
explícita do usuário. No modo contínuo (pedido explicitamente — ver "Modo de
execução" acima), pule esta pausa e vá direto pro passo 4 da próxima fase.

Se a fase que fechou **for** a última, não há o que pausar — siga pro passo
12 normalmente.

### 12. Sugere commits

Pontos de commit estratégicos agrupados por fase/story, com mensagem de
exemplo. **Nunca commite sozinho**, a menos que o usuário peça. Pode ser
sugerido junto da pausa do passo 11, ou a qualquer momento que fizer sentido.

### 13. Conflito com critério de aceite

Se um critério de aceite da spec conflitar com o que já existe no código,
**pare e pergunte** em vez de adivinhar qual dos dois está certo. Vale em
qualquer modo, a qualquer momento — não só nas pausas entre fases.

### 14. Ao marcar a última task

Quando o último checkbox de `tasks.md` (incluindo Polish/Checklist de
Release) é marcado:

```powershell
.\.planning\scripts\powershell\update-feature-status.ps1 -Slug <NNN-slug> -Status Implementada
```

## Handoff

`sdd-converge` pode rodar depois de pelo menos uma passada do `sdd-execute`
(não precisa de 100% das tasks marcadas, mas funciona melhor depois que a
maioria estiver feita).
