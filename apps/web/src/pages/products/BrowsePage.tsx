import { useState } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ProductGrid } from '../../components/product/ProductGrid';
import { Button } from '../../components/ui/Button';

// Reuse mock products for demo
const MOCK_PRODUCTS = [
  { id: '1', name: 'Summer Floral Midi Dress', slug: '1', sellPriceKesCents: 320000, images: ['https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.5, ratingCount: 128 },
  { id: '2', name: 'Classic White Sneakers', slug: '2', sellPriceKesCents: 450000, images: ['https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.8, ratingCount: 84 },
  { id: '3', name: 'Elegant Evening Gown', slug: '3', sellPriceKesCents: 850000, images: ['https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.2, ratingCount: 45 },
  { id: '4', name: 'Casual Denim Jacket', slug: '4', sellPriceKesCents: 520000, images: ['https://images.unsplash.com/photo-1551537482-f20927b34720?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.6, ratingCount: 210 },
  { id: '5', name: 'Black Leather Handbag', slug: '5', sellPriceKesCents: 600000, images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.9, ratingCount: 300 },
  { id: '6', name: 'Vintage Sunglasses', slug: '6', sellPriceKesCents: 150000, images: ['https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.3, ratingCount: 95 },
  { id: '7', name: 'Gold Hoop Earrings', slug: '7', sellPriceKesCents: 120000, images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.7, ratingCount: 150 },
  { id: '8', name: 'Knitted Sweater', slug: '8', sellPriceKesCents: 280000, images: ['https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=400&q=80'], ratingAvg: 4.4, ratingCount: 65 },
];

export const BrowsePage = () => {
  const [searchParams] = useSearchParams();
  const [, setIsFilterOpen] = useState(false);

  const category = searchParams.get('category') || 'All';

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-black text-textPrimary capitalize">{category}</h1>
          <p className="text-textSecondary mt-2">Showing 142 results</p>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="md:hidden flex-1"
            onClick={() => setIsFilterOpen(true)}
          >
            <Filter size={18} className="mr-2" /> Filters
          </Button>

          <div className="hidden md:flex items-center gap-2 border border-border rounded-xl px-4 py-2 bg-white cursor-pointer hover:bg-surface">
            <span className="text-sm font-medium text-textSecondary">Sort by:</span>
            <span className="text-sm font-bold">Popular</span>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Desktop Sidebar Filter */}
        <aside className="hidden md:block w-64 shrink-0 space-y-8 sticky top-24 h-fit">
          
          <div>
            <h3 className="font-bold text-lg mb-4">Categories</h3>
            <div className="space-y-3">
              {['Dresses', 'Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'].map((c) => (
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
          <ProductGrid products={MOCK_PRODUCTS} />
          
          <div className="mt-12 flex justify-center">
            <Button variant="outline" size="lg" className="w-full md:w-auto">Load More Products</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
