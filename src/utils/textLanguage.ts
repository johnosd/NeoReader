// Detecção de idioma por frequência de palavras funcionais (stopwords), sem dependência
// nova (DI-012). Cobre os idiomas de src/utils/languageOptions.ts. Serve para PDFs, que
// quase nunca trazem idioma nos metadados; devolve null quando não há confiança — nunca
// "chuta" um idioma (o chamador mostra o aviso de idioma indefinido, FR-020).

// Texto com menos palavras que isso é amostra pequena demais para decidir.
const MIN_TOKENS = 50
// Fração mínima de palavras do texto que precisam ser stopwords do idioma vencedor.
// Texto real de um idioma fica bem acima (~30-45%); lixo/tabela/código fica abaixo.
const MIN_STOPWORD_RATIO = 0.15
// O vencedor precisa ter ao menos 1,5× a fração do segundo colocado. Palavras como "de",
// "que", "la" existem em vários idiomas latinos, então o 2º lugar nunca é zero (português
// real: vencedor 0,39–0,46 vs espanhol 0,20–0,24, margem 1,75–2,1, medido em 11 livros).
// Texto misturado ou ambíguo cai abaixo dessa margem e vira "indefinido".
const MIN_MARGIN_RATIO = 1.5
// Japonês não separa palavras por espaço: decide pela proporção de kana entre as letras.
const MIN_KANA_RATIO = 0.2

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean))

// Códigos iguais aos de BOOK_LANGUAGE_OPTIONS (português = 'pt-BR', única variante da lista).
const STOPWORDS: Record<string, Set<string>> = {
  en: words(`the of and to in is that it was for on are as with his they be at one have this from or had by
    not but what all were we when your can said there an each which she do how their if will up about out
    many then them these so some her would make like him into has more you he been who its than now could
    other our also after although because while whenever`),
  'pt-BR': words(`de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele
    das tem à seu sua ou ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois
    sem mesmo aos ter seus quem nas me esse eles estão você tinha foram essa num nem suas meu às minha têm
    numa pelos elas havia seja qual será nós tenho lhe deles essas esses pelas este fosse dele embora porque
    enquanto`),
  es: words(`de la que el en y a los del se las por un para con no una su al lo como más pero sus le ya o este
    sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos
    uno les ni contra otros ese eso ante ellos e esto antes algunos qué unos yo otro otras otra él tanto esa
    estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu aunque
    mientras es fue`),
  fr: words(`de la le et les des en un du une que est pour qui dans a par plus pas au sur ne se ce il sont avec
    son ses mais comme ou leur elle être ont aux nous vous cette ces été était tout fait sans entre aussi très
    bien même ainsi alors où je tu lui y ni car dont après avant depuis`),
  de: words(`der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden
    aus er hat dass sie nach wird bei einer um am sind noch wie einem über einen so zum war haben nur oder
    aber vor zur bis mehr durch man sein wurde sei ich wir ihr ihre dieser diese kann wenn weil obwohl`),
  it: words(`di e il la che in a per un del è una con non le si da dei i al della come più ma sono lo gli nel
    o alla anche se ha delle nella suo ci questo essere tra fra loro ho dal dalla quando molto perché però
    quella questa sia mi stato era tutto dopo senza nei sul sulla cui ancora già mentre quindi ogni aveva`),
}

// Kana (hiragana + katakana) — a presença dominante delas distingue japonês de chinês.
const KANA = /[぀-ヿ]/g

// Fração de palavras do texto que são stopwords de cada idioma, do maior para o menor.
// Exportada também para calibrar os limiares acima contra textos reais.
export function rankLanguages(text: string): Array<{ language: string; ratio: number }> {
  const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (tokens.length === 0) return []
  return Object.entries(STOPWORDS)
    .map(([language, list]) => ({
      language,
      ratio: tokens.filter((token) => list.has(token)).length / tokens.length,
    }))
    .sort((a, b) => b.ratio - a.ratio)
}

export function detectTextLanguage(text: string): string | null {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  const kana = text.match(KANA)?.length ?? 0
  if (letters >= MIN_TOKENS && kana / letters >= MIN_KANA_RATIO) return 'ja'

  const tokenCount = text.match(/\p{L}+/gu)?.length ?? 0
  if (tokenCount < MIN_TOKENS) return null

  const [best, second] = rankLanguages(text)
  if (best.ratio < MIN_STOPWORD_RATIO) return null
  if (best.ratio < second.ratio * MIN_MARGIN_RATIO) return null
  return best.language
}
