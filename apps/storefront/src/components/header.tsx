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
  formatMoney,
} from '@outlet/ui';
import { api } from '@/lib/api';
import type { SearchSuggestionsDto } from '@outlet/types';
import { useCart, useCurrentUser, useLogout } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme';
import { CartDrawer } from './cart-drawer';

/**
 * The shop's information architecture, declared once.
 *
 * Sub-categories are what turn the desktop rail into a browsable menu rather
 * than a list of seven links, and they drive the mobile drawer's accordion from
 * the same source — so the two can never disagree about what the shop sells.
 */
const NAV: Array<{
  key: string;
  slug: string;
  children?: Array<{ name: string; slug: string }>;
}> = [
  { key: 'tShirts', slug: 't-shirts' },
  {
    key: 'shoes',
    slug: 'shoes',
    children: [
      { name: 'Running shoes', slug: 'running-shoes' },
      { name: 'Sneakers', slug: 'sneakers' },
      { name: 'Boots', slug: 'boots' },
    ],
  },
  { key: 'hoodies', slug: 'hoodies' },
  { key: 'jackets', slug: 'jackets' },
  { key: 'pants', slug: 'pants' },
  {
    key: 'bags',
    slug: 'bags',
    children: [
      { name: 'Backpacks', slug: 'backpacks' },
      { name: 'Shoulder bags', slug: 'shoulder-bags' },
    ],
  },
  { key: 'accessories', slug: 'accessories' },
];

/** Shown in every category panel — real destinations, not invented ones. */
const QUICK_LINKS = [
  { label: 'New arrivals', href: '/products?sort=newest' },
  { label: 'Biggest discounts', href: '/products?sort=discount' },
  { label: 'Best rated', href: '/products?sort=rating' },
  { label: 'In stock only', href: '/products?inStock=true' },
];

const FEATURED_BRANDS = [
  { name: 'Nike', slug: 'nike' },
  { name: 'Adidas', slug: 'adidas' },
  { name: 'Puma', slug: 'puma' },
  { name: 'New Balance', slug: 'new-balance' },
  { name: 'The North Face', slug: 'the-north-face' },
  { name: 'Calvin Klein', slug: 'calvin-klein' },
];

