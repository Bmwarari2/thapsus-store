import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Package, Heart, MapPin, Bell, LogOut, Loader2, Trash2, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useCartStore } from '../../stores/cartStore';
import { useWishlist } from '../../hooks/useWishlist';
import { Button } from '../../components/ui/Button';
import { apiGetMyOrders } from '../../lib/api';
import { formatKes, formatDate, imageAtWidth } from '../../lib/utils';

const tabs = [
  { id: 'profile',       icon: User,    label: 'Profile',       path: '/account' },
  { id: 'orders',        icon: Package, label: 'Orders',        path: '/account/orders' },
  { id: 'wishlist',      icon: Heart,   label: 'Wishlist',      path: '/account/wishlist' },
  { id: 'addresses',     icon: MapPin,  label: 'Addresses',     path: '/account/addresses' },
  { id: 'notifications', icon: Bell,    label: 'Notifications', path: '/account/notifications' },
];

const ProfileTab = () => {
  const user = useAuthStore(state => state.user);
  return (
    <div className="p-6 bg-white rounded-2xl border border-border">
      <h2 className="text-xl font-bold mb-4">Profile Information</h2>
      <div className="space-y-2 text-sm">
        <p><span className="text-textSecondary">Name:</span> {user?.name ?? '—'}</p>
        <p><span className="text-textSecondary">Email:</span> {user?.email ?? '—'}</p>
        <p><span className="text-textSecondary">Role:</span> {user?.role ?? '—'}</p>
      </div>
    </div>
  );
};

/** Human-readable order status chips, matching the OrderDetailPage timeline. */
const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting Payment',
  payment_confirmed: 'Payment Confirmed',
  sourcing: 'Sourcing Item',
  shipped_to_hub: 'Shipped to Kenya',
  at_hub: 'Arrived in Kenya',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refund_requested: 'Refund Requested',
  refunded: 'Refunded',
};

const statusChipClass = (status: string) =>
  status === 'delivered' ? 'bg-green-100 text-green-700'
  : ['cancelled', 'refunded', 'refund_requested'].includes(status) ? 'bg-red-100 text-red-600'
  : 'bg-blue-100 text-blue-700';

const OrdersTab = () => {
  const { data, isLoading } = useQuery({ queryKey: ['my-orders'], queryFn: () => apiGetMyOrders() });
  const orders = data?.orders ?? [];

  return (
    <div className="p-6 bg-white rounded-2xl border border-border">
      <h2 className="text-xl font-bold mb-4">Order History</h2>
      {isLoading ? (
        <div className="py-10 flex justify-center"><Loader2 size={22} className="animate-spin text-textSecondary" /></div>
      ) : orders.length === 0 ? (
        <p className="text-textSecondary text-sm">No orders yet. Anything you buy will show up here with its delivery status.</p>
      ) : (
        <div className="divide-y divide-border">
          {orders.map(o => (
            <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between gap-4 py-4 group">
              <div className="min-w-0">
                <p className="font-semibold text-sm group-hover:text-primary transition-colors">#{o.orderNumber}</p>
                <p className="text-xs text-textSecondary mt-0.5">{formatDate(o.createdAt)} · {formatKes(o.totalCents)}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusChipClass(o.status)}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <ChevronRight size={16} className="text-textSecondary" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const WishlistTab = () => {
  const { items, isLoading, toggle } = useWishlist();

  return (
    <div className="p-6 bg-white rounded-2xl border border-border">
      <h2 className="text-xl font-bold mb-4">Your Wishlist</h2>
      {isLoading ? (
        <div className="py-10 flex justify-center"><Loader2 size={22} className="animate-spin text-textSecondary" /></div>
      ) : items.length === 0 ? (
        <p className="text-textSecondary text-sm">
          Your wishlist is empty. Tap the ♥ on any product to save it here — it syncs to your account, not this device.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.product_id} className="flex items-center gap-4 py-4">
              <Link to={`/products/${item.slug}`} className="shrink-0">
                {item.image ? (
                  <img src={imageAtWidth(item.image, 320)} alt="" className="w-16 h-16 rounded-xl object-cover bg-surface" loading="lazy" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-surface" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/products/${item.slug}`} className="text-sm font-medium line-clamp-2 hover:text-primary transition-colors">
                  {item.name}
                </Link>
                <p className="text-sm font-bold mt-1">{formatKes(item.sell_price_kes_cents)}</p>
              </div>
              <button
                onClick={() => toggle(item.product_id)}
                className="p-2 text-textSecondary hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                title="Remove from wishlist"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
const AddressesTab     = () => <div className="p-6 bg-white rounded-2xl border border-border"><h2 className="text-xl font-bold mb-4">Saved Addresses</h2><p className="text-textSecondary text-sm">No addresses saved.</p></div>;
const NotificationsTab = () => <div className="p-6 bg-white rounded-2xl border border-border"><h2 className="text-xl font-bold mb-4">Notifications</h2><p className="text-textSecondary text-sm">You're all caught up!</p></div>;

const LoggedOutPrompt = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center px-4">
    <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mb-6">
      <User size={40} className="text-gray-300" />
    </div>
    <h2 className="text-2xl font-black text-textPrimary mb-2">Welcome to Thapsus</h2>
    <p className="text-textSecondary mb-8 max-w-xs">Log in or create an account to view your orders, wishlist, and saved addresses.</p>
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <Link to="/auth/login" className="flex-1">
        <Button className="w-full" size="lg">Log In</Button>
      </Link>
      <Link to="/auth/signup" className="flex-1">
        <Button variant="outline" className="w-full" size="lg">Sign Up</Button>
      </Link>
    </div>
  </div>
);

export const AccountHub = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const setItemCount = useCartStore(state => state.setItemCount);

  const handleSignOut = () => {
    logout();
    setItemCount(0);
    navigate('/');
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-black mb-2">My Account</h1>
        <LoggedOutPrompt />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-black mb-8">My Account</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex md:flex-col overflow-x-auto hide-scrollbar gap-2 md:gap-1 pb-4 md:pb-0 border-b md:border-b-0 border-border md:pr-4">
            {tabs.map((tab) => {
              const isActive = location.pathname === tab.path ||
                (tab.path !== '/account' && location.pathname.startsWith(tab.path));
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
            <Route index                  element={<ProfileTab />} />
            <Route path="orders"          element={<OrdersTab />} />
            <Route path="wishlist"        element={<WishlistTab />} />
            <Route path="addresses"       element={<AddressesTab />} />
            <Route path="notifications"   element={<NotificationsTab />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};
