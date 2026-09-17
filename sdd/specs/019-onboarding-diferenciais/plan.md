# Implementation Plan: Onboarding com Diferenciais (TTS Traduzido, Vozes e Tradução Premium, OPDS, Sync)

**Slug**: `019-onboarding-diferenciais` | **Date**: 2026-09-16 | **Spec**: `sdd/specs/019-onboarding-diferenciais/spec.md`

## Summary

Expandir o carrossel de onboarding in-app (`src/screens/WelcomeScreen.tsx`, exibido
antes do login/cadastro) de 4 para 7 slides, comunicando os 5 diferenciais da
spec sem redesenhar visualmente a tela. Três diferenciais viram slides novos
(TTS Traduzido, Tradução premium por provedor, Biblioteca OPDS); dois entram
como ajuste de copy em slides já existentes que já tocam no mesmo tema
(Vozes premium reforça o slide "Leia com vozes" com aviso explícito de BYOK;
Sync na nuvem reforça o slide "Leia sem limites" citando o Google Drive). Todo
texto novo segue o padrão de i18n já existente (`src/i18n/messages.ts`, 3
locales: pt-BR/en/es) — inclusive a convenção descoberta de que essas strings
não usam acentuação (ASCII puro), presente em 100% das mensagens atuais do
arquivo.

## Technical Context

**Language/Version**: TypeScript ~6.0.2 / React 19.2.4

**Primary Dependencies**: lucide-react ^1.8.0 (ícones já em uso no projeto — nenhuma dependência nova); sistema de i18n local próprio em `src/i18n/` (sem lib externa)

**Storage**: N/A — feature de conteúdo estático, sem leitura/escrita em Dexie/IndexedDB

**Testing**: Vitest ^4.1.4 + @testing-library/react ^16.3.2 (`src/__tests__/screens/WelcomeScreen.test.tsx`)

**Target Platform**: Android (Capacitor) + Web — mesma tela, sem código nativo envolvido

**Performance Goals**: N/A — troca de texto/ícones num componente já renderizado, sem novo custo de runtime

**Constraints**: Layout mobile-first (~360-400px de largura mínima) já usado pelos slides atuais; textos novos devem caber no mesmo padrão de 1-2 frases sem exigir scroll dentro do slide

**Scale/Scope**: 1 componente (`WelcomeScreen.tsx`), 1 arquivo de mensagens (`messages.ts`, 3 blocos de locale), 1 arquivo de teste — sem novas rotas, serviços ou tabelas

## Decisões Invariantes

