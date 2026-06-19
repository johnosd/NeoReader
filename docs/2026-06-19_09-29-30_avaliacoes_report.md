# Analytics de reviews

Fonte: `2026-06-19_09-29-30_avaliacoes.json`
Modelo: `deepseek-v4-flash`
Idioma: `pt-BR`

## Resumo executivo

Moon+ Reader é um app de leitura muito bem avaliado, com média 3.98. Usuários elogiam a personalização extensiva, ferramentas de marcação e dicionário. No entanto, bugs recorrentes como não salvar a posição de leitura e falhas nos realces prejudicam a experiência. Melhorias pedidas incluem sincronização entre dispositivos via login, organização de estantes personalizadas e régua de leitura. O app é viciante e considerado superior a concorrentes, mas anúncios e falta de recursos de nuvem são pontos negativos.

## Principais numeros

- Total de reviews: 100
- Nota media: 3.98
- Periodo: 2021-10-05 ate 2026-05-04
- Tamanho medio dos comentarios: 357.1 caracteres
- Distribuicao de notas:
- 1 estrela(s): 8
- 2 estrela(s): 6
- 3 estrela(s): 13
- 4 estrela(s): 26
- 5 estrela(s): 47
- Versoes mais citadas:
- 8.1: 6
- 7.9.1: 6
- 9.8: 6
- 7.4: 5
- 7.6: 5

## Top bugs relatados

Problemas que parecem atrapalhar uso, estabilidade ou confianca.

### 1. Posição de leitura não é salva e livro reinicia

Implementar persistência confiável da posição de leitura, evitando reinícios após fechar o app ou trocar de celular. Considerar salvamento automático frequente.

- Prioridade: alta
- Frequencia: 5
- Nota media: 2.8
- Versoes: 10.5, 7.0, 7.1, 7.9.1, 8.3
- Reviews: nao informado
- Evidencias:
  - "volta para primeira página"
  - "volta sozinho para início do arquivo"
  - "reinicia todo o livro"

### 2. Função de realce/marcação de texto com falhas

Aprimorar a função de marcação para que as cores sejam aplicadas corretamente, as anotações fiquem visíveis e não desapareçam ao limpar cache ou reiniciar.

- Prioridade: alta
- Frequencia: 5
- Nota media: 3.6
- Versoes: 7.9.1, 8.1, 9.1, 9.9
- Reviews: nao informado
- Evidencias:
  - "marcações não aparecem"
  - "marcador não vai na frase certa"
  - "anotações difíceis de diferenciar"

### 3. App fecha ou trava ao usar

Corrigir travamentos e fechamentos inesperados do aplicativo, especialmente após atualizações. Investigar possível memory leak ou conflito com anúncios.

- Prioridade: alta
- Frequencia: 2
- Nota media: 1.0
- Versoes: 7.1, 8.3
- Reviews: nao informado
- Evidencias:
  - "travamentos e fechamento do aplicativo"
  - "app não abre mais"

### 4. Importação de livros apresenta erros

Resolver falha ao definir pasta principal e permitir importação direta de nuvem (Google Drive). Melhorar detecção automática de arquivos.

- Prioridade: media
- Frequencia: 4
- Nota media: 4.0
- Versoes: 10.4, 8.1, 9.4
- Reviews: nao informado
- Evidencias:
  - "failed to set main folder"
  - "não exportar livros do drive"
  - "não exibe arquivos automaticamente"

### 5. Brilho da tela não ajusta corretamente

Corrigir controle de brilho que fica muito escuro ou não responde a configurações. Possível conflito com modo noturno.

- Prioridade: media
- Frequencia: 3
- Nota media: 2.33
- Versoes: 7.1, 7.7, 8.0
- Reviews: nao informado
- Evidencias:
  - "tela fica muito escura"
  - "não ajusta brilho"
  - "modo escuro distorce cores"

### 6. Estante de livros embaralha sozinha

Implementar ordenação persistente e impedir que novos livros baguncem a organização personalizada.

- Prioridade: media
- Frequencia: 2
- Nota media: 3.5
- Versoes: 7.9.1, 8.1
- Reviews: nao informado
- Evidencias:
  - "livros embaralham sozinhos"
  - "organização personalizada não se mantém"

## Top oportunidades de melhoria

Melhorias incrementais que podem aumentar satisfacao ou reduzir friccao.

### 1. Implementar sincronização via login na nuvem

Adicionar criação de conta para sincronizar progresso, anotações, marcadores e biblioteca entre dispositivos, evitando perda de dados.

- Prioridade: alta
- Frequencia: 5
- Nota media: 4.2
- Versoes: 10.2, 7.3, 9.1, 9.7, 9.8
- Reviews: nao informado
- Evidencias:
  - "sincronização com GDrive salva vidas"
  - "fazer login para não perder dados"
  - "backup na nuvem"

