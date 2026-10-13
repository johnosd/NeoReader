# Data Model: Proteção de livros com PIN

**Slug**: `024-protecao-livros-pin` | **Date**: 2026-10-12

## Resumo das mudanças

| Onde | Mudança | Migração |
| --- | --- | --- |
| `Book` (`src/types/book.ts`) | novo campo opcional `isProtected?: boolean` | nenhuma (ausente = não protegido) |
| Dexie `NeoReaderDB` | nova tabela `bookProtection` na `version(20)` | tabela vazia, sem `.upgrade()` |
| Memória (Zustand) | estado `unlocked` e prompt de PIN | n/a (efêmero) |

O schema do Dexie é append-only (Constituição): a v20 **adiciona** a tabela e
repete o mapa de `stores` da v19 como as versões anteriores fazem. A v19 não
é tocada.

## Book.isProtected

```ts
// src/types/book.ts — dentro de Book
isProtected?: boolean   // feature 024: protegido com PIN; não indexado (sem novo version() para o campo)
```

- Ausente ou `false` ⇒ livro comum. Só `true` ativa o bloqueio.
- Sem índice: filtros ("Protegidos", contagem do chip) são em memória.
- Independente de `tags`, `collectionId`, `isFavorite` e `readingStatus` (FR-018).
- NÃO é sincronizado: os serviços de sync do Drive trabalham com
  marcadores, progresso e vocabulário, não com o registro `Book` (FR-019;
  task T050 verifica).

## BookProtectionRecord (tabela `bookProtection`)

Registro **único** por banco (cada conta tem o seu banco, então é um PIN por
conta). `id` fixo em `1`; sem auto-incremento.

```ts
// src/types/bookProtection.ts
export interface BookProtectionRecord {
  id: 1                    // singleton
  pinHash: string          // PBKDF2-SHA-256, base64
  salt: string             // 16 bytes aleatórios, base64
  iterations: number       // iterações usadas neste hash (permite migrar o custo)
  failedAttempts: number   // erros seguidos na rodada atual, 0..4
  lockRound: number        // esperas já disparadas desde o último acerto, 0..n
  lockedUntil: number      // epoch ms em que novas tentativas voltam a valer; 0 = sem espera
  createdAt: Date
  updatedAt: Date
}
```

Schema Dexie (somente a linha nova; a v20 repete as demais da v19):

```ts
this.version(20).stores({
  // ...todas as tabelas da v19, inalteradas...
  bookProtection: 'id',
})
```

Classe `NeoReaderDB`: `bookProtection!: Table<BookProtectionRecord, number>`.

### Regras de validação

| Regra | Onde é imposta |
| --- | --- |
| PIN = 4 a 6 dígitos `0-9`, sem espaços | `isValidPinFormat` em `pinCrypto.ts`, usada por `BookProtectionService` e pela UI |
| Criação/alteração exige duas digitações iguais | `PinSetupSheet` (UI) |
| PIN nunca persistido nem logado em texto | `BookProtectionService` só recebe o PIN, devolve boolean; nenhum `logEvent`/`console` com ele |
| Existe no máximo 1 registro | chave fixa `id: 1` + `put` |

### Máquina de estados da espera (`pinLockout.ts`, função pura)

Constantes: `ATTEMPTS_PER_ROUND = 5`, `BASE_LOCK_MS = 30_000`, `MAX_LOCK_MS = 3_600_000`.

| Evento | Estado antes | Estado depois |
| --- | --- | --- |
| Tentativa durante a espera (`now < lockedUntil`) | qualquer | **sem mudança**; a tentativa nem é verificada |
| PIN errado, não é o 5º da rodada | `failedAttempts = n` | `failedAttempts = n + 1` |
| PIN errado, 5º da rodada | `failedAttempts = 4`, `lockRound = r` | `failedAttempts = 0`, `lockRound = r + 1`, `lockedUntil = now + min(30 s × 2^r, 1 h)` |
| PIN correto | qualquer | `failedAttempts = 0`, `lockRound = 0`, `lockedUntil = 0` |

Sequência de esperas: 30 s → 1 min → 2 min → 4 min → … → teto de 1 h (R-010).
Como é calculado de `Date.now()` e persistido em `lockedUntil`, fechar e
reabrir o app não zera a contagem (FR-011).

### Operações do repositório (`src/db/bookProtection.ts`)

| Função | Efeito |
| --- | --- |
| `getBookProtection()` | devolve o registro ou `undefined` |
| `saveBookProtection(record)` | `put` do registro inteiro (cria ou substitui) |
| `clearBookProtection()` | apaga o registro (usado por "Desativar proteção") |

E em `src/db/books.ts`:

| Função | Efeito |
| --- | --- |
| `setBookProtected(id, isProtected)` | atualiza o campo de um livro |
| `clearAllBooksProtected()` | `isProtected = false` em todos que estavam `true` (usado ao desativar) |

"Desativar proteção" faz as duas últimas dentro de **uma transação** sobre
`books` + `bookProtection`: ou tudo, ou nada.

## Estado em memória (não persistido)

```ts
// src/store/bookLockStore.ts (forma)
interface BookLockState {
  unlocked: boolean
  prompt: { resolve: (ok: boolean) => void } | null
  lock(): void
  unlock(): void
  requestUnlock(options?: { force?: boolean }): Promise<boolean>
  // sem force: true direto se já desbloqueado, senão abre o prompt
  // com force: sempre abre o prompt (Alterar PIN, Desativar proteção)
  settlePrompt(ok: boolean): void
}
```

- `unlocked` começa `false` a cada carga do app.
- `requestUnlock()` é reentrante: chamadas enquanto o prompt está aberto
  recebem a **mesma** Promise (um único teclado na tela).
- `lock()` só zera `unlocked`; **não** toca no prompt aberto. Isso importa: o
  seletor de conta Google do "Esqueci o PIN" pode pausar o app, e o
  re-bloqueio resultante não pode derrubar o fluxo de recuperação em curso. O
  prompt só abre com o app já bloqueado, então não há prompt a fechar.
