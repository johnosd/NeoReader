import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  catalogs: [] as OpdsCatalog[],
  createCatalog: vi.fn(),
  updateCatalog: vi.fn(),
  deleteCatalog: vi.fn(),
  listCatalogs: vi.fn(),
  fetchSample: vi.fn(),
  testConnection: vi.fn(),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((query: () => unknown) => {
    void query()
    return mocks.catalogs
  }),
}))

vi.mock('@/db/opdsCatalogs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/opdsCatalogs')>()
  return {
    ...actual,
    createCatalog: mocks.createCatalog,
    updateCatalog: mocks.updateCatalog,
    deleteCatalog: mocks.deleteCatalog,
    listCatalogs: mocks.listCatalogs,
  }
})

vi.mock('@/services/opds/OpdsCatalogService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/opds/OpdsCatalogService')>()
  return {
    ...actual,
    OpdsCatalogService: { fetchSample: mocks.fetchSample, testConnection: mocks.testConnection },
  }
})

vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: vi.fn(),
}))

import { OpdsCatalogSettingsScreen } from '@/screens/OpdsCatalogSettingsScreen'
import { OpdsCatalogFetchError } from '@/services/opds/OpdsCatalogService'
import { DuplicateCatalogUrlError } from '@/db/opdsCatalogs'