### 2. Redução de anúncios ou opção de remoção menos intrusiva

Repensar frequência e posicionamento de anúncios (ex: evitar anúncios no início da leitura, ou modelar como vídeo opcional por 48h já existente).

- Prioridade: media
- Frequencia: 5
- Nota media: 2.8
- Versoes: 10.2, 6.1, 7.5, 9.1, 9.9
- Reviews: nao informado
- Evidencias:
  - "anúncios extremamente repetitivos"
  - "fechar anúncio fecha o app"
  - "anúncios atrapalham a experiência"

### 3. Mostrar número da página total do livro

Adicionar exibição de página atual e total de páginas (não apenas porcentagem ou capítulo) para melhor acompanhamento.

- Prioridade: media
- Frequencia: 4
- Nota media: 4.0
- Versoes: 7.3, 7.9.1, 8.1
- Reviews: nao informado
- Evidencias:
  - "quero saber em quantas páginas estou"
  - "aparece apenas porcentagem"
  - "número da página no total"

### 4. Melhorar organização da estante com pastas e etiquetas

Permitir criação de prateleiras/pastas personalizadas com ordenação fixa e filtros avançados (como abandonados, pausados).

- Prioridade: media
- Frequencia: 3
- Nota media: 4.0
- Versoes: 10.2, 7.9.1, 9.8
- Reviews: nao informado
- Evidencias:
  - "criar estantes específicas"
  - "pastas separadas"
  - "opção de largados/abandonados"

### 5. Adicionar rolagem contínua sem quebra de capítulo

Implementar modo de rolagem contínua que una todos os capítulos em uma página infinita, ou suavizar a transição entre capítulos.

- Prioridade: media
- Frequencia: 3
- Nota media: 3.0
- Versoes: 10.3, 9.8
- Reviews: nao informado
- Evidencias:
  - "rolagem contínua sem interrupção"
  - "salto brusco de uma página para outra"
  - "divisão horrorosa das páginas"

### 6. Régua de leitura para PDF

Implementar régua de leitura (como no Kindle) para PDF, facilitando acompanhamento visual. Recurso já foi adicionado para ePubs, mas pedido para PDF.

- Prioridade: media
- Frequencia: 2
- Nota media: 4.5
- Versoes: 9.1, 9.7
- Reviews: nao informado
- Evidencias:
  - "régua de leitura para PDF"
  - "régua de leitura adicionada recentemente"

## Features novas mais pedidas

Novas capacidades explicitamente pedidas pelos usuarios.

### 1. Sincronização entre dispositivos via login

Adicionar sistema de conta para sincronizar biblioteca, progresso e anotações na nuvem.

- Prioridade: alta
- Frequencia: 5
- Nota media: 4.2
- Versoes: 10.2, 7.3, 9.1, 9.7, 9.8
- Reviews: nao informado
- Evidencias:
  - "sincronização com GDrive salva vidas"
  - "fazer login para não perder dados"
  - "backup na nuvem"

### 2. Número da página total do livro

Exibir página atual e total de páginas, não apenas porcentagem ou capítulo.

- Prioridade: baixa
- Frequencia: 4
- Nota media: 4.0
- Versoes: 7.3, 7.9.1, 8.1
- Reviews: nao informado
- Evidencias:
  - "quero saber em quantas páginas estou"

### 3. Estantes personalizadas com pastas e etiquetas

Criar sistema de pastas ou etiquetas para organizar a biblioteca de forma fixa e categorizada (ex: lidos, abandonados, por gênero).

- Prioridade: media
- Frequencia: 3
- Nota media: 4.0
- Versoes: 10.2, 7.9.1, 9.8
- Reviews: nao informado
- Evidencias:
  - "criar estantes específicas"
  - "pastas separadas"
  - "opção de largados/abandonados"

### 4. Rolagem contínua perfeita (infinite scroll)

Adicionar modo de rolagem infinita sem quebras entre capítulos, ou suavizar a transição.

- Prioridade: media
- Frequencia: 3
- Nota media: 3.0
- Versoes: 10.3, 9.8
- Reviews: nao informado
- Evidencias:
  - "rolagem contínua sem interrupção"

### 5. Régua de leitura para PDF

Implementar régua de leitura (linha guia) para PDF, já que para ePUB existe.

- Prioridade: media
- Frequencia: 2
- Nota media: 4.5
- Versoes: 9.1, 9.7
- Reviews: nao informado
- Evidencias:
  - "régua de leitura para PDF"

## Features que os usuarios amam

Recursos e atributos que aparecem como motivos de satisfacao.

### 1. Personalização extensiva da leitura

Usuários amam a capacidade de alterar cor da página, fonte, espaçamento, modo noturno e filtro de luz. É o diferencial do app.

