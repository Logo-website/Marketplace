import { useEffect, useMemo, useState } from 'react'
import api from '../../api'
import { toast } from '../../store/toastStore'

// Мультизагрузка фото товара (Ф12, узел 2.3). Два режима из-за «курицы-яйца»
// (ProductImage ссылается на Product через FK, плана 4.4):
//   - создание (productId == null): файлы держим в памяти как превью, родитель
//     отправит их на /images/ ПОСЛЕ создания товара (получив id).
//   - редактирование (productId задан): загрузка и удаление идут на сервер сразу.
//
// Props:
//   productId      - id товара или null (режим)
//   pending        - File[] выбранных, но ещё не отправленных (режим создания)
//   onPendingChange(files) - обновить список pending у родителя
//   existing       - [{id, image, image_url}] уже загруженные (режим правки)
//   onExistingChange() - перезагрузить existing после upload/delete
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
const MAX_FILES = 10

export default function ImageUploader({ productId, pending = [], onPendingChange, existing = [], onExistingChange }) {
  const isEdit = Boolean(productId)
  const [busy, setBusy] = useState(false)

  // Превью pending-файлов через objectURL (derived из pending). Ревок старых URL
  // в cleanup - чтобы не текла память (cleanup срабатывает при смене previews и
  // на размонтировании).
  const previews = useMemo(() => pending.map((f) => URL.createObjectURL(f)), [pending])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const total = existing.length + pending.length

  const handleSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // сброс - тот же файл можно выбрать снова
    if (!files.length) return
    if (total + files.length > MAX_FILES) {
      toast.error(`Не больше ${MAX_FILES} фото на товар`)
      return
    }
    if (isEdit) {
      setBusy(true)
      try {
        for (const file of files) {
          const fd = new FormData()
          fd.append('image', file)
          await api.post(`/products/my/${productId}/images/`, fd)
        }
        onExistingChange?.()
      } catch (err) {
        toast.error(err.response?.data?.image || 'Не удалось загрузить фото')
      } finally {
        setBusy(false)
      }
    } else {
      onPendingChange?.([...pending, ...files])
    }
  }

  const removePending = (i) => onPendingChange?.(pending.filter((_, idx) => idx !== i))

  const removeExisting = async (id) => {
    setBusy(true)
    try {
      await api.delete(`/products/my/${productId}/images/${id}/`)
      onExistingChange?.()
    } catch {
      toast.error('Не удалось удалить фото')
    } finally {
      setBusy(false)
    }
  }

  // Переупорядочивание (план Этап 3): меняем позицию фото и шлём новый порядок
  // id на сервер (PUT). Первое фото - обложка карточки (Ф4 берёт images[0]).
  const moveExisting = async (index, dir) => {
    const next = [...existing]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setBusy(true)
    try {
      await api.put(`/products/my/${productId}/images/`, { order: next.map((img) => img.id) })
      onExistingChange?.()
    } catch {
      toast.error('Не удалось изменить порядок фото')
    } finally {
      setBusy(false)
    }
  }

  const thumb = 'relative w-24 h-24 rounded-xl overflow-hidden border border-line-strong bg-surface group'
  const delBtn = 'absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition'

  return (
    <div className="flex flex-wrap gap-3">
      {existing.map((img, i) => (
        <div key={img.id} className={thumb}>
          <img src={img.image_url || img.image} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => removeExisting(img.id)} disabled={busy} className={delBtn} aria-label="Удалить фото">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {existing.length > 1 && (
            <div className="absolute bottom-1 inset-x-1 flex justify-between opacity-0 group-hover:opacity-100 transition">
              <button type="button" onClick={() => moveExisting(i, -1)} disabled={busy || i === 0}
                className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30" aria-label="Левее">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button type="button" onClick={() => moveExisting(i, 1)} disabled={busy || i === existing.length - 1}
                className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30" aria-label="Правее">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>
      ))}
      {previews.map((url, i) => (
        <div key={url} className={thumb}>
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => removePending(i)} className={delBtn} aria-label="Убрать фото">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      {total < MAX_FILES && (
        <label className="w-24 h-24 rounded-xl border-2 border-dashed border-line-strong flex flex-col items-center justify-center text-ink-faint hover:border-accent hover:text-accent transition cursor-pointer">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[11px] mt-1">Фото</span>
          <input type="file" accept={ACCEPT} multiple className="hidden" onChange={handleSelect} disabled={busy} />
        </label>
      )}
    </div>
  )
}
