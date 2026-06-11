import { useMemo, useState } from 'react';
import { Filter, ChevronDown, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ProductGrid } from '../../components/product/ProductGrid';
import { SkeletonCard } from '../../components/shared/SkeletonCard';
import { Button } from '../../components/ui/Button';
import { apiGetCategories, type Product } from '../../lib/api';
import { useInfiniteProducts } from '../../hooks/useInfiniteProducts';
import { useIntersection } from '../../hooks/useIntersection';

const SORT_OPTIONS = [
  { label: 'Recommended', value: 'recommended' },
  { label: 'Newest', value: 'newest' },
  { label: 'Popular', value: 'popular' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
];

export const BrowsePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [minPriceInput, setMinPriceInput] = useState(searchParams.get('min_price') ?? '');
  const [maxPriceInput, setMaxPriceInput] = useState(searchParams.get('max_price') ?? '');

  const category = searchParams.get('category') || undefined;
  const q = searchParams.get('q') || undefined;
  // Search results rank by recency; browsing defaults to the recommended shuffle.
  const sort = searchParams.get('sort') || (q ? 'newest' : 'recommended');
  const minPrice = searchParams.get('min_price') ? Number(searchParams.get('min_price')) : undefined;
  const maxPrice = searchParams.get('max_price') ? Number(searchParams.get('max_price')) : undefined;

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: apiGetCategories,
    staleTime: 5 * 60_000,
  });

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteProducts({ category, q, sort, minPrice, maxPrice });

  // Flatten pages, deduping by id defensively across page boundaries.
  const products = useMemo(() => {
    const seen = new Set<string>();
    const out: Product[] = [];
    for (const page of data?.pages ?? []) {
      for (const p of page.items) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
      }
    }
    return out;
  }, [data]);

  const sentinelRef = useIntersection(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  });

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const applyPriceFilter = () => {
    const next = new URLSearchParams(searchParams);
    if (minPriceInput) next.set('min_price', minPriceInput); else next.delete('min_price');
    if (maxPriceInput) next.set('max_price', maxPriceInput); else next.delete('max_price');
    setSearchParams(next, { replace: true });
  };

  const activeCategory = categories.find(c => c.slug === category);
  const pageTitle = q ? `Search: "${q}"` : activeCategory?.name ?? 'All Products';
  const parents = categories.filter(c => !c.parentId);
  const childrenOf = (id: string) => categories.filter(c => c.parentId === id);

  const filterPanel = (
    <>
      <div>
        <h3 className="font-bold text-lg mb-4">Categories</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="radio"
              name="category"
              checked={!category}
              onChange={() => setParam('category', undefined)}
              className="w-4 h-4 border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-textSecondary group-hover:text-textPrimary transition-colors">All</span>
          </label>
          {parents.map((parent) => (
            <div key={parent.id} className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="category"
                  checked={category === parent.slug}
                  onChange={() => setParam('category', parent.slug)}
                  className="w-4 h-4 border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-textSecondary group-hover:text-textPrimary transition-colors font-medium">
                  {parent.icon ? `${parent.icon} ` : ''}{parent.name}
                </span>
              </label>
              {childrenOf(parent.id).map((child) => (
                <label key={child.id} className="flex items-center gap-3 cursor-pointer group pl-7">
                  <input
                    type="radio"
                    name="category"
                    checked={category === child.slug}
                    onChange={() => setParam('category', child.slug)}
                    className="w-4 h-4 border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-textSecondary group-hover:text-textPrimary transition-colors">{child.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-lg mb-4">Price Range (KES)</h3>
        <div className="flex items-center gap-4">
          <input
            type="number"
            placeholder="Min"
            value={minPriceInput}
            onChange={(e) => setMinPriceInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyPriceFilter()}
            className="w-full h-10 border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
          <span className="text-textSecondary">-</span>
          <input
            type="number"
            placeholder="Max"
            value={maxPriceInput}
            onChange={(e) => setMaxPriceInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyPriceFilter()}
            className="w-full h-10 border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
      </div>

      <Button className="w-full" onClick={applyPriceFilter}>Apply Filters</Button>
    </>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-black text-textPrimary capitalize">{pageTitle}</h1>
          <p className="text-textSecondary mt-2">
            {isLoading ? 'Loading…' : `${products.length}${hasNextPage ? '+' : ''} result${products.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="md:hidden flex-1"
            onClick={() => setIsFilterOpen(o => !o)}
          >
            <Filter size={18} className="mr-2" /> Filters
          </Button>

          <div className="hidden md:flex items-center gap-2 border border-border rounded-xl px-4 py-2 bg-white cursor-pointer hover:bg-surface relative group">
            <span className="text-sm font-medium text-textSecondary">Sort by:</span>
            <span className="text-sm font-bold">{SORT_OPTIONS.find(o => o.value === sort)?.label ?? 'Newest'}</span>
            <ChevronDown size={16} />
            <div className="absolute top-full right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-10 hidden group-hover:block min-w-[180px]">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setParam('sort', o.value)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface first:rounded-t-xl last:rounded-b-xl ${sort === o.value ? 'font-bold text-primary' : ''}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile filter panel */}
      {isFilterOpen && (
        <div className="md:hidden mb-8 space-y-8 bg-surface rounded-2xl p-5">
          {filterPanel}
        </div>
      )}

      <div className="flex gap-8">
        {/* Desktop Sidebar Filter */}
        <aside className="hidden md:block w-64 shrink-0 space-y-8 sticky top-24 h-fit">
          {filterPanel}
        </aside>

        {/* Product Feed */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : isError ? (
            <div className="text-center py-20 text-textSecondary">
              <AlertCircle className="mx-auto mb-4" size={32} />
              <p className="text-lg font-medium">Couldn't load products.</p>
              <Button className="mt-6" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-textSecondary">
              <p className="text-lg font-medium">No products found.</p>
              <p className="text-sm mt-2">Try a different search or category.</p>
              <Button className="mt-6" onClick={() => setSearchParams({})}>Clear filters</Button>
            </div>
          ) : (
            <>
              <ProductGrid products={products} />

              {/* Infinite-scroll tail */}
              {isFetchingNextPage && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 mt-6">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}
              {hasNextPage && !isFetchingNextPage && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => fetchNextPage()}
                    className="text-sm text-textSecondary hover:text-textPrimary underline"
                  >
                    Load more
                  </button>
                </div>
              )}
              {!hasNextPage && products.length > 12 && (
                <p className="mt-12 text-center text-textSecondary text-sm">You've seen everything ✨</p>
              )}
              <div ref={sentinelRef} aria-hidden className="h-px" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
