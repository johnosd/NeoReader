# Assessment Decision: Leitura TTS com gaps entre frases (Buffer/Lookahead)

<!--
  Preenchido pela fase Decide do sdd-assess. Exige problem.md. Veredito
  NUNCA inflado: go exige problema válido + evidência adequate+ em todos os
  critérios centrais; senão desce pra needs-clarification. unknown precisa
  ser reconhecido explicitamente, nunca varrido pra baixo do tapete. Matar
  (kill) uma ideia com razão documentada é sucesso, não falha.
-->

- **Slug**: leitura-tts-gaps-entre-frases-bufferlookahead
- **Decidido**: 2026-09-21
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

<!-- strong / adequate / weak / unknown por critério. unknown exige nota explicando o que falta. -->

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | A experiência atual fragmenta a narração contínua e degrada a usabilidade da funcionalidade premium de TTS. |
| Força da evidência | adequate | É amplamente conhecido que APIs TTS baseadas em rede possuem latência perceptível entre requisições sequenciais. |
| Valor vs. custo de inação | strong | Custo de inação alto; sem fluidez, os usuários podem abandonar o recurso ou a assinatura premium. |
| Viabilidade / apetite | adequate | Viável com a implementação de um buffer ou mecanismo de prefetch assíncrono para adiantar dados sem bloquear o áudio ativo. |
| Fit estratégico | strong | Melhora diretamente o core do app e valoriza a experiência de consumo da biblioteca e integrações premium. |

## Abordagens Candidatas

<!-- 1-3, em nível de conceito (não design de implementação). Recomende uma se o veredito parecer go. -->

### Fila de Prefetch em Background (Buffer de Áudio)

- Manter uma fila (lookahead) e pré-solicitar as próximas 2 a 3 frases assim que a reprodução iniciar, mantendo sempre o buffer alimentado em background. Assim, quando a frase atual acaba, a próxima já está em memória para tocar instantaneamente.
- **Recomendada**: sim — Aborda o gargalo de latência diretamente e isola o estado do áudio do estado principal de reprodução, sendo relativamente padrão para clientes TTS modernos.

## Veredito

O veredito é um firme `go`. A resolução deste problema tem um alto impacto na experiência do usuário para uma função principal (TTS), e os meios de resolvê-lo através de lookahead são maduros e bem definidos.

### Se go — Handoff

<!--
  Remover esta subseção se o veredito não for go. Resuma de um jeito que o
  sdd-specify consiga usar como contexto de entrada em vez de entrevistar do
  zero.
-->

- **Problema**: Pausas (gaps) desnecessárias e frequentes entre as frases durante o TTS na língua nativa por causa da latência na comunicação online com a API de voz.
- **Abordagem recomendada**: Implementar um prefetch/buffer assíncrono das próximas 2 ou 3 frases. Quando a reprodução de `n` acaba, o áudio de `n+1` já está pronto na memória.
- **Escopo sugerido**: Inclusão de buffer para TTS nativo; não engloba uso offline, troca do TTS nativo/provider, e não deve impactar a lógica pesada de tradução que ocorre fora desse caminho otimizado.
- **Métricas de sucesso**: Redução de tempo ocioso aguardando API entre transições de frase; fluidez ininterrupta no áudio e highlights visualmente sincronizados.
- **Perguntas em aberto pro sdd-specify**: Como gerenciar memória num aparelho móvel se pausarmos a reprodução e o buffer estiver cheio? Como lidar com cancelamentos, pular de capítulo ou retries (se falhar o download de N+1, retentar silenciosamente ou pular)?

