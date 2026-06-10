import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import { apiGetCategories, type Category } from '../../lib/api';
import { imageAtWidth } from '../../lib/utils';

/**
 * Detailed category directory: every parent category with its subcategories,
 * live product counts, and a preview image. Each link lands on the
 * infinite-scroll browse feed filtered to that category.
 */
export const CategoriesPage = () => {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: apiGetCategories,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-32 flex justify-center">
        <Loader2 className="animate-spin text-textSecondary" size={32} />
      </div>
    );
  }

  const parents = categories.filter(c => !c.parentId);
  const childrenOf = (id: string) => categories.filter(c => c.parentId === id);
  const totalFor = (parent: Category) =>
    parent.productCount + childrenOf(parent.id).reduce((s, c) => s + c.productCount, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-black text-textPrimary">Shop by Category</h1>
        <p className="text-textSecondary mt-2">Everything we source, organised. Tap any category to browse.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {parents.map((parent) => {
          const children = childrenOf(parent.id);
          const total = totalFor(parent);
          const preview = parent.previewImage ?? children.find(c => c.previewImage)?.previewImage;
          return (
            <div key={parent.id} className="bg-white border border-border rounded-2xl overflow-hidden flex">
              <Link
                to={`/products?category=${parent.slug}`}
                className="w-28 sm:w-36 shrink-0 bg-surface relative group overflow-hidden"
              >
                {preview ? (
                  <img
                    src={imageAtWidth(preview, 320)}
                    alt={parent.name}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-4xl">{parent.icon ?? '🛍️'}</span>
                )}
              </Link>

              <div className="flex-1 p-5">
                <Link to={`/products?category=${parent.slug}`} className="flex items-center justify-between group">
                  <div>
                    <h2 className="font-bold text-lg group-hover:text-primary transition-colors">
                      {parent.icon ? `${parent.icon} ` : ''}{parent.name}
                    </h2>
                    <p className="text-xs text-textSecondary mt-0.5">
                      {total} product{total !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-textSecondary group-hover:text-primary transition-colors" />
                </Link>

                {children.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {children.map((child) => (
                      <Link
                        key={child.id}
                        to={`/products?category=${child.slug}`}
                        className="px-3 py-1.5 bg-surface hover:bg-primary/10 hover:text-primary rounded-full text-xs font-medium text-textSecondary transition-colors"
                      >
                        {child.name}
                        {child.productCount > 0 && (
                          <span className="ml-1 opacity-60">({child.productCount})</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
