# Quickstart: Onboarding com Diferenciais

## Pré-requisitos

- `npm install` já rodado.
- Nenhuma variável de ambiente nova é necessária (feature de conteúdo estático).

## Checagens automatizadas

```powershell
npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm test
npm run build
```

O `tsc`/`build` funcionam como rede de segurança do FR-007: `enMessages` e
`esMessages` usam `satisfies Record<MessageKey, string>` — se uma chave nova
faltar em qualquer um dos 3 locales, o build falha sozinho.

## Cenário manual ponta a ponta

1. `npm run dev` e abrir `http://localhost:5173`.
2. Se o onboarding não aparecer automaticamente (ex.: já visto antes neste
   navegador), limpar o estado local relevante e recarregar — mesmo mecanismo
   já usado hoje pra rever o onboarding em desenvolvimento.
3. Navegar pelos 7 slides com "Proximo" e conferir, na ordem:
   1. Catálogo (50.000 livros) — inalterado.
   2. **TTS Traduzido** — título e descrição citam ouvir um livro em outro
      idioma narrado no idioma do usuário. Deve ser o 1º diferencial novo.
   3. Leitura sem limites — descrição agora cita sincronização via **Google
      Drive**.
   4. Vozes — descrição cita ElevenLabs, Speechify e Fish Audio **e** deixa
      explícito que é preciso conectar a própria chave (BYOK).
   5. **Tradução premium** — cita OpenAI, Google e DeepL com o mesmo aviso de
      chave própria.
   6. **Bibliotecas OPDS** — título em linguagem simples (não abre com a
      sigla "OPDS"), descrição cita Project Gutenberg como exemplo e não
      menciona chave de API.
   7. Progresso — inalterado.
4. No último slide, confirmar que o botão vira "Comecar agora" e conclui o
   fluxo (chama `onComplete`).
5. Reabrir o onboarding e tocar "Pular" em qualquer slide intermediário —
   deve concluir o fluxo imediatamente, sem exigir passar pelos demais.
6. Trocar o idioma do app pra `en` e depois `es` (Configurações > Idioma, ou
   o mecanismo de preferência de locale já existente) e repetir o passo 3
   rapidamente, conferindo que nenhum slide novo aparece com uma chave crua
   (ex.: `welcome.slide.opds.title` aparecendo literalmente na tela em vez do
   texto traduzido).
7. Testar em largura de tela estreita (~360-400px, ex. DevTools mobile
   emulation ou o device Android) que nenhum dos textos novos (em especial os
   que citam 3 marcas) quebra o layout ou empurra os botões pra fora da tela.

## Critério de sucesso

Todos os itens do passo 3 conferem, "Pular"/"Comecar agora" continuam
funcionando (SC-004), e os 3 locales renderizam texto real (SC-001) sem
regressão visual em tela estreita.
