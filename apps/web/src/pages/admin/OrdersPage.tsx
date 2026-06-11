import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  apiAdminGetOrder,
  apiAdminGetOrders,
  apiAdminUpdateOrderStatus,
  type AdminOrder,
} from '../../lib/api';
import { formatKes, imageAtWidth } from '../../lib/utils';

// Must match the API's validStatuses list.
const STATUSES = [
  'payment_confirmed', 'sourcing', 'shipped_to_hub', 'at_hub',
  'out_for_delivery', 'delivered', 'cancelled', 'refund_requested', 'refunded',
] as const;

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const chipClass = (status: string) =>
  status === 'delivered' ? 'bg-green-100 text-green-700'
  : ['cancelled', 'refunded', 'refund_requested'].includes(status) ? 'bg-red-100 text-red-600'
  : status === 'pending_payment' ? 'bg-yellow-100 text-yellow-700'
  : 'bg-blue-100 text-blue-700';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Slide-over with the order's items, customer, and the status controls. */
const OrderDetail = ({ orderId, onClose }: { orderId: string; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: () => apiAdminGetOrder(orderId),
  });
  const [status, setStatus] = useState('');
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState('');

  const { mutate: saveStatus, isPending } = useMutation({
    mutationFn: () => apiAdminUpdateOrderStatus(orderId, {
      status,
      trackingNumber: tracking.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
      setError('');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      setError(err.response?.data?.error?.message ?? 'Failed to update status');
    },
  });

  const order = data?.order;
  const address = order?.deliveryAddressSnap as Record<string, string> | null | undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg">{order ? `Order #${order.orderNumber}` : 'Order'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-lg text-textSecondary"><X size={18} /></button>
        </div>

        {isLoading || !data ? (
          <div className="p-12 flex justify-center"><Loader2 size={22} className="animate-spin text-textSecondary" /></div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Customer */}
            <div>
              <h3 className="text-xs uppercase tracking-wide text-textSecondary mb-2">Customer</h3>
              <p className="text-sm font-semibold">{data.customer?.full_name ?? '—'}</p>
              <p className="text-sm text-textSecondary">{data.customer?.email}</p>
              {data.customer?.phone && <p className="text-sm text-textSecondary">{data.customer.phone}</p>}
              {address && (
                <p className="text-sm text-textSecondary mt-1">
                  {[address.address_line, address.city, address.county].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            {/* Items */}
            <div>
              <h3 className="text-xs uppercase tracking-wide text-textSecondary mb-2">Items</h3>
              <div className="divide-y divide-border border border-border rounded-xl px-4">
                {data.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    {item.productImageSnap ? (
                      <img src={imageAtWidth(item.productImageSnap, 320)} alt="" className="w-12 h-12 rounded-lg object-cover bg-surface shrink-0" />
                    ) : <div className="w-12 h-12 rounded-lg bg-surface shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-2">{item.productNameSnap}</p>
                      {item.variantAttrsSnap && (
                        <p className="text-xs text-textSecondary">
                          {Object.entries(item.variantAttrsSnap).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm">×{item.qty}</p>
                      <p className="text-sm font-semibold">{formatKes(item.totalCents)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-right font-bold mt-2">{order && formatKes(order.totalCents)}</p>
            </div>

            {/* Status */}
            <div>
              <h3 className="text-xs uppercase tracking-wide text-textSecondary mb-2">Update status</h3>
              <p className="text-sm mb-3">
                Current:{' '}
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${chipClass(order!.status)}`}>
                  {label(order!.status)}
                </span>
              </p>
              <div className="space-y-3">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Choose new status —</option>
                  {STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
                </select>
                {status === 'shipped_to_hub' && (
                  <input
                    type="text"
                    value={tracking}
                    onChange={e => setTracking(e.target.value)}
                    placeholder="Tracking number (sent to the customer)"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button onClick={() => saveStatus()} disabled={!status} isLoading={isPending} className="w-full">
                  {isPending ? 'Saving…' : 'Update Status'}
                </Button>
                <p className="text-xs text-textSecondary">
                  The customer sees the new status on their order page immediately and gets an in-app
                  notification (plus an email for shipped/delivered).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const OrdersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const statusFilter = searchParams.get('status') ?? '';
  const userFilter = searchParams.get('user') ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', statusFilter, userFilter, page],
    queryFn: () => apiAdminGetOrders({
      status: statusFilter || undefined,
      user: userFilter || undefined,
      page,
    }),
  });

  const orders: AdminOrder[] = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-textSecondary text-sm mt-1">
            {total} order{total === 1 ? '' : 's'}
            {userFilter && ' for this customer'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {userFilter && (
            <button
              onClick={() => { searchParams.delete('user'); setSearchParams(searchParams); setPage(1); }}
              className="text-sm text-primary hover:underline"
            >
              Clear customer filter
            </button>
          )}
          <select
            value={statusFilter}
            onChange={e => {
              if (e.target.value) searchParams.set('status', e.target.value);
              else searchParams.delete('status');
              setSearchParams(searchParams);
              setPage(1);
            }}
            className="border border-border rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {['pending_payment', ...STATUSES].map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 size={24} className="animate-spin text-textSecondary" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-textSecondary text-sm">No orders match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-textSecondary text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Placed</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-surface/50 transition-colors cursor-pointer" onClick={() => setOpenOrderId(o.id)}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">#{o.orderNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{o.customerName ?? '—'}</p>
                      <p className="text-xs text-textSecondary">{o.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-textSecondary whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatKes(o.totalCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${chipClass(o.status)}`}>
                        {label(o.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-primary text-xs font-semibold">
                        Manage <ExternalLink size={12} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border text-sm">
            <span className="text-textSecondary">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {openOrderId && <OrderDetail orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </div>
  );
};
