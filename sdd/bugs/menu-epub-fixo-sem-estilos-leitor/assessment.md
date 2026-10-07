# Bug Assessment: Menu do EPUB fixo sem estilos do leitor

- **Slug**: menu-epub-fixo-sem-estilos-leitor
- **Criado**: 2026-10-07
- **Origem**: usuário confirmou funcionamento, mas menu fora do design system
- **Veredito**: valid
- **Severidade**: medium

## Report

O menu contextual funciona no EPUB fixo, porém apresenta botões nativos, ícones grandes e nenhuma aparência do leitor NeoReader.

## Symptom

Esperado: o mesmo cartão, tipografia, ícones e cores do menu dos EPUBs comuns, respeitando o tema escolhido. Observado em screenshot do S23 na verificação anterior: controles sem CSS.

## Reproduction

1. Abrir Layout Fixo Sintético no release do S23 ou no harness real, viewport 412 × 915.
2. Tocar no centro de uma página e aguardar a montagem do painel.
3. Observar botões padrão do navegador, sem cartão e sem layout em quatro colunas.

## Suspected Code Paths

- `src/components/reader/EpubViewer.tsx::buildReaderCSS`: já contém o design do painel e os tokens da paleta.
- Chamadas `renderer.setStyles?.(...)`: funcionam no paginator, mas o FixedLayout não implementa esse método.
- Evento `load` e atualização de tema: precisam aplicar CSS da UI diretamente ao documento de layout fixo.

## Root Cause Hypothesis

Confiança alta: ausência de setStyles confirmada no fixed-layout.js e aparência sem estilos observada no aparelho. Aplicar todo o CSS existente alteraria fontes, dimensões e cores da página original; é necessário usar apenas as regras da UI NeoReader.

## Proposed Remediation

**Preferida**: permitir gerar CSS sem overrides globais do conteúdo; injetar um style com namespace XHTML nos documentos FXL, reutilizando a paleta e os componentes atuais. Atualizar o mesmo style quando o tema mudar e nas páginas carregadas após a mudança.

**Files likely to change**:
- `src/components/reader/EpubViewer.tsx`
- `src/__tests__/components/EpubViewer.test.tsx`
- `scripts/verificacao-visual/epub-fxl.check.js`

**Tests to add or update**:
- FXL sem setStyles recebe regras do menu; conteúdo original não recebe regras globais.
- Trocar tema atualiza style existente sem duplicação; página posterior recebe tema atual.
- Browser real: estilos computados do painel, grid, tile e ícone; marcador continua persistindo e páginas mantêm dimensões.

## Risks & Considerations

- Preservar o layout e cores originais do livro; manter o fluxo de toque corrigido.
- Não reinventar o menu nem adicionar novas cores: reutilizar buildReaderCSS e a paleta existente.
- SVG de PDF não precisa de novos overrides globais; styles devem afetar apenas elementos NeoReader.

## Open Questions

Nenhuma pendente.
