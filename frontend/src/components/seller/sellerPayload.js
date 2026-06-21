// Сборка тела запроса продавца (Ф11). Логотип - файл, поэтому при его наличии
// шлём multipart/form-data; иначе обычный JSON (логотип необязателен - частый
// путь). Один источник для онбординга (POST) и настроек (PATCH).

// Текстовые/выбираемые поля формы (без файла логотипа - он отдельно).
const TEXT_FIELDS = [
  'legal_status', 'legal_name', 'inn', 'bank_account', 'bank_bik',
  'shop_name', 'shop_description', 'tariff',
]

export function buildSellerPayload(form, logoFile) {
  if (logoFile) {
    const fd = new FormData()
    TEXT_FIELDS.forEach((k) => fd.append(k, form[k] ?? ''))
    // DRF BooleanField принимает строки 'true'/'false'.
    fd.append('offer_accepted', form.offer_accepted ? 'true' : 'false')
    fd.append('shop_logo', logoFile)
    return fd
  }
  const body = {}
  TEXT_FIELDS.forEach((k) => { body[k] = form[k] ?? '' })
  body.offer_accepted = !!form.offer_accepted
  return body
}

// Пустая форма-черновик (общая для онбординга и предзаполнения настроек).
export function emptySellerForm() {
  return {
    legal_status: 'self_employed',
    legal_name: '', inn: '', bank_account: '', bank_bik: '',
    shop_name: '', shop_description: '', shop_logo: null,
    tariff: 'free', offer_accepted: false,
  }
}
