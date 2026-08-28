# Implementation Plan: [FEATURE]

**Slug**: `[NNN-feature-slug]` | **Date**: [DATE] | **Spec**: `sdd/specs/[NNN-feature-slug]/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

[Extraído da spec: requisito principal + abordagem técnica]

## Technical Context

**Language/Version**: [ex: C# / .NET 10, ou NEEDS CLARIFICATION]

**Primary Dependencies**: [ex: ASP.NET Core Web API, Blazor WebAssembly]

**Storage**: [ex: in-memory, ou N/A]

**Testing**: [ex: xUnit, bUnit, Playwright]

**Target Platform**: [ex: navegador via Blazor WASM + API local]

**Performance Goals**: [se aplicável, ou N/A pra MVP]

**Constraints**: [restrições específicas do domínio]

**Scale/Scope**: [escala relevante, ou N/A pra MVP local single-user]

## Decisões Invariantes

<!--
  Axiomas/regras travadas desta feature específica, definidas agora e
  referenciadas por todas as fases em tasks.md. Diferente da Constitution
  (projeto inteiro) e diferente de Riscos e Decisões (log evolutivo) — aqui
  são decisões que não devem ser revisitadas sem reabrir o design.
-->

- [Decisão travada 1]

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Segurança por Padrão | | | |
| II. Fronteiras Sustentáveis | | | |
| III. Qualidade Verificável | | | |
| IV. Disciplina de Escopo do MVP | | | |
| V. Corretude Operacional | | | |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/[NNN-feature-slug]/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo (saída do sdd-plan)
├── research.md            # Fase 0, condicional
├── data-model.md          # Fase 1, condicional
├── quickstart.md          # Fase 1, condicional
├── contracts/             # Fase 1, condicional
├── tasks.md               # Saída do sdd-plan (fase de tasks)
└── history.md              # Condicional, criado pelo sdd-execute quando arquiva
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Substituir pela árvore REAL deste repositório, descoberta
  na exploração do sdd-plan (não um placeholder genérico, mas também não uma
  estrutura fixa de outro projeto — cada repo onde este skill rodar tem a
  sua). Remover as opções não usadas.
-->

```text
# [REMOVER SE NÃO USADO] Opção 1: projeto único
src/
tests/

# [REMOVER SE NÃO USADO] Opção 2: frontend + backend separados
[backend-dir]/
[frontend-dir]/

# [REMOVER SE NÃO USADO] Opção 3: outra estrutura (monorepo, mobile+API, etc.)
[estrutura real encontrada]
```

**Structure Decision**: [documentar a estrutura escolhida e referenciar os caminhos reais tocados por esta feature, como encontrados no repositório — nunca copiar de outro projeto]

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

<!--
  Filosofia/prioridade de teste no nível da feature inteira. Complementa, sem
  substituir, os "Testes da fase"/"Registro da Fase" específicos de cada fase
  em tasks.md.
-->

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
dotnet build
dotnet test
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
