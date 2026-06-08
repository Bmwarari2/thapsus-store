import { useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Users, Settings, Package, MessageSquare, Download, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import { ImportsPage } from './ImportsPage';

const menu = [
  { label: 'Dashboard',     path: '/admin',           icon: LayoutDashboard },
  { label: 'Products',      path: '/admin/products',  icon: Package },
  { label: 'Orders',        path: '/admin/orders',    icon: ShoppingBag },
  { label: 'Reviews',       path: '/admin/reviews',   icon: MessageSquare },
  { label: 'Customers',     path: '/admin/customers', icon: Users },
  { label: 'Imports',       path: '/admin/imports',   icon: Download },
  { label: 'Pricing Config', path: '/admin/pricing',  icon: Settings },
];

const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => {
  const location = useLocation();
  return (
    <nav className="flex-1 p-4 space-y-1">
      {menu.map(item => {
        const isActive = location.pathname === item.path ||
          (item.path !== '/admin' && location.pathname.startsWith(item.path));
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive
                ? 'bg-primary text-white font-bold'
                : 'text-gray-400 hover:text-white hover:bg-gray-800 font-medium'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

const Dashboard = () => (
  <div className="p-6 md:p-8">
    <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
    <p className="text-textSecondary text-sm">Analytics will appear here once orders start flowing.</p>
  </div>
);

const Placeholder = ({ title }: { title: string }) => (
  <div className="p-6 md:p-8">
    <h1 className="text-2xl font-bold mb-2">{title}</h1>
    <p className="text-textSecondary text-sm">Coming soon.</p>
  </div>
);

export const AdminLayout = () => {
  const user = useAuthStore(state => state.user);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!user) return <Navigate to="/auth/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-surface">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-gray-900 text-white min-h-screen flex-col sticky top-0 shrink-0">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-xl font-black flex items-center">
            Thapsus<span className="text-primary text-2xl leading-none">.</span>
            <span className="text-xs font-bold text-gray-400 ml-2">Admin</span>
          </h2>
        </div>
        <NavLinks />
        <div className="p-4 border-t border-gray-800">
          <Link to="/" className="text-sm text-gray-400 hover:text-white flex items-center gap-2">
            ← Back to Store
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 text-white flex items-center justify-between px-4 h-14 shadow-lg">
        <h2 className="text-lg font-black flex items-center">
          Thapsus<span className="text-primary text-xl leading-none">.</span>
          <span className="text-xs font-bold text-gray-400 ml-1.5">Admin</span>
        </h2>
        <button onClick={() => setDrawerOpen(true)} className="p-2 rounded-lg hover:bg-gray-800">
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="md:hidden fixed inset-0 bg-black/60 z-50"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed inset-y-0 left-0 w-72 bg-gray-900 text-white z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h2 className="text-xl font-black flex items-center">
                  Thapsus<span className="text-primary text-2xl leading-none">.</span>
                  <span className="text-xs font-bold text-gray-400 ml-1.5">Admin</span>
                </h2>
                <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg hover:bg-gray-800">
                  <X size={20} />
                </button>
              </div>
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
              <div className="p-4 border-t border-gray-800">
                <Link to="/" onClick={() => setDrawerOpen(false)} className="text-sm text-gray-400 hover:text-white flex items-center gap-2">
                  ← Back to Store
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden pt-14 md:pt-0">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="products"  element={<Placeholder title="Products Management" />} />
          <Route path="orders"    element={<Placeholder title="Orders Management" />} />
          <Route path="reviews"   element={<Placeholder title="Reviews Moderation" />} />
          <Route path="customers" element={<Placeholder title="Customers" />} />
          <Route path="imports"   element={<ImportsPage />} />
          <Route path="*"         element={<Placeholder title="Coming Soon" />} />
        </Routes>
      </main>
    </div>
  );
};
