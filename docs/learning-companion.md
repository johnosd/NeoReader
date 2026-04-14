# Learning Companion — Python Dev → EPUB Reader

> Guia desenhado pra quem sabe Python/SQL e nunca tocou em JS/TS/React.
> **Filosofia**: Claude Code faz o trabalho pesado. Você aprende lendo o código dele com contexto. Não para pra estudar antes — estuda enquanto constrói.

---

## 1. Mentalidade correta

Você **não** precisa aprender JavaScript/TypeScript/React antes de começar. Isso é armadilha clássica que trava projetos por meses.

O que você precisa é:
1. **Entender o que está lendo** quando Claude Code te mostrar um diff
2. **Saber perguntar** quando algo não fizer sentido
3. **Rodar o código** localmente e no celular

O resto vem por osmose. Dev real é 80% leitura de código dos outros.

---

## 2. Mapa mental: Python → TypeScript

| Python | TypeScript | Observação |
|---|---|---|
| `def soma(a: int, b: int) -> int:` | `function soma(a: number, b: number): number {}` | Tipos na frente do `:` |
| `lista: list[str] = []` | `const lista: string[] = []` | `const` = imutável, `let` = mutável |
| `dict` | `object` ou `Record<string, T>` | Chave-valor |
| `None` | `null` ou `undefined` | São diferentes em TS |
| `if x is None:` | `if (x === null)` ou `if (!x)` | `===` compara tipo+valor |
| `for x in lista:` | `for (const x of lista)` | `of` (não `in`) |
| `[x*2 for x in lista]` | `lista.map(x => x * 2)` | `.map`, `.filter`, `.reduce` |
| `import pandas as pd` | `import pd from 'pandas'` | ES modules |
| `async def foo():` | `async function foo()` | `await` idêntico |
| f-string `f"{x}"` | template `` `${x}` `` | Backticks |
| `class Foo:` | `class Foo {}` | Muito parecido |
| `print(x)` | `console.log(x)` | Idem |

**Ponto-chave**: TypeScript é JavaScript com tipos. Se você entende a linha sem os tipos, entendeu. Tipos são "decoração que previne bug".

---

## 3. React em 5 minutos (o mínimo absoluto)

React é uma função que devolve HTML. Quando um "estado" muda, a função roda de novo automaticamente.

```tsx
import { useState } from 'react';

function Contador() {
  const [contagem, setContagem] = useState(0);  // estado

  return (
    <button onClick={() => setContagem(contagem + 1)}>
      Cliquei {contagem} vezes
    </button>
  );
}
```

**Traduzindo linha a linha**:
- `useState(0)` = cria uma variável que, quando muda, re-renderiza a tela. Começa em 0.
- Retorna uma tupla (como em Python): `[valor, funçãoQueAtualiza]`
- `<button>` é HTML dentro do JS. Isso é JSX.
- `onClick={...}` é um event handler. Função que roda no clique.
- Quando `setContagem` é chamado, React re-executa a função `Contador()` inteira e atualiza só o que mudou no DOM.

**Analogia com Python**: imagine um `while True` que re-desenha a tela quando qualquer variável observada muda. React cuida do loop pra você.

Se você entendeu esse exemplo, entendeu 70% de React. O resto é:
- `useEffect` = "roda esse código quando tal coisa mudar" (equivalente a reactive triggers)
- Componentes = funções que você compõe (tipo funções Python chamando funções Python)
- Props = argumentos que você passa pra um componente

---

## 4. Capacitor em 2 minutos

Capacitor pega seu site (HTML+JS+CSS) e empacota como app Android. Do ponto de vista do Android, é uma WebView fullscreen. Do seu ponto de vista, você programa um site.

Quando precisa de coisa nativa (TTS, filesystem, câmera), você chama um **plugin**:

```ts
import { TextToSpeech } from '@capacitor-community/text-to-speech';

await TextToSpeech.speak({ text: 'Hello world', lang: 'en-US' });
```

Por baixo, isso vira uma chamada Kotlin/Java no Android. Você não vê essa parte.

---

## 5. Workflow com Claude Code (seu piloto automático)

Este é o coração da tua produtividade. Regras:

### 5.1. Estrutura de cada sessão
1. **Você**: descreve o que quer em português, com contexto do plano
2. **Claude Code**: propõe plano de implementação antes de escrever código
3. **Você**: aprova ou ajusta
4. **Claude Code**: implementa com testes e explicação
5. **Você**: lê o diff, pergunta sobre qualquer linha estranha, roda

### 5.2. CLAUDE.md obrigatório na raiz do projeto

Cria isso antes de tudo:

