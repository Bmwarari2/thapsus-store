import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { formatKes } from '../../lib/utils';
import { useCartStore } from '../../stores/cartStore';

export const CartPage = () => {
  const cartItemCount = useCartStore(state => state.itemCount);
  const setItemCount = useCartStore(state => state.setItemCount);

  // Mock
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

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="w-32 h-32 bg-surface rounded-full flex items-center justify-center mb-6">
          <ShoppingBag size={64} className="text-gray-300" />
        </div>
        <h1 className="text-3xl font-black mb-4">Your cart is empty</h1>
        <p className="text-textSecondary mb-8 max-w-md">Looks like you haven't added anything to your cart yet. Discover our latest fashion trends.</p>
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
          {items.map((item) => (
            <div key={item.id} className="flex gap-4 sm:gap-6 bg-white p-4 rounded-2xl border border-border">
              <img 
                src={item.image} 
                alt={item.name} 
                className="w-24 h-32 sm:w-32 sm:h-40 object-cover rounded-xl bg-surface"
              />
              <div className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-bold text-lg leading-tight mb-1">{item.name}</h3>
                    <p className="text-sm text-textSecondary">{item.variant}</p>
                  </div>
                  <button 
                    className="text-textSecondary hover:text-red-500 text-sm font-medium transition-colors"
                    onClick={() => setItemCount(0)}
                  >
                    Remove
                  </button>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                  <div className="flex items-center border border-border rounded-full p-1 bg-surface w-fit">
                    <button 
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white text-textSecondary text-lg font-medium transition-colors"
                      onClick={() => setItemCount(Math.max(0, cartItemCount - 1))}
                    >
                      -
                    </button>
                    <span className="w-10 text-center font-bold">{item.quantity}</span>
                    <button 
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white text-textSecondary text-lg font-medium transition-colors"
                      onClick={() => setItemCount(cartItemCount + 1)}
                    >
                      +
                    </button>
                  </div>
                  
                  <span className="font-black text-xl text-primary">{formatKes(item.price)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:w-96 shrink-0 h-fit sticky top-24">
          <div className="bg-surface rounded-3xl p-6 sm:p-8">
            <h3 className="font-bold text-xl mb-6">Order Summary</h3>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-textSecondary">
                <span>Subtotal ({items.length} items)</span>
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