- **7 slides, não mais**: os 3 slides existentes que não fazem parte dos 5 diferenciais desta feature (Catálogo/50 mil livros, e os 2 que recebem só ajuste de copy) continuam existindo — nenhum é removido. Isso respeita a Assumption da spec de não fazer informação já comunicada desaparecer sem substituto. Cortar para menos de 7 exigiria fundir conceitos distintos numa mesma descrição, o que violaria o padrão de "uma ideia por slide" já estabelecido e o limite de comprimento de texto (Edge Case da spec).
- **Vozes premium e Sync não ganham slide próprio** — entram como ajuste de copy nos slides "Vozes" e "Leitura sem limites" respectivamente, porque esses slides já comunicam exatamente esse tema hoje (evita repetir o mesmo assunto em 2 slides seguidos, o que a spec não pede e prejudicaria o ritmo do carrossel).
- **Ordem final dos 7 slides**: Catálogo → **TTS Traduzido (novo)** → Leitura sem limites (+ sync) → Vozes (+ BYOK) → **Tradução premium (novo)** → **Bibliotecas OPDS (novo)** → Progresso. TTS Traduzido logo depois do slide de abertura garante que seja o primeiro diferencial que o usuário vê (cumpre FR-002 com folga) sem mexer no slide de abertura em si.
- **Convenção de string sem acento é mandatória**: toda nova entrada em `messages.ts` (pt-BR e es) segue o padrão ASCII já usado em 100% das ~800 chaves existentes (ex.: `'Faca marcacoes'`, não `'Faça marcações'`). Isso não é uma limitação técnica nova sendo imposta — é a convenção real já em vigor no arquivo, e quebrá-la criaria inconsistência visível entre strings antigas e novas.
- **"OPDS" não é a palavra de abertura do slide correspondente** — o título usa linguagem simples ("Conecte outras bibliotecas"); "OPDS" aparece só na descrição, como detalhe técnico secundário, conforme Edge Case da spec.
- **Glow color de cada slide novo segue o padrão existente** (valor `rgba(...)` literal inline no array `slides`, não um token Tailwind) — é o padrão já usado pelos 4 slides atuais; introduzir tokens aqui seria um refactor fora do escopo desta feature (Princípio III da constitution: não abstrair além do que a tarefa exige).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | PASS — feature pequena (2 arquivos de código + 1 de teste), mas este plan.md já documenta os arquivos afetados antes de codar | PASS | Estrutura final (7 slides, ordem, arquivos) fechada abaixo em Project Structure |
| II. Comentários só onde o "porquê" não é óbvio | PASS | PASS | Único ponto não óbvio é a decisão de reaproveitar slides existentes em vez de criar novos para Vozes/Sync — vira comentário curto no array `slides` explicando por quê, não o quê |
| III. Explícito antes de mágico | PASS | PASS | Nenhuma abstração nova; mesmo padrão de array de objetos + `t(key)` já usado pelos 4 slides atuais, só com mais entradas |
| IV. Build limpo é a definição de "pronto" | PASS (verificável via `npx tsc -p tsconfig.app.json --noEmit` e `npm run build`) | PASS — design fixa o comando exato de verificação em `quickstart.md`/`tasks.md` (T026, T028); execução real do build acontece no `sdd-execute` | `en`/`es` usam `satisfies Record<MessageKey, string>` — o build já falha sozinho se uma chave nova faltar em algum dos 3 locales, dando rede de segurança automática pro FR-007 |
| V. Dependências novas exigem justificativa | PASS — nenhuma dependência nova (ícones novos vêm do lucide-react já instalado: `Languages`, `Globe`, `Rss`, todos já usados em outras telas do app) | PASS | N/A |

Nenhuma violação — não há necessidade de `## Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/019-onboarding-diferenciais/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1 — checagens automatizadas + cenário manual ponta a ponta
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

Sem `research.md` (nenhuma incerteza técnica genuína — providers, ícones e
padrão de i18n já existem e foram confirmados na exploração) e sem
`data-model.md`/`contracts/` (nenhuma entidade nova, nenhuma superfície de
API tocada).

### Source Code (repository root)

```text
src/
├── screens/
│   └── WelcomeScreen.tsx          # Componente do onboarding — array `slides` cresce de 4 para 7 entradas + 3 novos imports de ícone
├── i18n/
│   └── messages.ts                 # 3 blocos de locale (ptBRMessages, enMessages, esMessages) — 6 chaves novas + 2 chaves de descrição ajustadas em cada bloco (18 + 6 edições no total)
└── __tests__/
    └── screens/
        └── WelcomeScreen.test.tsx  # Atualiza a sequência de headings esperada pro novo carrossel de 7 slides
