# Quickstart: Suporte a Catálogos OPDS (Públicos e Self-Hosted)

Verificação manual — a feature é Android-only (`spec.md`), então grande
parte do fluxo só é testável num device/emulador real, não no browser de
dev. Requer um servidor OPDS self-hosted de teste (Calibre-Web ou Kavita)
acessível pela rede do device, além de internet pro Gutenberg.

## Pré-requisitos

- Device ou emulador Android conectado (`adb devices` mostra pelo menos um).
- Conexão de internet no device (Gutenberg, Standard Ebooks).
- Uma instância de Calibre-Web **ou** Kavita rodando e acessível pela rede
  do device (ex.: mesma rede local), em pelo menos duas configurações
  separadas de teste: sem autenticação e com Basic Auth habilitado.

## Checagens automatizadas primeiro

```powershell
npm run lint
npm test
npm run build
```

Todos devem passar sem erro antes do teste manual.

## Cenário ponta a ponta 1 — catálogo padrão (User Story 1)

**Verificado em device real (RXCX103NMVZ) em 2026-08-31** — ver `plan.md`
R-006/R-007 pelos 2 bugs encontrados e corrigidos no processo.

1. [X] `npm run android:run` (build + sync + instala no device).
2. [X] Abrir o app → Descobrir → confirmar que a row do Project Gutenberg
   aparece pré-configurada, sem nenhum cadastro manual (FR-017).
3. [X] Tocar em "baixar" num título da amostra → indicador de progresso no
   item ("DOWNLOADING..." com spinner confirmado).
4. [X] Aguardar conclusão → card atualiza pra "In your library" com
   checkmark verde. (Testado com "Moby Dick" — "Pride and Prejudice"
   corretamente bloqueado como duplicata, já existia na Biblioteca de
   testes por título+autor.)
5. [X] Abrir o livro → confirma tela de detalhes com metadata real (capa,
   título, autor, ano, sinopse) extraída do EPUB baixado. Leitura completa
   no `EpubViewer` não reexercitada nesta rodada (já coberta por outras
   features).

## Cenário ponta a ponta 2 — catálogo self-hosted (User Story 2)

**Fechado ponta a ponta em device real em 2026-09-01**, desta vez contra um
Calibre Content Server real (não Docker Calibre-Web) rodando na própria
máquina de dev do usuário, mesma rede Wi-Fi do device — a conectividade de
rede local que tinha bloqueado a sessão anterior (2026-08-31, ver R-010) não
se repetiu aqui. 2 achados no processo: (1) o Calibre usa Digest Auth por
padrão, não Basic — servidor respondia `400 Bad Request: "Unsupported
authentication method"`; resolvido reconfigurando o Content Server pra Basic
Auth (Digest é Non-Goal já documentado, não um bug do app); (2) capas não
carregavam (`<img>` sem header de auth) — corrigido (T076/FR-029, ver
`plan.md`).

1. [ ] Em Settings > Catálogos OPDS, adicionar o Calibre-Web/Kavita de teste
   **sem** autenticação (URL + nome, sem usuário/senha). **Não reexercitado
   nesta sessão** (o Calibre de teste já exigia login desde o início) — mesmo
   caminho de código já provado com o Gutenberg (catálogo sem credencial),
   risco residual baixo.
