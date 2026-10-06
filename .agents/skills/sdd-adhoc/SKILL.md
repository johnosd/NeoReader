---
name: sdd-adhoc
description: Implementa um ajuste pequeno e de baixo risco (ordenação/limite de lista, texto, performance pontual, lazy loading, pequeno reflow de UI) direto no código, sem o processo formal de sdd-specify/sdd-plan (grande demais pro tamanho do ajuste) nem sdd-bugfix (não há comportamento quebrado a corrigir — não é bug, é preferência/melhoria deliberada). Antes de mexer em código, avalia o pedido em 3 perguntas sequenciais (há algo quebrado? está claro que vale a pena? o escopo é pequeno e sem ambiguidade real?) pra redirecionar cedo pro skill certo em vez de forçar tudo por aqui. Registra o que foi feito — e o que foi considerado e descartado, se houver — numa linha nova da tabela "## Melhorias Ad-hoc" em .planning/backlog.md antes de reportar concluído, roda os gates padrão do projeto (lint, type-check, testes, build) e sugere ponto de commit. Use quando o usuário pedir um ajuste pequeno e claro que não envolve corrigir algo quebrado nem adicionar uma feature grande — ex: "ordena essa lista", "limita a quantidade mostrada, com ver mais", "troca esse texto", "adiciona lazy loading nessas imagens". NÃO use para bugs com sintoma reproduzível (use sdd-bugfix), pra ideias ainda não validadas onde não está claro se vale a pena (use sdd-assess), pra pedidos grandes ou ambíguos que precisam de escopo/critérios de aceite explícitos (use sdd-specify), nem para decisões de arquitetura (use sdd-adr).
---

# sdd-adhoc

Skill independente, fora da pipeline `sdd-specify → sdd-plan → sdd-execute
→ sdd-converge` e fora do `sdd-bugfix` — não exige nem cria pasta própria em
`sdd/`. O único rastro que fica é uma linha na tabela `## Melhorias Ad-hoc`
de `.planning/backlog.md`, que já existia informalmente antes deste skill
(era preenchida à mão, sem processo definido).

**Ad-hoc não é sinônimo de "sem disciplina"** — os gates de qualidade
(lint, type-check, testes, build) e a exigência de deixar rastro continuam
valendo. O que fica de fora é só a cerimônia: sem fases com veredito
(`valid`/`invalid` não faz sentido pra algo que não está quebrado), sem
spec/plan/tasks, sem pasta própria.

## Diferença de escopo pros outros skills

| Skill | Quando usar | Rastro deixado |
|---|---|---|
| `sdd-bugfix` | Algo está **quebrado** — comportamento incorreto, com sintoma reproduzível ou fundamentado em código | `sdd/bugs/<slug>/` (assessment/fix/test) |
| `sdd-assess` | Nada quebrado, mas não está claro se **vale a pena** fazer — falta evidência, é só uma hipótese/ideia trazida por comparação com outro app, ou o valor é discutível | `sdd/assessments/<slug>/` (explora/problem/decision) |
| `sdd-specify` (+ plan/execute/converge) | Já está claro que vale a pena, mas o pedido é grande ou tem ambiguidade real de escopo — precisa de user stories/critérios de aceite explícitos | `sdd/specs/<NNN-slug>/` |
| `sdd-adhoc` | Nada quebrado, óbvio que vale a pena, escopo pequeno e sem ambiguidade real | 1 linha em `.planning/backlog.md` → `## Melhorias Ad-hoc` |

## Fluxo

### 1. Avalia o escopo (obrigatório, antes de tocar em código)

Passe o pedido pelas 3 perguntas abaixo, **nessa ordem**, e pare na
primeira que bater — cada uma redireciona pra um skill diferente em vez de
deixar passar por suposição (Constitution I). Só chega no passo 2 quem
responder "não" nas três.

1. **Há algo quebrado?** Existe um comportamento incorreto ou inesperado,
   com sintoma reproduzível ou fundamentado em código — não "poderia ser
   melhor", e sim "está errado"? → **Pare. Recomende `sdd-bugfix`.**
2. **Está claro que vale a pena?** O pedido é uma hipótese/ideia (ex:
   comparação com outro app, "não seria legal se..."), falta evidência de
   demanda real, ou o valor/prioridade é genuinamente discutível? → **Pare.
   Recomende `sdd-assess`.**
