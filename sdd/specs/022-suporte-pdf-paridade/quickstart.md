# Quickstart / Verificação: Suporte a PDF com paridade de recursos do EPUB

## Pré-requisitos

- Corpus local em `debug-books/pdf/` (não versionado) com, no mínimo:
  `1col.pdf` (livro nascido digital, 1 coluna, com sumário), `2col.pdf`
  (artigo em 2 colunas), `tabelas.pdf` (tabelas/figuras/fórmulas),
  `escaneado.pdf` (só imagens), `misto.pdf` (páginas com e sem texto),
  `grande.pdf` (~1000 páginas / ~200 MB), `senha.pdf`, `corrompido.pdf`.
- Pelo menos 3 EPUBs que já funcionam hoje em `debug-books/` (regressão).
- Device Android conectado (`adb devices`), build via `npm run android:run`.

## Checagens automatizadas (todo checkpoint)

```powershell
npm run lint
npm test
npm run build
npm run test:debug-epubs
```

## Regressão EPUB (DI-002 — obrigatória em toda fase a partir da Fase 3)

No device, com um EPUB já existente na biblioteca:

1. Abrir o livro: volta para a posição salva.
2. Rolar dois capítulos; o rótulo de capítulo aparece na troca.
3. Tocar num parágrafo: tradução inline aparece abaixo; tocar numa palavra: Word Lens.
4. Salvar uma palavra; conferir na tela de Vocabulário.
5. Iniciar TTS; apagar a tela 30 s; voltar — leitura continua e o destaque acompanha.
6. Criar highlight com nota; editar cor; remover.
7. Criar marcador de parágrafo; (Pro) conferir sync no Drive.
8. Importar um EPUB novo por arquivo e por pasta.
9. Catálogo OPDS: baixar um EPUB.

Qualquer diferença de comportamento em relação a antes da feature = falha da fase.

## Cenários PDF ponta a ponta

### Import (US1)

1. Web: importar `1col.pdf` pelo botão de adicionar livro → aparece na biblioteca com capa da 1ª página, título/autor, rótulo PDF.
2. Android: importar por arquivo, por pasta (com os 8 PDFs) e por "abrir com" de um gerenciador de arquivos.
3. Importar `1col.pdf` de novo → aviso de duplicado.
4. `senha.pdf` e `corrompido.pdf` → mensagem clara, nada entra na biblioteca.
5. Busca por formato "PDF" e ordenação por formato funcionam.
6. Idioma (FR-020/SC-009): em Detalhes do Livro, um PDF em inglês e um em português mostram o idioma certo marcado como "auto"; um PDF com pouco texto (ou `escaneado.pdf`) mostra idioma não definido, e ao abri-lo o leitor exibe **uma vez** o aviso com atalho para escolher o idioma; escolher manualmente passa a valer em tradução/TTS.
7. Ficha (FR-021): "Atualizar informações" num PDF com ISBN na página de copyright traz dados do Open Library/Google Books; num PDF sem ISBN, Google Books ainda tenta por título/autor, sem erro na tela.

### Página fiel (US1)

1. Abrir `1col.pdf`: primeira página em ≤ 3 s; rolar 50 páginas sem travar.
2. Pinça 100%→300%: texto nítido; pan horizontal; voltar a 100%.
3. Tema escuro: página acompanha.
4. Sumário leva à página certa; marcador criado; fechar e reabrir volta à mesma página.
5. `escaneado.pdf`: abre com aviso de recursos de texto indisponíveis.
6. `grande.pdf`: abre com aviso de possível lentidão; 30 min de leitura sem crash (`adb shell dumpsys meminfo com.johnny.neoreader` antes/depois).

### Modo texto (US2)

1. Em `1col.pdf`, alternar para modo texto: parágrafos contínuos, sem quebras no fim de linha nem hífens de quebra, sem cabeçalho/número de página no meio.
2. Mudar fonte/tamanho/tema.
3. Alternar de volta: mesma região da página.
4. Fechar e reabrir: abre em modo texto.
5. `tabelas.pdf`: figuras/tabelas aparecem como placeholder que abre a página renderizada.
6. `2col.pdf`: ordem de leitura por coluna.
7. `escaneado.pdf`: modo texto indisponível com explicação.

### Word Lens e tradução (US3)

Nos dois modos: tocar palavra → Word Lens; salvar no vocabulário (frase de contexto sem quebras); traduzir parágrafo (inline no modo texto, balão na página fiel); provedor premium configurado é usado.

### TTS (US4)

Nos dois modos: iniciar TTS numa página cujo parágrafo continua na próxima — frase lida inteira; destaque acompanha; TTS traduzido; tela apagada por 1 min.

### Highlights (US5)

Criar highlight com nota no modo texto → aparece na página fiel (e vice-versa); seleção atravessando páginas; lista de destaques em Detalhes do Livro leva ao ponto.

### OPDS (US6)

Catálogo com entradas só-PDF, só-EPUB e mistas: só-PDF aparece e baixa como PDF; mista baixa EPUB.

## Medição de SC-003

Para cada PDF de 1 coluna do corpus, sortear 40 parágrafos no modo texto e
contar quebras falsas no meio de frase e hífens residuais. Meta: ≥ 95% limpos.
Registrar o resultado no Registro da Fase da US2.
