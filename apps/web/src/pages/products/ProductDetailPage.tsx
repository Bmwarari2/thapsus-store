import { useState, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronRight, Heart, Share2, Star, ShieldCheck, Truck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PriceDisplay } from '../../components/product/PriceDisplay';
import { useCartStore } from '../../stores/cartStore';
import toast from 'react-hot-toast';

// Mock data for initial build
const MOCK_PRODUCT = {
  id: '1',
  name: 'Summer Floral Midi Dress',
  slug: 'summer-floral-midi-dress',
  description: 'A beautiful summer dress perfect for casual outings or evening walks. Features a vibrant floral print, lightweight breathable fabric, and an adjustable waist tie.',
  sellPriceKesCents: 320000,
  sourcePriceUsdCents: 1299,
  shippingFeeKesCents: 85000,
  taxKesCents: 48000,
  images: [
    'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80',
  ],
  ratingAvg: 4.5,
  ratingCount: 128,
  hasVariants: true,
  estimatedDaysMin: 7,
  estimatedDaysMax: 14,
  variants: [
    { id: 'v1', attributes: { Color: 'Red', Size: 'S' }, stockStatus: 'in_stock' },
    { id: 'v2', attributes: { Color: 'Red', Size: 'M' }, stockStatus: 'in_stock' },
    { id: 'v3', attributes: { Color: 'Red', Size: 'L' }, stockStatus: 'out_of_stock' },
    { id: 'v4', attributes: { Color: 'Blue', Size: 'S' }, stockStatus: 'in_stock' },
    { id: 'v5', attributes: { Color: 'Blue', Size: 'M' }, stockStatus: 'in_stock' },
  ],
};

