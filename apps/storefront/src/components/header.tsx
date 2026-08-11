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
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BagIcon,
  ChevronDown,
  ChevronRight,
  CloseIcon,
  HeartIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
  cx,
} from '@outlet/ui';
import { api } from '@/lib/api';
import type { CategoryDto, SearchSuggestionsDto } from '@outlet/types';
import { useCart, useCurrentUser, useLogout } from '@/lib/hooks';
import { useCategoryLabel, useCategoryTree } from '@/lib/categories';
import { useI18n } from '@/lib/i18n';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme';
import { CartDrawer } from './cart-drawer';
import { T } from '@/components/t';

/** Shown in every category panel — real destinations, not invented ones. */
const QUICK_LINKS = [
  { label: 'New arrivals', href: '/products?sort=newest' },
  { label: 'Biggest discounts', href: '/products?sort=discount' },
  { label: 'Best rated', href: '/products?sort=rating' },
  { label: 'In stock only', href: '/products?inStock=true' },
];

function Wordmark({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Link
      href="/"
      aria-label={t('ui.outletMarketplaceHome')}
      className={cx(
        'shrink-0 text-[1.0625rem] font-extrabold uppercase tracking-[-0.02em] text-ink-950',
        // A heavy uppercase wordmark gains apparent weight light-on-dark, so
        // dark drops a step and opens the tracking to hold the same silhouette.
        'dark:font-bold dark:tracking-[-0.005em]',
        className,
      )}
    >
      Outlet<span className="text-sale-500">.</span>
    </Link>
  );
}

/**
 * True once the page has left the very top.
 *
 * The header sits directly on the page in dark mode — no border, no fill — so
 * that the masthead reads as one uninterrupted surface at rest. That only works
 * while there is nothing underneath it: as soon as content scrolls beneath, the
 * bar has to earn its own plane, or product images slide under a transparent
 * strip and the navigation becomes unreadable.
 */
function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
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
  const { t, money } = useI18n();
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
          className={cx(
            'h-10 w-full rounded pl-9 pr-3 text-sm text-ink-900 transition-[background-color,box-shadow] duration-150',
            'bg-ink-50 ring-1 ring-inset ring-transparent placeholder:text-ink-500',
            'hover:bg-ink-100 focus:bg-ink-25 focus:ring-ink-300',
            // Dark needs the field to read as a *well* — recessed below the
            // bar — and then to rise to a raised surface on focus. Inheriting
            // light's near-invisible fill left a search box you had to hunt for.
            'dark:bg-surface-card dark:ring-line dark:placeholder:text-content-muted',
            'dark:hover:bg-surface-hover dark:hover:ring-line-strong',
            'dark:focus:bg-surface-raised dark:focus:ring-2 dark:focus:ring-ink-700',
          )}
        />
      </form>

      {showPanel ? (
        <div
          id="search-suggestions"
          role="listbox"
          aria-label={t('ui.searchSuggestions')}
          className="surface-overlay absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[70vh] animate-slide-up overflow-y-auto py-1.5"
        >
          {options.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-500">
              No matches for “{debounced}”. Press Enter to search anyway.
            </p>
          ) : (
            <>
              {data!.products.length > 0 ? (
                <SuggestionGroup label={t('ui.products')}>
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
                          {money(product.currentPriceMinor)}
                        </span>
                      </SuggestionRow>
                    );
                  })}
                </SuggestionGroup>
              ) : null}

              {data!.brands.length > 0 ? (
                <SuggestionGroup label={t('ui.brands')}>
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
                <SuggestionGroup label={t('ui.categories')}>
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
          'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-900 transition-colors duration-150',
          // The highlighted option has to be unmistakable on an already-raised
          // surface, so it steps up again rather than tinting.
          active ? 'bg-surface-active' : 'hover:bg-surface-hover',
        )}
      >
        {children}
      </button>
    </li>
  );
}

