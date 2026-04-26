export interface AuthorBook {
  title: string
  year?: number
  coverId?: string  // Open Library cover ID — monta URL: covers.openlibrary.org/b/id/{coverId}-M.jpg
}

export interface AuthorVideo {
  id: string          // YouTube video ID
  title: string
  thumbnailUrl: string
  channelName: string
}

export interface AuthorData {
  name: string
  photoUrl?: string
  bio?: string
  otherBooks: AuthorBook[]
  videos: AuthorVideo[]
}

export interface AuthorCacheRecord {
  authorName: string  // primary key — nome exato vindo do metadado do livro
  data: AuthorData
  fetchedAt: Date
}