export const ProductDetailPage = () => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  
  const incrementCart = useCartStore(state => state.setItemCount);
  const currentCount = useCartStore(state => state.itemCount);

  useEffect(() => {
    if (emblaApi) {
      emblaApi.on('select', () => {
        setSelectedIndex(emblaApi.selectedScrollSnap());
      });
    }
  }, [emblaApi]);

  const handleAddToCart = () => {
    if (MOCK_PRODUCT.hasVariants && (!selectedColor || !selectedSize)) {
      toast.error('Please select a color and size');
      return;
    }
    
    // Optimistic add
    incrementCart(currentCount + 1);
    toast.success('Added to cart!');
  };

  const colors = [...new Set(MOCK_PRODUCT.variants.map(v => v.attributes.Color))];
  const sizesForColor = selectedColor 
    ? MOCK_PRODUCT.variants.filter(v => v.attributes.Color === selectedColor)
    : MOCK_PRODUCT.variants;
  const uniqueSizes = [...new Set(MOCK_PRODUCT.variants.map(v => v.attributes.Size))];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-textSecondary mb-6">
        <span>Home</span>
        <ChevronRight size={14} />
        <span>Women</span>
        <ChevronRight size={14} />
        <span className="text-textPrimary font-medium truncate">{MOCK_PRODUCT.name}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Image Gallery */}
        <div className="space-y-4">
          <div className="relative aspect-[3/4] md:aspect-square bg-surface rounded-2xl overflow-hidden" ref={emblaRef}>
            <div className="flex h-full">
              {MOCK_PRODUCT.images.map((img, idx) => (
                <div key={idx} className="flex-[0_0_100%] min-w-0 h-full relative group">
                  <img 
                    src={img} 
                    alt={`Product ${idx}`} 
                    className="w-full h-full object-cover transition-transform duration-500 md:group-hover:scale-150 md:origin-center cursor-zoom-in"
                  />
                </div>
              ))}
            </div>
            
            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
              <Badge variant="sale">SALE</Badge>
            </div>
          </div>

          {/* Thumbnails */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
            {MOCK_PRODUCT.images.map((img, idx) => (
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
        </div>

        {/* Product Info */}
        <div className="flex flex-col">
          <div className="flex justify-between items-start gap-4">
            <h1 className="text-2xl md:text-3xl font-black text-textPrimary leading-tight">
              {MOCK_PRODUCT.name}
            </h1>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsWishlisted(!isWishlisted)}
                className="p-3 bg-surface rounded-full hover:bg-gray-200 transition-colors"
              >
                <Heart size={20} className={isWishlisted ? "fill-primary text-primary" : "text-textSecondary"} />
              </button>
              <button className="hidden sm:block p-3 bg-surface rounded-full hover:bg-gray-200 transition-colors">
                <Share2 size={20} className="text-textSecondary" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2 mb-6">
            <div className="flex items-center text-yellow-400">
              <Star size={16} className="fill-current" />
              <Star size={16} className="fill-current" />
              <Star size={16} className="fill-current" />
              <Star size={16} className="fill-current" />
              <Star size={16} className="fill-current opacity-50" />
            </div>
            <span className="text-sm font-medium">{MOCK_PRODUCT.ratingAvg}</span>
            <span className="text-sm text-textSecondary underline cursor-pointer">
              ({MOCK_PRODUCT.ratingCount} reviews)
            </span>
          </div>

          <div className="mb-6">
            <PriceDisplay 
              sellPriceKesCents={MOCK_PRODUCT.sellPriceKesCents}
              originalPriceKesCents={400000}
              showBreakdown
              breakdown={{
                sourcePriceUsdCents: MOCK_PRODUCT.sourcePriceUsdCents,
                shippingFeeKesCents: MOCK_PRODUCT.shippingFeeKesCents,
                taxKesCents: MOCK_PRODUCT.taxKesCents,
              }}
            />
            <p className="text-xs text-textSecondary mt-1">Inclusive of all taxes and import duties.</p>
          </div>

          <hr className="border-border mb-6" />

          {/* Variant Selectors */}
          {MOCK_PRODUCT.hasVariants && (
            <div className="space-y-6 mb-8">
              {/* Colors */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex justify-between">
                  <span>Color: <span className="font-normal text-textSecondary">{selectedColor || 'Select'}</span></span>
                </h3>
                <div className="flex gap-3">
                  {colors.map(color => {
                    const isSelected = selectedColor === color;
                    return (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-10 h-10 rounded-full border-2 transition-all p-0.5 ${
                          isSelected ? 'border-primary' : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <div 
                          className="w-full h-full rounded-full"
                          style={{ backgroundColor: color.toLowerCase() }} 
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sizes */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex justify-between">
                  <span>Size: <span className="font-normal text-textSecondary">{selectedSize || 'Select'}</span></span>
                  <button className="text-primary font-medium text-xs underline">Size Guide</button>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {uniqueSizes.map(size => {
                    // Check if this size is available for the selected color
                    const variantForSize = sizesForColor.find(v => v.attributes.Size === size);
                    const isAvailable = variantForSize && variantForSize.stockStatus === 'in_stock';
                    const isSelected = selectedSize === size;

                    return (
                      <button
                        key={size}
                        disabled={!isAvailable}
                        onClick={() => setSelectedSize(size)}
                        className={`px-5 py-2.5 rounded-full border text-sm font-medium transition-all ${
                          isSelected 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : isAvailable 
                              ? 'border-border hover:border-gray-400 bg-white'
                              : 'border-border bg-surface text-gray-400 cursor-not-allowed line-through decoration-gray-400'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <Button 
            size="lg" 
            className="w-full h-14 text-lg rounded-xl mb-4"
            onClick={handleAddToCart}
          >
            Add to Cart
          </Button>

          {/* Delivery & Trust */}
          <div className="bg-surface rounded-xl p-4 space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <Truck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Estimated Delivery</h4>
                <p className="text-sm text-textSecondary">
                  Arrives in {MOCK_PRODUCT.estimatedDaysMin}–{MOCK_PRODUCT.estimatedDaysMax} days. Shipped internationally.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Buyer Protection</h4>
                <p className="text-sm text-textSecondary">
                  Full refund if you don't receive your order.
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-lg font-bold mb-2">Product Description</h3>
            <p className="text-textSecondary leading-relaxed text-sm">
              {MOCK_PRODUCT.description}
            </p>
          </div>
          
        </div>
      </div>
    </div>
  );
};
