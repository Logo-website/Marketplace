import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import HeroCarousel from '../components/home/HeroCarousel'
import CategoryTiles from '../components/home/CategoryTiles'
import ProductRow from '../components/home/ProductRow'
import RecentlyViewed from '../components/home/RecentlyViewed'
import PromoBlock from '../components/home/PromoBlock'

// Главная (узел 1.2) - витрина-афиша, НЕ каталог. Её задача не продать здесь,
// а расфасовать трафик: hero-карусель, плитки категорий, горизонтальные ленты,
// блок акций. Грид с фильтрами/сортировкой/пагинацией - это узел 1.3 (Ф2),
// живёт на /catalog (CatalogPage), сюда не входит (план Ф7, решение 3.1).
//
// Каждая лента грузится независимо своим useAsyncData: упавшая лента показывает
// свой инлайн-блок ошибки и не валит соседние/страницу (граничный случай плана).

const ROW_SIZE = 12 // карточек на ленту - не тянем всю страницу выдачи

export default function HomePage() {
  // Хиты - по рейтингу. Берём первые ROW_SIZE из выдачи.
  const hits = useAsyncData(
    (signal) =>
      api
        .get('/products/?sort=rating', { signal })
        .then((r) => (r.data?.results ?? []).slice(0, ROW_SIZE)),
    []
  )

  // Новинки - по дате.
  const fresh = useAsyncData(
    (signal) =>
      api
        .get('/products/?sort=new', { signal })
        .then((r) => (r.data?.results ?? []).slice(0, ROW_SIZE)),
    []
  )

  // «Рекомендуем» - эндпоинт без product_id отдаёт популярное всем (AllowAny).
  // Заголовок нейтральный, без обещания персональности, которой пока нет
  // (план Ф7, решение 3.3). Эндпоинт возвращает массив, не пагинацию.
  const recs = useAsyncData(
    (signal) =>
      api
        .get('/products/recommendations/', { signal })
        .then((r) => (r.data ?? []).slice(0, ROW_SIZE)),
    []
  )

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <HeroCarousel />

        <CategoryTiles />

        {/* Недавно смотрели (узел 1.12) - пустая история скрывается сама. */}
        <RecentlyViewed />

        <ProductRow
          title="Хиты продаж"
          products={hits.data ?? []}
          status={hits.status}
          onRetry={hits.retry}
          seeAllTo="/catalog?sort=rating"
        />

        <ProductRow
          title="Новинки"
          products={fresh.data ?? []}
          status={fresh.status}
          onRetry={fresh.retry}
          seeAllTo="/catalog?sort=new"
        />

        <ProductRow
          title="Рекомендуем"
          products={recs.data ?? []}
          status={recs.status}
          onRetry={recs.retry}
          seeAllTo="/catalog"
        />

        <PromoBlock />

        {/* TODO(Ф20/Ф21): слот подборок брендов. Сущности Brand нет в моделях,
            и брендов нет в критерии «Готово, когда» карты - компонент-заглушку
            не плодим (план Ф7, решение 3.2.5), только зарезервированный якорь. */}
      </div>
    </div>
  )
}
