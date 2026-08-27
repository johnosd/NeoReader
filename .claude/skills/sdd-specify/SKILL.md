---
name: sdd-specify
description: Cria a especificação (spec.md) de uma feature nova via entrevista leve + clarificação estruturada. Use quando o usuário pedir para iniciar, especificar, escopar uma feature nova, escrever user stories, ou "criar uma spec". Produz specs/<NNN-slug>/spec.md. NÃO use para atualizar um plano técnico ou tasks já existentes (use sdd-plan), para implementar código (use sdd-execute), ou para o fluxo livre do skill antigo "plan-feature".
---

# sdd-specify

Primeiro estágio do sistema SDD (`sdd-specify` → `sdd-plan` → `sdd-execute` →
`sdd-converge`). Produz uma especificação de feature focada no **quê**, nunca
no **como** — decisões técnicas ficam para o `sdd-plan`.

## Fluxo

### 1. Gate de pré-requisito

Rode:

```powershell
.\.planning\scripts\powershell\check-prerequisites.ps1 -Stage specify
```

Isso só avisa (não bloqueia) se `.planning/memory/constitution.md` ainda não
existir. Se faltar, avise o usuário mas prossiga — a constitution é exigida
pelo `sdd-plan`, não por este skill.

### 2. Entrevista leve

Pergunte o suficiente para remover ambiguidade antes de escrever qualquer
coisa, em lotes concisos (3-5 perguntas). Cubra:

- Objetivo e comportamento visível ao usuário.
- Usuários-alvo e ponto de entrada (onde na UI/API isso aparece).
- **Não-objetivos explícitos** — o que fica de fora mesmo que relacionado.
- Critérios de aceite de alto nível.
- Edge cases óbvios.

Não pergunte fatos que dá pra descobrir barato no repositório (ex: convenções
já visíveis em features existentes de `specs/`, se houver alguma). Não
pergunte detalhes de arquitetura/stack — isso é do `sdd-plan`.

### 3. Rascunho em memória

Monte o conteúdo antes de tocar em arquivo:

- `## Escopo`: Incluído / Fora de Escopo (os não-objetivos da entrevista).
- User stories priorizadas P1/P2/P3, cada uma **independentemente
  testável e implantável** — se só a P1 for implementada, ainda existe valor
  entregável.
- Edge cases.
- `### Functional Requirements` como `FR-001`, `FR-002`... — statements DEVE
  testáveis. Até ~3 marcadores `[NEEDS CLARIFICATION: ...]` são aceitáveis
  neste rascunho (o passo 4 resolve a maioria).
- `### Key Entities`, só se a feature envolve dados.
- `### Measurable Outcomes` como `SC-001`, `SC-002`... — tecnologicamente
  agnósticos (nunca citam framework/biblioteca).
- `## Assumptions`.

### 4. Clarify — varredura estruturada de ambiguidade

Antes de fechar a spec, varra o rascunho contra esta taxonomia de 8
categorias, procurando lacunas reais (não force uma pergunta por categoria se
não houver ambiguidade genuína):

1. Escopo Funcional — o que exatamente está dentro/fora.
2. Domínio/Dados — entidades, formatos, limites de dados.
3. Interação/UX — confirmações, feedback visual, fluxo de erro.
4. Não-Funcional — performance, acessibilidade, segurança (quando relevante).
5. Integração — pontos de contato com outras partes do sistema.
6. Edge Cases — estados vazios, limites, concorrência.
7. Constraints/Terminologia — termos ambíguos, constraints implícitas.
8. Sinais de Conclusão — como saber que a feature está "pronta".

Faça **no máximo 5 perguntas sequenciais**, cada uma com uma opção
**Recomendada** explícita (o usuário pode só confirmar). Registre cada
resposta imediatamente:

- Anexe em `## Clarifications` → `### Sessão AAAA-MM-DD` como `- Q: ... → A: ...`.
- Corrija a seção da spec afetada na hora (não deixe pra depois).

### 5. Cria a estrutura da feature

```powershell
.\.planning\scripts\powershell\new-feature.ps1 "<descrição da feature>" [-ShortName <slug-curto>] -Json
```

Isso cria `specs/<NNN-slug>/` com `spec.md` semeado do template
(`.planning/templates/spec-template.md`) e retorna o `SLUG` real (com o número
sequencial).

### 6. Escreve a spec final

Sobrescreva `specs/<NNN-slug>/spec.md` com o conteúdo completo do passo 3+4.
Headings ficam em inglês (convenção estrutural); o conteúdo preenchido fica em
português.

### 7. Atualiza o backlog

```powershell
.\.planning\scripts\powershell\update-feature-status.ps1 -Slug <NNN-slug> -Status Especificada
```

Isso cria/atualiza a linha da feature em `.planning/backlog.md` → `##
Features`. Se a feature veio de uma ideia listada em `## Ideias Futuras`,
remova essa entrada manualmente (edite o arquivo) — o script só mexe na
tabela de Features.

### 8. Relata

Diga ao usuário: caminho salvo, quais categorias de clarificação ficaram sem
pergunta (se relevante), e o próximo passo explícito: "rode sdd-plan nesta
spec".

## Handoff

`sdd-plan` exige que `specs/<NNN-slug>/spec.md` exista. Marcadores
`[NEEDS CLARIFICATION]` remanescentes são um sinal, não um bloqueio — o
`sdd-plan` não falha por causa deles, mas o Analyze no fim do `sdd-plan` pode
sinalizá-los.
