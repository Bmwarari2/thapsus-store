import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { formatKes } from '../../lib/utils';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { apiGetCart, apiUpdateCartItem, apiRemoveCartItem } from '../../lib/api';

export const CartPage = () => {
  const token = useAuthStore(state => state.token);
  const setItemCount = useCartStore(state => state.setItemCount);
  const queryClient = useQueryClient();

  const { data: cart, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: apiGetCart,
    enabled: !!token,
  });

  const items = cart?.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + item.priceSnapshotCents * item.qty, 0);

  useEffect(() => {
    if (cart) setItemCount(items.reduce((s, i) => s + i.qty, 0));
  }, [cart, items, setItemCount]);

  const { mutate: updateItem } = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) => apiUpdateCartItem(id, qty),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  const { mutate: removeItem } = useMutation({
    mutationFn: (id: string) => apiRemoveCartItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  if (!token) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="w-32 h-32 bg-surface rounded-full flex items-center justify-center mb-6">
          <ShoppingBag size={64} className="text-gray-300" />
        </div>
        <h1 className="text-3xl font-black mb-4">Log in to view your cart</h1>
        <p className="text-textSecondary mb-8 max-w-md">Create an account or log in to save items and checkout.</p>
        <Link to="/auth/login">
          <Button size="lg" className="px-8">Log In</Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <div className="animate-pulse text-textSecondary">Loading cart...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="w-32 h-32 bg-surface rounded-full flex items-center justify-center mb-6">
          <ShoppingBag size={64} className="text-gray-300" />
        </div>
        <h1 className="text-3xl font-black mb-4">Your cart is empty</h1>
        <p className="text-textSecondary mb-8 max-w-md">Discover our latest products and add some to your cart.</p>
        <Link to="/products">
          <Button size="lg" className="px-8">Start Shopping</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-black mb-8">Shopping Cart</h1>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <div className="flex-1 space-y-6">
          {items.map((item) => {
            const variantLabel = item.variantAttributes
              ? Object.values(item.variantAttributes).join(' / ')
              : null;
            return (
              <div key={item.id} className="flex gap-4 sm:gap-6 bg-white p-4 rounded-2xl border border-border">
                {item.productImage && (
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="w-24 h-32 sm:w-32 sm:h-40 object-cover rounded-xl bg-surface"
                  />
                )}
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-bold text-lg leading-tight mb-1">{item.productName}</h3>
                      {variantLabel && <p className="text-sm text-textSecondary">{variantLabel}</p>}
                    </div>
                    <button
                      className="text-textSecondary hover:text-red-500 text-sm font-medium transition-colors"
                      onClick={() => removeItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                    <div className="flex items-center border border-border rounded-full p-1 bg-surface w-fit">
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white text-textSecondary text-lg font-medium transition-colors"
                        onClick={() => {
                          if (item.qty <= 1) removeItem(item.id);
                          else updateItem({ id: item.id, qty: item.qty - 1 });
                        }}
                      >
                        -
                      </button>
                      <span className="w-10 text-center font-bold">{item.qty}</span>
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white text-textSecondary text-lg font-medium transition-colors"
                        onClick={() => updateItem({ id: item.id, qty: item.qty + 1 })}
                      >
                        +
                      </button>
                    </div>
                    <span className="font-black text-xl text-primary">{formatKes(item.priceSnapshotCents)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:w-96 shrink-0 h-fit sticky top-24">
          <div className="bg-surface rounded-3xl p-6 sm:p-8">
            <h3 className="font-bold text-xl mb-6">Order Summary</h3>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-textSecondary">
                <span>Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})</span>
                <span>{formatKes(subtotal)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>Shipping estimate</span>
                <span>Calculated at checkout</span>
              </div>
              <div className="h-px bg-border w-full my-4" />
              <div className="flex justify-between font-black text-2xl">
                <span>Total</span>
                <span className="text-primary">{formatKes(subtotal)}</span>
              </div>
            </div>

            <Link to="/checkout" className="block w-full">
              <Button size="lg" className="w-full text-lg h-14 rounded-xl group">
                Proceed to Checkout
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
