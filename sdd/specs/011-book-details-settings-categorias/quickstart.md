# Quickstart: Reorganizar Aba Configurações do Livro em Categorias Navegáveis

## Pré-requisitos

- `npm install` já rodado.
- Um livro qualquer já importado na biblioteca local.
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

1. Abrir o app (`npm run dev`, ou no device via `npm run android:run`),
   logar, abrir a tela de detalhes de qualquer livro da biblioteca.
2. Observar a lista de abas no topo.
   - **Esperado**: Capítulos, Marcações, Destaques, Reviews, Autor,
     Configurações — 6 abas, **sem** "Detalhes" separado (SC-002).
3. Tocar na aba "Configurações".
   - **Esperado**: aparece um menu de 4 categorias (ícone + nome +
     descrição): Aparência do Leitor, Idioma, Narração, Detalhes — não a
     lista longa antiga com tudo exposto de uma vez (SC-001).
4. Tocar em "Aparência do Leitor".
   - **Esperado**: entra numa subvisão mostrando só o preview, diagnóstico
     de estilos (se houver), tema, fonte, tamanho, altura de linha e modo
     de leitura — nada de Idioma/Narração/Detalhes misturado.
5. Mudar o tema do leitor deste livro pra um valor diferente do atual.
   - **Esperado**: mudança aplicada e persistida imediatamente (mesmo
     feedback visual de antes da reorganização).
6. Tocar em voltar (botão da UI, dentro da subvisão).
   - **Esperado**: retorna ao MENU de categorias (ainda dentro da aba
     Configurações), não sai da tela de detalhes do livro.
7. Abrir o livro no leitor e confirmar que o tema mudado no passo 5
   persistiu; voltar pra tela de detalhes do livro.
8. No menu de categorias, tocar em "Narração".
   - **Esperado**: só provedor de TTS, voz e velocidade — sem nada de
     Aparência/Idioma/Detalhes.
9. Tocar no controle de voz, confirmar que o bottom sheet de seleção de voz
   (com busca e preview de áudio) abre e funciona exatamente como antes.
   Fechar o sheet.
10. Voltar ao menu de categorias (botão da UI). Tocar em "Idioma".
    - **Esperado**: idioma do livro e idioma de tradução aparecem juntos,
      cada um com seu próprio bottom sheet, exatamente como no comportamento
      anterior.
11. Voltar ao menu de categorias. Tocar em "Detalhes".
    - **Esperado**: sinopse/informações do livro, diagnósticos de fontes de
      metadados (botão "Atualizar informações" incluso), idioma detectado,
      data de adição, último acesso e tamanho do arquivo — mesmo conteúdo
      que existia na aba "Detalhes" antiga.
12. Trocar para a aba "Capítulos" e depois voltar pra aba "Configurações".
    - **Esperado**: aparece o MENU de categorias de novo (não a categoria
      "Detalhes" em que se estava antes de trocar de aba) — FR-007.
13. **Só no device Android**: a partir de dentro de qualquer categoria
    (ex: "Narração"), usar o botão físico/gesto de voltar do Android.
    - **Esperado**: mesmo comportamento do passo 6 (volta ao menu de
      categorias, não sai da tela de detalhes do livro). Repetir a partir do
      menu de categorias (sem categoria aberta): o botão físico de voltar
      sai da tela de detalhes do livro normalmente (comportamento já
      existente, sem mudança) — FR-005/FR-006.

## Checklist cross-cutting (constitution)

- [ ] `npm run build` limpo (tipos + bundling).
- [ ] `npm run lint` sem novos warnings/erros.
- [ ] `npm test` verde, incluindo os testes ajustados/novos de
      `BookDetailsScreen.test.tsx`.
- [ ] Nenhuma dependência nova em `package.json`.
- [ ] Textos novos (nomes/descrições de categoria) presentes nos 3 locales
      (pt-BR, en, es) — testar trocando o idioma do app.
- [ ] Testado num browser real (ou device Android) além dos testes
      automatizados — corretude de feature, não só de código.
