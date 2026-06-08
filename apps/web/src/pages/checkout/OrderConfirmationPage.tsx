import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { formatKes, formatDate } from '../../lib/utils';

export const OrderConfirmationPage = () => {
  const { id } = useParams();

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center max-w-2xl text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="text-success mb-6"
      >
        <CheckCircle2 size={100} strokeWidth={1.5} />
      </motion.div>
      
      <h1 className="text-3xl font-black mb-2 text-textPrimary">Order Confirmed!</h1>
      <p className="text-textSecondary mb-8">
        Thank you for your purchase. We've received your order and are getting it ready to be shipped.
      </p>

      <div className="w-full bg-surface border border-border rounded-2xl p-6 mb-8 text-left">
        <h3 className="font-bold text-lg mb-4">Order Details</h3>
        
        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <p className="text-textSecondary">Order Number</p>
            <p className="font-bold text-primary">{id || 'THX-20260608-00042'}</p>
          </div>
          <div>
            <p className="text-textSecondary">Order Date</p>
            <p className="font-bold">{formatDate(new Date().toISOString())}</p>
          </div>
          <div>
            <p className="text-textSecondary">Payment Method</p>
            <p className="font-bold">M-Pesa (QKA12B3C4D)</p>
          </div>
          <div>
            <p className="text-textSecondary">Total Amount</p>
            <p className="font-bold">{formatKes(768000)}</p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Shipping Address</p>
          <p className="text-sm text-textSecondary">Jane Doe, 123 Westlands Ave, Nairobi, Kenya. +254 712 345 678</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full">
        <Link to="/account/orders" className="flex-1">
          <Button variant="outline" className="w-full">Track Order</Button>
        </Link>
        <Link to="/" className="flex-1">
          <Button className="w-full">Continue Shopping</Button>
        </Link>
      </div>
    </div>
  );
};
