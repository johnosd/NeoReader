// Tipos de imagem que o Canvas sabe reexportar preservando o formato original.
// Qualquer outro tipo (ex: image/gif) cai pra JPEG — ver research.md Decisão 3.
const REENCODABLE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Redimensiona uma imagem de capa pra caber num teto de dimensão (o maior
 * lado, largura ou altura), preservando a proporção original e sem
 * upscale. Nunca lança — qualquer falha de decodificação/codificação
 * retorna o blob original intacto, pra nunca quebrar o import por causa
 * disso (FR-004 da spec 007).
 */
export async function resizeCoverBlob(blob: Blob, maxDimension: number): Promise<Blob> {
  // Capa de fallback (EpubService.createFallbackCover) é SVG vetorial —
  // já é pequena e rasterizá-la seria perda de qualidade, não ganho
  // (FR-006).
  if (blob.type === 'image/svg+xml') return blob

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return blob
  }

  const largestSide = Math.max(bitmap.width, bitmap.height)
  if (largestSide <= maxDimension) {
    bitmap.close()
    return blob
  }

  const scale = maxDimension / largestSide
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return blob
  }

  // O próprio canvas faz o downscale ao desenhar um bitmap maior num
  // destino menor — não precisa de um segundo createImageBitmap com
  // resizeWidth/resizeHeight (ver research.md Decisão 4).
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const outputType = REENCODABLE_MIME_TYPES.has(blob.type) ? blob.type : 'image/jpeg'

  return new Promise((resolve) => {
    canvas.toBlob((resized) => resolve(resized ?? blob), outputType)
  })
}
