import { describe, it, expect } from 'vitest'
import { groupBrandsByLetter } from './brandGroups'

describe('groupBrandsByLetter', () => {
  it('пустой список -> пустой результат', () => {
    expect(groupBrandsByLetter([])).toEqual([])
    expect(groupBrandsByLetter()).toEqual([])
  })

  it('группирует по первой букве и сортирует буквы по русской локали', () => {
    const res = groupBrandsByLetter([
      { id: 1, name: 'Берёза' },
      { id: 2, name: 'арбуз' },
      { id: 3, name: 'Apple' },
    ])
    // Русская локаль ставит латиницу после кириллицы (А, Б, ..., затем A).
    expect(res.map((g) => g.letter)).toEqual(['А', 'Б', 'A'])
  })

  it('регистр не важен: «арбуз» и «Арбат» в одной группе А', () => {
    const res = groupBrandsByLetter([
      { id: 1, name: 'арбуз' },
      { id: 2, name: 'Арбат' },
    ])
    expect(res).toHaveLength(1)
    expect(res[0].letter).toBe('А')
    expect(res[0].brands).toHaveLength(2)
  })

  it('цифры и символы попадают в группу «#» и она в конце', () => {
    const res = groupBrandsByLetter([
      { id: 1, name: '7 небо' },
      { id: 2, name: 'Зебра' },
      { id: 3, name: '#хэштег' },
    ])
    expect(res.map((g) => g.letter)).toEqual(['З', '#'])
    expect(res[1].brands).toHaveLength(2)
  })

  it('пустое имя не роняет группировку - уходит в «#»', () => {
    const res = groupBrandsByLetter([{ id: 1, name: '' }, { id: 2 }])
    expect(res).toEqual([{ letter: '#', brands: [{ id: 1, name: '' }, { id: 2 }] }])
  })

  it('сохраняет исходный порядок внутри группы', () => {
    const res = groupBrandsByLetter([
      { id: 1, name: 'Аист' },
      { id: 2, name: 'Авто' },
    ])
    expect(res[0].brands.map((b) => b.id)).toEqual([1, 2])
  })
})
