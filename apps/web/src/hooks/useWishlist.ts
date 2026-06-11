import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
  apiAddToWishlist,
  apiGetWishlist,
  apiRemoveFromWishlist,
  type WishlistItem,
} from '../lib/api';

/**
 * Server-backed wishlist ("shopping list"). The list lives in the database —
 * hearts survive refreshes and follow the customer across devices. Guests are
 * sent to login on their first heart.
 */
export function useWishlist() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: apiGetWishlist,
    enabled: !!user,
    staleTime: 60_000,
  });

  const ids = new Set(items.map(i => i.product_id));

  const { mutate } = useMutation({
    mutationFn: async ({ productId, wishlisted }: { productId: string; wishlisted: boolean }): Promise<void> => {
      if (wishlisted) await apiRemoveFromWishlist(productId);
      else await apiAddToWishlist(productId);
    },
    // Optimistic: flip the heart immediately, reconcile with the server after.
    onMutate: async ({ productId, wishlisted }) => {
      await queryClient.cancelQueries({ queryKey: ['wishlist'] });
      const previous = queryClient.getQueryData<WishlistItem[]>(['wishlist']);
      queryClient.setQueryData<WishlistItem[]>(['wishlist'], (old = []) =>
        wishlisted
          ? old.filter(i => i.product_id !== productId)
          : [...old, { product_id: productId } as WishlistItem],
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['wishlist'], ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
  });

  const toggle = (productId: string) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    mutate({ productId, wishlisted: ids.has(productId) });
  };

  return {
    items,
    isLoading,
    isWishlisted: (productId: string) => ids.has(productId),
    toggle,
  };
}
