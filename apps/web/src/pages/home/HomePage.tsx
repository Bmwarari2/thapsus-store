import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ProductGrid } from '../../components/product/ProductGrid';
import { ProductCard } from '../../components/product/ProductCard';
import { Button } from '../../components/ui/Button';
import { SkeletonCard } from '../../components/shared/SkeletonCard';
import { apiGetFeaturedProducts, apiGetCategories, type Product } from '../../lib/api';
import { useInfiniteProducts } from '../../hooks/useInfiniteProducts';
import { useIntersection } from '../../hooks/useIntersection';

const BANNERS = [
  {
    id: 1,
    title: "New Arrivals Weekly",
    subtitle: "Discover the latest trends from globally sourced brands.",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: 2,
    title: "Free delivery on orders over KES 5,000",
    subtitle: "Shop more, save more on shipping.",
    image: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: 3,
    title: "Pay with M-Pesa",
    subtitle: "Fast, secure, and convenient checkout.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80",
  }
];

export const HomePage = () => {
  const [currentBanner, setCurrentBanner] = useState(0);

  const { data: featured = [], isLoading: loadingFeatured } = useQuery({
    queryKey: ['featured-products'],
    queryFn: apiGetFeaturedProducts,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: apiGetCategories,
  });

  // Endless new-arrivals feed at the bottom of the page.
  const {
    data: feedData,
    isLoading: loadingFeed,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteProducts({ sort: 'newest' });

  const feedProducts = useMemo(() => {
    const seen = new Set<string>();
    const out: Product[] = [];
    for (const page of feedData?.pages ?? []) {
      for (const p of page.items) {
        if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
      }
    }
    return out;
  }, [feedData]);

  const feedSentinelRef = useIntersection(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  });

  // Only show top-level categories in the nav strip
  const topCategories = categories.filter((c) => c.parentId === null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Banner Carousel */}
      <div className="relative h-[400px] md:h-[500px] w-full overflow-hidden bg-gray-100">
        <AnimatePresence initial={false}>
          <motion.div
            key={currentBanner}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 bg-black/30 z-10" />
            <img
              src={BANNERS[currentBanner].image}
              alt={BANNERS[currentBanner].title}
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 z-20 flex items-center justify-center text-center px-4">
              <div className="max-w-2xl space-y-4">
                <motion.h1
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl md:text-6xl font-black text-white tracking-tight"
                >
                  {BANNERS[currentBanner].title}
                </motion.h1>
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-lg text-white/90"
                >
                  {BANNERS[currentBanner].subtitle}
                </motion.p>
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="pt-4"
                >
                  <Link to="/products">
                    <Button size="lg" className="rounded-full px-8">Shop Now</Button>
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center gap-2">
          {BANNERS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentBanner(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                idx === currentBanner ? 'bg-white w-8' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4 space-y-16">

        {/* Category Quick-Nav */}
        {topCategories.length > 0 && (
          <section>
            <div className="flex overflow-x-auto hide-scrollbar gap-4 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
              {topCategories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/products?category=${cat.slug}`}
                  className="flex flex-col items-center gap-2 min-w-[80px] shrink-0 group"
                >
                  <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center text-2xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    {cat.icon ?? '🛍️'}
                  </div>
                  <span className="text-xs font-semibold text-textSecondary group-hover:text-textPrimary text-center">{cat.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured Products */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold tracking-tight">Featured</h2>
              <div className="hidden sm:flex items-center gap-1 bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">
                <span className="animate-pulse">🔥</span> Hot picks
              </div>
            </div>
            <Link to="/products?sort=popular" className="text-sm font-semibold text-primary hover:underline">View All</Link>
          </div>

          {loadingFeatured ? (
            <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 hide-scrollbar">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="min-w-[200px] md:min-w-[240px] shrink-0">
                  <SkeletonCard />
                </div>
              ))}
            </div>
          ) : featured.length > 0 ? (
            <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 hide-scrollbar snap-x">
              {featured.map((p) => (
                <div key={p.id} className="min-w-[200px] md:min-w-[240px] shrink-0 snap-start">
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-textSecondary text-sm">No featured products yet. Check back soon!</p>
          )}
        </section>

        {/* App Download Banner */}
        <section className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-3xl p-8 md:p-12 text-center flex flex-col items-center justify-center space-y-4">
          <h2 className="text-3xl font-black tracking-tight text-textPrimary">Get the Thapsus App</h2>
          <p className="text-textSecondary max-w-md">Enjoy exclusive app-only deals and track your orders in real time. Coming soon to iOS and Android.</p>
          <Button variant="secondary" size="lg" disabled>Coming Soon</Button>
        </section>

        {/* New Arrivals — endless feed, SHEIN-style */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold tracking-tight">New Arrivals</h2>
            <Link to="/products?sort=newest" className="text-sm font-semibold text-primary hover:underline">Browse All</Link>
          </div>
          {loadingFeed ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <>
              <ProductGrid products={feedProducts} />
              {isFetchingNextPage && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 mt-6">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}
              {!hasNextPage && feedProducts.length > 12 && (
                <p className="mt-12 text-center text-textSecondary text-sm">You've seen everything ✨</p>
              )}
              <div ref={feedSentinelRef} aria-hidden className="h-px" />
            </>
          )}
        </section>

      </div>
    </div>
  );
};
