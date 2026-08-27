---
name: sdd-plan
description: Transforma uma spec já existente em plano técnico (plan.md) e lista de tasks (tasks.md), com checagem obrigatória contra a constitution do projeto. Use quando o usuário pedir para planejar uma spec, desenhar a arquitetura de uma feature, quebrar uma spec em tasks, ou rodar constitution check. Exige que specs/<NNN-slug>/spec.md já exista (rode sdd-specify antes, se não existir). NÃO use para criar uma spec nova ou para implementar código (use sdd-execute).
---

# sdd-plan

Segundo estágio do sistema SDD. Lê uma spec já escrita, explora o código real
**deste** repositório, desenha a abordagem técnica sob o gate da constitution,
e produz `plan.md` + `tasks.md`. Termina com uma checagem de consistência
somente-leitura (Analyze).

Este skill é agnóstico de projeto — não assuma nenhuma linguagem, framework ou
estrutura de pastas específica. Tudo sobre a estrutura real (backend/frontend
separados? monorepo? projeto único?) vem da exploração do passo 2, nunca de
um exemplo memorizado de outro projeto.

## Fluxo

### 1. Gate de pré-requisito

```powershell
.\.planning\scripts\powershell\check-prerequisites.ps1 -Stage plan -Slug <NNN-slug> -Json
```

Isso **bloqueia** se `spec.md` ou `.planning/memory/constitution.md` não
existirem, com instrução explícita do que rodar antes. Guarde o `FEATURE_DIR`
retornado — os passos seguintes usam esse caminho.

**Se `spec.md` não existir**: pare e diga pra rodar `sdd-specify` primeiro —
não tente contornar.

