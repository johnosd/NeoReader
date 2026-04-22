import { unzip } from 'fflate'

export interface EpubMetadata {
  title: string
  author: string
  coverBlob: Blob | null
}

// Campos extras extraídos do EPUB para a tela de detalhes do livro
export interface EpubExtras {
  description: string | null   // dc:description do OPF (frequentemente ausente)
  language: string | null      // dc:language do OPF (ex: "en", "pt-BR")
  toc: TocItem[]               // capítulos do livro (EPUB3 nav ou EPUB2 ncx)
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

  // Extrai campos adicionais do EPUB para a tela de detalhes (descrição, idioma, capítulos).
  // Aceita Blob porque book.fileBlob está tipado como Blob (não File).
  static async parseExtras(fileBlob: Blob): Promise<EpubExtras> {
    try {
      const buffer = await fileBlob.arrayBuffer()
      const uint8 = new Uint8Array(buffer)
      const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(uint8, (err, data) => err ? reject(err) : resolve(data))
      })

      const containerXml = this.readFileAsText(files, 'META-INF/container.xml')
      if (!containerXml) return { description: null, language: null, toc: [] }

      const opfPath = this.extractOpfPath(containerXml)
      if (!opfPath) return { description: null, language: null, toc: [] }

      const opfXml = this.readFileAsText(files, opfPath)
      if (!opfXml) return { description: null, language: null, toc: [] }

      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

      const description = this.extractTag(opfXml, 'dc:description')
      const language = this.extractTag(opfXml, 'dc:language')
      const toc = this.parseToc(opfXml, opfDir, files)

