import {
  getGoogleDriveAccessToken,
  GOOGLE_DRIVE_APPDATA_SCOPE,
} from './FirebaseAuthService'
import { fetchWithTimeout, getDefaultFetch } from './http'

export type GoogleDriveAppDataErrorCode =
  | 'missing-token'
  | 'permission-denied'
  | 'offline'
  | 'http'
  | 'invalid-json'

export interface GoogleDriveAppDataFile {
  id: string
  name: string
  mimeType?: string
  modifiedTime?: string
  size?: string
}

interface GoogleDriveListResponse {
  files?: GoogleDriveAppDataFile[]
}

interface GoogleDriveAppDataServiceOptions {
  getAccessToken?: () => string | null | Promise<string | null>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface GoogleDriveRequestOptions {
  method?: string
  query?: Record<string, string>
  headers?: HeadersInit
  body?: BodyInit
  upload?: boolean
}

export class GoogleDriveAppDataError extends Error {
  readonly code: GoogleDriveAppDataErrorCode
  readonly status?: number

  constructor(code: GoogleDriveAppDataErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'GoogleDriveAppDataError'
    this.code = code
    this.status = status
  }
}

export class GoogleDriveAppDataService {
  private readonly getAccessToken: () => string | null | Promise<string | null>
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: GoogleDriveAppDataServiceOptions = {}) {
    this.getAccessToken = options.getAccessToken ?? getGoogleDriveAccessToken
    this.fetchImpl = options.fetchImpl ?? getDefaultFetch()
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  async list(options: { name?: string } = {}): Promise<GoogleDriveAppDataFile[]> {
    const query = {
      spaces: 'appDataFolder',
      fields: 'files(id,name,mimeType,modifiedTime,size)',
      pageSize: '1000',
      q: options.name
        ? `name = '${escapeDriveQueryValue(options.name)}' and trashed = false`
        : "mimeType = 'application/json' and trashed = false",
    }
    const data = await this.requestJson<GoogleDriveListResponse>('/drive/v3/files', {
      query,
    })
    return data.files ?? []
  }

  async getJson<T>(fileId: string): Promise<T> {
    return this.requestJson<T>(`/drive/v3/files/${encodeURIComponent(fileId)}`, {
      query: { alt: 'media' },
    })
  }

  async createJson<T>(name: string, data: T): Promise<GoogleDriveAppDataFile> {
    return this.requestJson<GoogleDriveAppDataFile>('/drive/v3/files', {
      method: 'POST',
      upload: true,
      query: {
        uploadType: 'multipart',
        fields: 'id,name,mimeType,modifiedTime,size',
      },
      ...this.multipartJsonBody(name, data),
    })
  }

  async updateJson<T>(fileId: string, data: T): Promise<GoogleDriveAppDataFile> {
    return this.requestJson<GoogleDriveAppDataFile>(
      `/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method: 'PATCH',
        upload: true,
        query: {
          uploadType: 'multipart',
          fields: 'id,name,mimeType,modifiedTime,size',
        },
        ...this.multipartJsonBody(undefined, data),
      },
    )
  }

  private async requestJson<T>(
    path: string,
    options: GoogleDriveRequestOptions = {},
  ): Promise<T> {
    const response = await this.request(path, options)
    const text = await response.text()

    try {
      return (text ? JSON.parse(text) : {}) as T
    } catch {
      throw new GoogleDriveAppDataError(
        'invalid-json',
        'Google Drive returned invalid JSON.',
        response.status,
      )
    }
  }

  private async request(
    path: string,
    options: GoogleDriveRequestOptions,
  ): Promise<Response> {
    const token = await this.resolveAccessToken()
    const url = this.buildUrl(path, options)

    try {
      const response = await fetchWithTimeout(url, {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        init: {
          method: options.method ?? 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            ...options.headers,
          },
          body: options.body,
        },
      })

      if (!response.ok) {
        throw this.errorFromResponse(response)
      }

      return response
    } catch (error) {
      if (error instanceof GoogleDriveAppDataError) throw error
      throw new GoogleDriveAppDataError(
        'offline',
        'Google Drive is unavailable. The app can keep working locally.',
      )
    }
  }

  private async resolveAccessToken(): Promise<string> {
    const token = await this.getAccessToken()
    const cleanToken = token?.trim()

    if (!cleanToken) {
      throw new GoogleDriveAppDataError(
        'missing-token',
        `Google Drive access token unavailable. Reconnect Google with ${GOOGLE_DRIVE_APPDATA_SCOPE}.`,
      )
    }

    return cleanToken
  }

  private buildUrl(path: string, options: GoogleDriveRequestOptions): string {
    const baseUrl = options.upload
      ? 'https://www.googleapis.com/upload'
      : 'https://www.googleapis.com'
    const url = new URL(`${baseUrl}${path}`)

    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value)
    }

    return url.toString()
  }

  private multipartJsonBody<T>(
    name: string | undefined,
    data: T,
  ): Pick<GoogleDriveRequestOptions, 'headers' | 'body'> {
    const boundary = `neoreader_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const metadata = {
      ...(name ? { name } : {}),
      ...(name ? { parents: ['appDataFolder'] } : {}),
      mimeType: 'application/json',
    }
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(data),
      `--${boundary}--`,
      '',
    ].join('\r\n')

    return {
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  }

  private errorFromResponse(response: Response): GoogleDriveAppDataError {
    if (response.status === 401 || response.status === 403) {
      return new GoogleDriveAppDataError(
        'permission-denied',
        'Google Drive permission is missing or expired.',
        response.status,
      )
    }

    return new GoogleDriveAppDataError(
      'http',
      `Google Drive request failed with HTTP ${response.status}.`,
      response.status,
    )
  }
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
