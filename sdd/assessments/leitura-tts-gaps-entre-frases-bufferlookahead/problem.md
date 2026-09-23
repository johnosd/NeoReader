# Assessment Problem: Leitura TTS com gaps entre frases (Buffer/Lookahead)

<!--
  Preenchido pela fase Define do sdd-assess — estágio mínimo viável, não
  exige explora.md (mas incorpora se existir). Base pro scorecard da fase
  Decide.
-->

- **Slug**: leitura-tts-gaps-entre-frases-bufferlookahead
- **Criado**: 2026-09-21
- **Explora**: não rodada

## Problem Statement

Durante a leitura TTS de livros na língua nativa, ocorrem pausas (gaps) perceptíveis e indesejadas entre as frases consecutivas. Essas pausas são causadas pela latência de rede e processamento na comunicação sequencial com a API de geração de áudio, quebrando a naturalidade da escuta.

## Usuários / Partes Afetadas

- Usuários ouvindo audiobooks via TTS — experimentam quebras constantes no fluxo narrativo, o que prejudica a imersão e a percepção de qualidade do leitor.

## Goals

- Eliminar ou reduzir drasticamente os gaps de silêncio (latência) entre as frases reproduzidas pelo TTS na leitura nativa.
- Implementar um mecanismo de buffer (lookahead) que inicie a requisição e guarde o áudio de 2 a 3 frases seguintes em background, enquanto a atual está sendo reproduzida.

## Non-Goals

- Melhorar a latência inicial da reprodução do audiobook ao apertar o "Play" (o foco desta ideia está estritamente nas transições de frases já em andamento).
- Alterar o fornecedor ou modelo atual da API TTS (foco apenas na forma como consumimos os dados).
- Suportar processamento offline (o foco é otimizar o fluxo de chamadas online).

## Success Metrics

- Ausência de silêncio não intencional entre o fim do áudio de uma frase e o início da próxima (fluidez contínua) durante conexões estáveis.
- O tempo gasto "aguardando a API" entre frases cai próximo a zero.
- Manutenção perfeita do sincronismo visual, onde os highlights no texto da tela continuam acompanhando exatamente o áudio que está sendo tocado do buffer.

## Cost of Inaction

O usuário continuará enfrentando uma experiência fragmentada e robótica, mesmo ao usar vozes Premium de alta qualidade. Isso dilui o valor da feature de TTS Premium, resultando em menor engajamento na escuta de audiobooks e frustração prolongada.

