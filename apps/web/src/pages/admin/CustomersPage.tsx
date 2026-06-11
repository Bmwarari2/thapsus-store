import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, ShoppingBag } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { apiAdminGetCustomers } from '../../lib/api';
import { formatKes, formatDate } from '../../lib/utils';

export const CustomersPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-customers', submitted, page],
    queryFn: () => apiAdminGetCustomers({ q: submitted || undefined, page }),
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-textSecondary text-sm mt-1">{total} registered customer{total === 1 ? '' : 's'} — click one to see their orders</p>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); setPage(1); setSubmitted(search.trim()); }}
          className="relative w-72"
        >
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textSecondary" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 size={24} className="animate-spin text-textSecondary" /></div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-textSecondary text-sm">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-textSecondary text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Phone</th>
                  <th className="text-left px-4 py-3">Joined</th>
                  <th className="text-right px-4 py-3">Orders</th>
                  <th className="text-right px-4 py-3">Total Spent</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.full_name ?? '—'}</p>
                      <p className="text-xs text-textSecondary">{c.email}</p>
                    </td>
                    <td className="px-4 py-3 text-textSecondary whitespace-nowrap">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-textSecondary whitespace-nowrap">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{c.order_count}</td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatKes(Number(c.total_spent_cents))}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/orders?user=${c.id}`}
                        className="inline-flex items-center gap-1.5 text-primary text-xs font-semibold hover:underline"
                      >
                        <ShoppingBag size={13} /> View orders
                      </Link>
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
    </div>
  );
};
