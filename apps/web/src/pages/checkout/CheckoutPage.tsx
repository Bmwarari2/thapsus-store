import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, MapPin } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { formatKes } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCartStore } from '../../stores/cartStore';

export const CheckoutPage = () => {
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();
  const setItemCount = useCartStore(state => state.setItemCount);

  const handlePayment = () => {
    setIsProcessing(true);
    toast.loading('Sending prompt to your phone...', { id: 'mpesa' });
    
    // Simulate M-Pesa Flow
    setTimeout(() => {
      toast.success('Payment confirmed!', { id: 'mpesa' });
      setIsProcessing(false);
      setItemCount(0);
      navigate('/orders/confirmation/THX-20260608-00042');
    }, 4000);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-black mb-8 text-textPrimary">Checkout</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-8">
          
          {/* Step 1: Address */}
          <div className={`p-6 rounded-2xl border transition-colors ${step === 1 ? 'border-primary bg-white shadow-sm' : 'border-border bg-surface'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${step === 1 ? 'bg-primary' : 'bg-gray-400'}`}>1</span>
                Delivery Address
              </h2>
              {step > 1 && (
                <button onClick={() => setStep(1)} className="text-sm text-primary font-medium">Edit</button>
              )}
            </div>
            
            {step === 1 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="border-2 border-primary rounded-xl p-4 bg-primary/5 relative cursor-pointer">
                    <div className="absolute top-4 right-4 text-primary">
                      <Check size={20} />
                    </div>
                    <div className="flex items-center gap-2 font-bold mb-2">
                      <MapPin size={18} /> Home
                    </div>
                    <p className="text-sm text-textSecondary">Jane Doe<br/>123 Westlands Ave<br/>Nairobi<br/>+254 712 345 678</p>
                  </div>
                  <div className="border border-border rounded-xl p-4 hover:border-gray-300 transition-colors cursor-pointer flex flex-col items-center justify-center text-textSecondary hover:text-textPrimary bg-white">
                    <span className="text-2xl mb-2">+</span>
                    <span className="font-medium text-sm">Add New Address</span>
                  </div>
                </div>
                <Button onClick={() => setStep(2)}>Continue to Review</Button>
              </motion.div>
            )}
          </div>

          {/* Step 2: Review Order */}
          <div className={`p-6 rounded-2xl border transition-colors ${step === 2 ? 'border-primary bg-white shadow-sm' : 'border-border bg-surface'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${step === 2 ? 'bg-primary' : 'bg-gray-400'}`}>2</span>
                Review Order
              </h2>
              {step > 2 && (
                <button onClick={() => setStep(2)} className="text-sm text-primary font-medium">Edit</button>
              )}
            </div>
            
            {step === 2 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <div className="flex gap-4 border-b border-border pb-4 mb-4">
                  <img src="https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=100&q=80" alt="Dress" className="w-16 h-20 object-cover rounded-lg" />
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">Summer Floral Midi Dress</h4>
                    <p className="text-xs text-textSecondary mt-1">Red / M</p>
                    <p className="font-bold text-sm text-primary mt-2">{formatKes(320000)} <span className="font-normal text-textSecondary ml-1">x 2</span></p>
                  </div>
                </div>
                <Button onClick={() => setStep(3)}>Continue to Payment</Button>
              </motion.div>
            )}
          </div>

          {/* Step 3: Payment */}
          <div className={`p-6 rounded-2xl border transition-colors ${step === 3 ? 'border-primary bg-white shadow-sm' : 'border-border bg-surface'}`}>
            <div className="flex items-center mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${step === 3 ? 'bg-primary' : 'bg-gray-400'}`}>3</span>
                Payment
              </h2>
            </div>
            
            {step === 3 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-green-600 text-white font-black text-xs px-2 py-1 rounded">M-PESA</div>
                    <span className="font-bold text-green-900">Pay via M-Pesa</span>
                  </div>
                  <label className="block text-sm font-medium text-green-900 mb-1">Phone Number</label>
                  <Input
                    defaultValue="0712345678"
                    className="bg-white border-green-200 focus:border-green-500 focus:ring-green-500"
                  />
                  <p className="text-xs text-green-700 mt-2">A payment prompt will be sent to this number.</p>
                </div>
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700 h-14 text-lg"
                  onClick={handlePayment}
                  disabled={isProcessing}
                  isLoading={isProcessing}
                >
                  Pay {formatKes(768000)} via M-Pesa
                </Button>
              </motion.div>
            )}
          </div>

        </div>

        {/* Order Summary */}
        <div className="lg:w-80 h-fit sticky top-24 bg-surface rounded-2xl p-6 border border-border">
          <h3 className="font-bold text-lg mb-4">Order Summary</h3>
          <div className="space-y-3 mb-6 text-sm">
            <div className="flex justify-between text-textSecondary">
              <span>Items (2)</span>
              <span>{formatKes(640000)}</span>
            </div>
            <div className="flex justify-between text-textSecondary">
              <span>Shipping</span>
              <span>{formatKes(85000)}</span>
            </div>
            <div className="flex justify-between text-textSecondary">
              <span>Taxes</span>
              <span>{formatKes(43000)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-3 border-t border-border mt-3">
              <span>Total</span>
              <span className="text-primary">{formatKes(768000)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Input placeholder="Promo code" className="h-10" />
            <Button variant="secondary" className="h-10 px-4">Apply</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
