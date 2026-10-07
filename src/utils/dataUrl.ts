// "data:image/png;base64,AAAA" → Blob. atob devolve uma string binária (1 char = 1 byte); copiamos para bytes.
// Existe porque no WebView do Android canvas.toBlob atrasa 4–13 s (só codifica em tempo ocioso) e
// toDataURL leva dezenas de ms (R-034/R-035 da feature 022).
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png'
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
