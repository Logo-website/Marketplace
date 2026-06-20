// Блок акций главной (узел 1.2): «расфасовка по акциям» - прямо в критерии
// «Готово, когда» карты. Но механика акций/скидок (старая цена, бейдж,
// страница распродаж) - фаза Ф27, в модели Product скидок пока нет. Поэтому
// здесь честная forward-заглушка (правило карты «forward-ссылки витрины
// волны 1»): баннер виден и осмыслен, но помечен «Скоро» и никуда не ведёт -
// не «мёртвая» ссылка на несуществующий маршрут (план Ф7, решение 3.2.5).

export default function PromoBlock() {
  return (
    <section className="mb-10">
      <div className="bg-gradient-to-r from-[#7c2d12] via-[#9a3412] to-[#b91c1c] rounded-2xl p-8 md:p-10 relative overflow-hidden">
        <div className="relative z-10">
          <span className="inline-block text-xs font-bold text-white/80 uppercase tracking-widest mb-2">
            Скоро
          </span>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
            Акции и распродажи
          </h2>
          <p className="text-white/80 text-sm max-w-md">
            Готовим раздел со скидками и спецпредложениями от продавцов. Следите
            за обновлениями.
          </p>
        </div>
        <div className="absolute -right-4 -bottom-6 text-9xl opacity-15 select-none">
          🏷️
        </div>
      </div>
    </section>
  )
}
