import { Link } from 'react-router-dom'

// Хлебные крошки «Главная / Родитель / Категория». Презентационный компонент:
// принимает готовую цепочку, сам путь строит CatalogPage из дерева категорий
// (эндпоинта «предки категории» в API нет - см. план Ф2, решение 6).
//
// trail - массив [{id, name}, ...] от корня к текущей категории. Последний
// элемент - текущая (рендерится без ссылки). «Главная» всегда первая ссылка.
// Пустой trail (категория не выбрана) -> только «Главная».
//
// Длинную цепочку сворачиваем в середине («Главная / … / Родитель / Категория»),
// чтобы крошки не вылезали на мобильном.
const MAX_VISIBLE = 4 // Главная + до 3 уровней; глубже - сворачиваем середину

export default function Breadcrumbs({ trail = [] }) {
  const nodes = [
    { key: 'home', name: 'Главная', to: '/' },
    ...trail.map((c) => ({ key: c.id, name: c.name, to: `/catalog/${c.id}` })),
  ]

  let display = nodes
  if (nodes.length > MAX_VISIBLE) {
    // Первый (Главная), многоточие, последние два уровня.
    display = [nodes[0], { key: 'ellipsis', name: '…' }, ...nodes.slice(-2)]
  }

  return (
    <nav aria-label="Хлебные крошки" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        {display.map((node, i) => {
          const isLast = i === display.length - 1
          const isEllipsis = node.key === 'ellipsis'
          return (
            <li key={node.key} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-gray-300">/</span>}
              {isEllipsis ? (
                <span className="text-gray-400">…</span>
              ) : isLast ? (
                <span className="font-semibold text-gray-900 truncate max-w-[12rem]">
                  {node.name}
                </span>
              ) : (
                <Link to={node.to} className="hover:text-[#111] transition truncate max-w-[10rem]">
                  {node.name}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
