# Pipeline Word Lens

O pipeline baixa fontes com versao e SHA-256 fixados, valida os dados e gera os assets offline usados pelo NeoReader.

## Requisitos

- Python 3.11 ou superior.
- Rede apenas durante a geracao; o aplicativo nao acessa essas URLs.

## Comandos

```powershell
npm run word-lens:build
npm run word-lens:check
python -m unittest discover -s scripts/word-lens/tests -p "test_*.py"
```

`build` grava arquivos deterministas em `public/word-lens/` e mantem as fontes verificadas em `.word-lens-cache/`, ignorado pelo Git. `check` reutiliza o cache valido ou baixa uma fonte ausente, gera os mesmos arquivos em memoria e falha se o repositorio estiver desatualizado. Para uma verificacao estritamente offline, execute o builder diretamente com `check --cache-dir .word-lens-cache --offline`.

Opcionalmente, `--cache-dir <diretorio>` guarda as fontes verificadas fora do bundle para evitar novos downloads. Um cache com checksum incorreto e rejeitado e baixado novamente no modo `build`; `--offline` exige que o cache valido ja exista.

## Artefatos

- `manifest.json`: schema, versao, fontes, contagens e caminhos.
- `levels.json`: headword normalizado para nivel ordinal A1=1 ... C2=6.
- `lemmas.json`: forma flexionada deterministica para headword.
- `report.json`: conflitos, colisoes morfologicas e contagens de auditoria.

Conflitos CEFR usam o menor nivel por grafia. Flexoes sao geradas do lema para a forma; formas que colidem entre lemas sao excluidas de `lemmas.json` e registradas no relatorio.