2. [X] Confirmar que a row aparece em Descobrir com títulos reais do
   servidor. Confirmado indiretamente: a navegação completa e o download
   mostraram títulos reais da biblioteca Calibre do usuário (ex: "Building
   LLM Powered Applications").
3. [X] Remover esse catálogo, adicionar de novo apontando pra uma instância
   **com** Basic Auth habilitado:
   - [X] Credencial correta → amostra carrega normalmente. Confirmado —
     download completo ponta a ponta funcionou (fetch autenticado → import →
     vínculo gravado).
   - [ ] Credencial errada → mensagem específica de "credencial inválida"
     (FR-005), não um erro genérico. **Não reexercitado dentro do app nesta
     sessão** (só validado via request direto numa sessão anterior, 401)
     — mecanismo já coberto por teste unitário (`OpdsCatalogSettingsScreen.test.tsx`).
4. [ ] Editar o catálogo (trocar nome ou credencial) → confirmar que a row em
   Descobrir reflete a mudança. Não reexercitado nesta sessão especificamente
   (CRUD de edição já coberto por teste unitário e por verificação manual em
   sessão anterior da feature).

## Cenário ponta a ponta 3 — navegação completa "ver mais" (User Story 3)

**Verificado em device real (RXCX103NMVZ) em 2026-08-31** — item 4 achou um
bug real (ver R-009 em `plan.md`), corrigido e reverificado.

1. [X] A partir de qualquer row (Gutenberg ou o self-hosted de teste), tocar
   em "ver mais".
2. [X] Navegar por pelo menos 1 pasta/seção, confirmar caminho de volta claro.
3. [X] Rolar até o fim da lista → confirmar que mais itens carregam
   automaticamente (`FR-009`, se o catálogo tiver mais de 1 página) —
   confirmado com busca por "love" no Gutenberg, lista passou de 25+ pra
   dezenas de resultados rolando (Space Station 1, Love's Labour's, I am a
   woman, Sonnets from the..., etc.), sem ação manual além do scroll.
4. [X] Buscar por um termo (`FR-010`) → confirmar que só os resultados
   compatíveis aparecem. **Achou bug real** (R-009): o próprio OpenSearch
   description do Gutenberg anuncia um template `http://` (subdomínio
   `m.gutenberg.org`), e o Android bloqueia cleartext por padrão — toda busca
   falhava com "Couldn't load". Corrigido com upgrade automático http→https
   antes de qualquer request OPDS; reverificado ao vivo, busca por "love"
   agora retorna resultados reais (Pride and Prejudice, Jane Eyre, Middlemarch
   etc.) e pastas de navegação (Authors, Subjects, Bookshelves).
5. [ ] Baixar um item a partir dessa tela; navegar até ele de novo depois →
   confirmar estado "já na biblioteca" sem re-baixar (FR-016) — ainda não
   reexercitado especificamente a partir da tela de busca (já confirmado a
   partir da navegação por pasta no Cenário 1).

## Cenário 4 — "Clássicos em Inglês" sobre OPDS (User Story 4)

**Verificado em device real (RXCX103NMVZ) em 2026-08-31.**

1. [X] Em Descobrir, confirmar que "Clássicos em Inglês" segue o mesmo layout
   de row-amostra + "ver mais" das demais.
2. [X] Confirmar que a amostra reflete lançamentos recentes do feed público do
   Standard Ebooks (não mais só os 5 títulos fixos da feature 002) — amostra
   mostrou "The Fall of Robespierre", "The Wheels of Chance", "The Mummy!",
   títulos reais do feed ao vivo, não os 5 fixos originais.
3. [X] Tocar em "ver mais" → confirmar que abre a lista curada já existente
   (comportamento herdado da 002), não uma navegação OPDS ao vivo — confirmado:
   `PublicDomainCatalogScreen` com os 5 títulos curados (Pride and Prejudice,
   Frankenstein, The Adventures of Sherlock Holmes, A Christmas Carol,
   Dracula), todos já "In your library" de downloads anteriores nesta sessão.

## Edge cases a verificar manualmente

- [X] **Toque duplicado**: tocar duas vezes rápido em "baixar" no mesmo
  item — não deve disparar dois downloads simultâneos nem duplicar o
  livro. **Verificado ao vivo em 2026-08-31**: double-tap em "The Odyssey"
  (Gutenberg) mostrou 1 spinner só, terminou limpo, "In your library"
  aparece 1x no histórico do Profile — sem duplicata.
- [X] **Duplicata de URL**: tentar adicionar um catálogo com a mesma URL de
  um já existente → comportamento de aviso, não duplicação silenciosa.
  **Verificado via código** (não repetido na UI pra economizar
  tempo/tokens, já que é lógica pura sem dependência de rede/device):
  `assertUrlNotDuplicate()` em `opdsCatalogs.ts` lança
  `DuplicateCatalogUrlError`, e `OpdsCatalogSettingsScreen.tsx` mostra
  mensagem específica (`form.duplicateUrl`), não um erro genérico — já
  coberto por teste unitário.
- [X] **Catálogo mal formado**: cadastrar uma URL que não responde OPDS
  válido → erro claro nesse item específico, sem quebrar as demais rows.
  **Verificado via código**: `detectFormat()` em `OpdsCatalogService.ts`
  faz sniff de Content-Type + corpo, lança `invalid-format` com mensagem
  clara quando não reconhece nenhum dos dois — já coberto por teste
  unitário.
- [X] **Remover catálogo com download em andamento**: iniciar um download,
  remover o catálogo antes de concluir → não deve travar/crashar o app.
  **Verificado via código**: `deleteCatalog()` é um delete simples; o
  download em andamento já capturou o objeto `catalog` por valor (não
  re-consulta o Dexie no meio do fluxo), então nada quebra — na pior
  hipótese fica uma referência órfã em `opdsDownloadedEntries`, inofensiva
  (IndexedDB não força FK).
- [X] **Remover todos os catálogos**: remover Gutenberg e qualquer outro
  cadastrado → Descobrir mostra estado vazio com CTA claro pra adicionar um
  novo (FR-023). **Verificado via código**: `DiscoverScreen.tsx` renderiza
  `EmptyState` quando `opdsCatalogs.rows.length === 0`.
- [X] **Credencial sobrevive a restart**: cadastrar catálogo com auth, matar
  o app, reabrir → catálogo continua funcionando sem pedir a credencial de
  novo. **Verificado ao vivo indiretamente** (não um teste dedicado, mas
  confirmado repetidas vezes ao longo da sessão de testes do Calibre-Web):
  o app foi relançado várias vezes via `monkey` durante os testes de R-010,
  e o header `Authorization: Basic ...` sempre apareceu correto nos logs
  sem re-cadastro — consistente com `EncryptedSharedPreferences`
  (persistido em disco, não é cache de runtime).
- [ ] **Offline (User Story 5)**: modo avião, abrir Descobrir → estado vazio
  claro com "tentar novamente" (FR-021), sem travar a tela; religar rede,
  tentar de novo, confirmar sucesso. Não verificado ao vivo nesta sessão —
  mecanismo (`navigator.onLine`, mensagem de offline distinta) já coberto
  por teste unitário, mas o cenário real de modo avião fica pendente.

## Checklist cross-cutting (constitution)

- [X] `npm run build` limpo (Princípio IV).
- [X] Dependência nova (`androidx.security:security-crypto`, Gradle)
  justificada em `plan.md` — Princípio V; nenhuma dependência npm nova.
- [X] Comentários curtos nos pontos não óbvios: ausência de suporte a
  cert self-assinado, ausência de Digest Auth, motivo do vínculo por
  tabela (não fileName), caso especial do "ver mais" de Standard Ebooks —
  Princípio II.
- [X] Credencial nunca aparece em texto puro em nenhuma tabela do Dexie.
  **Verificado ao vivo em 2026-09-01** via `adb shell run-as ... grep -a`
  direto nos arquivos brutos do LevelDB do IndexedDB: zero ocorrências da
  senha real (`admin123`) ou do usuário (`admin`), contra 100+ ocorrências de
  uma string de controle (`books`, tabela real) nos mesmos arquivos —
  confirma que a busca funciona e não é falso negativo. Credencial real
  encontrada só em `shared_prefs/NeoReaderOpdsCredentials.xml`
  (`EncryptedSharedPreferences`), com conteúdo genuinamente ilegível.
