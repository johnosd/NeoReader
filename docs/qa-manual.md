# Roteiro de Testes Manuais — NeoReader EPUB Reader

**Dispositivo alvo:** Android (Capacitor 6)
**Versão do app:** ______
**Data do teste:** ______
**Testador:** ______

---

## TC-01 — Abertura de livro válido

**Pré-condição:** Livro EPUB válido já importado na biblioteca.

**Passos:**
1. Abrir o app
2. Tocar no livro na biblioteca

**Resultado esperado:** Leitor abre em ≤ 3 s, primeiro capítulo renderizado com texto legível, sem tela preta.

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-02 — Abertura de livro com estrutura inválida ou corrompida

**Pré-condição:** Arquivo `.epub` com estrutura inválida (renomeie um `.zip` corrompido para `.epub` e importe).

**Passos:**
1. Importar o arquivo inválido
2. Tocar no livro na biblioteca

**Resultado esperado:** Tela de erro com mensagem legível. Nenhum crash. Botão para voltar à biblioteca funciona.

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-03 — Scroll dentro de um capítulo

**Pré-condição:** Livro aberto em capítulo com conteúdo maior que uma tela.

**Passos:**
1. Deslizar o dedo para cima (rolagem para baixo) de forma lenta e contínua
2. Deslizar o dedo para baixo (rolagem para cima)
3. Fazer scroll rápido (flick)

**Resultado esperado:**
- Scroll rola o conteúdo sem abrir tradução
- Texto não pula nem treme
- Posição permanece estável ao parar

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-04 — Transição automática para o próximo capítulo (chapter auto-advance)

**Pré-condição:** Livro aberto; capítulo atual **não** é o último.

**Passos:**
1. Rolar até o fim do capítulo (banner "Fim do capítulo" aparece)
2. Deslizar para baixo uma 1ª vez — nada deve acontecer ainda
3. Deslizar para baixo uma 2ª vez consecutiva

**Resultado esperado:**
- Na 2ª tentativa: navegação automática para o próximo capítulo
- Novo capítulo carrega do início
- Banner desaparece

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-05 — Tentativa de passar do último capítulo

**Pré-condição:** Livro aberto no **último** capítulo.

**Passos:**
1. Rolar até o fim do capítulo
2. Deslizar para baixo múltiplas vezes (≥ 2)

**Resultado esperado:**
- Banner mostra "Fim do livro" (sem instrução de arraste)
- Nenhuma navegação acontece
- App não crasha

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-06 — Navegação reversa: voltar ao fim do capítulo anterior

**Pré-condição:** Livro aberto no início de qualquer capítulo que **não** seja o primeiro.

**Passos:**
1. Confirmar que está no início do capítulo (scrollY = 0)
2. Deslizar para cima (scroll up) uma 1ª vez — nada deve acontecer
3. Deslizar para cima uma 2ª vez consecutiva
4. Rolar para cima, depois repetir os passos 2-3

**Resultado esperado:**
- Na 2ª tentativa: navega para o **fim** do capítulo anterior
- Capítulo anterior carrega já posicionado no final
- Rolar para cima entre as tentativas reseta o contador (precisa de 2 novos swipes)

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-07 — Tap em texto para tradução

**Pré-condição:** Livro aberto, conexão ativa, idioma destino configurado.

**Passos:**
1. Tocar precisamente em uma palavra no meio de um parágrafo
2. Aguardar a tradução

**Resultado esperado:**
- Frase que contém a palavra tocada fica destacada (fundo índigo)
- Bloco de tradução aparece logo abaixo do parágrafo com spinner e depois o texto traduzido
- Botões "🔊 Ouvir" e "⭐ Salvar" aparecem

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-08 — Tap em segundo texto antes da tradução terminar (deve ser bloqueado)

**Pré-condição:** Livro aberto, conexão **lenta** (ative throttling no celular em Config > Rede).

**Passos:**
1. Tocar em um parágrafo (tradução começa, spinner visível)
2. Imediatamente tocar em **outro** parágrafo diferente

**Resultado esperado:**
- Segundo tap é **ignorado** enquanto spinner está visível
- Apenas o primeiro parágrafo permanece destacado
- Tradução conclui normalmente para o primeiro parágrafo

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-09 — Seleção múltipla (deve limpar a anterior)

**Pré-condição:** Livro aberto, tradução de uma frase já concluída (bloco visível).

**Passos:**
1. Tocar em parágrafo A → tradução aparece
2. Aguardar tradução concluir
3. Tocar em parágrafo B (diferente)

**Resultado esperado:**
- Destaque do parágrafo A é removido imediatamente
- Bloco de tradução do parágrafo A desaparece
- Parágrafo B fica destacado com novo bloco

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-10 — Navegação pelo índice (TOC)

**Pré-condição:** Livro com múltiplos capítulos aberto.

**Passos:**
1. Tocar no ícone 📑 (TOC) no chrome superior
2. Tocar em um capítulo que não é o atual (ex: capítulo do meio)
3. Verificar posição
4. Tocar novamente em 📑 e escolher o primeiro capítulo

**Resultado esperado:**
- Sheet do TOC abre com lista de capítulos
- Tap no capítulo navega diretamente para ele
- Texto do capítulo selecionado renderiza corretamente
- Percentage bar atualiza para refletir a nova posição

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## TC-11 — Retomar leitura em livro já aberto anteriormente (posição salva)

**Pré-condição:** Livro que já foi aberto e lido até pelo menos 20% de progresso.

**Passos:**
1. Abrir o livro, ler um trecho, sair pela seta ← (back)
2. Abrir o mesmo livro novamente da biblioteca

**Resultado esperado:**
- Leitor retoma exatamente onde parou (mesma seção e posição de scroll)
- Percentage bar mostra o progresso correto
- Sem flash de outra posição antes de restaurar

**Resultado obtido:** ______

**Status:** ✅ / ❌

---

## Resumo de resultados

| TC | Descrição | Status |
|----|-----------|--------|
| TC-01 | Abertura de livro válido | |
| TC-02 | Abertura de livro inválido | |
| TC-03 | Scroll dentro de capítulo | |
| TC-04 | Auto-advance próximo capítulo | |
| TC-05 | Tentativa além do último capítulo | |
| TC-06 | Navegação reversa ao capítulo anterior | |
| TC-07 | Tap para tradução | |
| TC-08 | Tap bloqueado durante tradução | |
| TC-09 | Seleção múltipla limpa anterior | |
| TC-10 | Navegação pelo TOC | |
| TC-11 | Retomar leitura (posição salva) | |

**Total ✅:** _____ / 11
