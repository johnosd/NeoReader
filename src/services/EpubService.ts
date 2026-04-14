import { unzip } from 'fflate'

export interface EpubMetadata {
  title: string
  author: string
  coverBlob: Blob | null
}

// EPUB é um ZIP. Esse serviço abre o ZIP e extrai os metadados do OPF.
// Fluxo: container.xml → caminho do .opf → title/author/cover
export class EpubService {
  static async parseMetadata(file: File): Promise<EpubMetadata> {
    const buffer = await file.arrayBuffer()
    const uint8 = new Uint8Array(buffer)

    // fflate.unzip é callback-based; wrapeamos em Promise
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(uint8, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    // 1. Ler container.xml para achar o path do OPF
    const containerXml = this.readFileAsText(files, 'META-INF/container.xml')
    if (!containerXml) throw new Error('EPUB inválido: META-INF/container.xml não encontrado')

    const opfPath = this.extractOpfPath(containerXml)
    if (!opfPath) throw new Error('EPUB inválido: path do OPF não encontrado')

    // 2. Ler o OPF e extrair metadados
    const opfXml = this.readFileAsText(files, opfPath)
    if (!opfXml) throw new Error(`EPUB inválido: OPF não encontrado em ${opfPath}`)

    const title = this.extractTag(opfXml, 'dc:title') ?? file.name.replace('.epub', '')
    const author = this.extractTag(opfXml, 'dc:creator') ?? 'Autor desconhecido'

    // 3. Extrair capa (opcional — muitos EPUBs não têm)
    const coverBlob = this.extractCover(opfXml, opfPath, files)

    return { title, author, coverBlob }
  }

  // Converte Uint8Array de um arquivo do ZIP para string UTF-8
  private static readFileAsText(
    files: Record<string, Uint8Array>,
    path: string,
  ): string | null {
    // Alguns EPUBs usam caminhos com ou sem barra inicial
    const data = files[path] ?? files[path.replace(/^\//, '')]
    if (!data) return null
    return new TextDecoder('utf-8').decode(data)
  }

  // Pega o caminho do OPF de dentro do container.xml
  // Exemplo: <rootfile full-path="OEBPS/content.opf" .../>
  private static extractOpfPath(containerXml: string): string | null {
    const match = containerXml.match(/full-path="([^"]+\.opf)"/)
    return match?.[1] ?? null
  }

  // Extrai o conteúdo de uma tag XML simples (sem atributos aninhados)
  private static extractTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`))
    return match?.[1]?.trim() ?? null
  }

  // Extrai a capa como Blob. EPUBs variam muito — estratégia: procura
  // item com id "cover" ou properties="cover-image" no manifest.
  private static extractCover(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
  ): Blob | null {
    // Tenta encontrar href da capa no manifest
    const coverHref =
      this.extractCoverFromProperties(opfXml) ??
      this.extractCoverFromMeta(opfXml)

    if (!coverHref) return null

    // O path do OPF dá o diretório base para resolver caminhos relativos
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''
    const coverPath = opfDir + coverHref

    const coverData = files[coverPath] ?? files[coverPath.replace(/^\//, '')]
    if (!coverData) return null

    const mimeType = coverHref.endsWith('.png') ? 'image/png' : 'image/jpeg'
    // .slice(0) retorna Uint8Array<ArrayBuffer> em vez de Uint8Array<ArrayBufferLike> — necessário pro TS strict
    return new Blob([coverData.slice(0)], { type: mimeType })
  }

  // Estratégia 1: <item properties="cover-image" href="..."/>
  private static extractCoverFromProperties(opfXml: string): string | null {
    const match = opfXml.match(/properties="cover-image"[^>]*href="([^"]+)"/)
              ?? opfXml.match(/href="([^"]+)"[^>]*properties="cover-image"/)
    return match?.[1] ?? null
  }

  // Estratégia 2: <meta name="cover" content="cover-id"/> + <item id="cover-id" href="..."/>
  private static extractCoverFromMeta(opfXml: string): string | null {
    const metaMatch = opfXml.match(/<meta\s+name="cover"\s+content="([^"]+)"/)
    if (!metaMatch) return null

    const coverId = metaMatch[1]
    const itemMatch = opfXml.match(new RegExp(`id="${coverId}"[^>]*href="([^"]+)"`))
                  ?? opfXml.match(new RegExp(`href="([^"]+)"[^>]*id="${coverId}"`))
    return itemMatch?.[1] ?? null
  }
}
