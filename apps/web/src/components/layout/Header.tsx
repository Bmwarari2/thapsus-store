import { Link } from 'react-router-dom';
import { Search, ShoppingCart, Heart, User, Menu } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCartStore } from '../../stores/cartStore';

export const Header = () => {
  const cartItemCount = useCartStore((state) => state.itemCount);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-border shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* Mobile Menu & Logo */}
        <div className="flex items-center gap-4">
          <button className="md:hidden p-2 -ml-2 text-textPrimary hover:bg-surface rounded-full">
            <Menu size={24} />
          </button>
          <Link to="/" className="text-2xl font-black tracking-tight text-textPrimary relative flex items-center">
            Thapsus
            <span className="text-primary ml-0.5 text-3xl leading-none">.</span>
            <span className="text-xs font-bold text-textSecondary hidden sm:inline-block ml-1 mt-1">ke</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/products" className="text-sm font-semibold text-textSecondary hover:text-primary transition-colors">Women</Link>
          <Link to="/products" className="text-sm font-semibold text-textSecondary hover:text-primary transition-colors">Shoes</Link>
          <Link to="/products" className="text-sm font-semibold text-textSecondary hover:text-primary transition-colors">Beauty</Link>
          <Link to="/products" className="text-sm font-semibold text-textSecondary hover:text-primary transition-colors">Home</Link>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:block relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary" />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="bg-surface border-none rounded-full h-10 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary focus:bg-white transition-all w-[200px] lg:w-[300px]"
            />
          </div>

          <button className="md:hidden p-2 text-textPrimary hover:bg-surface rounded-full">
            <Search size={22} />
          </button>

          <Link to="/account/wishlist" className="hidden sm:flex p-2 text-textPrimary hover:bg-surface rounded-full transition-colors">
            <Heart size={22} />
          </Link>

          <Link to="/account" className="hidden sm:flex p-2 text-textPrimary hover:bg-surface rounded-full transition-colors">
            <User size={22} />
          </Link>

          <button 
            onClick={(e) => {
              e.preventDefault();
              document.dispatchEvent(new Event('open-cart'));
            }}
            className="p-2 relative text-textPrimary hover:bg-surface rounded-full transition-colors"
          >
            <ShoppingCart size={22} />
            {cartItemCount > 0 && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white"
              >
                {cartItemCount}
              </motion.span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
