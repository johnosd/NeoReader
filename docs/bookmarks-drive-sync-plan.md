# Plano: sync pago de bookmarks no Google Drive

## Resumo

Implementar sync inicial de bookmarks usando Google Drive `appDataFolder`. O
objetivo e permitir que o usuario salve bookmarks, desinstale o app, instale
novamente, faca login, importe o mesmo EPUB e recupere automaticamente os
bookmarks daquele livro.

A primeira entrega implementa o sync funcional. Como next step obrigatorio, a
feature deve ser travada como recurso pago do plano Pro.

## Escopo

- Sincronizar apenas bookmarks.
- Nao sincronizar progresso de leitura, vocabulario, metadados enriquecidos,
  preferencias, capas ou arquivos EPUB.
- Usar SHA-256 exato de `books.fileHash` para reconhecer o mesmo livro.
- Restaurar bookmarks automaticamente apos importar o mesmo EPUB.
- Manter bookmarks locais funcionando para todos os usuarios, mesmo sem Pro,
  sem Drive ou sem rede.

## Checklist por fases

### Fase 1 - OAuth e Drive

- [x] Ativar Google Drive API no projeto Google Cloud.
- [x] Adicionar o escopo `https://www.googleapis.com/auth/drive.appdata` ao login Google.
- [x] Garantir que Android/Web recebam token com permissao de Drive.
- [x] Criar servico `GoogleDriveAppDataService` para `list`, `get`, `create` e `update` de JSON no `appDataFolder`.
- [x] Tratar token ausente, escopo negado e erro offline sem bloquear o app.

### Fase 2 - Modelo de sync dos bookmarks

- [x] Adicionar campos opcionais em `Bookmark`: `syncKey`, `syncedAt`, `syncError`.
- [x] Gerar `syncKey` deterministico a partir do CFI normalizado.
- [x] Definir arquivo remoto por livro: `neoreader-bookmarks-v1-{fileHash}.json`.
- [x] Persistir no Drive apenas os campos atuais do bookmark: CFI, label, percentual, snippet, cor, timestamps e soft delete.
- [x] Nao salvar `id` local do IndexedDB no Drive.

### Fase 3 - Envio para nuvem

- [x] Ao criar bookmark, salvar localmente e tentar sync em background.
- [x] Ao mudar cor, atualizar localmente e reenviar JSON do livro.
- [x] Ao remover bookmark, aplicar `deletedAt` local e remoto.
- [x] Se sync falhar, manter bookmark local e registrar pendencia/erro.
- [x] Evitar que erro de Drive quebre leitura ou marcacoes locais.

### Fase 4 - Restauracao automatica

- [x] Apos importar EPUB, usar `books.fileHash` para buscar JSON remoto.
- [x] Restaurar bookmarks automaticamente quando o hash for identico.
- [x] Mesclar local/remoto por `syncKey`.
- [x] Resolver conflito por "mais recente vence" usando `deletedAt`, `updatedAt` ou `createdAt`.
- [x] Mostrar toast discreto com a quantidade de bookmarks restaurados.
- [x] Nao restaurar nada quando o hash do EPUB for diferente.

### Fase 5 - Feature paga

- [x] Manter bookmarks locais disponiveis para usuarios free.
- [x] Bloquear sync/restauracao via Drive atras do entitlement Pro.
- [x] Manter Cloud bookmarks na lista Planned benefits e exibir o status em Configuracoes.
- [x] Adicionar estado discreto em Configuracoes: conectado, pendente/offline, erro de permissao ou recurso Pro.
- [x] Garantir que usuario free nao perca bookmarks locais ao nao ter Pro.

### Fase 6 - Testes e QA

- [x] Testar `syncKey` estavel por CFI.
- [x] Testar merge com "mais recente vence".
- [x] Testar soft delete sem reaparecer apos reinstalacao.
- [x] Testar `fileHash` diferente sem restauracao.
- [x] Mockar Drive API para criar, listar, baixar e atualizar JSON.
- [x] Simular reinstalacao limpando IndexedDB, reimportar mesmo EPUB e validar restauracao.
- [x] Validar regressao: bookmarks locais funcionam sem rede, sem Drive e sem Pro.

## Modelo remoto proposto

Arquivo por livro no `appDataFolder`:

```text
neoreader-bookmarks-v1-{fileHash}.json
```

Payload:

```json
{
  "schemaVersion": 1,
  "bookFileHash": "sha256",
  "book": {
    "title": "Book title",
    "author": "Book author",
    "fileName": "book.epub"
  },
  "bookmarks": [
    {
      "syncKey": "stable-key-from-normalized-cfi",
      "cfi": "epubcfi(...)",
      "label": "Chapter",
      "percentage": 42,
      "snippet": "Saved passage",
      "color": "indigo",
      "createdAt": "2026-06-15T00:00:00.000Z",
      "updatedAt": "2026-06-15T00:00:00.000Z",
      "deletedAt": null
    }
  ],
  "updatedAt": "2026-06-15T00:00:00.000Z"
}
```

## Regra de merge

- Chave de comparacao: `syncKey`.
- Para cada bookmark local/remoto com a mesma chave, comparar o timestamp efetivo:
  - usar `deletedAt` quando existir;
  - senao `updatedAt`;
  - senao `createdAt`.
- O registro mais recente vence.
- Se o vencedor tiver `deletedAt`, manter tombstone no Drive e nao exibir localmente.
- Se o vencedor estiver ativo, garantir que exista localmente.
- Apos o merge, regravar o JSON completo do livro no Drive.

## Assumptions

- Sync usa Google Drive `appDataFolder`, sem pasta visivel.
- A primeira implementacao pode funcionar antes do paywall, mas o next step obrigatorio e torna-la Pro.
- Apenas bookmarks entram no escopo; progresso, vocabulario e EPUB ficam fora.
- Deletar livro local nao apaga bookmarks do Drive.
- O livro e reconhecido somente por SHA-256 exato.

## Definition of done

- [x] Plano salvo em `docs/bookmarks-drive-sync-plan.md`.
- [ ] Implementacao dividida em commits pequenos e focados.
- [ ] `npm run lint` passando.
- [x] `npm test` passando.
- [x] `npm run build` passando.
- [x] Nenhum secret ou token OAuth persistido manualmente em IndexedDB/localStorage.
