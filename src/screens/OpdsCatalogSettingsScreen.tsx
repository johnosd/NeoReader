import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, BookOpen, Plus, Rss, Trash2, Wifi, WifiOff } from 'lucide-react'
import { Button, EmptyState, Input, ListItem, Spinner, Switch, Toast } from '../components/ui'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useI18n, type MessageKey } from '../i18n'
import { createCatalog, deleteCatalog, DuplicateCatalogUrlError, listCatalogs, updateCatalog } from '../db/opdsCatalogs'
import { OpdsCatalogFetchError, OpdsCatalogService } from '../services/opds/OpdsCatalogService'
import type { OpdsCredential } from '../services/opds/OpdsCredentialStore'
import type { OpdsCatalog, OpdsCatalogErrorKind } from '../types/opds'

// Mensagem especifica por tipo de falha do teste de conexao (pedido do
// usuario: nao salvar um catalogo que nao conecta, em vez de descobrir isso
// so depois) -- distingue credencial errada de servidor inalcancavel/formato
// invalido, cada um com um proximo passo diferente pro usuario.
const TEST_ERROR_MESSAGE_KEYS: Record<OpdsCatalogErrorKind, MessageKey> = {
  'invalid-credential': 'settings.opdsCatalogs.form.invalidCredential',
  network: 'settings.opdsCatalogs.form.testNetworkError',
  'invalid-format': 'settings.opdsCatalogs.form.testFormatError',
}

interface OpdsCatalogSettingsScreenProps {
  onBack: () => void
  onOpenCatalog: (catalogId: number) => void
}

type ConnectionStatus = 'checking' | 'connected' | 'error'

// URLs verificadas ao vivo durante o planejamento desta feature — Standard
// Ebooks exige conta (feed completo restrito a supporters, confirmado 401
// sem credencial); Internet Archive/Open Library é público, mas mistura
// formatos com DRM (filtro EPUB-only já cuida de esconder o que não serve).
// Nenhuma delas entra habilitada por padrão (FR-018) — só pré-preenche.
const CATALOG_SUGGESTIONS = [
  { name: 'Standard Ebooks', baseUrl: 'https://standardebooks.org/feeds/opds' },
  { name: 'Internet Archive', baseUrl: 'https://openlibrary.org/opds/search' },
]

interface FormState {
  mode: 'create' | 'edit'
  catalogId?: number
  name: string
  baseUrl: string
  requiresAuth: boolean
  username: string
  password: string
}

const EMPTY_FORM: FormState = { mode: 'create', name: '', baseUrl: '', requiresAuth: false, username: '', password: '' }

// undefined = não mexe na credencial existente (edit, campos deixados em
// branco); null = remove a credencial; objeto = guarda/troca.
function resolveCredentialForSave(form: FormState): OpdsCredential | null | undefined {
  if (!form.requiresAuth) return form.mode === 'edit' ? null : undefined
  if (form.username.trim() && form.password.trim()) {
    return { username: form.username.trim(), password: form.password.trim() }
  }
  return undefined
}

