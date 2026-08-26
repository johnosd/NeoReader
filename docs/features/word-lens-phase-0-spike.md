# Word Lens: Relatorio Do Spike De Fontes E Cobertura

## Metadados

- Data: 2026-07-13.
- Fase: 0 - validacao de fontes e cobertura.
- Status: concluido; fontes, C1/C2, morfologia, cobertura minima e aparelho/budget definidos.
- Metodo: downloads processados em memoria; nenhuma fonte bruta proprietaria ou texto dos EPUBs foi persistido no repositorio.

## Fontes Fixadas No Spike

| Fonte | URL | Bytes | SHA-256 |
|---|---|---:|---|
| CEFR-J Vocabulary Profile 1.5 | `https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv` | 233.214 | `b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498` |
| Octanove C1/C2 1.0 | `https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv` | 46.462 | `18c33a407f2f89f7b8de9671c6d45fe3ea0bce45e7d2d7dcaab48d73e0f7b380` |
| Open English WordNet 2025 XML gzip | `https://en-word.net/static/english-wordnet-2025.xml.gz` | 11.363.503 | `9ca6d1dcb75f822fdd66617f7d9da48142ace38dd544d6ad5e2feca1674ad3fe` |

Licencas declaradas pelas fontes:

- CEFR-J: uso gratuito em pesquisa e comercial mediante citacao, conforme README do Open Language Profiles.
- Octanove C1/C2: CC BY-SA 4.0.
- Open English WordNet 2025: CC BY 4.0, tambem declarado no XML (`license`) e no site oficial.

Esta verificacao documenta os termos publicados, mas nao substitui aprovacao juridica/produto sobre ShareAlike.

## Estrutura E Contagens CEFR

### CEFR-J 1.5

- 7.799 registros.
- 6.863 headwords unicos apos `casefold`.
- 850 headwords aparecem mais de uma vez.
- 573 headwords possuem niveis diferentes conforme classe gramatical.

| Nivel | Registros |
|---|---:|
| A1 | 1.164 |
| A2 | 1.411 |
| B1 | 2.446 |
| B2 | 2.778 |

Exemplos de conflito por POS: `access` e B1 como substantivo e B2 como verbo; `address` e A1 como substantivo e B1 como verbo.

### Octanove C1/C2 1.0

- 2.136 registros.
- 1.955 headwords unicos.
- 163 headwords aparecem mais de uma vez.
- 26 headwords possuem conflito C1/C2.
- 1.111 registros C1 e 1.025 registros C2.
- Foram encontrados dois valores POS que exigem saneamento: um vazio e um `vern`, provavelmente typo de `verb`.

### Cruzamento E Regra Simples

- 165 headwords do Octanove ja aparecem no CEFR-J A1-B2.
- Ao combinar as fontes e escolher o menor nivel por grafia, resultam 8.653 headwords.
- Distribuicao resolvida: A1 1.064; A2 1.243; B1 2.139; B2 2.417; C1 914; C2 876.

Decisao recomendada para o MVP simples: usar o menor nivel por grafia. Essa regra reduz falsos positivos, mas perde a distincao por POS/sentido. POS tagging no leitor nao e recomendado no MVP por custo e complexidade.

## Cobertura Do Open English WordNet 2025

O arquivo possui 135.969 entradas lexicais, 127.311 lemas unicos e 107.519 synsets.

| Nivel resolvido | Headwords | Com entrada/definicao | Cobertura | Com algum exemplo | Cobertura de exemplo |
|---|---:|---:|---:|---:|---:|
| A1 | 1.064 | 977 | 91,8% | 801 | 75,3% |
| A2 | 1.243 | 1.188 | 95,6% | 930 | 74,8% |
| B1 | 2.139 | 2.064 | 96,5% | 1.638 | 76,6% |
| B2 | 2.417 | 2.300 | 95,2% | 1.678 | 69,4% |
| C1 | 914 | 858 | 93,9% | 654 | 71,6% |
| C2 | 876 | 788 | 90,0% | 561 | 64,0% |
| Total | 8.653 | 8.175 | 94,5% | 6.262 | 72,4% |

Conclusao: o WordNet e viavel para o incremento de clique, desde que a UI aceite definicao ausente em cerca de 5,5% das grafias e exemplo ausente em cerca de 27,6%. Definicoes podem ser tecnicas e multiplos sentidos exigem uma lista, nao selecao contextual automatica.

## Cobertura Em EPUBs Reais

Foi usado lookup exato apos tokenizacao simples, casefold e normalizacao de apostrofo, ainda sem lematizacao. A amostra local inclui ficcao, nao ficcao e livros tecnicos em ingles. Somente contagens agregadas foram registradas.

| Livro/amostra | Tokens | Grafias unicas | Tokens cobertos | Grafias cobertas |
|---|---:|---:|---:|---:|
| AI Engineering | 171.338 | 8.234 | 73,5% | 36,2% |
| Classic Goosebumps 1-4 | 88.012 | 5.177 | 72,6% | 44,0% |
| Designing Data-Intensive Applications | 229.296 | 10.059 | 72,7% | 30,8% |
| The Housemaid | 91.532 | 5.843 | 80,5% | 46,8% |
| The Let Them Theory | 88.967 | 5.618 | 83,1% | 46,4% |
| The Lightning Thief | 91.652 | 7.492 | 75,3% | 40,3% |

