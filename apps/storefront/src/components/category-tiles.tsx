import Link from 'next/link';
import type { CategoryDto } from '@outlet/types';

/**
 * Visual category navigation.
 *
 * People who arrive without a specific product in mind browse by category, and
 * a row of text links gives them nothing to aim at. Tiles carry the artwork so
 * the choice is made by recognition rather than by reading.
 *
 * Scrolls horizontally on phones instead of wrapping into a tall stack — a
 * six-row list of categories pushes the actual products off the first screen.
 */
export function CategoryTiles({ categories }: { categories: CategoryDto[] }) {
  if (categories.length === 0) return null;

  return (
    <ul
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4"
      data-testid="category-tiles"
    >
      {categories.map((category) => (
        <li key={category.id} className="w-40 shrink-0 snap-start sm:w-auto">
          <Link href={`/category/${category.slug}`} className="group block">
            <div className="media-well aspect-[4/3] rounded dark:rounded-lg">
              {category.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={category.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
              ) : null}
            </div>
            <p className="mt-2.5 text-sm font-medium text-ink-950 group-hover:underline group-hover:decoration-ink-300 group-hover:underline-offset-2">
              {category.name}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
