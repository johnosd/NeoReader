import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  readFileChunk: vi.fn(),
  readFile: vi.fn(),
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
    selectEpubFolder: mocks.selectEpubFolder,
    selectEpubFile: mocks.selectEpubFile,
    consumePendingFolderSelection: mocks.consumePendingFolderSelection,
    consumePendingFileSelection: mocks.consumePendingFileSelection,
    listSelectedFolderFiles: mocks.listSelectedFolderFiles,
  })),
}))

import { readNativeFolderFile, type NativeFolderFile } from '@/services/NativeLibraryImportService'

const CHUNK_SIZE = 256 * 1024

describe('NativeLibraryImportService', () => {
  beforeEach(() => {
    mocks.readFileChunk.mockReset()
    mocks.readFile.mockReset()
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

  it('falha quando o tamanho decodificado diverge de bytesRead', async () => {
    const bytes = textBytes('short')
    mocks.readFileChunk.mockResolvedValue({
      ...chunk(bytes, 0, true),
      bytesRead: bytes.byteLength + 1,
    })

    await expect(readNativeFolderFile(nativeFile({ size: bytes.byteLength + 1 })))
      .rejects.toThrow('Chunk invalido ao ler EPUB nativo.')
  })

  it('falha quando o offset retornado diverge do solicitado', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue({
      ...chunk(bytes, 1, true),
      offset: 1,
    })

    await expect(readNativeFolderFile(nativeFile({ size: bytes.byteLength })))
      .rejects.toThrow('Chunk invalido ao ler EPUB nativo.')
  })

  it('falha quando o tamanho final diverge do tamanho informado', async () => {
    const bytes = textBytes('hello')
    mocks.readFileChunk.mockResolvedValue(chunk(bytes, 0, true))

    await expect(readNativeFolderFile(nativeFile({ size: bytes.byteLength + 1 })))
      .rejects.toThrow('Chunk invalido ao ler EPUB nativo.')
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
