import { describe, it, expect } from 'vitest'
import { sizeMatch } from './sizeMatch'

// Мини-таблица верха (грудь/талия) для тестов подбора.
const topChart = {
  group: 'top',
  measurements: [
    { ru: '40', chest: 80, waist: 62 },
    { ru: '44', chest: 88, waist: 70 },
    { ru: '48', chest: 96, waist: 78 },
  ],
  conversion: [
    { ru: '40', eu: '34', us: '2', intl: 'XS' },
    { ru: '44', eu: '38', us: '6', intl: 'S' },
    { ru: '48', eu: '42', us: '10', intl: 'L' },
  ],
}

const shoesChart = {
  group: 'shoes',
  measurements: [
    { ru: '36', foot_cm: 23 },
    { ru: '38', foot_cm: 24 },
    { ru: '40', foot_cm: 25 },
  ],
  conversion: [
    { ru: '36', eu: '36', us: '6' },
    { ru: '38', eu: '38', us: '7.5' },
    { ru: '40', eu: '40', us: '9' },
  ],
}

describe('sizeMatch', () => {
  it('точное попадание по мерке -> ровно этот размер, без пометки', () => {
    const r = sizeMatch({ chest: 88 }, topChart)
    expect(r.ru).toBe('44')
    expect(r.nearest).toBe(false)
    expect(r.conversion.intl).toBe('S')
  })

  it('между размерами округляет вверх (свободнее лучше)', () => {
    const r = sizeMatch({ chest: 90 }, topChart) // 88 < 90 < 96
    expect(r.ru).toBe('48')
    expect(r.nearest).toBe(false)
  })

  it('больше максимума -> наибольший размер с пометкой nearest', () => {
    const r = sizeMatch({ chest: 130 }, topChart)
    expect(r.ru).toBe('48')
    expect(r.nearest).toBe(true)
  })

  it('меньше минимума -> наименьший размер с пометкой nearest', () => {
    const r = sizeMatch({ chest: 50 }, topChart)
    expect(r.ru).toBe('40')
    expect(r.nearest).toBe(true)
  })

  it('несколько мерок -> берёт больший размер и указывает ось', () => {
    // грудь -> 40, талия -> 48; консервативно выбираем 48 по талии
    const r = sizeMatch({ chest: 80, waist: 78 }, topChart)
    expect(r.ru).toBe('48')
    expect(r.axis).toBe('waist')
  })

  it('пустой/нечисловой/отрицательный/нулевой ввод -> null, без NaN', () => {
    expect(sizeMatch({}, topChart)).toBeNull()
    expect(sizeMatch({ chest: '' }, topChart)).toBeNull()
    expect(sizeMatch({ chest: 'abc' }, topChart)).toBeNull()
    expect(sizeMatch({ chest: -10 }, topChart)).toBeNull()
    expect(sizeMatch({ chest: 0 }, topChart)).toBeNull()
  })

  it('игнорирует ось, которой нет в таблице группы', () => {
    // у верха нет foot_cm - такая мерка не даёт результата
    expect(sizeMatch({ foot_cm: 25 }, topChart)).toBeNull()
  })

  it('обувь подбирается по длине стопы', () => {
    const r = sizeMatch({ foot_cm: 24 }, shoesChart)
    expect(r.ru).toBe('38')
    expect(r.conversion.us).toBe('7.5')
  })

  it('пустая/некорректная таблица -> null', () => {
    expect(sizeMatch({ chest: 88 }, null)).toBeNull()
    expect(sizeMatch({ chest: 88 }, { group: 'top', measurements: [] })).toBeNull()
  })
})
