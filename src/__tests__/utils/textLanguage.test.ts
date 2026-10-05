import { describe, expect, it } from 'vitest'

import { detectTextLanguage } from '@/utils/textLanguage'
import { fixtureRawText } from '../testUtils/pdfFixtures'

// Textos originais (não copiados de livros) com ~60+ palavras cada.
const SAMPLES = {
  fr: `Le matin, la petite ville se réveille doucement et les habitants ouvrent leurs fenêtres pour regarder la
    rue. Il y a des enfants qui courent vers l'école, des vieux qui parlent de la pluie et un boulanger qui
    sort avec une grande corbeille de pain chaud. Nous aimons cette heure parce que tout semble possible, et
    que personne n'est encore pressé. Dans le café du coin, une femme lit son journal avec un sourire, tandis
    que le serveur prépare les tasses pour ceux qui arrivent.`,
  de: `Am Morgen wacht die kleine Stadt langsam auf, und die Bewohner öffnen ihre Fenster, um auf die Straße
    zu schauen. Es gibt Kinder, die zur Schule laufen, alte Männer, die über den Regen sprechen, und einen
    Bäcker, der mit einem großen Korb voll warmem Brot aus dem Haus kommt. Wir mögen diese Stunde, weil alles
    möglich scheint und noch niemand es eilig hat. In dem Café an der Ecke liest eine Frau ihre Zeitung mit
    einem Lächeln, während der Kellner die Tassen für die Gäste vorbereitet, die gerade ankommen.`,
  it: `La mattina la piccola città si sveglia lentamente e gli abitanti aprono le finestre per guardare la
    strada. Ci sono bambini che corrono verso la scuola, vecchi che parlano della pioggia e un fornaio che
    esce con un grande cesto di pane caldo. Ci piace questa ora perché tutto sembra possibile e nessuno ha
    ancora fretta. Nel caffè all'angolo una donna legge il suo giornale con un sorriso, mentre il cameriere
    prepara le tazze per quelli che stanno arrivando e non hanno molto tempo.`,
  ja: `朝になると、小さな町はゆっくりと目を覚まし、住人たちは窓を開けて通りを眺めます。学校へ走っていく子どもたち、雨について話す
    お年寄り、焼きたてのパンをたくさん入れた大きなかごを持って出てくるパン屋さんがいます。私たちはこの時間が好きです。なぜなら、
    すべてが可能に思えて、まだ誰も急いでいないからです。角にある喫茶店では、女性が微笑みながら新聞を読んでいます。`,
}

describe('detectTextLanguage — textos reais de fixtures (en/pt/es)', () => {
  it('detecta inglês', () => {
    expect(detectTextLanguage(fixtureRawText('1col', [2, 3, 4]))).toBe('en')
  })

  it('detecta português (pt-BR, a variante das opções de idioma do app)', () => {
    expect(detectTextLanguage(fixtureRawText('1col-pt'))).toBe('pt-BR')
  })

  it('detecta espanhol', () => {
    expect(detectTextLanguage(fixtureRawText('1col-es'))).toBe('es')
  })

  it('detecta mesmo com pouco texto (uma página), desde que passe do mínimo', () => {
    expect(detectTextLanguage(fixtureRawText('1col-pt', [2]))).toBe('pt-BR')
  })
})

describe('detectTextLanguage — outros idiomas', () => {
  it('detecta francês, alemão, italiano e japonês', () => {
    expect(detectTextLanguage(SAMPLES.fr)).toBe('fr')
    expect(detectTextLanguage(SAMPLES.de)).toBe('de')
    expect(detectTextLanguage(SAMPLES.it)).toBe('it')
    expect(detectTextLanguage(SAMPLES.ja)).toBe('ja')
  })
})

describe('detectTextLanguage — sem confiança → null (nunca chuta)', () => {
  it('texto curto demais', () => {
    expect(detectTextLanguage('The old librarian considered the question of memory.')).toBeNull()
    expect(detectTextLanguage('')).toBeNull()
  })

  it('texto misturado em dois idiomas de peso parecido', () => {
    expect(detectTextLanguage(`${SAMPLES.fr}\n${SAMPLES.de}`)).toBeNull()
  })

  it('texto sem palavras funcionais (tabela de números, código, nomes)', () => {
    const table = Array.from({ length: 80 }, (_, i) => `Sample${i} ${(i * 7.31).toFixed(2)} ${i * 13}`).join('\n')
    expect(detectTextLanguage(table)).toBeNull()
  })

  it('página sem texto (PDF escaneado) → null', () => {
    expect(detectTextLanguage(fixtureRawText('escaneado'))).toBeNull()
  })
})
