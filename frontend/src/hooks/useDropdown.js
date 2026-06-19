import { useState, useEffect, useRef } from 'react'

// Общий механизм дропдауна: состояние open/close + закрытие по клику вне и
// по Esc. Обобщение клик-вне из Header (поиск) на все дропдауны шапки:
// каталог, город, колокольчик, профиль, подсказки поиска.
//
// Инвариант «открыт максимум один дроп» обеспечивается естественно: клик по
// триггеру другого дропдауна - это mousedown вне ref текущего, поэтому текущий
// закрывается. Слушатели вешаются только пока open=true (не копятся вхолостую).
//
// Возвращает: { open, setOpen, toggle, ref } - ref вешается на корневой
// контейнер дропдауна (триггер + панель внутри одного ref).
export default function useDropdown(initial = false) {
  const [open, setOpen] = useState(initial)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, toggle: () => setOpen((o) => !o), ref }
}
