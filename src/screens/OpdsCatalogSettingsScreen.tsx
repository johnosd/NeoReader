import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Plus, Rss, Trash2 } from 'lucide-react'
import { Button, EmptyState, Input, ListItem, Spinner, Switch } from '../components/ui'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useI18n } from '../i18n'
import { createCatalog, deleteCatalog, DuplicateCatalogUrlError, listCatalogs, updateCatalog } from '../db/opdsCatalogs'
import { OpdsCatalogFetchError, OpdsCatalogService } from '../services/opds/OpdsCatalogService'
import type { OpdsCredential } from '../services/opds/OpdsCredentialStore'
import type { OpdsCatalog } from '../types/opds'

interface OpdsCatalogSettingsScreenProps {
  onBack: () => void
}

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

export function OpdsCatalogSettingsScreen({ onBack }: OpdsCatalogSettingsScreenProps) {
  const { t } = useI18n()
  useCapacitorBackButton(onBack)

  const catalogs = useLiveQuery(() => listCatalogs(), [])
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleSave() {
    if (!form || !canSave) return
    setSaving(true)
    setError(null)

    try {
      const name = form.name.trim()
      const baseUrl = form.baseUrl.trim()
      let catalogId: number

      if (form.mode === 'create') {
        catalogId = await createCatalog({ name, baseUrl, credential: resolveCredentialForSave(form) ?? undefined })
      } else {
        catalogId = form.catalogId!
        await updateCatalog(catalogId, { name, baseUrl, credential: resolveCredentialForSave(form) })
      }

      // Confirma que o catálogo responde (com a credencial, se houver) já no
      // formulário — feedback específico de credencial inválida em vez de só
      // descobrir depois em Descobrir (US2, Acceptance Scenario 3 / FR-005).
      try {
        const saved = (await listCatalogs()).find((c) => c.id === catalogId)
        if (saved) await OpdsCatalogService.fetchSample(saved)
      } catch (validationError) {
        if (validationError instanceof OpdsCatalogFetchError && validationError.kind === 'invalid-credential') {
          setError(t('settings.opdsCatalogs.form.invalidCredential'))
          setSaving(false)
          return
        }
        // Erro de rede/formato não bloqueia salvar — o catálogo já foi
        // gravado e pode ser tentado de novo em Descobrir.
      }

      setForm(null)
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
            {catalogs.map((catalog, index) => (
              <ListItem
                key={catalog.id}
                leading={<Rss size={20} className="text-purple-light" />}
                title={catalog.name}
                meta={catalog.baseUrl}
                onClick={() => openEditForm(catalog)}
                divider={index < catalogs.length - 1}
                trailing={(
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
                )}
              />
            ))}
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
    </div>
  )
}
