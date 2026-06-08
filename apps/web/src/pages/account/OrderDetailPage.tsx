import { Link } from 'react-router-dom';
import { Package, Truck, CheckCircle2, FileText, ExternalLink } from 'lucide-react';
import { formatKes, formatDate } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

// Mock data
const MOCK_ORDER = {
  id: 'uuid',
  orderNumber: 'THX-20260608-00042',
  status: 'in_transit',
  trackingNumber: 'KQ123456KE',
  items: [
    {
      id: 'item-1',
      productName: 'Summer Floral Midi Dress',
      productSlug: 'summer-floral-midi-dress',
      images: ['https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=100&q=80'],
      variant: 'Red / M',
      quantity: 2,
      unitPriceKesCents: 320000,
      linePriceKesCents: 640000
    }
  ],
  deliveryAddress: {
    label: 'Home',
    line1: '123 Westlands Ave',
    city: 'Nairobi',
    phone: '+254712345678'
  },
  subtotalKesCents: 640000,
  shippingKesCents: 85000,
  taxKesCents: 43000,
  totalKesCents: 768000,
  estimatedDelivery: '2026-06-22',
  createdAt: '2026-06-08T10:00:00Z'
};

const STATUS_STEPS = [
  { id: 'payment_confirmed', label: 'Payment Confirmed', icon: FileText },
  { id: 'processing', label: 'Processing', icon: Package },
  { id: 'shipped', label: 'Shipped', icon: Truck },
  { id: 'in_transit', label: 'In Transit', icon: Truck },
  { id: 'delivered', label: 'Delivered', icon: CheckCircle2 },
];

export const OrderDetailPage = () => {
  // Find current step index
  const currentIndex = STATUS_STEPS.findIndex(s => s.id === MOCK_ORDER.status);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black">Order {MOCK_ORDER.orderNumber}</h1>
            <Badge variant="warning">{MOCK_ORDER.status.replace('_', ' ').toUpperCase()}</Badge>
          </div>
          <p className="text-sm text-textSecondary">Placed on {formatDate(MOCK_ORDER.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 text-sm"><FileText size={16} className="mr-2" /> Invoice</Button>
          <Button className="h-10 text-sm">Need Help?</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Timeline */}
          <div className="bg-white border border-border rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-6">Order Status</h3>
            <div className="relative">
              {/* Vertical Line */}
              <div className="absolute left-[19px] top-2 bottom-6 w-0.5 bg-gray-200" />
              
              <div className="space-y-6 relative z-10">
                {STATUS_STEPS.map((step, index) => {
                  const isCompleted = index <= currentIndex;
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
                          <p className="text-sm text-primary mt-1 font-medium flex items-center gap-1">
                            Current Status
                            {step.id === 'in_transit' && MOCK_ORDER.trackingNumber && (
                              <span className="text-textSecondary font-normal ml-2 flex items-center">
                                Tracking: {MOCK_ORDER.trackingNumber} 
                                <ExternalLink size={14} className="ml-1 cursor-pointer hover:text-primary" />
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border border-border rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-4">Items Ordered</h3>
            <div className="space-y-4">
              {MOCK_ORDER.items.map(item => (
                <div key={item.id} className="flex gap-4 p-4 border border-border rounded-xl">
                  <img src={item.images[0]} alt={item.productName} className="w-20 h-24 object-cover rounded-lg bg-surface" />
                  <div className="flex-1 flex flex-col justify-center">
                    <Link to={`/products/${item.productSlug}`} className="font-medium hover:text-primary transition-colors line-clamp-1">{item.productName}</Link>
                    <p className="text-sm text-textSecondary mt-1">Variant: {item.variant}</p>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-sm">Qty: {item.quantity}</span>
                      <span className="font-bold">{formatKes(item.linePriceKesCents)}</span>
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
                <span>Subtotal</span>
                <span>{formatKes(MOCK_ORDER.subtotalKesCents)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>Shipping</span>
                <span>{formatKes(MOCK_ORDER.shippingKesCents)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>Taxes</span>
                <span>{formatKes(MOCK_ORDER.taxKesCents)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-3 border-t border-border mt-3">
                <span>Total</span>
                <span className="text-primary">{formatKes(MOCK_ORDER.totalKesCents)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded-2xl p-6">
            <h3 className="font-bold text-sm mb-2 text-textSecondary uppercase tracking-wider">Delivery Details</h3>
            <p className="font-bold">{MOCK_ORDER.deliveryAddress.label}</p>
            <p className="text-sm text-textSecondary mt-1">
              {MOCK_ORDER.deliveryAddress.line1}<br/>
              {MOCK_ORDER.deliveryAddress.city}<br/>
              {MOCK_ORDER.deliveryAddress.phone}
            </p>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-textSecondary uppercase tracking-wider font-bold mb-1">Est. Delivery</p>
              <p className="text-sm font-medium">{formatDate(MOCK_ORDER.estimatedDelivery)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
