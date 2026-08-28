# Assessment Decision: Biblioteca de domínio público dentro do app

- **Slug**: livros-dominio-publico-dentro-app-download
- **Decidido**: 2026-08-28 (revisado no mesmo dia após respostas do usuário às perguntas bloqueantes)
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Hoje não existe nenhuma fonte de conteúdo embutida — usuário novo sem EPUB próprio literalmente não tem o que abrir. Fricção real, não hipotética. |
| Força da evidência | adequate | Evidência técnica é concreta (API testada ao vivo, pipeline de import lido, precedente de CORS confirmado no código). O que falta é evidência de *demanda* — não há dado de quantos usuários hoje abandonam por falta de conteúdo; é inferência de produto, não medição. |
| Valor vs. custo de inação | adequate | Valor de ativação/aprendizado de inglês é claro e alinhado à missão do produto, mas custo de inação é baixo — o app funciona normalmente sem isso, não é bloqueante. |
| Viabilidade / apetite | adequate | Resolvido pelas respostas do usuário: (1) MVP restrito a Android nativo — remove o gap de CORS por completo, `CapacitorHttp` cobre o caso; (2) risco jurídico Brasil x EUA aceito conscientemente, mitigado pela própria curadoria do Standard Ebooks (clássicos com folga confortável sob a regra dos 70 anos), sem exigir motor de regras. Fica `adequate` (não `strong`) porque a integração com o catálogo do Standard Ebooks ainda depende de scraping/lista curada — não há API JSON pública livre (ver seção de Abordagem abaixo) — mas isso é um detalhe de implementação a resolver no `sdd-plan`, não um bloqueio de viabilidade. |
| Fit estratégico | strong | Ataca diretamente 2 dos 3 pilares do produto descritos em CLAUDE.md: "incentivar a leitura" (reduz fricção de primeiro uso) e "aprendizado de inglês" (catálogo em inglês pronto pra Word Lens/TTS). |

## Abordagens Candidatas

### 1. MVP restrito: Standard Ebooks + Android nativo apenas

- Catálogo pequeno mas curado (clássicos já estabelecidos, risco jurídico
  baixo porque a maioria são obras com muito mais de 70 anos desde a morte
  do autor — folga confortável mesmo sob a regra brasileira). Evita o gap
  de CORS rodando só via `CapacitorHttp` nativo (mesmo padrão já usado em
  `FishAudioService.ts`), deixando a Web de fora explicitamente como
  Non-Goal do MVP.
- **Recomendada**: sim — menor superfície de risco (jurídico e técnico)
  pra validar se a demanda existe antes de investir em volume.

### 2. Gutendex como fonte principal, com filtro de segurança Brasil

- Acesso ao catálogo grande do Project Gutenberg (648+ títulos em
  português confirmados, muito mais no total), mas exige lógica de
  filtro extra cruzando data de morte do autor (não só data de
  publicação) pra respeitar a regra dos 70 anos brasileira — dado que o
  Gutendex pode não expor estruturado, precisaria de fonte cruzada
  (ex: Wikidata/Open Library).
- **Recomendada**: não para a primeira fase — evolução natural depois que
  a Abordagem 1 validar pipeline e demanda, e depois que o filtro
  jurídico estiver desenhado.

### 3. Open Library só como enriquecimento de metadados/capa

- Não serve como fonte de arquivo EPUB (a maioria dos links de
  texto-completo do Internet Archive exige "empréstimo" com DRM), mas
  pode melhorar capa/metadados sobre livros baixados via Standard
  Ebooks/Gutendex.
- **Recomendada**: como complemento futuro, não como abordagem própria.

## Veredito

O problema é válido, o fit estratégico é forte, e as duas questões que
antes deixavam **Viabilidade/apetite** como `unknown` foram resolvidas
pelo usuário: MVP restrito a Android nativo (elimina o gap de CORS) e
risco jurídico Brasil x EUA aceito conscientemente, mitigado pela própria
curadoria do Standard Ebooks. Todos os critérios centrais estão em
`adequate`+ — nenhum `weak`/`unknown` restante. Veredito sobe pra `go`.

### Se go — Handoff

- **Problema**: usuário novo abre o NeoReader sem nenhum EPUB próprio e
  não tem o que ler; não existe hoje nenhuma fonte de conteúdo embutida no
  app.
- **Abordagem recomendada**: Abordagem 1 (acima) — Standard Ebooks como
  fonte primária, MVP restrito a Android nativo via `CapacitorHttp`
  (mesmo padrão de `FishAudioService.ts`), download individual por EPUB
  alimentando o `BookImportService.importEpub()` existente sem mudança de
  schema/storage.
- **Escopo sugerido**:
  - Entra: tela de navegação/busca num catálogo curado de Standard
    Ebooks (lista mantida pelo time — ver nota de implementação abaixo,
    já que não há API JSON pública livre do catálogo), download do EPUB
    via URL direta, import automático pelo pipeline existente, capa
    obtida do próprio Standard Ebooks.
  - Fica de fora: Web (CORS), Gutendex/Project Gutenberg completo, Open
    Library como fonte de arquivo, sincronização automática de catálogo
    em background, motor de regras de validação jurídica por título.
  - **Nota de implementação pro `sdd-plan`**: como o Standard Ebooks não
    oferece API JSON gratuita fora do feed OPDS (restrito a
    supporters/sponsors), o catálogo do MVP provavelmente precisa ser uma
    lista curada mantida pelo time (bundled no app ou num JSON estático,
    padrão parecido com o data pack do Word Lens em `public/word-lens/`),
    não uma busca ao vivo no site. Validar tecnicamente no `sdd-plan`.
    Existe sim um feed público e gratuito de novidades, sem login —
    `standardebooks.org/feeds/atom/new-releases` (15 lançamentos mais
    recentes) — que dá pra usar num script de refresh periódico da lista
    curada, sem depender de scraping completo do site a cada atualização.
    O catálogo deles não é estático: foi de ~1.000 títulos (mai/2024) pra
    ~1.398 (mar/2026), ritmo de uns 4-5 lançamentos/semana — vale planejar
    o refresh da lista curada com essa cadência em mente, mesmo que o MVP
    só cubra uma fração curada do catálogo.
  - **Alternativa considerada e descartada nesta fase**: usar a API viva
    do Gutendex com uma allowlist pequena de IDs pré-vetados manualmente
    (ganharia API buscável sem herdar o risco jurídico do catálogo
    completo). Descartada por decisão explícita do usuário — mantém-se
    Standard Ebooks como fonte única do MVP. Registrado aqui caso valha
    revisitar numa fase 2, junto com a Abordagem 2 abaixo.
- **Métricas de sucesso**: % de usuários novos que abrem 1º livro via
  catálogo embutido nas primeiras 24h; downloads via catálogo por usuário
  ativo/mês; taxa de erro de download; zero incidentes de notificação de
  infração de direitos autorais.
- **Perguntas em aberto pro `sdd-specify`**: nenhuma bloqueante — a
  questão técnica de como montar/atualizar a lista curada de Standard
  Ebooks (scraping manual pontual vs. script de build) pode ser resolvida
  já na entrevista da spec ou adiada pro `sdd-plan`.
