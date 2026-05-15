import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  readFileChunk: vi.fn(),
  readFile: vi.fn(),
  openFileReadSession: vi.fn(),
  closeFileReadSession: vi.fn(),
  prepareLocalEpubImport: vi.fn(),
  cancelImport: vi.fn(),
  deleteLocalBookFile: vi.fn(),
  cleanupImportTemp: vi.fn(),
  selectEpubFolder: vi.fn(),
  selectEpubFile: vi.fn(),
  consumePendingFolderSelection: vi.fn(),
  consumePendingFileSelection: vi.fn(),
  listSelectedFolderFiles: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
  },
  registerPlugin: vi.fn(() => ({
    readFileChunk: mocks.readFileChunk,
    readFile: mocks.readFile,
    openFileReadSession: mocks.openFileReadSession,
    closeFileReadSession: mocks.closeFileReadSession,
    prepareLocalEpubImport: mocks.prepareLocalEpubImport,
    cancelImport: mocks.cancelImport,
    deleteLocalBookFile: mocks.deleteLocalBookFile,
    cleanupImportTemp: mocks.cleanupImportTemp,
    selectEpubFolder: mocks.selectEpubFolder,
    selectEpubFile: mocks.selectEpubFile,
    consumePendingFolderSelection: mocks.consumePendingFolderSelection,
    consumePendingFileSelection: mocks.consumePendingFileSelection,
    listSelectedFolderFiles: mocks.listSelectedFolderFiles,
  })),
}))

import {
  NATIVE_FILE_CHUNK_SIZE,
  cleanupNativeImportTemp,
  deleteLocalBookFile,
  prepareLocalEpubImport,
  readNativeFolderFile,
  type NativeFolderFile,
} from '@/services/NativeLibraryImportService'

const CHUNK_SIZE = NATIVE_FILE_CHUNK_SIZE

