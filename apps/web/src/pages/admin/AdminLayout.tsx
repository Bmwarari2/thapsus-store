import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Users, Settings, Package, MessageSquare } from 'lucide-react';

const AdminSidebar = () => {
  const location = useLocation();
  const menu = [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { label: 'Products', path: '/admin/products', icon: Package },
    { label: 'Orders', path: '/admin/orders', icon: ShoppingBag },
    { label: 'Reviews', path: '/admin/reviews', icon: MessageSquare },
    { label: 'Customers', path: '/admin/customers', icon: Users },
    { label: 'Pricing Config', path: '/admin/pricing', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col sticky top-0">
      <div className="p-6 border-b border-gray-800">
        <h2 className="text-xl font-black flex items-center">
          Thapsus<span className="text-primary text-2xl leading-none">.</span>
          <span className="text-xs font-bold text-gray-400 ml-2">Admin</span>
        </h2>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {menu.map(item => {
          const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-primary text-white font-bold' : 'text-gray-400 hover:text-white hover:bg-gray-800 font-medium'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800">
        <Link to="/" className="text-sm text-gray-400 hover:text-white flex items-center gap-2">
          ← Back to Store
        </Link>
      </div>
    </aside>
  );
};

// Placeholders for Admin Pages
const Dashboard = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {[
        { label: "Today's Revenue", value: "KES 142,500" },
        { label: "Orders Today", value: "24" },
        { label: "Total Products", value: "1,240" },
        { label: "Active Users", value: "892" },
      ].map((stat, i) => (
        <div key={i} className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <p className="text-sm text-textSecondary font-medium">{stat.label}</p>
          <p className="text-2xl font-black mt-2 text-primary">{stat.value}</p>
        </div>
      ))}
    </div>
  </div>
);

const Products = () => <div className="p-8"><h1 className="text-2xl font-bold">Products Management</h1><p className="mt-4 text-textSecondary">Data table coming soon.</p></div>;
const Orders = () => <div className="p-8"><h1 className="text-2xl font-bold">Orders Management</h1><p className="mt-4 text-textSecondary">Data table coming soon.</p></div>;

export const AdminLayout = () => {
  return (
    <div className="flex min-h-screen bg-surface">
      <AdminSidebar />
      <main className="flex-1 overflow-x-hidden">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="orders" element={<Orders />} />
          <Route path="*" element={<div className="p-8">Coming Soon</div>} />
        </Routes>
      </main>
    </div>
  );
};
