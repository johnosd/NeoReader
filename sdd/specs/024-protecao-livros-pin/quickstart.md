# Quickstart: Proteção de livros com PIN

**Slug**: `024-protecao-livros-pin` | **Date**: 2026-10-12

Verificação manual de ponta a ponta. Cada seção aponta os requisitos do `spec.md`
que ela cobre. Para a UI, rodar no browser (`npm run dev`) **e** no aparelho
Android (`npm run android:run`): a constitution exige teste de fluxo em ambiente
real, e vários itens abaixo só existem no aparelho.

## Pré-requisitos

- Login Google feito, com pelo menos 4 livros na biblioteca (misturar EPUB e PDF).
- Uma das pessoas de teste NÃO deve saber o PIN (simula "outra pessoa com o celular").
- Para o item de TTS: uma chave de voz configurada ou a voz nativa do Android.
- Aparelho Android com **bloqueio de tela configurado** (padrão, PIN ou senha) e um segundo cenário sem bloqueio de tela (para a recuperação).
- APK reconstruído com `npm run android:run` (o método nativo `confirmDeviceCredential` só existe depois do rebuild).

## Checagens automatizadas

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Todas devem passar sem erro antes da verificação manual.

## Cenário 1 — Proteger e bloquear (US1; FR-001 a FR-009, SC-001, SC-002)

1. Sem PIN criado, abrir o menu "⋯" de um livro na Biblioteca e tocar "Proteger com PIN".
2. Digitar `1234`, confirmar com `1234`. Esperado: livro ganha cadeado **aberto** (acabou de criar o PIN) e o tempo total do passo 1 a 2 fica abaixo de 30 s (SC-001).
3. Proteger um segundo livro. Esperado: **não** pede PIN (FR-005).
4. Mandar o app para segundo plano e voltar. Esperado: os dois livros mostram cadeado **fechado** e, na lista, na grade e na Home, **só capa, título e cadeado**: sem autor, progresso, status, tags, favorito ou formato (FR-006).
5. Tocar num livro protegido. Esperado: pede PIN. Digitar `0000`: "PIN incorreto", campo limpo.
6. Digitar `1234`. Esperado: o livro abre em menos de 1 s depois do último dígito (SC-002) e o **outro** livro protegido também fica desbloqueado.
7. Voltar à Biblioteca, abrir "⋯" → "Bloquear agora". Esperado: os dois voltam a cadeado fechado.
8. Em um livro protegido bloqueado, tentar cada uma: "⋯" de ações, atalho de tags (modo lista), abrir Detalhes. Esperado: toda ação pede o PIN antes (FR-007).
9. Desbloquear e escolher "Remover proteção" num deles. Esperado: perde o cadeado e volta a abrir sem PIN.

## Cenário 2 — Re-bloqueio sem derrubar o áudio (FR-010, SC-003)

1. Desbloquear um livro protegido e abrir no leitor. Iniciar o TTS.
2. Bloquear a tela do aparelho (ou trocar de app) por ~15 s. Esperado: **o áudio continua**.
3. Voltar ao app. Esperado: conteúdo do leitor escondido atrás do pedido de PIN; o áudio segue tocando.
4. Digitar o PIN. Esperado: o leitor reaparece **na mesma posição**, sem recarregar.
5. Repetir, mas tocar em cancelar (ou no voltar do Android) no pedido de PIN. Esperado: sai do leitor e volta à tela anterior; só **uma** tela é fechada.
6. Com o livro **re-bloqueado** e o TTS tocando, usar a notificação/tela de bloqueio: pausar, tocar play, próximo e anterior. Esperado: todos funcionam sem PIN, e o leitor (ao voltar e digitar o PIN) está na posição para onde o áudio avançou.
7. Deixar a tela apagar por conta própria durante a leitura em voz alta. Esperado: o áudio não para; ao reacender e abrir o app, o PIN é pedido (sem tolerância).

## Cenário 3 — Botão voltar com o prompt aberto (R-003)

1. Com o app bloqueado, na Biblioteca, tocar num livro protegido (abre o PIN).
2. Apertar o voltar do Android. Esperado: o PIN fecha e o usuário **continua na Biblioteca** (não vai para a Home).

## Cenário 4 — Tentativas erradas (FR-011, SC-004)

1. Digitar 5 PINs errados seguidos. Esperado: teclado trava com contagem regressiva de 30 s.
2. Fechar o app por completo e reabrir durante a espera. Esperado: a contagem **continua** de onde estava; PIN correto digitado na espera **não** é aceito (SC-004).
3. Esperar acabar e errar mais 5. Esperado: espera de 1 min.
4. Acertar o PIN. Esperado: a contagem de erros zera (próxima rodada volta a 30 s).

