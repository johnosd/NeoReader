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

1. `npm run android:run` (build + sync + instala no device).
2. Abrir o app → Descobrir → confirmar que a row do Project Gutenberg
   aparece pré-configurada, sem nenhum cadastro manual (FR-017).
3. Tocar em "baixar" num título da amostra → indicador de progresso no
   item.
4. Aguardar conclusão → voltar pra Biblioteca → livro aparece normal, com
   capa/metadados extraídos do EPUB.
5. Abrir o livro → confirmar que lê normalmente no `EpubViewer`.

## Cenário ponta a ponta 2 — catálogo self-hosted (User Story 2)

1. Em Settings > Catálogos OPDS, adicionar o Calibre-Web/Kavita de teste
   **sem** autenticação (URL + nome, sem usuário/senha).
2. Confirmar que a row aparece em Descobrir com títulos reais do servidor.
3. Remover esse catálogo, adicionar de novo apontando pra uma instância
   **com** Basic Auth habilitado:
   - Credencial correta → amostra carrega normalmente.
   - Credencial errada → mensagem específica de "credencial inválida"
     (FR-005), não um erro genérico.
4. Editar o catálogo (trocar nome ou credencial) → confirmar que a row em
   Descobrir reflete a mudança.

## Cenário ponta a ponta 3 — navegação completa "ver mais" (User Story 3)

1. A partir de qualquer row (Gutenberg ou o self-hosted de teste), tocar
   em "ver mais".
2. Navegar por pelo menos 1 pasta/seção, confirmar caminho de volta claro.
3. Rolar até o fim da lista → confirmar que mais itens carregam
   automaticamente (`FR-009`, se o catálogo tiver mais de 1 página).
4. Buscar por um termo (`FR-010`) → confirmar que só os resultados
   compatíveis aparecem.
5. Baixar um item a partir dessa tela; navegar até ele de novo depois →
   confirmar estado "já na biblioteca" sem re-baixar (FR-016).

## Cenário 4 — "Clássicos em Inglês" sobre OPDS (User Story 4)

1. Em Descobrir, confirmar que "Clássicos em Inglês" segue o mesmo layout
   de row-amostra + "ver mais" das demais.
2. Confirmar que a amostra reflete lançamentos recentes do feed público do
   Standard Ebooks (não mais só os 5 títulos fixos da feature 002).
3. Tocar em "ver mais" → confirmar que abre a lista curada já existente
   (comportamento herdado da 002), não uma navegação OPDS ao vivo.

## Edge cases a verificar manualmente

- **Offline (User Story 5)**: modo avião, abrir Descobrir → estado vazio
  claro com "tentar novamente" (FR-021), sem travar a tela; religar rede,
  tentar de novo, confirmar sucesso.
- **Catálogo mal formado**: cadastrar uma URL que não responde OPDS válido
  (ex.: uma página HTML qualquer) → erro claro nesse item específico, sem
  quebrar as demais rows.
- **Duplicata de URL**: tentar adicionar um catálogo com a mesma URL de um
  já existente → comportamento de aviso, não duplicação silenciosa.
- **Remover catálogo com download em andamento**: iniciar um download,
  remover o catálogo antes de concluir → não deve travar/crashar o app.
- **Remover todos os catálogos**: remover Gutenberg e qualquer outro
  cadastrado → Descobrir mostra estado vazio com CTA claro pra adicionar um
  novo (FR-023).
- **Toque duplicado**: tocar duas vezes rápido em "baixar" no mesmo item —
  não deve disparar dois downloads simultâneos nem duplicar o livro.
- **Credencial sobrevive a restart**: cadastrar catálogo com auth, matar o
  app (não só navegar), reabrir → catálogo continua funcionando sem pedir
  a credencial de novo (secure storage nativo persiste — diferente do
  estado de progresso, que é só em memória).

## Checklist cross-cutting (constitution)

- [ ] `npm run build` limpo (Princípio IV).
- [ ] Dependência nova (`androidx.security:security-crypto`, Gradle)
  justificada em `plan.md` — Princípio V; nenhuma dependência npm nova.
- [ ] Comentários curtos nos pontos não óbvios: ausência de suporte a
  cert self-assinado, ausência de Digest Auth, motivo do vínculo por
  tabela (não fileName), caso especial do "ver mais" de Standard Ebooks —
  Princípio II.
- [ ] Credencial nunca aparece em texto puro em nenhuma tabela do Dexie —
  inspecionar via devtools/`adb` se necessário.
