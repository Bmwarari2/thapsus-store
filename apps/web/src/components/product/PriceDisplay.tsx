import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { formatKes } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface PriceDisplayProps {
  sellPriceKesCents: number;
  originalPriceKesCents?: number;
  showBreakdown?: boolean;
  breakdown?: {
    sourcePriceUsdCents: number;
    shippingFeeKesCents: number;
    taxKesCents: number;
  };
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  sellPriceKesCents,
  originalPriceKesCents,
  showBreakdown = false,
  breakdown
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="flex items-center gap-2 relative">
      <span className="font-bold text-lg text-primary">
        {formatKes(sellPriceKesCents)}
      </span>
      {originalPriceKesCents && originalPriceKesCents > sellPriceKesCents && (
        <span className="text-sm text-textSecondary line-through">
          {formatKes(originalPriceKesCents)}
        </span>
      )}
      
      {showBreakdown && breakdown && (
        <div 
          className="relative flex items-center"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Info className="w-4 h-4 text-textSecondary cursor-help hover:text-primary transition-colors" />
          <AnimatePresence>
            {showTooltip && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl"
              >
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Source:</span>
                    <span>${(breakdown.sourcePriceUsdCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Shipping:</span>
                    <span>{formatKes(breakdown.shippingFeeKesCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tax/Duty:</span>
                    <span>{formatKes(breakdown.taxKesCents)}</span>
                  </div>
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
