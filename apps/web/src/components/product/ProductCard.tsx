import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Star } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PriceDisplay } from './PriceDisplay';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { apiAddToCart, type Product } from '../../lib/api';
import { imageSrcSet } from '../../lib/utils';
import toast from 'react-hot-toast';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore(state => state.token);
  const setItemCount = useCartStore(state => state.setItemCount);
  const currentCount = useCartStore(state => state.itemCount);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!token) {
      toast.error('Please log in to add items to your cart.');
      navigate('/auth/login');
      return;
    }
    // Variant products need a size/colour choice — send the shopper to the PDP.
    if (product.hasVariants) {
      navigate(`/products/${product.slug}`);
      return;
    }

    setIsAdding(true);
    try {
      await apiAddToCart(product.id, 1);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setItemCount(currentCount + 1);
      setAdded(true);
      toast.success('Added to cart!');
      setTimeout(() => setAdded(false), 1500);
    } catch {
      toast.error('Failed to add to cart. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWishlisted(!isWishlisted);
  };

  const isNew = new Date().getTime() - new Date(product.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  const onSale = product.compareAtKesCents != null && product.compareAtKesCents > product.sellPriceKesCents;
  const addLabel = product.hasVariants ? 'Choose Options' : '+ Add to Cart';

  return (
    <Link to={`/products/${product.slug}`} className="group block relative">
      <motion.div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface mb-3"
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <motion.img
          {...imageSrcSet(product.images[0] || 'https://placehold.co/400x600?text=No+Image')}
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          alt={product.name}
          className="h-full w-full object-cover object-center"
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.4 }}
          loading="lazy"
          decoding="async"
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {isNew && <Badge variant="new">NEW</Badge>}
          {onSale && <Badge variant="sale">SALE</Badge>}
        </div>

        {/* Wishlist Button */}
        <motion.button
          onClick={handleWishlist}
          whileTap={{ scale: 0.8 }}
          className="absolute top-3 right-3 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm text-gray-500 hover:text-primary transition-colors"
        >
          <Heart
            size={18}
            className={isWishlisted ? "fill-primary text-primary" : ""}
          />
        </motion.button>

        {/* Quick Add (Desktop) */}
        <div className="absolute bottom-0 left-0 w-full p-3 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 hidden md:block">
          <Button
            className="w-full shadow-lg"
            onClick={handleAddToCart}
            disabled={isAdding || added}
          >
            {added ? "Added!" : isAdding ? "Adding..." : addLabel}
          </Button>
        </div>
      </motion.div>

      <div className="space-y-1 px-1">
        <h3 className="text-sm font-medium text-textPrimary line-clamp-1 group-hover:text-primary transition-colors">
          {product.name}
        </h3>

        <div className="flex items-center gap-1">
          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
          <span className="text-xs font-medium">{product.rating?.toFixed(1) || '0.0'}</span>
          <span className="text-xs text-textSecondary">({product.reviewCount || 0})</span>
        </div>

        <PriceDisplay
          sellPriceKesCents={product.sellPriceKesCents}
          compareAtKesCents={product.compareAtKesCents}
        />

        {/* Quick Add (Mobile) */}
        <div className="md:hidden mt-2">
           <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8"
            onClick={handleAddToCart}
            disabled={isAdding || added}
          >
            {added ? "Added!" : isAdding ? "Adding..." : product.hasVariants ? "Options" : "+ Add"}
          </Button>
        </div>
      </div>
    </Link>
  );
};
