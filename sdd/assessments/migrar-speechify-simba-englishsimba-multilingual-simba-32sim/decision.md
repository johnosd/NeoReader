# Assessment Decision: Migrar Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0

- **Slug**: migrar-speechify-simba-englishsimba-multilingual-simba-32sim
- **Decidido**: 2026-09-03
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Confirmado no código: `SpeechifyService.ts:152-154` hardcoda os dois modelos retirados. Não é hipotético. |
| Força da evidência | strong | Guia colado corroborado de forma independente via busca web contra `docs.speechify.ai` (changelogs e páginas de modelo reais, mesmas datas/nomes). |
| Valor vs. custo de inação | strong | Custo de não agir é alto (narração Speechify quebra em produção, prazo real ~18 dias) vs. custo de agir é baixo (troca de string numa função pura). |
| Viabilidade / apetite | adequate | Caminho técnico é simples, mas há 2 `unknown` explícitos que afetam a abordagem, não a decisão de agir: (1) se a voz padrão `carly` e vozes salvas de usuários são aceitas pelo conjunto curado de `simba-3.2`; (2) se `simba-3.0` cobre japonês (`ja`) hoje — não verificado contra a API/docs ao vivo. |
| Fit estratégico | strong | TTS realista é um dos três focos centrais do produto (ver `CLAUDE.md`); manter o provider Speechify funcional é diretamente alinhado. |

## Abordagens Candidatas

### 1. Split por idioma: simba-3.2 para inglês, simba-3.0 para o resto

- Replica a recomendação literal do guia: `simba-english` → `simba-3.2` (se a
  voz for aceita), `simba-multilingual` → `simba-3.0`.
- **Recomendada**: não — carrega o risco do `unknown` de compatibilidade de
  voz do `simba-3.2` (conjunto curado) sem necessidade; ganho de latência/
  expressividade do 3.2 não compensa o risco de quebrar vozes já salvas por
  usuários sem verificação prévia contra a API viva.

### 2. Consolidar tudo em simba-3.0

- `pickSpeechifyModel` sempre retorna `simba-3.0`, independente do idioma;
  aceita o catálogo completo de vozes (incluindo clonadas) sem etapa de
  aprovação, eliminando o risco de voz rejeitada.
- **Recomendada**: sim — menor risco de regressão imediata antes do prazo de
  21/09. Abre mão do ganho de time-to-first-byte/expressividade do 3.2 em
  inglês, mas isso pode ser revisitado depois (ver perguntas abaixo) sem
  pressão de prazo.

### 3. Pin de `Speechify-Version` como paliativo

- Fixar o header numa data anterior a `2026-09-21` só adia o problema até
  `2026-11-21` — não é solução, é gestão de prazo.
- **Recomendada**: não como solução, mas pode valer como rede de segurança
  adicional enquanto a Abordagem 2 é implementada e testada (baixíssimo
  custo de adicionar).

## Veredito

`go`. O problema é real, verificado em código e corroborado externamente;
o custo de inação é alto com prazo rígido (~18 dias); o fix é barato. Os dois
`unknown` da linha "Viabilidade" (compatibilidade de voz com simba-3.2,
cobertura de `ja` em simba-3.0) não bloqueiam a decisão de agir — eles
apontam para a abordagem mais conservadora (Abordagem 2) em vez de exigir
mais uma rodada de Explora/Define.

### Se go — Handoff

- **Problema**: `SpeechifyService.pickSpeechifyModel` envia modelos TTS
  (`simba-english`/`simba-multilingual`) que a Speechify retira a partir de
  2026-09-21 (não selecionáveis) e desliga em 2026-11-21. Sem pin de
  `Speechify-Version`, o projeto está exposto à primeira data.
- **Abordagem recomendada**: Abordagem 2 — consolidar `pickSpeechifyModel`
  para sempre retornar `simba-3.0` (remove a ramificação por idioma), já que
  aceita o catálogo completo de vozes sem risco de rejeição. Opcionalmente,
  adicionar pin de `Speechify-Version` como rede de segurança durante o
  rollout.
- **Escopo sugerido**: entra a troca do modelo em `pickSpeechifyModel` e
  qualquer teste que hoje afirme `simba-english`/`simba-multilingual` (ver
  `providerValidation.test.ts` e afins). Fica de fora qualquer mudança nos
  outros providers de TTS (native, ElevenLabs, Fish Audio) e qualquer
  otimização futura para usar `simba-3.2` em inglês.
- **Métricas de sucesso**: síntese via Speechify funciona sem `400
  model_retired` antes de 2026-09-21; voz padrão `carly` e vozes salvas
  continuam sintetizando; comportamento de `ja` fica definido (suportado ou
  fallback claro), não silenciosamente quebrado.
- **Perguntas em aberto pro sdd-specify**: confirmar contra a API viva (ou
  contra `docs.speechify.ai/build/guides/concepts/models` e
  `.../language-support` atualizados) se `carly` e vozes salvas de usuários
  reais são aceitas por `simba-3.0`/`simba-3.2`, e se `ja` está coberto por
  `simba-3.0` no momento da implementação.
