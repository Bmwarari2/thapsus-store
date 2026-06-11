import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, Package, Banknote, CalendarDays } from 'lucide-react';
import { apiAdminGetAnalytics } from '../../lib/api';
import { formatKes, formatDate, imageAtWidth } from '../../lib/utils';

const kes = (v: string | null) => formatKes(Number(v ?? 0));

export const DashboardPage = () => {
  const { data, isLoading } = useQuery({ queryKey: ['admin-analytics'], queryFn: apiAdminGetAnalytics });

  if (isLoading || !data) {
    return <div className="p-12 flex justify-center"><Loader2 size={24} className="animate-spin text-textSecondary" /></div>;
  }

  const revenueCards = [
    { label: 'Today', value: kes(data.revenue.today), icon: Banknote },
    { label: 'Last 7 days', value: kes(data.revenue.week), icon: CalendarDays },
    { label: 'Last 30 days', value: kes(data.revenue.month), icon: TrendingUp },
    { label: 'All time', value: kes(data.revenue.all_time), icon: Package },
  ];

  const orderEntries = Object.entries(data.orderCounts);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-textSecondary text-sm mb-8">Paid revenue, order pipeline, and best sellers at a glance.</p>

      {/* Revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {revenueCards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 text-textSecondary text-xs uppercase tracking-wide mb-2">
              <c.icon size={14} /> {c.label}
            </div>
            <p className="text-xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Orders by status */}
      <div className="bg-white rounded-2xl border border-border p-6 mb-8">
        <h2 className="font-bold text-lg mb-4">Orders by status</h2>
        {orderEntries.length === 0 ? (
          <p className="text-sm text-textSecondary">No orders yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {orderEntries.map(([status, count]) => (
              <Link
                key={status}
                to={`/admin/orders?status=${status}`}
                className="px-4 py-2 rounded-xl bg-surface hover:bg-gray-200 transition-colors text-sm"
              >
                <span className="font-bold">{count}</span>{' '}
                <span className="text-textSecondary capitalize">{status.replace(/_/g, ' ')}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Top products */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-bold text-lg mb-4">Best sellers</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-textSecondary">No sales yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.topProducts.map(p => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  {p.image ? (
                    <img src={imageAtWidth(p.image, 320)} alt="" className="w-10 h-10 rounded-lg object-cover bg-surface shrink-0" />
                  ) : <div className="w-10 h-10 rounded-lg bg-surface shrink-0" />}
                  <span className="text-sm font-medium truncate flex-1">{p.name}</span>
                  <span className="text-sm text-textSecondary shrink-0">{p.units_sold} sold</span>
                  <span className="text-sm font-semibold shrink-0">{formatKes(Number(p.revenue_cents))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-bold text-lg mb-4">Recent orders</h2>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-textSecondary">No orders yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentOrders.map(o => (
                <Link key={o.id} to="/admin/orders" className="flex items-center justify-between gap-3 py-3 group">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">#{o.order_number}</p>
                    <p className="text-xs text-textSecondary">{o.customer_name ?? 'Customer'} · {formatDate(o.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{formatKes(Number(o.total_cents))}</p>
                    <p className="text-xs text-textSecondary capitalize">{o.status.replace(/_/g, ' ')}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
