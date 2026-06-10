import { Link, useLocation } from 'react-router-dom';
import { Home, Grid, Search, ShoppingCart, User } from 'lucide-react';
import { useCartStore } from '../../stores/cartStore';

export const BottomNav = () => {
  const location = useLocation();
  const cartItemCount = useCartStore((state) => state.itemCount);

  // Hide on checkout and admin routes
  if (location.pathname.startsWith('/checkout') || location.pathname.startsWith('/admin')) {
    return null;
  }

  const tabs = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Grid, label: 'Categories', path: '/categories' },
    { icon: Search, label: 'Search', path: '/search' },
    { icon: ShoppingCart, label: 'Cart', path: '/cart', badge: cartItemCount },
    { icon: User, label: 'Account', path: '/account' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border pb-safe z-40 md:hidden">
      <div className="flex justify-around items-center h-16">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path || (tab.path !== '/' && location.pathname.startsWith(tab.path));
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`relative flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive ? 'text-primary' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <div className="relative">
                <tab.icon size={24} className={isActive ? 'fill-primary/20' : ''} />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 bg-primary text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
