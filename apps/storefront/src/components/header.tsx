'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BagIcon,
  CloseIcon,
  HeartIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
  cx,
  formatMoney,
} from '@outlet/ui';
import { api } from '@/lib/api';
import type { SearchSuggestionsDto } from '@outlet/types';
import { useCart, useCurrentUser, useLogout } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme';

const CATEGORY_KEYS = [
  { key: 'tShirts', slug: 't-shirts' },
  { key: 'shoes', slug: 'shoes' },
  { key: 'hoodies', slug: 'hoodies' },
  { key: 'jackets', slug: 'jackets' },
  { key: 'pants', slug: 'pants' },
  { key: 'accessories', slug: 'accessories' },
] as const;

function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Outlet Marketplace — home"
      className={cx(
        'shrink-0 text-[1.0625rem] font-extrabold uppercase tracking-[-0.02em] text-ink-950',
        className,
      )}
    >
      Outlet<span className="text-sale-500">.</span>
    </Link>
  );
}

/**
 * Header search with suggestions.
 *
 * Suggestions are debounced and only requested from two characters up, so
 * typing does not fire a request per keystroke. The listbox follows the
 * combobox pattern: arrow keys move a highlighted option, Enter opens it, and
 * Escape closes the panel without clearing what was typed.
 */
function SearchForm({
  onSubmitted,
  autoFocus,
  className,
}: {
  onSubmitted?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 180);
    return () => window.clearTimeout(id);
  }, [term]);

  const { data } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () =>
      api.get<SearchSuggestionsDto>(`/catalog/suggest?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  // One flat list so keyboard navigation crosses the group boundaries.
  const options = useMemo(() => {
    if (!data) return [];
    return [
      ...data.products.map((p) => ({
        key: `p:${p.slug}`,
        href: `/products/${p.slug}`,
        label: p.name,
      })),
      ...data.brands.map((b) => ({ key: `b:${b.slug}`, href: `/brand/${b.slug}`, label: b.name })),
      ...data.categories.map((c) => ({
        key: `c:${c.slug}`,
        href: `/category/${c.slug}`,
        label: c.name,
      })),
    ];
  }, [data]);

  const showPanel = open && debounced.length >= 2;

  // A click outside should dismiss the panel; blur alone would fire before the
  // click on a suggestion registers.
  useEffect(() => {
    if (!showPanel) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showPanel]);

  const go = (href: string) => {
    setOpen(false);
    setHighlighted(-1);
    router.push(href);
    onSubmitted?.();
  };

  const submit = () => {
    if (highlighted >= 0 && options[highlighted]) {
      go(options[highlighted].href);
      return;
    }
    go(term ? `/search?q=${encodeURIComponent(term)}` : '/products');
  };

  return (
    <div ref={containerRef} className={cx('relative', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          type="search"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && options.length > 0) {
              e.preventDefault();
              setOpen(true);
              setHighlighted((i) => (i + 1) % options.length);
            } else if (e.key === 'ArrowUp' && options.length > 0) {
              e.preventDefault();
              setHighlighted((i) => (i <= 0 ? options.length - 1 : i - 1));
            } else if (e.key === 'Escape') {
              setOpen(false);
              setHighlighted(-1);
            }
          }}
          placeholder={t('nav.searchPlaceholder')}
          aria-label={t('nav.searchPlaceholder')}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            highlighted >= 0 && options[highlighted]
              ? `suggestion-${options[highlighted].key}`
              : undefined
          }
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          className="h-10 w-full rounded bg-ink-50 pl-9 pr-3 text-sm text-ink-900 ring-1 ring-inset ring-transparent transition-shadow placeholder:text-ink-500 hover:bg-ink-100 focus:bg-ink-25 focus:ring-ink-300"
        />
      </form>

      {showPanel ? (
        <div
          id="search-suggestions"
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded border border-ink-200 bg-ink-25 py-1.5 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-500">
              No matches for “{debounced}”. Press Enter to search anyway.
            </p>
          ) : (
            <>
              {data!.products.length > 0 ? (
                <SuggestionGroup label="Products">
                  {data!.products.map((product) => {
                    const index = options.findIndex((o) => o.key === `p:${product.slug}`);
                    return (
                      <SuggestionRow
                        key={product.slug}
                        id={`suggestion-p:${product.slug}`}
                        active={highlighted === index}
                        onSelect={() => go(`/products/${product.slug}`)}
                        onHover={() => setHighlighted(index)}
                      >
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-10 w-8 shrink-0 rounded-xs object-cover"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">{product.name}</span>
                        <span data-numeric className="shrink-0 text-xs text-ink-500">
                          {formatMoney(product.currentPriceMinor, 'EUR')}
                        </span>
                      </SuggestionRow>
                    );
                  })}
                </SuggestionGroup>
              ) : null}

              {data!.brands.length > 0 ? (
                <SuggestionGroup label="Brands">
                  {data!.brands.map((brand) => {
                    const index = options.findIndex((o) => o.key === `b:${brand.slug}`);
                    return (
                      <SuggestionRow
                        key={brand.slug}
                        id={`suggestion-b:${brand.slug}`}
                        active={highlighted === index}
                        onSelect={() => go(`/brand/${brand.slug}`)}
                        onHover={() => setHighlighted(index)}
                      >
                        <span className="truncate">{brand.name}</span>
                      </SuggestionRow>
                    );
                  })}
                </SuggestionGroup>
              ) : null}

              {data!.categories.length > 0 ? (
                <SuggestionGroup label="Categories">
                  {data!.categories.map((category) => {
                    const index = options.findIndex((o) => o.key === `c:${category.slug}`);
                    return (
                      <SuggestionRow
                        key={category.slug}
                        id={`suggestion-c:${category.slug}`}
                        active={highlighted === index}
                        onSelect={() => go(`/category/${category.slug}`)}
                        onHover={() => setHighlighted(index)}
                      >
                        <span className="truncate">{category.name}</span>
                      </SuggestionRow>
                    );
                  })}
                </SuggestionGroup>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SuggestionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-[0.07em] text-ink-400">
        {label}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function SuggestionRow({
  id,
  active,
  onSelect,
  onHover,
  children,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
  children: ReactNode;
}) {
  return (
    <li id={id} role="option" aria-selected={active}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={onHover}
        className={cx(
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-900 transition-colors',
          active ? 'bg-ink-100' : 'hover:bg-ink-50',
        )}
      >
        {children}
      </button>
    </li>
  );
}

/** Icon + label action used in the desktop utility row. */
function HeaderAction({
  href,
  label,
  count,
  icon: Icon,
}: {
  href: string;
  label: string;
  count?: number;
  icon: (props: { className?: string }) => ReactElement;
}) {
  return (
    <Link
      href={href}
      className="group relative inline-flex h-9 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
    >
      <span className="relative">
        <Icon className="h-[18px] w-[18px]" />
        {count && count > 0 ? (
          <span
            data-numeric
            className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sale-500 px-1 text-[10px] font-semibold leading-none text-ink-25"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </span>
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const { data: me } = useCurrentUser();
  const { data: cart } = useCart();
  const logout = useLogout();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Route changes should never leave the drawer hanging open behind the page.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const itemCount = cart?.itemCount ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-ink-25/95 backdrop-blur supports-[backdrop-filter]:bg-ink-25/85">
      <div className="container-page">
        <div className="flex h-14 items-center gap-3 lg:h-16 lg:gap-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('nav.openMenu')}
            aria-expanded={menuOpen}
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <Wordmark />

          {/* Desktop: search takes the free space; the nav sits on its own row. */}
          <SearchForm className="ml-2 hidden min-w-0 flex-1 lg:block" />

          <div className="ml-auto flex items-center gap-0.5 lg:gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={t('nav.search')}
              aria-expanded={searchOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 lg:hidden"
            >
              {searchOpen ? <CloseIcon className="h-5 w-5" /> : <SearchIcon className="h-5 w-5" />}
            </button>

            <LocaleSwitcher />
            <ThemeToggle />
            <HeaderAction href="/wishlist" label={t('nav.wishlist')} icon={HeartIcon} />
            <HeaderAction href="/cart" label={t('nav.cart')} count={itemCount} icon={BagIcon} />

            {me?.user ? (
              <div className="hidden items-center lg:flex">
                <Link
                  href="/account"
                  className="inline-flex h-9 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
                >
                  <UserIcon className="h-[18px] w-[18px]" />
                  <span className="hidden max-w-24 truncate xl:inline">{me.user.firstName}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => logout.mutate()}
                  className="ml-1 hidden text-sm text-ink-500 transition-colors hover:text-ink-950 xl:inline"
                >
                  {t('nav.signOut')}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden h-9 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 lg:inline-flex"
              >
                <UserIcon className="h-[18px] w-[18px]" />
                <span className="hidden xl:inline">{t('nav.signIn')}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile search drops in below the bar rather than replacing it. */}
        {searchOpen ? (
          <div className="animate-slide-up pb-3 lg:hidden">
            <SearchForm autoFocus onSubmitted={() => setSearchOpen(false)} />
          </div>
        ) : null}
      </div>

      {/* Desktop category rail */}
      <nav aria-label="Categories" className="hidden border-t border-ink-100 lg:block">
        <div className="container-page">
          <ul className="-mx-2 flex items-center gap-1">
            <li>
              <Link
                href="/campaigns"
                className={cx(
                  'inline-flex h-10 items-center px-2 text-sm font-semibold text-sale-500 transition-colors hover:text-sale-600',
                )}
              >
                {t('nav.campaigns')}
              </Link>
            </li>
            <li aria-hidden="true" className="mx-1 h-4 w-px bg-ink-200" />
            <li>
              <NavLink href="/products" active={pathname === '/products'}>
                {t('nav.allProducts')}
              </NavLink>
            </li>
            {CATEGORY_KEYS.map((c) => (
              <li key={c.slug}>
                <NavLink href={`/category/${c.slug}`} active={pathname === `/category/${c.slug}`}>
                  {t(`categories.${c.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {menuOpen ? <MobileMenu onClose={() => setMenuOpen(false)} closeRef={closeRef} /> : null}
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative inline-flex h-10 items-center px-2 text-sm transition-colors',
        active ? 'text-ink-950' : 'text-ink-600 hover:text-ink-950',
      )}
    >
      {children}
      <span
        className={cx(
          'absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ink-950 transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
    </Link>
  );
}