3. **O escopo é pequeno e sem ambiguidade real?** Existe mais de uma
   interpretação razoável do pedido? Toca mais que uns 2-3 arquivos? Exige
   uma decisão de design/arquitetura de verdade (não só "onde clicar")? Se
   qualquer resposta for sim → **Pare. Recomende `sdd-specify`** (a spec é
   quem resolve a ambiguidade via entrevista/clarify, não este skill por
   suposição própria).

Se as 3 perguntas passarem sem parar, o pedido cabe aqui — siga pro passo
2. Registre mentalmente por que passou (vai sustentar o resumo do passo 6).

### 2. Investiga o código relevante (read-only)

Leitura direcionada — Grep/Glob/Read nos arquivos que o pedido aponta.
Não é uma fase de Assess formal (sem veredito, sem severidade), só o
suficiente pra saber exatamente o que mudar e onde. Se a investigação
revelar que o ajuste é maior do que parecia (efeitos colaterais reais,
múltiplos pontos de mudança, decisão de design necessária), volte pro
passo 1 e recomende o skill certo em vez de continuar.

### 3. Implementa

Mudança mínima — sem refatorar código não relacionado, sem introduzir
abstração além do que o ajuste pede (Constitution III). Reaproveite
padrões já existentes no código em vez de inventar um novo (ex: se já
existe um padrão de "mostrar N + botão ver mais" em outro lugar da tela,
espelhe esse padrão em vez de desenhar um novo).

### 4. Testa

Atualize/adicione testes proporcionais ao tamanho do ajuste — nem sempre
precisa de teste novo (ex: um ajuste de texto não precisa), mas mudança de
comportamento visível geralmente precisa. Rode os gates padrão do projeto:

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Constitution IV: só reporta concluído depois desses 4 passarem limpos. Pra
mudanças de UI/frontend, valide num browser real ou no device Android antes
de reportar (mesma regra da constitution que vale pro resto do projeto) —
sugira instalar no device se o usuário topar.

### 5. Registra em `.planning/backlog.md`

Anexe uma linha nova na tabela `## Melhorias Ad-hoc` (crie a seção com o
cabeçalho abaixo se ainda não existir — não deveria ser o caso neste
projeto, mas o skill precisa ser resiliente a isso):

```markdown
## Melhorias Ad-hoc

Pequenos ajustes de performance/UX feitos direto (sem passar pelo fluxo
sdd-specify/plan — baixo risco, sem arquivo em `sdd/specs/` ou `sdd/bugs/`).

| Data | Área | Resumo |
| --- | --- | --- |
```

Cada linha de `Resumo` deve ser específica o bastante pra alguém entender
sem abrir o diff: o que foi feito, o que foi considerado e descartado (se
houve alguma alternativa avaliada e rejeitada, com o motivo — não esconda
isso), e como foi validado (comandos rodados, resultado). Edite
diretamente com o Edit tool — não há script dedicado pra essa tabela (ela
não é gerida por `update-feature-status.ps1`/`update-bug-status.ps1`).

### 6. Relata e sugere commit

Resuma o que mudou, os resultados dos gates do passo 4, e a linha
registrada no backlog. Sugira uma mensagem de commit no formato do projeto
(`feat: ...`/`fix: ...`/`docs: ...` em português) — **nunca commita
sozinho**.

## Guardrails

- Nunca pula os gates de build limpo (Constitution IV) achando que "é
  pequeno demais pra precisar".
- Nunca decide sozinho que algo é "óbvio demais pra perguntar" quando há
  ambiguidade real — mesmo em ajuste pequeno, a Constitution I vale:
  escopo ambíguo nunca é resolvido por suposição.
- Nunca deixa de registrar a linha no backlog, mesmo quando o ajuste
  parece trivial demais pra "merecer" — é exatamente esse tipo de mudança
  que costuma sumir sem rastro se não for anotada aqui.
- Nunca cria pasta em `sdd/specs/` ou `sdd/bugs/` — se sentir necessidade
  de criar uma, é sinal de que o pedido não cabia neste skill (volte pro
  passo 1).

## Handoff

Nenhum — standalone, como `sdd-adr`. Não se conecta a `sdd-specify`,
`sdd-plan`, `sdd-execute`, `sdd-converge` nem `sdd-bugfix`.
