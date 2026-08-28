# Assessment Problem: Biblioteca de domínio público dentro do app

- **Slug**: livros-dominio-publico-dentro-app-download
- **Criado**: 2026-08-28
- **Explora**: ./explora.md

## Problem Statement

Hoje o NeoReader só ganha conteúdo se o usuário já tiver EPUBs próprios pra
importar — não existe nenhuma forma de sair da tela vazia com um livro pra
ler. Isso empurra fricção pro primeiro uso (a pessoa instala o app e não tem
nada pra abrir) e desperdiça a oportunidade de oferecer, de graça, material
de leitura em inglês (que serve diretamente à meta de aprendizado de
idioma do produto).

## Usuários / Partes Afetadas

- **Usuário novo, sem acervo próprio de EPUB** — abre o app pela primeira
  vez e não tem nenhum livro pra experimentar as features (TTS, Word Lens,
  tradução inline) antes de decidir se vale importar sua própria biblioteca.
- **Usuário estudando inglês** — se beneficia de ter clássicos em inglês
  prontos pra ler com Word Lens/TTS, sem precisar caçar EPUB em outro
  lugar.
- **Usuário brasileiro (público majoritário, locale pt-BR)** — é quem
  carrega o risco de compliance se o catálogo oferecido incluir obras que
  são domínio público nos EUA mas ainda protegidas no Brasil (ver Evidência
  Contra em explora.md).

## Goals

- Deixar o usuário sair de "app vazio" pra "tenho um livro pra ler" sem
  precisar trazer arquivo próprio.
- MVP roda em **Android nativo apenas**, usando `CapacitorHttp` (mesmo
  padrão já validado em `FishAudioService.ts`).
- Fonte primária do MVP: **Standard Ebooks** — catálogo pequeno mas
  curado, tipografia de qualidade, download individual livre (sem
  paywall), risco jurídico baixo por já ser um acervo de clássicos com
  folga confortável mesmo sob a regra brasileira de 70 anos.
- Reaproveitar o pipeline de import já existente (`BookImportService`) —
  o livro baixado deve virar um `Book` local normal, sem storage/schema
  paralelo.

## Non-Goals

- Web fica de fora nesta fase — Non-Goal explícito, não um bug a
  resolver depois. Gutendex/CORS/proxy de produção ficam pra uma fase
  futura, se houver.
- Não é objetivo desta primeira versão sincronizar/atualizar automaticamente
  o catálogo em background — a busca/navegação é sob demanda, iniciada pelo
  usuário.
- Não é objetivo oferecer o catálogo completo e irrestrito do Project
  Gutenberg (500k+ obras) — volume bruto não é a métrica de sucesso, valor
  curado é. Gutendex fica de fora do MVP.
- Não é objetivo usar a Open Library API como fonte de arquivo EPUB — só
  como enriquecimento futuro de metadados/capa, se necessário (ver
  Evidência Contra em explora.md).
- Não é objetivo construir um sistema de validação jurídica automatizada
  por título — **decisão do product owner**: a curadoria já embutida do
  Standard Ebooks (clássicos consolidados) é aceita como mitigação
  suficiente do risco Brasil x EUA para o MVP, sem filtro/motor de regras
  adicional.

## Success Metrics

- % de usuários novos (sem import próprio prévio) que abrem pelo menos 1
  livro dentro das primeiras 24h após instalar, via catálogo embutido.
- Nº de downloads via catálogo embutido por usuário ativo/mês.
- Taxa de erro de download (falha de rede, arquivo corrompido, indisponibilidade
  da fonte) — deve ficar baixa o suficiente pra não virar motivo de reclamação/
  avaliação negativa na loja.
- Zero incidentes de notificação de infração de direitos autorais
  relacionados ao catálogo embutido (métrica de risco, não de crescimento —
  mas é a que mais importa pro veredito de "go" aqui).

## Cost of Inaction

Se isso não for feito, o NeoReader continua dependendo 100% do usuário já
ter EPUBs próprios — o app perde a chance de reduzir fricção no primeiro
uso e de se posicionar como ferramenta de aprendizado de inglês com
conteúdo pronto (concorrentes de leitura costumam oferecer alguma forma de
catálogo gratuito de entrada). Não é uma perda crítica/bloqueante — o app
funciona normalmente sem isso — mas é uma oportunidade de aquisição/ativação
deixada na mesa.
