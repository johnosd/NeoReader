# Assessment Problem: Tradução Multi-Provedor BYOK (DeepL, OpenAI, Google)

- **Slug**: traduo-multi-provedor-byok-deepl-openai-google
- **Criado**: 2026-09-10
- **Explora**: ./explora.md

## Problem Statement

A tradução inline do NeoReader — a feature que sustenta o objetivo de
"facilitar o aprendizado de inglês" do produto — depende hoje de uma única
API gratuita e genérica (MyMemory), sem contexto literário, tom, diálogo ou
glossário, e sem alternativa para usuários dispostos a usar sua própria
chave de um provedor de tradução melhor.

## Usuários / Partes Afetadas

- Leitores usando o NeoReader pra ler em inglês e aprender vocabulário —
  recebem traduções mecânicas, sem contexto, na feature central de
  tap-to-translate e no vocabulário salvo (que grava a tradução recebida).
- Usuários avançados dispostos a configurar suas próprias chaves de API
  (DeepL/OpenAI/Google) pra melhorar a qualidade — hoje não têm essa opção
  no app, mesmo já existindo um padrão equivalente pra TTS premium.
- John (dono do produto) — precisa decidir, antes de comprometer com
  implementação, a política de armazenamento de chave, se a feature é
  Pro-gated, e se substitui ou coexiste com a tradução gratuita atual.

## Goals

- Permitir tradução inline usando provedores premium configurados pelo
  próprio usuário (BYOK: DeepL, OpenAI, Google Cloud Translation), atrás de
  uma interface comum (`TranslationProvider`) que desacopla o app do
  formato específico de cada API.
- Validar credenciais com uma chamada real por provedor, classificando o
  resultado nas 7 categorias pedidas (válida, inválida, sem permissão,
  quota excedida, billing necessário, erro de rede, indisponibilidade).
- Implementar fallback ordenado (DeepL → OpenAI → Google) só entre
  provedores configurados, habilitados e com credencial já validada
  previamente, com as regras de retry/consentimento especificadas.
- Preservar a tradução gratuita atual (MyMemory) como caminho disponível
  quando nenhum provedor premium estiver configurado ou como fallback final.
- Garantir que nenhuma chave apareça em logs, analytics ou crash reports.

## Non-Goals

- Backend ou vault próprio pra proxear chamadas ou guardar chaves de
  terceiros — contradiz a restrição "local-first, sem backend próprio" da
  `constitution.md`; chamadas são diretas do app pro provedor, como já
  acontece hoje com TTS premium.
- Sincronizar chaves de tradução entre dispositivos.
- Suportar provedores de tradução além dos 3 especificados nesta iteração.
- Resolver definitivamente armazenamento em Keychain/Keystore nativo além do
  nível de risco já aceito hoje pras chaves de TTS premium (IndexedDB puro) —
  a menos que a fase Decide aponte isso como bloqueante.
- Implementar a ideia já registrada no backlog ("TTS Traduzido" — usar
  tradução como insumo pro TTS ler em outro idioma). É uma feature distinta
  que pode reusar o serviço de tradução resultante, mas não faz parte deste
  escopo.

## Success Metrics

- O botão "Testar chave" retorna a classificação correta (dentre as 7
  categorias) pros 3 provedores, verificado contra chamadas reais às APIs.
- As regras de fallback especificadas (timeout/429/5xx → retry limitado e
  depois fallback; chave inválida → desabilita e usa o próximo; quota/billing
  → sem retry, usa o próximo; idioma não suportado → usa o próximo;
  requisição inválida/bug interno → sem fallback automático; cancelamento do
  usuário → aborta toda a cadeia) estão cobertas por testes automatizados.
- Auditoria de `DiagnosticsLogger.ts` e pontos de log/erro confirma que
  nenhuma chave de API aparece em texto plano em eventos de diagnóstico.
- `npm run lint && npm test && npm run build` passam limpos com a feature
  implementada.

## Cost of Inaction

Se nada mudar, a tradução inline continua limitada à qualidade do MyMemory
gratuito — sem contexto, tom ou glossário — travando exatamente o diferencial
de "aprendizado de inglês" que o produto se propõe a entregar (CLAUDE.md).
Usuários dispostos a pagar por uma tradução melhor com a própria chave não
têm essa opção, e o produto perde uma oportunidade de diferenciação frente a
apps de leitura concorrentes que já oferecem tradução assistida por IA.
