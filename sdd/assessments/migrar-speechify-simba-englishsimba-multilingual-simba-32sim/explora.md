# Assessment Explora: Migrar Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0

- **Slug**: migrar-speechify-simba-englishsimba-multilingual-simba-32sim
- **Criado**: 2026-09-03
- **Origem**: texto colado (guia de migração da Speechify, recebido como aviso de depreciação)

## Ideia Bruta

Speechify está retirando o par de modelos TTS "Simba 1.6" (`simba-english` e
`simba-multilingual`): não selecionáveis a partir da versão de API
`2026-09-21` (erro `400 model_retired`), desligados incondicionalmente em
`2026-11-21`. Substitutos recomendados: `simba-3.2` (inglês, mas só aceita um
conjunto curado de vozes + vozes clonadas aprovadas) e `simba-3.0` (cobre
inglês + alemão, espanhol, francês, italiano, português — aceita o catálogo
completo de vozes, incluindo clonadas). É possível comprar tempo fixando o
header `Speechify-Version` numa data anterior a `2026-09-21`, mas isso não
adia o desligamento de `2026-11-21`.

## Evidência a Favor

- `src/services/SpeechifyService.ts:152-154` (`pickSpeechifyModel`) hardcoda
  exatamente `'simba-english'` e `'simba-multilingual'` como modelo enviado
  em toda chamada de síntese — o projeto está diretamente exposto.
- Nenhuma chamada em `SpeechifyService.ts` define o header
  `Speechify-Version` (confirmado por leitura do arquivo completo) — ou
  seja, o workspace **não está pinado** e herda a versão de API corrente da
  Speechify. Isso implica que a data que importa não é 21/11, e sim
  **21/09/2026** (~18 dias a partir de hoje): a partir dela as chamadas já
  devem começar a falhar com `400 model_retired`.
- Conteúdo corroborado de forma independente via busca web: `docs.speechify.ai`
  tem páginas reais (`/build/guides/concepts/models`,
  `/build/changelog/2026/5/9`, `/build/changelog/2026/7/8`,
  `/build/guides/text-to-speech/language-support`) confirmando as mesmas
  datas e nomes de modelo — não é conteúdo fabricado/phishing.
- Fix aparenta ser de baixo custo: a troca é uma string (`model`) numa única
  função pura (`pickSpeechifyModel`), sem mudança de shape da request (o
  projeto já envia `language` explicitamente em toda chamada — ver
  `SpeechifyService.ts:340` — então a nota do guia sobre "omitir `language`
  muda o comportamento" não se aplica).

## Evidência Contra

- Existe incerteza real sobre se a voz padrão (`DEFAULT_VOICE_ID = 'carly'`)
  e vozes já salvas por usuários em `ttsVoiceSelections`/`ttsVoiceCaches`
  estão no conjunto curado aceito por `simba-3.2` — isso não foi verificado
  contra a API viva (exigiria API key + chamada real). Se não estiverem, a
  troca ingênua para `simba-3.2` quebra sínteses que hoje funcionam.
- `BOOK_LANGUAGE_OPTIONS`/`TRANSLATION_LANGUAGE_OPTIONS`
  (`src/utils/languageOptions.ts`) incluem `ja` (japonês), que não consta
  na lista de idiomas cobertos por `simba-3.0` citada no guia (inglês,
  alemão, espanhol, francês, italiano, português). Não confirmado se isso
  já mudou nos docs atuais da Speechify — marcar como `ASSUMPTION` até
  checar `language-support` ao vivo.
- Nenhum teste de integração real contra a API da Speechify foi rodado nesta
  sessão (sem API key disponível) — a verificação ficou em nível de código
  + documentação, não end-to-end.

## Perguntas em Aberto

- A voz padrão `carly` e vozes salvas dos usuários são aceitas por
  `simba-3.2`? (Se não, a abordagem mais segura é rotear tudo por
  `simba-3.0`, que aceita catálogo completo.)
- `simba-3.0` já cobre japonês hoje, ou continua fora do conjunto suportado?
- Vale fixar `Speechify-Version` como paliativo imediato antes de trocar o
  código, dado que a janela real até `model_retired` é de ~18 dias?