```

**Structure Decision**: Projeto único (SPA React), sem separação backend/frontend.
Esta feature toca só os 3 arquivos acima — nenhum novo diretório, rota, service
ou tabela Dexie.

## Complexity Tracking

N/A — Constitution Check não teve violações.

## Estratégia de Testes

Prioridade: unitário (Testing Library sobre `WelcomeScreen`) → build/type-check
como rede de segurança de i18n → manual num browser real antes de reportar
concluído (regra de ouro do `CLAUDE.md` para UI).

`WelcomeScreen.test.tsx` já cobre o fluxo ponta a ponta clicando "Proximo" até
o fim e testando "Pular" — esta feature estende o mesmo teste pra 7 headings
na nova ordem, sem mudar sua abordagem. Não há teste de contrato/integração
aplicável (sem API/serviço novo) nem E2E automatizado além do que já existe.

Comandos-base:

```powershell
npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm test
npm run build
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (ícones) | Concluído |
| US1 (TTS Traduzido) | Concluído — slide na 2ª posição, 3 locales |
| US2 (Vozes + BYOK) | Concluído — descrição atualizada, 3 locales |
| US3 (Tradução premium) | Concluído — slide novo, 3 locales |
| US4 (OPDS) | Concluído — slide novo, 3 locales |
| US5 (Sync) | Concluído — descrição atualizada, 3 locales |
| Polish (T025/T026/T028) | Concluído — teste consolidado reescrito e passando, `tsc`/lint/test/build limpos |
| Fase 8 (logos reais) | Concluído — pills com logo real nos slides de Vozes e Tradução premium, validado visualmente via Playwright |
| Fase 9 (cards com legenda) | Concluído — pills viraram cards (logo + nome + legenda) num row horizontal scrollável, estilo pedido pelo usuário a partir de `providers_traducao.png`, com texto real localizável |
| Polish (T027 — manual) | Pendente — usuário vai rodar o cenário manual de `quickstart.md`, agora contra o visual final |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Onboarding cresce de 4 para 7 slides — risco de fadiga/abandono antes do fim do carrossel | Médio (UX) | "Pular" continua disponível em qualquer slide (FR-008) e os pontos de navegação permitem pular direto pra qualquer slide; nenhuma mudança nesse mecanismo é necessária. Se a métrica de conclusão do onboarding cair após o lançamento, é um sinal pra uma feature futura de consolidação, não um bloqueio desta |
| R-002 | Textos citando 3 marcas numa frase só (ex.: "Speechify, ElevenLabs ou Fish Audio") podem estourar 2 linhas em telas muito pequenas (~360px) | Baixo | Resolvido: validado visualmente via Playwright em viewport 390×844 — os pills de logo (Fase 8) quebram em 2 linhas (`flex-wrap`) sem estourar o layout |
| R-003 | Usuário rejeitou a 1ª entrega (Fase 2-7): ícones genéricos do lucide-react nos slides de Vozes/Tradução premium em vez dos logos reais das marcas citadas | Alto (UX/credibilidade) | Resolvido na Fase 8: logos reais baixados dos kits oficiais (via `docs/wellcome-page/logos_providers.html`) para os 3 providers de tradução (não existiam no projeto); os 3 de TTS já existiam em `src/assets/tts-providers/` e foram reaproveitados. Ambos os slides agora mostram uma fileira de pills com logo + nome, no mesmo padrão visual (pill escuro, borda, sombra) já usado no box de ícone único dos demais slides — sem introduzir um estilo visual novo/diferente do design system do app |
| R-004 | Usuário pediu pra usar `docs/wellcome-page/providers_traducao.png` diretamente — mas o arquivo tem texto em português desenhado nos pixels (não localizável) e paleta azul fora do tema do app | Médio (i18n/identidade visual) | Esclarecido com o usuário: adotado o ESTILO do card (logo grande + nome + legenda curta) em vez do arquivo literal. Resolvido na Fase 9 — 6 chaves de legenda novas (`welcome.provider.<slug>.caption`) nos 3 locales, cards nas cores do app |
| R-005 | 1ª implementação dos cards (Fase 9) usava `justify-center` + `w-max mx-auto` no container de scroll — bug conhecido de flexbox: conteúdo mais largo que a viewport com `justify-content:center` deixa o início do conteúdo inacessível (scrollLeft=0 não mostra o 1º card) | Médio (bug de UX, pego antes de reportar) | Resolvido na Fase 9 (T035): trocado por row simples alinhado à esquerda, sem `justify-*`, igual ao padrão real das rows horizontais de livros do app. Validado via Playwright: scroll até o fim revela o 3º card corretamente |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-16 | Fase 1 (Setup) | T001 concluída: import de `Languages`, `Globe`, `Rss` adicionado em `WelcomeScreen.tsx` | Nenhuma |
| 2026-09-16 | Fases 2-6 (US1-US5) | Implementação de conteúdo completa: 3 slides novos inseridos no array `slides` (TTS Traduzido, Tradução premium, OPDS) + 2 descrições ajustadas (Vozes com BYOK, Leitura com Google Drive), todas nos 3 locales (pt-BR/en/es) | Nenhuma — testes de fase (T006/T010/T015/T020/T024) deliberadamente adiados e incorporados na reescrita única de T025 (evita reescrever o mesmo arquivo de teste 5 vezes) |
| 2026-09-16 | Fase 7 (Polish, parcial) | T025 (teste reescrito, 7 slides + asserções de BYOK/Google Drive/ausência de chave), T026 (`tsc --noEmit` limpo), T028 (`npm run lint && npm test && npm run build` — 1065 testes passando, build ok) | T027 (cenário manual de `quickstart.md`) fica para o usuário rodar |
| 2026-09-16 | Fase 8 (feedback do usuário) | Usuário rejeitou o resultado visual (R-003): faltavam os logos reais dos providers, e pediu design melhor seguindo o design system do app. Baixados 3 SVGs oficiais (OpenAI/Google/DeepL, via `docs/wellcome-page/logos_providers.html`) para `src/assets/translation-providers/`; reaproveitados os 3 já existentes de TTS; `WelcomeScreen.tsx` ganhou renderização de "pills" com logo real + nome pros 2 slides multi-provider. Revalidado `tsc`/lint/test/build + visual via Playwright (390×844) | T027 continua com o usuário |
| 2026-09-16 | Fase 9 (feedback do usuário #2) | Usuário apontou `providers_traducao.png` como referência de estilo (R-004) — mas o arquivo tem texto PT fixo/paleta fora do tema, então adotamos o estilo (card grande + logo + nome + legenda) com texto real. 6 chaves `welcome.provider.<slug>.caption` novas nos 3 locales; pills viraram cards num row horizontal scrollável ("Netflix for Books"). Bug de centralização (R-005) pego e corrigido antes de reportar. Revalidado `tsc`/lint/test/build + visual via Playwright, incluindo scroll até o 3º card | T027 continua com o usuário |

**PRÓXIMO**: T027 — cenário manual de `quickstart.md` (usuário roda `npm run dev` e segue os 7 passos), agora contra o visual final com cards + legendas.

## Arquivos Principais

- `src/screens/WelcomeScreen.tsx` — array `slides` com 7 entradas (3 novas: TTS Traduzido, Tradução premium, OPDS); slides de Vozes e Tradução premium renderizam row horizontal scrollável de cards (logo real + nome + legenda, `providers?: ProviderBadge[]`) em vez de ícone único
- `src/i18n/messages.ts` — 6 chaves de slide + 6 chaves de legenda de provider (`welcome.provider.*.caption`) novas, e 2 descrições ajustadas, nos 3 blocos de locale (`ptBRMessages`, `enMessages`, `esMessages`)
- `src/__tests__/screens/WelcomeScreen.test.tsx` — reescrito para cobrir os 7 slides e as asserções de conteúdo (BYOK, Google Drive, ausência de "chave" no OPDS)
- `src/assets/translation-providers/{openai,google,deepl}.svg` — logos novos (openai/deepl com `fill="#f8fafc"` adicionado; google sem alteração, já colorido)

## Cuidados para Retomada

- Este projeto **não** tem `@testing-library/jest-dom` registrado no ambiente
  de teste — `expect(...).toBeInTheDocument()` falha com "Invalid Chai
  property". Para afirmar ausência de elemento, usar
  `expect(screen.queryByText(...)).toBeNull()` (padrão já usado em toda a
  suíte, ex.: `IntegrationHelpBanner.test.tsx`, `ErrorBoundary.test.tsx`).