      return { description, language, toc }
    } catch {
      return { description: null, language: null, toc: [] }
    }
  }

  // Localiza o arquivo de TOC e parseia os capítulos.
  // Prefere EPUB3 nav.xhtml; fallback para EPUB2 toc.ncx.
  private static parseToc(
    opfXml: string,
    opfDir: string,
    files: Record<string, Uint8Array>,
  ): TocItem[] {
    // EPUB3: item com properties="nav"
    const navHref =
      opfXml.match(/properties="nav"[\s\S]*?href="([^"]+)"/)?.[1] ??
      opfXml.match(/href="([^"]+)"[\s\S]*?properties="nav"/)?.[1]

    if (navHref) {
      const navPath = opfDir + navHref
      const navXml = this.readFileAsText(files, navPath)
      if (navXml) {
        const navDir = navPath.includes('/') ? navPath.substring(0, navPath.lastIndexOf('/') + 1) : ''
        const result = this.parseTocFromNav(navXml, navDir)
        if (result.length > 0) return result
      }
    }

    // EPUB2 fallback: toc.ncx referenciado no <spine toc="id">
    let ncxHref: string | null = null
    const ncxId = opfXml.match(/<spine\b[^>]+toc="([^"]+)"/)?.[1]
    if (ncxId) {
      const escapedId = ncxId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      ncxHref =
        opfXml.match(new RegExp(`id="${escapedId}"[\\s\\S]*?href="([^"]+)"`))?.[1] ??
        opfXml.match(new RegExp(`href="([^"]+)"[\\s\\S]*?id="${escapedId}"`))?.[1] ??
        null
    }
    // Última tentativa: qualquer .ncx no manifest
    if (!ncxHref) ncxHref = opfXml.match(/href="([^"]+\.ncx)"/i)?.[1] ?? null

    if (ncxHref) {
      const ncxPath = opfDir + ncxHref
      const ncxXml = this.readFileAsText(files, ncxPath)
      if (ncxXml) {
        const ncxDir = ncxPath.includes('/') ? ncxPath.substring(0, ncxPath.lastIndexOf('/') + 1) : ''
        return this.parseTocFromNcx(ncxXml, ncxDir)
      }
    }

    return []
  }

  // Parseia nav.xhtml (EPUB3): extrai entradas do <nav epub:type="toc"> com profundidade.
  private static parseTocFromNav(html: string, baseDir: string): TocItem[] {
    const tocMatch =
      html.match(/<nav\b[^>]*epub:type=["'][^"']*toc[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i) ??
      html.match(/<nav\b[^>]*type=["'][^"']*toc[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i) ??
      html.match(/<nav\b[^>]*id=["']toc["'][^>]*>([\s\S]*?)<\/nav>/i)

    if (!tocMatch) return []

    const content = tocMatch[1]
    const entries: Array<{ depth: number; href: string; label: string }> = []
    let depth = 0

    // Tokeniza: rastreia abertura/fechamento de <ol> e captura <a href>
    const tokenRe = /<(\/?)(?:ol|a)\b([^>]*)>/gi
    let match: RegExpExecArray | null
    while ((match = tokenRe.exec(content)) !== null) {
      const [full, closing, attrs] = match
      const tag = full.match(/<\/?(\w+)/)?.[1]?.toLowerCase()
      if (tag === 'ol') {
        depth += closing ? -1 : 1
      } else if (tag === 'a' && !closing) {
        const hrefMatch = attrs.match(/href="([^"]*)"/)
        if (hrefMatch) {
          const afterA = content.slice(match.index + full.length)
          const label = (afterA.match(/^([\s\S]*?)<\/a>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim()
          if (label) {
            const raw = hrefMatch[1]
            const href = raw.startsWith('/') || raw.includes('://') ? raw : baseDir + raw
            entries.push({ depth, href, label })
          }
        }
      }
    }

    return this.buildTocTree(entries)
  }

  // Parseia toc.ncx (EPUB2): rastreia profundidade de <navPoint> e usa buildTocTree
  // para produzir a mesma estrutura em árvore do parseTocFromNav.
  private static parseTocFromNcx(ncxXml: string, baseDir: string): TocItem[] {
    const navMap = ncxXml.match(/<navMap[^>]*>([\s\S]*)<\/navMap>/)?.[1] ?? ''
    const entries: Array<{ depth: number; href: string; label: string }> = []
    let depth = 0

    // Tokeniza <navPoint>, </navPoint>, <text> e <content src>
    const tokenRe = /<(\/?navPoint)\b[^>]*>|<text>([^<]+)<\/text>|<content\s+src="([^"]+)"/gi
    let label: string | null = null
    let match: RegExpExecArray | null
    while ((match = tokenRe.exec(navMap)) !== null) {
      const [, tagToken, textContent, src] = match
      if (tagToken) {
        if (tagToken.startsWith('/')) {
          depth = Math.max(0, depth - 1)
        } else {
          depth++
        }
      } else if (textContent && label === null) {
        label = textContent.trim()
      } else if (src && label !== null) {
        const href = src.startsWith('/') || src.includes('://') ? src : baseDir + src
        entries.push({ depth, href, label })
        label = null
      }
    }

    return this.buildTocTree(entries)
  }

  // Converte lista plana com níveis de profundidade em árvore de TocItem aninhada.
  private static buildTocTree(
    entries: Array<{ depth: number; href: string; label: string }>,
  ): TocItem[] {
    if (entries.length === 0) return []
    const root: TocItem[] = []
    const parentStack: TocItem[][] = [root]
    let prevDepth = entries[0].depth

    for (const entry of entries) {
      const item: TocItem = { label: entry.label, href: entry.href }

      if (entry.depth > prevDepth) {
        const currentList = parentStack[parentStack.length - 1]
        const lastItem = currentList[currentList.length - 1]
        if (lastItem) {
          if (!lastItem.subitems) lastItem.subitems = []
          parentStack.push(lastItem.subitems)
        }
      } else if (entry.depth < prevDepth) {
        const steps = prevDepth - entry.depth
        for (let i = 0; i < steps && parentStack.length > 1; i++) parentStack.pop()
      }

      parentStack[parentStack.length - 1].push(item)
      prevDepth = entry.depth
    }

    return root
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
