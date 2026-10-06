// Achar e validar ISBN-10/13 em texto livre (página de copyright de PDF — DI-013).
// O Open Library só busca por ISBN, então um ISBN achado no texto destrava o enriquecimento.

export function isValidIsbn10(digits: string): boolean {
  if (!/^\d{9}[\dX]$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const value = digits[i] === 'X' ? 10 : Number(digits[i])
    sum += value * (10 - i)
  }
  return sum % 11 === 0
}

export function isValidIsbn13(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 13; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3)
  return sum % 10 === 0
}

// Uma corrida de grupos numéricos separados por espaço/hífen, com "ISBN" opcional na frente.
// Ex.: "ISBN 978-0-306-40615-7", "ISBN-10: 0-306-40615-2", "978 85 7522 123 4".
const RUN = /(ISBN(?:-1[03])?\s*:?\s*)?([0-9][0-9Xx]*(?:[ -][0-9][0-9Xx]*)*)/gi

/**
 * Devolve os ISBNs válidos (só dígitos, X maiúsculo) na ordem de ocorrência, sem repetir.
 * - ISBN-13 vale em qualquer contexto, mas precisa começar com 978/979 e fechar o dígito verificador
 *   (números aleatórios de 13 dígitos quase nunca passam nas duas condições);
 * - ISBN-10 só vale logo depois da palavra "ISBN" (10 dígitos soltos são comuns demais: telefones etc.).
 */
export function findIsbns(text: string): string[] {
  const found: string[] = []
  const add = (isbn: string) => {
    if (!found.includes(isbn)) found.push(isbn)
  }

  for (const match of text.matchAll(RUN)) {
    const hasKeyword = Boolean(match[1])
    const groups = match[2].split(/[ -]/)

    let start = 0
    while (start < groups.length) {
      let digits = ''
      let end = start
      let accepted = false

      // Junta grupos a partir de `start` até 13 caracteres, testando 10 e 13.
      for (; end < groups.length && digits.length < 13; end++) {
        digits += groups[end].toUpperCase()
        if (digits.length === 13 && /^97[89]/.test(digits) && isValidIsbn13(digits)) {
          add(digits)
          accepted = true
          break
        }
        if (digits.length === 10 && hasKeyword && start === 0 && isValidIsbn10(digits)) {
          add(digits)
          accepted = true
          break
        }
      }

      start = accepted ? end + 1 : start + 1
    }
  }

  return found
}

/**
 * Contexto da linha onde o ISBN aparece, para separar o ISBN DESTA edição de outros que a página de copyright
 * também traz (feature 022, R-025):
 * - `other-work`: outra obra — o original de uma tradução ("This translation is published by permission",
 *   "Título original", "tradução de"). Nunca é desta edição.
 * - `edition-history`: histórico de edições ("Primeira edição (ISBN …)", "previous edition").
 * - `clean`: linha sem esses sinais.
 * O "©" não entra como sinal: a linha certa muitas vezes é "Copyright © 2026 … ISBN 978-…".
 */
export type IsbnContext = 'clean' | 'edition-history' | 'other-work'

const OTHER_WORK_PATTERN =
  /\btranslat|tradu[cç][aã]o|traduzid|t[ií]tulo original|original title|title of the original|by permission|com a permiss[aã]o|sob licen[cç]a|publicad[ao] (?:com|sob)/i
const EDITION_HISTORY_PATTERN =
  /\b(?:primeira|segunda|terceira|1ª|2ª|3ª)\s+edi[cç][aã]o|edi[cç][aã]o anterior|\b(?:first|second|third|previous|earlier)\s+edition/i

export function classifyIsbnLine(line: string): IsbnContext {
  if (OTHER_WORK_PATTERN.test(line)) return 'other-work'
  if (EDITION_HISTORY_PATTERN.test(line)) return 'edition-history'
  return 'clean'
}

/** Como `findIsbns`, mas devolve também o contexto da linha de cada ISBN (1ª ocorrência vale). */
export function findIsbnsWithContext(text: string): Array<{ isbn: string; context: IsbnContext }> {
  const found: Array<{ isbn: string; context: IsbnContext }> = []
  for (const line of text.split('\n')) {
    for (const isbn of findIsbns(line)) {
      if (found.some((entry) => entry.isbn === isbn)) continue
      found.push({ isbn, context: classifyIsbnLine(line) })
    }
  }
  return found
}
