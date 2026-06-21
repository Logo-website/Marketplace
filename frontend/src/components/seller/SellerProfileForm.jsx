// Единая форма данных продавца (Ф11): один компонент для онбординга (/sell) и
// настроек магазина (/seller/settings), чтобы разметка полей не дублировалась.
// Презентационный: состояние и сабмит держит страница, форма только рисует поля
// и зовёт setField/onSubmit. Источник истины валидации - сервер; здесь - лишь
// required-зеркало и показ серверных ошибок по полям.

const LEGAL_OPTIONS = [
  { value: 'self_employed', label: 'Самозанятый' },
  { value: 'ip', label: 'ИП' },
  { value: 'ooo', label: 'ООО' },
]

const TARIFF_OPTIONS = [
  { value: 'free', label: 'Базовый', desc: 'Бесплатно, оплата только комиссии с продаж.' },
  { value: 'advanced', label: 'Расширенный', desc: 'Расширенная аналитика и продвижение.' },
]

const inputCls =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none ' +
  'focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white'

// Подсказка длины ИНН зависит от статуса (сервер требует 12 для физлица, 10 для ООО).
const innHint = (status) =>
  status === 'ooo' ? '10 цифр (ООО)' : '12 цифр (самозанятый / ИП)'

function FieldError({ error }) {
  if (!error) return null
  const msg = Array.isArray(error) ? error[0] : error
  return <p className="text-xs text-red-500 mt-1">{msg}</p>
}

export default function SellerProfileForm({
  form, setField, errors = {}, onSubmit, submitting,
  logoFile, setLogoFile, mode = 'onboarding',
}) {
  const submitLabel = mode === 'onboarding'
    ? (submitting ? 'Отправка...' : 'Стать продавцом')
    : (submitting ? 'Сохранение...' : 'Сохранить настройки')

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">

      {/* Юр-статус */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-4">Юридический статус</h3>

        <div className="flex flex-wrap gap-2 mb-4">
          {LEGAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setField('legal_status', opt.value)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
                form.legal_status === opt.value
                  ? 'bg-[#111] text-white border-[#111]'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <FieldError error={errors.legal_status} />

        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {form.legal_status === 'ooo' ? 'Наименование' : 'ФИО'}
            </label>
            <input
              value={form.legal_name}
              onChange={(e) => setField('legal_name', e.target.value)}
              placeholder={form.legal_status === 'ooo' ? 'ООО «Ромашка»' : 'Иванов Иван Иванович'}
              className={inputCls}
            />
            <FieldError error={errors.legal_name} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              ИНН
            </label>
            <input
              value={form.inn}
              onChange={(e) => setField('inn', e.target.value)}
              placeholder={innHint(form.legal_status)}
              inputMode="numeric"
              className={inputCls}
            />
            <FieldError error={errors.inn} />
          </div>
        </div>
      </section>

      {/* Реквизиты выплат */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-1">Реквизиты для выплат</h3>
        <p className="text-xs text-gray-400 mb-4">Куда перечислять деньги за продажи.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Расчётный счёт
            </label>
            <input
              value={form.bank_account}
              onChange={(e) => setField('bank_account', e.target.value)}
              placeholder="40802810000000000000"
              inputMode="numeric"
              className={inputCls}
            />
            <FieldError error={errors.bank_account} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              БИК банка
            </label>
            <input
              value={form.bank_bik}
              onChange={(e) => setField('bank_bik', e.target.value)}
              placeholder="044525225"
              inputMode="numeric"
              className={inputCls}
            />
            <FieldError error={errors.bank_bik} />
          </div>
        </div>
      </section>

      {/* Витрина */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-4">Витрина магазина</h3>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Название витрины
          </label>
          <input
            value={form.shop_name}
            onChange={(e) => setField('shop_name', e.target.value)}
            placeholder="Например, Atelier Nord"
            className={inputCls}
          />
          <FieldError error={errors.shop_name} />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Описание
          </label>
          <textarea
            value={form.shop_description}
            onChange={(e) => setField('shop_description', e.target.value)}
            placeholder="Коротко о вашем бренде и товарах"
            rows={3}
            className={`${inputCls} resize-none`}
          />
          <FieldError error={errors.shop_description} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Логотип (необязательно)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />
          {logoFile && <p className="text-xs text-gray-400 mt-1">Выбран: {logoFile.name}</p>}
          {form.shop_logo && !logoFile && (
            <p className="text-xs text-gray-400 mt-1">Текущий логотип загружен.</p>
          )}
          <FieldError error={errors.shop_logo} />
        </div>
      </section>

      {/* Тариф */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-4">Тариф</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {TARIFF_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setField('tariff', opt.value)}
              className={`text-left p-4 rounded-xl border transition ${
                form.tariff === opt.value
                  ? 'bg-indigo-50 border-indigo-300'
                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-bold text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
            </button>
          ))}
        </div>
        <FieldError error={errors.tariff} />
      </section>

      {/* Оферта (forward-заглушка до Ф26) + сабмит */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={!!form.offer_accepted}
            onChange={(e) => setField('offer_accepted', e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-600"
          />
          <span className="text-sm text-gray-600">
            Я принимаю условия{' '}
            {/* Текст оферты появится в Ф26 - пока заглушка, не битая ссылка. */}
            <span
              className="text-indigo-600 font-medium cursor-not-allowed"
              title="Текст оферты появится позже (Ф26)"
            >
              договора-оферты
            </span>
          </span>
        </label>
        <FieldError error={errors.offer_accepted} />

        {errors.detail && (
          <p className="text-sm text-red-500 mb-3">
            {Array.isArray(errors.detail) ? errors.detail[0] : errors.detail}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#111] text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </section>
    </form>
  )
}
