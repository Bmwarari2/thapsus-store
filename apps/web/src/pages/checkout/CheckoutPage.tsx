import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, MapPin, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { formatKes } from '../../lib/utils';
import { useAuthStore } from '../../stores/authStore';
import { useCartStore } from '../../stores/cartStore';
import {
  apiCreateAddress,
  apiCreateOrder,
  apiCreateQuote,
  apiGetAddresses,
  apiGetPaymentStatus,
  apiInitiateMpesa,
  type DeliveryAddress,
  type OrderQuote,
} from '../../lib/api';

/** Client-side mirror of the API's Kenyan phone normalization. */
function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

type PaymentPhase = 'idle' | 'initiating' | 'waiting' | 'timeout' | 'failed';

const emptyAddress = { label: 'Home', fullName: '', phone: '', county: '', town: '', addressLine: '' };

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const setItemCount = useCartStore((s) => s.setItemCount);

  const [step, setStep] = useState(1);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState('');
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>('idle');
  const orderIdRef = useRef<string | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const pollAbortRef = useRef(false);

  useEffect(() => {
    if (!token) navigate('/auth/login');
  }, [token, navigate]);

  useEffect(() => () => { pollAbortRef.current = true; }, []);

  // ── Addresses ───────────────────────────────────────────────────────────────
  const { data: addresses = [], isLoading: loadingAddresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: apiGetAddresses,
    enabled: !!token,
  });

  useEffect(() => {
    if (!selectedAddressId && addresses.length) {
      setSelectedAddressId((addresses.find((a) => a.is_default) ?? addresses[0]).id);
    }
  }, [addresses, selectedAddressId]);

  const { mutate: saveAddress, isPending: savingAddress } = useMutation({
    mutationFn: () => apiCreateAddress({
      label: addressForm.label || 'Home',
      fullName: addressForm.fullName,
      phone: addressForm.phone,
      county: addressForm.county,
      town: addressForm.town,
      addressLine: addressForm.addressLine,
      isDefault: addresses.length === 0,
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setSelectedAddressId(created.id);
      setAddingAddress(false);
      setAddressForm(emptyAddress);
      if (!phone) setPhone(created.phone);
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(err.response?.data?.error?.message ?? 'Could not save address');
    },
  });

  // ── Quote ───────────────────────────────────────────────────────────────────
  const { mutate: requestQuote, isPending: quoting } = useMutation({
    mutationFn: (promotionCode?: string) => apiCreateQuote(promotionCode),
    onSuccess: (q, promotionCode) => {
      setQuote(q);
      setAppliedPromo(q.discountCents > 0 ? promotionCode : undefined);
      q.warnings.forEach((w) => toast(w, { icon: '⚠️' }));
    },
    onError: (err: { response?: { data?: { error?: { code?: string; message?: string } } } }) => {
      const e = err.response?.data?.error;
      if (e?.code === 'empty_cart' || e?.code === 'nothing_available') {
        toast.error(e.message ?? 'Your cart is empty');
        navigate('/cart');
      } else {
        toast.error(e?.message ?? 'Could not price your order');
      }
    },
  });

  const continueToReview = () => {
    if (!selectedAddressId) {
      toast.error('Please choose a delivery address.');
      return;
    }
    const addr = addresses.find((a) => a.id === selectedAddressId);
    if (addr && !phone) setPhone(addr.phone);
    requestQuote(appliedPromo);
    setStep(2);
  };

  // ── Order + payment ─────────────────────────────────────────────────────────
  const pollPaymentStatus = async (orderId: string) => {
    const startedAt = Date.now();
    while (!pollAbortRef.current && Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const status = await apiGetPaymentStatus(orderId);
        if (status.status === 'paid') {
          toast.success('Payment confirmed!', { id: 'mpesa' });
          setItemCount(0);
          queryClient.invalidateQueries({ queryKey: ['cart'] });
          navigate(`/orders/confirmation/${orderId}`);
          return;
        }
        if (status.status === 'cancelled') {
          setPaymentPhase('failed');
          toast.error('Payment was cancelled.', { id: 'mpesa' });
          return;
        }
      } catch { /* transient poll error — keep trying until timeout */ }
    }
    if (!pollAbortRef.current) {
      setPaymentPhase('timeout');
      toast.error("We haven't received your payment yet. If you completed the prompt, your order will update shortly.", { id: 'mpesa' });
    }
  };

  const handlePayment = async () => {
    if (!quote || !selectedAddressId) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error('Enter a valid Kenyan mobile number (07XX… or 2547XX…)');
      return;
    }

    setPaymentPhase('initiating');
    try {
      // Re-quote transparently if this one expired while the user was reading.
      if (new Date(quote.expiresAt).getTime() < Date.now()) {
        toast('Refreshing your order total…', { icon: '🔄' });
        const fresh = await apiCreateQuote(appliedPromo);
        setQuote(fresh);
        setPaymentPhase('idle');
        return;
      }

      if (!orderIdRef.current) {
        const { order } = await apiCreateOrder(
          {
            quoteId: quote.quoteId,
            deliveryAddressId: selectedAddressId,
            paymentMethod: 'mpesa',
          },
          idempotencyKeyRef.current,
        );
        orderIdRef.current = order.id;
      }

      toast.loading('Sending the M-Pesa prompt to your phone…', { id: 'mpesa' });
      await apiInitiateMpesa(orderIdRef.current, normalized);
      setPaymentPhase('waiting');
      toast.loading('Enter your M-Pesa PIN on your phone to complete payment.', { id: 'mpesa' });
      await pollPaymentStatus(orderIdRef.current);
    } catch (err) {
      const e = (err as { response?: { data?: { error?: { code?: string; message?: string } } } }).response?.data?.error;
      if (e?.code === 'quote_stale' || e?.code === 'quote_expired') {
        toast.error('Prices changed — please review your order again.', { id: 'mpesa' });
        orderIdRef.current = null;
        requestQuote(appliedPromo);
        setStep(2);
      } else {
        toast.error(e?.message ?? 'Payment failed to start. Please try again.', { id: 'mpesa' });
      }
      setPaymentPhase('failed');
    }
  };

  const isProcessing = paymentPhase === 'initiating' || paymentPhase === 'waiting';
  const itemCountTotal = useMemo(() => quote?.lines.reduce((s, l) => s + l.qty, 0) ?? 0, [quote]);

  if (!token) return null;

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
              {step > 1 && !isProcessing && (
                <button onClick={() => setStep(1)} className="text-sm text-primary font-medium">Edit</button>
              )}
            </div>

            {step === 1 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                {loadingAddresses ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin text-textSecondary" /></div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {addresses.map((addr: DeliveryAddress) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => { setSelectedAddressId(addr.id); if (!phone) setPhone(addr.phone); }}
                        className={`text-left rounded-xl p-4 relative cursor-pointer border-2 transition-colors ${
                          selectedAddressId === addr.id ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-gray-300'
                        }`}
                      >
                        {selectedAddressId === addr.id && (
                          <div className="absolute top-4 right-4 text-primary"><Check size={20} /></div>
                        )}
                        <div className="flex items-center gap-2 font-bold mb-2">
                          <MapPin size={18} /> {addr.label}
                        </div>
                        <p className="text-sm text-textSecondary">
                          {addr.full_name}<br />{addr.address_line}<br />{addr.town}, {addr.county}<br />{addr.phone}
                        </p>
                      </button>
                    ))}
                    {!addingAddress && (
                      <button
                        type="button"
                        onClick={() => setAddingAddress(true)}
                        className="border border-border rounded-xl p-4 hover:border-gray-300 transition-colors cursor-pointer flex flex-col items-center justify-center text-textSecondary hover:text-textPrimary bg-white min-h-[120px]"
                      >
                        <span className="text-2xl mb-2">+</span>
                        <span className="font-medium text-sm">Add New Address</span>
                      </button>
                    )}
                  </div>
                )}

                {addingAddress && (
                  <form
                    className="space-y-3 mb-6 bg-surface rounded-xl p-4"
                    onSubmit={(e) => { e.preventDefault(); saveAddress(); }}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input placeholder="Full name" required value={addressForm.fullName}
                        onChange={(e) => setAddressForm(f => ({ ...f, fullName: e.target.value }))} />
                      <Input placeholder="Phone (07XX…)" required value={addressForm.phone}
                        onChange={(e) => setAddressForm(f => ({ ...f, phone: e.target.value }))} />
                      <Input placeholder="County" required value={addressForm.county}
                        onChange={(e) => setAddressForm(f => ({ ...f, county: e.target.value }))} />
                      <Input placeholder="Town" required value={addressForm.town}
                        onChange={(e) => setAddressForm(f => ({ ...f, town: e.target.value }))} />
                    </div>
                    <Input placeholder="Street / building / landmark" required value={addressForm.addressLine}
                      onChange={(e) => setAddressForm(f => ({ ...f, addressLine: e.target.value }))} />
                    <div className="flex gap-3">
                      <Button type="submit" isLoading={savingAddress}>Save Address</Button>
                      <Button type="button" variant="outline" onClick={() => setAddingAddress(false)}>Cancel</Button>
                    </div>
                  </form>
                )}

                <Button onClick={continueToReview} disabled={!selectedAddressId}>Continue to Review</Button>
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
              {step > 2 && !isProcessing && (
                <button onClick={() => setStep(2)} className="text-sm text-primary font-medium">Edit</button>
              )}
            </div>

            {step === 2 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                {quoting || !quote ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin text-textSecondary" /></div>
                ) : (
                  <>
                    {quote.lines.map((line) => (
                      <div key={`${line.productId}-${line.variantId ?? 'base'}`} className="flex gap-4 border-b border-border pb-4 mb-4">
                        {line.imageSnap && (
                          <img src={line.imageSnap} alt={line.nameSnap} className="w-16 h-20 object-cover rounded-lg bg-surface" />
                        )}
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{line.nameSnap}</h4>
                          {line.attrsSnap && (
                            <p className="text-xs text-textSecondary mt-1">{Object.values(line.attrsSnap).join(' / ')}</p>
                          )}
                          <p className="font-bold text-sm text-primary mt-2">
                            {formatKes(line.unitPriceCents)} <span className="font-normal text-textSecondary ml-1">x {line.qty}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-textSecondary mb-4">
                      Estimated delivery: {quote.estimatedDelivery}
                    </p>
                    <Button onClick={() => setStep(3)}>Continue to Payment</Button>
                  </>
                )}
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

            {step === 3 && quote && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-green-600 text-white font-black text-xs px-2 py-1 rounded">M-PESA</div>
                    <span className="font-bold text-green-900">Pay via M-Pesa</span>
                  </div>
                  <label className="block text-sm font-medium text-green-900 mb-1">Phone Number</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07XX XXX XXX"
                    disabled={isProcessing}
                    className="bg-white border-green-200 focus:border-green-500 focus:ring-green-500"
                  />
                  <p className="text-xs text-green-700 mt-2">A payment prompt will be sent to this number.</p>
                </div>

                {paymentPhase === 'waiting' && (
                  <div className="flex items-center gap-3 text-sm text-textSecondary mb-4">
                    <Loader2 size={16} className="animate-spin" />
                    Waiting for you to confirm on your phone…
                  </div>
                )}
                {(paymentPhase === 'timeout' || paymentPhase === 'failed') && (
                  <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>
                      {paymentPhase === 'timeout'
                        ? "We haven't seen your payment yet. If you entered your PIN, check My Orders in a minute — otherwise try again."
                        : 'The payment did not complete. You can try again.'}
                    </span>
                  </div>
                )}

                <Button
                  className="w-full bg-green-600 hover:bg-green-700 h-14 text-lg"
                  onClick={handlePayment}
                  disabled={isProcessing}
                  isLoading={isProcessing}
                >
                  {paymentPhase === 'timeout' || paymentPhase === 'failed' ? 'Try Again — ' : 'Pay '}
                  {formatKes(quote.totalCents)} via M-Pesa
                </Button>
              </motion.div>
            )}
          </div>

        </div>

        {/* Order Summary */}
        <div className="lg:w-80 h-fit sticky top-24 bg-surface rounded-2xl p-6 border border-border">
          <h3 className="font-bold text-lg mb-4">Order Summary</h3>
          {quote ? (
            <div className="space-y-3 mb-6 text-sm">
              <div className="flex justify-between text-textSecondary">
                <span>Items ({itemCountTotal})</span>
                <span>{formatKes(quote.itemsCents)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>Delivery</span>
                <span>{formatKes(quote.deliveryCents)}</span>
              </div>
              {quote.dutyCents + quote.vatCents > 0 && (
                <div className="flex justify-between text-textSecondary">
                  <span>Import duties & taxes (est.)</span>
                  <span>{formatKes(quote.dutyCents + quote.vatCents)}</span>
                </div>
              )}
              {quote.discountCents > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount{appliedPromo ? ` (${appliedPromo})` : ''}</span>
                  <span>-{formatKes(quote.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-3 border-t border-border mt-3">
                <span>Total</span>
                <span className="text-primary">{formatKes(quote.totalCents)}</span>
              </div>
              <p className="text-xs text-textSecondary pt-1">Item prices include all taxes and import duties.</p>
            </div>
          ) : (
            <p className="text-sm text-textSecondary mb-6">Your itemized total appears after you choose an address.</p>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Promo code"
              className="h-10"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              disabled={isProcessing}
            />
            <Button
              variant="secondary"
              className="h-10 px-4"
              disabled={isProcessing || quoting || !promoInput.trim()}
              onClick={() => {
                setAppliedPromo(promoInput.trim());
                orderIdRef.current = null;
                idempotencyKeyRef.current = crypto.randomUUID();
                requestQuote(promoInput.trim());
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
