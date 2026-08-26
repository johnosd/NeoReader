# Word Lens: fontes e atribuicoes

Os data packs gerados em `public/word-lens/` combinam dados das fontes abaixo.
O release atual usa o data pack `1.0.0`, cujo `manifest.json` preserva versoes,
atribuicoes, URLs de licenca e checksums das fontes.

## CEFR-J Vocabulary Profile 1.5

- Compilador: Yukio Tono, Tokyo University of Foreign Studies.
- Termos publicados: uso em pesquisa e comercial sem cobranca, mediante citacao adequada.
- Termos: https://github.com/openlanguageprofiles/olp-en-cefrj#terms-of-use

## Octanove Vocabulary Profile C1/C2 1.0

- Criador: Octanove Labs.
- Licenca: Creative Commons Attribution-ShareAlike 4.0 International.
- Licenca: https://creativecommons.org/licenses/by-sa/4.0/

O data pack CEFR derivado distribuido pelo NeoReader deve preservar a atribuicao e as obrigacoes ShareAlike aplicaveis.

## Open English WordNet 2025

- Criador: Open English WordNet Community.
- Licenca: Creative Commons Attribution 4.0 International.
- Site: https://en-word.net/
- Licenca: https://creativecommons.org/licenses/by/4.0/

No MVP, o Open English WordNet e usado somente para dados morfologicos. Definicoes e exemplos ficam reservados para o incremento posterior descrito no plano.

Os URLs, checksums e versoes exatos ficam em `../sources.lock.json`.

## Limites de cobertura do MVP

- A classificacao e feita por palavra isolada e e uma aproximacao pedagogica.
- Contexto, sentidos e expressoes com varias palavras nao sao desambiguados.
- O MVP apenas marca palavras; definicoes e exemplos ficam para a Fase 6.
