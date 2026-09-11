# Assessment Explora: Tradução Multi-Provedor BYOK (DeepL, OpenAI, Google)

- **Slug**: traduo-multi-provedor-byok-deepl-openai-google
- **Criado**: 2026-09-10
- **Origem**: texto colado (pedido direto do usuário via `/sdd-assess`, com requisitos técnicos já detalhados: BYOK, interface `TranslationProvider`, teste de chave com 7 classificações, contratos de request/response por provedor, regras de fallback)

## Ideia Bruta

Adicionar tradução premium ao leitor via três provedores configuráveis por BYOK
(cada usuário traz sua própria chave), na ordem DeepL → OpenAI → Google Cloud
Translation, atrás de uma interface comum (`TranslationProvider`) que
desacopla o app do formato de cada API. Inclui botão "Testar chave" com
chamada real classificada em 7 categorias de resultado, e uma máquina de
fallback com regras específicas por tipo de erro (retry limitado em
timeout/429/5xx, sem retry em quota/billing, sem fallback automático em erro
de request/bug interno, cancelamento do usuário aborta a cadeia inteira,
fallback automático exige consentimento por poder gerar cobrança).

## Evidência a Favor

- NeoReader já tem tradução inline como feature central e documentada
  (README "Tradução e vocabulário"), diretamente ligada ao objetivo de
  produto "facilitar o aprendizado de inglês" (CLAUDE.md).
- A implementação atual (`src/services/TranslationService.ts`) usa a
  MyMemory API gratuita e pública: sem contexto, sem glossário, sem tom
  literário, sem SLA — 500 caracteres por chamada, cache local por hash.
  Fonte: leitura direta do código, não suposição.
- Já existe precedente arquitetural de BYOK no próprio app, pra TTS premium
  (Speechify, ElevenLabs, Fish Audio): campo de API key por provedor em
  Settings, botão de validação de chave (`ApiKeyValidationCode`:
  empty/valid/invalid/timeout/unavailable/no_credits), fallback automático
  pro TTS nativo quando não configurado (`src/services/TtsProviderRegistry.ts`,
  README seção "TTS"). Isso reduz o risco de introduzir um padrão de UX/arquitetura
  totalmente novo — já foi validado em produção para outra feature.
- Vocabulário salvo (texto original + tradução) já é feature madura; melhorar
  a tradução upstream melhora essa feature de graça, sem redesenhar nada nela.
- ASSUMPTION: provedores premium (DeepL/OpenAI/Google) produzem tradução
  sensivelmente melhor pro caso de uso literário (tom, diálogo, expressões)
  do que a MyMemory — plausível dado o propósito dessas APIs, mas não medido
  dentro do projeto.

## Evidência Contra

- A MyMemory já resolve o caso de uso básico hoje, de graça, sem fricção de
  configuração. Não há bug aberto nem item de backlog pedindo "melhorar a
  qualidade da tradução" — o único item relacionado em
  `.planning/backlog.md` ("Feature: TTS Traduzido") é uma ideia diferente
  (tradução como insumo pro TTS ler em outro idioma, não upgrade da
  tradução inline em si). Não há sinal de demanda documentado, só a
  proposta do próprio usuário.
- BYOK desloca custo e fricção de setup pro usuário (obter e colar até 3
  chaves de API diferentes) — pesado pra um público que majoritariamente só
  quer ler. Ganho de qualidade vs. fricção de adoção é uma troca real, não
  óbvia.
- README confirma explicitamente que as chaves de TTS premium hoje "ficam no
  IndexedDB local do dispositivo" — **sem** Keychain/Keystore. O requisito
  desta nova feature ("avaliar armazenamento seguro com Keychain/Keystore")
  contradiz o padrão já aceito em produção; resolver isso direito é trabalho
  adicional que vai além de "só adicionar tradução", ou a feature aceita
  conscientemente o mesmo nível de risco já em produção.
- `constitution.md` declara o projeto "local-first... sem backend próprio de
  dados de leitura". A opção de backend/vault citada no pedido do usuário
  conflita direto com essa restrição — adotá-la seria mudança de arquitetura
  de projeto (exigiria ADR e aprovação explícita), não decisão de feature.
- Complexidade real: 3 integrações de API diferentes (contratos, auth e
  paginação de erro distintos) + máquina de fallback com regras finas (retry,
  consentimento, "não repetir" por tipo de erro) é ordens de grandeza maior
  que o serviço atual (~130 linhas). Risco de tensionar o princípio
  "Explícito antes de mágico / não desenhar pra requisitos hipotéticos" da
  constitution — em especial o Google como "fallback de cobertura de
  idiomas", quando hoje só 7 idiomas são expostos na UI do app.

## Perguntas em Aberto

- Tradução premium substitui a tradução gratuita atual ou coexiste como
  opção de "upgrade" (MyMemory continua como fallback final sem key)?
- É uma feature Pro-gated (parte da assinatura RevenueCat) ou disponível pra
  qualquer usuário que traga a própria chave, independente do tier?
- O armazenamento seguro (Keychain/Keystore nativo) é requisito bloqueante
  desta feature, ou aceita-se o mesmo nível de risco do padrão TTS atual
  (IndexedDB puro), registrado como risco conhecido a resolver depois?
