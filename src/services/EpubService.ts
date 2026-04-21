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
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`))
    return match?.[1]?.trim() ?? null
  }

  // Retorna o MIME type correto a partir da extensão do arquivo.
  // A detecção por extensão é suficiente para EPUBs — o formato do arquivo
  // não muda, só precisamos do tipo correto para o Blob.
  private static mimeFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
      png:  'image/png',
      gif:  'image/gif',
      webp: 'image/webp',
      svg:  'image/svg+xml',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
    }
    return map[ext] ?? 'image/jpeg'
  }

  // Extrai a capa como Blob. EPUBs variam muito — estratégia em cascata:
  //   1. properties="cover-image" no manifest
  //   2. <meta name="cover"> → item por id
  //   3. Se o href encontrado for HTML → extrai o primeiro <img> de dentro
  private static extractCover(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
  ): Blob | null {
    const coverHref =
      this.extractCoverFromProperties(opfXml) ??
      this.extractCoverFromMeta(opfXml)

    if (!coverHref) return null

    // O path do OPF dá o diretório base para resolver caminhos relativos
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''
    const coverPath = opfDir + coverHref

    // Alguns EPUBs (ex: O'Reilly) declaram o item de capa como um arquivo HTML
    // (.xhtml/.html) que contém um <img> apontando para a imagem real.
    // Nesses casos precisamos abrir o HTML e extrair o src do primeiro <img>.
    const isHtml = /\.(x?html?|xhtm)$/i.test(coverHref)
    if (isHtml) {
      const html = this.readFileAsText(files, coverPath)
                ?? this.readFileAsText(files, coverPath.replace(/^\//, ''))
      return html ? this.extractImageFromHtml(html, coverPath, files) : null
    }

    const coverData = files[coverPath] ?? files[coverPath.replace(/^\//, '')]
    if (!coverData) return null

    return new Blob([coverData.slice(0)], { type: this.mimeFromPath(coverHref) })
  }

  // Estratégia 1: <item properties="cover-image" href="..."/>
  // Nota: [\s\S]*? em vez de [^>]* para suportar atributos em múltiplas linhas.
  // Muitos editores de EPUB (ex: calibre, ferramentas O'Reilly) geram o OPF
  // com cada atributo numa linha separada, e [^>] não casa com \n.
  private static extractCoverFromProperties(opfXml: string): string | null {
    const match = opfXml.match(/properties="cover-image"[\s\S]*?href="([^"]+)"/)
              ?? opfXml.match(/href="([^"]+)"[\s\S]*?properties="cover-image"/)
    return match?.[1] ?? null
  }

  // Estratégia 2: <meta name="cover" content="..."/>
  // O content pode ser:
  //   a) um ID de manifest: content="cover-image" → busca <item id="cover-image" href="..."/>
  //   b) um path direto:    content="Images/cover.png" → usa como href diretamente
  //   (O'Reilly usa a variante (b), a maioria dos EPUBs usa (a))
  private static extractCoverFromMeta(opfXml: string): string | null {
    const metaMatch = opfXml.match(/<meta[\s\S]*?name="cover"[\s\S]*?content="([^"]+)"/)
                  ?? opfXml.match(/<meta[\s\S]*?content="([^"]+)"[\s\S]*?name="cover"/)
    if (!metaMatch) return null

    const content = metaMatch[1]

    // Se o content parece um path de arquivo (tem extensão), usa diretamente
    if (/\.[a-z]{2,5}$/i.test(content)) return content

    // Caso contrário, trata como ID de manifest e busca o href correspondente
    const escapedId = content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const itemMatch = opfXml.match(new RegExp(`id="${escapedId}"[\\s\\S]*?href="([^"]+)"`))
                  ?? opfXml.match(new RegExp(`href="([^"]+)"[\\s\\S]*?id="${escapedId}"`))
    return itemMatch?.[1] ?? null
  }

  // Abre um arquivo HTML de capa e extrai o src do primeiro <img> (ou href do
  // primeiro <image> de SVG). Necessário quando a capa é declarada como XHTML
  // em vez de diretamente como arquivo de imagem.
  private static extractImageFromHtml(
    html: string,
    htmlPath: string,
    files: Record<string, Uint8Array>,
  ): Blob | null {
    const match = html.match(/<img[\s\S]*?src="([^"]+)"/)
              ?? html.match(/<image[\s\S]*?href="([^"]+)"/)
              ?? html.match(/<image[\s\S]*?xlink:href="([^"]+)"/)  // SVG antigo usa xlink:href
    if (!match) return null

    const imgDir = htmlPath.includes('/')
      ? htmlPath.substring(0, htmlPath.lastIndexOf('/') + 1)
      : ''
    const imgPath = imgDir + match[1]
    const data = files[imgPath] ?? files[imgPath.replace(/^\//, '')]
    if (!data) return null

    return new Blob([data.slice(0)], { type: this.mimeFromPath(imgPath) })
  }
}
