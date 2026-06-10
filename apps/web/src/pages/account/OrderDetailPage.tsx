import { Link, useParams } from 'react-router-dom';
import { Package, Truck, CheckCircle2, FileText, Plane, Loader2, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { formatKes, formatDate } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { apiGetOrder } from '../../lib/api';

const STATUS_STEPS = [
  { id: 'pending_payment',   label: 'Awaiting Payment',     icon: Wallet },
  { id: 'payment_confirmed', label: 'Payment Confirmed',    icon: FileText },
  { id: 'sourcing',          label: 'Sourcing Item',        icon: Package },
  { id: 'shipped_to_hub',    label: 'Shipped to Kenya Hub', icon: Plane },
  { id: 'at_hub',            label: 'Arrived in Kenya',     icon: Package },
  { id: 'out_for_delivery',  label: 'Out for Delivery',     icon: Truck },
  { id: 'delivered',         label: 'Delivered',            icon: CheckCircle2 },
];

const TERMINAL_BADGES: Record<string, 'warning' | 'sale'> = {
  cancelled: 'warning',
  refund_requested: 'warning',
  refunded: 'warning',
};

export const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => apiGetOrder(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-32 flex justify-center">
        <Loader2 className="animate-spin text-textSecondary" size={32} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <p className="text-xl font-bold">Order not found.</p>
        <Link to="/account/orders" className="text-primary underline mt-4 block">View your orders</Link>
      </div>
    );
  }

  const { order, items } = data;
  const currentIndex = STATUS_STEPS.findIndex(s => s.id === order.status);
  const isTerminal = order.status in TERMINAL_BADGES;
  const addr = order.deliveryAddressSnap;
  const dutiesAndTaxes = order.dutyCents + order.vatCents;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black">Order {order.orderNumber}</h1>
            <Badge variant={TERMINAL_BADGES[order.status] ?? 'warning'}>
              {order.status.replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-textSecondary">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/account/support">
            <Button className="h-10 text-sm">Need Help?</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">

          {/* Timeline */}
          {!isTerminal && (
            <div className="bg-white border border-border rounded-2xl p-6">
              <h3 className="font-bold text-lg mb-6">Order Status</h3>
              <div className="relative">
                <div className="absolute left-[19px] top-2 bottom-6 w-0.5 bg-gray-200" />

                <div className="space-y-6 relative z-10">
                  {STATUS_STEPS.map((step, index) => {
                    const isCompleted = currentIndex >= 0 && index <= currentIndex;
                    const isCurrent = index === currentIndex;

                    return (
                      <div key={step.id} className={`flex items-start gap-4 ${isCompleted ? '' : 'opacity-50'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
                          isCompleted ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-400'
                        } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}>
                          <step.icon size={18} />
                        </div>
                        <div className="pt-2">
                          <p className={`font-bold ${isCompleted ? 'text-textPrimary' : 'text-textSecondary'}`}>
                            {step.label}
                          </p>
                          {isCurrent && (
                            <p className="text-sm text-primary mt-1 font-medium">Current Status</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="bg-white border border-border rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-4">Items Ordered</h3>
            <div className="space-y-4">
              {items.map(item => (
                <div key={item.id} className="flex gap-4 p-4 border border-border rounded-xl">
                  {item.productImageSnap && (
                    <img src={item.productImageSnap} alt={item.productNameSnap} className="w-20 h-24 object-cover rounded-lg bg-surface" />
                  )}
                  <div className="flex-1 flex flex-col justify-center">
                    <p className="font-medium line-clamp-1">{item.productNameSnap}</p>
                    {item.variantAttrsSnap && (
                      <p className="text-sm text-textSecondary mt-1">
                        {Object.values(item.variantAttrsSnap).join(' / ')}
                      </p>
                    )}
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-sm">Qty: {item.qty}</span>
                      <span className="font-bold">{formatKes(item.totalCents)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <div className="bg-white border border-border rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-4">Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-textSecondary">
                <span>Items</span>
                <span>{formatKes(order.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>Delivery</span>
                <span>{formatKes(order.shippingCents)}</span>
              </div>
              {dutiesAndTaxes > 0 && (
                <div className="flex justify-between text-textSecondary">
                  <span>Import duties & taxes</span>
                  <span>{formatKes(dutiesAndTaxes)}</span>
                </div>
              )}
              {order.discountCents > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatKes(order.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-3 border-t border-border mt-3">
                <span>Total</span>
                <span className="text-primary">{formatKes(order.totalCents)}</span>
              </div>
            </div>
          </div>

          {addr && (
            <div className="bg-white border border-border rounded-2xl p-6">
              <h3 className="font-bold text-sm mb-2 text-textSecondary uppercase tracking-wider">Delivery Details</h3>
              <p className="font-bold">{addr.fullName}</p>
              <p className="text-sm text-textSecondary mt-1">
                {addr.addressLine}<br />
                {addr.town}, {addr.county}<br />
                {addr.phone}
              </p>
              {order.estimatedDeliveryAt && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-textSecondary uppercase tracking-wider font-bold mb-1">Est. Delivery</p>
                  <p className="text-sm font-medium">{formatDate(order.estimatedDeliveryAt)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
