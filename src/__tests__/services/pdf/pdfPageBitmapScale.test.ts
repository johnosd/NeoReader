import { describe, expect, it } from 'vitest'

import { MAX_PAGE_BITMAP_PIXELS, pageBitmapScale } from '@/services/pdf/pdfPageRender'

// Página A5 típica de livro em pontos PDF (O Milagre da Manhã: ~420 × 595).
const W = 420
const H = 595

describe('pageBitmapScale', () => {
  it('usa zoom × dpr enquanto o bitmap cabe no teto (nitidez total)', () => {
    expect(pageBitmapScale(1.2, 3, W, H)).toBeCloseTo(3.6)
  })

  it('reduz a escala acima do teto de pixels (400% com dpr 3 passaria de 24 milhões de px)', () => {
    const scale = pageBitmapScale(3.4, 3, W, H)
    expect(scale).toBeLessThan(3.4 * 3)
    expect(W * scale * H * scale).toBeCloseTo(MAX_PAGE_BITMAP_PIXELS, -3)
  })
})