- Prioridade: alta
- Frequencia: 8
- Nota media: 5.0
- Versoes: 6.9, 7.2, 7.4, 7.5, 8.0, 8.3, 9.2, 9.4
- Reviews: nao informado
- Evidencias:
  - "mudar cor da página, filtro de luz"
  - "temas e criação deles"
  - "cor da página e modo noturno"

### 2. Ferramentas de anotação e marcação

Recursos como grifar, sublinhar, anotar e compartilhar citações são muito elogiados, especialmente a variedade de cores.

- Prioridade: alta
- Frequencia: 6
- Nota media: 5.0
- Versoes: 10.1, 7.4, 7.5, 8.3, 9.3, 9.4
- Reviews: nao informado
- Evidencias:
  - "dicionário, notas, formas de sublinhar"
  - "grifar frases e ler off-line"
  - "marcar citação com várias cores"

### 3. Suporte a vários formatos de arquivo

Capacidade de ler PDF, ePub, Mobi, TXT e outros sem necessidade de conversão.

- Prioridade: alta
- Frequencia: 5
- Nota media: 5.0
- Versoes: 10.2, 7.4, 7.6, 8.3, 9.5
- Reviews: nao informado
- Evidencias:
  - "lê epub muito bem"
  - "até com pdf é possível mudar fonte"
  - "variedade de formatos"

### 4. Leitura offline e backup

Funciona sem internet e oferece backup manual confiável.

- Prioridade: media
- Frequencia: 3
- Nota media: 5.0
- Versoes: 6.9, 7.4, 7.5
- Reviews: nao informado
- Evidencias:
  - "funciona off line"
  - "fazer backup antes de desinstalar"

### 5. Régua de leitura (adicionada recentemente)

A nova régua de leitura foi muito bem recebida, recurso ausente em concorrentes.

- Prioridade: media
- Frequencia: 2
- Nota media: 5.0
- Versoes: 10.3, 9.7
- Reviews: nao informado
- Evidencias:
  - "fiquei APAIXONADA pela nova atualização com as réguas de leitura"

## Backlog sugerido

1. **Corrigir bug de não salvar posição de leitura**
   - Categoria: bug
   - Prioridade: alta
   - Racional: Bug recorrente com impacto severo na experiência; múltiplos relatos com notas baixas.
   - Reviews: 015872cd, 6a08572b, 1f1943ec, a36171b3
2. **Corrigir falhas na ferramenta de realce**
   - Categoria: bug
   - Prioridade: alta
   - Racional: Função principal de marcação com defeito; causa frustração e abandono do app.
   - Reviews: 96b37268, 365e2e2e, 75db82ef, 1688a01e
3. **Implementar sincronização via login na nuvem**
   - Categoria: feature
   - Prioridade: alta
   - Racional: Pedido recorrente; evita perda de dados e permite continuidade entre dispositivos. Diferencial competitivo.
   - Reviews: 1ebc76b8, 009e0287, f3ed9022, 9e37880a
4. **Adicionar régua de leitura para PDF**
   - Categoria: feature
   - Prioridade: media
   - Racional: Funcionalidade já existente para ePUB; estender para PDF atende demanda dos usuários.
   - Reviews: dbda065a, 23524279
5. **Melhorar organização da estante com pastas e etiquetas**
   - Categoria: melhoria
   - Prioridade: media
   - Racional: Usuários querem personalizar a biblioteca; atualmente bagunça sozinha, o que gera insatisfação.
   - Reviews: 43c91e80, 6cd10f69, 20ce52b3
6. **Otimizar anúncios para não fechar o app**
   - Categoria: bug
   - Prioridade: media
   - Racional: Bug específico que fecha app ao fechar anúncio; afeta usabilidade da versão gratuita.
   - Reviews: b7bf0277
7. **Exibir número da página total do livro**
   - Categoria: melhoria
   - Prioridade: baixa
   - Racional: Demanda consistente, mas de baixa urgência; melhora o acompanhamento de leitura.
   - Reviews: 129217f3, 276f8141, b00cd223
8. **Implementar rolagem contínua sem quebra de capítulo**
   - Categoria: melhoria
   - Prioridade: media
   - Racional: Desejo de leitura infinita; melhora experiência para leitores em modo rolagem.
   - Reviews: a36716be, b4fff4bf
9. **Reduzir frequência de anúncios**
   - Categoria: melhoria
   - Prioridade: media
   - Racional: Queixas comuns sobre anúncios excessivos; considerar modelo de 48h sem anúncios após vídeo já existe, mas notificação pode ser melhorada.
   - Reviews: dc692fa3, 6c2e5401, 18d9327a

## Apendice: metodologia

As metricas numericas sao calculadas localmente a partir do JSON de reviews. A classificacao semantica, o agrupamento de temas e os resumos sao gerados pela DeepSeek em JSON estruturado. Insights abaixo do `min-theme-count` sao filtrados.
