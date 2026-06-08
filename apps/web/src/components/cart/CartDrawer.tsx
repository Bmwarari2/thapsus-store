import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { formatKes } from '../../lib/utils';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { apiGetCart, apiUpdateCartItem, apiRemoveCartItem } from '../../lib/api';

export const drawerEvents = {
  open: () => document.dispatchEvent(new Event('open-cart')),
  close: () => document.dispatchEvent(new Event('close-cart')),
};

export const CartDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const token = useAuthStore(state => state.token);
  const setItemCount = useCartStore(state => state.setItemCount);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);
    document.addEventListener('open-cart', handleOpen);
    document.addEventListener('close-cart', handleClose);
    return () => {
      document.removeEventListener('open-cart', handleOpen);
      document.removeEventListener('close-cart', handleClose);
    };
  }, []);

  const { data: cart, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: apiGetCart,
    enabled: !!token && isOpen,
  });

  const items = cart?.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + item.priceSnapshotCents * item.qty, 0);

  useEffect(() => {
    if (cart) {
      setItemCount(items.reduce((sum, item) => sum + item.qty, 0));
    }
  }, [cart, items, setItemCount]);

  const { mutate: updateItem } = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) => apiUpdateCartItem(id, qty),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  const { mutate: removeItem } = useMutation({
    mutationFn: (id: string) => apiRemoveCartItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ShoppingBag size={24} />
                Your Cart ({items.reduce((s, i) => s + i.qty, 0)})
              </h2>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-surface rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {!token ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <ShoppingBag size={48} className="text-gray-300" />
                  <p className="font-medium text-textPrimary">Log in to see your cart</p>
                  <Link to="/auth/login" onClick={() => setIsOpen(false)}>
                    <Button>Log In</Button>
                  </Link>
                </div>
              ) : isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex gap-4 animate-pulse">
                      <div className="w-24 h-32 bg-gray-200 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                        <div className="h-4 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-textSecondary">
                  <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center mb-2">
                    <ShoppingBag size={48} className="text-gray-300" />
                  </div>
                  <h3 className="text-lg font-medium text-textPrimary">Your cart is empty</h3>
                  <p className="text-sm max-w-[250px]">Add some products to get started.</p>
                  <Button className="mt-4" onClick={() => setIsOpen(false)}>Start Shopping</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {items.map((item) => {
                    const variantLabel = item.variantAttributes
                      ? Object.values(item.variantAttributes).join(' / ')
                      : null;
                    return (
                      <div key={item.id} className="flex gap-4">
                        {item.productImage && (
                          <img
                            src={item.productImage}
                            alt={item.productName}
                            className="w-24 h-32 object-cover rounded-xl bg-surface"
                          />
                        )}
                        <div className="flex-1 flex flex-col">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="font-medium text-sm line-clamp-2">{item.productName}</h4>
                              {variantLabel && <p className="text-xs text-textSecondary mt-1">{variantLabel}</p>}
                            </div>
                            <button
                              className="text-textSecondary hover:text-red-500 transition-colors p-1"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div className="mt-auto flex items-center justify-between">
                            <span className="font-bold text-primary">{formatKes(item.priceSnapshotCents)}</span>
                            <div className="flex items-center border border-border rounded-full p-1 bg-surface">
                              <button
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white text-textSecondary"
                                onClick={() => {
                                  if (item.qty <= 1) removeItem(item.id);
                                  else updateItem({ id: item.id, qty: item.qty - 1 });
                                }}
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                              <button
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white text-textSecondary"
                                onClick={() => updateItem({ id: item.id, qty: item.qty + 1 })}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {token && items.length > 0 && (
              <div className="p-4 sm:p-6 border-t border-border bg-surface/50">
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm text-textSecondary">
                    <span>Subtotal</span>
                    <span>{formatKes(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-textSecondary">
                    <span>Shipping & Taxes</span>
                    <span>Calculated at checkout</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-3 border-t border-border">
                    <span>Total</span>
                    <span className="text-primary">{formatKes(subtotal)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Link to="/cart" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full">View Cart</Button>
                  </Link>
                  <Link to="/checkout" onClick={() => setIsOpen(false)}>
                    <Button className="w-full">Checkout</Button>
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
