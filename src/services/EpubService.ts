import { unzip } from 'fflate'

export interface EpubMetadata {
  title: string
  author: string
  coverBlob: Blob | null
}

interface ManifestItem {
  id: string | null
  href: string
  mediaType: string | null
  properties: string[]
}

interface GuideReference {
  type: string | null
  href: string
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
    const data = this.readFileBytes(files, path)
    if (!data) return null
    return new TextDecoder('utf-8').decode(data)
  }

  // Lê um arquivo do ZIP aceitando caminhos relativos, com barra inicial
  // e variações como ../ e caracteres percent-encoded.
  private static readFileBytes(
    files: Record<string, Uint8Array>,
    path: string,
  ): Uint8Array | null {
    for (const candidate of this.buildPathCandidates(path)) {
      const data = files[candidate]
      if (data) return data
    }
    return null
  }

  private static buildPathCandidates(path: string): string[] {
    const trimmed = path.trim()
    const normalized = this.normalizeZipPath(trimmed)

    return [...new Set([
      trimmed,
      trimmed.replace(/^\//, ''),
      normalized,
      normalized.replace(/^\//, ''),
    ].filter(Boolean))]
  }

  // Normaliza caminhos internos do EPUB:
  // - remove query/hash
  // - resolve ./ e ../
  // - decodifica segmentos percent-encoded
  private static normalizeZipPath(path: string): string {
    if (!path) return ''

    const cleaned = path
      .replace(/\\/g, '/')
      .replace(/[?#].*$/, '')
      .replace(/%2c/gi, ',')
      .replace(/%3a/gi, ':')

    const isExternal = /^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(cleaned)
    if (isExternal) return cleaned

    const absolute = cleaned.startsWith('/')
    const resolved: string[] = []

    for (const rawPart of cleaned.split('/')) {
      if (!rawPart || rawPart === '.') continue
      if (rawPart === '..') {
        if (resolved.length > 0) resolved.pop()
        continue
      }

      try {
        resolved.push(decodeURIComponent(rawPart))
      } catch {
        resolved.push(rawPart)
      }
    }

    const joined = resolved.join('/')
    return absolute ? `/${joined}` : joined
  }

  // Resolve um href interno do EPUB em relação ao arquivo base (OPF/XHTML).
  // Isso evita erros comuns com ../, ./ e caminhos exportados pelo Calibre.
  private static resolveZipPath(basePath: string, href: string): string {
    const target = href.trim()
    if (!target) return ''

    const isExternal = /^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(target)
    if (isExternal) return target

    try {
      const root = 'https://invalid.invalid/'
      const url = new URL(
        target.replace(/%2c/gi, ',').replace(/%3a/gi, ':'),
        `${root}${basePath.replace(/^\//, '')}`,
      )
      url.search = ''
      url.hash = ''
      return decodeURI(url.href.replace(root, '')).replace(/^\//, '')
    } catch {
      const baseDir = basePath.includes('/')
        ? basePath.substring(0, basePath.lastIndexOf('/') + 1)
        : ''
      return this.normalizeZipPath(`${baseDir}${target}`).replace(/^\//, '')
    }
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

  private static parseXmlAttributes(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {}
    const attrRe = /([\w:-]+)\s*=\s*(["'])(.*?)\2/gs

    let match: RegExpExecArray | null
    while ((match = attrRe.exec(raw)) !== null) {
      attrs[match[1].toLowerCase()] = match[3]
    }

    return attrs
  }

  private static extractManifestItems(opfXml: string): ManifestItem[] {
    return Array.from(opfXml.matchAll(/<item\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => {
        const attrs = this.parseXmlAttributes(rawAttrs)
        return {
          id: attrs.id ?? null,
          href: attrs.href ?? '',
          mediaType: attrs['media-type'] ?? null,
          properties: (attrs.properties ?? '')
            .split(/\s+/)
            .map((prop) => prop.trim().toLowerCase())
            .filter(Boolean),
        }
      })
      .filter((item) => Boolean(item.href))
  }

  private static extractGuideReferences(opfXml: string): GuideReference[] {
    return Array.from(opfXml.matchAll(/<reference\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => {
        const attrs = this.parseXmlAttributes(rawAttrs)
        return {
          type: attrs.type ?? null,
          href: attrs.href ?? '',
        }
      })
      .filter((ref) => Boolean(ref.href))
  }

  private static findManifestItemByHref(
    manifestItems: ManifestItem[],
    opfPath: string,
    href: string,
  ): ManifestItem | null {
    const resolvedTarget = this.resolveZipPath(opfPath, href)
    return manifestItems.find((item) => (
      this.resolveZipPath(opfPath, item.href) === resolvedTarget
    )) ?? null
  }

  private static isHtmlResource(href: string, mediaType: string | null): boolean {
    const normalizedType = mediaType?.toLowerCase() ?? ''
    return normalizedType === 'application/xhtml+xml'
      || normalizedType === 'text/html'
      || /\.(x?html?|xhtm)$/i.test(href)
  }

  private static isCoverCandidate(item: ManifestItem): boolean {
    if (this.isHtmlResource(item.href, item.mediaType)) return true

    const normalizedType = item.mediaType?.toLowerCase() ?? ''
    return normalizedType.startsWith('image/')
      || /\.(png|gif|webp|jpe?g|svg)$/i.test(item.href)
  }

  private static looksLikeCoverPath(href: string): boolean {
    return /(^|[\/._-])cover([\/._-]|$)/i.test(href)
  }

  // Extrai a capa como Blob. EPUBs variam muito — estratégia em cascata:
  //   1. properties="cover-image" no manifest
  //   2. <meta name="cover"> → item por id/path
  //   3. item com id="cover"
  //   4. href com padrão de nome que pareça capa
  //   5. <guide><reference type="cover">
  //   6. primeira imagem do manifest
  //   7. se o href escolhido for XHTML/HTML → extrai a imagem interna
  private static extractCover(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
  ): Blob | null {
    const manifestItems = this.extractManifestItems(opfXml)
    const guideReferences = this.extractGuideReferences(opfXml)
    const coverHref =
      this.extractCoverFromProperties(opfXml, manifestItems) ??
      this.extractCoverFromMeta(opfXml, manifestItems) ??
      manifestItems.find((item) => (
        item.id?.toLowerCase() === 'cover' && this.isCoverCandidate(item)
      ))?.href ??
      manifestItems.find((item) => (
        this.looksLikeCoverPath(item.href) && this.isCoverCandidate(item)
      ))?.href ??
      guideReferences.find((ref) => ref.type?.toLowerCase().includes('cover'))?.href ??
      manifestItems.find((item) => item.mediaType?.toLowerCase().startsWith('image/'))?.href

    if (!coverHref) return null

    const coverItem = this.findManifestItemByHref(manifestItems, opfPath, coverHref)
    const coverPath = this.resolveZipPath(opfPath, coverHref)

    // Alguns EPUBs (ex: O'Reilly) declaram o item de capa como um arquivo HTML
    // (.xhtml/.html) que contém um <img> apontando para a imagem real.
    // Nesses casos precisamos abrir o HTML e extrair o src do primeiro <img>.
    const isHtml = this.isHtmlResource(coverHref, coverItem?.mediaType ?? null)
    if (isHtml) {
      const html = this.readFileAsText(files, coverPath)
      return html ? this.extractImageFromHtml(html, coverPath, files) : null
    }

    const coverData = this.readFileBytes(files, coverPath)
    if (!coverData) return null

    return new Blob([coverData.slice(0)], {
      type: coverItem?.mediaType ?? this.mimeFromPath(coverPath),
    })
  }

  // Estratégia 1: <item properties="cover-image" href="..."/>
  // Nota: [\s\S]*? em vez de [^>]* para suportar atributos em múltiplas linhas.
  // Muitos editores de EPUB (ex: calibre, ferramentas O'Reilly) geram o OPF
  // com cada atributo numa linha separada, e [^>] não casa com \n.
  private static extractCoverFromProperties(
    opfXml: string,
    manifestItems: ManifestItem[] = this.extractManifestItems(opfXml),
  ): string | null {
    return manifestItems.find((item) => item.properties.includes('cover-image'))?.href ?? null
  }

  // Estratégia 2: <meta name="cover" content="..."/>
  // O content pode ser:
  //   a) um ID de manifest: content="cover-image" → busca <item id="cover-image" href="..."/>
  //   b) um path direto:    content="Images/cover.png" → usa como href diretamente
  //   (O'Reilly usa a variante (b), a maioria dos EPUBs usa (a))
  private static extractCoverFromMeta(
    opfXml: string,
    manifestItems: ManifestItem[] = this.extractManifestItems(opfXml),
  ): string | null {
    const content = Array.from(opfXml.matchAll(/<meta\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => this.parseXmlAttributes(rawAttrs))
      .find((attrs) => attrs.name?.toLowerCase() === 'cover')
      ?.content

    if (!content) return null

    // Se o content parece um path de arquivo (tem extensão), usa diretamente
    if (/\.[a-z0-9]{2,5}(?:[#?].*)?$/i.test(content)) return content

    // Caso contrário, trata como ID de manifest e busca o href correspondente
    return manifestItems.find((item) => item.id === content)?.href
      ?? manifestItems.find((item) => item.id?.toLowerCase() === content.toLowerCase())?.href
      ?? null
  }

  // Abre um arquivo HTML de capa e extrai o src do primeiro <img> (ou href do
  // primeiro <image> de SVG). Necessário quando a capa é declarada como XHTML
  // em vez de diretamente como arquivo de imagem.
  private static extractImageFromHtml(
    html: string,
    htmlPath: string,
    files: Record<string, Uint8Array>,
  ): Blob | null {
    const match = html.match(/<img[\s\S]*?src=["']([^"']+)["']/i)
              ?? html.match(/<image[\s\S]*?href=["']([^"']+)["']/i)
              ?? html.match(/<image[\s\S]*?xlink:href=["']([^"']+)["']/i)  // SVG antigo usa xlink:href

    if (!match) {
      const inlineSvg = html.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0]
      return inlineSvg ? new Blob([inlineSvg], { type: 'image/svg+xml' }) : null
    }

    const imgPath = this.resolveZipPath(htmlPath, match[1])
    const data = this.readFileBytes(files, imgPath)
    if (!data) return null

    return new Blob([data.slice(0)], { type: this.mimeFromPath(imgPath) })
  }
}