/** Icon + label action used in the utility row. */
function HeaderAction({
  href,
  onClick,
  label,
  count,
  icon: Icon,
  showLabelFrom = 'xl',
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  count?: number;
  icon: (props: { className?: string }) => ReactElement;
  showLabelFrom?: 'xl' | 'never';
}) {
  const content = (
    <>
      <span className="relative">
        <Icon className="h-[18px] w-[18px]" />
        {count && count > 0 ? (
          <span
            data-numeric
            // `key` on the count restarts the pop animation each time the
            // number changes, which is the cart acknowledging an add.
            key={count}
            className="absolute -right-2 -top-1.5 flex h-4 min-w-4 animate-count-pop items-center justify-center rounded-full bg-sale-500 px-1 text-[10px] font-semibold leading-none text-ink-25 dark:bg-sale-500 dark:text-content-inverse"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </span>
      {showLabelFrom === 'xl' ? <span className="hidden xl:inline">{label}</span> : null}
    </>
  );

  // Icons rest a step below primary text in dark: at full brightness a row of
  // five glyphs competes with the wordmark and reads as a toolbar.
  const className = cx(
    'group relative inline-flex h-10 items-center gap-2 rounded px-2 text-sm transition-colors duration-150',
    'text-ink-700 hover:bg-ink-50 dark:hover:bg-surface-hover hover:text-ink-950',
    'dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950',
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={className}>
        {content}
      </button>
    );
  }
  return (
    <Link href={href!} aria-label={label} className={className}>
      {content}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const { data: me } = useCurrentUser();
  const { data: cart } = useCart();
  const logout = useLogout();
  const { t } = useI18n();
  const label = useCategoryLabel();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number>();

  // Route changes should never leave a drawer or panel hanging open.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setCartOpen(false);
    setOpenPanel(null);
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

  // Escape closes an open category panel and returns focus to its trigger.
  useEffect(() => {
    if (!openPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPanel(null);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenPanel(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [openPanel]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  /** A short grace period so crossing the gap to the panel does not close it. */
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenPanel(null), 120);
  };
  const cancelClose = () => window.clearTimeout(closeTimer.current);

  const itemCount = cart?.itemCount ?? 0;
  const scrolled = useScrolled();

  // Navigation is whatever the shop currently has to sell. A department with
  // no available products — or one an administrator has hidden — is not in this
  // list at all, so it cannot be rendered by accident.
  const { data: tree } = useCategoryTree();
  const departments = tree ?? [];
  const openDepartment = departments.find((department) => department.slug === openPanel);

  return (
    <header
      className={cx(
        'sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200',
        'border-line bg-ink-25/95 backdrop-blur supports-[backdrop-filter]:bg-ink-25/85',
        // At rest the bar *is* the page: no fill, no line, so the masthead
        // reads as one surface. Once content passes beneath it, it lifts onto
        // its own plane — a step up in surface, a hairline, and a cast to
        // separate it from whatever is sliding under.
        //
        // The two states are branches rather than a base plus an override:
        // `dark:bg-surface` and `dark:bg-surface-sunken` are the same kind of
        // utility, so which one wins is decided by their order in the
        // stylesheet, not by their order in this list. Emitting exactly one
        // removes the question.
        scrolled
          ? 'dark:border-line dark:bg-surface-sunken dark:shadow-md dark:backdrop-blur-header dark:supports-[backdrop-filter]:bg-surface-sunken/85'
          : 'dark:border-transparent dark:bg-surface dark:supports-[backdrop-filter]:bg-surface/80',
      )}
    >
      <div className="container-page">
        <div className="flex h-14 items-center gap-3 lg:h-16 lg:gap-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('nav.openMenu')}
            aria-expanded={menuOpen}
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950 lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <Wordmark />

          {/* From tablet up the search field is inline; only phones collapse it
              behind an icon, where there genuinely is not room for both. */}
          <SearchForm className="ml-1 hidden min-w-0 flex-1 md:block lg:ml-2" />

          <div className="ml-auto flex items-center gap-0.5 lg:gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={t('nav.search')}
              aria-expanded={searchOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950 md:hidden"
            >
              {searchOpen ? <CloseIcon className="h-5 w-5" /> : <SearchIcon className="h-5 w-5" />}
            </button>

            <div className="hidden items-center gap-0.5 sm:flex">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>

            <HeaderAction href="/wishlist" label={t('nav.wishlist')} icon={HeartIcon} />
            <HeaderAction
              onClick={() => setCartOpen(true)}
              label={t('nav.cart')}
              count={itemCount}
              icon={BagIcon}
            />

            {me?.user ? (
              <div className="hidden items-center lg:flex">
                <Link
                  href="/account"
                  className="inline-flex h-10 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950"
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
                aria-label={t('nav.signIn')}
                className="hidden h-10 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950 lg:inline-flex"
              >
                <UserIcon className="h-[18px] w-[18px]" />
                <span className="hidden xl:inline">{t('nav.signIn')}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Phone search drops in below the bar rather than replacing it. */}
        {searchOpen ? (
          <div className="animate-slide-up pb-3 md:hidden">
            <SearchForm autoFocus onSubmitted={() => setSearchOpen(false)} />
          </div>
        ) : null}
      </div>

      {/* Category rail. On tablet it scrolls horizontally instead of being
          hidden behind the hamburger, so browsing stays one tap away. */}
      <nav
        ref={navRef}
        aria-label={t('ui.categories')}
        className="relative hidden border-t border-ink-100 dark:border-line md:block"
        onMouseLeave={scheduleClose}
      >
        <div className="container-page">
          <ul className="scrollbar-none -mx-2 flex items-center gap-1 overflow-x-auto lg:overflow-visible">
            <li className="shrink-0">
              <Link
                href="/campaigns"
                className="inline-flex h-10 items-center px-2 text-sm font-semibold text-sale-500 transition-colors hover:text-sale-600"
              >
                {t('nav.campaigns')}
              </Link>
            </li>
            <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-ink-200 dark:bg-ink-300" />
            {/* Department before garment type: "who is it for" is the first
                question a fashion shopper answers, and it narrows the catalogue
                far more than a category does. The list is whatever the shop
                currently has to sell — a department with nothing available in
                it is not here at all. */}
            {departments.map((department) => (
              <li
                key={department.id}
                className="shrink-0"
                onMouseEnter={() => {
                  cancelClose();
                  setOpenPanel(department.slug);
                }}
              >
                <NavLink
                  href={department.href}
                  active={pathname === department.href}
                  expanded={
                    department.children.length > 0 ? openPanel === department.slug : undefined
                  }
                  onFocus={() => setOpenPanel(department.slug)}
                >
                  {label(department)}
                </NavLink>
              </li>
            ))}
            <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-ink-200 dark:bg-ink-300" />
            <li className="shrink-0">
              <NavLink href="/products" active={pathname === '/products'}>
                {t('nav.allProducts')}
              </NavLink>
            </li>
          </ul>
        </div>

        {/* One panel, positioned under the whole rail rather than under each
            item: a full-width sheet is far easier to aim at than a dropdown
            that moves as you slide along the row. */}
        {openDepartment && openDepartment.children.length > 0 ? (
          <div
            // Full-bleed sheet, so it takes `surface-raised` flat rather than
            // the rounded overlay treatment used by panels that float free.
            className="absolute inset-x-0 top-full z-40 hidden animate-slide-up border-b border-line bg-ink-25 shadow-lg dark:border-line dark:bg-surface-raised dark:shadow-lg lg:block"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <DepartmentPanel department={openDepartment} onNavigate={() => setOpenPanel(null)} />
          </div>
        ) : null}
      </nav>

      {menuOpen ? <MobileMenu onClose={() => setMenuOpen(false)} closeRef={closeRef} /> : null}
      {cartOpen ? <CartDrawer onClose={() => setCartOpen(false)} /> : null}
    </header>
  );
}

/**
 * The mega menu for one department.
 *
 * Two levels at once — categories as headings, subcategories beneath them —
 * because on a fashion site the shopper's next click is almost always a garment
 * type, and making them stop at "Clothing" first adds a page load to every
 * journey. Nothing here is declared in this file: the columns are whatever the
 * department currently contains, so a subcategory that sells out drops off the
 * menu and a new one appears on it without a deploy.
 */
function DepartmentPanel({
  department,
  onNavigate,
}: {
  department: CategoryDto;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const label = useCategoryLabel();

  return (
    <div className="container-page flex gap-10 py-7">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-baseline gap-3">
          <p className="eyebrow">{label(department)}</p>
          <Link
            href={department.href}
            onClick={onNavigate}
            className="text-xs text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-950"
          >
            {t('nav.allProducts')}
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-x-8 gap-y-6">
          {department.children.map((category) => (
            <div key={category.id}>
              <Link
                href={category.href}
                onClick={onNavigate}
                className="text-sm font-semibold text-ink-950 transition-colors hover:text-accent"
              >
                {label(category)}
              </Link>
              {category.children.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {category.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        className="text-ink-700 transition-colors hover:text-ink-950 dark:text-content-secondary dark:hover:text-ink-950"
                      >
                        {label(child)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="w-60 shrink-0 space-y-6">
        <div>
          <p className="eyebrow mb-3">
            <T id="ui.findFast" />
          </p>
          <ul className="space-y-2 text-sm">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={`${link.href}&targetGroup=${department.targetGroup}`}
                  onClick={onNavigate}
                  className="text-ink-800 transition-colors hover:text-ink-950 dark:text-content-secondary dark:hover:text-ink-950"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/campaigns"
          onClick={onNavigate}
          className="group flex flex-col justify-between rounded bg-accent p-5 text-accent-contrast dark:rounded-lg"
        >
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-accent-contrast/60">
              <T id="ui.liveCampaigns" />
            </p>
            <p className="mt-2 text-base font-bold leading-tight">
              <T id="ui.shortWindowsLimitedStock" />
            </p>
          </div>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
            <T id="ui.seeWhatS" />
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}

function NavLink({
  href,
  active,
  expanded,
  onFocus,
  children,
}: {
  href: string;
  active: boolean;
  expanded?: boolean;
  onFocus?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onFocus={onFocus}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded === undefined ? undefined : expanded}
      className={cx(
        'relative inline-flex h-10 items-center whitespace-nowrap px-2 text-sm transition-colors',
        active || expanded ? 'text-ink-950' : 'text-ink-600 hover:text-ink-950',
      )}
    >
      {children}
      <span
        className={cx(
          'absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ink-950 transition-opacity',
          active || expanded ? 'opacity-100' : 'opacity-0',
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
  const label = useCategoryLabel();
  const { data: tree } = useCategoryTree();
  const departments = tree ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);

  /*
   * Portalled to <body> rather than rendered in place. The header carries
   * `backdrop-blur`, and an element with a backdrop-filter becomes the
   * containing block for its fixed-position descendants — so `fixed inset-0`
   * resolved against the 56px-tall header instead of the viewport, collapsing
   * the drawer to a title bar sitting on top of a scrim that covered only the
   * header. Outside it, `fixed` means the viewport again.
   */
  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={t('nav.closeMenu')}
        onClick={onClose}
        // Fixed black rather than `ink-950/40`, which inverted to a *white*
        // wash over the page in dark mode.
        className="absolute inset-0 animate-fade-in bg-scrim-950/50 dark:bg-scrim-950/70"
      />
      {/* A left-edge drawer must enter from the left: `slide-in-left` starts at
          translateX(-100%). */}
      <div className="absolute inset-y-0 left-0 flex w-[min(21rem,88vw)] animate-slide-in-left flex-col bg-ink-25 shadow-md dark:border-r dark:border-line dark:bg-surface-raised dark:shadow-lg">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 dark:border-line">
          <Wordmark />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain py-2">
          <MenuLink href="/campaigns" className="font-semibold text-sale-500">
            {t('nav.campaigns')}
          </MenuLink>
          <MenuLink href="/products">{t('nav.allProducts')}</MenuLink>

          <p className="eyebrow px-4 pb-1 pt-5">{t('nav.shopFor')}</p>
          {/* The same tree the desktop rail reads, one accordion per department.
              A department with nothing available is absent from `tree` and so
              cannot appear here either — the two menus cannot disagree about
              what the shop sells. */}
          {departments.map((department) => (
            <div key={department.id}>
              <button
                type="button"
                onClick={() =>
                  setExpanded((current) => (current === department.slug ? null : department.slug))
                }
                aria-expanded={expanded === department.slug}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] text-ink-800 transition-colors hover:bg-ink-50 hover:text-ink-950 dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950"
              >
                {label(department)}
                <ChevronDown
                  className={cx(
                    'h-4 w-4 text-ink-400 transition-transform duration-200',
                    expanded === department.slug && 'rotate-180',
                  )}
                />
              </button>
              {expanded === department.slug ? (
                // A recess, not a raise: the sub-list belongs *inside* the row
                // above it.
                <div className="animate-slide-up bg-ink-50/60 py-1 dark:bg-surface-sunken/70">
                  <MenuLink href={department.href} className="pl-8 text-sm font-medium">
                    {t('nav.allProducts')}
                  </MenuLink>
                  {department.children.map((category) => (
                    <div key={category.id}>
                      <MenuLink href={category.href} className="pl-8 text-sm font-medium">
                        {label(category)}
                      </MenuLink>
                      {category.children.map((child) => (
                        <MenuLink key={child.id} href={child.href} className="pl-12 text-sm">
                          {label(child)}
                        </MenuLink>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
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
                className="block w-full px-4 py-2.5 text-left text-[15px] text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-950 dark:hover:bg-surface-hover"
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

        <div className="flex items-center justify-between border-t border-line p-4 dark:border-line">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </div>,
    document.body,
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
        'block px-4 py-2.5 text-[15px] text-ink-800 transition-colors hover:bg-ink-50 dark:hover:bg-surface-hover hover:text-ink-950',
        'dark:text-content-secondary dark:hover:bg-surface-hover dark:hover:text-ink-950',
        className,
      )}
    >
      {children}
    </Link>
  );
}
