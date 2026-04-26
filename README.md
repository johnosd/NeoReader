# NeoReader

Leitor de EPUB para Android com foco em leitura mobile, imersao visual e aprendizado de ingles. O app combina biblioteca em estilo "Netflix for Books", leitor em scroll continuo, traducao inline, vocabulario salvo e TTS com Speechify, ElevenLabs e fallback nativo.

---

## Funcionalidades

### Biblioteca
- [x] Importar arquivos `.epub` via FAB flutuante na tela principal
- [x] Hero banner com capa, gradiente cinematografico e header flutuante
- [x] Secoes "Continue lendo" e "Meus Livros" com cards horizontais e verticais
- [x] Barra de progresso por livro
- [x] Capa extraida do EPUB com suporte a recriar capa original
- [x] Atualizar capa manualmente com imagem do dispositivo
- [x] Deletar livro com limpeza de progresso, marcadores, vocabulario e configuracoes relacionadas

### Leitor
- [x] Renderizacao via [foliate-js](https://github.com/johnfactotum/foliate-js) em scroll continuo
- [x] Tamanho de fonte ajustavel em 4 niveis (`sm`, `md`, `lg`, `xl`)
- [x] Line height ajustavel por livro
- [x] Temas de leitura `dark`, `sepia` e `paper`
- [x] Progresso persistente com restauracao da ultima posicao
- [x] TOC navegavel via sheet
- [x] Marcadores com adicionar, listar, navegar, remover e recolorir
- [x] Tap central para abrir e fechar o chrome do leitor
- [x] Banner de troca de secao durante a leitura
- [x] Navegacao segura entre capitulos e secoes

### Tela de detalhes do livro
- [x] Tabs de `Capitulos`, `Marcacoes`, `Configuracoes` e `Detalhes`
- [x] Estatisticas do livro com progresso, marcadores e vocabulario salvo
- [x] Favoritar livro
- [x] Preferencias por obra para fonte, line height, tema, idioma do livro e idioma alvo da traducao
- [x] Selecao de provedor TTS por livro (`speechify`, `elevenlabs` ou `native`)
- [x] Selecao de voz compativel com o idioma e ajuste de velocidade do TTS
- [x] Preview visual das preferencias de leitura antes de abrir o livro

### Traducao e vocabulario
- [x] Traducao inline da frase tocada usando `caretRangeFromPoint`
- [x] Highlight restrito ao trecho selecionado dentro do paragrafo
- [x] Bloco de traducao injetado diretamente no iframe do EPUB
- [x] Barra de acoes inline refinada para mobile com tile compacto, icone no quadrado e label abaixo
- [x] Loading minimalista no bloco de traducao
- [x] Cache offline de traducoes com IndexedDB
- [x] Salvar par original + traducao no vocabulario
- [x] Tela dedicada de vocabulario com historico e exclusao manual
- [x] Idioma original e idioma alvo configuraveis por livro

### TTS
- [x] Audiobook continuo a partir do leitor
- [x] Mini player fixo com `prev`, `play/pause`, `next` e `stop`
- [x] Retomar de onde parou ao pausar
- [x] Tap em paragrafo durante a leitura para pular direto para ele
- [x] Leitura individual da frase via acao inline
- [x] Karaoke de palavras com destaque da palavra atual
- [x] Speechify e ElevenLabs como provedores premium
- [x] Provedor nativo selecionavel e usado como fallback automatico
- [x] Fallback para TTS nativo quando o provedor premium nao estiver configurado ou falhar

### Configuracoes globais
- [x] Persistencia local das API keys da Speechify e da ElevenLabs
- [x] Validacao das chaves diretamente na tela de configuracoes
- [x] Idioma alvo padrao das traducoes no app
- [x] Defaults globais de fonte, line height e tema do leitor
- [x] Preview ao vivo dos defaults do leitor

### Qualidade e testes
- [x] Suite em `src/__tests__` para componentes, telas, hooks e services
- [x] Cobertura recente reforcada no `EpubViewer` para loading inline, action bar e ausencia de copy de status
- [x] Testes de importacao e parsing de EPUB cobrindo extracao de capa e metadados

---

## Evolucoes recentes

- Tela de detalhes do livro expandida com tabs para capitulos, marcacoes, configuracoes e detalhes.
- Ajustes por livro agora cobrem idioma original, idioma alvo, fonte, line height, tema, provedor TTS, voz e velocidade.
- Pipeline de TTS consolidado com Speechify, ElevenLabs e provedor nativo.
- UI de traducao inline refinada para mobile com action bar compacta alinhada ao design system.
- Testes do `EpubViewer` ampliados para proteger a regressao da UX inline.

---

## Interface e design system

Os specs visuais usados como referencia vivem em:

- `docs/design-system/design-system-mobile-v2.html`
- `docs/design-system/design-system-mobile-v1.html`
- `docs/design-system/design_system.html`

### Paleta principal

| Token | Valor | Uso |
|---|---|---|
| `--color-bg-base` | `#07030c` | Fundo global |
| `--color-bg-surface` | `#12091a` | Cards e sheets |
| `--color-purple-primary` | `#7b2cbf` | CTA e estados ativos |
| `--color-purple-light` | `#a855f7` | Labels, links e badges |
| `--color-indigo` | `#6366f1` | Acento frio do leitor |
| `--color-text-primary` | `#f8fafc` | Texto principal |
| `--color-text-secondary` | `#cbd5e1` | Texto secundario |
| `--color-text-muted` | `#94a3b8` | Meta e placeholders |

Os tokens sao definidos via `@theme` em `src/index.css`.

### Fontes

Carregadas via `@fontsource` para manter o app offline-first no Capacitor:

| Familia | Pesos | Uso |
|---|---|---|
| `Inter` | 400/500/600/700/900 | UI geral |
| `Playfair Display` | 600/700/800 | Titulos hero e serif |
| `JetBrains Mono` | 400/700 | Valores tecnicos |

### Componentes principais

| Componente | Descricao |
|---|---|
| `HeroBanner` | Hero full-bleed da biblioteca |
| `ProgressCard` | Card horizontal de "Continue lendo" |
| `BookCard` | Card vertical de livro |
| `BookRow` | Secao scrollavel com variantes `progress` e `default` |
| `BottomNav` | Bottom navigation glass com 4 itens |
| `BookOptionsSheet` | Sheet de acoes do livro |
| `BookDetailsScreen` | Hub de capitulos, marcacoes, ajustes e metadados |
| `EpubViewer` | Viewer do EPUB, traducao inline, TTS e highlights |
| `ReaderChrome` | Chrome superior/inferior do leitor |
| `BottomSheet` | Primitive base para drawers e sheets |

---

## Stack

| Camada | Tecnologia |
|---|---|
| UI | React 19 + TypeScript + Vite 8 |
| Mobile | Capacitor 8 (Android) |
| Estilo | Tailwind CSS v4 + tokens `@theme` |
| EPUB render | foliate-js |
| Storage | Dexie.js / IndexedDB |
| Estado global | Zustand |
| Icones | Lucide React |
| Traducao | MyMemory API |
| TTS premium | Speechify API + ElevenLabs API |
| TTS fallback | `@capacitor-community/text-to-speech` |
| Testes | Vitest + Testing Library |

---

## Rodando localmente

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
npx tsc --noEmit
```

---

## Build Android

Pre-requisitos:

- Android Studio instalado
- Device ou emulador Android disponivel
- USB debugging ativo, quando usar device fisico

```bash
npm run build
npx cap sync android
npx cap run android

ou 

npm run build && npx cap sync android && npx cap run android
```

No PowerShell, para limpar o projeto Android manualmente:

```powershell
cd android
.\gradlew.bat clean
cd ..
```

Para rodar direto no device:

```bash
npx cap run android
adb devices
```

Para atualizar os icones do app, coloque `icon-only.png` e `icon-foreground.png` em `assets/` e rode:

```bash
npx @capacitor/assets generate --android
```

---

## Variaveis de ambiente

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Hoje o `.env.example` ja traz a chave de exemplo da Speechify. Se quiser configurar a ElevenLabs via ambiente, adicione manualmente no `.env`.

| Variavel | Descricao | Obrigatorio |
|---|---|---|
| `VITE_SPEECHIFY_API_KEY` | API key da Speechify para vozes neurais | Nao |
| `VITE_ELEVENLABS_API_KEY` | API key da ElevenLabs para vozes neurais | Nao |

As duas chaves tambem podem ser configuradas, validadas e persistidas pela tela de configuracoes do app.

---

## Estrutura de pastas

```text
src/
|-- assets/
|-- components/
|   |-- reader/             # Viewer, chrome, sheets e acoes do leitor
|   |-- ui/                 # Primitives compartilhadas
|   |-- BottomNav.tsx
|   |-- BookCard.tsx
|   |-- BookOptionsSheet.tsx
|   |-- BookRow.tsx
|   |-- HeroBanner.tsx
|   `-- ProgressCard.tsx
|-- db/                     # Dexie, schema e repositorios locais
|-- hooks/
|-- lib/
|-- screens/
|   |-- BookDetailsScreen.tsx
|   |-- LibraryScreen.tsx
|   |-- ReaderScreen.tsx
|   |-- SettingsScreen.tsx
|   `-- VocabularyScreen.tsx
|-- services/               # EPUB, traducao, TTS, importacao
|-- store/
|-- types/
|-- utils/
|-- __tests__/
|-- App.tsx
|-- index.css
`-- main.tsx

docs/
|-- design-system/
|-- 00-setup-environment.md
|-- epub-reader-plan.md
|-- learning-companion.md
`-- qa-manual.md
```

---

## Docs de apoio

- `docs/00-setup-environment.md`: bootstrap do ambiente
- `docs/epub-reader-plan.md`: visao geral do leitor EPUB
- `docs/learning-companion.md`: direcao de produto para aprendizado
- `docs/qa-manual.md`: checklist de QA manual

---

## Proximos passos

### Curto prazo
- [ ] Passe final de pixel-perfect no Android real para a traducao inline: hit area, espacamento, densidade do tile e legibilidade no WebView
- [ ] Reaplicar o mesmo padrao de acao compacta em outras superficies do leitor
- [ ] Extrair tokens e constantes visuais do bloco inline para reduzir CSS hardcoded no iframe
- [ ] Consolidar a documentacao de setup para incluir explicitamente a opcao de usar ElevenLabs tambem via `.env.example`

### Produto
- [ ] Google Drive sync para progresso, marcadores e vocabulario entre devices
- [ ] Flashcards SRS para revisar vocabulario com algoritmo estilo Anki
- [ ] Integracao Claude API (BYOK) para resumo, quiz e tutor conversacional
- [ ] Estatisticas de leitura: streak, tempo por sessao e palavras traduzidas
- [ ] Export CSV do vocabulario
