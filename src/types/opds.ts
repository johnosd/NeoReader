// Catálogo OPDS configurado (padrão pré-instalado ou adicionado pelo usuário).
// A credencial (usuário/senha) NUNCA fica aqui nem em nenhuma tabela do Dexie —
// vive só no secure storage nativo (OpdsCredentialStore), referenciada pelo
// próprio `id` numérico do catálogo. `hasCredential` é só um flag de UI.
export interface OpdsCatalog {
  id?: number
  name: string
  baseUrl: string
  hasCredential: boolean
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

// Vínculo local entre uma entry de um catálogo e o Book resultante do
// download — permite marcar "já na biblioteca" sem precisar rebaixar pra
// descobrir. `entryId` é o id/URL bruto do entry, como veio do feed de
// origem (pode não ser filename-safe, por isso a chave é [catalogId+entryId]
// e não um nome de arquivo determinístico como na feature 002).
export interface OpdsDownloadedEntry {
  id?: number
  catalogId: number
  entryId: string
  bookId: number
  downloadedAt: Date
}

// Item já normalizado pela camada de parsing (Atom ou JSON) — a UI nunca
// sabe qual formato originou os dados.
export interface OpdsFeedEntry {
  id: string
  title: string
  author?: string
  coverUrl?: string
  // Assunto/idioma do feed (quando o catálogo manda) — usados só pra virar
  // tag automática no livro importado (OpdsDownloadService), não exibidos
  // na UI de navegação/amostra.
  subjects?: string[]
  language?: string
  kind: 'publication' | 'navigation'
  navigationUrl?: string
  acquisitionUrl?: string
}

export interface OpdsFeedPage {
  title?: string
  entries: OpdsFeedEntry[]
  nextPageUrl?: string
  searchUrl?: string
}

// Convenção do Gutenberg (`?sort_order=...`), não parte do padrão OPDS —
// confirmado ao vivo que o feed raiz do Gutenberg (`/ebooks.opds/`) expõe
// "Popular"/"Latest"/"Random" como pastas de navegação apontando pra esses
// mesmos valores. Enviado como query param extra em qualquer catálogo:
// servidor que não reconhece o parâmetro tipicamente ignora e devolve a
// ordem padrão, sem erro — não é uma garantia formal, só um "tenta e não
// atrapalha" (mesmo espírito de research.md #10).
export type OpdsSortOrder = 'default' | 'downloads' | 'release_date' | 'random'

export type OpdsDownloadStatus = 'idle' | 'downloading' | 'success' | 'error'

// Estado de progresso por entry, mantido em memória (OpdsDownloadCoordinator)
// — key = `${catalogId}:${entryId}`, sobrevive à navegação entre telas mas
// não a fechar o app (mesmo espírito do PublicDomainDownloadState da 002).
export interface OpdsDownloadState {
  key: string
  status: OpdsDownloadStatus
  errorMessage?: string
  offline?: boolean
  bookId?: number
}

export type OpdsCatalogErrorKind = 'network' | 'invalid-credential' | 'invalid-format'

export interface OpdsCatalogError {
  kind: OpdsCatalogErrorKind
  message: string
}
