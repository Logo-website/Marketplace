// Группировка списка брендов по первой букве имени для алфавитного индекса
// каталога брендов (Ф21, узел 1.22). Клиентская группировка текущей выдачи
// (решение плана §6): кириллица и латиница идут своими буквами, имена с цифры/
// символа - в группу «#» (в конце). Сортировка букв - по русской локали; внутри
// группы сохраняется исходный порядок (сервер уже отдал список по алфавиту).
//
// Возвращает массив [{ letter, brands }] - пустой список даёт [].
export function groupBrandsByLetter(brands = []) {
  const groups = {}
  for (const b of brands) {
    const first = (b?.name || '').trim().charAt(0).toUpperCase()
    const letter = /[A-ZА-ЯЁ]/.test(first) ? first : '#'
    ;(groups[letter] ||= []).push(b)
  }
  return Object.keys(groups)
    .sort((a, z) => {
      // «#» (цифры/символы/пустое) - всегда в конце, остальное по алфавиту (ru).
      if (a === '#') return 1
      if (z === '#') return -1
      return a.localeCompare(z, 'ru')
    })
    .map((letter) => ({ letter, brands: groups[letter] }))
}
