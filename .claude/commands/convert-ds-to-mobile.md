name: convert-ds-to-mobile
description: Converts the provided design system to Android mobile guidelines.
---

# Convert Design System → Android Mobile

Você vai converter o design system enviado para mobile Android de forma **INCREMENTAL**.

> ⚠️ **REGRA CRÍTICA:** Produza apenas a **PARTE indicada**. Não tente gerar o documento completo de uma vez.
> Ao final de cada parte, escreva: `✅ PARTE [N] concluída. Aguardando confirmação para continuar.`

---
### Inputs
`$design-system-target`:
`$path`:
---
## Contexto Geral

> Aplicar em **todas** as partes.

- Preserve identidade visual, tokens, componentes e hierarquia originais.
- Não invente nova paleta, nova estética ou novo sistema.
- Use Material 3 / Android apenas como **base técnica de adaptação**, não como substituição visual.
- Converta `px`/`rem` → `dp`/`sp`. `hover` → `pressed` / `focused` / `long press`.
- Touch target mínimo: **48dp**. Suporte a TalkBack e font scaling.
- Salve o resultado final como `docs/design-system/design-system-mobile.html`.

**Design system de referência:** 

---

## PARTE 1 — Diagnóstico + Estratégia de Adaptação

Execute **apenas**:

1. **Diagnóstico:** liste os tokens, componentes e padrões identificados no sistema original.
2. **Estratégia:** explique como cada elemento web/desktop será convertido para Android.
3. **Tabela de conversões:**

| Elemento Original | Adaptação Android | Justificativa | Observação |
|---|---|---|---|

---

## PARTE 2 — Tokens Android

Gere **apenas** os tokens adaptados:

- Color tokens (com hex, usage, dark mode)
- Typography tokens (em `sp`, com weight, line-height)
- Spacing tokens (em `dp`, escala base-8)
- Radius tokens (em `dp`)
- Elevation tokens
- Motion tokens (duration, easing)
- Icon tokens (tamanho em `dp`)
- Layout tokens (margens, gutters, colunas)

---

## PARTE 3 — Componentes: Elementos Atômicos

Para cada componente abaixo, documente:

> **Nome · Anatomia · Variantes · Estados · Medidas dp/sp · Comportamento touch · Regras de uso · Anti-patterns**

Componentes desta parte:

- Botões (primary, secondary, ghost, icon button)
- Inputs / TextFields
- Checkboxes
- Radios
- Switches
- Badges
- Chips
- Ícones

---

## PARTE 4 — Componentes: Compostos e Navegação

Mesma estrutura de documentação da Parte 3.

Componentes desta parte:

- Cards de livro
- Cards de progresso / continuar lendo
- List items
- Tabs
- Top App Bar
- Bottom Navigation
- Search Bar
- Navigation Drawer *(quando aplicável)*

---

## PARTE 5 — Componentes: Overlay, Feedback e Estados

Mesma estrutura de documentação da Parte 3.

Componentes desta parte:

- Modal Bottom Sheets *(incluindo conversão de dropdowns)*
- Dialogs
- Toasts / Snackbars
- Carrosséis (swipe horizontal)
- Empty states
- Loading states / Skeletons / Spinners
- Tabelas convertidas para listas/cards mobile
- Padrões de feedback
- Padrões de motion

---

## PARTE 6 — Padrões de Layout Mobile

Defina:

- Margens e gutters
- Grid mobile (1 coluna base, variações)
- Cards empilhados
- Listas verticais
- Carrosséis por swipe
- Seções e separadores
- Safe areas, status bar e navigation bar
- Telas de referência: `360×800`, `393×873`, `412×915`

---

## PARTE 7 — Telas Exemplo

Crie especificações detalhadas (layout descritivo + tokens usados) para:

- Home
- Busca
- Detalhe de livro
- Biblioteca
- Perfil / Configurações
- Estado vazio
- Estado loading

---

## PARTE 8 — Jetpack Compose Snippets

Gere pseudo-código / snippets reais para:

- `Theme` / `MaterialTheme` com tokens
- `Button` (variantes)
- `TextField`
- `BookCard`
- `ContinueReadingCard`
- `BottomNavigation`
- `TopAppBar`
- `BottomSheet`
- `Snackbar`
- `Loading` / `Skeleton`

---

## PARTE 9 — Montagem Final + Checklist

- Compile todas as partes anteriores no arquivo `$path`/`design-system-mobile.html`
- Inclua checklist final de implementação Android
- Inclua índice navegável no topo do arquivo
- Valide: tokens presentes · estados documentados · acessibilidade coberta · sem padrões desktop

---

> 🚀 **INÍCIO:** Execute agora apenas a **PARTE 1**.