```markdown
# EPUB Reader — Contexto para Claude Code

## Perfil do dev
- Engenheiro de dados com background Python/SQL
- Não conhece JS/TS/React a fundo — aprende enquanto constrói
- Quer explicações breves inline nos PRs, não aulas longas

## Regras de ouro
1. Sempre explique decisões não óbvias em comentários curtos
2. Quando usar feature de JS/TS que não existe em Python, adicione 1 linha de comentário explicando
3. Prefira código explícito a "mágico" — evite abstrações desnecessárias
4. Rode testes/typecheck antes de dizer que terminou
5. Em dúvida de escopo, pergunte antes de implementar

## Stack
- React 18 + TypeScript + Vite
- Capacitor 6 (Android only no MVP)
- Tailwind CSS
- Dexie.js (IndexedDB wrapper)
- foliate-js ou epub.js (a decidir na fase de parser)

## Comandos
- `npm run dev` — dev server web
- `npm run build` — build produção
- `npx cap sync android` — sincroniza com projeto Android
- `npx cap run android` — builda e roda no device
- `npm run typecheck` — checa tipos
- `npm run test` — testes unitários (vitest)

## Convenções
- Componentes em PascalCase: `BookList.tsx`
- Hooks começam com `use`: `useReader.ts`
- Services são classes: `TranslationService.ts`
- Um arquivo = uma responsabilidade
```

### 5.3. Prompts modelo que funcionam

**Ruim**: "faz a tela de leitor"

**Bom**:
```
Implemente o componente ReaderScreen conforme descrito na seção 5 do plano:
- Recebe bookId via URL param
- Usa foliate-js pra renderizar o EPUB
- Gestos: swipe esquerda/direita = virar página, tap central = toggle chrome
- Salva progresso (cfi) no IndexedDB a cada virada de página (debounce 1s)
- Use o hook useBook(bookId) que já existe em src/hooks/

Antes de codar, me mostre o plano de arquivos que vai criar/editar e aguarde OK.
```

### 5.4. Quando pedir explicação vs quando confiar

**Peça explicação** quando:
- Você não entende o que uma função do código dele faz
- Aparece uma sintaxe que você nunca viu
- Uma decisão arquitetural não faz sentido óbvio

**Confie e siga** quando:
- É boilerplate (setup, imports, configs)
- É código que você pode ler e entender mesmo sem ter escrito
- Os testes passam e o comportamento tá certo

---

## 6. Setup inicial (faça você mesmo, pra aprender o básico)

Fazer esse setup manualmente uma vez cria familiaridade. Depois disso, Claude Code assume.

```bash
# 1. Criar projeto
npm create vite@latest epub-reader -- --template react-ts
cd epub-reader
npm install

# 2. Rodar e confirmar que funciona
npm run dev
# Abre http://localhost:5173 — se vê a página padrão, tá ok

# 3. Adicionar Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init "EPUB Reader" "com.johnny.epubreader" --web-dir=dist

# 4. Build pra criar pasta dist/
npm run build

# 5. Adicionar Android
npm install @capacitor/android
npx cap add android

# 6. Abrir projeto Android no Android Studio
npx cap open android
```

A partir daqui, **você passa o bastão pro Claude Code**. Abre o VSCode/Cursor na raiz do projeto, cria o `CLAUDE.md` acima, e começa a descrever features.

---

## 7. Armadilhas que vão aparecer

1. **`undefined is not a function`** — chamaste algo que não existe. Geralmente import errado. Copia a mensagem pro Claude Code.
2. **Estado não atualiza** — em React, nunca faça `objeto.prop = x`. Sempre crie novo objeto: `setObj({ ...obj, prop: x })`. React compara por referência.
3. **`async` em useEffect** — não pode. O Claude Code sabe o pattern certo (função interna async).
4. **Capacitor plugin não funciona no browser** — normal. Só roda no device. Teste com `npx cap run android`.
5. **Build Android falha** — 80% das vezes é versão de JDK/SDK. Use Android Studio pra abrir e ele sugere correções.

---

## 8. Recursos mínimos (só o essencial)

Não leia isso tudo antes. Consulta pontual.

- **TypeScript handbook** (só seção "The Basics"): https://www.typescriptlang.org/docs/handbook/2/basic-types.html
- **React docs — Quick Start**: https://react.dev/learn
- **Capacitor docs**: https://capacitorjs.com/docs/getting-started
- **Dexie.js quick start**: https://dexie.org/docs/Tutorial/Getting-started

---

## 9. Ciclo de aprendizado recomendado

Por semana:
- **Segunda**: você lista as features da semana, Claude Code propõe plano
- **Terça/quarta/quinta**: desenvolvimento guiado por Claude Code, você lê todo código mergeado
- **Sexta**: retrospectiva. Você anota em `LEARNINGS.md` (na raiz do repo) os 3-5 conceitos novos que viu. Pergunta pro Claude Code o que não entendeu.

**Exemplo de entrada em LEARNINGS.md**:
```
## 2026-04-20
- `useState` retorna tupla — primeiro valor, segundo setter
- `useEffect(() => {...}, [dep])` só roda quando `dep` muda (como trigger SQL)
- TypeScript `?` = opcional. `foo?: string` quer dizer pode ser string ou undefined
```

Em 4 semanas você vai ter esse arquivo com ~50 conceitos — equivale a um curso acelerado, mas sedimentado em código real que você escreveu.

---

## 10. Regra final

Se em algum momento você se pegar **mais de 30 minutos lendo tutorial**, para. Volta pro Claude Code, descreve o que tá tentando fazer, e deixa ele te destravar. Aprender lendo tutorial descontextualizado é o caminho mais lento possível.

Você aprende fazendo. O app é o curso.
