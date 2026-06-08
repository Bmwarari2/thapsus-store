import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Package, Heart, MapPin, Bell, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCartStore } from '../../stores/cartStore';

const tabs = [
  { id: 'profile', icon: User, label: 'Profile', path: '/account' },
  { id: 'orders', icon: Package, label: 'Orders', path: '/account/orders' },
  { id: 'wishlist', icon: Heart, label: 'Wishlist', path: '/account/wishlist' },
  { id: 'addresses', icon: MapPin, label: 'Addresses', path: '/account/addresses' },
  { id: 'notifications', icon: Bell, label: 'Notifications', path: '/account/notifications' },
];

// Placeholder for tab content components
const ProfileTab = () => <div className="p-6 bg-white rounded-2xl border border-border"><h2 className="text-xl font-bold mb-4">Profile Information</h2><p>Name: Jane Doe</p><p>Email: jane@example.com</p></div>;
const OrdersTab = () => <div className="p-6 bg-white rounded-2xl border border-border"><h2 className="text-xl font-bold mb-4">Order History</h2><p className="text-textSecondary">No recent orders found.</p></div>;
const WishlistTab = () => <div className="p-6 bg-white rounded-2xl border border-border"><h2 className="text-xl font-bold mb-4">Your Wishlist</h2><p className="text-textSecondary">Your wishlist is empty.</p></div>;
const AddressesTab = () => <div className="p-6 bg-white rounded-2xl border border-border"><h2 className="text-xl font-bold mb-4">Saved Addresses</h2><p className="text-textSecondary">No addresses saved.</p></div>;
const NotificationsTab = () => <div className="p-6 bg-white rounded-2xl border border-border"><h2 className="text-xl font-bold mb-4">Notifications</h2><p className="text-textSecondary">You're all caught up!</p></div>;

export const AccountHub = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore(state => state.logout);
  const setItemCount = useCartStore(state => state.setItemCount);

  const handleSignOut = () => {
    logout();
    setItemCount(0);
    navigate('/');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-black mb-8">My Account</h1>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex md:flex-col overflow-x-auto hide-scrollbar gap-2 md:gap-1 pb-4 md:pb-0 border-b md:border-b-0 border-border md:pr-4">
            {tabs.map((tab) => {
              const isActive = location.pathname === tab.path || (tab.path !== '/account' && location.pathname.startsWith(tab.path));
              return (
                <Link
                  key={tab.id}
                  to={tab.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl whitespace-nowrap transition-colors ${
                    isActive 
                      ? 'bg-primary/10 text-primary font-bold' 
                      : 'text-textSecondary hover:bg-surface hover:text-textPrimary font-medium'
                  }`}
                >
                  <tab.icon size={18} className={isActive ? 'text-primary' : 'text-textSecondary'} />
                  {tab.label}
                </Link>
              );
            })}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-4 py-3 rounded-xl whitespace-nowrap transition-colors text-red-500 hover:bg-red-50 font-medium mt-2 md:mt-4 w-full text-left"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </nav>
        </aside>

        {/* Tab Content */}
        <div className="flex-1 min-w-0">
          <Routes>
            <Route index element={<ProfileTab />} />
            <Route path="orders" element={<OrdersTab />} />
            <Route path="wishlist" element={<WishlistTab />} />
            <Route path="addresses" element={<AddressesTab />} />
            <Route path="notifications" element={<NotificationsTab />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};
