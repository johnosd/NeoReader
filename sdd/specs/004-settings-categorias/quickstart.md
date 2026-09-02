# Quickstart: Reorganizar Tela de Settings em Categorias Navegáveis

## Pré-requisitos

- `npm install` já rodado.
- Para o cenário de botão físico de voltar: um device/emulador Android
  conectado (`adb devices`) com o app instalado (`npm run android:run`). O
  restante do fluxo pode ser validado só no browser (`npm run dev`).

## Checagens automatizadas

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Todos os quatro devem passar sem erro antes de considerar a feature pronta
(Constitution IV).

## Cenário ponta a ponta (manual)

1. Abrir o app (`npm run dev`, ou no device via `npm run android:run`) e
   logar.
2. A partir de Home, tocar em Configurações.
   - **Esperado**: aparece o menu de categorias (lista curta, ícone + nome +
     seta), não a lista longa antiga com tudo exposto. No máximo ~10 itens
     no total (SC-001).
3. Tocar em "Aparência do Leitor".
   - **Esperado**: entra numa subtela mostrando só os controles de tema,
     fonte, tamanho, espaçamento e modo — nada de Word Lens, Narração etc.
     misturado.
4. Mudar o tema do leitor pra um valor diferente do atual.
   - **Esperado**: mudança aplicada imediatamente (mesmo feedback visual de
     antes).
5. Tocar em voltar (botão da UI).
   - **Esperado**: retorna ao MENU de categorias, não sai do Settings.
6. Abrir o leitor de um livro qualquer e confirmar que o tema mudado no
   passo 4 persistiu (fecha o leitor, reabre Configurações → Aparência do
   Leitor e confirma o mesmo valor selecionado).
7. De volta ao menu de categorias, repetir os passos 3-5 para pelo menos
   mais duas categorias (ex: Word Lens — mudar o nível CEFR; Idioma — trocar
   o idioma padrão de tradução), confirmando persistência e volta ao menu em
   cada uma.
8. Tocar em "Integrações/Chaves de API", expandir um provedor (ex:
   Speechify), colar uma chave válida, sair do campo (blur).
   - **Esperado**: mesmo fluxo de validação/salvamento de hoje (badge
     "Conectado"/"Inválido").
9. Tocar em "Sincronização na Nuvem".
   - **Esperado**: mesmo conteúdo de status (bookmark/progress/vocabulary)
     que existe hoje na tela única, incluindo o aviso de reconectar quando
     aplicável — sem nenhum badge novo no menu principal antes de entrar
     aqui (FR-009, fora de escopo nesta feature).
10. Voltar ao menu de categorias e conferir os 3 itens diretos:
    - "Plano Pro" abre a tela de Paywall direto (sem subtela intermediária).
    - "Cotas de Uso" mostra os números de uso restante ali mesmo, sem clique
      extra.
    - "Build/Sobre" mostra a info de chaves públicas ali mesmo.
11. **Só no device Android**: a partir de dentro de qualquer categoria,
    usar o botão físico/gesto de voltar do Android.
    - **Esperado**: mesmo comportamento do passo 5 (volta ao menu, não sai
      do Settings/app). No menu de categorias, o botão físico de voltar sai
      do Settings normalmente (comportamento já existente, sem mudança).

## Checklist cross-cutting (constitution)

- [ ] `npm run build` limpo (tipos + bundling).
- [ ] `npm run lint` sem novos warnings/erros.
- [ ] `npm test` verde, incluindo os testes migrados/novos por subtela.
- [ ] Nenhuma dependência nova em `package.json`.
- [ ] Textos novos (labels/descrições de categoria) presentes nos 3 locales
      (pt-BR, en, es) — testar trocando o idioma do app em cada subtela.
- [ ] Testado num browser real (ou device Android) além dos testes
      automatizados — corretude de feature, não só de código.