function MobileMenu({
  onClose,
  closeRef,
}: {
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement>;
}) {
  const { data: me } = useCurrentUser();
  const logout = useLogout();
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={t('nav.closeMenu')}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-950/40"
      />
      <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] animate-slide-in-right flex-col bg-ink-25 shadow-md">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-200 px-4">
          <Wordmark />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain py-2">
          <MenuLink href="/campaigns" className="text-sale-500">
            {t('nav.campaigns')}
          </MenuLink>
          <MenuLink href="/products">{t('nav.allProducts')}</MenuLink>

          <p className="eyebrow px-4 pb-1 pt-5">{t('nav.shopByCategory')}</p>
          {CATEGORY_KEYS.map((c) => (
            <MenuLink key={c.slug} href={`/category/${c.slug}`}>
              {t(`categories.${c.key}`)}
            </MenuLink>
          ))}

          <p className="eyebrow px-4 pb-1 pt-5">{t('nav.account')}</p>
          {me?.user ? (
            <>
              <MenuLink href="/account">{t('nav.yourAccount')}</MenuLink>
              <MenuLink href="/account/orders">{t('nav.orders')}</MenuLink>
              <MenuLink href="/wishlist">{t('nav.wishlist')}</MenuLink>
              <button
                type="button"
                onClick={() => {
                  logout.mutate();
                  onClose();
                }}
                className="block w-full px-4 py-2.5 text-left text-[15px] text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-950"
              >
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <>
              <MenuLink href="/login">{t('nav.signIn')}</MenuLink>
              <MenuLink href="/register">{t('nav.createAccount')}</MenuLink>
              <MenuLink href="/wishlist">{t('nav.wishlist')}</MenuLink>
            </>
          )}
        </nav>

        <div className="border-t border-ink-200 p-4">
          <LocaleSwitcher />
        </div>
      </div>
    </div>
  );
}

function MenuLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'block px-4 py-2.5 text-[15px] text-ink-800 transition-colors hover:bg-ink-50 hover:text-ink-950',
        className,
      )}
    >
      {children}
    </Link>
  );
}
