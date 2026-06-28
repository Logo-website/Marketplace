// Блок акций главной (узел 1.2): «расфасовка по акциям» - прямо в критерии
// «Готово, когда» карты. Но механика акций/скидок (старая цена, бейдж,
// страница распродаж) - фаза Ф27, в модели Product скидок пока нет. Поэтому
// здесь честная forward-заглушка (правило карты «forward-ссылки витрины
// волны 1»): баннер виден и осмыслен, но помечен «Скоро» и никуда не ведёт -
// не «мёртвая» ссылка на несуществующий маршрут (план Ф7, решение 3.2.5).

export default function PromoBlock() {
  return (
    <section className="mb-10">
      <div className="relative overflow-hidden rounded-3xl bg-ink px-8 py-10 md:px-14 md:py-14">
        {/* Декор: мягкое акцентное кольцо вместо emoji (бренд-гайд §5 п.4) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full border border-white/5 bg-accent/10"
        />
        <div className="relative z-10 max-w-md">
          {/* Бейдж «Скоро» в стиле подвала (бренд-гайд §1: accent-soft на чернилах) */}
          <span className="inline-flex items-center rounded-full border border-accent-soft/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-soft">
            Скоро
          </span>
          <h2 className="mt-4 mb-3 font-display text-2xl md:text-3xl font-extrabold tracking-tight text-white">
            Акции и распродажи
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-white/55">
            Готовим раздел со скидками и спецпредложениями от продавцов. Следите
            за обновлениями.
          </p>
        </div>
      </div>
    </section>
  )
}
