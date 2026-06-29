import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useAddressStore from '../../store/addressStore'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'
import Icon from '../ui/Icon'
import { toast } from '../../store/toastStore'

const EMPTY = { full_name: '', phone: '', city: '', street: '', house: '', apartment: '', postal_code: '', is_default: false }

const FORM_FIELDS = [
  { key: 'full_name', label: 'Получатель', required: true, col: 2 },
  { key: 'phone', label: 'Телефон', required: true, col: 1 },
  { key: 'postal_code', label: 'Индекс', required: false, col: 1 },
  { key: 'city', label: 'Город', required: true, col: 2 },
  { key: 'street', label: 'Улица', required: true, col: 2 },
  { key: 'house', label: 'Дом', required: true, col: 1 },
  { key: 'apartment', label: 'Квартира', required: false, col: 1 },
]

export default function AddressesTab() {
  const { items, status, fetch, create, update, remove, setDefault } = useAddressStore()
  const [form, setForm] = useState(null)   // null | {...address} - открытая форма
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetch() }, [fetch])

  const openAdd = () => { setForm({ ...EMPTY }); setEditId(null) }
  const openEdit = (a) => { setForm({ ...a }); setEditId(a.id) }
  const closeForm = () => { setForm(null); setEditId(null) }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId) await update(editId, form)
      else await create(form)
      toast.success(editId ? 'Адрес обновлён' : 'Адрес добавлен')
      closeForm()
    } catch (err) {
      const data = err.response?.data
      const msg = data ? Object.values(data).flat()[0] : 'Не удалось сохранить адрес'
      toast.error(typeof msg === 'string' ? msg : 'Не удалось сохранить адрес')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (a) => {
    if (!window.confirm('Удалить этот адрес?')) return
    try {
      await remove(a.id)
      toast.success('Адрес удалён')
    } catch {
      toast.error('Не удалось удалить адрес')
    }
  }

  const handleSetDefault = async (a) => {
    try {
      await setDefault(a.id)
    } catch {
      toast.error('Не удалось обновить адрес по умолчанию')
    }
  }

  const inputCls = 'w-full border border-line-strong rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft bg-card'

  return (
    <motion.div key="addresses" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-xl font-bold text-ink">Адреса доставки</h2>
        {!form && (
          <button onClick={openAdd} className="text-xs font-semibold bg-ink text-white px-4 py-2 rounded-xl hover:bg-ink/90 transition">
            + Добавить
          </button>
        )}
      </div>

      {/* Форма добавления/редактирования */}
      <AnimatePresence>
        {form && (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card rounded-2xl border border-line p-6 mb-4 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 mb-4">
              {FORM_FIELDS.map((f) => (
                <div key={f.key} className={f.col === 2 ? 'col-span-2' : 'col-span-1'}>
                  <label className="block text-xs font-medium text-ink-faint mb-1">
                    {f.label}{f.required && <span className="text-danger"> *</span>}
                  </label>
                  <input
                    type="text"
                    required={f.required}
                    value={form[f.key] || ''}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft mb-4 cursor-pointer">
              <input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} className="w-4 h-4 accent-ink" />
              Использовать по умолчанию
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="text-xs font-semibold bg-ink text-white px-5 py-2.5 rounded-xl hover:bg-ink/90 transition disabled:opacity-50">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button type="button" onClick={closeForm} className="text-xs font-medium text-ink-faint hover:text-ink-soft px-4 py-2.5 rounded-xl hover:bg-surface transition">
                Отмена
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Список */}
      {status === 'loading' ? (
        <div className="flex flex-col gap-3">{[...Array(2)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-24 animate-pulse" />)}</div>
      ) : status === 'error' ? (
        <ErrorState onRetry={fetch} />
      ) : items.length === 0 && !form ? (
        <EmptyState
          icon={<Icon name="pin" className="w-7 h-7 text-ink-faint" />}
          title="Адресов пока нет"
          subtitle="Добавьте адрес, чтобы оформлять доставку быстрее"
          action={{ label: 'Добавить адрес', onClick: openAdd }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((a) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-line p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-ink">{a.full_name}</p>
                    {a.is_default && <span className="text-[10px] font-bold bg-success/10 text-success px-2 py-0.5 rounded-full">По умолчанию</span>}
                  </div>
                  <p className="text-sm text-ink-faint">{a.phone}</p>
                  <p className="text-sm text-ink-faint mt-1">
                    {a.postal_code && `${a.postal_code}, `}{a.city}, {a.street} {a.house}{a.apartment && `, кв. ${a.apartment}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {!a.is_default && (
                  <button onClick={() => handleSetDefault(a)} className="text-xs font-semibold text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent-soft transition">
                    Сделать основным
                  </button>
                )}
                <button onClick={() => openEdit(a)} className="text-xs font-semibold text-ink-soft border border-line-strong px-3 py-1.5 rounded-lg hover:bg-surface transition">
                  Изменить
                </button>
                <button onClick={() => handleDelete(a)} className="text-xs font-semibold text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-danger/10 transition">
                  Удалить
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