function categoryLabel(key: string, t: (k: string) => string): string {
  const translated = t(`categories.${key}`);
  // Keys added after the locale files were written fall back to a readable name
  // rather than rendering the raw dotted path.
  if (translated === `categories.${key}`) {
    return key === 'bags' ? 'Bags' : key;
  }
  return translated;
}

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
            className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sale-500 px-1 text-[10px] font-semibold leading-none text-ink-25"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </span>
      {showLabelFrom === 'xl' ? <span className="hidden xl:inline">{label}</span> : null}
    </>
  );

  const className =
    'group relative inline-flex h-10 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950';

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

          {/* From tablet up the search field is inline; only phones collapse it
              behind an icon, where there genuinely is not room for both. */}
          <SearchForm className="ml-1 hidden min-w-0 flex-1 md:block lg:ml-2" />

          <div className="ml-auto flex items-center gap-0.5 lg:gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={t('nav.search')}
              aria-expanded={searchOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 md:hidden"
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
                  className="inline-flex h-10 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
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
                className="hidden h-10 items-center gap-2 rounded px-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950 lg:inline-flex"
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
        aria-label="Categories"
        className="relative hidden border-t border-ink-100 md:block"
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
            <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-ink-200" />
            <li className="shrink-0">
              <NavLink href="/products" active={pathname === '/products'}>
                {t('nav.allProducts')}
              </NavLink>
            </li>
            {NAV.map((entry) => (
              <li
                key={entry.slug}
                className="shrink-0"
                onMouseEnter={() => {
                  cancelClose();
                  setOpenPanel(entry.slug);
                }}
              >
                <NavLink
                  href={`/category/${entry.slug}`}
                  active={pathname === `/category/${entry.slug}`}
                  expanded={openPanel === entry.slug}
                  onFocus={() => setOpenPanel(entry.slug)}
                >
                  {categoryLabel(entry.key, t)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* One panel, positioned under the whole rail rather than under each
            item: a full-width sheet is far easier to aim at than a dropdown
            that moves as you slide along the row. */}
        {openPanel ? (
          <div
            className="absolute inset-x-0 top-full z-40 hidden animate-slide-up border-b border-ink-200 bg-ink-25 shadow-lg lg:block"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <CategoryPanel
              entry={NAV.find((n) => n.slug === openPanel)!}
              label={categoryLabel(NAV.find((n) => n.slug === openPanel)!.key, t)}
              onNavigate={() => setOpenPanel(null)}
            />
          </div>
        ) : null}
      </nav>

      {menuOpen ? <MobileMenu onClose={() => setMenuOpen(false)} closeRef={closeRef} /> : null}
      {cartOpen ? <CartDrawer onClose={() => setCartOpen(false)} /> : null}
    </header>
  );
}

function CategoryPanel({
  entry,
  label,
  onNavigate,
}: {
  entry: (typeof NAV)[number];
  label: string;
  onNavigate: () => void;
}) {
  return (
    <div className="container-page grid grid-cols-4 gap-8 py-7">
      <div>
        <p className="eyebrow mb-3">Shop {label}</p>
        <ul className="space-y-2 text-sm">
          <li>
            <Link
              href={`/category/${entry.slug}`}
              onClick={onNavigate}
              className="text-ink-800 transition-colors hover:text-ink-950"
            >
              All {label.toLowerCase()}
            </Link>
          </li>
          {entry.children?.map((child) => (
            <li key={child.slug}>
              <Link
                href={`/category/${child.slug}`}
                onClick={onNavigate}
                className="text-ink-800 transition-colors hover:text-ink-950"
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="eyebrow mb-3">Find fast</p>
        <ul className="space-y-2 text-sm">
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={`${link.href}&category=${entry.slug}`}
                onClick={onNavigate}
                className="text-ink-800 transition-colors hover:text-ink-950"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="eyebrow mb-3">Brands</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {FEATURED_BRANDS.map((brand) => (
            <li key={brand.slug}>
              <Link
                href={`/brand/${brand.slug}`}
                onClick={onNavigate}
                className="text-ink-800 transition-colors hover:text-ink-950"
              >
                {brand.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/campaigns"
        onClick={onNavigate}
        className="group flex flex-col justify-between rounded bg-ink-950 p-5 text-ink-25"
      >
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-25/60">
            Live campaigns
          </p>
          <p className="mt-2 text-lg font-bold leading-tight">Short windows, limited stock.</p>
        </div>
        <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium">
          See what’s on
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
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
        className="absolute inset-0 animate-fade-in bg-ink-950/40"
      />
      {/* A left-edge drawer must enter from the left: `slide-in-left` starts at
          translateX(-100%). */}
      <div className="absolute inset-y-0 left-0 flex w-[min(21rem,88vw)] animate-slide-in-left flex-col bg-ink-25 shadow-md">
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
          <MenuLink href="/campaigns" className="font-semibold text-sale-500">
            {t('nav.campaigns')}
          </MenuLink>
          <MenuLink href="/products">{t('nav.allProducts')}</MenuLink>

          <p className="eyebrow px-4 pb-1 pt-5">{t('nav.shopByCategory')}</p>
          {NAV.map((entry) =>
            entry.children ? (
              <div key={entry.slug}>
                <button
                  type="button"
                  onClick={() => setExpanded((c) => (c === entry.slug ? null : entry.slug))}
                  aria-expanded={expanded === entry.slug}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] text-ink-800 transition-colors hover:bg-ink-50 hover:text-ink-950"
                >
                  {categoryLabel(entry.key, t)}
                  <ChevronDown
                    className={cx(
                      'h-4 w-4 text-ink-400 transition-transform',
                      expanded === entry.slug && 'rotate-180',
                    )}
                  />
                </button>
                {expanded === entry.slug ? (
                  <div className="bg-ink-50/60 py-1">
                    <MenuLink href={`/category/${entry.slug}`} className="pl-8 text-sm">
                      All {categoryLabel(entry.key, t).toLowerCase()}
                    </MenuLink>
                    {entry.children.map((child) => (
                      <MenuLink
                        key={child.slug}
                        href={`/category/${child.slug}`}
                        className="pl-8 text-sm"
                      >
                        {child.name}
                      </MenuLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <MenuLink key={entry.slug} href={`/category/${entry.slug}`}>
                {categoryLabel(entry.key, t)}
              </MenuLink>
            ),
          )}

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

        <div className="flex items-center justify-between border-t border-ink-200 p-4">
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
        'block px-4 py-2.5 text-[15px] text-ink-800 transition-colors hover:bg-ink-50 hover:text-ink-950',
        className,
      )}
    >
      {children}
    </Link>
  );
}