**Se só a constitution não existir** (mensagem específica "constitution não
existe. Crie a constitution antes de planejar"): este projeto ainda não tem
`.planning/memory/constitution.md`. Não é bloqueio definitivo — faça o
bootstrap agora, antes de continuar:

1. Verifique se existe uma constitution equivalente já escrita em outro lugar
   deste repositório (ex: um `.specify/memory/constitution.md` de uma
   instalação do speckit, um `CONTRIBUTING.md`, um documento de princípios de
   engenharia). Se existir algo aproveitável, pergunte ao usuário se quer
   portar esse conteúdo (traduzindo pra português se for o caso) em vez de
   partir do zero.
2. Se não houver nada pra portar, faça uma entrevista curta (3-5 perguntas,
   um só lote):
   - Que tipo de projeto é este e qual a stack principal?
   - Quais são os 3-5 princípios não-negociáveis pra como o código deste
     projeto deve ser construído (ex: segurança, fronteiras de
     responsabilidade entre camadas, disciplina de escopo, qualidade
     verificável — dê exemplos assim pra ajudar o usuário a responder rápido)?
   - Alguma restrição forte de projeto (stack travada, alvo de deploy,
     compliance, single-user vs multi-tenant)?
   - O que precisa ser verdade antes de uma mudança ser considerada "pronta"
     (revisão, checagens obrigatórias)?
3. Escreva `.planning/memory/constitution.md` a partir de
   `.planning/templates/constitution-template.md`, preenchendo Princípios
   Fundamentais (3-5, statements DEVE) a partir das respostas, `##
   Restrições do Projeto` e `## Fluxo de Desenvolvimento` (ou nomes de seção
   equivalentes que façam sentido pro projeto). A seção `## Governança` pode
   reusar o texto padrão de versionamento semântico (MAJOR/MINOR/PATCH) sem
   precisar perguntar — isso não varia por projeto.
4. Rode `check-prerequisites.ps1 -Stage plan` de novo pra confirmar que
   passa, e só então continue pro passo 2.

Isso mantém o bootstrap dentro do `sdd-plan` (sem virar um 5º skill) — a
constitution só é criada quando alguém efetivamente tenta planejar a primeira
feature de um projeto novo, nunca antes disso ser necessário.

### 2. Exploração dirigida

Leia `spec.md` primeiro. Depois descubra a estrutura real deste repositório —
manifestos de projeto/dependências, config de framework, convenções de pastas
já em uso — e busque, guiado pelos termos da spec, os componentes/serviços/
rotas/entidades existentes que a feature vai tocar ou de que vai depender.
Prefira buscas focadas (Grep/Glob) a dump de diretório inteiro. Leia testes
existentes da mesma área, se houver, pra entender o padrão de teste do
projeto.

Se `adr/` existir, liste os títulos das ADRs lá dentro e leia por
inteiro qualquer uma cujo tema se relacione com esta feature (stack, banco de
dados, framework tocados). São decisões de arquitetura já tomadas e
justificadas — **não as relitigue silenciosamente**; a Technical Context e as
Decisões Invariantes desta feature devem ser consistentes com elas. Se a
feature exige contrariar uma ADR existente, trate como uma violação a
justificar no Constitution Check (passo 5) e sugira ao usuário rodar
`sdd-adr` pra emendar a decisão formalmente, em vez de só ignorá-la aqui.

### 3. Síntese de contexto

Antes de escrever qualquer arquivo, monte um resumo compacto pra você mesmo:
arquitetura real deste repositório, padrões existentes a seguir, arquivos que
importam e por quê, constraints/riscos já conhecidos. Isso vira a base do
Technical Context e das Decisões Invariantes.

### 4. Technical Context + Decisões Invariantes

Preencha, no `plan.md` (a partir de `.planning/templates/plan-template.md`):

- Technical Context: linguagem/versão, dependências, storage, testes,
  plataforma, performance, constraints, escala — tudo baseado no que foi
  encontrado na exploração do passo 2. Marque `NEEDS CLARIFICATION` onde não
  houver informação suficiente em vez de inventar.
- `## Decisões Invariantes`: axiomas/regras travadas desta feature específica
  (ex: "remoção é síncrona, sem soft-delete nesta fase"). Diferente da
  constitution (projeto inteiro) e diferente de Riscos e Decisões (log
  evolutivo) — aqui são decisões que não devem ser revisitadas sem reabrir o
  design.

### 5. Constitution Check — gate pré-design

Leia `.planning/memory/constitution.md`. Para cada princípio que ela definir,
avalie se o plano emergente até aqui é compatível. Preencha a tabela `##
Constitution Check` (coluna Pré-Design) com uma linha por princípio real da
constitution deste projeto — a tabela do template é só um exemplo de forma,
não uma lista fixa de princípios. Se houver violação:

- **Justificável** (ex: complexidade genuinamente necessária): registre em
  `## Complexity Tracking` (Violação | Por que é necessária | Alternativa
  mais simples rejeitada porque).
- **Não justificável**: **pare e pergunte ao usuário** — não prossiga
  silenciosamente. Isso é um gate real, não um carimbo.

Riscos ou decisões técnicas identificados aqui já entram em `## Riscos e
Decisões` com um novo ID (`R-001`, `R-002`...).

### 6. Fase 0 — research.md (condicional)

Só crie `research.md` se restarem incertezas técnicas genuínas (ex: qual
biblioteca usar, formato de dados desconhecido). Formato por item: Decisão /
Justificativa / Alternativas consideradas. Se não houver incerteza, pule este
arquivo.

### 7. Fase 1 — design (condicional)

- `data-model.md`: só se a feature envolve entidades/dados novos ou
  alterados.
- `contracts/<superfície>.md`: só se a feature expõe ou altera uma superfície
  de API.
- `quickstart.md`: passos de verificação manual — prerrequisitos, checagens
  automatizadas, cenário ponta a ponta, e os itens cross-cutting do
  pre-acceptance checklist da constitution deste projeto, se ela definir um
  (ex: disponibilidade de serviços, configuração, conectividade).

Preencha `## Project Structure` com a árvore **real** deste repositório,
exatamente como encontrada no passo 2 — nunca com um exemplo genérico nem com
a estrutura de outro projeto.

### 8. Constitution Check — gate pós-design

Reavalie os princípios contra o design final (coluna Pós-Design da mesma
tabela). Mesma disciplina do passo 5: violação não justificável para o skill.

### 9. Escreve plan.md

Neste ponto, `plan.md` deve ter: Summary, Technical Context, Decisões
Invariantes, Constitution Check (completo), Project Structure, Complexity
Tracking, e `## Estratégia de Testes` (prioridade unitário → contrato/
integração → E2E → manual como último recurso, mais os comandos-base de
build/test copy-paste-prontos — descobertos na exploração, ex. `dotnet test`,
`npm test`, `pytest`, o que for real neste repositório).

As cinco seções finais do template (`Estado Atual`, `Riscos e Decisões` já com
os itens do passo 5, `Execution Notes`, `Arquivos Principais`, `Cuidados para
Retomada`) ficam como estão no template — **só o `sdd-execute` preenche/edita
essas depois**. Não as reescreva nem as remova.

### 10. Gera tasks.md

A partir de `.planning/templates/tasks-template.md`. Preencha `## Path
Conventions` com os caminhos reais descobertos no passo 2 (mesma Structure
Decision de `plan.md`). Organize por user story (P1, P2, P3... em ordem de
prioridade), cada fase seguindo o template de 5 blocos:

1. **Goal/Objetivo** — 1 frase.
2. **Implementation/Checklist** — tasks com `[TaskID] [P?] [Story?]` e
   caminho de arquivo real (nunca um placeholder).
3. **Tests/Testes da fase** — checklist **separado** dos itens de
   implementação.
4. **Critério de Conclusão** — prosa explícita do que "pronto" significa
   nesta fase/story.
5. **Registro da Fase** — deixe o bloco vazio (`Status:` / `Feito:` /
   `Testes executados:` / `Pendências:`); só o `sdd-execute` preenche.

A fase final Polish inclui o **Checklist de Release**: um item por fase
concluída, mais os gates cross-cutting relevantes a este projeto.

### 11. Analyze — checagem final, estritamente read-only

Cruze `spec.md`, `plan.md`, `tasks.md` e a constitution procurando:

- **Duplicação** — requisitos ou tasks repetidos sem necessidade.
- **Ambiguidade** — termos vagos que deveriam ter virado `[NEEDS CLARIFICATION]`.
- **Subespecificação** — user story sem task correspondente, ou vice-versa.
- **Alinhamento com a Constitution** — qualquer princípio dela não coberto.
- **Lacunas de Cobertura** — todo `FR-###`/`SC-###` deveria ter pelo menos uma task rastreável.
- **Inconsistência** — terminologia divergente entre os 3 arquivos.

Apresente uma tabela de achados (ID | Categoria | Severidade | Local | Resumo
| Recomendação, no máximo 50 linhas) com severidade CRITICAL (viola a
constitution) / HIGH / MEDIUM / LOW, **só no chat**. Nunca grave isso em
arquivo. Sugira correções, não as aplique sozinho.

### 12. Atualiza o backlog

```powershell
.\.planning\scripts\powershell\update-feature-status.ps1 -Slug <NNN-slug> -Status Planejada
```

### 13. Relata

O que foi escrito, resultado do Constitution Check (pré e pós), resumo do
Analyze, e uma recomendação explícita: resolver achados CRITICAL antes de
rodar `sdd-execute`, ou seguir em frente se estiver tudo limpo.

## Handoff

`sdd-execute` exige `spec.md` + `plan.md` + `tasks.md`. O Analyze não deixa
rastro em arquivo — se a sessão terminar com um CRITICAL não resolvido, uma
sessão futura do `sdd-execute` não vai saber disso automaticamente (risco
aceito; ver plano em `docs/features/` ou o histórico da conversa que aprovou
este sistema).