describe('NativeLibraryImportService', () => {
  beforeEach(() => {
    mocks.readFileChunk.mockReset()
    mocks.readFile.mockReset()
    mocks.openFileReadSession.mockReset()
    mocks.closeFileReadSession.mockReset()
    mocks.prepareLocalEpubImport.mockReset()
    mocks.cancelImport.mockReset()
    mocks.deleteLocalBookFile.mockReset()
    mocks.cleanupImportTemp.mockReset()
  })

  it('prepara importacao local nativa sem ler chunks por base64', async () => {
    const prepared = {
      importId: 'import-1',
      name: 'book.epub',
      path: 'folder/book.epub',
      size: 123,
      sha256: 'a'.repeat(64),
      localUri: 'file:///data/books/book.epub',
      originalUri: 'content://book.epub',
      metadata: {
        title: 'Book',
        author: 'Author',
        identifiers: [],
      },
      diagnostics: {
        copyMs: 10,
        inspectMs: 5,
        bytesCopied: 123,
        localFileExisted: false,
      },
    }
    mocks.prepareLocalEpubImport.mockResolvedValue(prepared)

    await expect(prepareLocalEpubImport(nativeFile({ size: 123 }), { importId: 'import-1' }))
      .resolves
      .toEqual(prepared)

    expect(mocks.prepareLocalEpubImport).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'content://book.epub',
      importId: 'import-1',
    }))
    expect(mocks.readFileChunk).not.toHaveBeenCalled()
  })

  it('cancela a importacao local nativa quando o AbortSignal dispara', async () => {
    const controller = new AbortController()
    mocks.prepareLocalEpubImport.mockReturnValue(new Promise(() => {}))
    mocks.cancelImport.mockResolvedValue({ canceled: true })

    const pending = prepareLocalEpubImport(
      nativeFile({ size: 123 }),
      { importId: 'import-cancel', signal: controller.signal },
    )
    const assertion = expect(pending).rejects.toThrow('Importacao cancelada')

    controller.abort(new DOMException('Importacao cancelada pelo teste.', 'AbortError'))

    await assertion
    expect(mocks.cancelImport).toHaveBeenCalledWith({ importId: 'import-cancel' })
  })

  it('remove arquivo local e limpa temporarios de importacao', async () => {
    mocks.deleteLocalBookFile.mockResolvedValue({ deleted: true })
    mocks.cleanupImportTemp.mockResolvedValue({ deleted: 2 })

    await expect(deleteLocalBookFile('file:///data/books/book.epub')).resolves.toBe(true)
    await expect(cleanupNativeImportTemp()).resolves.toBe(2)
  })

  it('le arquivo pequeno em um chunk', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue(chunk(bytes, 0, true))

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength }))

    await expect(file.text()).resolves.toBe('hello')
    expect(file.name).toBe('book.epub')
    expect(file.size).toBe(bytes.byteLength)
    expect(mocks.readFileChunk).toHaveBeenCalledWith(expect.objectContaining({
      offset: 0,
      length: CHUNK_SIZE,
    }))
  })

  it('le arquivo grande em multiplos chunks', async () => {
    const first = repeatedBytes('a', CHUNK_SIZE)
    const second = repeatedBytes('b', CHUNK_SIZE)
    mocks.readFileChunk
      .mockResolvedValueOnce(chunk(first, 0, false))
      .mockResolvedValueOnce(chunk(second, CHUNK_SIZE, false))
      .mockResolvedValueOnce(chunk(new Uint8Array(), CHUNK_SIZE * 2, true))

    const file = await readNativeFolderFile(nativeFile({ size: first.byteLength + second.byteLength }))

    const bytes = new Uint8Array(await file.arrayBuffer())
    expect(bytes).toHaveLength(first.byteLength + second.byteLength)
    expect(bytes[0]).toBe('a'.charCodeAt(0))
    expect(bytes[CHUNK_SIZE]).toBe('b'.charCodeAt(0))
    expect(mocks.readFileChunk).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, length: CHUNK_SIZE }))
    expect(mocks.readFileChunk).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: CHUNK_SIZE, length: CHUNK_SIZE }))
  })

  it('aceita ultimo chunk parcial', async () => {
    const first = repeatedBytes('a', CHUNK_SIZE)
    const second = textBytes('tail')
    mocks.readFileChunk
      .mockResolvedValueOnce(chunk(first, 0, false))
      .mockResolvedValueOnce(chunk(second, CHUNK_SIZE, true))

    const file = await readNativeFolderFile(nativeFile({ size: first.byteLength + second.byteLength }))

    expect(file.size).toBe(first.byteLength + second.byteLength)
    expect(mocks.readFileChunk).toHaveBeenCalledTimes(2)
  })

  it('reutiliza sessao nativa de leitura quando o plugin oferece suporte', async () => {
    const bytes = textBytes('hello')
    mocks.openFileReadSession.mockResolvedValue({ sessionId: 'session-1', mode: 'file-channel' })
    mocks.closeFileReadSession.mockResolvedValue({ closed: true })
    mocks.readFileChunk.mockResolvedValue(chunk(bytes, 0, true))

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength }))

    await expect(file.text()).resolves.toBe('hello')
    expect(mocks.openFileReadSession).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'content://book.epub',
    }))
    expect(mocks.readFileChunk).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      offset: 0,
      length: CHUNK_SIZE,
    }))
    expect(mocks.closeFileReadSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
  })

  it('fecha sessao nativa mesmo quando leitura do chunk falha', async () => {
    mocks.openFileReadSession.mockResolvedValue({ sessionId: 'session-2' })
    mocks.closeFileReadSession.mockResolvedValue({ closed: true })
    mocks.readFileChunk.mockRejectedValue(new Error('falha no provider'))

    await expect(readNativeFolderFile(nativeFile({ size: CHUNK_SIZE })))
      .rejects
      .toThrow('falha no provider')
    expect(mocks.closeFileReadSession).toHaveBeenCalledWith({ sessionId: 'session-2' })
  })

  it('volta para leitura sem sessao quando abertura nativa falha', async () => {
    const bytes = textBytes('fallback')
    mocks.openFileReadSession.mockRejectedValue(new Error('sessao indisponivel'))
    mocks.readFileChunk.mockResolvedValue(chunk(bytes, 0, true))

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength }))

    await expect(file.text()).resolves.toBe('fallback')
    expect(mocks.readFileChunk).toHaveBeenCalledWith(expect.not.objectContaining({
      sessionId: expect.any(String),
    }))
    expect(mocks.closeFileReadSession).not.toHaveBeenCalled()
  })

  it('falha sem fallback quando arquivo grande nao abre sessao nativa', async () => {
    mocks.openFileReadSession.mockRejectedValue(new Error('sessao indisponivel'))

    await expect(readNativeFolderFile(nativeFile({ size: CHUNK_SIZE * 6 })))
      .rejects
      .toThrow('Nao foi possivel abrir sessao nativa de leitura')

    expect(mocks.readFileChunk).not.toHaveBeenCalled()
    expect(mocks.closeFileReadSession).not.toHaveBeenCalled()
  })

  it('usa tamanho decodificado quando bytesRead diverge', async () => {
    const bytes = textBytes('short')
    mocks.readFileChunk.mockResolvedValue({
      ...chunk(bytes, 0, true),
      bytesRead: bytes.byteLength + 1,
    })

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength + 1 }))

    await expect(file.text()).resolves.toBe('short')
    expect(file.size).toBe(bytes.byteLength)
  })

  it('tolera offset retornado como string pelo bridge nativo', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue({
      ...chunk(bytes, 1, true),
      offset: '0',
    })

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength }))

    await expect(file.text()).resolves.toBe('hello')
  })

  it('rejeita chunk com offset diferente para nao reconstruir arquivo corrompido', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue(chunk(bytes, 123, true))

    await expect(readNativeFolderFile(nativeFile({ size: bytes.byteLength })))
      .rejects
      .toThrow('Chunk invalido ao ler EPUB nativo. [offset-mismatch]')
  })

  it('usa tamanho decodificado quando bytesRead vem como string pelo bridge nativo', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue({
      ...chunk(bytes, 0, true),
      bytesRead: String(bytes.byteLength),
    })

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength }))

    await expect(file.text()).resolves.toBe('hello')
  })

  it('usa base64 quando bytesRead vem zerado mas o chunk tem conteudo', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue({
      ...chunk(bytes, 0, true),
      bytesRead: 0,
    })

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength }))

    await expect(file.text()).resolves.toBe('hello')
    expect(file.size).toBe(bytes.byteLength)
  })

  it('aceita tamanho informado maior que o conteudo real do provider Android', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue(chunk(bytes, 0, true))

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength + 1 }))

    await expect(file.text()).resolves.toBe('hello')
    expect(file.size).toBe(bytes.byteLength)
  })

  it('aceita tamanho informado menor que o conteudo real do provider Android', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue(chunk(bytes, 0, true))

    const file = await readNativeFolderFile(nativeFile({ size: bytes.byteLength - 1 }))

    await expect(file.text()).resolves.toBe('hello')
    expect(file.size).toBe(bytes.byteLength)
  })

  it('falha com timeout quando o bridge nativo nao responde a um chunk', async () => {
    vi.useFakeTimers()
    try {
      mocks.readFileChunk.mockReturnValue(new Promise(() => {}))

      const pendingRead = readNativeFolderFile(nativeFile({ size: CHUNK_SIZE }), { chunkTimeoutMs: 25 })
      const assertion = expect(pendingRead).rejects.toThrow('Tempo limite excedido durante native-read-chunk.')
      await vi.advanceTimersByTimeAsync(25)

      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancela leitura pendente e fecha sessao nativa', async () => {
    const controller = new AbortController()
    mocks.openFileReadSession.mockResolvedValue({ sessionId: 'session-cancel' })
    mocks.closeFileReadSession.mockResolvedValue({ closed: true })
    mocks.readFileChunk.mockReturnValue(new Promise(() => {}))

    const pendingRead = readNativeFolderFile(
      nativeFile({ size: CHUNK_SIZE }),
      { signal: controller.signal, chunkTimeoutMs: 10_000 },
    )
    const assertion = expect(pendingRead).rejects.toThrow('Importacao cancelada')
    controller.abort(new DOMException('Importacao cancelada pelo teste.', 'AbortError'))

    await assertion
    expect(mocks.closeFileReadSession).toHaveBeenCalledWith({ sessionId: 'session-cancel' })
  })
})

function nativeFile(overrides: Partial<NativeFolderFile> = {}): NativeFolderFile {
  return {
    name: 'book.epub',
    uri: 'content://book.epub',
    path: 'folder/book.epub',
    size: 0,
    ...overrides,
  }
}

function chunk(bytes: Uint8Array, offset: number, done: boolean) {
  return {
    base64: bytesToBase64(bytes),
    bytesRead: bytes.byteLength,
    offset,
    done,
  }
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function repeatedBytes(char: string, length: number): Uint8Array {
  return new Uint8Array(length).fill(char.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}
