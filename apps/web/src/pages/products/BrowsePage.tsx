import { useState } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ProductGrid } from '../../components/product/ProductGrid';
import { SkeletonCard } from '../../components/shared/SkeletonCard';
import { Button } from '../../components/ui/Button';
import { apiGetProducts } from '../../lib/api';

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Popular', value: 'popular' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Top Rated', value: 'rating' },
];

const SUBCATEGORIES = ['Dresses', 'Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'];

export const BrowsePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');

  const category = searchParams.get('category') || undefined;
  const q = searchParams.get('q') || undefined;
  const featured = searchParams.get('featured') === 'true' ? true : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['products', category, q, featured, sort, page],
    queryFn: () => apiGetProducts({ category, q, featured, sort, page, limit: 24 }),
  });

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 24);

  const pageTitle = q ? `Search: "${q}"` : category ?? 'All Products';

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-black text-textPrimary capitalize">{pageTitle}</h1>
          <p className="text-textSecondary mt-2">
            {isLoading ? 'Loading...' : `Showing ${total} result${total !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="md:hidden flex-1"
            onClick={() => setIsFilterOpen(true)}
          >
            <Filter size={18} className="mr-2" /> Filters
          </Button>

          <div className="hidden md:flex items-center gap-2 border border-border rounded-xl px-4 py-2 bg-white cursor-pointer hover:bg-surface relative group">
            <span className="text-sm font-medium text-textSecondary">Sort by:</span>
            <span className="text-sm font-bold">{SORT_OPTIONS.find(o => o.value === sort)?.label}</span>
            <ChevronDown size={16} />
            <div className="absolute top-full right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-10 hidden group-hover:block min-w-[180px]">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setSort(o.value); setPage(1); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface first:rounded-t-xl last:rounded-b-xl ${sort === o.value ? 'font-bold text-primary' : ''}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Desktop Sidebar Filter */}
        <aside className="hidden md:block w-64 shrink-0 space-y-8 sticky top-24 h-fit">
          <div>
            <h3 className="font-bold text-lg mb-4">Categories</h3>
            <div className="space-y-3">
              {SUBCATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary" />
                  <span className="text-textSecondary group-hover:text-textPrimary transition-colors">{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">Price Range (KES)</h3>
            <div className="flex items-center gap-4">
              <input type="number" placeholder="Min" className="w-full h-10 border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" />
              <span className="text-textSecondary">-</span>
              <input type="number" placeholder="Max" className="w-full h-10 border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" />
            </div>
          </div>

          <Button className="w-full">Apply Filters</Button>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-textSecondary">
              <p className="text-lg font-medium">No products found.</p>
              <p className="text-sm mt-2">Try a different search or category.</p>
              <Button className="mt-6" onClick={() => setSearchParams({})}>Clear filters</Button>
            </div>
          ) : (
            <ProductGrid products={products} />
          )}

          {totalPages > 1 && (
            <div className="mt-12 flex justify-center gap-3">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center text-sm text-textSecondary">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