function catalog(overrides: Partial<OpdsCatalog> = {}): OpdsCatalog {
  return {
    id: 1,
    name: 'Project Gutenberg',
    baseUrl: 'https://www.gutenberg.org/ebooks/search.opds/',
    hasCredential: false,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('OpdsCatalogSettingsScreen', () => {
  beforeEach(() => {
    mocks.catalogs = []
    mocks.createCatalog.mockReset()
    mocks.updateCatalog.mockReset()
    mocks.deleteCatalog.mockReset().mockResolvedValue(undefined)
    mocks.listCatalogs.mockReset()
    mocks.fetchSample.mockReset().mockResolvedValue({ entries: [] })
    mocks.testConnection.mockReset().mockResolvedValue({ entries: [] })
  })

  it('mostra estado vazio quando não há catálogo cadastrado', () => {
    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    expect(screen.getByText('Nenhum catalogo cadastrado')).toBeTruthy()
  })

  it('lista os catálogos cadastrados', () => {
    mocks.catalogs = [catalog(), catalog({ id: 2, name: 'Meu Calibre-Web', baseUrl: 'https://home.example.com/opds', isDefault: false })]
    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)

    expect(screen.getByText('Project Gutenberg')).toBeTruthy()
    expect(screen.getByText('Meu Calibre-Web')).toBeTruthy()
  })

  it('adiciona um catálogo sem credencial (testa a conexão antes de salvar)', async () => {
    mocks.createCatalog.mockResolvedValue(5)

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Catálogo' } })
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'https://novo.example.com/opds' } })
    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => expect(mocks.testConnection).toHaveBeenCalledWith('https://novo.example.com/opds', undefined))
    await waitFor(() => expect(mocks.createCatalog).toHaveBeenCalledWith({
      name: 'Novo Catálogo',
      baseUrl: 'https://novo.example.com/opds',
      credential: undefined,
    }))
  })

  it('preenche nome/URL ao tocar numa sugestão (Standard Ebooks / Internet Archive, FR-018)', () => {
    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))

    expect(screen.queryByText('Feedbooks')).toBeNull() // FR-019: nunca sugerido

    fireEvent.click(screen.getByRole('button', { name: 'Standard Ebooks' }))
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Standard Ebooks')
    expect((screen.getByLabelText('URL do catalogo') as HTMLInputElement).value).toBe('https://standardebooks.org/feeds/opds')
  })

  it('adiciona um catálogo com credencial (usuário+senha) sem esquema explícito', async () => {
    mocks.createCatalog.mockResolvedValue(9)

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Meu Calibre' } })
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'https://home.example.com/opds' } })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'joao' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo' } })
    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => expect(mocks.testConnection).toHaveBeenCalledWith('https://home.example.com/opds', { username: 'joao', password: 'segredo' }))
    await waitFor(() => expect(mocks.createCatalog).toHaveBeenCalledWith({
      name: 'Meu Calibre',
      baseUrl: 'https://home.example.com/opds',
      credential: { username: 'joao', password: 'segredo' },
    }))
  })

  it('mostra mensagem específica de credencial inválida (FR-005) e não salva o catálogo', async () => {
    mocks.testConnection.mockRejectedValue(new OpdsCatalogFetchError('invalid-credential', 'Usuário ou senha incorretos para este catálogo.'))

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Meu Calibre' } })
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'https://home.example.com/opds' } })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'joao' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } })
    fireEvent.click(screen.getByText('Salvar'))

    expect(await screen.findByText('Usuario ou senha incorretos para este catalogo.')).toBeTruthy()
    // Não persiste um catálogo cuja conexão falhou (pedido do usuário).
    expect(mocks.createCatalog).not.toHaveBeenCalled()
  })

  it('mostra toast de sucesso e fecha o formulário quando o teste de conexão passa', async () => {
    mocks.createCatalog.mockResolvedValue(5)

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Catálogo' } })
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'https://novo.example.com/opds' } })
    fireEvent.click(screen.getByText('Salvar'))

    expect(await screen.findByText('Catalogo conectado com sucesso.')).toBeTruthy()
    // Formulário fecha no sucesso — campo Nome não deve mais estar na tela.
    expect(screen.queryByLabelText('Nome')).toBeNull()
  })

  it('mostra mensagem de falha de rede, mantém o formulário aberto e não salva', async () => {
    mocks.testConnection.mockRejectedValue(new OpdsCatalogFetchError('network', 'Falha de rede ao acessar o catálogo.'))

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Meu Calibre' } })
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'http://192.168.0.14:8080/opds' } })
    fireEvent.click(screen.getByText('Salvar'))

    expect(await screen.findByText('Nao foi possivel conectar (verifique a URL e a rede). O catalogo nao foi salvo.')).toBeTruthy()
    // Formulário continua aberto (não é "genericError" nem fecha em silêncio)
    // e o catálogo nunca chega a ser persistido (pedido do usuário).
    expect(screen.getByLabelText('Nome')).toBeTruthy()
    expect(mocks.createCatalog).not.toHaveBeenCalled()
  })

  it('mostra mensagem de formato inválido quando o servidor não responde OPDS reconhecido', async () => {
    mocks.testConnection.mockRejectedValue(new OpdsCatalogFetchError('invalid-format', 'Catálogo em formato inválido.'))

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Meu Calibre' } })
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'https://home.example.com/nao-opds' } })
    fireEvent.click(screen.getByText('Salvar'))

    expect(await screen.findByText('O servidor nao respondeu num formato OPDS reconhecido. O catalogo nao foi salvo.')).toBeTruthy()
    expect(mocks.createCatalog).not.toHaveBeenCalled()
  })

  it('rejeita URL duplicada com mensagem específica', async () => {
    mocks.createCatalog.mockRejectedValue(new DuplicateCatalogUrlError())

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Adicionar catalogo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Dup' } })
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'https://dup.example.com/opds' } })
    fireEvent.click(screen.getByText('Salvar'))

    expect(await screen.findByText('Ja existe um catalogo cadastrado com essa URL.')).toBeTruthy()
  })

  it('edita um catálogo existente', async () => {
    mocks.catalogs = [catalog()]
    mocks.updateCatalog.mockResolvedValue(undefined)
    mocks.listCatalogs.mockResolvedValue(mocks.catalogs)

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Project Gutenberg'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Gutenberg (editado)' } })
    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => expect(mocks.updateCatalog).toHaveBeenCalledWith(1, {
      name: 'Gutenberg (editado)',
      baseUrl: 'https://www.gutenberg.org/ebooks/search.opds/',
      credential: null,
    }))
  })

  it('ao editar mantendo a credencial atual (senha em branco), testa contra o storage nativo antes de salvar', async () => {
    const existing = catalog({ id: 3, name: 'Meu Calibre', baseUrl: 'https://home.example.com/opds', hasCredential: true })
    mocks.catalogs = [existing]
    mocks.updateCatalog.mockResolvedValue(undefined)

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)
    fireEvent.click(screen.getByText('Meu Calibre'))
    fireEvent.change(screen.getByLabelText('URL do catalogo'), { target: { value: 'https://home.example.com/opds2' } })
    fireEvent.click(screen.getByText('Salvar'))

    // Senha em branco = "manter a atual" -- testa via fetchSample (credencial
    // já persistida no storage nativo), não via testConnection (plaintext).
    await waitFor(() => expect(mocks.fetchSample).toHaveBeenCalledWith({ ...existing, baseUrl: 'https://home.example.com/opds2' }))
    await waitFor(() => expect(mocks.updateCatalog).toHaveBeenCalledWith(3, {
      name: 'Meu Calibre',
      baseUrl: 'https://home.example.com/opds2',
      credential: undefined,
    }))
  })

  it('remove um catálogo direto (sem confirmação, mesmo padrão de coleções)', async () => {
    mocks.catalogs = [catalog()]
    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Remover catalogo'))
    await waitFor(() => expect(mocks.deleteCatalog).toHaveBeenCalledWith(1))
  })

  it('mostra ícone de conectado quando o teste de status da lista passa', async () => {
    mocks.catalogs = [catalog({ id: 7 })]

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)

    expect(await screen.findByLabelText('Conectado')).toBeTruthy()
  })

  it('mostra ícone de sem conexão quando o teste de status da lista falha', async () => {
    mocks.catalogs = [catalog({ id: 8 })]
    mocks.fetchSample.mockRejectedValue(new OpdsCatalogFetchError('network', 'falhou'))

    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={vi.fn()} />)

    expect(await screen.findByLabelText('Sem conexao')).toBeTruthy()
  })

  it('botão "ver biblioteca" chama onOpenCatalog com o id do catálogo', () => {
    mocks.catalogs = [catalog({ id: 4 })]
    const onOpenCatalog = vi.fn()
    render(<OpdsCatalogSettingsScreen onBack={vi.fn()} onOpenCatalog={onOpenCatalog} />)

    fireEvent.click(screen.getByLabelText('Ver biblioteca deste catalogo'))
    expect(onOpenCatalog).toHaveBeenCalledWith(4)
  })
})
