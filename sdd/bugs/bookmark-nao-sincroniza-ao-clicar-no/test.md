# Bug Verification: Bookmark não sincroniza ao clicar no ícone (fica vermelho)

- **Slug**: bookmark-nao-sincroniza-ao-clicar-no
- **Testado**: 2026-10-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O fix continua aplicado: tocar no ícone com `permission-error` reconecta o Drive antes de reagendar o sync; se a reconexão falhar, não agenda. Os dois testes específicos e a suíte completa passaram nesta revisão. O sintoma original com conta/token reais no Android não foi reproduzido novamente, portanto não há evidência suficiente para `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução automatizada dos ramos do fix | `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx -t 'toque com status permission-error' --reporter=verbose` | pass | 2 testes aprovados; 68 não selecionados pelo filtro. Reconectar antes do sync e não agendar quando não obtém token. |
| Suíte completa | `npm test` | pass | 150 arquivos aprovados e 2 ignorados; 1.553 testes aprovados e 2 ignorados. Inclui os demais testes de BookDetailsScreen e os serviços do Drive. |
| Lint | `npm run lint` | pass | Sem erros. |
| Type-check e build de produção | `npm run build` | pass | `tsc -b` + Vite concluídos; avisos de tamanho de chunk e tempo de plugins, sem erro. |
| Reprodução Android/Google OAuth reais | — | not-run | Não houve login, revogação de acesso, alteração de conta ou reinstalação nesta auditoria. |

## Output Excerpts

```text
Suíte completa: 1553 passed | 2 skipped (1555)
Filtro do fix: 2 passed | 68 skipped (70)
```

## Residual Risks

- Os testes do ícone mockam a autenticação e o agendamento. Não provam que um token real voltou nem que o upload terminou no Drive.
- A feature 021 adicionou renovação silenciosa no serviço do Drive, mas o caminho explícito do ícone continua presente. Comentários antigos em BookDetailsScreen sobre ausência de renovação automática estão desatualizados; isso não é evidência de falha funcional.
- Para fechar: em Android com `permission-error`, tocar no ícone, concluir a reconexão se solicitada e confirmar `bookmark.sync.success` e a marcação sincronizada.

## Recommendation

Manter `partial`: corrigido no código e validado por testes automatizados; resta validar a integração com Google/Android reais. Nenhum código foi alterado nesta revisão.
