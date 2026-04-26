import { getCachedAuthor, setCachedAuthor } from '../db/authors'
import type { AuthorData, AuthorBook, AuthorVideo } from '../types/author'

const FETCH_TIMEOUT_MS = 10_000

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

// Open Library: busca OLID (identificador interno) pelo nome do autor
async function fetchOlid(authorName: string): Promise<string | null> {
  try {
    const url = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data = await res.json() as { docs?: Array<{ key: string }> }
    const key = data.docs?.[0]?.key  // ex: "/authors/OL23919A"
    return key ? key.replace('/authors/', '') : null
  } catch {
    return null
  }
}

// Open Library: busca bio e outros campos do autor
async function fetchOlAuthor(olid: string): Promise<{ bio?: string } | null> {
  try {
    const res = await fetchWithTimeout(`https://openlibrary.org/authors/${olid}.json`)
    if (!res.ok) return null
    const data = await res.json() as {
      bio?: string | { value: string }
    }
    return {
      bio: typeof data.bio === 'string' ? data.bio : data.bio?.value,
    }
  } catch {
    return null
  }
}

// Open Library: busca obras do autor (outros livros)
async function fetchOlWorks(olid: string): Promise<AuthorBook[]> {
  try {
    const res = await fetchWithTimeout(
      `https://openlibrary.org/authors/${olid}/works.json?limit=8`,
    )
    if (!res.ok) return []
    const data = await res.json() as {
      entries?: Array<{
        title: string
        first_publish_date?: string
        covers?: number[]
      }>
    }
    return (data.entries ?? []).map((entry) => ({
      title: entry.title,
      year: entry.first_publish_date ? parseInt(entry.first_publish_date) : undefined,
      coverId: entry.covers?.[0] ? String(entry.covers[0]) : undefined,
    }))
  } catch {
    return []
  }
}

// Wikipedia: busca resumo do autor como bio complementar
async function fetchWikipediaBio(authorName: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(authorName)}`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data = await res.json() as { extract?: string; type?: string }
    // type "disambiguation" não é uma bio real — ignorar
    if (data.type === 'disambiguation' || !data.extract) return null
    return data.extract.slice(0, 400)
  } catch {
    return null
  }
}

export async function getAuthorData(
  authorName: string,
  youtubeApiKey?: string,
): Promise<AuthorData | null> {
  // Cache hit: retorna imediatamente sem rede
  const cached = await getCachedAuthor(authorName)
  if (cached) return cached

  const olid = await fetchOlid(authorName)

  // Busca bio e obras em paralelo para reduzir latência
  const [olAuthor, otherBooks] = await Promise.all([
    olid ? fetchOlAuthor(olid) : Promise.resolve(null),
    olid ? fetchOlWorks(olid) : Promise.resolve<AuthorBook[]>([]),
  ])

  // Bio: Open Library primeiro; Wikipedia como fallback se vazia
  let bio = olAuthor?.bio
  if (!bio || bio.length < 80) {
    const wikiBio = await fetchWikipediaBio(authorName)
    if (wikiBio && wikiBio.length > (bio?.length ?? 0)) {
      bio = wikiBio
    }
  }

  // Foto via Open Library (URL pública, sem quota)
  const photoUrl = olid
    ? `https://covers.openlibrary.org/a/olid/${olid}-M.jpg`
    : undefined

  // Vídeos: implementados na Fase 3
  const videos: AuthorVideo[] = youtubeApiKey
    ? await fetchYoutubeVideos(authorName, youtubeApiKey)
    : []

  // Se não encontramos nada relevante, retorna null para mostrar EmptyState
  if (!bio && !photoUrl && otherBooks.length === 0) return null

  const data: AuthorData = {
    name: authorName,
    photoUrl,
    bio,
    otherBooks,
    videos,
  }

  // Fire-and-forget: não bloqueia o retorno
  void setCachedAuthor(authorName, data)

  return data
}

// Fase 3: busca vídeos no YouTube
export async function fetchYoutubeVideos(
  authorName: string,
  apiKey: string,
): Promise<AuthorVideo[]> {
  try {
    const query = encodeURIComponent(`${authorName} interview OR talk OR TED lecture`)
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=8&key=${apiKey}`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return []
    const data = await res.json() as {
      items?: Array<{
        id: { videoId: string }
        snippet: {
          title: string
          channelTitle: string
          thumbnails: { medium?: { url: string }; default?: { url: string } }
        }
      }>
    }
    return (data.items ?? []).map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      thumbnailUrl:
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
    }))
  } catch {
    return []
  }
}
