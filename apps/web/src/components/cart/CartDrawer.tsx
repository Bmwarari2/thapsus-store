import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { formatKes } from '../../lib/utils';
import { useCartStore } from '../../stores/cartStore';

// Temporary event bus for drawer state
export const drawerEvents = {
  open: () => document.dispatchEvent(new Event('open-cart')),
  close: () => document.dispatchEvent(new Event('close-cart')),
};

export const CartDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const cartItemCount = useCartStore(state => state.itemCount);
  const setItemCount = useCartStore(state => state.setItemCount);

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

  // Mock cart items
  const items = cartItemCount > 0 ? [
    {
      id: '1',
      name: 'Summer Floral Midi Dress',
      price: 320000,
      image: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=400&q=80',
      variant: 'Red / M',
      quantity: cartItemCount
    }
  ] : [];

  const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
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
                Your Cart ({cartItemCount})
              </h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-surface rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-textSecondary">
                  <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center mb-2">
                    <ShoppingBag size={48} className="text-gray-300" />
                  </div>
                  <h3 className="text-lg font-medium text-textPrimary">Your cart is empty</h3>
                  <p className="text-sm max-w-[250px]">Looks like you haven't added anything to your cart yet.</p>
                  <Button 
                    className="mt-4" 
                    onClick={() => { setIsOpen(false); }}
                  >
                    Start Shopping
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-4">
                      <img 
                        src={item.image} 
                        alt={item.name} 
                        className="w-24 h-32 object-cover rounded-xl bg-surface"
                      />
                      <div className="flex-1 flex flex-col">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-medium text-sm line-clamp-2">{item.name}</h4>
                            <p className="text-xs text-textSecondary mt-1">{item.variant}</p>
                          </div>
                          <button 
                            className="text-textSecondary hover:text-red-500 transition-colors p-1"
                            onClick={() => setItemCount(0)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        <div className="mt-auto flex items-center justify-between">
                          <span className="font-bold text-primary">{formatKes(item.price)}</span>
                          
                          <div className="flex items-center border border-border rounded-full p-1 bg-surface">
                            <button 
                              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white text-textSecondary"
                              onClick={() => setItemCount(Math.max(0, cartItemCount - 1))}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button 
                              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white text-textSecondary"
                              onClick={() => setItemCount(cartItemCount + 1)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
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