As ausencias frequentes incluem:

- fragmentos de contracoes (`s`, `t`, `ve`, `ll`, `didn`);
- flexoes (`models`, `using`, `applications`, `said`, `going`, `looked`);
- nomes proprios;
- termos tecnicos e siglas.

Conclusao: headword-only nao e cobertura suficiente. O pipeline deve gerar um mapa morfologico forma -> lema e a tokenizacao deve tratar contracoes inglesas como unidades/regras explicitas. Nomes proprios e termos tecnicos sem CEFR permanecem sem marcacao.

### Spike morfologico

A distribuicao WNDB do Open English WordNet 2025 inclui listas de excecoes para substantivos, verbos, adjetivos e adverbios. Um primeiro experimento combinou essas excecoes com as regras morfologicas WordNet:

- lookup exato: 72,6%-83,1% dos tokens;
- regras sem restricao de POS: 85,8%-92,3%, ganho de 8,4-13,8 pontos percentuais;
- regras restringindo candidatos ao POS cadastrado do lema: 85,2%-91,9%, ganho de 8,2-13,1 pontos percentuais;
- ambiguidades observadas cairam para 18 formas no corpus combinado.

O experimento tambem encontrou falso positivo mesmo apos a restricao, por exemplo `nodes -> nod`, porque a forma permite mais de uma analise sem conhecer o POS da frase. Portanto, o runtime nao deve aplicar regras inversas e escolher silenciosamente um candidato.

Politica recomendada para a Fase 1:

1. Gerar formas no sentido lema -> flexoes durante o build, usando POS e excecoes WordNet.
2. Criar mapa forma -> lema somente para relacoes deterministicas.
3. Rejeitar/relatar colisoes entre lemas em vez de escolher por menor nivel.
4. Manter lookup exato para a propria forma antes do mapa morfologico.
5. Validar manualmente amostra das formas mais frequentes e medir novamente a cobertura.

## Benchmark Privado Oxford

Os PDFs foram lidos apenas em memoria e usados para contagens agregadas. Nenhuma entrada Oxford foi salva no repositorio ou sera distribuida.

- Oxford 3000: parser aproximado encontrou 2.978 headwords unicos; 2.875 (96,5%) existem na combinacao CEFR-J/Octanove.
- Entre os overlaps do Oxford 3000, o mesmo nivel ocorreu em 54,3%; a combinacao aberta classificou 892 em nivel menor e 423 em nivel maior.
- Oxford 5000 adicional: parser encontrou 1.995 headwords unicos; 1.454 (72,9%) existem na combinacao aberta.
- Entre os overlaps adicionais, o mesmo nivel ocorreu em 23,6%; a combinacao aberta classificou 1.058 em nivel menor e 53 em nivel maior.

Essas divergencias confirmam que “nivel CEFR de uma palavra” depende da metodologia da lista. O Word Lens deve identificar sua fonte e apresentar a classificacao como aproximada, nao oficial/universal.

## Decisoes Tecnicas Resultantes

1. Manter classificacao simples por grafia/lema no MVP.
2. Resolver conflitos pelo menor nivel para reduzir falsos positivos.
3. Tornar mapa morfologico offline requisito da Fase 1, gerado lema -> formas; colisoes devem ser rejeitadas, nao adivinhadas no runtime.
4. Nao executar POS tagging ou desambiguacao contextual no leitor no MVP.
5. Nao marcar termos ausentes do pack.
6. Usar Open English WordNet somente no incremento de definicoes e fora do caminho de abertura.
7. Manter Oxford somente como benchmark privado.

## Pendencias Para Concluir A Fase 0

- [Concluido] Produto aprovou o uso do Octanove C1/C2 sob CC BY-SA 4.0 em 2026-07-13, incluindo atribuicao e ShareAlike do data pack derivado.
- [Concluido para iniciar] Meta minima de 85% dos tokens no corpus apos morfologia e nenhum falso positivo conhecido nas 500 formas mais frequentes; detalhamento por nivel sera reavaliado com o gerador real.
- Implementar na Fase 1 um gerador lema -> formas, medir tamanho e revisar colisoes; regras inversas em runtime foram rejeitadas pelo spike.
- [Concluido] Samsung Galaxy S23 SM-S911B, Android 16/API 36, ARM64; budget de regressao maxima de 5% ou 16 ms e nenhuma long task nova acima de 50 ms.
- [Concluido] Revisao estratificada inicial de cinco headwords por nivel; contracoes funcionais sem WordNet, como `'m`, devem ser tratadas separadamente.

## Linha De Base Do Projeto

- `npm test -- src/__tests__/db/settings.test.ts src/__tests__/components/EpubViewer.test.tsx`: passou, 2 arquivos e 62 testes.
- `npm run build`: passou; permaneceram apenas avisos ja existentes sobre modulos Node externalizados pelo PDF.js e chunk principal acima de 500 kB.
- Primeiro `adb devices -l`: nenhum aparelho conectado.
- Verificacao posterior: Samsung Galaxy S23 `SM-S911B` conectado e autorizado; Android 16/API 36, ARM64, `MemTotal` 7.242.452 kB e display fisico 1080x2340.
- Risco residual: o S23 e um aparelho de alto desempenho; rollout deve incluir QA complementar em Android intermediario.
