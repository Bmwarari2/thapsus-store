import React from 'react';
import { ProductCard } from './ProductCard';
import { SkeletonCard } from '../shared/SkeletonCard';
import type { Product } from '../../lib/api';

interface ProductGridProps {
  products?: Product[];
  isLoading?: boolean;
  skeletonCount?: number;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products = [],
  isLoading = false,
  skeletonCount = 8
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {isLoading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <SkeletonCard key={i} />
          ))
        : products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
    </div>
  );
};
