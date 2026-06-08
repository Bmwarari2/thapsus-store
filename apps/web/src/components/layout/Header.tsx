import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Heart, User, Menu, X, LogOut, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';

const NAV_LINKS = [
  { label: 'Women',       path: '/products?category=clothing' },
  { label: 'Electronics', path: '/products?category=electronics' },
  { label: 'Beauty',      path: '/products?category=beauty-health' },
  { label: 'Home',        path: '/products?category=home-living' },
  { label: 'Kids',        path: '/products?category=kids-baby' },
  { label: 'Accessories', path: '/products?category=accessories' },
];

export const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const cartItemCount = useCartStore(state => state.itemCount);
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const setItemCount = useCartStore(state => state.setItemCount);
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout();
    setItemCount(0);
    setMenuOpen(false);
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-border shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">

          {/* Hamburger & Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-textPrimary hover:bg-surface rounded-full"
              aria-label="Open menu"
            >
              <Menu size={24} />
            </button>
            <Link to="/" className="text-2xl font-black tracking-tight text-textPrimary flex items-center">
              Thapsus
              <span className="text-primary ml-0.5 text-3xl leading-none">.</span>
              <span className="text-xs font-bold text-textSecondary hidden sm:inline-block ml-1 mt-1">ke</span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <Link key={l.path} to={l.path} className="text-sm font-semibold text-textSecondary hover:text-primary transition-colors">
                {l.label}
              </Link>
            ))}
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
              onClick={() => document.dispatchEvent(new Event('open-cart'))}
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

      {/* Mobile Drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 flex flex-col md:hidden"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <span className="text-xl font-black">
                  Thapsus<span className="text-primary">.</span>
                </span>
                <button onClick={() => setMenuOpen(false)} className="p-2 hover:bg-surface rounded-full">
                  <X size={22} />
                </button>
              </div>

              {/* User info or login prompt */}
              <div className="px-5 py-4 border-b border-border">
                {user ? (
                  <div>
                    <p className="font-bold text-textPrimary">{user.name}</p>
                    <p className="text-sm text-textSecondary">{user.email}</p>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <Link
                      to="/auth/login"
                      onClick={() => setMenuOpen(false)}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary text-white font-bold py-2.5 rounded-xl text-sm"
                    >
                      <LogIn size={16} /> Log In
                    </Link>
                    <Link
                      to="/auth/signup"
                      onClick={() => setMenuOpen(false)}
                      className="flex-1 flex items-center justify-center gap-2 border border-border font-bold py-2.5 rounded-xl text-sm"
                    >
                      Sign Up
                    </Link>
                  </div>
                )}
              </div>

              {/* Nav Links */}
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.path}
                    to={l.path}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center px-4 py-3 rounded-xl text-sm font-semibold text-textSecondary hover:bg-surface hover:text-textPrimary transition-colors"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>

              {/* Sign Out */}
              {user && (
                <div className="px-3 py-4 border-t border-border">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={18} /> Sign Out
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