## Cenário 5 — Esqueci o PIN (US2; FR-013, SC-005)

1. No pedido de PIN (Android com bloqueio de tela), tocar "Esqueci o PIN". Esperado: abre a tela do sistema pedindo o padrão/PIN/senha **do aparelho**.
2. Digitar a credencial correta e definir o PIN `5678`. Esperado: em menos de 1 min (SC-005), os livros continuam protegidos e abrem com `5678`; `1234` não vale mais.
3. Repetir errando a credencial do aparelho ou voltando. Esperado: PIN antigo continua valendo e nada muda.
4. Com o app aberto na tela do sistema, trocar de app e voltar. Esperado: o fluxo de recuperação **não** é fechado (o re-bloqueio não derruba o prompt aberto).
5. Remover o bloqueio de tela do aparelho (ou usar um aparelho sem ele) e repetir. Esperado: aviso de que não há como confirmar a identidade e só redefine depois de confirmar explicitamente.
6. Confirmar que **a sessão do app não muda** em nenhum passo (não recarrega nem troca de biblioteca).
7. Na web (`npm run dev`): "Esqueci o PIN" abre o popup do Google pedindo senha; com outra conta, mensagem de conta diferente e PIN antigo valendo; sem rede, mensagem de que precisa de conexão.

## Cenário 6 — Alterar e desativar (US2; FR-014)

1. Configurações → "Livros protegidos" → "Alterar PIN". Esperado: pede o PIN atual, depois o novo duas vezes; livros seguem protegidos.
2. "Desativar proteção". Esperado: pede PIN atual e confirmação; depois todos os livros perdem o cadeado, o filtro "Protegidos" some e a tela volta ao estado "sem PIN".

## Cenário 7 — Grupo "Protegidos" e seleção múltipla (US3; FR-015 a FR-018)

1. Com 3 livros protegidos, abrir a Biblioteca. Esperado: chip "Protegidos 🔒" visível; sem protegidos, o chip não aparece.
2. Tocar o chip. Esperado: lista só os 3, todos com cadeado fechado. Tocar "Desbloquear", digitar o PIN. Esperado: os 3 ficam abertos.
3. Bloquear de novo. Fazer long-press num protegido. Esperado: **não** entra em modo de seleção e mostra "Desbloqueie para selecionar".
4. Desbloquear, fazer long-press, marcar 2 protegidos e 1 comum. Esperado: seleção normal. Mandar o app para segundo plano e voltar. Esperado: seleção limpa (nenhum livro bloqueado fica marcado).
5. Colocar um protegido numa coleção e com uma tag. Esperado: aparece nos filtros da tag, da coleção **e** em "Protegidos".

## Cenário 8 — Regressão (FR-020, SC-006)

1. Com a feature ativa e livros comuns: abrir, favoritar, mudar status, excluir, selecionar em lote. Esperado: **mesmo número de toques de antes**, sem cadeado e sem pedido de PIN.
2. Rodar `npm run test:debug-epubs` se algo do leitor compartilhado foi tocado (não deveria).

## Cenário 9 — Pontas soltas

1. **Abrir com** (intent de arquivo) um EPUB que já está importado e protegido. Esperado: aparece "Este livro já está na biblioteca" e o livro **não** abre (o import rejeita duplicata); o livro segue protegido e sem duplicata.
2. **Importar um livro** pelo seletor de arquivos com o app desbloqueado (R-002). Esperado: ao voltar do seletor o app pode estar re-bloqueado; isso é o comportamento aceito, só confirmar que o import termina.
3. Idiomas: trocar o app entre pt-BR, en e es. Esperado: todos os textos novos traduzidos (FR-021).
4. Leitor de tela (TalkBack): o cadeado anuncia "protegido, bloqueado/desbloqueado" e o teclado do PIN é navegável (FR-022).
5. Trocar de conta Google. Esperado: o app recarrega e o PIN/proteção da outra conta não aparecem (banco por uid).

## Itens cross-cutting da constitution

- [ ] `npm run build` sem erros
- [ ] Nenhuma dependência nova
- [ ] Schema apenas com `version(20)` adicionada
- [ ] Fluxo principal e edge cases testados no browser e no aparelho
- [ ] Comentários explicando os "porquês" (crypto, `inert`, fechamento adiado)
