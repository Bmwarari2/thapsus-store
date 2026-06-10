import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronRight, Heart, Share2, Star, ShieldCheck, Truck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PriceDisplay } from '../../components/product/PriceDisplay';
import { SkeletonCard } from '../../components/shared/SkeletonCard';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { apiGetProduct, apiAddToCart } from '../../lib/api';
import toast from 'react-hot-toast';

export const ProductDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const token = useAuthStore(state => state.token);
  const setItemCount = useCartStore(state => state.setItemCount);
  const itemCount = useCartStore(state => state.itemCount);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => apiGetProduct(slug!),
    enabled: !!slug,
  });

  const { mutate: addToCart, isPending: addingToCart } = useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId?: string }) =>
      apiAddToCart(productId, 1, variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setItemCount(itemCount + 1);
      toast.success('Added to cart!');
    },
    onError: () => {
      toast.error('Failed to add to cart. Please try again.');
    },
  });

  useEffect(() => {
    if (emblaApi) {
      emblaApi.on('select', () => setSelectedIndex(emblaApi.selectedScrollSnap()));
    }
  }, [emblaApi]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        <SkeletonCard />
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-3/4" />
          <div className="h-6 bg-gray-200 rounded animate-pulse w-1/2" />
          <div className="h-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <p className="text-xl font-bold text-textPrimary">Product not found.</p>
        <Link to="/products" className="text-primary underline mt-4 block">Browse all products</Link>
      </div>
    );
  }

  const { product, variants } = data;

  const colors = [...new Set(variants.map(v => v.attributes.Color).filter(Boolean))];
  const uniqueSizes = [...new Set(variants.map(v => v.attributes.Size).filter(Boolean))];

  // First image seen for each colour — used for swatches and gallery switching.
  const colorImage: Record<string, string> = {};
  for (const v of variants) {
    const c = v.attributes.Color;
    if (c && v.imageUrl && !colorImage[c]) colorImage[c] = v.imageUrl;
  }
  const sizesForColor = selectedColor
    ? variants.filter(v => v.attributes.Color === selectedColor)
    : variants;

  const selectedVariant = variants.find(v =>
    v.attributes.Color === selectedColor && v.attributes.Size === selectedSize
  );

  const handleAddToCart = () => {
    if (!token) {
      toast.error('Please log in to add items to your cart.');
      return;
    }
    if (product.hasVariants && colors.length > 0 && !selectedColor) {
      toast.error('Please select a color.');
      return;
    }
    if (product.hasVariants && uniqueSizes.length > 0 && !selectedSize) {
      toast.error('Please select a size.');
      return;
    }
    addToCart({ productId: product.id, variantId: selectedVariant?.id });
  };

  const images = product.images.length > 0
    ? product.images
    : ['https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=800&q=80'];

  const handleSelectColor = (color: string) => {
    setSelectedColor(color);
    setSelectedSize(null);
    const idx = colorImage[color] ? images.indexOf(colorImage[color]) : -1;
    if (idx >= 0) emblaApi?.scrollTo(idx);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-textSecondary mb-6">
        <Link to="/" className="hover:text-textPrimary">Home</Link>
        <ChevronRight size={14} />
        <Link to="/products" className="hover:text-textPrimary">Products</Link>
        <ChevronRight size={14} />
        <span className="text-textPrimary font-medium truncate">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Image Gallery */}
        <div className="space-y-4">
          <div className="relative aspect-[3/4] md:aspect-square bg-surface rounded-2xl overflow-hidden" ref={emblaRef}>
            <div className="flex h-full">
              {images.map((img, idx) => (
                <div key={idx} className="flex-[0_0_100%] min-w-0 h-full relative group">
                  <img
                    src={img}
                    alt={`${product.name} ${idx + 1}`}
                    className="w-full h-full object-cover transition-transform duration-500 md:group-hover:scale-150 md:origin-center cursor-zoom-in"
                  />
                </div>
              ))}
            </div>
            {product.isFeatured && (
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                <Badge variant="sale">FEATURED</Badge>
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => emblaApi?.scrollTo(idx)}
                  className={`w-20 h-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    selectedIndex === idx ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img} className="w-full h-full object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex flex-col">
          <div className="flex justify-between items-start gap-4">
            <h1 className="text-2xl md:text-3xl font-black text-textPrimary leading-tight">
              {product.name}
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setIsWishlisted(!isWishlisted)}
                className="p-3 bg-surface rounded-full hover:bg-gray-200 transition-colors"
              >
                <Heart size={20} className={isWishlisted ? 'fill-primary text-primary' : 'text-textSecondary'} />
              </button>
              <button className="hidden sm:block p-3 bg-surface rounded-full hover:bg-gray-200 transition-colors">
                <Share2 size={20} className="text-textSecondary" />
              </button>
            </div>
          </div>

          {(product.rating !== null || product.reviewCount > 0) && (
            <div className="flex items-center gap-2 mt-2 mb-4">
              <div className="flex items-center text-yellow-400">
                {[1,2,3,4,5].map((s) => (
                  <Star
                    key={s}
                    size={16}
                    className={s <= Math.round(product.rating ?? 0) ? 'fill-current' : 'fill-current opacity-20'}
                  />
                ))}
              </div>
              {product.rating && <span className="text-sm font-medium">{Number(product.rating).toFixed(1)}</span>}
              <span className="text-sm text-textSecondary underline cursor-pointer">
                ({product.reviewCount} review{product.reviewCount !== 1 ? 's' : ''})
              </span>
            </div>
          )}

          <div className="mb-6">
            <PriceDisplay
              sellPriceKesCents={product.sellPriceKesCents}
              compareAtKesCents={product.compareAtKesCents}
              size="lg"
            />
            <p className="text-xs text-textSecondary mt-1">
              Inclusive of all taxes and import duties. Delivery calculated at checkout.
            </p>
          </div>

          <hr className="border-border mb-6" />

          {/* Variant Selectors */}
          {product.hasVariants && variants.length > 0 && (
            <div className="space-y-6 mb-8">
              {colors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">
                    Color: <span className="font-normal text-textSecondary">{selectedColor || 'Select'}</span>
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {colors.map(color => (
                      <button
                        key={color}
                        title={color}
                        onClick={() => handleSelectColor(color)}
                        className={`w-12 h-12 rounded-full border-2 transition-all p-0.5 overflow-hidden ${
                          selectedColor === color ? 'border-primary' : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        {colorImage[color] ? (
                          <img src={colorImage[color]} alt={color} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <div className="w-full h-full rounded-full" style={{ backgroundColor: color.toLowerCase() }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {uniqueSizes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">
                    Size: <span className="font-normal text-textSecondary">{selectedSize || 'Select'}</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {uniqueSizes.map(size => {
                      const match = sizesForColor.find(v => v.attributes.Size === size);
                      const isAvailable = match && match.isActive && match.stockQty > 0;
                      return (
                        <button
                          key={size}
                          disabled={!isAvailable}
                          onClick={() => setSelectedSize(size)}
                          className={`px-5 py-2.5 rounded-full border text-sm font-medium transition-all ${
                            selectedSize === size
                              ? 'border-primary bg-primary/5 text-primary'
                              : isAvailable
                                ? 'border-border hover:border-gray-400 bg-white'
                                : 'border-border bg-surface text-gray-400 cursor-not-allowed line-through'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <Button
            size="lg"
            className="w-full h-14 text-lg rounded-xl mb-4"
            onClick={handleAddToCart}
            isLoading={addingToCart}
            disabled={product.stockStatus === 'out_of_stock'}
          >
            {product.stockStatus === 'out_of_stock' ? 'Out of Stock' : 'Add to Cart'}
          </Button>

          {/* Delivery & Trust */}
          <div className="bg-surface rounded-xl p-4 space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <Truck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Estimated Delivery</h4>
                <p className="text-sm text-textSecondary">
                  Arrives in {product.estimatedDaysMin}–{product.estimatedDaysMax} days. Shipped internationally.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Buyer Protection</h4>
                <p className="text-sm text-textSecondary">Full refund if you don't receive your order.</p>
              </div>
            </div>
          </div>

          {product.description && (
            <div>
              <h3 className="text-lg font-bold mb-2">Product Description</h3>
              <p className="text-textSecondary leading-relaxed text-sm">{product.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
