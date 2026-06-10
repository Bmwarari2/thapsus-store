import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  apiGetPurchasing,
  apiMarkPurchased,
  type PurchasingOrder,
} from '../../lib/api';

const PLATFORM_BADGE: Record<string, string> = {
  shein: 'bg-black text-white',
  aliexpress: 'bg-orange-100 text-orange-700',
  amazon: 'bg-yellow-100 text-yellow-800',
  manual: 'bg-gray-100 text-gray-600',
};

function formatKes(cents: number) {
  return `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;
}

function formatSource(cents: number, currency: string) {
  const symbol = currency === 'GBP' ? '£' : '$';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Rolling fulfilment report: every paid order line that still needs to be
 * bought from its source site, oldest payment first. Ticking the last line of
 * an order advances it to 'sourcing' and notifies the customer.
 */
export const PurchasingPage = () => {
  const queryClient = useQueryClient();
  const [includeDone, setIncludeDone] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['admin-purchasing', includeDone],
    queryFn: () => apiGetPurchasing(includeDone),
    refetchInterval: 15_000,
  });

  const { mutate: markPurchased, isPending } = useMutation({
    mutationFn: ({ itemId, purchased }: { itemId: string; purchased: boolean }) =>
      apiMarkPurchased(itemId, purchased),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-purchasing'] });
      if (result.orderAdvanced) {
        toast.success('All items bought — order moved to Sourcing and the customer was notified.');
      }
    },
    onError: () => toast.error('Could not update the item.'),
  });

  const openItems = orders.reduce((s, o) => s + o.items.filter(i => !i.purchasedAt).length, 0);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ShoppingCart size={24} /> Purchasing
          </h1>
          <p className="text-textSecondary text-sm mt-1">
            Paid orders waiting to be bought from the source sites — oldest payment first.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {openItems > 0 && (
            <span className="text-sm font-semibold text-amber-700 bg-amber-50 px-4 py-2 rounded-full">
              {openItems} item{openItems !== 1 ? 's' : ''} to buy
            </span>
          )}
          <label className="flex items-center gap-2 text-sm text-textSecondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => setIncludeDone(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Show purchased
          </label>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-purchasing'] })}
            className="p-2 hover:bg-white rounded-lg transition-colors text-textSecondary"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 flex justify-center">
          <Loader2 size={28} className="animate-spin text-textSecondary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-16 text-center">
          <CheckCircle2 size={40} className="mx-auto text-green-500 mb-4" />
          <p className="font-bold">Nothing to purchase.</p>
          <p className="text-sm text-textSecondary mt-1">Every paid order has been sourced. New payments appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order: PurchasingOrder) => (
            <div key={order.orderId} className="bg-white border border-border rounded-2xl overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-border bg-surface/50">
                <div className="flex items-center gap-3">
                  <span className="font-bold">{order.orderNumber}</span>
                  <span className="text-sm text-textSecondary">{order.customerName ?? 'Customer'}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    order.orderStatus === 'sourcing' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {order.orderStatus === 'sourcing' ? 'SOURCING' : 'PAID'}
                  </span>
                </div>
                <span className="text-xs text-textSecondary">Paid {formatDate(order.paidAt)}</span>
              </div>

              <div className="divide-y divide-border">
                {order.items.map((item) => (
                  <div key={item.itemId} className={`flex items-center gap-4 px-6 py-4 ${item.purchasedAt ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!item.purchasedAt}
                      disabled={isPending}
                      onChange={(e) => markPurchased({ itemId: item.itemId, purchased: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                      title={item.purchasedAt ? 'Mark as not purchased' : 'Mark as purchased'}
                    />
                    {item.image && (
                      <img src={item.image} alt="" className="w-14 h-16 object-cover rounded-lg bg-surface shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm line-clamp-1 ${item.purchasedAt ? 'line-through' : ''}`}>{item.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-textSecondary">
                        {item.attrs && <span>{Object.values(item.attrs).join(' / ')}</span>}
                        <span className="font-semibold">Qty: {item.qty}</span>
                        <span>Sold at {formatKes(item.unitPriceCents)}</span>
                        <span>Buy at ~{formatSource(item.sourcePriceCents, item.sourceCurrency)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${PLATFORM_BADGE[item.sourcePlatform ?? 'manual'] ?? PLATFORM_BADGE.manual}`}>
                        {item.sourcePlatform ?? 'manual'}
                      </span>
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                        >
                          Open <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="text-xs text-textSecondary">no link</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