export function OpdsCatalogSettingsScreen({ onBack, onOpenCatalog }: OpdsCatalogSettingsScreenProps) {
  const { t } = useI18n()
  useCapacitorBackButton(onBack)

  const catalogs = useLiveQuery(() => listCatalogs(), [])
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<Record<number, ConnectionStatus>>({})

  // Pedido do usuário: mostrar de cara se cada catálogo cadastrado está
  // respondendo, sem precisar abrir Descobrir só pra descobrir isso.
  // `catalogs` só muda de referência quando o Dexie live query detecta uma
  // mudança real (CRUD) — não a cada re-render deste componente.
  useEffect(() => {
    if (!catalogs) return
    for (const catalog of catalogs) {
      if (catalog.id == null) continue
      const catalogId = catalog.id
      setConnectionStatus((prev) => ({ ...prev, [catalogId]: 'checking' }))
      OpdsCatalogService.fetchSample(catalog)
        .then(() => setConnectionStatus((prev) => ({ ...prev, [catalogId]: 'connected' })))
        .catch(() => setConnectionStatus((prev) => ({ ...prev, [catalogId]: 'error' })))
    }
  }, [catalogs])

  function openCreateForm(suggestion?: { name: string; baseUrl: string }) {
    setError(null)
    setForm({ ...EMPTY_FORM, name: suggestion?.name ?? '', baseUrl: suggestion?.baseUrl ?? '' })
  }

  function openEditForm(catalog: OpdsCatalog) {
    setError(null)
    setForm({
      mode: 'edit',
      catalogId: catalog.id,
      name: catalog.name,
      baseUrl: catalog.baseUrl,
      requiresAuth: catalog.hasCredential,
      username: '',
      password: '',
    })
  }

  const canSave = Boolean(
    form
    && form.name.trim()
    && form.baseUrl.trim()
    && (!form.requiresAuth || form.mode === 'edit' || (form.username.trim() && form.password.trim())),
  )

  // Testa com exatamente o que o formulário salvaria, sem persistir nada
  // ainda. Create (ou edit com credencial nova/removida): credencial vem
  // direto do formulário, sem tocar no storage nativo. Edit com senha em
  // branco ("manter a atual"): testa contra o que já está salvo pra esse
  // catálogo, via fetchSample (única situação que precisa do storage nativo
  // aqui, porque é a única em que a credencial não está em memória).
  async function testConnection(form: FormState) {
    const baseUrl = form.baseUrl.trim()

    if (form.mode === 'edit' && form.requiresAuth && !(form.username.trim() && form.password.trim())) {
      const current = catalogs?.find((c) => c.id === form.catalogId)
      if (current) {
        await OpdsCatalogService.fetchSample({ ...current, baseUrl })
        return
      }
    }

    const credential = form.requiresAuth && form.username.trim() && form.password.trim()
      ? { username: form.username.trim(), password: form.password.trim() }
      : undefined
    await OpdsCatalogService.testConnection(baseUrl, credential)
  }

  async function handleSave() {
    if (!form || !canSave) return
    setSaving(true)
    setError(null)

    // Testa ANTES de persistir — pedido do usuário: só salvar se a conexão
    // realmente funcionar, em vez de descobrir isso só depois em Descobrir.
    try {
      await testConnection(form)
    } catch (validationError) {
      const messageKey = validationError instanceof OpdsCatalogFetchError
        ? TEST_ERROR_MESSAGE_KEYS[validationError.kind]
        : 'settings.opdsCatalogs.form.testNetworkError'
      setError(t(messageKey))
      setSaving(false)
      return
    }

    try {
      const name = form.name.trim()
      const baseUrl = form.baseUrl.trim()

      if (form.mode === 'create') {
        await createCatalog({ name, baseUrl, credential: resolveCredentialForSave(form) ?? undefined })
      } else {
        await updateCatalog(form.catalogId!, { name, baseUrl, credential: resolveCredentialForSave(form) })
      }

      setForm(null)
      setSuccessToast(t('settings.opdsCatalogs.form.testSuccess'))
    } catch (err) {
      setError(err instanceof DuplicateCatalogUrlError
        ? t('settings.opdsCatalogs.form.duplicateUrl')
        : t('settings.opdsCatalogs.form.genericError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(catalog: OpdsCatalog) {
    if (catalog.id == null) return
    await deleteCatalog(catalog.id)
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-primary pb-12">
      <header className="px-4 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider">{t('settings.opdsCatalogs.sectionLabel')}</p>
          <h1 className="text-2xl font-serif font-bold text-purple-light">{t('settings.opdsCatalogs.title')}</h1>
        </div>
      </header>

      <div className="px-4">
        {catalogs === undefined ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : catalogs.length === 0 ? (
          <EmptyState
            icon={<Rss size={40} />}
            title={t('settings.opdsCatalogs.empty.title')}
            description={t('settings.opdsCatalogs.empty.description')}
          />
        ) : (
          <div className="rounded-md border border-border bg-bg-surface overflow-hidden mb-4">
            {catalogs.map((catalog, index) => {
              const status = catalog.id != null ? connectionStatus[catalog.id] : undefined
              return (
                <ListItem
                  key={catalog.id}
                  leading={<Rss size={20} className="text-purple-light" />}
                  title={catalog.name}
                  meta={catalog.baseUrl}
                  onClick={() => openEditForm(catalog)}
                  divider={index < catalogs.length - 1}
                  trailing={(
                    <div className="flex items-center gap-1">
                      <span
                        aria-label={
                          status === 'connected'
                            ? t('settings.opdsCatalogs.status.connected')
                            : status === 'error'
                              ? t('settings.opdsCatalogs.status.disconnected')
                              : t('settings.opdsCatalogs.status.checking')
                        }
                        className="p-2"
                      >
                        {status === 'connected' ? (
                          <Wifi size={16} className="text-success" />
                        ) : status === 'error' ? (
                          <WifiOff size={16} className="text-error" />
                        ) : (
                          <Spinner size={16} label="" />
                        )}
                      </span>
                      <button
                        type="button"
                        aria-label={t('settings.opdsCatalogs.open')}
                        disabled={catalog.id == null}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (catalog.id != null) onOpenCatalog(catalog.id)
                        }}
                        className="p-2 text-purple-light active:opacity-70 disabled:opacity-40"
                      >
                        <BookOpen size={18} />
                      </button>
                      <button
                        type="button"
                        aria-label={t('settings.opdsCatalogs.remove')}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleDelete(catalog)
                        }}
                        className="p-2 text-error active:opacity-70"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                />
              )
            })}
          </div>
        )}

        <Button variant="secondary" leftIcon={<Plus size={18} />} onClick={() => openCreateForm()}>
          {t('settings.opdsCatalogs.add')}
        </Button>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/60">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-bg-surface p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">
              {form.mode === 'create' ? t('settings.opdsCatalogs.form.titleCreate') : t('settings.opdsCatalogs.form.titleEdit')}
            </h2>

            {form.mode === 'create' && (
              <div className="mb-4 flex flex-wrap gap-2">
                {CATALOG_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.name}
                    type="button"
                    onClick={() => setForm({ ...form, name: suggestion.name, baseUrl: suggestion.baseUrl })}
                    className="rounded-pill border border-purple-primary/40 px-3 py-1 text-xs font-semibold text-purple-light active:bg-purple-primary/15"
                  >
                    {suggestion.name}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <Input
                label={t('settings.opdsCatalogs.form.name')}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <Input
                label={t('settings.opdsCatalogs.form.url')}
                value={form.baseUrl}
                onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                placeholder="https://"
              />

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">{t('settings.opdsCatalogs.form.requiresAuth')}</span>
                <Switch checked={form.requiresAuth} onChange={(checked) => setForm({ ...form, requiresAuth: checked })} />
              </div>

              {form.requiresAuth && (
                <>
                  <Input
                    label={t('settings.opdsCatalogs.form.username')}
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    autoCapitalize="none"
                  />
                  <Input
                    label={t('settings.opdsCatalogs.form.password')}
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    hint={form.mode === 'edit' ? t('settings.opdsCatalogs.form.passwordEditHint') : undefined}
                  />
                </>
              )}

              {error && <p className="text-sm text-error">{error}</p>}
            </div>

            <div className="mt-5 flex gap-2">
              <Button variant="secondary" disabled={saving} onClick={() => setForm(null)}>
                {t('common.cancel')}
              </Button>
              <Button disabled={!canSave || saving} onClick={() => void handleSave()}>
                {saving ? <Spinner size={18} label="" /> : t('settings.opdsCatalogs.form.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {successToast && (
        <Toast tone="success" onDismiss={() => setSuccessToast(null)}>
          {successToast}
        </Toast>
      )}
    </div>
  )
}
