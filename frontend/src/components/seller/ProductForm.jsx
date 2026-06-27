import { useEffect, useState } from 'react'
import api from '../../api'
import { toast } from '../../store/toastStore'
import ErrorState from '../states/ErrorState'
import SizeStockEditor from './SizeStockEditor'
import SpecsEditor from './SpecsEditor'
import ImageUploader from './ImageUploader'

// Форма карточки товара (Ф12, узел 2.3). Один компонент - два режима:
//   - создание (productId == null): POST /products/create/, затем загрузка
//     накопленных фото на id нового товара (план 4.4, «курица-яйцо»);
//   - редактирование (productId): GET предзаполняет поля, сабмит шлёт PATCH;
//     фото грузятся/удаляются сразу (ImageUploader).
// Статус приходит из кнопки (черновик/на модерацию) - active в обход модерации
// недоступен ни в форме, ни на сервере (план 9). Бренд/сетка/маркировка -
// честные forward-заглушки (Ф20/Ф5), помечены в подписях.

const INPUT = 'w-full border border-line-strong rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition bg-surface focus:bg-card'
const LABEL = 'block text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1.5'

const EMPTY = { name: '', description: '', category: '', price: '', old_price: '', stock: '', brand: '', marking: '' }

export default function ProductForm({ productId = null, categories = [], onDone, onCancel }) {
  const isEdit = Boolean(productId)
  const [form, setForm] = useState(EMPTY)
  const [sizes, setSizes] = useState([])
  const [colors, setColors] = useState([])
  const [specs, setSpecs] = useState([])
  const [pendingImages, setPendingImages] = useState([])
  const [existingImages, setExistingImages] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!isEdit) return
    loadProduct()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  async function loadProduct() {
    setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get(`/products/my/${productId}/`)
      const attrs = data.attributes || {}
      setForm({
        name: data.name || '',
        description: data.description || '',
        category: data.category || '',
        price: data.price ?? '',
        old_price: data.old_price ?? '',
        stock: data.stock ?? '',
        brand: attrs.brand || '',
        marking: attrs.marking || '',
      })
      setSizes((attrs.sizes || []).map((s) => ({ label: s.label, stock: s.stock ?? '' })))
      setColors((attrs.colors || []).map((c) => ({ label: c.label, code: c.code || '' })))
      setSpecs(Object.entries(attrs.specs || {}).map(([key, val]) => ({ key, val })))
      setExistingImages(data.images || [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  // Обновляет ТОЛЬКО список фото после upload/delete/reorder, не перезаписывая
  // остальные поля формы - иначе несохранённые правки (цена, размеры) сбросятся.
  async function reloadImages() {
    try {
      const { data } = await api.get(`/products/my/${productId}/`)
      setExistingImages(data.images || [])
    } catch {
      // тихо: само фото-действие уже выполнено, список подтянется при переоткрытии
    }
  }

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  function buildAttributes() {
    const attrs = {}
    if (form.brand.trim()) attrs.brand = form.brand.trim()
    const s = sizes
      .filter((r) => String(r.label).trim())
      .map((r) => ({ label: String(r.label).trim(), stock: Number(r.stock) || 0 }))
    if (s.length) attrs.sizes = s
    const c = colors
      .filter((r) => String(r.label).trim())
      .map((r) => ({ label: String(r.label).trim(), code: String(r.code || '').trim() }))
    if (c.length) attrs.colors = c
    const sp = {}
    specs.forEach((r) => {
      const key = String(r.key || '').trim()
      const val = String(r.val || '').trim()
      if (key && val) sp[key] = val
    })
    if (Object.keys(sp).length) attrs.specs = sp
    if (form.marking.trim()) attrs.marking = form.marking.trim()
    return attrs
  }

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Введите название'
    if (!form.category) e.category = 'Выберите категорию'
    if (!form.price || Number(form.price) <= 0) e.price = 'Цена должна быть больше 0'
    if (form.old_price && Number(form.old_price) <= Number(form.price)) {
      e.old_price = 'Старая цена должна быть больше текущей'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(status) {
    if (!validate()) return
    setSubmitting(true)
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      price: Number(form.price),
      old_price: form.old_price ? Number(form.old_price) : null,
      status,
      attributes: buildAttributes(),
    }
    // stock из поля «остаток» только без размеров (с размерами сервер считает сумму).
    if (!payload.attributes.sizes) payload.stock = Number(form.stock) || 0
    try {
      if (isEdit) {
        await api.patch(`/products/my/${productId}/`, payload)
      } else {
        const { data } = await api.post('/products/create/', payload)
        await uploadPendingImages(data.id)
      }
      toast.success(status === 'draft' ? 'Сохранено в черновики' : 'Отправлено на модерацию')
      onDone?.()
    } catch (err) {
      applyServerErrors(err)
    } finally {
      setSubmitting(false)
    }
  }

  // Двухшаговый флоу создания: товар создан как черновик, фото грузим на его id.
  // Сбой загрузки фото не теряет товар - он уже сохранён, фото догружаются в правке.
  async function uploadPendingImages(newId) {
    for (const file of pendingImages) {
      const fd = new FormData()
      fd.append('image', file)
      try {
        await api.post(`/products/my/${newId}/images/`, fd)
      } catch {
        toast.error('Товар сохранён, но часть фото не загрузилась - догрузите в редактировании')
        return
      }
    }
  }

  function applyServerErrors(err) {
    const data = err.response?.data
    if (data && typeof data === 'object') {
      const mapped = {}
      Object.entries(data).forEach(([k, v]) => {
        mapped[k] = Array.isArray(v) ? v.join(' ') : String(v)
      })
      setErrors(mapped)
      toast.error('Проверьте поля формы')
    } else {
      toast.error('Не удалось сохранить товар')
    }
  }

  if (loading) {
    return <div className="bg-card rounded-2xl border border-line h-96 skeleton" />
  }
  if (loadError) {
    return <ErrorState title="Не удалось загрузить товар" onRetry={loadProduct} />
  }

  const err = (field) => errors[field] && <p className="text-xs text-danger mt-1">{errors[field]}</p>

  return (
    <div className="bg-card rounded-2xl border border-line p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-ink">{isEdit ? 'Редактирование товара' : 'Новый товар'}</h2>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-ink-faint hover:text-ink-soft font-medium">
            Отмена
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Основное */}
        <div className="md:col-span-2">
          <label className={LABEL}>Название *</label>
          <input name="name" className={INPUT} placeholder="Название товара" value={form.name} onChange={change} />
          {err('name')}
        </div>

        <div>
          <label className={LABEL}>Категория *</label>
          <select name="category" className={`${INPUT} appearance-none`} value={form.category} onChange={change}>
            <option value="">Выберите категорию</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          {err('category')}
        </div>

        <div>
          <label className={LABEL}>Бренд</label>
          <input name="brand" className={INPUT} placeholder="Название бренда" value={form.brand} onChange={change} />
          <p className="text-[11px] text-ink-faint mt-1">Текстом - каталог брендов появится позже (Ф20)</p>
        </div>

        <div>
          <label className={LABEL}>Цена ₽ *</label>
          <input name="price" type="number" min="0" className={INPUT} placeholder="0" value={form.price} onChange={change} />
          {err('price')}
        </div>

        <div>
          <label className={LABEL}>Старая цена ₽</label>
          <input name="old_price" type="number" min="0" className={INPUT} placeholder="(для показа скидки)" value={form.old_price} onChange={change} />
          {err('old_price')}
        </div>

        <div className="md:col-span-2">
          <label className={LABEL}>Описание</label>
          <textarea name="description" rows={3} className={`${INPUT} resize-none`} placeholder="Описание товара" value={form.description} onChange={change} />
        </div>

        {/* Размеры с остатками */}
        <div className="md:col-span-2">
          <label className={LABEL}>Размеры и остатки</label>
          <SizeStockEditor value={sizes} onChange={setSizes} />
          {sizes.length === 0 && (
            <div className="mt-3">
              <label className={LABEL}>Остаток (без размеров)</label>
              <input name="stock" type="number" min="0" className={`${INPUT} w-40`} placeholder="0" value={form.stock} onChange={change} />
            </div>
          )}
        </div>

        {/* Цвета */}
        <div className="md:col-span-2">
          <label className={LABEL}>Цвета</label>
          <ColorsEditor value={colors} onChange={setColors} />
        </div>

        {/* Характеристики */}
        <div className="md:col-span-2">
          <label className={LABEL}>Характеристики</label>
          <SpecsEditor value={specs} onChange={setSpecs} />
        </div>

        {/* Фото */}
        <div className="md:col-span-2">
          <label className={LABEL}>Фото</label>
          <ImageUploader
            productId={productId}
            pending={pendingImages}
            onPendingChange={setPendingImages}
            existing={existingImages}
            onExistingChange={reloadImages}
          />
          {!isEdit && (
            <p className="text-[11px] text-ink-faint mt-2">Фото загрузятся после сохранения товара</p>
          )}
        </div>

        {/* Forward-заглушки: размерная сетка (Ф5) и маркировка «Честный знак» */}
        <div>
          <label className={LABEL}>Размерная сетка</label>
          <input className={INPUT} value="Привязка появится с модулем сеток (Ф5)" disabled readOnly />
        </div>
        <div>
          <label className={LABEL}>Маркировка «Честный знак»</label>
          <input name="marking" className={INPUT} placeholder="Код маркировки" value={form.marking} onChange={change} />
          <p className="text-[11px] text-ink-faint mt-1">Учебная заглушка - без интеграции с системой</p>
        </div>
      </div>

      {/* Кнопки статуса */}
      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('draft')}
          className="flex-1 py-3 rounded-xl font-semibold text-sm border border-line-strong text-ink-soft hover:bg-surface transition disabled:opacity-50"
        >
          Сохранить черновик
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('moderation')}
          className="flex-1 bg-ink text-white py-3 rounded-xl font-semibold text-sm hover:bg-ink/90 transition disabled:opacity-50"
        >
          На модерацию
        </button>
      </div>
    </div>
  )
}

// Цвета - простой список {label, code}. Контракт attributes.colors читает Ф4
// (VariantPicker рисует кружок цвета по code). Вынесен инлайн - один экран.
function ColorsEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : []
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const add = () => onChange([...rows, { label: '', code: '#000000' }])
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i))
  const input = 'border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition bg-surface focus:bg-card'

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${input} flex-1`}
            placeholder="Название цвета (Чёрный)"
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <input
            type="color"
            className="w-10 h-10 rounded-lg border border-line-strong bg-card cursor-pointer"
            value={row.code || '#000000'}
            onChange={(e) => update(i, { code: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 w-9 h-9 rounded-xl text-danger hover:bg-danger/10 transition flex items-center justify-center"
            aria-label="Удалить цвет"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="self-start text-sm text-accent font-semibold hover:underline">
        + Добавить цвет
      </button>
    </div>
  )
}
